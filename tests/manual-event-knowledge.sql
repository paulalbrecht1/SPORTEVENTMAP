-- Synthetic, rollback-only Knowledge coverage in the owned acceptance database.
begin;
set local statement_timeout='120s';
set local lock_timeout='5s';
do $$ begin
 if current_setting('sporteventmap.test_manual_maintenance',true) is distinct from 'isolated' then
  raise exception 'Run only through the disposable local acceptance runner'; end if;
end $$;
create temporary table knowledge_checks(label text primary key) on commit drop;
create function pg_temp.kassert(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'MANUAL KNOWLEDGE REGRESSION: %',label; end if;
 insert into pg_temp.knowledge_checks values(label);
end $$;
create function pg_temp.kreject(statement text,label text,states text[] default array['22023','23514','PT409'])
returns void language plpgsql as $$ declare rejected boolean:=false; begin
 begin execute statement; exception when others then
  if sqlstate<>all(states) then raise exception 'Unexpected SQLSTATE % for %: %',sqlstate,label,sqlerrm; end if;
  rejected:=true;
 end;
 perform pg_temp.kassert(rejected,label);
end $$;
create function pg_temp.krequest(e bigint,d uuid,k jsonb,patch jsonb default '{}'::jsonb)
returns jsonb language sql as $$
 select jsonb_build_object('request_id',gen_random_uuid(),'action','correct','event_id',e,'edition_id',d,
 'expected_version',public.admin_manual_event_context(e)->>'version','edition_patch',patch,
 'source_url','https://example.invalid/knowledge','source_result','confirmed',
 'notes','Synthetische Zusatzangaben an der offiziellen Testquelle gezielt geprüft.','knowledge',k);
$$;
create function pg_temp.kpublic_bundle(d uuid) returns jsonb language plpgsql as $$
declare result jsonb; original_role text:=current_user;
 original_claims text:=current_setting('request.jwt.claims',true);
 original_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('role','anon',true);
 result:=public.get_public_event_detail_bundle(d);
 perform set_config('role',original_role,true);
 perform set_config('request.jwt.claims',original_claims,true);
 perform set_config('request.jwt.claim.sub',original_sub,true);
 return result;
end $$;

do $tests$
#variable_conflict use_variable
declare
 marker text:='knowledge-acceptance-'||gen_random_uuid(); admin_id uuid:=gen_random_uuid(); user_id uuid:=gen_random_uuid();
 eid bigint; did uuid; detail_id uuid; next_id uuid; next_detail_id uuid; faq_id uuid:=gen_random_uuid();
 future_date date:=make_date(extract(year from current_date)::integer+1,6,10);
 payload jsonb; outcome jsonb; old_context jsonb; bundle jsonb; old_record jsonb; old_edition jsonb;
 tiers jsonb:='[{"tier":"Early","price":"25","currency":"EUR","until":"2027-01-31"},{"tier":"Regular","price":"65","currency":"EUR"}]';
 initial_verified timestamptz;
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at) values
 (admin_id,'authenticated','authenticated',marker||'-admin@example.invalid',now(),now()),
 (user_id,'authenticated','authenticated',marker||'-user@example.invalid',now(),now());
 insert into public.profiles(id,email,role) values(admin_id,marker||'-admin@example.invalid','admin'),(user_id,marker||'-user@example.invalid','user')
 on conflict(id) do update set role=excluded.role;
 insert into public.events(event_name,date,city,country,sport,address,latitude,longitude,distance,description,event_url,source_url,status)
 values(marker,to_char(future_date,'DD.MM.YYYY'),'Berlin','Germany','Running','Teststraße 8','52.52','13.40','10 km',
 'Diese synthetische Veranstaltung prüft ausschließlich den isolierten Zusatzdetail-Speicherweg ohne produktive Daten.',
 'https://example.invalid/knowledge','https://example.invalid/knowledge','approved') returning id into eid;
 select d.id into did from public.event_editions d where d.event_id=eid;
 update public.event_editions set publication_status='published',discovery_status='active',edition_status='scheduled',
 race_formats='[{"label":"10 km","distance_km":10}]',registration_status='registration_open',registration_url='https://example.invalid/knowledge/register' where id=did;
 select d.last_verified_at into initial_verified from public.event_editions d where d.id=did;
 insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type,is_active,crawl_status)
 values(eid,did,'official_event_website','https://example.invalid/knowledge','json_ld',true,'success');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform pg_temp.kassert(public.admin_manual_event_context(eid)->'knowledge'='[]'::jsonb,'new canonical event has no invented knowledge');
 payload:=pg_temp.krequest(eid,did,jsonb_build_object('scope','edition','patch',jsonb_build_object('registration',jsonb_build_object('price_tiers',tiers),
   'course',jsonb_build_object('course_character','Noch ungeprüfte synthetische Streckenbeschreibung')),
   'confirmations',jsonb_build_array(jsonb_build_object('field','registration.price_tiers','source_url','https://example.invalid/knowledge/fees')),
   'faq_upserts',jsonb_build_array(jsonb_build_object('id',faq_id,'question','Wo ist das Startbüro?','answer','Am Testbahnhof.','sort_order',10))),jsonb_build_object('price_min',25,'price_max',65,'currency','EUR'));
 outcome:=public.save_manual_event_maintenance(payload);
 select k.id into detail_id from public.event_details k where k.edition_id=did;
 perform pg_temp.kassert(outcome->>'saved'='true' and detail_id is not null,'core and knowledge save through one canonical RPC');
 perform pg_temp.kassert((select d.price_min=25 and d.price_max=65 from public.event_editions d where d.id=did)
  and (select r.price_tiers=tiers from public.event_registration r where r.event_detail_id=detail_id),'core and structured tiers persist together');
 perform pg_temp.kassert(public.admin_manual_event_context(eid)->'knowledge'->0->'registration'->'price_tiers'=tiers,'fresh context reload contains persisted structured tiers');
 bundle:=public.get_public_event_detail_bundle(did);
 perform pg_temp.kassert(bundle->0->'registration'->'price_tiers'=tiers and bundle->0->>'edition_id'=did::text,'public bundle reads the exact edition and persisted tier values');
 perform pg_temp.kassert(exists(select 1 from public.event_detail_sources s where s.event_detail_id=detail_id and s.field_path='registration.price_tiers' and s.last_verified=current_date and s.source_type='official')
  and not exists(select 1 from public.event_detail_sources s where s.event_detail_id=detail_id and s.field_path in('course','course.course_character','faq','faq.'||faq_id)),
  'only explicit Knowledge fields gain source verification');
 perform pg_temp.kassert((select q.last_verified is null from public.event_faq q where q.id=faq_id),'unconfirmed FAQ remains a draft without fabricated proof');
 perform pg_temp.kassert((select d.last_verified_at is not distinct from initial_verified from public.event_editions d where d.id=did),'Knowledge confirmation does not refresh unreviewed core fields');
 perform public.save_manual_event_maintenance(pg_temp.krequest(eid,did,'{"scope":"edition","patch":{"travel":{"parking_info":"Neue ungeprüfte Parkplatzangabe"}}}'));
 bundle:=pg_temp.kpublic_bundle(did);
 perform pg_temp.kassert(bundle->0->'owned_fields' ? 'travel.parking_info'
  and not(bundle->0->'owned_fields' ? 'travel.nearest_train_station')
  and not(bundle->0->'cleared_fields' ? 'travel.nearest_train_station'),
  'anonymous bundle owns only supplied travel values and not untouched SQL NULL siblings');
 perform pg_temp.kassert(bundle->0->'travel'->>'parking_info'='Neue ungeprüfte Parkplatzangabe'
  and not exists(select 1 from public.event_detail_sources s where s.event_detail_id=detail_id and s.field_path in('travel','travel.parking_info') and s.last_verified is not null),
  'unconfirmed nonempty edition value retains ownership without fabricated verification');
 update public.event_travel set nearest_train_station='Geprüfter Testbahnhof',parking_info='Bisher geprüfter Parkplatz' where event_detail_id=detail_id;
 insert into public.event_detail_sources(event_detail_id,field_path,source_url,source_type,last_verified)
 values(detail_id,'travel','https://example.invalid/knowledge/travel','official',current_date);
 perform public.save_manual_event_maintenance(pg_temp.krequest(eid,did,'{"scope":"edition","patch":{"travel":{"parking_info":"Neue ungeprüfte Parkplatzangabe"}}}'));
 perform pg_temp.kassert(not exists(select 1 from public.event_detail_sources s where s.event_detail_id=detail_id and s.last_verified is not null
   and regexp_split_to_array(s.field_path,'\s*,\s*') && array['travel','travel.parking_info'])
  and exists(select 1 from public.event_detail_sources s where s.event_detail_id=detail_id and s.last_verified=current_date
   and 'travel.nearest_train_station'=any(regexp_split_to_array(s.field_path,'\s*,\s*'))),'editing one field splits broad source coverage without verifying its new value');
 perform pg_temp.kassert((select k.verification_status='partially_verified' from public.event_details k where k.id=detail_id)
  and (select t.nearest_train_station='Geprüfter Testbahnhof' from public.event_travel t where t.event_detail_id=detail_id),'unchanged verified sibling survives a partial Knowledge edit');
 perform pg_temp.kassert(exists(select 1 from public.event_audit_log a where a.entity_id=did::text and a.field_name='__manual_knowledge_verification__'
   and a.changed_by=admin_id and a.new_value->>'field'='registration.price_tiers' and (a.new_value->>'checked_at')::timestamptz=transaction_timestamp()),'Knowledge audit uses server actor and timestamp');
 outcome:=public.save_manual_event_maintenance(payload);
 perform pg_temp.kassert(outcome->>'replayed'='true' and (select count(*)=1 from public.event_details k where k.edition_id=did)
  and (select count(*)=1 from public.event_faq q where q.id=faq_id),'same request replay creates no Knowledge or FAQ duplicate');
 old_context:=public.admin_manual_event_context(eid);
 update public.event_course set course_character='Andere parallele Entwurfsänderung' where event_detail_id=detail_id;
 perform pg_temp.kassert((public.admin_manual_event_context(eid)->>'version') is distinct from old_context->>'version','child-only changes alter optimistic version');
 payload:=jsonb_set(pg_temp.krequest(eid,did,'{"scope":"edition","patch":{"travel":{"parking_info":"Testparkplatz"}}}'),'{expected_version}',old_context->'version');
 perform pg_temp.kreject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),'stale Knowledge context fails immediately as conflict',array['PT409']);
 old_record:=private.manual_knowledge_record(detail_id);
 old_edition:=(select to_jsonb(d) from public.event_editions d where d.id=did);
 payload:=pg_temp.krequest(eid,did,'{"scope":"edition","patch":{"registration":{"price_tiers":[{"tier":"Broken"}]}}}',jsonb_build_object('price_min',999));
 perform pg_temp.kreject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),'malformed Knowledge aborts the entire core edit');
 perform pg_temp.kassert(private.manual_knowledge_record(detail_id)=old_record and (select to_jsonb(d)=old_edition from public.event_editions d where d.id=did)
  and not exists(select 1 from private.manual_event_maintenance_receipts r where r.request_id=(payload->>'request_id')::uuid),'failed Knowledge leaves core children audits and receipt unchanged');
 payload:=pg_temp.krequest(eid,did,'{"scope":"edition","patch":{"registration":{"price_tiers":[{"tier":"Broken","price":{"amount":"25"}}]}}}',jsonb_build_object('price_min',999));
 perform pg_temp.kreject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),'nested price objects are rejected before a core edit can commit');
 perform pg_temp.kassert(private.manual_knowledge_record(detail_id)=old_record and (select to_jsonb(d)=old_edition from public.event_editions d where d.id=did)
  and not exists(select 1 from private.manual_event_maintenance_receipts r where r.request_id=(payload->>'request_id')::uuid),'nested malformed tier rolls back core and receipt atomically');
 payload:=pg_temp.krequest(eid,did,jsonb_build_object('scope','edition','faq_upserts',jsonb_build_array(jsonb_build_object('id',faq_id,'question','Wo ist das Startbüro?','answer','Am ausdrücklich geprüften Testbahnhof.','sort_order',10)),
  'confirmations',jsonb_build_array(jsonb_build_object('field','faq.'||faq_id,'source_url','https://example.invalid/knowledge/faq'))));
 perform public.save_manual_event_maintenance(payload);
 perform pg_temp.kassert((select count(*)=1 and bool_and(q.answer='Am ausdrücklich geprüften Testbahnhof.' and q.last_verified=current_date) from public.event_faq q where q.id=faq_id),'FAQ update preserves identity and stores explicit proof');
 perform set_config('app.change_source','crawler',true);
 perform pg_temp.kreject(format('update public.event_registration set price_tiers=%L::jsonb where event_detail_id=%L','[{"tier":"Crawler","price":"1"}]',detail_id),'crawler cannot overwrite manually confirmed tiers',array['23514']);
 perform pg_temp.kreject(format('update public.event_faq set answer=%L where id=%L','Crawler answer',faq_id),'crawler cannot overwrite manually confirmed FAQ',array['23514']);
 perform pg_temp.kreject(format('delete from public.event_details where id=%L',detail_id),'crawler cannot cascade-delete a parent with confirmed Knowledge',array['23514']);
 perform set_config('app.change_source','manual_admin',true);
 payload:=pg_temp.krequest(eid,did,'{"scope":"edition","patch":{"travel":{"parking_info":"Parken am Testgelände"}}}');
 perform public.save_manual_event_maintenance(payload);
 perform pg_temp.kassert((select r.price_tiers=tiers from public.event_registration r where r.event_detail_id=detail_id)
  and (select q.answer='Am ausdrücklich geprüften Testbahnhof.' from public.event_faq q where q.id=faq_id),'omitted collapsed sections preserve tiers and FAQ');
 payload:=pg_temp.krequest(eid,did,'{"scope":"edition","clear_fields":["travel.parking_info"]}');
 perform public.save_manual_event_maintenance(payload);
 perform pg_temp.kassert((select t.parking_info is null from public.event_travel t where t.event_detail_id=detail_id),'explicit clear removes only the selected optional fact');
 bundle:=pg_temp.kpublic_bundle(did);
 perform pg_temp.kassert(bundle->0->'owned_fields' ? 'travel.parking_info' and bundle->0->'cleared_fields' ? 'travel.parking_info'
  and not(bundle->0->'cleared_fields' ? 'travel.nearest_train_station'),
  'anonymous bundle distinguishes an explicit cleared field from untouched optional values');
 payload:=pg_temp.krequest(eid,did,'{"scope":"brand","patch":{"registration":{"price_tiers":[{"tier":"Annual","price":"25"}]}}}');
 perform pg_temp.kreject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),'annual fees cannot be stored as reusable brand knowledge');
 old_record:=private.manual_knowledge_record(detail_id);
 old_edition:=(select to_jsonb(d) from public.event_editions d where d.id=did);
 payload:=jsonb_build_object('request_id',gen_random_uuid(),'action','create','event_id',eid,'edition_id',did,
  'expected_version',public.admin_manual_event_context(eid)->>'version','edition_patch',jsonb_build_object('edition_year',extract(year from future_date)::integer+1,'edition_key','main','start_date',future_date+365),
  'source_url','https://example.invalid/knowledge/next','source_result','confirmed','notes','Synthetische neue Ausgabe, keine Jahresdaten übernommen.',
  'knowledge',jsonb_build_object('scope','edition','patch',jsonb_build_object('registration',jsonb_build_object('price_tiers',tiers)),
    'confirmations',jsonb_build_array(jsonb_build_object('field','registration.price_tiers','source_url','https://example.invalid/knowledge/next'))));
 outcome:=public.save_manual_event_maintenance(payload); next_id:=(outcome->>'edition_id')::uuid;
 perform pg_temp.kassert(next_id<>did and public.get_public_event_detail_bundle(next_id)='[]'::jsonb,'new draft Knowledge never leaks through the public edition bundle');
 perform pg_temp.kassert(private.manual_knowledge_record(detail_id)=old_record and (select to_jsonb(d)=old_edition from public.event_editions d where d.id=did),'new edition leaves predecessor edition and Knowledge unchanged');
 perform pg_temp.kassert(not exists(select 1 from public.event_faq q join public.event_details k on k.id=q.event_detail_id where k.edition_id=next_id),'new edition does not inherit annual FAQ');
 perform public.save_manual_event_maintenance(pg_temp.krequest(eid,next_id,'{"scope":"edition","clear_fields":["registration.price_tiers"]}'));
 select k.id into next_detail_id from public.event_details k where k.edition_id=next_id;
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('role','anon',true);
 bundle:=private.manual_knowledge_cleared_fields(next_detail_id);
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform pg_temp.kassert(bundle='[]'::jsonb,'anonymous provenance helper cannot reveal a private draft clear');
 payload:=pg_temp.krequest(eid,did,'{"scope":"edition","patch":{"travel":{"parking_info":"Not allowed"}}}');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_id)::text,true);
 perform set_config('request.jwt.claim.sub',user_id::text,true);
 perform pg_temp.kreject(format('select public.save_manual_event_maintenance(%L::jsonb)',payload),'nonadmin cannot use extended canonical write',array['42501']);
 perform pg_temp.kassert(not has_function_privilege('anon','private.apply_manual_event_knowledge(bigint,uuid,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','private.apply_manual_event_knowledge(bigint,uuid,jsonb)','EXECUTE'),'private Knowledge mutation cannot bypass canonical admin entry point');
end $tests$;
select 'MANUAL_KNOWLEDGE_ASSERTIONS='||count(*) from knowledge_checks;
rollback;
