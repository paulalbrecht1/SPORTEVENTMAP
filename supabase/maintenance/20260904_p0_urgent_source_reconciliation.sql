-- P0 urgent source reconciliation, reviewed against official sources on
-- 2026-09-04.
--
-- Future Run:
--   https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run
--   https://events.ihk-elbeweser.de/futurerunausbildunginbewegung
--
-- Boeckstiegellauf:
--   https://www.stadt-werther.de/entdecken/peter-august-boeckstiegel/boeckstiegel-lauf
--   https://my.raceresult.com/383670/registration
--
-- This transaction corrects central facts and monitored source topology. It
-- deliberately leaves both editions in needs_review. A later freshness review
-- may run only after the newly queued sources have completed successfully.
-- Existing crawl history is never deleted.

begin isolation level serializable;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('sporteventmap:p0-urgent-source-reconciliation:20260904', 0)
);

select set_config('app.change_source', 'manual_admin', true);
select set_config(
  'app.change_reason',
  'P0 urgent source reconciliation: official-source review on 2026-09-04',
  true
);

do $admin_identity$
declare
  admin_id uuid;
begin
  select profile.id
  into admin_id
  from public.profiles profile
  where profile.role = 'admin'
  order by profile.id
  limit 1;

  if admin_id is null then
    raise exception 'P0 source reconciliation requires an admin profile';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text,
    true
  );
end
$admin_identity$;

create temporary table p0_new_sources (
  source_id uuid primary key,
  event_id bigint not null,
  edition_id uuid not null,
  source_type text not null,
  source_url text not null,
  source_priority smallint not null,
  parser_type text not null
) on commit drop;

insert into p0_new_sources (
  source_id,
  event_id,
  edition_id,
  source_type,
  source_url,
  source_priority,
  parser_type
)
values
  (
    '3aa2079d-ee37-4a5c-9853-481eae88f819',
    385,
    '549ea3d0-a669-416a-8766-10b446a8ff26',
    'official_event_website',
    'https://events.ihk-elbeweser.de/futurerunausbildunginbewegung',
    10,
    'html'
  ),
  (
    '0f6e2ca7-5edd-44fd-ad00-2a1d07b4d465',
    336,
    'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883',
    'official_event_website',
    'https://www.stadt-werther.de/entdecken/peter-august-boeckstiegel/boeckstiegel-lauf',
    10,
    'html'
  ),
  (
    'b43ebfb5-2836-485d-86d9-f0e24d1344c3',
    336,
    'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883',
    'official_registration_platform',
    'https://my.raceresult.com/383670/registration',
    20,
    'html'
  );

-- Prevent the scheduler from claiming or inserting work between the source/job
-- preflight and the controlled replacement below.
lock table public.source_crawl_jobs in share mode;

-- Match the worker's lock order: source -> event -> edition.
select 1
from public.event_sources source
where source.id in (
  '536d023b-d50b-4c73-9c6e-3a7886fd839b',
  'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
)
order by source.id
for update;

select 1
from public.events event
where event.id in (336, 385)
order by event.id
for update;

select 1
from public.event_editions edition
where edition.id in (
  '549ea3d0-a669-416a-8766-10b446a8ff26',
  'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883'
)
order by edition.event_id, edition.id
for update;

