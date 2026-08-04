-- Source Monitor production hardening: semantic change signals, DNS-pinned
-- transport evidence, adaptive domain pacing and robots crawl-delay.
begin;

alter table public.event_sources
  add column if not exists last_semantic_hash text,
  add column if not exists last_normalization_version text,
  add column if not exists last_pinned_ip inet;

alter table public.source_crawl_results
  add column if not exists semantic_hash text,
  add column if not exists previous_semantic_hash text,
  add column if not exists normalization_version text,
  add column if not exists change_confidence text,
  add column if not exists change_reasons text[] not null default '{}',
  add column if not exists pinned_ip inet,
  add column if not exists observation_recorded_at timestamptz;

alter table public.source_crawl_results
  drop constraint if exists source_crawl_results_confidence_check;
alter table public.source_crawl_results
  add constraint source_crawl_results_confidence_check check (
    change_confidence is null or change_confidence in (
      'exact', 'baseline', 'low', 'medium', 'high', 'technical'
    )
  );

alter table public.crawler_domain_policies
  add column if not exists robots_crawl_delay_seconds numeric(10,3) not null default 0,
  add column if not exists robots_checked_at timestamptz,
  add column if not exists robots_status text,
  add column if not exists adaptive_interval_seconds integer not null default 0,
  add column if not exists successful_requests_since_rate_limit integer not null default 0,
  add column if not exists rate_limit_events integer not null default 0,
  add column if not exists last_rate_limited_at timestamptz,
  add column if not exists last_user_agent text;

alter table public.crawler_domain_policies
  alter column allow_http set default false;
update public.crawler_domain_policies policy
set allow_http = false
where not exists (
  select 1 from public.event_sources source
  where source.source_host = policy.source_host and source.source_url ~* '^http://'
);
alter table public.crawler_domain_policies
  drop constraint if exists crawler_domain_policies_robots_delay_check;
alter table public.crawler_domain_policies
  add constraint crawler_domain_policies_robots_delay_check
  check (robots_crawl_delay_seconds between 0 and 86400);
alter table public.crawler_domain_policies
  drop constraint if exists crawler_domain_policies_robots_status_check;
alter table public.crawler_domain_policies
  add constraint crawler_domain_policies_robots_status_check
  check (robots_status is null or robots_status in ('allowed', 'denied', 'missing', 'unavailable'));
alter table public.crawler_domain_policies
  drop constraint if exists crawler_domain_policies_adaptive_interval_check;
alter table public.crawler_domain_policies
  add constraint crawler_domain_policies_adaptive_interval_check
  check (adaptive_interval_seconds between 0 and 86400);
alter table public.crawler_domain_policies
  drop constraint if exists crawler_domain_policies_rate_counters_check;
alter table public.crawler_domain_policies
  add constraint crawler_domain_policies_rate_counters_check
  check (
    successful_requests_since_rate_limit between 0 and 1000000
    and rate_limit_events between 0 and 1000000
  );

create table if not exists public.source_domain_daily_metrics (
  id bigint generated always as identity unique,
  source_host text not null,
  metric_date date not null default current_date,
  request_count integer not null default 0,
  success_count integer not null default 0,
  changed_signal_count integer not null default 0,
  rate_limited_count integer not null default 0,
  server_error_count integer not null default 0,
  robots_denied_count integer not null default 0,
  response_time_total_ms bigint not null default 0,
  max_response_time_ms integer not null default 0,
  bytes_total bigint not null default 0,
  last_observed_at timestamptz not null default now(),
  primary key (source_host, metric_date),
  constraint source_domain_daily_metrics_nonnegative_check check (
    request_count >= 0 and success_count >= 0 and changed_signal_count >= 0
    and rate_limited_count >= 0 and server_error_count >= 0
    and robots_denied_count >= 0 and response_time_total_ms >= 0
    and max_response_time_ms >= 0 and bytes_total >= 0
  )
);

create index if not exists source_domain_daily_metrics_recent_idx
  on public.source_domain_daily_metrics(metric_date desc, request_count desc);

create or replace function private.ensure_source_domain_policy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if nullif(new.source_host, '') is not null then
    insert into public.crawler_domain_policies (source_host)
    values (new.source_host)
    on conflict (source_host) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_source_domain_policy()
  from public, anon, authenticated;

drop trigger if exists event_sources_ensure_domain_policy
  on public.event_sources;
create trigger event_sources_ensure_domain_policy
after insert or update of source_host on public.event_sources
for each row execute function private.ensure_source_domain_policy();

