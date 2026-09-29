begin;
set local lock_timeout='5s';

-- An explicit list of the existing Knowledge columns, not a new fact store.
create function private.manual_knowledge_fields()
returns jsonb language sql immutable security invoker set search_path=pg_catalog
as $fields$ select '{
 "basis":["event_series","first_edition","region"],
 "registration":["registration_open_date","registration_close_date","price_tiers","lottery_available","qualification_required","charity_entries","waiting_list","transfer_possible","refund_policy","sold_out_status"],
 "course":["course_type","course_character","surface","start_location","finish_location","start_finish_same_place","loop_course","point_to_point","gpx_url","elevation_profile_url","course_map_url","difficulty_rating","beginner_friendly","personal_best_potential","scenic_rating","crowd_support_rating","swim_location","swim_type","bike_laps","bike_character","run_laps","run_character","transition_area"],
 "race_day":["wave_start","total_cutoff","intermediate_cutoffs","aid_stations","pacers_available","timing_system","bag_drop","showers","changing_rooms","toilets","medical_support","live_tracking","livestream","expo_available","bib_pickup_info","swim_cutoff","bike_cutoff","run_cutoff"],
 "travel":["nearest_airport","nearest_train_station","public_transport_info","parking_info","accommodation_info","camping_available","recommended_arrival","recommended_booking_time","timezone"],
 "weather":["average_temperature","average_high_temperature","average_low_temperature","average_rainfall","typical_weather","heat_risk","wind_risk","best_conditions_note","seasonal_context","planning_tips"],
 "statistics":["participant_count","finisher_count","women_percentage","average_finish_time","last_winner_male","last_winner_female","last_winning_time_male","last_winning_time_female","historic_significance","notable_facts","world_major","utmb_index","boston_qualifier","championship_status"],
 "editorial":["why_this_event_stands_out","course_character","atmosphere","good_fit_for","not_ideal_for","insider_tips","planning_context","seo_summary"]
 }'::jsonb $fields$;
revoke all on function private.manual_knowledge_fields() from public;
grant execute on function private.manual_knowledge_fields() to anon,authenticated;

