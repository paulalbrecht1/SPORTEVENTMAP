-- Step 03: Favorites, Season Planner, Feedback and Analytics policies

drop policy if exists "favorites_select_own" on public.favorites;
drop policy if exists "favorites_insert_own" on public.favorites;
drop policy if exists "favorites_delete_own" on public.favorites;

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

drop policy if exists "season_select_own" on public.season_planner_events;
drop policy if exists "season_insert_own" on public.season_planner_events;
drop policy if exists "season_update_own" on public.season_planner_events;
drop policy if exists "season_delete_own" on public.season_planner_events;

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

drop policy if exists "feedback_insert_privacy_safe" on public.user_feedback;
drop policy if exists "feedback_admin_select" on public.user_feedback;
drop policy if exists "feedback_admin_update" on public.user_feedback;
drop policy if exists "feedback_admin_delete" on public.user_feedback;

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

drop policy if exists "analytics_insert_privacy_safe" on public.analytics_events;
drop policy if exists "analytics_admin_select" on public.analytics_events;

create policy "analytics_insert_privacy_safe"
on public.analytics_events
for insert
to anon, authenticated
with check (
  ((select auth.uid()) is null and user_id is null)
  or
  ((select auth.uid()) is not null and (user_id is null or user_id = (select auth.uid())))
);

create policy "analytics_admin_select"
on public.analytics_events
for select
to authenticated
using ((select private.is_admin()));

select 'step 03 private user data done' as result;
