-- Read-only checks for the closed-beta Supabase project.
-- Run after 20260608_closed_beta_security.sql.

select
  procedure.oid::regprocedure::text as function_signature,
  procedure.prosecdef as security_definer,
  has_function_privilege('public', procedure.oid, 'execute') as public_can_execute,
  has_function_privilege('anon', procedure.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', procedure.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', procedure.oid, 'execute') as service_role_can_execute
from pg_proc procedure
join pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'run_event_validation',
    'verify_event_source_cron_secret'
  )
order by function_signature;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles',
    'events',
    'favorites',
    'season_planner_events',
    'analytics_events',
    'user_feedback'
  )
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'events',
    'favorites',
    'season_planner_events',
    'analytics_events',
    'user_feedback'
  )
order by tablename, cmd, policyname;

select
  routine_schema,
  routine_name,
  security_type
from information_schema.routines
where routine_schema in ('public', 'private')
order by routine_schema, routine_name;

select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'profiles',
    'events',
    'favorites',
    'season_planner_events',
    'analytics_events',
    'user_feedback'
  )
order by table_name, grantee, privilege_type;

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'events'
  and column_name in (
    'status',
    'registration_status',
    'status_note',
    'last_checked',
    'review_priority',
    'needs_review',
    'reviewed_at',
    'reviewed_by',
    'updated_at'
  )
order by column_name;
