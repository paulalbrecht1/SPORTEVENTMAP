-- Transactional RLS/RPC test against an isolated restored database.
-- No change persists because the entire test is rolled back.
\set ON_ERROR_STOP on

begin;

do $restore_security$
declare
  normal_user_id uuid;
  sample_event_id bigint;
  visible_other_rows bigint;
  changed_rows bigint;
  validator_denied boolean := false;
begin
  select profile.id
  into normal_user_id
  from public.profiles profile
  where coalesce(profile.role, 'user') <> 'admin'
  order by profile.created_at, profile.id
  limit 1;

  if normal_user_id is null then
    raise exception 'Restore security test requires at least one non-admin profile.';
  end if;

  select event.id into sample_event_id
  from public.events event
  order by event.id
  limit 1;

  if sample_event_id is null then
    raise exception 'Restore security test requires at least one event.';
  end if;

  perform set_config('request.jwt.claim.sub', normal_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', normal_user_id, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  select count(*) into visible_other_rows
  from public.favorites favorite
  where favorite.user_id <> normal_user_id;
  if visible_other_rows <> 0 then
    raise exception 'RLS leaked % foreign favorite rows.', visible_other_rows;
  end if;

  select count(*) into visible_other_rows
  from public.season_planner_events planner
  where planner.user_id <> normal_user_id;
  if visible_other_rows <> 0 then
    raise exception 'RLS leaked % foreign planner rows.', visible_other_rows;
  end if;

  select count(*) into visible_other_rows
  from public.profiles profile
  where profile.id <> normal_user_id;
  if visible_other_rows <> 0 then
    raise exception 'RLS leaked % foreign profile rows.', visible_other_rows;
  end if;

  begin
    perform public.run_event_validation(sample_event_id, null::uuid);
  exception
    when insufficient_privilege then
      validator_denied := true;
  end;
  if not validator_denied then
    raise exception 'Normal authenticated user executed run_event_validation().';
  end if;

  begin
    update public.profiles
    set role = 'admin'
    where id = normal_user_id;
    get diagnostics changed_rows = row_count;
  exception
    when insufficient_privilege or check_violation then
      changed_rows := 0;
  end;
  if changed_rows <> 0 then
    raise exception 'Normal user promoted their own profile to admin.';
  end if;

  execute 'reset role';
end
$restore_security$;

rollback;

select jsonb_build_object(
  'security_verified', true,
  'normal_user_isolation', true,
  'admin_self_promotion_denied', true,
  'run_event_validation_denied', true,
  'persistent_changes', false
) as restore_security_verification;
