-- Targeted factual rollback of 20260908_p0_event_facts_batch_04.sql.
-- Restores only batch-touched facts and original edition values overwritten by
-- the legacy sync trigger. No old verified state is resurrected. Audit history,
-- before/after snapshots and user references are retained. Exact post-state drift
-- guards reject a rollback after a subsequent edit, including an admin freshness
-- attestation; investigate instead of forcing. No verified post-state is overwritten.
-- Execute only after rehearsal and when reverting this particular factual batch.

begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('sporteventmap:20260908_p0_event_facts_batch_04', 0));
-- No request.jwt.claims, auth.uid override or app.freshness_verification override.
select set_config('app.change_source', 'manual_admin', true);
select set_config('app.change_reason', $reason$Rollback of P0 facts batch 04 (2026-09-08): restore reviewed prior facts only; retain needs_review, no freshness attestation.$reason$, true);
create temporary table p0_fact_targets (
  event_id bigint primary key,
  edition_id uuid not null unique,
  source_id uuid not null unique,
  source_url text not null,
  before_event jsonb not null,
  before_edition jsonb not null,
  event_patch jsonb not null,
  edition_patch jsonb not null
) on commit drop;

insert into p0_fact_targets
select t.* from private.event_data_workflow_backup b
cross join lateral jsonb_to_recordset(b.row_data -> 'targets') as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb)
where b.migration_key = '20260908_p0_event_facts_batch_04' and b.entity_table = 'batch_manifest' and b.entity_pk = 'batch';

-- Freeze scheduler writes before checking active jobs. Row locks then follow
-- the worker/verifier order: every source of these events -> events -> editions.
lock table public.source_crawl_jobs in share mode;
select 1 from public.event_sources s where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
order by s.id for update;
select 1 from public.events e where e.id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
order by e.id for update;
select 1 from public.event_editions e where e.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
order by e.event_id, e.id for update;

