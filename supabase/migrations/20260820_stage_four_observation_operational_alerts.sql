-- Phase A operational refinements: canonical source binding and internal anomaly signals.

create or replace function public.bind_stage_four_pilot_source(p_pilot_source_id uuid,p_event_source_id uuid,p_reason text)
returns public.stage_four_pilot_sources language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare pilot public.stage_four_pilot_sources; source public.event_sources; result public.stage_four_pilot_sources;
begin
  if not (select private.is_admin()) then raise exception 'admin required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'binding reason required' using errcode='22023'; end if;
  select * into pilot from public.stage_four_pilot_sources where id=p_pilot_source_id for update;
  select * into source from public.event_sources where id=p_event_source_id;
  if pilot.id is null or source.id is null then raise exception 'pilot or event source not found' using errcode='P0002'; end if;
  if regexp_replace(lower(source.source_host),'^www\.','')<>regexp_replace(lower(pilot.domain),'^www\.','') then
    raise exception 'source domain does not match pilot profile' using errcode='23514';
  end if;
  if private.stage_four_country_code((select country from public.events where id=source.event_id))<>'DE' then
    raise exception 'only German event sources may be bound' using errcode='23514';
  end if;
  update public.stage_four_pilot_sources set event_source_id=source.id,pilot_status='ready_for_binding',
    audit_metadata=audit_metadata||jsonb_build_object('binding_reason',p_reason,'bound_at',now(),'bound_by',(select auth.uid())),updated_at=now()
  where id=pilot.id returning * into result;
  insert into public.stage_four_audit_log(action_code,entity_type,entity_id,actor_id,actor_process,dry_run,outcome,reasons)
  values('bind_pilot_source','stage_four_pilot_source',pilot.id::text,(select auth.uid()),current_user,true,'ready_for_binding',
    jsonb_build_array(p_reason,'country_de_validated','domain_validated'));
  return result;
end $$;

