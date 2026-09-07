-- Minimal Source Monitor extraction closure, intentionally independent of Stage 4.
-- Works on the pre-Stage-3 production schema and the full historical schema.
-- No history relabelling, seed resets, view replacement, automatic publication,
-- freshness attestation, or replacement of any existing freshness trigger/RPC.
-- Existing informational classification and audit triggers continue to execute.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Fail closed on a partially installed or incompatible extraction schema.
do $guard$
declare n integer; col record; actual record; status_values text[]; definition text;
begin
  if to_regclass('public.event_change_proposals') is null
     or to_regclass('public.source_crawl_results') is null
     or to_regprocedure('private.is_admin()') is null
     or to_regprocedure('private.invalidate_current_edition_freshness(bigint,uuid,text)') is null
     or to_regprocedure('public.verify_freshness_review_editions(uuid[],text,jsonb)') is null then
    raise exception 'extraction alignment requires the production base and freshness hardening';
  end if;
  select count(*) into n from pg_attribute
  where attrelid='public.event_change_proposals'::regclass and not attisdropped
    and attname=any(array['crawl_id','field_name','old_value','proposed_value','normalized_value',
      'applied_value','change_type','extraction_method','extractor_version','evidence','source_context',
      'confidence_reasons','validation_warnings','priority','rejection_reason','next_review_at','locked_field']);
  if n not in (0,17) then raise exception 'partial extraction proposal schema (% of 17 columns)',n; end if;
  if (n=0 and to_regclass('public.event_field_controls') is not null)
     or (n=17 and to_regclass('public.event_field_controls') is null) then
    raise exception 'partial extraction controls schema';
  end if;
  if n=17 then
    for col in select * from (values
      ('crawl_id','bigint',false),('field_name','text',false),('old_value','jsonb',false),
      ('proposed_value','jsonb',false),('normalized_value','jsonb',false),('applied_value','jsonb',false),
      ('change_type','text',false),('extraction_method','text',false),('extractor_version','text',false),
      ('evidence','jsonb',true),('source_context','text',false),('confidence_reasons','jsonb',true),
      ('validation_warnings','text[]',true),('priority','text',true),('rejection_reason','text',false),
      ('next_review_at','timestamp with time zone',false),('locked_field','boolean',true)
    ) expected(name,type_name,required) loop
      select format_type(atttypid,atttypmod) type_name,attnotnull required into actual
      from pg_attribute where attrelid='public.event_change_proposals'::regclass and attname=col.name and not attisdropped;
      if actual.type_name is distinct from col.type_name or actual.required is distinct from col.required then
        raise exception 'incompatible proposal column %',col.name;
      end if;
    end loop;
    for col in select * from (values
      ('id','uuid',true),('event_id','bigint',true),('edition_id','uuid',false),('entity_type','text',true),
      ('field_name','text',true),('is_locked','boolean',true),('manual_value','jsonb',false),
      ('lock_reason','text',true),('lock_expires_at','timestamp with time zone',false),
      ('source_priority','smallint',true),('confirmed_by','uuid',false),
      ('confirmed_at','timestamp with time zone',true),('created_at','timestamp with time zone',true),
      ('updated_at','timestamp with time zone',true)
    ) expected(name,type_name,required) loop
      select format_type(atttypid,atttypmod) type_name,attnotnull required into actual
      from pg_attribute where attrelid='public.event_field_controls'::regclass and attname=col.name and not attisdropped;
      if actual.type_name is distinct from col.type_name or actual.required is distinct from col.required then
        raise exception 'incompatible field control column %',col.name;
      end if;
    end loop;
    if exists (select 1 from pg_policy where polrelid='public.event_field_controls'::regclass
      and polname not in ('event_field_controls_admin_select','event_field_controls_admin_insert',
        'event_field_controls_admin_update','event_field_controls_admin_delete')) then
      raise exception 'unexpected field control policies require manual review';
    end if;
    -- IF NOT EXISTS is not a schema repair strategy: known objects must already
    -- have the required semantics, or this narrow migration refuses to proceed.
    for col in select * from (values
      ('event_field_controls_pkey','PRIMARY KEY (id)'),
      ('event_field_controls_event_id_fkey','FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE'),
      ('event_field_controls_edition_id_fkey','FOREIGN KEY (edition_id) REFERENCES event_editions(id) ON DELETE CASCADE'),
      ('event_field_controls_confirmed_by_fkey','FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('event_field_controls_entity_check',$def$CHECK ((entity_type = ANY (ARRAY['event'::text, 'edition'::text])))$def$),
      ('event_field_controls_parent_check',$def$CHECK ((((entity_type = 'event'::text) AND (edition_id IS NULL)) OR ((entity_type = 'edition'::text) AND (edition_id IS NOT NULL))))$def$),
      ('event_field_controls_source_priority_check','CHECK (((source_priority >= 1) AND (source_priority <= 8)))'),
      ('event_field_controls_reason_check','CHECK (((length(btrim(lock_reason)) >= 3) AND (length(btrim(lock_reason)) <= 1000)))')
    ) expected(name,sql) loop
      select pg_get_constraintdef(c.oid) into definition from pg_constraint c
      where c.conrelid='public.event_field_controls'::regclass and c.conname=col.name
        and c.convalidated and not c.condeferrable;
      if regexp_replace(replace(definition,'public.',''),'\s','','g')
         is distinct from regexp_replace(col.sql,'\s','','g') then
        raise exception 'incompatible or missing field control constraint %: %',col.name,definition;
      end if;
    end loop;
    select pg_get_constraintdef(c.oid) into definition from pg_constraint c
    where c.conrelid='public.event_change_proposals'::regclass
      and c.conname='event_change_proposals_crawl_id_fkey' and c.convalidated and not c.condeferrable;
    if regexp_replace(replace(definition,'public.',''),'\s','','g') is distinct from
       'FOREIGNKEY(crawl_id)REFERENCESsource_crawl_results(id)ONDELETESETNULL' then
      raise exception 'incompatible or missing proposal crawl foreign key';
    end if;
    for col in select * from (values
      ('event_field_controls_event_field_uidx',true,'event_id, field_name','(edition_id IS NULL)'),
      ('event_field_controls_edition_field_uidx',true,'edition_id, field_name','(edition_id IS NOT NULL)'),
      ('event_field_controls_active_idx',false,'event_id, edition_id, field_name, lock_expires_at','is_locked')
    ) expected(name,is_unique,fields,predicate) loop
      select i.indisunique,i.indisvalid,i.indisready,
        (select string_agg(pg_get_indexdef(i.indexrelid,k,true),', ' order by k)
         from generate_series(1,i.indnkeyatts) k) fields,
        pg_get_expr(i.indpred,i.indrelid) predicate into actual
      from pg_index i where i.indexrelid=to_regclass('public.'||col.name)
        and i.indrelid='public.event_field_controls'::regclass;
      if actual.indisunique is distinct from col.is_unique or actual.indisvalid is not true
         or actual.indisready is not true or actual.fields is distinct from col.fields
         or actual.predicate is distinct from col.predicate then
        raise exception 'incompatible or missing field control index %',col.name;
      end if;
    end loop;
  end if;
  select array_agg(v[1] order by v[1]) into status_values
  from pg_constraint c cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''','g') v
  where c.conrelid='public.event_change_proposals'::regclass and c.conname='event_change_proposals_status_check';
  if status_values is distinct from array['approved','failed','pending','rejected','superseded']::text[]
     and status_values is distinct from array['accepted','edited_and_accepted','expired','pending','rejected','superseded']::text[] then
    raise exception 'unknown proposal status constraint: %',status_values;
  end if;
end;
$guard$;

alter table public.event_change_proposals
  add column if not exists crawl_id bigint references public.source_crawl_results(id) on delete set null,
  add column if not exists field_name text,
  add column if not exists old_value jsonb,
  add column if not exists proposed_value jsonb,
  add column if not exists normalized_value jsonb,
  add column if not exists applied_value jsonb,
  add column if not exists change_type text,
  add column if not exists extraction_method text,
  add column if not exists extractor_version text,
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists source_context text,
  add column if not exists confidence_reasons jsonb not null default '[]'::jsonb,
  add column if not exists validation_warnings text[] not null default '{}',
  add column if not exists priority text not null default 'medium',
  add column if not exists rejection_reason text,
  add column if not exists next_review_at timestamptz,
  add column if not exists locked_field boolean not null default false;

alter table public.event_change_proposals
  drop constraint if exists event_change_proposals_status_check,
  drop constraint if exists event_change_proposals_change_type_check,
  drop constraint if exists event_change_proposals_priority_check;

-- Only legacy terminal labels need translation; pending and superseded rows are untouched.
update public.event_change_proposals
set proposal_status = case proposal_status
  when 'approved' then 'accepted'
  when 'failed' then 'rejected'
  else proposal_status end
where proposal_status in ('approved', 'failed');

alter table public.event_change_proposals
  add constraint event_change_proposals_status_check check (
    proposal_status in ('pending', 'accepted', 'rejected', 'edited_and_accepted', 'superseded', 'expired')
  ),
  add constraint event_change_proposals_change_type_check check (
    change_type is null or change_type in (
      'new_value', 'updated_value', 'removed_value', 'new_edition',
      'possible_cancellation', 'possible_postponement', 'registration_change',
      'location_change', 'source_change'
    )
  ),
  add constraint event_change_proposals_priority_check check (
    priority in ('critical', 'high', 'medium', 'low')
  );

create index if not exists event_change_proposals_field_review_idx
  on public.event_change_proposals(proposal_status, priority, field_name, detected_at desc)
  where proposal_status = 'pending';
create index if not exists event_change_proposals_crawl_idx
  on public.event_change_proposals(crawl_id) where crawl_id is not null;
create index if not exists event_change_proposals_domain_idx
  on public.event_change_proposals((lower(split_part(split_part(source_url, '://', 2), '/', 1))), proposal_status);

create table if not exists public.event_field_controls (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  entity_type text not null,
  field_name text not null,
  is_locked boolean not null default true,
  manual_value jsonb,
  lock_reason text not null,
  lock_expires_at timestamptz,
  source_priority smallint not null default 1,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_field_controls_entity_check check (entity_type in ('event', 'edition')),
  constraint event_field_controls_parent_check check (
    (entity_type = 'event' and edition_id is null) or
    (entity_type = 'edition' and edition_id is not null)
  ),
  constraint event_field_controls_source_priority_check check (source_priority between 1 and 8),
  constraint event_field_controls_reason_check check (length(btrim(lock_reason)) between 3 and 1000)
);

create unique index if not exists event_field_controls_event_field_uidx
  on public.event_field_controls(event_id, field_name) where edition_id is null;
create unique index if not exists event_field_controls_edition_field_uidx
  on public.event_field_controls(edition_id, field_name) where edition_id is not null;
create index if not exists event_field_controls_active_idx
  on public.event_field_controls(event_id, edition_id, field_name, lock_expires_at)
  where is_locked;

drop trigger if exists event_field_controls_set_updated_at on public.event_field_controls;
create trigger event_field_controls_set_updated_at
before update on public.event_field_controls
for each row execute function private.set_updated_at();

create or replace function private.ensure_field_control_parent()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.edition_id is not null and not exists (
    select 1 from public.event_editions edition
    where edition.id = new.edition_id and edition.event_id = new.event_id
  ) then
    raise exception 'field control edition must belong to event' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists event_field_controls_parent_guard on public.event_field_controls;
create trigger event_field_controls_parent_guard
before insert or update of event_id, edition_id on public.event_field_controls
for each row execute function private.ensure_field_control_parent();

alter table public.event_field_controls enable row level security;
drop policy if exists event_field_controls_admin_select on public.event_field_controls;
create policy event_field_controls_admin_select
on public.event_field_controls for select to authenticated
using ((select private.is_admin()));
drop policy if exists event_field_controls_admin_insert on public.event_field_controls;
create policy event_field_controls_admin_insert
on public.event_field_controls for insert to authenticated
with check ((select private.is_admin()));
drop policy if exists event_field_controls_admin_update on public.event_field_controls;
create policy event_field_controls_admin_update
on public.event_field_controls for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists event_field_controls_admin_delete on public.event_field_controls;
create policy event_field_controls_admin_delete
on public.event_field_controls for delete to authenticated
using ((select private.is_admin()));

revoke all on public.event_field_controls from public, anon, authenticated;
grant select, insert, update, delete on public.event_field_controls to authenticated;
grant select, insert, update, delete on public.event_field_controls to service_role;

create or replace function public.record_extraction_proposals(
  p_source_id uuid,
  p_crawl_result_id bigint,
  p_proposals jsonb,
  p_worker_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
set lock_timeout = '5s'
as $$
declare
  source public.event_sources;
  crawl public.source_crawl_results;
  target_edition public.event_editions;
  item jsonb;
  fingerprint text;
  inserted_count integer := 0;
  skipped_count integer := 0;
  changed_count integer;
  sibling public.event_editions;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_proposals is null or jsonb_typeof(p_proposals) <> 'array' or jsonb_array_length(p_proposals) > 100 then
    raise exception 'proposal payload must be an array with at most 100 items' using errcode = '22023';
  end if;

  -- Match source-health and freshness lock ordering before proposal triggers run.
  select * into source from public.event_sources where id = p_source_id for update;
  if source.id is null then raise exception 'source not found' using errcode = 'P0002'; end if;
  if source.is_active is not true then raise exception 'active source required' using errcode='23514'; end if;
  perform 1 from public.events where id=source.event_id for update;
  if not found then raise exception 'source event missing' using errcode='23514'; end if;
  for sibling in select * from public.event_editions where event_id=source.event_id order by id for update loop
    null;
  end loop;
  select * into crawl from public.source_crawl_results
  where id = p_crawl_result_id and source_id = p_source_id;
  if crawl.id is null then raise exception 'crawl result does not belong to source' using errcode = '23514'; end if;

  if crawl.event_id is distinct from source.event_id
     or crawl.edition_id is distinct from source.edition_id
     or crawl.processing_status <> 'completed' or crawl.change_status not in ('changed','first_seen')
     or crawl.http_status is null or crawl.http_status not between 200 and 299 or crawl.error_type is not null then
    raise exception 'successful source-specific content crawl required' using errcode='23514';
  end if;
  if source.edition_id is not null then
    select * into target_edition from public.event_editions where id = source.edition_id and event_id=source.event_id;
    if target_edition.id is null then raise exception 'source edition parent mismatch' using errcode='23514'; end if;
  else
    select * into target_edition from public.event_editions
    where event_id = source.event_id
    order by (coalesce(end_date, start_date) >= current_date) desc, edition_year desc
    limit 1;
  end if;

  for item in select value from jsonb_array_elements(p_proposals)
  loop
    if jsonb_typeof(item) <> 'object' or nullif(item->>'field_name', '') is null
       or nullif(item->>'change_type', '') is null
       or nullif(item->>'extraction_method', '') is null
       or nullif(item->>'confidence', '') is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;
    if item->>'entity_type' = 'edition' and target_edition.id is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    -- No arbitrary JSON keys, verification fields or automatic edition creation.
    -- Lifecycle observations may be recorded for human review, never applied here.
    if coalesce(item->>'entity_type','') not in ('event','edition')
       or item->>'change_type' = 'new_edition'
       or not (item ? 'old_value') or not (item ? 'normalized_value')
       or not (item ? 'proposed_value')
       or (item->>'entity_type'='event' and not (item->>'field_name'=any(array[
         'canonical_name','sport','country','region','city','address','latitude','longitude',
         'event_status','organizer_name','description','image'])))
       or (item->>'entity_type'='edition' and not (item->>'field_name'=any(array[
         'start_date','end_date','start_time','registration_url','registration_status','edition_status',
         'price_min','price_max','currency','participant_limit','race_formats']))) then
      skipped_count := skipped_count + 1;
      continue;
    end if;
    fingerprint := md5(
      source.event_id::text || ':' || coalesce(case when item->>'entity_type' = 'edition' then target_edition.id::text end, '-') || ':' ||
      (item->>'field_name') || ':' || coalesce((item->'normalized_value')::text, 'null')
    );

    insert into public.event_change_proposals (
      event_id, edition_id, source_id, crawl_id, entity_type, proposal_status,
      rule_code, field_name, old_value, proposed_value, normalized_value,
      proposed_changes, observed_values, baseline_values, proposal_fingerprint,
      change_type, confidence, confidence_reasons, extraction_method,
      extractor_version, reason, evidence, source_url, source_context,
      validation_warnings, priority, locked_field, content_hash, detected_at
    ) values (
      source.event_id,
      case when item->>'entity_type' = 'edition' then target_edition.id else null end,
      source.id, crawl.id, coalesce(nullif(item->>'entity_type', ''), 'event'), 'pending',
      'extracted_' || (item->>'field_name'), item->>'field_name', item->'old_value',
      item->'proposed_value', item->'normalized_value',
      jsonb_build_object(item->>'field_name',item->'normalized_value'),
      jsonb_build_object(item->>'field_name', item->'proposed_value'),
      jsonb_build_object(item->>'field_name', item->'old_value'), fingerprint,
      item->>'change_type', greatest(0, least((item->>'confidence')::numeric, 1)),
      coalesce(item->'confidence_reasons', '[]'::jsonb), item->>'extraction_method',
      coalesce(nullif(item->>'extractor_version', ''), p_worker_version),
      'Automatisch extrahierter Feldwert; Veröffentlichung erst nach Admin-Review.',
      coalesce(item->'evidence', '{}'::jsonb) || jsonb_build_object('worker_version', p_worker_version),
      source.source_url, nullif(item->>'source_context', ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(item->'validation_warnings', '[]'::jsonb))), '{}'),
      coalesce(nullif(item->>'priority', ''), 'medium'), coalesce((item->>'locked_field')::boolean, false),
      crawl.content_hash, now()
    )
    on conflict (proposal_fingerprint) do update set
      source_id=excluded.source_id, crawl_id=excluded.crawl_id, source_url=excluded.source_url,
      old_value=excluded.old_value, proposed_value=excluded.proposed_value,
      proposed_changes=excluded.proposed_changes, observed_values=excluded.observed_values,
      baseline_values=excluded.baseline_values, change_type=excluded.change_type,
      confidence=excluded.confidence, confidence_reasons=excluded.confidence_reasons,
      extraction_method=excluded.extraction_method, extractor_version=excluded.extractor_version,
      evidence=excluded.evidence, source_context=excluded.source_context,
      validation_warnings=excluded.validation_warnings, priority=excluded.priority,
      locked_field=excluded.locked_field, content_hash=excluded.content_hash,
      detected_at=now(), updated_at=now(), proposal_status='pending',
      reviewed_at=null, reviewed_by=null, review_notes=null, rejection_reason=null,
      applied_at=null, applied_by=null, applied_value=null
    where public.event_change_proposals.event_id=excluded.event_id
      and public.event_change_proposals.edition_id is not distinct from excluded.edition_id
      and public.event_change_proposals.field_name=excluded.field_name
      and public.event_change_proposals.normalized_value is not distinct from excluded.normalized_value
      and (public.event_change_proposals.proposal_status in ('pending','expired','superseded')
        or (public.event_change_proposals.proposal_status='rejected'
            and public.event_change_proposals.reviewed_at < now()-interval '30 days'));
    get diagnostics changed_count = row_count;
    inserted_count := inserted_count + changed_count;
    skipped_count := skipped_count + 1 - changed_count;
  end loop;

  return jsonb_build_object('recorded', inserted_count, 'skipped', skipped_count);
end;
$$;

revoke all on function public.record_extraction_proposals(uuid, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_extraction_proposals(uuid, bigint, jsonb, text)
  to service_role;

create or replace function public.set_event_field_control(
  p_event_id bigint,
  p_edition_id uuid,
  p_field_name text,
  p_manual_value jsonb,
  p_reason text,
  p_expires_at timestamptz default null,
  p_is_locked boolean default true,
  p_source_priority smallint default 1
)
returns public.event_field_controls
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare result public.event_field_controls;
begin
  if (select private.is_admin()) is not true then raise exception 'admin role required' using errcode = '42501'; end if;
  if nullif(btrim(p_field_name), '') is null then raise exception 'field name required' using errcode = '22023'; end if;
  -- Manual controls cannot be used to attest freshness or publication metadata.
  if (p_edition_id is null and not (p_field_name=any(array[
       'canonical_name','sport','subcategory','country','region','city','address','latitude','longitude',
       'organizer_name','description','image','official_url'])))
     or (p_edition_id is not null and not (p_field_name=any(array[
       'start_date','end_date','start_time','registration_url','registration_status','price_min',
       'price_max','currency','price_details','participant_limit','race_formats','source_url']))) then
    raise exception 'unsupported factual control field' using errcode='22023';
  end if;
  perform 1 from public.events where id=p_event_id for update;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  if p_edition_id is not null then
    perform 1 from public.event_editions where id=p_edition_id and event_id=p_event_id for update;
    if not found then raise exception 'field control edition must belong to event' using errcode='23514'; end if;
  end if;
  if p_edition_id is null then
    insert into public.event_field_controls (
      event_id, edition_id, entity_type, field_name, is_locked, manual_value,
      lock_reason, lock_expires_at, source_priority, confirmed_by
    ) values (
      p_event_id, null, 'event', p_field_name, p_is_locked, p_manual_value,
      p_reason, p_expires_at, greatest(1, least(coalesce(p_source_priority, 1), 8)), (select auth.uid())
    )
    on conflict (event_id, field_name) where edition_id is null do update set
      is_locked = excluded.is_locked, manual_value = excluded.manual_value,
      lock_reason = excluded.lock_reason, lock_expires_at = excluded.lock_expires_at,
      source_priority = excluded.source_priority, confirmed_by = excluded.confirmed_by,
      confirmed_at = now(), updated_at = now()
    returning * into result;
  else
    insert into public.event_field_controls (
      event_id, edition_id, entity_type, field_name, is_locked, manual_value,
      lock_reason, lock_expires_at, source_priority, confirmed_by
    ) values (
      p_event_id, p_edition_id, 'edition', p_field_name, p_is_locked, p_manual_value,
      p_reason, p_expires_at, greatest(1, least(coalesce(p_source_priority, 1), 8)), (select auth.uid())
    )
    on conflict (edition_id, field_name) where edition_id is not null do update set
      is_locked = excluded.is_locked, manual_value = excluded.manual_value,
      lock_reason = excluded.lock_reason, lock_expires_at = excluded.lock_expires_at,
      source_priority = excluded.source_priority, confirmed_by = excluded.confirmed_by,
      confirmed_at = now(), updated_at = now()
    returning * into result;
  end if;
  return result;
end;
$$;

revoke all on function public.set_event_field_control(bigint, uuid, text, jsonb, text, timestamptz, boolean, smallint)
  from public, anon, service_role;
grant execute on function public.set_event_field_control(bigint, uuid, text, jsonb, text, timestamptz, boolean, smallint)
  to authenticated;

-- Replaces both the original reviewer and the later wrapper. The old private
-- implementation remains for dependency compatibility, but is never invoked.
-- SECURITY DEFINER is retained from the freshness wrapper; every entry point
-- checks the trusted admin predicate and grants are narrowed explicitly below.
create or replace function public.review_event_change_proposal(
  p_proposal_id uuid,
  p_action text,
  p_review_notes text default null,
  p_edited_value jsonb default null,
  p_rejection_reason text default null
)
returns public.event_change_proposals
language plpgsql
security definer
set search_path = pg_catalog, public, private
set lock_timeout = '5s'
as $review$
declare
  identity_row record;
  proposal public.event_change_proposals;
  event_before public.events;
  event_after public.events;
  edition_before public.event_editions;
  edition_after public.event_editions;
  sibling public.event_editions;
  siblings_before public.event_editions[] := array[]::public.event_editions[];
  expected jsonb;
  actual jsonb;
  patch jsonb;
  baseline jsonb;
  effective_value jsonb;
  keys text[];
  field text;
  assignments text;
  legacy_year smallint;
  target_count integer;
  old_change_source text := current_setting('app.change_source',true);
  old_change_reason text := current_setting('app.change_reason',true);
  old_source_url text := current_setting('app.source_url',true);
  event_fields constant text[] := array[
    'canonical_name','sport','subcategory','country','region','city','address',
    'latitude','longitude','organizer_name','description','image','official_url'];
  edition_fields constant text[] := array[
    'start_date','end_date','start_time','registration_url','registration_status',
    'price_min','price_max','currency','price_details','participant_limit','race_formats','source_url'];
  review_fields constant text[] := array[
    'verification_status','needs_review','review_priority','last_verified_source_id','next_check_at','updated_at'];
begin
  if (select private.is_admin()) is not true then
    raise exception 'admin role required' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('accepted','edited_and_accepted','rejected','superseded') then
    raise exception 'unsupported review action' using errcode='22023';
  end if;

  -- This first lookup intentionally takes NO row lock. Recheck the complete
  -- parent identity after locking Event -> sorted Editions -> Proposal.
  select event_id,edition_id,entity_type into identity_row
  from public.event_change_proposals where id=p_proposal_id;
  if not found then raise exception 'proposal not found' using errcode='P0002'; end if;
  select * into event_before from public.events where id=identity_row.event_id for update;
  if not found then raise exception 'proposal event missing' using errcode='23514'; end if;
  for sibling in select * from public.event_editions
    where event_id=event_before.id order by id for update loop
    siblings_before := array_append(siblings_before,sibling);
    if sibling.id=identity_row.edition_id then edition_before:=sibling; end if;
  end loop;
  select * into proposal from public.event_change_proposals where id=p_proposal_id for update;
  if proposal.id is null or proposal.proposal_status <> 'pending' then
    raise exception 'pending proposal not found' using errcode='P0002';
  end if;
  if proposal.event_id is distinct from identity_row.event_id
     or proposal.edition_id is distinct from identity_row.edition_id
     or proposal.entity_type is distinct from identity_row.entity_type then
    raise exception 'proposal parent changed; retry review' using errcode='40001';
  end if;
  if proposal.entity_type not in ('event','edition')
     or (proposal.entity_type='event' and proposal.edition_id is not null)
     or (proposal.entity_type='edition' and edition_before.id is null) then
    raise exception 'proposal parent mismatch' using errcode='23514';
  end if;

  if p_action in ('rejected','superseded') then
    if p_action='rejected' and nullif(btrim(p_rejection_reason),'') is null then
      raise exception 'rejection reason required' using errcode='22023';
    end if;
    update public.event_change_proposals set proposal_status=p_action,
      reviewed_at=now(),reviewed_by=(select auth.uid()),review_notes=p_review_notes,
      rejection_reason=case when p_action='rejected' then p_rejection_reason else null end
    where id=proposal.id returning * into proposal;
    return proposal;
  end if;
  if proposal.change_type='new_edition' then
    raise exception 'new editions require the candidate review workflow' using errcode='22023';
  end if;

  if proposal.field_name is not null then
    effective_value := case when p_action='edited_and_accepted' then p_edited_value else proposal.normalized_value end;
    if effective_value is null or proposal.old_value is null then
      raise exception 'accepted value and explicit baseline required' using errcode='22023';
    end if;
    patch:=jsonb_build_object(proposal.field_name,effective_value);
    baseline:=jsonb_build_object(proposal.field_name,proposal.old_value);
  else
    -- Legacy apply compatibility is limited to concrete facts with a complete
    -- baseline for every field. Historical metadata patches cannot be replayed.
    patch:=case when p_action='edited_and_accepted' then p_edited_value else proposal.proposed_changes end;
    baseline:=proposal.baseline_values;
    effective_value:=patch;
  end if;
  if jsonb_typeof(patch) is distinct from 'object' or patch='{}'::jsonb
     or jsonb_typeof(baseline) is distinct from 'object' then
    raise exception 'concrete factual patch and baseline required' using errcode='22023';
  end if;
  select array_agg(key order by key) into keys from jsonb_object_keys(patch) key;
  if (proposal.entity_type='event' and not keys <@ event_fields)
     or (proposal.entity_type='edition' and not keys <@ edition_fields) then
    raise exception 'proposal contains unsupported factual fields; metadata and lifecycle changes require a dedicated workflow'
      using errcode='22023';
  end if;
  actual:=case when proposal.entity_type='event' then to_jsonb(event_before) else to_jsonb(edition_before) end;
  foreach field in array keys loop
    if not (baseline ? field) then
      raise exception 'baseline missing for field %',field using errcode='22023';
    end if;
    if actual->field is distinct from baseline->field then
      update public.event_change_proposals set proposal_status='superseded',
        reviewed_at=now(),reviewed_by=(select auth.uid()),
        review_notes=concat_ws(E'\n',p_review_notes,'Baseline changed before review: '||field)
      where id=proposal.id returning * into proposal;
      return proposal;
    end if;
    if field='race_formats' and jsonb_typeof(patch->field) is distinct from 'array' then
      raise exception 'race_formats must be an array' using errcode='22023';
    elsif field='price_details' and jsonb_typeof(patch->field) is distinct from 'object' then
      raise exception 'price_details must be an object' using errcode='22023';
    elsif field not in ('race_formats','price_details')
      and jsonb_typeof(patch->field) not in ('string','number','null') then
      raise exception 'factual scalar required for %',field using errcode='22023';
    end if;
  end loop;
  -- Field names are drawn exclusively from the constants above and quoted as
  -- identifiers. Values remain typed, bound parameters, never SQL text.
  select string_agg(format('%I=($1).%I',key,key),', ' order by key)
    into assignments from unnest(keys) key;
  perform set_config('app.change_source','manual_admin',true);
  perform set_config('app.change_reason',coalesce(nullif(btrim(p_review_notes),''),'Accepted factual extraction proposal '||proposal.id),true);
  perform set_config('app.source_url',coalesce(proposal.source_url,''),true);

  if proposal.entity_type='event' then
    event_after:=jsonb_populate_record(event_before,patch);
    if patch ? 'latitude' and event_after.latitude is not null
       and not (event_after.latitude::numeric between -90 and 90) then
      raise exception 'latitude out of range' using errcode='22023';
    end if;
    if patch ? 'longitude' and event_after.longitude is not null
       and not (event_after.longitude::numeric between -180 and 180) then
      raise exception 'longitude out of range' using errcode='22023';
    end if;
    legacy_year:=coalesce(extract(year from private.try_parse_event_date(event_before.date))::smallint,
      nullif(substring(event_before.date from '(20\d{2})'),'')::smallint,
      extract(year from event_before.created_at)::smallint);
    if not exists(select 1 from unnest(siblings_before) e where e.edition_year=legacy_year) then
      raise exception 'existing legacy sync edition required; no edition creation during fact review' using errcode='23514';
    end if;
    execute 'update public.events set '||assignments||
      ', needs_review=true, verification_status=''needs_review'', review_priority=''high'',
       next_check_at=least(coalesce(next_check_at,now()),now()), updated_at=now() where id=$2'
      using event_after,event_before.id;

    -- The event trigger rewrites the legacy year's structured edition facts and
    -- verification timestamps. Restore those exact pre-review values immediately,
    -- keeping the existing freshness guards enabled and all editions reviewable.
    foreach sibling in array siblings_before loop
      update public.event_editions e set
        start_date=sibling.start_date,end_date=sibling.end_date,
        registration_url=sibling.registration_url,registration_status=sibling.registration_status,
        edition_status=sibling.edition_status,publication_status=sibling.publication_status,
        race_formats=sibling.race_formats,legacy_distance=sibling.legacy_distance,source_url=sibling.source_url,
        data_confidence=sibling.data_confidence,last_verified_at=sibling.last_verified_at,
        verification_status='needs_review',needs_review=true,review_priority='high',last_verified_source_id=null,
        next_check_at=least(coalesce(sibling.next_check_at,now()),now()),updated_at=now()
      where e.id=sibling.id and e.event_id=event_before.id;
    end loop;
    select to_jsonb(e) into actual from public.events e where e.id=event_before.id;
    if actual-review_fields is distinct from to_jsonb(event_after)-review_fields then
      raise exception 'event trigger changed non-target facts or identity' using errcode='23514';
    end if;
  else
    edition_after:=jsonb_populate_record(edition_before,patch);
    if (edition_after.start_date is not null and extract(year from edition_after.start_date)::integer<>edition_before.edition_year)
       or (edition_after.end_date is not null and extract(year from edition_after.end_date)::integer<>edition_before.edition_year) then
      raise exception 'cross-year dates require the candidate review workflow' using errcode='22023';
    end if;
    execute 'update public.event_editions set '||assignments||
      ', needs_review=true, verification_status=''needs_review'', review_priority=''high'',
       last_verified_source_id=null, next_check_at=least(coalesce(next_check_at,now()),now()),
       updated_at=now() where id=$2 and event_id=$3'
      using edition_after,edition_before.id,event_before.id;
  end if;

  -- No IDs, years, slugs, saved-reference keys, publication/lifecycle fields,
  -- confidence or last_verified timestamps may change as a side effect.
  select count(*) into target_count from public.event_editions where event_id=event_before.id;
  if target_count<>cardinality(siblings_before) then
    raise exception 'edition count changed during factual review' using errcode='23514';
  end if;
  foreach sibling in array siblings_before loop
    expected:=case when proposal.entity_type='edition' and sibling.id=edition_before.id
      then to_jsonb(edition_after) else to_jsonb(sibling) end;
    select to_jsonb(e) into actual from public.event_editions e where e.id=sibling.id and e.event_id=event_before.id;
    if actual is null or actual-review_fields is distinct from expected-review_fields then
      raise exception 'edition trigger changed non-target facts, verification history or identity' using errcode='23514';
    end if;
  end loop;
  update public.event_change_proposals set proposal_status=p_action,reviewed_at=now(),
    reviewed_by=(select auth.uid()),review_notes=p_review_notes,rejection_reason=null,
    applied_value=effective_value,applied_at=now(),applied_by=(select auth.uid())
  where id=proposal.id returning * into proposal;
  perform set_config('app.change_source',coalesce(old_change_source,''),true);
  perform set_config('app.change_reason',coalesce(old_change_reason,''),true);
  perform set_config('app.source_url',coalesce(old_source_url,''),true);
  -- Validation/freshness attestation is a separate operation. The next check is
  -- immediately due; an accepted fact never certifies a complete verified event.
  return proposal;
end;
$review$;

revoke all on function public.review_event_change_proposal(uuid,text,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.review_event_change_proposal(uuid,text,text,jsonb,text) to authenticated;

create or replace function public.apply_event_change_proposal(
  p_proposal_id uuid, p_review_notes text default null
)
returns public.event_change_proposals
language sql
security invoker
set search_path = pg_catalog, public, private
as $apply$
  select public.review_event_change_proposal(p_proposal_id,'accepted',p_review_notes,null,null);
$apply$;
revoke all on function public.apply_event_change_proposal(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.apply_event_change_proposal(uuid,text) to authenticated;

do $revoke_unsafe$
begin
  if to_regprocedure('private.review_event_change_proposal_without_parent_lock(uuid,text,text,jsonb,text)') is not null then
    execute 'revoke all on function private.review_event_change_proposal_without_parent_lock(uuid,text,text,jsonb,text)
      from public,anon,authenticated,service_role';
  end if;
end;
$revoke_unsafe$;
comment on function public.review_event_change_proposal(uuid,text,text,jsonb,text) is
  'Admin-only factual review, parent-first locks and complete baselines; never publishes editions or attests freshness.';
comment on function public.record_extraction_proposals(uuid,bigint,jsonb,text) is
  'Service-only source-specific extraction evidence; stores proposals under parent locks without changing public facts.';
comment on table public.event_field_controls is
  'Admin-confirmed field locks; extracted values require separate factual review.';

notify pgrst, 'reload schema';
commit;
