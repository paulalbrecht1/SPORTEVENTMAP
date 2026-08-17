-- Read-only inventory and backfill preview for the Event/Edition boundary.
--
-- This file is intentionally not a migration. It contains exactly one prepared
-- WITH ... SELECT statement because `supabase db query --file` rejects multiple
-- commands. A static allowlist test rejects every mutating statement. Every
-- suggested action remains a preview and safe_to_auto_backfill is always false.

with
audit_session as materialized (
  select
    set_config('statement_timeout', '60s', true) as statement_timeout,
    set_config('lock_timeout', '2s', true) as lock_timeout,
    set_config('idle_in_transaction_session_timeout', '60s', true)
      as idle_in_transaction_session_timeout
),
latest_published_editions as (
  select distinct on (edition.event_id)
    edition.id,
    edition.event_id,
    edition.edition_year,
    edition.start_date,
    edition.end_date,
    edition.registration_url,
    edition.registration_status,
    edition.legacy_distance,
    edition.edition_status,
    edition.discovery_status
  from public.event_editions edition
  where edition.publication_status = 'published'
  order by edition.event_id, edition.edition_year desc,
    edition.start_date desc nulls last, edition.id
),
watching_events as (
  select latest.*
  from latest_published_editions latest
  where latest.edition_status = 'completed'
),
identity_integrity as (
  select jsonb_build_object(
    'events', (select count(*) from public.events),
    'editions', (select count(*) from public.event_editions),
    'events_without_editions', (
      select count(*) from public.events event
      where not exists (
        select 1 from public.event_editions edition where edition.event_id = event.id
      )
    ),
    'events_with_multiple_editions', (
      select count(*) from (
        select edition.event_id from public.event_editions edition
        group by edition.event_id having count(*) > 1
      ) grouped
    ),
    'duplicate_event_year_groups', (
      select count(*) from (
        select edition.event_id, edition.edition_year
        from public.event_editions edition
        group by edition.event_id, edition.edition_year having count(*) > 1
      ) grouped
    ),
    'duplicate_event_date_groups', (
      select count(*) from (
        select edition.event_id, edition.start_date
        from public.event_editions edition
        where edition.start_date is not null
        group by edition.event_id, edition.start_date having count(*) > 1
      ) grouped
    ),
    'editions_without_event', (
      select count(*) from public.event_editions edition
      left join public.events event on event.id = edition.event_id
      where event.id is null
    ),
    'scheduled_editions', (
      select count(*) from public.event_editions where edition_status = 'scheduled'
    ),
    'completed_editions', (
      select count(*) from public.event_editions where edition_status = 'completed'
    ),
    'cancelled_editions', (
      select count(*) from public.event_editions where edition_status = 'cancelled'
    ),
    'postponed_editions', (
      select count(*) from public.event_editions where edition_status = 'postponed'
    ),
    'next_edition_unknown_watching', (select count(*) from watching_events),
    'watching_without_active_source', (
      select count(*) from watching_events watching
      where not exists (
        select 1 from public.event_sources source
        where source.event_id = watching.event_id and source.is_active
      )
    )
  ) as payload
),
planner_integrity as (
  select jsonb_build_object(
    'rows', (select count(*) from public.season_planner_events),
    'rows_without_edition_reference', (
      select count(*) from public.season_planner_events where edition_id is null
    ),
    'rows_with_missing_edition', (
      select count(*) from public.season_planner_events planner
      left join public.event_editions edition on edition.id = planner.edition_id
      where planner.edition_id is not null and edition.id is null
    ),
    'rows_with_legacy_key_mismatch', (
      select count(*) from public.season_planner_events planner
      join public.event_editions edition on edition.id = planner.edition_id
      where nullif(btrim(planner.event_id), '') is not null
        and lower(btrim(planner.event_id)) <> lower(btrim(edition.legacy_event_key))
    ),
    'edition_delete_is_restricted', exists (
      select 1 from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.season_planner_events'::regclass
        and constraint_row.conname = 'season_planner_events_edition_id_fkey'
        and constraint_row.confdeltype = 'r'
    )
  ) as payload
),
source_integrity as (
  select jsonb_build_object(
    'sources', (select count(*) from public.event_sources),
    'event_wide_sources', (
      select count(*) from public.event_sources where edition_id is null
    ),
    'edition_bound_sources', (
      select count(*) from public.event_sources where edition_id is not null
    ),
    'active_sources', (
      select count(*) from public.event_sources where is_active
    ),
    'active_unhealthy_sources', (
      select count(*) from public.event_sources
      where is_active and (
        consecutive_failures > 0 or crawl_status not in ('success', 'not_modified', 'pending')
      )
    ),
    'edition_event_mismatches', (
      select count(*) from public.event_sources source
      join public.event_editions edition on edition.id = source.edition_id
      where source.edition_id is not null and source.event_id <> edition.event_id
    ),
    'candidate_source_event_mismatches', (
      select count(*) from public.edition_succession_candidates candidate
      left join public.event_sources source on source.id = candidate.source_id
      where source.id is null or source.event_id <> candidate.event_id
    ),
    'candidate_crawl_binding_mismatches', (
      select count(*) from public.edition_succession_candidates candidate
      left join public.source_crawl_results crawl on crawl.id = candidate.crawl_result_id
      where candidate.crawl_result_id is not null and (
        crawl.id is null
        or crawl.source_id <> candidate.source_id
        or crawl.event_id <> candidate.event_id
      )
    )
  ) as payload
),
legacy_field_comparison as (
  select
    event.id as event_id,
    latest.id as latest_edition_id,
    nullif(btrim(event.date), '') as legacy_date,
    case when latest.start_date is null then null
      else to_char(latest.start_date, 'DD.MM.YYYY') end as edition_date,
    nullif(btrim(event.distance), '') as legacy_distance,
    nullif(btrim(latest.legacy_distance), '') as edition_distance,
    nullif(btrim(event.registration_status), '') as legacy_registration_status,
    nullif(btrim(latest.registration_status), '') as edition_registration_status,
    nullif(btrim(event.event_url), '') as legacy_event_url,
    nullif(btrim(latest.registration_url), '') as edition_registration_url
  from public.events event
  left join latest_published_editions latest on latest.event_id = event.id
),
legacy_field_summary as (
  select jsonb_build_object(
    'events_with_legacy_date', count(*) filter (where legacy_date is not null),
    'legacy_date_differs_from_latest_edition', count(*) filter (
      where latest_edition_id is not null
        and legacy_date is distinct from edition_date
    ),
    'events_with_legacy_distance', count(*) filter (where legacy_distance is not null),
    'legacy_distance_differs_from_latest_edition', count(*) filter (
      where latest_edition_id is not null
        and legacy_distance is distinct from edition_distance
    ),
    'events_with_legacy_registration_status', count(*) filter (
      where legacy_registration_status is not null
    ),
    'legacy_registration_status_differs_from_latest_edition', count(*) filter (
      where latest_edition_id is not null
        and legacy_registration_status is distinct from edition_registration_status
    ),
    'events_with_legacy_event_url', count(*) filter (where legacy_event_url is not null),
    'legacy_event_url_differs_from_latest_registration_url', count(*) filter (
      where latest_edition_id is not null
        and legacy_event_url is distinct from edition_registration_url
    ),
    'migration_decision', 'dependency_mapping_required_before_field_moves'
  ) as payload
  from legacy_field_comparison
),
knowledge_table_inventory as (
  select jsonb_build_object(
    'event_details', (select count(*) from public.event_details),
    'event_details_with_date', (
      select count(*) from public.event_details where nullif(btrim(date), '') is not null
    ),
    'event_registration', (select count(*) from public.event_registration),
    'event_course', (select count(*) from public.event_course),
    'event_race_day', (select count(*) from public.event_race_day),
    'event_statistics', (select count(*) from public.event_statistics),
    'tables_without_edition_id', (
      select coalesce(jsonb_agg(table_name order by table_name), '[]'::jsonb)
      from (
        select expected.table_name
        from (values
          ('event_details'), ('event_registration'), ('event_course'),
          ('event_race_day'), ('event_statistics')
        ) expected(table_name)
        where not exists (
          select 1 from information_schema.columns column_row
          where column_row.table_schema = 'public'
            and column_row.table_name = expected.table_name
            and column_row.column_name = 'edition_id'
        )
      ) missing
    ),
    'migration_decision', 'no_knowledge_base_backfill_before_consumer_audit'
  ) as payload
),
candidate_context as (
  select
    candidate.id as candidate_id,
    candidate.event_id,
    event.event_name,
    candidate.candidate_year,
    candidate.candidate_start_date,
    candidate.candidate_status,
    coalesce(to_jsonb(candidate)->>'validation_status', 'legacy_unvalidated')
      as validation_status,
    coalesce(to_jsonb(candidate)->'validation_reasons', '[]'::jsonb)
      as validation_reasons,
    candidate.confidence,
    candidate.confirmation_count,
    candidate.last_detected_at,
    candidate.draft_edition_id,
    same_year.id as same_year_edition_id,
    same_year.start_date as same_year_start_date,
    same_year.publication_status as same_year_publication_status,
    source.id is not null
      and source.event_id = candidate.event_id
      and source.is_active
      and source.consecutive_failures = 0
      and source.crawl_status in ('success', 'not_modified')
      and source.source_url ~* '^https://[^[:space:]]+$'
      and (
        source.source_type in ('official_event_website', 'official_registration_platform')
        or (
          source.source_type in ('organizer_calendar', 'federation_calendar')
          and source.source_priority <= 50
        )
      )
      as source_binding_usable,
    crawl.id is not null
      and crawl.source_id = candidate.source_id
      and crawl.event_id = candidate.event_id
      and crawl.processing_status = 'completed'
      and crawl.error_type is null
      and crawl.http_status between 200 and 299
      as crawl_binding_usable,
    exists (
      select 1 from public.edition_succession_candidates peer
      where peer.event_id = candidate.event_id
        and peer.candidate_year = candidate.candidate_year
        and peer.id <> candidate.id
        and peer.candidate_start_date <> candidate.candidate_start_date
        and peer.candidate_status in ('detected', 'draft_created', 'conflict')
    ) as has_peer_date_conflict,
    lower(coalesce(candidate.evidence->>'risk_signals', ''))
      ~ '(cancel|abgesagt|postpon|verschob)' as has_high_risk_evidence,
    to_regclass('public.event_field_controls') is not null
      as manual_lock_gate_available,
    exists (
      select 1 from public.validation_issues issue
      where issue.event_id = candidate.event_id
        and issue.status = 'open'
        and issue.severity in ('error', 'critical')
    ) as has_critical_validation_issue
  from public.edition_succession_candidates candidate
  join public.events event on event.id = candidate.event_id
  left join public.event_sources source on source.id = candidate.source_id
  left join public.source_crawl_results crawl on crawl.id = candidate.crawl_result_id
  left join public.event_editions same_year
    on same_year.event_id = candidate.event_id
   and same_year.edition_year = candidate.candidate_year
),
candidate_actions as (
  select context.*,
    case
      when candidate_status = 'approved' then 'retain_approved_history'
      when candidate_status = 'rejected' then 'retain_rejected_history'
      when candidate_status = 'superseded' then 'retain_superseded_history'
      when same_year_edition_id is not null
       and same_year_publication_status = 'published'
       and same_year_start_date = candidate_start_date
        then 'mark_superseded_after_review'
      when same_year_edition_id is not null
       and same_year_start_date is distinct from candidate_start_date
        then 'conflict_manual_review'
      when same_year_edition_id is not null
       and same_year_publication_status = 'draft'
        then 'reconcile_legacy_draft_manually'
      when candidate_status = 'conflict' or validation_status = 'conflict'
        or has_peer_date_conflict or has_high_risk_evidence
        then 'conflict_manual_review'
      when validation_status = 'blocked' or has_critical_validation_issue
        then 'revalidate_after_blocker_resolution'
      when not source_binding_usable or not crawl_binding_usable
        then 'revalidate_from_fresh_source_crawl'
      when validation_status = 'validated'
        then 'eligible_for_explicit_admin_review'
      else 'revalidate_with_candidate_first_gates'
    end as recommended_action,
    false as safe_to_auto_backfill
  from candidate_context context
),
candidate_action_counts as (
  select coalesce(jsonb_object_agg(recommended_action, action_count), '{}'::jsonb) as payload
  from (
    select recommended_action, count(*) as action_count
    from candidate_actions
    group by recommended_action
    order by recommended_action
  ) grouped
),
candidate_preview as (
  select coalesce(jsonb_agg(to_jsonb(preview) order by preview.event_id,
    preview.candidate_year, preview.candidate_start_date, preview.candidate_id), '[]'::jsonb) as payload
  from (
    select
      candidate_id,
      event_id,
      event_name,
      candidate_year,
      candidate_start_date,
      candidate_status,
      validation_status,
      validation_reasons,
      confidence,
      confirmation_count,
      last_detected_at,
      draft_edition_id,
      same_year_edition_id,
      has_peer_date_conflict,
      has_high_risk_evidence,
      manual_lock_gate_available,
      has_critical_validation_issue,
      recommended_action,
      safe_to_auto_backfill
    from candidate_actions
    order by event_id, candidate_year, candidate_start_date, candidate_id
    limit 250
  ) preview
),
legacy_draft_preview as (
  select coalesce(jsonb_agg(to_jsonb(preview) order by preview.event_id,
    preview.edition_year, preview.edition_id), '[]'::jsonb) as payload
  from (
    select
      edition.id as edition_id,
      edition.event_id,
      event.event_name,
      edition.edition_year,
      edition.start_date,
      edition.generated_from_candidate_id as candidate_id,
      candidate.candidate_status,
      case
        when candidate.id is null then 'manual_orphan_review'
        when candidate.candidate_start_date is distinct from edition.start_date
          then 'conflict_manual_review'
        else 'reconcile_legacy_draft_manually'
      end as recommended_action,
      false as safe_to_auto_backfill
    from public.event_editions edition
    join public.events event on event.id = edition.event_id
    left join public.edition_succession_candidates candidate
      on candidate.id = edition.generated_from_candidate_id
    where edition.publication_status = 'draft'
      and edition.generated_from_candidate_id is not null
    order by edition.event_id, edition.edition_year, edition.id
    limit 250
  ) preview
),
automation_safety as (
  select jsonb_build_object(
    'auto_publish_enabled', coalesce(
      (to_jsonb(settings)->>'auto_publish_enabled')::boolean, false
    ),
    'auto_result_publish_enabled', coalesce(
      (to_jsonb(settings)->>'auto_result_publish_enabled')::boolean, false
    ),
    'database_disable_constraint_present', exists (
      select 1 from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.edition_lifecycle_settings'::regclass
        and constraint_row.conname = 'edition_lifecycle_publication_automation_disabled_check'
    ),
    'automatic_backfill_allowed', false
  ) as payload
  from public.edition_lifecycle_settings settings
  where settings.singleton
)
select jsonb_build_object(
  'report_type', 'edition_backfill_readiness',
  'mode', 'read_only_preview',
  'generated_at', now(),
  'database', current_database(),
  'execution_guard', 'single_select_static_allowlist',
  'transaction_read_only', current_setting('transaction_read_only')::boolean,
  'statement_timeout', current_setting('statement_timeout'),
  'writes_attempted', 0,
  'identity_integrity', (select payload from identity_integrity),
  'planner_integrity', (select payload from planner_integrity),
  'source_integrity', (select payload from source_integrity),
  'legacy_event_fields', (select payload from legacy_field_summary),
  'knowledge_base', (select payload from knowledge_table_inventory),
  'candidate_action_counts', (select payload from candidate_action_counts),
  'candidate_preview_limit', 250,
  'candidate_preview_total', (select count(*) from candidate_actions),
  'candidate_preview', (select payload from candidate_preview),
  'legacy_candidate_draft_preview', (select payload from legacy_draft_preview),
  'automation_safety', coalesce(
    (select payload from automation_safety),
    jsonb_build_object(
      'settings_missing', true,
      'automatic_backfill_allowed', false
    )
  ),
  'next_gate', 'manual_review_before_any_backfill'
) as edition_backfill_readiness_report
from audit_session;
