-- Manual maintenance uses the canonical event/edition tables and existing audit,
-- field-control, validation and freshness policies. No crawler or LLM is invoked.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.event_editions add column edition_key text not null default 'main'
  check (edition_key ~ '^[a-z0-9][a-z0-9-]{0,47}$');
alter table public.event_editions drop constraint event_editions_event_year_unique;
alter table public.event_editions add constraint event_editions_occurrence_unique
  unique(event_id, edition_year, edition_key);
comment on column public.event_editions.edition_key is
  'Occurrence discriminator within an edition year; main preserves legacy identity. A separate autumn/spring occurrence must be explicitly named.';

-- Only operation receipts, never a second event store. The immutable request
-- makes retries after a lost response safe, including concurrent retries.
create table private.manual_event_maintenance_receipts (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.manual_event_maintenance_receipts enable row level security;
create index manual_event_maintenance_receipts_actor_idx on private.manual_event_maintenance_receipts(actor_id);
revoke all on private.manual_event_maintenance_receipts from public, anon, authenticated;

create or replace function public.admin_manual_event_context(p_event_id bigint)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public, private
as $$
declare payload jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Nur Administratoren dürfen Events pflegen.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'event', to_jsonb(e),
    'editions', coalesce((select jsonb_agg(to_jsonb(d) order by d.edition_year desc,d.start_date,d.id) from public.event_editions d where d.event_id=e.id),'[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.event_sources s where s.event_id=e.id),'[]'::jsonb),
    'candidates', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.edition_succession_candidates c where c.event_id=e.id and c.candidate_status in ('detected','draft_created','conflict')),'[]'::jsonb),
    'controls', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.event_field_controls c where c.event_id=e.id),'[]'::jsonb),
    'verifications', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id) from (
      select distinct on (log.entity_id,log.field_name,coalesce(log.new_value->>'field',log.new_value->>'source_id')) log.*
      from public.event_audit_log log where log.entity_type='edition'
        and log.entity_id in (select id::text from public.event_editions where event_id=e.id)
        and log.field_name in ('__manual_field_verification__','__manual_source_review__')
      order by log.entity_id,log.field_name,coalesce(log.new_value->>'field',log.new_value->>'source_id'),log.created_at desc,log.id desc
    ) a),'[]'::jsonb)
  ) into payload from public.events e where e.id=p_event_id;
  if payload is null then raise exception 'Veranstaltung nicht gefunden.' using errcode='P0002'; end if;
  return payload || jsonb_build_object('version', md5(payload::text));
end;
$$;
revoke all on function public.admin_manual_event_context(bigint) from public,anon;
grant execute on function public.admin_manual_event_context(bigint) to authenticated;

-- A manually inspected source is evidence of a human review, not an invented
-- successful HTTP crawl. The existing verifier still checks all values and
-- blockers. Only server-written audit rows can authorize this alternative.
create or replace function private.has_manual_source_review(p_source uuid,p_edition uuid,p_checked timestamptz)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,private
as $$
  select exists(select 1 from public.event_audit_log a
    join public.event_sources s on s.id=p_source
    where a.entity_type='edition' and a.entity_id=p_edition::text
      and a.field_name='__manual_source_review__' and a.change_source='manual_admin'
      and a.changed_by is not null and a.changed_by_process='manual_event_maintenance'
      and a.new_value->>'source_id'=p_source::text
      and a.new_value->>'source_url'=s.source_url
      and s.edition_id=p_edition and s.is_active and s.source_type='official_event_website'
      and a.new_value->'source_snapshot'=jsonb_build_object('event_id',s.event_id,'edition_id',s.edition_id,
        'source_type',s.source_type,'source_url',s.source_url,'is_active',s.is_active,
        'crawl_status',s.crawl_status,'consecutive_failures',s.consecutive_failures,
        'last_fetched_at',s.last_fetched_at,'last_change_status',s.last_change_status)
      and a.new_value->>'result'='confirmed'
      and a.new_value->>'complete_review'='true'
      and private.try_parse_timestamptz(a.new_value->>'checked_at')=p_checked
      and a.created_at=p_checked
      and not exists(select 1 from public.event_audit_log later
        where later.entity_type='edition' and later.entity_id=p_edition::text
          and later.field_name='__manual_source_review__'
          and later.created_at>a.created_at and later.new_value->>'result'='unreachable'));
