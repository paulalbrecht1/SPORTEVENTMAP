import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageDirectoryName = ".tmp-supabase-edition-staging";
const stageRoot = path.join(root, stageDirectoryName);
const stageSupabase = path.join(stageRoot, "supabase");
const stageProjectId = "sport-event-map-edition-staging";
const expectedLoopbackPorts = [55321, 55322];
const supabaseCli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");

const excludedServices = [
  "edge-runtime",
  "imgproxy",
  "logflare",
  "mailpit",
  "postgres-meta",
  "realtime",
  "storage-api",
  "studio",
  "supavisor",
  "vector"
].join(",");

const cloudEnvironmentVariables = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY"
];

function assertSafeStageRoot() {
  assert.equal(path.dirname(stageRoot), root, "Staging directory escaped the repository root.");
  assert.equal(path.basename(stageRoot), stageDirectoryName, "Unexpected staging directory target.");
  assert.notEqual(stageRoot, root, "Staging cleanup must never target the repository root.");
}

function replaceTopLevelValue(config, key, value) {
  const expression = new RegExp(`^(${key}\\s*=\\s*).+$`, "m");
  assert.match(config, expression, `Missing ${key} in local Supabase config.`);
  return config.replace(expression, `$1${value}`);
}

function replaceSectionValue(config, section, key, value) {
  const marker = `[${section}]`;
  const start = config.indexOf(marker);
  assert.notEqual(start, -1, `Missing [${section}] in local Supabase config.`);
  const next = config.indexOf("\n[", start + marker.length);
  const end = next === -1 ? config.length : next;
  const sectionBody = config.slice(start, end);
  const expression = new RegExp(`^(${key}\\s*=\\s*).+$`, "m");
  assert.match(sectionBody, expression, `Missing ${key} in [${section}].`);
  return `${config.slice(0, start)}${sectionBody.replace(expression, `$1${value}`)}${config.slice(end)}`;
}

function prepareStageWorkdir() {
  assertSafeStageRoot();
  fs.rmSync(stageRoot, { recursive: true, force: true });
  fs.mkdirSync(stageSupabase, { recursive: true });
  fs.cpSync(
    path.join(root, "supabase", "migrations"),
    path.join(stageSupabase, "migrations"),
    { recursive: true }
  );

  let config = fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
  config = replaceTopLevelValue(config, "project_id", `"${stageProjectId}"`);
  config = replaceSectionValue(config, "api", "port", "55321");
  config = replaceSectionValue(config, "db", "port", "55322");
  config = replaceSectionValue(config, "db", "shadow_port", "55320");
  config = replaceSectionValue(config, "db.pooler", "port", "55329");
  config = replaceSectionValue(config, "studio", "port", "55323");
  config = replaceSectionValue(config, "local_smtp", "port", "55324");
  config = replaceSectionValue(config, "edge_runtime", "inspector_port", "18083");
  config = replaceSectionValue(config, "analytics", "port", "55327");
  fs.writeFileSync(path.join(stageSupabase, "config.toml"), config, "utf8");

  assert.equal(
    fs.existsSync(path.join(stageSupabase, ".temp", "project-ref")),
    false,
    "A linked project reference must never enter the local staging workdir."
  );
}

function sanitizedEnvironment(extra = {}) {
  const environment = {
    ...process.env,
    ...extra,
    DO_NOT_TRACK: "1",
    SUPABASE_TELEMETRY_DISABLED: "1"
  };
  for (const variable of cloudEnvironmentVariables) delete environment[variable];
  return environment;
}

function assertLocalOnlyCommand(args) {
  const [command, subcommand] = args;
  const allowed = command === "start" || command === "stop" || (
    command === "db" && ["lint", "query", "reset"].includes(subcommand)
  );
  assert.equal(allowed, true, `Cloud-capable Supabase command rejected: ${args.join(" ")}`);
  if (command === "db") {
    assert.ok(args.includes("--local"), `Database command must be explicitly local: ${args.join(" ")}`);
    assert.equal(args.includes("--linked"), false, "Linked database access is forbidden in local staging.");
    assert.equal(args.includes("--db-url"), false, "External database URLs are forbidden in local staging.");
  }
}

