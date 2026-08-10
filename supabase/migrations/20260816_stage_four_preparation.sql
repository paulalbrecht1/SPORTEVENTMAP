-- Stage 4 preparation: policy simulation, reliability, controlled discovery,
-- duplicate review, geocoding queue, country pilots, quality metrics and bulk previews.
-- The global defaults are intentionally automation_enabled=false and dry_run=true.

begin;

create table public.stage_four_settings (
  singleton boolean primary key default true check (singleton),
  automation_enabled boolean not null default false,
  dry_run boolean not null default true,
  rollout_phase text not null default 'observation' check (rollout_phase in (
    'observation', 'technical', 'trusted_content', 'austria_pilot', 'switzerland_pilot', 'expansion'
  )),
  maximum_parallel_workers smallint not null default 3 check (maximum_parallel_workers between 1 and 20),
  daily_crawl_limit integer not null default 2500 check (daily_crawl_limit between 1 and 100000),
  daily_geocoding_limit integer not null default 100 check (daily_geocoding_limit between 0 and 10000),
  daily_ai_cost_cents integer not null default 0 check (daily_ai_cost_cents between 0 and 1000000),
  maximum_queue_length integer not null default 1000 check (maximum_queue_length between 10 and 100000),
  maximum_candidates_per_source integer not null default 100 check (maximum_candidates_per_source between 1 and 1000),
  reliability_minimum_sample integer not null default 50 check (reliability_minimum_sample between 10 and 10000),
  reliability_auto_threshold numeric(4,3) not null default 0.950 check (reliability_auto_threshold between 0 and 1),
  global_emergency_stop boolean not null default false,
  changed_by uuid references auth.users(id) on delete set null,
  change_reason text not null default 'Initial Phase-A safety configuration',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.stage_four_settings(singleton) values (true) on conflict do nothing;

create table public.country_rollouts (
  country_code char(2) primary key check (country_code in ('DE', 'AT', 'CH')),
  country_name text not null,
  rollout_status text not null check (rollout_status in ('observation', 'pilot_disabled', 'pilot', 'active', 'paused')),
  discovery_enabled boolean not null default false,
  geocoding_enabled boolean not null default false,
  automation_enabled boolean not null default false,
  supported_languages text[] not null,
  supported_sports text[] not null default array['running','trail_running','ultra_running','triathlon'],
  currency char(3) not null,
  timezone text not null,
  postal_code_pattern text not null,
  regions jsonb not null default '[]'::jsonb,
  quality_target numeric(5,2) not null default 90 check (quality_target between 0 and 100),
  pilot_event_limit integer not null default 50 check (pilot_event_limit between 1 and 1000),
  paused_reason text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.country_rollouts (
  country_code, country_name, rollout_status, discovery_enabled, geocoding_enabled,
  automation_enabled, supported_languages, currency, timezone, postal_code_pattern,
  regions, quality_target, pilot_event_limit
) values
  ('DE', 'Deutschland', 'observation', true, false, false, array['de'], 'EUR', 'Europe/Berlin', '^\d{5}$',
   '["Baden-Württemberg","Bayern","Berlin","Brandenburg","Bremen","Hamburg","Hessen","Mecklenburg-Vorpommern","Niedersachsen","Nordrhein-Westfalen","Rheinland-Pfalz","Saarland","Sachsen","Sachsen-Anhalt","Schleswig-Holstein","Thüringen"]'::jsonb, 92, 1000),
  ('AT', 'Österreich', 'pilot_disabled', false, false, false, array['de'], 'EUR', 'Europe/Vienna', '^\d{4}$',
   '["Burgenland","Kärnten","Niederösterreich","Oberösterreich","Salzburg","Steiermark","Tirol","Vorarlberg","Wien"]'::jsonb, 90, 50),
  ('CH', 'Schweiz', 'pilot_disabled', false, false, false, array['de','fr','it'], 'CHF', 'Europe/Zurich', '^\d{4}$',
   '[]'::jsonb, 90, 50)
on conflict (country_code) do nothing;

create table public.automation_scope_controls (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('country','domain','source','worker')),
  scope_key text not null,
  is_paused boolean not null default false,
  emergency_stop boolean not null default false,
  daily_limit integer check (daily_limit is null or daily_limit >= 0),
  maximum_parallel_jobs smallint check (maximum_parallel_jobs is null or maximum_parallel_jobs between 1 and 20),
  reason text not null,
  expires_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope_type, scope_key)
);

