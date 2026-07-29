-- Event operations stage 2: review-gated automation, crawler policies,
-- atomic source claims, workflow monitoring and database housekeeping.

begin;

create extension if not exists pg_cron;

alter table public.event_sources
  add column if not exists source_host text generated always as (
    lower(split_part(regexp_replace(source_url, '^https?://', '', 'i'), '/', 1))
  ) stored,
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by text,
  add column if not exists robots_checked_at timestamptz,
  add column if not exists robots_allowed boolean,
  add column if not exists last_duration_ms integer,
  add column if not exists last_changed_at timestamptz;

alter table public.event_sources
  drop constraint if exists event_sources_crawl_status_check;
alter table public.event_sources
  add constraint event_sources_crawl_status_check check (
    crawl_status in (
      'pending', 'fetching', 'success', 'not_modified', 'unreachable',
      'blocked', 'robots_denied', 'rate_limited', 'parse_error',
      'http_error', 'inactive'
    )
  );

create table if not exists public.crawler_domain_policies (
  id bigint generated always as identity primary key,
  source_host text not null unique,
  is_active boolean not null default true,
  respect_robots_txt boolean not null default true,
  min_interval_seconds integer not null default 30,
  max_requests_per_run integer not null default 1,
  request_timeout_ms integer not null default 12000,
  max_response_bytes integer not null default 1500000,
  max_consecutive_failures integer not null default 5,
  retry_backoff_minutes integer[] not null default array[15, 60, 360, 1440, 10080],
  next_allowed_at timestamptz,
  last_requested_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crawler_domain_policies_host_check check (
    source_host = lower(source_host)
    and source_host !~ '[/:[:space:]]'
    and length(source_host) between 1 and 253
  ),
  constraint crawler_domain_policies_interval_check check (min_interval_seconds between 5 and 86400),
  constraint crawler_domain_policies_run_limit_check check (max_requests_per_run between 1 and 20),
  constraint crawler_domain_policies_timeout_check check (request_timeout_ms between 1000 and 30000),
  constraint crawler_domain_policies_bytes_check check (max_response_bytes between 10000 and 5000000),
  constraint crawler_domain_policies_failures_check check (max_consecutive_failures between 1 and 20),
  constraint crawler_domain_policies_backoff_check check (cardinality(retry_backoff_minutes) between 1 and 10)
);

insert into public.crawler_domain_policies (source_host)
select distinct source_host
from public.event_sources
where nullif(source_host, '') is not null
on conflict (source_host) do nothing;

create table if not exists public.event_change_proposals (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  source_id uuid references public.event_sources(id) on delete set null,
  entity_type text not null,
  proposal_status text not null default 'pending',
  rule_code text not null,
  proposed_changes jsonb not null default '{}'::jsonb,
  observed_values jsonb not null default '{}'::jsonb,
  baseline_values jsonb not null default '{}'::jsonb,
  proposal_fingerprint text not null,
  confidence numeric(4,3) not null default 0.300,
  reason text,
  source_url text,
  content_hash text,
  detected_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_change_proposals_entity_check check (entity_type in ('event', 'edition')),
  constraint event_change_proposals_status_check check (
    proposal_status in ('pending', 'approved', 'rejected', 'superseded', 'failed')
  ),
  constraint event_change_proposals_confidence_check check (confidence between 0 and 1),
  constraint event_change_proposals_parent_check check (
    (entity_type = 'event' and edition_id is null)
    or (entity_type = 'edition' and edition_id is not null)
  ),
  constraint event_change_proposals_fingerprint_unique unique (proposal_fingerprint)
);

create table if not exists public.data_workflow_runs (
  id bigint generated always as identity primary key,
  job_type text not null,
  run_status text not null default 'running',
  trigger_source text not null default 'system',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  claimed_count integer not null default 0,
  processed_count integer not null default 0,
  changed_count integer not null default 0,
  issue_count integer not null default 0,
  error_count integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  triggered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint data_workflow_runs_job_type_check check (
    job_type in ('catalog_import', 'housekeeping', 'source_crawl', 'validation', 'country_boundary_import')
  ),
  constraint data_workflow_runs_status_check check (
    run_status in ('running', 'succeeded', 'partial', 'failed', 'cancelled')
  ),
  constraint data_workflow_runs_counts_check check (
    claimed_count >= 0 and processed_count >= 0 and changed_count >= 0
    and issue_count >= 0 and error_count >= 0
  )
);

