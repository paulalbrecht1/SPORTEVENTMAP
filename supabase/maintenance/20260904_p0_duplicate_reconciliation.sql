-- P0 duplicate reconciliation, verified against official sources on 2026-09-04.
--
-- Canonical records retained:
--   123 <- 476  Einstein-Marathon
--   436 <- 966  10-Teiche-Marathon
--    74 <- 721  Montafon Arlberg Marathon
--   125 <- 490  Schwarzwald-Marathon
--   108 <- 979  wepLAUF
--
-- Official evidence:
--   https://einsteinmarathon.de/programm/termine/
--   https://www.hahnenklee.de/veranstaltungen/6742-10-teiche-marathon-in-hahnenklee
--   https://www.montafon.at/montafon-arlberg-marathon/de
--   https://www.schwarzwaldmarathon.de/
--   https://www.wep-lauf.de/
--
-- This maintenance transaction never deletes an event or edition. It refreshes
-- the reviewed canonical records, suppresses the duplicate records, disables
-- all of their crawler sources, and preserves targeted pre-change rows plus
-- trigger-affected workflow rows in private.event_data_workflow_backup.
-- Existing crawler history stays intact.

begin isolation level serializable;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('sporteventmap:p0-duplicate-reconciliation:20260904', 0)
);

select set_config('app.change_source', 'manual_admin', true);
select set_config(
  'app.change_reason',
  'P0 duplicate reconciliation: official-source verification on 2026-09-04',
  true
);

create temporary table p0_duplicate_reconciliation (
  canonical_event_id bigint primary key,
  duplicate_event_id bigint not null unique,
  canonical_edition_id uuid not null unique,
  duplicate_edition_id uuid not null unique,
  canonical_source_id uuid not null unique,
  duplicate_source_id uuid not null unique,
  expected_canonical_key text not null,
  canonical_key text not null,
  expected_duplicate_key text not null,
  canonical_name text not null,
  event_date date not null,
  city text not null,
  country text not null,
  address text not null,
  latitude text not null,
  longitude text not null,
  official_url text not null,
  evidence_url text not null,
  next_check_days integer not null check (next_check_days between 1 and 90),
  apply_needed boolean not null default true
) on commit drop;

insert into p0_duplicate_reconciliation (
  canonical_event_id,
  duplicate_event_id,
  canonical_edition_id,
  duplicate_edition_id,
  canonical_source_id,
  duplicate_source_id,
  expected_canonical_key,
  canonical_key,
  expected_duplicate_key,
  canonical_name,
  event_date,
  city,
  country,
  address,
  latitude,
  longitude,
  official_url,
  evidence_url,
  next_check_days
)
values
  (
    123,
    476,
    '4bcc25f6-c0d6-4b35-8d21-a7939a089eb5',
    'e9a440de-0f28-4f58-982f-8e4573c8a10a',
    '857a7500-5594-4b3f-be24-e24c78be05f8',
    'd98e2f4d-3e23-4786-a45c-29658d830538',
    'einstein-marathon-ulm-germany',
    'einstein-marathon-ulm-germany',
    'einstein-marathon-ulm-ulm-germany',
    'Einstein-Marathon',
    date '2026-09-27',
    'Ulm',
    'Germany',
    'Ulm, Germany',
    '48.3984968',
    '9.9912458',
    'https://einsteinmarathon.de/',
    'https://einsteinmarathon.de/programm/termine/',
    7
  ),
  (
    436,
    966,
    'b45cc9f3-5885-4de8-8048-7b4f5067946f',
    'e5bedc8e-4f23-4572-bdf7-5c03b0aa8500',
    '77fbae4a-3871-433f-85b3-82ef4d0ca8b9',
    '02bce201-e37e-4795-beec-6bd70f82ce96',
    '10-teiche-marathon-hahnenklee-germany',
    '10-teiche-marathon-hahnenklee-germany',
    '10-teiche-marathon-goslar-goslar-germany',
    '10-Teiche-Marathon',
    date '2026-09-12',
    'Hahnenklee',
    'Germany',
    'Hahnenklee, Germany',
    '51.8602508',
    '10.3384485',
    'https://www.hahnenklee.de/veranstaltungen/6742-10-teiche-marathon-in-hahnenklee',
    'https://www.hahnenklee.de/veranstaltungen/6742-10-teiche-marathon-in-hahnenklee',
    7
  ),
  (
    74,
    721,
    '14ff1d40-75a7-42d9-8076-13df4f59466c',
    '8efb9d79-b50f-4554-b3cb-4170dffb3917',
    'cf660754-3604-4ee8-8892-d0c3f6a5fba1',
    '5a2870bd-5b90-4bbe-958e-39f6e3b25ceb',
    'montafon-arlberg-marathon-st-anton-am-arlberg-austria',
    'montafon-arlberg-marathon-st-anton-am-arlberg-austria',
    'montafon-arlberg-marathon-st-anton-germany',
    'Montafon Arlberg Marathon',
    date '2027-06-26',
    'St. Anton am Arlberg',
    'Austria',
    'St. Anton am Arlberg, Austria',
    '47.1288996',
    '10.2663669',
    'https://www.montafon.at/montafon-arlberg-marathon/de',
    'https://www.montafon.at/montafon-arlberg-marathon/de',
    30
  ),
  (
    125,
    490,
    'fda1a411-f5ac-438a-b895-8109497563a1',
    '5475fe4f-73ad-404f-8092-cfd37385088a',
    '72e01a2d-aba1-4674-bff9-fcb35e9be678',
    '1101f726-ac69-4b41-a74a-b44ae838b291',
    'schwarzwald-marathon-braunlingen-germany',
    'schwarzwald-marathon-braunlingen-germany',
    'internationaler-schwarzwald-marathon-braunlingen-germany',
    'Schwarzwald-Marathon',
    date '2026-10-11',
    'Bräunlingen',
    'Germany',
    'Bräunlingen, Germany',
    '47.9300645',
    '8.448329',
    'https://www.schwarzwaldmarathon.de/',
    'https://www.schwarzwaldmarathon.de/',
    7
  ),
  (
    108,
    979,
    '50b5b657-fd77-48e0-9c50-3ab91550e0ca',
    '5e580d8a-63af-4858-8556-c5c71aa14eff',
    'c03533fb-50c4-4dd6-96cb-26718da80517',
    '95261d69-e53d-4202-84f8-d34339b072f3',
    'wep-strom-lauf-huckelhoven-germany',
    'weplauf-huckelhoven-germany',
    'weplauf-huckelhoven-huckelhoven-germany',
    'wepLAUF',
    date '2026-09-13',
    'Hückelhoven',
    'Germany',
    'Hückelhoven, Germany',
    '51.0552368',
    '6.2247322',
    'https://www.wep-lauf.de/',
    'https://www.wep-lauf.de/',
    7
  );

