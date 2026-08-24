import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(
  path.join(root, "tools", "edition-production-preflight.sql"),
  "utf8"
);

const statements = sql
  .replace(/--[^\n]*/g, "")
  .split(";")
  .map(statement => statement.trim())
  .filter(Boolean);

assert.equal(statements.length, 1, "Production preflight must contain one SQL statement.");
assert.match(statements[0], /^with\b/i);

const sectionRows = section => {
  const match = sql.match(new RegExp(`${section}\\(version, name\\) as \\(\\s*values([\\s\\S]*?)\\n\\),`));
  assert.ok(match, `Missing migration manifest section ${section}.`);
  return [...match[1].matchAll(/\('(\d+)',\s*'([^']+)'\)/g)]
    .map(([, version, name]) => ({ version, name }));
};

const applied = sectionRows("expected_predeployment");
const deploymentSequenceMatch = sql.match(
  /deployment_sequence\(ordinal, version, name\) as \(\s*values([\s\S]*?)\n\),/
);
assert.ok(deploymentSequenceMatch, "Missing ordered production deployment sequence.");
const pending = [...deploymentSequenceMatch[1].matchAll(/\((\d+),\s*'(\d+)',\s*'([^']+)'\)/g)]
  .map(([, ordinal, version, name]) => ({ ordinal: Number(ordinal), version, name }));
assert.deepEqual(pending.map(row => row.ordinal), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const migrationFiles = fs.readdirSync(path.join(root, "supabase", "migrations"))
  .map(file => file.match(/^(\d+)_([^/]+)\.sql$/))
  .filter(Boolean)
  .map(([, version, name]) => ({ version, name }))
  .sort((left, right) => left.version.localeCompare(right.version));
const manifested = [...applied, ...pending.map(({ version, name }) => ({ version, name }))]
  .sort((left, right) => left.version.localeCompare(right.version));

assert.equal(applied.length, 36, "Expected active predeployment baseline changed.");
assert.equal(pending.length, 10, "Expected pending rollout set changed.");
assert.deepEqual(manifested, migrationFiles,
  "Production preflight manifest must match every local migration exactly.");
assert.ok(applied.some(row => row.version === "20260817121601"));
assert.ok(pending.some(row => row.version === "20260817124600"));
assert.ok(
  pending.findIndex(row => row.version === "20260815") <
    pending.findIndex(row => row.version === "20260817124600"),
  "Candidate-First must remain after its Source Extraction dependency."
);
assert.ok(
  pending.findIndex(row => row.version === "20260817124600") <
    pending.findIndex(row => row.version === "20260817"),
  "Manifest must preserve the CLI-tested mixed-prefix application order."
);

for (const marker of [
  "exact_predeployment_history",
  "exact_security_baseline_history",
  "expected_security_baseline_history",
  "security_baseline_active_keep_remaining_migrations_blocked",
  "exact_full_history",
  "planned_application_order",
  "drift_or_partial_rollout",
  "data_integrity_gates_pass",
  "automation_gates_pass",
  "quiet_window_observed",
  "restricted_logical_backup_verified', false",
  "deployment_authorized', false",
  "backfill_authorized', false",
  "worker_deployment_authorized', false",
  "automatic_publication_authorized', false",
  "ready_for_schema_deployment', false",
  "stop_and_investigate_migration_drift"
]) assert.ok(sql.includes(marker), `Production preflight missing ${marker}.`);

const executableSql = sql
  .replace(/--[^\n]*/g, "")
  .replace(/'(?:''|[^'])*'/g, "''");
assert.doesNotMatch(
  executableSql,
  /\b(?:insert\s+into|update\s+public\.|delete\s+from|merge\s+into|truncate\s+|alter\s+table|create\s+(?:table|view|function)|drop\s+)\b/i,
  "Production preflight contains a mutating SQL operation."
);

console.log("Edition production preflight is read-only and blocks every rollout authority.");
