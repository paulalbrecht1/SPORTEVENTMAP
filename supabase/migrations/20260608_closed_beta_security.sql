-- Sport Event Map closed-beta security baseline.
-- Review this file, then run it once in the Supabase SQL editor.
-- It is additive and does not delete application data.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user',
  display_name text,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists role text not null default 'user',
  add column if not exists display_name text,
  add column if not exists preferred_language text not null default 'en',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.profiles
set role = 'user'
where role is null;

alter table public.profiles
  alter column role set default 'user',
  alter column role set not null;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin'));

alter table public.profiles
  drop constraint if exists profiles_preferred_language_check;

alter table public.profiles
  add constraint profiles_preferred_language_check
  check (preferred_language in ('en', 'de'));

alter table public.events
  add column if not exists event_name text,
  add column if not exists sport text,
  add column if not exists date text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists distance text,
  add column if not exists description text,
  add column if not exists event_url text,
  add column if not exists source_url text,
  add column if not exists data_source text,
  add column if not exists image text,
  add column if not exists status text not null default 'pending',
  add column if not exists registration_status text not null default 'unclear',
  add column if not exists status_note text,
  add column if not exists last_checked timestamptz,
  add column if not exists review_priority text not null default 'medium',
  add column if not exists needs_review boolean not null default true,
  add column if not exists quality_flags jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.events
  alter column created_by set default auth.uid();

update public.events
set status = 'pending'
where status is null;

alter table public.events
  alter column status set default 'pending',
  alter column status set not null;

alter table public.events
  drop constraint if exists events_status_check;

alter table public.events
  add constraint events_status_check
  check (status in ('pending', 'approved', 'rejected'));

alter table public.events
  drop constraint if exists events_registration_status_check;

alter table public.events
  add constraint events_registration_status_check
  check (
    registration_status in (
      'registration_open',
      'registration_not_open',
      'sold_out',
      'cancelled',
      'date_expected',
      'unclear',
      'confirmed'
    )
  );

alter table public.events
  drop constraint if exists events_review_priority_check;

alter table public.events
  add constraint events_review_priority_check
  check (review_priority in ('high', 'medium', 'low'));

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create table if not exists public.season_planner_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  priority text not null default 'Maybe',
  planned_distance text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.season_planner_events
  drop constraint if exists season_planner_events_priority_check;

alter table public.season_planner_events
  add constraint season_planner_events_priority_check
  check (priority in ('A', 'B', 'C', 'Training', 'Maybe'));

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  event_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  rating integer,
  category text not null default 'other',
  summary text,
  message text not null default '',
  page text,
  product_area text,
  event_id text,
  screenshot_hint text,
  status text not null default 'new',
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_feedback
  add column if not exists category text not null default 'other',
  add column if not exists summary text,
  add column if not exists product_area text,
  add column if not exists event_id text,
  add column if not exists screenshot_hint text,
  add column if not exists status text not null default 'new',
  add column if not exists internal_notes text,
  add column if not exists updated_at timestamptz not null default now();

update public.user_feedback
set summary = left(coalesce(nullif(summary, ''), nullif(message, ''), 'Beta feedback'), 180)
where summary is null or btrim(summary) = '';

alter table public.user_feedback
  alter column summary set not null;

alter table public.user_feedback
  drop constraint if exists user_feedback_rating_check;

alter table public.user_feedback
  add constraint user_feedback_rating_check
  check (rating is null or rating between 1 and 5);

alter table public.user_feedback
  drop constraint if exists user_feedback_category_check;

alter table public.user_feedback
  add constraint user_feedback_category_check
  check (
    category in (
      'bug',
      'usability',
      'incorrect_event_data',
      'missing_event',
      'season_planner',
      'improvement',
      'other'
    )
  );

alter table public.user_feedback
  drop constraint if exists user_feedback_status_check;

alter table public.user_feedback
  add constraint user_feedback_status_check
  check (status in ('new', 'reviewed', 'planned', 'resolved', 'rejected'));

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- Keep the legacy helper unavailable as a public RPC. Policies below use private.is_admin().
do $$
begin
  if to_regprocedure('public.is_admin()') is not null then
    execute 'revoke all on function public.is_admin() from public, anon, authenticated';
  end if;
end
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function private.set_updated_at();

drop trigger if exists season_planner_events_set_updated_at on public.season_planner_events;
create trigger season_planner_events_set_updated_at
before update on public.season_planner_events
for each row execute function private.set_updated_at();

drop trigger if exists user_feedback_set_updated_at on public.user_feedback;
create trigger user_feedback_set_updated_at
before update on public.user_feedback
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.favorites enable row level security;
alter table public.season_planner_events enable row level security;
alter table public.analytics_events enable row level security;
alter table public.user_feedback enable row level security;