create temporary table p0_target_source_hosts
on commit drop
as
select distinct
  lower(split_part(regexp_replace(evidence_url, '^https?://', '', 'i'), '/', 1))
    as source_host
from p0_duplicate_reconciliation;

-- Crawl-job writes are held for this short transaction. Combined with the
-- serializable isolation level, this closes the scheduler race between the
-- active-job precondition and source deactivation.
lock table public.source_crawl_jobs in share mode;

do $preflight$
declare
  identity_count integer;
begin
  if (select count(*) from p0_duplicate_reconciliation) <> 5 then
    raise exception 'P0 duplicate precondition failed: expected exactly five mappings';
  end if;

  if (select count(*) from p0_target_source_hosts) <> 5 then
    raise exception 'P0 duplicate precondition failed: expected five distinct official source hosts';
  end if;

  -- Row locks prevent the source scheduler or another correction from changing
  -- one of the exact targets while this transaction is validating it.
  perform 1
  from public.events event
  where event.id in (
    select canonical_event_id from p0_duplicate_reconciliation
    union all
    select duplicate_event_id from p0_duplicate_reconciliation
  )
  for update;

  perform 1
  from public.event_editions edition
  where edition.id in (
    select canonical_edition_id from p0_duplicate_reconciliation
    union all
    select duplicate_edition_id from p0_duplicate_reconciliation
  )
  for update;

  perform 1
  from public.event_sources source
  where source.id in (
    select canonical_source_id from p0_duplicate_reconciliation
  )
     or source.event_id in (
       select duplicate_event_id from p0_duplicate_reconciliation
     )
  for update;

  perform 1
  from public.crawler_domain_policies policy
  join p0_target_source_hosts target on target.source_host = policy.source_host
  for update;

  select count(*) into identity_count
  from p0_duplicate_reconciliation mapping
  join public.events canonical_event
    on canonical_event.id = mapping.canonical_event_id
   and canonical_event.canonical_key in (
     mapping.expected_canonical_key,
     mapping.canonical_key
   )
  join public.events duplicate_event
    on duplicate_event.id = mapping.duplicate_event_id
   and duplicate_event.canonical_key = mapping.expected_duplicate_key
  join public.event_editions canonical_edition
    on canonical_edition.id = mapping.canonical_edition_id
   and canonical_edition.event_id = mapping.canonical_event_id
   and canonical_edition.edition_year = extract(year from mapping.event_date)::smallint
  join public.event_editions duplicate_edition
    on duplicate_edition.id = mapping.duplicate_edition_id
   and duplicate_edition.event_id = mapping.duplicate_event_id
   and duplicate_edition.edition_year = extract(year from mapping.event_date)::smallint
  join public.event_sources canonical_source
    on canonical_source.id = mapping.canonical_source_id
   and canonical_source.event_id = mapping.canonical_event_id
   and canonical_source.edition_id = mapping.canonical_edition_id
  join public.event_sources duplicate_source
    on duplicate_source.id = mapping.duplicate_source_id
   and duplicate_source.event_id = mapping.duplicate_event_id
   and duplicate_source.edition_id = mapping.duplicate_edition_id;

  if identity_count <> 5 then
    raise exception
      'P0 duplicate precondition failed: expected five exact event/edition/source identity chains, found %',
      identity_count;
  end if;

  if exists (
    select 1
    from p0_duplicate_reconciliation mapping
    join public.events canonical_event on canonical_event.id = mapping.canonical_event_id
    join public.event_editions canonical_edition on canonical_edition.id = mapping.canonical_edition_id
    join public.event_sources canonical_source on canonical_source.id = mapping.canonical_source_id
    where canonical_event.status <> 'approved'
       or canonical_event.publication_status <> 'published'
       or canonical_event.event_status <> 'active'
       or canonical_edition.publication_status <> 'published'
       or canonical_edition.discovery_status <> 'active'
       or canonical_edition.edition_status <> 'scheduled'
       or canonical_source.is_active is not true
       or canonical_source.crawl_status = 'fetching'
       or canonical_source.claimed_at is not null
       or canonical_source.claimed_by is not null
  ) then
    raise exception 'P0 duplicate precondition failed: a canonical row is not in the reviewed active state';
  end if;

  if exists (
    select 1
    from p0_duplicate_reconciliation mapping
    join public.events duplicate_event on duplicate_event.id = mapping.duplicate_event_id
    join public.event_editions duplicate_edition on duplicate_edition.id = mapping.duplicate_edition_id
    join public.event_sources duplicate_source on duplicate_source.id = mapping.duplicate_source_id
    where not (
      (
        duplicate_event.status = 'approved'
        and duplicate_event.publication_status = 'published'
        and duplicate_event.event_status = 'active'
        and duplicate_edition.publication_status = 'published'
        and duplicate_edition.discovery_status = 'active'
        and duplicate_edition.edition_status = 'scheduled'
        and duplicate_source.is_active is true
        and duplicate_source.crawl_status <> 'fetching'
        and duplicate_source.claimed_at is null
        and duplicate_source.claimed_by is null
      )
      or
      (
        duplicate_event.status = 'duplicate'
        and duplicate_event.publication_status = 'draft'
        and duplicate_event.event_status = 'inactive'
        and duplicate_edition.publication_status = 'draft'
        and duplicate_edition.discovery_status = 'suppressed'
        and duplicate_edition.edition_status = 'inactive'
        and duplicate_source.is_active is false
        and duplicate_source.crawl_status = 'inactive'
        and duplicate_source.next_fetch_at is null
        and duplicate_source.claimed_at is null
        and duplicate_source.claimed_by is null
      )
    )
  ) then
    raise exception 'P0 duplicate precondition failed: a duplicate row is in an unexpected partial state';
  end if;

  if exists (
    select 1
    from public.event_sources source
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_event_id = source.event_id
    where source.crawl_status = 'fetching'
       or source.claimed_at is not null
       or source.claimed_by is not null
  ) then
    raise exception 'P0 duplicate precondition failed: a duplicate event has a claimed source';
  end if;

  if exists (
    select 1
    from public.events conflicting_event
    join p0_duplicate_reconciliation mapping
      on mapping.canonical_key = conflicting_event.canonical_key
    where conflicting_event.id <> mapping.canonical_event_id
  ) then
    raise exception 'P0 duplicate precondition failed: a desired canonical key is already assigned elsewhere';
  end if;

  if exists (
    select 1
    from public.favorites favorite
    join p0_duplicate_reconciliation mapping
      on favorite.event_ref = mapping.duplicate_event_id
    union all
    select 1
    from public.favorites favorite
    join public.event_editions duplicate_edition
      on lower(favorite.event_id) = lower(duplicate_edition.legacy_event_key)
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_edition_id = duplicate_edition.id
  ) then
    raise exception 'P0 duplicate precondition failed: a favorite still references a duplicate record';
  end if;

  if exists (
    select 1
    from public.season_planner_events planner
    join p0_duplicate_reconciliation mapping
      on planner.edition_id = mapping.duplicate_edition_id
    union all
    select 1
    from public.season_planner_events planner
    join public.event_editions duplicate_edition
      on lower(planner.event_id) = lower(duplicate_edition.legacy_event_key)
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_edition_id = duplicate_edition.id
  ) then
    raise exception 'P0 duplicate precondition failed: a season-plan item still references a duplicate edition';
  end if;

  if exists (
    select 1
    from public.source_crawl_jobs job
    join public.event_sources source on source.id = job.source_id
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_event_id = source.event_id
    where job.status in ('queued', 'processing', 'retry_scheduled')
  ) then
    raise exception 'P0 duplicate precondition failed: a duplicate source still has an active crawl job';
  end if;

  update p0_duplicate_reconciliation mapping
  set apply_needed = duplicate_event.status <> 'duplicate'
  from public.events duplicate_event
  where duplicate_event.id = mapping.duplicate_event_id;
