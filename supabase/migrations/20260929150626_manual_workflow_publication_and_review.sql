-- Finish the existing manual workflow: public field contract and explicit
-- scoped review decisions. No existing event/candidate is changed by migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Keep all existing columns, row-selection rules, grants and invoker security.
do $views$
declare relation_name text; definition text;
begin
  foreach relation_name in array array['public_event_discovery','public_event_archive'] loop
    if exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=relation_name and column_name in ('end_date','start_time','price_min','price_max','currency','participant_limit')) then
      raise exception 'Public optional-field contract already changed for %',relation_name;
    end if;
    definition:=rtrim(pg_get_viewdef(('public.'||relation_name)::regclass,true),E';\n ');
    execute format('create or replace view public.%I with (security_invoker=true) as
      select live_catalog.*, edition.end_date, edition.start_time, edition.price_min,
        edition.price_max, edition.currency, edition.participant_limit
      from (%s) live_catalog
      join public.event_editions edition on edition.id=live_catalog.edition_id',relation_name,definition);
  end loop;
end $views$;

create or replace function public.admin_manual_event_context(p_event_id bigint)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public,private
as $context$
declare payload jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Nur Administratoren dürfen Events pflegen.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'event',to_jsonb(e),
    'editions',coalesce((select jsonb_agg(to_jsonb(d) order by d.edition_year desc,d.start_date,d.id) from public.event_editions d where d.event_id=e.id),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.event_sources s where s.event_id=e.id),'[]'::jsonb),
    'candidates',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.edition_succession_candidates c where c.event_id=e.id and c.candidate_status in ('detected','draft_created','conflict')),'[]'::jsonb),
    'controls',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.event_field_controls c where c.event_id=e.id),'[]'::jsonb),
    'proposals',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.event_change_proposals p where p.event_id=e.id and p.proposal_status='pending'),'[]'::jsonb),
    'review_tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('review_edition_id',coalesce(t.edition_id,c.draft_edition_id,s.edition_id)) order by t.id)
      from public.source_review_tasks t join public.event_sources s on s.id=t.source_id
      left join public.edition_succession_candidates c on t.fingerprint='succession:'||c.id::text
      where t.event_id=e.id and t.status='open'),'[]'::jsonb),
    'validation_issues',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.validation_issues i where i.event_id=e.id and i.status='open'),'[]'::jsonb),
    'data_alerts',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.data_workflow_alerts a where a.event_id=e.id and a.alert_status='open'),'[]'::jsonb),
    'feedback',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.user_feedback f where private.try_parse_bigint(f.event_id)=e.id and f.category='incorrect_event_data' and f.status in ('reviewed','planned')),'[]'::jsonb),
    'candidate_resolutions',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id) from (
      select distinct on(log.new_value->>'candidate_id') log.* from public.event_audit_log log
      where log.entity_type='edition' and log.entity_id in(select id::text from public.event_editions where event_id=e.id)
        and log.field_name='__manual_candidate_resolution__'
      order by log.new_value->>'candidate_id',log.created_at desc,log.id desc) a),'[]'::jsonb),
    'verifications',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id) from (
      select distinct on(log.entity_id,log.field_name,coalesce(log.new_value->>'field',log.new_value->>'source_id')) log.*
      from public.event_audit_log log where log.entity_type='edition'
        and log.entity_id in(select id::text from public.event_editions where event_id=e.id)
        and log.field_name in('__manual_field_verification__','__manual_source_review__')
      order by log.entity_id,log.field_name,coalesce(log.new_value->>'field',log.new_value->>'source_id'),log.created_at desc,log.id desc) a),'[]'::jsonb)
  ) into payload from public.events e where e.id=p_event_id;
  if payload is null then raise exception 'Veranstaltung nicht gefunden.' using errcode='P0002'; end if;
  return payload||jsonb_build_object('version',md5(payload::text));
