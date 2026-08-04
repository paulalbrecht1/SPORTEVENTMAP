-- Phase A calibration refinements: explicit country kill-switches and proposal-only quality metrics.

insert into public.automation_scope_controls (
  scope_type, scope_key, is_paused, emergency_stop, daily_limit, maximum_parallel_jobs,
  maximum_error_rate, maximum_conflict_rate, maximum_daily_volume, reason
) values
  ('country','DE',false,false,500,2,0.1000,0.1500,500,'German Phase-A observation guard; shadow processing only'),
  ('country','AT',true,true,0,1,0.0000,0.0000,0,'Austria is outside the German Phase-A observation pilot'),
  ('country','CH',true,true,0,1,0.0000,0.0000,0,'Switzerland is outside the German Phase-A observation pilot')
on conflict (scope_type,scope_key) do update set
  is_paused=case when excluded.scope_key in ('AT','CH') then true else public.automation_scope_controls.is_paused end,
  emergency_stop=case when excluded.scope_key in ('AT','CH') then true else public.automation_scope_controls.emergency_stop end,
  daily_limit=excluded.daily_limit,
  maximum_parallel_jobs=excluded.maximum_parallel_jobs,
  maximum_error_rate=excluded.maximum_error_rate,
  maximum_conflict_rate=excluded.maximum_conflict_rate,
  maximum_daily_volume=excluded.maximum_daily_volume,
  reason=excluded.reason,
  updated_at=now();

create or replace function public.get_stage_four_observation_metrics(
  p_pilot_source_id uuid default null,p_source_type text default null,p_field_name text default null,
  p_policy_code text default null,p_parser_version text default null,p_country_code text default null,
  p_from timestamptz default null,p_to timestamptz default null,p_confidence_min numeric default null,
  p_confidence_max numeric default null,p_reliability_min numeric default null,p_reliability_max numeric default null,
  p_review_result text default null,p_blocked_reason text default null
) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,private
as $$
declare result jsonb;
begin
  if not (select private.is_admin()) then raise exception 'admin required' using errcode='42501'; end if;
  with filtered as (
    select o.*,r.review_result from public.stage_four_observations o
    join public.stage_four_pilot_sources s on s.id=o.pilot_source_id
    left join public.stage_four_observation_reviews r on r.observation_id=o.id
    where (p_pilot_source_id is null or o.pilot_source_id=p_pilot_source_id)
      and (p_source_type is null or s.source_type=p_source_type) and (p_field_name is null or o.field_name=p_field_name)
      and (p_policy_code is null or o.policy_code=p_policy_code) and (p_parser_version is null or o.parser_version=p_parser_version)
      and (p_country_code is null or o.country_code=p_country_code) and (p_from is null or o.observed_at>=p_from)
      and (p_to is null or o.observed_at<=p_to) and (p_confidence_min is null or o.confidence>=p_confidence_min)
      and (p_confidence_max is null or o.confidence<=p_confidence_max)
      and (p_reliability_min is null or o.source_reliability>=p_reliability_min)
      and (p_reliability_max is null or o.source_reliability<=p_reliability_max)
      and (p_review_result is null or r.review_result=p_review_result)
      and (p_blocked_reason is null or o.blocked_reason=p_blocked_reason)
  ), counts as (
    select count(*) total,count(*) filter(where change_status='unchanged') unchanged,
      count(*) filter(where proposal_id is not null) proposals,
      count(*) filter(where proposal_id is not null and review_result='correct') correct,
      count(*) filter(where proposal_id is not null and review_result='partially_correct') partial,
      count(*) filter(where proposal_id is not null and review_result='incorrect') incorrect,
      count(*) filter(where proposal_id is not null and review_result is null) unreviewed,
      count(*) filter(where proposal_id is not null and review_result is not null) reviewed,
      count(*) filter(where jsonb_array_length(conflicts)>0) conflicts,
      count(*) filter(where blocked_reason is not null) blocked,
      count(*) filter(where duplicate_match_level<>'no_match') duplicates,
      count(*) filter(where coalesce(array_length(parsing_warnings,1),0)>0) parser_errors,
      count(*) filter(where technically_reachable) reachable,
      avg(confidence) average_confidence,avg(source_reliability) average_reliability
    from filtered
  ) select jsonb_build_object(
    'total_observations',total,'unchanged_observations',unchanged,'change_proposals',proposals,
    'correct_proposals',correct,'partially_correct_proposals',partial,'incorrect_proposals',incorrect,
    'unreviewed_proposals',unreviewed,'reviewed_sample',reviewed,'sample_sufficient',reviewed>=30,
    'sample_warning',case when reviewed<30 then 'insufficient_reviewed_proposal_sample' end,
    'precision',case when reviewed>0 then round(correct::numeric/reviewed,5) end,
    'false_positive_rate',case when reviewed>0 then round(incorrect::numeric/reviewed,5) end,
    'manual_review_rate',case when proposals>0 then round(reviewed::numeric/proposals,5) end,
    'conflict_rate',case when total>0 then round(conflicts::numeric/total,5) end,
    'blocking_rate',case when total>0 then round(blocked::numeric/total,5) end,
    'duplicate_rate',case when total>0 then round(duplicates::numeric/total,5) end,
    'parser_error_rate',case when total>0 then round(parser_errors::numeric/total,5) end,
    'technical_reachability',case when total>0 then round(reachable::numeric/total,5) end,
    'average_confidence',average_confidence,'average_reliability',average_reliability,
    'metric_basis','manually_reviewed_change_proposals'
  ) into result from counts;
  return result;