do $preflight$
begin
  if (select count(*) from p0_new_sources) <> 3 then
    raise exception 'P0 source precondition failed: expected three new sources';
  end if;

  if exists (
    select 1
    from p0_new_sources desired
    left join public.event_editions edition
      on edition.id = desired.edition_id
     and edition.event_id = desired.event_id
    where edition.id is null
  ) then
    raise exception 'P0 source precondition failed: source parent chain changed';
  end if;

  if exists (
    select 1
    from p0_new_sources desired
    join public.event_sources source
      on source.id = desired.source_id
      or (
        source.event_id = desired.event_id
        and coalesce(
          source.edition_id,
          '00000000-0000-0000-0000-000000000000'::uuid
        ) = desired.edition_id
        and source.source_url = desired.source_url
      )
  ) then
    raise exception 'P0 source precondition failed: a desired source already exists';
  end if;

  if not exists (
    select 1
    from public.events event
    where event.id = 385
      and event.event_name = 'Future Run - Ausbildung in Bewegung'
      and event.canonical_name = 'Future Run - Ausbildung in Bewegung'
      and event.date = '18.09.2026'
      and event.city = 'Buxtehude-Hedendorf'
      and event.address =
        'VSV Sportanlage, Feldstraße 50, 21614 Buxtehude, Germany'
      and event.latitude = '53.4718374'
      and event.longitude = '9.6154238'
      and event.distance = '7 km, 5 km'
      and event.event_url =
        'https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run'
      and event.source_url =
        'https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run'
      and event.official_url =
        'https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run'
      and event.registration_status = 'unclear'
      and event.status = 'approved'
      and event.publication_status = 'published'
      and event.event_status = 'active'
  ) then
    raise exception 'P0 source precondition failed: Future Run event drifted';
  end if;

  if not exists (
    select 1
    from public.event_editions edition
    where edition.id = '549ea3d0-a669-416a-8766-10b446a8ff26'
      and edition.event_id = 385
      and edition.edition_year = 2026
      and edition.start_date = date '2026-09-18'
      and edition.end_date = date '2026-09-18'
      and edition.start_time is null
      and edition.legacy_distance = '7 km, 5 km'
      and edition.race_formats = '[{"label":"7 km, 5 km"}]'::jsonb
      and edition.source_url =
        'https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run'
      and edition.registration_url =
        'https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run'
      and edition.registration_status = 'unknown'
      and edition.edition_status = 'scheduled'
      and edition.publication_status = 'published'
      and edition.discovery_status = 'active'
      and edition.verification_status = 'needs_review'
      and edition.needs_review is true
      and edition.last_verified_source_id is null
  ) then
    raise exception 'P0 source precondition failed: Future Run edition drifted';
  end if;

  if not exists (
    select 1
    from public.event_sources source
    where source.id = '536d023b-d50b-4c73-9c6e-3a7886fd839b'
      and source.event_id = 385
      and source.edition_id = '549ea3d0-a669-416a-8766-10b446a8ff26'
      and source.source_type = 'official_event_website'
      and source.source_url =
        'https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run'
      and source.is_active is true
      and source.crawl_status = 'success'
      and source.consecutive_failures = 0
      and source.last_change_status = 'first_seen'
      and source.claimed_at is null
      and source.claimed_by is null
  ) then
    raise exception 'P0 source precondition failed: Future Run source drifted';
  end if;

  if not exists (
    select 1
    from public.events event
    where event.id = 336
      and event.event_name = 'Böckstiegellauf'
      and event.canonical_name = 'Böckstiegellauf'
      and event.date = '26.09.2026'
      and event.city = 'Bielefeld'
      and event.address =
        'Wanderparkplatz Peter auf''m Berge, Bergstraße, 33619 Bielefeld, Germany'
      and event.latitude = '52.0209957'
      and event.longitude = '8.4659634'
      and event.distance = '18 km, 10 km'
      and event.event_url = 'https://boeckstiegellauf.de/'
      and event.source_url = 'https://boeckstiegellauf.de/'
      and event.official_url = 'https://boeckstiegellauf.de/'
      and event.registration_status = 'unclear'
      and event.status = 'approved'
      and event.publication_status = 'published'
      and event.event_status = 'active'
  ) then
    raise exception 'P0 source precondition failed: Boeckstiegellauf event drifted';
  end if;

  if not exists (
    select 1
    from public.event_editions edition
    where edition.id = 'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883'
      and edition.event_id = 336
      and edition.edition_year = 2026
      and edition.start_date = date '2026-09-26'
      and edition.end_date = date '2026-09-26'
      and edition.start_time is null
      and edition.legacy_distance = '18 km, 10 km'
      and edition.race_formats = '[{"label":"18 km, 10 km"}]'::jsonb
      and edition.source_url = 'https://boeckstiegellauf.de/'
      and edition.registration_url = 'https://boeckstiegellauf.de/'
      and edition.registration_status = 'unknown'
      and edition.edition_status = 'scheduled'
      and edition.publication_status = 'published'
      and edition.discovery_status = 'active'
      and edition.verification_status = 'needs_review'
      and edition.needs_review is true
      and edition.last_verified_source_id is null
  ) then
    raise exception 'P0 source precondition failed: Boeckstiegellauf edition drifted';
  end if;

  if not exists (
    select 1
    from public.event_sources source
    where source.id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
      and source.event_id = 336
      and source.edition_id = 'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883'
      and source.source_type = 'official_event_website'
      and source.source_url = 'https://boeckstiegellauf.de/'
      and source.is_active is true
      and source.crawl_status = 'unreachable'
      and source.consecutive_failures = 3
      and source.last_error_type = 'robots_unavailable'
      and source.claimed_at is null
      and source.claimed_by is null
  ) then
    raise exception 'P0 source precondition failed: Boeckstiegellauf source drifted';
  end if;

  if not exists (
    select 1
    from public.source_crawl_jobs job
    where job.id = 'dd2db00b-c58e-4af1-9a12-82f1647bd51f'
      and job.source_id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
      and job.status = 'retry_scheduled'
      and job.attempt_count = 3
      and job.lease_expires_at is null
      and job.lease_owner is null
  ) then
    raise exception 'P0 source precondition failed: Boeckstiegellauf retry job drifted';
  end if;

  if exists (
    select 1
    from public.source_crawl_jobs job
    where job.source_id in (
      '536d023b-d50b-4c73-9c6e-3a7886fd839b',
      'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
    )
      and job.status = 'processing'
  ) then
    raise exception 'P0 source precondition failed: a target source is processing';
  end if;