end $context$;
revoke all on function public.admin_manual_event_context(bigint) from public,anon;
grant execute on function public.admin_manual_event_context(bigint) to authenticated;

-- Only observed facts and source bindings identify the adjudicated observation;
-- later technical crawl IDs/timestamps alone do not invent a new contradiction.
create function private.manual_candidate_observation(p_candidate public.edition_succession_candidates)
returns jsonb language sql immutable security invoker set search_path=pg_catalog,public
as $observation$
 select jsonb_build_object('id',p_candidate.id,'event_id',p_candidate.event_id,
   'source_id',p_candidate.source_id,'source_url',p_candidate.source_url,
   'draft_edition_id',p_candidate.draft_edition_id,'predecessor_edition_id',p_candidate.predecessor_edition_id,
   'candidate_year',p_candidate.candidate_year,'candidate_start_date',p_candidate.candidate_start_date,
   'candidate_end_date',p_candidate.candidate_end_date,'candidate_name',p_candidate.candidate_name,
   'registration_url',p_candidate.registration_url,'fingerprint',p_candidate.fingerprint,'evidence',p_candidate.evidence);
$observation$;
revoke all on function private.manual_candidate_observation(public.edition_succession_candidates) from public,anon,authenticated;

create function private.manual_candidate_resolution_current(p_candidate public.edition_succession_candidates)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private
as $current$
 select exists(
   select 1 from public.event_audit_log a
   join public.event_editions d on d.id=p_candidate.draft_edition_id and d.event_id=p_candidate.event_id
   join public.event_sources s on s.id::text=a.new_value->>'source_id'
   join public.event_sources observed_source on observed_source.id=p_candidate.source_id
   where a.entity_type='edition' and a.entity_id=d.id::text
     and a.field_name='__manual_candidate_resolution__' and a.change_source='manual_admin'
     and a.changed_by_process='manual_event_maintenance' and a.changed_by is not null
     and a.new_value->>'candidate_id'=p_candidate.id::text
     and a.new_value->'observation'=private.manual_candidate_observation(p_candidate)
     and a.new_value->'confirmed_start_date'=to_jsonb(d.start_date)
     and a.new_value->'confirmed_end_date'=coalesce(to_jsonb(d.end_date),'null'::jsonb)
     and d.generated_from_candidate_id=p_candidate.id and d.edition_year=p_candidate.candidate_year
     and s.event_id=d.event_id and s.edition_id=d.id and s.is_active and s.source_type='official_event_website'
     and s.source_url=a.new_value->>'source_url' and d.source_url=s.source_url
     and observed_source.event_id=d.event_id and observed_source.is_active
     and observed_source.source_type='official_event_website' and observed_source.source_url=p_candidate.source_url
     and p_candidate.source_url=s.source_url
     and not exists(select 1 from public.event_audit_log later where later.entity_type='edition'
       and later.entity_id=d.id::text and later.field_name='__manual_candidate_resolution__'
       and later.new_value->>'candidate_id'=p_candidate.id::text and (later.created_at,later.id)>(a.created_at,a.id))
 );
$current$;
revoke all on function private.manual_candidate_resolution_current(public.edition_succession_candidates) from public,anon,authenticated;

create function private.preserve_manual_candidate_resolution()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $preserve$
begin
  if old.candidate_status not in('approved','rejected','superseded')
    and private.manual_candidate_observation(new) is distinct from private.manual_candidate_observation(old)
    and exists(select 1 from public.event_audit_log a where a.entity_type='edition'
      and a.entity_id=old.draft_edition_id::text and a.field_name='__manual_candidate_resolution__'
      and a.new_value->>'candidate_id'=old.id::text)
    and not private.manual_candidate_resolution_current(new) then
    new.candidate_status:='conflict';
    new.validation_status:='conflict';
    new.validation_reasons:=array(select distinct reason from unnest(new.validation_reasons||array['edition_year_date_conflict']) reason order by reason);
  end if;
  if new.candidate_status='conflict' and new.validation_status='conflict'
    and new.validation_reasons=array['edition_year_date_conflict']::text[]
    and private.manual_candidate_resolution_current(new) then
    new.candidate_status:='draft_created';
    new.validation_status:='validated';
    new.validation_reasons:='{}'::text[];
  end if;
  return new;