end
$preflight$;

create temporary table p0_duplicate_counts_before
on commit drop
as
select
  (select count(*) from public.events) as event_count,
  (select count(*) from public.event_editions) as edition_count,
  (select count(*) from public.event_sources) as source_count,
  (
    select count(*)
    from public.event_sources source
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_event_id = source.event_id
  ) as duplicate_source_count,
  (
    select count(*)
    from public.data_workflow_alerts alert
    join public.event_sources source on source.id = alert.source_id
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_event_id = source.event_id
    where alert.alert_status = 'open'
      and (
        alert.alert_code = 'source_repeated_failures'
        or left(alert.alert_code, 5) = 'http_'
        or alert.alert_code in (
          'crawl_error',
          'connect_error',
          'dns_error',
          'empty_content',
          'pinned_connect_error',
          'redirect_error',
          'redirect_limit',
          'response_too_large',
          'robots_denied',
          'robots_unavailable',
          'ssrf_blocked',
          'timeout',
          'tls_error',
          'unsupported_content_encoding',
          'unsupported_content_type'
        )
      )
  ) as failure_alert_count,
  (
    select count(*)
    from public.source_review_tasks task
    join public.event_sources source on source.id = task.source_id
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_event_id = source.event_id
    where task.status = 'open'
      and task.task_type in ('dead_letter', 'source_unreachable', 'content_invalid')
  ) as failure_review_task_count,
  (
    select count(*)
    from public.validation_issues issue
    join public.event_sources source
      on issue.rule_code =
        'source_unreachable_' || replace(source.id::text, '-', '_')
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_event_id = source.event_id
    where issue.status = 'open'
  ) as source_validation_issue_count;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'events',
  event.id::text,
  to_jsonb(event)
