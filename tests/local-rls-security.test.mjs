import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const supabaseCli = path.join(
  root,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js"
);
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function runSupabase(args) {
  const result = spawnSync(
    process.execPath,
    [supabaseCli, ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        DO_NOT_TRACK: "1",
        SUPABASE_TELEMETRY_DISABLED: "1"
      }
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `supabase ${args.join(" ")} failed:\n${
        result.error?.stack || [result.stderr, result.stdout].filter(Boolean).join("\n") || "unknown error"
      }`
    );
  }

  return result.stdout;
}

function queryLocal(sql) {
  const output = runSupabase([
    "db",
    "query",
    "--local",
    "--output",
    "json",
    sql
  ]);
  return JSON.parse(output).rows;
}

function parseStatusEnvironment(output) {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map(line => line.match(/^([A-Z0-9_]+)=(?:"([\s\S]*)"|(.*))$/))
      .filter(Boolean)
      .map(match => [match[1], match[2] ?? match[3] ?? ""])
  );
}

async function adminRequest(apiUrl, serviceRoleKey, path, options = {}) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  assert.equal(
    response.ok,
    true,
    `Local Auth admin request failed (${response.status}): ${text}`
  );

  return body;
}

const local = parseStatusEnvironment(
  runSupabase(["status", "-o", "env"])
);

assert.ok(local.API_URL, "Local Supabase API_URL is missing.");
assert.ok(local.ANON_KEY, "Local Supabase ANON_KEY is missing.");
assert.ok(
  local.SERVICE_ROLE_KEY,
  "Local Supabase SERVICE_ROLE_KEY is missing."
);

const [hardeningState] = queryLocal(`
  with expanded_policies as (
    select
      schemaname,
      tablename,
      role_name,
      action_name
    from pg_policies
    cross join lateral unnest(roles) as role_name
    cross join lateral unnest(
      case
        when cmd = 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
        else array[cmd]
      end
    ) as action_name
    where schemaname = 'public'
  ), duplicate_policy_groups as (
    select schemaname, tablename, role_name, action_name
    from expanded_policies
    group by schemaname, tablename, role_name, action_name
    having count(*) > 1
  )
  select
    not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('handle_new_user', 'set_updated_at', 'is_admin')
    ) as legacy_public_functions_removed,
    not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and policyname in (
          'analytics_admin_select',
          'analytics_insert_privacy_safe',
          'events_admin_read_all',
          'events_public_read_approved',
          'favorites_select_own',
          'profiles_select_own_or_admin',
          'season_select_own',
          'feedback_admin_select'
        )
    ) as legacy_policies_removed,
    not exists (
      select 1 from duplicate_policy_groups
    ) as permissive_policy_overlap_removed,
    to_regclass('public.analytics_events_event_name_idx') is null
      as duplicate_analytics_index_removed,
    not has_function_privilege(
      'anon',
      'private.handle_new_user()',
      'execute'
    ) as signup_trigger_not_public,
    not has_function_privilege(
      'anon',
      'public.verify_event_source_cron_secret(text)',
      'execute'
    ) as cron_verification_not_anon,
    not has_function_privilege(
      'authenticated',
      'public.verify_event_source_cron_secret(text)',
      'execute'
    ) as cron_verification_not_authenticated,
    has_function_privilege(
      'service_role',
      'public.verify_event_source_cron_secret(text)',
      'execute'
    ) as cron_verification_service_only
`);

assert.deepEqual(
  hardeningState,
  {
    legacy_public_functions_removed: true,
    legacy_policies_removed: true,
    permissive_policy_overlap_removed: true,
    duplicate_analytics_index_removed: true,
    signup_trigger_not_public: true,
    cron_verification_not_anon: true,
    cron_verification_not_authenticated: true,
    cron_verification_service_only: true
  },
  "Local database hardening state is incomplete."
);
console.log("Local Supabase hardening assertions passed.");

