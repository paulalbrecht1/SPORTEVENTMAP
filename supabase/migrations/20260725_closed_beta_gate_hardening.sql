-- Closed-beta gate hardening.
--
-- This migration reconciles production-only drift with the versioned schema,
-- removes redundant RLS evaluation, and keeps the existing access model.

begin;

-- The active trigger and policies use the private helpers created by the
-- baseline migration. The public copies predate that baseline and must not be
-- exposed as Data API RPC functions.
drop function if exists public.handle_new_user();
drop function if exists public.is_admin();

-- Later historical migrations attached application triggers to the public
-- helper again. Repoint every affected trigger before removing that RPC-visible
-- function.
do $updated_at_triggers$
declare
  target_table text;
begin
  foreach target_table in array array[
    'events',
    'event_details',
    'event_registration',
    'event_course',
    'event_race_day',
    'event_travel',
    'event_weather',
    'event_statistics',
    'event_editorial',
    'event_sources',
    'event_faq'
  ]
  loop
    execute format(
      'drop trigger if exists %I_set_updated_at on public.%I',
      target_table,
      target_table
    );
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      target_table,
      target_table
    );
  end loop;
end
$updated_at_triggers$;

drop function if exists public.set_updated_at();

-- Remove the older snake-case policy set that remained in production after
-- the canonical human-readable policies were installed.
drop policy if exists analytics_admin_select on public.analytics_events;
drop policy if exists analytics_insert_privacy_safe on public.analytics_events;

drop policy if exists events_admin_delete on public.events;
drop policy if exists events_admin_insert on public.events;
drop policy if exists events_admin_read_all on public.events;
drop policy if exists events_admin_update on public.events;
drop policy if exists events_public_read_approved on public.events;
drop policy if exists events_users_insert_pending on public.events;
drop policy if exists events_users_read_own_submissions on public.events;

drop policy if exists favorites_delete_own on public.favorites;
drop policy if exists favorites_insert_own on public.favorites;
drop policy if exists favorites_select_own on public.favorites;

drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_insert_own_user_role on public.profiles;
drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_update_own_without_admin_escalation on public.profiles;

drop policy if exists season_delete_own on public.season_planner_events;
drop policy if exists season_insert_own on public.season_planner_events;
drop policy if exists season_select_own on public.season_planner_events;
drop policy if exists season_update_own on public.season_planner_events;

drop policy if exists feedback_admin_delete on public.user_feedback;
drop policy if exists feedback_admin_select on public.user_feedback;
drop policy if exists feedback_admin_update on public.user_feedback;
drop policy if exists feedback_insert_privacy_safe on public.user_feedback;

-- Consolidate canonical policies that intentionally granted the same command
-- through several permissive policies. The predicates are OR-combined so the
-- observable access model remains unchanged.
drop policy if exists "Public can read approved events" on public.events;
drop policy if exists "Users can read own submitted events" on public.events;
drop policy if exists "Admins can read all events" on public.events;
drop policy if exists "Authenticated can read accessible events" on public.events;

create policy "Public can read approved events"
on public.events
for select
to anon
using (status = 'approved');

create policy "Authenticated can read accessible events"
on public.events
for select
to authenticated
using (
  status = 'approved'
  or created_by = (select auth.uid())
  or (select private.is_admin())
);

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Authenticated can update accessible profiles"
  on public.profiles;

create policy "Authenticated can update accessible profiles"
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  or (select private.is_admin())
)
with check (
  id = (select auth.uid())
  or (select private.is_admin())
);

-- Recreate the canonical analytics insert policy with init-plan-safe auth
-- checks. Anonymous clients may only submit anonymous rows; signed-in users
-- may submit anonymous rows or rows owned by their own user ID.
drop policy if exists "Clients can submit privacy-safe analytics"
  on public.analytics_events;

create policy "Clients can submit privacy-safe analytics"
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

-- Keep exactly one event-name index. analytics_events_name_idx belongs to the
-- canonical migration chain; analytics_events_event_name_idx was production
-- drift with the same definition.
drop index if exists public.analytics_events_event_name_idx;

-- Event Wiki access previously used one public SELECT policy plus an admin ALL
-- policy. Both applied to authenticated reads. Split management by command and
-- use one SELECT policy per role so the same permissions require less policy
-- evaluation.
drop policy if exists "Public can read published event details"
  on public.event_details;
drop policy if exists "Admins can manage event details"
  on public.event_details;
drop policy if exists sem_public_read_published
  on public.event_details;
drop policy if exists sem_authenticated_read_accessible
  on public.event_details;
drop policy if exists sem_admin_insert
  on public.event_details;
drop policy if exists sem_admin_update
  on public.event_details;
drop policy if exists sem_admin_delete
  on public.event_details;

create policy sem_public_read_published
on public.event_details
for select
to anon
using (is_public = true);

create policy sem_authenticated_read_accessible
on public.event_details
for select
to authenticated
using (is_public = true or (select private.is_admin()));

create policy sem_admin_insert
on public.event_details
for insert
to authenticated
with check ((select private.is_admin()));

create policy sem_admin_update
on public.event_details
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy sem_admin_delete
on public.event_details
for delete
to authenticated
using ((select private.is_admin()));

do $event_wiki_policies$
declare
  child_table text;
  legacy_label text;
begin
  foreach child_table in array array[
    'event_registration',
    'event_course',
    'event_race_day',
    'event_travel',
    'event_weather',
    'event_statistics',
    'event_editorial',
    'event_sources',
    'event_faq'
  ]
  loop
    legacy_label := replace(child_table, '_', ' ');

    -- Handle both the historical space-separated names found in production
    -- and the underscore names produced by the current baseline migration.
    execute format(
      'drop policy if exists %I on public.%I',
      'Public can read published ' || legacy_label,
      child_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'Admins can manage ' || legacy_label,
      child_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'Public can read published ' || child_table,
      child_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'Admins can manage ' || child_table,
      child_table
    );

    execute format(
      'drop policy if exists sem_public_read_published on public.%I',
      child_table
    );
    execute format(
      'drop policy if exists sem_authenticated_read_accessible on public.%I',
      child_table
    );
    execute format(
      'drop policy if exists sem_admin_insert on public.%I',
      child_table
    );
    execute format(
      'drop policy if exists sem_admin_update on public.%I',
      child_table
    );
    execute format(
      'drop policy if exists sem_admin_delete on public.%I',
      child_table
    );

    execute format(
      'create policy sem_public_read_published on public.%I for select to anon using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true))',
      child_table
    );
    execute format(
      'create policy sem_authenticated_read_accessible on public.%I for select to authenticated using ((exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true)) or (select private.is_admin()))',
      child_table
    );
    execute format(
      'create policy sem_admin_insert on public.%I for insert to authenticated with check ((select private.is_admin()))',
      child_table
    );
    execute format(
      'create policy sem_admin_update on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      child_table
    );
    execute format(
      'create policy sem_admin_delete on public.%I for delete to authenticated using ((select private.is_admin()))',
      child_table
    );
  end loop;
end
$event_wiki_policies$;

commit;
