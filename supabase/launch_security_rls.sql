-- Sport Event Map public beta RLS hardening
-- Supabase SQL Editor friendly version.
-- Review table and column names before running.

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = public
as '
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = ''admin''
  );
';

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

alter table if exists public.profiles enable row level security;
alter table if exists public.events enable row level security;
alter table if exists public.favorites enable row level security;
alter table if exists public.season_planner_events enable row level security;
alter table if exists public.user_feedback enable row level security;
alter table if exists public.analytics_events enable row level security;

-- Existing policies are dropped explicitly so this file can be rerun.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own_user_role" on public.profiles;
drop policy if exists "profiles_update_own_without_admin_escalation" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;

drop policy if exists "events_public_read_approved" on public.events;
drop policy if exists "events_users_read_own_submissions" on public.events;
drop policy if exists "events_admin_read_all" on public.events;
drop policy if exists "events_users_insert_pending" on public.events;
drop policy if exists "events_admin_insert" on public.events;
drop policy if exists "events_admin_update" on public.events;
drop policy if exists "events_admin_delete" on public.events;

drop policy if exists "favorites_select_own" on public.favorites;
drop policy if exists "favorites_insert_own" on public.favorites;
drop policy if exists "favorites_delete_own" on public.favorites;

drop policy if exists "season_select_own" on public.season_planner_events;
drop policy if exists "season_insert_own" on public.season_planner_events;
drop policy if exists "season_update_own" on public.season_planner_events;
drop policy if exists "season_delete_own" on public.season_planner_events;

drop policy if exists "feedback_insert_privacy_safe" on public.user_feedback;
drop policy if exists "feedback_admin_select" on public.user_feedback;
drop policy if exists "feedback_admin_update" on public.user_feedback;
drop policy if exists "feedback_admin_delete" on public.user_feedback;

drop policy if exists "analytics_insert_privacy_safe" on public.analytics_events;
drop policy if exists "analytics_admin_select" on public.analytics_events;

-- Profiles: users can only see and edit themselves. Admins can read/update profiles.
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.is_admin())
);

create policy "profiles_insert_own_user_role"
on public.profiles
for insert
to authenticated
with check (
  id = (select auth.uid())
  and coalesce(role, 'user') = 'user'
);

create policy "profiles_update_own_without_admin_escalation"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid())
  and coalesce(role, 'user') = 'user'
);

create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Events: approved events are public. Submissions are pending. Admins manage all.
create policy "events_public_read_approved"
on public.events
for select
to anon, authenticated
using (status = 'approved');

create policy "events_users_read_own_submissions"
on public.events
for select
to authenticated
using (created_by = (select auth.uid()));

create policy "events_admin_read_all"
on public.events
for select
to authenticated
using ((select private.is_admin()));

create policy "events_users_insert_pending"
on public.events
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'pending'
);

create policy "events_admin_insert"
on public.events
for insert
to authenticated
with check ((select private.is_admin()));

create policy "events_admin_update"
on public.events
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "events_admin_delete"
on public.events
for delete
to authenticated
using ((select private.is_admin()));

-- Favorites: private per user.
create policy "favorites_select_own"
on public.favorites
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "favorites_insert_own"
on public.favorites
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "favorites_delete_own"
on public.favorites
for delete
to authenticated
using (user_id = (select auth.uid()));

-- Season Planner: private per user.
create policy "season_select_own"
on public.season_planner_events
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "season_insert_own"
on public.season_planner_events
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "season_update_own"
on public.season_planner_events
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "season_delete_own"
on public.season_planner_events
for delete
to authenticated
using (user_id = (select auth.uid()));

-- Feedback: anyone may create feedback. Only admins may read/update/delete it.
create policy "feedback_insert_privacy_safe"
on public.user_feedback
for insert
to anon, authenticated
with check (
  coalesce(status, 'new') = 'new'
  and internal_notes is null
  and (
    ((select auth.uid()) is null and user_id is null)
    or
    ((select auth.uid()) is not null and (user_id is null or user_id = (select auth.uid())))
  )
);

create policy "feedback_admin_select"
on public.user_feedback
for select
to authenticated
using ((select private.is_admin()));

create policy "feedback_admin_update"
on public.user_feedback
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "feedback_admin_delete"
on public.user_feedback
for delete
to authenticated
using ((select private.is_admin()));

-- Analytics: clients can insert privacy-safe product events. Only admins can read.
create policy "analytics_insert_privacy_safe"
on public.analytics_events
for insert
to anon, authenticated
with check (
  (
    (select auth.uid()) is null
    and user_id is null
  )
  or
  (
    (select auth.uid()) is not null
    and (user_id is null or user_id = (select auth.uid()))
  )
);

create policy "analytics_admin_select"
on public.analytics_events
for select
to authenticated
using ((select private.is_admin()));

-- Conservative privileges. RLS still decides which rows are visible/mutable.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, email, role) on public.profiles to authenticated;
grant update (display_name, preferred_language, updated_at) on public.profiles to authenticated;

revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

revoke all on public.season_planner_events from anon, authenticated;
grant select, insert, update, delete on public.season_planner_events to authenticated;

revoke all on public.user_feedback from anon, authenticated;
grant insert (
  user_id,
  session_id,
  rating,
  category,
  summary,
  message,
  page,
  product_area,
  event_id,
  screenshot_hint
) on public.user_feedback to anon, authenticated;
grant select, update, delete on public.user_feedback to authenticated;

revoke all on public.analytics_events from anon, authenticated;
grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;

grant usage on schema public to anon, authenticated;
grant usage on schema private to anon, authenticated;

-- Optional legacy note:
-- If your database has a separate public.event_submissions table, tell me.
-- The current app primarily uses public.events for pending submissions.

-- Manual admin promotion must be done by the project owner in Supabase:
-- update public.profiles
-- set role = 'admin', updated_at = now()
-- where id = 'REPLACE_WITH_AUTH_USER_UUID';
