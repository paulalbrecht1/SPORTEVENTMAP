-- Legacy submissions may seed their first edition. Once an edition is published
-- or independently edited, the edition/review workflow owns its facts. A crawl
-- updating master review metadata must never flatten its formats or reset its
-- actual verification time. No existing facts are repaired by this migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.sync_legacy_event_edition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  parsed_date date := private.try_parse_event_date(new.date);
  target_year smallint := coalesce(
    extract(year from parsed_date)::smallint,
    nullif(substring(new.date from '(20\d{2})'), '')::smallint,
    extract(year from new.created_at)::smallint
  );
  previous_date date;
  previous_year smallint;
  seed public.event_editions%rowtype;
  editable_seed boolean;
begin
  if tg_op = 'UPDATE' then
    previous_date := private.try_parse_event_date(old.date);
    previous_year := coalesce(extract(year from previous_date)::smallint,
      nullif(substring(old.date from '(20\d{2})'), '')::smallint,
      extract(year from old.created_at)::smallint);

    -- Mere metadata writes (including source failures and review signals) do not
    -- own edition facts, verification or lifecycle. No missing row is recreated.
    if row(old.date, old.distance, old.event_url, old.source_url, old.status, old.registration_status)
       is not distinct from
       row(new.date, new.distance, new.event_url, new.source_url, new.status, new.registration_status) then
      return new;
    end if;

    select * into seed from public.event_editions
      where event_id = new.id and edition_year = previous_year for update;
    editable_seed := found
      and old.publication_status = 'draft'
      and old.status in ('pending', 'staging', 'needs_review', 'date_expected')
      and seed.publication_status = 'draft'
      and seed.predecessor_edition_id is null
      and seed.generated_from_source_id is null
      and seed.generated_from_candidate_id is null
      and seed.last_verified_source_id is null
      and seed.last_verified_at is null
      and (
        (seed.edition_status not in ('completed', 'cancelled', 'inactive')
          and (seed.start_date is null or seed.start_date >= current_date))
        -- An untouched historical submission may receive its first approval,
        -- but not a simultaneous correction or any copied/new historical fact.
        or (seed.edition_status = 'completed' and parsed_date < current_date
          and new.status = 'approved' and new.publication_status = 'published'
          and row(old.date, old.distance, old.event_url, old.source_url, old.registration_status)
            is not distinct from row(new.date, new.distance, new.event_url, new.source_url, new.registration_status))
      )
      and seed.start_date is not distinct from previous_date
      and seed.end_date is not distinct from previous_date
      and seed.registration_url is not distinct from nullif(btrim(old.event_url), '')
      and seed.registration_status = case old.registration_status
        when 'registration_open' then 'registration_open' when 'sold_out' then 'sold_out'
        when 'registration_not_open' then 'registration_not_open' when 'cancelled' then 'cancelled' else 'unknown' end
      and seed.source_url is not distinct from coalesce(nullif(btrim(old.source_url), ''), nullif(btrim(old.event_url), ''))
      and seed.start_time is null and seed.price_min is null and seed.price_max is null
      and seed.participant_limit is null and seed.price_details = '{}'::jsonb
      and seed.race_formats = case when nullif(btrim(old.distance), '') is null
        then '[]'::jsonb else jsonb_build_array(jsonb_build_object('label', btrim(old.distance))) end
      and (select count(*) = 1 from public.event_editions where event_id = new.id)
      and not exists (select 1 from public.edition_results where event_id = new.id)
      and not exists (select 1 from public.edition_succession_candidates where event_id = new.id)
      and not exists (select 1 from public.event_details where edition_id = seed.id);

    if target_year is distinct from previous_year
       or (not coalesce(editable_seed, false) and parsed_date is distinct from previous_date) then
      raise exception 'Legacy date changes cannot replace an edition; use the exact edition review or next-edition candidate workflow'
        using errcode = '23514';
    end if;
    if not coalesce(editable_seed, false) then
      if old.publication_status = 'draft' and new.publication_status = 'published'
         and seed.publication_status = 'draft' then
        raise exception 'Independently maintained editions require the edition review workflow for publication'
          using errcode = '23514';
      end if;
      return new;
    end if;

    -- Preserve the existing pending-submission editor and its first approval.
    -- Only changed input facts are synchronized; reviewed metadata is never
    -- copied from the master. Existing edition guards invalidate changed facts.
    update public.event_editions set
      start_date = parsed_date,
      end_date = parsed_date,
      registration_url = case when old.event_url is distinct from new.event_url
        then nullif(btrim(new.event_url), '') else seed.registration_url end,
      registration_status = case when old.registration_status is not distinct from new.registration_status
        then seed.registration_status else case new.registration_status
          when 'registration_open' then 'registration_open' when 'sold_out' then 'sold_out'
          when 'registration_not_open' then 'registration_not_open' when 'cancelled' then 'cancelled'
          else 'unknown' end end,
      edition_status = case when new.status in ('rejected', 'duplicate', 'archived') then 'inactive'
        when parsed_date is null then 'date_unconfirmed' when parsed_date < current_date then 'completed' else 'scheduled' end,
      publication_status = new.publication_status,
      race_formats = case when old.distance is not distinct from new.distance then seed.race_formats
        when nullif(btrim(new.distance), '') is null then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object('label', btrim(new.distance))) end,
      legacy_distance = case when old.distance is distinct from new.distance
        then nullif(btrim(new.distance), '') else seed.legacy_distance end,
      source_url = coalesce(nullif(btrim(new.source_url), ''), nullif(btrim(new.event_url), ''))
    where id = seed.id;
    return new;
  end if;

  insert into public.event_editions (
    event_id, edition_year, edition_slug, legacy_event_key, start_date, end_date,
    registration_url, registration_status, edition_status, publication_status,
    race_formats, legacy_distance, source_url, verification_status, data_confidence,
    needs_review, review_priority, last_verified_at, next_check_at, created_at, updated_at
  ) values (
    new.id, target_year, new.slug || '-' || target_year,
    lower(btrim(coalesce(new.event_name, '')) || '|' || btrim(coalesce(new.date, '')) || '|' ||
      btrim(coalesce(new.city, '')) || '|' || btrim(coalesce(new.country, ''))),
    parsed_date, parsed_date, nullif(btrim(new.event_url), ''),
    case new.registration_status when 'registration_open' then 'registration_open' when 'sold_out' then 'sold_out'
      when 'registration_not_open' then 'registration_not_open' when 'cancelled' then 'cancelled' else 'unknown' end,
    case when new.status in ('rejected', 'duplicate', 'archived') then 'inactive'
      when parsed_date is null then 'date_unconfirmed' when parsed_date < current_date then 'completed' else 'scheduled' end,
    new.publication_status,
    case when nullif(btrim(new.distance), '') is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('label', btrim(new.distance))) end,
    nullif(btrim(new.distance), ''), coalesce(nullif(btrim(new.source_url), ''), nullif(btrim(new.event_url), '')),
    'needs_review', new.data_confidence, true, 'high', null, now(), new.created_at, new.updated_at
  );
  return new;
