-- Productive data-freshness baseline, calibrated alert thresholds and a
-- deduplicated server-side notification outbox.

begin;

create table if not exists public.data_freshness_settings (
  singleton boolean primary key default true check (singleton),
  minimum_catalog_rows_warning integer not null default 480,
  minimum_catalog_rows_critical integer not null default 450,
  freshness_target_percent numeric(5,2) not null default 90.00,
  freshness_warning_percent numeric(5,2) not null default 80.00,
  freshness_critical_percent numeric(5,2) not null default 55.00,
  overdue_sources_warning integer not null default 5,
  overdue_sources_critical integer not null default 25,
  recent_failures_warning integer not null default 5,
  recent_failures_critical integer not null default 15,
  open_critical_alerts_warning integer not null default 1,
  open_critical_alerts_critical integer not null default 10,
  notification_cooldown_minutes integer not null default 720,
  notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint data_freshness_settings_catalog_thresholds check (
    minimum_catalog_rows_critical between 1 and minimum_catalog_rows_warning
  ),
  constraint data_freshness_settings_freshness_thresholds check (
    freshness_critical_percent between 0 and freshness_warning_percent
    and freshness_warning_percent <= freshness_target_percent
    and freshness_target_percent <= 100
  ),
  constraint data_freshness_settings_source_thresholds check (
    overdue_sources_warning between 1 and overdue_sources_critical
  ),
  constraint data_freshness_settings_failure_thresholds check (
    recent_failures_warning between 1 and recent_failures_critical
  ),
  constraint data_freshness_settings_alert_thresholds check (
    open_critical_alerts_warning between 1 and open_critical_alerts_critical
  ),
  constraint data_freshness_settings_cooldown check (
    notification_cooldown_minutes between 15 and 10080
  )
);

insert into public.data_freshness_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.data_freshness_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  catalog_rows integer not null check (catalog_rows >= 0),
  expected_catalog_rows integer not null check (expected_catalog_rows >= 0),
  current_editions integer not null check (current_editions >= 0),
  fresh_editions integer not null check (fresh_editions >= 0),
  overdue_editions integer not null check (overdue_editions >= 0),
  review_editions integer not null check (review_editions >= 0),
  freshness_percent numeric(5,2) not null check (
    freshness_percent between 0 and 100
  ),
  active_sources integer not null check (active_sources >= 0),
  overdue_sources integer not null check (overdue_sources >= 0),
  unscheduled_sources integer not null check (unscheduled_sources >= 0),
  failed_sources integer not null check (failed_sources >= 0),
  recent_checks integer not null check (recent_checks >= 0),
  recent_failures integer not null check (recent_failures >= 0),
  open_critical_alerts integer not null check (open_critical_alerts >= 0),
  open_error_alerts integer not null check (open_error_alerts >= 0),
  overall_status text not null check (
    overall_status in ('healthy', 'attention', 'critical')
  ),
  signal_statuses jsonb not null default '{}'::jsonb
);

create index if not exists data_freshness_snapshots_captured_idx
  on public.data_freshness_snapshots (captured_at desc);