runSupabase([
  "db",
  "query",
  "--local",
  `do $lifecycle$
  declare
    fixture_event_id bigint;
    fixture_edition_id uuid;
    lifecycle_result jsonb;
  begin
    insert into public.events (
      event_name, sport, date, city, country, event_url, status,
      publication_status, event_status, verification_status
    ) values (
      '[LIFECYCLE TEST] archive fixture', 'Running', '01.01.2020',
      'Berlin', 'Germany', 'https://example.com/lifecycle-archive', 'approved',
      'published', 'active', 'verified'
    ) returning id into fixture_event_id;

    select id into fixture_edition_id
    from public.event_editions
    where event_id = fixture_event_id
    order by edition_year
    limit 1;

    update public.event_editions
    set start_date = date '2020-01-01', end_date = date '2020-01-01',
        edition_status = 'scheduled', publication_status = 'published',
        discovery_status = 'active'
    where id = fixture_edition_id;

    lifecycle_result := private.run_edition_lifecycle(date '2026-01-01');
    if (lifecycle_result->>'archived_editions')::integer < 1 then
      raise exception 'Lifecycle did not archive the past fixture';
    end if;
    if exists (select 1 from public.public_event_discovery where event_id = fixture_event_id) then
      raise exception 'Archived fixture remained in discovery';
    end if;
    if not exists (
      select 1 from public.public_event_archive
      where event_id = fixture_event_id and discovery_status = 'detail_only'
    ) then
      raise exception 'Archived fixture disappeared from public history';
    end if;

    delete from public.events where id = fixture_event_id;
    delete from public.data_workflow_runs where id = (lifecycle_result->>'run_id')::bigint;
  end
  $lifecycle$;`
]);
console.log("Edition lifecycle archival and public history assertions passed.");

const automationFixture = `[AUTO CONFIRM TEST] ${runId}`;
runSupabase([
  "db",
  "query",
  "--local",
  `do $automation$
  declare
    fixture_event_id bigint;
    fixture_edition_id uuid;
    fixture_source_id uuid;
    job_one uuid;
    job_two uuid;
    job_three uuid;
    job_four uuid;
    crawl_one bigint;
    crawl_two bigint;
    crawl_three bigint;
    crawl_four bigint;
  begin
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    update public.edition_lifecycle_settings
    set min_confirmation_interval_hours = 0,
        auto_publish_threshold = 0.995,
        auto_result_publish_threshold = 0.980
    where singleton;

    insert into public.events (
      event_name, sport, date, city, country, event_url, status,
      publication_status, event_status, verification_status
    ) values (
      '${automationFixture}', 'Running', '01.01.2026', 'Berlin', 'Germany',
      'https://example.com/auto-confirm-${runId}', 'approved',
      'published', 'active', 'verified'
    ) returning id into fixture_event_id;

    select id into fixture_edition_id from public.event_editions
    where event_id = fixture_event_id order by edition_year limit 1;
    update public.event_editions
    set edition_year = 2026, start_date = date '2026-01-01', end_date = date '2026-01-01',
        publication_status = 'published', discovery_status = 'detail_only', edition_status = 'completed'
    where id = fixture_edition_id;

    insert into public.event_sources (
      event_id, source_type, source_url, parser_type, is_active, crawl_status,
      consecutive_failures
    ) values (
      fixture_event_id, 'official_event_website',
      'https://example.com/auto-confirm-${runId}', 'json_ld', true, 'success', 0
    ) returning id into fixture_source_id;

    insert into public.source_crawl_jobs (source_id, event_id, status, idempotency_key, trigger_source)
    values (fixture_source_id, fixture_event_id, 'completed', 'auto-1-${runId}', 'test') returning id into job_one;
    insert into public.source_crawl_results (
      job_id, source_id, event_id, attempt_number, http_status, final_url,
      change_status, worker_version, processing_status
    ) values (job_one, fixture_source_id, fixture_event_id, 1, 200,
      'https://example.com/auto-confirm-${runId}', 'changed', 'test', 'completed') returning id into crawl_one;

    insert into public.source_crawl_jobs (source_id, event_id, status, idempotency_key, trigger_source)
    values (fixture_source_id, fixture_event_id, 'completed', 'auto-2-${runId}', 'test') returning id into job_two;
    insert into public.source_crawl_results (
      job_id, source_id, event_id, attempt_number, http_status, final_url,
      change_status, worker_version, processing_status
    ) values (job_two, fixture_source_id, fixture_event_id, 1, 200,
      'https://example.com/auto-confirm-${runId}', 'unchanged', 'test', 'completed') returning id into crawl_two;

    perform public.register_edition_successor_candidate(
      fixture_source_id, crawl_one,
      jsonb_build_object('year', 2027, 'start_date', '2027-09-12', 'end_date', '2027-09-12',
        'name', '${automationFixture} 2027', 'confidence', 0.97,
        'evidence', jsonb_build_object('evidence_type', 'json_ld')),
      'safe-automation-test'
    );
    perform public.register_edition_successor_candidate(
      fixture_source_id, crawl_two,
      jsonb_build_object('year', 2027, 'start_date', '2027-09-12', 'end_date', '2027-09-12',
        'name', '${automationFixture} 2027', 'confidence', 0.97,
        'evidence', jsonb_build_object('evidence_type', 'json_ld')),
      'safe-automation-test'
    );

    insert into public.source_crawl_jobs (source_id, event_id, status, idempotency_key, trigger_source)
    values (fixture_source_id, fixture_event_id, 'completed', 'auto-3-${runId}', 'test') returning id into job_three;
    insert into public.source_crawl_results (
      job_id, source_id, event_id, attempt_number, http_status, final_url,
      change_status, worker_version, processing_status
    ) values (job_three, fixture_source_id, fixture_event_id, 1, 200,
      'https://example.com/auto-confirm-${runId}', 'changed', 'test', 'completed') returning id into crawl_three;

    insert into public.source_crawl_jobs (source_id, event_id, status, idempotency_key, trigger_source)
    values (fixture_source_id, fixture_event_id, 'completed', 'auto-4-${runId}', 'test') returning id into job_four;
    insert into public.source_crawl_results (
      job_id, source_id, event_id, attempt_number, http_status, final_url,
      change_status, worker_version, processing_status
    ) values (job_four, fixture_source_id, fixture_event_id, 1, 200,
      'https://example.com/auto-confirm-${runId}', 'unchanged', 'test', 'completed') returning id into crawl_four;

    perform public.register_edition_result_candidate(
      fixture_source_id, crawl_three,
      'https://results.example.com/${runId}/2026', 'Offizielle Ergebnisse 2026', 0.88
    );
    perform public.register_edition_result_candidate(
      fixture_source_id, crawl_four,
      'https://results.example.com/${runId}/2026', 'Offizielle Ergebnisse 2026', 0.88
    );
  end
  $automation$;`
]);

