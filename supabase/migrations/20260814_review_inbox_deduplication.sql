-- Present one actionable technical exception per source instead of repeating
-- the same crawl failure as task, dead-letter item and workflow alert.

begin;

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
);

revoke all on public.admin_review_inbox from public, anon, authenticated;
grant select on public.admin_review_inbox to authenticated;

create or replace function public.resolve_source_exception_bundle(
  p_source_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  resolved_tasks integer := 0;
  resolved_alerts integer := 0;
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.event_sources where id = p_source_id) then
    raise exception 'source not found' using errcode = 'P0002';
  end if;

  update public.source_review_tasks
  set status = 'resolved', reviewed_at = now(), reviewed_by = (select auth.uid()),
      review_notes = coalesce(nullif(p_notes, ''), 'Technical source exception bundle resolved in Review Inbox'),
      updated_at = now()
  where source_id = p_source_id and status = 'open'
    and task_type not in ('new_edition_candidate', 'results_available', 'content_changed');
  get diagnostics resolved_tasks = row_count;

  update public.data_workflow_alerts
  set alert_status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid()),
      updated_at = now()
  where source_id = p_source_id and alert_status = 'open'
    and severity in ('error', 'critical');
  get diagnostics resolved_alerts = row_count;

  return jsonb_build_object(
    'source_id', p_source_id,
    'resolved_tasks', resolved_tasks,
    'resolved_alerts', resolved_alerts
  );
end;
$$;

revoke all on function public.resolve_source_exception_bundle(uuid, text)
  from public, anon;
grant execute on function public.resolve_source_exception_bundle(uuid, text)
  to authenticated;

comment on view public.admin_review_inbox is
  'Deduplicated exception-first admin queue; technical errors are grouped to one item per source.';
comment on function public.resolve_source_exception_bundle(uuid, text) is
  'Admin-only RLS-respecting resolution of all open technical tasks and alerts for one source.';

commit;
