-- Read-only post-apply verification for 20260908_p0_event_facts_batch_04.sql.
-- A failed assertion aborts; this never repairs records or grants freshness.
begin isolation level repeatable read read only;
set local time zone 'UTC';
set local statement_timeout = '60s';

do $verify$
declare
  manifest jsonb;
begin
  select row_data into manifest from private.event_data_workflow_backup
  where migration_key='20260908_p0_event_facts_batch_04' and entity_table='batch_manifest' and entity_pk='batch';
  if manifest is null or jsonb_array_length(manifest -> 'targets') <> 9
     or manifest ->> 'factual_changes_only' <> 'true' or manifest ->> 'freshness_attested' <> 'false'
     or exists (select 1 from private.event_data_workflow_backup where migration_key='20260908_p0_event_facts_batch_04_rollback')
     or (select count(*) from private.event_data_workflow_backup where migration_key='20260908_p0_event_facts_batch_04') <> 37 then
    raise exception 'P0 facts verification: committed apply snapshots absent/incomplete or rollback present';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(manifest -> 'targets') as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb)
    left join public.events e on e.id=t.event_id
    left join public.event_editions d on d.id=t.edition_id and d.event_id=t.event_id
    left join public.event_sources s on s.id=t.source_id
    left join private.event_data_workflow_backup eb on eb.migration_key='20260908_p0_event_facts_batch_04' and eb.entity_table='events_post_state' and eb.entity_pk=t.event_id::text
    left join private.event_data_workflow_backup db on db.migration_key='20260908_p0_event_facts_batch_04' and db.entity_table='event_editions_post_state' and db.entity_pk=t.edition_id::text
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
where d.id in ('9ed18697-8648-463f-8a6d-68786010fbf4'::uuid, '6cbdeebe-6ead-47c0-a610-8442dafff6e9'::uuid, 'ec808969-ea0a-482d-838e-68d213848a6e'::uuid, '62267e72-a4af-43d6-9ed8-53935ef9ef9a'::uuid, '9c851591-1924-4de0-82dd-5c37a9ef945b'::uuid, '6bd198c8-0dde-4527-aa9a-88066d158177'::uuid, '79d8165e-9cc5-4350-a3a9-0c467972f885'::uuid, 'c2bbd4ee-a3be-45d1-86fb-3161976da21c'::uuid, 'f2bd3c70-5781-4084-adc4-3a49772e4423'::uuid);
select entity_table, count(*) as snapshots from private.event_data_workflow_backup
where migration_key='20260908_p0_event_facts_batch_04' group by entity_table order by entity_table;
rollback;
