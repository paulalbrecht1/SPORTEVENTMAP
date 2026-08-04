-- Compatibility rollback for 20260728_event_data_operations_foundation.sql.
--
-- This intentionally preserves all newly collected editions, validation issues,
-- sources and audit rows. It restores the legacy events snapshot and swaps the
-- former public citation table back to its original name so a previous frontend
-- release can be redeployed without data loss.
-- Run only after taking a fresh pg_dump and redeploying the matching old client.

begin;

lock table public.events in share row exclusive mode;

drop view if exists public.public_event_discovery;

drop trigger if exists events_sync_legacy_edition on public.events;
drop trigger if exists events_normalize_master on public.events;
drop trigger if exists events_audit_changes on public.events;
drop trigger if exists event_editions_audit_changes on public.event_editions;

update public.events e
set
  event_name = backup.row_data ->> 'event_name',
  sport = backup.row_data ->> 'sport',
  date = backup.row_data ->> 'date',
  city = backup.row_data ->> 'city',
  country = backup.row_data ->> 'country',
  address = backup.row_data ->> 'address',
  latitude = backup.row_data ->> 'latitude',
  longitude = backup.row_data ->> 'longitude',
  distance = backup.row_data ->> 'distance',
  description = backup.row_data ->> 'description',
  event_url = backup.row_data ->> 'event_url',
  source_url = backup.row_data ->> 'source_url',
  status = backup.row_data ->> 'status',
  registration_status = backup.row_data ->> 'registration_status',
  status_note = backup.row_data ->> 'status_note',
  last_checked = nullif(backup.row_data ->> 'last_checked', '')::timestamptz,
  review_priority = coalesce(backup.row_data ->> 'review_priority', 'medium'),
  needs_review = coalesce((backup.row_data ->> 'needs_review')::boolean, true),
  quality_flags = coalesce(backup.row_data -> 'quality_flags', '{}'::jsonb),
  review_status = coalesce(backup.row_data ->> 'review_status', 'pending'),
  review_note = backup.row_data ->> 'review_note',
  review_reason = backup.row_data ->> 'review_reason',
  import_batch = backup.row_data ->> 'import_batch',
  source_type = coalesce(backup.row_data ->> 'source_type', 'unknown'),
  updated_at = coalesce(nullif(backup.row_data ->> 'updated_at', '')::timestamptz, e.updated_at)
from private.event_data_workflow_backup backup
where backup.migration_key = '20260728_event_data_operations_foundation'
  and backup.entity_table = 'events'
  and backup.entity_pk = e.id::text;

do $restore_source_table$
begin
  if to_regclass('public.event_sources') is not null
     and to_regclass('public.event_detail_sources') is not null
     and to_regclass('public.event_operational_sources_rollback') is null then
    alter table public.event_sources rename to event_operational_sources_rollback;
    alter table public.event_detail_sources rename to event_sources;
  end if;
end
$restore_source_table$;

drop policy if exists "Public can read published event brands" on public.events;
drop policy if exists "Authenticated can read accessible event brands" on public.events;

create policy "Public can read approved events"
on public.events for select to anon
using (status = 'approved');

create policy "Authenticated can read accessible events"
on public.events for select to authenticated
using (
  status = 'approved'
  or created_by = (select auth.uid())
  or (select private.is_admin())
);

comment on table public.event_operational_sources_rollback is
  'Preserved operational sources from the rolled-back Event Data Operations migration.';

commit;