$$;
revoke all on function private.has_manual_source_review(uuid,uuid,timestamptz) from public,anon,authenticated;

-- Patch only source transport eligibility; field equality, completeness,
-- review blockers, lifecycle and public guard semantics stay in one place.
do $upgrade$
declare definition text; original text; needle text; replacement text;
begin
  original:=replace(pg_get_functiondef('public.verify_freshness_review_editions(uuid[],text,jsonb)'::regprocedure),chr(13),'');
  needle:=$find$or coalesce(review_record.crawl_status, '') not in ('success', 'not_modified')
       or coalesce(review_record.consecutive_failures, -1) <> 0
       or review_record.source_last_fetched_at is null
       or coalesce(review_record.last_change_status, '') not in ('unchanged', 'first_seen')$find$;
  replacement:=$replace$or (not private.has_manual_source_review(review_record.source_id, review_record.edition_id,
         private.try_parse_timestamptz(evidence_record->>'source_checked_at')) and (
         coalesce(review_record.crawl_status, '') not in ('success', 'not_modified')
         or coalesce(review_record.consecutive_failures, -1) <> 0
         or review_record.source_last_fetched_at is null
         or coalesce(review_record.last_change_status, '') not in ('unchanged', 'first_seen')))$replace$;
  definition:=replace(original,replace(needle,chr(13),''),replace(replacement,chr(13),''));
  if definition=original then raise exception 'Freshness verifier source gate changed; inspect migration before applying'; end if;
  needle:='and review_record.last_verified_source_id is not null then';
  if position(needle in definition)=0 then raise exception 'Freshness repeat-review gate changed'; end if;
  definition:=replace(definition,needle,'and review_record.last_verified_source_id is not null
       and not private.has_manual_source_review(review_record.source_id,review_record.edition_id,
         private.try_parse_timestamptz(evidence_record->>''source_checked_at'')) then');
  execute definition;
  original:=replace(pg_get_functiondef('public.get_public_event_freshness_guard(uuid[])'::regprocedure),chr(13),'');
  needle:=$find$and source.crawl_status in ('success', 'not_modified')
        and source.consecutive_failures = 0
        and source.last_fetched_at is not null
        and source.last_change_status in ('unchanged', 'first_seen')$find$;
  replacement:=$replace$and (private.has_manual_source_review(source.id,edition.id,edition.last_verified_at)
          or (source.crawl_status in ('success', 'not_modified')
            and source.consecutive_failures = 0 and source.last_fetched_at is not null
            and source.last_change_status in ('unchanged', 'first_seen')))$replace$;
  definition:=replace(original,replace(needle,chr(13),''),replace(replacement,chr(13),''));
  if definition=original then raise exception 'Public freshness source gate changed; inspect migration before applying'; end if;
  execute definition;
  original:=replace(pg_get_functiondef('public.evaluate_change_proposal_automation(uuid,boolean)'::regprocedure),chr(13),'');
  needle:='c.event_id=proposal.event_id and c.field_name=proposal.field_name';
  replacement:='c.event_id=proposal.event_id and c.field_name=proposal.field_name
      and (c.edition_id is null or c.edition_id=proposal.edition_id)';
  definition:=replace(original,replace(needle,chr(13),''),replace(replacement,chr(13),''));
  if definition=original then raise exception 'Automation field-control lookup changed; inspect migration before applying'; end if;
  execute definition;
  original:=replace(pg_get_functiondef('private.invalidate_freshness_from_source_health()'::regprocedure),chr(13),'');
  needle:=$find$and coalesce(old.last_change_status, '') in ('unchanged', 'first_seen');$find$;
  replacement:=$replace$and coalesce(old.last_change_status, '') in ('unchanged', 'first_seen')
    or exists(select 1 from public.event_editions manual_edition
      where manual_edition.last_verified_source_id=old.id);$replace$;
  definition:=replace(original,needle,replacement);
  if definition=original then raise exception 'Source freshness invalidation changed; inspect migration before applying'; end if;
  execute definition;
  -- Attribute human checks of shared brand facts to the exact reviewed edition.
  -- These remain factual controls; no freshness/publication metadata is allowed.
  original:=replace(pg_get_functiondef('public.set_event_field_control(bigint,uuid,text,jsonb,text,timestamptz,boolean,smallint)'::regprocedure),chr(13),'');
  needle:=$find$'price_max','currency','price_details','participant_limit','race_formats','source_url']))) then$find$;
  replacement:=$replace$'price_max','currency','price_details','participant_limit','race_formats','source_url',
       'edition_year','edition_key','edition_status','canonical_name','sport','country','city','address',
       'latitude','longitude','description','official_url','organizer_name','organizer_url']))) then$replace$;
  definition:=replace(original,needle,replacement);
  if definition=original then raise exception 'Factual field-control whitelist changed; inspect migration before applying'; end if;
  execute definition;