from public.events event
where event.id in (
  select canonical_event_id from p0_duplicate_reconciliation
  union all
  select duplicate_event_id from p0_duplicate_reconciliation
)
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'event_editions',
  edition.id::text,
  to_jsonb(edition)
from public.event_editions edition
where edition.id in (
  select canonical_edition_id from p0_duplicate_reconciliation
  union all
  select duplicate_edition_id from p0_duplicate_reconciliation
)
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'event_sources',
  source.id::text,
  to_jsonb(source)
from public.event_sources source
where source.id in (
  select canonical_source_id from p0_duplicate_reconciliation
)
   or source.event_id in (
     select duplicate_event_id from p0_duplicate_reconciliation
   )
on conflict do nothing;

-- The source-host trigger may create a policy when a corrected official URL
-- introduces a host that was not monitored before. A marker records that
-- absence so the targeted rollback can remove only policies created here.
insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'crawler_domain_policies',
  target.source_host,
  coalesce(
    to_jsonb(policy),
    jsonb_build_object(
      '_maintenance_absent', true,
      'source_host', target.source_host
    )
  )
from p0_target_source_hosts target
left join public.crawler_domain_policies policy
  on policy.source_host = target.source_host
on conflict do nothing;

-- Deactivating an unreachable source intentionally resolves its open failure
-- workflow. Snapshot every row that the lifecycle trigger can update.
insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'data_workflow_alerts',
  alert.id::text,
  to_jsonb(alert)
from public.data_workflow_alerts alert
join public.event_sources source on source.id = alert.source_id
join p0_duplicate_reconciliation mapping
  on mapping.duplicate_event_id = source.event_id
where alert.alert_status = 'open'
  and (
    alert.alert_code = 'source_repeated_failures'
    or left(alert.alert_code, 5) = 'http_'
    or alert.alert_code in (
      'crawl_error',
      'connect_error',
      'dns_error',
      'empty_content',
      'pinned_connect_error',
      'redirect_error',
      'redirect_limit',
      'response_too_large',
      'robots_denied',
      'robots_unavailable',
      'ssrf_blocked',
      'timeout',
      'tls_error',
      'unsupported_content_encoding',
      'unsupported_content_type'
    )
  )
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'source_review_tasks',
  task.id::text,
  to_jsonb(task)
from public.source_review_tasks task
join public.event_sources source on source.id = task.source_id
join p0_duplicate_reconciliation mapping
  on mapping.duplicate_event_id = source.event_id
where task.status = 'open'
  and task.task_type in ('dead_letter', 'source_unreachable', 'content_invalid')
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'validation_issues',
  issue.id::text,
  to_jsonb(issue)
from public.validation_issues issue
join public.event_sources source
  on issue.rule_code =
    'source_unreachable_' || replace(source.id::text, '-', '_')
join p0_duplicate_reconciliation mapping
  on mapping.duplicate_event_id = source.event_id
where issue.status = 'open'
on conflict do nothing;

do $backup_check$
begin
  if (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'events'
  ) <> 10
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'event_editions'
  ) <> 10
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'event_sources'
  ) <> 5 + (select duplicate_source_count from p0_duplicate_counts_before)
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'crawler_domain_policies'
  ) <> 5
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'data_workflow_alerts'
  ) < (select failure_alert_count from p0_duplicate_counts_before)
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'source_review_tasks'
  ) < (select failure_review_task_count from p0_duplicate_counts_before)
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'validation_issues'
  ) < (select source_validation_issue_count from p0_duplicate_counts_before) then
    raise exception 'P0 duplicate backup failed: a target or trigger-side-effect snapshot is missing';
  end if;
end
$backup_check$;