-- Public provenance is only a list of explicitly cleared field names. Raw audit
-- rows, actors and notes stay private. Child INSERT defaults have SQL-NULL old
-- values and are deliberately excluded; they are not a user's deletion.
create function private.manual_knowledge_cleared_fields(p_detail_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,private
as $clears$
 select coalesce(jsonb_agg(substr(a.field_name,11) order by a.field_name),'[]'::jsonb)
 from public.event_details d cross join lateral (
   select distinct on(log.field_name) log.field_name,log.new_value
   from public.event_audit_log log
   where log.entity_type=case when d.edition_id is null then 'event' else 'edition' end
     and log.entity_id=coalesce(d.edition_id::text,d.event_brand_id::text)
     and log.changed_by_process='knowledge_field_guard' and log.field_name like 'knowledge.%'
     and log.field_name<>'knowledge.__record__' and log.created_at>=d.created_at
     and log.old_value is not null
   order by log.field_name,log.created_at desc,log.id desc
 ) a
 where d.id=p_detail_id and (
   (auth.uid() is not null and private.is_admin())
   or (d.is_public and exists(select 1 from public.events e where e.id=d.event_brand_id and e.status='approved' and e.publication_status='published')
     and (d.knowledge_scope='brand' or (d.knowledge_scope='edition' and exists(select 1 from public.event_editions edition
       where edition.id=d.edition_id and edition.event_id=d.event_brand_id and edition.publication_status='published')))))
   and (a.new_value is null or a.new_value in('null'::jsonb,'""'::jsonb,'[]'::jsonb)
     or (a.field_name like 'knowledge.faq.%' and a.new_value='{}'::jsonb));
$clears$;
revoke all on function private.manual_knowledge_cleared_fields(uuid) from public;
grant execute on function private.manual_knowledge_cleared_fields(uuid) to anon,authenticated;

-- Same record shape as the existing export. Child metadata also participates in
-- the Admin context fingerprint, so an out-of-band child write conflicts.
create function private.manual_knowledge_record(p_detail_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,private
as $record$
declare result jsonb; owned text[]:='{}'::text[]; cleared text[]:='{}'::text[];
 section text; field text; value jsonb; path text;
begin
 select to_jsonb(d)||jsonb_build_object(
  'basis',to_jsonb(d)-array['id','event_brand_id','edition_id','knowledge_scope'],
  'registration',coalesce((select to_jsonb(c) from public.event_registration c where c.event_detail_id=d.id order by c.id limit 1),'{}'::jsonb),
  'course',coalesce((select to_jsonb(c) from public.event_course c where c.event_detail_id=d.id order by c.id limit 1),'{}'::jsonb),
  'race_day',coalesce((select to_jsonb(c) from public.event_race_day c where c.event_detail_id=d.id order by c.id limit 1),'{}'::jsonb),
  'travel',coalesce((select to_jsonb(c) from public.event_travel c where c.event_detail_id=d.id order by c.id limit 1),'{}'::jsonb),
  'weather',coalesce((select to_jsonb(c) from public.event_weather c where c.event_detail_id=d.id order by c.id limit 1),'{}'::jsonb),
  'statistics',coalesce((select to_jsonb(c) from public.event_statistics c where c.event_detail_id=d.id order by c.id limit 1),'{}'::jsonb),
  'editorial',coalesce((select to_jsonb(c) from public.event_editorial c where c.event_detail_id=d.id order by c.id limit 1),'{}'::jsonb),
  'faq',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.id) from public.event_faq c where c.event_detail_id=d.id),'[]'::jsonb),
  'sources',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.event_detail_sources c where c.event_detail_id=d.id),'[]'::jsonb)
 ) into result from public.event_details d where d.id=p_detail_id;
 if result is null then return null; end if;
 foreach section in array array['basis','registration','course','race_day','travel','weather','statistics','editorial'] loop
   for field,value in select entry.key,entry.value from jsonb_each(result->section) entry loop
     if field not in('id','event_detail_id','created_at','updated_at') and value not in('null'::jsonb,'""'::jsonb,'[]'::jsonb)
       and (jsonb_typeof(value)<>'string' or nullif(btrim(value #>> '{}'),'') is not null) then
       owned:=array_append(owned,section||'.'||field);
     end if;
   end loop;
 end loop;
 for value in select jsonb_array_elements(result->'faq') loop owned:=array_append(owned,'faq.'||(value->>'id')); end loop;
 for path in select jsonb_array_elements_text(private.manual_knowledge_cleared_fields(p_detail_id)) loop
   -- A subsequently populated value owns its field regardless of older clears.
   if not(path=any(owned)) then cleared:=array_append(cleared,path); end if;
 end loop;
 return result||jsonb_build_object('owned_fields',to_jsonb(owned||cleared),'cleared_fields',to_jsonb(cleared));
end;
$record$;
revoke all on function private.manual_knowledge_record(uuid) from public;
grant execute on function private.manual_knowledge_record(uuid) to anon,authenticated;

create function public.get_public_event_detail_bundle(p_edition_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,private
as $public$
#variable_conflict use_variable
declare event_id bigint; result jsonb;
begin
 select a.event_id into event_id from public.public_event_archive a where a.edition_id=p_edition_id;
 if event_id is null then return '[]'::jsonb; end if;
 if exists(select 1 from public.event_details k where k.is_public and k.event_brand_id=event_id
     and ((k.knowledge_scope='edition' and k.edition_id=p_edition_id) or (k.knowledge_scope='brand' and k.edition_id is null))
     group by k.knowledge_scope having count(*)>1) then
   raise exception 'Mehrere Zusatzdetail-Datensätze sind derselben Ausgabe zugeordnet. Bitte prüfen.' using errcode='23514'; end if;
 select coalesce(jsonb_agg(private.manual_knowledge_record(k.id) order by k.knowledge_scope,k.id),'[]'::jsonb) into result
 from public.event_details k join public.event_editions edition on edition.id=p_edition_id
 where k.is_public and k.event_brand_id=event_id and (
   (k.knowledge_scope='brand' and k.edition_id is null)
   or (k.knowledge_scope='edition' and k.edition_id=p_edition_id and k.event_slug=edition.edition_slug));
 return result;
end;
$public$;
revoke all on function public.get_public_event_detail_bundle(uuid) from public;
grant execute on function public.get_public_event_detail_bundle(uuid) to anon,authenticated;

-- Split legacy section-wide citations when one field changes. Unchanged fields
-- retain their existing citations; the edited field must be explicitly checked.
create function private.invalidate_manual_knowledge_citation(p_detail_id uuid,p_field text,p_old jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public,private
as $invalidate$
declare citation record; token text; section text:=split_part(p_field,'.',1); paths text[]; name text;
begin
 for citation in select * from public.event_detail_sources where event_detail_id=p_detail_id for update loop
   if not exists(select 1 from regexp_split_to_table(coalesce(citation.field_path,''),'\s*,\s*') f where f in(p_field,section)) then continue; end if;
   paths:='{}'::text[];
   for token in select regexp_split_to_table(coalesce(citation.field_path,''),'\s*,\s*') loop
     if token=p_field then continue;
     elsif token=section then
       if section='faq' then
         for name in select 'faq.'||q.id from public.event_faq q where q.event_detail_id=p_detail_id and 'faq.'||q.id<>p_field loop paths:=array_append(paths,name); end loop;
       else
         for name in select key from jsonb_each(p_old) where key not in('id','event_detail_id','created_at','updated_at')
             and value not in('null'::jsonb,'""'::jsonb,'[]'::jsonb) and section||'.'||key<>p_field loop paths:=array_append(paths,section||'.'||name); end loop;
       end if;
     elsif token<>'' then paths:=array_append(paths,token); end if;
   end loop;
   if cardinality(paths)=0 then
     update public.event_detail_sources set last_verified=null where id=citation.id;
   else
     update public.event_detail_sources set field_path=array_to_string(paths,',') where id=citation.id;
   end if;
 end loop;
end;
$invalidate$;
revoke all on function private.invalidate_manual_knowledge_citation(uuid,text,jsonb) from public,anon,authenticated;

-- Canonical field controls apply to direct imports too. Admin edits are audited
-- and invalidate exactly their prior field citation, including the older editor.
create function private.guard_manual_knowledge_fields()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $guard$
declare detail public.event_details; before_value jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_value jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 section text:=case when tg_table_name='event_details' then 'basis' else substr(tg_table_name,7) end;
 field text; value jsonb; path text; detail_id uuid; actor uuid:=auth.uid(); trusted boolean;
begin
 detail_id:=case when tg_table_name='event_details' then coalesce(after_value->>'id',before_value->>'id')::uuid
   else coalesce(after_value->>'event_detail_id',before_value->>'event_detail_id')::uuid end;
 select * into detail from public.event_details where id=detail_id for update;
 if detail.id is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 -- Legacy mixed rows have no canonical control/audit parent. They remain under
 -- their existing Admin policies until an explicit identity review links them.
 if detail.event_brand_id is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_op='INSERT' and section not in('basis','faq') then
   execute format('select exists(select 1 from public.%I where event_detail_id=$1)',tg_table_name) into trusted using detail.id;
   if trusted then raise exception 'Für diesen Zusatzbereich existiert bereits eine Zeile.' using errcode='23505'; end if;
 end if;
 if tg_op='UPDATE' and (after_value->>'event_detail_id') is distinct from (before_value->>'event_detail_id') then
   raise exception 'Zusatzdetail-Zuordnungen dürfen nicht umgehängt werden.' using errcode='23514'; end if;
 if tg_table_name='event_details' and tg_op='UPDATE' and
   (after_value->'event_brand_id',after_value->'edition_id',after_value->'knowledge_scope',after_value->'event_slug')
     is distinct from (before_value->'event_brand_id',before_value->'edition_id',before_value->'knowledge_scope',before_value->'event_slug')
   and exists(select 1 from public.event_field_controls c where c.event_id=detail.event_brand_id and c.edition_id is not distinct from detail.edition_id and c.field_name like 'knowledge.%' and c.is_locked) then
   raise exception 'Geprüfte Zusatzdetails dürfen nicht einer anderen Ausgabe zugeordnet werden.' using errcode='23514'; end if;
 trusted:=actor is not null and private.is_admin() and coalesce(current_setting('app.change_source',true),'') not in('import','crawler');
 if tg_table_name='event_details' and tg_op='DELETE' then
   if not trusted and exists(select 1 from public.event_field_controls c where c.event_id=detail.event_brand_id
     and c.edition_id is not distinct from detail.edition_id and c.field_name like 'knowledge.%' and c.is_locked
     and (c.lock_expires_at is null or c.lock_expires_at>now())) then
     raise exception 'Manuell geschützte Zusatzdetails dürfen nicht automatisch gelöscht werden.' using errcode='23514'; end if;
   insert into public.event_audit_log(entity_type,entity_id,field_name,old_value,change_source,changed_by,changed_by_process,reason,created_at)
     values(case when detail.edition_id is null then 'event' else 'edition' end,coalesce(detail.edition_id::text,detail.event_brand_id::text),
       'knowledge.__record__',private.manual_knowledge_record(detail.id),case when trusted then 'manual_admin' else 'system' end,actor,'knowledge_field_guard',current_setting('app.change_reason',true),clock_timestamp());
 end if;
 if section='faq' then
   if tg_op='UPDATE' and (old.question,old.answer) is not distinct from (new.question,new.answer) then return new; end if;
   path:='faq.'||coalesce(after_value->>'id',before_value->>'id');
   if not trusted and exists(select 1 from public.event_field_controls c where c.event_id=detail.event_brand_id
       and c.edition_id is not distinct from detail.edition_id and c.field_name='knowledge.'||path and c.is_locked
       and (c.lock_expires_at is null or c.lock_expires_at>now())) then
     raise exception 'Manuell geschützte FAQ: Änderung muss geprüft werden.' using errcode='23514'; end if;
   perform private.invalidate_manual_knowledge_citation(detail.id,path,before_value);
   if tg_op<>'DELETE' then new.last_verified:=null; new.source_url:=null; end if;
   insert into public.event_audit_log(entity_type,entity_id,field_name,old_value,new_value,change_source,changed_by,changed_by_process,reason,created_at)
     values(case when detail.edition_id is null then 'event' else 'edition' end,coalesce(detail.edition_id::text,detail.event_brand_id::text),
       'knowledge.'||path,before_value,after_value,case when trusted then 'manual_admin' else 'system' end,actor,'knowledge_field_guard',current_setting('app.change_reason',true),clock_timestamp());
 else
   for field,value in select entry.key,entry.value from jsonb_each(before_value||after_value) entry where entry.key not in('id','event_detail_id','created_at','updated_at') loop
     if tg_table_name='event_details' and not (private.manual_knowledge_fields()->'basis' ? field) then continue; end if;
     if before_value->field is not distinct from after_value->field then continue; end if;
     path:=section||'.'||field;
     if not trusted and exists(select 1 from public.event_field_controls c where c.event_id=detail.event_brand_id
       and c.edition_id is not distinct from detail.edition_id and c.field_name='knowledge.'||path and c.is_locked
       and (c.lock_expires_at is null or c.lock_expires_at>now())) then
       raise exception 'Manuell geschütztes Zusatzfeld %: Änderung muss geprüft werden.',path using errcode='23514'; end if;
     perform private.invalidate_manual_knowledge_citation(detail.id,path,before_value);
     insert into public.event_audit_log(entity_type,entity_id,field_name,old_value,new_value,change_source,changed_by,changed_by_process,reason,created_at)
       values(case when detail.edition_id is null then 'event' else 'edition' end,coalesce(detail.edition_id::text,detail.event_brand_id::text),
         'knowledge.'||path,before_value->field,after_value->field,case when trusted then 'manual_admin' else 'system' end,actor,'knowledge_field_guard',current_setting('app.change_reason',true),clock_timestamp());
   end loop;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$guard$;
revoke all on function private.guard_manual_knowledge_fields() from public,anon,authenticated;
do $triggers$ declare tab text; begin
 foreach tab in array array['event_details','event_registration','event_course','event_race_day','event_travel','event_weather','event_statistics','event_editorial','event_faq'] loop
   execute format('create trigger manual_knowledge_field_guard before insert or update or delete on public.%I for each row execute function private.guard_manual_knowledge_fields()',tab);
 end loop;
end $triggers$;

create function private.lock_manual_knowledge_source_parent()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $lock$ begin
 perform 1 from public.event_details where id=case when tg_op='DELETE' then old.event_detail_id else new.event_detail_id end for update;
 if tg_op='DELETE' then return old; else return new; end if;
end $lock$;
revoke all on function private.lock_manual_knowledge_source_parent() from public,anon,authenticated;
create trigger manual_knowledge_source_parent_lock before insert or update or delete on public.event_detail_sources
for each row execute function private.lock_manual_knowledge_source_parent();

create function private.apply_manual_event_knowledge(p_event_id bigint,p_edition_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $apply$
#variable_conflict use_variable
declare input jsonb:=p_request->'knowledge'; scope text:=coalesce(input->>'scope','edition');
 patches jsonb:=coalesce(input->'patch','{}'::jsonb); clears jsonb:=coalesce(input->'clear_fields','[]'::jsonb);
 confirmations jsonb:=coalesce(input->'confirmations','[]'::jsonb); faq_upserts jsonb:=coalesce(input->'faq_upserts','[]'::jsonb); faq_remove jsonb:=coalesce(input->'faq_remove','[]'::jsonb);
 allowed jsonb:=private.manual_knowledge_fields(); e public.events; d public.event_editions; detail public.event_details;
 section text; field text; path text; value jsonb; item jsonb; table_name text; assignments text; row_id uuid; faq_id uuid;
 confirmation jsonb; source_url text; old_source public.event_detail_sources; actor uuid:=auth.uid(); note text:=nullif(btrim(p_request->>'notes'),'');
 bind_edition uuid; slug text; current_value jsonb; control_name text; amount integer; has_sources boolean;
begin
 if actor is null or not private.is_admin() then raise exception 'Nur Administratoren dürfen Zusatzdetails pflegen.' using errcode='42501'; end if;
 if jsonb_typeof(input)<>'object' or exists(select 1 from jsonb_object_keys(input) k where k not in('scope','patch','clear_fields','confirmations','faq_upserts','faq_remove'))
   or scope not in('edition','brand') or jsonb_typeof(patches)<>'object' or jsonb_typeof(clears)<>'array'
   or jsonb_typeof(confirmations)<>'array' or jsonb_typeof(faq_upserts)<>'array' or jsonb_typeof(faq_remove)<>'array'
   or length(input::text)>200000 or jsonb_array_length(faq_upserts)>100 or jsonb_array_length(confirmations)>150
   or (jsonb_array_length(confirmations)>0 and coalesce(p_request->>'source_result','confirmed')<>'confirmed') then
   raise exception 'Ungültige Zusatzdetails. Bitte die vorgesehenen Eingabefelder verwenden.' using errcode='22023'; end if;
 select * into e from public.events where id=p_event_id;
 select * into d from public.event_editions where id=p_edition_id and event_id=p_event_id;
 if d.id is null then raise exception 'Die ausgewählte Ausgabe wurde nicht gefunden.' using errcode='23514'; end if;
 bind_edition:=case when scope='edition' then d.id end;
 slug:=case when scope='edition' then d.edition_slug else e.slug end;
 if (select count(*) from public.event_details k where k.event_brand_id=e.id and k.knowledge_scope=scope and k.edition_id is not distinct from bind_edition)>1 then
   raise exception 'Mehrere Zusatzdetail-Datensätze passen zu dieser Auswahl. Bitte die Zuordnung prüfen.' using errcode='23514'; end if;
 select * into detail from public.event_details k where k.event_brand_id=e.id and k.knowledge_scope=scope and k.edition_id is not distinct from bind_edition for update;
 if detail.id is null then
   if exists(select 1 from public.event_details k where k.event_slug=slug) then
     raise exception 'Für dieses Seitenkürzel existieren noch anders zugeordnete Zusatzdetails. Die Editionszuordnung muss zuerst geprüft werden.' using errcode='23514'; end if;
   insert into public.event_details(event_brand_id,edition_id,knowledge_scope,event_id,event_slug,event_name,is_public,verification_status)
     values(e.id,bind_edition,scope,e.id::text,slug,e.canonical_name,false,'draft') returning * into detail;
 end if;
 for path in select jsonb_array_elements_text(clears) loop
   section:=split_part(path,'.',1); field:=split_part(path,'.',2);
   if array_length(string_to_array(path,'.'),1)<>2 or not coalesce(allowed->section ? field,false) or coalesce(patches->section ? field,false) then
     raise exception 'Ein Zusatzfeld darf nur ausdrücklich und nicht zugleich geändert und gelöscht werden: %.',path using errcode='22023'; end if;
   patches:=jsonb_set(patches,array[section],coalesce(patches->section,'{}'::jsonb)||jsonb_build_object(field,case when field in('price_tiers','intermediate_cutoffs') then '[]'::jsonb else 'null'::jsonb end),true);
 end loop;
 for section,item in select entry.key,entry.value from jsonb_each(patches) entry loop
   if not (allowed ? section) or jsonb_typeof(item)<>'object' or (scope='brand' and section not in('basis','editorial','travel','weather')) then
     raise exception 'Diese Zusatzangaben gehören zu einer einzelnen Ausgabe: %.',section using errcode='22023'; end if;
   for field,value in select entry.key,entry.value from jsonb_each(item) entry loop
     if not (allowed->section ? field) then raise exception 'Dieses Zusatzfeld ist nicht vorgesehen: %.%.',section,field using errcode='22023'; end if;
     if (value='null'::jsonb or value='""'::jsonb or value='[]'::jsonb) and not(clears ? (section||'.'||field)) then
       raise exception 'Zum Löschen % bitte die ausdrückliche Löschoption verwenden.',field using errcode='22023'; end if;
     if field in('price_tiers','intermediate_cutoffs') then
       if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>100 then raise exception 'Staffeln und Zeitlimits benötigen eine Liste.' using errcode='22023'; end if;
       for current_value in select jsonb_array_elements(value) loop
         if jsonb_typeof(current_value)<>'object' or exists(select 1 from jsonb_object_keys(current_value) k where
           (field='price_tiers' and k not in('tier','price','currency','until','note')) or (field='intermediate_cutoffs' and k not in('point','time'))) then
           raise exception 'Ungültige Felder in Gebührenstaffel oder Zeitlimit.' using errcode='22023'; end if;
         if exists(select 1 from jsonb_each(current_value) entry where
           not(jsonb_typeof(entry.value)='string' or (entry.key='price' and jsonb_typeof(entry.value)='number'))
           or length(entry.value #>> '{}')>2000) then raise exception 'Staffeln und Zeitlimits benötigen kurze Textwerte, keine verschachtelten Objekte.' using errcode='22023'; end if;
         if field='price_tiers' and (nullif(btrim(current_value->>'tier'),'') is null or nullif(btrim(current_value->>'price'),'') is null
           or (current_value ? 'currency' and current_value->>'currency' !~ '^[A-Z]{3}$')) then raise exception 'Jede Gebührenstaffel benötigt Bezeichnung, Preis und gegebenenfalls einen Währungscode.' using errcode='22023'; end if;
         if field='intermediate_cutoffs' and (nullif(btrim(current_value->>'point'),'') is null or nullif(btrim(current_value->>'time'),'') is null) then
           raise exception 'Jedes Zwischenlimit benötigt Kontrollpunkt und Zeitangabe.' using errcode='22023'; end if;
       end loop;
     elsif field in('lottery_available','charity_entries','start_finish_same_place','loop_course','point_to_point','world_major','boston_qualifier') then
       if jsonb_typeof(value) not in('boolean','null') then raise exception 'Bitte Ja, Nein oder unbekannt auswählen.' using errcode='22023'; end if;
     elsif jsonb_typeof(value) not in('string','null') or length(value #>> '{}')>15000 then
       raise exception 'Zusatzfelder benötigen lesbaren Text (höchstens 15000 Zeichen).' using errcode='22023';
     end if;
     if field like '%\_url' escape '\' and value<>'null'::jsonb and value #>> '{}' !~* '^https?://[^[:space:]@]+$' then
       raise exception 'Bitte eine gültige Webadresse angeben.' using errcode='22023'; end if;
   end loop;
   if item='{}'::jsonb then continue; end if;
   table_name:=case when section='basis' then 'event_details' else 'event_'||section end;
   if section='basis' then row_id:=detail.id;
   else
     execute format('select count(*) from public.%I where event_detail_id=$1',table_name) into amount using detail.id;
     if amount>1 then raise exception 'Mehrere Zusatzdetail-Zeilen im Bereich %. Bitte zuerst prüfen.',section using errcode='23514'; end if;
     execute format('select id from public.%I where event_detail_id=$1 for update',table_name) into row_id using detail.id;
     if row_id is null then execute format('insert into public.%I(event_detail_id) values($1) returning id',table_name) into row_id using detail.id; end if;
   end if;
   select string_agg(format('%I=p.%I',k,k),',') into assignments from jsonb_object_keys(item) k;
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) p where t.id=$2',table_name,assignments,table_name) using item,row_id;
   get diagnostics amount=row_count;
   if amount<>1 then raise exception 'Zusatzangaben wurden nicht gespeichert.'; end if;
 end loop;
 for item in select jsonb_array_elements(faq_upserts) loop
   if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where k not in('id','question','answer','sort_order'))
     or nullif(btrim(item->>'question'),'') is null or nullif(btrim(item->>'answer'),'') is null
     or length(item->>'question')>1000 or length(item->>'answer')>15000 then raise exception 'Eine FAQ benötigt eine Frage und eine Antwort.' using errcode='22023'; end if;
   faq_id:=(item->>'id')::uuid;
   if faq_id is null or faq_remove ? faq_id::text then raise exception 'FAQ benötigt eine eindeutige, unveränderte Kennung.' using errcode='22023'; end if;
   if exists(select 1 from public.event_faq q where q.id=faq_id and q.event_detail_id<>detail.id) then raise exception 'Die FAQ gehört zu einem anderen Datensatz.' using errcode='23514'; end if;
   insert into public.event_faq(id,event_detail_id,question,answer,sort_order)
     values(faq_id,detail.id,item->>'question',item->>'answer',coalesce((item->>'sort_order')::integer,100))
     on conflict(id) do update set question=excluded.question,answer=excluded.answer,sort_order=excluded.sort_order;
 end loop;
 for path in select jsonb_array_elements_text(faq_remove) loop
   delete from public.event_faq where id=path::uuid and event_detail_id=detail.id;
   get diagnostics amount=row_count;
   if amount<>1 then raise exception 'Diese FAQ wurde inzwischen geändert oder gehört nicht zu dieser Ausgabe.' using errcode='PT409'; end if;
 end loop;
 for confirmation in select jsonb_array_elements(confirmations) loop
   if jsonb_typeof(confirmation)<>'object' or exists(select 1 from jsonb_object_keys(confirmation) k where k not in('field','source_url')) then
     raise exception 'Ungültige Feldbestätigung.' using errcode='22023'; end if;
   path:=confirmation->>'field'; section:=split_part(path,'.',1); field:=split_part(path,'.',2); source_url:=confirmation->>'source_url';
   if source_url is null or source_url !~* '^https://[^[:space:]@]+$' then raise exception 'Jede Zusatzfeld-Prüfung benötigt ihre offizielle HTTPS-Quelle.' using errcode='22023'; end if;
   if section='faq' then
     select jsonb_build_object('question',q.question,'answer',q.answer) into current_value from public.event_faq q where q.id=field::uuid and q.event_detail_id=detail.id;
   else
     if array_length(string_to_array(path,'.'),1)<>2 or not coalesce(allowed->section ? field,false)
       or (scope='brand' and section not in('basis','editorial','travel','weather')) then raise exception 'Unzulässiges Prüffeld: %.',path using errcode='22023'; end if;
     current_value:=private.manual_knowledge_record(detail.id)->section->field;
   end if;
   if current_value is null or current_value in('null'::jsonb,'""'::jsonb,'[]'::jsonb) then raise exception 'Ein unbekannter Zusatzwert kann nicht bestätigt werden: %.',path using errcode='22023'; end if;
   select * into old_source from public.event_detail_sources s where s.event_detail_id=detail.id and s.field_path=path and s.source_url=source_url order by s.id limit 1;
   if old_source.id is null then
     insert into public.event_detail_sources(event_detail_id,field_path,source_url,source_type,last_verified,confidence_score,verification_note)
       values(detail.id,path,source_url,'official',current_date,1,note);
   else update public.event_detail_sources set last_verified=current_date,source_type='official',confidence_score=1,verification_note=note where id=old_source.id; end if;
   if section='faq' then update public.event_faq set source_url=source_url,last_verified=current_date where id=field::uuid and event_detail_id=detail.id; end if;
   insert into public.event_audit_log(entity_type,entity_id,field_name,new_value,change_source,changed_by,changed_by_process,reason,source_url)
     values(case when bind_edition is null then 'event' else 'edition' end,coalesce(bind_edition::text,e.id::text),'__manual_knowledge_verification__',
       jsonb_build_object('detail_id',detail.id,'field',path,'value',current_value,'source_url',source_url,'result','confirmed','checked_at',now()),'manual_admin',actor,'manual_event_maintenance',note,source_url);
   control_name:='knowledge.'||path;
   if bind_edition is null then
     insert into public.event_field_controls(event_id,edition_id,entity_type,field_name,is_locked,manual_value,lock_reason,source_priority,confirmed_by)
       values(e.id,null,'event',control_name,true,current_value,note,1,actor)
       on conflict(event_id,field_name) where edition_id is null do update set manual_value=excluded.manual_value,is_locked=true,lock_reason=excluded.lock_reason,lock_expires_at=null,source_priority=1,confirmed_by=actor,confirmed_at=now(),updated_at=now();
   else
     insert into public.event_field_controls(event_id,edition_id,entity_type,field_name,is_locked,manual_value,lock_reason,source_priority,confirmed_by)
       values(e.id,bind_edition,'edition',control_name,true,current_value,note,1,actor)
       on conflict(edition_id,field_name) where edition_id is not null do update set manual_value=excluded.manual_value,is_locked=true,lock_reason=excluded.lock_reason,lock_expires_at=null,source_priority=1,confirmed_by=actor,confirmed_at=now(),updated_at=now();
   end if;
 end loop;
 select exists(select 1 from public.event_detail_sources s where s.event_detail_id=detail.id and s.last_verified is not null and s.last_verified<=current_date) into has_sources;
 update public.event_details set is_public=(e.status='approved' and e.publication_status='published' and (scope='brand' or d.publication_status='published')),
   verification_status=case when has_sources then 'partially_verified' else 'draft' end where id=detail.id;
 return private.manual_knowledge_record(detail.id);
end;
$apply$;
revoke all on function private.apply_manual_event_knowledge(bigint,uuid,jsonb) from public,anon,authenticated;

-- Integrate with the existing trusted action, version check and receipt. No
-- separate endpoint, version scheme, draft identity or idempotency table.
do $integrate$
declare definition text; needle text; replacement text;
begin
 definition:=replace(pg_get_functiondef('public.admin_manual_event_context(bigint)'::regprocedure),chr(13),'');
 needle:=$find$    'event',to_jsonb(e),$find$;
 replacement:=$replace$    'event',to_jsonb(e),
    'knowledge',coalesce((select jsonb_agg(private.manual_knowledge_record(k.id) order by k.id) from public.event_details k
      where k.event_brand_id=e.id or k.event_slug=e.slug or k.event_slug in(select edition_slug from public.event_editions where event_id=e.id)),'[]'::jsonb),$replace$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Manual context changed; inspect Knowledge integration'; end if;
 execute replace(definition,needle,replacement);
 definition:=replace(pg_get_functiondef('private.save_manual_event_maintenance(jsonb)'::regprocedure),chr(13),'');
 needle:=$find$  context:=public.admin_manual_event_context(event_id);$find$;
 replacement:=$replace$  perform 1 from public.event_details k where k.event_brand_id=event_id or k.event_slug=e.slug
    or k.event_slug in(select edition_slug from public.event_editions where public.event_editions.event_id=event_id) order by k.id for update;
  context:=public.admin_manual_event_context(event_id);$replace$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Manual save version gate changed; inspect Knowledge integration'; end if;
 definition:=replace(definition,needle,replacement);
 needle:=$find$  result:=jsonb_build_object('request_id',request_id,$find$;
 replacement:=$replace$  update public.event_details k set is_public=true where k.edition_id=edition_id and k.event_brand_id=event_id
    and k.knowledge_scope='edition' and not k.is_public
    and exists(select 1 from public.public_event_archive a where a.edition_id=edition_id)
    and exists(select 1 from public.event_audit_log a where a.field_name='__manual_knowledge_verification__'
      and a.changed_by_process='manual_event_maintenance' and a.new_value->>'detail_id'=k.id::text);
  if p_request ? 'knowledge' then perform private.apply_manual_event_knowledge(event_id,edition_id,p_request); end if;
  result:=jsonb_build_object('request_id',request_id,$replace$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Manual save receipt changed; inspect Knowledge integration'; end if;
 execute replace(definition,needle,replacement);
 definition:=replace(pg_get_functiondef('private.review_manual_event_maintenance(jsonb)'::regprocedure),chr(13),'');
 needle:=$find$ if coalesce(p_request->'event_patch','{}'::jsonb)<>'{}'::jsonb$find$;
 replacement:=$replace$ if p_request ? 'knowledge' or coalesce(p_request->'event_patch','{}'::jsonb)<>'{}'::jsonb$replace$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Manual review separation gate changed'; end if;
 execute replace(definition,needle,replacement);
end $integrate$;

commit;
notify pgrst,'reload schema';
