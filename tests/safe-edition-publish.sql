-- Isolated database regression only. The runner must explicitly set
-- sporteventmap.test_isolated_edition_publish=restore-clone. All identities,
-- JWT claims and facts below are synthetic and are rolled back at the end.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
do $$ begin
  if current_setting('sporteventmap.test_isolated_edition_publish', true) is distinct from 'restore-clone' then
    raise exception 'Use an explicitly isolated restore clone';
  end if;
end $$;

create temporary table ep_checks(label text primary key) on commit drop;
grant select, insert on ep_checks to authenticated, anon, service_role;
create function pg_temp.ep_assert(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'EDITION PUBLISH REGRESSION: %', label; end if;
  insert into pg_temp.ep_checks values(label);
end $$;
create function pg_temp.ep_reject(statement text, label text, states text[]) returns void
language plpgsql as $$
declare rejected boolean := false;
begin
  begin execute statement;
  exception when others then
    if sqlstate <> all(states) then
      raise exception 'Unexpected SQLSTATE % for %: %', sqlstate, label, sqlerrm;
    end if;
    rejected := true;
  end;
  perform pg_temp.ep_assert(rejected, label);
end $$;
create temporary table ep_fixtures(
  n integer primary key, event_id bigint, predecessor_id uuid, draft_id uuid,
  candidate_id uuid, detection_source uuid, publication_source uuid, crawl_id bigint,
  evidence jsonb, before_event jsonb, before_predecessor jsonb, before_draft jsonb
) on commit drop;
grant select on ep_fixtures to authenticated, anon, service_role;

do $tests$
#variable_conflict use_variable
declare
  marker text := 'edition-publish-' || gen_random_uuid()::text;
  admin_id uuid := gen_random_uuid();
  user_id uuid := gen_random_uuid();
  future_date date := make_date(extract(year from current_date)::integer + 1, 6, 1);
  past_date date := make_date(extract(year from current_date)::integer - 1, 6, 1);
  event_id bigint;
  predecessor_id uuid;
  draft_id uuid;
  candidate_id uuid;
  detection_source uuid;
  publication_source uuid;
  job_id uuid;
  crawl_id bigint;
  detection_url text;
  publication_url text;
  result jsonb;
  evidence jsonb;
  evidence_batch jsonb;
  bad_evidence jsonb;
  candidate_ids uuid[];
  draft_ids uuid[];
  stored jsonb;
  fixture record;
  n integer;
  batch_size integer;
  field text;
  operation text;
  mutation record;
  before_rows jsonb;
  after_rows jsonb;
  before_audits bigint;
  after_audits bigint;
  required_fields text[] := array['event_name','edition_year','date','city','country','address',
    'latitude','longitude','sport','distances','description','registration_status','official_event_page','registration_link'];
  checked_at timestamptz := now() - interval '1 hour';
  notes text := 'Synthetic isolated official source review for successor publication.';
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(admin_id,'authenticated','authenticated',marker||'-admin@example.invalid',now(),now()),
        (user_id,'authenticated','authenticated',marker||'-user@example.invalid',now(),now());
  insert into public.profiles(id,email,role)
  values(admin_id,marker||'-admin@example.invalid','admin'),(user_id,marker||'-user@example.invalid','user')
  on conflict(id) do update set role=excluded.role;

  for n in 1..26 loop
    detection_url := 'https://example.invalid/' || marker || '/' || n || '/detected';
    publication_url := 'https://example.invalid/' || marker || '/' || n || '/official';
    insert into public.events(event_name,date,city,country,sport,address,latitude,longitude,
      distance,description,event_url,status,last_verified_at)
    values(marker||' event '||n,to_char(past_date,'DD.MM.YYYY'),'Fixture City','Deutschland','Running',
      'Fixture Start 1','48.13700','11.57500','old 42 km',
      'Diese vollständig synthetische Laufveranstaltung dient ausschließlich dem isolierten Test der sicheren Editionsfreigabe.',
      detection_url,'approved','2000-01-01T00:00:00Z') returning id into event_id;
    select e.id into strict predecessor_id from public.event_editions e
    where e.event_id=event_id and e.edition_year=extract(year from past_date)::integer;
    update public.event_editions set publication_status='published',discovery_status='detail_only',
      edition_status='completed',race_formats='[{"label":"Historical marathon","distance_km":42.195}]',
      legacy_distance='Historical marathon',last_verified_at='2001-01-01T00:00:00Z'
    where id=predecessor_id;
    insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type,
      is_active,crawl_status,consecutive_failures,last_fetched_at,last_change_status)
    values(event_id,predecessor_id,'official_event_website',detection_url,'json_ld',true,'success',0,now(),'unchanged')
    returning id into detection_source;
    insert into public.source_crawl_jobs(source_id,event_id,edition_id,status,idempotency_key,trigger_source,attempt_count,completed_at)
    values(detection_source,event_id,predecessor_id,'completed',marker||n,'test',1,now()) returning id into job_id;
    insert into public.source_crawl_results(job_id,source_id,event_id,edition_id,attempt_number,http_status,
      final_url,change_status,worker_version,processing_status,content_hash)
    values(job_id,detection_source,event_id,predecessor_id,1,200,detection_url,'unchanged','isolated-regression','completed',md5(marker||n))
    returning id into crawl_id;

    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claim.role','service_role',true);
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    execute 'set local role service_role';
    result := public.register_edition_successor_candidate(detection_source,crawl_id,
      jsonb_build_object('start_date',future_date,'year',extract(year from future_date)::integer,
        'confidence',0.99,'registration_url',publication_url||'/register',
        'evidence_type','json_ld','evidence',jsonb_build_object('excerpt','Synthetic future edition')),
      'isolated-regression');
    execute 'reset role';
    candidate_id := (result->>'candidate_id')::uuid;
    perform pg_temp.ep_assert(result->>'status'='detected' and result->>'validation_status'='validated'
      and result->'draft_edition_id'='null'::jsonb
      and (select count(*)=1 from public.event_editions e where e.event_id=event_id),
      'registration creates only a private candidate '||n);

    insert into public.event_editions(event_id,edition_year,edition_slug,legacy_event_key,start_date,registration_url,
      registration_status,edition_status,publication_status,discovery_status,race_formats,legacy_distance,
      source_url,predecessor_edition_id,generated_from_source_id,generated_from_candidate_id,
      last_verified_at,data_confidence)
    values(event_id,extract(year from future_date)::integer,marker||'-draft-'||n,marker||'-key-'||n,future_date,
      publication_url||'/register','registration_open','scheduled','draft','suppressed',
      '[{"label":"5 km","distance_km":5},{"label":"Kinder 400 m","distance_km":0.4}]','5 km / Kinder 400 m',
      publication_url,predecessor_id,detection_source,candidate_id,null,0.5) returning id into draft_id;
    insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type,
      is_active,crawl_status,consecutive_failures,last_fetched_at,last_change_status)
    values(event_id,draft_id,'official_event_website',publication_url,'json_ld',true,'success',0,now(),'unchanged')
    returning id into publication_source;
    update public.edition_succession_candidates set draft_edition_id=draft_id
    where id=candidate_id;
    select jsonb_build_object('event_name',coalesce(e.canonical_name,e.event_name),'edition_year',d.edition_year,
      'date',d.start_date,'city',e.city,'country',e.country,'address',e.address,'latitude',e.latitude,
      'longitude',e.longitude,'sport',e.sport,'distances',d.race_formats,'description',e.description,
      'registration_status',d.registration_status,'official_event_page',d.source_url,'registration_link',d.registration_url)
    into stored from public.events e join public.event_editions d on d.event_id=e.id where d.id=draft_id;
    evidence := jsonb_build_object('source_id',publication_source,'source_url',publication_url,
      'source_checked_at',checked_at,'confidence',0.99,'notes',notes,'confirmed_fields',to_jsonb(required_fields),
      'uncertain_fields','[]'::jsonb,'observed_values',stored);
    insert into ep_fixtures values(n,event_id,predecessor_id,draft_id,candidate_id,detection_source,publication_source,crawl_id,evidence,
      (select to_jsonb(e) from public.events e where e.id=event_id),
      (select to_jsonb(e) from public.event_editions e where e.id=predecessor_id),
      (select to_jsonb(e) from public.event_editions e where e.id=draft_id));
  end loop;

  select * into fixture from ep_fixtures f where f.n=1;
  candidate_ids := array[fixture.candidate_id];
  evidence_batch := jsonb_build_object(fixture.draft_id::text,fixture.evidence);
  operation := format('select public.approve_edition_succession_candidates(%L::uuid[],1,%L,%L::jsonb)',candidate_ids,notes,evidence_batch);

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  perform pg_temp.ep_reject(operation,'anon cannot publish',array['42501']);
  perform pg_temp.ep_assert((select count(*)=0 from public.public_event_discovery where edition_id=fixture.draft_id),
    'private draft is absent from anonymous discovery');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',user_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  perform pg_temp.ep_reject(operation,'ordinary authenticated user cannot publish',array['42501']);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  perform pg_temp.ep_reject(operation,'service role cannot publish',array['42501']);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach field in array required_fields loop
    bad_evidence := evidence_batch #- array[fixture.draft_id::text,'observed_values',field];
    perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],1,%L,%L::jsonb)',
      candidate_ids,notes,bad_evidence),'missing observed field rejected: '||field,array['P0001']);
  end loop;
  bad_evidence := jsonb_set(evidence_batch,array[fixture.draft_id::text,'source_checked_at'],to_jsonb(now()-interval '25 hours'));
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],1,%L,%L::jsonb)',candidate_ids,notes,bad_evidence),
    'stale imported inspection time is not refreshed',array['22023']);
  bad_evidence := jsonb_set(evidence_batch,array[fixture.draft_id::text,'uncertain_fields'],'["distances"]'::jsonb);
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],1,%L,%L::jsonb)',candidate_ids,notes,bad_evidence),
    'uncertain fields cannot publish',array['P0001']);
  bad_evidence := jsonb_set(evidence_batch,array[fixture.draft_id::text,'observed_values','latitude'],'48.137'::jsonb);
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],1,%L,%L::jsonb)',candidate_ids,notes,bad_evidence),
    'numeric coordinate does not replace stored text evidence',array['P0001']);

  for mutation in select * from (values
    ('publication source must be edition-bound',format('update public.event_sources set edition_id=null where id=%L',fixture.publication_source)),
    ('foreign event publication source rejected',format('update public.event_sources set event_id=%s,edition_id=null where id=%L',
      (select f.event_id from ep_fixtures f where f.n=2),fixture.publication_source)),
    ('unhealthy publication source rejected',format('update public.event_sources set crawl_status=''http_error'',consecutive_failures=1 where id=%L',fixture.publication_source)),
    ('changed publication source rejected',format('update public.event_sources set last_change_status=''changed'' where id=%L',fixture.publication_source)),
    ('detection crawl edition binding rejected',format('update public.source_crawl_results set edition_id=%L where id=%s',fixture.draft_id,fixture.crawl_id)),
    ('legacy draft requires validated reconciliation',format('update public.edition_succession_candidates set validation_status=''pending'' where id=%L',fixture.candidate_id)),
    ('unbound draft rejected',format('update public.event_editions set generated_from_candidate_id=null where id=%L',fixture.draft_id)),
    ('empty edition program cannot inherit historical master distance',format('update public.event_editions set race_formats=''[]'',legacy_distance=null where id=%L',fixture.draft_id)),
    ('publication lock rejected',format('insert into public.event_field_controls(event_id,entity_type,field_name,lock_reason) values(%s,''event'',''new_edition'',''Synthetic publication lock'')',fixture.event_id)),
    ('unrelated open task is not auto-closed',format('insert into public.source_review_tasks(source_id,event_id,edition_id,task_type,title,fingerprint) values(%L,%s,%L,''content_changed'',''Synthetic conflict'',%L)',fixture.publication_source,fixture.event_id,fixture.draft_id,marker||'-conflict')),
    ('active crawl blocks entire publication',format('insert into public.source_crawl_jobs(source_id,event_id,edition_id,status,idempotency_key,trigger_source) values(%L,%s,%L,''queued'',%L,''test'')',fixture.publication_source,fixture.event_id,fixture.draft_id,marker||'-active'))
  ) gates(label,statement) loop
    begin
      execute 'reset role';
      execute mutation.statement;
      execute 'set local role authenticated';
      perform pg_temp.ep_reject(operation,mutation.label,array['P0001','55000']);
      raise exception 'rollback gate probe' using errcode='Z0001';
    exception when sqlstate 'Z0001' then null;
    end;
    perform pg_temp.ep_assert(true,mutation.label);
  end loop;
  -- The detection RPC also rejects a crawl whose source changed edition.
  begin
    execute 'reset role';
    update public.source_crawl_results set edition_id=fixture.draft_id where id=fixture.crawl_id;
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claim.role','service_role',true);
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    execute 'set local role service_role';
    result := public.register_edition_successor_candidate(fixture.detection_source,fixture.crawl_id,
      jsonb_build_object('start_date',future_date,'confidence',0.99,'evidence_type','json_ld'),'isolated-regression');
    if result->'accepted' is distinct from 'false'::jsonb or result->>'reason' is distinct from 'crawl_source_event_mismatch' then
      raise exception 'detection accepted a crawl from a different source edition';
    end if;
    raise exception 'rollback detection gate' using errcode='Z0001';
  exception when sqlstate 'Z0001' then null;
  end;
  perform pg_temp.ep_assert(true,'candidate registration rejects stale source-edition crawl binding');
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],1)',candidate_ids),
    'legacy two-argument RPC never publishes',array['22023']);
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(NULL,1,%L,%L::jsonb)',notes,evidence_batch),
    'null selection rejected',array['22023']);
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],2,%L,%L::jsonb)',candidate_ids,notes,evidence_batch),
    'mismatched limit rejected',array['22023']);
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],2,%L,%L::jsonb)',candidate_ids||candidate_ids,notes,evidence_batch),
    'duplicate ids rejected',array['22023']);
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],1,%L,%L::jsonb)',array[gen_random_uuid()],notes,evidence_batch),
    'unknown id rejected',array['22023']);
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],1,%L,%L::jsonb)',candidate_ids,'short',evidence_batch),
    'review note required',array['22023']);
  select array_agg(f.candidate_id order by f.n),jsonb_object_agg(f.draft_id::text,f.evidence) into candidate_ids,evidence_batch from ep_fixtures f;
  perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],26,%L,%L::jsonb)',candidate_ids,notes,evidence_batch),
    '26 candidates rejected',array['22023']);

  foreach batch_size in array array[1,10,25] loop
    select array_agg(f.candidate_id order by f.n),array_agg(f.draft_id order by f.draft_id),jsonb_object_agg(f.draft_id::text,f.evidence)
    into candidate_ids,draft_ids,evidence_batch from ep_fixtures f where f.n<=batch_size;
    -- Successful probes roll back to the same private fixtures for the next size.
    begin
      result := public.approve_edition_succession_candidates(candidate_ids,batch_size,notes,evidence_batch);
      if result->>'approved_count' <> batch_size::text or result->'publication_verified' <> 'true'::jsonb
        or result->>'requested_count' <> batch_size::text
        or result->'published_edition_ids' is distinct from to_jsonb(draft_ids)
        or result->'approved_candidate_ids' is distinct from
          (select to_jsonb(array_agg(id order by id)) from unnest(candidate_ids) id)
        or result->'freshness'->>'verified_count' <> batch_size::text
        or result->'freshness'->'automatic_fact_changes' <> 'false'::jsonb
        or (select count(*) from public.event_editions where id=any(draft_ids)
          and publication_status='published' and verification_status='verified' and needs_review=false
          and last_verified_at=checked_at and last_verified_source_id is not null) <> batch_size
        or (select count(*) from public.public_event_discovery where edition_id=any(draft_ids)) <> batch_size
        or (select count(*) from public.event_audit_log where entity_id=any(draft_ids::text[])
          and field_name='__freshness_verification__' and changed_by=admin_id) <> batch_size then
        raise exception 'incomplete successful publication batch %',batch_size;
      end if;
      if exists(select 1 from ep_fixtures f join public.events e on e.id=f.event_id
        join public.event_editions p on p.id=f.predecessor_id
        where f.before_event is distinct from to_jsonb(e) or f.before_predecessor is distinct from to_jsonb(p)) then
        raise exception 'historical parent/predecessor facts changed';
      end if;
      if exists(select 1 from ep_fixtures f join public.event_editions d on d.id=f.draft_id
        where f.n<=batch_size and
        (f.before_draft - array['publication_status','discovery_status','discovery_archived_at','archive_reason',
          'published_at','updated_at','verification_status','data_confidence','needs_review','review_priority',
          'last_verified_at','next_check_at','last_verified_source_id']) is distinct from
        (to_jsonb(d) - array['publication_status','discovery_status','discovery_archived_at','archive_reason',
          'published_at','updated_at','verification_status','data_confidence','needs_review','review_priority',
          'last_verified_at','next_check_at','last_verified_source_id'])) then
        raise exception 'publication changed a private draft fact or stable identity';
      end if;
      if batch_size=1 then
        select jsonb_build_array(to_jsonb(c),to_jsonb(t)) into before_rows
        from public.edition_succession_candidates c left join public.source_review_tasks t
          on t.fingerprint='succession:'||c.id::text where c.id=fixture.candidate_id;
        execute 'reset role';
        perform set_config('request.jwt.claim.sub','',true);
        perform set_config('request.jwt.claim.role','service_role',true);
        perform set_config('request.jwt.claims','{"role":"service_role"}',true);
        execute 'set local role service_role';
        result := public.register_edition_successor_candidate(fixture.detection_source,fixture.crawl_id,
          jsonb_build_object('start_date',future_date,'confidence',0.99,'evidence_type','json_ld'),'isolated-regression');
        if result->'accepted' is distinct from 'false'::jsonb or result->>'reason' is distinct from 'candidate_already_reviewed' then
          raise exception 'worker reopened approved candidate';
        end if;
        select jsonb_build_array(to_jsonb(c),to_jsonb(t)) into after_rows
        from public.edition_succession_candidates c left join public.source_review_tasks t
          on t.fingerprint='succession:'||c.id::text where c.id=fixture.candidate_id;
        if before_rows is distinct from after_rows then raise exception 'terminal review evidence/task changed'; end if;
      end if;
      raise exception 'rollback successful probe' using errcode='Z0001';
    exception when sqlstate 'Z0001' then null;
    end;
    perform pg_temp.ep_assert((select count(*)=batch_size from public.event_editions
      where id=any(draft_ids) and publication_status='draft' and last_verified_at is null),
      'complete atomic success with unchanged historical data and real audit '||batch_size);

    select jsonb_agg(jsonb_build_array(to_jsonb(e),to_jsonb(c),to_jsonb(t)) order by f.n)
    into before_rows from ep_fixtures f join public.event_editions e on e.id=f.draft_id
    join public.edition_succession_candidates c on c.id=f.candidate_id
    left join public.source_review_tasks t on t.fingerprint='succession:'||c.id::text where f.n<=batch_size;
    select count(*) into before_audits from public.event_audit_log where entity_id=any(draft_ids::text[]);
    select f.draft_id into draft_id from ep_fixtures f where f.n=batch_size;
    bad_evidence := jsonb_set(evidence_batch,array[draft_id::text,'observed_values','description'],'"Deliberate final-member mismatch"'::jsonb);
    perform pg_temp.ep_reject(format('select public.approve_edition_succession_candidates(%L::uuid[],%s,%L,%L::jsonb)',
      candidate_ids,batch_size,notes,bad_evidence),'last-member evidence failure rejects whole batch '||batch_size,array['P0001']);
    select jsonb_agg(jsonb_build_array(to_jsonb(e),to_jsonb(c),to_jsonb(t)) order by f.n)
    into after_rows from ep_fixtures f join public.event_editions e on e.id=f.draft_id
    join public.edition_succession_candidates c on c.id=f.candidate_id
    left join public.source_review_tasks t on t.fingerprint='succession:'||c.id::text where f.n<=batch_size;
    select count(*) into after_audits from public.event_audit_log where entity_id=any(draft_ids::text[]);
    perform pg_temp.ep_assert(before_rows=after_rows and before_audits=after_audits,
      'failed final member leaves every draft candidate task and audit unchanged '||batch_size);
  end loop;
  execute 'reset role';
end;
$tests$;
select count(*) as passed_assertions,jsonb_agg(label order by label) as assertions from ep_checks;
rollback;
