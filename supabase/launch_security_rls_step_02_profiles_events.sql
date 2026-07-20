-- Step 02: Profiles and events policies

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own_user_role" on public.profiles;
drop policy if exists "profiles_update_own_without_admin_escalation" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy "profiles_insert_own_user_role"
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()) and coalesce(role, 'user') = 'user');

create policy "profiles_update_own_without_admin_escalation"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()) and coalesce(role, 'user') = 'user');

create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "events_public_read_approved" on public.events;
drop policy if exists "events_users_read_own_submissions" on public.events;
drop policy if exists "events_admin_read_all" on public.events;
drop policy if exists "events_users_insert_pending" on public.events;
drop policy if exists "events_admin_insert" on public.events;
drop policy if exists "events_admin_update" on public.events;
drop policy if exists "events_admin_delete" on public.events;

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
with check (created_by = (select auth.uid()) and status = 'pending');

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

select 'step 02 profiles and events done' as result;
