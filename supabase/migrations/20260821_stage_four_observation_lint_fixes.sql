-- Phase A-owned lint fixes. PostGIS extension diagnostics remain upstream extension output.

create or replace function public.evaluate_change_proposal_automation(p_proposal_id uuid,p_persist boolean default true)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare proposal public.event_change_proposals; settings public.stage_four_settings; source public.event_sources;
  metric public.source_reliability_metrics; event_country text; policy public.automation_policies;
  recommended text:='review'; effective text:='block'; reasons jsonb:='[]'::jsonb;
  met text[]:=array[]::text[]; unmet text[]:=array[]::text[]; blocked text; fingerprint text; decision_id uuid;
  official boolean:=false; phase_rank integer; policy_version text;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  select * into proposal from public.event_change_proposals where id=p_proposal_id;
  if proposal.id is null then raise exception 'proposal not found' using errcode='P0002'; end if;
  select * into settings from public.stage_four_settings where singleton;
  select * into source from public.event_sources where id=proposal.source_id;
  select private.stage_four_country_code(country) into event_country from public.events where id=proposal.event_id;
  official:=source.source_type in ('official_event_website','official_registration_platform','official_registration','registration');
  select * into metric from public.source_reliability_metrics where source_id=source.id and field_name=proposal.field_name order by calculated_at desc limit 1;
  phase_rank:=case settings.rollout_phase when 'observation' then 0 when 'technical' then 1 when 'trusted_content' then 2 when 'austria_pilot' then 3 when 'switzerland_pilot' then 4 else 5 end;
  if proposal.locked_field or exists(
    select 1 from public.event_field_controls c where c.event_id=proposal.event_id and c.field_name=proposal.field_name
      and c.is_locked and (c.lock_expires_at is null or c.lock_expires_at>now())
  ) then
    recommended:='block'; blocked:='field_locked_or_manual_override'; unmet:=array_append(unmet,blocked);
    select * into policy from public.automation_policies where policy_code='locked_or_manual_override';
  elsif proposal.field_name=any(array['start_date','end_date','city','region','country','address','latitude','longitude','sport','official_url','edition_year'])
     or proposal.change_type=any(array['possible_cancellation','possible_postponement','location_change','source_change','new_edition','removed_value']) then
    recommended:='review'; blocked:='high_risk_review_only'; met:=array_append(met,'high_risk_rule_matched');
    select * into policy from public.automation_policies where policy_code='high_risk_review_only';
  elsif coalesce(array_length(proposal.validation_warnings,1),0)>0 then
    recommended:='review'; blocked:='validation_warning_or_conflict'; unmet:=array_append(unmet,blocked);
    select * into policy from public.automation_policies where policy_code='default_review';
  elsif proposal.field_name='registration_status' then
    select * into policy from public.automation_policies where policy_code='trusted_registration_status';
    if event_country='DE' then met:=array_append(met,'country_de'); else unmet:=array_append(unmet,'country_de_required'); end if;
    if official then met:=array_append(met,'official_source'); else unmet:=array_append(unmet,'official_source_required'); end if;
    if proposal.confidence>=0.985 then met:=array_append(met,'confidence_threshold'); else unmet:=array_append(unmet,'confidence_below_0_985'); end if;
    if coalesce(metric.source_reliability_score,0)>=settings.reliability_auto_threshold then met:=array_append(met,'reliability_threshold'); else unmet:=array_append(unmet,'reliability_threshold_not_met'); end if;
    if coalesce(metric.reviewed_count,0)>=settings.reliability_minimum_sample then met:=array_append(met,'reviewed_sample_threshold'); else unmet:=array_append(unmet,'reviewed_sample_too_small'); end if;
    if coalesce(metric.error_rate,1)<=0.02 then met:=array_append(met,'error_rate_threshold'); else unmet:=array_append(unmet,'error_rate_too_high'); end if;
    if phase_rank>=2 then met:=array_append(met,'trusted_content_phase'); else unmet:=array_append(unmet,'phase_c_not_active'); end if;
    recommended:=case when coalesce(array_length(unmet,1),0)=0 then 'auto_apply' else 'review' end;
    if recommended<>'auto_apply' then blocked:='registration_policy_prerequisites_unmet'; end if;
  else
    recommended:='review'; blocked:='no_auto_approval_policy'; unmet:=array_append(unmet,'no_matching_auto_policy');
    select * into policy from public.automation_policies where policy_code='default_review';
  end if;
  if not settings.automation_enabled then unmet:=array_append(unmet,'automation_disabled'); end if;
  if settings.dry_run then unmet:=array_append(unmet,'dry_run'); end if;
  if settings.global_emergency_stop then unmet:=array_append(unmet,'global_emergency_stop'); end if;
  if not settings.automation_enabled or settings.global_emergency_stop then effective:='block';
  elsif settings.dry_run and recommended='auto_apply' then effective:='review'; else effective:=recommended; end if;
  reasons:=to_jsonb(met)||to_jsonb(unmet)||jsonb_build_array(coalesce(blocked,'shadow_only'));
  policy_version:=coalesce(policy.policy_code,'default_review')||'-v'||coalesce(policy.policy_version,1)::text;
  fingerprint:=md5(proposal.id::text||':'||policy_version||':'||proposal.updated_at::text||':'||settings.updated_at::text||':shadow');
  if p_persist then
    insert into public.automation_decisions(
      proposal_id,crawl_result_id,event_id,edition_id,policy_id,policy_code,action_code,recommended_decision,effective_decision,
      decision_status,dry_run,confidence,reliability_score,decision_reasons,policy_snapshot,input_snapshot,decision_fingerprint,
      decision_mode,would_execute,actually_executed,prerequisites_met,prerequisites_unmet,blocked_reason,parser_version,evaluated_policy_version
    ) values(
      proposal.id,proposal.crawl_id,proposal.event_id,proposal.edition_id,policy.id,coalesce(policy.policy_code,'default_review'),proposal.change_type,
      recommended,effective,case when effective='block' then 'blocked' else 'simulated' end,true,proposal.confidence,metric.source_reliability_score,
      reasons,to_jsonb(policy),jsonb_build_object('field',proposal.field_name,'change_type',proposal.change_type,'country',event_country,'official_source',official),fingerprint,
      'shadow',recommended='auto_apply',false,met,unmet,coalesce(blocked,case when effective='block' then 'automation_disabled' end),proposal.extractor_version,policy_version
    ) on conflict(decision_fingerprint) do update set evaluated_at=now(),decision_reasons=excluded.decision_reasons,
      prerequisites_met=excluded.prerequisites_met,prerequisites_unmet=excluded.prerequisites_unmet,blocked_reason=excluded.blocked_reason
    returning id into decision_id;
    insert into public.stage_four_audit_log(action_code,entity_type,entity_id,decision_id,actor_id,actor_process,dry_run,outcome,reasons)
    values('evaluate_shadow_policy','change_proposal',proposal.id::text,decision_id,(select auth.uid()),current_user,true,
      case when effective='block' then 'blocked' else 'simulated' end,reasons);
  end if;
  return jsonb_build_object('decision_id',decision_id,'decision_mode','shadow','recommended_decision',recommended,
    'effective_decision',effective,'would_execute',recommended='auto_apply','actually_executed',false,'policy_code',coalesce(policy.policy_code,'default_review'),
    'policy_version',policy_version,'dry_run',true,'prerequisites_met',met,'prerequisites_unmet',unmet,'blocked_reason',blocked,
    'confidence',proposal.confidence,'reliability_score',metric.source_reliability_score);
