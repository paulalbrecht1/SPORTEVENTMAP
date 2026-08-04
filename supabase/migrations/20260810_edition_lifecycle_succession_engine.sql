-- Edition Lifecycle & Succession Engine.
-- Keeps historical editions public, removes past editions from discovery,
-- preserves results and creates review-gated successor drafts.

begin;

alter table public.data_workflow_runs
  drop constraint if exists data_workflow_runs_job_type_check;
alter table public.data_workflow_runs
  add constraint data_workflow_runs_job_type_check check (
    job_type in (
      'catalog_import', 'housekeeping', 'source_crawl', 'validation',
      'country_boundary_import', 'edition_lifecycle'
    )
  );

alter table public.event_editions
  add column if not exists discovery_status text not null default 'active',
  add column if not exists discovery_archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists results_status text not null default 'not_expected',
  add column if not exists predecessor_edition_id uuid references public.event_editions(id) on delete set null,
  add column if not exists generated_from_source_id uuid references public.event_sources(id) on delete set null,
  add column if not exists auto_publish_eligible boolean not null default false,
  add column if not exists published_at timestamptz;

alter table public.event_editions
  drop constraint if exists event_editions_discovery_status_check,
  drop constraint if exists event_editions_results_status_check;
alter table public.event_editions
  add constraint event_editions_discovery_status_check check (
    discovery_status in ('active', 'detail_only', 'suppressed')
  ),
  add constraint event_editions_results_status_check check (
    results_status in ('not_expected', 'expected', 'available', 'unavailable')
  );

update public.event_editions
set discovery_status = case
      when publication_status <> 'published' then 'suppressed'
      when edition_status in ('cancelled', 'inactive') then 'detail_only'
      when coalesce(end_date, start_date) < current_date then 'detail_only'
      else 'active'
    end,
    discovery_archived_at = case
      when publication_status = 'published'
       and (edition_status in ('cancelled', 'inactive') or coalesce(end_date, start_date) < current_date)
        then coalesce(discovery_archived_at, now())
      else discovery_archived_at
    end,
    archive_reason = case
      when publication_status = 'published' and edition_status = 'cancelled' then 'cancelled'
      when publication_status = 'published' and edition_status = 'inactive' then 'inactive'
      when publication_status = 'published' and coalesce(end_date, start_date) < current_date then 'event_completed'
      else archive_reason
    end,
    results_status = case
      when coalesce(end_date, start_date) < current_date and results_status = 'not_expected' then 'expected'
      else results_status
    end,
    published_at = case when publication_status = 'published' then coalesce(published_at, updated_at, created_at) else published_at end;

create index if not exists event_editions_discovery_lifecycle_idx
  on public.event_editions(discovery_status, publication_status, start_date, event_id);
create index if not exists event_editions_results_status_idx
  on public.event_editions(results_status, start_date desc)
  where publication_status = 'published';