end;
$upgrade$;

-- All automated direct writers, including legacy imports, obey existing field
-- controls. Source Monitor can still record a review proposal for a conflict.
create or replace function private.guard_manually_controlled_event_fields()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private
as $$
declare control record;
begin
  if auth.uid() is not null and private.is_admin()
     and coalesce(current_setting('app.change_source',true),'') not in ('import','crawler') then return new; end if;
  for control in select c.field_name from public.event_field_controls c
    where c.is_locked and (c.lock_expires_at is null or c.lock_expires_at>now())
      and case when tg_table_name='event_editions' then c.edition_id=(to_jsonb(new)->>'id')::uuid
        else c.event_id=(to_jsonb(new)->>'id')::bigint
          and c.field_name in ('canonical_name','sport','city','country','address','latitude','longitude','description','official_url','organizer_name','organizer_url') end
  loop
    if (to_jsonb(old)->control.field_name) is distinct from (to_jsonb(new)->control.field_name) then
      -- The ordinary grace-period transition is derived from an already past
      -- confirmed date; a status lock must not abort the whole lifecycle batch.
      if tg_table_name='event_editions' and control.field_name='edition_status'
        and to_jsonb(old)->>'edition_status'='scheduled' and to_jsonb(new)->>'edition_status'='completed'
        and current_setting('app.change_reason',true)='Automatic edition lifecycle transition'
        and coalesce((to_jsonb(old)->>'end_date')::date,(to_jsonb(old)->>'start_date')::date)
          < current_date-(select completion_grace_days from public.edition_lifecycle_settings where singleton) then
        continue;
      end if;
      raise exception 'Manuell geschütztes Feld %: Änderung muss geprüft werden.',control.field_name using errcode='23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.guard_manually_controlled_event_fields() from public,anon,authenticated;
create trigger manual_field_controls_event_guard before update on public.events
  for each row execute function private.guard_manually_controlled_event_fields();
create trigger manual_field_controls_edition_guard before update on public.event_editions
  for each row execute function private.guard_manually_controlled_event_fields();