end $$;

create or replace function public.refresh_stage_four_observation_monitoring()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare proposals_24h integer; false_7d integer; queue_length integer; unreachable integer; parser_failures integer;
  conflict_count integer; country_errors integer; locked_attempts integer; high_risk integer; rate_limited integer; duplicates integer;
  source_volume integer; low_reliability integer; structure_changes integer; policy_versions integer; cache_anomalies integer;
  persistent_failures integer; opened integer:=0; signal record;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  select count(*) filter(where o.proposal_id is not null),count(*) filter(where not o.technically_reachable),
    count(*) filter(where coalesce(array_length(o.parsing_warnings,1),0)>0),count(*) filter(where jsonb_array_length(o.conflicts)>0),
    count(*) filter(where not o.country_valid),count(*) filter(where o.blocked_reason='field_locked_or_manual_override'),
    count(*) filter(where o.blocked_reason='high_risk_review_only'),count(*) filter(where o.duplicate_match_level<>'no_match'),
    count(*) filter(where exists(select 1 from unnest(o.parsing_warnings) warning where warning ~* '(structure|selector|markup|html)')),
    count(distinct o.policy_version)
  into proposals_24h,unreachable,parser_failures,conflict_count,country_errors,locked_attempts,high_risk,duplicates,
    structure_changes,policy_versions
  from public.stage_four_observations o where o.observed_at>=now()-interval '24 hours';
  select count(*) into false_7d from public.stage_four_observation_reviews where review_result='incorrect' and reviewed_at>=now()-interval '7 days';
  select count(*) into queue_length from public.stage_four_observation_runs where run_status in ('queued','running','partial');
  select coalesce(max(source_count),0) into source_volume from (
    select count(distinct event_id) source_count from public.stage_four_observations where observed_at>=now()-interval '24 hours' group by pilot_source_id
  ) volume;
  select count(*) into low_reliability from public.source_reliability_metrics where scope_key like 'phase_a:%' and source_reliability_score<0.500 and calculated_at>=now()-interval '7 days';
  select count(*) into persistent_failures from public.stage_four_pilot_sources where consecutive_observation_failures>=5;
  select count(*) into cache_anomalies from (
    select pilot_source_id,content_hash from public.stage_four_observation_runs where created_at>=now()-interval '1 hour' and content_hash is not null
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
    ('observation_conflict_spike','warning','Hohe Konfliktrate',conflict_count,10),
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

revoke all on function public.evaluate_change_proposal_automation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.evaluate_change_proposal_automation(uuid,boolean) to authenticated,service_role;
revoke all on function public.refresh_stage_four_observation_monitoring() from public,anon,authenticated;
grant execute on function public.refresh_stage_four_observation_monitoring() to authenticated,service_role;