end
$preflight$;

insert into private.event_data_workflow_backup (
  migration_key, entity_table, entity_pk, row_data
)
select
  '20260904_p0_urgent_source_reconciliation',
  'events',
  event.id::text,
  to_jsonb(event)
from public.events event
where event.id in (336, 385)
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key, entity_table, entity_pk, row_data
)
select
  '20260904_p0_urgent_source_reconciliation',
  'event_editions',
  edition.id::text,
  to_jsonb(edition)
from public.event_editions edition
where edition.id in (
  '549ea3d0-a669-416a-8766-10b446a8ff26',
  'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883'
)
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key, entity_table, entity_pk, row_data
)
select
  '20260904_p0_urgent_source_reconciliation',
  'event_sources',
  source.id::text,
  to_jsonb(source)
from public.event_sources source
where source.id in (
  '536d023b-d50b-4c73-9c6e-3a7886fd839b',
  'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
)
on conflict do nothing;

-- Mark the three source IDs as absent before insertion. The targeted rollback
-- uses these markers and refuses to delete them once crawl history exists.
insert into private.event_data_workflow_backup (
  migration_key, entity_table, entity_pk, row_data
)
select
  '20260904_p0_urgent_source_reconciliation',
  'event_sources',
  desired.source_id::text,
  jsonb_build_object(
    '_maintenance_absent', true,
    'id', desired.source_id,
    'event_id', desired.event_id,
    'edition_id', desired.edition_id,
    'source_url', desired.source_url
  )
from p0_new_sources desired
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key, entity_table, entity_pk, row_data
)
select
  '20260904_p0_urgent_source_reconciliation',
  'source_crawl_jobs',
  job.id::text,
  to_jsonb(job)
from public.source_crawl_jobs job
where job.id = 'dd2db00b-c58e-4af1-9a12-82f1647bd51f'
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key, entity_table, entity_pk, row_data
)
select
  '20260904_p0_urgent_source_reconciliation',
  'data_workflow_alerts',
  alert.id::text,
  to_jsonb(alert)
from public.data_workflow_alerts alert
where alert.source_id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
  and alert.alert_status = 'open'
  and (
    alert.alert_code = 'source_repeated_failures'
    or left(alert.alert_code, 5) = 'http_'
    or alert.alert_code in (
      'crawl_error', 'connect_error', 'dns_error', 'empty_content',
      'pinned_connect_error', 'redirect_error', 'redirect_limit',
      'response_too_large', 'robots_denied', 'robots_unavailable',
      'ssrf_blocked', 'timeout', 'tls_error',
      'unsupported_content_encoding', 'unsupported_content_type'
    )
  )
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key, entity_table, entity_pk, row_data
)
select
  '20260904_p0_urgent_source_reconciliation',
  'source_review_tasks',
  task.id::text,
  to_jsonb(task)