function runSupabase(args, { capture = false, required = true } = {}) {
  assertLocalOnlyCommand(args);
  const result = spawnSync(
    process.execPath,
    [supabaseCli, "--workdir", stageRoot, ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: sanitizedEnvironment(),
      stdio: capture ? "pipe" : "inherit"
    }
  );
  if (required && result.status !== 0) {
    throw new Error(
      `Local Supabase command failed (${args.join(" ")}):\n${
        result.error?.stack || [result.stderr, result.stdout].filter(Boolean).join("\n") || "unknown error"
      }`
    );
  }
  return result;
}

function dockerEngineRequest(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request({
      socketPath: "\\\\.\\pipe\\docker_engine",
      path: requestPath,
      method,
      headers: payload ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      } : undefined
    }, response => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { responseBody += chunk; });
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(responseBody ? JSON.parse(responseBody) : null);
          return;
        }
        reject(new Error(
          `Docker Engine ${method} ${requestPath} failed (${response.statusCode}): ${responseBody}`
        ));
      });
    });
    request.setTimeout(10000, () => {
      request.destroy(new Error(`Docker Engine request timed out: ${method} ${requestPath}`));
    });
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function dockerFilters(filters) {
  return encodeURIComponent(JSON.stringify(filters));
}

async function removeExactStageVolumes() {
  const label = `com.supabase.cli.project=${stageProjectId}`;
  const result = await dockerEngineRequest(
    "GET",
    `/volumes?filters=${dockerFilters({ label: [label] })}`
  );
  for (const volume of result?.Volumes || []) {
    assert.equal(
      volume.Labels?.["com.supabase.cli.project"],
      stageProjectId,
      `Refusing to remove unexpectedly labelled Docker volume ${volume.Name}.`
    );
    await dockerEngineRequest("DELETE", `/volumes/${encodeURIComponent(volume.Name)}`);
    console.log(`Removed disposable local staging volume ${volume.Name}.`);
  }
}

