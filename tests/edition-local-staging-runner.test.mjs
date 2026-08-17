import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const runner = read("tools/run-edition-local-staging.mjs");
const rlsTest = read("tests/local-rls-security.test.mjs");
const packageJson = JSON.parse(read("package.json"));
const gitignore = read(".gitignore");

for (const marker of [
  'stageDirectoryName = ".tmp-supabase-edition-staging"',
  'stageProjectId = "sport-event-map-edition-staging"',
  'replaceSectionValue(config, "api", "port", "55321")',
  'replaceSectionValue(config, "db", "port", "55322")',
  'fs.cpSync(\n    path.join(root, "supabase", "migrations")',
  'fs.existsSync(path.join(stageSupabase, ".temp", "project-ref"))',
  'args.includes("--local")',
  'args.includes("--linked")',
  'args.includes("--db-url")',
  'report.deployment_authorized, false',
  'report.backfill_authorized, false',
  'SPORT_EVENT_MAP_LOCAL_SUPABASE_WORKDIR: stageRoot',
  'expectedLoopbackPorts = [55321, 55322]',
  'Get-NetTCPConnection -State Listen',
  '["127.0.0.1", "::1"].includes(listener.LocalAddress)',
  'request.setTimeout(10000',
  'http://127.0.0.1:55321/auth/v1/settings',
  'Local staging Auth readiness gate passed.',
  'volume.Labels?.["com.supabase.cli.project"]',
  'runSupabase(["stop"]'
]) assert.ok(runner.includes(marker), `Local staging runner missing safety marker: ${marker}`);

for (const variable of [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
]) assert.ok(runner.includes(variable), `Local staging runner does not remove ${variable}.`);

assert.match(rlsTest, /SPORT_EVENT_MAP_LOCAL_SUPABASE_WORKDIR/);
assert.match(rlsTest, /localSupabaseWorkdir === root \|\| localSupabaseWorkdir\.startsWith\(temporaryWorkdirPrefix\)/);
assert.match(rlsTest, /attempt <= 3/);
assert.match(rlsTest, /\[502, 503\]\.includes\(response\.status\)/);
assert.equal(
  packageJson.scripts["staging:edition:local"],
  "node tools/run-edition-local-staging.mjs"
);
assert.match(gitignore, /^\.tmp-supabase-edition-staging\/$/m);

console.log("Cost-free disposable edition staging runner safety boundaries verified.");