from public.source_review_tasks task
where task.source_id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
  and task.status = 'open'
  and task.task_type in ('dead_letter', 'source_unreachable', 'content_invalid')
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key, entity_table, entity_pk, row_data
)
select
  '20260904_p0_urgent_source_reconciliation',
  'validation_issues',
  issue.id::text,
  to_jsonb(issue)
from public.validation_issues issue
where issue.status = 'open'
  and issue.rule_code =
    'source_unreachable_b70e48f0_b99c_4b53_8775_ed760fc9a7e1'
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key, entity_table, entity_pk, row_data
)
select
  '20260904_p0_urgent_source_reconciliation',
  'crawler_domain_policies',
  target.source_host,
  coalesce(
    to_jsonb(policy),
    jsonb_build_object(
      '_maintenance_absent', true,
      'source_host', target.source_host
    )
  )
from (
  values
    ('events.ihk-elbeweser.de'::text),
    ('www.stadt-werther.de'::text),
    ('my.raceresult.com'::text)
) target(source_host)
left join public.crawler_domain_policies policy
  on policy.source_host = target.source_host
on conflict do nothing;

do $backup_postcondition$
begin
  if (select count(*) from private.event_data_workflow_backup
      where migration_key = '20260904_p0_urgent_source_reconciliation'
        and entity_table = 'events') <> 2
     or (select count(*) from private.event_data_workflow_backup
      where migration_key = '20260904_p0_urgent_source_reconciliation'
        and entity_table = 'event_editions') <> 2
     or (select count(*) from private.event_data_workflow_backup
      where migration_key = '20260904_p0_urgent_source_reconciliation'
        and entity_table = 'event_sources') <> 5
     or (select count(*) from private.event_data_workflow_backup
      where migration_key = '20260904_p0_urgent_source_reconciliation'
        and entity_table = 'source_crawl_jobs') <> 1
     or (select count(*) from private.event_data_workflow_backup
      where migration_key = '20260904_p0_urgent_source_reconciliation'
        and entity_table = 'data_workflow_alerts') <> 1
     or (select count(*) from private.event_data_workflow_backup
      where migration_key = '20260904_p0_urgent_source_reconciliation'
        and entity_table = 'source_review_tasks') <> 1
     or (select count(*) from private.event_data_workflow_backup
      where migration_key = '20260904_p0_urgent_source_reconciliation'
        and entity_table = 'validation_issues') <> 1
     or (select count(*) from private.event_data_workflow_backup
      where migration_key = '20260904_p0_urgent_source_reconciliation'
        and entity_table = 'crawler_domain_policies') <> 3 then
    raise exception 'P0 source backup postcondition failed';
  end if;
end
$backup_postcondition$;

insert into public.event_sources (
  id, event_id, edition_id, source_type, source_url, source_priority,
  parser_type, is_active, crawl_status, next_fetch_at
)
select
  desired.source_id,
  desired.event_id,
  desired.edition_id,
  desired.source_type,
  desired.source_url,
  desired.source_priority,
  desired.parser_type,
  true,
  'pending',
  now()
from p0_new_sources desired;

insert into public.event_audit_log (
  entity_type, entity_id, field_name, new_value, change_source, changed_by,
  changed_by_process, reason, source_url
)
select
  'source',
  source.id::text,
  '__created__',
  to_jsonb(source),
  'manual_admin',
  (select auth.uid()),
  'p0-source-reconciliation',
  'P0 urgent source reconciliation: official-source review on 2026-09-04',
  source.source_url
from public.event_sources source
join p0_new_sources desired on desired.source_id = source.id;

-- Update the legacy event row first. Its compatibility trigger rewrites the
-- 2026 edition, which is corrected to the richer exact shape immediately after.
update public.events
set city = 'Buxtehude',
    address =
      'VSV Hedendorf-Neukloster, Feldstraße 50, 21614 Buxtehude, Germany',
    latitude = '53.4719383',
    longitude = '9.615386',
    distance = '5 km, 7 km',
    description =
      'Der FUTURE RUN der IHK Elbe-Weser findet am 18. September 2026 auf der Sportanlage des VSV Hedendorf-Neukloster statt. Teilnehmende wählen zwischen 5 km und 7 km; Veranstaltungsbeginn ist um 14:30 Uhr.',
    event_url =
      'https://events.ihk-elbeweser.de/futurerunausbildunginbewegung',
    registration_status = 'registration_not_open',
    updated_at = now()
