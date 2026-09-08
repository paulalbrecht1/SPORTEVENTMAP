-- Read-only post-apply verification for @@BATCH_KEY@@.sql.
-- A failed assertion aborts; this never repairs records or grants freshness.
begin isolation level repeatable read read only;
set local time zone 'UTC';
set local standard_conforming_strings = on;
set local statement_timeout = '60s';

do $verify$
declare
  manifest jsonb;
begin
  -- Report blockers visible in this read-only REPEATABLE READ snapshot.
  -- This verification acquires no parent write locks and never auto-resolves.
  if exists (
    select 1 from public.source_review_tasks task where task.status='open'
      and (task.source_id in (select id from public.event_sources where event_id in (@@EVENT_IDS@@))
        or task.edition_id in (@@EDITION_IDS@@)
        or (task.edition_id is null and task.event_id in (@@EVENT_IDS@@)))
  ) or exists (
    select 1 from public.event_change_proposals proposal where proposal.proposal_status='pending'
      and (proposal.source_id in (select id from public.event_sources where event_id in (@@EVENT_IDS@@))
        or proposal.edition_id in (@@EDITION_IDS@@)
        or (proposal.edition_id is null and proposal.event_id in (@@EVENT_IDS@@)))
  ) or exists (
    select 1 from public.validation_issues issue where issue.status='open' and issue.severity in ('error','critical')
      and (issue.edition_id in (@@EDITION_IDS@@)
        or (issue.edition_id is null and issue.event_id in (@@EVENT_IDS@@)))
  ) or exists (
    select 1 from public.data_workflow_alerts alert where alert.alert_status='open' and alert.severity in ('error','critical')
      and (alert.source_id in (select id from public.event_sources where event_id in (@@EVENT_IDS@@))
        or alert.edition_id in (@@EDITION_IDS@@)
        or (alert.edition_id is null and alert.event_id in (@@EVENT_IDS@@)))
  ) or exists (
    select 1 from public.user_feedback feedback
      where feedback.category='incorrect_event_data' and feedback.status in ('reviewed','planned')
        and private.try_parse_bigint(feedback.event_id) in (@@EVENT_IDS@@)
  ) then
    raise exception 'P0 facts live conflict: open review, proposal, validation, alert or feedback';
  end if;

  select row_data into manifest from private.event_data_workflow_backup
  where migration_key='@@BATCH_KEY@@' and entity_table='batch_manifest' and entity_pk='batch';
  if manifest is null or jsonb_array_length(manifest -> 'targets') <> @@COUNT@@
     or manifest ->> 'factual_changes_only' <> 'true' or manifest ->> 'freshness_attested' <> 'false'
     or exists (select 1 from private.event_data_workflow_backup where migration_key='@@BATCH_KEY@@_rollback')
     or (select count(*) from private.event_data_workflow_backup where migration_key='@@BATCH_KEY@@') <> @@SNAPSHOT_COUNT@@ then
    raise exception 'P0 facts verification: committed apply snapshots absent/incomplete or rollback present';
  end if;
  if (select array_agg(t.event_id order by t.event_id) from jsonb_to_recordset(manifest -> 'targets') as t(event_id bigint)) is distinct from array[@@EVENT_IDS@@]::bigint[]
     or (select count(*) from public.public_event_discovery where event_id in (@@EVENT_IDS@@)) <> @@COUNT@@
     or exists (select 1 from public.public_event_discovery v join public.event_editions d on d.id=v.edition_id where v.event_id in (@@EVENT_IDS@@) and v.race_formats is distinct from d.race_formats) then
    raise exception 'P0 facts verification: exact batch identity or public structured-format projection differs';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(manifest -> 'targets') as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb)
    left join public.events e on e.id=t.event_id
    left join public.event_editions d on d.id=t.edition_id and d.event_id=t.event_id
    left join public.event_sources s on s.id=t.source_id
    left join private.event_data_workflow_backup eb on eb.migration_key='@@BATCH_KEY@@' and eb.entity_table='events_post_state' and eb.entity_pk=t.event_id::text
    left join private.event_data_workflow_backup db on db.migration_key='@@BATCH_KEY@@' and db.entity_table='event_editions_post_state' and db.entity_pk=t.edition_id::text
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
      or e.date is distinct from (t.before_event || t.event_patch) ->> 'date'
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
where d.id in (@@EDITION_IDS@@);
select entity_table, count(*) as snapshots from private.event_data_workflow_backup
where migration_key='@@BATCH_KEY@@' group by entity_table order by entity_table;
rollback;
