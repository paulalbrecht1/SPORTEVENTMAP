-- Stage 4 Phase A: real German pilot observations in shadow mode.
-- This migration deliberately cannot enable live automation or public mutations.

begin;

alter table public.stage_four_settings
  add column if not exists observation_enabled boolean not null default false,
  add column if not exists observation_scheduler_enabled boolean not null default false,
  add column if not exists observation_country_code char(2) not null default 'DE',
  add column if not exists observation_policy_version text not null default 'phase-a-shadow-v1',
  add column if not exists observation_target_minimum integer not null default 200,
  add column if not exists observation_target_maximum integer not null default 500,
  add column if not exists observation_last_heartbeat_at timestamptz;

alter table public.stage_four_settings
  drop constraint if exists stage_four_phase_a_shadow_guard,
  drop constraint if exists stage_four_observation_country_check,
  drop constraint if exists stage_four_observation_target_check;
alter table public.stage_four_settings
  add constraint stage_four_phase_a_shadow_guard check (dry_run and not automation_enabled),
  add constraint stage_four_observation_country_check check (observation_country_code = 'DE'),
  add constraint stage_four_observation_target_check check (
    observation_target_minimum between 100 and 500
    and observation_target_maximum between observation_target_minimum and 1000
  );

update public.stage_four_settings
set dry_run = true,
    automation_enabled = false,
    observation_enabled = false,
    observation_scheduler_enabled = false,
    observation_country_code = 'DE',
    change_reason = 'German Phase-A observation preparation; activation requires a separate admin action',
    updated_at = now()
where singleton;

update public.country_rollouts
set automation_enabled = false,
    geocoding_enabled = false,
    rollout_status = case when country_code = 'DE' then 'observation' else 'pilot_disabled' end,
    discovery_enabled = case when country_code = 'DE' then discovery_enabled else false end,
    paused_reason = case when country_code in ('AT','CH') then 'Not part of the German Phase-A observation pilot' else paused_reason end,
    updated_at = now()
where country_code in ('DE','AT','CH');

alter table public.automation_scope_controls
  add column if not exists maximum_error_rate numeric(5,4),
  add column if not exists maximum_conflict_rate numeric(5,4),
  add column if not exists maximum_daily_volume integer;
alter table public.automation_scope_controls
  drop constraint if exists automation_scope_controls_scope_type_check,
  drop constraint if exists automation_scope_controls_error_rate_check,
  drop constraint if exists automation_scope_controls_conflict_rate_check,
  drop constraint if exists automation_scope_controls_daily_volume_check;
alter table public.automation_scope_controls
  add constraint automation_scope_controls_scope_type_check check (scope_type in (
    'country','domain','source','source_type','field','policy','action','parser_version','worker'
  )),
  add constraint automation_scope_controls_error_rate_check check (maximum_error_rate is null or maximum_error_rate between 0 and 1),
  add constraint automation_scope_controls_conflict_rate_check check (maximum_conflict_rate is null or maximum_conflict_rate between 0 and 1),
  add constraint automation_scope_controls_daily_volume_check check (maximum_daily_volume is null or maximum_daily_volume >= 0);

alter table public.automation_decisions
  add column if not exists decision_mode text not null default 'shadow',
  add column if not exists would_execute boolean not null default false,
  add column if not exists actually_executed boolean not null default false,
  add column if not exists prerequisites_met text[] not null default '{}',
  add column if not exists prerequisites_unmet text[] not null default '{}',
  add column if not exists blocked_reason text,
  add column if not exists parser_version text,
  add column if not exists evaluated_policy_version text;
alter table public.automation_decisions
  drop constraint if exists automation_decisions_mode_check,
  drop constraint if exists automation_decisions_phase_a_execution_guard;
alter table public.automation_decisions
  add constraint automation_decisions_mode_check check (decision_mode in ('shadow','live')),
  add constraint automation_decisions_phase_a_execution_guard check (not actually_executed);

create or replace function private.stage_four_country_code(p_country text)
returns text language sql immutable security invoker set search_path=pg_catalog
as $$
  select case lower(btrim(coalesce(p_country,'')))
    when 'de' then 'DE' when 'deutschland' then 'DE' when 'germany' then 'DE'
    when 'at' then 'AT' when 'österreich' then 'AT' when 'oesterreich' then 'AT' when 'austria' then 'AT'
    when 'ch' then 'CH' when 'schweiz' then 'CH' when 'suisse' then 'CH' when 'svizzera' then 'CH' when 'switzerland' then 'CH'
  end
$$;

create or replace function public.evaluate_change_proposal_automation(p_proposal_id uuid,p_persist boolean default true)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare proposal public.event_change_proposals; settings public.stage_four_settings; source public.event_sources;
  metric public.source_reliability_metrics; event_country text; policy public.automation_policies;
  recommended text:='review'; effective text:='block'; reasons jsonb:='[]'::jsonb;
  met text[]:='{}'; unmet text[]:='{}'; blocked text; fingerprint text; decision_id uuid;
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

create table if not exists public.stage_four_pilot_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  event_source_id uuid unique references public.event_sources(id) on delete set null,
  source_name text not null,
  source_type text not null check (source_type in (
    'official_event_website','official_registration_platform','timing_platform',
    'race_series','federation_calendar','organizer_calendar','structured_event_list','sitemap'
  )),
  domain text not null,
  source_url text not null,
  country_code char(2) not null default 'DE' check (country_code = 'DE'),
  pilot_status text not null default 'candidate' check (pilot_status in (
    'candidate','ready_for_binding','pilot_observation','paused','retired'
  )),
  initial_reliability numeric(4,3) not null default 0.500 check (initial_reliability between 0 and 0.750),
  allowed_observation_fields text[] not null,
  blocked_mutation_fields text[] not null,
  check_interval_minutes integer not null default 1440 check (check_interval_minutes between 15 and 43200),
  requests_per_minute integer not null default 1 check (requests_per_minute between 1 and 30),
  requests_per_day integer not null default 4 check (requests_per_day between 1 and 100),
  parser_config jsonb not null default '{}'::jsonb,
  parser_version text not null default 'generic-pipeline-v1',
  audit_metadata jsonb not null default '{}'::jsonb,
  activation_reason text not null,
  rollout_phase text not null default 'observation' check (rollout_phase = 'observation'),
  consecutive_observation_failures integer not null default 0,
  last_observation_at timestamptz,
  next_observation_at timestamptz,
  paused_reason text,
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_four_pilot_source_url_check check (source_url ~* '^https://[^[:space:]]+$'),
  constraint stage_four_pilot_source_domain_check check (domain = lower(domain) and domain !~ '[/[:space:]]'),
  constraint stage_four_pilot_source_binding_check check (pilot_status <> 'pilot_observation' or event_source_id is not null)
);

create index if not exists stage_four_pilot_sources_queue_idx
  on public.stage_four_pilot_sources(pilot_status, next_observation_at, source_type)
  where pilot_status in ('pilot_observation','paused');
create index if not exists stage_four_pilot_sources_domain_idx
  on public.stage_four_pilot_sources(domain, source_type);

