-- Read-only production verification for the urgent P0 source reconciliation.

with target_sources(source_id) as (
  values
    ('3aa2079d-ee37-4a5c-9853-481eae88f819'::uuid),
    ('0f6e2ca7-5edd-44fd-ad00-2a1d07b4d465'::uuid),
    ('b43ebfb5-2836-485d-86d9-f0e24d1344c3'::uuid)
), target_editions(edition_id) as (
  values
    ('549ea3d0-a669-416a-8766-10b446a8ff26'::uuid),
    ('d01b2023-ecb6-4a49-a3e2-ae17e3fd0883'::uuid)
)
select jsonb_build_object(
  'events', (
    select jsonb_agg(jsonb_build_object(
      'event_id', event.id,
      'name', event.canonical_name,
      'date', event.date,
      'city', event.city,
      'distance', event.distance,
      'official_url', event.official_url,
      'registration_url', event.event_url,
      'registration_status', event.registration_status
    ) order by event.id)
    from public.events event
    where event.id in (336, 385)
  ),
  'editions', (
    select jsonb_agg(jsonb_build_object(
      'edition_id', edition.id,
      'start_date', edition.start_date,
      'end_date', edition.end_date,
      'source_url', edition.source_url,
      'registration_url', edition.registration_url,
      'registration_status', edition.registration_status,
      'race_formats', edition.race_formats,
      'verification_status', edition.verification_status,
      'needs_review', edition.needs_review,
      'last_verified_source_id', edition.last_verified_source_id,
      'in_discovery', exists (
        select 1
        from public.public_event_discovery discovery
        where discovery.edition_id = edition.id
      )
    ) order by edition.event_id)
    from public.event_editions edition
    join target_editions target on target.edition_id = edition.id
  ),
  'new_sources', (
    select jsonb_agg(jsonb_build_object(
      'source_id', source.id,
      'source_type', source.source_type,
      'source_url', source.source_url,
      'active', source.is_active,
      'crawl_status', source.crawl_status,
      'failures', source.consecutive_failures,
      'last_change_status', source.last_change_status,
      'last_fetched_at', source.last_fetched_at,
      'http_status', source.last_http_status
    ) order by source.id)
    from public.event_sources source
    join target_sources target on target.source_id = source.id
  ),
  'retired_source', (
    select jsonb_build_object(
      'source_id', source.id,
      'active', source.is_active,
      'crawl_status', source.crawl_status,
      'next_fetch_at', source.next_fetch_at,
      'active_jobs', (
        select count(*)
        from public.source_crawl_jobs job
        where job.source_id = source.id
          and job.status in ('queued', 'processing', 'retry_scheduled')
      )
    )
    from public.event_sources source
    where source.id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
  ),
  'new_source_jobs', (
    select jsonb_agg(jsonb_build_object(
      'source_id', job.source_id,
      'job_id', job.id,
      'status', job.status,
      'priority', job.priority,
      'attempt_count', job.attempt_count,
      'error_type', job.error_type
    ) order by job.source_id, job.created_at desc)
    from public.source_crawl_jobs job
    join target_sources target on target.source_id = job.source_id
  ),
  'old_source_open_workflow', jsonb_build_object(
    'alerts', (
      select count(*)
      from public.data_workflow_alerts alert
      where alert.source_id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
        and alert.alert_status = 'open'
    ),
    'tasks', (
      select count(*)
      from public.source_review_tasks task
      where task.source_id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
        and task.status = 'open'
    ),
    'source_validation_issues', (
      select count(*)
      from public.validation_issues issue
      where issue.status = 'open'
        and issue.rule_code =
          'source_unreachable_b70e48f0_b99c_4b53_8775_ed760fc9a7e1'
    )
  ),
  'backup_rows', (
    select jsonb_object_agg(backup.entity_table, backup.row_count)
    from (
      select entity_table, count(*) as row_count
      from private.event_data_workflow_backup
      where migration_key = '20260904_p0_urgent_source_reconciliation'
      group by entity_table
    ) backup
  ),
  'source_audit_rows', (
    select count(*)
    from public.event_audit_log audit
    where audit.entity_type = 'source'
      and audit.entity_id in (
        '3aa2079d-ee37-4a5c-9853-481eae88f819',
        '0f6e2ca7-5edd-44fd-ad00-2a1d07b4d465',
        'b43ebfb5-2836-485d-86d9-f0e24d1344c3',
        'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
      )
      and audit.reason =
        'P0 urgent source reconciliation: official-source review on 2026-09-04'
  ),
  'freshness_guard', public.get_public_event_freshness_guard(array[
    '549ea3d0-a669-416a-8766-10b446a8ff26'::uuid,
    'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883'::uuid
  ])
) as production_verification;
