-- Legacy admin-role baseline.
-- For the closed beta use migrations/20260608_closed_beta_security.sql instead.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Keep the submitted-event table predictable for the frontend and RLS.
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
  add column if not exists data_source text,
  add column if not exists image text,
  add column if not exists status text not null default 'pending',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.events
  alter column created_by set default auth.uid();

alter table public.events
  drop constraint if exists events_status_check;

alter table public.events
  add constraint events_status_check
  check (status in ('pending', 'approved', 'rejected'));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Remove previously created broad policies before installing the locked-down set.
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can create own profile" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Public can read approved events" on public.events;
drop policy if exists "Authenticated users can submit pending events" on public.events;
drop policy if exists "Users can read own submitted events" on public.events;
drop policy if exists "Admins can update events" on public.events;
drop policy if exists "Admins can delete events" on public.events;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "Users can create own profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and role = 'user'
);

create policy "Admins can update profiles"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Recommended events policies. Adjust column names if your events table differs.
alter table public.events enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert on public.events to authenticated;
grant update on public.events to authenticated;
grant select, insert, update on public.profiles to authenticated;

create policy "Public can read approved events"
on public.events
for select
to anon, authenticated
using (status = 'approved' or public.is_admin());

create policy "Authenticated users can submit pending events"
on public.events
for insert
to authenticated
with check (
  status = 'pending'
  and created_by = auth.uid()
);

create policy "Users can read own submitted events"
on public.events
for select
to authenticated
using (
  status = 'approved'
  or created_by = auth.uid()
  or public.is_admin()
);

create policy "Admins can update events"
on public.events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete events"
on public.events
for delete
to authenticated
using (public.is_admin());

-- Promote an admin manually by immutable auth user UUID, never by a
-- hard-coded frontend email:
-- update public.profiles
-- set role = 'admin', updated_at = now()
-- where id = 'REPLACE_WITH_AUTH_USER_UUID';
