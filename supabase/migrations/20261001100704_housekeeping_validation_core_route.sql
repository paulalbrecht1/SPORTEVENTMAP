begin;

-- pg_cron runs as postgres without a browser JWT. Move the existing validator
-- body into one private core; retain the public RPC's exact authorization guard.
-- This changes routing only: no rules, freshness thresholds, jobs or data change.
do $migration$
declare
  validator_oid regprocedure := to_regprocedure('public.run_event_validation(bigint,uuid)');
  housekeeping_oid regprocedure := to_regprocedure('private.run_event_operations_housekeeping()');
  validator_body text;
  validator_definition text;
  housekeeping_definition text;
  core_body text;
  wrapper_body text;
  expected_guard text := $guard$  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
     and not (select private.is_admin()) then
    raise exception 'admin or service role required' using errcode = '42501';
  end if;
$guard$;
  housekeeping_call text := 'perform public.run_event_validation();';
begin
  if current_user <> 'postgres' then
    raise exception 'Apply validation routing migration as postgres; inspect deployment role before applying';
  end if;
  if validator_oid is null or housekeeping_oid is null
     or to_regprocedure('public.run_event_validation_rules_v1(bigint,uuid)') is null then
    raise exception 'Existing validation or housekeeping route missing; inspect migration before applying';
  end if;
  if to_regprocedure('private.run_event_validation_core(bigint,uuid)') is not null then
    raise exception 'Private validation core already exists; inspect migration before applying';
  end if;
  if not exists (select 1 from pg_proc where oid=validator_oid and prosecdef and proowner='postgres'::regrole)
     or not exists (select 1 from pg_proc where oid=housekeeping_oid and prosecdef and proowner='postgres'::regrole)
     or has_function_privilege('anon',validator_oid,'execute')
     or has_function_privilege('anon',housekeeping_oid,'execute')
     or has_function_privilege('authenticated',housekeeping_oid,'execute') then
    raise exception 'Validation or housekeeping security boundary changed; inspect migration before applying';
  end if;

  select prosrc into validator_body from pg_proc where oid=validator_oid;
  core_body := replace(validator_body,E'\r','');
  if (length(core_body)-length(replace(core_body,expected_guard,''))) <> length(expected_guard)
     or btrim(split_part(core_body,expected_guard,1),E' \t\n') <> 'begin' then
    raise exception 'Public validation authorization guard changed; inspect migration before applying';
  end if;
  -- Keep the current validator's complete behavior in exactly one core. The
  -- core runs with its caller's privileges, under the existing definer wrappers.
  core_body := replace(core_body,expected_guard,'');
  execute format($ddl$
    create function private.run_event_validation_core(
      p_event_id bigint default null, p_edition_id uuid default null
    ) returns table(severity text, issue_count bigint)
    language plpgsql security invoker
    set search_path = pg_catalog, public, private
    as %L
  $ddl$,core_body);

  wrapper_body := E'\nbegin\n' || expected_guard || E'\n  return query\n  select result.severity, result.issue_count\n  from private.run_event_validation_core(p_event_id, p_edition_id) result;\nend;\n';
  validator_definition := pg_get_functiondef(validator_oid);
  if strpos(validator_definition,validator_body)=0 then
    raise exception 'Public validation definition changed; inspect migration before applying';
  end if;
  execute replace(validator_definition,validator_body,wrapper_body);

  housekeeping_definition := pg_get_functiondef(housekeeping_oid);
  if (length(housekeeping_definition)-length(replace(housekeeping_definition,housekeeping_call,''))) <> length(housekeeping_call) then
    raise exception 'Housekeeping validation call changed; inspect migration before applying';
  end if;
  execute replace(housekeeping_definition,housekeeping_call,'perform private.run_event_validation_core();');
end;
$migration$;

revoke all on function private.run_event_validation_core(bigint,uuid) from public, anon, authenticated;
grant execute on function private.run_event_validation_core(bigint,uuid) to service_role;
comment on function private.run_event_validation_core(bigint,uuid) is
  'Single existing validation body for the guarded public RPC and private housekeeping; no browser execution rights.';

commit;
