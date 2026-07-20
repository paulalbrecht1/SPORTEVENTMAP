-- Analytics dashboard v2
-- Adds privacy-safe fields for beta product analytics while keeping the old
-- event_name column for backwards compatibility with existing rows.

alter table if exists public.analytics_events
  add column if not exists event_type text,
  add column if not exists anonymous_id text,
  add column if not exists page text,
  add column if not exists source text;

update public.analytics_events
set event_type = event_name
where event_type is null
  and event_name is not null;

create index if not exists analytics_events_event_type_idx
  on public.analytics_events(event_type);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events(created_at desc);

create index if not exists analytics_events_session_id_idx
  on public.analytics_events(session_id);

create index if not exists analytics_events_anonymous_id_idx
  on public.analytics_events(anonymous_id);

create index if not exists analytics_events_user_id_idx
  on public.analytics_events(user_id);

create index if not exists analytics_events_page_idx
  on public.analytics_events(page);

grant insert (
  event_name,
  event_type,
  user_id,
  anonymous_id,
  session_id,
  event_id,
  page,
  source,
  metadata
) on public.analytics_events to anon, authenticated;

grant select on public.analytics_events to authenticated;

-- Keep analytics write-only for regular clients. Admin read access should be
-- controlled by your existing is_admin() helper/policy from the beta migration.
drop policy if exists "Clients can submit privacy-safe analytics" on public.analytics_events;
create policy "Clients can submit privacy-safe analytics"
on public.analytics_events
for insert
to anon, authenticated
with check (
  user_id is null or auth.uid() = user_id
);
