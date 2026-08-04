-- Source Monitor stage 2: durable crawl jobs, crawl history, centrally
-- configurable scheduling, review tasks, retries and admin-only operations.
-- Public event facts are never changed by crawler functions. Only technical
-- source state and explicit review metadata may be updated.

begin;

alter table public.event_sources
  add column if not exists last_final_url text,
  add column if not exists last_redirect_count smallint,
  add column if not exists last_content_type text,
  add column if not exists last_content_length bigint,
  add column if not exists last_etag text,
  add column if not exists last_modified text,
  add column if not exists last_error_type text,
  add column if not exists last_change_status text,
  add column if not exists recently_recovered_at timestamptz;

alter table public.event_sources
  drop constraint if exists event_sources_redirect_count_check;
alter table public.event_sources
  add constraint event_sources_redirect_count_check
  check (last_redirect_count is null or last_redirect_count between 0 and 10);

alter table public.event_sources
  drop constraint if exists event_sources_content_length_check;
alter table public.event_sources
  add constraint event_sources_content_length_check
  check (last_content_length is null or last_content_length >= 0);

alter table public.event_sources
  drop constraint if exists event_sources_change_status_check;
alter table public.event_sources
  add constraint event_sources_change_status_check check (
    last_change_status is null or last_change_status in (
      'unchanged', 'changed', 'first_seen', 'unreachable', 'content_invalid'
    )
  );

alter table public.crawler_domain_policies
  add column if not exists max_redirects integer not null default 5,
  add column if not exists robots_cache_hours integer not null default 24,
  add column if not exists allowed_content_types text[] not null default
    array['text/html', 'application/xhtml+xml', 'application/json'],
  add column if not exists allow_http boolean not null default true;

alter table public.crawler_domain_policies
  drop constraint if exists crawler_domain_policies_redirects_check;
alter table public.crawler_domain_policies
  add constraint crawler_domain_policies_redirects_check
  check (max_redirects between 0 and 10);

alter table public.crawler_domain_policies
  drop constraint if exists crawler_domain_policies_robots_cache_check;
alter table public.crawler_domain_policies
  add constraint crawler_domain_policies_robots_cache_check
  check (robots_cache_hours between 1 and 168);

create table if not exists public.source_monitor_settings (
  singleton boolean primary key default true check (singleton),
  scheduler_batch_size integer not null default 25 check (scheduler_batch_size between 1 and 200),
  worker_batch_size integer not null default 5 check (worker_batch_size between 1 and 20),
  global_max_processing integer not null default 5 check (global_max_processing between 1 and 50),
  lease_seconds integer not null default 90 check (lease_seconds between 30 and 900),
  max_attempts integer not null default 5 check (max_attempts between 1 and 12),
  future_over_12_months_min_days integer not null default 60,
  future_over_12_months_max_days integer not null default 90,
  future_6_to_12_months_days integer not null default 30,
  future_1_to_6_months_days integer not null default 14,
  future_under_30_days_min_days integer not null default 3,
  future_under_30_days_max_days integer not null default 7,
  post_event_first_check_days integer not null default 2,
  post_event_followup_days integer not null default 14,
  post_event_second_followup_days integer not null default 60,
  post_event_recurring_days integer not null default 30,
  raw_excerpt_retention_days integer not null default 14,
  validation_failure_threshold integer not null default 3 check (validation_failure_threshold between 1 and 12),
  dead_letter_recheck_days integer not null default 30,
  updated_at timestamptz not null default now(),
  constraint source_monitor_settings_ranges_check check (
    future_over_12_months_min_days between 1 and future_over_12_months_max_days
    and future_over_12_months_max_days <= 365
    and future_6_to_12_months_days between 1 and 180
    and future_1_to_6_months_days between 1 and 90
    and future_under_30_days_min_days between 1 and future_under_30_days_max_days
    and future_under_30_days_max_days <= 30
    and post_event_first_check_days between 1 and 14
    and post_event_followup_days between post_event_first_check_days and 45
    and post_event_second_followup_days between post_event_followup_days and 120
    and post_event_recurring_days between 7 and 180
    and raw_excerpt_retention_days between 1 and 90
    and dead_letter_recheck_days between 1 and 365
  )
);

insert into public.source_monitor_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.source_crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.event_sources(id) on delete cascade,
  event_id bigint not null references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  priority smallint not null default 100 check (priority between 1 and 999),
  scheduled_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 12),
  status text not null default 'queued',
  lease_expires_at timestamptz,
  lease_owner text,
  created_at timestamptz not null default now(),
  last_processed_at timestamptz,
  completed_at timestamptz,
  error_type text,
  error_message text,
  idempotency_key text not null unique,
  trigger_source text not null default 'scheduler',
  updated_at timestamptz not null default now(),
  constraint source_crawl_jobs_status_check check (
    status in ('queued', 'processing', 'completed', 'failed', 'retry_scheduled', 'dead_letter')
  ),
  constraint source_crawl_jobs_lease_check check (
    (status = 'processing' and lease_expires_at is not null and lease_owner is not null)
    or status <> 'processing'
  ),
  constraint source_crawl_jobs_parent_check check (edition_id is null or event_id is not null),
  constraint source_crawl_jobs_trigger_check check (
    trigger_source in ('scheduler', 'admin', 'retry', 'recovery', 'test')
  )
);