create table if not exists public.data_workflow_alerts (
  id bigint generated always as identity primary key,
  alert_scope text not null,
  alert_code text not null,
  severity text not null,
  alert_status text not null default 'open',
  title text not null,
  description text,
  event_id bigint references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  source_id uuid references public.event_sources(id) on delete cascade,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  occurrence_count integer not null default 1,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_workflow_alerts_identity_unique unique (alert_scope, alert_code),
  constraint data_workflow_alerts_severity_check check (severity in ('info', 'warning', 'error', 'critical')),
  constraint data_workflow_alerts_status_check check (alert_status in ('open', 'resolved', 'ignored')),
  constraint data_workflow_alerts_occurrence_check check (occurrence_count > 0)
);

create index if not exists event_sources_due_claim_idx
  on public.event_sources (source_priority, next_fetch_at, id)
  where is_active and crawl_status <> 'fetching';
create index if not exists event_sources_host_idx
  on public.event_sources (source_host, last_fetched_at desc);
create index if not exists crawler_domain_policies_due_idx
  on public.crawler_domain_policies (next_allowed_at, source_host)
  where is_active;
create index if not exists event_change_proposals_review_queue_idx
  on public.event_change_proposals (proposal_status, detected_at desc)
  where proposal_status = 'pending';
create index if not exists event_change_proposals_event_idx
  on public.event_change_proposals (event_id, edition_id, detected_at desc);
create index if not exists event_change_proposals_source_idx
  on public.event_change_proposals (source_id)
  where source_id is not null;
create index if not exists event_change_proposals_reviewed_by_idx
  on public.event_change_proposals (reviewed_by)
  where reviewed_by is not null;
create index if not exists event_change_proposals_applied_by_idx
  on public.event_change_proposals (applied_by)
  where applied_by is not null;
create index if not exists data_workflow_runs_recent_idx
  on public.data_workflow_runs (job_type, started_at desc);
create index if not exists data_workflow_runs_triggered_by_idx
  on public.data_workflow_runs (triggered_by)
  where triggered_by is not null;
create index if not exists data_workflow_alerts_open_idx
  on public.data_workflow_alerts (severity, last_detected_at desc)
  where alert_status = 'open';
create index if not exists data_workflow_alerts_event_idx
  on public.data_workflow_alerts (event_id)
  where event_id is not null;
create index if not exists data_workflow_alerts_edition_idx
  on public.data_workflow_alerts (edition_id)
  where edition_id is not null;
create index if not exists data_workflow_alerts_source_idx
  on public.data_workflow_alerts (source_id)
  where source_id is not null;
create index if not exists data_workflow_alerts_resolved_by_idx
  on public.data_workflow_alerts (resolved_by)
  where resolved_by is not null;

drop trigger if exists crawler_domain_policies_set_updated_at on public.crawler_domain_policies;
create trigger crawler_domain_policies_set_updated_at
before update on public.crawler_domain_policies
for each row execute function private.set_updated_at();

drop trigger if exists event_change_proposals_set_updated_at on public.event_change_proposals;
create trigger event_change_proposals_set_updated_at
before update on public.event_change_proposals
for each row execute function private.set_updated_at();

drop trigger if exists data_workflow_alerts_set_updated_at on public.data_workflow_alerts;
create trigger data_workflow_alerts_set_updated_at
before update on public.data_workflow_alerts
for each row execute function private.set_updated_at();

create or replace function private.ensure_proposal_parent_consistency()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.edition_id is not null and not exists (
    select 1 from public.event_editions edition
    where edition.id = new.edition_id and edition.event_id = new.event_id
  ) then
    raise exception 'proposal edition must belong to proposal event' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists event_change_proposals_parent_check on public.event_change_proposals;
create trigger event_change_proposals_parent_check
before insert or update of event_id, edition_id on public.event_change_proposals
for each row execute function private.ensure_proposal_parent_consistency();

