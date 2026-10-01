-- Synthetic, rollback-only integration for the existing isolated local runner.
-- Never execute against a linked or production database.
begin;
set local statement_timeout='120s';
set local lock_timeout='5s';
do $$ begin
 if current_setting('sporteventmap.test_catalog_snapshot',true) is distinct from 'isolated' then
   raise exception 'Run only from the disposable local maintenance test runner'; end if;
end $$;
create temporary table snapshot_checks(label text primary key) on commit drop;
grant select,insert on snapshot_checks to anon,authenticated;
create function pg_temp.cs_assert(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'CATALOG SNAPSHOT REGRESSION: %',label; end if;
 insert into pg_temp.snapshot_checks values(label);
end $$;
create function pg_temp.cs_check(snapshot jsonb,label text) returns void language plpgsql as $check$
declare
 fields text[]:=array['id','event_id','edition_id','event_key','event_name','sport','date','city','country','address',
  'latitude','longitude','distance','description','image','event_url','source_url','verification_status','priority',
  'last_checked','next_check','event_status','edition_slug','slug','edition_year','discovery_status','results_status',
  'registration_status','organizer_name','organizer_url','official_url','registration_url','brand_verification_status',
  'brand_last_verified_at','edition_verification_status','edition_last_verified_at','race_formats','end_date',
  'start_time','price_min','price_max','currency','participant_limit'];
 race_fields text[]:=array['label','distance_km','swim_km','bike_km','run_km','elevation_gain_m','sport','name','format',
  'start_time','price','currency','terrain','surface','relay','legs','leg_distance_km','distance_mode'];
begin
 perform pg_temp.cs_assert(snapshot->>'schema_version'='1' and snapshot->>'consistency'='single_statement',label||': single-statement schema');
 perform pg_temp.cs_assert(snapshot->>'measured_at'=snapshot->'freshness_guard'->>'evaluated_at'
   and (snapshot->>'measured_at')::timestamptz=statement_timestamp(),label||': guard has the same actual measurement time');
 perform pg_temp.cs_assert((snapshot->>'discovery_count')::integer=jsonb_array_length(snapshot->'discovery')
   and (snapshot->>'archive_count')::integer=jsonb_array_length(snapshot->'archive'),label||': complete array counts');
 perform pg_temp.cs_assert(not exists(select 1 from jsonb_array_elements(snapshot->'discovery') entry(row)
   where (select count(*) from jsonb_array_elements(snapshot->'archive') saved(row)
     where saved.row->>'edition_id'=entry.row->>'edition_id' and saved.row-'results'=entry.row)<>1),
   label||': Discovery exactly matches its archived edition facts');
 perform pg_temp.cs_assert((snapshot->'freshness_guard'->>'requested_count')::integer=jsonb_array_length(snapshot->'discovery')
   and not exists(select 1 from jsonb_object_keys(snapshot->'freshness_guard'->'decisions') decision(id)
     where not exists(select 1 from jsonb_array_elements(snapshot->'discovery') entry(row) where entry.row->>'edition_id'=decision.id))
   and not exists(select 1 from jsonb_array_elements(snapshot->'discovery') entry(row)
     where jsonb_typeof(snapshot->'freshness_guard'->'decisions'->(entry.row->>'edition_id')) is distinct from 'boolean'),
   label||': freshness decisions use exactly the Discovery cohort');
 perform pg_temp.cs_assert(not exists(select 1 from jsonb_object_keys(snapshot->'freshness_guard') key(name)
   where name not in('schema_version','evaluated_at','requested_count','decisions')),label||': freshness exposes no private evidence');
 perform pg_temp.cs_assert(not exists(select 1 from jsonb_array_elements(snapshot->'discovery') entry(row),
   lateral jsonb_object_keys(entry.row) key(name) where not name=any(fields))
   and not exists(select 1 from jsonb_array_elements(snapshot->'archive') entry(row),
   lateral jsonb_object_keys(entry.row) key(name) where not name=any(fields||array['results'])),label||': public row whitelist');
 perform pg_temp.cs_assert(not exists(select 1 from jsonb_array_elements((snapshot->'discovery')||(snapshot->'archive')) entry(row),
   lateral jsonb_array_elements(entry.row->'race_formats') race(row),lateral jsonb_object_keys(race.row) key(name)
   where not name=any(race_fields)),label||': nested competition whitelist');
 perform pg_temp.cs_assert(not exists(select 1 from jsonb_array_elements(snapshot->'archive') entry(row),
   lateral jsonb_array_elements(entry.row->'results') result(row),lateral jsonb_object_keys(result.row) key(name)
   where name not in('type','title','url','published_at')),label||': nested result whitelist');
 perform pg_temp.cs_assert(snapshot::text not like '%SNAPSHOT_PRIVATE_SENTINEL%',label||': internal review values excluded');
end;
$check$;

do $tests$
#variable_conflict use_variable
declare
 marker text:='catalog-snapshot-'||gen_random_uuid(); actor uuid:=gen_random_uuid(); event_id bigint; private_event_id bigint;
 edition_id uuid; historical_id uuid; draft_id uuid; archived_id uuid; private_id uuid; source_id uuid;
 future_date date:=make_date(extract(year from current_date)::integer+1,5,1);
 past_date date:=make_date(extract(year from current_date)::integer-1,5,1);
 original_checked timestamptz:='2000-01-01T00:00:00Z'; source_before jsonb; edition_before jsonb; audit_before bigint;
 snapshot jsonb; authenticated_snapshot jsonb; earlier_snapshot jsonb;
begin
 perform pg_temp.cs_assert((select not prosecdef and provolatile='s' from pg_proc
   where oid='public.get_public_event_catalog_snapshot()'::regprocedure),'snapshot is STABLE and security invoker');
 perform pg_temp.cs_assert(has_function_privilege('anon','public.get_public_event_catalog_snapshot()','execute')
   and has_function_privilege('authenticated','public.get_public_event_catalog_snapshot()','execute'),
   'existing public reader roles can execute snapshot');
 -- The disposable runner has no seed or production data. Test the real empty
 -- query path before adding fixtures instead of replacing any views with stubs.
 perform pg_temp.cs_assert(not exists(select 1 from public.events),'fresh isolated database has no prior event data');
 perform set_config('request.jwt.claims','{"role":"anon"}',true); perform set_config('request.jwt.claim.sub','',true);
 execute 'set local role anon';
 snapshot:=public.get_public_event_catalog_snapshot();
 perform pg_temp.cs_check(snapshot,'empty anon');
 perform pg_temp.cs_assert(snapshot->'discovery'='[]'::jsonb and snapshot->'archive'='[]'::jsonb
   and snapshot->'freshness_guard'->'decisions'='{}'::jsonb,'empty snapshot is honest and does not call nonempty-only guard');
 execute 'reset role';

 insert into auth.users(id,aud,role,email,created_at,updated_at)
   values(actor,'authenticated','authenticated',marker||'@example.invalid',now(),now());
 insert into public.profiles(id,email,role) values(actor,marker||'@example.invalid','user') on conflict(id) do update set role='user';
 insert into public.events(event_name,date,sport,city,country,address,latitude,longitude,distance,description,event_url,source_url,status)
   values(marker,to_char(future_date,'DD.MM.YYYY'),'Running','Berlin','Deutschland','Teststraße 1','52.52','13.405','10 km',
   'Synthetic snapshot regression only; no real event or source check.','https://example.invalid/snapshot',
   'https://example.invalid/snapshot','approved') returning id into event_id;
 select d.id into edition_id from public.event_editions d where d.event_id=event_id;
 update public.event_editions d set publication_status='published',discovery_status='active',edition_status='scheduled',
   source_url='https://example.invalid/snapshot',last_verified_at=original_checked,
   race_formats='[{"label":"10 km","distance_km":10,"surface":"road","internal_notes":"SNAPSHOT_PRIVATE_SENTINEL"}]'
   where d.id=edition_id;
 insert into public.event_editions(event_id,edition_year,edition_key,edition_slug,legacy_event_key,start_date,end_date,
   edition_status,publication_status,discovery_status,published_at,race_formats,source_url)
   values(event_id,extract(year from past_date)::smallint,'main',marker||'-past','edition:'||gen_random_uuid(),past_date,past_date,
     'completed','published','detail_only',now(),'[{"label":"10 km","distance_km":10}]','https://example.invalid/snapshot/past') returning id into historical_id;
 insert into public.event_editions(event_id,edition_year,edition_key,edition_slug,legacy_event_key,start_date,
   edition_status,publication_status,discovery_status,race_formats)
   values(event_id,extract(year from future_date)::smallint+1,'main',marker||'-draft','edition:'||gen_random_uuid(),future_date+366,
     'scheduled','draft','suppressed','[]') returning id into draft_id;
 insert into public.event_editions(event_id,edition_year,edition_key,edition_slug,legacy_event_key,start_date,
   edition_status,publication_status,discovery_status,published_at,race_formats)
   values(event_id,extract(year from past_date)::smallint-1,'main',marker||'-archived','edition:'||gen_random_uuid(),past_date-366,
     'completed','archived','detail_only',now(),'[]') returning id into archived_id;
 insert into public.events(event_name,date,sport,city,country,event_url,status)
   values(marker||'-private',to_char(future_date,'DD.MM.YYYY'),'Running','Berlin','Deutschland','https://example.invalid/private','pending')
   returning id into private_event_id;
 select d.id into private_id from public.event_editions d where d.event_id=private_event_id;
 update public.event_editions d set publication_status='published',discovery_status='active',edition_status='scheduled' where d.id=private_id;
 insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type,last_error,last_fetched_at)
   values(event_id,edition_id,'official_event_website','https://example.invalid/snapshot','manual','SNAPSHOT_PRIVATE_SENTINEL',original_checked)
   returning id into source_id;
 insert into public.event_audit_log(entity_type,entity_id,field_name,new_value,change_source,reason)
   values('edition',edition_id::text,'__snapshot_private_review__','{"note":"SNAPSHOT_PRIVATE_SENTINEL"}','system','SNAPSHOT_PRIVATE_SENTINEL');
 insert into public.edition_results(event_id,edition_id,result_type,result_status,publication_status,title,official_url,published_at,fingerprint,metadata)
   values(event_id,historical_id,'official_results','available','published','Synthetic published results','https://example.invalid/snapshot/results',
   original_checked,marker||'-public-result','{"review_note":"SNAPSHOT_PRIVATE_SENTINEL"}'),
   (event_id,historical_id,'certificate','candidate','draft','SNAPSHOT_PRIVATE_SENTINEL','https://example.invalid/snapshot/private-result',
   null,marker||'-draft-result','{}');
 select to_jsonb(s) into source_before from public.event_sources s where s.id=source_id;
 select to_jsonb(d) into edition_before from public.event_editions d where d.id=edition_id;
 select count(*) into audit_before from public.event_audit_log;

 perform set_config('request.jwt.claims','{"role":"anon"}',true); perform set_config('request.jwt.claim.sub','',true);
 execute 'set local role anon';
 snapshot:=public.get_public_event_catalog_snapshot();
 perform pg_temp.cs_check(snapshot,'populated anon');
 perform pg_temp.cs_assert(snapshot->>'discovery_count'='1' and snapshot->>'archive_count'='2',
   'one future search entry and two public editions are distinct counts');
 perform pg_temp.cs_assert((snapshot->'discovery'->0->>'edition_id')::uuid=edition_id
   and not exists(select 1 from jsonb_array_elements(snapshot->'archive') entry(row)
     where (entry.row->>'edition_id')::uuid in(draft_id,archived_id,private_id)),
   'drafts archived-only editions and unpublished parents stay outside snapshot');
 perform pg_temp.cs_assert(snapshot->'freshness_guard'->'decisions'->>edition_id::text='false',
   'reachable or fetched source alone is not complete verification');
 perform pg_temp.cs_assert(snapshot->'discovery'->0->>'last_checked'=to_jsonb(original_checked)#>>'{}',
   'snapshot measurement does not replace the actual field verification time');
 perform pg_temp.cs_assert((select jsonb_array_length(entry.row->'results')=1
   and entry.row->'results'->0->>'title'='Synthetic published results'
   from jsonb_array_elements(snapshot->'archive') entry(row) where entry.row->>'edition_id'=historical_id::text),
   'historical edition keeps its approved result but hides result drafts');
 execute 'reset role';

 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 perform set_config('request.jwt.claim.sub',actor::text,true); execute 'set local role authenticated';
 authenticated_snapshot:=public.get_public_event_catalog_snapshot();
 perform pg_temp.cs_check(authenticated_snapshot,'ordinary authenticated');
 perform pg_temp.cs_assert(authenticated_snapshot=snapshot,'ordinary authenticated and anon see identical public snapshot');
 execute 'reset role';
 perform pg_temp.cs_assert((select to_jsonb(s)=source_before from public.event_sources s where s.id=source_id)
   and (select to_jsonb(d)=edition_before from public.event_editions d where d.id=edition_id)
   and (select count(*)=audit_before from public.event_audit_log),'snapshot performs no data evidence or audit writes');

 earlier_snapshot:=snapshot;
 update public.event_editions d set start_date=future_date+2,end_date=future_date+2 where d.id=edition_id;
 perform set_config('request.jwt.claims','{"role":"anon"}',true); perform set_config('request.jwt.claim.sub','',true);
 execute 'set local role anon';
 snapshot:=public.get_public_event_catalog_snapshot();
 perform pg_temp.cs_check(snapshot,'after canonical date correction');
 perform pg_temp.cs_assert(snapshot->'discovery'->0->>'date'=to_char(future_date+2,'DD.MM.YYYY')
   and earlier_snapshot->'discovery'->0->>'date'=to_char(future_date,'DD.MM.YYYY')
   and snapshot->'discovery'->0->>'edition_id'=earlier_snapshot->'discovery'->0->>'edition_id'
   and snapshot->'discovery'->0->>'event_id'=event_id::text,
   'a later snapshot updates search and detail consistently without changing identity or older snapshot');
 execute 'reset role';
end;
$tests$;
select 'CATALOG_SNAPSHOT_ASSERTIONS='||count(*) from snapshot_checks;
rollback;
