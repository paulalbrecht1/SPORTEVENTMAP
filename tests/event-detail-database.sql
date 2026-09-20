-- Synthetic local-only knowledge integration fixtures. No real event facts are
-- verified here. The local RLS runner sets the guard and every write rolls back.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
do $$ begin
  if current_setting('sporteventmap.test_local_detail', true) is distinct from 'isolated' then
    raise exception 'Run knowledge fixtures through the local-only RLS runner';
  end if;
end $$;

create temporary table detail_checks(label text primary key) on commit drop;
grant select, insert on detail_checks to anon;
create function pg_temp.detail_assert(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'DETAIL REGRESSION: %', label; end if;
  insert into pg_temp.detail_checks values(label);
end $$;

do $tests$
declare
  marker text := 'detail-database-test-' || gen_random_uuid()::text;
  brand_id bigint;
  other_brand_id bigint;
  previous_id uuid;
  successor_id uuid;
  brand_detail_id uuid;
  historical_detail_id uuid;
  successor_detail_id uuid;
  previous_before jsonb;
  historical_before jsonb;
  rejected boolean;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.events (
    event_name, sport, date, city, country, event_url, status, publication_status,
    event_status, verification_status
  ) values (
    marker, 'Running', '01.01.2025', 'Berlin', 'Germany',
    'https://example.invalid/' || marker, 'approved', 'published', 'active', 'unverified'
  ) returning id into brand_id;
  insert into public.events (
    event_name, sport, date, city, country, event_url, status, publication_status,
    event_status, verification_status
  ) values (
    marker || '-other', 'Running', '01.01.2025', 'Hamburg', 'Germany',
    'https://example.invalid/' || marker || '-other', 'approved', 'published', 'active', 'unverified'
  ) returning id into other_brand_id;
  select id into strict previous_id from public.event_editions where event_id = brand_id;
  update public.event_editions set edition_status = 'completed', discovery_status = 'detail_only',
    publication_status = 'published', legacy_distance = '42.195 km',
    race_formats = '[{"label":"Marathon","distance_km":42.195}]'::jsonb
  where id = previous_id;
  insert into public.event_details (
    event_slug, event_name, knowledge_scope, event_brand_id, is_public
  ) values (marker, marker, 'brand', brand_id, true) returning id into brand_detail_id;
  insert into public.event_details (
    event_slug, event_name, knowledge_scope, event_brand_id, edition_id, is_public,
    verification_status, last_checked
  ) values (marker || '-2025', marker, 'edition', brand_id, previous_id, true,
    'verified_official_source', date '2025-01-01') returning id into historical_detail_id;
  insert into public.event_race_day (event_detail_id, start_time, total_cutoff)
    values (historical_detail_id, '09:00', '6 hours');
  insert into public.event_detail_sources (
    event_detail_id, field_path, source_url, source_type, last_verified, confidence_score
  ) values (historical_detail_id, 'race_day.start_time,race_day.total_cutoff',
    'https://example.invalid/' || marker || '/2025/race-day', 'official', date '2025-01-01', 1);
  select to_jsonb(ed) into previous_before from public.event_editions ed where id = previous_id;
  select to_jsonb(d) into historical_before from public.event_details d where id = historical_detail_id;

  insert into public.event_editions (
    event_id, edition_year, edition_slug, start_date, end_date, edition_status,
    publication_status, predecessor_edition_id, legacy_event_key
  ) values (brand_id, 2026, marker || '-2026', date '2026-01-01', date '2026-01-01',
    'completed', 'draft', previous_id, marker || '|2026') returning id into successor_id;
  insert into public.event_details (
    event_slug, event_name, knowledge_scope, event_brand_id, edition_id, is_public
  ) values (marker || '-2026', marker, 'edition', brand_id, successor_id, false)
    returning id into successor_detail_id;
  insert into public.event_detail_sources (event_detail_id, field_path, source_url, source_type)
    values (successor_detail_id, 'race_day.start_time', 'https://example.invalid/' || marker || '/2026', 'official');

  perform pg_temp.detail_assert((select count(*) = 3 from public.event_details where event_brand_id = brand_id),
    'permanent brand and separate edition slugs coexist');
  perform pg_temp.detail_assert((select to_jsonb(ed) = previous_before from public.event_editions ed where id = previous_id),
    'successor knowledge preserves the complete historical edition');
  perform pg_temp.detail_assert((select to_jsonb(d) = historical_before from public.event_details d where id = historical_detail_id),
    'successor knowledge preserves historical knowledge and verification');
  perform pg_temp.detail_assert((select last_checked is null from public.event_details where id = successor_detail_id),
    'new knowledge does not inherit a verification timestamp');
  perform pg_temp.detail_assert(not exists(select 1 from public.event_race_day where event_detail_id = successor_detail_id),
    'new edition does not inherit previous start time or cutoff');
  perform pg_temp.detail_assert(exists(select 1 from public.event_detail_sources
    where event_detail_id = historical_detail_id and field_path = 'race_day.start_time,race_day.total_cutoff'
      and source_type = 'official' and last_verified = date '2025-01-01'
      and source_url = 'https://example.invalid/' || marker || '/2025/race-day'),
    'field-level provenance and actual supplied source date round trip');

  rejected := false;
  begin
    insert into public.event_details (event_slug,event_name,knowledge_scope,event_brand_id,edition_id)
      values (marker || '-wrong-parent',marker,'edition',other_brand_id,previous_id);
  exception when check_violation then rejected := true;
  end;
  perform pg_temp.detail_assert(rejected,'cross-brand edition knowledge insertion rejected');
  rejected := false;
  begin
    update public.event_details set event_brand_id = other_brand_id where id = historical_detail_id;
  exception when check_violation then rejected := true;
  end;
  perform pg_temp.detail_assert(rejected,'cross-brand edition knowledge relinking rejected');
  rejected := false;
  begin
    insert into public.event_details (event_slug,event_name,knowledge_scope,event_brand_id)
      values (marker,marker,'brand',brand_id);
  exception when unique_violation then rejected := true;
  end;
  perform pg_temp.detail_assert(rejected,'duplicate knowledge slug rejected');

  perform pg_temp.detail_assert((select count(*) = 2 from pg_class
    where oid in ('public.public_event_discovery'::regclass,'public.public_event_archive'::regclass)
      and 'security_invoker=true' = any(reloptions)),
    'detail projection preserves both security-invoker views');
  perform pg_temp.detail_assert(exists(select 1 from public.public_event_archive v
    join public.events e on e.id = v.event_id
    join public.event_editions ed on ed.id = v.edition_id and ed.event_id = e.id
    where ed.id = previous_id and
      row(v.organizer_name,v.organizer_url,v.official_url,v.registration_url,
        v.brand_verification_status,v.brand_last_verified_at,
        v.edition_verification_status,v.edition_last_verified_at)
      is not distinct from row(e.organizer_name,e.organizer_url,e.official_url,ed.registration_url,
        e.verification_status,e.last_verified_at,ed.verification_status,ed.last_verified_at)),
    'detail source and verification aliases resolve to the exact brand and edition');

  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  perform pg_temp.detail_assert((select count(*) = 2 from public.event_details
    where id in (brand_detail_id,historical_detail_id,successor_detail_id)),
    'anonymous knowledge reads expose only public records');
  perform pg_temp.detail_assert((select count(*) = 1 from public.event_detail_sources
    where event_detail_id in (historical_detail_id,successor_detail_id)),
    'anonymous source reads hide private edition provenance');
  perform pg_temp.detail_assert((select count(*) = 1 from public.event_race_day
    where event_detail_id = historical_detail_id),
    'anonymous readers can load published structured race-day data');
  execute 'reset role';
end;
$tests$;
select count(*) as passed_assertions from detail_checks;
rollback;
