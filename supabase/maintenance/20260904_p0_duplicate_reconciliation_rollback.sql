-- Targeted rollback for 20260904_p0_duplicate_reconciliation.sql.
--
-- The correction script must have committed its snapshots under the matching
-- private.event_data_workflow_backup migration key. This rollback restores the
-- snapshotted business state, keeps the correction/rollback audit trail, and
-- removes only domain policies whose pre-change marker records their absence.
--
-- Dry-run default: the final statement is ROLLBACK. Change it to COMMIT only
-- during an explicitly approved production recovery.

begin isolation level serializable;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('sporteventmap:p0-duplicate-reconciliation:20260904', 0)
);

lock table public.source_crawl_jobs in share mode;

select set_config('app.change_source', 'manual_admin', true);
select set_config(
  'app.change_reason',
  'Rollback of P0 duplicate reconciliation from 2026-09-04',
  true
);

do $preflight$
declare
  drift_count integer := 0;
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
  ) < 10
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'crawler_domain_policies'
  ) <> 5 then
    raise exception 'P0 duplicate rollback precondition failed: required snapshots are incomplete';
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
  ) <> (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'event_sources'
  )
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'crawler_domain_policies_post_state'
  ) <> 5
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'data_workflow_alerts_post_state'
  ) <> (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'data_workflow_alerts'
  )
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'source_review_tasks_post_state'
  ) <> (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'source_review_tasks'
  )
  or (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'validation_issues_post_state'
  ) <> (
    select count(*)
    from private.event_data_workflow_backup
    where migration_key = '20260904_p0_duplicate_reconciliation'
      and entity_table = 'validation_issues'
  ) then
    raise exception 'P0 duplicate rollback precondition failed: post-state drift guards are incomplete';
  end if;

  select count(*) into drift_count
  from private.event_data_workflow_backup backup
  left join public.events event on event.id::text = backup.entity_pk
  where backup.migration_key = '20260904_p0_duplicate_reconciliation'
    and backup.entity_table = 'events_post_state'
    and (
      event.id is null
      or (to_jsonb(event) - 'updated_at') is distinct from
         (backup.row_data - 'updated_at')
    );

  drift_count := drift_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    left join public.event_editions edition on edition.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'event_editions_post_state'
      and (
        edition.id is null
        or (to_jsonb(edition) - 'updated_at') is distinct from
           (backup.row_data - 'updated_at')
      )
  );

  drift_count := drift_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    left join public.event_sources source on source.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'event_sources_post_state'
      and (
        source.id is null
        or (to_jsonb(source) - 'updated_at') is distinct from
           (backup.row_data - 'updated_at')
      )
  );

  drift_count := drift_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    left join public.crawler_domain_policies policy
      on policy.source_host = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'crawler_domain_policies_post_state'
      and (
        policy.id is null
        or (to_jsonb(policy) - 'updated_at') is distinct from
           (backup.row_data - 'updated_at')
      )
  );

  drift_count := drift_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    left join public.data_workflow_alerts alert on alert.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'data_workflow_alerts_post_state'
      and (
        alert.id is null
        or (to_jsonb(alert) - 'updated_at') is distinct from
           (backup.row_data - 'updated_at')
      )
  );

  drift_count := drift_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    left join public.source_review_tasks task on task.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'source_review_tasks_post_state'
      and (
        task.id is null
        or (to_jsonb(task) - 'updated_at') is distinct from
           (backup.row_data - 'updated_at')
      )
  );

  drift_count := drift_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    left join public.validation_issues issue on issue.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'validation_issues_post_state'
      and (
        issue.id is null
        or (to_jsonb(issue) - 'updated_at') is distinct from
           (backup.row_data - 'updated_at')
      )
  );

  if drift_count <> 0 then
    raise exception
      'P0 duplicate rollback precondition failed: % target rows changed after correction',
      drift_count;
  end if;

  if exists (
    select 1
    from public.source_crawl_jobs job
    join private.event_data_workflow_backup backup
      on backup.migration_key = '20260904_p0_duplicate_reconciliation'
     and backup.entity_table = 'event_sources'
     and backup.entity_pk = job.source_id::text
    where job.status in ('queued', 'processing', 'retry_scheduled')
  ) then
    raise exception 'P0 duplicate rollback precondition failed: a target source has an active crawl job';
  end if;

  perform 1
  from public.event_sources source
  join private.event_data_workflow_backup backup
    on backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and backup.entity_table = 'event_sources'
   and backup.entity_pk = source.id::text
  for update of source;

  perform 1
  from public.events event
  join private.event_data_workflow_backup backup
    on backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and backup.entity_table = 'events'
   and backup.entity_pk = event.id::text
  for update of event;

  perform 1
  from public.event_editions edition
  join private.event_data_workflow_backup backup
    on backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and backup.entity_table = 'event_editions'
   and backup.entity_pk = edition.id::text
  for update of edition;

  perform 1
  from public.crawler_domain_policies policy
  join private.event_data_workflow_backup backup
    on backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and backup.entity_table = 'crawler_domain_policies'
   and backup.entity_pk = policy.source_host
  for update of policy;

  perform 1
  from public.data_workflow_alerts alert
  join private.event_data_workflow_backup backup
    on backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and backup.entity_table = 'data_workflow_alerts'
   and backup.entity_pk = alert.id::text
  for update of alert;

  perform 1
  from public.source_review_tasks task
  join private.event_data_workflow_backup backup
    on backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and backup.entity_table = 'source_review_tasks'
   and backup.entity_pk = task.id::text
  for update of task;

  perform 1
  from public.validation_issues issue
  join private.event_data_workflow_backup backup
    on backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and backup.entity_table = 'validation_issues'
   and backup.entity_pk = issue.id::text
  for update of issue;
