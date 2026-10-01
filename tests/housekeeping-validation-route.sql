-- Synthetic, rollback-only integration for the existing isolated local runner.
-- Never execute this file against a linked or production database.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
do $$ begin
  if current_setting('sporteventmap.test_housekeeping', true) is distinct from 'isolated' then
    raise exception 'Run only from the disposable local maintenance test runner';
  end if;
end $$;
create temporary table housekeeping_checks(label text primary key) on commit drop;
grant select,insert on housekeeping_checks to authenticated,anon,service_role;
create function pg_temp.hk_assert(ok boolean,label text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'HOUSEKEEPING REGRESSION: %',label; end if;
  insert into pg_temp.housekeeping_checks values(label);
end $$;
create function pg_temp.hk_deny(statement text,label text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin execute statement;
  exception when insufficient_privilege then rejected:=true;
  end;
  perform pg_temp.hk_assert(rejected,label);
end $$;

do $tests$
#variable_conflict use_variable
declare
  marker text:='housekeeping-regression-'||gen_random_uuid();
  event_id bigint;
  edition_id uuid;
  workflow_id bigint;
  admin_id uuid:=gen_random_uuid();
  user_id uuid:=gen_random_uuid();
  future_date date:=make_date(extract(year from current_date)::integer+1,5,1);
  original_verified_at timestamptz:='2000-01-01T00:00:00Z';
  core_result jsonb;
  rpc_result jsonb;
begin
  perform pg_temp.hk_assert(not has_function_privilege('anon','private.run_event_validation_core(bigint,uuid)','execute')
    and not has_function_privilege('authenticated','private.run_event_validation_core(bigint,uuid)','execute'),
    'browser roles cannot execute private core');
  perform pg_temp.hk_assert(not has_function_privilege('anon','private.run_event_operations_housekeeping()','execute')
    and not has_function_privilege('authenticated','private.run_event_operations_housekeeping()','execute'),
    'housekeeping remains privileged');
  perform pg_temp.hk_assert((select not prosecdef and proowner='postgres'::regrole from pg_proc
    where oid='private.run_event_validation_core(bigint,uuid)'::regprocedure),
    'core belongs to existing postgres wrapper owner and has no independent security-definer elevation');
  perform pg_temp.hk_assert(not has_schema_privilege('service_role','private','usage'),
    'service role retains existing private schema boundary');
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(admin_id,'authenticated','authenticated',marker||'-admin@example.invalid',now(),now()),
        (user_id,'authenticated','authenticated',marker||'-user@example.invalid',now(),now());
  insert into public.profiles(id,email,role)
  values(admin_id,marker||'-admin@example.invalid','admin'),(user_id,marker||'-user@example.invalid','user')
  on conflict(id) do update set role=excluded.role;
  insert into public.events(event_name,date,city,country,sport,address,latitude,longitude,distance,description,status)
  values(marker,to_char(future_date,'DD.MM.YYYY'),'Berlin','Deutschland','Running','Teststraße 1','52.52000','13.40500','10 km',
    'A synthetic event used only to check privileged housekeeping routing; no real source or human verification exists.','approved')
  returning id into event_id;
  select e.id into edition_id from public.event_editions e where e.event_id=event_id;
  perform pg_temp.hk_assert(edition_id is not null,'fixture retains canonical event-edition relationship');
  update public.events set publication_status='published',verification_status='verified',
    last_verified_at=original_verified_at,next_check_at=now()-interval '1 day',needs_review=false where id=event_id;
  update public.event_editions set publication_status='published',edition_status='scheduled',discovery_status='active',
    verification_status='verified',last_verified_at=original_verified_at,next_check_at=now()-interval '1 day',needs_review=false,
    race_formats='[{"label":"10 km","distance_km":10}]' where id=edition_id;
  -- Fact changes correctly reset freshness. Establish the synthetic expired
  -- metadata only after fixture facts are final; no source proof is created.
  update public.event_editions set verification_status='verified',needs_review=false where id=edition_id;
  perform pg_temp.hk_assert((select verification_status='verified' and not needs_review and next_check_at<now()
    from public.events where id=event_id) and (select verification_status='verified' and not needs_review and next_check_at<now()
    from public.event_editions where id=edition_id),'synthetic aging fixture starts verified and overdue after fact invalidation');

  -- The actual cron role has no browser JWT. The public RPC must still reject
  -- that unauthed route while the already privileged private housekeeper works.
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform pg_temp.hk_deny(format('select public.run_event_validation(%s,null)',event_id),
    'public RPC still rejects missing service role and admin identity');
  workflow_id:=private.run_event_operations_housekeeping();
  perform pg_temp.hk_assert((select run_status='succeeded' and error_message is null from public.data_workflow_runs where id=workflow_id),
    'postgres cron route succeeds without JWT impersonation');
  perform pg_temp.hk_assert((select metadata->>'stale_events'='1' and metadata->>'stale_editions'='1' and changed_count=2
    from public.data_workflow_runs where id=workflow_id),'housekeeping ages both overdue verified records under existing policy');
  -- The intentionally missing source is an error, not merely an overdue check.
  -- Existing review-signal invalidation therefore upgrades edition stale to
  -- needs_review after aging. The event keeps its stale metadata.
  perform pg_temp.hk_assert((select verification_status='stale' and needs_review from public.events where id=event_id)
    and (select verification_status='needs_review' and needs_review and last_verified_source_id is null
      from public.event_editions where id=edition_id),'new blocking source issue requires review after the stale transition');
  perform pg_temp.hk_assert(exists(select 1 from public.validation_issues where validation_issues.event_id=event_id
    and rule_code='missing_source' and status='open'),'existing source rule still detects real missing data');
  perform pg_temp.hk_assert((select last_verified_at=original_verified_at from public.events where id=event_id)
    and (select last_verified_at=original_verified_at from public.event_editions where id=edition_id)
    and not exists(select 1 from public.event_field_controls where event_field_controls.event_id=event_id),
    'housekeeping does not create human evidence or fresh timestamps');
  select coalesce(jsonb_agg(to_jsonb(result) order by result.severity),'[]') into core_result
    from private.run_event_validation_core(event_id,null) result;

  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_id)::text,true);
  perform set_config('request.jwt.claim.sub',user_id::text,true);
  execute 'set local role authenticated';
  perform pg_temp.hk_deny(format('select public.run_event_validation(%s,null)',event_id),'ordinary user cannot run public validator');
  perform pg_temp.hk_deny(format('select private.run_event_validation_core(%s,null)',event_id),'ordinary user cannot call private core');
  perform pg_temp.hk_deny('select private.run_event_operations_housekeeping()','ordinary user cannot call housekeeper');
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(to_jsonb(result) order by result.severity),'[]') into rpc_result
    from public.run_event_validation(event_id,null) result;
  perform pg_temp.hk_assert(rpc_result=core_result,'authorized admin RPC returns same existing rule counts as core');
  perform pg_temp.hk_deny(format('select private.run_event_validation_core(%s,null)',event_id),'admin browser cannot bypass wrapper authorization');
  execute 'reset role';

  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  perform pg_temp.hk_deny(format('select public.run_event_validation(%s,null)',event_id),'anon cannot run public validator');
  perform pg_temp.hk_deny(format('select private.run_event_validation_core(%s,null)',event_id),'anon cannot call core');
  perform pg_temp.hk_deny('select private.run_event_operations_housekeeping()','anon cannot call housekeeper');
  execute 'reset role';

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role service_role';
  select coalesce(jsonb_agg(to_jsonb(result) order by result.severity),'[]') into rpc_result
    from public.run_event_validation(event_id,null) result;
  perform pg_temp.hk_assert(rpc_result=core_result,'existing service-role RPC remains authorized with identical counts');
  perform pg_temp.hk_deny(format('select private.run_event_validation_core(%s,null)',event_id),
    'service role uses the guarded public RPC and cannot enter private schema');
  execute 'reset role';
end;
$tests$;
select 'HOUSEKEEPING_ASSERTIONS='||count(*) from housekeeping_checks;
rollback;
