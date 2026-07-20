-- Step 01: Core admin helper and RLS activation

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as 'select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin'')';

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

alter table if exists public.profiles enable row level security;
alter table if exists public.events enable row level security;
alter table if exists public.favorites enable row level security;
alter table if exists public.season_planner_events enable row level security;
alter table if exists public.user_feedback enable row level security;
alter table if exists public.analytics_events enable row level security;

select 'step 01 core security done' as result;