where id = 385;

update public.events
set distance =
      '18 km, 10 km, 10 km Walking, 2.5 km Schüler*innen-Lauf',
    description =
      'Der Böckstiegellauf führt vom Start Peter auf''m Berge in Bielefeld durch den Teutoburger Wald zum Venghauss-Platz in Werther. Angeboten werden 18 km, 10 km, 10 km Walking und ein 2,5-km-Schüler*innen-Lauf.',
    event_url = 'https://my.raceresult.com/383670/registration',
    source_url =
      'https://www.stadt-werther.de/entdecken/peter-august-boeckstiegel/boeckstiegel-lauf',
    official_url =
      'https://www.stadt-werther.de/entdecken/peter-august-boeckstiegel/boeckstiegel-lauf',
    registration_status = 'registration_open',
    updated_at = now()
where id = 336;

update public.event_editions
set start_time = time '14:30',
    race_formats = '[{"label":"5 km"},{"label":"7 km"}]'::jsonb,
    legacy_distance = '5 km, 7 km',
    source_url =
      'https://events.ihk-elbeweser.de/futurerunausbildunginbewegung',
    registration_url =
      'https://events.ihk-elbeweser.de/futurerunausbildunginbewegung',
    registration_status = 'registration_not_open',
    updated_at = now()
where id = '549ea3d0-a669-416a-8766-10b446a8ff26';

update public.event_editions
set race_formats =
      '[{"label":"18 km"},{"label":"10 km"},{"label":"10 km Walking"},{"label":"2.5 km Schüler*innen-Lauf"}]'::jsonb,
    legacy_distance =
      '18 km, 10 km, 10 km Walking, 2.5 km Schüler*innen-Lauf',
    source_url =
      'https://www.stadt-werther.de/entdecken/peter-august-boeckstiegel/boeckstiegel-lauf',
    registration_url = 'https://my.raceresult.com/383670/registration',
    registration_status = 'registration_open',
    updated_at = now()
where id = 'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883';

update public.source_crawl_jobs
set status = 'failed',
    completed_at = now(),
    lease_expires_at = null,
    lease_owner = null,
    error_type = 'source_superseded',
    error_message =
      'Replaced by reachable official Stadt Werther and RaceResult sources during P0 reconciliation.',
    updated_at = now()
where id = 'dd2db00b-c58e-4af1-9a12-82f1647bd51f'
  and status = 'retry_scheduled';

do $job_update_postcondition$
begin
  if not exists (
    select 1
    from public.source_crawl_jobs job
    where job.id = 'dd2db00b-c58e-4af1-9a12-82f1647bd51f'
      and job.status = 'failed'
      and job.error_type = 'source_superseded'
      and job.completed_at is not null
      and job.lease_expires_at is null
      and job.lease_owner is null
  ) then
    raise exception 'P0 source postcondition failed: retry job not terminalized';
  end if;
end
$job_update_postcondition$;

update public.event_sources
set is_active = false,
    crawl_status = 'inactive',
    next_fetch_at = null,
    claimed_at = null,
    claimed_by = null,
    updated_at = now()
where id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1';

insert into public.event_audit_log (
  entity_type, entity_id, field_name, old_value, new_value, change_source,
  changed_by, changed_by_process, reason, source_url
)
select
  'source',
  source.id::text,
  '__deactivated__',
  backup.row_data,
  to_jsonb(source),
  'manual_admin',
  (select auth.uid()),
  'p0-source-reconciliation',
  'P0 urgent source reconciliation: official-source review on 2026-09-04',
  source.source_url
from public.event_sources source
join private.event_data_workflow_backup backup
  on backup.migration_key = '20260904_p0_urgent_source_reconciliation'
 and backup.entity_table = 'event_sources'
 and backup.entity_pk = source.id::text
where source.id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1';

do $enqueue$
declare
  desired record;
begin
  for desired in
    select * from p0_new_sources order by source_id
  loop
    perform public.enqueue_source_crawl(
      desired.source_id,
      999,
      clock_timestamp(),
      'admin'
    );
  end loop;
