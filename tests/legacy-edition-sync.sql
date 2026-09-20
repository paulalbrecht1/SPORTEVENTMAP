-- Isolated regression fixtures only. The runner verifies the local container;
-- no source is really verified here and all writes roll back.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
do $$ begin
  if current_setting('sporteventmap.test_local_detail', true) is distinct from 'isolated' then
    raise exception 'Run legacy sync fixtures through the local-only RLS runner';
  end if;
end $$;
create temporary table sync_checks(label text primary key) on commit drop;
create function pg_temp.sync_assert(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'EDITION SYNC REGRESSION: %', label; end if;
  insert into pg_temp.sync_checks values(label);
end $$;

do $tests$
declare
  marker text := 'legacy-sync-test-' || gen_random_uuid()::text;
  brand_id bigint;
  draft_brand_id bigint;
  current_id uuid;
  historical_id uuid;
  draft_id uuid;
  next_id uuid;
  snapshot jsonb;
  history_snapshot jsonb;
  draft_snapshot jsonb;
  rejected boolean;
  first_date date := make_date(extract(year from current_date)::int + 1, 6, 1);
  history_date date := make_date(extract(year from current_date)::int - 1, 6, 1);
  original_verification timestamptz := now() - interval '2 days';
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.events (event_name, sport, date, city, country, distance,
    event_url, status, verification_status, last_verified_at)
  values (marker, 'Running', first_date::text, 'Berlin', 'Germany', '5 km / 10 km',
    'https://example.invalid/' || marker, 'approved', 'verified', now()) returning id into brand_id;
  select id into strict current_id from public.event_editions where event_id = brand_id;
  perform pg_temp.sync_assert((select last_verified_at is null and needs_review and verification_status = 'needs_review'
    from public.event_editions where id = current_id), 'initial legacy seed cannot inherit claimed master verification');

  update public.event_editions set end_date = first_date + 1,
    race_formats = '[{"label":"5 km","distance_km":5},{"label":"10 km","distance_km":10}]',
    registration_url = 'https://example.invalid/edition-registration', registration_status = 'sold_out',
    start_time = '09:30', last_verified_at = original_verification
  where id = current_id;
  -- Synthetic verified state isolates whether a metadata-only write fabricates,
  -- erases or moves a prior verification. It is never used as an attestation.
  perform set_config('app.freshness_verification', 'active', true);
  update public.event_editions set verification_status = 'verified', needs_review = false,
    review_priority = 'low', next_check_at = now() + interval '5 days' where id = current_id;
  perform set_config('app.freshness_verification', '', true);
  select to_jsonb(e) into snapshot from public.event_editions e where id = current_id;

  update public.events set verification_status = 'needs_review', needs_review = true,
    review_priority = 'high', next_check_at = now(), last_verified_at = '2000-01-01' where id = brand_id;
  perform pg_temp.sync_assert((select to_jsonb(e) = snapshot from public.event_editions e where id = current_id),
    'source monitor master metadata preserves the complete structured edition');
  update public.events set distance = distance, event_url = event_url, registration_status = registration_status
    where id = brand_id;
  perform pg_temp.sync_assert((select to_jsonb(e) = snapshot from public.event_editions e where id = current_id),
    'same-value master fact update is an edition no-op');
  update public.events set date = to_char(first_date, 'DD.MM.YYYY') where id = brand_id;
  perform pg_temp.sync_assert((select to_jsonb(e) = snapshot from public.event_editions e where id = current_id),
    'equivalent legacy date formatting preserves edition');

  insert into public.event_editions(event_id, edition_year, edition_slug, legacy_event_key,
    start_date, end_date, publication_status, edition_status, discovery_status, race_formats, results_status)
  values (brand_id, extract(year from history_date), marker || '-history', marker || '|history',
    history_date, history_date, 'published', 'completed', 'detail_only', '[{"label":"Half marathon","distance_km":21.0975}]', 'available')
  returning id into historical_id;
  select to_jsonb(e) into history_snapshot from public.event_editions e where id = historical_id;

  update public.events set event_url = 'https://example.invalid/new-official-link',
    official_url = 'https://example.invalid/new-official-link' where id = brand_id;
  perform pg_temp.sync_assert((select needs_review and verification_status = 'needs_review' and next_check_at <= now()
    from public.event_editions where id = current_id), 'master link change invalidates current edition freshness');
  perform pg_temp.sync_assert((select to_jsonb(e) - array['verification_status','needs_review','review_priority','next_check_at','last_verified_source_id','updated_at']
      = snapshot - array['verification_status','needs_review','review_priority','next_check_at','last_verified_source_id','updated_at']
    from public.event_editions e where id = current_id), 'invalidation retains programme, multi-day dates, registration and original source-check time');
  perform pg_temp.sync_assert((select to_jsonb(e) = history_snapshot from public.event_editions e where id = historical_id),
    'master fact changes preserve historical edition and results status');

  rejected := false;
  begin update public.events set date = (first_date + interval '1 year')::date::text where id = brand_id;
  exception when check_violation then rejected := true; end;
  perform pg_temp.sync_assert(rejected and (select count(*) = 2 from public.event_editions where event_id = brand_id),
    'legacy next-year date cannot create or replace an edition');
  rejected := false;
  begin update public.events set date = (first_date + 7)::text where id = brand_id;
  exception when check_violation then rejected := true; end;
  perform pg_temp.sync_assert(rejected and (select private.try_parse_event_date(date) = first_date from public.events where id = brand_id),
    'published date change requires exact-edition review and rolls back master write');

  insert into public.event_editions(event_id, edition_year, edition_slug, legacy_event_key,
    start_date, end_date, publication_status, edition_status, discovery_status, predecessor_edition_id)
  values (brand_id, extract(year from first_date) + 1, marker || '-next', marker || '|next',
    (first_date + interval '1 year')::date, (first_date + interval '1 year')::date,
    'draft', 'scheduled', 'suppressed', current_id) returning id into next_id;
  perform pg_temp.sync_assert((select to_jsonb(e) = history_snapshot from public.event_editions e where id = historical_id)
    and (select publication_status = 'draft' and last_verified_at is null from public.event_editions where id = next_id),
    'explicit successor remains a separate unverified draft with history intact');
  rejected := false;
  begin insert into public.event_editions(event_id, edition_year, edition_slug, legacy_event_key)
    values (brand_id, extract(year from first_date) + 1, marker || '-duplicate', marker || '|duplicate');
  exception when unique_violation then rejected := true; end;
  perform pg_temp.sync_assert(rejected, 'duplicate edition year remains rejected');

  insert into public.events(event_name, sport, date, city, country, distance, event_url, status)
    values (marker || '-draft', 'Running', first_date::text, 'Berlin', 'Germany', '5 km',
      'https://example.invalid/draft', 'pending') returning id into draft_brand_id;
  select id into strict draft_id from public.event_editions where event_id = draft_brand_id;
  update public.events set date = (first_date + 1)::text, distance = '10 km',
    event_url = 'https://example.invalid/draft-entry', registration_status = 'registration_open',
    last_verified_at = now() where id = draft_brand_id;
  perform pg_temp.sync_assert((select start_date = first_date + 1 and legacy_distance = '10 km'
    and race_formats = '[{"label":"10 km"}]'::jsonb and registration_url = 'https://example.invalid/draft-entry'
    and registration_status = 'registration_open' and last_verified_at is null
    from public.event_editions where id = draft_id), 'untouched private submission remains editable without fake verification');
  update public.events set status = 'approved' where id = draft_brand_id;
  perform pg_temp.sync_assert((select publication_status = 'published' and needs_review and last_verified_at is null
    from public.event_editions where id = draft_id), 'first legacy submission approval remains compatible');
  select to_jsonb(e) into draft_snapshot from public.event_editions e where id = draft_id;
  update public.events set needs_review = false, verification_status = 'verified', last_verified_at = now()
    where id = draft_brand_id;
  perform pg_temp.sync_assert((select to_jsonb(e) = draft_snapshot from public.event_editions e where id = draft_id),
    'master verified label cannot certify the published edition');

  insert into public.events(event_name, sport, date, city, country, distance, event_url, status)
    values (marker || '-historical-submission', 'Running', history_date::text, 'Berlin', 'Germany', '5 km',
      'https://example.invalid/historical-submission', 'pending') returning id into draft_brand_id;
  select id into strict draft_id from public.event_editions where event_id = draft_brand_id;
  select to_jsonb(e) into draft_snapshot from public.event_editions e where id = draft_id;
  rejected := false;
  begin update public.events set date = (history_date + 1)::text, status = 'approved' where id = draft_brand_id;
  exception when check_violation then rejected := true; end;
  update public.events set status = 'approved' where id = draft_brand_id;
  perform pg_temp.sync_assert(rejected and (select publication_status = 'published' and edition_status = 'completed'
    and to_jsonb(e) - array['publication_status','updated_at'] = draft_snapshot - array['publication_status','updated_at']
    from public.event_editions e where id = draft_id),
    'first historical submission approval preserves every historical fact and rejects simultaneous date edits');

  insert into public.events(event_name, sport, date, city, country, distance, event_url, status)
    values (marker || '-owned-draft', 'Running', first_date::text, 'Berlin', 'Germany', '5 km',
      'https://example.invalid/owned-draft', 'pending') returning id into draft_brand_id;
  select id into strict draft_id from public.event_editions where event_id = draft_brand_id;
  update public.event_editions set race_formats = '[{"label":"5 km","distance_km":5}]' where id = draft_id;
  select to_jsonb(e) into draft_snapshot from public.event_editions e where id = draft_id;
  update public.events set distance = '10 km', needs_review = true where id = draft_brand_id;
  perform pg_temp.sync_assert((select to_jsonb(e) = draft_snapshot from public.event_editions e where id = draft_id),
    'independently structured draft cannot be flattened by legacy editor');
  rejected := false;
  begin update public.events set status = 'approved' where id = draft_brand_id;
  exception when check_violation then rejected := true; end;
  perform pg_temp.sync_assert(rejected and (select publication_status = 'draft' from public.event_editions where id = draft_id),
    'independently maintained draft cannot bypass edition publication review');

  delete from public.event_editions where id = draft_id;
  update public.events set needs_review = false where id = draft_brand_id;
  update public.events set event_url = 'https://example.invalid/changed' where id = draft_brand_id;
  perform pg_temp.sync_assert((select count(*) = 0 from public.event_editions where event_id = draft_brand_id),
    'master update never recreates a removed edition');
end;
$tests$;
select count(*) from sync_checks;
rollback;