create or replace function public.claim_event_sources(
  p_limit integer default 10,
  p_worker_id text default null
)
returns setof public.event_sources
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  return query
  with ranked as (
    select source.id,
      row_number() over (
        partition by source.source_host
        order by source.source_priority asc, source.next_fetch_at asc nulls first, source.id
      ) as host_rank
    from public.event_sources source
    left join public.crawler_domain_policies policy
      on policy.source_host = source.source_host
    where source.is_active
      and source.crawl_status <> 'fetching'
      and coalesce(source.next_fetch_at, '-infinity'::timestamptz) <= now()
      and coalesce(policy.is_active, true)
      and coalesce(policy.next_allowed_at, '-infinity'::timestamptz) <= now()
  ), candidates as (
    select ranked.id
    from ranked
    where ranked.host_rank = 1
    order by ranked.id
    limit greatest(1, least(coalesce(p_limit, 10), 20))
    for update skip locked
  ), claimed as (
    update public.event_sources source
    set crawl_status = 'fetching',
        claimed_at = now(),
        claimed_by = coalesce(nullif(p_worker_id, ''), 'event-source-check'),
        updated_at = now()
    from candidates
    where source.id = candidates.id
    returning source.*
  ), paced as (
    update public.crawler_domain_policies policy
    set last_requested_at = now(),
        next_allowed_at = now() + make_interval(secs => policy.min_interval_seconds),
        updated_at = now()
    where policy.source_host in (select claimed.source_host from claimed)
    returning policy.source_host
  )
  select claimed.* from claimed;
end;
$$;

revoke all on function public.claim_event_sources(integer, text) from public, anon, authenticated;
grant execute on function public.claim_event_sources(integer, text) to service_role;

create or replace function public.apply_event_change_proposal(
  p_proposal_id uuid,
  p_review_notes text default null
)
returns public.event_change_proposals
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  proposal public.event_change_proposals;
  allowed_event_keys constant text[] := array[
    'canonical_name', 'sport', 'subcategory', 'country', 'region', 'city',
    'official_url', 'latitude', 'longitude', 'event_status',
    'verification_status', 'data_confidence', 'needs_review', 'review_priority',
    'last_verified_at', 'next_check_at'
  ];
  allowed_edition_keys constant text[] := array[
    'start_date', 'end_date', 'start_time', 'registration_url',
    'registration_status', 'edition_status', 'price_min', 'price_max',
    'currency', 'price_details', 'participant_limit', 'race_formats',
    'source_url', 'verification_status', 'data_confidence', 'needs_review',
    'review_priority', 'last_verified_at', 'next_check_at'
  ];
  proposed_keys text[];
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  select * into proposal
  from public.event_change_proposals
  where id = p_proposal_id and proposal_status = 'pending'
  for update;

  if proposal.id is null then
    raise exception 'pending proposal not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(key order by key), array[]::text[])
  into proposed_keys
  from jsonb_object_keys(proposal.proposed_changes) key;

  if cardinality(proposed_keys) = 0 then
    raise exception 'proposal has no applicable field changes' using errcode = '22023';
  end if;

  if proposal.entity_type = 'event' and not proposed_keys <@ allowed_event_keys then
    raise exception 'proposal contains unsupported event fields' using errcode = '22023';
  end if;
  if proposal.entity_type = 'edition' and not proposed_keys <@ allowed_edition_keys then
    raise exception 'proposal contains unsupported edition fields' using errcode = '22023';
  end if;

  perform set_config('app.change_source', 'crawler', true);
  perform set_config('app.change_reason', coalesce(p_review_notes, proposal.reason, 'Approved automation proposal'), true);
  perform set_config('app.source_url', coalesce(proposal.source_url, ''), true);

  if proposal.entity_type = 'event' then
    update public.events event
    set canonical_name = case when proposal.proposed_changes ? 'canonical_name' then proposal.proposed_changes->>'canonical_name' else event.canonical_name end,
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
        last_verified_at = case when proposal.proposed_changes ? 'last_verified_at' then (proposal.proposed_changes->>'last_verified_at')::timestamptz else event.last_verified_at end,
        next_check_at = case when proposal.proposed_changes ? 'next_check_at' then (proposal.proposed_changes->>'next_check_at')::timestamptz else event.next_check_at end,
        updated_at = now()
    where event.id = proposal.event_id;
  else
    update public.event_editions edition
    set start_date = case when proposal.proposed_changes ? 'start_date' then (proposal.proposed_changes->>'start_date')::date else edition.start_date end,
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
        last_verified_at = case when proposal.proposed_changes ? 'last_verified_at' then (proposal.proposed_changes->>'last_verified_at')::timestamptz else edition.last_verified_at end,
        next_check_at = case when proposal.proposed_changes ? 'next_check_at' then (proposal.proposed_changes->>'next_check_at')::timestamptz else edition.next_check_at end,
        updated_at = now()
    where edition.id = proposal.edition_id and edition.event_id = proposal.event_id;
  end if;

  update public.event_change_proposals
  set proposal_status = 'approved',
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      review_notes = p_review_notes,
      applied_at = now(),
      applied_by = (select auth.uid()),
      updated_at = now()
  where id = proposal.id
  returning * into proposal;

  return proposal;
