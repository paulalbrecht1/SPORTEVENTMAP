-- Read-only production verification for the P0 duplicate reconciliation.

with mapping(
  canonical_event_id,
  duplicate_event_id,
  canonical_edition_id,
  duplicate_edition_id
) as (
  values
    (123::bigint, 476::bigint, '4bcc25f6-c0d6-4b35-8d21-a7939a089eb5'::uuid, 'e9a440de-0f28-4f58-982f-8e4573c8a10a'::uuid),
    (436, 966, 'b45cc9f3-5885-4de8-8048-7b4f5067946f', 'e5bedc8e-4f23-4572-bdf7-5c03b0aa8500'),
    (74, 721, '14ff1d40-75a7-42d9-8076-13df4f59466c', '8efb9d79-b50f-4554-b3cb-4170dffb3917'),
    (125, 490, 'fda1a411-f5ac-438a-b895-8109497563a1', '5475fe4f-73ad-404f-8092-cfd37385088a'),
    (108, 979, '50b5b657-fd77-48e0-9c50-3ab91550e0ca', '5e580d8a-63af-4858-8556-c5c71aa14eff')
),
loser_sources as (
  select source.*
  from public.event_sources source
  join mapping on mapping.duplicate_event_id = source.event_id
)
select jsonb_build_object(
  'physical_counts', jsonb_build_object(
    'events', (select count(*) from public.events),
    'editions', (select count(*) from public.event_editions),
    'sources', (select count(*) from public.event_sources)
  ),
  'canonical_events', (
    select jsonb_agg(jsonb_build_object(
      'id', event.id,
      'name', event.canonical_name,
      'date', event.date,
      'city', event.city,
      'country', event.country,
      'status', event.status,
      'publication', event.publication_status,
      'verification', event.verification_status,
      'source_url', event.source_url
    ) order by event.id)
    from public.events event
    join mapping on mapping.canonical_event_id = event.id
  ),
  'duplicate_events', (
    select jsonb_agg(jsonb_build_object(
      'id', event.id,
      'status', event.status,
      'publication', event.publication_status,
      'event_status', event.event_status,
      'edition_discovery', edition.discovery_status,
      'edition_publication', edition.publication_status
    ) order by event.id)
    from mapping
    join public.events event on event.id = mapping.duplicate_event_id
    join public.event_editions edition on edition.id = mapping.duplicate_edition_id
  ),
  'public_views', jsonb_build_object(
    'canonical_discovery', (
      select count(*)
      from public.public_event_discovery view_row
      join mapping
        on mapping.canonical_event_id = view_row.event_id
       and mapping.canonical_edition_id = view_row.edition_id
    ),
    'duplicate_discovery', (
      select count(*)
      from public.public_event_discovery view_row
      join mapping on mapping.duplicate_event_id = view_row.event_id
    ),
    'canonical_archive', (
      select count(*)
      from public.public_event_archive view_row
      join mapping
        on mapping.canonical_event_id = view_row.event_id
       and mapping.canonical_edition_id = view_row.edition_id
    ),
    'duplicate_archive', (
      select count(*)
      from public.public_event_archive view_row
      join mapping on mapping.duplicate_event_id = view_row.event_id
    )
  ),
  'loser_sources', jsonb_build_object(
    'total', (select count(*) from loser_sources),
    'inactive', (
      select count(*)
      from loser_sources
      where is_active is false
        and crawl_status = 'inactive'
        and next_fetch_at is null
    ),
    'active_jobs', (
      select count(*)
      from public.source_crawl_jobs job
      join loser_sources source on source.id = job.source_id
      where job.status in ('queued', 'processing', 'retry_scheduled')
    )
  ),
  'user_refs', jsonb_build_object(
    'favorites', (
      select count(*)
      from public.favorites favorite
      join mapping on mapping.duplicate_event_id = favorite.event_ref
    ),
    'planner', (
      select count(*)
      from public.season_planner_events planner
      join mapping on mapping.duplicate_edition_id = planner.edition_id
    )
  ),
  'audit', jsonb_build_object(
    'event_ids', (
      select count(distinct audit.entity_id)
      from public.event_audit_log audit
      join mapping
        on audit.entity_id in (
          mapping.canonical_event_id::text,
          mapping.duplicate_event_id::text
        )
      where audit.entity_type = 'event'
        and audit.change_source = 'manual_admin'
        and audit.reason = 'P0 duplicate reconciliation: official-source verification on 2026-09-04'
    ),
    'duplicate_status_changes', (
      select count(distinct audit.entity_id)
      from public.event_audit_log audit
      join mapping on audit.entity_id = mapping.duplicate_event_id::text
      where audit.entity_type = 'event'
        and audit.field_name = 'status'
        and audit.new_value = to_jsonb('duplicate'::text)
        and audit.change_source = 'manual_admin'
        and audit.reason = 'P0 duplicate reconciliation: official-source verification on 2026-09-04'
    )
  ),
  'backups', (
    select jsonb_object_agg(entity_table, row_count order by entity_table)
    from (
      select entity_table, count(*) as row_count
      from private.event_data_workflow_backup
      where migration_key = '20260904_p0_duplicate_reconciliation'
      group by entity_table
    ) backup_counts
  ),
  'alert_15932', (
    select jsonb_build_object(
      'status', alert_status,
      'resolved_at', resolved_at,
      'recovery_reason', metadata ->> 'recovery_reason'
    )
    from public.data_workflow_alerts
    where id = 15932
  ),
  'target_domain_policies', (
    select count(*)
    from public.crawler_domain_policies
    where source_host in (
      'einsteinmarathon.de',
      'www.hahnenklee.de',
      'www.montafon.at',
      'www.schwarzwaldmarathon.de',
      'www.wep-lauf.de'
    )
  )
) as production_verification;