create table if not exists public.data_alert_notification_state (
  singleton boolean primary key default true check (singleton),
  last_notified_status text check (
    last_notified_status in ('healthy', 'attention', 'critical')
  ),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_delivery_id bigint,
  claim_token uuid,
  claim_kind text check (claim_kind in ('critical', 'recovery')),
  claim_snapshot_id bigint references public.data_freshness_snapshots(id)
    on delete set null,
  claim_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.data_alert_notification_state (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.data_alert_deliveries (
  id bigint generated always as identity primary key,
  snapshot_id bigint references public.data_freshness_snapshots(id)
    on delete set null,
  claim_token uuid not null,
  notification_kind text not null check (
    notification_kind in ('critical', 'recovery')
  ),
  overall_status text not null check (
    overall_status in ('healthy', 'attention', 'critical')
  ),
  success boolean not null,
  http_status integer check (http_status is null or http_status between 100 and 599),
  response_excerpt text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint data_alert_deliveries_response_excerpt check (
    response_excerpt is null or length(response_excerpt) <= 1000
  ),
  constraint data_alert_deliveries_error_message check (
    error_message is null or length(error_message) <= 1000
  )
);

alter table public.data_alert_notification_state
  add constraint data_alert_notification_state_delivery_fk
  foreign key (last_delivery_id) references public.data_alert_deliveries(id)
  on delete set null;

create unique index if not exists data_alert_deliveries_claim_success_idx
  on public.data_alert_deliveries (claim_token)
  where success;
create index if not exists data_alert_deliveries_created_idx
  on public.data_alert_deliveries (created_at desc);

create or replace function public.run_data_freshness_monitor()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  monitor_settings public.data_freshness_settings;
  snapshot_row public.data_freshness_snapshots;
  notification_state public.data_alert_notification_state;
  signal record;
  catalog_count integer := 0;
  expected_count integer := 0;
  current_count integer := 0;
  fresh_count integer := 0;
  overdue_edition_count integer := 0;
  review_edition_count integer := 0;
  freshness_rate numeric(5,2) := 0;
  active_source_count integer := 0;
  overdue_source_count integer := 0;
  unscheduled_source_count integer := 0;
  failed_source_count integer := 0;
  recent_check_count integer := 0;
  recent_failure_count integer := 0;
  open_critical_count integer := 0;
  open_error_count integer := 0;
  catalog_severity text;
  freshness_severity text;
  scheduler_severity text;
  technical_severity text;
  overall text;
  notification_kind text;
  notification_token uuid;
  notification_payload jsonb;
  open_alert_summary jsonb := '[]'::jsonb;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('sporteventmap:data-freshness-monitor', 0)
  ) then
    return jsonb_build_object('status', 'busy', 'notification', null);
  end if;

  select * into monitor_settings
  from public.data_freshness_settings
  where singleton = true;

  with current_editions as (
    select distinct on (edition.event_id)
      edition.id,
      edition.event_id,
      edition.verification_status,
      edition.needs_review,
      edition.last_verified_at,
      edition.next_check_at
    from public.event_editions edition
    where edition.publication_status = 'published'
      and edition.discovery_status = 'active'
      and edition.edition_status not in ('cancelled', 'inactive', 'completed')
      and (
        coalesce(edition.end_date, edition.start_date) is null
        or coalesce(edition.end_date, edition.start_date) >= current_date
      )
    order by edition.event_id,
      coalesce(edition.start_date, 'infinity'::date),
      edition.edition_year,
      edition.id
  )
  select
    count(*)::integer,
    count(*) filter (
      where verification_status = 'verified'
        and needs_review is not true
        and last_verified_at is not null
        and next_check_at > now()
    )::integer,
    count(*) filter (where next_check_at <= now())::integer,
    count(*) filter (
      where needs_review is true
        or verification_status in (
          'unverified', 'stale', 'needs_review', 'source_unreachable'
        )
    )::integer
  into current_count, fresh_count, overdue_edition_count, review_edition_count
  from current_editions;

  expected_count := current_count;
  select count(*)::integer into catalog_count
  from public.public_event_discovery;

  freshness_rate := case
    when current_count = 0 then 0
    else round((fresh_count::numeric / current_count::numeric) * 100, 2)
  end;

  select
    count(*) filter (where is_active)::integer,
    count(*) filter (
      where is_active and next_fetch_at <= now() - interval '30 minutes'
    )::integer,
    count(*) filter (where is_active and next_fetch_at is null)::integer,
    count(*) filter (
      where is_active and (
        consecutive_failures > 0
        or crawl_status in ('unreachable', 'blocked', 'parse_error', 'http_error')
      )
    )::integer
  into active_source_count, overdue_source_count,
    unscheduled_source_count, failed_source_count
  from public.event_sources;

  select
    count(*)::integer,
    count(*) filter (
      where http_status is null
        or http_status < 200
        or http_status >= 400
        or processing_status in ('failed', 'retry_scheduled', 'dead_letter')
    )::integer
  into recent_check_count, recent_failure_count
  from public.source_crawl_results
  where fetched_at >= now() - interval '60 minutes';

  select
    count(*) filter (where severity = 'critical')::integer,
    count(*) filter (where severity = 'error')::integer
  into open_critical_count, open_error_count
  from public.data_workflow_alerts
  where alert_status = 'open'
    and alert_scope <> 'data_freshness_monitor';

  catalog_severity := case
    when catalog_count <> expected_count
      or catalog_count < monitor_settings.minimum_catalog_rows_critical
      then 'critical'
    when catalog_count < monitor_settings.minimum_catalog_rows_warning
      then 'warning'
    else null
  end;
  freshness_severity := case
    when freshness_rate < monitor_settings.freshness_critical_percent
      then 'critical'
    when freshness_rate < monitor_settings.freshness_warning_percent
      then 'warning'
    else null
  end;
  scheduler_severity := case
    when unscheduled_source_count > 0
      or overdue_source_count >= monitor_settings.overdue_sources_critical
      then 'critical'
    when overdue_source_count >= monitor_settings.overdue_sources_warning
      then 'warning'
    else null
  end;
  technical_severity := case
    when recent_failure_count >= monitor_settings.recent_failures_critical
      or open_critical_count >= monitor_settings.open_critical_alerts_critical
      then 'critical'
    when recent_failure_count >= monitor_settings.recent_failures_warning
      or open_critical_count >= monitor_settings.open_critical_alerts_warning
      then 'warning'
    else null
  end;

  overall := case
    when 'critical' in (
      catalog_severity, freshness_severity, scheduler_severity, technical_severity
    ) then 'critical'
    when 'warning' in (
      catalog_severity, freshness_severity, scheduler_severity, technical_severity
    ) then 'attention'
    else 'healthy'
  end;

  insert into public.data_freshness_snapshots (
    catalog_rows, expected_catalog_rows, current_editions, fresh_editions,
    overdue_editions, review_editions, freshness_percent, active_sources,
    overdue_sources, unscheduled_sources, failed_sources, recent_checks,
    recent_failures, open_critical_alerts, open_error_alerts, overall_status,
    signal_statuses
  ) values (
    catalog_count, expected_count, current_count, fresh_count,
    overdue_edition_count, review_edition_count, freshness_rate,
    active_source_count, overdue_source_count, unscheduled_source_count,
    failed_source_count, recent_check_count, recent_failure_count,
    open_critical_count, open_error_count, overall,
    jsonb_build_object(
      'catalog', coalesce(catalog_severity, 'healthy'),
      'freshness', coalesce(freshness_severity, 'healthy'),
      'scheduler', coalesce(scheduler_severity, 'healthy'),
      'technical', coalesce(technical_severity, 'healthy')
    )
  ) returning * into snapshot_row;

  for signal in
    select * from (values
      (
        'catalog_completeness', catalog_severity,
        'Public event catalog incomplete',
        format('%s of %s expected current events are publicly available.', catalog_count, expected_count),
        jsonb_build_object('catalog_rows', catalog_count, 'expected_rows', expected_count)
      ),
      (
        'edition_freshness', freshness_severity,
        'Event freshness target missed',
        format('%s%% of current events are verified and not yet due again.', freshness_rate),
        jsonb_build_object(
          'fresh_editions', fresh_count,
          'current_editions', current_count,
          'freshness_percent', freshness_rate,
          'target_percent', monitor_settings.freshness_target_percent
        )
      ),
      (
        'source_scheduler', scheduler_severity,
        'Source checks are overdue',
        format('%s sources are overdue; %s sources have no next check.', overdue_source_count, unscheduled_source_count),
        jsonb_build_object(
          'active_sources', active_source_count,
          'overdue_sources', overdue_source_count,
          'unscheduled_sources', unscheduled_source_count
        )
      ),
      (
        'technical_failures', technical_severity,
        'Technical source failures require attention',
        format('%s new failures in 60 minutes; %s open critical source alerts.', recent_failure_count, open_critical_count),
        jsonb_build_object(
          'checks_60m', recent_check_count,
          'failures_60m', recent_failure_count,
          'open_critical_alerts', open_critical_count,
          'open_error_alerts', open_error_count
        )
      )
    ) as evaluated(alert_code, severity, title, description, metadata)
  loop
    if signal.severity is null then
      update public.data_workflow_alerts
      set alert_status = 'resolved',
          resolved_at = now(),
          resolved_by = null,
          updated_at = now()
      where alert_scope = 'data_freshness_monitor'
        and alert_code = signal.alert_code
        and alert_status = 'open';
    else
      insert into public.data_workflow_alerts (
        alert_scope, alert_code, severity, alert_status, title, description,
        last_detected_at, metadata
      ) values (
        'data_freshness_monitor', signal.alert_code, signal.severity, 'open',
        signal.title, signal.description, now(),
        signal.metadata || jsonb_build_object('snapshot_id', snapshot_row.id)
      )
      on conflict (alert_scope, alert_code) do update
      set severity = excluded.severity,
          alert_status = 'open',
          title = excluded.title,
          description = excluded.description,
          first_detected_at = case
            when public.data_workflow_alerts.alert_status = 'open'
              then public.data_workflow_alerts.first_detected_at
            else now()
          end,
          last_detected_at = now(),
          occurrence_count = case
            when public.data_workflow_alerts.alert_status = 'open'
              and public.data_workflow_alerts.severity = excluded.severity
              then public.data_workflow_alerts.occurrence_count
            else public.data_workflow_alerts.occurrence_count + 1
          end,
          resolved_at = null,
          resolved_by = null,
          metadata = excluded.metadata,
          updated_at = now();
    end if;
  end loop;

  insert into public.data_alert_notification_state (singleton)
  values (true)
  on conflict (singleton) do nothing;

  select * into notification_state
  from public.data_alert_notification_state
  where singleton = true
  for update;

  if monitor_settings.notifications_enabled
    and (
      notification_state.claim_expires_at is null
      or notification_state.claim_expires_at <= now()
    ) then
    if overall = 'critical'
      and (
        notification_state.last_notified_status is distinct from 'critical'
        or notification_state.last_success_at is null
        or notification_state.last_success_at <= now()
          - make_interval(mins => monitor_settings.notification_cooldown_minutes)
      ) then
      notification_kind := 'critical';
    elsif overall <> 'critical'
      and notification_state.last_notified_status = 'critical' then
      notification_kind := 'recovery';
    end if;
  end if;

  if notification_kind is not null then
    notification_token := gen_random_uuid();

    select coalesce(jsonb_agg(row_to_json(summary_row) order by
      case summary_row.severity when 'critical' then 1 else 2 end,
      summary_row.alert_count desc, summary_row.alert_code), '[]'::jsonb)
    into open_alert_summary
    from (
      select alert_code, severity, count(*)::integer as alert_count,
        max(last_detected_at) as last_detected_at
      from public.data_workflow_alerts
      where alert_status = 'open'
        and severity in ('critical', 'error')
      group by alert_code, severity
    ) summary_row;

    update public.data_alert_notification_state
    set claim_token = notification_token,
        claim_kind = notification_kind,
        claim_snapshot_id = snapshot_row.id,
        claim_expires_at = now() + interval '10 minutes',
        last_attempt_at = now(),
        updated_at = now()
    where singleton = true;

    notification_payload := jsonb_build_object(
      'claim_token', notification_token,
      'kind', notification_kind,
      'status', overall,
      'snapshot_id', snapshot_row.id,
      'captured_at', snapshot_row.captured_at,
      'title', case notification_kind
        when 'critical' then 'Critical data-quality alert'
        else 'Data-quality alert recovered'
      end,
      'metrics', jsonb_build_object(
        'catalog_rows', catalog_count,
        'expected_catalog_rows', expected_count,
        'fresh_editions', fresh_count,
        'current_editions', current_count,
        'freshness_percent', freshness_rate,
        'overdue_sources', overdue_source_count,
        'recent_failures', recent_failure_count,
        'open_critical_alerts', open_critical_count,
        'open_error_alerts', open_error_count
      ),
      'signals', snapshot_row.signal_statuses,
      'open_alerts', open_alert_summary
    );
  end if;

  return jsonb_build_object(
    'status', overall,
    'snapshot', to_jsonb(snapshot_row),
    'notification', notification_payload
  );
end;
$$;

revoke all on function public.run_data_freshness_monitor()
  from public, anon, authenticated;
grant execute on function public.run_data_freshness_monitor() to service_role;

create or replace function public.record_data_alert_delivery(
  p_claim_token uuid,
  p_success boolean,
  p_http_status integer default null,
  p_response_excerpt text default null,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  notification_state public.data_alert_notification_state;
  delivered_snapshot public.data_freshness_snapshots;
  delivery_id bigint;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into notification_state
  from public.data_alert_notification_state
  where singleton = true and claim_token = p_claim_token
  for update;

  if notification_state.claim_token is null then
    return false;
  end if;

  select * into delivered_snapshot
  from public.data_freshness_snapshots
  where id = notification_state.claim_snapshot_id;

  insert into public.data_alert_deliveries (
    snapshot_id, claim_token, notification_kind, overall_status, success,
    http_status, response_excerpt, error_message
  ) values (
    notification_state.claim_snapshot_id,
    p_claim_token,
    notification_state.claim_kind,
    delivered_snapshot.overall_status,
    p_success,
    p_http_status,
    left(p_response_excerpt, 1000),
    left(p_error_message, 1000)
  ) returning id into delivery_id;

  update public.data_alert_notification_state
  set last_notified_status = case
        when p_success then delivered_snapshot.overall_status
        else last_notified_status
      end,
      last_success_at = case when p_success then now() else last_success_at end,
      last_delivery_id = delivery_id,
      claim_token = null,
      claim_kind = null,
      claim_snapshot_id = null,
      claim_expires_at = null,
      updated_at = now()
  where singleton = true;

  return true;
end;
$$;

revoke all on function public.record_data_alert_delivery(
  uuid, boolean, integer, text, text
) from public, anon, authenticated;
grant execute on function public.record_data_alert_delivery(
  uuid, boolean, integer, text, text
) to service_role;

create or replace function private.install_data_alert_dispatch_cron()
returns void
language plpgsql
security definer
set search_path = pg_catalog, cron, net, vault, private
as $$
declare
  source_function_url text;
  alert_function_url text;
begin
  select decrypted_secret into source_function_url
  from vault.decrypted_secrets
  where name = 'sem_function_url';

  if source_function_url is null
    or not exists (
      select 1 from vault.decrypted_secrets where name = 'sem_anon_jwt'
    )
    or not exists (
      select 1 from vault.decrypted_secrets
      where name = 'sem_source_check_cron_secret'
    ) then
    raise exception 'Required Vault secrets are missing' using errcode = '55000';
  end if;

  alert_function_url := regexp_replace(
    source_function_url,
    '/event-source-check/?$',
    '/data-alert-dispatch'
  );
  if alert_function_url = source_function_url then
    raise exception 'sem_function_url has an unexpected format' using errcode = '22023';
  end if;

  if exists (select 1 from cron.job where jobname = 'sem-data-alert-dispatch') then
    perform cron.unschedule('sem-data-alert-dispatch');
  end if;

  perform cron.schedule(
    'sem-data-alert-dispatch',
    '*/15 * * * *',
    format($cron$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'sem_anon_jwt'
          ),
          'x-cron-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'sem_source_check_cron_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $cron$, alert_function_url)
  );
end;
$$;

revoke all on function private.install_data_alert_dispatch_cron()
  from public, anon, authenticated;

alter table public.data_freshness_settings enable row level security;
alter table public.data_freshness_snapshots enable row level security;
alter table public.data_alert_notification_state enable row level security;
alter table public.data_alert_deliveries enable row level security;

create policy data_freshness_settings_admin_select
on public.data_freshness_settings for select to authenticated
using ((select private.is_admin()));
create policy data_freshness_settings_admin_update
on public.data_freshness_settings for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy data_freshness_snapshots_admin_select
on public.data_freshness_snapshots for select to authenticated
using ((select private.is_admin()));
create policy data_alert_notification_state_admin_select
on public.data_alert_notification_state for select to authenticated
using ((select private.is_admin()));
create policy data_alert_deliveries_admin_select
on public.data_alert_deliveries for select to authenticated
using ((select private.is_admin()));

revoke all on public.data_freshness_settings from public, anon, authenticated;
revoke all on public.data_freshness_snapshots from public, anon, authenticated;
revoke all on public.data_alert_notification_state from public, anon, authenticated;
revoke all on public.data_alert_deliveries from public, anon, authenticated;

grant select, update on public.data_freshness_settings to authenticated;
grant select on public.data_freshness_snapshots to authenticated;
grant select on public.data_alert_notification_state to authenticated;
grant select on public.data_alert_deliveries to authenticated;

grant select, insert, update, delete on public.data_freshness_settings to service_role;
grant select, insert, update, delete on public.data_freshness_snapshots to service_role;
grant select, insert, update, delete on public.data_alert_notification_state to service_role;
grant select, insert, update, delete on public.data_alert_deliveries to service_role;
grant usage, select on sequence public.data_freshness_snapshots_id_seq to service_role;
grant usage, select on sequence public.data_alert_deliveries_id_seq to service_role;

do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
    and exists (select 1 from pg_extension where extname = 'pg_net')
    and exists (
      select 1 from vault.decrypted_secrets where name = 'sem_function_url'
    )
    and exists (
      select 1 from vault.decrypted_secrets where name = 'sem_anon_jwt'
    )
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'sem_source_check_cron_secret'
    ) then
    perform private.install_data_alert_dispatch_cron();
  end if;
end
$schedule$;

comment on table public.data_freshness_settings is
  'Calibrated operational thresholds; browser users never receive notification secrets.';
comment on table public.data_freshness_snapshots is
  'Aggregate, privacy-safe 15-minute baseline history for catalog freshness and source health.';
comment on table public.data_alert_deliveries is
  'Append-only delivery audit for deduplicated critical and recovery notifications.';

commit;