create or replace function private.save_manual_event_maintenance(p_request jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private
set lock_timeout='5s'
as $$
#variable_conflict use_variable
declare
  actor uuid:=auth.uid(); request_id uuid; event_id bigint; edition_id uuid;
  action text:=p_request->>'action'; source_url text:=nullif(btrim(p_request->>'source_url'),'');
  source_result text:=coalesce(p_request->>'source_result','confirmed');
  notes text:=nullif(btrim(p_request->>'notes'),'');
  ep jsonb:=coalesce(p_request->'event_patch','{}'::jsonb);
  dp jsonb:=coalesce(p_request->'edition_patch','{}'::jsonb);
  confirms text[]; clears text[]; field text; scope text; key text; value jsonb;
  allowed_event constant text[]:=array['canonical_name','sport','city','country','address','latitude','longitude','description','official_url','organizer_name','organizer_url'];
  allowed_edition constant text[]:=array['edition_year','edition_key','start_date','end_date','start_time','registration_url','registration_status','edition_status','price_min','price_max','currency','participant_limit','race_formats','source_url'];
  required_checks constant text[]:=array['event.canonical_name','edition.edition_year','edition.start_date','event.city','event.country','event.address','event.latitude','event.longitude','event.sport','edition.race_formats','event.description','edition.registration_status','edition.source_url','edition.registration_url'];
  e public.events%rowtype; d public.event_editions%rowtype; s public.event_sources%rowtype;
  candidate public.edition_succession_candidates%rowtype;
  receipt private.manual_event_maintenance_receipts%rowtype;
  context jsonb; result jsonb; assignments text; saved_at timestamptz:=now();
  source_id uuid; new_year smallint; occurrence text; existing_id uuid;
  complete_review boolean:=false; freshness jsonb:=jsonb_build_object('verified',false);
  publication jsonb; stored_values jsonb; evidence jsonb; affected integer;
begin
  if actor is null or not private.is_admin() then raise exception 'Nur Administratoren dürfen Events pflegen.' using errcode='42501'; end if;
  if jsonb_typeof(p_request) is distinct from 'object' then raise exception 'Ungültiger Pflegeauftrag.' using errcode='22023'; end if;
  request_id:=(p_request->>'request_id')::uuid; event_id:=(p_request->>'event_id')::bigint;
  edition_id:=(p_request->>'edition_id')::uuid;
  if request_id is null or event_id is null or action not in ('confirm','correct','create') or action is null then raise exception 'Pflegeaktion und Anfragekennung fehlen.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
  select * into receipt from private.manual_event_maintenance_receipts r where r.request_id=request_id;
  if found then
    if receipt.actor_id<>actor or receipt.request<>p_request then raise exception 'Diese Anfragekennung gehört zu einem anderen Auftrag.' using errcode='22023'; end if;
    return receipt.result || jsonb_build_object('replayed',true,'context',public.admin_manual_event_context(event_id));
  end if;
  if jsonb_typeof(ep)<>'object' or jsonb_typeof(dp)<>'object'
    or jsonb_typeof(coalesce(p_request->'confirmations','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_request->'clear_fields','[]'::jsonb))<>'array' then
    raise exception 'Ungültige Formularfelder.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(ep) k where not k=any(allowed_event))
    or exists(select 1 from jsonb_object_keys(dp) k where not k=any(allowed_edition)) then
    raise exception 'Das Formular enthält ein nicht erlaubtes Feld.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(ep||dp) p where p.value='null'::jsonb or (jsonb_typeof(p.value)='string' and btrim(p.value#>>'{}')='')) then
    raise exception 'Leere Werte nur über „Bewusst löschen“ entfernen.' using errcode='22023'; end if;
  select coalesce(array_agg(distinct v),'{}') into confirms from jsonb_array_elements_text(coalesce(p_request->'confirmations','[]'::jsonb)) v;
  select coalesce(array_agg(distinct v),'{}') into clears from jsonb_array_elements_text(coalesce(p_request->'clear_fields','[]'::jsonb)) v;
  foreach field in array confirms||clears loop
    scope:=split_part(field,'.',1); key:=split_part(field,'.',2);
    if field<>scope||'.'||key or not ((scope='event' and key=any(allowed_event)) or (scope='edition' and key=any(allowed_edition))) then
      raise exception 'Unbekanntes Prüffeld %.',field using errcode='22023'; end if;
  end loop;
  if source_result not in ('confirmed','no_new_edition','unreachable')
    or (source_result<>'confirmed' and cardinality(confirms)>0) then
    raise exception 'Eine nicht bestätigte Quelle kann keine Angaben verifizieren.' using errcode='22023'; end if;
  if source_url is not null and source_url !~* '^https?://[^[:space:]]+$' then raise exception 'Bitte eine vollständige offizielle Webadresse eingeben.' using errcode='22023'; end if;
  if cardinality(confirms)>0 and source_url is null then raise exception 'Für bestätigte Angaben fehlt die offizielle Quelle.' using errcode='22023'; end if;
  if source_result<>'confirmed' and source_url is null then raise exception 'Bitte die tatsächlich geprüfte Quelle angeben.' using errcode='22023'; end if;
  if action<>'create' and ep='{}'::jsonb and dp='{}'::jsonb and cardinality(clears)=0 and cardinality(confirms)=0 and source_url is null then
    raise exception 'Bitte eine Angabe ändern oder ausdrücklich prüfen.' using errcode='22023'; end if;
  if notes is null or length(notes)<3 or length(notes)>1000 then raise exception 'Bitte eine kurze Prüfnotiz (3–1000 Zeichen) eingeben.' using errcode='22023'; end if;
  if action='confirm' and (ep<>'{}'::jsonb or dp<>'{}'::jsonb or cardinality(clears)>0) then raise exception 'Zum Ändern bitte „Ausgabe korrigieren“ wählen.' using errcode='22023'; end if;
  if action='create' and ep<>'{}'::jsonb then raise exception 'Eine neue Ausgabe darf die Stammdaten der bisherigen Ausgabe nicht ändern.' using errcode='22023'; end if;
  if action<>'create' and (dp ? 'edition_year' or dp ? 'edition_key') then raise exception 'Die Editionsidentität bleibt erhalten. Für eine andere Ausgabe eine neue Edition anlegen.' using errcode='22023'; end if;
  foreach field in array clears loop
    scope:=split_part(field,'.',1); key:=split_part(field,'.',2);
    if key in ('edition_year','edition_key','canonical_name','sport','city','country','registration_status','edition_status','race_formats') then raise exception 'Dieses Kernfeld kann nicht gelöscht werden: %.',field using errcode='22023'; end if;
    if (scope='event' and ep ? key) or (scope='edition' and dp ? key) then raise exception 'Ein Feld kann nicht gleichzeitig geändert und gelöscht werden.' using errcode='22023'; end if;
    if scope='event' then ep:=ep||jsonb_build_object(key,null); else dp:=dp||jsonb_build_object(key,null); end if;
  end loop;
  if action='create' and ep<>'{}'::jsonb then raise exception 'Eine neue Ausgabe darf keine bisherigen Stammdaten löschen.' using errcode='22023'; end if;
  -- Match the existing global source -> event -> edition mutation order.
  perform 1 from public.event_sources x where x.event_id=event_id order by x.id for update;
  select * into e from public.events x where x.id=event_id for update;
  if not found then raise exception 'Veranstaltung nicht gefunden.' using errcode='P0002'; end if;
  perform 1 from public.event_editions x where x.event_id=event_id order by x.id for update;
  context:=public.admin_manual_event_context(event_id);
  if nullif(p_request->>'expected_version','') is null or p_request->>'expected_version'<>context->>'version' then
    raise exception 'Die Daten wurden inzwischen geändert. Neu laden und die Änderungen erneut prüfen; Ihre Eingaben bleiben erhalten.' using errcode='40001'; end if;
  if edition_id is not null then
    select * into d from public.event_editions x where x.id=edition_id and x.event_id=event_id;
    if not found then raise exception 'Die ausgewählte Edition gehört nicht zu dieser Veranstaltung.' using errcode='P0002'; end if;
  elsif action<>'create' then raise exception 'Bitte eine Edition auswählen.' using errcode='22023'; end if;
  perform set_config('app.change_source','manual_admin',true);
  perform set_config('app.change_reason',notes,true);
  perform set_config('app.source_url',coalesce(source_url,''),true);
  if action='create' then
    new_year:=(dp->>'edition_year')::smallint; occurrence:=coalesce(dp->>'edition_key','main');
    if new_year is null then raise exception 'Für einen Entwurf wird das Ausgabejahr benötigt; der Termin darf unbekannt bleiben.' using errcode='22023'; end if;
    select x.id into existing_id from public.event_editions x where x.event_id=event_id and x.edition_year=new_year and (x.edition_key=occurrence or (dp ? 'start_date' and x.start_date=(dp->>'start_date')::date)) limit 1;
    if found then raise exception 'Diese Ausgabe existiert bereits. Bitte die vorhandene Edition auswählen.' using errcode='23505', detail=existing_id::text; end if;
    select * into candidate from public.edition_succession_candidates c
      where c.event_id=event_id and c.candidate_year=new_year
        and c.candidate_status in ('detected','draft_created','conflict')
        and (occurrence='main' or not dp ? 'start_date' or c.candidate_start_date=(dp->>'start_date')::date)
      order by c.created_at,c.id limit 1 for update;
    if nullif(p_request->>'candidate_id','') is not null and candidate.id is null then
      raise exception 'Der ausgewählte Kandidat passt nicht zu dieser Veranstaltung und Ausgabe. Bitte neu laden.' using errcode='22023';
    end if;
    if candidate.id is not null and candidate.draft_edition_id is not null then raise exception 'Zu dieser Ausgabe gibt es bereits einen Entwurf. Bitte diesen auswählen.' using errcode='23505',detail=candidate.draft_edition_id::text; end if;
    if candidate.id is not null and (p_request->>'candidate_id') is distinct from candidate.id::text then
      raise exception 'Zu dieser Ausgabe gibt es einen Kandidaten. Bitte den vorhandenen Kandidaten weiterbearbeiten.' using errcode='23505',detail=candidate.id::text; end if;
    insert into public.event_editions(event_id,edition_year,edition_key,edition_slug,legacy_event_key,
      registration_status,edition_status,publication_status,discovery_status,predecessor_edition_id,generated_from_candidate_id)
      values(event_id,new_year,occurrence,e.slug||'-'||new_year||case when occurrence='main' then '' else '-'||occurrence end,
        'edition:'||gen_random_uuid()::text,'unknown','date_unconfirmed','draft','suppressed',edition_id,candidate.id)
      returning * into d;
    edition_id:=d.id;
    if candidate.id is not null then update public.edition_succession_candidates c set draft_edition_id=d.id,
      candidate_status=case when c.candidate_status='conflict' then 'conflict' else 'draft_created' end where c.id=candidate.id; end if;
    dp:=dp-'edition_year'-'edition_key';
  end if;
  if dp ? 'start_date' and dp->>'start_date' is not null and extract(year from (dp->>'start_date')::date)::integer<>d.edition_year then
    raise exception 'Der Termin passt nicht zum Ausgabejahr. Eine neue Ausgabe braucht eine neue Edition.' using errcode='23514'; end if;
  foreach key in array array['official_url','organizer_url'] loop
    if ep ? key and ep->>key is not null and ep->>key !~* '^https?://[^[:space:]]+$' then raise exception 'Ungültige Webadresse: %',key using errcode='22023'; end if;
  end loop;
  foreach key in array array['source_url','registration_url'] loop
    if dp ? key and dp->>key is not null and dp->>key !~* '^https?://[^[:space:]]+$' then raise exception 'Ungültige Webadresse: %',key using errcode='22023'; end if;
  end loop;
  if ep ? 'latitude' and ep->>'latitude' is not null and (private.try_parse_coordinate(ep->>'latitude') is null or private.try_parse_coordinate(ep->>'latitude') not between -90 and 90) then raise exception 'Breitengrad muss zwischen -90 und 90 liegen.' using errcode='22023'; end if;
  if ep ? 'longitude' and ep->>'longitude' is not null and (private.try_parse_coordinate(ep->>'longitude') is null or private.try_parse_coordinate(ep->>'longitude') not between -180 and 180) then raise exception 'Längengrad muss zwischen -180 und 180 liegen.' using errcode='22023'; end if;
  if dp ? 'race_formats' then
    if jsonb_typeof(dp->'race_formats')<>'array' or jsonb_array_length(dp->'race_formats')>100 then raise exception 'Wettbewerbe müssen als Liste vorliegen (höchstens 100).' using errcode='22023'; end if;
    for value in select v from jsonb_array_elements(dp->'race_formats') v loop
      if jsonb_typeof(value)<>'object' or jsonb_typeof(value->'label') is distinct from 'string'
        or nullif(btrim(value->>'label'),'') is null or length(value->>'label')>200
        or exists(select 1 from jsonb_object_keys(value) k
          where k not in ('label','distance_km','swim_km','bike_km','run_km','elevation_gain_m','sport','name','format','start_time','price','currency')
            and not exists(select 1 from jsonb_array_elements(d.race_formats) prior where prior->k=value->k)) then
        raise exception 'Jeder Wettbewerb benötigt eine Bezeichnung und erlaubte Distanzangaben.' using errcode='22023'; end if;
      foreach key in array array['distance_km','swim_km','bike_km','run_km','elevation_gain_m','price'] loop
        if value ? key and (jsonb_typeof(value->key)<>'number' or (value->>key)::numeric<0 or (value->>key)::numeric>100000) then raise exception 'Ungültige Distanz oder Preis im Wettbewerb.' using errcode='22023'; end if;
      end loop;
    end loop;
    -- Public distance filters still read this compatibility projection first.
    -- Derive it from every competition just like the existing fact-batch tool.
    dp:=dp||jsonb_build_object('legacy_distance',(select string_agg(v->>'label',' / ' order by position)
      from jsonb_array_elements(dp->'race_formats') with ordinality formats(v,position)));
  end if;
  -- Identifiers are derived solely from checked whitelists. jsonb_populate_record
  -- applies native database types without trusting client column names or SQL.
  if ep<>'{}'::jsonb then
    select string_agg(format('%I = patch.%I',k,k),',') into assignments from jsonb_object_keys(ep) k;
    execute format('update public.events target set %s from jsonb_populate_record(null::public.events,$1) patch where target.id=$2',assignments) using ep,event_id;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Stammdaten konnten nicht gespeichert werden.'; end if;
  end if;
  if dp<>'{}'::jsonb then
    select string_agg(format('%I = patch.%I',k,k),',') into assignments from jsonb_object_keys(dp) k;
    execute format('update public.event_editions target set %s from jsonb_populate_record(null::public.event_editions,$1) patch where target.id=$2 and target.event_id=$3',assignments) using dp,edition_id,event_id;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Edition konnte nicht gespeichert werden.'; end if;
  end if;
  select * into e from public.events x where x.id=event_id;
  select * into d from public.event_editions x where x.id=edition_id;
  if source_url is not null then
    select * into s from public.event_sources x where x.event_id=event_id and x.edition_id=edition_id and x.source_url=source_url and x.source_type='official_event_website' order by x.id limit 1;
    if s.id is null then
      insert into public.event_sources(event_id,edition_id,source_type,source_url,source_priority,parser_type)
        values(event_id,edition_id,'official_event_website',source_url,1,'manual') returning * into s;
    end if;
    source_id:=s.id;
  end if;
  complete_review:=confirms @> required_checks and source_result='confirmed';
  foreach field in array confirms loop
    scope:=split_part(field,'.',1); key:=split_part(field,'.',2);
    value:=case when scope='event' then to_jsonb(e)->key else to_jsonb(d)->key end;
    if value is null or value='null'::jsonb or value='""'::jsonb or (key='race_formats' and value='[]'::jsonb) then raise exception 'Ein unbekannter Wert kann nicht bestätigt werden: %.',field using errcode='22023'; end if;
    insert into public.event_audit_log(entity_type,entity_id,field_name,new_value,change_source,changed_by,changed_by_process,reason,source_url)
      values('edition',edition_id::text,'__manual_field_verification__',jsonb_build_object('field',field,'value',value,'source_id',source_id,'source_url',source_url,'checked_at',saved_at,'result','confirmed'),'manual_admin',actor,'manual_event_maintenance',notes,source_url);
    -- Even shared brand checks are attributed to this edition. No new edition
    -- inherits the controls or verifications of its predecessor.
    perform public.set_event_field_control(event_id,edition_id,key,value,notes,null,true,1::smallint);
  end loop;
  if source_url is not null then
    insert into public.event_audit_log(entity_type,entity_id,field_name,new_value,change_source,changed_by,changed_by_process,reason,source_url)
      values('edition',edition_id::text,'__manual_source_review__',jsonb_build_object('source_id',source_id,'source_url',source_url,'checked_at',saved_at,'result',source_result,'complete_review',complete_review,'confirmed_fields',to_jsonb(confirms),
        'source_snapshot',jsonb_build_object('event_id',s.event_id,'edition_id',s.edition_id,'source_type',s.source_type,'source_url',s.source_url,'is_active',s.is_active,'crawl_status',s.crawl_status,'consecutive_failures',s.consecutive_failures,'last_fetched_at',s.last_fetched_at,'last_change_status',s.last_change_status)),
        'manual_admin',actor,'manual_event_maintenance',notes,source_url);
  end if;
  if source_result='unreachable' then perform private.invalidate_current_edition_freshness(event_id,edition_id,'high'); end if;
  if ep<>'{}'::jsonb or dp<>'{}'::jsonb or action='create' then perform public.run_event_validation(event_id,edition_id); end if;
  publication:=jsonb_build_object('status',case when d.publication_status='published' then 'database_public' else 'draft' end,'static_refresh_required',true);
  if complete_review then
    stored_values:=jsonb_build_object('event_name',coalesce(e.canonical_name,e.event_name),'edition_year',d.edition_year,'date',d.start_date,'city',e.city,'country',e.country,'address',e.address,'latitude',e.latitude,'longitude',e.longitude,'sport',e.sport,'distances',d.race_formats,'description',e.description,'registration_status',d.registration_status,'official_event_page',d.source_url,'registration_link',d.registration_url);
    evidence:=jsonb_build_object(edition_id::text,jsonb_build_object('source_id',source_id,'source_url',source_url,'source_checked_at',saved_at,'confidence',1,'confirmed_fields',to_jsonb(array['event_name','edition_year','date','city','country','address','latitude','longitude','sport','distances','description','registration_status','official_event_page','registration_link']),'uncertain_fields','[]'::jsonb,'observed_values',stored_values));
    begin
      if coalesce((p_request->>'publish')::boolean,false) and d.publication_status='draft' then
        if d.start_date is null or d.start_date<=current_date or d.edition_year>extract(year from current_date)::integer+5 or d.edition_status<>'scheduled' or d.race_formats='[]'::jsonb then raise exception 'Für die Freigabe fehlen ein zukünftiger bestätigter Termin innerhalb der nächsten fünf Jahre, geplante Austragung oder Wettbewerbe.'; end if;
        if exists(select 1 from public.edition_succession_candidates c where c.id=d.generated_from_candidate_id and (c.candidate_status='conflict' or c.validation_status='conflict')) then raise exception 'Der bestehende Editionskandidat enthält einen ungelösten Konflikt.'; end if;
        if exists(select 1 from public.event_field_controls c where c.event_id=event_id
          and (c.edition_id is null or c.edition_id=edition_id) and c.is_locked
          and (c.lock_expires_at is null or c.lock_expires_at>now())
          and c.field_name in ('new_edition','publication_status','discovery_status')) then
          raise exception 'Für diese Edition besteht eine aktive Veröffentlichungssperre. Bitte zuerst im Review prüfen.';
        end if;
        if exists(select 1 from public.edition_succession_candidates c where c.event_id=event_id and c.candidate_year=d.edition_year and c.candidate_status in ('conflict','detected','draft_created') and c.id is distinct from d.generated_from_candidate_id and c.candidate_start_date=d.start_date) then raise exception 'Ein konkurrierender Editionskandidat muss zuerst geprüft werden.'; end if;
        update public.event_editions x set publication_status='published',discovery_status='active',published_at=now() where x.id=edition_id and x.publication_status='draft';
        get diagnostics affected=row_count;
        if affected<>1 then raise exception 'Die Edition wurde zwischenzeitlich verändert.' using errcode='40001'; end if;
        -- A bound candidate's own task is completed only together with the
        -- strict publication verification; unrelated tasks remain blockers.
        if d.generated_from_candidate_id is not null then
          update public.source_review_tasks t set status='resolved',reviewed_at=now(),reviewed_by=actor,review_notes=notes
            where t.fingerprint='succession:'||d.generated_from_candidate_id::text and t.task_type='new_edition_candidate' and t.status='open' and t.event_id=event_id;
          update public.edition_succession_candidates c set candidate_status='approved',reviewed_at=now(),reviewed_by=actor,review_notes=notes where c.id=d.generated_from_candidate_id;
        end if;
      end if;
      perform public.verify_freshness_review_editions(array[edition_id],notes,evidence);
      freshness:=jsonb_build_object('verified',true);
      publication:=jsonb_build_object('status','database_public','static_refresh_required',true);
    exception when others then
      freshness:=jsonb_build_object('verified',false,'reason',sqlerrm);
      if coalesce((p_request->>'publish')::boolean,false) then publication:=jsonb_build_object('status','failed','error',sqlerrm,'static_refresh_required',true); end if;
    end;
  elsif coalesce((p_request->>'publish')::boolean,false) then
    publication:=jsonb_build_object('status','failed','error','Vor der Freigabe alle 14 Kernangaben ausdrücklich prüfen.','static_refresh_required',true);
  end if;
  result:=jsonb_build_object('request_id',request_id,'event_id',event_id,'edition_id',edition_id,'saved',true,'replayed',false,'context',public.admin_manual_event_context(event_id),'publication',publication,'freshness',freshness);
  insert into private.manual_event_maintenance_receipts(request_id,actor_id,request,result) values(request_id,actor,p_request,result-'context');
  return result;
end;
$$;
revoke all on function private.save_manual_event_maintenance(jsonb) from public,anon;
grant execute on function private.save_manual_event_maintenance(jsonb) to authenticated;
create or replace function public.save_manual_event_maintenance(p_request jsonb)
returns jsonb language sql security invoker
set search_path=pg_catalog,private
as $$select private.save_manual_event_maintenance(p_request);$$;
revoke all on function public.save_manual_event_maintenance(jsonb) from public,anon;
grant execute on function public.save_manual_event_maintenance(jsonb) to authenticated;

commit;
