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
        result.error?.stack || result.stderr || result.stdout || "unknown error"
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
    ) as signup_trigger_not_public
`);

assert.deepEqual(
  hardeningState,
  {
    legacy_public_functions_removed: true,
    legacy_policies_removed: true,
    permissive_policy_overlap_removed: true,
    duplicate_analytics_index_removed: true,
    signup_trigger_not_public: true
  },
  "Local database hardening state is incomplete."
);
console.log("Local Supabase hardening assertions passed.");

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
        SUPABASE_ANON_KEY: local.ANON_KEY,
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
