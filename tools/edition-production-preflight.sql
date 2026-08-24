-- Read-only production rollout preflight for the Edition Candidate foundation.
--
-- The expected histories are deliberately embedded so a partial rollout,
-- migration repair, or unrelated drift becomes a hard stop. This statement
-- never grants deployment/backfill approval and never changes application data.

with
audit_session as materialized (
  select
    set_config('statement_timeout', '30s', true) as statement_timeout,
    set_config('lock_timeout', '2s', true) as lock_timeout
),
expected_predeployment(version, name) as (
  values
    ('20260607', 'initial_events_baseline'),
    ('20260608', 'closed_beta_security'),
    ('20260609', 'admin_workflow'),
    ('20260616', 'admin_review_workflow'),
    ('20260617', 'import_batch_source_type_fix'),
    ('20260619', 'analytics_dashboard_v2'),
    ('20260630', 'event_detail_knowledge_base'),
    ('20260707', 'season_planner_details'),
    ('20260725', 'closed_beta_gate_hardening'),
    ('20260728', 'event_data_operations_foundation'),
    ('20260729', 'event_slugify_encoding_fix'),
    ('20260730', 'event_data_operations_indexes'),
    ('20260731', 'event_operations_stage_two'),
    ('20260801', 'catalog_import_transition'),
    ('20260802', 'postgis_country_boundaries'),
    ('20260803', 'country_boundary_exceptions'),
    ('20260804', 'reconcile_legacy_schildesche'),
    ('20260805', 'source_worker_schedule'),
    ('20260806', 'advisor_indexes'),
    ('20260807', 'source_worker_timeout'),
    ('20260808', 'source_monitor_queue_worker'),
    ('20260809', 'source_monitor_production_hardening'),
    ('20260810', 'edition_lifecycle_succession_engine'),
    ('20260811', 'edition_lifecycle_rpc_hardening'),
    ('20260812', 'public_edition_registration_status'),
    ('20260812063022', 'data_freshness_alert_dispatch'),
    ('20260812063140', 'data_freshness_monitor_schema_alignment'),
    ('20260812063239', 'data_freshness_monitor_catalog_view_alignment'),
    ('20260812063442', 'data_freshness_monitor_encoding_alignment'),
    ('20260812063655', 'data_alert_foreign_key_indexes'),
    ('20260812185304', 'source_alert_lifecycle_recovery'),
    ('20260812200435', 'content_change_verification_queue'),
    ('20260812200627', 'content_change_verification_rpc_invoker'),
    ('20260813', 'review_inbox_safe_automation'),
    ('20260814', 'review_inbox_deduplication'),
    ('20260817121601', 'data_quality_stabilization')
),
deployment_sequence(ordinal, version, name) as (
  values
    (1, '20260814120000', 'beta_security_definer_hardening'),
    (2, '20260815', 'source_monitor_extraction_review'),
    (3, '20260816', 'stage_four_preparation'),
    (4, '20260817124600', 'edition_candidate_first_lifecycle'),
    (5, '20260817', 'stage_four_monitoring_guards'),
    (6, '20260818', 'stage_four_germany_observation'),
    (7, '20260819', 'stage_four_observation_calibration_guards'),
    (8, '20260820', 'stage_four_observation_operational_alerts'),
    (9, '20260821', 'stage_four_observation_lint_fixes'),
    (10, '20260822', 'stage_four_observation_queue_lint')
),
expected_pending(version, name) as (
  select sequence.version, sequence.name
  from deployment_sequence sequence
),
expected_full as (
  select * from expected_predeployment
  union all
  select * from expected_pending
),
remote_history as (
  select migration.version::text, migration.name::text
  from supabase_migrations.schema_migrations migration
),
history_differences as (
  select
    coalesce((
      select jsonb_agg(expected.version order by expected.version)
      from expected_predeployment expected
      where not exists (
        select 1 from remote_history remote
        where remote.version = expected.version and remote.name = expected.name
      )
    ), '[]'::jsonb) as missing_predeployment,
    coalesce((
      select jsonb_agg(expected.version order by expected.version)
      from expected_pending expected
      where not exists (
        select 1 from remote_history remote
        where remote.version = expected.version and remote.name = expected.name
      )
    ), '[]'::jsonb) as pending_not_applied,
    coalesce((
      select jsonb_agg(remote.version order by remote.version)
      from remote_history remote
      where not exists (
        select 1 from expected_full expected
        where expected.version = remote.version and expected.name = remote.name
      )
    ), '[]'::jsonb) as unexpected_or_renamed,
    (select count(*) from remote_history) as remote_count
),
history_state as (
  select differences.*,
    differences.remote_count = (select count(*) from expected_predeployment)
      and differences.missing_predeployment = '[]'::jsonb
      and differences.pending_not_applied = (
        select jsonb_agg(version order by version) from expected_pending
      )
      and differences.unexpected_or_renamed = '[]'::jsonb
      as exact_predeployment_history,
    differences.remote_count = (select count(*) + 1 from expected_predeployment)
      and differences.missing_predeployment = '[]'::jsonb
      and differences.pending_not_applied = (
        select jsonb_agg(version order by version)
        from expected_pending
        where version <> '20260814120000'
      )
      and differences.unexpected_or_renamed = '[]'::jsonb
      as exact_security_baseline_history,
    differences.remote_count = (select count(*) from expected_full)
      and differences.missing_predeployment = '[]'::jsonb
      and differences.pending_not_applied = '[]'::jsonb
      and differences.unexpected_or_renamed = '[]'::jsonb
      as exact_full_history
  from history_differences differences
),
data_integrity as (
  select jsonb_build_object(
    'events', (select count(*) from public.events),
    'editions', (select count(*) from public.event_editions),
    'editions_without_event', (
      select count(*) from public.event_editions edition
      left join public.events event on event.id = edition.event_id
      where event.id is null
    ),
    'duplicate_event_year_groups', (
      select count(*) from (
        select edition.event_id, edition.edition_year
        from public.event_editions edition
        group by edition.event_id, edition.edition_year having count(*) > 1
      ) grouped
    ),
    'duplicate_event_date_groups', (
      select count(*) from (
        select edition.event_id, edition.start_date
        from public.event_editions edition
        where edition.start_date is not null
        group by edition.event_id, edition.start_date having count(*) > 1
      ) grouped
    ),
    'source_edition_event_mismatches', (
      select count(*) from public.event_sources source
      join public.event_editions edition on edition.id = source.edition_id
      where source.edition_id is not null and source.event_id <> edition.event_id
    ),
    'planner_rows_without_edition_reference', (
      select count(*) from public.season_planner_events where edition_id is null
    ),
    'open_candidate_date_conflict_groups', (
      select count(*) from (
        select candidate.event_id, candidate.candidate_year
        from public.edition_succession_candidates candidate
        where candidate.candidate_status in ('detected', 'draft_created', 'conflict')
        group by candidate.event_id, candidate.candidate_year
        having count(distinct candidate.candidate_start_date) > 1
      ) grouped
    )
  ) as payload
),
automation_state as (
  select jsonb_build_object(
    'auto_publish_enabled', coalesce(
      (to_jsonb(settings)->>'auto_publish_enabled')::boolean, false
    ),
    'auto_result_publish_enabled', coalesce(
      (to_jsonb(settings)->>'auto_result_publish_enabled')::boolean, false
    ),
    'disable_constraint_present', exists (
      select 1 from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.edition_lifecycle_settings'::regclass
        and constraint_row.conname = 'edition_lifecycle_publication_automation_disabled_check'
    )
  ) as payload
  from public.edition_lifecycle_settings settings
  where settings.singleton
),
operational_state as (
  select jsonb_build_object(
    'active_source_crawl_jobs', (
      select count(*) from public.source_crawl_jobs
      where status in ('queued', 'processing', 'retry_scheduled')
    ),
    'running_data_workflows', (
      select count(*) from public.data_workflow_runs where run_status = 'running'
    ),
    'long_running_transactions', (
      select count(*) from pg_stat_activity activity
      where activity.datname = current_database()
        and activity.pid <> pg_backend_pid()
        and activity.xact_start < now() - interval '1 minute'
    ),
    'sessions_waiting_on_locks', (
      select count(*) from pg_stat_activity activity
      where activity.datname = current_database()
        and activity.pid <> pg_backend_pid()
        and activity.wait_event_type = 'Lock'
    )
  ) as payload
),
gate_state as (
  select
    history.*,
    integrity.payload as integrity_payload,
    coalesce(automation.payload, jsonb_build_object(
      'settings_missing', true,
      'auto_publish_enabled', false,
      'auto_result_publish_enabled', false,
      'disable_constraint_present', false
    )) as automation_payload,
    operations.payload as operations_payload
  from history_state history
  cross join data_integrity integrity
  cross join operational_state operations
  left join automation_state automation on true
),
gate_result as (
  select state.*,
    (
      (state.integrity_payload->>'editions_without_event')::integer = 0
      and (state.integrity_payload->>'duplicate_event_year_groups')::integer = 0
      and (state.integrity_payload->>'duplicate_event_date_groups')::integer = 0
      and (state.integrity_payload->>'source_edition_event_mismatches')::integer = 0
    ) as data_integrity_gates_pass,
    (
      not (state.automation_payload->>'auto_publish_enabled')::boolean
      and not (state.automation_payload->>'auto_result_publish_enabled')::boolean
      and (state.automation_payload->>'disable_constraint_present')::boolean
    ) as automation_gates_pass,
    (
      (state.operations_payload->>'active_source_crawl_jobs')::integer = 0
      and (state.operations_payload->>'running_data_workflows')::integer = 0
      and (state.operations_payload->>'long_running_transactions')::integer = 0
      and (state.operations_payload->>'sessions_waiting_on_locks')::integer = 0
    ) as quiet_window_observed
  from gate_state state
)
select jsonb_build_object(
  'report_type', 'edition_production_rollout_preflight',
  'mode', 'read_only_verification',
  'generated_at', now(),
  'database', current_database(),
  'execution_guard', 'single_select_static_allowlist',
  'writes_attempted', 0,
  'migration_history', jsonb_build_object(
    'state', case
      when result.exact_predeployment_history then 'expected_predeployment_history'
      when result.exact_security_baseline_history then 'expected_security_baseline_history'
      when result.exact_full_history then 'expected_full_history'
      else 'drift_or_partial_rollout'
    end,
    'remote_count', result.remote_count,
    'expected_predeployment_count', (select count(*) from expected_predeployment),
    'expected_security_baseline_count', (select count(*) + 1 from expected_predeployment),
    'expected_full_count', (select count(*) from expected_full),
    'missing_predeployment', result.missing_predeployment,
    'expected_pending', result.pending_not_applied,
    'planned_application_order', (
      select jsonb_agg(jsonb_build_object(
        'ordinal', sequence.ordinal,
        'version', sequence.version,
        'name', sequence.name
      ) order by sequence.ordinal)
      from deployment_sequence sequence
    ),
    'unexpected_or_renamed', result.unexpected_or_renamed,
    'exact_predeployment_history', result.exact_predeployment_history,
    'exact_security_baseline_history', result.exact_security_baseline_history,
    'exact_full_history', result.exact_full_history
  ),
  'data_integrity', result.integrity_payload,
  'automation', result.automation_payload,
  'operations', result.operations_payload,
  'data_integrity_gates_pass', result.data_integrity_gates_pass,
  'automation_gates_pass', result.automation_gates_pass,
  'quiet_window_observed', result.quiet_window_observed,
  'security_advisor_review_required', true,
  'restricted_logical_backup_verified', false,
  'target_confirmation_required', true,
  'deployment_approval_required', true,
  'deployment_authorized', false,
  'backfill_authorized', false,
  'worker_deployment_authorized', false,
  'automatic_publication_authorized', false,
  'ready_for_schema_deployment', false,
  'next_gate', case
    when not (
      result.exact_predeployment_history
      or result.exact_security_baseline_history
      or result.exact_full_history
    )
      then 'stop_and_investigate_migration_drift'
    when result.exact_full_history
      then 'run_edition_staging_postflight_and_keep_backfill_blocked'
    when result.exact_security_baseline_history
      then 'security_baseline_active_keep_remaining_migrations_blocked'
    when not result.data_integrity_gates_pass or not result.automation_gates_pass
      then 'stop_and_investigate_data_or_automation_gate'
    when not result.quiet_window_observed
      then 'freeze_writers_and_repeat_preflight_in_maintenance_window'
    else 'create_and_verify_restricted_logical_backup_then_request_deployment_approval'
  end
) as edition_production_rollout_preflight_report
from gate_result result
cross join audit_session;