end
$preflight$;

do $restore_rows$
declare
  target_table text;
  target_pk text;
  assignments text;
  backup_record record;
  restored_count integer;
begin
  -- Restore sources before events. Source lifecycle side effects are restored
  -- later; events are then restored before editions because their compatibility
  -- trigger mirrors legacy facts into the edition row.
  foreach target_table in array array[
    'event_sources',
    'events',
    'event_editions',
    'crawler_domain_policies',
    'data_workflow_alerts',
    'source_review_tasks',
    'validation_issues'
  ]
  loop
    target_pk := case
      when target_table = 'crawler_domain_policies' then 'source_host'
      else 'id'
    end;

    if not exists (
      select 1
      from private.event_data_workflow_backup backup
      where backup.migration_key = '20260904_p0_duplicate_reconciliation'
        and backup.entity_table = target_table
        and not (
          target_table = 'crawler_domain_policies'
          and backup.row_data ->> '_maintenance_absent' = 'true'
        )
    ) then
      continue;
    end if;

    select string_agg(
      format('%1$I = restored.%1$I', column_name),
      ', '
      order by ordinal_position
    )
    into assignments
    from information_schema.columns
    where table_schema = 'public'
      and table_name = target_table
      and is_generated = 'NEVER'
      and column_name <> target_pk
      and not (
        target_table = 'crawler_domain_policies'
        and column_name = 'id'
      )
      and exists (
        select 1
        from private.event_data_workflow_backup backup
        where backup.migration_key = '20260904_p0_duplicate_reconciliation'
          and backup.entity_table = target_table
          and backup.row_data ? information_schema.columns.column_name
          and not (
            target_table = 'crawler_domain_policies'
            and backup.row_data ->> '_maintenance_absent' = 'true'
          )
      );

    if assignments is null then
      raise exception 'P0 duplicate rollback failed: no restorable columns for %', target_table;
    end if;

    for backup_record in
      select backup.entity_pk, backup.row_data
      from private.event_data_workflow_backup backup
      where backup.migration_key = '20260904_p0_duplicate_reconciliation'
        and backup.entity_table = target_table
        and not (
          target_table = 'crawler_domain_policies'
          and backup.row_data ->> '_maintenance_absent' = 'true'
        )
      order by backup.entity_pk
    loop
      execute format(
        'update public.%1$I target '
        'set %2$s '
        'from (select (jsonb_populate_record(null::public.%1$I, $1)).*) restored '
        'where target.%3$I::text = $2',
        target_table,
        assignments,
        target_pk
      )
      using backup_record.row_data, backup_record.entity_pk;

      get diagnostics restored_count = row_count;
      if restored_count <> 1 then
        raise exception
          'P0 duplicate rollback failed: expected one %.% row for %, restored %',
          target_table,
          target_pk,
          backup_record.entity_pk,
          restored_count;
      end if;
    end loop;
  end loop;
end
$restore_rows$;