update public.events event
set event_name = mapping.canonical_name,
    canonical_name = mapping.canonical_name,
    canonical_key = mapping.canonical_key,
    date = to_char(mapping.event_date, 'DD.MM.YYYY'),
    city = mapping.city,
    country = mapping.country,
    address = mapping.address,
    latitude = mapping.latitude,
    longitude = mapping.longitude,
    event_url = mapping.official_url,
    source_url = mapping.evidence_url,
    official_url = mapping.official_url,
    source_type = 'official',
    status = 'approved',
    verification_status = 'verified',
    data_confidence = 0.98,
    needs_review = false,
    review_priority = 'low',
    last_checked = now(),
    last_verified_at = now(),
    next_check_at = now() + make_interval(days => mapping.next_check_days),
    review_status = 'approved',
    reviewed_at = now(),
    review_reason = null,
    review_note = 'Official-source verification completed; retained as the canonical record during P0 duplicate reconciliation on 2026-09-04.',
    updated_at = now()
from p0_duplicate_reconciliation mapping
where mapping.apply_needed
  and event.id = mapping.canonical_event_id;

-- The legacy event trigger mirrors several fields into event_editions and
-- reduces race_formats to a single legacy label. Restore the reviewed edition
-- shape from the pre-change snapshot while applying the verified facts.
update public.event_editions edition
set start_date = mapping.event_date,
    end_date = mapping.event_date,
    registration_url = mapping.official_url,
    registration_status = backup.row_data ->> 'registration_status',
    edition_status = 'scheduled',
    publication_status = 'published',
    race_formats = backup.row_data -> 'race_formats',
    legacy_distance = backup.row_data ->> 'legacy_distance',
    source_url = mapping.evidence_url,
    verification_status = 'verified',
    data_confidence = 0.98,
    needs_review = false,
    review_priority = 'low',
    last_verified_at = now(),
    next_check_at = now() + make_interval(days => mapping.next_check_days),
    discovery_status = 'active',
    discovery_archived_at = null,
    archive_reason = null,
    published_at = coalesce(edition.published_at, now()),
    updated_at = now()
from p0_duplicate_reconciliation mapping
join private.event_data_workflow_backup backup
  on backup.migration_key = '20260904_p0_duplicate_reconciliation'
 and backup.entity_table = 'event_editions'
 and backup.entity_pk = mapping.canonical_edition_id::text
where mapping.apply_needed
  and edition.id = mapping.canonical_edition_id;

-- Only a changed source URL invalidates prior HTTP/content evidence. Unchanged
-- authoritative sources keep their crawler history and schedule.
update public.event_sources source
set source_type = 'official_event_website',
    source_url = mapping.evidence_url,
    parser_type = 'html',
    is_active = true,
    last_fetched_at = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_fetched_at
    end,
    next_fetch_at = case
      when source.source_url is distinct from mapping.evidence_url then now()
      else source.next_fetch_at
    end,
    last_http_status = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_http_status
    end,
    last_content_hash = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_content_hash
    end,
    crawl_status = case
      when source.source_url is distinct from mapping.evidence_url then 'pending'
      else source.crawl_status
    end,
    consecutive_failures = case
      when source.source_url is distinct from mapping.evidence_url then 0
      else source.consecutive_failures
    end,
    last_error = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_error
    end,
    claimed_at = null,
    claimed_by = null,
    robots_checked_at = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.robots_checked_at
    end,
    robots_allowed = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.robots_allowed
    end,
    last_duration_ms = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_duration_ms
    end,
    last_changed_at = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_changed_at
    end,
    last_final_url = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_final_url
    end,
    last_redirect_count = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_redirect_count
    end,
    last_content_type = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_content_type
    end,
    last_content_length = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_content_length
    end,
    last_etag = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_etag
    end,
    last_modified = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_modified
    end,
    last_error_type = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_error_type
    end,
    last_change_status = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_change_status
    end,
    recently_recovered_at = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.recently_recovered_at
    end,
    last_semantic_hash = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_semantic_hash
    end,
    last_normalization_version = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_normalization_version
    end,
    last_pinned_ip = case
      when source.source_url is distinct from mapping.evidence_url then null
      else source.last_pinned_ip
    end,
    updated_at = now()
from p0_duplicate_reconciliation mapping
where mapping.apply_needed
  and source.id = mapping.canonical_source_id;

update public.events duplicate_event
set status = 'duplicate',
    needs_review = false,
    review_priority = 'low',
    review_status = 'rejected',
    reviewed_at = now(),
    review_reason = 'duplicate_of_catalog_event',
    review_note = 'Canonical replacement event id: ' || mapping.canonical_event_id::text,
    status_note = 'Duplicate record retained for audit; canonical event id: ' || mapping.canonical_event_id::text,
    next_check_at = null,
    updated_at = now()
from p0_duplicate_reconciliation mapping
where mapping.apply_needed
  and duplicate_event.id = mapping.duplicate_event_id;

update public.event_editions duplicate_edition
set publication_status = 'draft',
    discovery_status = 'suppressed',
    discovery_archived_at = coalesce(duplicate_edition.discovery_archived_at, now()),
    archive_reason = 'duplicate_of_catalog_event',
    edition_status = 'inactive',
    needs_review = false,
    review_priority = 'low',
    next_check_at = null,
    updated_at = now()