end $$;

create or replace function public.refresh_stage_four_phase_b_readiness()
returns integer language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare criterion public.stage_four_readiness_criteria; reviewed integer; confirmed integer; correct integer; false_count integer;
  precision_value numeric; false_rate numeric; blockers text[]; affected integer:=0;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  for criterion in select * from public.stage_four_readiness_criteria where enabled loop
    select
      count(r.id) filter(where criterion.dimension_type='action' and criterion.dimension_key='technical_internal' or o.proposal_id is not null),
      count(*) filter(where r.review_result='correct' and o.proposal_id is not null),
      count(*) filter(where r.review_result='correct' and (criterion.dimension_type='action' and criterion.dimension_key='technical_internal' or o.proposal_id is not null)),
      count(*) filter(where r.review_result='incorrect' and (criterion.dimension_type='action' and criterion.dimension_key='technical_internal' or o.proposal_id is not null))
    into reviewed,confirmed,correct,false_count
    from public.stage_four_observations o join public.stage_four_pilot_sources s on s.id=o.pilot_source_id
    left join public.stage_four_observation_reviews r on r.observation_id=o.id
    where case criterion.dimension_type
      when 'field' then o.field_name=criterion.dimension_key
      when 'source' then o.pilot_source_id::text=criterion.dimension_key or o.source_id::text=criterion.dimension_key
      when 'source_type' then s.source_type=criterion.dimension_key
      when 'policy' then o.policy_code=criterion.dimension_key
      when 'country' then o.country_code=criterion.dimension_key
      when 'action' then (criterion.dimension_key='technical_internal' and o.field_name='__source__') or o.proposed_action=criterion.dimension_key
      else false end;
    precision_value:=case when reviewed>0 then correct::numeric/reviewed end;
    false_rate:=case when reviewed>0 then false_count::numeric/reviewed end;
    blockers:='{}';
    if reviewed<criterion.minimum_reviewed then blockers:=array_append(blockers,'insufficient_reviewed_sample'); end if;
    if confirmed<criterion.minimum_confirmed_changes then blockers:=array_append(blockers,'insufficient_confirmed_changes'); end if;
    if precision_value is null or precision_value<criterion.minimum_precision then blockers:=array_append(blockers,'precision_below_threshold'); end if;
    if false_rate is null or false_rate>criterion.maximum_false_positive_rate then blockers:=array_append(blockers,'false_positive_rate_above_threshold'); end if;
    if not exists(select 1 from public.stage_four_audit_log where dry_run) then blockers:=array_append(blockers,'audit_evidence_missing'); end if;
    if not exists(select 1 from public.automation_scope_controls where scope_type='country' and scope_key='DE' and not emergency_stop) then blockers:=array_append(blockers,'kill_switch_configuration_missing'); end if;
    insert into public.stage_four_readiness_snapshots(
      criterion_id,dimension_type,dimension_key,reviewed_count,confirmed_change_count,precision,false_positive_rate,
      sample_sufficient,theoretically_ready,blockers,metrics
    ) values(criterion.id,criterion.dimension_type,criterion.dimension_key,reviewed,confirmed,precision_value,false_rate,
      reviewed>=criterion.minimum_reviewed,coalesce(array_length(blockers,1),0)=0,blockers,
      jsonb_build_object('minimum_reviewed',criterion.minimum_reviewed,'minimum_precision',criterion.minimum_precision,
        'metric_basis',case when criterion.dimension_type='action' and criterion.dimension_key='technical_internal' then 'reviewed_technical_observations' else 'reviewed_change_proposals' end,
        'phase_b_activated',false,'dry_run',true,'automation_enabled',false));
    affected:=affected+1;
  end loop;
  return affected;
end $$;

revoke all on function public.get_stage_four_observation_metrics(uuid,text,text,text,text,text,timestamptz,timestamptz,numeric,numeric,numeric,numeric,text,text) from public,anon;
grant execute on function public.get_stage_four_observation_metrics(uuid,text,text,text,text,text,timestamptz,timestamptz,numeric,numeric,numeric,numeric,text,text) to authenticated,service_role;
revoke all on function public.refresh_stage_four_phase_b_readiness() from public,anon,authenticated;
grant execute on function public.refresh_stage_four_phase_b_readiness() to authenticated,service_role;

comment on function public.get_stage_four_observation_metrics is 'Phase-A metrics; proposal precision and false-positive rates use manually reviewed proposals only and always expose sample size.';
