-- Remove unused queue variables without changing Phase-A behavior.

create or replace function public.enqueue_stage_four_observation_runs(p_limit integer default 10,p_trigger_source text default 'scheduler')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare settings public.stage_four_settings; pilot public.stage_four_pilot_sources; job public.source_crawl_jobs;
  queued integer:=0; skipped integer:=0; failed integer:=0; block_reason text; key text;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  if p_trigger_source not in ('scheduler','admin','retry','recovery','test') then raise exception 'invalid trigger source' using errcode='22023'; end if;
  select * into settings from public.stage_four_settings where singleton;
  if not settings.dry_run or settings.automation_enabled or not settings.observation_enabled then
    return jsonb_build_object('queued',0,'skipped',0,'failed',0,'blocked_reason','global_observation_stop_or_unsafe_settings','dry_run',true);
  end if;
  if p_trigger_source='scheduler' and not settings.observation_scheduler_enabled then
    return jsonb_build_object('queued',0,'skipped',0,'failed',0,'blocked_reason','scheduler_disabled','dry_run',true);
  end if;
  for pilot in select * from public.stage_four_pilot_sources
    where country_code='DE' and pilot_status='pilot_observation' and event_source_id is not null
      and coalesce(next_observation_at,'-infinity')<=now()
    order by coalesce(next_observation_at,'-infinity'),source_key limit greatest(1,least(coalesce(p_limit,10),50))
  loop
    begin
      block_reason:=private.stage_four_observation_block_reason(pilot.id,null,null,'crawl',pilot.parser_version);
      if block_reason is not null then skipped:=skipped+1; continue; end if;
      key:='phase-a:'||pilot.id::text||':'||floor(extract(epoch from now())/(pilot.check_interval_minutes*60))::bigint::text;
      select * into job from public.enqueue_source_crawl(pilot.event_source_id,20,now(),p_trigger_source);
      insert into public.stage_four_observation_runs(
        pilot_source_id,source_id,event_id,crawl_job_id,run_status,trigger_source,idempotency_key,parser_version,policy_version,dry_run
      ) select pilot.id,source.id,source.event_id,job.id,'queued',p_trigger_source,key,pilot.parser_version,settings.observation_policy_version,true
        from public.event_sources source where source.id=pilot.event_source_id
      on conflict(idempotency_key) do update set updated_at=now();
      update public.stage_four_pilot_sources set next_observation_at=now()+make_interval(mins=>check_interval_minutes),updated_at=now() where id=pilot.id;
      queued:=queued+1;
    exception when others then
      failed:=failed+1;
      insert into public.stage_four_observation_runs(pilot_source_id,source_id,event_id,run_status,trigger_source,idempotency_key,parser_version,policy_version,dry_run,error_count,error_message,finished_at)
      select pilot.id,source.id,source.event_id,'failed',p_trigger_source,'failed:'||pilot.id::text||':'||gen_random_uuid()::text,pilot.parser_version,settings.observation_policy_version,true,1,left(sqlerrm,2000),now()
      from public.event_sources source where source.id=pilot.event_source_id;
    end;
  end loop;
  update public.stage_four_settings set observation_last_heartbeat_at=now(),updated_at=now() where singleton;
  return jsonb_build_object('queued',queued,'skipped',skipped,'failed',failed,'dry_run',true,'public_event_changes',0);
end $$;

create or replace function public.resume_stage_four_observation_run(p_run_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare previous public.stage_four_observation_runs; queued jsonb;
begin
  if not (select private.is_admin()) then raise exception 'admin required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'resume reason required' using errcode='22023'; end if;
  select * into previous from public.stage_four_observation_runs where id=p_run_id and run_status in ('failed','partial','cancelled','paused');
  if previous.id is null then raise exception 'resumable observation run not found' using errcode='P0002'; end if;
  update public.stage_four_pilot_sources set pilot_status='pilot_observation',paused_reason=null,next_observation_at=now(),
    audit_metadata=audit_metadata||jsonb_build_object('resume_reason',p_reason,'resumed_at',now()),updated_at=now()
  where id=previous.pilot_source_id;
  queued:=public.enqueue_stage_four_observation_runs(1,'recovery');
  return queued||jsonb_build_object('resumed_from_run_id',previous.id,'dry_run',true,'public_event_changes',0);
end $$;

revoke all on function public.enqueue_stage_four_observation_runs(integer,text) from public,anon,authenticated;
grant execute on function public.enqueue_stage_four_observation_runs(integer,text) to authenticated,service_role;
revoke all on function public.resume_stage_four_observation_run(uuid,text) from public,anon;
grant execute on function public.resume_stage_four_observation_run(uuid,text) to authenticated;
