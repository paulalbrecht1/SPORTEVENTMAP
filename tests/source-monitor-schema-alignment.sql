-- LOCAL REGRESSION ONLY. Run with tools/run-source-monitor-schema-alignment.mjs.
-- All users and catalog rows are synthetic. Every database change is rolled back.
-- The runner supplies an explicit Stage Four expectation after checking the local target.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $guard$
begin
  if current_setting('sporteventmap.test_expected_stage_four', true) not in ('absent', 'present')
     or current_setting('sporteventmap.test_expected_stage_four', true) is null then
    raise exception 'Use the isolated local schema-alignment runner';
  end if;
end;
$guard$;

create temporary table sm_regression_checks(label text primary key) on commit drop;
grant insert, select on sm_regression_checks to anon, authenticated, service_role;

create function pg_temp.sm_assert(condition boolean, label text)
returns void language plpgsql as $assert$
begin
  if condition is distinct from true then raise exception 'REGRESSION: %', label; end if;
  insert into pg_temp.sm_regression_checks values (label);
end;
$assert$;

create function pg_temp.sm_rejected(statement text, label text, allowed_states text[])
returns void language plpgsql as $rejected$
declare rejected boolean := false;
begin
  begin
    execute statement;
  exception when others then
    if sqlstate <> all(allowed_states) then
      raise exception 'REGRESSION: % failed for unexpected SQLSTATE %', label, sqlstate;
    end if;
    rejected := true;
  end;
  perform pg_temp.sm_assert(rejected, label);
end;
$rejected$;

do $regression$
#variable_conflict use_variable
declare
  marker text := 'schema-alignment-' || gen_random_uuid()::text;
  admin_id uuid := gen_random_uuid();
  user_id uuid := gen_random_uuid();
  event_id bigint;
  other_event_id bigint;
  edition_id uuid;
  other_edition_id uuid;
  source_id uuid;
  other_source_id uuid;
  job_id uuid;
  crawl_id bigint;
  other_crawl_id bigint;
  proposal_id uuid;
  baseline_proposal_id uuid;
  blocked_proposal_id uuid;
  fixture_date date := current_date + 180;
  payload jsonb;
  result jsonb;
  capabilities jsonb;
  before_event jsonb;
  before_edition jsonb;
  after_edition jsonb;
  rejected_before jsonb;
  stage_four_before jsonb;
  stage_four_after jsonb;
  field_spec jsonb;
  hostile_specs jsonb := '[
    {"entity":"event","field":"verification_status","value":"verified"},
    {"entity":"event","field":"publication_status","value":"published"},
    {"entity":"event","field":"status","value":"approved"},
    {"entity":"event","field":"event_status","value":"scheduled"},
    {"entity":"event","field":"last_verified_at","value":"2099-01-01T00:00:00Z"},
    {"entity":"event","field":"needs_review","value":false},
    {"entity":"edition","field":"verification_status","value":"verified"},
    {"entity":"edition","field":"publication_status","value":"published"},
    {"entity":"edition","field":"edition_status","value":"confirmed"},
    {"entity":"edition","field":"last_verified_at","value":"2099-01-01T00:00:00Z"},
    {"entity":"edition","field":"needs_review","value":false},
    {"entity":"edition","field":"start_date","value":"2099-05-01","change_type":"new_edition"}
  ]';
  edition_count bigint;
  changed_rows bigint;
  expected_stage_four boolean := current_setting('sporteventmap.test_expected_stage_four') = 'present';