create unique index if not exists source_crawl_jobs_one_active_source_uidx
  on public.source_crawl_jobs(source_id)
  where status in ('queued', 'processing', 'retry_scheduled');
create index if not exists source_crawl_jobs_due_idx
  on public.source_crawl_jobs(status, scheduled_at, priority, created_at)
  where status in ('queued', 'retry_scheduled');
create index if not exists source_crawl_jobs_lease_idx
  on public.source_crawl_jobs(lease_expires_at)
  where status = 'processing';
create index if not exists source_crawl_jobs_event_idx
  on public.source_crawl_jobs(event_id, edition_id, created_at desc);

create table if not exists public.source_crawl_results (
  id bigint generated always as identity primary key,
  crawl_id uuid not null unique default gen_random_uuid(),
  job_id uuid not null references public.source_crawl_jobs(id) on delete cascade,
  source_id uuid not null references public.event_sources(id) on delete cascade,
  event_id bigint not null references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  fetched_at timestamptz not null default now(),
  http_status smallint check (http_status is null or http_status between 100 and 599),
  final_url text,
  redirect_count smallint not null default 0 check (redirect_count between 0 and 10),
  response_time_ms integer check (response_time_ms is null or response_time_ms >= 0),
  content_type text,
  content_length bigint check (content_length is null or content_length >= 0),
  content_hash text,
  previous_content_hash text,
  change_status text not null,
  change_detected boolean not null default false,
  etag text,
  last_modified text,
  error_type text,
  error_message text,
  worker_version text not null,
  processing_status text not null,
  normalized_excerpt text,
  raw_expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint source_crawl_results_attempt_unique unique(job_id, attempt_number),
  constraint source_crawl_results_change_check check (
    change_status in ('unchanged', 'changed', 'first_seen', 'unreachable', 'content_invalid')
  ),
  constraint source_crawl_results_processing_check check (
    processing_status in ('completed', 'failed', 'retry_scheduled', 'dead_letter')
  ),
  constraint source_crawl_results_excerpt_check check (
    normalized_excerpt is null or length(normalized_excerpt) <= 4000
  )
);

create index if not exists source_crawl_results_source_history_idx
  on public.source_crawl_results(source_id, fetched_at desc);
create index if not exists source_crawl_results_event_history_idx
  on public.source_crawl_results(event_id, edition_id, fetched_at desc);
create index if not exists source_crawl_results_daily_idx
  on public.source_crawl_results(fetched_at desc, change_status, processing_status);
create index if not exists source_crawl_results_raw_expiry_idx
  on public.source_crawl_results(raw_expires_at)
  where normalized_excerpt is not null;

create table if not exists public.source_review_tasks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.event_sources(id) on delete cascade,
  event_id bigint not null references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  crawl_result_id bigint references public.source_crawl_results(id) on delete set null,
  task_type text not null,
  status text not null default 'open',
  priority text not null default 'medium',
  title text not null,
  description text,
  fingerprint text not null unique,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  updated_at timestamptz not null default now(),
  constraint source_review_tasks_type_check check (
    task_type in ('content_changed', 'source_unreachable', 'content_invalid', 'dead_letter')
  ),
  constraint source_review_tasks_status_check check (status in ('open', 'resolved', 'ignored')),
  constraint source_review_tasks_priority_check check (priority in ('low', 'medium', 'high', 'critical'))
);

create index if not exists source_review_tasks_open_idx
  on public.source_review_tasks(priority, created_at desc)
  where status = 'open';
create index if not exists source_review_tasks_source_idx
  on public.source_review_tasks(source_id, created_at desc);

drop trigger if exists source_monitor_settings_set_updated_at on public.source_monitor_settings;
create trigger source_monitor_settings_set_updated_at
before update on public.source_monitor_settings
for each row execute function private.set_updated_at();

drop trigger if exists source_crawl_jobs_set_updated_at on public.source_crawl_jobs;
create trigger source_crawl_jobs_set_updated_at
before update on public.source_crawl_jobs
for each row execute function private.set_updated_at();

drop trigger if exists source_review_tasks_set_updated_at on public.source_review_tasks;
create trigger source_review_tasks_set_updated_at
before update on public.source_review_tasks
for each row execute function private.set_updated_at();