create or replace function private.enforce_source_domain_pacing()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  effective_seconds numeric;
begin
  effective_seconds := greatest(
    new.min_interval_seconds::numeric,
    new.robots_crawl_delay_seconds,
    new.adaptive_interval_seconds::numeric
  );
  if new.last_requested_at is not null then
    new.next_allowed_at := greatest(
      coalesce(new.next_allowed_at, new.last_requested_at),
      new.last_requested_at + make_interval(secs => effective_seconds::double precision)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists crawler_domain_policies_enforce_pacing
  on public.crawler_domain_policies;
create trigger crawler_domain_policies_enforce_pacing
before insert or update of
  last_requested_at, next_allowed_at, min_interval_seconds,
  robots_crawl_delay_seconds, adaptive_interval_seconds
on public.crawler_domain_policies
for each row execute function private.enforce_source_domain_pacing();

-- Active jobs remain deduplicated by source_crawl_jobs_one_active_source_uidx.
-- Explicit reruns receive a fresh historical key so a completed job from the
-- same minute cannot suppress a newly requested crawl.
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
  effective_scheduled_at timestamptz;
  effective_idempotency_key text;
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

  effective_scheduled_at := coalesce(p_scheduled_at, now());
  effective_idempotency_key := case
    when p_trigger_source = 'scheduler' then
      source.id::text || ':scheduled:' ||
      floor(extract(epoch from effective_scheduled_at) / 900)::bigint::text
    else
      source.id::text || ':' || p_trigger_source || ':' || gen_random_uuid()::text
  end;

  insert into public.source_crawl_jobs (
    source_id, event_id, edition_id, priority, scheduled_at, max_attempts,
    idempotency_key, trigger_source
  ) values (
    source.id, source.event_id, source.edition_id,
    greatest(1, least(coalesce(p_priority, 10), 999)), effective_scheduled_at,
    configured_attempts, effective_idempotency_key, p_trigger_source
  )
  on conflict do nothing
  returning * into job;

  if job.id is null then
    select * into job from public.source_crawl_jobs
    where source_id = source.id
      and status in ('queued', 'processing', 'retry_scheduled')
    order by created_at desc limit 1;
  end if;
  return job;
end;
$$;

create or replace function public.record_source_crawl_observation(
  p_job_id uuid,
  p_semantic_hash text,
  p_normalization_version text,
  p_change_confidence text,
  p_change_reasons text[],
  p_http_status integer,
  p_response_time_ms integer,
  p_content_length bigint,
  p_pinned_ip text,
  p_error_type text,
  p_retry_after_seconds integer,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  job public.source_crawl_jobs;
  source public.event_sources;
  crawl_result public.source_crawl_results;
  success boolean;
  rate_limited boolean;
  server_error boolean;
  semantic_changed boolean;
  next_delay integer;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_change_confidence is not null and p_change_confidence not in
    ('exact', 'baseline', 'low', 'medium', 'high', 'technical') then
    raise exception 'invalid change confidence' using errcode = '22023';
  end if;
  if p_user_agent is null or length(p_user_agent) not between 10 and 300 then
    raise exception 'invalid crawler user agent' using errcode = '22023';
  end if;

  select * into job from public.source_crawl_jobs where id = p_job_id;
  if job.id is null then raise exception 'crawl job not found' using errcode = 'P0002'; end if;
  select * into source from public.event_sources where id = job.source_id for update;
  select * into crawl_result from public.source_crawl_results
  where job_id = job.id and attempt_number = job.attempt_count
  order by id desc limit 1 for update;
  if crawl_result.id is null then
    raise exception 'crawl result not found for current attempt' using errcode = 'P0002';
  end if;
  if crawl_result.observation_recorded_at is not null then
    return jsonb_build_object(
      'job_id', job.id,
      'crawl_result_id', crawl_result.id,
      'idempotent', true,
      'semantic_hash_recorded', crawl_result.semantic_hash is not null,
      'pinned_ip_recorded', crawl_result.pinned_ip is not null
    );
  end if;

  update public.source_crawl_results
  set semantic_hash = coalesce(p_semantic_hash, semantic_hash),
      previous_semantic_hash = source.last_semantic_hash,
      normalization_version = coalesce(p_normalization_version, normalization_version),
      change_confidence = p_change_confidence,
      change_reasons = coalesce(p_change_reasons, '{}'),
      pinned_ip = case when nullif(p_pinned_ip, '') is null then pinned_ip else p_pinned_ip::inet end,
      observation_recorded_at = now()
  where id = crawl_result.id;

  if p_semantic_hash is not null then
    update public.event_sources
    set last_semantic_hash = p_semantic_hash,
        last_normalization_version = p_normalization_version,
        last_pinned_ip = case when nullif(p_pinned_ip, '') is null then last_pinned_ip else p_pinned_ip::inet end
    where id = source.id;
  elsif nullif(p_pinned_ip, '') is not null then
    update public.event_sources set last_pinned_ip = p_pinned_ip::inet where id = source.id;
  end if;

  success := coalesce(p_error_type is null and p_http_status in (200, 304), false);
  rate_limited := coalesce(p_http_status = 429, false) or coalesce(p_error_type = 'http_429', false);
  server_error := coalesce(p_http_status between 500 and 599, false);
  semantic_changed := coalesce(p_change_reasons, '{}') &&
    array['semantic_event_signals_changed', 'normalization_version_changed', 'content_hash_changed'];

  insert into public.source_domain_daily_metrics (
    source_host, metric_date, request_count, success_count, changed_signal_count,
    rate_limited_count, server_error_count, robots_denied_count,
    response_time_total_ms, max_response_time_ms, bytes_total, last_observed_at
  ) values (
    source.source_host, current_date, 1, success::integer, semantic_changed::integer,
    rate_limited::integer, server_error::integer, coalesce(p_error_type = 'robots_denied', false)::integer,
    greatest(coalesce(p_response_time_ms, 0), 0),
    greatest(coalesce(p_response_time_ms, 0), 0),
    greatest(coalesce(p_content_length, 0), 0), now()
  )
  on conflict (source_host, metric_date) do update set
    request_count = source_domain_daily_metrics.request_count + 1,
    success_count = source_domain_daily_metrics.success_count + excluded.success_count,
    changed_signal_count = source_domain_daily_metrics.changed_signal_count + excluded.changed_signal_count,
    rate_limited_count = source_domain_daily_metrics.rate_limited_count + excluded.rate_limited_count,
    server_error_count = source_domain_daily_metrics.server_error_count + excluded.server_error_count,
    robots_denied_count = source_domain_daily_metrics.robots_denied_count + excluded.robots_denied_count,
    response_time_total_ms = source_domain_daily_metrics.response_time_total_ms + excluded.response_time_total_ms,
    max_response_time_ms = greatest(source_domain_daily_metrics.max_response_time_ms, excluded.max_response_time_ms),
    bytes_total = source_domain_daily_metrics.bytes_total + excluded.bytes_total,
    last_observed_at = now();

  update public.crawler_domain_policies policy
  set adaptive_interval_seconds = case
        when rate_limited then least(86400, greatest(policy.min_interval_seconds, policy.adaptive_interval_seconds, 60) * 2)
        when success and policy.successful_requests_since_rate_limit + 1 >= 20
          then greatest(0, policy.adaptive_interval_seconds - policy.min_interval_seconds)
        else policy.adaptive_interval_seconds
      end,
      successful_requests_since_rate_limit = case
        when rate_limited then 0
        when success and policy.successful_requests_since_rate_limit + 1 >= 20 then 0
        when success then policy.successful_requests_since_rate_limit + 1
        else policy.successful_requests_since_rate_limit
      end,
      rate_limit_events = policy.rate_limit_events + rate_limited::integer,
      last_rate_limited_at = case when rate_limited then now() else policy.last_rate_limited_at end,
      last_user_agent = p_user_agent,
      next_allowed_at = case when rate_limited then greatest(
        coalesce(policy.next_allowed_at, now()),
        now() + make_interval(secs => greatest(
          coalesce(p_retry_after_seconds, 0),
          least(86400, greatest(policy.min_interval_seconds, policy.adaptive_interval_seconds, 60) * 2)
        ))
      ) else policy.next_allowed_at end,
      updated_at = now()
  where policy.source_host = source.source_host
  returning greatest(
    min_interval_seconds,
    adaptive_interval_seconds,
    ceil(robots_crawl_delay_seconds)::integer
  ) into next_delay;

  return jsonb_build_object(
    'job_id', job.id,
    'crawl_result_id', crawl_result.id,
    'source_host', source.source_host,
    'effective_domain_delay_seconds', coalesce(next_delay, 0),
    'semantic_hash_recorded', p_semantic_hash is not null,
    'pinned_ip_recorded', nullif(p_pinned_ip, '') is not null
  );
end;
$$;

revoke all on function public.record_source_crawl_observation(
  uuid, text, text, text, text[], integer, integer, bigint, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.record_source_crawl_observation(
  uuid, text, text, text, text[], integer, integer, bigint, text, text, integer, text
) to service_role;

alter table public.source_domain_daily_metrics enable row level security;

drop policy if exists source_domain_daily_metrics_admin_select
  on public.source_domain_daily_metrics;
create policy source_domain_daily_metrics_admin_select
on public.source_domain_daily_metrics for select to authenticated
using ((select private.is_admin()));

revoke all on public.source_domain_daily_metrics from public, anon, authenticated;
grant select on public.source_domain_daily_metrics to authenticated;
grant select, insert, update, delete on public.source_domain_daily_metrics to service_role;

comment on table public.source_domain_daily_metrics is
  'Daily per-domain crawler telemetry used to tune and automatically back off respectful request rates.';
comment on function public.record_source_crawl_observation(
  uuid, text, text, text, text[], integer, integer, bigint, text, text, integer, text
) is 'Service-only idempotent enrichment for semantic hashes, pinned IP evidence and adaptive domain pacing.';

commit;