from p0_duplicate_reconciliation mapping
where mapping.apply_needed
  and duplicate_edition.id = mapping.duplicate_edition_id;

update public.event_sources duplicate_source
set is_active = false,
    crawl_status = 'inactive',
    next_fetch_at = null,
    claimed_at = null,
    claimed_by = null,
    updated_at = now()
from p0_duplicate_reconciliation mapping
where duplicate_source.event_id = mapping.duplicate_event_id
  and (
    duplicate_source.is_active is true
    or duplicate_source.crawl_status <> 'inactive'
    or duplicate_source.next_fetch_at is not null
    or duplicate_source.claimed_at is not null
    or duplicate_source.claimed_by is not null
  );

-- Persist the exact post-state as a rollback drift guard. The targeted rollback
-- refuses to overwrite any row that has changed after this correction.
insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'events_post_state',
  event.id::text,
  to_jsonb(event)
from public.events event
where event.id in (
  select canonical_event_id from p0_duplicate_reconciliation
  union all
  select duplicate_event_id from p0_duplicate_reconciliation
)
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'event_editions_post_state',
  edition.id::text,
  to_jsonb(edition)
from public.event_editions edition
where edition.id in (
  select canonical_edition_id from p0_duplicate_reconciliation
  union all
  select duplicate_edition_id from p0_duplicate_reconciliation
)
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'event_sources_post_state',
  source.id::text,
  to_jsonb(source)
from public.event_sources source
where source.id in (
  select canonical_source_id from p0_duplicate_reconciliation
)
   or source.event_id in (
     select duplicate_event_id from p0_duplicate_reconciliation
   )
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'crawler_domain_policies_post_state',
  policy.source_host,
  to_jsonb(policy)
from public.crawler_domain_policies policy
join p0_target_source_hosts target on target.source_host = policy.source_host
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'data_workflow_alerts_post_state',
  alert.id::text,
  to_jsonb(alert)
from public.data_workflow_alerts alert
join private.event_data_workflow_backup backup
  on backup.migration_key = '20260904_p0_duplicate_reconciliation'
 and backup.entity_table = 'data_workflow_alerts'
 and backup.entity_pk = alert.id::text
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'source_review_tasks_post_state',
  task.id::text,
  to_jsonb(task)
from public.source_review_tasks task
join private.event_data_workflow_backup backup
  on backup.migration_key = '20260904_p0_duplicate_reconciliation'
 and backup.entity_table = 'source_review_tasks'
 and backup.entity_pk = task.id::text
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260904_p0_duplicate_reconciliation',
  'validation_issues_post_state',
  issue.id::text,
  to_jsonb(issue)
from public.validation_issues issue
join private.event_data_workflow_backup backup
  on backup.migration_key = '20260904_p0_duplicate_reconciliation'
 and backup.entity_table = 'validation_issues'
 and backup.entity_pk = issue.id::text
on conflict do nothing;

do $postcondition$
declare
  canonical_event_count integer;
  canonical_edition_count integer;
  canonical_source_count integer;
  canonical_domain_policy_count integer;
  duplicate_event_count integer;
  duplicate_edition_count integer;
  duplicate_source_count integer;
  expected_duplicate_source_count integer;
  canonical_discovery_count integer;
  canonical_archive_count integer;
  duplicate_discovery_count integer;
  duplicate_archive_count integer;
  audited_event_count integer;
  audited_duplicate_count integer;
  remaining_failure_workflow_count integer;
