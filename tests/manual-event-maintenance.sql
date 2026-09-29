-- Synthetic rollback-only integration. The local runner owns a fresh container.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
do $$ begin
  if current_setting('sporteventmap.test_manual_maintenance', true) is distinct from 'isolated' then
    raise exception 'Run only with tests/run-manual-event-maintenance-local.mjs';
  end if;
end $$;
create temporary table mm_checks(label text primary key) on commit drop;
grant select,insert on mm_checks to authenticated,anon,service_role;
create function pg_temp.mm_assert(ok boolean,label text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'MANUAL MAINTENANCE REGRESSION: %',label; end if;
  insert into pg_temp.mm_checks values(label);
end $$;
create function pg_temp.mm_reject(statement text,label text,states text[] default array['22023','23514','40001','P0001'])
returns void language plpgsql as $$ declare rejected boolean:=false; begin
  begin execute statement;
  exception when others then
    if sqlstate<>all(states) then raise exception 'Unexpected SQLSTATE % for %: %',sqlstate,label,sqlerrm; end if;
    rejected:=true;
  end;
  perform pg_temp.mm_assert(rejected,label);
end $$;

do $tests$
#variable_conflict use_variable
declare
  marker text:='manual-maintenance-'||gen_random_uuid();
  admin_id uuid:=gen_random_uuid();
  user_id uuid:=gen_random_uuid();
  event_id bigint;
  edition_id uuid;
  next_id uuid;
  second_id uuid;
  source_id uuid;
  planner_id uuid;
  result_id uuid;
  future_date date:=make_date(extract(year from current_date)::integer+1,5,1);
  official_url text;
  payload jsonb;
  receipt jsonb;
  replay jsonb;
  context jsonb;
  old_row jsonb;
  old_event jsonb;
  old_controls jsonb;
  old_audits bigint;
  initial_verified_at timestamptz;
  public_row jsonb;
  operation text;
  full_checks jsonb:=to_jsonb(array['event.canonical_name','edition.edition_year','edition.start_date','event.city','event.country','event.address',
    'event.latitude','event.longitude','event.sport','edition.race_formats','event.description','edition.registration_status','edition.source_url','edition.registration_url']);
  fresh_source_id uuid;
  proposal_id uuid;
  crawl_job_id uuid;
  crawl_id bigint;
  policy jsonb;
  past_event_id bigint;
  past_edition_id uuid;
  candidate_id uuid;
  candidate_edition_id uuid;
  conflict_candidate_id uuid;
  conflict_edition_id uuid;
  candidate_date date:=make_date(extract(year from current_date)::integer+3,5,1);
begin
  official_url:='https://example.invalid/'||marker;
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(admin_id,'authenticated','authenticated',marker||'-admin@example.invalid',now(),now()),
        (user_id,'authenticated','authenticated',marker||'-user@example.invalid',now(),now());
  insert into public.profiles(id,email,role)
  values(admin_id,marker||'-admin@example.invalid','admin'),(user_id,marker||'-user@example.invalid','user')
  on conflict(id) do update set role=excluded.role;
  insert into public.events(event_name,date,city,country,sport,address,latitude,longitude,distance,
    description,event_url,source_url,status,last_verified_at)
  values(marker,to_char(future_date,'DD.MM.YYYY'),'Berlin','Deutschland','Running','Teststraße 1','52.52000','13.40500','10 km',
    'Diese rein synthetische Laufveranstaltung dient ausschließlich dem isolierten Test der manuellen Pflege und öffentlichen Lesepfade.',
    official_url,official_url,'approved','2000-01-01T00:00:00Z') returning id into event_id;
  select e.id into edition_id from public.event_editions e where e.event_id=event_id;
  update public.event_editions set publication_status='published',discovery_status='active',edition_status='scheduled',
    race_formats='[{"label":"10 km","distance_km":10,"elevation_gain_m":250}]',
    registration_status='registration_open',price_min=15,price_max=25,currency='EUR',participant_limit=400
    where id=edition_id;
  select last_verified_at into initial_verified_at from public.event_editions where id=edition_id;
  insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type,is_active,crawl_status)
  values(event_id,edition_id,'official_event_website',official_url,'json_ld',true,'success') returning id into source_id;
  insert into public.edition_results(event_id,edition_id,result_type,result_status,publication_status,official_url,fingerprint)
  values(event_id,edition_id,'official_results','available','published',official_url||'/results',marker) returning id into result_id;
  insert into public.season_planner_events(user_id,event_id,edition_id,priority,planned_distance)
  values(user_id,event_id::text,edition_id,'A','10 km') returning id into planner_id;

  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  context:=public.admin_manual_event_context(event_id);
  perform pg_temp.mm_assert(context->'event'->>'id'=event_id::text and jsonb_array_length(context->'editions')=1,
    'admin context reload returns canonical event and edition');
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','correct','event_id',event_id,'edition_id',edition_id,
    'expected_version',context->>'version','event_patch','{}'::jsonb,'edition_patch',jsonb_build_object('start_date',future_date+1,'end_date',future_date+1),
    'clear_fields','[]'::jsonb,'confirmations','[]'::jsonb,'source_url',official_url,'source_result','confirmed','notes','Manuelle Datumskorrektur aus offizieller Quelle.');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(receipt->>'saved'='true' and receipt->>'edition_id'=edition_id::text,'correction returns exact saved identity');
  perform pg_temp.mm_assert((select start_date=future_date+1 and end_date=future_date+1 from public.event_editions where id=edition_id),
    'correction persists in canonical database reload');
  perform pg_temp.mm_assert((public.admin_manual_event_context(event_id)->>'version') is distinct from context->>'version',
    'stored version changes after correction');
  perform pg_temp.mm_assert((select price_min=15 and price_max=25 and participant_limit=400 and currency='EUR'
    and race_formats->0->>'elevation_gain_m'='250' from public.event_editions where id=edition_id),
    'omitted and collapsed optional fields and race metadata are preserved');
  perform pg_temp.mm_assert((select last_verified_at is null or last_verified_at<=initial_verified_at from public.event_editions where id=edition_id),
    'ordinary correction does not make whole edition fresh');
  perform pg_temp.mm_assert(not exists(select 1 from public.event_field_controls where event_field_controls.edition_id=edition_id),
    'unconfirmed correction does not verify or lock untouched fields');
  replay:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(replay->>'replayed'='true' and replay->>'edition_id'=edition_id::text,
    'lost-response identical retry returns committed receipt without duplicate');
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',
    jsonb_set(payload,'{edition_patch,start_date}',to_jsonb(future_date+2))),'same operation ID cannot change payload');
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',
    jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid()))),'stale parallel version is rejected');

  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','confirm','event_id',event_id,'edition_id',edition_id,
    'expected_version',context->>'version','confirmations',jsonb_build_array('edition.start_date'),
    'source_url',official_url,'source_result','confirmed','notes','Datum unverändert auf offizieller Seite geprüft.');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert((select count(*)=1 from public.event_field_controls where event_field_controls.edition_id=edition_id
    and field_name='start_date' and is_locked and confirmed_by=admin_id and confirmed_at>=transaction_timestamp()),
    'unchanged date confirmation stores server actor time and exact edition field lock');
  perform pg_temp.mm_assert(not exists(select 1 from public.event_field_controls where event_field_controls.edition_id=edition_id and field_name='registration_status'),
    'unchecked registration status receives no confirmation');
  perform pg_temp.mm_assert((select last_verified_at is null or last_verified_at<=initial_verified_at from public.event_editions where id=edition_id),
    'one verified field does not claim whole-record freshness');
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{expected_version}',context->'version');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(receipt->>'saved'='true','same unchanged field can be checked again later');

  -- Public readers use the same edition identity; this is a real invoker-role query.
  execute 'reset role';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  perform pg_temp.mm_assert((select date=to_char(future_date+1,'DD.MM.YYYY') from public.public_event_discovery where public_event_discovery.edition_id=edition_id),
    'anonymous public discovery sees persisted correction');
  perform pg_temp.mm_assert((select date=to_char(future_date+1,'DD.MM.YYYY') from public.public_event_archive where public_event_archive.edition_id=edition_id),
    'anonymous detail archive sees persisted correction');
  perform pg_temp.mm_reject(format('select public.admin_manual_event_context(%s)',event_id),'anonymous context access denied',array['42501']);
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),'anonymous writes denied',array['42501']);
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_id)::text,true);
  perform set_config('request.jwt.claim.sub',user_id::text,true);
  execute 'set local role authenticated';
  perform pg_temp.mm_reject(format('select public.admin_manual_event_context(%s)',event_id),'normal user context access denied',array['42501']);
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),'normal user writes denied',array['42501']);
  perform pg_temp.mm_assert((select season_planner_events.edition_id=edition_id and priority='A' and planned_distance='10 km'
    from public.season_planner_events where id=planner_id),'existing planner reference remains intact');
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';

  context:=public.admin_manual_event_context(event_id);
  select to_jsonb(e) into old_row from public.event_editions e where e.id=edition_id;
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','create','event_id',event_id,'edition_id',edition_id,
    'expected_version',context->>'version','edition_patch',jsonb_build_object('edition_year',extract(year from future_date)::integer+1,'edition_key','main'),
    'source_url',official_url,'source_result','confirmed','notes','Neue Ausgabe als unvollständigen Entwurf angelegt.');
  receipt:=public.save_manual_event_maintenance(payload);
  next_id:=(receipt->>'edition_id')::uuid;
  perform pg_temp.mm_assert(next_id is not null and next_id<>edition_id,'new edition receives distinct identity');
  perform pg_temp.mm_assert((select to_jsonb(e)=old_row from public.event_editions e where e.id=edition_id),
    'creating successor leaves complete predecessor row unchanged');
  perform pg_temp.mm_assert((select start_date is null and end_date is null and registration_status='unknown'
    and publication_status='draft' and discovery_status='suppressed' and last_verified_at is null
    and last_verified_source_id is null and price_min is null and participant_limit is null
    from public.event_editions where id=next_id),'successor has unknown date and no inherited annual facts or verification');
  perform pg_temp.mm_assert(not exists(select 1 from public.event_field_controls where event_field_controls.edition_id=next_id),
    'successor does not inherit predecessor field protection');
  perform pg_temp.mm_assert(not exists(select 1 from public.public_event_discovery where public_event_discovery.edition_id=next_id),
    'unapproved successor is absent from public discovery');
  perform pg_temp.mm_assert((select edition_results.edition_id=edition_id from public.edition_results where id=result_id),
    'existing result reference remains bound to predecessor');
  replay:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(replay->>'edition_id'=next_id::text and replay->>'replayed'='true',
    'duplicate successor save returns same edition');
  context:=public.admin_manual_event_context(event_id);
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',
    jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{expected_version}',context->'version')),
    'independent duplicate edition identity is rejected',array['23505']);
  payload:=jsonb_set(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),
    '{expected_version}',context->'version'),'{edition_patch,edition_key}','"autumn"');
  receipt:=public.save_manual_event_maintenance(payload);
  second_id:=(receipt->>'edition_id')::uuid;
  perform pg_temp.mm_assert(second_id<>next_id and (select count(*)=2 from public.event_editions e
    where e.event_id=event_id and e.edition_year=extract(year from future_date)::integer+1),
    'two explicitly distinct editions in one year are supported');

  -- A failed request must not leave partial facts, new sources or audit rows.
  context:=public.admin_manual_event_context(event_id);
  select count(*) into old_audits from public.event_audit_log;
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','correct','event_id',event_id,'edition_id',edition_id,
    'expected_version',context->>'version','event_patch',jsonb_build_object('city','SHOULD ROLLBACK'),
    'edition_patch',jsonb_build_object('participant_limit',-1),'source_url',official_url||'/failure',
    'source_result','confirmed','notes','Ungültiger atomarer Test mit negativer Teilnehmerzahl.');
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),
    'invalid edition field rejects whole event edition source audit transaction');
  perform pg_temp.mm_assert((select city='Berlin' from public.events where id=event_id)
    and not exists(select 1 from public.event_sources where source_url=official_url||'/failure')
    and (select count(*)=old_audits from public.event_audit_log),
    'failed save leaves canonical facts sources and audit unchanged');
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',
    jsonb_set(payload,'{event_patch}','{"role":"admin"}')),'unlisted fields are rejected');

  -- Deletion is separate from blanks; no silent NULL coercion is accepted.
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','correct','event_id',event_id,'edition_id',edition_id,
    'expected_version',context->>'version','edition_patch',jsonb_build_object('price_min',null),
    'source_url',official_url,'source_result','confirmed','notes','Leerer Formularwert darf nicht automatisch löschen.');
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),
    'blank patch cannot silently delete a stored price');
  payload:=(payload-'edition_patch')||jsonb_build_object('clear_fields',jsonb_build_array('edition.price_min'));
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert((select price_min is null and price_max=25 from public.event_editions where id=edition_id),
    'explicit clear deletes only the selected value');

  -- A human review of all required facts can satisfy the existing public guard
  -- even when no machine has ever crawled the newly attached official source.
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','correct','event_id',event_id,'edition_id',edition_id,
    'expected_version',context->>'version','edition_patch',jsonb_build_object('source_url',official_url||'/manual'),
    'confirmations',full_checks,'source_url',official_url||'/manual','source_result','confirmed',
    'notes','Alle vierzehn Pflichtangaben persönlich auf der offiziellen Quelle geprüft.');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(receipt->'freshness'->>'verified'='true',
    'complete human-only review satisfies canonical freshness verifier');
  select last_verified_source_id into fresh_source_id from public.event_editions where id=edition_id;
  perform pg_temp.mm_assert((select last_fetched_at is null and crawl_status not in ('success','not_modified')
    from public.event_sources where id=fresh_source_id),'manual verification does not invent successful HTTP crawl');
  perform pg_temp.mm_assert(public.get_public_event_freshness_guard(array[edition_id])->'decisions'->>edition_id::text='true',
    'anonymous export guard accepts complete human review');
  update public.event_sources set next_fetch_at=now()+interval '1 hour' where id=fresh_source_id;
  perform pg_temp.mm_assert(public.get_public_event_freshness_guard(array[edition_id])->'decisions'->>edition_id::text='true',
    'routine next-crawl scheduling preserves valid manual source proof');
  update public.event_sources set crawl_status='http_error',consecutive_failures=1 where id=fresh_source_id;
  perform pg_temp.mm_assert(public.get_public_event_freshness_guard(array[edition_id])->'decisions'->>edition_id::text='false',
    'new technical source failure invalidates earlier manual freshness');
  update public.event_sources set crawl_status='pending',consecutive_failures=0 where id=fresh_source_id;
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','confirm','event_id',event_id,'edition_id',edition_id,
    'expected_version',context->>'version','confirmations',full_checks,'source_url',official_url||'/manual','source_result','confirmed',
    'notes','Vollständige erneute persönliche Prüfung unveränderter Veranstaltungsdaten.');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(receipt->'freshness'->>'verified'='true','complete unchanged review can be repeated');

  -- Exercise field protection as the actual automated service role. No admin
  -- identity is left in JWT claims and rejected UPDATE statements roll back.
  execute 'reset role';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('app.change_source','import',true);
  execute 'set local role service_role';
  perform pg_temp.mm_reject(format('update public.event_editions set start_date=%L::date where id=%L::uuid',future_date+2,edition_id),
    'automated direct edition import cannot overwrite human confirmed date',array['23514']);
  perform pg_temp.mm_reject(format('update public.events set city=%L where id=%s','Overwrite attempt',event_id),
    'service API cannot overwrite human-confirmed master field',array['42501','23514']);
  execute 'reset role';
  -- The catalog importer itself is SECURITY DEFINER. Model its actual elevated
  -- database owner context while retaining the automated (not admin) JWT.
  perform pg_temp.mm_reject(format('update public.events set city=%L where id=%s','Overwrite attempt',event_id),
    'elevated catalog import cannot overwrite edition-attributed confirmed city',array['23514']);
  execute 'set local role service_role';
  insert into public.source_crawl_jobs(source_id,event_id,edition_id,status,idempotency_key,trigger_source,attempt_count,completed_at)
    values(source_id,event_id,edition_id,'completed',marker,'test',1,now()) returning id into crawl_job_id;
  insert into public.source_crawl_results(job_id,source_id,event_id,edition_id,attempt_number,http_status,final_url,
    change_status,worker_version,processing_status,content_hash)
    values(crawl_job_id,source_id,event_id,edition_id,1,200,official_url,'changed','manual-regression','completed',md5(marker)) returning id into crawl_id;
  perform public.record_extraction_proposals(source_id,crawl_id,jsonb_build_array(jsonb_build_object('entity_type','edition','field_name','start_date',
    'old_value',future_date+1,'proposed_value',future_date+2,'normalized_value',future_date+2,
    'change_type','updated_value','extraction_method','json_ld','confidence',0.99)),'manual-regression');
  select p.id into proposal_id from public.event_change_proposals p where p.edition_id=edition_id and p.field_name='start_date';
  perform pg_temp.mm_assert(proposal_id is not null and (select proposal_status='pending' from public.event_change_proposals where id=proposal_id)
    and (select start_date=future_date+1 from public.event_editions where id=edition_id),
    'crawler records divergent protected date for review without changing canonical facts');
  if to_regprocedure('public.evaluate_change_proposal_automation(uuid,boolean)') is not null then
    policy:=public.evaluate_change_proposal_automation(proposal_id,false);
    perform pg_temp.mm_assert(policy->>'blocked_reason'='field_locked_or_manual_override',
      'automation explicitly blocks confirmed edition field proposal');
  else
    raise notice 'SKIP optional Stage Four assertion (1/2): automation explicitly blocks confirmed edition field proposal; subsystem absent';
  end if;
  update public.event_editions set start_date=make_date(extract(year from future_date)::integer+1,8,2) where id=second_id;
  perform pg_temp.mm_assert((select start_date=make_date(extract(year from future_date)::integer+1,8,2) from public.event_editions where id=second_id),
    'old edition lock does not silently protect new edition facts');
  -- Rebind this synthetic proposal to the distinct test edition, using its own
  -- source; the old date lock must not be treated as an inherited new lock.
  insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type)
    values(event_id,second_id,'official_event_website',official_url||'/autumn','manual') returning id into fresh_source_id;
  insert into public.event_change_proposals(event_id,edition_id,source_id,entity_type,proposal_status,rule_code,
    field_name,old_value,proposed_value,normalized_value,proposed_changes,baseline_values,proposal_fingerprint,change_type,confidence)
    values(event_id,second_id,fresh_source_id,'edition','pending','extracted_start_date','start_date',
      to_jsonb(make_date(extract(year from future_date)::integer+1,8,2)),to_jsonb(make_date(extract(year from future_date)::integer+1,8,3)),
      to_jsonb(make_date(extract(year from future_date)::integer+1,8,3)),jsonb_build_object('start_date',make_date(extract(year from future_date)::integer+1,8,3)),
      jsonb_build_object('start_date',make_date(extract(year from future_date)::integer+1,8,2)),marker||'-autumn','updated_value',0.99)
    returning id into proposal_id;
  if to_regprocedure('public.evaluate_change_proposal_automation(uuid,boolean)') is not null then
    policy:=public.evaluate_change_proposal_automation(proposal_id,false);
    perform pg_temp.mm_assert(policy->>'blocked_reason' is distinct from 'field_locked_or_manual_override',
      'automation does not inherit another edition field protection');
  else
    raise notice 'SKIP optional Stage Four assertion (2/2): automation does not inherit another edition field protection; subsystem absent';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  perform public.run_event_validation(event_id,second_id);
  perform pg_temp.mm_assert(not exists(select 1 from public.validation_issues v where v.event_id=event_id and v.status='open'
    and v.rule_code like '%duplicate%edition%'),'distinct same-year edition keys do not create duplicate edition issues');

  select jsonb_agg(to_jsonb(c) order by c.id) into old_controls from public.event_field_controls c where c.edition_id=edition_id;
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','confirm','event_id',event_id,'edition_id',edition_id,
    'expected_version',context->>'version','source_url',official_url||'/manual','source_result','no_new_edition',
    'notes','Die offizielle Seite kündigt bislang keine weitere Ausgabe an.');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(exists(select 1 from public.event_audit_log a where a.entity_id=edition_id::text
    and a.field_name='__manual_source_review__' and a.new_value->>'result'='no_new_edition'),
    'no successor announcement is separately documented');
  perform pg_temp.mm_assert((select jsonb_agg(to_jsonb(c) order by c.id)=old_controls from public.event_field_controls c where c.edition_id=edition_id),
    'no announcement does not verify any existing field');
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_set(jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{expected_version}',context->'version'),
    '{source_result}','"unreachable"');
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload||jsonb_build_object('confirmations',jsonb_build_array('edition.start_date'))),
    'unreachable source cannot confirm a date');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(public.get_public_event_freshness_guard(array[edition_id])->'decisions'->>edition_id::text='false',
    'unreachable source invalidates public freshness');
  perform pg_temp.mm_assert((select jsonb_agg(to_jsonb(c) order by c.id)=old_controls from public.event_field_controls c where c.edition_id=edition_id),
    'unreachable source never refreshes field checks');

  -- Publication is independently failed/retryable: incomplete checks preserve
  -- the saved draft, and a complete validated request can later publish it.
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','correct','event_id',event_id,'edition_id',next_id,
    'expected_version',context->>'version','publish',true,'edition_patch',jsonb_build_object('start_date',future_date+interval '1 year','end_date',future_date+interval '1 year',
      'edition_status','scheduled','registration_status','registration_open','source_url',official_url||'/next','registration_url',official_url||'/next/register',
      'race_formats',jsonb_build_array(jsonb_build_object('label','10 km','distance_km',10))),
    'source_url',official_url||'/next','source_result','confirmed','notes','Daten speichern; Veröffentlichung ohne vollständige Bestätigung muss sichtbar scheitern.');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(receipt->>'saved'='true' and receipt->'publication'->>'status'='failed'
    and (select publication_status='draft' from public.event_editions where id=next_id),
    'publication failure preserves successful database save and private draft');
  -- End the predecessor only in this synthetic fixture; the maintenance RPC
  -- never performs this lifecycle transition while creating a successor.
  update public.event_editions set edition_status='completed',discovery_status='detail_only' where id=edition_id;
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','confirm','event_id',event_id,'edition_id',next_id,
    'expected_version',context->>'version','publish',true,'confirmations',full_checks,'source_url',official_url||'/next','source_result','confirmed',
    'notes','Alle vierzehn Angaben geprüft und diese neue Ausgabe ausdrücklich veröffentlichen.');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(receipt->>'saved'='true' and receipt->'freshness'->>'verified'='true' and receipt->'publication'->>'status'='database_public',
    'complete explicit draft publication succeeds after prior failed attempt');
  perform pg_temp.mm_assert((select public_event_discovery.edition_id=next_id from public.public_event_discovery where public_event_discovery.event_id=event_id)
    and public.get_public_event_freshness_guard(array[next_id])->'decisions'->>next_id::text='true',
    'published successor is visible through discovery and guarded export');
  select last_verified_source_id into fresh_source_id from public.event_editions where id=next_id;
  delete from public.event_sources where id=fresh_source_id;
  perform pg_temp.mm_assert(public.get_public_event_freshness_guard(array[next_id])->'decisions'->>next_id::text='false'
    and (select last_verified_source_id is null from public.event_editions where id=next_id),
    'deleting manually reviewed source removes public freshness proof');

  execute 'reset role';
  insert into public.edition_succession_candidates(event_id,source_id,predecessor_edition_id,candidate_year,candidate_start_date,
    source_url,confidence,fingerprint,candidate_status,validation_status)
    values(event_id,source_id,edition_id,extract(year from candidate_date),candidate_date,official_url,0.99,marker||'-candidate','detected','validated')
    returning id into candidate_id;
  execute 'set local role authenticated';
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','create','event_id',event_id,'edition_id',edition_id,
    'expected_version',context->>'version','edition_patch',jsonb_build_object('edition_year',extract(year from candidate_date),'start_date',candidate_date),
    'source_url',official_url||'/candidate','source_result','confirmed','notes','Bestehenden Kandidaten ausdrücklich als Entwurf weiterbearbeiten.');
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),
    'existing candidate blocks independent duplicate edition creation',array['23505']);
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload||jsonb_build_object('candidate_id',gen_random_uuid())),
    'supplied candidate identity must match an existing exact candidate',array['22023','23505','P0002']);
  payload:=payload||jsonb_build_object('candidate_id',candidate_id);
  receipt:=public.save_manual_event_maintenance(payload);
  candidate_edition_id:=(receipt->>'edition_id')::uuid;
  perform pg_temp.mm_assert((select generated_from_candidate_id=candidate_id from public.event_editions where id=candidate_edition_id)
    and (select draft_edition_id=candidate_edition_id and candidate_status='draft_created' from public.edition_succession_candidates where id=candidate_id),
    'exact detected candidate continues into one linked draft');
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_set(jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid())),'{expected_version}',context->'version');
  perform pg_temp.mm_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),
    'candidate with draft cannot materialize a second edition',array['23505']);

  candidate_date:=make_date(extract(year from candidate_date)::integer+1,5,1);
  execute 'reset role';
  insert into public.edition_succession_candidates(event_id,source_id,predecessor_edition_id,candidate_year,candidate_start_date,
    source_url,confidence,fingerprint,candidate_status,validation_status)
    values(event_id,source_id,edition_id,extract(year from candidate_date),candidate_date,official_url,0.99,marker||'-conflict','conflict','conflict')
    returning id into conflict_candidate_id;
  execute 'set local role authenticated';
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','create','event_id',event_id,'edition_id',edition_id,
    'candidate_id',conflict_candidate_id,'expected_version',context->>'version',
    'edition_patch',jsonb_build_object('edition_year',extract(year from candidate_date),'start_date',candidate_date),
    'source_url',official_url||'/conflict','source_result','confirmed','notes','Konfliktkandidat darf nur als ungeprüfter Entwurf weiterbearbeitet werden.');
  receipt:=public.save_manual_event_maintenance(payload);
  conflict_edition_id:=(receipt->>'edition_id')::uuid;
  perform pg_temp.mm_assert((select candidate_status='conflict' and validation_status='conflict' and draft_edition_id=conflict_edition_id
    from public.edition_succession_candidates where id=conflict_candidate_id),'candidate conflict survives manual draft creation');
  context:=public.admin_manual_event_context(event_id);
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','correct','event_id',event_id,'edition_id',conflict_edition_id,
    'expected_version',context->>'version','publish',true,'confirmations',full_checks,
    'edition_patch',jsonb_build_object('edition_status','scheduled','source_url',official_url||'/conflict','registration_url',official_url||'/conflict/register',
      'race_formats',jsonb_build_array(jsonb_build_object('label','10 km','distance_km',10)),'registration_status','registration_open'),
    'source_url',official_url||'/conflict','source_result','confirmed','notes','Vollständige manuelle Prüfung darf ungelösten Kandidatenkonflikt nicht automatisch freigeben.');
  receipt:=public.save_manual_event_maintenance(payload);
  perform pg_temp.mm_assert(receipt->'publication'->>'status'='failed' and receipt->'publication'->>'error' like '%Konflikt%'
    and (select publication_status='draft' from public.event_editions where id=conflict_edition_id)
    and (select candidate_status='conflict' from public.edition_succession_candidates where id=conflict_candidate_id),
    'unresolved candidate conflict prevents full manual publication without false success');

  execute 'reset role';
  insert into public.events(event_name,date,city,country,sport,event_url,status)
    values(marker||'-past',to_char(current_date-500,'DD.MM.YYYY'),'Berlin','Germany','Running',official_url||'/past','approved') returning id into past_event_id;
  execute 'set local role authenticated';
  select e.id into past_edition_id from public.event_editions e where e.event_id=past_event_id;
  update public.event_editions set edition_status='scheduled' where id=past_edition_id;
  perform public.set_event_field_control(past_event_id,past_edition_id,'edition_status','"scheduled"','Historisch bestätigter Austragungsstatus.',null,true,1::smallint);
  execute 'reset role';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('app.change_source','system',true);
  perform pg_temp.mm_reject(format('update public.event_editions set edition_status=%L where id=%L::uuid','cancelled',past_edition_id),
    'automatic arbitrary status change still respects explicit manual status lock',array['23514']);
  perform set_config('app.change_reason','Automatic edition lifecycle transition',true);
  update public.event_editions set edition_status='completed' where id=past_edition_id;
  perform pg_temp.mm_assert((select edition_status='completed' from public.event_editions where id=past_edition_id),
    'normal lifecycle completion after grace does not get stuck on status lock');
  execute 'reset role';
end;
$tests$;
select 'MANUAL_MAINTENANCE_ASSERTIONS='||count(*) from mm_checks;
select label from mm_checks order by label;
rollback;