end $preserve$;
revoke all on function private.preserve_manual_candidate_resolution() from public,anon,authenticated;
create trigger edition_succession_manual_resolution
before update on public.edition_succession_candidates
for each row execute function private.preserve_manual_candidate_resolution();

create function private.invalidate_manual_candidate_resolution_from_edition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $invalidate$
begin
 if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
    or new.source_url is distinct from old.source_url or new.generated_from_candidate_id is distinct from old.generated_from_candidate_id then
   update public.edition_succession_candidates c set candidate_status='conflict',validation_status='conflict',
     validation_reasons=array(select distinct reason from unnest(c.validation_reasons||array['edition_year_date_conflict']) reason order by reason)
   where c.draft_edition_id=new.id and c.candidate_status not in('approved','rejected','superseded')
     and exists(select 1 from public.event_audit_log a where a.entity_type='edition' and a.entity_id=new.id::text
       and a.field_name='__manual_candidate_resolution__' and a.new_value->>'candidate_id'=c.id::text)
     and not private.manual_candidate_resolution_current(c);
 end if;
 return null;
end $invalidate$;
revoke all on function private.invalidate_manual_candidate_resolution_from_edition() from public,anon,authenticated;
create trigger event_editions_manual_candidate_resolution
after update of start_date,end_date,source_url,generated_from_candidate_id on public.event_editions
for each row execute function private.invalidate_manual_candidate_resolution_from_edition();

create function private.invalidate_manual_candidate_resolution_from_source()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $source_binding$
begin
 if (new.event_id,new.edition_id,new.source_url,new.source_type,new.is_active)
    is distinct from (old.event_id,old.edition_id,old.source_url,old.source_type,old.is_active) then
   update public.edition_succession_candidates c set candidate_status='conflict',validation_status='conflict',
     validation_reasons=array(select distinct reason from unnest(c.validation_reasons||array['edition_year_date_conflict']) reason order by reason)
   where c.candidate_status not in('approved','rejected','superseded')
     and exists(select 1 from public.event_audit_log a where a.entity_type='edition' and a.entity_id=c.draft_edition_id::text
       and a.field_name='__manual_candidate_resolution__' and a.new_value->>'candidate_id'=c.id::text
       and (a.new_value->>'source_id'=new.id::text or c.source_id=new.id))
     and not private.manual_candidate_resolution_current(c);
 end if;
 return null;
end $source_binding$;
revoke all on function private.invalidate_manual_candidate_resolution_from_source() from public,anon,authenticated;
create trigger event_sources_manual_candidate_resolution
after update of event_id,edition_id,source_url,source_type,is_active on public.event_sources
for each row execute function private.invalidate_manual_candidate_resolution_from_source();

