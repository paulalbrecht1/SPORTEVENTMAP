-- Closed-beta security gate: only admins and the service worker may run the
-- validation RPC. The previous definition was SECURITY DEFINER and granted to
-- authenticated without an internal authorization check.
create or replace function public.run_event_validation(
  p_event_id bigint default null,
  p_edition_id uuid default null
)
returns table(severity text, issue_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
     and not (select private.is_admin()) then
    raise exception 'admin or service role required' using errcode = '42501';
  end if;

  perform 1
  from public.run_event_validation_rules_v1(p_event_id, p_edition_id);

  update public.validation_issues
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = (select auth.uid()),
      updated_at = now()
  where status = 'open'
    and (p_event_id is null or event_id = p_event_id)
    and (p_edition_id is null or edition_id = p_edition_id)
    and rule_code in (
      'future_date_unverified',
      'edition_verification_stale',
      'missing_start_time',
      'missing_price'
    );

  return query
  select issue.severity, count(*)
  from public.validation_issues issue
  where issue.status = 'open'
    and (p_event_id is null or issue.event_id = p_event_id)
    and (p_edition_id is null or issue.edition_id = p_edition_id)
  group by issue.severity;
end;
$$;

revoke all on function public.run_event_validation(bigint, uuid)
  from public, anon;
grant execute on function public.run_event_validation(bigint, uuid)
  to authenticated, service_role;

comment on function public.run_event_validation(bigint, uuid) is
  'Runs validation as an admin or service worker; normal authenticated users are rejected before parameters are processed.';