function verifyWindowsLoopbackListeners() {
  assert.equal(process.platform, "win32", "This local staging runner currently requires Windows.");
  const portList = expectedLoopbackPorts.join(",");
  const command = [
    `$ports = @(${portList})`,
    "$listeners = Get-NetTCPConnection -State Listen -ErrorAction Stop |",
    "  Where-Object { $_.LocalPort -in $ports } |",
    "  Select-Object LocalAddress, LocalPort",
    "$listeners | ConvertTo-Json -Compress"
  ].join("\n");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", env: sanitizedEnvironment() }
  );
  assert.equal(result.status, 0, `Could not inspect local staging listeners: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout.trim() || "[]");
  const listeners = Array.isArray(parsed) ? parsed : [parsed];
  for (const port of expectedLoopbackPorts) {
    const portListeners = listeners.filter(listener => Number(listener.LocalPort) === port);
    assert.ok(portListeners.length > 0, `No listener found for expected local staging port ${port}.`);
    assert.ok(
      portListeners.every(listener => ["127.0.0.1", "::1"].includes(listener.LocalAddress)),
      `Local staging port ${port} is exposed beyond loopback: ${JSON.stringify(portListeners)}`
    );
  }
  console.log("Local staging API and database listeners are restricted to loopback.");
}

async function cleanupDockerStageResources() {
  const stop = runSupabase(["stop"], { required: false });
  await delay(500);
  await removeExactStageVolumes();
  if (stop.status !== 0) {
    console.warn("Supabase stop reported no running local staging containers; exact resources were checked directly.");
  }
}

async function waitForLocalAuth() {
  const readinessUrl = "http://127.0.0.1:55321/auth/v1/settings";
  let lastStatus = "connection_failed";
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(readinessUrl);
      lastStatus = String(response.status);
      if (response.ok) {
        console.log("Local staging Auth readiness gate passed.");
        return;
      }
    } catch {
      // The local gateway may briefly reset connections after db reset.
    }
    await delay(1000);
  }
  throw new Error(`Local staging Auth did not become ready within 30 seconds (last status ${lastStatus}).`);
}

function queryJson(sqlOrFile, isFile = false) {
  const args = ["db", "query", "--local", "--output", "json"];
  if (isFile) args.push("--file", sqlOrFile);
  else args.push(sqlOrFile);
  const result = runSupabase(args, { capture: true });
  return JSON.parse(result.stdout).rows;
}

function expectedMigrationVersions() {
  return fs.readdirSync(path.join(stageSupabase, "migrations"))
    .map(file => file.match(/^(\d+)_.*\.sql$/)?.[1])
    .filter(Boolean)
    .sort();
}

function verifyMigrationHistory() {
  const expected = expectedMigrationVersions();
  const actual = queryJson(
    "select version from supabase_migrations.schema_migrations order by version"
  ).map(row => row.version);
  assert.deepEqual(actual, expected, "Disposable staging did not apply the exact migration set.");
  console.log(`Exact local staging migration history verified (${actual.length} migrations).`);
}

function verifyPostflight() {
  const [row] = queryJson(path.join(root, "tools", "edition-staging-postflight.sql"), true);
  const report = row.edition_staging_postflight_report;
  assert.equal(report.foundation_gates_pass, true);
  assert.equal(report.ready_for_manual_candidate_smoke, true);
  assert.equal(report.deployment_authorized, false);
  assert.equal(report.backfill_authorized, false);
  assert.equal(report.target_confirmation_required, true);
  console.log("Edition staging postflight passed; deployment and backfill remain unauthorized.");
}

function verifyProductionPreflight() {
  const [row] = queryJson(path.join(root, "tools", "edition-production-preflight.sql"), true);
  const report = row.edition_production_rollout_preflight_report;
  assert.equal(report.migration_history.state, "expected_full_history");
  assert.equal(report.migration_history.exact_full_history, true);
  assert.equal(report.data_integrity_gates_pass, true);
  assert.equal(report.automation_gates_pass, true);
  assert.equal(report.deployment_authorized, false);
  assert.equal(report.backfill_authorized, false);
  assert.equal(report.worker_deployment_authorized, false);
  assert.equal(report.automatic_publication_authorized, false);
  assert.equal(report.ready_for_schema_deployment, false);
  console.log("Production manifest recognizes the exact full local history and grants no authority.");
}

function runRlsAndCandidateSmoke() {
  const result = spawnSync(process.execPath, ["tests/local-rls-security.test.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: sanitizedEnvironment({
      SPORT_EVENT_MAP_LOCAL_SUPABASE_WORKDIR: stageRoot
    }),
    stdio: "inherit"
  });
  assert.equal(result.status, 0, "Candidate-first and RLS smoke tests failed in disposable staging.");
}

let stageWasPrepared = false;
let primaryError;

try {
  prepareStageWorkdir();
  stageWasPrepared = true;
  await cleanupDockerStageResources();
  runSupabase(["start", "-x", excludedServices]);
  verifyWindowsLoopbackListeners();
  runSupabase(["db", "reset", "--local", "--no-seed"]);
  verifyMigrationHistory();
  runSupabase([
    "db", "lint", "--local", "--schema", "public,private",
    "--level", "error", "--fail-on", "error"
  ]);
  verifyPostflight();
  verifyProductionPreflight();
  await waitForLocalAuth();
  runRlsAndCandidateSmoke();
  console.log("Disposable, cost-free edition staging completed successfully.");
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  if (stageWasPrepared) {
    let cleanupError;
    try {
      await cleanupDockerStageResources();
    } catch (error) {
      cleanupError = error;
      if (primaryError) console.error(`Additional local staging cleanup failure: ${error.message}`);
    }
    assertSafeStageRoot();
    fs.rmSync(stageRoot, { recursive: true, force: true });
    if (cleanupError && !primaryError) {
      throw new Error(`Local staging passed, but cleanup failed: ${cleanupError.message}`);
    }
  }
}
