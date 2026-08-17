-- Single-SELECT postflight for an isolated staging deployment.
-- This script never authorizes deployment or backfill. It only verifies the
-- schema and safety gates required before a manual Candidate E2E smoke test.

with
audit_session as materialized (
  select
    set_config('statement_timeout', '30s', true) as statement_timeout,
    set_config('lock_timeout', '2s', true) as lock_timeout
),
function_definitions as (
  select
    to_regprocedure(
      'public.register_edition_successor_candidate(uuid,bigint,jsonb,text)'
    ) as register_oid,
    to_regprocedure(
      'public.approve_edition_succession_candidates(uuid[],integer)'
    ) as approve_oid,
    to_regprocedure('private.run_edition_lifecycle(date)') as lifecycle_oid
),
function_bodies as (
  select
    definitions.*,
    lower(coalesce(pg_get_functiondef(definitions.register_oid), '')) as register_body,
    lower(coalesce(pg_get_functiondef(definitions.approve_oid), '')) as approve_body,
    lower(coalesce(pg_get_functiondef(definitions.lifecycle_oid), '')) as lifecycle_body
  from function_definitions definitions
),
schema_state as (
  select jsonb_build_object(
    'candidate_validation_columns', (
      select count(*) from information_schema.columns column_row
      where column_row.table_schema = 'public'
        and column_row.table_name = 'edition_succession_candidates'
        and column_row.column_name in (
          'validation_status', 'validation_reasons', 'validated_at'
        )
    ),
    'manual_lock_table_present',
      to_regclass('public.event_field_controls') is not null,
    'lifecycle_state_view_present',
      to_regclass('public.admin_event_edition_lifecycle_state') is not null,
    'candidate_first_review_view_present',
      to_regclass('public.admin_review_inbox_candidate_first_base') is not null,
    'season_planner_delete_restricted', exists (
      select 1 from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.season_planner_events'::regclass
        and constraint_row.conname = 'season_planner_events_edition_id_fkey'
        and constraint_row.confdeltype = 'r'
    ),
    'register_function_present', bodies.register_oid is not null,
    'register_service_only',
      bodies.register_oid is not null
      and not coalesce(has_function_privilege('anon', bodies.register_oid, 'execute'), false)
      and not coalesce(has_function_privilege('authenticated', bodies.register_oid, 'execute'), false)
      and coalesce(has_function_privilege('service_role', bodies.register_oid, 'execute'), false),
    'detection_does_not_materialize_edition',
      bodies.register_oid is not null
      and position('insert into public.event_editions' in bodies.register_body) = 0,
    'approval_function_present', bodies.approve_oid is not null,
    'approval_requires_admin_and_explicit_ids',
      bodies.approve_oid is not null
      and position('private.is_admin()' in bodies.approve_body) > 0
      and position('explicit candidate ids are required' in bodies.approve_body) > 0,
    'approval_materializes_validated_candidate',
      bodies.approve_oid is not null
      and position('insert into public.event_editions' in bodies.approve_body) > 0
      and position('validation_status = ''validated''' in bodies.approve_body) > 0,
    'postponed_not_auto_completed',
      bodies.lifecycle_oid is not null
      and position('edition.edition_status in (''scheduled'', ''cancelled'')' in bodies.lifecycle_body) > 0
      and position('edition.edition_status in (''scheduled'', ''cancelled'', ''postponed'')' in bodies.lifecycle_body) = 0
  ) as payload
  from function_bodies bodies
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
candidate_state as (
  select jsonb_build_object(
    'total', count(*),
    'legacy_unvalidated', count(*) filter (
      where to_jsonb(candidate)->>'validation_status' is null
    ),
    'validated', count(*) filter (
      where to_jsonb(candidate)->>'validation_status' = 'validated'
    ),
    'blocked', count(*) filter (
      where to_jsonb(candidate)->>'validation_status' = 'blocked'
    ),
    'conflict', count(*) filter (
      where candidate.candidate_status = 'conflict'
         or to_jsonb(candidate)->>'validation_status' = 'conflict'
    ),
    'legacy_hidden_drafts', (
      select count(*) from public.event_editions edition
      where edition.publication_status = 'draft'
        and edition.generated_from_candidate_id is not null
    ),
    'duplicate_event_year_groups', (
      select count(*) from (
        select edition.event_id, edition.edition_year
        from public.event_editions edition
        group by edition.event_id, edition.edition_year having count(*) > 1
      ) grouped
    ),
    'contradictory_open_candidate_groups', (
      select count(*) from (
        select peer.event_id, peer.candidate_year
        from public.edition_succession_candidates peer
        where peer.candidate_status in ('detected', 'draft_created', 'conflict')
        group by peer.event_id, peer.candidate_year
        having count(distinct peer.candidate_start_date) > 1
      ) grouped
    )
  ) as payload
  from public.edition_succession_candidates candidate
),
gate_state as (
  select
    schema_state.payload as schema_payload,
    coalesce(
      automation_state.payload,
      jsonb_build_object(
        'settings_missing', true,
        'auto_publish_enabled', false,
        'auto_result_publish_enabled', false,
        'disable_constraint_present', false
      )
    ) as automation_payload,
    candidate_state.payload as candidate_payload
  from schema_state
  cross join candidate_state
  left join automation_state on true
),
gate_result as (
  select gate_state.*,
    (
      (schema_payload->>'candidate_validation_columns')::integer = 3
      and (schema_payload->>'manual_lock_table_present')::boolean
      and (schema_payload->>'lifecycle_state_view_present')::boolean
      and (schema_payload->>'candidate_first_review_view_present')::boolean
      and (schema_payload->>'season_planner_delete_restricted')::boolean
      and (schema_payload->>'register_service_only')::boolean
      and (schema_payload->>'detection_does_not_materialize_edition')::boolean
      and (schema_payload->>'approval_requires_admin_and_explicit_ids')::boolean
      and (schema_payload->>'approval_materializes_validated_candidate')::boolean
      and (schema_payload->>'postponed_not_auto_completed')::boolean
      and not (automation_payload->>'auto_publish_enabled')::boolean
      and not (automation_payload->>'auto_result_publish_enabled')::boolean
      and (automation_payload->>'disable_constraint_present')::boolean
      and (candidate_payload->>'duplicate_event_year_groups')::integer = 0
    ) as foundation_gates_pass
  from gate_state
)
select jsonb_build_object(
  'report_type', 'edition_staging_postflight',
  'mode', 'read_only_verification',
  'generated_at', now(),
  'database', current_database(),
  'execution_guard', 'single_select_static_allowlist',
  'writes_attempted', 0,
  'schema', result.schema_payload,
  'automation', result.automation_payload,
  'candidates', result.candidate_payload,
  'foundation_gates_pass', result.foundation_gates_pass,
  'ready_for_manual_candidate_smoke', result.foundation_gates_pass,
  'deployment_authorized', false,
  'backfill_authorized', false,
  'target_confirmation_required', true,
  'next_gate', case
    when result.foundation_gates_pass
      then 'confirm_isolated_staging_target_then_run_manual_candidate_smoke'
    else 'apply_and_verify_pending_migrations_on_isolated_staging'
  end
) as edition_staging_postflight_report
from gate_result result
cross join audit_session;
