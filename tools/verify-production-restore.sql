-- Read-only structural and data verification for an isolated restored backup.
with
expected_tables(name) as (
  values
    ('events'),
    ('event_editions'),
    ('event_sources'),
    ('event_detail_sources'),
    ('validation_issues'),
    ('data_workflow_runs'),
    ('data_workflow_alerts'),
    ('source_crawl_jobs'),
    ('source_crawl_results'),
    ('source_review_tasks'),
    ('profiles'),
    ('favorites'),
    ('season_planner_events')
),
expected_views(name) as (
  values
    ('public_event_discovery'),
    ('public_event_archive'),
    ('admin_review_inbox'),
    ('admin_exception_inbox'),
    ('data_operations_health')
),
expected_functions(name) as (
  values
    ('run_event_validation'),
    ('enqueue_source_crawl'),
    ('verify_event_source_cron_secret'),
    ('claim_source_crawl_jobs')
),
expected_rls_tables(name) as (
  values
    ('events'),
    ('event_editions'),
    ('event_sources'),
    ('event_change_proposals'),
    ('source_review_tasks'),
    ('data_workflow_runs'),
    ('profiles'),
    ('favorites'),
    ('season_planner_events')
),
missing_tables as (
  select name from expected_tables
  where to_regclass(format('public.%I', name)) is null
),
missing_views as (
  select expected.name
  from expected_views expected
  where not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = expected.name
      and relation.relkind = 'v'
  )
),
missing_functions as (
  select expected.name
  from expected_functions expected
  where not exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = expected.name
  )
),
missing_rls as (
  select expected.name
  from expected_rls_tables expected
  where not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = expected.name
      and relation.relkind = 'r'
      and relation.relrowsecurity
  )
),
missing_core_policies as (
  select expected.name
  from (values ('profiles'), ('favorites'), ('season_planner_events')) expected(name)
  where not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'public' and policy.tablename = expected.name
  )
),
unsafe_public_views as (
  select relation.relname as name
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'v'
    and relation.relname in ('public_event_discovery', 'public_event_archive')
    and not coalesce(relation.reloptions, '{}'::text[]) @> array['security_invoker=true']
),
validator as (
  select
    procedure.oid,
    procedure.oid::regprocedure::text as signature,
    procedure.prosecdef as security_definer,
    has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
    has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
    has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'run_event_validation'
  order by procedure.oid
  limit 1
)
select jsonb_build_object(
  'verified_at_utc', now(),
  'counts', jsonb_build_object(
    'events', (select count(*) from public.events),
    'event_editions', (select count(*) from public.event_editions),
    'event_sources', (select count(*) from public.event_sources),
    'event_detail_sources', (select count(*) from public.event_detail_sources),
    'validation_issues', (select count(*) from public.validation_issues),
    'data_workflow_runs', (select count(*) from public.data_workflow_runs),
    'data_workflow_alerts', (select count(*) from public.data_workflow_alerts),
    'source_crawl_jobs', (select count(*) from public.source_crawl_jobs),
    'source_crawl_results', (select count(*) from public.source_crawl_results),
    'source_review_tasks', (select count(*) from public.source_review_tasks),
    'profiles', (select count(*) from public.profiles),
    'favorites', (select count(*) from public.favorites),
    'season_planner_events', (select count(*) from public.season_planner_events),
    'auth_users', (select count(*) from auth.users),
    'migration_count', (select count(*) from supabase_migrations.schema_migrations),
    'storage_buckets', (select count(*) from storage.buckets),
    'storage_objects', (select count(*) from storage.objects),
    'storage_buckets_analytics', (select count(*) from storage.buckets_analytics),
    'storage_buckets_vectors', (select count(*) from storage.buckets_vectors),
    'storage_vector_indexes', (select count(*) from storage.vector_indexes),
    'storage_multipart_uploads', (select count(*) from storage.s3_multipart_uploads),
    'storage_multipart_upload_parts', (select count(*) from storage.s3_multipart_uploads_parts)
  ),
  'missing_tables', coalesce((select jsonb_agg(name order by name) from missing_tables), '[]'::jsonb),
  'missing_views', coalesce((select jsonb_agg(name order by name) from missing_views), '[]'::jsonb),
  'missing_functions', coalesce((select jsonb_agg(name order by name) from missing_functions), '[]'::jsonb),
  'missing_rls_tables', coalesce((select jsonb_agg(name order by name) from missing_rls), '[]'::jsonb),
  'missing_core_policies', coalesce((select jsonb_agg(name order by name) from missing_core_policies), '[]'::jsonb),
  'unsafe_public_views', coalesce((select jsonb_agg(name order by name) from unsafe_public_views), '[]'::jsonb),
  'public_policy_count', (select count(*) from pg_policies where schemaname = 'public'),
  'public_constraint_count', (
    select count(*)
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
  ),
  'public_foreign_key_count', (
    select count(*)
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and constraint_row.contype = 'f'
  ),
  'orphan_editions', (
    select count(*)
    from public.event_editions edition
    left join public.events event on event.id = edition.event_id
    where event.id is null
  ),
  'source_edition_event_mismatches', (
    select count(*)
    from public.event_sources source
    join public.event_editions edition on edition.id = source.edition_id
    where source.edition_id is not null and source.event_id <> edition.event_id
  ),
  'public_discovery_rows', (select count(*) from public.public_event_discovery),
  'public_archive_rows', (select count(*) from public.public_event_archive),
  'auto_publish_enabled', coalesce((
    select (to_jsonb(settings)->>'auto_publish_enabled')::boolean
    from public.edition_lifecycle_settings settings where settings.singleton
  ), false),
  'auto_result_publish_enabled', coalesce((
    select (to_jsonb(settings)->>'auto_result_publish_enabled')::boolean
    from public.edition_lifecycle_settings settings where settings.singleton
  ), false),
  'validator', (select to_jsonb(validator) - 'oid' from validator),
  'authenticated_bypass_rls', (select rolbypassrls from pg_roles where rolname = 'authenticated'),
  'service_role_bypass_rls', (select rolbypassrls from pg_roles where rolname = 'service_role')
) as restore_verification;