do $rollback_preflight$
begin
  -- Fixed field whitelist and exact reviewed per-event programme.
  if exists (
    select 1 from p0_fact_targets t
    where jsonb_typeof(t.event_patch) is distinct from 'object'
      or jsonb_typeof(t.edition_patch) is distinct from 'object'
      or (t.event_patch = '{}'::jsonb and t.edition_patch = '{}'::jsonb)
      or exists (select 1 from jsonb_object_keys(t.event_patch) field where field not in ('address','date','description','distance','event_url','latitude','longitude','registration_status'))
      or exists (select 1 from jsonb_object_keys(t.edition_patch) field where field not in ('archive_reason','discovery_archived_at','discovery_status','edition_status','end_date','legacy_distance','race_formats','registration_status','registration_url','results_status','start_date'))
      or (t.before_event || t.event_patch) -> 'distance' is distinct from (t.before_edition || t.edition_patch) -> 'legacy_distance'
      or jsonb_typeof((t.before_edition || t.edition_patch) -> 'race_formats') is distinct from 'array'
      or jsonb_array_length((t.before_edition || t.edition_patch) -> 'race_formats') <> case t.event_id when 117 then 1 when 119 then 5 when 291 then 1 when 295 then 1 when 329 then 9 when 418 then 5 when 472 then 1 when 488 then 7 when 510 then 6 else -1 end
      or exists (select 1 from jsonb_array_elements((t.before_edition || t.edition_patch) -> 'race_formats') f where jsonb_typeof(f) is distinct from 'object' or nullif(btrim(f ->> 'label'),'') is null)
  ) then
    raise exception 'P0 facts guard: patch keys, reviewed formats or distance mirrors differ';
  end if;

  if exists (select 1 from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_04_rollback') then
    raise exception 'P0 facts rollback already recorded';
  end if;
  if (select count(*) from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_04') <> 37
     or (select count(*) from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_04' and entity_table = 'events') <> 9
     or (select count(*) from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_04' and entity_table = 'event_editions') <> 9
     or (select count(*) from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_04' and entity_table = 'events_post_state') <> 9
     or (select count(*) from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_04' and entity_table = 'event_editions_post_state') <> 9 then
    raise exception 'P0 facts rollback requires complete before/after snapshots';
  end if;
  if (select count(*) from p0_fact_targets) <> 9
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[117, 119, 291, 295, 329, 418, 472, 488, 510]::bigint[]
     or exists (
       select 1 from p0_fact_targets t
       left join public.event_sources s on s.id = t.source_id
       where s.id is null or s.event_id is distinct from t.event_id
         or s.edition_id is distinct from t.edition_id
         or s.source_url is distinct from t.source_url
         or s.source_type is distinct from 'official_event_website'
         or not s.is_active
     ) then
    raise exception 'P0 facts guard: reviewed source/event/edition identity drifted';
  end if;
  if exists (
    select 1 from public.source_crawl_jobs j
    join public.event_sources s on s.id = j.source_id
    where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
      and (s.claimed_at is not null or s.claimed_by is not null)
  ) then
    raise exception 'P0 facts guard: a target source has an active or queued crawl';
  end if;

  if exists (
    select 1 from p0_fact_targets t
    left join private.event_data_workflow_backup b on b.migration_key = '20260908_p0_event_facts_batch_04' and b.entity_table = 'events_post_state' and b.entity_pk = t.event_id::text
    left join public.events e on e.id = t.event_id
    where b.entity_pk is null or e.id is null or (to_jsonb(e) - 'updated_at') is distinct from (b.row_data - 'updated_at')
  ) or exists (
    select 1 from p0_fact_targets t
    left join private.event_data_workflow_backup b on b.migration_key = '20260908_p0_event_facts_batch_04' and b.entity_table = 'event_editions_post_state' and b.entity_pk = t.edition_id::text
    left join public.event_editions e on e.id = t.edition_id
    where b.entity_pk is null or e.id is null or (to_jsonb(e) - 'updated_at') is distinct from (b.row_data - 'updated_at')
  ) or exists (
    select 1 from p0_fact_targets t
    left join private.event_data_workflow_backup e on e.migration_key = '20260908_p0_event_facts_batch_04' and e.entity_table = 'events' and e.entity_pk = t.event_id::text
    left join private.event_data_workflow_backup d on d.migration_key = '20260908_p0_event_facts_batch_04' and d.entity_table = 'event_editions' and d.entity_pk = t.edition_id::text
    where e.entity_pk is null or d.entity_pk is null
      or (e.row_data - 'updated_at') is distinct from (t.before_event - 'updated_at')
      or (d.row_data - 'updated_at') is distinct from (t.before_edition - 'updated_at')
  ) then
    raise exception 'P0 facts rollback refused: snapshot or current post-state drift';
  end if;
end
$rollback_preflight$;

create temporary table p0_fact_invariants on commit drop as select jsonb_build_object(
    'events_count', (select count(*) from public.events),
    'editions_count', (select count(*) from public.event_editions),
    'sources_count', (select count(*) from public.event_sources),
    'favorites_count', (select count(*) from public.favorites),
    'planner_count', (select count(*) from public.season_planner_events),
    'favorites_digest', (select md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id)::text, '[]')) from public.favorites f),
    'planner_digest', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text, '[]')) from public.season_planner_events p),
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (117, 119, 291, 295, 329, 418, 472, 488, 510)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('9ed18697-8648-463f-8a6d-68786010fbf4'::uuid, '6cbdeebe-6ead-47c0-a610-8442dafff6e9'::uuid, 'ec808969-ea0a-482d-838e-68d213848a6e'::uuid, '62267e72-a4af-43d6-9ed8-53935ef9ef9a'::uuid, '9c851591-1924-4de0-82dd-5c37a9ef945b'::uuid, '6bd198c8-0dde-4527-aa9a-88066d158177'::uuid, '79d8165e-9cc5-4350-a3a9-0c467972f885'::uuid, 'c2bbd4ee-a3be-45d1-86fb-3161976da21c'::uuid, 'f2bd3c70-5781-4084-adc4-3a49772e4423'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510))
  ) as value;
insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_04_rollback', 'events', e.id::text, to_jsonb(e) from public.events e join p0_fact_targets t on e.id=t.event_id
union all
select '20260908_p0_event_facts_batch_04_rollback', 'event_editions', e.id::text, to_jsonb(e) from public.event_editions e join p0_fact_targets t on e.id=t.edition_id;

-- Invert the explicitly reviewed fact patches only. The old business state is
-- not restored wholesale, and none of its stale/fresh verification claims return.
update p0_fact_targets t
set event_patch = coalesce((select jsonb_object_agg(p.key, t.before_event -> p.key) from jsonb_each(t.event_patch) p), '{}'::jsonb),
    edition_patch = coalesce((select jsonb_object_agg(p.key, t.before_edition -> p.key) from jsonb_each(t.edition_patch) p), '{}'::jsonb);

-- Apply only the explicitly reviewed master fields using typed bound records.
-- No application-role impersonation, identity override or freshness bypass is used.
do $apply_reviewed_facts$
declare
  target record;
  event_value public.events;
  edition_value public.event_editions;
  assignments text;
begin
  for target in select * from p0_fact_targets order by event_id loop
    event_value := jsonb_populate_record(null::public.events, target.before_event || target.event_patch);
    select string_agg(format('%I=($1).%I', field, field), ', ' order by field)
      into assignments from jsonb_object_keys(target.event_patch) field;
    execute 'update public.events set ' || coalesce(assignments || ', ', '') ||
      'verification_status=''needs_review'', needs_review=true, review_priority=''high'',
         next_check_at=least(coalesce(($1).next_check_at,now()),now()) where id=$2'
      using event_value, target.event_id;
  end loop;

  -- Legacy master sync temporarily rewrites race_formats from the flat distance
  -- label and copies verification values. Restore the exact edition baseline
  -- with normal triggers enabled before applying the real structured patch.
  -- This also produces an actual baseline -> final field audit for race_formats.
  for target in select * from p0_fact_targets order by event_id, edition_id loop
    edition_value := jsonb_populate_record(null::public.event_editions, target.before_edition);
    update public.event_editions e
    set start_date=edition_value.start_date, end_date=edition_value.end_date,
        source_url=edition_value.source_url, edition_status=edition_value.edition_status,
        publication_status=edition_value.publication_status,
        race_formats=edition_value.race_formats, legacy_distance=edition_value.legacy_distance,
        registration_url=edition_value.registration_url, registration_status=edition_value.registration_status,
        last_verified_at=edition_value.last_verified_at, data_confidence=edition_value.data_confidence,
        verification_status='needs_review', needs_review=true,
        last_verified_source_id=null, review_priority='high',
        next_check_at=least(coalesce(edition_value.next_check_at,now()),now())
    where e.id=target.edition_id and e.event_id=target.event_id;

    edition_value := jsonb_populate_record(null::public.event_editions, target.before_edition || target.edition_patch);
    select string_agg(format('%I=($1).%I', field, field), ', ' order by field)
      into assignments from jsonb_object_keys(target.edition_patch) field;
    execute 'update public.event_editions set ' || coalesce(assignments || ', ', '') ||
      'verification_status=''needs_review'', needs_review=true, review_priority=''high'',
         last_verified_source_id=null,
         next_check_at=least(coalesce(($1).next_check_at,now()),now())
         where id=$2 and event_id=$3'
      using edition_value, target.edition_id, target.event_id;
  end loop;
end
$apply_reviewed_facts$;

