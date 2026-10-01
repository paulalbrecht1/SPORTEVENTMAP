-- Synthetic integration only, in the disposable local maintenance runner.
-- No production database, real event or real source is permitted.
begin;
set local statement_timeout='120s';
set local lock_timeout='5s';
do $$ begin
 if current_setting('sporteventmap.test_manual_approval',true) is distinct from 'isolated' then
   raise exception 'Run only from the disposable local maintenance test runner'; end if;
end $$;
create temporary table approval_checks(label text primary key) on commit drop;
grant select,insert on approval_checks to authenticated,anon;
create function pg_temp.ma_assert(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'MANUAL APPROVAL REGRESSION: %',label; end if;
 insert into pg_temp.approval_checks values(label);
end $$;
create function pg_temp.ma_reject(statement text,label text,states text[] default array['22023','23514','23505','PT409','42501'])
returns void language plpgsql as $$ declare rejected boolean:=false; begin
 begin execute statement;
 exception when others then
   if sqlstate<>all(states) then raise exception 'Unexpected SQLSTATE % for %: %',sqlstate,label,sqlerrm; end if;
   rejected:=true;
 end;
 perform pg_temp.ma_assert(rejected,label);
end $$;
create function pg_temp.ma_suppress_date() returns trigger language plpgsql as $$ begin
 if new.event_id=nullif(current_setting('sporteventmap.test_manual_noop',true),'')::bigint then new.start_date:=old.start_date; end if;
 return new;
end $$;
create trigger zzzz_manual_approval_test_noop before update on public.event_editions for each row execute function pg_temp.ma_suppress_date();

do $tests$
#variable_conflict use_variable
declare
 marker text:='manual-approval-'||gen_random_uuid();
 admin_id uuid:=gen_random_uuid(); user_id uuid:=gen_random_uuid();
 event_id bigint; edition_id uuid; created_id uuid; draft_id uuid; source_id uuid; planner_id uuid;
 future_date date:=make_date(extract(year from current_date)::integer+1,5,1);
 postponed_date date:=make_date(extract(year from current_date)::integer+2,1,3);
 old_edition jsonb; context jsonb; request jsonb; receipt jsonb; replay jsonb; bundle jsonb;
 audit_count bigint; control_count bigint; source_state jsonb; faq_id uuid:=gen_random_uuid(); detail_id uuid;
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at)
 values(admin_id,'authenticated','authenticated',marker||'-admin@example.invalid',now(),now()),
       (user_id,'authenticated','authenticated',marker||'-user@example.invalid',now(),now());
 insert into public.profiles(id,email,role)
 values(admin_id,marker||'-admin@example.invalid','admin'),(user_id,marker||'-user@example.invalid','user')
 on conflict(id) do update set role=excluded.role;
 insert into public.events(event_name,date,city,country,sport,address,latitude,longitude,distance,description,event_url,source_url,status)
 values(marker,to_char(future_date,'DD.MM.YYYY'),'Berlin','Deutschland','Running','Teststraße 1','52.52000','13.40500','10 km',
   'A synthetic local running event for admin save regression, deliberately separated from all real event data and real source verification.',
   'https://example.invalid/approval','https://example.invalid/approval','approved') returning id into event_id;
 select e.id,to_jsonb(e) into edition_id,old_edition from public.event_editions e where e.event_id=event_id;
 update public.event_editions d set publication_status='published',discovery_status='active',edition_status='scheduled',
   source_url='https://example.invalid/approval',race_formats='[{"label":"10 km","distance_km":10}]' where d.id=edition_id;
 insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type,last_fetched_at,crawl_status)
 values(event_id,edition_id,'official_event_website','https://example.invalid/approval','manual','2000-01-01T00:00:00Z','success') returning id into source_id;
 select to_jsonb(s) into source_state from public.event_sources s where s.id=source_id;
 insert into public.season_planner_events(user_id,event_id,edition_id,priority,planned_distance)
 values(user_id,event_id::text,edition_id,'A','10 km') returning id into planner_id;
 insert into public.favorites(user_id,event_id) values(user_id,event_id::text);

 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 execute 'set local role authenticated';
 context:=public.admin_manual_event_context(event_id);
 request:=jsonb_build_object('request_id',gen_random_uuid(),'action','correct','manual_approval',true,
   'event_id',event_id,'edition_id',edition_id,'expected_version',context->>'version',
   'event_patch',jsonb_build_object('city','Potsdam'),'edition_patch',jsonb_build_object('start_date',postponed_date,'end_date',postponed_date),
   'confirmations','[]'::jsonb,'publish',true);
 receipt:=public.save_manual_event_maintenance(request);
 perform pg_temp.ma_assert(receipt->>'saved'='true' and receipt->'manual_approval'->>'approved'='true','one approval saves without required source or note');
 perform pg_temp.ma_assert(receipt->'freshness'->>'verified'='false' and receipt->'manual_approval'->>'source_verified'='false','manual approval is not fresh source verification');
 perform pg_temp.ma_assert(receipt->'changed_fields' ? 'edition.start_date' and receipt->'changed_fields' ? 'event.city','receipt reports real changed fields');
 perform pg_temp.ma_assert((select d.id=edition_id and d.edition_year=(old_edition->>'edition_year')::integer
   and d.edition_slug=old_edition->>'edition_slug' and d.legacy_event_key=old_edition->>'legacy_event_key' and d.start_date=postponed_date
   from public.event_editions d where d.id=edition_id),'postponement across year preserves the entire edition identity');
 perform pg_temp.ma_assert(receipt->'publication'->>'status'='database_public' and receipt->'publication'->>'public_view_available'='true'
   and receipt->'publication'->>'search_available'='true','published correction is immediately present in live views');
 perform pg_temp.ma_assert(exists(select 1 from public.event_field_controls c where c.event_id=event_id
   and c.edition_id is null and c.field_name='city' and c.is_locked and c.manual_value='"Potsdam"'::jsonb),'actual shared change is locked in existing controls');
 perform pg_temp.ma_assert(exists(select 1 from public.event_audit_log a where a.field_name='__manual_change_approval__'
   and a.entity_id=edition_id::text and a.changed_by=admin_id and a.new_value->>'source_verified'='false'),'changed values have server attributed approval audit');
 select count(*) into audit_count from public.event_audit_log a where a.entity_id in(event_id::text,edition_id::text);
 replay:=public.save_manual_event_maintenance(request);
 perform pg_temp.ma_assert(replay->>'replayed'='true' and (select count(*)=audit_count from public.event_audit_log a where a.entity_id in(event_id::text,edition_id::text)),
   'identical retry creates no duplicate audit');
 perform pg_temp.ma_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',jsonb_set(request,'{event_patch,city}','"Hamburg"')),
   'same request identifier cannot be reused with different values',array['22023']);
 perform pg_temp.ma_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',jsonb_set(request,'{request_id}',to_jsonb(gen_random_uuid()))),
   'stale version still rejects parallel changes',array['PT409']);
 context:=public.admin_manual_event_context(event_id);
 perform set_config('sporteventmap.test_manual_noop',event_id::text,true);
 request:=jsonb_build_object('request_id',gen_random_uuid(),'action','correct','manual_approval',true,'event_id',event_id,'edition_id',edition_id,
   'expected_version',context->>'version','edition_patch',jsonb_build_object('start_date',postponed_date+2,'end_date',postponed_date+2));
 perform pg_temp.ma_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',request),
   'formal update success with suppressed value must fail',array['23514']);
 perform set_config('sporteventmap.test_manual_noop','',true);
 perform pg_temp.ma_assert((select d.start_date=postponed_date and d.end_date=postponed_date from public.event_editions d where d.id=edition_id),
   'failed readback rolls back every partial change');

 context:=public.admin_manual_event_context(event_id);
 request:=jsonb_build_object('request_id',gen_random_uuid(),'action','correct','manual_approval',true,'event_id',event_id,'edition_id',edition_id,
   'expected_version',context->>'version','publish',true,'knowledge',jsonb_build_object('scope','edition','patch',
     jsonb_build_object('course',jsonb_build_object('start_location','Synthetischer Marktplatz')),
     'faq_upserts',jsonb_build_array(jsonb_build_object('id',faq_id,'question','Wo ist der Teststart?','answer','Am synthetischen Marktplatz.'))));
 receipt:=public.save_manual_event_maintenance(request);
 bundle:=public.get_public_event_detail_bundle(edition_id);
 detail_id:=(bundle->0->>'id')::uuid;
 perform pg_temp.ma_assert(receipt->'changed_fields' ? 'knowledge.course.start_location' and bundle->0->'manual_approved_fields' ? 'course.start_location'
   and bundle->0->'manual_approved_fields' ? ('faq.'||faq_id::text),'one save exposes approved Knowledge fields without source claims');
 perform pg_temp.ma_assert(bundle->0->'sources'='[]'::jsonb and not exists(select 1 from public.event_detail_sources s where s.event_detail_id=detail_id),
   'Knowledge approval does not manufacture a citation');
 perform pg_temp.ma_assert(exists(select 1 from public.event_field_controls c where c.event_id=event_id and c.edition_id=edition_id
   and c.field_name='knowledge.course.start_location' and c.is_locked and c.manual_value='"Synthetischer Marktplatz"'::jsonb),
   'Knowledge changes are locked independently of source confirmation');

 context:=public.admin_manual_event_context(event_id);
 request:=jsonb_build_object('request_id',gen_random_uuid(),'action','create','manual_approval',true,'event_id',event_id,'edition_id',edition_id,
   'expected_version',context->>'version','publish',true,'event_patch',jsonb_build_object('organizer_name','Synthetischer Veranstalter'),
   'knowledge',jsonb_build_object('scope','edition','patch',jsonb_build_object('course',jsonb_build_object('finish_location','Synthetisches neues Ziel'))),
   'edition_patch',jsonb_build_object('edition_year',extract(year from current_date)::integer+2,
     'edition_key','main','start_date',make_date(extract(year from current_date)::integer+2,5,1),
     'end_date',make_date(extract(year from current_date)::integer+2,5,1),'edition_status','scheduled',
     'source_url','https://example.invalid/approval/next','race_formats',jsonb_build_array(jsonb_build_object('label','10 km','distance_km',10))));
 receipt:=public.save_manual_event_maintenance(request); created_id:=(receipt->>'edition_id')::uuid;
 perform pg_temp.ma_assert(created_id<>edition_id and (select d.predecessor_edition_id=edition_id from public.event_editions d where d.id=created_id),
   'explicit create adds a separate edition with predecessor');
 perform pg_temp.ma_assert((select e.organizer_name='Synthetischer Veranstalter' from public.events e where e.id=event_id),
   'same approval can save actual shared brand changes while explicitly creating an edition');
 bundle:=public.get_public_event_detail_bundle(created_id);
 perform pg_temp.ma_assert(bundle->0->'manual_approved_fields' ? 'course.finish_location'
   and bundle->0->'course'->>'finish_location'='Synthetisches neues Ziel'
   and coalesce(bundle->0->'course'->'start_location','null'::jsonb)='null'::jsonb
   and bundle->0->'sources'='[]'::jsonb,
   'new edition Knowledge includes actual patch but no old fields or sources');
 perform pg_temp.ma_assert(receipt->'publication'->>'status'='database_public' and exists(select 1 from public.public_event_archive a where a.edition_id=created_id),
   'structurally valid explicit new edition publishes by manual approval');
 perform pg_temp.ma_assert((select d.last_verified_at is null and d.last_verified_source_id is null from public.event_editions d where d.id=created_id)
   and not exists(select 1 from public.event_audit_log a where a.entity_id=created_id::text and a.field_name in('__manual_field_verification__','__manual_source_review__')),
   'new edition inherits no old full source proof');
 -- Maintenance authorization does not grant access to another user's private
 -- Planner. Read preserved personal references under their actual owner JWT.
 perform pg_temp.ma_assert(not exists(select 1 from public.season_planner_events p where p.id=planner_id),
   'admin maintenance does not grant cross-user Planner visibility');
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_id)::text,true);
 perform set_config('request.jwt.claim.sub',user_id::text,true); execute 'set local role authenticated';
 perform pg_temp.ma_assert((select p.edition_id=edition_id from public.season_planner_events p where p.id=planner_id)
   and exists(select 1 from public.favorites f where f.user_id=user_id and f.event_id=event_id::text),
   'existing personal references remain attached to original identity');
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
 perform set_config('request.jwt.claim.sub',admin_id::text,true); execute 'set local role authenticated';
 context:=public.admin_manual_event_context(event_id);
 request:=jsonb_build_object('request_id',gen_random_uuid(),'action','create','manual_approval',true,'event_id',event_id,'edition_id',created_id,
   'expected_version',context->>'version','publish',true,'edition_patch',jsonb_build_object('edition_year',extract(year from current_date)::integer+3,'edition_key','main'));
 receipt:=public.save_manual_event_maintenance(request); draft_id:=(receipt->>'edition_id')::uuid;
 perform pg_temp.ma_assert(receipt->>'saved'='true' and receipt->'publication'->>'status'='draft' and receipt->'publication'->>'error' is not null
   and not exists(select 1 from public.public_event_archive a where a.edition_id=draft_id),
   'incomplete creation commits an honest unpublished draft');
 perform pg_temp.ma_assert((select to_jsonb(s)=source_state from public.event_sources s where s.id=source_id)
   and not exists(select 1 from public.event_audit_log a where a.entity_id in(event_id::text,edition_id::text,created_id::text,draft_id::text)
     and a.field_name in('__manual_source_review__','__manual_field_verification__','__manual_knowledge_verification__')),
   'source verification timestamps are not fabricated');

 execute 'reset role';
 perform set_config('request.jwt.claims','{"role":"anon"}',true); perform set_config('request.jwt.claim.sub','',true);
 execute 'set local role anon';
 perform pg_temp.ma_assert((select a.date=to_char(postponed_date,'DD.MM.YYYY') and a.city='Potsdam' from public.public_event_archive a where a.edition_id=edition_id),
   'anonymous detail reads saved canonical values');
 bundle:=public.get_public_event_detail_bundle(edition_id);
 perform pg_temp.ma_assert(bundle->0->'manual_approved_fields' ? 'course.start_location','anonymous bundle preserves approved field-name metadata');
 perform pg_temp.ma_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',request),'anon cannot approve or save',array['42501']);
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_id)::text,true);
 perform set_config('request.jwt.claim.sub',user_id::text,true); execute 'set local role authenticated';
 perform pg_temp.ma_reject(format('select public.save_manual_event_maintenance(%L::jsonb)',request),'ordinary user cannot approve or save',array['42501']);
 execute 'reset role';
end $tests$;
select 'MANUAL_APPROVAL_ASSERTIONS='||count(*) from approval_checks;
rollback;