const [automationState] = queryLocal(`
  select
    exists (
      select 1 from public.event_editions edition
      join public.events event on event.id = edition.event_id
      where event.event_name = '${automationFixture}' and edition.edition_year = 2027
        and edition.publication_status = 'published' and edition.discovery_status = 'active'
    ) as successor_auto_published,
    exists (
      select 1 from public.edition_succession_candidates candidate
      join public.events event on event.id = candidate.event_id
      where event.event_name = '${automationFixture}' and candidate.confirmation_count = 2
        and candidate.confirmed_confidence >= 0.995 and candidate.auto_published_at is null
    ) as successor_confirmed,
    not exists (
      select 1 from public.edition_results result
      join public.events event on event.id = result.event_id
      where event.event_name = '${automationFixture}' and result.confirmation_count = 2
        and result.confirmed_confidence >= 0.980 and result.publication_status = 'published'
        and result.auto_published_at is not null
    ) as result_not_auto_published,
    exists (
      select 1 from public.edition_lifecycle_settings settings
      where settings.singleton
        and settings.auto_publish_enabled is false
        and settings.auto_result_publish_enabled is false
    ) as automation_disabled
`);
assert.deepEqual(automationState, {
  successor_auto_published: false,
  successor_confirmed: true,
  result_not_auto_published: true,
  automation_disabled: true
});
runSupabase([
  "db", "query", "--local",
  `do $cleanup$ begin
     delete from public.events where event_name = '${automationFixture}';
     update public.edition_lifecycle_settings set min_confirmation_interval_hours = 24 where singleton;
   end $cleanup$;`
]);
console.log("Successor and result confirmations remain review-gated with publication automation disabled.");

const password = `Local-RLS-${runId}-Aa1!`;
const users = [];

async function createUser(label) {
  const user = await adminRequest(
    local.API_URL,
    local.SERVICE_ROLE_KEY,
    "users",
    {
      method: "POST",
      body: JSON.stringify({
        email: `sporteventmap-${label}-${runId}@example.test`,
        password,
        email_confirm: true
      })
    }
  );

  users.push(user);
  return user;
}

try {
  const userA = await createUser("user-a");
  const userB = await createUser("user-b");
  const admin = await createUser("admin");

  runSupabase([
    "db",
    "query",
    "--local",
    `update public.profiles set role = 'admin' where id = '${admin.id}';`
  ]);

  const test = spawnSync(
    process.execPath,
    ["tests/rls-security.test.mjs"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "inherit",
      env: {
        ...process.env,
        SUPABASE_URL: local.API_URL,
        SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
        TEST_USER_A_EMAIL: userA.email,
        TEST_USER_A_PASSWORD: password,
        TEST_USER_B_EMAIL: userB.email,
        TEST_USER_B_PASSWORD: password,
        TEST_ADMIN_EMAIL: admin.email,
        TEST_ADMIN_PASSWORD: password
      }
    }
  );

  assert.equal(test.status, 0, "Local RLS integration suite failed.");
} finally {
  for (const user of users.reverse()) {
    try {
      await adminRequest(
        local.API_URL,
        local.SERVICE_ROLE_KEY,
        `users/${encodeURIComponent(user.id)}`,
        { method: "DELETE" }
      );
    } catch (error) {
      console.error(`Could not remove local test user ${user.id}:`, error);
    }
  }
}

console.log("Local Supabase Auth and RLS verification passed.");
