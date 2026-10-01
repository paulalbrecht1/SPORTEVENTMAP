-- Local preparation only. Installation needs separate production permission.
-- One admin decision approves changed values; it does not attest a source check.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create function private.manual_knowledge_approved_fields(p_detail_id uuid,p_record jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,private
as $approved$
 select coalesce(jsonb_agg(a.new_value->>'field' order by a.new_value->>'field'),'[]'::jsonb)
 from public.event_details d cross join lateral (
   select distinct on(log.new_value->>'field') log.new_value
   from public.event_audit_log log
   where log.entity_type=case when d.edition_id is null then 'event' else 'edition' end
     and log.entity_id=coalesce(d.edition_id::text,d.event_brand_id::text)
     and log.field_name='__manual_knowledge_approval__' and log.change_source='manual_admin'
     and log.changed_by_process='manual_event_maintenance' and log.changed_by is not null
     and log.new_value->>'detail_id'=d.id::text and log.new_value->>'source_verified'='false'
   order by log.new_value->>'field',log.created_at desc,log.id desc
 ) a
 where d.id=p_detail_id and (
   (auth.uid() is not null and private.is_admin()) or (d.is_public
     and exists(select 1 from public.events e where e.id=d.event_brand_id and e.status='approved' and e.publication_status='published')
     and (d.knowledge_scope='brand' or exists(select 1 from public.event_editions edition
       where edition.id=d.edition_id and edition.event_id=d.event_brand_id and edition.publication_status='published'))))
   and coalesce(a.new_value->'value','null'::jsonb)=case
     when split_part(a.new_value->>'field','.',1)='faq' then coalesce((select jsonb_build_object('question',q->'question','answer',q->'answer','sort_order',q->'sort_order')
       from jsonb_array_elements(coalesce(p_record->'faq','[]'::jsonb)) q where q->>'id'=split_part(a.new_value->>'field','.',2)),'null'::jsonb)
     else coalesce(p_record->split_part(a.new_value->>'field','.',1)->split_part(a.new_value->>'field','.',2),'null'::jsonb) end;
$approved$;
revoke all on function private.manual_knowledge_approved_fields(uuid,jsonb) from public;
grant execute on function private.manual_knowledge_approved_fields(uuid,jsonb) to anon,authenticated;

create function private.approve_manual_event_save(p_event_id bigint,p_edition_id uuid,p_request jsonb,
 p_old_event jsonb,p_old_edition jsonb,p_old_knowledge jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private
as $approve$
#variable_conflict use_variable
declare
 actor uuid:=auth.uid(); e public.events; d public.event_editions; detail public.event_details;
 ep jsonb:=coalesce(p_request->'event_patch','{}'::jsonb); dp jsonb:=coalesce(p_request->'edition_patch','{}'::jsonb);
 knowledge jsonb:=p_request->'knowledge'; prior jsonb; current_record jsonb; value jsonb; expected jsonb;
 fields text[]:='{}'::text[]; scope text; key text; field text; section text; item jsonb; patch jsonb;
 reason text:=coalesce(nullif(btrim(p_request->>'notes'),''),'Änderungen manuell bestätigt.');
 publication jsonb; problem text; edition_binding uuid; knowledge_scope text;
begin
 if actor is null or not private.is_admin() or p_request->'manual_approval' is distinct from 'true'::jsonb then
   raise exception 'Eine ausdrückliche manuelle Adminfreigabe ist erforderlich.' using errcode='42501'; end if;
 if length(reason)<3 then reason:='Manuelle Freigabe: '||reason; end if;
 select * into e from public.events where id=p_event_id;
 select * into d from public.event_editions where id=p_edition_id and event_id=p_event_id;
 if d.id is null then raise exception 'Die gespeicherte Edition wurde nicht gefunden.' using errcode='23514'; end if;
 for field in select jsonb_array_elements_text(coalesce(p_request->'clear_fields','[]'::jsonb)) loop
   scope:=split_part(field,'.',1); key:=split_part(field,'.',2);
   if scope='event' then ep:=ep||jsonb_build_object(key,null); else dp:=dp||jsonb_build_object(key,null); end if;
 end loop;
 -- Native casts match the real update, so strings/numbers/dates compare as
 -- stored values. A suppressing trigger cannot turn a no-op into success.
 foreach scope in array array['event','edition'] loop
   patch:=case when scope='event' then ep else dp end;
   expected:=case when scope='event' then to_jsonb(jsonb_populate_record(null::public.events,patch))
     else to_jsonb(jsonb_populate_record(null::public.event_editions,patch)) end;
   prior:=case when scope='event' then p_old_event when p_request->>'action'='create' then '{}'::jsonb else p_old_edition end;
   for key in select jsonb_object_keys(patch) loop
     value:=case when scope='event' then to_jsonb(e)->key else to_jsonb(d)->key end;
     if value is distinct from expected->key then raise exception 'Der angeforderte Wert wurde nicht gespeichert: %.%.',scope,key using errcode='23514'; end if;
     if value is not distinct from prior->key then continue; end if;
     field:=scope||'.'||key; fields:=array_append(fields,field);
     insert into public.event_field_controls(event_id,edition_id,entity_type,field_name,is_locked,manual_value,lock_reason,source_priority,confirmed_by)
       values(p_event_id,case when scope='edition' then p_edition_id end,scope,key,true,value,reason,1,actor)
       on conflict do nothing;
     update public.event_field_controls c set manual_value=value,is_locked=true,lock_reason=reason,lock_expires_at=null,
       source_priority=1,confirmed_by=actor,confirmed_at=now(),updated_at=now()
       where c.event_id=p_event_id and c.edition_id is not distinct from (case when scope='edition' then p_edition_id end) and c.field_name=key;
     insert into public.event_audit_log(entity_type,entity_id,field_name,old_value,new_value,change_source,changed_by,changed_by_process,reason)
       values(scope,case when scope='event' then p_event_id::text else p_edition_id::text end,'__manual_change_approval__',prior->key,
         jsonb_build_object('field',field,'value',value,'request_id',p_request->'request_id','approved_at',now(),'source_verified',false),
         'manual_admin',actor,'manual_event_maintenance',reason);
   end loop;
 end loop;
 if dp ? 'race_formats' and d.legacy_distance is distinct from (select string_agg(v->>'label',' / ' order by position)
   from jsonb_array_elements(dp->'race_formats') with ordinality formats(v,position)) then
   raise exception 'Die Wettbewerbsanzeige wurde nicht gespeichert.' using errcode='23514'; end if;

 if knowledge is not null then
   knowledge_scope:=coalesce(knowledge->>'scope','edition'); edition_binding:=case when knowledge_scope='edition' then p_edition_id end;
   select * into detail from public.event_details k where k.event_brand_id=p_event_id and k.knowledge_scope=knowledge_scope
     and k.edition_id is not distinct from edition_binding;
   current_record:=private.manual_knowledge_record(detail.id);
   select old into prior from jsonb_array_elements(coalesce(p_old_knowledge,'[]'::jsonb)) old where old->>'id'=detail.id::text;
   patch:=coalesce(knowledge->'patch','{}'::jsonb);
   for field in select jsonb_array_elements_text(coalesce(knowledge->'clear_fields','[]'::jsonb)) loop
     section:=split_part(field,'.',1); key:=split_part(field,'.',2);
     patch:=jsonb_set(patch,array[section],coalesce(patch->section,'{}'::jsonb)||jsonb_build_object(key,
       case when key in('price_tiers','intermediate_cutoffs') then '[]'::jsonb else 'null'::jsonb end),true);
   end loop;
   for section,item in select entry.key,entry.value from jsonb_each(patch) entry loop
     for key,expected in select entry.key,entry.value from jsonb_each(item) entry loop
       value:=current_record->section->key;
       if value is distinct from expected then raise exception 'Das Zusatzfeld wurde nicht gespeichert: %.%.',section,key using errcode='23514'; end if;
       if value is not distinct from prior->section->key then continue; end if;
       fields:=array_append(fields,'knowledge.'||section||'.'||key);
       insert into public.event_field_controls(event_id,edition_id,entity_type,field_name,is_locked,manual_value,lock_reason,source_priority,confirmed_by)
         values(p_event_id,edition_binding,case when edition_binding is null then 'event' else 'edition' end,
           'knowledge.'||section||'.'||key,true,value,reason,1,actor) on conflict do nothing;
       update public.event_field_controls c set manual_value=value,is_locked=true,lock_reason=reason,lock_expires_at=null,
         source_priority=1,confirmed_by=actor,confirmed_at=now(),updated_at=now()
         where c.event_id=p_event_id and c.edition_id is not distinct from edition_binding and c.field_name='knowledge.'||section||'.'||key;
       insert into public.event_audit_log(entity_type,entity_id,field_name,old_value,new_value,change_source,changed_by,changed_by_process,reason)
         values(case when edition_binding is null then 'event' else 'edition' end,coalesce(edition_binding::text,p_event_id::text),'__manual_knowledge_approval__',prior->section->key,
           jsonb_build_object('detail_id',detail.id,'field',section||'.'||key,'value',value,'approved_at',now(),'source_verified',false),
           'manual_admin',actor,'manual_event_maintenance',reason);
     end loop;
   end loop;
   for item in select jsonb_array_elements(coalesce(knowledge->'faq_upserts','[]'::jsonb)) union all
     select jsonb_build_object('id',removed.value) from jsonb_array_elements_text(coalesce(knowledge->'faq_remove','[]'::jsonb)) removed loop
     field:='faq.'||(item->>'id');
     select jsonb_build_object('question',q->'question','answer',q->'answer','sort_order',q->'sort_order') into value
       from jsonb_array_elements(current_record->'faq') q where q->>'id'=item->>'id';
     select jsonb_build_object('question',q->'question','answer',q->'answer','sort_order',q->'sort_order') into expected
       from jsonb_array_elements(coalesce(prior->'faq','[]'::jsonb)) q where q->>'id'=item->>'id';
     if (item ? 'question' and value is distinct from jsonb_build_object('question',item->'question','answer',item->'answer',
         'sort_order',coalesce((item->>'sort_order')::integer,100)))
       or (not item ? 'question' and value is not null) then raise exception 'Die FAQ wurde nicht gespeichert.' using errcode='23514'; end if;
     if value is not distinct from expected then continue; end if;
     fields:=array_append(fields,'knowledge.'||field);
     insert into public.event_field_controls(event_id,edition_id,entity_type,field_name,is_locked,manual_value,lock_reason,source_priority,confirmed_by)
       values(p_event_id,edition_binding,case when edition_binding is null then 'event' else 'edition' end,
         'knowledge.'||field,true,coalesce(value,'null'::jsonb),reason,1,actor) on conflict do nothing;
     update public.event_field_controls c set manual_value=coalesce(value,'null'::jsonb),is_locked=true,lock_reason=reason,lock_expires_at=null,
       source_priority=1,confirmed_by=actor,confirmed_at=now(),updated_at=now()
       where c.event_id=p_event_id and c.edition_id is not distinct from edition_binding and c.field_name='knowledge.'||field;
     insert into public.event_audit_log(entity_type,entity_id,field_name,old_value,new_value,change_source,changed_by,changed_by_process,reason)
       values(case when edition_binding is null then 'event' else 'edition' end,coalesce(edition_binding::text,p_event_id::text),'__manual_knowledge_approval__',expected,
         jsonb_build_object('detail_id',detail.id,'field',field,'value',coalesce(value,'null'::jsonb),'approved_at',now(),'source_verified',false),
         'manual_admin',actor,'manual_event_maintenance',reason);
   end loop;
 end if;
 if cardinality(fields)=0 and p_request->>'action'<>'create' then
   raise exception 'Es wurden keine geänderten Werte gespeichert. Bitte neu laden.' using errcode='22023'; end if;

 if d.publication_status='draft' and coalesce((p_request->>'publish')::boolean,false) then
   -- Genuine conflicts remain explicit errors and roll back the whole request.
   if exists(select 1 from public.event_field_controls c where c.event_id=p_event_id and (c.edition_id is null or c.edition_id=p_edition_id)
     and c.is_locked and (c.lock_expires_at is null or c.lock_expires_at>now()) and c.field_name in('new_edition','publication_status','discovery_status')) then
     raise exception 'Für diese Edition besteht eine Veröffentlichungssperre.' using errcode='23514'; end if;
   if exists(select 1 from public.edition_succession_candidates c where c.id=d.generated_from_candidate_id
     and (c.candidate_status='conflict' or c.validation_status='conflict'))
     or exists(select 1 from public.edition_succession_candidates c where c.event_id=p_event_id and c.candidate_year=d.edition_year
       and c.id is distinct from d.generated_from_candidate_id and c.candidate_status in('conflict','detected','draft_created') and c.candidate_start_date=d.start_date) then
     raise exception 'Ein bestehender Editionskonflikt muss zuerst geklärt werden.' using errcode='23514'; end if;
   if e.status<>'approved' or e.publication_status<>'published' then problem:='Die Veranstaltung ist noch nicht öffentlich freigegeben.';
   elsif d.start_date is null or d.start_date<=current_date or d.start_date>current_date+interval '5 years'
     or d.edition_status not in('scheduled','postponed') or d.race_formats='[]'::jsonb then
     problem:='Für die öffentliche Anzeige fehlen zukünftiger Termin, Austragungsstatus oder Wettbewerbe.';
   elsif exists(select 1 from public.validation_issues i where i.event_id=p_event_id and (i.edition_id is null or i.edition_id=p_edition_id)
     and i.status='open' and i.severity in('critical','error')) then problem:='Für diese Edition bestehen kritische Datenprobleme. Die Änderungen sind als Entwurf gespeichert.';
   end if;
   if problem is null then
     update public.event_editions set publication_status='published',discovery_status='active',published_at=now() where id=p_edition_id and publication_status='draft';
     if not found then raise exception 'Die Edition wurde zwischenzeitlich verändert.' using errcode='PT409'; end if;
     if d.generated_from_candidate_id is not null then
       update public.edition_succession_candidates set candidate_status='approved',reviewed_at=now(),reviewed_by=actor,review_notes=reason where id=d.generated_from_candidate_id;
       update public.source_review_tasks set status='resolved',reviewed_at=now(),reviewed_by=actor,review_notes=reason
         where event_id=p_event_id and fingerprint='succession:'||d.generated_from_candidate_id::text and task_type='new_edition_candidate' and status='open';
     end if;
   end if;
 end if;
 update public.event_details k set is_public=true where k.event_brand_id=p_event_id and k.knowledge_scope='edition' and k.edition_id=p_edition_id
   and exists(select 1 from public.public_event_archive a where a.edition_id=p_edition_id)
   and exists(select 1 from public.event_audit_log a where a.field_name='__manual_knowledge_approval__' and a.new_value->>'detail_id'=k.id::text);
 select jsonb_build_object('status',case when x.publication_status='published' then 'database_public' else 'draft' end,
   'public_view_available',exists(select 1 from public.public_event_archive a where a.edition_id=p_edition_id),
   'search_available',exists(select 1 from public.public_event_discovery a where a.edition_id=p_edition_id),
   'static_refresh_required',true,'error',problem) into publication from public.event_editions x where x.id=p_edition_id;
 return jsonb_build_object('changed_fields',to_jsonb(fields),'manual_approval',jsonb_build_object('approved',true,'source_verified',false),'publication',publication);
end;
$approve$;
revoke all on function private.approve_manual_event_save(bigint,uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;

-- Apply narrow replacements to the installed function, preserving specialist
-- verification, transaction/version/retry logic and every unrelated integration.
create function pg_temp.sem_manual_patch(original text,needle text,replacement text,label text)
returns text language plpgsql as $$ begin
 if (length(original)-length(replace(original,needle,'')))<>length(needle) then
   raise exception 'Manual save definition changed (%); inspect migration before applying',label; end if;
 return replace(original,needle,replacement);
end $$;

do $patch$
declare definition text;
begin
 if current_user<>'postgres' then raise exception 'Apply manual save migration as postgres'; end if;
 if not exists(select 1 from pg_proc where oid='private.save_manual_event_maintenance(jsonb)'::regprocedure
   and prosecdef and proowner='postgres'::regrole) then raise exception 'Manual save authorization boundary changed'; end if;
 definition:=replace(pg_get_functiondef('private.save_manual_event_maintenance(jsonb)'::regprocedure),chr(13),'');
 definition:=pg_temp.sem_manual_patch(definition,$old$  publication jsonb; stored_values jsonb; evidence jsonb; affected integer;$old$,
 $new$  publication jsonb; stored_values jsonb; evidence jsonb; affected integer;
  manual_mode boolean:=coalesce(p_request->'manual_approval'='true'::jsonb,false);
  before_event jsonb; before_edition jsonb; before_knowledge jsonb; manual_result jsonb;$new$,'declarations');
 definition:=pg_temp.sem_manual_patch(definition,$old$  request_id:=(p_request->>'request_id')::uuid; event_id:=(p_request->>'event_id')::bigint;$old$,
 $new$  if manual_mode then
    if action not in('correct','create') then raise exception 'Die manuelle Freigabe gehört zu Änderungen oder einer ausdrücklich neuen Edition.' using errcode='22023'; end if;
    notes:=coalesce(notes,'Änderungen manuell bestätigt.');
    if length(notes)<3 then notes:='Manuelle Freigabe: '||notes; end if;
    source_url:=null; -- URLs in patches are data, not a claimed source check.
    source_result:='confirmed';
  end if;
  request_id:=(p_request->>'request_id')::uuid; event_id:=(p_request->>'event_id')::bigint;$new$,'manual approval input');
 definition:=pg_temp.sem_manual_patch(definition,$old$    return receipt.result || jsonb_build_object('replayed',true,'context',public.admin_manual_event_context(event_id));$old$,
 $new$    if manual_mode then
      select receipt.result||jsonb_build_object('replayed',true,'context',public.admin_manual_event_context(event_id),
        'publication',(receipt.result->'publication')||jsonb_build_object('status',case when live.publication_status='published' then 'database_public' else 'draft' end,
          'public_view_available',exists(select 1 from public.public_event_archive a where a.edition_id=live.id),
          'search_available',exists(select 1 from public.public_event_discovery a where a.edition_id=live.id),
          'error',case when live.publication_status='published' then null else receipt.result->'publication'->>'error' end))
        into result from public.event_editions live where live.event_id=event_id and live.id=(receipt.result->>'edition_id')::uuid;
      if result is null then raise exception 'Die zuvor gespeicherte Edition ist nicht mehr vorhanden.' using errcode='P0002'; end if;
      return result;
    end if;
    return receipt.result || jsonb_build_object('replayed',true,'context',public.admin_manual_event_context(event_id));$new$,'replay publication readback');
 definition:=pg_temp.sem_manual_patch(definition,$old$  select coalesce(array_agg(distinct v),'{}') into clears from jsonb_array_elements_text(coalesce(p_request->'clear_fields','[]'::jsonb)) v;$old$,
 $new$  select coalesce(array_agg(distinct v),'{}') into clears from jsonb_array_elements_text(coalesce(p_request->'clear_fields','[]'::jsonb)) v;
  if manual_mode and (cardinality(confirms)>0 or coalesce(p_request->'knowledge'->'confirmations','[]'::jsonb)<>'[]'::jsonb) then
    raise exception 'Manuelle Änderungsfreigabe und externe Quellenprüfung getrennt speichern.' using errcode='22023'; end if;$new$,'separate source proof');
 definition:=pg_temp.sem_manual_patch(definition,$old$and cardinality(confirms)=0 and source_url is null then$old$,
 $new$and cardinality(confirms)=0 and source_url is null and not(manual_mode and p_request ? 'knowledge') then$new$,'knowledge-only changes');
 definition:=pg_temp.sem_manual_patch(definition,$old$  if action='create' and ep<>'{}'::jsonb then raise exception 'Eine neue Ausgabe darf die Stammdaten der bisherigen Ausgabe nicht ändern.' using errcode='22023'; end if;$old$,
 $new$  if action='create' and not manual_mode and ep<>'{}'::jsonb then raise exception 'Eine neue Ausgabe darf die Stammdaten der bisherigen Ausgabe nicht ändern.' using errcode='22023'; end if;$new$,'manual shared brand changes on explicit create');
 definition:=pg_temp.sem_manual_patch(definition,$old$  if action='create' and ep<>'{}'::jsonb then raise exception 'Eine neue Ausgabe darf keine bisherigen Stammdaten löschen.' using errcode='22023'; end if;$old$,
 $new$  if action='create' and not manual_mode and ep<>'{}'::jsonb then raise exception 'Eine neue Ausgabe darf keine bisherigen Stammdaten löschen.' using errcode='22023'; end if;$new$,'manual shared brand clears on explicit create');
 definition:=pg_temp.sem_manual_patch(definition,$old$  perform set_config('app.change_source','manual_admin',true);$old$,
 $new$  before_event:=to_jsonb(e); before_edition:=to_jsonb(d); before_knowledge:=context->'knowledge';
  perform set_config('app.change_source','manual_admin',true);$new$,'before-state');
 definition:=pg_temp.sem_manual_patch(definition,$old$and extract(year from (dp->>'start_date')::date)::integer<>d.edition_year then$old$,
 $new$and extract(year from (dp->>'start_date')::date)::integer<>d.edition_year and not(manual_mode and action='correct') then$new$,'same identity postponement');
 definition:=pg_temp.sem_manual_patch(definition,$old$  if complete_review then$old$,$new$  if not manual_mode then
  if complete_review then$new$,'specialist verification only');
 definition:=pg_temp.sem_manual_patch(definition,$old$'Vor der Freigabe alle 14 Kernangaben ausdrücklich prüfen.','static_refresh_required',true);
  end if;$old$,$new$'Vor der Freigabe alle 14 Kernangaben ausdrücklich prüfen.','static_refresh_required',true);
  end if;
  end if;$new$,'specialist verification end');
 definition:=pg_temp.sem_manual_patch(definition,$old$  if p_request ? 'knowledge' then perform private.apply_manual_event_knowledge(event_id,edition_id,p_request); end if;$old$,
 $new$  if p_request ? 'knowledge' then perform private.apply_manual_event_knowledge(event_id,edition_id,p_request||jsonb_build_object('notes',notes)); end if;
  if manual_mode then
    manual_result:=private.approve_manual_event_save(event_id,edition_id,p_request,before_event,before_edition,before_knowledge);
    publication:=manual_result->'publication'; freshness:=jsonb_build_object('verified',false,'source_verification_performed',false);
  end if;$new$,'approval after readback');
 definition:=pg_temp.sem_manual_patch(definition,$old$  insert into private.manual_event_maintenance_receipts(request_id,actor_id,request,result) values(request_id,actor,p_request,result-'context');$old$,
 $new$  if manual_mode then result:=result||manual_result; end if;
  insert into private.manual_event_maintenance_receipts(request_id,actor_id,request,result) values(request_id,actor,p_request,result-'context');$new$,'receipt');
 execute definition;
 definition:=replace(pg_get_functiondef('private.manual_knowledge_record(uuid)'::regprocedure),chr(13),'');
 definition:=pg_temp.sem_manual_patch(definition,$old$'cleared_fields',to_jsonb(cleared));$old$,
 $new$'cleared_fields',to_jsonb(cleared),'manual_approved_fields',private.manual_knowledge_approved_fields(p_detail_id,result));$new$,'public approved field names');
 execute definition;
end $patch$;
drop function pg_temp.sem_manual_patch(text,text,text,text);
commit;