create or replace function private.source_monitor_next_at(
  p_source_id uuid,
  p_event_date date,
  p_reference timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  settings public.source_monitor_settings;
  days_until integer;
  interval_days integer;
  jitter integer;
begin
  select * into settings from public.source_monitor_settings where singleton;
  if p_event_date is null then
    return p_reference + make_interval(days => settings.future_6_to_12_months_days);
  end if;

  days_until := p_event_date - p_reference::date;
  if days_until > 365 then
    jitter := (hashtext(p_source_id::text)::bigint & 2147483647) %
      (settings.future_over_12_months_max_days - settings.future_over_12_months_min_days + 1);
    interval_days := settings.future_over_12_months_min_days + jitter;
  elsif days_until > 180 then
    interval_days := settings.future_6_to_12_months_days;
  elsif days_until > 30 then
    interval_days := settings.future_1_to_6_months_days;
  elsif days_until >= 0 then
    jitter := (hashtext(p_source_id::text)::bigint & 2147483647) %
      (settings.future_under_30_days_max_days - settings.future_under_30_days_min_days + 1);
    interval_days := settings.future_under_30_days_min_days + jitter;
  elsif days_until > -settings.post_event_first_check_days then
    interval_days := greatest(1, settings.post_event_first_check_days + days_until);
  elsif days_until > -settings.post_event_followup_days then
    interval_days := greatest(1, settings.post_event_followup_days + days_until);
  elsif days_until > -settings.post_event_second_followup_days then
    interval_days := greatest(1, settings.post_event_second_followup_days + days_until);
  else
    interval_days := settings.post_event_recurring_days;
  end if;

  return p_reference + make_interval(days => interval_days);
end;
$$;

create or replace function public.enqueue_source_crawl(
  p_source_id uuid,
  p_priority integer default 10,
  p_scheduled_at timestamptz default now(),
  p_trigger_source text default 'admin'
)
returns public.source_crawl_jobs
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  source public.event_sources;
  job public.source_crawl_jobs;
  configured_attempts integer;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
     and not (select private.is_admin()) then
    raise exception 'admin or service role required' using errcode = '42501';
  end if;
  if p_trigger_source not in ('scheduler', 'admin', 'retry', 'recovery', 'test') then
    raise exception 'invalid trigger source' using errcode = '22023';
  end if;

  select * into source from public.event_sources where id = p_source_id for update;
  if source.id is null then
    raise exception 'source not found' using errcode = 'P0002';
  end if;
  if not source.is_active then
    raise exception 'source is paused' using errcode = '55000';
  end if;

  select max_attempts into configured_attempts
  from public.source_monitor_settings where singleton;

  insert into public.source_crawl_jobs (
    source_id, event_id, edition_id, priority, scheduled_at, max_attempts,
    idempotency_key, trigger_source
  ) values (
    source.id, source.event_id, source.edition_id,
    greatest(1, least(coalesce(p_priority, 10), 999)), coalesce(p_scheduled_at, now()),
    configured_attempts,
    source.id::text || ':' || floor(extract(epoch from coalesce(p_scheduled_at, now())) / 60)::bigint::text,
    p_trigger_source
  )
  on conflict do nothing
  returning * into job;

  if job.id is null then
    select * into job
    from public.source_crawl_jobs
    where source_id = source.id
      and status in ('queued', 'processing', 'retry_scheduled')
    order by created_at desc limit 1;
  end if;
  return job;
end;
$$;

revoke all on function public.enqueue_source_crawl(uuid, integer, timestamptz, text) from public, anon;
grant execute on function public.enqueue_source_crawl(uuid, integer, timestamptz, text) to authenticated, service_role;

create or replace function public.schedule_due_source_crawls(p_limit integer default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  inserted_count integer;
  effective_limit integer;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select least(200, greatest(1, coalesce(p_limit, scheduler_batch_size)))
  into effective_limit from public.source_monitor_settings where singleton;

  with ranked as (
    select source.id, source.event_id, source.edition_id,
      greatest(1, least(999,
        source.source_priority
        - case event.review_priority when 'high' then 35 when 'medium' then 10 else 0 end
        - case when event.needs_review then 20 else 0 end
        - case when event.verification_status in ('unverified', 'stale', 'needs_review', 'source_unreachable') then 15 else 0 end
        - case when source.next_fetch_at is null then 25 else 0 end
        - case when source.last_changed_at >= now() - interval '30 days' then 15 else 0 end
        - case when source.recently_recovered_at >= now() - interval '30 days' then 15 else 0 end
        - case when source.consecutive_failures > 0 then least(source.consecutive_failures * 3, 15) else 0 end
        - case when latest.start_date < current_date then 20 else 0 end
        - case when latest.start_date is null then 15 else 0 end
        - case when exists (
            select 1 from public.user_feedback feedback
            where feedback.event_id = source.event_id::text
              and feedback.category = 'incorrect_event_data'
              and feedback.status in ('new', 'reviewed', 'planned')
          ) then 40 else 0 end
      ))::smallint as calculated_priority,
      row_number() over (
        order by source.next_fetch_at asc nulls first, source.source_priority, source.id
      ) as due_rank
    from public.event_sources source
    join public.events event on event.id = source.event_id
    left join lateral (
      select edition.start_date
      from public.event_editions edition
      where edition.event_id = source.event_id
        and (source.edition_id is null or edition.id = source.edition_id)
      order by edition.start_date desc nulls last
      limit 1
    ) latest on true
    left join public.crawler_domain_policies policy on policy.source_host = source.source_host
    where source.is_active
      and coalesce(source.next_fetch_at, '-infinity'::timestamptz) <= now()
      and coalesce(policy.is_active, true)
      and not exists (
        select 1 from public.source_crawl_jobs active_job
        where active_job.source_id = source.id
          and active_job.status in ('queued', 'processing', 'retry_scheduled')
      )
  )
  insert into public.source_crawl_jobs (
    source_id, event_id, edition_id, priority, scheduled_at, max_attempts,
    idempotency_key, trigger_source
  )
  select ranked.id, ranked.event_id, ranked.edition_id, ranked.calculated_priority,
    now(), settings.max_attempts,
    ranked.id::text || ':scheduled:' || floor(extract(epoch from now()) / 900)::bigint::text,
    'scheduler'
  from ranked cross join public.source_monitor_settings settings
  where settings.singleton and ranked.due_rank <= effective_limit
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.schedule_due_source_crawls(integer) from public, anon, authenticated;
grant execute on function public.schedule_due_source_crawls(integer) to service_role;

create or replace function public.claim_source_crawl_jobs(
  p_limit integer default null,
  p_worker_id text default null,
  p_source_id uuid default null
)
returns table (
  job_id uuid,
  source_id uuid,
  event_id bigint,
  edition_id uuid,
  source_url text,
  source_host text,
  attempt_number integer,
  max_attempts integer,
  previous_content_hash text,
  previous_etag text,
  previous_last_modified text,
  robots_checked_at timestamptz,
  robots_allowed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  settings public.source_monitor_settings;
  effective_limit integer;
  worker text;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into settings from public.source_monitor_settings where singleton;
  worker := coalesce(nullif(p_worker_id, ''), 'event-source-check');

  update public.source_crawl_jobs stale
  set status = case when stale.attempt_count >= stale.max_attempts then 'dead_letter' else 'retry_scheduled' end,
      scheduled_at = case when stale.attempt_count >= stale.max_attempts then stale.scheduled_at else now() end,
      lease_expires_at = null,
      lease_owner = null,
      error_type = 'lease_expired',
      error_message = 'Worker lease expired before completion',
      last_processed_at = now()
  where stale.status = 'processing' and stale.lease_expires_at <= now();

  effective_limit := least(
    greatest(0, settings.global_max_processing - (
      select count(*) from public.source_crawl_jobs where status = 'processing'
    )),
    greatest(1, least(coalesce(p_limit, settings.worker_batch_size), 20))
  );
  if effective_limit <= 0 then return; end if;

  return query
  with ranked as (
    select job.id,
      row_number() over (
        partition by source.source_host
        order by job.priority, job.scheduled_at, job.created_at
      ) as host_rank,
      coalesce(policy.max_requests_per_run, 1) as host_limit
    from public.source_crawl_jobs job
    join public.event_sources source on source.id = job.source_id
    left join public.crawler_domain_policies policy on policy.source_host = source.source_host
    where job.status in ('queued', 'retry_scheduled')
      and job.scheduled_at <= now()
      and source.is_active
      and (p_source_id is null or source.id = p_source_id)
      and coalesce(policy.is_active, true)
      and coalesce(policy.next_allowed_at, '-infinity'::timestamptz) <= now()
      and not exists (
        select 1
        from public.source_crawl_jobs running
        join public.event_sources running_source on running_source.id = running.source_id
        where running.status = 'processing'
          and running_source.source_host = source.source_host
      )
  ), candidates as (
    select job.id
    from public.source_crawl_jobs job
    join ranked on ranked.id = job.id
    where ranked.host_rank <= ranked.host_limit
    order by job.priority, job.scheduled_at, job.created_at
    for update of job skip locked
    limit effective_limit
  ), claimed as (
    update public.source_crawl_jobs job
    set status = 'processing',
        attempt_count = job.attempt_count + 1,
        lease_expires_at = now() + make_interval(secs => settings.lease_seconds),
        lease_owner = worker,
        last_processed_at = now(),
        error_type = null,
        error_message = null
    from candidates
    where job.id = candidates.id
    returning job.*
  ), paced as (
    update public.crawler_domain_policies policy
    set last_requested_at = now(),
        next_allowed_at = now() + make_interval(secs => policy.min_interval_seconds),
        updated_at = now()
    where policy.source_host in (
      select distinct source.source_host
      from claimed join public.event_sources source on source.id = claimed.source_id
    )
    returning policy.source_host
  )
  select claimed.id, source.id, claimed.event_id, claimed.edition_id,
    source.source_url, source.source_host, claimed.attempt_count, claimed.max_attempts,
    source.last_content_hash, source.last_etag, source.last_modified,
    source.robots_checked_at, source.robots_allowed
  from claimed join public.event_sources source on source.id = claimed.source_id;
end;
$$;

revoke all on function public.claim_source_crawl_jobs(integer, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_source_crawl_jobs(integer, text, uuid) to service_role;

create or replace function public.record_source_crawl_result(
  p_job_id uuid,
  p_worker_id text,
  p_outcome text,
  p_retriable boolean,
  p_http_status integer,
  p_final_url text,
  p_redirect_count integer,
  p_response_time_ms integer,
  p_content_type text,
  p_content_length bigint,
  p_content_hash text,
  p_change_status text,
  p_etag text,
  p_last_modified text,
  p_error_type text,
  p_error_message text,
  p_retry_after_seconds integer,
  p_worker_version text,
  p_normalized_excerpt text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  job public.source_crawl_jobs;
  source public.event_sources;
  policy public.crawler_domain_policies;
  settings public.source_monitor_settings;
  result_row public.source_crawl_results;
  next_status text;
  effective_change text;
  next_attempt_at timestamptz;
  event_date date;
  backoff_minutes integer;
  task_type text;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_outcome not in ('success', 'error') then
    raise exception 'invalid crawl outcome' using errcode = '22023';
  end if;

  select * into job from public.source_crawl_jobs
  where id = p_job_id for update;
  if job.id is null then raise exception 'crawl job not found' using errcode = 'P0002'; end if;

  select * into source from public.event_sources where id = job.source_id for update;
  select * into settings from public.source_monitor_settings where singleton;
  select * into policy from public.crawler_domain_policies where source_host = source.source_host;

  select edition.start_date into event_date
  from public.event_editions edition
  where edition.event_id = job.event_id
    and (job.edition_id is null or edition.id = job.edition_id)
  order by edition.start_date desc nulls last limit 1;

  if job.status <> 'processing' then
    select * into result_row from public.source_crawl_results
    where job_id = job.id and attempt_number = job.attempt_count;
    if result_row.id is not null then
      return jsonb_build_object('job_id', job.id, 'status', job.status, 'idempotent', true);
    end if;
    raise exception 'crawl job is not processing' using errcode = '55000';
  end if;
  if job.lease_owner is distinct from p_worker_id then
    raise exception 'crawl job lease owner mismatch' using errcode = '42501';
  end if;

  effective_change := case
    when p_outcome = 'error' and p_change_status = 'content_invalid' then 'content_invalid'
    when p_outcome = 'error' then 'unreachable'
    when p_change_status in ('unchanged', 'changed', 'first_seen') then p_change_status
    when source.last_content_hash is null then 'first_seen'
    when source.last_content_hash = p_content_hash then 'unchanged'
    else 'changed'
  end;

  if p_outcome = 'success' then
    next_status := 'completed';
  elsif not coalesce(p_retriable, false) or job.attempt_count >= job.max_attempts then
    next_status := 'dead_letter';
  else
    next_status := 'retry_scheduled';
  end if;

  insert into public.source_crawl_results (
    job_id, source_id, event_id, edition_id, attempt_number, http_status,
    final_url, redirect_count, response_time_ms, content_type, content_length,
    content_hash, previous_content_hash, change_status, change_detected,
    etag, last_modified, error_type, error_message, worker_version,
    processing_status, normalized_excerpt, raw_expires_at
  ) values (
    job.id, source.id, job.event_id, job.edition_id, job.attempt_count,
    p_http_status, p_final_url, greatest(0, least(coalesce(p_redirect_count, 0), 10)),
    p_response_time_ms, p_content_type, p_content_length, p_content_hash,
    source.last_content_hash, effective_change, effective_change = 'changed',
    p_etag, p_last_modified, p_error_type, left(p_error_message, 2000),
    coalesce(nullif(p_worker_version, ''), 'unknown'), next_status,
    case when effective_change in ('changed', 'content_invalid') or p_outcome = 'error'
      then left(p_normalized_excerpt, 4000) else null end,
    case when effective_change in ('changed', 'content_invalid') or p_outcome = 'error'
      then now() + make_interval(days => settings.raw_excerpt_retention_days) else null end
  )
  on conflict (job_id, attempt_number) do update
    set worker_version = excluded.worker_version
  returning * into result_row;

  perform set_config('app.change_source', 'crawler', true);
  perform set_config('app.change_reason',
    case when effective_change = 'changed' then 'Source Monitor detected a content hash change'
         when p_outcome = 'error' then 'Source Monitor recorded a technical fetch error'
         else 'Source Monitor updated technical source metadata' end, true);
  perform set_config('app.source_url', coalesce(source.source_url, ''), true);

  if p_outcome = 'success' then
    update public.event_sources
    set crawl_status = case when effective_change = 'unchanged' then 'not_modified' else 'success' end,
        last_fetched_at = now(),
        next_fetch_at = private.source_monitor_next_at(source.id, event_date, now()),
        last_http_status = p_http_status,
        last_final_url = p_final_url,
        last_redirect_count = p_redirect_count,
        last_duration_ms = p_response_time_ms,
        last_content_type = p_content_type,
        last_content_length = p_content_length,
        last_content_hash = coalesce(p_content_hash, source.last_content_hash),
        last_etag = p_etag,
        last_modified = p_last_modified,
        last_change_status = effective_change,
        last_changed_at = case when effective_change = 'changed' then now() else source.last_changed_at end,
        recently_recovered_at = case when source.consecutive_failures > 0 then now() else source.recently_recovered_at end,
        consecutive_failures = 0,
        last_error_type = null,
        last_error = null,
        claimed_at = null,
        claimed_by = null
    where id = source.id;

    update public.source_crawl_jobs
    set status = 'completed', completed_at = now(), lease_expires_at = null,
        lease_owner = null, error_type = null, error_message = null
    where id = job.id;

    if effective_change = 'changed' then
      insert into public.source_review_tasks (
        source_id, event_id, edition_id, crawl_result_id, task_type, priority,
        title, description, fingerprint
      ) values (
        source.id, job.event_id, job.edition_id, result_row.id, 'content_changed', 'high',
        'Quellseite wurde geändert',
        'Der normalisierte Content-Hash der offiziellen Quelle hat sich geändert. Eventdaten wurden nicht automatisch übernommen.',
        source.id::text || ':content:' || p_content_hash
      ) on conflict (fingerprint) do nothing;

      insert into public.event_change_proposals (
        event_id, edition_id, source_id, entity_type, rule_code, proposed_changes,
        observed_values, baseline_values, proposal_fingerprint, confidence,
        reason, source_url, content_hash
      ) values (
        job.event_id, job.edition_id, source.id,
        case when job.edition_id is null then 'event' else 'edition' end,
        'source_content_changed', '{}'::jsonb,
        jsonb_build_object('content_hash', p_content_hash, 'http_status', p_http_status, 'final_url', p_final_url),
        jsonb_build_object('previous_content_hash', source.last_content_hash),
        source.id::text || ':' || p_content_hash || ':source_content_changed',
        0.200, 'Official source content changed; manual review required.', source.source_url, p_content_hash
      ) on conflict (proposal_fingerprint) do nothing;

      insert into public.event_audit_log (
        entity_type, entity_id, field_name, old_value, new_value, change_source,
        changed_by_process, reason, source_url
      ) values (
        'source', source.id::text, 'content_hash', to_jsonb(source.last_content_hash),
        to_jsonb(p_content_hash), 'crawler', 'event-source-check',
        'Normalized source content changed; public event facts were not modified.', source.source_url
      );

      insert into public.data_workflow_alerts (
        alert_scope, alert_code, severity, title, description,
        event_id, edition_id, source_id, last_detected_at, metadata
      ) values (
        'source:' || source.id::text, 'source_content_changed', 'info',
        'Source content changed',
        'The normalized source hash changed. Manual review is required; no event facts were imported.',
        job.event_id, job.edition_id, source.id, now(),
        jsonb_build_object('job_id', job.id, 'crawl_result_id', result_row.id, 'content_hash', p_content_hash)
      ) on conflict (alert_scope, alert_code) do update
        set last_detected_at = now(), occurrence_count = public.data_workflow_alerts.occurrence_count + 1,
            alert_status = 'open', resolved_at = null, resolved_by = null,
            metadata = excluded.metadata, updated_at = now();

      update public.events
      set needs_review = true, review_priority = 'high', updated_at = now()
      where id = job.event_id;
      if job.edition_id is not null then
        update public.event_editions
        set needs_review = true, review_priority = 'high', updated_at = now()
        where id = job.edition_id;
      end if;
    end if;
  else
    if next_status = 'retry_scheduled' then
      if coalesce(p_retry_after_seconds, 0) > 0 then
        next_attempt_at := now() + make_interval(secs => least(p_retry_after_seconds, 604800));
      else
        backoff_minutes := coalesce(
          policy.retry_backoff_minutes[least(job.attempt_count, cardinality(policy.retry_backoff_minutes))],
          (array[15, 60, 360, 1440, 10080])[least(job.attempt_count, 5)]
        );
        next_attempt_at := now() + make_interval(mins => backoff_minutes);
      end if;
    else
      next_attempt_at := now() + make_interval(days => settings.dead_letter_recheck_days);
    end if;

    update public.source_crawl_jobs
    set status = next_status, scheduled_at = next_attempt_at,
        completed_at = case when next_status = 'dead_letter' then now() else null end,
        lease_expires_at = null, lease_owner = null,
        error_type = left(p_error_type, 100), error_message = left(p_error_message, 2000)
    where id = job.id;

    update public.event_sources
    set crawl_status = case
          when p_http_status = 429 then 'rate_limited'
          when p_error_type = 'robots_denied' then 'robots_denied'
          when effective_change = 'content_invalid' then 'parse_error'
          when p_http_status between 400 and 599 then 'http_error'
          else 'unreachable' end,
        last_fetched_at = now(), next_fetch_at = next_attempt_at,
        last_http_status = p_http_status, last_final_url = p_final_url,
        last_redirect_count = p_redirect_count, last_duration_ms = p_response_time_ms,
        last_content_type = p_content_type, last_content_length = p_content_length,
        last_change_status = effective_change,
        consecutive_failures = source.consecutive_failures + 1,
        last_error_type = left(p_error_type, 100), last_error = left(p_error_message, 2000),
        claimed_at = null, claimed_by = null
    where id = source.id;

    if source.consecutive_failures + 1 >= settings.validation_failure_threshold then
      insert into public.validation_issues (
        event_id, edition_id, severity, rule_code, description, status
      ) values (
        job.event_id, job.edition_id,
        case when next_status = 'dead_letter' then 'error' else 'warning' end,
        'source_unreachable_' || replace(source.id::text, '-', '_'),
        'Source Monitor kann die Quelle nicht zuverlässig abrufen: ' || coalesce(p_error_type, 'unknown_error') || '.',
        'open'
      ) on conflict (entity_scope, rule_code) do update
        set severity = excluded.severity, description = excluded.description,
            status = 'open', resolved_at = null, resolved_by = null, updated_at = now();

      task_type := case
        when effective_change = 'content_invalid' then 'content_invalid'
        when next_status = 'dead_letter' then 'dead_letter'
        else 'source_unreachable' end;
      insert into public.source_review_tasks (
        source_id, event_id, edition_id, crawl_result_id, task_type, priority,
        title, description, fingerprint
      ) values (
        source.id, job.event_id, job.edition_id, result_row.id, task_type,
        case when next_status = 'dead_letter' then 'critical' else 'high' end,
        case when next_status = 'dead_letter' then 'Crawl-Auftrag dauerhaft fehlgeschlagen' else 'Quelle nicht erreichbar' end,
        left(coalesce(p_error_message, p_error_type, 'Unbekannter technischer Fehler'), 2000),
        source.id::text || ':' || task_type || ':open'
      ) on conflict (fingerprint) do update
        set crawl_result_id = excluded.crawl_result_id, priority = excluded.priority,
            description = excluded.description, status = 'open', reviewed_at = null,
            reviewed_by = null, updated_at = now();

      update public.events
      set needs_review = true, review_priority = 'high',
          verification_status = case when verification_status = 'verified' then 'source_unreachable' else verification_status end,
          updated_at = now()
      where id = job.event_id;
    end if;

    insert into public.data_workflow_alerts (
      alert_scope, alert_code, severity, title, description,
      event_id, edition_id, source_id, last_detected_at, metadata
    ) values (
      'source:' || source.id::text, coalesce(p_error_type, 'crawl_error'),
      case when next_status = 'dead_letter' then 'error' else 'warning' end,
      'Source Monitor Fehler', left(coalesce(p_error_message, p_error_type, 'Unbekannter Fehler'), 2000),
      job.event_id, job.edition_id, source.id, now(),
      jsonb_build_object('job_id', job.id, 'http_status', p_http_status, 'next_status', next_status)
    ) on conflict (alert_scope, alert_code) do update
      set severity = excluded.severity, description = excluded.description,
          last_detected_at = now(), occurrence_count = public.data_workflow_alerts.occurrence_count + 1,
          alert_status = 'open', resolved_at = null, resolved_by = null,
          metadata = excluded.metadata, updated_at = now();
  end if;

  return jsonb_build_object(
    'job_id', job.id, 'source_id', source.id, 'status', next_status,
    'change_status', effective_change, 'result_id', result_row.id,
    'next_at', case when p_outcome = 'success'
      then (select next_fetch_at from public.event_sources where id = source.id)
      else next_attempt_at end,
    'idempotent', false
  );
end;
$$;

revoke all on function public.record_source_crawl_result(
  uuid, text, text, boolean, integer, text, integer, integer, text, bigint,
  text, text, text, text, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.record_source_crawl_result(
  uuid, text, text, boolean, integer, text, integer, integer, text, bigint,
  text, text, text, text, text, text, integer, text, text
) to service_role;

create or replace function public.retry_source_crawl_job(p_job_id uuid)
returns public.source_crawl_jobs
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare job public.source_crawl_jobs;
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  select * into job from public.source_crawl_jobs where id = p_job_id for update;
  if job.id is null then raise exception 'crawl job not found' using errcode = 'P0002'; end if;
  if job.status not in ('failed', 'dead_letter', 'completed') then
    raise exception 'crawl job cannot be retried from status %', job.status using errcode = '55000';
  end if;
  if exists (
    select 1 from public.source_crawl_jobs active
    where active.source_id = job.source_id and active.id <> job.id
      and active.status in ('queued', 'processing', 'retry_scheduled')
  ) then raise exception 'source already has an active crawl job' using errcode = '55000'; end if;
  update public.source_crawl_jobs
  set status = 'queued', scheduled_at = now(), attempt_count = 0,
      completed_at = null, lease_expires_at = null, lease_owner = null,
      error_type = null, error_message = null, trigger_source = 'retry'
  where id = job.id returning * into job;
  return job;
end;
$$;

revoke all on function public.retry_source_crawl_job(uuid) from public, anon;
grant execute on function public.retry_source_crawl_job(uuid) to authenticated;

create or replace function public.reset_source_crawl_failures(p_source_id uuid)
returns public.event_sources
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare source public.event_sources;
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  update public.event_sources
  set consecutive_failures = 0, last_error = null, last_error_type = null,
      crawl_status = case when is_active then 'pending' else 'inactive' end,
      next_fetch_at = case when is_active then now() else next_fetch_at end
  where id = p_source_id returning * into source;
  if source.id is null then raise exception 'source not found' using errcode = 'P0002'; end if;
  update public.validation_issues
  set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid()), updated_at = now()
  where event_id = source.event_id
    and rule_code = 'source_unreachable_' || replace(source.id::text, '-', '_')
    and status = 'open';
  return source;
end;
$$;

revoke all on function public.reset_source_crawl_failures(uuid) from public, anon;
grant execute on function public.reset_source_crawl_failures(uuid) to authenticated;

create or replace function public.resolve_source_review_task(
  p_task_id uuid,
  p_status text default 'resolved',
  p_notes text default null
)
returns public.source_review_tasks
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare task public.source_review_tasks;
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if p_status not in ('resolved', 'ignored') then
    raise exception 'invalid review status' using errcode = '22023';
  end if;
  update public.source_review_tasks
  set status = p_status, reviewed_at = now(), reviewed_by = (select auth.uid()), review_notes = p_notes
  where id = p_task_id and status = 'open' returning * into task;
  if task.id is null then raise exception 'open review task not found' using errcode = 'P0002'; end if;
  return task;
end;
$$;

revoke all on function public.resolve_source_review_task(uuid, text, text) from public, anon;
grant execute on function public.resolve_source_review_task(uuid, text, text) to authenticated;

create or replace function private.source_monitor_housekeeping()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare affected integer;
begin
  update public.source_crawl_results
  set normalized_excerpt = null, raw_expires_at = null
  where normalized_excerpt is not null and raw_expires_at <= now();
  get diagnostics affected = row_count;


  return affected;
end;
$$;

revoke all on function private.source_monitor_housekeeping() from public, anon, authenticated;

alter table public.source_monitor_settings enable row level security;
alter table public.source_crawl_jobs enable row level security;
alter table public.source_crawl_results enable row level security;
alter table public.source_review_tasks enable row level security;

create policy source_monitor_settings_admin_select
on public.source_monitor_settings for select to authenticated
using ((select private.is_admin()));
create policy source_monitor_settings_admin_update
on public.source_monitor_settings for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy source_crawl_jobs_admin_select
on public.source_crawl_jobs for select to authenticated
using ((select private.is_admin()));

create policy source_crawl_results_admin_select
on public.source_crawl_results for select to authenticated
using ((select private.is_admin()));

create policy source_review_tasks_admin_select
on public.source_review_tasks for select to authenticated
using ((select private.is_admin()));

revoke all on public.source_monitor_settings from public, anon, authenticated;
revoke all on public.source_crawl_jobs from public, anon, authenticated;
revoke all on public.source_crawl_results from public, anon, authenticated;
revoke all on public.source_review_tasks from public, anon, authenticated;

grant select, update on public.source_monitor_settings to authenticated;
grant select on public.source_crawl_jobs to authenticated;
grant select on public.source_crawl_results to authenticated;
grant select on public.source_review_tasks to authenticated;

grant select, insert, update, delete on public.source_monitor_settings to service_role;
grant select, insert, update, delete on public.source_crawl_jobs to service_role;
grant select, insert, update, delete on public.source_crawl_results to service_role;
grant select, insert, update, delete on public.source_review_tasks to service_role;
grant usage, select on sequence public.source_crawl_results_id_seq to service_role;

update public.event_sources source
set next_fetch_at = coalesce(source.next_fetch_at, now()),
    last_change_status = case
      when source.last_change_status is not null then source.last_change_status
      when source.last_content_hash is not null then 'unchanged'
      else null end
where source.is_active;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sem-source-monitor-housekeeping') then
      perform cron.unschedule('sem-source-monitor-housekeeping');
    end if;
    perform cron.schedule(
      'sem-source-monitor-housekeeping',
      '17 3 * * *',
      'select private.source_monitor_housekeeping()'
    );
  end if;
end
$cron$;

comment on table public.source_crawl_jobs is
  'Durable one-source-per-job queue with leases, retries and dead-letter state.';
comment on table public.source_crawl_results is
  'Permanent crawl metadata history. Short normalized excerpts expire automatically; full HTML is never retained.';
comment on table public.source_review_tasks is
  'Admin review queue created by source changes or repeated technical failures.';
comment on table public.source_monitor_settings is
  'Singleton configuration for scheduler batches, leases, retries, retention and event-relative crawl intervals.';

commit;