end;
$$;
revoke all on function private.sync_legacy_event_edition() from public, anon, authenticated;

-- These master links/registration fields previously relied on the unsafe sync
-- for invalidation. Keep the established current-edition invalidation path;
-- historical facts and their original verification timestamps stay intact.
create or replace function private.invalidate_freshness_from_event_fact_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if row(old.event_name, old.canonical_name, old.city, old.country, old.address,
      old.latitude, old.longitude, old.sport, old.distance, old.description,
      old.status, old.publication_status, old.event_status, old.event_url,
      old.source_url, old.official_url, old.registration_status)
     is distinct from
     row(new.event_name, new.canonical_name, new.city, new.country, new.address,
      new.latitude, new.longitude, new.sport, new.distance, new.description,
      new.status, new.publication_status, new.event_status, new.event_url,
      new.source_url, new.official_url, new.registration_status) then
    perform private.invalidate_current_edition_freshness(new.id, null, 'high');
  end if;
  return new;
end;
$$;
revoke all on function private.invalidate_freshness_from_event_fact_change() from public, anon, authenticated;
drop trigger if exists events_invalidate_freshness_on_fact_change on public.events;
create trigger events_invalidate_freshness_on_fact_change
after update of event_name, canonical_name, city, country, address, latitude,
  longitude, sport, distance, description, status, publication_status, event_status,
  event_url, source_url, official_url, registration_status
on public.events
for each row execute function private.invalidate_freshness_from_event_fact_change();

comment on function private.sync_legacy_event_edition() is
  'Seeds the first legacy submission edition; never overwrites published/historical editions or copies verification metadata on master updates.';
commit;
