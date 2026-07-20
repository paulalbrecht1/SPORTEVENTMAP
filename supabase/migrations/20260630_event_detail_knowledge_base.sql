-- Event Knowledge Base foundation for Sport Event Map detail pages.
-- This migration prepares normalized, admin-maintainable detail data without
-- changing the existing CSV-driven public map.
--
-- Notes:
-- - event_id is intentionally text for backward compatibility with the current
--   CSV/Supabase event key situation.
-- - event_slug is stored explicitly because current static pages are slug-based.
-- - Public reads are allowed only when is_public = true.
-- - Admin writes use the existing private.is_admin() helper from the closed beta
--   security migration.

create extension if not exists pgcrypto;

create table if not exists public.event_details (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  event_slug text not null unique,
  event_name text not null,
  sport_type text,
  event_series text,
  date text,
  city text,
  country text,
  region text,
  organizer text,
  official_website text,
  registration_url text,
  first_edition text,
  event_status text,
  verification_status text not null default 'draft',
  is_public boolean not null default false,
  last_checked date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_registration (
  id uuid primary key default gen_random_uuid(),
  event_detail_id uuid not null references public.event_details(id) on delete cascade,
  registration_status text,
  registration_open_date text,
  registration_close_date text,
  entry_fee_min text,
  entry_fee_max text,
  currency text,
  price_tiers jsonb not null default '[]'::jsonb,
  lottery_available boolean,
  qualification_required text,
  charity_entries boolean,
  waiting_list text,
  transfer_possible text,
  refund_policy text,
  participant_limit text,
  sold_out_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_course (
  id uuid primary key default gen_random_uuid(),
  event_detail_id uuid not null references public.event_details(id) on delete cascade,
  distances jsonb not null default '[]'::jsonb,
  main_distance text,
  course_type text,
  course_character text,
  surface text,
  elevation_gain text,
  elevation_loss text,
  start_location text,
  finish_location text,
  start_finish_same_place boolean,
  loop_course boolean,
  point_to_point boolean,
  course_record_male text,
  course_record_female text,
  gpx_url text,
  elevation_profile_url text,
  course_map_url text,
  difficulty_rating text,
  beginner_friendly text,
  personal_best_potential text,
  scenic_rating text,
  crowd_support_rating text,
  swim_distance text,
  swim_location text,
  swim_type text,
  bike_distance text,
  bike_laps text,
  bike_elevation text,
  bike_character text,
  run_distance text,
  run_laps text,
  run_character text,
  transition_area text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_race_day (
  id uuid primary key default gen_random_uuid(),
  event_detail_id uuid not null references public.event_details(id) on delete cascade,
  total_cutoff text,
  intermediate_cutoffs jsonb not null default '[]'::jsonb,
  start_time text,
  wave_start text,
  aid_stations text,
  pacers_available text,
  timing_system text,
  bag_drop text,
  showers text,
  changing_rooms text,
  toilets text,
  medical_support text,
  live_tracking text,
  livestream text,
  expo_available text,
  bib_pickup_info text,
  swim_cutoff text,
  bike_cutoff text,
  run_cutoff text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_travel (
  id uuid primary key default gen_random_uuid(),
  event_detail_id uuid not null references public.event_details(id) on delete cascade,
  nearest_airport text,
  nearest_train_station text,
  public_transport_info text,
  parking_info text,
  accommodation_info text,
  camping_available text,
  recommended_arrival text,
  recommended_booking_time text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_weather (
  id uuid primary key default gen_random_uuid(),
  event_detail_id uuid not null references public.event_details(id) on delete cascade,
  average_temperature text,
  average_high_temperature text,
  average_low_temperature text,
  average_rainfall text,
  typical_weather text,
  heat_risk text,
  wind_risk text,
  best_conditions_note text,
  seasonal_context text,
  planning_tips text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_statistics (
  id uuid primary key default gen_random_uuid(),
  event_detail_id uuid not null references public.event_details(id) on delete cascade,
  participant_count text,
  finisher_count text,
  women_percentage text,
  average_finish_time text,
  last_winner_male text,
  last_winner_female text,
  last_winning_time_male text,
  last_winning_time_female text,
  historic_significance text,
  notable_facts text,
  world_major boolean,
  utmb_index text,
  boston_qualifier boolean,
  championship_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_editorial (
  id uuid primary key default gen_random_uuid(),
  event_detail_id uuid not null references public.event_details(id) on delete cascade,
  why_this_event_stands_out text,
  course_character text,
  atmosphere text,
  good_fit_for text,
  not_ideal_for text,
  insider_tips text,
  planning_context text,
  seo_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_detail_id uuid not null references public.event_details(id) on delete cascade,
  field_path text,
  source_url text not null,
  source_type text not null default 'unknown',
  source_label text,
  last_verified date,
  confidence_score numeric(3,2),
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sources_type_check
    check (source_type in ('official', 'trusted', 'community', 'estimated', 'unknown')),
  constraint event_sources_confidence_check
    check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1))
);

create table if not exists public.event_faq (
  id uuid primary key default gen_random_uuid(),
  event_detail_id uuid not null references public.event_details(id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order integer not null default 100,
  source_url text,
  last_verified date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_details_slug_idx on public.event_details(event_slug);
create index if not exists event_details_public_idx on public.event_details(is_public, verification_status);
create index if not exists event_registration_detail_idx on public.event_registration(event_detail_id);
create index if not exists event_course_detail_idx on public.event_course(event_detail_id);
create index if not exists event_race_day_detail_idx on public.event_race_day(event_detail_id);
create index if not exists event_travel_detail_idx on public.event_travel(event_detail_id);
create index if not exists event_weather_detail_idx on public.event_weather(event_detail_id);
create index if not exists event_statistics_detail_idx on public.event_statistics(event_detail_id);
create index if not exists event_editorial_detail_idx on public.event_editorial(event_detail_id);
create index if not exists event_sources_detail_idx on public.event_sources(event_detail_id);
create index if not exists event_faq_detail_idx on public.event_faq(event_detail_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
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
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

alter table public.event_details enable row level security;
alter table public.event_registration enable row level security;
alter table public.event_course enable row level security;
alter table public.event_race_day enable row level security;
alter table public.event_travel enable row level security;
alter table public.event_weather enable row level security;
alter table public.event_statistics enable row level security;
alter table public.event_editorial enable row level security;
alter table public.event_sources enable row level security;
alter table public.event_faq enable row level security;

drop policy if exists "Public can read published event details" on public.event_details;
create policy "Public can read published event details"
on public.event_details
for select
to anon, authenticated
using (is_public = true);

drop policy if exists "Admins can manage event details" on public.event_details;
create policy "Admins can manage event details"
on public.event_details
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

do $$
declare
  child_table text;
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
    execute format('drop policy if exists "Public can read published %1$s" on public.%1$I', child_table);
    execute format(
      'create policy "Public can read published %1$s" on public.%1$I for select to anon, authenticated using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true))',
      child_table
    );

    execute format('drop policy if exists "Admins can manage %1$s" on public.%1$I', child_table);
    execute format(
      'create policy "Admins can manage %1$s" on public.%1$I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      child_table
    );
  end loop;
end $$;

grant select on public.event_details to anon, authenticated;
grant select on public.event_registration to anon, authenticated;
grant select on public.event_course to anon, authenticated;
grant select on public.event_race_day to anon, authenticated;
grant select on public.event_travel to anon, authenticated;
grant select on public.event_weather to anon, authenticated;
grant select on public.event_statistics to anon, authenticated;
grant select on public.event_editorial to anon, authenticated;
grant select on public.event_sources to anon, authenticated;
grant select on public.event_faq to anon, authenticated;

grant insert, update, delete on public.event_details to authenticated;
grant insert, update, delete on public.event_registration to authenticated;
grant insert, update, delete on public.event_course to authenticated;
grant insert, update, delete on public.event_race_day to authenticated;
grant insert, update, delete on public.event_travel to authenticated;
grant insert, update, delete on public.event_weather to authenticated;
grant insert, update, delete on public.event_statistics to authenticated;
grant insert, update, delete on public.event_editorial to authenticated;
grant insert, update, delete on public.event_sources to authenticated;
grant insert, update, delete on public.event_faq to authenticated;

comment on table public.event_details is
  'Extended event detail metadata used to power SEO event guide pages.';
comment on table public.event_sources is
  'Field-level source and verification records for event detail information.';