begin
  if (select count(*) from public.events) <>
       (select event_count from p0_duplicate_counts_before)
     or (select count(*) from public.event_editions) <>
       (select edition_count from p0_duplicate_counts_before)
     or (select count(*) from public.event_sources) <>
       (select source_count from p0_duplicate_counts_before) then
    raise exception 'P0 duplicate postcondition failed: physical row counts changed';
  end if;

  if (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'events_post_state'
  ) <> 10
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'event_editions_post_state'
  ) <> 10
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'event_sources_post_state'
  ) <> 5 + (select counts.duplicate_source_count from p0_duplicate_counts_before counts)
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'crawler_domain_policies_post_state'
  ) <> 5 then
    raise exception 'P0 duplicate postcondition failed: rollback drift-guard snapshots are incomplete';
  end if;

  select count(*) into canonical_event_count
  from p0_duplicate_reconciliation mapping
  join public.events event
    on event.id = mapping.canonical_event_id
   and event.event_name = mapping.canonical_name
   and event.canonical_name = mapping.canonical_name
   and event.canonical_key = mapping.canonical_key
   and event.date = to_char(mapping.event_date, 'DD.MM.YYYY')
   and event.city = mapping.city
   and event.country = mapping.country
   and event.address = mapping.address
   and event.latitude = mapping.latitude
   and event.longitude = mapping.longitude
   and event.event_url = mapping.official_url
   and event.official_url = mapping.official_url
   and event.source_url = mapping.evidence_url
   and event.source_type = 'official'
   and event.status = 'approved'
   and event.publication_status = 'published'
   and event.event_status = 'active'
   and event.verification_status = 'verified'
   and event.data_confidence = 0.98
   and event.needs_review is false
   and event.review_priority = 'low'
   and event.review_status = 'approved';

  select count(*) into canonical_edition_count
  from p0_duplicate_reconciliation mapping
  join public.event_editions edition
    on edition.id = mapping.canonical_edition_id
   and edition.event_id = mapping.canonical_event_id
   and edition.start_date = mapping.event_date
   and edition.end_date = mapping.event_date
   and edition.registration_url = mapping.official_url
   and edition.source_url = mapping.evidence_url
   and edition.edition_status = 'scheduled'
   and edition.publication_status = 'published'
   and edition.discovery_status = 'active'
   and edition.verification_status = 'verified'
   and edition.data_confidence = 0.98
   and edition.needs_review is false
   and edition.review_priority = 'low'
  join private.event_data_workflow_backup backup
    on backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and backup.entity_table = 'event_editions'
   and backup.entity_pk = mapping.canonical_edition_id::text
   and edition.registration_status = backup.row_data ->> 'registration_status'
   and edition.race_formats = backup.row_data -> 'race_formats'
   and edition.legacy_distance is not distinct from backup.row_data ->> 'legacy_distance';

  select count(*) into canonical_source_count
  from p0_duplicate_reconciliation mapping
  join public.event_sources source
    on source.id = mapping.canonical_source_id
   and source.event_id = mapping.canonical_event_id
   and source.edition_id = mapping.canonical_edition_id
   and source.source_type = 'official_event_website'
   and source.source_url = mapping.evidence_url
   and source.parser_type = 'html'
   and source.is_active is true
   and source.crawl_status <> 'inactive'
   and source.claimed_at is null
   and source.claimed_by is null;

  select count(*) into canonical_domain_policy_count
  from p0_target_source_hosts target
  join public.crawler_domain_policies policy
    on policy.source_host = target.source_host;

  select count(*) into duplicate_event_count
  from p0_duplicate_reconciliation mapping
  join public.events event
    on event.id = mapping.duplicate_event_id
   and event.status = 'duplicate'
   and event.publication_status = 'draft'
   and event.event_status = 'inactive'
   and event.needs_review is false
   and event.review_priority = 'low'
   and event.review_status = 'rejected'
   and event.review_reason = 'duplicate_of_catalog_event'
   and event.review_note = 'Canonical replacement event id: ' || mapping.canonical_event_id::text
   and event.next_check_at is null;

  select count(*) into duplicate_edition_count
  from p0_duplicate_reconciliation mapping
  join public.event_editions edition
    on edition.id = mapping.duplicate_edition_id
   and edition.event_id = mapping.duplicate_event_id
   and edition.publication_status = 'draft'
   and edition.discovery_status = 'suppressed'
   and edition.discovery_archived_at is not null
   and edition.archive_reason = 'duplicate_of_catalog_event'
   and edition.edition_status = 'inactive'
   and edition.needs_review is false
   and edition.review_priority = 'low'
   and edition.next_check_at is null;

  select count(*) into duplicate_source_count
  from public.event_sources source
  join p0_duplicate_reconciliation mapping
    on mapping.duplicate_event_id = source.event_id
  where source.is_active is false
   and source.crawl_status = 'inactive'
   and source.next_fetch_at is null
   and source.claimed_at is null
   and source.claimed_by is null;

  select counts.duplicate_source_count into expected_duplicate_source_count
  from p0_duplicate_counts_before counts;

  select count(*) into canonical_discovery_count
  from public.public_event_discovery discovery
  join p0_duplicate_reconciliation mapping
    on mapping.canonical_event_id = discovery.event_id
   and mapping.canonical_edition_id = discovery.edition_id;

  select count(*) into canonical_archive_count
  from public.public_event_archive archive
  join p0_duplicate_reconciliation mapping
    on mapping.canonical_event_id = archive.event_id
   and mapping.canonical_edition_id = archive.edition_id;

  select count(*) into duplicate_discovery_count
  from public.public_event_discovery discovery
  join p0_duplicate_reconciliation mapping
    on mapping.duplicate_event_id = discovery.event_id;

  select count(*) into duplicate_archive_count
  from public.public_event_archive archive
  join p0_duplicate_reconciliation mapping
    on mapping.duplicate_event_id = archive.event_id;

  select count(distinct audit.entity_id) into audited_event_count
  from public.event_audit_log audit
  join p0_duplicate_reconciliation mapping
    on audit.entity_id in (
      mapping.canonical_event_id::text,
      mapping.duplicate_event_id::text
    )
  where audit.entity_type = 'event'
    and audit.change_source = 'manual_admin'
    and audit.reason = 'P0 duplicate reconciliation: official-source verification on 2026-09-04';

  select count(distinct audit.entity_id) into audited_duplicate_count
  from public.event_audit_log audit
  join p0_duplicate_reconciliation mapping
    on audit.entity_id = mapping.duplicate_event_id::text
  where audit.entity_type = 'event'
    and audit.field_name = 'status'
    and audit.new_value = to_jsonb('duplicate'::text)
    and audit.change_source = 'manual_admin'
    and audit.reason = 'P0 duplicate reconciliation: official-source verification on 2026-09-04';

  select
    (
      select count(*)
      from public.data_workflow_alerts alert
      join public.event_sources source on source.id = alert.source_id
      join p0_duplicate_reconciliation mapping
        on mapping.duplicate_event_id = source.event_id
      where alert.alert_status = 'open'
        and (
          alert.alert_code = 'source_repeated_failures'
          or left(alert.alert_code, 5) = 'http_'
          or alert.alert_code in (
            'crawl_error',
            'connect_error',
            'dns_error',
            'empty_content',
            'pinned_connect_error',
            'redirect_error',
            'redirect_limit',
            'response_too_large',
            'robots_denied',
            'robots_unavailable',
            'ssrf_blocked',
            'timeout',
            'tls_error',
            'unsupported_content_encoding',
            'unsupported_content_type'
          )
        )
    )
    + (
      select count(*)
      from public.source_review_tasks task
      join public.event_sources source on source.id = task.source_id
      join p0_duplicate_reconciliation mapping
        on mapping.duplicate_event_id = source.event_id
      where task.status = 'open'
        and task.task_type in ('dead_letter', 'source_unreachable', 'content_invalid')
    )
    + (
      select count(*)
      from public.validation_issues issue
      join public.event_sources source
        on issue.rule_code =
          'source_unreachable_' || replace(source.id::text, '-', '_')
      join p0_duplicate_reconciliation mapping
        on mapping.duplicate_event_id = source.event_id
      where issue.status = 'open'
    )
  into remaining_failure_workflow_count;

  if canonical_event_count <> 5
     or canonical_edition_count <> 5
     or canonical_source_count <> 5
     or canonical_domain_policy_count <> 5
     or duplicate_event_count <> 5
     or duplicate_edition_count <> 5
     or duplicate_source_count <> expected_duplicate_source_count
     or canonical_discovery_count <> 5
     or canonical_archive_count <> 5
     or duplicate_discovery_count <> 0
     or duplicate_archive_count <> 0
     or audited_event_count <> 10
     or audited_duplicate_count <> 5
     or remaining_failure_workflow_count <> 0 then
    raise exception
      'P0 duplicate postcondition failed: canonical events %, editions %, sources %, domains %; duplicate events %, editions %, sources %/%; public discovery %/%, archive %/%; audited %/%; open failure workflow %',
      canonical_event_count,
      canonical_edition_count,
      canonical_source_count,
      canonical_domain_policy_count,
      duplicate_event_count,
      duplicate_edition_count,
      duplicate_source_count,
      expected_duplicate_source_count,
      canonical_discovery_count,
      duplicate_discovery_count,
      canonical_archive_count,
      duplicate_archive_count,
      audited_event_count,
      audited_duplicate_count,
      remaining_failure_workflow_count;
  end if;

  if exists (
    select 1
    from public.source_crawl_jobs job
    join public.event_sources source on source.id = job.source_id
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_event_id = source.event_id
    where job.status in ('queued', 'processing', 'retry_scheduled')
  ) then
    raise exception 'P0 duplicate postcondition failed: a duplicate source has an active crawl job';
  end if;

  if exists (
    select 1
    from public.favorites favorite
    join p0_duplicate_reconciliation mapping
      on favorite.event_ref = mapping.duplicate_event_id
    union all
    select 1
    from public.season_planner_events planner
    join p0_duplicate_reconciliation mapping
      on planner.edition_id = mapping.duplicate_edition_id
    union all
    select 1
    from public.favorites favorite
    join public.event_editions duplicate_edition
      on lower(favorite.event_id) = lower(duplicate_edition.legacy_event_key)
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_edition_id = duplicate_edition.id
    union all
    select 1
    from public.season_planner_events planner
    join public.event_editions duplicate_edition
      on lower(planner.event_id) = lower(duplicate_edition.legacy_event_key)
    join p0_duplicate_reconciliation mapping
      on mapping.duplicate_edition_id = duplicate_edition.id
  ) then
    raise exception 'P0 duplicate postcondition failed: a user record references a duplicate target';
  end if;
end
$postcondition$;

select
  mapping.canonical_event_id,
  canonical_event.canonical_name,
  canonical_edition.start_date,
  canonical_event.city,
  canonical_event.country,
  canonical_event.verification_status,
  mapping.duplicate_event_id,
  duplicate_event.status as duplicate_status,
  duplicate_edition.discovery_status as duplicate_discovery_status,
  duplicate_source.crawl_status as duplicate_source_status
from p0_duplicate_reconciliation mapping
join public.events canonical_event
  on canonical_event.id = mapping.canonical_event_id
join public.event_editions canonical_edition
  on canonical_edition.id = mapping.canonical_edition_id
join public.events duplicate_event
  on duplicate_event.id = mapping.duplicate_event_id
join public.event_editions duplicate_edition
  on duplicate_edition.id = mapping.duplicate_edition_id
join public.event_sources duplicate_source
  on duplicate_source.id = mapping.duplicate_source_id
order by mapping.canonical_event_id;

-- The identical transaction completed successfully with ROLLBACK against the
-- linked project before this reviewed production execution was enabled.
commit;
