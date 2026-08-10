-- Stage-4 follow-up: count crawler usage and expose compact anomaly monitoring.
-- Kept as a separate additive migration so existing local data never needs reset.

begin;

revoke update, delete, truncate on public.stage_four_audit_log from service_role;
grant select, insert on public.stage_four_audit_log to service_role;

create or replace function public.record_stage_four_crawl_automation(p_crawl_result_id bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare crawl public.source_crawl_results; source public.event_sources; settings public.stage_four_settings;
  recommended text := 'review'; effective text := 'review'; action text := 'technical_reachability';
  reasons jsonb := '[]'::jsonb; decision_id uuid; fingerprint text; official boolean; daily_crawls integer;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into crawl from public.source_crawl_results where id=p_crawl_result_id;
  if crawl.id is null then raise exception 'crawl result not found' using errcode='P0002'; end if;
  select * into source from public.event_sources where id=crawl.source_id;
  select * into settings from public.stage_four_settings where singleton;
  insert into public.stage_four_usage_daily(scope_type,scope_key,crawl_requests)
  values('global','all',1) on conflict(usage_date,scope_type,scope_key)
  do update set crawl_requests=public.stage_four_usage_daily.crawl_requests+1,updated_at=now()
  returning crawl_requests into daily_crawls;
  insert into public.stage_four_usage_daily(scope_type,scope_key,crawl_requests)
  values('domain',coalesce(source.source_host,'unknown'),1) on conflict(usage_date,scope_type,scope_key)
  do update set crawl_requests=public.stage_four_usage_daily.crawl_requests+1,updated_at=now();
  official:=source.source_type in ('official_event_website','official_registration_platform','official_registration','registration');
  if daily_crawls > settings.daily_crawl_limit then
    action:='daily_crawl_limit'; recommended:='block'; reasons:='["daily_crawl_limit_exceeded"]'::jsonb;
  elsif crawl.change_status='unchanged' and official and crawl.processing_status='completed' and crawl.error_type is null then
    action:='unchanged_official_verification';
    if settings.automation_enabled and settings.rollout_phase <> 'observation' and not settings.global_emergency_stop then
      recommended:='auto_apply'; reasons:='["unchanged_official_source","technical_phase_candidate"]'::jsonb;
    else
      recommended:='review'; reasons:='["phase_b_not_enabled"]'::jsonb;
    end if;
  elsif crawl.processing_status='completed' and crawl.error_type is null then
    action:='technical_reachability'; recommended:='auto_apply'; reasons:='["technical_source_state_only"]'::jsonb;
  else
    action:='technical_failure_state'; recommended:='review'; reasons:='["crawl_failure_requires_existing_retry_policy"]'::jsonb;
  end if;
  effective:=case when settings.dry_run and recommended='auto_apply' then 'review' else recommended end;
  if settings.dry_run and recommended='auto_apply' then reasons:=reasons || '"dry_run_prevented_apply"'::jsonb; end if;
  fingerprint:=md5(crawl.id::text || ':' || action || ':' || settings.updated_at::text);
  insert into public.automation_decisions(crawl_result_id,event_id,edition_id,policy_code,action_code,recommended_decision,effective_decision,
    decision_status,dry_run,confidence,decision_reasons,input_snapshot,decision_fingerprint)
  values(crawl.id,crawl.event_id,crawl.edition_id,'safe_technical_actions',action,recommended,effective,
    case when settings.dry_run then 'simulated' when effective='auto_apply' then 'applied' else 'pending_review' end,
    settings.dry_run,case when crawl.change_status='unchanged' then 1 else 0.95 end,reasons,
    jsonb_build_object('change_status',crawl.change_status,'processing_status',crawl.processing_status,'official_source',official),fingerprint)
  on conflict(decision_fingerprint) do update set evaluated_at=now(),decision_reasons=excluded.decision_reasons returning id into decision_id;
  insert into public.stage_four_audit_log(action_code,entity_type,entity_id,decision_id,actor_process,dry_run,outcome,reasons)
  values(action,'source_crawl_result',crawl.id::text,decision_id,current_user,settings.dry_run,
    case when settings.dry_run then 'simulated' when effective='auto_apply' then 'applied' else 'review' end,reasons);
  return jsonb_build_object('decision_id',decision_id,'action_code',action,'recommended_decision',recommended,
    'effective_decision',effective,'dry_run',settings.dry_run,'public_event_changes',0);
end $$;

create or replace function public.refresh_stage_four_monitoring()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare settings public.stage_four_settings; queue_length integer; worker_failures integer; geocoding_failures integer;
  critical_signals integer; discovery_spike integer; daily_crawls integer; opened integer:=0;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  select * into settings from public.stage_four_settings where singleton;
  select count(*) into queue_length from public.source_crawl_jobs where status in ('queued','retry_scheduled','processing');
  select count(*) into worker_failures from public.source_crawl_results where created_at>=now()-interval '24 hours' and processing_status in ('dead_letter','retry_scheduled');
  select count(*) into geocoding_failures from public.geocoding_jobs where requested_at>=now()-interval '24 hours' and job_status in ('failed','rate_limited');
  select count(*) into critical_signals from public.event_change_proposals where created_at>=now()-interval '24 hours' and change_type in ('possible_cancellation','possible_postponement');
  select coalesce(max(candidate_count),0) into discovery_spike from (
    select count(*) candidate_count from public.discovery_candidates where created_at>=now()-interval '24 hours' group by discovery_source_id
  ) counts;
  select coalesce(sum(crawl_requests),0) into daily_crawls from public.stage_four_usage_daily where usage_date=current_date and scope_type='global';

  if queue_length > settings.maximum_queue_length then
    insert into public.data_workflow_alerts(alert_scope,alert_code,severity,title,description,last_detected_at,metadata)
    values('stage_four','queue_limit_exceeded','critical','Stage-4 Queue-Limit überschritten','Die kombinierte Crawl-Queue ist größer als das konfigurierte Limit.',now(),jsonb_build_object('queue_length',queue_length,'limit',settings.maximum_queue_length))
    on conflict(alert_scope,alert_code) do update set alert_status='open',severity='critical',last_detected_at=now(),occurrence_count=public.data_workflow_alerts.occurrence_count+1,metadata=excluded.metadata;
    opened:=opened+1;
  end if;
  if worker_failures >= 20 then
    insert into public.data_workflow_alerts(alert_scope,alert_code,severity,title,description,last_detected_at,metadata)
    values('stage_four','worker_failure_spike','error','Ungewöhnlich viele Workerfehler','Mindestens 20 Retries oder Dead-Letter-Ergebnisse in 24 Stunden.',now(),jsonb_build_object('failures',worker_failures))
    on conflict(alert_scope,alert_code) do update set alert_status='open',last_detected_at=now(),occurrence_count=public.data_workflow_alerts.occurrence_count+1,metadata=excluded.metadata;
    opened:=opened+1;
  end if;
  if geocoding_failures >= 5 then
    insert into public.data_workflow_alerts(alert_scope,alert_code,severity,title,description,last_detected_at,metadata)
    values('stage_four','geocoding_failure_spike','warning','Geocoding-Probleme','Mindestens fünf fehlgeschlagene oder rate-limitierte Geocoding-Jobs in 24 Stunden.',now(),jsonb_build_object('failures',geocoding_failures))
    on conflict(alert_scope,alert_code) do update set alert_status='open',last_detected_at=now(),occurrence_count=public.data_workflow_alerts.occurrence_count+1,metadata=excluded.metadata;
    opened:=opened+1;
  end if;
  if critical_signals >= 10 then
    insert into public.data_workflow_alerts(alert_scope,alert_code,severity,title,description,last_detected_at,metadata)
    values('stage_four','critical_status_spike','critical','Ungewöhnlich viele Absage-/Verschiebungssignale','Kritische Statussignale überschreiten die 24-Stunden-Schwelle.',now(),jsonb_build_object('signals',critical_signals))
    on conflict(alert_scope,alert_code) do update set alert_status='open',severity='critical',last_detected_at=now(),occurrence_count=public.data_workflow_alerts.occurrence_count+1,metadata=excluded.metadata;
    opened:=opened+1;
  end if;
  if discovery_spike > settings.maximum_candidates_per_source then
    insert into public.data_workflow_alerts(alert_scope,alert_code,severity,title,description,last_detected_at,metadata)
    values('stage_four','discovery_candidate_spike','error','Zu viele Kandidaten aus einer Quelle','Eine Discovery-Quelle überschreitet das konfigurierte Tageslimit.',now(),jsonb_build_object('maximum_source_candidates',discovery_spike,'limit',settings.maximum_candidates_per_source))
    on conflict(alert_scope,alert_code) do update set alert_status='open',last_detected_at=now(),occurrence_count=public.data_workflow_alerts.occurrence_count+1,metadata=excluded.metadata;
    opened:=opened+1;
  end if;
  if daily_crawls > settings.daily_crawl_limit then
    insert into public.data_workflow_alerts(alert_scope,alert_code,severity,title,description,last_detected_at,metadata)
    values('stage_four','daily_crawl_limit_exceeded','critical','Tägliches Crawl-Limit überschritten','Weitere Stage-4-Entscheidungen werden blockiert.',now(),jsonb_build_object('crawls',daily_crawls,'limit',settings.daily_crawl_limit))
    on conflict(alert_scope,alert_code) do update set alert_status='open',severity='critical',last_detected_at=now(),occurrence_count=public.data_workflow_alerts.occurrence_count+1,metadata=excluded.metadata;
    opened:=opened+1;
  end if;
  return jsonb_build_object('alerts_opened',opened,'queue_length',queue_length,'worker_failures_24h',worker_failures,
    'geocoding_failures_24h',geocoding_failures,'critical_signals_24h',critical_signals,'maximum_discovery_candidates_24h',discovery_spike,'daily_crawls',daily_crawls);
end $$;

revoke all on function public.record_stage_four_crawl_automation(bigint) from public, anon, authenticated;
revoke all on function public.refresh_stage_four_monitoring() from public, anon, authenticated;
grant execute on function public.record_stage_four_crawl_automation(bigint) to service_role;
grant execute on function public.refresh_stage_four_monitoring() to authenticated, service_role;

commit;