create or replace function public.refresh_stage_four_observation_monitoring()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare proposals_24h integer; false_7d integer; queue_length integer; unreachable integer; parser_failures integer;
  conflicts integer; country_errors integer; locked_attempts integer; high_risk integer; rate_limited integer; duplicates integer;
  source_volume integer; low_reliability integer; structure_changes integer; policy_versions integer; cache_anomalies integer;
  persistent_failures integer; opened integer:=0; signal record;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  select count(*) filter(where proposal_id is not null),count(*) filter(where not technically_reachable),
    count(*) filter(where coalesce(array_length(parsing_warnings,1),0)>0),count(*) filter(where jsonb_array_length(conflicts)>0),
    count(*) filter(where not country_valid),count(*) filter(where blocked_reason='field_locked_or_manual_override'),
    count(*) filter(where blocked_reason='high_risk_review_only'),count(*) filter(where duplicate_match_level<>'no_match'),
    count(*) filter(where exists(select 1 from unnest(parsing_warnings) warning where warning ~* '(structure|selector|markup|html)')),
    count(distinct policy_version)
  into proposals_24h,unreachable,parser_failures,conflicts,country_errors,locked_attempts,high_risk,duplicates,
    structure_changes,policy_versions
  from public.stage_four_observations where observed_at>=now()-interval '24 hours';
  select count(*) into false_7d from public.stage_four_observation_reviews where review_result='incorrect' and reviewed_at>=now()-interval '7 days';
  select count(*) into queue_length from public.stage_four_observation_runs where run_status in ('queued','running','partial');
  select coalesce(max(source_count),0) into source_volume from (
    select count(distinct event_id) source_count from public.stage_four_observations where observed_at>=now()-interval '24 hours' group by pilot_source_id
  ) volume;
  select count(*) into low_reliability from public.source_reliability_metrics
    where scope_key like 'phase_a:%' and source_reliability_score<0.500 and calculated_at>=now()-interval '7 days';
  select count(*) into persistent_failures from public.stage_four_pilot_sources where consecutive_observation_failures>=5;
  select count(*) into cache_anomalies from (
    select pilot_source_id,content_hash from public.stage_four_observation_runs
    where created_at>=now()-interval '1 hour' and content_hash is not null
    group by pilot_source_id,content_hash having count(*)>3
  ) repeated;
  select count(*) into rate_limited from (
    select s.id from public.stage_four_observation_runs r join public.stage_four_pilot_sources s on s.id=r.pilot_source_id
    where r.created_at>=current_date group by s.id,s.requests_per_day having count(*)>=s.requests_per_day
  ) limited;
  for signal in select * from (values
    ('observation_proposal_spike','warning','Ungewöhnlich viele Änderungsvorschläge',proposals_24h,50),
    ('observation_false_positive_spike','error','Falsche Vorschläge nehmen zu',false_7d,10),
    ('observation_queue_growth','error','Observation Queue wächst stark',queue_length,100),
    ('observation_unreachable_sources','warning','Viele Quellen sind nicht erreichbar',unreachable,10),
    ('observation_persistent_source_failure','error','Quelle dauerhaft nicht erreichbar',persistent_failures,1),
    ('observation_parser_failures','error','Parser-Ausfälle erkannt',parser_failures,10),
    ('observation_html_structure_change','warning','Unerwartete HTML-Strukturänderung',structure_changes,3),
    ('observation_conflict_spike','warning','Hohe Konfliktrate',conflicts,10),
    ('observation_country_errors','critical','Länderprüfung fehlgeschlagen',country_errors,1),
    ('observation_locked_field_attempts','critical','Versuch gegen Feldsperre',locked_attempts,1),
    ('observation_high_risk_attempts','critical','Hochrisikoaktion im Shadow-Modus blockiert',high_risk,1),
    ('observation_rate_limit','warning','Quellenlimit erreicht',coalesce(rate_limited,0),1),
    ('observation_duplicate_spike','warning','Ungewöhnlich viele Dubletten',duplicates,10),
    ('observation_source_volume','warning','Viele betroffene Events derselben Quelle',source_volume,25),
    ('observation_reliability_drop','warning','Source Reliability ist gesunken',low_reliability,1),
    ('observation_policy_version_change','info','Policy-Verhalten über mehrere Versionen',policy_versions,2),
    ('observation_cache_anomaly','warning','Identische Inhalte werden ungewöhnlich oft abgerufen',cache_anomalies,1)
  ) as signal(code,severity,title,count_value,threshold_value) where count_value>=threshold_value loop
    insert into public.data_workflow_alerts(alert_scope,alert_code,severity,title,description,last_detected_at,metadata)
    values('stage_four_observation',signal.code,signal.severity,signal.title,
      'Interne Phase-A-Warnung; keine externe Benachrichtigung und keine öffentliche Mutation.',now(),
      jsonb_build_object('count',signal.count_value,'threshold',signal.threshold_value,'dry_run',true))
    on conflict(alert_scope,alert_code) where alert_status='open'
    do update set occurrence_count=public.data_workflow_alerts.occurrence_count+1,last_detected_at=now(),metadata=excluded.metadata;
    opened:=opened+1;
  end loop;
  if (select observation_enabled from public.stage_four_settings where singleton)
     and coalesce((select observation_last_heartbeat_at from public.stage_four_settings where singleton),'-infinity')<now()-interval '1 hour' then
    insert into public.data_workflow_alerts(alert_scope,alert_code,severity,title,description,last_detected_at,metadata)
    values('stage_four_observation','observation_scheduler_stale','critical','Observation Scheduler läuft nicht','Heartbeat ist älter als eine Stunde.',now(),'{"dry_run":true}'::jsonb)
    on conflict(alert_scope,alert_code) where alert_status='open'
    do update set occurrence_count=public.data_workflow_alerts.occurrence_count+1,last_detected_at=now();
    opened:=opened+1;
  end if;
  return jsonb_build_object('alerts_opened',opened,'proposals_24h',proposals_24h,'false_reviews_7d',false_7d,
    'queue_length',queue_length,'persistent_failures',persistent_failures,'cache_anomalies',cache_anomalies);
end $$;

revoke all on function public.bind_stage_four_pilot_source(uuid,uuid,text) from public,anon;
grant execute on function public.bind_stage_four_pilot_source(uuid,uuid,text) to authenticated;
revoke all on function public.refresh_stage_four_observation_monitoring() from public,anon,authenticated;
grant execute on function public.refresh_stage_four_observation_monitoring() to authenticated,service_role;
