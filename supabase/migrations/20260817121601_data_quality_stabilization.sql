-- Data-quality stabilization hotfix. This migration is intentionally ordered
-- before the held Stage-3/Stage-4 series and can be reviewed independently.
-- It does not publish event facts, run mass verification, or enable automation.

begin;

-- New editions and result links remain explicit admin decisions. The older
-- confirmation-gated automation is disabled and cannot be re-enabled by a
-- configuration-only write.
update public.edition_lifecycle_settings
set auto_publish_enabled = false,
    auto_result_publish_enabled = false,
    updated_at = now()
where singleton;

alter table public.edition_lifecycle_settings
  drop constraint if exists edition_lifecycle_publication_automation_disabled_check;
alter table public.edition_lifecycle_settings
  add constraint edition_lifecycle_publication_automation_disabled_check
  check (auto_publish_enabled is false and auto_result_publish_enabled is false);

-- A successful HTTP request proves reachability, not content correctness. A
-- recovered source therefore moves the event into review instead of restoring
-- a verified state or advancing last_verified_at.
create or replace function private.restore_recovered_source_events(
  p_source_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  affected integer := 0;
begin
  update public.events event
  set verification_status = 'needs_review',
      needs_review = true,
      next_check_at = least(coalesce(event.next_check_at, now()), now()),
      updated_at = now()
  from public.event_sources source
  where event.id = source.event_id
    and (p_source_id is null or source.id = p_source_id)
    and event.verification_status = 'source_unreachable'
    and source.is_active is true
    and source.consecutive_failures = 0
    and source.crawl_status in ('success', 'not_modified')
    and source.last_fetched_at is not null
    and not exists (
      select 1
      from public.event_sources failing_source
      where failing_source.event_id = event.id
        and failing_source.is_active is true
        and (
          failing_source.consecutive_failures > 0
          or failing_source.crawl_status in (
            'failed', 'source_unreachable', 'unreachable', 'dead_letter',
            'blocked', 'parse_error', 'http_error'
          )
        )
    );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function private.restore_recovered_source_events(uuid)
  from public, anon, authenticated;

comment on function private.restore_recovered_source_events(uuid) is
  'Moves technically recovered events into content review; reachability never restores content verification.';

-- Reproducible one-row quality snapshot for the current Discovery denominator.
-- "Current" uses exactly one active, published, non-completed edition per event.
create or replace view public.admin_current_event_quality_metrics
with (security_invoker = true)
as
with current_editions as (
  select distinct on (edition.event_id)
    edition.*
  from public.event_editions edition
  where edition.publication_status = 'published'
    and edition.discovery_status = 'active'
    and edition.edition_status not in ('cancelled', 'inactive', 'completed')
    and (
      coalesce(edition.end_date, edition.start_date) is null
      or coalesce(edition.end_date, edition.start_date) >= current_date
    )
  order by edition.event_id,
    coalesce(edition.start_date, 'infinity'::date),
    edition.edition_year,
    edition.id
), source_state as (
  select
    edition.id as edition_id,
    bool_or(source.is_active) as has_active_source,
    bool_or(
      source.is_active
      and source.consecutive_failures = 0
      and source.crawl_status in ('success', 'not_modified')
      and source.last_fetched_at is not null
    ) as source_reachable,
    bool_or(
      source.is_active
      and (
        source.consecutive_failures > 0
        or source.crawl_status in (
          'failed', 'source_unreachable', 'unreachable', 'dead_letter',
          'blocked', 'parse_error', 'http_error'
        )
      )
    ) as source_error
  from current_editions edition
  left join public.event_sources source
    on source.event_id = edition.event_id
   and (source.edition_id is null or source.edition_id = edition.id)
  group by edition.id
), measured as (
  select
    event.id as event_id,
    event.country,
    edition.id as edition_id,
    (
      edition.verification_status = 'verified'
      and edition.needs_review is not true
      and edition.last_verified_at is not null
      and edition.next_check_at > now()
    ) as is_fresh,
    (
      edition.needs_review is true
      or edition.verification_status <> 'verified'
      or edition.last_verified_at is null
      or edition.next_check_at is null
      or edition.next_check_at <= now()
    ) as review_required,
    coalesce(source_state.source_error, false) as source_error,
    (
      coalesce(source_state.has_active_source, false)
      and coalesce(source_state.source_reachable, false)
      and not coalesce(source_state.source_error, false)
    ) as source_healthy,
    (
      nullif(btrim(coalesce(event.canonical_name, event.event_name)), '') is not null
      and nullif(btrim(event.sport), '') is not null
      and nullif(btrim(event.country), '') is not null
      and nullif(btrim(event.city), '') is not null
      and event.latitude is not null
      and event.longitude is not null
      and edition.start_date is not null
      and (
        nullif(btrim(coalesce(edition.legacy_distance, event.distance)), '') is not null
        or (
          jsonb_typeof(coalesce(edition.race_formats, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(edition.race_formats, '[]'::jsonb)) > 0
        )
      )
      and length(btrim(coalesce(event.description, ''))) >= 80
      and coalesce(
        nullif(btrim(edition.registration_url), ''),
        nullif(btrim(event.official_url), ''),
        nullif(btrim(event.event_url), '')
      ) is not null
      and coalesce(source_state.has_active_source, false)
    ) as is_complete
  from current_editions edition
  join public.events event on event.id = edition.event_id
  left join source_state on source_state.edition_id = edition.id
)
select
  now() as calculated_at,
  count(*)::integer as current_events,
  count(*) filter (where is_fresh)::integer as fresh_events,
  count(*) filter (where not is_fresh)::integer as stale_events,
  count(*) filter (where review_required)::integer as review_required_events,
  count(*) filter (where source_error)::integer as source_error_events,
  count(*) filter (where is_complete)::integer as complete_events,
  count(*) filter (where not is_complete)::integer as incomplete_events,
  count(*) filter (
    where lower(coalesce(country, '')) in ('de', 'deutschland', 'germany')
  )::integer as current_de_events,
  case when count(*) = 0 then 0 else
    round(100 * count(*) filter (where is_fresh)::numeric / count(*)::numeric, 2)
  end as freshness_rate,
  case when count(*) = 0 then 0 else
    round(100 * count(*) filter (where is_complete)::numeric / count(*)::numeric, 2)
  end as complete_rate,
  case when count(*) = 0 then 0 else
    round(100 * count(*) filter (where source_healthy)::numeric / count(*)::numeric, 2)
  end as source_health_rate,
  case when count(*) = 0 then 0 else
    round(100 * count(*) filter (where review_required)::numeric / count(*)::numeric, 2)
  end as review_rate
from measured;

revoke all on public.admin_current_event_quality_metrics
  from public, anon, authenticated;
grant select on public.admin_current_event_quality_metrics to authenticated;

comment on view public.admin_current_event_quality_metrics is
  'Admin-only reproducible current-event freshness, completeness, source-health and review metrics.';

-- Historical source failures remain visible after recovery. Classification is
-- deterministic and advisory; retry scheduling continues to use the existing
-- bounded Source Monitor queue and max_attempts logic.
create or replace view public.admin_source_failure_history
with (security_invoker = true)
as
select
  job.id as job_id,
  job.source_id,
  job.event_id,
  job.edition_id,
  source.source_url,
  source.source_type,
  source.source_host,
  job.status as job_status,
  job.attempt_count,
  job.max_attempts,
  job.error_type,
  job.error_message,
  result.http_status,
  result.final_url,
  job.created_at,
  job.last_processed_at,
  job.completed_at,
  (
    source.is_active
    and (
      source.consecutive_failures > 0
      or source.crawl_status in (
        'failed', 'source_unreachable', 'unreachable', 'dead_letter',
        'blocked', 'parse_error', 'http_error'
      )
    )
  ) as currently_active,
  case
    when job.error_type in ('http_404', 'http_410') then 'page_removed_or_changed'
    when job.error_type in ('invalid_redirect', 'too_many_redirects', 'redirect_error', 'redirect_limit') then 'redirect'
    when job.error_type in ('timeout', 'network_error', 'connect_error', 'pinned_connect_error') then 'timeout_or_connection'
    when job.error_type = 'dns_error' then 'dns'
    when job.error_type = 'tls_error' then 'tls'
    when job.error_type = 'http_429' then 'rate_limit'
    when job.error_type in ('http_401', 'http_403', 'robots_denied') then 'access_or_bot_protection'
    when job.error_type = 'robots_unavailable' then 'robots_temporarily_unavailable'
    when job.error_type in ('empty_content', 'unsupported_content_type', 'unsupported_content_encoding', 'response_too_large') then 'content_or_parser'
    when job.error_type in ('invalid_url', 'unsupported_protocol', 'unsupported_port', 'embedded_credentials') then 'invalid_source_url'
    when job.error_type = 'source_replaced' then 'source_replaced'
    when job.error_type ~ '^http_5[0-9][0-9]$' then 'upstream_server_error'
    when job.error_type ~ '^http_[0-9]+$' then 'http_other'
    else 'technical_other'
  end as error_category,
  (
    job.status <> 'dead_letter'
    and job.attempt_count < job.max_attempts
    and (
      job.error_type in (
        'timeout', 'network_error', 'connect_error', 'pinned_connect_error',
        'dns_error', 'tls_error', 'http_408', 'http_425', 'http_429',
        'robots_unavailable', 'empty_content', 'worker_error'
      )
      or job.error_type ~ '^http_5[0-9][0-9]$'
    )
  ) as retryable_now,
  case
    when job.status = 'dead_letter' then 'Review: retry budget exhausted; preserve history and inspect source.'
    when job.error_type in ('http_404', 'http_410') then 'Review URL and official replacement; do not cancel or delete the event automatically.'
    when job.error_type in ('invalid_redirect', 'too_many_redirects', 'redirect_error', 'redirect_limit') then 'Inspect redirect target and domain before changing the canonical source.'
    when job.error_type in ('http_401', 'http_403', 'robots_denied') then 'Review access policy or bot protection; do not bypass access controls.'
    when job.error_type in ('invalid_url', 'unsupported_protocol', 'unsupported_port', 'embedded_credentials', 'source_replaced') then 'Manual source review required.'
    else 'Use the existing bounded retry schedule; escalate to review after max_attempts.'
  end as recommended_action
from public.source_crawl_jobs job
join public.event_sources source on source.id = job.source_id
left join lateral (
  select crawl.http_status, crawl.final_url
  from public.source_crawl_results crawl
  where crawl.job_id = job.id
  order by crawl.created_at desc, crawl.id desc
  limit 1
) result on true
where job.error_type is not null or job.status = 'dead_letter';

revoke all on public.admin_source_failure_history
  from public, anon, authenticated;
grant select on public.admin_source_failure_history to authenticated;

comment on view public.admin_source_failure_history is
  'Admin-only classified Source Monitor failure and Dead-Letter history; no failure is deleted on recovery.';

-- Extend the existing inbox instead of creating another queue. Current stale
-- Discovery editions become explicit review items, while existing exceptions
-- remain deduplicated and gain a reproducible P0-P3 score and review context.
create or replace view public.admin_review_inbox
with (security_invoker = true)
as
with base_queue as (
  select base.item_type, base.item_id, base.event_id, base.edition_id,
    base.priority, base.title, base.description, base.confidence, base.status,
    base.created_at, base.batch_action, base.metadata
  from public.admin_exception_inbox base
  where base.item_type not in ('source', 'workflow')

  union all

  select source_item.item_type, source_item.item_id, source_item.event_id,
    source_item.edition_id, source_item.priority, source_item.title,
    source_item.description || case when source_item.related_count > 1
      then ' (' || source_item.related_count::text || ' technische Meldungen gebuendelt.)'
      else '' end,
    source_item.confidence, source_item.status, source_item.created_at,
    'review_source_bundle'::text as batch_action,
    source_item.metadata || jsonb_build_object(
      'source_url', source.source_url,
      'source_type', source.source_type,
      'source_host', source.source_host,
      'source_checked_at', source.last_fetched_at,
      'source_reachable', (
        source.consecutive_failures = 0
        and source.crawl_status in ('success', 'not_modified')
        and source.last_fetched_at is not null
      ),
      'source_error_type', source.last_error_type,
      'consecutive_failures', source.consecutive_failures,
      'related_count', source_item.related_count
    ) as metadata
  from (
    select distinct on (task.source_id)
      base.item_type, base.item_id, base.event_id, base.edition_id,
      base.priority, base.title, base.description, base.confidence, base.status,
      base.created_at, base.metadata, task.source_id,
      count(*) over (partition by task.source_id)::integer as related_count
    from public.admin_exception_inbox base
    join public.source_review_tasks task
      on base.item_type = 'source' and base.item_id = task.id::text
    order by task.source_id,
      case base.priority when 'critical' then 0 when 'high' then 1 else 2 end,
      case task.task_type when 'dead_letter' then 0 when 'content_invalid' then 1 else 2 end,
      base.created_at desc
  ) source_item
  join public.event_sources source on source.id = source_item.source_id

  union all

  select base.item_type, base.item_id, base.event_id, base.edition_id,
    base.priority, base.title, base.description, base.confidence, base.status,
    base.created_at, base.batch_action,
    base.metadata || jsonb_build_object(
      'source_id', alert.source_id,
      'source_url', source.source_url,
      'source_type', source.source_type,
      'source_host', source.source_host,
      'source_checked_at', source.last_fetched_at,
      'source_reachable', case when source.id is null then null else (
        source.consecutive_failures = 0
        and source.crawl_status in ('success', 'not_modified')
        and source.last_fetched_at is not null
      ) end,
      'source_error_type', source.last_error_type,
      'consecutive_failures', source.consecutive_failures
    ) as metadata
  from public.admin_exception_inbox base
  join public.data_workflow_alerts alert
    on base.item_type = 'workflow' and base.item_id = alert.id::text
  left join public.event_sources source on source.id = alert.source_id
  where not exists (
    select 1 from public.source_review_tasks task
    where task.source_id = alert.source_id and task.status = 'open'
      and task.task_type not in ('new_edition_candidate', 'results_available', 'content_changed')
      and task.priority in ('high', 'critical')
  )

  union all

  select
    'content_verification'::text as item_type,
    task.id::text as item_id,
    task.event_id,
    task.edition_id,
    task.priority,
    'Datenstand auf offizieller Quelle pruefen'::text as title,
    coalesce(task.description, 'Die offizielle Veranstaltungsseite hat sich geaendert.')
      || ' Eventfakten werden erst nach feldweiser manueller Sichtpruefung bestaetigt.' as description,
    edition.data_confidence as confidence,
    task.status,
    task.created_at,
    'verify_content'::text as batch_action,
    jsonb_build_object(
      'source_id', source.id,
      'source_url', source.source_url,
      'source_type', source.source_type,
      'source_host', source.source_host,
      'source_checked_at', source.last_fetched_at,
      'source_reachable', true,
      'crawl_result_id', result.id,
      'fetched_at', result.fetched_at,
      'http_status', result.http_status,
      'final_url', result.final_url,
      'change_confidence', result.change_confidence,
      'change_reasons', to_jsonb(coalesce(result.change_reasons, '{}'::text[])),
      'content_hash', result.content_hash,
      'previous_content_hash', result.previous_content_hash,
      'semantic_hash', result.semantic_hash,
      'previous_semantic_hash', result.previous_semantic_hash,
      'normalization_version', result.normalization_version,
      'stored_values', jsonb_build_object(
        'event_name', coalesce(event.canonical_name, event.event_name),
        'edition_year', edition.edition_year,
        'date', edition.start_date,
        'city', event.city,
        'country', event.country,
        'sport', event.sport,
        'distances', case
          when jsonb_typeof(coalesce(edition.race_formats, '[]'::jsonb)) = 'array'
            and jsonb_array_length(coalesce(edition.race_formats, '[]'::jsonb)) > 0
            then edition.race_formats
          else to_jsonb(coalesce(edition.legacy_distance, event.distance))
        end,
        'registration_status', edition.registration_status,
        'official_event_page', source.source_url,
        'registration_link', edition.registration_url
      ),
      'edition_verification_status', edition.verification_status,
      'last_verified_at', edition.last_verified_at,
      'next_check_at', edition.next_check_at
    ) as metadata
  from public.source_review_tasks task
  join public.event_sources source on source.id = task.source_id
  join public.events event on event.id = task.event_id
  join public.event_editions edition on edition.id = task.edition_id
  join public.source_crawl_results result on result.id = task.crawl_result_id
  where task.status = 'open'
    and task.task_type = 'content_changed'
    and task.priority = 'low'
    and source.is_active
    and source.source_type = 'official_event_website'
    and source.crawl_status in ('success', 'not_modified')
    and source.consecutive_failures = 0
    and edition.publication_status = 'published'
    and edition.edition_status = 'scheduled'
    and edition.start_date >= current_date
    and result.source_id = task.source_id
    and result.event_id = task.event_id
    and result.edition_id = task.edition_id
    and result.processing_status = 'completed'
    and result.error_type is null
    and result.http_status between 200 and 299
    and result.change_status = 'changed'
    and result.fetched_at >= task.created_at - interval '1 minute'
    and not exists (
      select 1 from public.source_review_tasks other_task
      where other_task.status = 'open'
        and (
          other_task.source_id = task.source_id
          or other_task.event_id = task.event_id
          or other_task.edition_id = task.edition_id
        )
        and other_task.id <> task.id
    )
    and not exists (
      select 1 from public.event_change_proposals proposal
      where proposal.proposal_status = 'pending'
        and (
          proposal.source_id = task.source_id
          or proposal.event_id = task.event_id
          or proposal.edition_id = task.edition_id
        )
    )
    and not exists (
      select 1 from public.validation_issues issue
      where issue.status = 'open'
        and issue.severity in ('error', 'critical')
        and (issue.event_id = task.event_id or issue.edition_id = task.edition_id)
    )
    and not exists (
      select 1 from public.data_workflow_alerts alert
      where alert.alert_status = 'open'
        and alert.severity in ('error', 'critical')
        and (
          alert.source_id = task.source_id
          or alert.event_id = task.event_id
          or alert.edition_id = task.edition_id
        )
    )
), current_context as (
  select distinct on (edition.event_id)
    event.id as event_id,
    edition.id as edition_id,
    event.country,
    edition.start_date,
    edition.verification_status,
    edition.needs_review,
    edition.last_verified_at,
    edition.next_check_at,
    edition.data_confidence,
    edition.registration_status,
    source_rollup.source_checked_at,
    coalesce(source_rollup.source_reachable, false) as source_reachable,
    coalesce(source_rollup.source_error, false) as source_error,
    best_source.source_id,
    best_source.source_url,
    best_source.source_type,
    array_remove(array[
      case when nullif(btrim(coalesce(event.canonical_name, event.event_name)), '') is null then 'event_name' end,
      case when edition.start_date is null then 'date' end,
      case when nullif(btrim(event.city), '') is null then 'city' end,
      case when nullif(btrim(event.country), '') is null then 'country' end,
      case when nullif(btrim(event.sport), '') is null then 'sport' end,
      case when event.latitude is null or event.longitude is null then 'geodata' end,
      case when nullif(btrim(coalesce(event.description, '')), '') is null then 'description' end,
      case when
        nullif(btrim(coalesce(edition.legacy_distance, event.distance)), '') is null
        and not (
          jsonb_typeof(coalesce(edition.race_formats, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(edition.race_formats, '[]'::jsonb)) > 0
        ) then 'distances' end,
      case when best_source.source_url is null then 'official_event_page' end,
      case when nullif(btrim(edition.registration_url), '') is null then 'registration_link' end
    ], null)::text[] as missing_fields,
    jsonb_build_object(
      'event_name', coalesce(event.canonical_name, event.event_name),
      'edition_year', edition.edition_year,
      'date', edition.start_date,
      'city', event.city,
      'country', event.country,
      'sport', event.sport,
      'distances', case
        when jsonb_typeof(coalesce(edition.race_formats, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(edition.race_formats, '[]'::jsonb)) > 0
          then edition.race_formats
        else to_jsonb(coalesce(edition.legacy_distance, event.distance))
      end,
      'registration_status', edition.registration_status,
      'official_event_page', best_source.source_url,
      'registration_link', edition.registration_url
    ) as stored_values,
    coalesce(pending_change.external_values, '{}'::jsonb) as external_values,
    coalesce(pending_change.affected_fields, '{}'::text[]) as externally_affected_fields
  from public.event_editions edition
  join public.events event on event.id = edition.event_id
  left join lateral (
    select
      max(source.last_fetched_at) as source_checked_at,
      bool_or(
        source.is_active
        and source.consecutive_failures = 0
        and source.crawl_status in ('success', 'not_modified')
        and source.last_fetched_at is not null
      ) as source_reachable,
      bool_or(
        source.is_active
        and (
          source.consecutive_failures > 0
          or source.crawl_status in (
            'failed', 'source_unreachable', 'unreachable', 'dead_letter',
            'blocked', 'parse_error', 'http_error'
          )
        )
      ) as source_error
    from public.event_sources source
    where source.event_id = edition.event_id
      and (source.edition_id is null or source.edition_id = edition.id)
  ) source_rollup on true
  left join lateral (
    select source.id as source_id, source.source_url, source.source_type
    from public.event_sources source
    where source.event_id = edition.event_id
      and (source.edition_id is null or source.edition_id = edition.id)
      and source.is_active
    order by
      case source.source_type
        when 'official_event_website' then 0
        when 'official_registration_platform' then 1
        else 2
      end,
      source.source_priority,
      source.id
    limit 1
  ) best_source on true
  left join lateral (
    select
      coalesce(proposal.observed_values, proposal.proposed_changes, '{}'::jsonb) as external_values,
      array(select jsonb_object_keys(
        coalesce(proposal.observed_values, proposal.proposed_changes, '{}'::jsonb)
      ))::text[] as affected_fields
    from public.event_change_proposals proposal
    where proposal.proposal_status = 'pending'
      and (proposal.edition_id = edition.id or proposal.event_id = edition.event_id)
    order by proposal.detected_at desc, proposal.id
    limit 1
  ) pending_change on true
  where edition.publication_status = 'published'
    and edition.discovery_status = 'active'
    and edition.edition_status not in ('cancelled', 'inactive', 'completed')
    and (
      coalesce(edition.end_date, edition.start_date) is null
      or coalesce(edition.end_date, edition.start_date) >= current_date
    )
  order by edition.event_id,
    coalesce(edition.start_date, 'infinity'::date),
    edition.edition_year,
    edition.id
), base_ranked as (
  select
    base.*,
    context.country,
    context.start_date,
    context.source_checked_at,
    context.source_reachable,
    context.source_error,
    context.stored_values,
    context.external_values,
    context.missing_fields,
    case
      when base.item_type = 'new_edition' then 'P0'
      when base.priority = 'critical' then 'P0'
      when base.item_type = 'proposal' and (
        coalesce(base.metadata->'old_values', '{}'::jsonb) ?| array[
          'event_status', 'edition_status', 'start_date', 'end_date', 'date',
          'city', 'country', 'location', 'official_url', 'source_url', 'domain',
          'edition_year', 'merge', 'delete'
        ]
        or coalesce(base.metadata->'new_values', '{}'::jsonb) ?| array[
          'event_status', 'edition_status', 'start_date', 'end_date', 'date',
          'city', 'country', 'location', 'official_url', 'source_url', 'domain',
          'edition_year', 'merge', 'delete'
        ]
      ) then 'P0'
      when context.event_id is not null
        and context.start_date <= current_date + 30
        and (
          context.source_error
          or not context.source_reachable
          or base.item_type in ('source', 'workflow', 'validation')
        ) then 'P0'
      when context.event_id is not null
        and lower(coalesce(context.country, '')) in ('de', 'deutschland', 'germany')
        then 'P1'
      when context.event_id is not null then 'P2'
      else 'P3'
    end as review_tier
  from base_queue base
  left join current_context context on context.event_id = base.event_id
), base_enriched as (
  select
    ranked.item_type,
    ranked.item_id,
    ranked.event_id,
    ranked.edition_id,
    case ranked.review_tier
      when 'P0' then 'critical'
      when 'P1' then 'high'
      when 'P2' then 'medium'
      else 'low'
    end as priority,
    ranked.title,
    ranked.description,
    ranked.confidence,
    ranked.status,
    ranked.created_at,
    case
      when ranked.item_type = 'new_edition' then 'review'
      when ranked.item_type = 'proposal' and ranked.review_tier = 'P0' then 'review'
      else ranked.batch_action
    end as batch_action,
    coalesce(ranked.metadata, '{}'::jsonb) || jsonb_build_object(
      'review_tier', ranked.review_tier,
      'priority_score',
        case ranked.review_tier when 'P0' then 400 when 'P1' then 300 when 'P2' then 200 else 100 end
        + greatest(0, 90 - coalesce(ranked.start_date - current_date, 90)),
      'priority_reasons', to_jsonb(array_remove(array[
        case when ranked.item_type = 'new_edition' then 'high_risk_new_edition' end,
        case when ranked.review_tier = 'P0' then 'critical_or_time_sensitive' end,
        case when lower(coalesce(ranked.country, '')) in ('de', 'deutschland', 'germany') then 'current_german_discovery_event' end,
        case when ranked.source_error then 'source_error' end,
        case when ranked.source_reachable is false then 'source_not_reachable' end
      ], null)::text[]),
      'affected_fields', to_jsonb(coalesce(
        nullif(ranked.missing_fields, '{}'::text[]),
        array(select jsonb_object_keys(coalesce(ranked.metadata->'new_values', '{}'::jsonb)))::text[],
        '{}'::text[]
      )),
      'stored_values', coalesce(ranked.metadata->'stored_values', ranked.stored_values, '{}'::jsonb),
      'external_values', coalesce(ranked.metadata->'new_values', ranked.metadata->'observed_values', ranked.external_values, '{}'::jsonb),
      'source_checked_at', coalesce(ranked.metadata->'source_checked_at', to_jsonb(ranked.source_checked_at)),
      'source_reachable', coalesce((ranked.metadata->>'source_reachable')::boolean, ranked.source_reachable, false),
      'source_checked', coalesce(ranked.metadata ? 'source_checked_at', ranked.source_checked_at is not null),
      'content_verified', false,
      'event_verified', false,
      'review_required', true,
      'recommended_action', case
        when ranked.item_type = 'new_edition' then 'Manually compare and approve or reject the new edition; never auto-publish.'
        when ranked.review_tier = 'P0' then 'Investigate official evidence before changing any event fact.'
        when ranked.item_type = 'content_verification' then 'Compare every central field with the official source and record structured evidence.'
        else 'Review the cited source and resolve the existing queue item.'
      end,
      'review_status', ranked.status
    ) as metadata
  from base_ranked ranked
), freshness_ranked as (
  select
    context.*,
    case
      when context.start_date <= current_date + 30
        and (
          context.source_error
          or not context.source_reachable
          or context.missing_fields && array[
            'event_name', 'date', 'city', 'country', 'sport', 'geodata', 'official_event_page'
          ]::text[]
        ) then 'P0'
      when lower(coalesce(context.country, '')) in ('de', 'deutschland', 'germany') then 'P1'
      else 'P2'
    end as review_tier
  from current_context context
  where not (
    context.verification_status = 'verified'
    and context.needs_review is not true
    and context.last_verified_at is not null
    and context.next_check_at > now()
  )
  and not exists (
    select 1 from base_queue existing
    where existing.edition_id = context.edition_id
      or (
        existing.edition_id is null
        and existing.event_id = context.event_id
        and existing.item_type in ('source', 'validation', 'workflow', 'proposal')
      )
  )
)
select * from base_enriched
where (select private.is_admin())

union all

select
  'freshness_review'::text as item_type,
  context.edition_id::text as item_id,
  context.event_id,
  context.edition_id,
  case context.review_tier when 'P0' then 'critical' when 'P1' then 'high' else 'medium' end as priority,
  'Aktuelle Austragung erneut verifizieren'::text as title,
  case
    when context.review_tier = 'P0' then 'Zeitnahes Event mit kritischem Quellen- oder Vollstaendigkeitsrisiko.'
    when context.review_tier = 'P1' then 'Aktuelles deutsches Discovery-Event ist stale oder zur erneuten Pruefung faellig.'
    else 'Aktuelles internationales Discovery-Event ist stale oder zur erneuten Pruefung faellig.'
  end as description,
  context.data_confidence as confidence,
  'open'::text as status,
  coalesce(context.next_check_at, context.last_verified_at, now()) as created_at,
  'review'::text as batch_action,
  jsonb_build_object(
    'review_tier', context.review_tier,
    'priority_score',
      case context.review_tier when 'P0' then 400 when 'P1' then 300 else 200 end
      + least(99, greatest(0, 120 - coalesce(context.start_date - current_date, 120))),
    'priority_reasons', to_jsonb(array_remove(array[
      'current_discovery_event',
      case when lower(coalesce(context.country, '')) in ('de', 'deutschland', 'germany') then 'germany_first' end,
      case when context.next_check_at is null then 'next_check_missing'
           when context.next_check_at <= now() then 'freshness_threshold_exceeded' end,
      case when context.start_date <= current_date + 30 then 'event_within_30_days' end,
      case when context.source_error then 'source_error' end,
      case when not context.source_reachable then 'source_not_reachable' end,
      case when cardinality(context.missing_fields) > 0 then 'important_fields_missing' end
    ], null)::text[]),
    'affected_fields', to_jsonb(
      (context.missing_fields || context.externally_affected_fields)::text[]
    ),
    'stored_values', context.stored_values,
    'external_values', context.external_values,
    'source_id', context.source_id,
    'source_url', context.source_url,
    'source_type', context.source_type,
    'source_checked_at', context.source_checked_at,
    'source_reachable', context.source_reachable,
    'source_checked', context.source_checked_at is not null,
    'content_verified', false,
    'event_verified', false,
    'review_required', true,
    'last_verified_at', context.last_verified_at,
    'next_check_at', context.next_check_at,
    'event_start_date', context.start_date,
    'country', context.country,
    'recommended_action', case
      when context.review_tier = 'P0' then 'Open the official source immediately; resolve contradictions through human review.'
      when context.review_tier = 'P1' then 'Re-verify all central fields from the official source.'
      else 'Re-verify after higher-priority German Discovery events.'
    end,
    'review_status', 'open'
  ) as metadata
from freshness_ranked context
where (select private.is_admin());

revoke all on public.admin_review_inbox from public, anon, authenticated;
grant select on public.admin_review_inbox to authenticated;

comment on view public.admin_review_inbox is
  'Single deduplicated admin queue with reproducible P0-P3 priority, current stale editions, field evidence and source state.';

-- Replace hash-only confirmation with field-level evidence. The function can
-- only confirm an unchanged stored data set. Any external difference, any
-- uncertain field, or any blocker leaves the review open for human handling.
create or replace function private.record_content_verification_audit(
  p_edition_id uuid,
  p_old_value jsonb,
  p_new_value jsonb,
  p_reason text,
  p_source_url text,
  p_changed_by uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if (select auth.uid()) is null
     or (select auth.uid()) is distinct from p_changed_by
     or not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  insert into public.event_audit_log (
    entity_type, entity_id, field_name, old_value, new_value,
    change_source, changed_by, changed_by_process, reason, source_url
  ) values (
    'edition', p_edition_id::text, '__content_verification__',
    p_old_value, p_new_value, 'manual_admin', p_changed_by,
    'content_verification_queue', p_reason, p_source_url
  );
end;
$$;

revoke all on function private.record_content_verification_audit(
  uuid, jsonb, jsonb, text, text, uuid
) from public, anon, authenticated;
grant execute on function private.record_content_verification_audit(
  uuid, jsonb, jsonb, text, text, uuid
) to authenticated, service_role;

drop function if exists public.verify_content_change_tasks(uuid[], text);

create function public.verify_content_change_tasks(
  p_task_ids uuid[],
  p_notes text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  requested_count integer := 0;
  eligible_count integer := 0;
  resolved_count integer := 0;
  verified_count integer := 0;
  task_record record;
  evidence_record jsonb;
  stored_values jsonb;
  observed_values jsonb;
  confirmed_fields text[];
  uncertain_fields text[];
  required_fields constant text[] := array[
    'event_name', 'edition_year', 'date', 'city', 'country', 'sport',
    'distances', 'registration_status', 'official_event_page', 'registration_link'
  ]::text[];
  checked_at timestamptz;
  evidence_confidence numeric;
  reviewer_id uuid := (select auth.uid());
  effective_review_notes text := nullif(btrim(p_notes), '');
  verified_edition_ids uuid[] := '{}'::uuid[];
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  if effective_review_notes is null or length(effective_review_notes) < 12 then
    raise exception 'review notes with at least 12 characters are required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'structured evidence must be a JSON object keyed by task id'
      using errcode = '22023';
  end if;

  select count(*) into requested_count
  from (
    select distinct requested.id
    from unnest(coalesce(p_task_ids, '{}'::uuid[])) requested(id)
  ) unique_ids;

  if requested_count = 0 then
    raise exception 'at least one task id is required' using errcode = '22023';
  end if;
  if requested_count > 50 then
    raise exception 'a maximum of 50 tasks can be verified at once' using errcode = '22023';
  end if;

  for task_record in
    select
      task.id,
      task.event_id,
      task.edition_id,
      task.source_id,
      source.source_url,
      event.canonical_name,
      event.event_name,
      event.city,
      event.country,
      event.sport,
      event.distance,
      edition.edition_year,
      edition.start_date,
      edition.race_formats,
      edition.legacy_distance,
      edition.registration_status,
      edition.registration_url,
      edition.last_verified_at,
      edition.next_check_at,
      result.fetched_at
    from public.source_review_tasks task
    join public.event_sources source on source.id = task.source_id
    join public.events event on event.id = task.event_id
    join public.event_editions edition on edition.id = task.edition_id
    join public.source_crawl_results result on result.id = task.crawl_result_id
    where task.id = any(p_task_ids)
      and task.status = 'open'
      and task.task_type = 'content_changed'
      and task.priority = 'low'
      and source.is_active
      and source.source_type = 'official_event_website'
      and source.crawl_status in ('success', 'not_modified')
      and source.consecutive_failures = 0
      and edition.publication_status = 'published'
      and edition.edition_status = 'scheduled'
      and edition.start_date >= current_date
      and result.source_id = task.source_id
      and result.event_id = task.event_id
      and result.edition_id = task.edition_id
      and result.processing_status = 'completed'
      and result.error_type is null
      and result.http_status between 200 and 299
      and result.change_status = 'changed'
      and result.fetched_at >= task.created_at - interval '1 minute'
      and not exists (
        select 1 from public.source_review_tasks other_task
        where other_task.status = 'open'
          and (
            other_task.source_id = task.source_id
            or other_task.event_id = task.event_id
            or other_task.edition_id = task.edition_id
          )
          and other_task.id <> task.id
          and not (other_task.id = any(p_task_ids))
      )
      and not exists (
        select 1 from public.event_change_proposals proposal
        where proposal.proposal_status = 'pending'
          and (
            proposal.source_id = task.source_id
            or proposal.event_id = task.event_id
            or proposal.edition_id = task.edition_id
          )
      )
      and not exists (
        select 1 from public.validation_issues issue
        where issue.status = 'open'
          and issue.severity in ('error', 'critical')
          and (issue.event_id = task.event_id or issue.edition_id = task.edition_id)
      )
      and not exists (
        select 1 from public.data_workflow_alerts alert
        where alert.alert_status = 'open'
          and alert.severity in ('error', 'critical')
          and (
            alert.source_id = task.source_id
            or alert.event_id = task.event_id
            or alert.edition_id = task.edition_id
          )
      )
    order by task.id
    for update of task, edition
  loop
    eligible_count := eligible_count + 1;
    evidence_record := p_evidence -> task_record.id::text;

    if evidence_record is null or jsonb_typeof(evidence_record) <> 'object' then
      raise exception 'structured evidence is missing for task %', task_record.id
        using errcode = '22023';
    end if;

    if coalesce(evidence_record->>'source_url', '') <> task_record.source_url then
      raise exception 'evidence source does not match the reviewed official source for task %', task_record.id
        using errcode = '22023';
    end if;

    begin
      checked_at := (evidence_record->>'source_checked_at')::timestamptz;
      evidence_confidence := (evidence_record->>'confidence')::numeric;
    exception when others then
      raise exception 'valid source_checked_at and confidence are required for task %', task_record.id
        using errcode = '22023';
    end;

    if checked_at < now() - interval '24 hours' or checked_at > now() + interval '5 minutes' then
      raise exception 'source inspection timestamp is outside the accepted 24-hour window for task %', task_record.id
        using errcode = '22023';
    end if;
    if evidence_confidence < 0.80 or evidence_confidence > 1 then
      raise exception 'content verification confidence must be between 0.80 and 1 for task %', task_record.id
        using errcode = '22023';
    end if;

    if jsonb_typeof(evidence_record->'confirmed_fields') <> 'array'
       or jsonb_typeof(evidence_record->'uncertain_fields') <> 'array'
       or jsonb_typeof(evidence_record->'observed_values') <> 'object' then
      raise exception 'confirmed_fields, uncertain_fields and observed_values are required for task %', task_record.id
        using errcode = '22023';
    end if;

    select coalesce(array_agg(value order by value), '{}'::text[])
      into confirmed_fields
    from jsonb_array_elements_text(evidence_record->'confirmed_fields') field(value);

    select coalesce(array_agg(value order by value), '{}'::text[])
      into uncertain_fields
    from jsonb_array_elements_text(evidence_record->'uncertain_fields') field(value);

    if cardinality(uncertain_fields) > 0 then
      raise exception 'uncertain fields require human review and cannot be marked verified for task %', task_record.id
        using errcode = 'P0001';
    end if;
    if confirmed_fields @> required_fields is not true
       or required_fields @> confirmed_fields is not true then
      raise exception 'all central fields must be explicitly confirmed for task %', task_record.id
        using errcode = 'P0001';
    end if;

    stored_values := jsonb_build_object(
      'event_name', coalesce(task_record.canonical_name, task_record.event_name),
      'edition_year', task_record.edition_year,
      'date', task_record.start_date,
      'city', task_record.city,
      'country', task_record.country,
      'sport', task_record.sport,
      'distances', case
        when jsonb_typeof(coalesce(task_record.race_formats, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(task_record.race_formats, '[]'::jsonb)) > 0
          then task_record.race_formats
        else to_jsonb(coalesce(task_record.legacy_distance, task_record.distance))
      end,
      'registration_status', task_record.registration_status,
      'official_event_page', task_record.source_url,
      'registration_link', task_record.registration_url
    );
    observed_values := evidence_record->'observed_values';

    if exists (
      select 1
      from unnest(required_fields) field_name
      where not (observed_values ? field_name)
        or observed_values->field_name is distinct from stored_values->field_name
    ) then
      raise exception 'official source differs from stored event data; keep task open for field-level review (%)', task_record.id
        using errcode = 'P0001';
    end if;

    update public.source_review_tasks
    set status = 'resolved',
        reviewed_at = now(),
        reviewed_by = reviewer_id,
        review_notes = effective_review_notes,
        updated_at = now()
    where id = task_record.id and status = 'open';
    get diagnostics resolved_count = row_count;

    perform private.record_content_verification_audit(
      task_record.edition_id,
      stored_values,
      evidence_record || jsonb_build_object(
        'task_id', task_record.id,
        'crawl_fetched_at', task_record.fetched_at,
        'policy_decision', 'unchanged_content_confirmed',
        'automatic_fact_changes', false
      ),
      effective_review_notes,
      task_record.source_url,
      reviewer_id
    );

    if not task_record.edition_id = any(verified_edition_ids) then
      perform set_config('app.change_source', 'manual_admin', true);
      perform set_config('app.change_reason', effective_review_notes, true);

      update public.event_editions
      set verification_status = 'verified',
          needs_review = false,
          last_verified_at = checked_at,
          next_check_at = now() + case
            when start_date <= current_date + 30 then interval '7 days'
            when start_date <= current_date + 90 then interval '14 days'
            else interval '30 days'
          end,
          updated_at = now()
      where id = task_record.edition_id;

      verified_count := verified_count + 1;
      verified_edition_ids := array_append(verified_edition_ids, task_record.edition_id);
    end if;
  end loop;

  if eligible_count <> requested_count then
    raise exception 'one or more tasks are no longer eligible for verification'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'requested_count', requested_count,
    'resolved_count', eligible_count,
    'verified_count', verified_count,
    'verified_edition_ids', to_jsonb(verified_edition_ids),
    'content_verified', true,
    'automatic_fact_changes', false
  );
end;
$$;

revoke all on function public.verify_content_change_tasks(uuid[], text, jsonb)
  from public, anon, authenticated;
grant execute on function public.verify_content_change_tasks(uuid[], text, jsonb)
  to authenticated;

comment on function public.verify_content_change_tasks(uuid[], text, jsonb) is
  'Admin-only unchanged-content confirmation with complete field evidence; mismatches and uncertainty remain human-review cases.';
comment on function private.record_content_verification_audit(uuid, jsonb, jsonb, text, text, uuid) is
  'Least-privilege admin-checked helper for immutable structured content-verification audit evidence.';

commit;