-- Canonical source URLs have now been restored. Remove only policies marked as
-- absent before the correction and only when no source uses their host.
delete from public.crawler_domain_policies policy
using private.event_data_workflow_backup backup
where backup.migration_key = '20260904_p0_duplicate_reconciliation'
  and backup.entity_table = 'crawler_domain_policies'
  and backup.row_data ->> '_maintenance_absent' = 'true'
  and policy.source_host = backup.entity_pk
  and not exists (
    select 1
    from public.event_sources source
    where source.source_host = policy.source_host
  );

do $postcondition$
declare
  mismatch_count integer;
  restored_archive_count integer;
begin
  select count(*) into mismatch_count
  from private.event_data_workflow_backup backup
  join public.event_sources source on source.id::text = backup.entity_pk
  where backup.migration_key = '20260904_p0_duplicate_reconciliation'
    and backup.entity_table = 'event_sources'
    and (to_jsonb(source) - 'updated_at') is distinct from
        (backup.row_data - 'updated_at');

  mismatch_count := mismatch_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    join public.events event on event.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'events'
      and (to_jsonb(event) - 'updated_at') is distinct from
          (backup.row_data - 'updated_at')
  );

  mismatch_count := mismatch_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    join public.event_editions edition on edition.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'event_editions'
      and (to_jsonb(edition) - 'updated_at') is distinct from
          (backup.row_data - 'updated_at')
  );

  mismatch_count := mismatch_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    join public.crawler_domain_policies policy
      on policy.source_host = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'crawler_domain_policies'
      and backup.row_data ->> '_maintenance_absent' is distinct from 'true'
      and (to_jsonb(policy) - 'updated_at') is distinct from
          (backup.row_data - 'updated_at')
  );

  mismatch_count := mismatch_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    join public.data_workflow_alerts alert on alert.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'data_workflow_alerts'
      and (to_jsonb(alert) - 'updated_at') is distinct from
          (backup.row_data - 'updated_at')
  );

  mismatch_count := mismatch_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    join public.source_review_tasks task on task.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'source_review_tasks'
      and (to_jsonb(task) - 'updated_at') is distinct from
          (backup.row_data - 'updated_at')
  );

  mismatch_count := mismatch_count + (
    select count(*)
    from private.event_data_workflow_backup backup
    join public.validation_issues issue on issue.id::text = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'validation_issues'
      and (to_jsonb(issue) - 'updated_at') is distinct from
          (backup.row_data - 'updated_at')
  );

  if exists (
    select 1
    from private.event_data_workflow_backup backup
    join public.crawler_domain_policies policy
      on policy.source_host = backup.entity_pk
    where backup.migration_key = '20260904_p0_duplicate_reconciliation'
      and backup.entity_table = 'crawler_domain_policies'
      and backup.row_data ->> '_maintenance_absent' = 'true'
  ) then
    raise exception 'P0 duplicate rollback failed: a correction-created domain policy remains';
  end if;

  select count(*) into restored_archive_count
  from public.public_event_archive archive
  join private.event_data_workflow_backup event_backup
    on event_backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and event_backup.entity_table = 'events'
   and event_backup.entity_pk = archive.event_id::text
  join private.event_data_workflow_backup edition_backup
    on edition_backup.migration_key = '20260904_p0_duplicate_reconciliation'
   and edition_backup.entity_table = 'event_editions'
   and edition_backup.entity_pk = archive.edition_id::text;

  if mismatch_count <> 0 or restored_archive_count <> 10 then
    raise exception
      'P0 duplicate rollback postcondition failed: mismatches %, archive rows %',
      mismatch_count,
      restored_archive_count;
  end if;
end
$postcondition$;

select
  event.id,
  event.canonical_name,
  event.status,
  event.publication_status,
  edition.start_date,
  edition.discovery_status,
  source.is_active as source_active,
  source.crawl_status
from private.event_data_workflow_backup event_backup
join public.events event on event.id::text = event_backup.entity_pk
join private.event_data_workflow_backup edition_backup
  on edition_backup.migration_key = event_backup.migration_key
 and edition_backup.entity_table = 'event_editions'
 and (edition_backup.row_data ->> 'event_id')::bigint = event.id
join public.event_editions edition on edition.id::text = edition_backup.entity_pk
left join private.event_data_workflow_backup source_backup
  on source_backup.migration_key = event_backup.migration_key
 and source_backup.entity_table = 'event_sources'
 and (source_backup.row_data ->> 'event_id')::bigint = event.id
left join public.event_sources source on source.id::text = source_backup.entity_pk
where event_backup.migration_key = '20260904_p0_duplicate_reconciliation'
  and event_backup.entity_table = 'events'
order by event.id, source.id;

rollback;
