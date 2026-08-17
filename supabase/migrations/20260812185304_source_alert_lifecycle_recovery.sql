begin;

create or replace function private.resolve_source_failure_alerts(
  p_source_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  affected integer := 0;
begin
  update public.data_workflow_alerts alert
  set alert_status = 'resolved',
      resolved_at = now(),
      resolved_by = null,
      metadata = coalesce(alert.metadata, '{}'::jsonb) || jsonb_build_object(
        'recovery_reason', case
          when source.is_active then 'source_fetch_succeeded'
          else 'source_deactivated'
        end,
        'recovered_at', now(),
        'recovered_source_status', source.crawl_status
      ),
      updated_at = now()
  from public.event_sources source
  where alert.source_id = source.id
    and (p_source_id is null or source.id = p_source_id)
    and alert.alert_status = 'open'
    and (
      alert.alert_code = 'source_repeated_failures'
      or alert.alert_code like 'http\_%' escape '\'
      or alert.alert_code in (
        'crawl_error',
        'connect_error',
        'dns_error',
        'empty_content',
        'pinned_connect_error',
        'redirect_error',
        'redirect_limit',
        'response_too_large',
        'robots_denied',
        'robots_unavailable',
        'ssrf_blocked',
        'timeout',
        'tls_error',
        'unsupported_content_encoding',
        'unsupported_content_type'
      )
    )
    and (
      source.is_active is false
      or (
        source.consecutive_failures = 0
        and source.crawl_status in ('success', 'not_modified')
        and source.last_fetched_at is not null
        and source.last_fetched_at >= alert.last_detected_at
      )
    );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function private.resolve_source_failure_review_tasks(
  p_source_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  affected integer := 0;
begin
  update public.source_review_tasks task
  set status = 'resolved',
      reviewed_at = now(),
      reviewed_by = null,
      review_notes = concat_ws(
        E'\n',
        nullif(task.review_notes, ''),
        case
          when source.is_active then 'Automatically resolved after a successful source crawl.'
          else 'Automatically resolved because the source was deactivated.'
        end
      ),
      updated_at = now()
  from public.event_sources source
  where task.source_id = source.id
    and (p_source_id is null or source.id = p_source_id)
    and task.status = 'open'
    and task.task_type in ('dead_letter', 'source_unreachable', 'content_invalid')
    and (
      source.is_active is false
      or (
        source.consecutive_failures = 0
        and source.crawl_status in ('success', 'not_modified')
        and source.last_fetched_at is not null
        and source.last_fetched_at >= task.updated_at
      )
    );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function private.resolve_source_failure_validation_issues(
  p_source_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  affected integer := 0;
begin
  update public.validation_issues issue
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = null,
      updated_at = now()
  from public.event_sources source
  where (p_source_id is null or source.id = p_source_id)
    and issue.status = 'open'
    and issue.rule_code =
      'source_unreachable_' || replace(source.id::text, '-', '_')
    and (
      source.is_active is false
      or (
        source.consecutive_failures = 0
        and source.crawl_status in ('success', 'not_modified')
        and source.last_fetched_at is not null
        and source.last_fetched_at >= issue.updated_at
      )
    );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function private.restore_recovered_source_events(
  p_source_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  affected integer := 0;
begin
  update public.events event
  set verification_status = 'verified',
      last_verified_at = greatest(event.last_verified_at, source.last_fetched_at),
      updated_at = now()
  from public.event_sources source
  where event.id = source.event_id
    and (p_source_id is null or source.id = p_source_id)
    and event.verification_status = 'source_unreachable'
    and source.is_active is true
    and source.consecutive_failures = 0
    and source.crawl_status in ('success', 'not_modified')
    and source.last_fetched_at is not null
    and not exists (
      select 1
      from public.event_sources failing_source
      where failing_source.event_id = event.id
        and failing_source.is_active is true
        and (
          failing_source.consecutive_failures > 0
          or failing_source.crawl_status in (
            'failed', 'source_unreachable', 'unreachable', 'dead_letter'
          )
        )
    );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function private.resolve_source_failure_alerts_after_state_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
begin
  if new.is_active is false
    or (
      new.consecutive_failures = 0
      and new.crawl_status in ('success', 'not_modified')
      and new.last_fetched_at is not null
    ) then
    perform private.resolve_source_failure_alerts(new.id);
    perform private.resolve_source_failure_review_tasks(new.id);
    perform private.resolve_source_failure_validation_issues(new.id);
    perform private.restore_recovered_source_events(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists event_sources_resolve_failure_alerts
  on public.event_sources;
create trigger event_sources_resolve_failure_alerts
after update of is_active, crawl_status, consecutive_failures, last_fetched_at
on public.event_sources
for each row
when (
  old.is_active is distinct from new.is_active
  or old.crawl_status is distinct from new.crawl_status
  or old.consecutive_failures is distinct from new.consecutive_failures
  or old.last_fetched_at is distinct from new.last_fetched_at
)
execute function private.resolve_source_failure_alerts_after_state_change();

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
  resolved_source_alerts integer := 0;
  resolved_source_reviews integer := 0;
  resolved_source_issues integer := 0;
  restored_source_events integer := 0;
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

    resolved_source_alerts := private.resolve_source_failure_alerts();
    resolved_source_reviews := private.resolve_source_failure_review_tasks();
    resolved_source_issues := private.resolve_source_failure_validation_issues();
    restored_source_events := private.restore_recovered_source_events();

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
          'stale_editions', changed_editions,
          'resolved_source_alerts', resolved_source_alerts,
          'resolved_source_reviews', resolved_source_reviews,
          'resolved_source_issues', resolved_source_issues,
          'restored_source_events', restored_source_events
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

revoke all on function private.resolve_source_failure_alerts(uuid)
  from public, anon, authenticated;
revoke all on function private.resolve_source_failure_review_tasks(uuid)
  from public, anon, authenticated;
revoke all on function private.resolve_source_failure_validation_issues(uuid)
  from public, anon, authenticated;
revoke all on function private.restore_recovered_source_events(uuid)
  from public, anon, authenticated;
revoke all on function private.resolve_source_failure_alerts_after_state_change()
  from public, anon, authenticated;

select private.resolve_source_failure_alerts();
select private.resolve_source_failure_review_tasks();
select private.resolve_source_failure_validation_issues();
select private.restore_recovered_source_events();

comment on function private.resolve_source_failure_alerts(uuid) is
  'Resolves stale source-fetch alerts after a verified recovery or source deactivation.';
comment on function private.resolve_source_failure_review_tasks(uuid) is
  'Closes technical source review tasks after recovery or source deactivation while preserving crawl history.';
comment on function private.resolve_source_failure_validation_issues(uuid) is
  'Resolves source-specific reachability validation issues after recovery or source deactivation.';
comment on function private.restore_recovered_source_events(uuid) is
  'Restores events that were marked source_unreachable after all active sources have recovered.';

commit;