end;
$$;

revoke all on function public.apply_event_change_proposal(uuid, text) from public, anon;
grant execute on function public.apply_event_change_proposal(uuid, text) to authenticated, service_role;

create or replace function private.run_event_operations_housekeeping()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  run_id bigint;
  changed_events integer := 0;
  changed_editions integer := 0;
  open_issues integer := 0;
begin
  insert into public.data_workflow_runs (job_type, run_status, trigger_source)
  values ('housekeeping', 'running', 'cron')
  returning id into run_id;

  begin
    insert into public.crawler_domain_policies (source_host)
    select distinct source_host
    from public.event_sources
    where nullif(source_host, '') is not null
    on conflict (source_host) do nothing;

    update public.event_sources
    set crawl_status = 'pending', claimed_at = null, claimed_by = null, updated_at = now()
    where crawl_status = 'fetching' and claimed_at < now() - interval '30 minutes';

    update public.events
    set verification_status = 'stale', needs_review = true, updated_at = now()
    where publication_status = 'published'
      and next_check_at is not null
      and next_check_at <= now()
      and verification_status = 'verified';
    get diagnostics changed_events = row_count;

    update public.event_editions
    set verification_status = 'stale', needs_review = true, updated_at = now()
    where publication_status = 'published'
      and next_check_at is not null
      and next_check_at <= now()
      and verification_status = 'verified';
    get diagnostics changed_editions = row_count;

    perform public.run_event_validation();
    select count(*) into open_issues from public.validation_issues where status = 'open';

    insert into public.data_workflow_alerts (
      alert_scope, alert_code, severity, title, description, source_id, last_detected_at, metadata
    )
    select
      'source:' || source.id,
      'source_repeated_failures',
      case when source.consecutive_failures >= 5 then 'critical' else 'error' end,
      'Source repeatedly unreachable',
      coalesce(source.last_error, 'Source has repeated fetch failures.'),
      source.id,
      now(),
      jsonb_build_object('failures', source.consecutive_failures, 'url', source.source_url)
    from public.event_sources source
    where source.is_active and source.consecutive_failures >= 3
    on conflict (alert_scope, alert_code) do update set
      severity = excluded.severity,
      alert_status = 'open',
      description = excluded.description,
      last_detected_at = now(),
      occurrence_count = public.data_workflow_alerts.occurrence_count + 1,
      resolved_at = null,
      resolved_by = null,
      metadata = excluded.metadata,
      updated_at = now();

    update public.data_workflow_alerts alert
    set alert_status = 'resolved', resolved_at = now(), updated_at = now()
    where alert.alert_code = 'source_repeated_failures'
      and alert.alert_status = 'open'
      and not exists (
        select 1 from public.event_sources source
        where 'source:' || source.id = alert.alert_scope
          and source.is_active and source.consecutive_failures >= 3
      );

    insert into public.data_workflow_alerts (
      alert_scope, alert_code, severity, title, description, source_id, last_detected_at, metadata
    )
    select
      'source:' || source.id,
      'source_fetch_overdue',
      'warning',
      'Source fetch overdue',
      'The source has been due for more than 48 hours.',
      source.id,
      now(),
      jsonb_build_object('next_fetch_at', source.next_fetch_at, 'url', source.source_url)
    from public.event_sources source
    where source.is_active and source.next_fetch_at < now() - interval '48 hours'
    on conflict (alert_scope, alert_code) do update set
      alert_status = 'open',
      last_detected_at = now(),
      occurrence_count = public.data_workflow_alerts.occurrence_count + 1,
      resolved_at = null,
      resolved_by = null,
      metadata = excluded.metadata,
      updated_at = now();

    update public.data_workflow_alerts alert
    set alert_status = 'resolved', resolved_at = now(), updated_at = now()
    where alert.alert_code = 'source_fetch_overdue'
      and alert.alert_status = 'open'
      and not exists (
        select 1 from public.event_sources source
        where 'source:' || source.id = alert.alert_scope
          and source.is_active and source.next_fetch_at < now() - interval '48 hours'
      );

    update public.data_workflow_runs
    set run_status = 'succeeded',
        finished_at = now(),
        changed_count = changed_events + changed_editions,
        issue_count = open_issues,
        metadata = jsonb_build_object(
          'stale_events', changed_events,
          'stale_editions', changed_editions
        )
    where id = run_id;
  exception when others then
    update public.data_workflow_runs
    set run_status = 'failed',
        finished_at = now(),
        error_count = 1,
        error_message = left(sqlerrm, 2000)
    where id = run_id;
  end;

  return run_id;