create table public.automation_policies (
  id uuid primary key default gen_random_uuid(),
  policy_code text not null unique,
  policy_version integer not null default 1 check (policy_version > 0),
  name text not null,
  description text not null,
  priority smallint not null default 100 check (priority between 1 and 1000),
  decision text not null check (decision in ('auto_apply','review','block')),
  minimum_phase text not null default 'observation' check (minimum_phase in (
    'observation', 'technical', 'trusted_content', 'austria_pilot', 'switzerland_pilot', 'expansion'
  )),
  field_names text[] not null default '{}',
  change_types text[] not null default '{}',
  action_codes text[] not null default '{}',
  source_types text[] not null default '{}',
  domains text[] not null default '{}',
  adapter_versions text[] not null default '{}',
  country_codes text[] not null default '{}',
  minimum_confidence numeric(4,3) not null default 0 check (minimum_confidence between 0 and 1),
  minimum_reliability numeric(4,3) not null default 0 check (minimum_reliability between 0 and 1),
  minimum_reviewed_sample integer not null default 0 check (minimum_reviewed_sample >= 0),
  maximum_error_rate numeric(4,3) not null default 1 check (maximum_error_rate between 0 and 1),
  require_official_source boolean not null default false,
  require_multiple_sources boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.automation_policies (
  policy_code, name, description, priority, decision, minimum_phase, field_names,
  change_types, action_codes, country_codes, minimum_confidence, minimum_reliability,
  minimum_reviewed_sample, maximum_error_rate, require_official_source
) values
  ('locked_or_manual_override', 'Feldsperren und Overrides', 'Manuell bestätigte oder gesperrte Werte blockieren jede Automatik.', 1, 'block', 'observation', '{}', '{}', '{}', '{}', 0, 0, 0, 1, false),
  ('high_risk_review_only', 'Hochrisiko nur Review', 'Absagen, Verschiebungen, Orte, Sportarten, Domains, Editionen und Renndaten bleiben im Review.', 5, 'review', 'observation',
   array['start_date','end_date','city','region','country','address','latitude','longitude','sport','official_url','edition_year'],
   array['possible_cancellation','possible_postponement','location_change','source_change','new_edition','removed_value'], '{}', '{}', 0, 0, 0, 1, false),
  ('safe_technical_actions', 'Sichere technische Aktionen', 'Nur Phase B, offizielle Quelle und mindestens 0,98 Confidence.', 20, 'auto_apply', 'technical', '{}', '{}',
   array['technical_reachability','last_crawled_at','unchanged_official_verification','schedule_next_check','reset_failure_counter','complete_past_edition'],
   array['DE'], 0.980, 0, 0, 0.05, true),
  ('trusted_registration_status', 'Vertrauenswürdiger Registrierungsstatus', 'Phase C, Deutschland, offizielle Quelle, mindestens 50 Reviews und sehr hohe Zuverlässigkeit.', 30, 'auto_apply', 'trusted_content',
   array['registration_status'], array['registration_change'], '{}', array['DE'], 0.985, 0.950, 50, 0.020, true),
  ('default_review', 'Standard-Review', 'Alle nicht explizit freigegebenen Vorgänge bleiben im Admin-Review.', 999, 'review', 'observation', '{}', '{}', '{}', '{}', 0, 0, 0, 1, false)
on conflict (policy_code) do nothing;

create table public.source_reliability_metrics (
  id bigint generated always as identity primary key,
  scope_key text not null unique,
  source_id uuid references public.event_sources(id) on delete cascade,
  source_host text,
  source_type text,
  extractor_version text,
  adapter_version text,
  field_name text,
  country_code char(2),
  proposal_count integer not null default 0,
  reviewed_count integer not null default 0,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  edited_count integer not null default 0,
  crawl_count integer not null default 0,
  crawl_error_count integer not null default 0,
  false_cancellation_count integer not null default 0,
  false_date_change_count integer not null default 0,
  acceptance_rate numeric(6,5) not null default 0,
  rejection_rate numeric(6,5) not null default 0,
  edit_rate numeric(6,5) not null default 0,
  error_rate numeric(6,5) not null default 0,
  reachability_rate numeric(6,5) not null default 0,
  average_confidence numeric(6,5) not null default 0,
  average_change_interval_hours numeric(10,2),
  source_reliability_score numeric(6,5) not null default 0.5 check (source_reliability_score between 0 and 1),
  score_reasons jsonb not null default '[]'::jsonb,
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  calculated_at timestamptz not null default now()
);

create index source_reliability_lookup_idx on public.source_reliability_metrics
  (source_host, field_name, country_code, extractor_version, source_reliability_score desc);

create table public.automation_decisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.event_change_proposals(id) on delete cascade,
  crawl_result_id bigint references public.source_crawl_results(id) on delete set null,
  event_id bigint references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  policy_id uuid references public.automation_policies(id) on delete set null,
  policy_code text not null,
  action_code text,
  recommended_decision text not null check (recommended_decision in ('auto_apply','review','block')),
  effective_decision text not null check (effective_decision in ('auto_apply','review','block')),
  decision_status text not null default 'simulated' check (decision_status in ('simulated','pending_review','applied','blocked','failed','rolled_back')),
  dry_run boolean not null,
  confidence numeric(4,3),
  reliability_score numeric(6,5),
  decision_reasons jsonb not null default '[]'::jsonb,
  policy_snapshot jsonb not null default '{}'::jsonb,
  input_snapshot jsonb not null default '{}'::jsonb,
  decision_fingerprint text not null unique,
  evaluated_at timestamptz not null default now(),
  applied_at timestamptz,
  error_message text
);

create index automation_decisions_queue_idx on public.automation_decisions(effective_decision, decision_status, evaluated_at desc);

create table public.discovery_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_type text not null check (source_type in (
    'official_federation_calendar','organizer_calendar','registration_platform','timing_platform',
    'race_series','structured_event_list','sitemap'
  )),
  country_code char(2) not null references public.country_rollouts(country_code),
  source_url text not null,
  discovery_method text not null check (discovery_method in ('html_list','json','json_ld','xml_sitemap','platform_adapter')),
  adapter_version text,
  is_official boolean not null default false,
  is_active boolean not null default false,
  is_paused boolean not null default false,
  maximum_candidates_per_run integer not null default 25 check (maximum_candidates_per_run between 1 and 1000),
  daily_request_limit integer not null default 10 check (daily_request_limit between 1 and 10000),
  minimum_interval_seconds integer not null default 60 check (minimum_interval_seconds between 1 and 86400),
  last_discovered_at timestamptz,
  next_discovery_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(country_code, source_url)
);

create table public.discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  discovery_source_id uuid not null references public.discovery_sources(id) on delete cascade,
  detected_event_name text not null,
  normalized_event_name text not null,
  possible_start_date date,
  city text,
  region text,
  country_code char(2) not null references public.country_rollouts(country_code),
  sport text not null check (sport in ('running','trail_running','ultra_running','triathlon')),
  distances jsonb not null default '[]'::jsonb,
  official_url text,
  registration_url text,
  source_page_url text not null,
  discovery_method text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  confidence_reasons jsonb not null default '[]'::jsonb,
  possible_event_id bigint references public.events(id) on delete set null,
  match_status text not null default 'no_match' check (match_status in ('no_match','possible_match','probable_match','confirmed_duplicate')),
  geocoding_status text not null default 'not_requested' check (geocoding_status in ('not_requested','queued','cached','completed','needs_review','failed','rate_limited')),
  validation_warnings text[] not null default '{}',
  review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected','assigned_existing','duplicate','expired')),
  candidate_fingerprint text not null unique,
  detected_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index discovery_candidates_review_idx on public.discovery_candidates(review_status, country_code, confidence desc, detected_at desc);

create table public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  discovery_candidate_id uuid references public.discovery_candidates(id) on delete cascade,
  left_event_id bigint references public.events(id) on delete cascade,
  right_event_id bigint references public.events(id) on delete cascade,
  matched_event_id bigint references public.events(id) on delete cascade,
  duplicate_score numeric(4,3) not null check (duplicate_score between 0 and 1),
  classification text not null check (classification in ('no_match','possible_match','probable_match','confirmed_duplicate')),
  match_factors jsonb not null default '[]'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending','confirmed','not_duplicate','keep_both','merged','expired')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  constraint duplicate_candidate_pair_check check (
    (discovery_candidate_id is not null and matched_event_id is not null)
    or (left_event_id is not null and right_event_id is not null and left_event_id <> right_event_id)
  )
);

create unique index duplicate_discovery_match_uidx on public.duplicate_candidates(discovery_candidate_id, matched_event_id)
  where discovery_candidate_id is not null;

