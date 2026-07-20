-- Sport Event Map Event Knowledge Base
-- Step 02: Indexes, updated_at trigger, RLS policies and grants.
--
-- Run only after event_knowledge_base_step_01_tables.sql succeeded.
-- Requires the existing private.is_admin() helper from your closed-beta security migration.

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

drop trigger if exists event_details_set_updated_at on public.event_details;
create trigger event_details_set_updated_at
before update on public.event_details
for each row execute function public.set_updated_at();

drop trigger if exists event_registration_set_updated_at on public.event_registration;
create trigger event_registration_set_updated_at
before update on public.event_registration
for each row execute function public.set_updated_at();

drop trigger if exists event_course_set_updated_at on public.event_course;
create trigger event_course_set_updated_at
before update on public.event_course
for each row execute function public.set_updated_at();

drop trigger if exists event_race_day_set_updated_at on public.event_race_day;
create trigger event_race_day_set_updated_at
before update on public.event_race_day
for each row execute function public.set_updated_at();

drop trigger if exists event_travel_set_updated_at on public.event_travel;
create trigger event_travel_set_updated_at
before update on public.event_travel
for each row execute function public.set_updated_at();

drop trigger if exists event_weather_set_updated_at on public.event_weather;
create trigger event_weather_set_updated_at
before update on public.event_weather
for each row execute function public.set_updated_at();

drop trigger if exists event_statistics_set_updated_at on public.event_statistics;
create trigger event_statistics_set_updated_at
before update on public.event_statistics
for each row execute function public.set_updated_at();

drop trigger if exists event_editorial_set_updated_at on public.event_editorial;
create trigger event_editorial_set_updated_at
before update on public.event_editorial
for each row execute function public.set_updated_at();

drop trigger if exists event_sources_set_updated_at on public.event_sources;
create trigger event_sources_set_updated_at
before update on public.event_sources
for each row execute function public.set_updated_at();

drop trigger if exists event_faq_set_updated_at on public.event_faq;
create trigger event_faq_set_updated_at
before update on public.event_faq
for each row execute function public.set_updated_at();

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

drop policy if exists "Public can read published event registration" on public.event_registration;
create policy "Public can read published event registration"
on public.event_registration
for select
to anon, authenticated
using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true));

drop policy if exists "Admins can manage event registration" on public.event_registration;
create policy "Admins can manage event registration"
on public.event_registration
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Public can read published event course" on public.event_course;
create policy "Public can read published event course"
on public.event_course
for select
to anon, authenticated
using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true));

drop policy if exists "Admins can manage event course" on public.event_course;
create policy "Admins can manage event course"
on public.event_course
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Public can read published event race day" on public.event_race_day;
create policy "Public can read published event race day"
on public.event_race_day
for select
to anon, authenticated
using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true));

drop policy if exists "Admins can manage event race day" on public.event_race_day;
create policy "Admins can manage event race day"
on public.event_race_day
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Public can read published event travel" on public.event_travel;
create policy "Public can read published event travel"
on public.event_travel
for select
to anon, authenticated
using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true));

drop policy if exists "Admins can manage event travel" on public.event_travel;
create policy "Admins can manage event travel"
on public.event_travel
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Public can read published event weather" on public.event_weather;
create policy "Public can read published event weather"
on public.event_weather
for select
to anon, authenticated
using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true));

drop policy if exists "Admins can manage event weather" on public.event_weather;
create policy "Admins can manage event weather"
on public.event_weather
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Public can read published event statistics" on public.event_statistics;
create policy "Public can read published event statistics"
on public.event_statistics
for select
to anon, authenticated
using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true));

drop policy if exists "Admins can manage event statistics" on public.event_statistics;
create policy "Admins can manage event statistics"
on public.event_statistics
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Public can read published event editorial" on public.event_editorial;
create policy "Public can read published event editorial"
on public.event_editorial
for select
to anon, authenticated
using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true));

drop policy if exists "Admins can manage event editorial" on public.event_editorial;
create policy "Admins can manage event editorial"
on public.event_editorial
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Public can read published event sources" on public.event_sources;
create policy "Public can read published event sources"
on public.event_sources
for select
to anon, authenticated
using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true));

drop policy if exists "Admins can manage event sources" on public.event_sources;
create policy "Admins can manage event sources"
on public.event_sources
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Public can read published event faq" on public.event_faq;
create policy "Public can read published event faq"
on public.event_faq
for select
to anon, authenticated
using (exists (select 1 from public.event_details d where d.id = event_detail_id and d.is_public = true));

drop policy if exists "Admins can manage event faq" on public.event_faq;
create policy "Admins can manage event faq"
on public.event_faq
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

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