end;
$$;

revoke all on function private.run_event_operations_housekeeping() from public, anon, authenticated;
grant execute on function private.run_event_operations_housekeeping() to service_role;

create or replace view public.data_operations_health
with (security_invoker = true)
as
select
  now() as measured_at,
  (select count(*) from public.events) as total_events,
  (select count(*) from public.event_editions) as total_editions,
  (select count(*) from public.event_sources where is_active) as active_sources,
  (select count(*) from public.event_sources where is_active and next_fetch_at <= now()) as due_sources,
  (select count(*) from public.event_change_proposals where proposal_status = 'pending') as pending_proposals,
  (select count(*) from public.validation_issues where status = 'open') as open_validation_issues,
  (select count(*) from public.data_workflow_alerts where alert_status = 'open') as open_workflow_alerts,
  (select max(started_at) from public.data_workflow_runs where job_type = 'housekeeping' and run_status = 'succeeded') as last_successful_housekeeping,
  (select max(started_at) from public.data_workflow_runs where job_type = 'source_crawl' and run_status in ('succeeded', 'partial')) as last_successful_crawl;

alter table public.crawler_domain_policies enable row level security;
alter table public.event_change_proposals enable row level security;
alter table public.data_workflow_runs enable row level security;
alter table public.data_workflow_alerts enable row level security;

create policy crawler_domain_policies_admin_select
on public.crawler_domain_policies for select to authenticated
using ((select private.is_admin()));
create policy crawler_domain_policies_admin_insert
on public.crawler_domain_policies for insert to authenticated
with check ((select private.is_admin()));
create policy crawler_domain_policies_admin_update
on public.crawler_domain_policies for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy crawler_domain_policies_admin_delete
on public.crawler_domain_policies for delete to authenticated
using ((select private.is_admin()));

create policy event_change_proposals_admin_select
on public.event_change_proposals for select to authenticated
using ((select private.is_admin()));
create policy event_change_proposals_admin_update
on public.event_change_proposals for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy data_workflow_runs_admin_select
on public.data_workflow_runs for select to authenticated
using ((select private.is_admin()));

create policy data_workflow_alerts_admin_select
on public.data_workflow_alerts for select to authenticated
using ((select private.is_admin()));
create policy data_workflow_alerts_admin_update
on public.data_workflow_alerts for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.crawler_domain_policies from public, anon, authenticated;
grant select, insert, update, delete on public.crawler_domain_policies to authenticated;
grant select, insert, update, delete on public.crawler_domain_policies to service_role;

revoke all on public.event_change_proposals from public, anon, authenticated;
grant select, update on public.event_change_proposals to authenticated;
grant select, insert, update, delete on public.event_change_proposals to service_role;

revoke all on public.data_workflow_runs from public, anon, authenticated;
grant select on public.data_workflow_runs to authenticated;
grant select, insert, update on public.data_workflow_runs to service_role;

revoke all on public.data_workflow_alerts from public, anon, authenticated;
grant select, update on public.data_workflow_alerts to authenticated;
grant select, insert, update, delete on public.data_workflow_alerts to service_role;

revoke all on public.data_operations_health from public, anon, authenticated;
grant select on public.data_operations_health to authenticated, service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'sem-event-operations-hourly';

select cron.schedule(
  'sem-event-operations-hourly',
  '17 * * * *',
  $cron$select private.run_event_operations_housekeeping();$cron$
);

comment on table public.event_change_proposals is
  'Review queue for crawler/import suggestions. Automation never mutates event facts directly.';
comment on table public.crawler_domain_policies is
  'Per-domain robots, pacing, response-size, timeout and retry policy for source monitoring.';
comment on table public.data_workflow_runs is
  'Append-only operational run history for imports, housekeeping, crawls and validation.';
comment on table public.data_workflow_alerts is
  'Idempotent operational alert queue visible only to admins and server processes.';

commit;
