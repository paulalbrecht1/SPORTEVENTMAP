import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r', '');
const migration = read('supabase/migrations/20261001100704_housekeeping_validation_core_route.sql');
const priorValidator = read('supabase/migrations/20260814120000_beta_security_definer_hardening.sql');
const priorHousekeeping = read('supabase/migrations/20260812185304_source_alert_lifecycle_recovery.sql');
const regression = read('tests/housekeeping-validation-route.sql');
const body = source => source.match(/as \$\$\n([\s\S]*?)\n\$\$;/)?.[1];
const guard = migration.match(/expected_guard text := \$guard\$([\s\S]*?)\$guard\$;/)?.[1];
const existingBody = body(priorValidator);
assert.ok(guard && existingBody);

// Exercise the fail-closed extraction contract on the real previous definition.
// This checks routing structure only; actual PostgreSQL/RLS execution is the
// separate isolated rollback regression, never claimed by this static test.
function extractCore(source) {
  if (source.split(guard).length !== 2 || source.split(guard)[0].trim() !== 'begin') throw new Error('guard changed');
  return source.replace(guard, '');
}
const extracted = extractCore(existingBody);
assert.equal(extracted, existingBody.replace(guard, ''));
assert.equal(extractCore('\n' + existingBody), '\n' + extracted, 'Postgres prosrc retains the leading delimiter newline.');
assert.match(extracted, /from public\.run_event_validation_rules_v1\(p_event_id, p_edition_id\)/);
assert.match(extracted, /update public\.validation_issues[\s\S]*'future_date_unverified'[\s\S]*'missing_price'/);
assert.match(extracted, /return query[\s\S]*group by issue\.severity/);
assert.throws(() => extractCore(existingBody.replace("<> 'service_role'", "= 'authenticated'")), /guard changed/);
assert.throws(() => extractCore(existingBody.replace(guard, '')), /guard changed/);
assert.throws(() => extractCore(existingBody.replace(guard, guard + guard)), /guard changed/);
assert.throws(() => extractCore(existingBody.replace('begin\n', 'begin\n perform 1;\n')), /guard changed/);

assert.match(migration, /select prosrc into validator_body from pg_proc where oid=validator_oid/);
assert.match(migration, /if current_user <> 'postgres' then\s*raise exception 'Apply validation routing migration as postgres/);
assert.ok(migration.indexOf("if current_user <> 'postgres'") < migration.indexOf('execute format('),
  'Migration must reject another owner before creating the core or altering functions.');
assert.match(migration, /core_body := replace\(core_body,expected_guard,''\)/);
assert.ok(migration.includes("btrim(split_part(core_body,expected_guard,1),E' \\t\\n')"),
  'Postgres btrim must explicitly trim delimiter newlines and tabs, not just spaces.');
assert.match(migration, /execute format\([\s\S]*create function private\.run_event_validation_core[\s\S]*security invoker[\s\S]*as %L[\s\S]*core_body\)/);
assert.match(migration, /wrapper_body := [^\n]*expected_guard[^\n]*private\.run_event_validation_core\(p_event_id, p_edition_id\)/);
assert.match(migration, /execute replace\(validator_definition,validator_body,wrapper_body\)/);
assert.match(migration, /revoke all on function private\.run_event_validation_core\(bigint,uuid\) from public, anon, authenticated/);
assert.match(migration, /grant execute on function private\.run_event_validation_core\(bigint,uuid\) to service_role/);
assert.match(migration, /has_function_privilege\('anon',validator_oid,'execute'\)/);
assert.match(migration, /has_function_privilege\('authenticated',housekeeping_oid,'execute'\)/);
assert.doesNotMatch(migration, /set_config|request\.jwt|update public\.|insert into public\.|alter table|cron\.schedule|cron\.unschedule/i);
assert.doesNotMatch(migration, /create (?:or replace )?function public\.run_event_validation_rules_v1/i);
assert.ok(!migration.includes('future_date_unverified'), 'Rule body must come from the installed validator, not be copied into migration.');

const housekeepingBody = priorHousekeeping.match(/create or replace function private\.run_event_operations_housekeeping\(\)[\s\S]*?as \$\$\n([\s\S]*?)\n\$\$;/)?.[1];
assert.ok(housekeepingBody);
const oldCall = 'perform public.run_event_validation();';
assert.equal(housekeepingBody.split(oldCall).length, 2);
const routedHousekeeping = housekeepingBody.replace(oldCall, 'perform private.run_event_validation_core();');
assert.equal(routedHousekeeping.replace('perform private.run_event_validation_core();', oldCall), housekeepingBody,
  'Only the validation call changes; stale transitions, recovery and run logging stay exact.');
assert.match(migration, /execute replace\(housekeeping_definition,housekeeping_call,'perform private\.run_event_validation_core\(\);'\)/);
assert.match(migration, /Housekeeping validation call changed; inspect migration before applying/);
assert.match(regression, /sporteventmap\.test_housekeeping[\s\S]*is distinct from 'isolated'/);
assert.match(regression, /run_status='succeeded'/);
assert.match(regression, /synthetic aging fixture starts verified and overdue after fact invalidation/);
assert.match(regression, /metadata->>'stale_events'='1' and metadata->>'stale_editions'='1' and changed_count=2/);
assert.match(regression, /new blocking source issue requires review after the stale transition/);
assert.match(regression, /not has_schema_privilege\('service_role','private','usage'\)/);
assert.match(regression, /service role uses the guarded public RPC and cannot enter private schema/);
assert.match(regression, /not prosecdef and proowner='postgres'::regrole/);
assert.match(regression, /set local role authenticated/);
assert.match(regression, /set local role anon/);
assert.match(regression, /set local role service_role/);
assert.match(regression, /rollback;\s*$/);
console.log('Housekeeping route static contract passed: single existing core, unchanged public guard and privileged cron route. PostgreSQL/RLS execution is a separate local test.');
