-- Stage 3: field-level extraction proposals, manual controls and transactional review.
-- Public event facts are changed only by an authenticated admin review action.

begin;

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

update public.event_change_proposals
set proposal_status = case proposal_status
  when 'approved' then 'accepted'
  when 'failed' then 'rejected'
  else proposal_status end;

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
create policy event_field_controls_admin_select
on public.event_field_controls for select to authenticated
using ((select private.is_admin()));
create policy event_field_controls_admin_insert
on public.event_field_controls for insert to authenticated
with check ((select private.is_admin()));
create policy event_field_controls_admin_update
on public.event_field_controls for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
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
as $$
declare
  source public.event_sources;
  crawl public.source_crawl_results;
  target_edition public.event_editions;
  item jsonb;
  fingerprint text;
  inserted_count integer := 0;
  skipped_count integer := 0;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_proposals) <> 'array' or jsonb_array_length(p_proposals) > 100 then
    raise exception 'proposal payload must be an array with at most 100 items' using errcode = '22023';
  end if;

  select * into source from public.event_sources where id = p_source_id;
  if source.id is null then raise exception 'source not found' using errcode = 'P0002'; end if;
  select * into crawl from public.source_crawl_results
  where id = p_crawl_result_id and source_id = p_source_id;
  if crawl.id is null then raise exception 'crawl result does not belong to source' using errcode = '23514'; end if;

  if source.edition_id is not null then
    select * into target_edition from public.event_editions where id = source.edition_id;
  else
    select * into target_edition from public.event_editions
    where event_id = source.event_id
    order by (coalesce(end_date, start_date) >= current_date) desc, edition_year desc
    limit 1;
  end if;

  for item in select value from jsonb_array_elements(p_proposals)
  loop
    if nullif(item->>'field_name', '') is null
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
      coalesce(item->'proposed_changes', '{}'::jsonb),
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
      source_id = excluded.source_id, crawl_id = excluded.crawl_id,
      confidence = greatest(public.event_change_proposals.confidence, excluded.confidence),
      confidence_reasons = excluded.confidence_reasons, evidence = excluded.evidence,
      source_context = excluded.source_context, validation_warnings = excluded.validation_warnings,
      priority = excluded.priority, detected_at = now(), updated_at = now(),
      proposal_status = case
        when public.event_change_proposals.proposal_status in ('expired', 'superseded')
          or (public.event_change_proposals.proposal_status = 'rejected'
              and public.event_change_proposals.reviewed_at < now() - interval '30 days')
        then 'pending' else public.event_change_proposals.proposal_status end,
      reviewed_at = case
        when public.event_change_proposals.proposal_status in ('expired', 'superseded')
          or (public.event_change_proposals.proposal_status = 'rejected'
              and public.event_change_proposals.reviewed_at < now() - interval '30 days')
        then null else public.event_change_proposals.reviewed_at end;
    inserted_count := inserted_count + 1;
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
  if not (select private.is_admin()) then raise exception 'admin role required' using errcode = '42501'; end if;
  if nullif(btrim(p_field_name), '') is null then raise exception 'field name required' using errcode = '22023'; end if;
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
  from public, anon;
grant execute on function public.set_event_field_control(bigint, uuid, text, jsonb, text, timestamptz, boolean, smallint)
  to authenticated;

create or replace function public.review_event_change_proposal(
  p_proposal_id uuid,
  p_action text,
  p_review_notes text default null,
  p_edited_value jsonb default null,
  p_rejection_reason text default null
)
returns public.event_change_proposals
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  proposal public.event_change_proposals;
  current_value jsonb;
  effective_value jsonb;
  predecessor public.event_editions;
  existing_edition public.event_editions;
  event_row public.events;
  new_year integer;
  new_date date;
  proposed_keys text[];
  allowed_event_keys constant text[] := array[
    'canonical_name', 'sport', 'subcategory', 'country', 'region', 'city',
    'official_url', 'latitude', 'longitude', 'event_status', 'verification_status',
    'data_confidence', 'needs_review', 'review_priority', 'last_verified_at', 'next_check_at'
  ];
  allowed_edition_keys constant text[] := array[
    'start_date', 'end_date', 'start_time', 'registration_url', 'registration_status',
    'edition_status', 'price_min', 'price_max', 'currency', 'price_details',
    'participant_limit', 'race_formats', 'source_url', 'verification_status',
    'data_confidence', 'needs_review', 'review_priority', 'last_verified_at', 'next_check_at'
  ];