begin
  if expected_stage_four then
    execute 'select coalesce(jsonb_agg(to_jsonb(s)),''[]''::jsonb) from public.stage_four_settings s'
      into stage_four_before;
  end if;
  -- Only generated identities are used to exercise administrator authorization.
  insert into auth.users(id, aud, role, email, created_at, updated_at)
  values (admin_id, 'authenticated', 'authenticated', marker || '-admin@example.invalid', now(), now()),
         (user_id, 'authenticated', 'authenticated', marker || '-user@example.invalid', now(), now());
  -- The database-only restore does not install Auth's signup trigger. Create the
  -- matching generated profiles explicitly; a full local stack may already have them.
  insert into public.profiles(id, email, role)
  values (admin_id, marker || '-admin@example.invalid', 'admin'),
         (user_id, marker || '-user@example.invalid', 'user')
  on conflict (id) do update set role = excluded.role;
  perform pg_temp.sm_assert((select count(*) = 2 from public.profiles where id in (admin_id, user_id)),
    'synthetic users have profiles');

  insert into public.events(event_name, date, city, country, sport, address,
    latitude, longitude, distance, description, event_url, status, last_verified_at)
  values(marker, to_char(fixture_date, 'DD.MM.YYYY'), 'Fixture City', 'Deutschland',
    'Running', 'Fixture 1', '48.137', '11.575', '21.1 km', 'Before extraction',
    'https://example.invalid/' || marker, 'approved', '2000-01-01T00:00:00Z')
  returning id into event_id;
  insert into public.events(event_name, date, city, country, sport, address,
    latitude, longitude, distance, description, event_url, status)
  values(marker || '-other', to_char(fixture_date, 'DD.MM.YYYY'), 'Other City', 'Deutschland',
    'Running', 'Fixture 2', '48.137', '11.575', '10 km', 'Other fixture',
    'https://example.invalid/' || marker || '-other', 'approved')
  returning id into other_event_id;
  select e.id into strict edition_id from public.event_editions e
    where e.event_id = event_id and e.edition_year = extract(year from fixture_date)::integer;
  select e.id into strict other_edition_id from public.event_editions e
    where e.event_id = other_event_id and e.edition_year = extract(year from fixture_date)::integer;
  update public.event_editions set
    race_formats = '[{"label":"Half marathon","distance_km":21.0975,"surface":"road"},{"label":"Relay","distance_km":21.0975,"team_size":3}]',
    legacy_distance = 'Half marathon and relay', last_verified_at = '2001-01-01T00:00:00Z',
    data_confidence = 0.432
    where id = edition_id;
  select count(*) into edition_count from public.event_editions e where e.event_id = event_id;

  insert into public.event_sources(event_id, edition_id, source_type, source_url, parser_type,
    is_active, crawl_status, consecutive_failures)
  values(event_id, edition_id, 'official_event_website', 'https://example.invalid/' || marker,
    'json_ld', true, 'success', 0) returning id into source_id;
  insert into public.event_sources(event_id, edition_id, source_type, source_url, parser_type,
    is_active, crawl_status, consecutive_failures)
  values(other_event_id, other_edition_id, 'official_event_website',
    'https://example.invalid/' || marker || '-other', 'json_ld', true, 'success', 0)
  returning id into other_source_id;
  insert into public.source_crawl_jobs(source_id, event_id, edition_id, status,
    idempotency_key, trigger_source, attempt_count, completed_at)
  values(source_id, event_id, edition_id, 'completed', marker, 'test', 1, now())
  returning id into job_id;
  insert into public.source_crawl_results(job_id, source_id, event_id, edition_id,
    attempt_number, http_status, final_url, change_status, worker_version, processing_status, content_hash)
  values(job_id, source_id, event_id, edition_id, 1, 200, 'https://example.invalid/' || marker,
    'changed', 'local-regression', 'completed', md5(marker)) returning id into crawl_id;
  insert into public.source_crawl_jobs(source_id, event_id, edition_id, status,
    idempotency_key, trigger_source, attempt_count, completed_at)
  values(other_source_id, other_event_id, other_edition_id, 'completed', marker || '-other', 'test', 1, now())
  returning id into job_id;
  insert into public.source_crawl_results(job_id, source_id, event_id, edition_id,
    attempt_number, http_status, final_url, change_status, worker_version, processing_status, content_hash)
  values(job_id, other_source_id, other_event_id, other_edition_id, 1, 200,
    'https://example.invalid/' || marker || '-other', 'first_seen', 'local-regression', 'completed', md5(marker || '-other'))
  returning id into other_crawl_id;

  select to_jsonb(e) into before_event from public.events e where id = event_id;
  select to_jsonb(e) into before_edition from public.event_editions e where id = edition_id;
  payload := jsonb_build_array(jsonb_build_object('entity_type', 'event', 'field_name', 'description',
    'old_value', before_event->'description', 'proposed_value', 'Extracted fixture description',
    'normalized_value', 'Extracted fixture description', 'change_type', 'updated_value',
    'extraction_method', 'json_ld', 'confidence', 0.95, 'evidence', jsonb_build_object('url', 'https://example.invalid/' || marker)));

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  capabilities := public.get_source_monitor_runtime_capabilities();
  perform pg_temp.sm_assert(capabilities = jsonb_build_object('schema_version', 1, 'extraction_review', true,
    'stage_four_simulation', expected_stage_four, 'stage_four_automation', expected_stage_four,
    'stage_four_shadow', expected_stage_four), 'service capability contract matches explicit schema expectation');
  result := public.record_extraction_proposals(source_id, crawl_id, payload, 'local-regression');
  perform pg_temp.sm_assert((result->>'recorded')::integer = 1, 'service records one pending extraction');
  perform pg_temp.sm_assert((select count(*) = 0 from public.event_field_controls c where c.event_id = event_id),
    'service can read field controls');
  perform pg_temp.sm_rejected(format('select public.record_extraction_proposals(%L,%L,%L::jsonb,%L)',
    source_id, other_crawl_id, payload, 'local-regression'), 'foreign crawl rejected', array['23514','22023','P0002']);
  perform pg_temp.sm_rejected(format('select public.record_extraction_proposals(%L,%L,%L::jsonb,%L)',
    source_id, -9223372036854775807::bigint, payload, 'local-regression'), 'missing crawl rejected', array['23514','22023','P0002']);
  result := public.record_extraction_proposals(source_id, crawl_id, payload, 'local-regression');
  execute 'reset role';
  select p.id into strict proposal_id from public.event_change_proposals p
    where p.event_id = event_id and p.field_name = 'description';
  perform pg_temp.sm_assert((select count(*) = 1 from public.event_change_proposals p
    where p.event_id = event_id and p.field_name = 'description'), 'repeat extraction deduplicates');
  perform pg_temp.sm_assert((select p.proposal_status = 'pending' and p.applied_at is null
    and p.applied_by is null and p.crawl_id = crawl_id from public.event_change_proposals p where p.id = proposal_id),
    'extraction remains unapplied pending review');
  perform pg_temp.sm_assert((select (to_jsonb(e) - 'updated_at') = (before_event - 'updated_at')
    from public.events e where id = event_id), 'extraction does not change master facts or freshness');
  perform pg_temp.sm_assert((select (to_jsonb(e) - 'updated_at') = (before_edition - 'updated_at')
    from public.event_editions e where id = edition_id), 'extraction does not change edition facts or freshness');

  -- Successful HTTP and active-source evidence is required even for the same source.
  update public.event_sources set is_active = false where id = source_id;
  execute 'set local role service_role';
  perform pg_temp.sm_rejected(format('select public.record_extraction_proposals(%L,%L,%L::jsonb,%L)',
    source_id, crawl_id, payload, 'local-regression'), 'inactive source rejected', array['23514','22023','P0002']);
  execute 'reset role';
  update public.event_sources set is_active = true where id = source_id;
  update public.source_crawl_results set http_status = 304, change_status = 'unchanged' where id = crawl_id;
  execute 'set local role service_role';
  perform pg_temp.sm_rejected(format('select public.record_extraction_proposals(%L,%L,%L::jsonb,%L)',
    source_id, crawl_id, payload, 'local-regression'), '304 crawl cannot provide extraction evidence', array['23514','22023','P0002']);
  execute 'reset role';
  update public.source_crawl_results set http_status = 200, change_status = 'changed' where id = crawl_id;
  update public.source_crawl_results set event_id = other_event_id where id = crawl_id;
  execute 'set local role service_role';
  perform pg_temp.sm_rejected(format('select public.record_extraction_proposals(%L,%L,%L::jsonb,%L)',
    source_id, crawl_id, payload, 'local-regression'), 'same-source crawl with wrong event rejected', array['23514','22023','P0002']);
  execute 'reset role';
  update public.source_crawl_results set event_id = event_id, edition_id = other_edition_id where id = crawl_id;
  execute 'set local role service_role';
  perform pg_temp.sm_rejected(format('select public.record_extraction_proposals(%L,%L,%L::jsonb,%L)',
    source_id, crawl_id, payload, 'local-regression'), 'same-source crawl with wrong edition rejected', array['23514','22023','P0002']);
  execute 'reset role';
  update public.source_crawl_results set edition_id = edition_id where id = crawl_id;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role service_role';
  perform pg_temp.sm_rejected(format('select public.record_extraction_proposals(%L,%L,%L::jsonb,%L)',
    source_id, crawl_id, payload, 'local-regression'), 'extraction runtime rejects missing service JWT role', array['42501']);
  execute 'reset role';

  -- Both ACLs and runtime authorization are exercised; no existing user is impersonated.
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform pg_temp.sm_rejected('select public.get_source_monitor_runtime_capabilities()',
    'ordinary user cannot call worker capabilities', array['42501']);
  perform pg_temp.sm_rejected(format('select public.record_extraction_proposals(%L,%L,%L::jsonb,%L)',
    source_id, crawl_id, payload, 'local-regression'), 'ordinary user cannot record extraction', array['42501']);
  perform pg_temp.sm_rejected(format('select public.review_event_change_proposal(%L,%L)', proposal_id, 'accepted'),
    'ordinary user cannot review proposal', array['42501']);
  perform pg_temp.sm_rejected(format('select public.set_event_field_control(%L,null,%L,%L::jsonb,%L)',
    event_id, 'description', '"Forbidden"', 'Fixture reason'), 'ordinary user cannot set field control', array['42501']);
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_event_field_control(event_id, null, 'description', '"Manual fixture"', 'Synthetic regression lock');
  perform pg_temp.sm_assert((select count(*) = 1 from public.event_field_controls c where c.event_id = event_id),
    'administrator can create and read field control');
  perform pg_temp.sm_rejected(format('select public.set_event_field_control(%L,%L,%L,%L::jsonb,%L)',
    event_id, other_edition_id, 'start_date', '"2099-01-01"', 'Wrong fixture parent'),
    'administrator control rejects foreign edition', array['23514']);
  perform pg_temp.sm_rejected(format('select public.set_event_field_control(%L,null,%L,%L::jsonb,%L)',
    event_id, 'verification_status', '"verified"', 'Forbidden fixture metadata'),
    'administrator control cannot attest verification', array['22023']);
  perform pg_temp.sm_rejected(format('select public.review_event_change_proposal(%L,%L)', proposal_id, 'rejected'),
    'rejection needs a reason', array['22023']);
  perform public.review_event_change_proposal(proposal_id, 'rejected', 'Synthetic regression', null, 'Fixture rejection');
  execute 'reset role';
  select jsonb_build_object('status', proposal_status, 'reviewed_at', reviewed_at,
    'reviewed_by', reviewed_by, 'rejection_reason', rejection_reason) into rejected_before
    from public.event_change_proposals where id = proposal_id;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  result := public.record_extraction_proposals(source_id, crawl_id, payload, 'local-regression');
  execute 'reset role';
  perform pg_temp.sm_assert((select jsonb_build_object('status', proposal_status, 'reviewed_at', reviewed_at,
    'reviewed_by', reviewed_by, 'rejection_reason', rejection_reason) = rejected_before
    from public.event_change_proposals where id = proposal_id), 'recent rejection survives repeated extraction');

  perform set_config('request.jwt.claim.sub', user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform pg_temp.sm_assert((select count(*) = 0 from public.event_field_controls c where c.event_id = event_id),
    'ordinary user cannot read administrator field control');
  update public.event_field_controls c set manual_value = '"Forbidden"' where c.event_id = event_id;
  get diagnostics changed_rows = row_count;
  perform pg_temp.sm_assert(changed_rows = 0, 'ordinary user cannot update administrator field control');
  perform pg_temp.sm_rejected(format('insert into public.event_field_controls(event_id,entity_type,field_name,lock_reason) values(%L,%L,%L,%L)',
    event_id, 'event', 'city', 'Forbidden fixture'), 'ordinary user cannot directly insert field control', array['42501']);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  perform pg_temp.sm_rejected('select public.get_source_monitor_runtime_capabilities()',
    'anonymous capabilities denied', array['42501']);
  perform pg_temp.sm_rejected('select id from public.event_field_controls limit 1',
    'anonymous controls read denied', array['42501']);
  perform pg_temp.sm_rejected(format('select public.record_extraction_proposals(%L,%L,%L::jsonb,%L)',
    source_id, crawl_id, payload, 'local-regression'), 'anonymous extraction denied', array['42501']);
  perform pg_temp.sm_rejected(format('select public.review_event_change_proposal(%L,%L)', proposal_id, 'accepted'),
    'anonymous review denied', array['42501']);
  execute 'reset role';

  -- A stale proposal is superseded rather than overwriting the newer fact.
  payload := jsonb_set(payload, '{0,normalized_value}', '"Baseline candidate"');
  payload := jsonb_set(payload, '{0,proposed_value}', '"Baseline candidate"');
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  result := public.record_extraction_proposals(source_id, crawl_id, payload, 'local-regression');
  execute 'reset role';
  select p.id into strict baseline_proposal_id from public.event_change_proposals p
    where p.event_id = event_id and p.normalized_value = '"Baseline candidate"';
  update public.events set description = 'Newer manual fact' where id = event_id;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.review_event_change_proposal(baseline_proposal_id, 'accepted');
  execute 'reset role';
  perform pg_temp.sm_assert((select p.proposal_status = 'superseded' and p.applied_at is null
    from public.event_change_proposals p where id = baseline_proposal_id), 'changed baseline supersedes proposal');
  perform pg_temp.sm_assert((select description = 'Newer manual fact' from public.events where id = event_id),
    'baseline conflict preserves newer master fact');

  -- Accept a different ordinary fact and assert the independent edition survives legacy sync.
  payload := jsonb_build_array(jsonb_build_object('entity_type', 'event', 'field_name', 'city',
    'old_value', before_event->'city', 'proposed_value', 'Accepted fixture city',
    'normalized_value', 'Accepted fixture city', 'change_type', 'updated_value',
    'extraction_method', 'html', 'confidence', 0.93));
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  result := public.record_extraction_proposals(source_id, crawl_id, payload, 'local-regression');
  execute 'reset role';
  select p.id into strict proposal_id from public.event_change_proposals p
    where p.event_id = event_id and p.field_name = 'city';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.apply_event_change_proposal(proposal_id, 'Synthetic factual acceptance');
  execute 'reset role';
  perform pg_temp.sm_assert((select city = 'Accepted fixture city'
    from public.events where id = event_id), 'administrator can accept an ordinary master fact');
  perform pg_temp.sm_assert((select p.proposal_status = 'accepted' and p.applied_at is not null and p.applied_by = admin_id
    from public.event_change_proposals p where id = proposal_id), 'accepted proposal records synthetic reviewer');
  select to_jsonb(e) into after_edition from public.event_editions e where id = edition_id;
  perform pg_temp.sm_assert(after_edition->'race_formats' = before_edition->'race_formats'
    and after_edition->'legacy_distance' = before_edition->'legacy_distance', 'master acceptance preserves structured edition formats');
  perform pg_temp.sm_assert(after_edition->'id' = before_edition->'id'
    and after_edition->'edition_slug' = before_edition->'edition_slug'
    and after_edition->'legacy_event_key' = before_edition->'legacy_event_key'
    and after_edition->'edition_year' = before_edition->'edition_year'
    and (select count(*) = edition_count from public.event_editions e where e.event_id = event_id),
    'master acceptance preserves edition identity and count');
  perform pg_temp.sm_assert(after_edition->'last_verified_at' = before_edition->'last_verified_at'
    and after_edition->'data_confidence' = before_edition->'data_confidence'
    and (select last_verified_at = '2000-01-01T00:00:00Z'::timestamptz from public.events where id = event_id),
    'fact acceptance does not manufacture verification or confidence');
  perform pg_temp.sm_assert((after_edition->>'needs_review')::boolean
    and after_edition->>'verification_status' = 'needs_review'
    and after_edition->'last_verified_source_id' = 'null'::jsonb
    and (select needs_review and verification_status = 'needs_review' from public.events where id = event_id),
    'accepted fact still requires real source verification');

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  result := public.record_extraction_proposals(source_id, crawl_id, payload, 'local-regression');
  execute 'reset role';
  perform pg_temp.sm_assert((result->>'recorded')::integer = 0 and (result->>'skipped')::integer = 1
    and (select p.proposal_status = 'accepted' and p.applied_by = admin_id
      from public.event_change_proposals p where p.id = proposal_id), 'accepted proposal survives repeated extraction');

  -- A rejection may reopen only after the specified review interval, and then
  -- its baseline must come from the current observation rather than stale data.
  select p.id into strict proposal_id from public.event_change_proposals p
    where p.event_id = event_id and p.normalized_value = '"Extracted fixture description"';
  update public.event_change_proposals set reviewed_at = now() - interval '31 days' where id = proposal_id;
  payload := jsonb_build_array(jsonb_build_object('entity_type', 'event', 'field_name', 'description',
    'old_value', 'Newer manual fact', 'proposed_value', 'Extracted fixture description',
    'normalized_value', 'Extracted fixture description', 'change_type', 'updated_value',
    'extraction_method', 'json_ld', 'confidence', 0.95));
  execute 'set local role service_role';
  result := public.record_extraction_proposals(source_id, crawl_id, payload, 'local-regression');
  execute 'reset role';
  perform pg_temp.sm_assert((select p.proposal_status = 'pending' and p.reviewed_at is null
    and p.reviewed_by is null and p.rejection_reason is null and p.old_value = '"Newer manual fact"'
    and p.baseline_values = '{"description":"Newer manual fact"}'::jsonb
    from public.event_change_proposals p where p.id = proposal_id), 'aged rejection reopens with current baseline and cleared review');

  -- Exercise the edition branch with a typed price fact and preserve all other facts.
  select to_jsonb(e) into before_edition from public.event_editions e where id = edition_id;
  payload := jsonb_build_array(jsonb_build_object('entity_type', 'edition', 'field_name', 'price_min',
    'old_value', before_edition->'price_min', 'proposed_value', 25, 'normalized_value', 25,
    'change_type', 'new_value', 'extraction_method', 'json_ld', 'confidence', 0.93));
  execute 'set local role service_role';
  result := public.record_extraction_proposals(source_id, crawl_id, payload, 'local-regression');
  execute 'reset role';
  select p.id into strict proposal_id from public.event_change_proposals p
    where p.event_id = event_id and p.field_name = 'price_min';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.review_event_change_proposal(proposal_id, 'edited_and_accepted', 'Synthetic edition correction', '27.5');
  execute 'reset role';
  select to_jsonb(e) into after_edition from public.event_editions e where id = edition_id;
  perform pg_temp.sm_assert((after_edition->>'price_min')::numeric = 27.5
    and (select p.proposal_status = 'edited_and_accepted' and p.applied_value = '27.5'::jsonb
      from public.event_change_proposals p where id = proposal_id), 'administrator can edit and accept typed edition fact');
  perform pg_temp.sm_assert(after_edition - array['price_min','updated_at'] = before_edition - array['price_min','updated_at'],
    'edition acceptance preserves every other fact, identity and verification value');

  insert into public.event_change_proposals(event_id, edition_id, entity_type, source_id,
    proposal_status, rule_code, field_name, old_value, normalized_value, proposed_value,
    proposed_changes, baseline_values, proposal_fingerprint, change_type, confidence)
  values(event_id, edition_id, 'edition', source_id, 'pending', 'synthetic_cross_year', 'start_date',
    after_edition->'start_date', '"2099-05-01"', '"2099-05-01"', '{"start_date":"2099-05-01"}',
    jsonb_build_object('start_date',after_edition->'start_date'), marker || '-cross-year', 'updated_value', 0.9)
  returning id into blocked_proposal_id;
  execute 'set local role authenticated';
  perform pg_temp.sm_rejected(format('select public.review_event_change_proposal(%L,%L)', blocked_proposal_id, 'accepted'),
    'ordinary date update cannot create a cross-year edition', array['22023']);
  execute 'reset role';

  -- Insert hostile legacy proposals directly as the local fixture owner, then exercise
  -- the real authenticated reviewer: neither field-level nor legacy paths may bypass it.
  for field_spec in select value from jsonb_array_elements(hostile_specs) loop
    insert into public.event_change_proposals(event_id, edition_id, entity_type, source_id,
      proposal_status, rule_code, field_name, old_value, normalized_value, proposed_value,
      proposed_changes, baseline_values, proposal_fingerprint, change_type, confidence)
    values(event_id, case when field_spec->>'entity' = 'edition' then edition_id else null end,
      field_spec->>'entity', source_id, 'pending', 'synthetic_hostile', field_spec->>'field',
      case when field_spec->>'entity' = 'edition' then after_edition->(field_spec->>'field')
        else (select to_jsonb(e)->(field_spec->>'field') from public.events e where id = event_id) end,
      field_spec->'value', field_spec->'value', jsonb_build_object(field_spec->>'field', field_spec->'value'),
      '{}', marker || '-hostile-' || (field_spec->>'entity') || '-' || (field_spec->>'field'),
      coalesce(field_spec->>'change_type', 'updated_value'), 0.9)
    returning id into blocked_proposal_id;
    execute 'set local role authenticated';
    perform pg_temp.sm_rejected(format('select public.review_event_change_proposal(%L,%L)', blocked_proposal_id, 'accepted'),
      'review rejects ' || (field_spec->>'entity') || '.' || (field_spec->>'field'), array['23514','22023','42501']);
    execute 'reset role';
  end loop;
  insert into public.event_change_proposals(event_id, entity_type, source_id, proposal_status,
    rule_code, proposed_changes, baseline_values, proposal_fingerprint, confidence)
  values(event_id, 'event', source_id, 'pending', 'synthetic_legacy_hostile',
    '{"description":"Forbidden blended change","verification_status":"verified","needs_review":false}',
    '{}', marker || '-legacy-hostile', 0.9) returning id into blocked_proposal_id;
  execute 'set local role authenticated';
  perform pg_temp.sm_rejected(format('select public.apply_event_change_proposal(%L)', blocked_proposal_id),
    'legacy multi-field proposal cannot mix factual and verification changes', array['23514','22023','42501']);
  execute 'reset role';
  perform pg_temp.sm_assert((select description = 'Newer manual fact' and verification_status = 'needs_review'
    from public.events where id = event_id), 'rejected administrative metadata leaves facts unchanged');
  perform pg_temp.sm_assert((select count(*) = edition_count from public.event_editions e where e.event_id = event_id),
    'new-edition proposal cannot create an edition');
  perform pg_temp.sm_assert(coalesce(current_setting('app.freshness_verification',true),'') <> 'active',
    'extraction and review do not activate a freshness bypass');
  if expected_stage_four then
    execute 'select coalesce(jsonb_agg(to_jsonb(s)),''[]''::jsonb) from public.stage_four_settings s'
      into stage_four_after;
    perform pg_temp.sm_assert(stage_four_after = stage_four_before,
      'schema capabilities do not enable or modify Stage Four automation settings');
  end if;
  raise notice 'Source monitor schema-alignment checks passed: %', (select count(*) from pg_temp.sm_regression_checks);
end;
$regression$;

rollback;