do $postflight$
begin
  if (select count(*) from public.events where id in (117, 119, 291, 295, 329, 418, 472, 488, 510)) <> 9
     or (select count(*) from public.event_editions e join p0_fact_targets t on e.id = t.edition_id) <> 9
     or exists (
       select 1 from p0_fact_targets t join public.events e on e.id = t.event_id
       where (to_jsonb(e) - 'updated_at') is distinct from (t.before_event || t.event_patch || jsonb_build_object(
       'verification_status', 'needs_review', 'needs_review', true,
       'review_priority', 'high',
       'next_check_at', least(coalesce((t.before_event ->> 'next_check_at')::timestamptz, now()), now())
     )) - 'updated_at'
     ) or exists (
       select 1 from p0_fact_targets t join public.event_editions e on e.id = t.edition_id
       where (to_jsonb(e) - 'updated_at') is distinct from (t.before_edition || t.edition_patch || jsonb_build_object(
       'verification_status', 'needs_review', 'needs_review', true,
       'last_verified_source_id', null, 'review_priority', 'high',
       'next_check_at', least(coalesce((t.before_edition ->> 'next_check_at')::timestamptz, now()), now())
     )) - 'updated_at'
     ) then
    raise exception 'P0 facts postcondition: unexpected facts, identity, trigger side effect or verification metadata';
  end if;
  if (select value from p0_fact_invariants) is distinct from jsonb_build_object(
    'events_count', (select count(*) from public.events),
    'editions_count', (select count(*) from public.event_editions),
    'sources_count', (select count(*) from public.event_sources),
    'favorites_count', (select count(*) from public.favorites),
    'planner_count', (select count(*) from public.season_planner_events),
    'favorites_digest', (select md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id)::text, '[]')) from public.favorites f),
    'planner_digest', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text, '[]')) from public.season_planner_events p),
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (117, 119, 291, 295, 329, 418, 472, 488, 510)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('9ed18697-8648-463f-8a6d-68786010fbf4'::uuid, '6cbdeebe-6ead-47c0-a610-8442dafff6e9'::uuid, 'ec808969-ea0a-482d-838e-68d213848a6e'::uuid, '62267e72-a4af-43d6-9ed8-53935ef9ef9a'::uuid, '9c851591-1924-4de0-82dd-5c37a9ef945b'::uuid, '6bd198c8-0dde-4527-aa9a-88066d158177'::uuid, '79d8165e-9cc5-4350-a3a9-0c467972f885'::uuid, 'c2bbd4ee-a3be-45d1-86fb-3161976da21c'::uuid, 'f2bd3c70-5781-4084-adc4-3a49772e4423'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510))
  ) then
    raise exception 'P0 facts postcondition: counts, user references, other records or sources changed';
  end if;
  if (select count(*) from p0_fact_targets) <> 9
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[117, 119, 291, 295, 329, 418, 472, 488, 510]::bigint[]
     or exists (
       select 1 from p0_fact_targets t
       left join public.event_sources s on s.id = t.source_id
       where s.id is null or s.event_id is distinct from t.event_id
         or s.edition_id is distinct from t.edition_id
         or s.source_url is distinct from t.source_url
         or s.source_type is distinct from 'official_event_website'
         or not s.is_active
     ) then
    raise exception 'P0 facts guard: reviewed source/event/edition identity drifted';
  end if;
  if exists (
    select 1 from public.source_crawl_jobs j
    join public.event_sources s on s.id = j.source_id
    where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
      and (s.claimed_at is not null or s.claimed_by is not null)
  ) then
    raise exception 'P0 facts guard: a target source has an active or queued crawl';
  end if;

end
$postflight$;

insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_04_rollback', 'events_post_state', e.id::text, to_jsonb(e) from public.events e join p0_fact_targets t on e.id=t.event_id
union all
select '20260908_p0_event_facts_batch_04_rollback', 'event_editions_post_state', e.id::text, to_jsonb(e) from public.event_editions e join p0_fact_targets t on e.id=t.edition_id;
insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_04_rollback', 'batch_manifest', 'batch', jsonb_build_object(
  'invariants',value,'actor',current_user,'auth_uid',auth.uid(),'reason',$reason$Rollback of P0 facts batch 04 (2026-09-08): restore reviewed prior facts only; retain needs_review, no freshness attestation.$reason$,
  'factual_changes_only',true,'freshness_attested',false) from p0_fact_invariants;
do $backup_guard$
begin
  if (select count(*) from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_04_rollback') <> 37 then
    raise exception 'P0 facts rollback snapshots incomplete: expected 18 before, 18 after and 1 manifest';
  end if;
end
$backup_guard$;
commit;