create table if not exists public.stage_four_observation_runs (
  id uuid primary key default gen_random_uuid(),
  pilot_source_id uuid not null references public.stage_four_pilot_sources(id) on delete cascade,
  source_id uuid not null references public.event_sources(id) on delete cascade,
  event_id bigint not null references public.events(id) on delete cascade,
  crawl_job_id uuid references public.source_crawl_jobs(id) on delete set null,
  crawl_result_id bigint references public.source_crawl_results(id) on delete set null,
  run_status text not null default 'queued' check (run_status in (
    'queued','running','completed','partial','failed','paused','cancelled'
  )),
  trigger_source text not null default 'admin' check (trigger_source in ('scheduler','admin','retry','recovery','test')),
  idempotency_key text not null unique,
  request_fingerprint text,
  content_hash text,
  started_at timestamptz,
  finished_at timestamptz,
  observation_count integer not null default 0,
  proposal_count integer not null default 0,
  error_count integer not null default 0,
  parser_version text not null,
  policy_version text not null,
  dry_run boolean not null default true check (dry_run),
  resume_token uuid not null default gen_random_uuid(),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stage_four_observation_runs_recent_idx
  on public.stage_four_observation_runs(created_at desc, run_status, pilot_source_id);
create unique index if not exists stage_four_observation_runs_result_uidx
  on public.stage_four_observation_runs(crawl_result_id)
  where crawl_result_id is not null;
create unique index if not exists stage_four_observation_runs_job_uidx
  on public.stage_four_observation_runs(crawl_job_id)
  where crawl_job_id is not null;

create table if not exists public.stage_four_observations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.stage_four_observation_runs(id) on delete cascade,
  pilot_source_id uuid not null references public.stage_four_pilot_sources(id) on delete cascade,
  source_id uuid not null references public.event_sources(id) on delete cascade,
  event_id bigint not null references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete set null,
  crawl_result_id bigint references public.source_crawl_results(id) on delete set null,
  proposal_id uuid references public.event_change_proposals(id) on delete set null,
  decision_id uuid references public.automation_decisions(id) on delete set null,
  observed_at timestamptz not null default now(),
  http_status smallint check (http_status is null or http_status between 100 and 599),
  technically_reachable boolean not null,
  request_fingerprint text,
  content_hash text,
  change_status text not null check (change_status in ('unchanged','changed','first_seen','unreachable','content_invalid')),
  field_name text not null,
  previous_value jsonb,
  observed_value jsonb,
  normalized_value jsonb,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  source_reliability numeric(6,5) not null default 0.50000 check (source_reliability between 0 and 1),
  policy_code text not null,
  policy_result text not null check (policy_result in ('auto_apply','review','block')),
  decision_mode text not null default 'shadow' check (decision_mode = 'shadow'),
  would_execute boolean not null default false,
  actually_executed boolean not null default false check (not actually_executed),
  prerequisites_met text[] not null default '{}',
  prerequisites_unmet text[] not null default '{}',
  conflicts jsonb not null default '[]'::jsonb,
  duplicate_match_level text not null default 'no_match' check (duplicate_match_level in (
    'no_match','possible_match','probable_match','confirmed_duplicate'
  )),
  parsing_warnings text[] not null default '{}',
  country_code char(2) not null default 'DE' check (country_code = 'DE'),
  country_valid boolean not null default true,
  proposed_action text not null,
  blocked_reason text,
  dry_run boolean not null default true check (dry_run),
  parser_version text not null,
  policy_version text not null,
  review_status text not null default 'pending' check (review_status in ('pending','reviewed','needs_manual_review','excluded')),
  observation_fingerprint text not null unique,
  raw_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stage_four_observations_review_idx
  on public.stage_four_observations(review_status, observed_at desc, pilot_source_id);
create index if not exists stage_four_observations_evaluation_idx
  on public.stage_four_observations(country_code, field_name, policy_code, parser_version, observed_at desc);
create index if not exists stage_four_observations_blocked_idx
  on public.stage_four_observations(blocked_reason, observed_at desc)
  where blocked_reason is not null;

create table if not exists public.stage_four_observation_reviews (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null unique references public.stage_four_observations(id) on delete cascade,
  review_result text not null check (review_result in (
    'correct','partially_correct','incorrect','outdated','duplicate',
    'source_unsuitable','unclear','manual_review_required'
  )),
  reviewed_fields text[] not null default '{}',
  correct_value jsonb,
  error_category text,
  rationale text not null,
  policy_decision_correct boolean,
  confidence_appropriate boolean,
  reliability_adjustment_recommended boolean not null default false,
  parser_problem boolean not null default false,
  pause_source_recommended boolean not null default false,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_four_observation_review_reason_check check (length(btrim(rationale)) between 3 and 4000)
);

create index if not exists stage_four_observation_reviews_result_idx
  on public.stage_four_observation_reviews(review_result, reviewed_at desc);

create table if not exists public.stage_four_golden_cases (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null unique references public.stage_four_observations(id) on delete restrict,
  review_id uuid not null unique references public.stage_four_observation_reviews(id) on delete restrict,
  case_type text not null check (case_type in (
    'unchanged_event','registration_opened','registration_closed','sold_out','waitlist',
    'url_changed','unreachable_page','temporary_server_error','date_changed','location_changed',
    'cancelled','postponed','new_edition','duplicate','similar_event_name','sponsor_name_changed',
    'misleading_content','outdated_website','different_registration_platform','multiple_events_same_domain'
  )),
  expected_values jsonb not null default '{}'::jsonb,
  expected_policy_result text check (expected_policy_result is null or expected_policy_result in ('auto_apply','review','block')),
  source_snapshot_hash text,
  fixture_path text,
  parser_version text not null,
  policy_version text not null,
  regression_status text not null default 'not_run' check (regression_status in ('not_run','passed','failed','needs_update')),
  approved boolean not null default true,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_regression_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists stage_four_golden_cases_regression_idx
  on public.stage_four_golden_cases(case_type, regression_status, parser_version, policy_version);

create table if not exists public.stage_four_readiness_criteria (
  id uuid primary key default gen_random_uuid(),
  criterion_code text not null unique,
  dimension_type text not null check (dimension_type in ('field','source','source_type','policy','country','action')),
  dimension_key text not null,
  minimum_reviewed integer not null check (minimum_reviewed between 1 and 10000),
  minimum_confirmed_changes integer not null default 0 check (minimum_confirmed_changes between 0 and 10000),
  minimum_precision numeric(5,4) not null check (minimum_precision between 0 and 1),
  maximum_false_positive_rate numeric(5,4) not null check (maximum_false_positive_rate between 0 and 1),
  require_official_source boolean not null default false,
  require_audit_logging boolean not null default true,
  require_idempotency boolean not null default true,
  require_kill_switches boolean not null default true,
  require_no_critical_rls_issues boolean not null default true,
  forbidden_actions text[] not null default array[
    'cancel_event','postpone_event','change_start_date','change_location','change_domain',
    'create_edition','delete_event','merge_duplicate'
  ],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.stage_four_readiness_criteria (
  criterion_code,dimension_type,dimension_key,minimum_reviewed,minimum_confirmed_changes,
  minimum_precision,maximum_false_positive_rate,require_official_source
) values
  ('phase_b_technical_internal','action','technical_internal',150,0,0.9850,0.0150,false),
  ('phase_b_registration_status','field','registration_status',75,75,0.9900,0.0100,true),
  ('phase_b_germany','country','DE',200,0,0.9850,0.0150,false)
on conflict (criterion_code) do nothing;

create table if not exists public.stage_four_readiness_snapshots (
  id bigint generated always as identity primary key,
  criterion_id uuid not null references public.stage_four_readiness_criteria(id) on delete cascade,
  dimension_type text not null,
  dimension_key text not null,
  reviewed_count integer not null,
  confirmed_change_count integer not null,
  precision numeric(6,5),
  false_positive_rate numeric(6,5),
  sample_sufficient boolean not null,
  theoretically_ready boolean not null default false,
  blockers text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);

create index if not exists stage_four_readiness_snapshots_latest_idx
  on public.stage_four_readiness_snapshots(criterion_id, calculated_at desc);

insert into public.stage_four_pilot_sources (
  id,source_key,source_name,source_type,domain,source_url,pilot_status,initial_reliability,
  allowed_observation_fields,blocked_mutation_fields,check_interval_minutes,requests_per_minute,
  requests_per_day,parser_config,parser_version,audit_metadata,activation_reason
) values
  ('41000000-0000-4000-8000-000000000001','berlin-marathon','BMW BERLIN-MARATHON','official_event_website','bmw-berlin-marathon.com','https://www.bmw-berlin-marathon.com/','candidate',0.500,
   array['start_date','end_date','event_status','registration_status','registration_url','start_time','price','participant_limit'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],1440,1,4,
   '{"method":"json_ld_then_generic_html","requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official event website"}'::jsonb,'Large official German event with structured and editorial content.'),
  ('41000000-0000-4000-8000-000000000002','hamburg-marathon','Haspa Marathon Hamburg','official_event_website','haspa-marathon-hamburg.de','https://haspa-marathon-hamburg.de/','candidate',0.500,
   array['start_date','end_date','event_status','registration_status','registration_url','start_time','price','participant_limit'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],1440,1,4,
   '{"method":"json_ld_then_generic_html","requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official event website; present in repository catalog"}'::jsonb,'Official source with registration status changes such as sold-out signals.'),
  ('41000000-0000-4000-8000-000000000003','frankfurt-marathon','Mainova Frankfurt Marathon','official_event_website','frankfurt-marathon.com','https://www.frankfurt-marathon.com/','candidate',0.500,
   array['start_date','event_status','registration_status','registration_url','start_time','price','participant_limit'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],1440,1,4,
   '{"method":"json_ld_then_generic_html","requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official event website; present in repository catalog"}'::jsonb,'Official major-event source for stable German observation coverage.'),
  ('41000000-0000-4000-8000-000000000004','hannover-marathon','ADAC Marathon Hannover','official_event_website','marathon-hannover.de','https://www.marathon-hannover.de/','candidate',0.500,
   array['start_date','event_status','registration_status','registration_url','start_time','price'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],1440,1,4,
   '{"method":"json_ld_then_generic_html","requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official event website; present in repository catalog"}'::jsonb,'Official marathon source with recurring editions.'),
  ('41000000-0000-4000-8000-000000000005','koeln-marathon','Generali Köln Marathon','official_event_website','generali-koeln-marathon.de','https://generali-koeln-marathon.de/','candidate',0.500,
   array['start_date','event_status','registration_status','registration_url','start_time','price','participant_limit'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],1440,1,4,
   '{"method":"json_ld_then_generic_html","requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official event website"}'::jsonb,'Official major-event source with multiple race formats.'),
  ('41000000-0000-4000-8000-000000000006','muenchen-marathon','Marathon München by Brooks','official_event_website','marathonmuenchen.org','https://marathonmuenchen.org/','candidate',0.500,
   array['start_date','event_status','registration_status','registration_url','start_time','price','participant_limit'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],1440,1,4,
   '{"method":"json_ld_then_generic_html","requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official event website; present in repository catalog"}'::jsonb,'Official event source useful for sponsor-name normalization.'),
  ('41000000-0000-4000-8000-000000000007','rennsteiglauf','GutsMuths-Rennsteiglauf','official_event_website','rennsteiglauf.de','https://www.rennsteiglauf.de/','candidate',0.500,
   array['start_date','event_status','registration_status','registration_url','distances','start_time'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],2880,1,3,
   '{"method":"json_ld_then_generic_html","multiple_years_expected":true,"requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official trail and ultra event website"}'::jsonb,'Official trail and ultra source with several future editions on one page.'),
  ('41000000-0000-4000-8000-000000000008','challenge-roth','DATEV Challenge Roth','official_event_website','challenge-roth.com','https://www.challenge-roth.com/','candidate',0.500,
   array['start_date','event_status','registration_status','registration_url','start_time','price','participant_limit'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],1440,1,4,
   '{"method":"json_ld_then_generic_html","requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official German triathlon website"}'::jsonb,'Official long-distance triathlon source.'),
  ('41000000-0000-4000-8000-000000000009','b2run-series','B2Run Deutschland','race_series','b2run.de','https://www.b2run.de/run/de/de/index.html','candidate',0.500,
   array['start_date','city','registration_status','registration_url','event_status'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],720,1,6,
   '{"method":"generic_html","multiple_events_expected":true,"requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official German race series; present in repository catalog"}'::jsonb,'Official multi-event race series for multi-event-page evaluation.'),
  ('41000000-0000-4000-8000-000000000010','dtu-calendar','Deutsche Triathlon Union Wettkampfkalender','federation_calendar','triathlondeutschland.de','https://www.triathlondeutschland.de/termine/veranstaltungskalender','candidate',0.500,
   array['start_date','city','region','event_status','registration_url','distances'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],720,1,6,
   '{"method":"generic_html","multiple_events_expected":true,"discovery_only":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"official federation calendar"}'::jsonb,'Official federation calendar for controlled triathlon discovery observations.'),
  ('41000000-0000-4000-8000-000000000011','race-result-platform','RACE RESULT Event Platform','timing_platform','my.raceresult.com','https://my.raceresult.com/','candidate',0.500,
   array['registration_status','registration_url','event_status','start_date'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],2880,1,3,
   '{"method":"generic_html","platform_requires_event_url":true,"requires_event_binding":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"established timing platform"}'::jsonb,'Timing-platform profile; bind only to a verified event-specific URL.'),
  ('41000000-0000-4000-8000-000000000012','datasport-germany','Datasport Germany Event Calendar','structured_event_list','static.abavent.de','https://static.abavent.de/events/','candidate',0.500,
   array['start_date','city','registration_status','registration_url','event_status','distances'],
   array['start_date','end_date','event_status','city','country','venue','official_url','edition_year'],1440,1,4,
   '{"method":"generic_html","multiple_events_expected":true,"discovery_only":true}'::jsonb,'generic-pipeline-v1','{"verified_on":"2026-08-04","selection":"German timing and event calendar"}'::jsonb,'Structured event calendar for controlled list extraction evaluation.')
on conflict (source_key) do update set
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  domain = excluded.domain,
  source_url = excluded.source_url,
  allowed_observation_fields = excluded.allowed_observation_fields,
  blocked_mutation_fields = excluded.blocked_mutation_fields,
  parser_config = excluded.parser_config,
  audit_metadata = excluded.audit_metadata,
  activation_reason = excluded.activation_reason,
  updated_at = now();

create or replace function private.stage_four_country_code(p_country text)
returns text language sql immutable security invoker set search_path=pg_catalog
as $$
  select case lower(btrim(coalesce(p_country,'')))
    when 'de' then 'DE' when 'deutschland' then 'DE' when 'germany' then 'DE'
    when 'at' then 'AT' when 'österreich' then 'AT' when 'oesterreich' then 'AT' when 'austria' then 'AT'
    when 'ch' then 'CH' when 'schweiz' then 'CH' when 'suisse' then 'CH' when 'svizzera' then 'CH' when 'switzerland' then 'CH'
  end
$$;

create or replace function private.stage_four_observation_block_reason(
  p_pilot_source_id uuid,
  p_field_name text default null,
  p_policy_code text default null,
  p_action_code text default null,
  p_parser_version text default null
) returns text
language plpgsql stable security definer set search_path=pg_catalog,public,private
as $$
declare settings public.stage_four_settings; pilot public.stage_four_pilot_sources; source public.event_sources;
  country public.country_rollouts; control public.automation_scope_controls; used_today integer;
  recent_error_rate numeric; recent_conflict_rate numeric; daily_volume integer;
begin
  select * into settings from public.stage_four_settings where singleton;
  select * into pilot from public.stage_four_pilot_sources where id=p_pilot_source_id;
  if settings.singleton is null or not settings.dry_run or settings.automation_enabled then return 'phase_a_safety_configuration_invalid'; end if;
  if settings.global_emergency_stop then return 'global_emergency_stop'; end if;
  if not settings.observation_enabled then return 'global_observation_stop'; end if;
  if pilot.id is null then return 'pilot_source_unknown'; end if;
  if pilot.country_code <> 'DE' then return 'country_not_germany'; end if;
  if pilot.pilot_status <> 'pilot_observation' then return 'pilot_source_not_active'; end if;
  if pilot.event_source_id is null then return 'pilot_source_not_bound'; end if;
  select * into source from public.event_sources where id=pilot.event_source_id;
  if source.id is null or not source.is_active then return 'event_source_inactive'; end if;
  if regexp_replace(coalesce(source.source_host,''),'^www\.','') is distinct from regexp_replace(pilot.domain,'^www\.','') then return 'source_domain_mismatch'; end if;
  if private.stage_four_country_code((select e.country from public.events e where e.id=source.event_id)) <> 'DE' then return 'event_country_not_germany'; end if;
  select * into country from public.country_rollouts where country_code='DE';
  if country.rollout_status <> 'observation' or country.automation_enabled or country.geocoding_enabled then return 'country_rollout_not_observation_safe'; end if;
  select * into control from public.automation_scope_controls c
  where (c.expires_at is null or c.expires_at>now()) and (c.is_paused or c.emergency_stop) and (
    (c.scope_type='country' and c.scope_key='DE') or
    (c.scope_type='domain' and c.scope_key=pilot.domain) or
    (c.scope_type='source' and c.scope_key in (pilot.id::text,pilot.event_source_id::text)) or
    (c.scope_type='source_type' and c.scope_key=pilot.source_type) or
    (c.scope_type='field' and c.scope_key=coalesce(p_field_name,'')) or
    (c.scope_type='policy' and c.scope_key=coalesce(p_policy_code,'')) or
    (c.scope_type='action' and c.scope_key=coalesce(p_action_code,'')) or
    (c.scope_type='parser_version' and c.scope_key=coalesce(p_parser_version,''))
  ) order by c.emergency_stop desc,c.updated_at desc limit 1;
  if control.id is not null then return 'scope_'||control.scope_type||case when control.emergency_stop then '_emergency_stop' else '_paused' end; end if;
  select avg(case when o.technically_reachable then 0 else 1 end),
    avg(case when jsonb_array_length(o.conflicts)>0 then 1 else 0 end)
  into recent_error_rate,recent_conflict_rate
  from (select * from public.stage_four_observations where pilot_source_id=pilot.id order by observed_at desc limit 50) o;
  select count(*) into daily_volume from public.stage_four_observations where pilot_source_id=pilot.id and observed_at>=current_date;
  for control in select * from public.automation_scope_controls c
    where (c.expires_at is null or c.expires_at>now()) and (
      (c.scope_type='country' and c.scope_key='DE') or (c.scope_type='domain' and c.scope_key=pilot.domain) or
      (c.scope_type='source' and c.scope_key in (pilot.id::text,pilot.event_source_id::text)) or
      (c.scope_type='source_type' and c.scope_key=pilot.source_type) or
      (c.scope_type='field' and c.scope_key=coalesce(p_field_name,'')) or
      (c.scope_type='policy' and c.scope_key=coalesce(p_policy_code,'')) or
      (c.scope_type='action' and c.scope_key=coalesce(p_action_code,'')) or
      (c.scope_type='parser_version' and c.scope_key=coalesce(p_parser_version,''))
    )
  loop
    if control.maximum_error_rate is not null and coalesce(recent_error_rate,0)>control.maximum_error_rate then return 'scope_'||control.scope_type||'_error_rate_pause'; end if;
    if control.maximum_conflict_rate is not null and coalesce(recent_conflict_rate,0)>control.maximum_conflict_rate then return 'scope_'||control.scope_type||'_conflict_rate_pause'; end if;
    if control.maximum_daily_volume is not null and daily_volume>=control.maximum_daily_volume then return 'scope_'||control.scope_type||'_volume_pause'; end if;
  end loop;
  select count(*) into used_today from public.stage_four_observation_runs r
  where r.pilot_source_id=pilot.id and r.created_at>=current_date;
  if used_today > pilot.requests_per_day then return 'source_daily_rate_limit'; end if;
  if pilot.consecutive_observation_failures>=5 then return 'source_error_rate_pause'; end if;
  return null;
end $$;

revoke all on function private.stage_four_observation_block_reason(uuid,text,text,text,text) from public,anon,authenticated;

create or replace function public.set_stage_four_observation_state(p_enabled boolean,p_scheduler_enabled boolean,p_reason text)
returns public.stage_four_settings language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare result public.stage_four_settings;
begin
  if not (select private.is_admin()) then raise exception 'admin required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'detailed reason required' using errcode='22023'; end if;
  update public.stage_four_settings set observation_enabled=p_enabled,
    observation_scheduler_enabled=case when p_enabled then p_scheduler_enabled else false end,
    dry_run=true,automation_enabled=false,changed_by=(select auth.uid()),change_reason=p_reason,updated_at=now()
  where singleton returning * into result;
  insert into public.stage_four_audit_log(action_code,entity_type,entity_id,actor_id,actor_process,dry_run,outcome,reasons)
  values('set_observation_state','stage_four_settings','global',(select auth.uid()),current_user,true,
    case when p_enabled then 'observation_enabled' else 'observation_disabled' end,jsonb_build_array(p_reason));
  return result;
end $$;

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
  if source.source_host<>pilot.domain then raise exception 'source domain does not match pilot profile' using errcode='23514'; end if;
  if private.stage_four_country_code((select country from public.events where id=source.event_id))<>'DE' then
    raise exception 'only German event sources may be bound' using errcode='23514';
  end if;
  update public.stage_four_pilot_sources set event_source_id=source.id,pilot_status='ready_for_binding',
    audit_metadata=audit_metadata||jsonb_build_object('binding_reason',p_reason,'bound_at',now(),'bound_by',(select auth.uid())),updated_at=now()
  where id=pilot.id returning * into result;
  return result;
end $$;

create or replace function public.set_stage_four_pilot_source_status(p_pilot_source_id uuid,p_status text,p_reason text)
returns public.stage_four_pilot_sources language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare result public.stage_four_pilot_sources;
begin
  if not (select private.is_admin()) then raise exception 'admin required' using errcode='42501'; end if;
  if p_status not in ('ready_for_binding','pilot_observation','paused','retired') then raise exception 'unsupported pilot status' using errcode='22023'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'reason required' using errcode='22023'; end if;
  update public.stage_four_pilot_sources set pilot_status=p_status,
    paused_reason=case when p_status='paused' then p_reason else null end,
    activated_at=case when p_status='pilot_observation' then now() else activated_at end,
    activated_by=case when p_status='pilot_observation' then (select auth.uid()) else activated_by end,
    next_observation_at=case when p_status='pilot_observation' then now() else next_observation_at end,
    audit_metadata=audit_metadata||jsonb_build_object('last_status_reason',p_reason,'last_status_at',now()),updated_at=now()
  where id=p_pilot_source_id and (p_status<>'pilot_observation' or event_source_id is not null)
  returning * into result;
  if result.id is null then raise exception 'pilot source not found or not bound' using errcode='P0002'; end if;
  return result;
end $$;

create or replace function public.enqueue_stage_four_observation_runs(p_limit integer default 10,p_trigger_source text default 'scheduler')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare settings public.stage_four_settings; pilot public.stage_four_pilot_sources; job public.source_crawl_jobs;
  run public.stage_four_observation_runs; queued integer:=0; skipped integer:=0; failed integer:=0; block_reason text; key text;
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
      on conflict(idempotency_key) do update set updated_at=now()
      returning * into run;
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

create or replace function public.stop_stage_four_observation_run(p_run_id uuid,p_reason text,p_pause_source boolean default true)
returns public.stage_four_observation_runs language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare result public.stage_four_observation_runs;
begin
  if not (select private.is_admin()) then raise exception 'admin required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'stop reason required' using errcode='22023'; end if;
  update public.stage_four_observation_runs set run_status='cancelled',finished_at=now(),error_message=p_reason,updated_at=now()
  where id=p_run_id and run_status in ('queued','running','partial','failed') returning * into result;
  if result.id is null then raise exception 'stoppable observation run not found' using errcode='P0002'; end if;
  update public.source_crawl_jobs set status='failed',completed_at=now(),error_type='observation_cancelled',error_message=p_reason,updated_at=now()
  where id=result.crawl_job_id and status in ('queued','retry_scheduled');
  if p_pause_source then update public.stage_four_pilot_sources set pilot_status='paused',paused_reason=p_reason,updated_at=now() where id=result.pilot_source_id; end if;
  insert into public.stage_four_audit_log(action_code,entity_type,entity_id,actor_id,actor_process,dry_run,outcome,reasons)
  values('stop_observation_run','observation_run',result.id::text,(select auth.uid()),current_user,true,'cancelled',jsonb_build_array(p_reason));
  return result;
end $$;

create or replace function public.resume_stage_four_observation_run(p_run_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare previous public.stage_four_observation_runs; pilot public.stage_four_pilot_sources; queued jsonb;
begin
  if not (select private.is_admin()) then raise exception 'admin required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'resume reason required' using errcode='22023'; end if;
  select * into previous from public.stage_four_observation_runs where id=p_run_id and run_status in ('failed','partial','cancelled','paused');
  if previous.id is null then raise exception 'resumable observation run not found' using errcode='P0002'; end if;
  update public.stage_four_pilot_sources set pilot_status='pilot_observation',paused_reason=null,next_observation_at=now(),
    audit_metadata=audit_metadata||jsonb_build_object('resume_reason',p_reason,'resumed_at',now()),updated_at=now()
  where id=previous.pilot_source_id returning * into pilot;
  queued:=public.enqueue_stage_four_observation_runs(1,'recovery');
  return queued||jsonb_build_object('resumed_from_run_id',previous.id,'dry_run',true,'public_event_changes',0);
end $$;

create or replace function public.record_stage_four_shadow_observations(p_crawl_result_id bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare crawl public.source_crawl_results; pilot public.stage_four_pilot_sources; settings public.stage_four_settings;
  run public.stage_four_observation_runs; proposal record; decision public.automation_decisions; metric public.source_reliability_metrics;
  inserted integer:=0; block_reason text; fingerprint text; event_country text; confidence_value numeric;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into crawl from public.source_crawl_results where id=p_crawl_result_id;
  if crawl.id is null then raise exception 'crawl result not found' using errcode='P0002'; end if;
  select * into pilot from public.stage_four_pilot_sources where event_source_id=crawl.source_id;
  if pilot.id is null then return jsonb_build_object('recorded',0,'skipped','not_a_pilot_source','dry_run',true); end if;
  select * into settings from public.stage_four_settings where singleton;
  block_reason:=private.stage_four_observation_block_reason(pilot.id,null,null,'record_observation',pilot.parser_version);
  if block_reason is not null then
    insert into public.stage_four_audit_log(action_code,entity_type,entity_id,actor_process,dry_run,outcome,reasons)
    values('record_shadow_observation','source_crawl_result',crawl.id::text,current_user,true,'blocked',jsonb_build_array(block_reason));
    return jsonb_build_object('recorded',0,'blocked_reason',block_reason,'dry_run',true,'public_event_changes',0);
  end if;
  event_country:=private.stage_four_country_code((select country from public.events where id=crawl.event_id));
  insert into public.stage_four_observation_runs(
    pilot_source_id,source_id,event_id,crawl_job_id,crawl_result_id,run_status,trigger_source,idempotency_key,
    request_fingerprint,content_hash,started_at,finished_at,parser_version,policy_version,dry_run
  ) values (
    pilot.id,crawl.source_id,crawl.event_id,crawl.job_id,crawl.id,'completed','recovery','crawl:'||crawl.crawl_id::text,
    md5(crawl.source_id::text||':'||coalesce(crawl.etag,'')||':'||coalesce(crawl.last_modified,'')||':'||coalesce(crawl.content_hash,'')),
    crawl.content_hash,crawl.fetched_at,now(),pilot.parser_version,settings.observation_policy_version,true
  ) on conflict(crawl_job_id) where crawl_job_id is not null do update set crawl_result_id=excluded.crawl_result_id,
    request_fingerprint=excluded.request_fingerprint,content_hash=excluded.content_hash,started_at=coalesce(public.stage_four_observation_runs.started_at,excluded.started_at),
    finished_at=now(),run_status='completed',updated_at=now()
  returning * into run;

  for proposal in select p.* from public.event_change_proposals p where p.crawl_id=crawl.id
  loop
    select * into decision from public.automation_decisions d where d.proposal_id=proposal.id order by d.evaluated_at desc limit 1;
    select * into metric from public.source_reliability_metrics m
      where m.source_id=crawl.source_id and m.field_name=proposal.field_name order by m.calculated_at desc limit 1;
    block_reason:=private.stage_four_observation_block_reason(pilot.id,proposal.field_name,decision.policy_code,
      coalesce(decision.action_code,proposal.change_type),coalesce(proposal.extractor_version,pilot.parser_version));
    if not (proposal.field_name=any(pilot.allowed_observation_fields)) then
      block_reason:='field_not_allowed_for_pilot';
    elsif proposal.locked_field or exists(select 1 from public.event_field_controls c where c.event_id=proposal.event_id and c.field_name=proposal.field_name and c.is_locked and (c.lock_expires_at is null or c.lock_expires_at>now())) then
      block_reason:='field_locked_or_manual_override';
    elsif proposal.change_type in ('possible_cancellation','possible_postponement','location_change','source_change','new_edition','removed_value')
       or proposal.field_name in ('start_date','end_date','city','region','country','address','latitude','longitude','official_url','edition_year') then
      block_reason:=coalesce(block_reason,'high_risk_review_only');
    end if;
    fingerprint:=md5(run.id::text||':'||proposal.id::text||':'||coalesce(proposal.field_name,'')||':'||coalesce(proposal.normalized_value::text,'null')||':'||coalesce(crawl.content_hash,''));
    insert into public.stage_four_observations(
      run_id,pilot_source_id,source_id,event_id,edition_id,crawl_result_id,proposal_id,decision_id,observed_at,
      http_status,technically_reachable,request_fingerprint,content_hash,change_status,field_name,previous_value,
      observed_value,normalized_value,confidence,source_reliability,policy_code,policy_result,would_execute,
      prerequisites_met,prerequisites_unmet,conflicts,parsing_warnings,country_code,country_valid,proposed_action,
      blocked_reason,parser_version,policy_version,review_status,observation_fingerprint,raw_evidence
    ) values (
      run.id,pilot.id,crawl.source_id,proposal.event_id,proposal.edition_id,crawl.id,proposal.id,decision.id,coalesce(proposal.detected_at,crawl.fetched_at),
      crawl.http_status,crawl.http_status in (200,304),run.request_fingerprint,crawl.content_hash,crawl.change_status,proposal.field_name,
      proposal.old_value,proposal.proposed_value,proposal.normalized_value,proposal.confidence,coalesce(metric.source_reliability_score,pilot.initial_reliability),
      coalesce(decision.policy_code,'default_review'),coalesce(decision.recommended_decision,'review'),
      coalesce(decision.recommended_decision='auto_apply',false) and block_reason is null,
      coalesce(decision.prerequisites_met,'{}'),coalesce(decision.prerequisites_unmet,'{}')||case when not settings.automation_enabled then array['automation_disabled'] else '{}' end||case when settings.dry_run then array['dry_run'] else '{}' end,
      to_jsonb(coalesce(proposal.validation_warnings,'{}'::text[])),proposal.validation_warnings,'DE',event_country='DE',
      coalesce(decision.action_code,proposal.change_type,'review'),block_reason,coalesce(proposal.extractor_version,pilot.parser_version),
      coalesce(decision.evaluated_policy_version,settings.observation_policy_version),'pending',fingerprint,
      coalesce(proposal.evidence,'{}'::jsonb)||jsonb_build_object('decision_reasons',coalesce(decision.decision_reasons,'[]'::jsonb),'source_context',proposal.source_context)
    ) on conflict(observation_fingerprint) do nothing;
    if found then inserted:=inserted+1; end if;
  end loop;

  if not exists(select 1 from public.stage_four_observations o where o.run_id=run.id) then
    confidence_value:=case crawl.change_confidence when 'exact' then 1.0 when 'high' then 0.9 when 'medium' then 0.7 when 'low' then 0.4 when 'baseline' then 0.6 else 0.5 end;
    fingerprint:=md5(run.id::text||':source:'||coalesce(crawl.content_hash,crawl.error_type,'none'));
    insert into public.stage_four_observations(
      run_id,pilot_source_id,source_id,event_id,crawl_result_id,observed_at,http_status,technically_reachable,
      request_fingerprint,content_hash,change_status,field_name,observed_value,normalized_value,confidence,
      source_reliability,policy_code,policy_result,would_execute,prerequisites_met,prerequisites_unmet,parsing_warnings,
      country_code,country_valid,proposed_action,blocked_reason,parser_version,policy_version,review_status,
      observation_fingerprint,raw_evidence
    ) values (
      run.id,pilot.id,crawl.source_id,crawl.event_id,crawl.id,crawl.fetched_at,crawl.http_status,crawl.http_status in (200,304),
      run.request_fingerprint,crawl.content_hash,crawl.change_status,'__source__',
      jsonb_build_object('http_status',crawl.http_status,'change_status',crawl.change_status,'error_type',crawl.error_type),
      jsonb_build_object('content_hash',crawl.content_hash,'semantic_hash',crawl.semantic_hash),confidence_value,pilot.initial_reliability,
      'safe_technical_actions',case when crawl.change_status='unchanged' then 'auto_apply' else 'review' end,
      crawl.change_status='unchanged',array['content_hash_recorded','audit_logging','idempotency_key'],array['automation_disabled','dry_run'],
      case when crawl.error_type is null then '{}'::text[] else array[crawl.error_type] end,'DE',event_country='DE','technical_observation',
      case when crawl.change_status in ('unreachable','content_invalid') then crawl.error_type end,pilot.parser_version,settings.observation_policy_version,
      'pending',fingerprint,jsonb_build_object('change_reasons',crawl.change_reasons,'worker_version',crawl.worker_version)
    ) on conflict(observation_fingerprint) do nothing;
    if found then inserted:=inserted+1; end if;
  end if;
  update public.stage_four_observation_runs set observation_count=(select count(*) from public.stage_four_observations where run_id=run.id),
    proposal_count=(select count(*) from public.stage_four_observations where run_id=run.id and proposal_id is not null),updated_at=now() where id=run.id;
  update public.stage_four_pilot_sources set last_observation_at=now(),consecutive_observation_failures=case when crawl.processing_status='completed' then 0 else consecutive_observation_failures+1 end,updated_at=now() where id=pilot.id;
  insert into public.stage_four_audit_log(action_code,entity_type,entity_id,actor_process,dry_run,outcome,reasons)
  values('record_shadow_observation','observation_run',run.id::text,current_user,true,'recorded',jsonb_build_array('phase_a_shadow','public_event_changes_0'));
  return jsonb_build_object('run_id',run.id,'recorded',inserted,'idempotent',inserted=0,'dry_run',true,'public_event_changes',0);
end $$;

create or replace function public.review_stage_four_observation(
  p_observation_id uuid,p_review_result text,p_reviewed_fields text[],p_correct_value jsonb,
  p_error_category text,p_rationale text,p_policy_correct boolean,p_confidence_appropriate boolean,
  p_adjust_reliability boolean default false,p_parser_problem boolean default false,p_pause_source boolean default false
) returns public.stage_four_observation_reviews
language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare observation public.stage_four_observations; result public.stage_four_observation_reviews;
begin
  if not (select private.is_admin()) then raise exception 'admin required' using errcode='42501'; end if;
  if p_review_result not in ('correct','partially_correct','incorrect','outdated','duplicate','source_unsuitable','unclear','manual_review_required') then
    raise exception 'invalid review result' using errcode='22023'; end if;
  select * into observation from public.stage_four_observations where id=p_observation_id for update;
  if observation.id is null then raise exception 'observation not found' using errcode='P0002'; end if;
  insert into public.stage_four_observation_reviews(
    observation_id,review_result,reviewed_fields,correct_value,error_category,rationale,policy_decision_correct,
    confidence_appropriate,reliability_adjustment_recommended,parser_problem,pause_source_recommended,reviewed_by
  ) values (
    observation.id,p_review_result,coalesce(p_reviewed_fields,array[observation.field_name]),p_correct_value,p_error_category,p_rationale,
    p_policy_correct,p_confidence_appropriate,p_adjust_reliability,p_parser_problem,p_pause_source,(select auth.uid())
  ) on conflict(observation_id) do update set review_result=excluded.review_result,reviewed_fields=excluded.reviewed_fields,
    correct_value=excluded.correct_value,error_category=excluded.error_category,rationale=excluded.rationale,
    policy_decision_correct=excluded.policy_decision_correct,confidence_appropriate=excluded.confidence_appropriate,
    reliability_adjustment_recommended=excluded.reliability_adjustment_recommended,parser_problem=excluded.parser_problem,
    pause_source_recommended=excluded.pause_source_recommended,reviewed_by=excluded.reviewed_by,reviewed_at=now(),updated_at=now()
  returning * into result;
  update public.stage_four_observations set review_status='reviewed',updated_at=now() where id=observation.id;
  if p_pause_source then update public.stage_four_pilot_sources set pilot_status='paused',paused_reason='Manual review recommended source pause',updated_at=now() where id=observation.pilot_source_id; end if;
  insert into public.stage_four_audit_log(action_code,entity_type,entity_id,actor_id,actor_process,dry_run,outcome,reasons)
  values('review_shadow_observation','stage_four_observation',observation.id::text,(select auth.uid()),current_user,true,p_review_result,
    jsonb_build_array(coalesce(p_error_category,'manual_review')));
  return result;
end $$;

create or replace function public.promote_stage_four_golden_case(p_observation_id uuid,p_case_type text,p_expected_values jsonb,p_expected_policy_result text,p_notes text default null)
returns public.stage_four_golden_cases language plpgsql security invoker set search_path=pg_catalog,public,private
as $$
declare observation public.stage_four_observations; review public.stage_four_observation_reviews; result public.stage_four_golden_cases;
begin
  if not (select private.is_admin()) then raise exception 'admin required' using errcode='42501'; end if;
  select * into observation from public.stage_four_observations where id=p_observation_id;
  select * into review from public.stage_four_observation_reviews where observation_id=p_observation_id;
  if observation.id is null or review.id is null then raise exception 'reviewed observation required' using errcode='23514'; end if;
  insert into public.stage_four_golden_cases(observation_id,review_id,case_type,expected_values,expected_policy_result,source_snapshot_hash,parser_version,policy_version,notes,created_by)
  values(observation.id,review.id,p_case_type,coalesce(p_expected_values,'{}'),p_expected_policy_result,observation.content_hash,observation.parser_version,observation.policy_version,p_notes,(select auth.uid()))
  on conflict(observation_id) do update set case_type=excluded.case_type,expected_values=excluded.expected_values,
    expected_policy_result=excluded.expected_policy_result,parser_version=excluded.parser_version,policy_version=excluded.policy_version,
    notes=excluded.notes,regression_status='not_run',updated_at=now()
  returning * into result;
  return result;
end $$;

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
      count(*) filter(where proposal_id is not null) proposals,count(*) filter(where review_result='correct') correct,
      count(*) filter(where review_result='partially_correct') partial,count(*) filter(where review_result='incorrect') incorrect,
      count(*) filter(where review_result is null) unreviewed,count(*) filter(where review_result is not null) reviewed,
      count(*) filter(where jsonb_array_length(conflicts)>0) conflicts,count(*) filter(where blocked_reason is not null) blocked,
      count(*) filter(where duplicate_match_level<>'no_match') duplicates,
      count(*) filter(where coalesce(array_length(parsing_warnings,1),0)>0) parser_errors,
      count(*) filter(where technically_reachable) reachable,avg(confidence) average_confidence,avg(source_reliability) average_reliability
    from filtered
  ) select jsonb_build_object(
    'total_observations',total,'unchanged_observations',unchanged,'change_proposals',proposals,
    'correct_proposals',correct,'partially_correct_proposals',partial,'incorrect_proposals',incorrect,'unreviewed_proposals',unreviewed,
    'reviewed_sample',reviewed,'sample_sufficient',reviewed>=30,'sample_warning',case when reviewed<30 then 'insufficient_reviewed_sample' end,
    'precision',case when reviewed>0 then round(correct::numeric/reviewed,5) end,
    'false_positive_rate',case when reviewed>0 then round(incorrect::numeric/reviewed,5) end,
    'manual_review_rate',case when total>0 then round(reviewed::numeric/total,5) end,
    'conflict_rate',case when total>0 then round(conflicts::numeric/total,5) end,
    'blocking_rate',case when total>0 then round(blocked::numeric/total,5) end,
    'duplicate_rate',case when total>0 then round(duplicates::numeric/total,5) end,
    'parser_error_rate',case when total>0 then round(parser_errors::numeric/total,5) end,
    'technical_reachability',case when total>0 then round(reachable::numeric/total,5) end,
    'average_confidence',average_confidence,'average_reliability',average_reliability
  ) into result from counts;
  return result;
end $$;

create or replace function public.refresh_stage_four_phase_a_reliability()
returns integer language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare affected integer;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  insert into public.source_reliability_metrics(
    scope_key,source_id,source_host,source_type,extractor_version,field_name,country_code,proposal_count,reviewed_count,
    accepted_count,rejected_count,edited_count,crawl_count,crawl_error_count,acceptance_rate,rejection_rate,edit_rate,error_rate,
    reachability_rate,average_confidence,source_reliability_score,score_reasons,window_started_at,window_ended_at
  ) select
    'phase_a:'||o.source_id::text||':'||o.field_name||':'||o.parser_version||':DE',o.source_id,max(s.domain),max(s.source_type),o.parser_version,o.field_name,'DE',
    count(*) filter(where o.proposal_id is not null),count(r.id),count(*) filter(where r.review_result='correct'),
    count(*) filter(where r.review_result in ('incorrect','outdated','duplicate','source_unsuitable')),
    count(*) filter(where r.review_result='partially_correct'),count(distinct o.run_id),count(*) filter(where not o.technically_reachable),
    coalesce(count(*) filter(where r.review_result='correct')::numeric/nullif(count(r.id),0),0),
    coalesce(count(*) filter(where r.review_result in ('incorrect','outdated','duplicate','source_unsuitable'))::numeric/nullif(count(r.id),0),0),
    coalesce(count(*) filter(where r.review_result='partially_correct')::numeric/nullif(count(r.id),0),0),
    coalesce(count(*) filter(where r.review_result='incorrect')::numeric/nullif(count(r.id),0),0),
    coalesce(count(*) filter(where o.technically_reachable)::numeric/nullif(count(*),0),0),avg(o.confidence),
    least(1,greatest(0,(5+count(*) filter(where r.review_result='correct')+0.5*count(*) filter(where r.review_result='partially_correct'))/(10+count(r.id)))),
    jsonb_build_array('phase_a_manual_reviews','field_specific','bayesian_prior_5_of_10'),min(o.observed_at),max(o.observed_at)
  from public.stage_four_observations o join public.stage_four_pilot_sources s on s.id=o.pilot_source_id
  left join public.stage_four_observation_reviews r on r.observation_id=o.id
  group by o.source_id,o.field_name,o.parser_version
  on conflict(scope_key) do update set proposal_count=excluded.proposal_count,reviewed_count=excluded.reviewed_count,
    accepted_count=excluded.accepted_count,rejected_count=excluded.rejected_count,edited_count=excluded.edited_count,
    crawl_count=excluded.crawl_count,crawl_error_count=excluded.crawl_error_count,acceptance_rate=excluded.acceptance_rate,
    rejection_rate=excluded.rejection_rate,edit_rate=excluded.edit_rate,error_rate=excluded.error_rate,
    reachability_rate=excluded.reachability_rate,average_confidence=excluded.average_confidence,
    source_reliability_score=excluded.source_reliability_score,score_reasons=excluded.score_reasons,
    window_started_at=excluded.window_started_at,window_ended_at=excluded.window_ended_at,calculated_at=now();
  get diagnostics affected=row_count;
  return affected;
end $$;

create or replace function public.refresh_stage_four_phase_b_readiness()
returns integer language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare criterion public.stage_four_readiness_criteria; reviewed integer; confirmed integer; correct integer; false_count integer;
  precision_value numeric; false_rate numeric; blockers text[]; affected integer:=0;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  for criterion in select * from public.stage_four_readiness_criteria where enabled
  loop
    select count(r.id),count(*) filter(where r.review_result='correct' and o.proposal_id is not null),
      count(*) filter(where r.review_result='correct'),count(*) filter(where r.review_result='incorrect')
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
    if not exists(select 1 from public.automation_scope_controls where scope_type='country' and scope_key='DE') then blockers:=array_append(blockers,'kill_switch_configuration_missing'); end if;
    insert into public.stage_four_readiness_snapshots(
      criterion_id,dimension_type,dimension_key,reviewed_count,confirmed_change_count,precision,false_positive_rate,
      sample_sufficient,theoretically_ready,blockers,metrics
    ) values(criterion.id,criterion.dimension_type,criterion.dimension_key,reviewed,confirmed,precision_value,false_rate,
      reviewed>=criterion.minimum_reviewed,coalesce(array_length(blockers,1),0)=0,blockers,
      jsonb_build_object('minimum_reviewed',criterion.minimum_reviewed,'minimum_precision',criterion.minimum_precision,
        'phase_b_activated',false,'dry_run',true,'automation_enabled',false));
    affected:=affected+1;
  end loop;
  return affected;
end $$;

create or replace function public.refresh_stage_four_observation_monitoring()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare proposals_24h integer; false_7d integer; queue_length integer; unreachable integer; parser_failures integer;
  conflicts integer; country_errors integer; locked_attempts integer; high_risk integer; rate_limited integer; duplicates integer; opened integer:=0;
  signal record;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  select count(*) filter(where proposal_id is not null),count(*) filter(where not technically_reachable),
    count(*) filter(where coalesce(array_length(parsing_warnings,1),0)>0),count(*) filter(where jsonb_array_length(conflicts)>0),
    count(*) filter(where not country_valid),count(*) filter(where blocked_reason='field_locked_or_manual_override'),
    count(*) filter(where blocked_reason='high_risk_review_only'),count(*) filter(where duplicate_match_level<>'no_match')
  into proposals_24h,unreachable,parser_failures,conflicts,country_errors,locked_attempts,high_risk,duplicates
  from public.stage_four_observations where observed_at>=now()-interval '24 hours';
  select count(*) into false_7d from public.stage_four_observation_reviews where review_result='incorrect' and reviewed_at>=now()-interval '7 days';
  select count(*) into queue_length from public.stage_four_observation_runs where run_status in ('queued','running','partial');
  select count(*) into rate_limited from public.stage_four_observation_runs r join public.stage_four_pilot_sources s on s.id=r.pilot_source_id
    where r.created_at>=current_date group by s.id,s.requests_per_day having count(*)>=s.requests_per_day limit 1;
  for signal in select * from (values
    ('observation_proposal_spike','warning','Ungewöhnlich viele Änderungsvorschläge',proposals_24h,50),
    ('observation_false_positive_spike','error','Falsche Vorschläge nehmen zu',false_7d,10),
    ('observation_queue_growth','error','Observation Queue wächst stark',queue_length,100),
    ('observation_unreachable_sources','warning','Viele Quellen sind nicht erreichbar',unreachable,10),
    ('observation_parser_failures','error','Parser-Ausfälle erkannt',parser_failures,10),
    ('observation_conflict_spike','warning','Hohe Konfliktrate',conflicts,10),
    ('observation_country_errors','critical','Länderprüfung fehlgeschlagen',country_errors,1),
    ('observation_locked_field_attempts','critical','Versuch gegen Feldsperre',locked_attempts,1),
    ('observation_high_risk_attempts','critical','Hochrisikoaktion im Shadow-Modus blockiert',high_risk,1),
    ('observation_rate_limit','warning','Quellenlimit erreicht',coalesce(rate_limited,0),1),
    ('observation_duplicate_spike','warning','Ungewöhnlich viele Dubletten',duplicates,10)
  ) as signal(code,severity,title,count_value,threshold_value)
  where count_value>=threshold_value
  loop
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
  return jsonb_build_object('alerts_opened',opened,'proposals_24h',proposals_24h,'false_reviews_7d',false_7d,'queue_length',queue_length);
end $$;

create or replace view public.stage_four_phase_a_dashboard with (security_invoker=true) as
select s.id,s.source_key,s.source_name,s.source_type,s.domain,s.source_url,s.country_code,s.pilot_status,s.event_source_id,
  s.initial_reliability,s.allowed_observation_fields,s.blocked_mutation_fields,s.check_interval_minutes,s.requests_per_day,
  s.parser_version,s.last_observation_at,s.next_observation_at,s.paused_reason,
  count(distinct r.id) run_count,count(distinct o.id) observation_count,
  count(distinct o.id) filter(where o.review_status='pending') review_backlog,
  count(distinct r.id) filter(where r.run_status in ('failed','partial')) failed_runs,
  avg(o.confidence) average_confidence,avg(o.source_reliability) average_reliability
from public.stage_four_pilot_sources s
left join public.stage_four_observation_runs r on r.pilot_source_id=s.id
left join public.stage_four_observations o on o.run_id=r.id
group by s.id;

alter table public.stage_four_pilot_sources enable row level security;
alter table public.stage_four_observation_runs enable row level security;
alter table public.stage_four_observations enable row level security;
alter table public.stage_four_observation_reviews enable row level security;
alter table public.stage_four_golden_cases enable row level security;
alter table public.stage_four_readiness_criteria enable row level security;
alter table public.stage_four_readiness_snapshots enable row level security;

create policy stage_four_pilot_sources_admin_all on public.stage_four_pilot_sources for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy stage_four_observation_runs_admin_select on public.stage_four_observation_runs for select to authenticated using ((select private.is_admin()));
create policy stage_four_observations_admin_select on public.stage_four_observations for select to authenticated using ((select private.is_admin()));
create policy stage_four_observation_reviews_admin_all on public.stage_four_observation_reviews for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy stage_four_golden_cases_admin_all on public.stage_four_golden_cases for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy stage_four_readiness_criteria_admin_all on public.stage_four_readiness_criteria for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy stage_four_readiness_snapshots_admin_select on public.stage_four_readiness_snapshots for select to authenticated using ((select private.is_admin()));

revoke all on public.stage_four_pilot_sources,public.stage_four_observation_runs,public.stage_four_observations,
  public.stage_four_observation_reviews,public.stage_four_golden_cases,public.stage_four_readiness_criteria,
  public.stage_four_readiness_snapshots,public.stage_four_phase_a_dashboard from public,anon,authenticated;
grant select,insert,update,delete on public.stage_four_pilot_sources to authenticated;
grant select on public.stage_four_observation_runs,public.stage_four_observations,public.stage_four_phase_a_dashboard,public.stage_four_readiness_snapshots to authenticated;
grant select,insert,update,delete on public.stage_four_observation_reviews,public.stage_four_golden_cases,public.stage_four_readiness_criteria to authenticated;
grant select,insert,update,delete on public.stage_four_pilot_sources,public.stage_four_observation_runs,public.stage_four_observations,
  public.stage_four_observation_reviews,public.stage_four_golden_cases,public.stage_four_readiness_criteria,
  public.stage_four_readiness_snapshots to service_role;
grant select on public.stage_four_phase_a_dashboard to service_role;
grant usage,select on all sequences in schema public to service_role;

revoke all on function public.set_stage_four_observation_state(boolean,boolean,text) from public,anon;
revoke all on function public.bind_stage_four_pilot_source(uuid,uuid,text) from public,anon;
revoke all on function public.set_stage_four_pilot_source_status(uuid,text,text) from public,anon;
revoke all on function public.enqueue_stage_four_observation_runs(integer,text) from public,anon,authenticated;
revoke all on function public.stop_stage_four_observation_run(uuid,text,boolean) from public,anon;
revoke all on function public.resume_stage_four_observation_run(uuid,text) from public,anon;
revoke all on function public.record_stage_four_shadow_observations(bigint) from public,anon,authenticated;
revoke all on function public.review_stage_four_observation(uuid,text,text[],jsonb,text,text,boolean,boolean,boolean,boolean,boolean) from public,anon;
revoke all on function public.promote_stage_four_golden_case(uuid,text,jsonb,text,text) from public,anon;
revoke all on function public.get_stage_four_observation_metrics(uuid,text,text,text,text,text,timestamptz,timestamptz,numeric,numeric,numeric,numeric,text,text) from public,anon;
revoke all on function public.refresh_stage_four_phase_a_reliability() from public,anon;
revoke all on function public.refresh_stage_four_phase_b_readiness() from public,anon;
revoke all on function public.refresh_stage_four_observation_monitoring() from public,anon;

grant execute on function public.set_stage_four_observation_state(boolean,boolean,text) to authenticated;
grant execute on function public.bind_stage_four_pilot_source(uuid,uuid,text) to authenticated;
grant execute on function public.set_stage_four_pilot_source_status(uuid,text,text) to authenticated;
grant execute on function public.enqueue_stage_four_observation_runs(integer,text) to authenticated,service_role;
grant execute on function public.stop_stage_four_observation_run(uuid,text,boolean) to authenticated;
grant execute on function public.resume_stage_four_observation_run(uuid,text) to authenticated;
grant execute on function public.record_stage_four_shadow_observations(bigint) to service_role;
grant execute on function public.review_stage_four_observation(uuid,text,text[],jsonb,text,text,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.promote_stage_four_golden_case(uuid,text,jsonb,text,text) to authenticated;
grant execute on function public.get_stage_four_observation_metrics(uuid,text,text,text,text,text,timestamptz,timestamptz,numeric,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.refresh_stage_four_phase_a_reliability() to authenticated,service_role;
grant execute on function public.refresh_stage_four_phase_b_readiness() to authenticated,service_role;
grant execute on function public.refresh_stage_four_observation_monitoring() to authenticated,service_role;

comment on table public.stage_four_pilot_sources is 'Controlled German pilot profiles. Seeded candidates are inert until explicitly bound and activated by an admin.';
comment on table public.stage_four_observations is 'Private Phase-A observations. Every row is dry-run shadow data and cannot represent an executed public mutation.';
comment on table public.stage_four_observation_reviews is 'Calibration-only manual reviews; no public event update is performed.';
comment on table public.stage_four_golden_cases is 'Reviewed real cases for later parser, matcher, policy, confidence and normalization regressions.';
comment on table public.stage_four_readiness_snapshots is 'Theoretical readiness only. A ready row never changes rollout settings or enables Phase B.';

commit;