create table if not exists public.edition_lifecycle_settings (
  singleton boolean primary key default true check (singleton),
  completion_grace_days integer not null default 2 check (completion_grace_days between 0 and 30),
  results_initial_check_days integer not null default 2 check (results_initial_check_days between 0 and 30),
  successor_recheck_days integer not null default 14 check (successor_recheck_days between 1 and 120),
  auto_draft_threshold numeric(4,3) not null default 0.900 check (auto_draft_threshold between 0.500 and 1),
  batch_approval_threshold numeric(4,3) not null default 0.900 check (batch_approval_threshold between 0.500 and 1),
  auto_publish_enabled boolean not null default false,
  auto_publish_threshold numeric(4,3) not null default 0.995 check (auto_publish_threshold between 0.900 and 1),
  max_candidates_per_batch integer not null default 100 check (max_candidates_per_batch between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.edition_lifecycle_settings(singleton)
values (true)
on conflict (singleton) do nothing;

drop trigger if exists edition_lifecycle_settings_set_updated_at on public.edition_lifecycle_settings;
create trigger edition_lifecycle_settings_set_updated_at
before update on public.edition_lifecycle_settings
for each row execute function private.set_updated_at();

create table if not exists public.edition_results (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  edition_id uuid not null references public.event_editions(id) on delete cascade,
  source_id uuid references public.event_sources(id) on delete set null,
  crawl_result_id bigint references public.source_crawl_results(id) on delete set null,
  result_type text not null default 'official_results',
  result_status text not null default 'candidate',
  publication_status text not null default 'draft',
  title text,
  official_url text,
  published_at timestamptz,
  last_checked_at timestamptz,
  confidence numeric(4,3) not null default 0.500,
  fingerprint text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edition_results_parent_unique unique(edition_id, result_type, official_url),
  constraint edition_results_type_check check (result_type in ('official_results', 'certificate', 'timing', 'report')),
  constraint edition_results_status_check check (result_status in ('candidate', 'available', 'unavailable')),
  constraint edition_results_publication_check check (publication_status in ('draft', 'published', 'archived')),
  constraint edition_results_confidence_check check (confidence between 0 and 1),
  constraint edition_results_url_check check (official_url is null or official_url ~* '^https?://[^[:space:]]+$')
);

create index if not exists edition_results_public_idx
  on public.edition_results(edition_id, publication_status, result_status);
create index if not exists edition_results_review_idx
  on public.edition_results(publication_status, confidence desc, created_at)
  where publication_status = 'draft';

drop trigger if exists edition_results_set_updated_at on public.edition_results;
create trigger edition_results_set_updated_at
before update on public.edition_results
for each row execute function private.set_updated_at();

create table if not exists public.edition_succession_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  source_id uuid not null references public.event_sources(id) on delete cascade,
  crawl_result_id bigint references public.source_crawl_results(id) on delete set null,
  predecessor_edition_id uuid references public.event_editions(id) on delete set null,
  draft_edition_id uuid references public.event_editions(id) on delete set null,
  candidate_year smallint not null check (candidate_year between 1900 and 2200),
  candidate_start_date date not null,
  candidate_end_date date,
  candidate_name text,
  registration_url text,
  source_url text not null,
  confidence numeric(4,3) not null,
  evidence jsonb not null default '{}'::jsonb,
  candidate_status text not null default 'detected',
  fingerprint text not null unique,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edition_succession_dates_check check (candidate_end_date is null or candidate_start_date <= candidate_end_date),
  constraint edition_succession_confidence_check check (confidence between 0 and 1),
  constraint edition_succession_status_check check (
    candidate_status in ('detected', 'draft_created', 'approved', 'rejected', 'superseded', 'conflict')
  ),
  constraint edition_succession_registration_url_check check (
    registration_url is null or registration_url ~* '^https?://[^[:space:]]+$'
  )
);

create index if not exists edition_succession_review_idx
  on public.edition_succession_candidates(candidate_status, confidence desc, last_detected_at)
  where candidate_status in ('detected', 'draft_created', 'conflict');
create index if not exists edition_succession_event_idx
  on public.edition_succession_candidates(event_id, candidate_year desc);

drop trigger if exists edition_succession_candidates_set_updated_at on public.edition_succession_candidates;
create trigger edition_succession_candidates_set_updated_at
before update on public.edition_succession_candidates
for each row execute function private.set_updated_at();

alter table public.event_editions
  add column if not exists generated_from_candidate_id uuid references public.edition_succession_candidates(id) on delete set null;

alter table public.source_review_tasks
  drop constraint if exists source_review_tasks_type_check;
alter table public.source_review_tasks
  add constraint source_review_tasks_type_check check (
    task_type in (
      'content_changed', 'source_unreachable', 'content_invalid', 'dead_letter',
      'new_edition_candidate', 'results_available'
    )
  );

alter table public.favorites
  add column if not exists event_ref bigint references public.events(id) on delete cascade;
alter table public.season_planner_events
  add column if not exists edition_id uuid references public.event_editions(id) on delete cascade;

update public.favorites favorite
set event_ref = edition.event_id
from public.event_editions edition
where favorite.event_ref is null
  and lower(favorite.event_id) = lower(edition.legacy_event_key);

update public.season_planner_events planner
set edition_id = edition.id
from public.event_editions edition
where planner.edition_id is null
  and lower(planner.event_id) = lower(edition.legacy_event_key);

create unique index if not exists favorites_user_event_ref_uidx
  on public.favorites(user_id, event_ref)
  where event_ref is not null;
create unique index if not exists season_planner_user_edition_uidx
  on public.season_planner_events(user_id, edition_id)
  where edition_id is not null;

create or replace function public.register_edition_successor_candidate(
  p_source_id uuid,
  p_crawl_result_id bigint,
  p_candidate jsonb,
  p_worker_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  source public.event_sources;
  event_row public.events;
  predecessor public.event_editions;
  existing_edition public.event_editions;
  draft public.event_editions;
  candidate public.edition_succession_candidates;
  settings public.edition_lifecycle_settings;
  candidate_start date;
  candidate_end date;
  candidate_year smallint;
  candidate_confidence numeric(4,3);
  candidate_registration text;
  candidate_fingerprint text;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into source from public.event_sources where id = p_source_id;
  if source.id is null then raise exception 'source not found' using errcode = 'P0002'; end if;
  select * into event_row from public.events where id = source.event_id;
  select * into settings from public.edition_lifecycle_settings where singleton;
  select * into predecessor from public.event_editions
  where event_id = source.event_id
  order by edition_year desc, start_date desc nulls last limit 1;

  begin
    candidate_start := nullif(p_candidate->>'start_date', '')::date;
    candidate_end := nullif(p_candidate->>'end_date', '')::date;
    candidate_year := coalesce(nullif(p_candidate->>'year', '')::smallint, extract(year from candidate_start)::smallint);
    candidate_confidence := coalesce(nullif(p_candidate->>'confidence', '')::numeric, 0.500);
  exception when others then
    raise exception 'invalid successor candidate payload' using errcode = '22023';
  end;

  if candidate_start is null or candidate_year is null or extract(year from candidate_start)::smallint <> candidate_year then
    raise exception 'candidate year and start date are required and must match' using errcode = '22023';
  end if;
  if candidate_year > extract(year from current_date)::integer + 5 then
    raise exception 'candidate year is outside the supported horizon' using errcode = '22023';
  end if;
  if predecessor.id is not null and candidate_year <= predecessor.edition_year then
    return jsonb_build_object('accepted', false, 'reason', 'not_a_newer_edition');
  end if;
  if predecessor.start_date is not null and candidate_start <= predecessor.start_date then
    return jsonb_build_object('accepted', false, 'reason', 'date_not_after_predecessor');
  end if;

  candidate_registration := nullif(p_candidate->>'registration_url', '');
  if candidate_registration is not null and candidate_registration !~* '^https?://[^[:space:]]+$' then
    candidate_registration := null;
  end if;
  candidate_fingerprint := source.event_id::text || ':' || candidate_year::text || ':' || candidate_start::text;

  insert into public.edition_succession_candidates (
    event_id, source_id, crawl_result_id, predecessor_edition_id,
    candidate_year, candidate_start_date, candidate_end_date, candidate_name,
    registration_url, source_url, confidence, evidence, fingerprint
  ) values (
    source.event_id, source.id, p_crawl_result_id, predecessor.id,
    candidate_year, candidate_start, candidate_end, nullif(p_candidate->>'name', ''),
    candidate_registration, source.source_url, candidate_confidence,
    coalesce(p_candidate->'evidence', '{}'::jsonb) || jsonb_build_object('worker_version', p_worker_version),
    candidate_fingerprint
  )
  on conflict (fingerprint) do update set
    crawl_result_id = excluded.crawl_result_id,
    source_id = excluded.source_id,
    candidate_end_date = coalesce(excluded.candidate_end_date, edition_succession_candidates.candidate_end_date),
    candidate_name = coalesce(excluded.candidate_name, edition_succession_candidates.candidate_name),
    registration_url = coalesce(excluded.registration_url, edition_succession_candidates.registration_url),
    confidence = greatest(edition_succession_candidates.confidence, excluded.confidence),
    evidence = edition_succession_candidates.evidence || excluded.evidence,
    last_detected_at = now(),
    updated_at = now()
  returning * into candidate;

  select * into existing_edition from public.event_editions
  where event_id = source.event_id and edition_year = candidate_year;

  if existing_edition.id is not null then
    update public.edition_succession_candidates
    set draft_edition_id = existing_edition.id,
        candidate_status = case when existing_edition.publication_status = 'published' then 'superseded' else 'draft_created' end
    where id = candidate.id returning * into candidate;
  elsif candidate_confidence >= settings.auto_draft_threshold then
    insert into public.event_editions (
      event_id, edition_year, edition_slug, legacy_event_key, start_date, end_date,
      registration_url, registration_status, edition_status, publication_status,
      race_formats, legacy_distance, source_url, verification_status, data_confidence,
      needs_review, review_priority, next_check_at, discovery_status,
      predecessor_edition_id, generated_from_source_id, generated_from_candidate_id,
      auto_publish_eligible
    ) values (
      source.event_id, candidate_year, event_row.slug || '-' || candidate_year::text,
      lower(btrim(coalesce(event_row.canonical_name, event_row.event_name, '')) || '|' ||
        to_char(candidate_start, 'DD.MM.YYYY') || '|' || btrim(coalesce(event_row.city, '')) || '|' ||
        btrim(coalesce(event_row.country, ''))),
      candidate_start, candidate_end, candidate_registration,
      case when candidate_registration is null then 'unknown' else 'registration_open' end,
      'scheduled', 'draft', coalesce(predecessor.race_formats, '[]'::jsonb),
      predecessor.legacy_distance, source.source_url, 'unverified', candidate_confidence,
      true, 'high', now() + interval '7 days', 'suppressed', predecessor.id,
      source.id, candidate.id, candidate_confidence >= settings.batch_approval_threshold
    ) returning * into draft;

    update public.edition_succession_candidates
    set draft_edition_id = draft.id, candidate_status = 'draft_created'
    where id = candidate.id returning * into candidate;
  end if;

  if candidate.candidate_status <> 'superseded' then
    insert into public.source_review_tasks (
      source_id, event_id, edition_id, crawl_result_id, task_type, status,
      priority, title, description, fingerprint
    ) values (
      source.id, source.event_id, candidate.draft_edition_id, p_crawl_result_id,
      'new_edition_candidate', 'open',
      case when candidate.confidence >= settings.auto_draft_threshold then 'high' else 'medium' end,
      'Neue Austragung ' || candidate_year::text || ' erkannt',
      case when candidate.draft_edition_id is null
        then 'Ein neuer Jahrgang wurde erkannt und benoetigt eine Zuordnungspruefung.'
        else 'Ein nicht oeffentlicher Editionsentwurf wurde automatisch erzeugt und kann gesammelt freigegeben werden.' end,
      'succession:' || candidate.id::text
    ) on conflict (fingerprint) do update set
      crawl_result_id = excluded.crawl_result_id,
      edition_id = excluded.edition_id,
      priority = excluded.priority,
      title = excluded.title,
      description = excluded.description,
      status = 'open', reviewed_at = null, reviewed_by = null, updated_at = now();
  end if;

  return jsonb_build_object(
    'accepted', true,
    'candidate_id', candidate.id,
    'status', candidate.candidate_status,
    'draft_edition_id', candidate.draft_edition_id,
    'confidence', candidate.confidence
  );
end;
$$;

revoke all on function public.register_edition_successor_candidate(uuid, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.register_edition_successor_candidate(uuid, bigint, jsonb, text)
  to service_role;

create or replace function public.register_edition_result_candidate(
  p_source_id uuid,
  p_crawl_result_id bigint,
  p_result_url text,
  p_title text,
  p_confidence numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  source public.event_sources;
  edition public.event_editions;
  result_row public.edition_results;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_result_url is null or p_result_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'valid result URL required' using errcode = '22023';
  end if;
  select * into source from public.event_sources where id = p_source_id;
  if source.id is null then raise exception 'source not found' using errcode = 'P0002'; end if;
  if source.edition_id is not null then
    select * into edition from public.event_editions where id = source.edition_id;
  else
    select * into edition from public.event_editions
    where event_id = source.event_id and coalesce(end_date, start_date) < current_date
    order by edition_year desc limit 1;
  end if;
  if edition.id is null then return jsonb_build_object('accepted', false, 'reason', 'no_past_edition'); end if;
  if coalesce(edition.end_date, edition.start_date) is null
     or coalesce(edition.end_date, edition.start_date) >= current_date then
    return jsonb_build_object('accepted', false, 'reason', 'edition_not_completed');
  end if;

  insert into public.edition_results (
    event_id, edition_id, source_id, crawl_result_id, result_type, result_status,
    publication_status, title, official_url, last_checked_at, confidence,
    fingerprint, metadata
  ) values (
    edition.event_id, edition.id, source.id, p_crawl_result_id, 'official_results',
    'candidate', 'draft', nullif(p_title, ''), p_result_url, now(),
    greatest(0, least(coalesce(p_confidence, 0.700), 1)),
    edition.id::text || ':official_results:' || lower(p_result_url),
    jsonb_build_object('detected_by', 'source_monitor')
  )
  on conflict (fingerprint) do update set
    crawl_result_id = excluded.crawl_result_id,
    source_id = excluded.source_id,
    title = coalesce(excluded.title, edition_results.title),
    confidence = greatest(edition_results.confidence, excluded.confidence),
    last_checked_at = now(), updated_at = now()
  returning * into result_row;

  update public.event_editions
  set results_status = case when results_status = 'available' then 'available' else 'expected' end
  where id = edition.id;

  insert into public.source_review_tasks (
    source_id, event_id, edition_id, crawl_result_id, task_type, status,
    priority, title, description, fingerprint
  ) values (
    source.id, edition.event_id, edition.id, p_crawl_result_id,
    'results_available', 'open', 'medium',
    'Ergebnisse fuer ' || edition.edition_year::text || ' erkannt',
    'Eine offizielle Ergebnisseite wurde erkannt und als nicht oeffentlicher Entwurf gespeichert.',
    'result:' || result_row.id::text
  ) on conflict (fingerprint) do update set
    crawl_result_id = excluded.crawl_result_id,
    status = 'open', reviewed_at = null, reviewed_by = null, updated_at = now();

  return jsonb_build_object('accepted', true, 'result_id', result_row.id, 'edition_id', edition.id);
end;
$$;

revoke all on function public.register_edition_result_candidate(uuid, bigint, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.register_edition_result_candidate(uuid, bigint, text, text, numeric)
  to service_role;

create or replace function public.approve_edition_succession_candidates(
  p_candidate_ids uuid[] default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  candidate public.edition_succession_candidates;
  settings public.edition_lifecycle_settings;
  approved_ids uuid[] := '{}';
  approved_count integer := 0;
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  select * into settings from public.edition_lifecycle_settings where singleton;
  perform set_config('app.change_source', 'admin', true);
  perform set_config('app.change_reason', 'Batch approval of successor edition drafts', true);

  for candidate in
    select * from public.edition_succession_candidates
    where candidate_status = 'draft_created'
      and draft_edition_id is not null
      and confidence >= settings.batch_approval_threshold
      and (p_candidate_ids is null or id = any(p_candidate_ids))
    order by confidence desc, first_detected_at
    limit greatest(1, least(coalesce(p_limit, settings.max_candidates_per_batch), settings.max_candidates_per_batch))
    for update skip locked
  loop
    update public.event_editions edition
    set publication_status = 'published',
        discovery_status = case
          when coalesce(edition.end_date, edition.start_date) < current_date then 'detail_only'
          else 'active' end,
        discovery_archived_at = case
          when coalesce(edition.end_date, edition.start_date) < current_date then coalesce(edition.discovery_archived_at, now())
          else null end,
        archive_reason = case
          when coalesce(edition.end_date, edition.start_date) < current_date then 'event_completed'
          else null end,
        verification_status = 'verified', data_confidence = greatest(edition.data_confidence, candidate.confidence),
        needs_review = false, review_priority = 'low', last_verified_at = now(),
        published_at = coalesce(edition.published_at, now()), updated_at = now()
    where edition.id = candidate.draft_edition_id
      and edition.event_id = candidate.event_id
      and edition.start_date is not null
      and edition.source_url ~* '^https?://[^[:space:]]+$';

    if found then
      update public.edition_succession_candidates
      set candidate_status = 'approved', reviewed_at = now(), reviewed_by = (select auth.uid()),
          review_notes = 'Batch approval in exception inbox', updated_at = now()
      where id = candidate.id;
      update public.source_review_tasks
      set status = 'resolved', reviewed_at = now(), reviewed_by = (select auth.uid()),
          review_notes = 'Successor edition approved in batch', updated_at = now()
      where fingerprint = 'succession:' || candidate.id::text and status = 'open';
      approved_ids := array_append(approved_ids, candidate.id);
      approved_count := approved_count + 1;
    end if;
  end loop;

  return jsonb_build_object('approved_count', approved_count, 'candidate_ids', approved_ids);
end;
$$;

revoke all on function public.approve_edition_succession_candidates(uuid[], integer)
  from public, anon;
grant execute on function public.approve_edition_succession_candidates(uuid[], integer)
  to authenticated;

create or replace function public.approve_edition_result_candidates(
  p_result_ids uuid[] default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result_row public.edition_results;
  approved_ids uuid[] := '{}';
  approved_count integer := 0;
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  for result_row in
    select * from public.edition_results
    where publication_status = 'draft' and result_status = 'candidate'
      and (p_result_ids is null or id = any(p_result_ids))
    order by confidence desc, created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    update public.edition_results
    set publication_status = 'published', result_status = 'available',
        published_at = coalesce(published_at, now()), reviewed_at = now(),
        reviewed_by = (select auth.uid()), updated_at = now()
    where id = result_row.id;
    update public.event_editions set results_status = 'available' where id = result_row.edition_id;
    update public.source_review_tasks
    set status = 'resolved', reviewed_at = now(), reviewed_by = (select auth.uid()),
        review_notes = 'Result link approved in batch', updated_at = now()
    where fingerprint = 'result:' || result_row.id::text and status = 'open';
    approved_ids := array_append(approved_ids, result_row.id);
    approved_count := approved_count + 1;
  end loop;
  return jsonb_build_object('approved_count', approved_count, 'result_ids', approved_ids);
end;
$$;

revoke all on function public.approve_edition_result_candidates(uuid[], integer)
  from public, anon;
grant execute on function public.approve_edition_result_candidates(uuid[], integer)
  to authenticated;

create or replace function private.run_edition_lifecycle(p_reference_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  settings public.edition_lifecycle_settings;
  run_id bigint;
  archived_count integer := 0;
  activated_count integer := 0;
  scheduled_sources integer := 0;
begin
  select * into settings from public.edition_lifecycle_settings where singleton;
  insert into public.data_workflow_runs(job_type, run_status, trigger_source)
  values ('edition_lifecycle', 'running', 'cron') returning id into run_id;
  perform set_config('app.change_source', 'cron', true);
  perform set_config('app.change_reason', 'Automatic edition lifecycle transition', true);

  update public.event_editions edition
  set edition_status = case
        when edition.edition_status in ('scheduled', 'date_unconfirmed', 'postponed') then 'completed'
        else edition.edition_status end,
      discovery_status = 'detail_only',
      discovery_archived_at = coalesce(edition.discovery_archived_at, now()),
      archive_reason = coalesce(edition.archive_reason, 'event_completed'),
      results_status = case when edition.results_status = 'not_expected' then 'expected' else edition.results_status end,
      updated_at = now()
  where edition.publication_status = 'published'
    and edition.edition_status not in ('cancelled', 'inactive')
    and coalesce(edition.end_date, edition.start_date) < p_reference_date - settings.completion_grace_days
    and (edition.discovery_status <> 'detail_only' or edition.edition_status <> 'completed');
  get diagnostics archived_count = row_count;

  update public.event_editions edition
  set discovery_status = 'active', discovery_archived_at = null, archive_reason = null, updated_at = now()
  where edition.publication_status = 'published'
    and edition.edition_status not in ('cancelled', 'inactive', 'completed')
    and (edition.start_date is null or coalesce(edition.end_date, edition.start_date) >= p_reference_date)
    and edition.discovery_status <> 'active';
  get diagnostics activated_count = row_count;

  update public.event_sources source
  set next_fetch_at = least(coalesce(source.next_fetch_at, now() + make_interval(days => settings.successor_recheck_days)),
                            now() + make_interval(days => settings.successor_recheck_days)),
      updated_at = now()
  where source.is_active
    and exists (
      select 1 from public.event_editions past
      where past.event_id = source.event_id and past.discovery_status = 'detail_only'
        and past.edition_status = 'completed'
        and not exists (
          select 1 from public.event_editions future
          where future.event_id = past.event_id
            and future.edition_year > past.edition_year
            and future.publication_status in ('draft', 'published')
        )
    );
  get diagnostics scheduled_sources = row_count;

  update public.validation_issues
  set status = 'resolved', resolved_at = now(), updated_at = now()
  where status = 'open'
    and rule_code in ('future_date_unverified', 'edition_verification_stale', 'missing_start_time', 'missing_price');

  update public.data_workflow_runs
  set run_status = 'succeeded', finished_at = now(),
      processed_count = archived_count + activated_count,
      changed_count = archived_count + activated_count,
      metadata = jsonb_build_object(
        'archived_editions', archived_count,
        'activated_editions', activated_count,
        'successor_sources_scheduled', scheduled_sources,
        'reference_date', p_reference_date
      )
  where id = run_id;

  return jsonb_build_object(
    'run_id', run_id,
    'archived_editions', archived_count,
    'activated_editions', activated_count,
    'successor_sources_scheduled', scheduled_sources
  );
exception when others then
  update public.data_workflow_runs
  set run_status = 'failed', finished_at = now(), error_count = 1, error_message = left(sqlerrm, 2000)
  where id = run_id;
  raise;
end;
$$;

revoke all on function private.run_edition_lifecycle(date) from public, anon, authenticated;
grant execute on function private.run_edition_lifecycle(date) to service_role;

alter function public.run_event_validation(bigint, uuid)
  rename to run_event_validation_rules_v1;
revoke all on function public.run_event_validation_rules_v1(bigint, uuid)
  from public, anon, authenticated;

create function public.run_event_validation(
  p_event_id bigint default null,
  p_edition_id uuid default null
)
returns table(severity text, issue_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform 1
  from public.run_event_validation_rules_v1(p_event_id, p_edition_id);
  update public.validation_issues
  set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid()), updated_at = now()
  where status = 'open'
    and (p_event_id is null or event_id = p_event_id)
    and (p_edition_id is null or edition_id = p_edition_id)
    and rule_code in ('future_date_unverified', 'edition_verification_stale', 'missing_start_time', 'missing_price');

  return query
  select issue.severity, count(*)
  from public.validation_issues issue
  where issue.status = 'open'
    and (p_event_id is null or issue.event_id = p_event_id)
    and (p_edition_id is null or issue.edition_id = p_edition_id)
  group by issue.severity;
end;
$$;

revoke all on function public.run_event_validation(bigint, uuid) from public, anon;
grant execute on function public.run_event_validation(bigint, uuid) to authenticated, service_role;

create or replace view public.public_event_discovery
with (security_invoker = true)
as
select
  event.id,
  event.id as event_id,
  edition.id as edition_id,
  edition.legacy_event_key as event_key,
  event.canonical_name as event_name,
  event.sport,
  to_char(edition.start_date, 'DD.MM.YYYY') as date,
  event.city,
  event.country,
  event.address,
  event.latitude,
  event.longitude,
  coalesce(edition.legacy_distance, edition.race_formats -> 0 ->> 'label') as distance,
  event.description,
  event.image,
  coalesce(edition.registration_url, event.official_url, edition.source_url) as event_url,
  edition.source_url,
  edition.verification_status,
  edition.review_priority as priority,
  edition.last_verified_at as last_checked,
  edition.next_check_at as next_check,
  edition.edition_status as event_status,
  edition.edition_slug,
  event.slug,
  edition.edition_year,
  edition.discovery_status,
  edition.results_status
from public.events event
join lateral (
  select candidate.*
  from public.event_editions candidate
  where candidate.event_id = event.id
    and candidate.publication_status = 'published'
    and candidate.discovery_status = 'active'
    and candidate.edition_status not in ('cancelled', 'inactive', 'completed')
    and (candidate.start_date is null or coalesce(candidate.end_date, candidate.start_date) >= current_date)
  order by candidate.start_date asc nulls last, candidate.edition_year asc
  limit 1
) edition on true
where event.status = 'approved'
  and event.publication_status = 'published';

create or replace view public.public_event_archive
with (security_invoker = true)
as
select
  event.id,
  event.id as event_id,
  edition.id as edition_id,
  edition.legacy_event_key as event_key,
  event.canonical_name as event_name,
  event.sport,
  to_char(edition.start_date, 'DD.MM.YYYY') as date,
  event.city,
  event.country,
  event.address,
  event.latitude,
  event.longitude,
  coalesce(edition.legacy_distance, edition.race_formats -> 0 ->> 'label') as distance,
  event.description,
  event.image,
  coalesce(edition.registration_url, event.official_url, edition.source_url) as event_url,
  edition.source_url,
  edition.verification_status,
  edition.review_priority as priority,
  edition.last_verified_at as last_checked,
  edition.next_check_at as next_check,
  edition.edition_status as event_status,
  edition.edition_slug,
  edition.edition_year,
  edition.discovery_status,
  edition.results_status,
  event.slug,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'type', result.result_type,
      'title', result.title,
      'url', result.official_url,
      'published_at', result.published_at
    ) order by result.published_at desc nulls last, result.created_at desc)
    from public.edition_results result
    where result.edition_id = edition.id
      and result.publication_status = 'published'
      and result.result_status = 'available'
  ), '[]'::jsonb) as results
from public.events event
join public.event_editions edition on edition.event_id = event.id
where event.status = 'approved'
  and event.publication_status = 'published'
  and edition.publication_status = 'published';

create or replace view public.admin_exception_inbox
with (security_invoker = true)
as
select 'new_edition'::text as item_type, candidate.id::text as item_id,
  candidate.event_id, candidate.draft_edition_id as edition_id,
  case when candidate.candidate_status = 'conflict' then 'critical'
       when candidate.confidence >= 0.9 then 'high' else 'medium' end as priority,
  'Neue Austragung ' || candidate.candidate_year::text as title,
  case when candidate.draft_edition_id is null then 'Neue Austragung erkannt; Zuordnung pruefen.'
       else 'Nicht oeffentlicher Entwurf ist bereit fuer die Sammelfreigabe.' end as description,
  candidate.confidence, candidate.candidate_status as status,
  candidate.first_detected_at as created_at,
  case when candidate.candidate_status = 'draft_created' then 'approve_successor' else 'review' end as batch_action,
  jsonb_build_object('source_id', candidate.source_id, 'candidate_year', candidate.candidate_year,
    'start_date', candidate.candidate_start_date, 'source_url', candidate.source_url) as metadata
from public.edition_succession_candidates candidate
where candidate.candidate_status in ('detected', 'draft_created', 'conflict')
union all
select 'result'::text, result.id::text, result.event_id, result.edition_id,
  case when result.confidence >= 0.9 then 'high' else 'medium' end,
  coalesce(result.title, 'Ergebnisse erkannt'),
  'Offizieller Ergebnislink wartet auf Sammelfreigabe.', result.confidence,
  result.result_status, result.created_at, 'approve_result',
  jsonb_build_object('url', result.official_url, 'source_id', result.source_id)
from public.edition_results result
where result.publication_status = 'draft' and result.result_status = 'candidate'
union all
select 'source'::text, task.id::text, task.event_id, task.edition_id,
  task.priority, task.title, task.description, null::numeric, task.status,
  task.created_at, 'review', jsonb_build_object('source_id', task.source_id, 'task_type', task.task_type)
from public.source_review_tasks task
where task.status = 'open'
  and task.task_type not in ('new_edition_candidate', 'results_available')
  and task.priority in ('high', 'critical')
union all
select 'validation'::text, issue.id::text, issue.event_id, issue.edition_id,
  case issue.severity when 'critical' then 'critical' else 'high' end,
  issue.rule_code, issue.description, null::numeric, issue.status,
  issue.created_at, 'review', jsonb_build_object('severity', issue.severity)
from public.validation_issues issue
where issue.status = 'open' and issue.severity in ('error', 'critical')
union all
select 'workflow'::text, alert.id::text, alert.event_id, alert.edition_id,
  case alert.severity when 'critical' then 'critical' else 'high' end,
  alert.title, alert.description, null::numeric, alert.alert_status,
  alert.created_at, 'review', alert.metadata
from public.data_workflow_alerts alert
where alert.alert_status = 'open' and alert.severity in ('error', 'critical');

alter table public.edition_lifecycle_settings enable row level security;
alter table public.edition_results enable row level security;
alter table public.edition_succession_candidates enable row level security;

create policy edition_lifecycle_settings_admin_select
on public.edition_lifecycle_settings for select to authenticated
using ((select private.is_admin()));
create policy edition_lifecycle_settings_admin_update
on public.edition_lifecycle_settings for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy edition_results_public_select
on public.edition_results for select to anon
using (
  publication_status = 'published' and result_status = 'available'
  and exists (
    select 1 from public.event_editions edition join public.events event on event.id = edition.event_id
    where edition.id = edition_id and edition.publication_status = 'published'
      and event.status = 'approved' and event.publication_status = 'published'
  )
);
create policy edition_results_authenticated_select
on public.edition_results for select to authenticated
using (
  (
    publication_status = 'published' and result_status = 'available'
    and exists (
      select 1 from public.event_editions edition join public.events event on event.id = edition.event_id
      where edition.id = edition_id and edition.publication_status = 'published'
        and event.status = 'approved' and event.publication_status = 'published'
    )
  ) or (select private.is_admin())
);
create policy edition_results_admin_insert
on public.edition_results for insert to authenticated
with check ((select private.is_admin()));
create policy edition_results_admin_update
on public.edition_results for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy edition_results_admin_delete
on public.edition_results for delete to authenticated
using ((select private.is_admin()));

create policy edition_succession_admin_select
on public.edition_succession_candidates for select to authenticated
using ((select private.is_admin()));
create policy edition_succession_admin_update
on public.edition_succession_candidates for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.edition_lifecycle_settings from public, anon, authenticated;
grant select, update on public.edition_lifecycle_settings to authenticated;
grant select, insert, update, delete on public.edition_lifecycle_settings to service_role;

revoke all on public.edition_results from public, anon, authenticated;
grant select on public.edition_results to anon, authenticated;
grant insert, update, delete on public.edition_results to authenticated;
grant select, insert, update, delete on public.edition_results to service_role;

revoke all on public.edition_succession_candidates from public, anon, authenticated;
grant select, update on public.edition_succession_candidates to authenticated;
grant select, insert, update, delete on public.edition_succession_candidates to service_role;

revoke all on public.public_event_discovery from public, anon, authenticated;
grant select on public.public_event_discovery to anon, authenticated;
revoke all on public.public_event_archive from public, anon, authenticated;
grant select on public.public_event_archive to anon, authenticated;
revoke all on public.admin_exception_inbox from public, anon, authenticated;
grant select on public.admin_exception_inbox to authenticated;

do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sem-edition-lifecycle-daily') then
      perform cron.unschedule('sem-edition-lifecycle-daily');
    end if;
    perform cron.schedule(
      'sem-edition-lifecycle-daily',
      '17 2 * * *',
      'select private.run_edition_lifecycle(current_date);'
    );
  end if;
end
$schedule$;

comment on table public.edition_results is
  'Edition-scoped, review-gated official result links retained after discovery archival.';
comment on table public.edition_succession_candidates is
  'Source Monitor successor candidates; high-confidence detections create non-public edition drafts only.';
comment on view public.public_event_archive is
  'Every published historical and current edition with published result links.';
comment on view public.admin_exception_inbox is
  'Actionable admin-only exceptions; routine validation warnings are intentionally excluded.';

commit;
