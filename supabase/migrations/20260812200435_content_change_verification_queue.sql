-- Scale human verification without allowing crawlers to mutate event facts.
-- Only successful crawls of official pages for current, published editions are
-- exposed. An admin must inspect the evidence and explicitly confirm the data.

begin;

create index if not exists source_review_tasks_content_verification_idx
  on public.source_review_tasks(created_at desc, source_id, edition_id)
  where status = 'open' and task_type = 'content_changed';

create or replace view public.admin_review_inbox
with (security_invoker = true)
as
select base.item_type, base.item_id, base.event_id, base.edition_id,
  base.priority, base.title, base.description, base.confidence, base.status,
  base.created_at, base.batch_action, base.metadata
from public.admin_exception_inbox base
where base.item_type not in ('source', 'workflow')
union all
select source_item.item_type, source_item.item_id, source_item.event_id, source_item.edition_id,
  source_item.priority, source_item.title,
  source_item.description || case when source_item.related_count > 1
    then ' (' || source_item.related_count::text || ' technische Meldungen gebuendelt.)' else '' end,
  source_item.confidence, source_item.status, source_item.created_at,
  'review_source_bundle'::text as batch_action,
  source_item.metadata || jsonb_build_object(
    'source_url', source.source_url,
    'source_type', source.source_type,
    'source_host', source.source_host,
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
    || ' Eventfakten werden erst nach manueller Sichtpruefung bestaetigt.' as description,
  edition.data_confidence as confidence,
  task.status,
  task.created_at,
  'verify_content'::text as batch_action,
  jsonb_build_object(
    'source_id', source.id,
    'source_url', source.source_url,
    'source_type', source.source_type,
    'source_host', source.source_host,
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
    'edition_start_date', edition.start_date,
    'edition_verification_status', edition.verification_status
  ) as metadata
from public.source_review_tasks task
join public.event_sources source on source.id = task.source_id
join public.event_editions edition on edition.id = task.edition_id
join public.source_crawl_results result on result.id = task.crawl_result_id
where task.status = 'open'
  and task.task_type = 'content_changed'
  and task.priority = 'low'
  and source.is_active
  and source.source_type = 'official_event_website'
  and source.crawl_status = 'success'
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
    where other_task.source_id = task.source_id
      and other_task.status = 'open'
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
  );

revoke all on public.admin_review_inbox from public, anon, authenticated;
grant select on public.admin_review_inbox to authenticated;

create or replace function public.verify_content_change_tasks(
  p_task_ids uuid[],
  p_notes text default null
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
  skipped_count integer := 0;
  task_record record;
  edition_record public.event_editions;
  selected_edition_id uuid;
  evidence_fetched_at timestamptz;
  evidence_source_url text;
  verified_edition_ids uuid[] := '{}'::uuid[];
  reviewer_id uuid := (select auth.uid());
  review_notes text := coalesce(
    nullif(btrim(p_notes), ''),
    'Official source inspected in the content verification queue'
  );
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
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

  -- Lock in a stable order. The eligibility query intentionally mirrors the
  -- review view so a crafted RPC call cannot bypass the queue safeguards.
  for task_record in
    select task.id
    from public.source_review_tasks task
    join public.event_sources source on source.id = task.source_id
    join public.event_editions edition on edition.id = task.edition_id
    join public.source_crawl_results result on result.id = task.crawl_result_id
    where task.id = any(p_task_ids)
      and task.status = 'open'
      and task.task_type = 'content_changed'
      and task.priority = 'low'
      and source.is_active
      and source.source_type = 'official_event_website'
      and source.crawl_status = 'success'
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
        where other_task.source_id = task.source_id
          and other_task.status = 'open'
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
    for update of task
  loop
    eligible_count := eligible_count + 1;
  end loop;

  if eligible_count <> requested_count then
    raise exception 'one or more tasks are no longer eligible for verification'
      using errcode = 'P0001';
  end if;

  update public.source_review_tasks
  set status = 'resolved',
      reviewed_at = now(),
      reviewed_by = reviewer_id,
      review_notes = review_notes,
      updated_at = now()
  where id = any(p_task_ids)
    and status = 'open'
    and task_type = 'content_changed';
  get diagnostics resolved_count = row_count;

  -- Editions are locked and updated in UUID order to keep concurrent admin
  -- batches deterministic. A newly-created blocker prevents verification but
  -- does not reopen the already-reviewed source-change task.
  for selected_edition_id in
    select distinct task.edition_id
    from public.source_review_tasks task
    where task.id = any(p_task_ids) and task.edition_id is not null
    order by task.edition_id
  loop
    select * into edition_record
    from public.event_editions edition
    where edition.id = selected_edition_id
    for update;

    if edition_record.id is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    if exists (
      select 1 from public.source_review_tasks open_task
      where open_task.status = 'open'
        and (
          open_task.edition_id = selected_edition_id
          or open_task.event_id = edition_record.event_id
        )
    ) or exists (
      select 1 from public.event_change_proposals proposal
      where proposal.proposal_status = 'pending'
        and (
          proposal.edition_id = selected_edition_id
          or proposal.event_id = edition_record.event_id
        )
    ) or exists (
      select 1 from public.validation_issues issue
      where issue.status = 'open'
        and issue.severity in ('error', 'critical')
        and (
          issue.edition_id = selected_edition_id
          or issue.event_id = edition_record.event_id
        )
    ) or exists (
      select 1 from public.data_workflow_alerts alert
      where alert.alert_status = 'open'
        and alert.severity in ('error', 'critical')
        and (
          alert.edition_id = selected_edition_id
          or alert.event_id = edition_record.event_id
        )
    ) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select max(result.fetched_at), min(source.source_url)
      into evidence_fetched_at, evidence_source_url
    from public.source_review_tasks task
    join public.source_crawl_results result on result.id = task.crawl_result_id
    join public.event_sources source on source.id = task.source_id
    where task.id = any(p_task_ids)
      and task.edition_id = selected_edition_id;

    perform set_config('app.change_source', 'manual_admin', true);
    perform set_config('app.change_reason', review_notes, true);
    perform set_config('app.change_url', coalesce(evidence_source_url, ''), true);

    update public.event_editions
    set verification_status = 'verified',
        needs_review = false,
        last_verified_at = greatest(now(), coalesce(evidence_fetched_at, now())),
        next_check_at = now() + case
          when start_date <= current_date + 30 then interval '7 days'
          when start_date <= current_date + 90 then interval '14 days'
          else interval '30 days'
        end,
        updated_at = now()
    where id = selected_edition_id;

    verified_count := verified_count + 1;
    verified_edition_ids := array_append(verified_edition_ids, selected_edition_id);
  end loop;

  return jsonb_build_object(
    'requested_count', requested_count,
    'resolved_count', resolved_count,
    'verified_count', verified_count,
    'skipped_count', skipped_count,
    'verified_edition_ids', to_jsonb(verified_edition_ids)
  );
end;
$$;

revoke all on function public.verify_content_change_tasks(uuid[], text)
  from public, anon, authenticated;
grant execute on function public.verify_content_change_tasks(uuid[], text)
  to authenticated;

comment on view public.admin_review_inbox is
  'Deduplicated admin queue plus evidence-backed manual verification of current official event sources.';
comment on function public.verify_content_change_tasks(uuid[], text) is
  'Admin-only batch confirmation of reviewed official-source changes; event facts are never mutated.';

commit;