-- Remove every previous policy on the protected beta tables. This prevents an
-- older broad policy from remaining active alongside the locked-down set.
do $policy_cleanup$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
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
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$policy_cleanup$;

-- The explicit drops keep this migration readable and harmless on reruns.
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can create own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Public can read approved events" on public.events;
drop policy if exists "Authenticated users can submit pending events" on public.events;
drop policy if exists "Users can read own submitted events" on public.events;
drop policy if exists "Admins can read all events" on public.events;
drop policy if exists "Admins can update events" on public.events;
drop policy if exists "Admins can delete events" on public.events;
drop policy if exists "Users can read own favorites" on public.favorites;
drop policy if exists "Users can add own favorites" on public.favorites;
drop policy if exists "Users can remove own favorites" on public.favorites;
drop policy if exists "Users can read own season" on public.season_planner_events;
drop policy if exists "Users can add own season entries" on public.season_planner_events;
drop policy if exists "Users can update own season entries" on public.season_planner_events;
drop policy if exists "Users can remove own season entries" on public.season_planner_events;
drop policy if exists "Clients can submit privacy-safe analytics" on public.analytics_events;
drop policy if exists "Admins can read analytics" on public.analytics_events;
drop policy if exists "Clients can create feedback" on public.user_feedback;
drop policy if exists "Admins can read feedback" on public.user_feedback;
drop policy if exists "Admins can update feedback" on public.user_feedback;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    id = (select auth.uid())
    or (select private.is_admin())
  )
);

create policy "Users can create own profile"
on public.profiles
for insert
to authenticated
with check (
  id = (select auth.uid())
  and role = 'user'
);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Admins can update profiles"
on public.profiles
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Public can read approved events"
on public.events
for select
to anon, authenticated
using (status = 'approved');

create policy "Users can read own submitted events"
on public.events
for select
to authenticated
using (
  created_by = (select auth.uid())
);

create policy "Admins can read all events"
on public.events
for select
to authenticated
using ((select private.is_admin()));

create policy "Authenticated users can submit pending events"
on public.events
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and created_by = (select auth.uid())
  and status = 'pending'
);

create policy "Admins can update events"
on public.events
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete events"
on public.events
for delete
to authenticated
using ((select private.is_admin()));

create policy "Users can read own favorites"
on public.favorites
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can add own favorites"
on public.favorites
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can remove own favorites"
on public.favorites
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can read own season"
on public.season_planner_events
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can add own season entries"
on public.season_planner_events
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own season entries"
on public.season_planner_events
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can remove own season entries"
on public.season_planner_events
for delete
to authenticated
using (user_id = (select auth.uid()));

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

create policy "Admins can read analytics"
on public.analytics_events
for select
to authenticated
using ((select private.is_admin()));

create policy "Clients can create feedback"
on public.user_feedback
for insert
to anon, authenticated
with check (
  status = 'new'
  and internal_notes is null
  and (
    (
      (select auth.uid()) is null
      and user_id is null
    )
    or
    (
      (select auth.uid()) is not null
      and (user_id is null or user_id = (select auth.uid()))
    )
  )
);

create policy "Admins can read feedback"
on public.user_feedback
for select
to authenticated
using ((select private.is_admin()));

create policy "Admins can update feedback"
on public.user_feedback
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, email, role) on public.profiles to authenticated;
grant update (display_name, preferred_language, updated_at) on public.profiles to authenticated;

revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert (
  event_name,
  sport,
  date,
  city,
  country,
  address,
  latitude,
  longitude,
  distance,
  description,
  event_url,
  status,
  created_by
) on public.events to authenticated;
grant update, delete on public.events to authenticated;

revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

revoke all on public.season_planner_events from anon, authenticated;
grant select, insert, update, delete on public.season_planner_events to authenticated;

revoke all on public.analytics_events from anon, authenticated;
grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;

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
grant select, update on public.user_feedback to authenticated;

grant usage on schema public to anon, authenticated;
grant usage on schema private to anon, authenticated;

create index if not exists events_status_idx
  on public.events (status);
create index if not exists events_created_by_idx
  on public.events (created_by);
create index if not exists events_status_reviewed_at_idx
  on public.events (status, reviewed_at desc);
create index if not exists favorites_user_id_idx
  on public.favorites (user_id);
create index if not exists season_planner_events_user_id_idx
  on public.season_planner_events (user_id);
create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_name_idx
  on public.analytics_events (event_name);
create index if not exists user_feedback_status_created_at_idx
  on public.user_feedback (status, created_at desc);

commit;

-- Promote an admin manually after the migration, using the authenticated user's UUID:
-- update public.profiles
-- set role = 'admin', updated_at = now()
-- where id = 'REPLACE_WITH_AUTH_USER_UUID';
