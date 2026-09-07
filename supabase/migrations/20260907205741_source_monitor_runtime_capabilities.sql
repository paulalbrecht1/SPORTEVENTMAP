-- Source Monitor schema contract. This reports installed capabilities only;
-- it never enables automation, changes events, or substitutes for a health test.
-- Extraction is required by the worker. Stage Four is an optional, separately
-- reviewed subsystem and is deliberately absent in the production baseline.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The worker reads master facts before extraction. Production already has this
-- grant; the historical fresh baseline predates explicit service-role grants.
-- Keep the required read permission reproducible without granting writes.
grant select on public.events to service_role;

create or replace function public.get_source_monitor_runtime_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $capabilities$
  with extraction_tables(relation_name) as (
    values ('public.events'), ('public.event_editions'),
      ('public.event_change_proposals'), ('public.event_field_controls')
  ), extraction_columns(relation_name, column_name) as (
    values
      ('public.event_change_proposals', 'field_name'),
      ('public.event_change_proposals', 'normalized_value'),
      ('public.event_change_proposals', 'crawl_id'),
      ('public.event_change_proposals', 'evidence'),
      ('public.event_field_controls', 'edition_id'),
      ('public.event_field_controls', 'field_name'),
      ('public.event_field_controls', 'is_locked'),
      ('public.event_field_controls', 'manual_value'),
      ('public.event_field_controls', 'lock_reason'),
      ('public.event_field_controls', 'lock_expires_at'),
      ('public.event_field_controls', 'source_priority')
  ), optional_functions(capability, signature, required_tables, required_functions) as (
    values
      ('stage_four_simulation', 'public.simulate_stage_four_for_crawl(bigint)',
        array['public.stage_four_settings', 'public.automation_decisions',
          'public.automation_policies', 'public.automation_scope_controls',
          'public.source_reliability_metrics', 'public.country_rollouts',
          'public.stage_four_audit_log'],
        array['private.stage_four_actor_allowed()',
          'public.evaluate_change_proposal_automation(uuid,boolean)']),
      ('stage_four_automation', 'public.record_stage_four_crawl_automation(bigint)',
        array['public.stage_four_settings', 'public.automation_decisions',
          'public.automation_policies', 'public.automation_scope_controls',
          'public.source_reliability_metrics', 'public.country_rollouts',
          'public.stage_four_audit_log', 'public.stage_four_usage_daily'],
        array[]::text[]),
      ('stage_four_shadow', 'public.record_stage_four_shadow_observations(bigint)',
        array['public.stage_four_settings', 'public.stage_four_observation_runs',
          'public.stage_four_observations', 'public.stage_four_pilot_sources',
          'public.stage_four_audit_log', 'public.automation_decisions',
          'public.source_reliability_metrics', 'public.country_rollouts',
          'public.automation_scope_controls'],
        array['private.stage_four_observation_block_reason(uuid,text,text,text,text)',
          'private.stage_four_country_code(text)'])
  )
  select jsonb_build_object(
    'schema_version', 1,
    'extraction_review',
      coalesce((select bool_and(coalesce(has_table_privilege(
        'service_role', to_regclass(relation_name), 'SELECT'), false))
        from extraction_tables), false)
      and not exists (
        select 1 from extraction_columns expected
        where not exists (
          select 1 from pg_attribute actual
          where actual.attrelid = to_regclass(expected.relation_name)
            and actual.attname = expected.column_name
            and actual.attnum > 0 and not actual.attisdropped
        )
      )
      and coalesce(has_function_privilege('service_role',
        to_regprocedure('public.record_extraction_proposals(uuid,bigint,jsonb,text)'),
        'EXECUTE'), false)
  ) || (
    select jsonb_object_agg(capability,
      coalesce(has_function_privilege('service_role',
        to_regprocedure(signature), 'EXECUTE'), false)
      and not exists (
        select 1 from unnest(required_tables) dependency(relation_name)
        where to_regclass(dependency.relation_name) is null
      )
      and not exists (
        select 1 from unnest(required_functions) dependency(function_signature)
        -- Resolve private helpers through catalog metadata. to_regprocedure on
        -- a private schema would require USAGE for this invoker-only RPC.
        where not exists (
          select 1 from pg_proc helper
          join pg_namespace namespace on namespace.oid = helper.pronamespace
          where namespace.nspname || '.' || helper.proname || '(' ||
            replace(oidvectortypes(helper.proargtypes), ', ', ',') || ')'
            = dependency.function_signature
        )
      )
    ) from optional_functions
  );
$capabilities$;

revoke all on function public.get_source_monitor_runtime_capabilities()
  from public, anon, authenticated;
grant execute on function public.get_source_monitor_runtime_capabilities()
  to service_role;

comment on function public.get_source_monitor_runtime_capabilities() is
  'Read-only service-worker schema contract. Presence is not an automation or publication authorization.';

notify pgrst, 'reload schema';
commit;
