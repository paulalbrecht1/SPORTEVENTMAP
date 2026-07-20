-- Add structured personal planning data for Season Planner entries.
-- Additive and backwards-compatible: existing rows receive an empty object.

begin;

alter table public.season_planner_events
  add column if not exists planner_details jsonb not null default '{}'::jsonb;

comment on column public.season_planner_events.planner_details is
  'Structured user-owned Season Planner details: notes, goals, logistics and race results.';

commit;