end
$enqueue$;

do $postcondition$
begin
  if not exists (
    select 1
    from public.events event
    where event.id = 385
      and event.city = 'Buxtehude'
      and event.address =
        'VSV Hedendorf-Neukloster, Feldstraße 50, 21614 Buxtehude, Germany'
      and event.latitude = '53.4719383'
      and event.longitude = '9.615386'
      and event.distance = '5 km, 7 km'
      and event.event_url =
        'https://events.ihk-elbeweser.de/futurerunausbildunginbewegung'
      and event.source_url =
        'https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run'
      and event.official_url =
        'https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run'
      and event.registration_status = 'registration_not_open'
  ) then
    raise exception 'P0 source postcondition failed: Future Run event facts';
  end if;

  if not exists (
    select 1
    from public.event_editions edition
    where edition.id = '549ea3d0-a669-416a-8766-10b446a8ff26'
      and edition.start_date = date '2026-09-18'
      and edition.end_date = date '2026-09-18'
      and edition.start_time = time '14:30'
      and edition.race_formats =
        '[{"label":"5 km"},{"label":"7 km"}]'::jsonb
      and edition.legacy_distance = '5 km, 7 km'
      and edition.source_url =
        'https://events.ihk-elbeweser.de/futurerunausbildunginbewegung'
      and edition.registration_url =
        'https://events.ihk-elbeweser.de/futurerunausbildunginbewegung'
      and edition.registration_status = 'registration_not_open'
      and edition.verification_status = 'needs_review'
      and edition.needs_review is true
      and edition.review_priority = 'high'
      and edition.last_verified_source_id is null
  ) then
    raise exception 'P0 source postcondition failed: Future Run edition facts';
  end if;

  if not exists (
    select 1
    from public.events event
    where event.id = 336
      and event.distance =
        '18 km, 10 km, 10 km Walking, 2.5 km Schüler*innen-Lauf'
      and event.event_url = 'https://my.raceresult.com/383670/registration'
      and event.source_url =
        'https://www.stadt-werther.de/entdecken/peter-august-boeckstiegel/boeckstiegel-lauf'
      and event.official_url =
        'https://www.stadt-werther.de/entdecken/peter-august-boeckstiegel/boeckstiegel-lauf'
      and event.registration_status = 'registration_open'
  ) then
    raise exception
      'P0 source postcondition failed: Boeckstiegellauf event facts';
  end if;

  if not exists (
    select 1
    from public.event_editions edition
    where edition.id = 'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883'
      and edition.start_date = date '2026-09-26'
      and edition.end_date = date '2026-09-26'
      and edition.race_formats =
        '[{"label":"18 km"},{"label":"10 km"},{"label":"10 km Walking"},{"label":"2.5 km Schüler*innen-Lauf"}]'::jsonb
      and edition.legacy_distance =
        '18 km, 10 km, 10 km Walking, 2.5 km Schüler*innen-Lauf'
      and edition.source_url =
        'https://www.stadt-werther.de/entdecken/peter-august-boeckstiegel/boeckstiegel-lauf'
      and edition.registration_url =
        'https://my.raceresult.com/383670/registration'
      and edition.registration_status = 'registration_open'
      and edition.verification_status = 'needs_review'
      and edition.needs_review is true
      and edition.review_priority = 'high'
      and edition.last_verified_source_id is null
  ) then
    raise exception
      'P0 source postcondition failed: Boeckstiegellauf edition facts';
  end if;

  if (select count(*)
      from public.event_sources source
      join p0_new_sources desired on desired.source_id = source.id
      where source.event_id = desired.event_id
        and source.edition_id = desired.edition_id
        and source.source_type = desired.source_type
        and source.source_url = desired.source_url
        and source.source_priority = desired.source_priority
        and source.parser_type = desired.parser_type
        and source.is_active is true
        and source.crawl_status = 'pending'
        and source.consecutive_failures = 0
        and source.last_fetched_at is null
        and source.claimed_at is null
        and source.claimed_by is null) <> 3 then
    raise exception 'P0 source postcondition failed: new source rows';
  end if;

  if not exists (
    select 1
    from public.event_sources source
    where source.id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
      and source.is_active is false
      and source.crawl_status = 'inactive'
      and source.next_fetch_at is null
      and source.claimed_at is null
      and source.claimed_by is null
  ) then
    raise exception 'P0 source postcondition failed: old source is active';
  end if;

  if (select count(*)
      from public.source_crawl_jobs job
      join p0_new_sources desired on desired.source_id = job.source_id
      where job.status = 'queued'
        and job.priority = 999
        and job.trigger_source = 'admin') <> 3 then
    raise exception 'P0 source postcondition failed: expected three queued crawls';
  end if;

  if exists (
    select 1
    from public.source_crawl_jobs job
    where job.source_id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
      and job.status in ('queued', 'processing', 'retry_scheduled')
  ) then
    raise exception 'P0 source postcondition failed: inactive source has work';
  end if;

  if exists (
    select 1
    from public.data_workflow_alerts alert
    where alert.source_id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
      and alert.alert_status = 'open'
      and alert.alert_code = 'robots_unavailable'
  ) or exists (
    select 1
    from public.source_review_tasks task
    where task.source_id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
      and task.status = 'open'
      and task.task_type = 'source_unreachable'
  ) or exists (
    select 1
    from public.validation_issues issue
    where issue.status = 'open'
      and issue.rule_code =
        'source_unreachable_b70e48f0_b99c_4b53_8775_ed760fc9a7e1'
  ) then
    raise exception 'P0 source postcondition failed: old source workflow is open';
  end if;

  if (select count(*)
      from public.crawler_domain_policies policy
      where policy.source_host in (
        'events.ihk-elbeweser.de',
        'www.stadt-werther.de',
        'my.raceresult.com'
      )
        and policy.is_active is true
        and policy.allow_http is false) <> 3 then
    raise exception 'P0 source postcondition failed: secure domain policies';
  end if;

  if (select count(*)
      from public.public_event_discovery discovery
      where discovery.edition_id in (
        '549ea3d0-a669-416a-8766-10b446a8ff26',
        'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883'
      )) <> 2 then
    raise exception 'P0 source postcondition failed: Discovery rows changed';
  end if;

  if (select count(*)
      from public.event_audit_log audit
      where audit.entity_type = 'source'
        and audit.entity_id in (
          '3aa2079d-ee37-4a5c-9853-481eae88f819',
          '0f6e2ca7-5edd-44fd-ad00-2a1d07b4d465',
          'b43ebfb5-2836-485d-86d9-f0e24d1344c3'
        )
        and audit.field_name = '__created__'
        and audit.change_source = 'manual_admin'
        and audit.reason =
          'P0 urgent source reconciliation: official-source review on 2026-09-04')
      <> 3 then
    raise exception 'P0 source postcondition failed: source creation audit';
  end if;

  if not exists (
    select 1
    from public.event_audit_log audit
    where audit.entity_type = 'source'
      and audit.entity_id = 'b70e48f0-b99c-4b53-8775-ed760fc9a7e1'
      and audit.field_name = '__deactivated__'
      and audit.change_source = 'manual_admin'
      and audit.reason =
        'P0 urgent source reconciliation: official-source review on 2026-09-04'
  ) then
    raise exception 'P0 source postcondition failed: source deactivation audit';
  end if;
end
$postcondition$;

select
  event.id as event_id,
  event.canonical_name,
  edition.id as edition_id,
  edition.source_url,
  edition.registration_url,
  edition.registration_status,
  edition.verification_status,
  edition.needs_review,
  count(source.id) filter (where source.is_active) as active_sources,
  count(job.id) filter (
    where job.status in ('queued', 'processing', 'retry_scheduled')
  ) as active_jobs
from public.events event
join public.event_editions edition on edition.event_id = event.id
left join public.event_sources source on source.edition_id = edition.id
left join public.source_crawl_jobs job on job.source_id = source.id
where edition.id in (
  '549ea3d0-a669-416a-8766-10b446a8ff26',
  'd01b2023-ecb6-4a49-a3e2-ae17e3fd0883'
)
group by event.id, event.canonical_name, edition.id
order by event.id;

-- The identical transaction completed successfully with ROLLBACK against the
-- linked production database before this reviewed execution was enabled.
commit;