create table public.geocoding_cache (
  cache_key text primary key,
  original_location_text text not null,
  normalized_address text not null,
  country_code char(2) not null references public.country_rollouts(country_code),
  provider text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  result_details jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '365 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.geocoding_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id bigint references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  discovery_candidate_id uuid references public.discovery_candidates(id) on delete cascade,
  request_reason text not null check (request_reason in ('new_event','new_location','missing_coordinates','manual_retry')),
  original_location_text text not null,
  normalized_address text not null,
  country_code char(2) not null references public.country_rollouts(country_code),
  cache_key text not null,
  provider text not null default 'geoapify',
  job_status text not null default 'queued' check (job_status in ('queued','processing','cached','completed','needs_review','failed','rate_limited','cancelled')),
  latitude double precision,
  longitude double precision,
  confidence numeric(4,3),
  result_details jsonb not null default '{}'::jsonb,
  validation_warnings text[] not null default '{}',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  error_message text,
  constraint geocoding_job_target_check check (num_nonnulls(event_id, discovery_candidate_id) = 1)
);

create unique index geocoding_jobs_open_target_uidx on public.geocoding_jobs(
  coalesce(event_id::text, discovery_candidate_id::text), cache_key
) where job_status in ('queued','processing','cached','completed','needs_review');

create table public.stage_four_usage_daily (
  usage_date date not null default current_date,
  scope_type text not null check (scope_type in ('global','country','domain','source','worker','provider')),
  scope_key text not null,
  crawl_requests integer not null default 0,
  discovery_candidates integer not null default 0,
  geocoding_requests integer not null default 0,
  ai_cost_cents integer not null default 0,
  worker_failures integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(usage_date, scope_type, scope_key),
  constraint stage_four_usage_nonnegative_check check (
    crawl_requests >= 0 and discovery_candidates >= 0 and geocoding_requests >= 0 and ai_cost_cents >= 0 and worker_failures >= 0
  )
);

create table public.data_quality_snapshots (
  id bigint generated always as identity primary key,
  country_code char(2),
  event_count integer not null,
  active_event_count integer not null,
  verified_active_rate numeric(6,5) not null,
  official_url_rate numeric(6,5) not null,
  coordinate_rate numeric(6,5) not null,
  future_date_rate numeric(6,5) not null,
  next_check_rate numeric(6,5) not null,
  image_rate numeric(6,5) not null,
  registration_url_rate numeric(6,5) not null,
  distance_rate numeric(6,5) not null,
  source_rate numeric(6,5) not null,
  average_verification_age_days numeric(10,2),
  open_critical_issues integer not null default 0,
  open_warnings integer not null default 0,
  possible_duplicates integer not null default 0,
  past_without_successor integer not null default 0,
  data_quality_score numeric(5,2) not null check (data_quality_score between 0 and 100),
  score_factors jsonb not null,
  calculated_at timestamptz not null default now()
);

create index data_quality_snapshots_country_idx on public.data_quality_snapshots(country_code, calculated_at desc);

