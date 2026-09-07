import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This runner never accepts a database URL, project ref, or arbitrary container.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workdir = path.resolve(process.argv[2] || "");
const stageFour = process.argv[3];
const sqlOnly = process.argv[4] === "--sql-only";
assert.ok(process.argv[4] === undefined || sqlOnly, "Unexpected argument; optional fourth argument is --sql-only.");
assert.ok(["absent", "present"].includes(stageFour),
  "Usage: node tools/run-source-monitor-schema-alignment.mjs <isolated-local-workdir> <absent|present> [--sql-only]");
const localRestoreRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "SportEventMap", "RestoreDrill");
const relativeRestore = path.relative(localRestoreRoot, workdir);
const relativeRepository = path.relative(root, workdir);
const isRestore = /^sport-event-map-recovery-drill-[a-f0-9]{8}-[a-f0-9]{32}$/.test(relativeRestore);
const isStaging = /^\.tmp-[a-zA-Z0-9-]+$/.test(relativeRepository);
assert.ok(isRestore || isStaging, "Only an isolated local restore or .tmp-* staging directory is allowed.");
const config = fs.readFileSync(path.join(workdir, "supabase", "config.toml"), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(isRestore ? /^sport-event-map-recovery-drill-[a-f0-9]{8}$/.test(projectId || "")
  : projectId === "sport-event-map-edition-staging", "Unexpected local project id.");
if (isRestore) assert.ok(relativeRestore.startsWith(`${projectId}-`), "Restore directory and project id disagree.");
const cli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
function runCli(args) {
  const result = spawnSync(process.execPath, [cli, "--workdir", workdir, ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, DO_NOT_TRACK: "1", SUPABASE_TELEMETRY_DISABLED: "1" }
  });
  if (result.status !== 0) {
    // SQL fixture errors contain only synthetic data. Remove credentials defensively.
    const detail = `${result.stderr || ""}\n${result.stdout || ""}`
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
    throw new Error(`Local Supabase operation failed (${result.status}): ${detail}`);
  }
  return result.stdout;
}
const local = Object.fromEntries(runCli(["status", "-o", "env"]).split(/\r?\n/)
  .map(line => line.match(/^([A-Z0-9_]+)=(?:"([\s\S]*)"|(.*))$/)).filter(Boolean)
  .map(match => [match[1], match[2] ?? match[3] ?? ""]));
for (const key of ["API_URL", "DB_URL"]) {
  assert.ok(local[key], `Local ${key} missing.`);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(local[key]).hostname),
    `Refusing non-loopback ${key}.`);
}
if (!sqlOnly) assert.ok(local.ANON_KEY && local.SERVICE_ROLE_KEY, "Local API credentials missing; DB-only restores require explicit --sql-only.");

const expected = {
  schema_version: 1, extraction_review: true,
  stage_four_simulation: stageFour === "present", stage_four_automation: stageFour === "present",
  stage_four_shadow: stageFour === "present"
};
async function request(apiPath, role, options = {}) {
  const key = role === "service_role" ? local.SERVICE_ROLE_KEY : local.ANON_KEY;
  return fetch(`${local.API_URL}/rest/v1/${apiPath}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000)
  });
}
if (!sqlOnly) {
  let response = await request("rpc/get_source_monitor_runtime_capabilities", "service_role", { method: "POST", body: "{}" });
  const capabilitiesResponse = await response.json();
  assert.equal(response.status, 200, `Service role must execute the actual REST capabilities RPC: ${JSON.stringify(capabilitiesResponse)}`);
  if (!capabilitiesResponse.extraction_review) {
    console.error(runCli(["db", "query", "--local", "--output", "json",
      "select relation_name, has_table_privilege('service_role',to_regclass(relation_name),'SELECT') as service_select from unnest(array['public.events','public.event_editions','public.event_change_proposals','public.event_field_controls']) relations(relation_name);"]));
  }
  assert.deepEqual(capabilitiesResponse, expected, "REST capabilities do not match the expected local schema.");
  response = await request("rpc/get_source_monitor_runtime_capabilities", "anon", { method: "POST", body: "{}" });
  assert.ok([401, 403].includes(response.status), "Anonymous REST capabilities access must be denied.");
  response = await request("event_field_controls?select=id&limit=0", "service_role");
  assert.equal(response.status, 200, "Service role must read the controls relation through REST.");
  assert.deepEqual(await response.json(), [], "Zero-row REST probe must not expose restored controls.");
  response = await request("event_field_controls?select=id&limit=0", "anon");
  assert.ok([401, 403].includes(response.status), "Anonymous REST controls access must be denied.");
}

const source = fs.readFileSync(path.join(root, "tests", "source-monitor-schema-alignment.sql"), "utf8");
const sql = `set sporteventmap.test_expected_stage_four = '${stageFour}';\n${source}`;
// CLI db query uses prepared statements and cannot execute a transaction script.
// Run psql only inside the exact local database container, passing SQL over stdin.
const containerCli = ["C:\\Program Files\\RedHat\\Podman\\podman.exe", "docker", "podman"]
  .find(candidate => spawnSync(candidate, ["--version"], { encoding: "utf8" }).status === 0);
assert.ok(containerCli, "A locally installed Docker-compatible CLI is required.");
const containerName = `supabase_db_${projectId}`;
const labelResult = spawnSync(containerCli, ["inspect", "--format", "{{json .Config.Labels}}", containerName], { encoding: "utf8" });
assert.equal(labelResult.status, 0, "Isolated local database container is missing.");
assert.equal(JSON.parse(labelResult.stdout)?.["com.supabase.cli.project"], projectId,
  "Database container belongs to a different project.");
const testResult = spawnSync(containerCli, ["exec", "-i", containerName, "psql", "--quiet", "--no-psqlrc",
  "--set", "ON_ERROR_STOP=1", "--username", "postgres", "--dbname", "postgres"],
  { encoding: "utf8", input: sql, maxBuffer: 8 * 1024 * 1024 });
if (testResult.status !== 0) {
  throw new Error(`Local rollback regression failed (${testResult.status}): ${testResult.stderr || testResult.error || "unknown error"}`);
}
const sqlChecks = Number(testResult.stderr.match(/Source monitor schema-alignment checks passed: (\d+)/)?.[1]);
assert.ok(sqlChecks >= 45, "SQL assertion completion marker is missing.");
// A fresh session verifies no synthetic fixture survived the rollback.
const verification = JSON.parse(runCli(["db", "query", "--local", "--output", "json",
  "select not exists(select 1 from public.events where event_name like 'schema-alignment-%') and not exists(select 1 from auth.users where email like 'schema-alignment-%@example.invalid') as fixtures_rolled_back;"]));
assert.equal(verification.rows?.[0]?.fixtures_rolled_back, true, "Synthetic regression fixtures were not rolled back.");
process.stdout.write(JSON.stringify({ passed: true, projectId, stageFour, restChecks: sqlOnly ? 0 : 4,
  sqlChecks, sqlRegression: "passed", fixturesRolledBack: true, capabilities: expected }) + "\n");
