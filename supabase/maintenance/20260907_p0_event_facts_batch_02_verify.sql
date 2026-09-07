-- Read-only post-apply verification for 20260907_p0_event_facts_batch_02.sql.
-- A failed assertion aborts; this never repairs records or grants freshness.
begin isolation level repeatable read read only;
set local time zone 'UTC';
set local statement_timeout = '60s';

do $verify$
declare
  manifest jsonb;
begin
  select row_data into manifest from private.event_data_workflow_backup
  where migration_key='20260907_p0_event_facts_batch_02' and entity_table='batch_manifest' and entity_pk='batch';
  if manifest is null or jsonb_array_length(manifest -> 'targets') <> 3
     or manifest ->> 'factual_changes_only' <> 'true' or manifest ->> 'freshness_attested' <> 'false'
     or exists (select 1 from private.event_data_workflow_backup where migration_key='20260907_p0_event_facts_batch_02_rollback')
     or (select count(*) from private.event_data_workflow_backup where migration_key='20260907_p0_event_facts_batch_02') <> 13 then
    raise exception 'P0 facts verification: committed apply snapshots absent/incomplete or rollback present';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(manifest -> 'targets') as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb)
    left join public.events e on e.id=t.event_id
    left join public.event_editions d on d.id=t.edition_id and d.event_id=t.event_id
    left join public.event_sources s on s.id=t.source_id
    left join private.event_data_workflow_backup eb on eb.migration_key='20260907_p0_event_facts_batch_02' and eb.entity_table='events_post_state' and eb.entity_pk=t.event_id::text
    left join private.event_data_workflow_backup db on db.migration_key='20260907_p0_event_facts_batch_02' and db.entity_table='event_editions_post_state' and db.entity_pk=t.edition_id::text
    where e.id is null or d.id is null or s.id is null or eb.entity_pk is null or db.entity_pk is null
      or s.event_id is distinct from t.event_id or s.edition_id is distinct from t.edition_id
      or s.source_url is distinct from t.source_url or s.source_type is distinct from 'official_event_website' or not s.is_active
      or (to_jsonb(e)-'updated_at') is distinct from (eb.row_data-'updated_at')
      or (to_jsonb(d)-'updated_at') is distinct from (db.row_data-'updated_at')
      or e.verification_status <> 'needs_review' or not e.needs_review or e.review_priority <> 'high'
      or e.next_check_at is null or e.next_check_at > now()
      or d.verification_status <> 'needs_review' or not d.needs_review or d.review_priority <> 'high'
      or d.last_verified_source_id is not null or d.next_check_at is null or d.next_check_at > now()
      or to_jsonb(d) -> 'last_verified_at' is distinct from t.before_edition -> 'last_verified_at'
      or to_jsonb(d) -> 'data_confidence' is distinct from t.before_edition -> 'data_confidence'
      or d.edition_slug is distinct from t.before_edition ->> 'edition_slug'
      or d.legacy_event_key is distinct from t.before_edition ->> 'legacy_event_key'
      or e.slug is distinct from t.before_event ->> 'slug'
      or e.canonical_key is distinct from t.before_event ->> 'canonical_key'
      or e.event_name is distinct from t.before_event ->> 'event_name'
      or e.canonical_name is distinct from (t.before_event || t.event_patch) ->> 'canonical_name'
      or e.distance is distinct from d.legacy_distance
      or to_jsonb(e) -> 'last_verified_at' is distinct from t.before_event -> 'last_verified_at'
      or to_jsonb(e) -> 'data_confidence' is distinct from t.before_event -> 'data_confidence'
      or e.date is distinct from t.before_event ->> 'date'
  ) then
    raise exception 'P0 facts verification: drift, identity change or unintended freshness';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(manifest -> 'targets') as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb)
    cross join lateral jsonb_each(t.event_patch) p
    where t.before_event -> p.key is distinct from p.value
      and not exists (select 1 from public.event_audit_log a
        where a.entity_type='event' and a.entity_id=t.event_id::text and a.field_name=p.key
          and a.old_value is not distinct from t.before_event -> p.key and a.new_value is not distinct from p.value
          and a.change_source='manual_admin' and a.reason=manifest ->> 'reason')
  ) or exists (
    select 1 from jsonb_to_recordset(manifest -> 'targets') as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb)
    cross join lateral jsonb_each(t.edition_patch) p
    where t.before_edition -> p.key is distinct from p.value
      and not exists (select 1 from public.event_audit_log a
        where a.entity_type='edition' and a.entity_id=t.edition_id::text and a.field_name=p.key
          and a.old_value is not distinct from t.before_edition -> p.key and a.new_value is not distinct from p.value
          and a.change_source='manual_admin' and a.reason=manifest ->> 'reason')
  ) then
    raise exception 'P0 facts verification: missing factual field audits';
  end if;
end
$verify$;

select count(*) as reviewed_events,
  sum(jsonb_array_length(d.race_formats)) as reviewed_formats,
  bool_and(e.distance = d.legacy_distance) as distance_mirrors_match,
  bool_and(e.needs_review and d.needs_review) as review_remains_required,
  bool_and(d.last_verified_source_id is null) as no_freshness_attestation
from public.events e join public.event_editions d on d.event_id=e.id
where d.id in ('50b5b657-fd77-48e0-9c50-3ab91550e0ca'::uuid,'42c43b74-cc37-4bcf-9198-e64ff32c9aa4'::uuid,'f287ae68-59ab-4cff-8398-3e3c70522e3b'::uuid);
select entity_table, count(*) as snapshots from private.event_data_workflow_backup
where migration_key='20260907_p0_event_facts_batch_02' group by entity_table order by entity_table;
rollback;