begin
  if not (select private.is_admin()) then raise exception 'admin role required' using errcode = '42501'; end if;
  if p_action not in ('accepted', 'rejected', 'edited_and_accepted', 'superseded') then
    raise exception 'unsupported review action' using errcode = '22023';
  end if;
  select * into proposal from public.event_change_proposals
  where id = p_proposal_id and proposal_status = 'pending' for update;
  if proposal.id is null then raise exception 'pending proposal not found' using errcode = 'P0002'; end if;

  if p_action = 'rejected' then
    if nullif(btrim(coalesce(p_rejection_reason, '')), '') is null then
      raise exception 'rejection reason required' using errcode = '22023';
    end if;
    update public.event_change_proposals set proposal_status = 'rejected', reviewed_at = now(),
      reviewed_by = (select auth.uid()), review_notes = p_review_notes,
      rejection_reason = p_rejection_reason, updated_at = now()
    where id = proposal.id returning * into proposal;
    return proposal;
  end if;

  if p_action = 'superseded' then
    update public.event_change_proposals set proposal_status = 'superseded', reviewed_at = now(),
      reviewed_by = (select auth.uid()), review_notes = p_review_notes, updated_at = now()
    where id = proposal.id returning * into proposal;
    return proposal;
  end if;

  -- Compatibility for concrete multi-field proposals created before Stage 3.
  if proposal.field_name is null and proposal.proposed_changes <> '{}'::jsonb then
    select coalesce(array_agg(key order by key), array[]::text[])
    into proposed_keys from jsonb_object_keys(proposal.proposed_changes) key;
    if proposal.entity_type = 'event' and not proposed_keys <@ allowed_event_keys then
      raise exception 'proposal contains unsupported event fields' using errcode = '22023';
    end if;
    if proposal.entity_type = 'edition' and not proposed_keys <@ allowed_edition_keys then
      raise exception 'proposal contains unsupported edition fields' using errcode = '22023';
    end if;
    perform set_config('app.change_source', 'manual_admin', true);
    perform set_config('app.change_reason', coalesce(p_review_notes, 'Accepted legacy proposal'), true);
    perform set_config('app.source_url', coalesce(proposal.source_url, ''), true);
    if proposal.entity_type = 'event' then
      update public.events event set
        canonical_name = case when proposal.proposed_changes ? 'canonical_name' then proposal.proposed_changes->>'canonical_name' else event.canonical_name end,
        sport = case when proposal.proposed_changes ? 'sport' then proposal.proposed_changes->>'sport' else event.sport end,
        subcategory = case when proposal.proposed_changes ? 'subcategory' then proposal.proposed_changes->>'subcategory' else event.subcategory end,
        country = case when proposal.proposed_changes ? 'country' then proposal.proposed_changes->>'country' else event.country end,
        region = case when proposal.proposed_changes ? 'region' then proposal.proposed_changes->>'region' else event.region end,
        city = case when proposal.proposed_changes ? 'city' then proposal.proposed_changes->>'city' else event.city end,
        official_url = case when proposal.proposed_changes ? 'official_url' then proposal.proposed_changes->>'official_url' else event.official_url end,
        latitude = case when proposal.proposed_changes ? 'latitude' then proposal.proposed_changes->>'latitude' else event.latitude end,
        longitude = case when proposal.proposed_changes ? 'longitude' then proposal.proposed_changes->>'longitude' else event.longitude end,
        event_status = case when proposal.proposed_changes ? 'event_status' then proposal.proposed_changes->>'event_status' else event.event_status end,
        verification_status = case when proposal.proposed_changes ? 'verification_status' then proposal.proposed_changes->>'verification_status' else event.verification_status end,
        data_confidence = case when proposal.proposed_changes ? 'data_confidence' then (proposal.proposed_changes->>'data_confidence')::numeric else event.data_confidence end,
        needs_review = case when proposal.proposed_changes ? 'needs_review' then (proposal.proposed_changes->>'needs_review')::boolean else event.needs_review end,
        review_priority = case when proposal.proposed_changes ? 'review_priority' then proposal.proposed_changes->>'review_priority' else event.review_priority end,
        last_verified_at = case when proposal.proposed_changes ? 'last_verified_at' then (proposal.proposed_changes->>'last_verified_at')::timestamptz else now() end,
        next_check_at = case when proposal.proposed_changes ? 'next_check_at' then (proposal.proposed_changes->>'next_check_at')::timestamptz else event.next_check_at end,
        updated_at = now()
      where event.id = proposal.event_id;
    else
      update public.event_editions edition set
        start_date = case when proposal.proposed_changes ? 'start_date' then (proposal.proposed_changes->>'start_date')::date else edition.start_date end,
        end_date = case when proposal.proposed_changes ? 'end_date' then (proposal.proposed_changes->>'end_date')::date else edition.end_date end,
        start_time = case when proposal.proposed_changes ? 'start_time' then (proposal.proposed_changes->>'start_time')::time else edition.start_time end,
        registration_url = case when proposal.proposed_changes ? 'registration_url' then proposal.proposed_changes->>'registration_url' else edition.registration_url end,
        registration_status = case when proposal.proposed_changes ? 'registration_status' then proposal.proposed_changes->>'registration_status' else edition.registration_status end,
        edition_status = case when proposal.proposed_changes ? 'edition_status' then proposal.proposed_changes->>'edition_status' else edition.edition_status end,
        price_min = case when proposal.proposed_changes ? 'price_min' then (proposal.proposed_changes->>'price_min')::numeric else edition.price_min end,
        price_max = case when proposal.proposed_changes ? 'price_max' then (proposal.proposed_changes->>'price_max')::numeric else edition.price_max end,
        currency = case when proposal.proposed_changes ? 'currency' then proposal.proposed_changes->>'currency' else edition.currency end,
        price_details = case when proposal.proposed_changes ? 'price_details' then proposal.proposed_changes->'price_details' else edition.price_details end,
        participant_limit = case when proposal.proposed_changes ? 'participant_limit' then (proposal.proposed_changes->>'participant_limit')::integer else edition.participant_limit end,
        race_formats = case when proposal.proposed_changes ? 'race_formats' then proposal.proposed_changes->'race_formats' else edition.race_formats end,
        source_url = case when proposal.proposed_changes ? 'source_url' then proposal.proposed_changes->>'source_url' else edition.source_url end,
        verification_status = case when proposal.proposed_changes ? 'verification_status' then proposal.proposed_changes->>'verification_status' else edition.verification_status end,
        data_confidence = case when proposal.proposed_changes ? 'data_confidence' then (proposal.proposed_changes->>'data_confidence')::numeric else edition.data_confidence end,
        needs_review = case when proposal.proposed_changes ? 'needs_review' then (proposal.proposed_changes->>'needs_review')::boolean else edition.needs_review end,
        review_priority = case when proposal.proposed_changes ? 'review_priority' then proposal.proposed_changes->>'review_priority' else edition.review_priority end,
        last_verified_at = case when proposal.proposed_changes ? 'last_verified_at' then (proposal.proposed_changes->>'last_verified_at')::timestamptz else now() end,
        next_check_at = case when proposal.proposed_changes ? 'next_check_at' then (proposal.proposed_changes->>'next_check_at')::timestamptz else edition.next_check_at end,
        updated_at = now()
      where edition.id = proposal.edition_id and edition.event_id = proposal.event_id;
    end if;
    update public.event_change_proposals set proposal_status = 'accepted', reviewed_at = now(),
      reviewed_by = (select auth.uid()), review_notes = p_review_notes,
      applied_value = proposal.proposed_changes, applied_at = now(), applied_by = (select auth.uid()), updated_at = now()
    where id = proposal.id returning * into proposal;
    perform public.run_event_validation(proposal.event_id, proposal.edition_id);
    return proposal;
  end if;

  effective_value := case when p_action = 'edited_and_accepted' then p_edited_value else proposal.normalized_value end;
  if effective_value is null then raise exception 'accepted value required' using errcode = '22023'; end if;

  if proposal.change_type = 'new_edition' then
    select * into event_row from public.events where id = proposal.event_id for update;
    select * into predecessor from public.event_editions where event_id = proposal.event_id order by edition_year desc limit 1 for update;
    new_year := coalesce((effective_value->>'edition_year')::integer, (proposal.proposed_changes->>'edition_year')::integer, (proposal.normalized_value #>> '{}')::integer);
    new_date := coalesce((effective_value->>'start_date')::date, (proposal.proposed_changes->>'start_date')::date);
    if new_year is null or new_date is null or extract(year from new_date)::integer <> new_year or new_date <= current_date then
      raise exception 'valid future edition year and date required' using errcode = '22023';
    end if;
    select * into existing_edition from public.event_editions
    where event_id = proposal.event_id and edition_year = new_year for update;
    if existing_edition.id is not null and existing_edition.publication_status = 'published' then
        update public.event_change_proposals set proposal_status = 'superseded', reviewed_at = now(),
          reviewed_by = (select auth.uid()), review_notes = 'Edition already exists', updated_at = now()
        where id = proposal.id returning * into proposal;
        return proposal;
    elsif existing_edition.id is not null then
      update public.event_editions set publication_status = 'published', discovery_status = 'active',
        edition_status = 'scheduled', verification_status = 'verified',
        data_confidence = greatest(data_confidence, proposal.confidence), needs_review = false,
        review_priority = 'low', last_verified_at = now(), published_at = coalesce(published_at, now()),
        updated_at = now()
      where id = existing_edition.id;
      update public.edition_succession_candidates set candidate_status = 'approved',
        reviewed_at = now(), reviewed_by = (select auth.uid()),
        review_notes = 'Approved through extraction proposal review', updated_at = now()
      where draft_edition_id = existing_edition.id and candidate_status in ('detected', 'draft_created', 'conflict');
      update public.source_review_tasks set status = 'resolved', reviewed_at = now(),
        reviewed_by = (select auth.uid()), review_notes = 'Edition approved through extraction proposal review',
        updated_at = now()
      where edition_id = existing_edition.id and task_type = 'new_edition_candidate' and status = 'open';
    else
      insert into public.event_editions (
      event_id, edition_year, edition_slug, legacy_event_key, start_date, registration_status,
      edition_status, publication_status, race_formats, legacy_distance, source_url,
      verification_status, data_confidence, needs_review, review_priority, last_verified_at,
      next_check_at, discovery_status, predecessor_edition_id, generated_from_source_id, published_at
    ) values (
      proposal.event_id, new_year, event_row.slug || '-' || new_year::text,
      lower(btrim(coalesce(event_row.canonical_name, event_row.event_name, '')) || '|' ||
        to_char(new_date, 'DD.MM.YYYY') || '|' || btrim(coalesce(event_row.city, '')) || '|' || btrim(coalesce(event_row.country, ''))),
      new_date, 'unknown', 'scheduled', 'published', coalesce(predecessor.race_formats, '[]'::jsonb),
      predecessor.legacy_distance, proposal.source_url, 'verified', proposal.confidence,
      false, 'low', now(), now() + interval '30 days', 'active', predecessor.id, proposal.source_id, now()
      );
    end if;
  else
    if proposal.entity_type = 'event' then
      select to_jsonb(event)->proposal.field_name into current_value from public.events event where id = proposal.event_id for update;
    else
      select to_jsonb(edition)->proposal.field_name into current_value from public.event_editions edition
      where id = proposal.edition_id and event_id = proposal.event_id for update;
    end if;
    if current_value is distinct from proposal.old_value then
      update public.event_change_proposals set proposal_status = 'superseded', reviewed_at = now(),
        reviewed_by = (select auth.uid()), review_notes = 'Baseline changed before review', updated_at = now()
      where id = proposal.id returning * into proposal;
      return proposal;
    end if;

    perform set_config('app.change_source', 'manual_admin', true);
    perform set_config('app.change_reason', coalesce(p_review_notes, 'Accepted extraction proposal'), true);
    perform set_config('app.source_url', coalesce(proposal.source_url, ''), true);

    if proposal.entity_type = 'event' then
      update public.events event set
        canonical_name = case when proposal.field_name = 'canonical_name' then effective_value #>> '{}' else event.canonical_name end,
        sport = case when proposal.field_name = 'sport' then effective_value #>> '{}' else event.sport end,
        country = case when proposal.field_name = 'country' then effective_value #>> '{}' else event.country end,
        region = case when proposal.field_name = 'region' then effective_value #>> '{}' else event.region end,
        city = case when proposal.field_name = 'city' then effective_value #>> '{}' else event.city end,
        address = case when proposal.field_name = 'address' then effective_value #>> '{}' else event.address end,
        latitude = case when proposal.field_name = 'latitude' then effective_value #>> '{}' else event.latitude end,
        longitude = case when proposal.field_name = 'longitude' then effective_value #>> '{}' else event.longitude end,
        organizer_name = case when proposal.field_name = 'organizer_name' then effective_value #>> '{}' else event.organizer_name end,
        description = case when proposal.field_name = 'description' then effective_value #>> '{}' else event.description end,
        image = case when proposal.field_name = 'image' then effective_value #>> '{}' else event.image end,
        event_status = case when proposal.field_name = 'event_status' then effective_value #>> '{}' else event.event_status end,
        last_verified_at = now(), next_check_at = now() + interval '30 days', updated_at = now()
      where event.id = proposal.event_id;
    else
      update public.event_editions edition set
        start_date = case when proposal.field_name = 'start_date' then (effective_value #>> '{}')::date else edition.start_date end,
        end_date = case when proposal.field_name = 'end_date' then (effective_value #>> '{}')::date else edition.end_date end,
        start_time = case when proposal.field_name = 'start_time' then (effective_value #>> '{}')::time else edition.start_time end,
        registration_url = case when proposal.field_name = 'registration_url' then effective_value #>> '{}' else edition.registration_url end,
        registration_status = case when proposal.field_name = 'registration_status' then effective_value #>> '{}' else edition.registration_status end,
        edition_status = case when proposal.field_name = 'edition_status' then effective_value #>> '{}' else edition.edition_status end,
        price_min = case when proposal.field_name = 'price_min' then (effective_value #>> '{}')::numeric else edition.price_min end,
        price_max = case when proposal.field_name = 'price_max' then (effective_value #>> '{}')::numeric else edition.price_max end,
        currency = case when proposal.field_name = 'currency' then effective_value #>> '{}' else edition.currency end,
        participant_limit = case when proposal.field_name = 'participant_limit' then (effective_value #>> '{}')::integer else edition.participant_limit end,
        race_formats = case when proposal.field_name = 'race_formats' then effective_value else edition.race_formats end,
        last_verified_at = now(), next_check_at = now() + interval '30 days', updated_at = now()
      where edition.id = proposal.edition_id and edition.event_id = proposal.event_id;
    end if;
  end if;

  update public.event_change_proposals set proposal_status = p_action, reviewed_at = now(),
    reviewed_by = (select auth.uid()), review_notes = p_review_notes,
    applied_value = effective_value, applied_at = now(), applied_by = (select auth.uid()), updated_at = now()
  where id = proposal.id returning * into proposal;
  perform public.run_event_validation(proposal.event_id, proposal.edition_id);
  return proposal;
end;
$$;

revoke all on function public.review_event_change_proposal(uuid, text, text, jsonb, text)
  from public, anon;
grant execute on function public.review_event_change_proposal(uuid, text, text, jsonb, text)
  to authenticated;

create or replace function public.apply_event_change_proposal(
  p_proposal_id uuid,
  p_review_notes text default null
)
returns public.event_change_proposals
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select public.review_event_change_proposal(p_proposal_id, 'accepted', p_review_notes, null, null);
$$;

revoke all on function public.apply_event_change_proposal(uuid, text) from public, anon;
grant execute on function public.apply_event_change_proposal(uuid, text) to authenticated;

comment on table public.event_field_controls is
  'Admin-confirmed field locks and manual overrides. Extractors may propose against a lock but never apply automatically.';
comment on function public.record_extraction_proposals(uuid, bigint, jsonb, text) is
  'Service-role-only idempotent persistence of evidence-backed extraction proposals.';
comment on function public.review_event_change_proposal(uuid, text, text, jsonb, text) is
  'Admin-only transactional review with optimistic baseline check, audit-triggered writes and validation refresh.';

commit;