create function private.review_manual_event_maintenance(p_request jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private set lock_timeout='5s'
as $review$
#variable_conflict use_variable
declare
 actor uuid:=auth.uid(); request_id uuid; event_id bigint; edition_id uuid;
 review jsonb:=p_request->'review'; kind text:=p_request->'review'->>'kind';
 notes text:=nullif(btrim(p_request->>'notes'),''); source_url text:=nullif(btrim(p_request->>'source_url'),'');
 item_id uuid; alert_id bigint; context jsonb; result jsonb; review_result jsonb; prior jsonb; affected integer;
 receipt private.manual_event_maintenance_receipts; d public.event_editions;
 candidate public.edition_succession_candidates; proposal public.event_change_proposals;
 task public.source_review_tasks; source public.event_sources; scope_edition uuid; field text;
 prior_change_source text:=current_setting('app.change_source',true);
 prior_change_reason text:=current_setting('app.change_reason',true);
 prior_source_url text:=current_setting('app.source_url',true);
begin
 if actor is null or not private.is_admin() then raise exception 'Nur Administratoren dürfen Events pflegen.' using errcode='42501'; end if;
 if jsonb_typeof(p_request) is distinct from 'object' or p_request->>'action' is distinct from 'review'
   or jsonb_typeof(review) is distinct from 'object' then raise exception 'Ungültige Reviewentscheidung.' using errcode='22023'; end if;
 request_id:=(p_request->>'request_id')::uuid; event_id:=(p_request->>'event_id')::bigint;
 edition_id:=(p_request->>'edition_id')::uuid;
 if kind='data_alert' then alert_id:=(review->>'id')::bigint; else item_id:=(review->>'id')::uuid; end if;
 if request_id is null or event_id is null or edition_id is null or (item_id is null and alert_id is null)
   or kind is null or kind not in('proposal','source_task','candidate_range','candidate_dates','validation_issue','data_alert','feedback')
   or notes is null or length(notes)<3 or length(notes)>1000 then raise exception 'Ausgabe, Entscheidung und Prüfnotiz fehlen.' using errcode='22023'; end if;
 if coalesce(p_request->'event_patch','{}'::jsonb)<>'{}'::jsonb
   or coalesce(p_request->'edition_patch','{}'::jsonb)<>'{}'::jsonb
   or coalesce(p_request->'confirmations','[]'::jsonb)<>'[]'::jsonb
   or coalesce(p_request->'clear_fields','[]'::jsonb)<>'[]'::jsonb
   or coalesce((p_request->>'publish')::boolean,false) then
   raise exception 'Reviewentscheidungen getrennt von Faktenänderungen, Prüfungen und Freigabe speichern.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_object_keys(review) k where k not in('kind','id','decision','edited_value','confirmed_start_date','confirmed_end_date')) then
   raise exception 'Nicht erlaubtes Reviewfeld.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into receipt from private.manual_event_maintenance_receipts r where r.request_id=request_id;
 if found then
   if receipt.actor_id<>actor or receipt.request<>p_request then raise exception 'Diese Anfragekennung gehört zu einem anderen Auftrag.' using errcode='22023'; end if;
   return receipt.result||jsonb_build_object('replayed',true,'context',public.admin_manual_event_context(event_id));
 end if;
 perform 1 from public.event_sources x where x.event_id=event_id order by x.id for update;
 perform 1 from public.events x where x.id=event_id for update;
 if not found then raise exception 'Veranstaltung nicht gefunden.' using errcode='P0002'; end if;
 perform 1 from public.event_editions x where x.event_id=event_id order by x.id for update;
 perform 1 from public.edition_succession_candidates x where x.event_id=event_id order by x.id for update;
 perform 1 from public.event_change_proposals x where x.event_id=event_id order by x.id for update;
 perform 1 from public.source_review_tasks x where x.event_id=event_id order by x.id for update;
 perform 1 from public.validation_issues x where x.event_id=event_id order by x.id for update;
 perform 1 from public.data_workflow_alerts x where x.event_id=event_id order by x.id for update;
 perform 1 from public.user_feedback x where private.try_parse_bigint(x.event_id)=event_id order by x.id for update;
 context:=public.admin_manual_event_context(event_id);
 if nullif(p_request->>'expected_version','') is null or p_request->>'expected_version'<>context->>'version' then
   raise exception 'Die Daten wurden inzwischen geändert. Neu laden und die Änderungen erneut prüfen; Ihre Eingaben bleiben erhalten.' using errcode='PT409'; end if;
 select * into d from public.event_editions x where x.id=edition_id and x.event_id=event_id;
 if not found then raise exception 'Diese Ausgabe gehört nicht zur gewählten Veranstaltung.' using errcode='22023'; end if;
 if kind='proposal' then
   select * into proposal from public.event_change_proposals x where x.id=item_id and x.event_id=event_id
     and (x.edition_id is null or x.edition_id=edition_id) and x.proposal_status='pending';
   if not found then raise exception 'Dieser offene Vorschlag gehört nicht zu dieser Ausgabe.' using errcode='22023'; end if;
   prior:=to_jsonb(proposal);
   begin
     review_result:=to_jsonb(public.review_event_change_proposal(item_id,review->>'decision',notes,review->'edited_value',
       case when review->>'decision'='rejected' then notes else null end));
   exception when serialization_failure then
     raise exception 'Der Vorschlag wurde inzwischen geändert. Neu laden und erneut prüfen.' using errcode='PT409';
   end;
   if review_result->>'proposal_status' in('accepted','edited_and_accepted') and proposal.entity_type='edition'
      and (proposal.field_name='race_formats' or (proposal.field_name is null and coalesce(review_result->'applied_value','{}'::jsonb) ? 'race_formats')) then
     -- Match the fact editor's compatibility projection; accepting competitions
     -- must not leave the old list/map distance text ahead of the new formats.
     perform set_config('app.change_source','manual_admin',true);
     perform set_config('app.change_reason',notes,true);
     perform set_config('app.source_url',coalesce(proposal.source_url,''),true);
     update public.event_editions target set legacy_distance=(
       select string_agg(coalesce(nullif(v->>'label',''),nullif(v->>'original',''),nullif(v->>'name',''),
         case when v ? 'value' and v ? 'unit' then (v->>'value')||' '||(v->>'unit')
           when v ? 'distance_km' then (v->>'distance_km')||' km' end),' / ' order by position)
       from jsonb_array_elements(target.race_formats) with ordinality formats(v,position))
       where target.id=proposal.edition_id and target.event_id=event_id;
     get diagnostics affected=row_count;
     if affected<>1 then raise exception 'Die Wettbewerbsanzeige konnte nicht aktualisiert werden.' using errcode='23514'; end if;
     perform set_config('app.change_source',coalesce(prior_change_source,''),true);
     perform set_config('app.change_reason',coalesce(prior_change_reason,''),true);
     perform set_config('app.source_url',coalesce(prior_source_url,''),true);
   end if;
 elsif kind='source_task' then
   select t.* into task from public.source_review_tasks t where t.id=item_id and t.event_id=event_id and t.status='open';
   select coalesce(t.edition_id,c.draft_edition_id,s.edition_id) into scope_edition
   from public.source_review_tasks t join public.event_sources s on s.id=t.source_id
   left join public.edition_succession_candidates c on t.fingerprint='succession:'||c.id::text
   where t.id=item_id and t.event_id=event_id and t.status='open';
   if task.id is null or (scope_edition is not null and scope_edition<>edition_id) then
     raise exception 'Diese offene Quellenaufgabe gehört nicht zu dieser Ausgabe.' using errcode='22023'; end if;
   if task.task_type='new_edition_candidate' and exists(select 1 from public.edition_succession_candidates c
      where task.fingerprint='succession:'||c.id::text and (c.candidate_status='conflict' or c.validation_status='conflict')) then
     raise exception 'Zuerst den Editionskonflikt ausdrücklich auflösen. Die Quellenaufgabe ersetzt keine Konfliktentscheidung.' using errcode='23514'; end if;
   prior:=to_jsonb(task);
   review_result:=to_jsonb(public.resolve_source_review_task(item_id,review->>'decision',notes));
 elsif kind='feedback' then
   if review->>'decision' is null or review->>'decision' not in('resolved','rejected') or length(notes)<20 then
     raise exception 'Die Rückmeldung benötigt eine begründete Entscheidung (mindestens 20 Zeichen).' using errcode='22023'; end if;
   select to_jsonb(f) into prior from public.user_feedback f where f.id=item_id
     and private.try_parse_bigint(f.event_id)=event_id and f.category='incorrect_event_data' and f.status in('reviewed','planned');
   if prior is null then raise exception 'Diese offene Datenrückmeldung gehört nicht zu dieser Veranstaltung.' using errcode='22023'; end if;
   update public.user_feedback f set status=review->>'decision',updated_at=now(),
     internal_notes=concat_ws(E'\n',nullif(f.internal_notes,''),notes)
     where f.id=item_id and f.status in('reviewed','planned') returning to_jsonb(f) into review_result;
   get diagnostics affected=row_count;
   if affected<>1 then raise exception 'Die Rückmeldung wurde inzwischen verändert. Neu laden und erneut prüfen.' using errcode='PT409'; end if;
 elsif kind in('validation_issue','data_alert') then
   if review->>'decision' is distinct from 'resolved' or length(notes)<20 then
     raise exception 'Eine manuelle Klärung benötigt eine ausdrückliche Entscheidung und eine Begründung (mindestens 20 Zeichen).' using errcode='22023'; end if;
   if kind='validation_issue' then
     select to_jsonb(i) into prior from public.validation_issues i where i.id=item_id and i.event_id=event_id
       and (i.edition_id is null or i.edition_id=edition_id) and i.status='open';
     if prior is null then raise exception 'Dieser offene Datenhinweis gehört nicht zu dieser Ausgabe.' using errcode='22023'; end if;
     update public.validation_issues i set status='resolved',resolved_at=now(),resolved_by=actor
       where i.id=item_id and i.status='open' returning to_jsonb(i) into review_result;
   else
     select to_jsonb(a) into prior from public.data_workflow_alerts a where a.id=alert_id and a.event_id=event_id
       and (a.edition_id is null or a.edition_id=edition_id) and a.alert_status='open';
     if prior is null then raise exception 'Dieser offene Alarm gehört nicht zu dieser Ausgabe.' using errcode='22023'; end if;
     update public.data_workflow_alerts a set alert_status='resolved',resolved_at=now(),resolved_by=actor
       where a.id=alert_id and a.alert_status='open' returning to_jsonb(a) into review_result;
   end if;
   get diagnostics affected=row_count;
   if affected<>1 then raise exception 'Der Hinweis wurde inzwischen verändert. Neu laden und erneut prüfen.' using errcode='PT409'; end if;
 else
   if length(notes)<20 or coalesce(p_request->>'source_result','confirmed')<>'confirmed' then
     raise exception 'Die Konfliktauflösung benötigt eine bestätigte offizielle Quelle und eine begründete Prüfnotiz (mindestens 20 Zeichen).' using errcode='22023'; end if;
   select * into candidate from public.edition_succession_candidates c where c.id=item_id and c.event_id=event_id;
   if candidate.id is null or candidate.draft_edition_id is distinct from d.id or d.generated_from_candidate_id is distinct from candidate.id
      or d.publication_status<>'draft' or candidate.candidate_year<>d.edition_year then
     raise exception 'Der Kandidat gehört nicht zu diesem gebundenen Editionsentwurf.' using errcode='23514'; end if;
   if candidate.candidate_status<>'conflict' or candidate.validation_status<>'conflict'
      or candidate.validation_reasons<>array['edition_year_date_conflict']::text[] then
     raise exception 'Diese Entscheidung löst ausschließlich einen einzelnen Datumskonflikt; andere Gründe bleiben zuerst zu prüfen.' using errcode='23514'; end if;
   if d.start_date is null or d.start_date<=current_date or extract(year from d.start_date)::integer<>d.edition_year
      or (d.end_date is not null and (d.end_date<d.start_date or extract(year from d.end_date)::integer<>d.edition_year))
      or review->>'confirmed_start_date' is distinct from d.start_date::text
      or nullif(review->>'confirmed_end_date','') is distinct from d.end_date::text then
     raise exception 'Der bestätigte Termin muss genau dem gespeicherten zukünftigen Termin dieser Ausgabe entsprechen.' using errcode='23514'; end if;
   if kind='candidate_range' and (d.end_date is null or candidate.candidate_start_date not between d.start_date and d.end_date
      or (candidate.candidate_end_date is not null and candidate.candidate_end_date not between d.start_date and d.end_date)) then
     raise exception 'Das beobachtete Datum liegt nicht vollständig im bestätigten Veranstaltungszeitraum.' using errcode='23514'; end if;
   if exists(select 1 from public.event_editions other where other.event_id=event_id and other.id<>d.id
      and other.edition_year=d.edition_year and (other.edition_key=d.edition_key or other.start_date=d.start_date))
      or exists(select 1 from public.edition_succession_candidates other where other.event_id=event_id and other.id<>candidate.id
        and other.candidate_year=d.edition_year and other.candidate_status in('detected','draft_created','conflict')
        and (other.draft_edition_id=d.id or (other.candidate_start_date<=coalesce(d.end_date,d.start_date)
          and coalesce(other.candidate_end_date,other.candidate_start_date)>=d.start_date))) then
     raise exception 'Eine weitere Ausgabe oder ein konkurrierender Kandidat muss zuerst geklärt werden.' using errcode='23514'; end if;
   select * into source from public.event_sources s where s.event_id=event_id and s.edition_id=edition_id
     and s.source_url=source_url and s.source_url=d.source_url and s.is_active and s.source_type='official_event_website' order by s.id limit 1;
   if source.id is null or source.source_url !~* '^https://[^[:space:]]+$'
      or source.source_url is distinct from candidate.source_url
      or not exists(select 1 from public.event_sources os where os.id=candidate.source_id and os.event_id=event_id
        and os.is_active and os.source_type='official_event_website' and os.source_url=candidate.source_url) then
     raise exception 'Die offizielle Quelle muss zur Ausgabe und zur ursprünglichen Kandidatenbeobachtung passen.' using errcode='23514'; end if;
   foreach field in array case when d.end_date is null then array['start_date'] else array['start_date','end_date'] end loop
     if not exists(select 1 from (
       select a.* from public.event_audit_log a where a.entity_type='edition' and a.entity_id=d.id::text
         and a.field_name='__manual_field_verification__' and a.new_value->>'field'='edition.'||field
       order by a.created_at desc,a.id desc limit 1) checked
       where checked.change_source='manual_admin' and checked.changed_by is not null
         and checked.changed_by_process='manual_event_maintenance' and checked.created_at>=now()-interval '24 hours'
         and checked.new_value->>'result'='confirmed' and checked.new_value->'value'=to_jsonb(d)->field
         and checked.new_value->>'source_id'=source.id::text and checked.new_value->>'source_url'=source.source_url) then
       raise exception 'Bitte Anfangs- und gegebenenfalls Enddatum zuerst ausdrücklich anhand dieser Quelle bestätigen (höchstens 24 Stunden alt).' using errcode='23514';
     end if;
   end loop;
   prior:=to_jsonb(candidate);
   review_result:=jsonb_build_object('kind',kind,'candidate_id',candidate.id,'source_id',source.id,'source_url',source.source_url,
     'confirmed_start_date',d.start_date,'confirmed_end_date',d.end_date,'observation',private.manual_candidate_observation(candidate),
     'resolved_reason','edition_year_date_conflict','publication_unchanged',true);
   insert into public.event_audit_log(entity_type,entity_id,field_name,old_value,new_value,change_source,changed_by,changed_by_process,reason,source_url,created_at)
     values('edition',d.id::text,'__manual_candidate_resolution__',prior,review_result,'manual_admin',actor,'manual_event_maintenance',notes,source.source_url,clock_timestamp());
   update public.edition_succession_candidates c set candidate_status='draft_created',validation_status='validated',
     validation_reasons='{}'::text[],validated_at=now(),reviewed_at=now(),reviewed_by=actor,review_notes=notes where c.id=candidate.id;
 end if;
 if kind in('proposal','source_task','validation_issue','data_alert','feedback') then
   insert into public.event_audit_log(entity_type,entity_id,field_name,old_value,new_value,change_source,changed_by,changed_by_process,reason,source_url)
     values('edition',d.id::text,'__manual_review_decision__',prior,jsonb_build_object('kind',kind,'id',coalesce(item_id::text,alert_id::text),'decision',review->>'decision','result',review_result),
       'manual_admin',actor,'manual_event_maintenance',notes,coalesce(proposal.source_url,source_url));
 end if;
 select * into d from public.event_editions x where x.id=edition_id;
 result:=jsonb_build_object('request_id',request_id,'event_id',event_id,'edition_id',edition_id,'saved',true,'replayed',false,
   'review_result',review_result,'freshness',jsonb_build_object('verified',false,'reason','Review gespeichert; geprüfte Angaben bei Bedarf gesondert bestätigen.'),
   'publication',jsonb_build_object('status',case when d.publication_status='published' then 'database_public' else 'draft' end,'static_refresh_required',true),
   'context',public.admin_manual_event_context(event_id));
 insert into private.manual_event_maintenance_receipts(request_id,actor_id,request,result) values(request_id,actor,p_request,result-'context');
 return result;
end $review$;
revoke all on function private.review_manual_event_maintenance(jsonb) from public,anon,authenticated;

-- Extend the same canonical save entry point; its existing fact checks,
-- field confirmations, idempotency, version checks and publication remain intact.
do $entry$
declare original text; needle text; replacement text;
begin
 original:=replace(pg_get_functiondef('private.save_manual_event_maintenance(jsonb)'::regprocedure),chr(13),'');
 needle:=$find$if actor is null or not private.is_admin() then raise exception 'Nur Administratoren dürfen Events pflegen.' using errcode='42501'; end if;$find$;
 replacement:=needle||E'\n  if action=''review'' then return private.review_manual_event_maintenance(p_request); end if;';
 if (length(original)-length(replace(original,needle,'')))/length(needle)<>1 then raise exception 'Canonical manual save admin gate changed'; end if;
 original:=replace(original,needle,replacement);
 needle:='context:=public.admin_manual_event_context(event_id);';
 replacement:=$replace$perform 1 from public.edition_succession_candidates x where x.event_id=event_id order by x.id for update;
  perform 1 from public.event_change_proposals x where x.event_id=event_id order by x.id for update;
  perform 1 from public.source_review_tasks x where x.event_id=event_id order by x.id for update;
  perform 1 from public.validation_issues x where x.event_id=event_id order by x.id for update;
  perform 1 from public.data_workflow_alerts x where x.event_id=event_id order by x.id for update;
  perform 1 from public.user_feedback x where private.try_parse_bigint(x.event_id)=event_id order by x.id for update;
  context:=public.admin_manual_event_context(event_id);$replace$;
 if (length(original)-length(replace(original,needle,'')))/length(needle)<>1 then raise exception 'Canonical manual save version gate changed'; end if;
 original:=replace(original,needle,replacement);
 needle:=$find$if exists(select 1 from public.edition_succession_candidates c where c.id=d.generated_from_candidate_id and (c.candidate_status='conflict' or c.validation_status='conflict')) then$find$;
 replacement:=$replace$if exists(select 1 from public.edition_succession_candidates c where c.id=d.generated_from_candidate_id and (c.candidate_status='conflict' or c.validation_status='conflict'
          or (exists(select 1 from public.event_audit_log a where a.entity_type='edition' and a.entity_id=d.id::text
            and a.field_name='__manual_candidate_resolution__' and a.new_value->>'candidate_id'=c.id::text)
            and not private.manual_candidate_resolution_current(c)))) then$replace$;
 if (length(original)-length(replace(original,needle,'')))/length(needle)<>1 then raise exception 'Canonical publication candidate gate changed'; end if;
 execute replace(original,needle,replacement);
end $entry$;

-- Existing API instances must see the appended public view columns after commit.
notify pgrst, 'reload schema';

commit;