create table public.bulk_operations (
  id uuid primary key default gen_random_uuid(),
  action_code text not null check (action_code in (
    'confirm_unchanged_sources','accept_safe_registration_changes','complete_past_editions',
    'retry_selected_sources','reject_discovery_candidates','assign_candidates_to_event','reschedule_next_check'
  )),
  operation_status text not null default 'preview' check (operation_status in ('preview','confirmed','simulated','running','succeeded','failed','rolled_back','cancelled')),
  dry_run boolean not null,
  affected_count integer not null check (affected_count between 1 and 100),
  impact_summary text not null,
  preview_hash text not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  confirmed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.bulk_operation_items (
  operation_id uuid not null references public.bulk_operations(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('source','proposal','edition','discovery_candidate','event')),
  item_status text not null default 'preview' check (item_status in ('preview','simulated','succeeded','failed','rolled_back')),
  before_value jsonb,
  after_value jsonb,
  error_message text,
  primary key(operation_id, item_id)
);

create table public.stage_four_audit_log (
  id bigint generated always as identity primary key,
  action_code text not null,
  entity_type text not null,
  entity_id text,
  decision_id uuid references public.automation_decisions(id) on delete set null,
  operation_id uuid references public.bulk_operations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_process text,
  dry_run boolean not null,
  outcome text not null check (outcome in ('simulated','applied','review','blocked','failed','rolled_back')),
  reasons jsonb not null default '[]'::jsonb,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

-- Updated-at triggers reuse the existing private helper.
create trigger stage_four_settings_set_updated_at before update on public.stage_four_settings
for each row execute function private.set_updated_at();
create trigger country_rollouts_set_updated_at before update on public.country_rollouts
for each row execute function private.set_updated_at();
create trigger automation_scope_controls_set_updated_at before update on public.automation_scope_controls
for each row execute function private.set_updated_at();
create trigger automation_policies_set_updated_at before update on public.automation_policies
for each row execute function private.set_updated_at();
create trigger discovery_sources_set_updated_at before update on public.discovery_sources
for each row execute function private.set_updated_at();
create trigger discovery_candidates_set_updated_at before update on public.discovery_candidates
for each row execute function private.set_updated_at();
create trigger geocoding_cache_set_updated_at before update on public.geocoding_cache
for each row execute function private.set_updated_at();

-- All Stage-4 operational tables are admin-only; service_role is used by workers.
alter table public.stage_four_settings enable row level security;
alter table public.country_rollouts enable row level security;
alter table public.automation_scope_controls enable row level security;
alter table public.automation_policies enable row level security;
alter table public.source_reliability_metrics enable row level security;
alter table public.automation_decisions enable row level security;
alter table public.discovery_sources enable row level security;
alter table public.discovery_candidates enable row level security;
alter table public.duplicate_candidates enable row level security;
alter table public.geocoding_cache enable row level security;
alter table public.geocoding_jobs enable row level security;
alter table public.stage_four_usage_daily enable row level security;
alter table public.data_quality_snapshots enable row level security;
alter table public.bulk_operations enable row level security;
alter table public.bulk_operation_items enable row level security;
alter table public.stage_four_audit_log enable row level security;

create policy stage_four_settings_admin on public.stage_four_settings for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy country_rollouts_admin on public.country_rollouts for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy automation_scope_controls_admin on public.automation_scope_controls for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy automation_policies_admin on public.automation_policies for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy source_reliability_metrics_admin_select on public.source_reliability_metrics for select to authenticated using ((select private.is_admin()));
create policy automation_decisions_admin_select on public.automation_decisions for select to authenticated using ((select private.is_admin()));
create policy discovery_sources_admin on public.discovery_sources for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy discovery_candidates_admin on public.discovery_candidates for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy duplicate_candidates_admin on public.duplicate_candidates for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy geocoding_cache_admin_select on public.geocoding_cache for select to authenticated using ((select private.is_admin()));
create policy geocoding_jobs_admin on public.geocoding_jobs for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy stage_four_usage_daily_admin_select on public.stage_four_usage_daily for select to authenticated using ((select private.is_admin()));
create policy data_quality_snapshots_admin_select on public.data_quality_snapshots for select to authenticated using ((select private.is_admin()));
create policy bulk_operations_admin_select on public.bulk_operations for select to authenticated using ((select private.is_admin()));
create policy bulk_operation_items_admin_select on public.bulk_operation_items for select to authenticated using ((select private.is_admin()));
create policy stage_four_audit_log_admin_select on public.stage_four_audit_log for select to authenticated using ((select private.is_admin()));

revoke all on public.stage_four_settings, public.country_rollouts, public.automation_scope_controls,
  public.automation_policies, public.source_reliability_metrics, public.automation_decisions,
  public.discovery_sources, public.discovery_candidates, public.duplicate_candidates,
  public.geocoding_cache, public.geocoding_jobs, public.stage_four_usage_daily,
  public.data_quality_snapshots, public.bulk_operations, public.bulk_operation_items,
  public.stage_four_audit_log from public, anon, authenticated;

grant select, update on public.stage_four_settings, public.country_rollouts to authenticated;
grant select, insert, update, delete on public.automation_scope_controls, public.automation_policies,
  public.discovery_sources, public.discovery_candidates, public.duplicate_candidates, public.geocoding_jobs to authenticated;
grant select on public.source_reliability_metrics, public.automation_decisions, public.geocoding_cache,
  public.stage_four_usage_daily, public.data_quality_snapshots, public.bulk_operations,
  public.bulk_operation_items, public.stage_four_audit_log to authenticated;
grant all on public.stage_four_settings, public.country_rollouts, public.automation_scope_controls,
  public.automation_policies, public.source_reliability_metrics, public.automation_decisions,
  public.discovery_sources, public.discovery_candidates, public.duplicate_candidates,
  public.geocoding_cache, public.geocoding_jobs, public.stage_four_usage_daily,
  public.data_quality_snapshots, public.bulk_operations, public.bulk_operation_items,
  public.stage_four_audit_log to service_role;
revoke update, delete, truncate on public.stage_four_audit_log from service_role;
grant select, insert on public.stage_four_audit_log to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function private.stage_four_actor_allowed()
returns boolean language sql stable security definer set search_path = pg_catalog, public, private
as $$ select coalesce((select auth.jwt()->>'role'), '') = 'service_role' or (select private.is_admin()) $$;
revoke all on function private.stage_four_actor_allowed() from public, anon, authenticated;

create or replace function public.refresh_source_reliability_metrics(p_window_days integer default 90)
returns integer language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare affected integer;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode = '42501'; end if;
  if p_window_days not between 7 and 365 then raise exception 'window must be 7..365 days' using errcode = '22023'; end if;

  delete from public.source_reliability_metrics
  where window_ended_at < now() - interval '365 days';
  with proposal_metrics as (
    select
      source.id source_id, source.source_host, source.source_type, proposal.extractor_version,
      case when proposal.extraction_method like 'platform:%' then proposal.extractor_version end adapter_version,
      proposal.field_name, case lower(event.country)
        when 'de' then 'DE' when 'deutschland' then 'DE' when 'germany' then 'DE'
        when 'at' then 'AT' when 'österreich' then 'AT' when 'oesterreich' then 'AT' when 'austria' then 'AT'
        when 'ch' then 'CH' when 'schweiz' then 'CH' when 'suisse' then 'CH' when 'svizzera' then 'CH' when 'switzerland' then 'CH'
      end country_code,
      count(*) proposal_count,
      count(*) filter (where proposal.proposal_status in ('accepted','edited_and_accepted','rejected')) reviewed_count,
      count(*) filter (where proposal.proposal_status = 'accepted') accepted_count,
      count(*) filter (where proposal.proposal_status = 'rejected') rejected_count,
      count(*) filter (where proposal.proposal_status = 'edited_and_accepted') edited_count,
      count(*) filter (where proposal.proposal_status = 'rejected' and proposal.change_type in ('possible_cancellation','possible_postponement')) false_cancellation_count,
      count(*) filter (where proposal.proposal_status = 'rejected' and proposal.field_name in ('start_date','end_date')) false_date_change_count,
      avg(proposal.confidence) average_confidence
    from public.event_change_proposals proposal
    join public.event_sources source on source.id = proposal.source_id
    join public.events event on event.id = proposal.event_id
    where proposal.created_at >= now() - make_interval(days => p_window_days)
    group by source.id, source.source_host, source.source_type, proposal.extractor_version,
      case when proposal.extraction_method like 'platform:%' then proposal.extractor_version end,
      proposal.field_name, case lower(event.country)
        when 'de' then 'DE' when 'deutschland' then 'DE' when 'germany' then 'DE'
        when 'at' then 'AT' when 'österreich' then 'AT' when 'oesterreich' then 'AT' when 'austria' then 'AT'
        when 'ch' then 'CH' when 'schweiz' then 'CH' when 'suisse' then 'CH' when 'svizzera' then 'CH' when 'switzerland' then 'CH'
      end
  ), crawl_metrics as (
    select source_id, count(*) crawl_count,
      count(*) filter (where processing_status in ('dead_letter','retry_scheduled') or error_type is not null) crawl_error_count,
      count(*) filter (where processing_status = 'completed' and error_type is null) successful_count
    from public.source_crawl_results where created_at >= now() - make_interval(days => p_window_days)
    group by source_id
  ), scored as (
    select p.*, coalesce(c.crawl_count,0) crawl_count, coalesce(c.crawl_error_count,0) crawl_error_count,
      case when p.reviewed_count = 0 then 0 else p.accepted_count::numeric / p.reviewed_count end acceptance_rate,
      case when p.reviewed_count = 0 then 0 else p.rejected_count::numeric / p.reviewed_count end rejection_rate,
      case when p.reviewed_count = 0 then 0 else p.edited_count::numeric / p.reviewed_count end edit_rate,
      case when coalesce(c.crawl_count,0) = 0 then 0 else c.crawl_error_count::numeric / c.crawl_count end error_rate,
      case when coalesce(c.crawl_count,0) = 0 then 0 else c.successful_count::numeric / c.crawl_count end reachability_rate
    from proposal_metrics p left join crawl_metrics c on c.source_id = p.source_id
  )
  insert into public.source_reliability_metrics (
    scope_key, source_id, source_host, source_type, extractor_version, adapter_version, field_name, country_code,
    proposal_count, reviewed_count, accepted_count, rejected_count, edited_count, crawl_count, crawl_error_count,
    false_cancellation_count, false_date_change_count, acceptance_rate, rejection_rate, edit_rate, error_rate,
    reachability_rate, average_confidence, source_reliability_score, score_reasons, window_started_at, window_ended_at
  ) select
    md5(concat_ws('|', source_id, extractor_version, adapter_version, field_name, country_code, p_window_days)),
    source_id, source_host, source_type, extractor_version, adapter_version, field_name, country_code,
    proposal_count, reviewed_count, accepted_count, rejected_count, edited_count, crawl_count, crawl_error_count,
    false_cancellation_count, false_date_change_count, acceptance_rate, rejection_rate, edit_rate, error_rate,
    reachability_rate, coalesce(average_confidence,0),
    greatest(0, least(1,
      ((10 + accepted_count + edited_count * 0.45) / (20 + reviewed_count)) * 0.75
      + coalesce(average_confidence,0) * 0.25
      - least(0.45, error_rate * 0.25 + rejection_rate * 0.25 + false_cancellation_count * 0.06 + false_date_change_count * 0.04)
    )),
    jsonb_build_array(
      'bayesian_prior=20', 'reviewed=' || reviewed_count, 'acceptance_rate=' || round(acceptance_rate,3),
      'rejection_rate=' || round(rejection_rate,3), 'error_rate=' || round(error_rate,3),
      'false_cancellations=' || false_cancellation_count, 'false_dates=' || false_date_change_count
    ), now() - make_interval(days => p_window_days), now()
  from scored
  on conflict (scope_key) do update set
    proposal_count=excluded.proposal_count, reviewed_count=excluded.reviewed_count,
    accepted_count=excluded.accepted_count, rejected_count=excluded.rejected_count,
    edited_count=excluded.edited_count, crawl_count=excluded.crawl_count,
    crawl_error_count=excluded.crawl_error_count, false_cancellation_count=excluded.false_cancellation_count,
    false_date_change_count=excluded.false_date_change_count, acceptance_rate=excluded.acceptance_rate,
    rejection_rate=excluded.rejection_rate, edit_rate=excluded.edit_rate, error_rate=excluded.error_rate,
    reachability_rate=excluded.reachability_rate, average_confidence=excluded.average_confidence,
    source_reliability_score=excluded.source_reliability_score, score_reasons=excluded.score_reasons,
    window_started_at=excluded.window_started_at, window_ended_at=excluded.window_ended_at,
    calculated_at=now();
  get diagnostics affected = row_count;
  return affected;
end $$;

create or replace function public.evaluate_change_proposal_automation(p_proposal_id uuid, p_persist boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare
  proposal public.event_change_proposals; settings public.stage_four_settings; source public.event_sources;
  metric public.source_reliability_metrics; event_country text; policy public.automation_policies;
  recommended text := 'review'; effective text := 'review'; reasons jsonb := '[]'::jsonb;
  fingerprint text; decision_id uuid; official boolean := false; phase_rank integer;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode = '42501'; end if;
  select * into proposal from public.event_change_proposals where id = p_proposal_id;
  if proposal.id is null then raise exception 'proposal not found' using errcode = 'P0002'; end if;
  select * into settings from public.stage_four_settings where singleton;
  select * into source from public.event_sources where id = proposal.source_id;
  select case lower(country)
    when 'de' then 'DE' when 'deutschland' then 'DE' when 'germany' then 'DE'
    when 'at' then 'AT' when 'österreich' then 'AT' when 'oesterreich' then 'AT' when 'austria' then 'AT'
    when 'ch' then 'CH' when 'schweiz' then 'CH' when 'suisse' then 'CH' when 'svizzera' then 'CH' when 'switzerland' then 'CH'
  end into event_country from public.events where id = proposal.event_id;
  official := source.source_type in ('official_event_website','official_registration_platform','official_registration','registration');
  select * into metric from public.source_reliability_metrics
    where source_id = source.id and field_name = proposal.field_name
    order by calculated_at desc limit 1;
  phase_rank := case settings.rollout_phase when 'observation' then 0 when 'technical' then 1 when 'trusted_content' then 2 when 'austria_pilot' then 3 when 'switzerland_pilot' then 4 else 5 end;

  if not settings.automation_enabled or settings.global_emergency_stop then
    recommended := 'block'; reasons := reasons || '"global_automation_disabled_or_stopped"'::jsonb;
    select * into policy from public.automation_policies where policy_code='locked_or_manual_override';
  elsif proposal.locked_field or exists (
    select 1 from public.event_field_controls control where control.event_id=proposal.event_id
      and control.field_name=proposal.field_name and control.is_locked
      and (control.lock_expires_at is null or control.lock_expires_at > now())
  ) then
    recommended := 'block'; reasons := reasons || '"field_locked_or_manual_override"'::jsonb;
    select * into policy from public.automation_policies where policy_code='locked_or_manual_override';
  elsif coalesce(array_length(proposal.validation_warnings,1),0) > 0 then
    recommended := 'review'; reasons := reasons || '"validation_warning_or_conflict"'::jsonb;
    select * into policy from public.automation_policies where policy_code='default_review';
  elsif proposal.field_name = any(array['start_date','end_date','city','region','country','address','latitude','longitude','sport','official_url','edition_year'])
     or proposal.change_type = any(array['possible_cancellation','possible_postponement','location_change','source_change','new_edition','removed_value']) then
    recommended := 'review'; reasons := reasons || '"high_risk_review_only"'::jsonb;
    select * into policy from public.automation_policies where policy_code='high_risk_review_only';
  elsif proposal.field_name='registration_status' and phase_rank >= 2 and event_country='DE' and official
    and proposal.confidence >= 0.985 and coalesce(metric.source_reliability_score,0) >= settings.reliability_auto_threshold
    and coalesce(metric.reviewed_count,0) >= settings.reliability_minimum_sample and coalesce(metric.error_rate,1) <= 0.02 then
    recommended := 'auto_apply'; reasons := reasons || '["trusted_registration_status","official_source","reliability_guard_passed"]'::jsonb;
    select * into policy from public.automation_policies where policy_code='trusted_registration_status';
  else
    recommended := 'review'; reasons := reasons || '"no_auto_approval_policy_or_threshold_not_met"'::jsonb;
    select * into policy from public.automation_policies where policy_code='default_review';
  end if;
  effective := case when settings.dry_run and recommended='auto_apply' then 'review' else recommended end;
  if settings.dry_run and recommended='auto_apply' then reasons := reasons || '"dry_run_prevented_apply"'::jsonb; end if;
  fingerprint := md5(proposal.id::text || ':' || coalesce(policy.policy_code,'default_review') || ':' || proposal.updated_at::text || ':' || settings.updated_at::text);

  if p_persist then
    insert into public.automation_decisions(
      proposal_id,crawl_result_id,event_id,edition_id,policy_id,policy_code,recommended_decision,effective_decision,
      decision_status,dry_run,confidence,reliability_score,decision_reasons,policy_snapshot,input_snapshot,decision_fingerprint
    ) values (
      proposal.id,proposal.crawl_id,proposal.event_id,proposal.edition_id,policy.id,coalesce(policy.policy_code,'default_review'),recommended,effective,
      case when settings.dry_run then 'simulated' when effective='block' then 'blocked' else 'pending_review' end,
      settings.dry_run,proposal.confidence,metric.source_reliability_score,reasons,to_jsonb(policy),
      jsonb_build_object('field',proposal.field_name,'change_type',proposal.change_type,'country',event_country,'official_source',official),fingerprint
    ) on conflict (decision_fingerprint) do update set evaluated_at=now(), decision_reasons=excluded.decision_reasons
    returning id into decision_id;
    insert into public.stage_four_audit_log(action_code,entity_type,entity_id,decision_id,actor_id,actor_process,dry_run,outcome,reasons)
    values ('evaluate_policy','change_proposal',proposal.id::text,decision_id,(select auth.uid()),current_user,settings.dry_run,
      case when settings.dry_run then 'simulated' when effective='block' then 'blocked' else 'review' end,reasons);
  end if;
  return jsonb_build_object('decision_id',decision_id,'recommended_decision',recommended,'effective_decision',effective,
    'policy_code',coalesce(policy.policy_code,'default_review'),'dry_run',settings.dry_run,'reasons',reasons,
    'reliability_score',metric.source_reliability_score);
end $$;

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

create or replace function public.simulate_stage_four_for_crawl(p_crawl_result_id bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare proposal record; evaluated integer := 0; would_apply integer := 0; result jsonb;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode = '42501'; end if;
  for proposal in select id from public.event_change_proposals where crawl_id=p_crawl_result_id and proposal_status='pending'
  loop
    result := public.evaluate_change_proposal_automation(proposal.id, true);
    evaluated := evaluated + 1;
    if result->>'recommended_decision'='auto_apply' then would_apply := would_apply + 1; end if;
  end loop;
  return jsonb_build_object('evaluated',evaluated,'would_auto_apply',would_apply,'applied',0,'dry_run',true);
end $$;

create or replace function public.record_discovery_candidates(p_source_id uuid, p_candidates jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare source public.discovery_sources; settings public.stage_four_settings; rollout public.country_rollouts;
  item jsonb; fingerprint text; inserted_count integer:=0; skipped_count integer:=0;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into source from public.discovery_sources where id=p_source_id and is_active and not is_paused;
  if source.id is null then raise exception 'active discovery source not found' using errcode='P0002'; end if;
  select * into settings from public.stage_four_settings where singleton;
  select * into rollout from public.country_rollouts where country_code=source.country_code;
  if not settings.dry_run or settings.global_emergency_stop or not rollout.discovery_enabled then
    raise exception 'discovery is only accepted in enabled dry-run country scope' using errcode='55000';
  end if;
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > least(settings.maximum_candidates_per_source,source.maximum_candidates_per_run) then
    raise exception 'candidate batch exceeds configured limit' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_candidates)
  loop
    if nullif(item->>'detected_event_name','') is null or item->>'country_code' <> source.country_code or
       not (item->>'sport' = any(array['running','trail_running','ultra_running','triathlon'])) then
      skipped_count:=skipped_count+1; continue;
    end if;
    fingerprint:=md5(lower(item->>'normalized_event_name') || ':' || coalesce(item->>'possible_start_date','-') || ':' ||
      lower(coalesce(item->>'city','-')) || ':' || source.country_code);
    insert into public.discovery_candidates(
      discovery_source_id,detected_event_name,normalized_event_name,possible_start_date,city,region,country_code,sport,
      distances,official_url,registration_url,source_page_url,discovery_method,confidence,confidence_reasons,
      validation_warnings,candidate_fingerprint,raw_payload
    ) values (
      source.id,item->>'detected_event_name',item->>'normalized_event_name',nullif(item->>'possible_start_date','')::date,
      nullif(item->>'city',''),nullif(item->>'region',''),source.country_code,item->>'sport',coalesce(item->'distances','[]'::jsonb),
      nullif(item->>'official_url',''),nullif(item->>'registration_url',''),coalesce(nullif(item->>'source_page_url',''),source.source_url),
      source.source_type,greatest(0,least(1,coalesce((item->>'confidence')::numeric,0))),coalesce(item->'confidence_reasons','[]'::jsonb),
      coalesce(array(select jsonb_array_elements_text(coalesce(item->'validation_warnings','[]'::jsonb))),'{}'),fingerprint,item
    ) on conflict(candidate_fingerprint) do update set confidence=greatest(public.discovery_candidates.confidence,excluded.confidence),detected_at=now();
    inserted_count:=inserted_count+1;
  end loop;
  insert into public.stage_four_usage_daily(scope_type,scope_key,discovery_candidates)
  values ('source',source.id::text,inserted_count) on conflict(usage_date,scope_type,scope_key)
  do update set discovery_candidates=public.stage_four_usage_daily.discovery_candidates+excluded.discovery_candidates,updated_at=now();
  return jsonb_build_object('stored',inserted_count,'skipped',skipped_count,'published',0,'dry_run',true);
end $$;

create or replace function public.queue_geocoding_job(
  p_event_id bigint default null, p_discovery_candidate_id uuid default null, p_reason text default 'missing_coordinates',
  p_original_location text default null, p_normalized_address text default null, p_country_code text default null,
  p_provider text default 'geoapify'
) returns public.geocoding_jobs language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare settings public.stage_four_settings; rollout public.country_rollouts; cached public.geocoding_cache;
  queued_today integer; v_cache_key text; job public.geocoding_jobs;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  if num_nonnulls(p_event_id,p_discovery_candidate_id) <> 1 then raise exception 'exactly one target required' using errcode='22023'; end if;
  if p_reason not in ('new_event','new_location','missing_coordinates','manual_retry') then raise exception 'invalid reason' using errcode='22023'; end if;
  select * into settings from public.stage_four_settings where singleton;
  select * into rollout from public.country_rollouts where country_code=upper(p_country_code);
  v_cache_key:=md5(lower(regexp_replace(coalesce(p_normalized_address,''),'\s+',' ','g')) || ':' || upper(coalesce(p_country_code,'')));
  select coalesce(sum(geocoding_requests),0) into queued_today from public.stage_four_usage_daily where usage_date=current_date;
  if settings.global_emergency_stop or not rollout.geocoding_enabled or queued_today >= settings.daily_geocoding_limit then
    insert into public.geocoding_jobs(event_id,discovery_candidate_id,request_reason,original_location_text,normalized_address,country_code,cache_key,provider,job_status,error_message)
    values(p_event_id,p_discovery_candidate_id,p_reason,p_original_location,p_normalized_address,upper(p_country_code),v_cache_key,p_provider,'rate_limited','country disabled, emergency stop or daily limit reached') returning * into job;
    return job;
  end if;
  select * into cached from public.geocoding_cache where geocoding_cache.cache_key=v_cache_key and expires_at>now();
  insert into public.geocoding_jobs(event_id,discovery_candidate_id,request_reason,original_location_text,normalized_address,country_code,cache_key,provider,job_status,latitude,longitude,confidence,result_details,completed_at)
  values(p_event_id,p_discovery_candidate_id,p_reason,p_original_location,p_normalized_address,upper(p_country_code),v_cache_key,p_provider,
    case when cached.cache_key is null then 'queued' else 'cached' end,cached.latitude,cached.longitude,cached.confidence,coalesce(cached.result_details,'{}'::jsonb),
    case when cached.cache_key is null then null else now() end) returning * into job;
  insert into public.stage_four_usage_daily(scope_type,scope_key,geocoding_requests)
  values('provider',p_provider,case when cached.cache_key is null then 1 else 0 end)
  on conflict(usage_date,scope_type,scope_key) do update set geocoding_requests=public.stage_four_usage_daily.geocoding_requests+excluded.geocoding_requests,updated_at=now();
  return job;
end $$;

create or replace function public.refresh_data_quality_snapshots()
returns integer language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare inserted_count integer;
begin
  if not private.stage_four_actor_allowed() then raise exception 'admin or service role required' using errcode='42501'; end if;
  with countries as (select unnest(array['DE','AT','CH']) country_code), raw as (
    select c.country_code,
      count(e.id) event_count, count(e.id) filter(where e.event_status='active') active_count,
      count(e.id) filter(where e.event_status='active' and e.verification_status='verified') verified_count,
      count(e.id) filter(where nullif(e.official_url,'') is not null) official_count,
      count(e.id) filter(where e.latitude is not null and e.longitude is not null) coordinate_count,
      count(e.id) filter(where e.next_check_at is not null) next_check_count,
      count(e.id) filter(where nullif(e.image,'') is not null) image_count,
      count(e.id) filter(where exists(select 1 from public.event_sources s where s.event_id=e.id)) source_count,
      count(e.id) filter(where exists(select 1 from public.event_editions ed where ed.event_id=e.id and ed.start_date>=current_date)) future_count,
      count(e.id) filter(where exists(select 1 from public.event_editions ed where ed.event_id=e.id and nullif(ed.registration_url,'') is not null)) registration_count,
      count(e.id) filter(where exists(select 1 from public.event_editions ed where ed.event_id=e.id and jsonb_array_length(ed.race_formats)>0)) distance_count,
      avg(extract(epoch from (now()-e.last_verified_at))/86400) filter(where e.last_verified_at is not null) age_days
    from countries c left join public.events e on (case lower(e.country)
      when 'de' then 'DE' when 'deutschland' then 'DE' when 'germany' then 'DE'
      when 'at' then 'AT' when 'österreich' then 'AT' when 'oesterreich' then 'AT' when 'austria' then 'AT'
      when 'ch' then 'CH' when 'schweiz' then 'CH' when 'suisse' then 'CH' when 'svizzera' then 'CH' when 'switzerland' then 'CH'
    end)=c.country_code group by c.country_code
  ), rates as (
    select *, greatest(event_count,1) denominator, greatest(active_count,1) active_denominator from raw
  )
  insert into public.data_quality_snapshots(
    country_code,event_count,active_event_count,verified_active_rate,official_url_rate,coordinate_rate,future_date_rate,next_check_rate,
    image_rate,registration_url_rate,distance_rate,source_rate,average_verification_age_days,open_critical_issues,open_warnings,
    possible_duplicates,past_without_successor,data_quality_score,score_factors
  ) select country_code,event_count,active_count,
    verified_count::numeric/active_denominator,official_count::numeric/denominator,coordinate_count::numeric/denominator,
    future_count::numeric/denominator,next_check_count::numeric/denominator,image_count::numeric/denominator,
    registration_count::numeric/denominator,distance_count::numeric/denominator,source_count::numeric/denominator,age_days,
    (select count(*) from public.validation_issues v join public.events ev on ev.id=v.event_id where upper(ev.country)=rates.country_code and v.status='open' and v.severity='critical'),
    (select count(*) from public.validation_issues v join public.events ev on ev.id=v.event_id where upper(ev.country)=rates.country_code and v.status='open' and v.severity='warning'),
    (select count(*) from public.duplicate_candidates d join public.discovery_candidates dc on dc.id=d.discovery_candidate_id where dc.country_code=rates.country_code and d.review_status='pending'),
    (select count(*) from public.events ev where upper(ev.country)=rates.country_code and exists(select 1 from public.event_editions ed where ed.event_id=ev.id) and not exists(select 1 from public.event_editions ed where ed.event_id=ev.id and ed.start_date>=current_date)),
    round(100*(0.20*verified_count/active_denominator + 0.12*official_count/denominator + 0.14*coordinate_count/denominator +
      0.14*future_count/denominator + 0.08*next_check_count/denominator + 0.06*image_count/denominator +
      0.08*registration_count/denominator + 0.08*distance_count/denominator + 0.10*source_count/denominator),2),
    jsonb_build_object('verified_active',verified_count::numeric/active_denominator,'official_url',official_count::numeric/denominator,
      'coordinates',coordinate_count::numeric/denominator,'future_date',future_count::numeric/denominator,
      'next_check',next_check_count::numeric/denominator,'image',image_count::numeric/denominator,
      'registration_url',registration_count::numeric/denominator,'distances',distance_count::numeric/denominator,'source',source_count::numeric/denominator)
  from rates;
  get diagnostics inserted_count=row_count;
  return inserted_count;
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

create or replace function public.prepare_stage_four_bulk_operation(p_action_code text, p_item_type text, p_item_ids text[], p_impact_summary text)
returns public.bulk_operations language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare settings public.stage_four_settings; operation public.bulk_operations; distinct_count integer; preview_hash text;
begin
  if not private.stage_four_actor_allowed() or (select auth.uid()) is null then raise exception 'admin required' using errcode='42501'; end if;
  if p_action_code not in ('confirm_unchanged_sources','accept_safe_registration_changes','complete_past_editions','retry_selected_sources','reject_discovery_candidates','assign_candidates_to_event','reschedule_next_check') then raise exception 'unsupported bulk action' using errcode='22023'; end if;
  select count(distinct id) into distinct_count from unnest(p_item_ids) id;
  if distinct_count not between 1 and 100 then raise exception 'bulk operation requires 1..100 distinct items' using errcode='22023'; end if;
  select * into settings from public.stage_four_settings where singleton;
  preview_hash:=md5(p_action_code || ':' || p_item_type || ':' || array_to_string((select array_agg(distinct id order by id) from unnest(p_item_ids) id),',') || ':' || settings.updated_at::text);
  insert into public.bulk_operations(action_code,dry_run,affected_count,impact_summary,preview_hash,requested_by,metadata)
  values(p_action_code,settings.dry_run,distinct_count,p_impact_summary,preview_hash,(select auth.uid()),jsonb_build_object('confirmation_required',true,'transactional',true)) returning * into operation;
  insert into public.bulk_operation_items(operation_id,item_id,item_type)
  select operation.id,id,p_item_type from (select distinct unnest(p_item_ids) id) items;
  return operation;
end $$;

create or replace function public.execute_stage_four_bulk_operation(p_operation_id uuid, p_preview_hash text)
returns public.bulk_operations language plpgsql security definer set search_path=pg_catalog,public,private
as $$
declare operation public.bulk_operations; settings public.stage_four_settings;
begin
  if not private.stage_four_actor_allowed() or (select auth.uid()) is null then raise exception 'admin required' using errcode='42501'; end if;
  select * into operation from public.bulk_operations where id=p_operation_id for update;
  if operation.id is null or operation.operation_status <> 'preview' or operation.preview_hash <> p_preview_hash then raise exception 'stale or invalid preview' using errcode='40001'; end if;
  select * into settings from public.stage_four_settings where singleton;
  if operation.dry_run or settings.dry_run then
    update public.bulk_operation_items set item_status='simulated' where operation_id=operation.id;
    update public.bulk_operations set operation_status='simulated',confirmed_by=(select auth.uid()),confirmed_at=now(),completed_at=now() where id=operation.id returning * into operation;
    insert into public.stage_four_audit_log(action_code,entity_type,entity_id,operation_id,actor_id,actor_process,dry_run,outcome,reasons)
    values(operation.action_code,'bulk_operation',operation.id::text,operation.id,(select auth.uid()),current_user,true,'simulated','["phase_a_dry_run"]'::jsonb);
    return operation;
  end if;
  -- Live bulk execution remains deliberately unavailable until rollout observation has been accepted.
  raise exception 'live bulk execution is not enabled in Stage-4 preparation' using errcode='55000';
end $$;

create or replace view public.stage_four_country_dashboard with (security_invoker=true) as
select rollout.country_code, rollout.country_name, rollout.rollout_status, rollout.discovery_enabled,
  rollout.geocoding_enabled, rollout.automation_enabled, rollout.quality_target,
  snapshot.event_count, snapshot.active_event_count, snapshot.data_quality_score, snapshot.score_factors,
  snapshot.open_critical_issues, snapshot.open_warnings, snapshot.possible_duplicates,
  (select count(*) from public.discovery_candidates candidate where candidate.country_code=rollout.country_code and candidate.review_status='pending') open_discovery_candidates,
  (select count(*) from public.geocoding_jobs job where job.country_code=rollout.country_code and job.job_status in ('queued','needs_review','failed','rate_limited')) open_geocoding_jobs
from public.country_rollouts rollout
left join lateral (
  select * from public.data_quality_snapshots q where q.country_code=rollout.country_code order by calculated_at desc limit 1
) snapshot on true;

revoke all on public.stage_four_country_dashboard from public, anon, authenticated;
grant select on public.stage_four_country_dashboard to authenticated, service_role;

revoke all on function public.refresh_source_reliability_metrics(integer) from public, anon, authenticated;
revoke all on function public.evaluate_change_proposal_automation(uuid,boolean) from public, anon, authenticated;
revoke all on function public.simulate_stage_four_for_crawl(bigint) from public, anon, authenticated;
revoke all on function public.record_stage_four_crawl_automation(bigint) from public, anon, authenticated;
revoke all on function public.record_discovery_candidates(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.queue_geocoding_job(bigint,uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.refresh_data_quality_snapshots() from public, anon, authenticated;
revoke all on function public.refresh_stage_four_monitoring() from public, anon, authenticated;
revoke all on function public.prepare_stage_four_bulk_operation(text,text,text[],text) from public, anon, authenticated;
revoke all on function public.execute_stage_four_bulk_operation(uuid,text) from public, anon, authenticated;

grant execute on function public.refresh_source_reliability_metrics(integer) to authenticated, service_role;
grant execute on function public.evaluate_change_proposal_automation(uuid,boolean) to authenticated, service_role;
grant execute on function public.simulate_stage_four_for_crawl(bigint) to authenticated, service_role;
grant execute on function public.record_stage_four_crawl_automation(bigint) to service_role;
grant execute on function public.record_discovery_candidates(uuid,jsonb) to service_role;
grant execute on function public.queue_geocoding_job(bigint,uuid,text,text,text,text,text) to authenticated, service_role;
grant execute on function public.refresh_data_quality_snapshots() to authenticated, service_role;
grant execute on function public.refresh_stage_four_monitoring() to authenticated, service_role;
grant execute on function public.prepare_stage_four_bulk_operation(text,text,text[],text) to authenticated;
grant execute on function public.execute_stage_four_bulk_operation(uuid,text) to authenticated;

comment on table public.stage_four_settings is 'Global Stage-4 rollout and cost guard; defaults prevent all live automation.';
comment on table public.automation_policies is 'Central explainable policy configuration. Rules are not scattered through workers.';
comment on table public.discovery_candidates is 'Non-public candidate staging. Acceptance never publishes directly.';
comment on table public.geocoding_jobs is 'Rate-limited, cached and review-gated geocoding workflow.';
comment on table public.stage_four_audit_log is 'Immutable operational audit history for simulations, policy decisions and bulk previews.';

commit;
