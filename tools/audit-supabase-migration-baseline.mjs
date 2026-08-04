import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(
  root,
  "reports",
  "supabase-schema-baseline-2026-07-24.json"
);
const migrationsDir = path.join(root, "supabase", "migrations");

function cleanIdentifier(value = "") {
  return value
    .trim()
    .replaceAll('"', "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function splitSqlList(body) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];

    if (quote) {
      if (char === quote && next === quote) {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (char === "," && depth === 0) {
      parts.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(body.slice(start).trim());
  return parts.filter(Boolean);
}

function addCheck(checks, type, key, present, detail = "") {
  checks.push({ type, key, present, detail });
}

function extractMigrationExpectations(sql, live) {
  const checks = [];
  const createdTables = new Set();
  const referencedTables = new Set();

  const tablePattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."-]+)\s*\(([\s\S]*?)\)\s*;/gi;
  for (const match of sql.matchAll(tablePattern)) {
    const table = cleanIdentifier(match[1]);
    createdTables.add(table);
    addCheck(checks, "table", table, live.tables.has(table));

    for (const definition of splitSqlList(match[2])) {
      if (/^(constraint|primary\s+key|unique\s*\(|foreign\s+key|check\s*\()/i.test(definition)) {
        continue;
      }
      const columnMatch = definition.match(/^"?([a-zA-Z_][\w$]*)"?\s+/);
      if (!columnMatch) continue;
      const column = `${table}.${cleanIdentifier(columnMatch[1])}`;
      addCheck(checks, "column", column, live.columns.has(column));
    }
  }

  const alterPattern = /alter\s+table\s+(?:if\s+exists\s+)?([\w."-]+)([\s\S]*?);/gi;
  for (const match of sql.matchAll(alterPattern)) {
    const table = cleanIdentifier(match[1]);
    referencedTables.add(table);

    for (const columnMatch of match[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z_][\w$]*)"?/gi)) {
      const column = `${table}.${cleanIdentifier(columnMatch[1])}`;
      addCheck(checks, "column", column, live.columns.has(column));
    }

    for (const constraintMatch of match[2].matchAll(/add\s+constraint\s+"?([^"\s]+)"?/gi)) {
      const constraint = `${table}.${cleanIdentifier(constraintMatch[1])}`;
      addCheck(checks, "constraint", constraint, live.constraints.has(constraint));
    }
  }

  for (const match of sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?"?([\w$-]+)"?/gi)) {
    const name = cleanIdentifier(match[1]);
    addCheck(checks, "index", name, live.indexes.has(name));
  }

  for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."-]+)\s*\(/gi)) {
    const name = cleanIdentifier(match[1]);
    addCheck(checks, "function", name, live.functions.has(name));
  }

  const policyPattern = /create\s+policy\s+"([^"]+)"([\s\S]*?)\s+on\s+([\w."-]+)/gi;
  for (const match of sql.matchAll(policyPattern)) {
    if (match[1].includes("%")) continue;
    const table = cleanIdentifier(match[3]);
    const key = `${table}.${match[1]}`;
    addCheck(checks, "policy", key, live.policies.has(key));
  }

  const triggerPattern = /create\s+trigger\s+"?([\w$-]+)"?([\s\S]*?)\s+on\s+([\w."-]+)/gi;
  for (const match of sql.matchAll(triggerPattern)) {
    const table = cleanIdentifier(match[3]);
    const key = `${table}.${cleanIdentifier(match[1])}`;
    const captured = live.triggers.has(key);
    addCheck(
      checks,
      "trigger",
      key,
      captured,
      table.startsWith("auth.") && !captured ? "outside captured application schemas" : ""
    );
  }

  for (const match of sql.matchAll(/alter\s+table\s+([\w."-]+)\s+enable\s+row\s+level\s+security/gi)) {
    const table = cleanIdentifier(match[1]);
    addCheck(checks, "rls", table, live.rlsTables.has(table));
  }

  for (const match of sql.matchAll(/create\s+extension\s+(?:if\s+not\s+exists\s+)?"?([\w$-]+)"?/gi)) {
    const extension = cleanIdentifier(match[1]);
    addCheck(checks, "extension", extension, live.extensions.has(extension));
  }

  return { checks, createdTables, referencedTables };
}

if (!fs.existsSync(snapshotPath)) {
  throw new Error(`Missing Supabase schema snapshot: ${snapshotPath}`);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const live = {
  tables: new Set(snapshot.tables.map(row => `${row.schema}.${row.name}`.toLowerCase())),
  columns: new Set(snapshot.columns.map(row => `${row.schema}.${row.table}.${row.name}`.toLowerCase())),
  constraints: new Set(snapshot.constraints.map(row => `${row.schema}.${row.table}.${row.name}`.toLowerCase())),
  indexes: new Set(snapshot.indexes.map(row => row.name.toLowerCase())),
  functions: new Set(snapshot.functions.map(row => `${row.schema}.${row.name}`.toLowerCase())),
  triggers: new Set(
    [...snapshot.triggers, ...(snapshot.external_triggers || [])]
      .map(row => `${row.schema}.${row.table}.${row.name}`.toLowerCase())
  ),
  policies: new Set(snapshot.policies.map(row => `${row.schema}.${row.table}.${row.name}`)),
  rlsTables: new Set(snapshot.tables.filter(row => row.rls_enabled).map(row => `${row.schema}.${row.name}`.toLowerCase())),
  extensions: new Set(snapshot.extensions.map(row => row.name.toLowerCase()))
};

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter(name => name.endsWith(".sql"))
  .sort();
const migrationCorpus = migrationFiles
  .map(name => fs.readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");

const allCreatedTables = new Set();
const allReferencedTables = new Set();
const expectedPolicyKeys = new Set();
const migrations = [];

for (const name of migrationFiles) {
  const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
  const extracted = extractMigrationExpectations(sql, live);
  extracted.createdTables.forEach(value => allCreatedTables.add(value));
  extracted.referencedTables.forEach(value => allReferencedTables.add(value));
  extracted.checks
    .filter(check => check.type === "policy")
    .forEach(check => expectedPolicyKeys.add(check.key));

  const missing = extracted.checks.filter(check => !check.present && !check.detail);
  const unverified = extracted.checks.filter(check => !check.present && check.detail);
  migrations.push({
    name,
    version: name.split("_")[0],
    expected_objects: extracted.checks.length,
    present_objects: extracted.checks.filter(check => check.present).length,
    missing,
    unverified,
    status: missing.length === 0 && unverified.length === 0
      ? "present"
      : missing.length === 0
        ? "present_with_external_verification_needed"
        : "incomplete"
  });
}

const externalPrerequisites = [...allReferencedTables]
  .filter(table => !allCreatedTables.has(table))
  .sort();

const liveOnlyPolicies = snapshot.policies
  .map(row => ({
    key: `${row.schema}.${row.table}.${row.name}`,
    table: `${row.schema}.${row.table}`,
    name: row.name,
    command: row.command,
    roles: row.roles,
    using: row.using,
    check: row.check
  }))
  .filter(row => !expectedPolicyKeys.has(row.key))
  .filter(row => {
    const generatedKnowledgePolicy =
      migrationCorpus.includes("Public can read published %1$s") &&
      row.table.startsWith("public.event_") &&
      (
        row.name.startsWith("Public can read published event ") ||
        row.name.startsWith("Admins can manage event ")
      );
    return !generatedKnowledgePolicy;
  });

const policyGroups = new Map();
for (const policy of snapshot.policies) {
  const key = JSON.stringify([
    `${policy.schema}.${policy.table}`,
    policy.command,
    [...policy.roles].sort()
  ]);
  const group = policyGroups.get(key) || [];
  group.push(policy.name);
  policyGroups.set(key, group);
}

const multiplePolicies = [...policyGroups.entries()]
  .filter(([, names]) => names.length > 1)
  .map(([key, names]) => {
    const [table, command, roles] = JSON.parse(key);
    return { table, command, roles, names: names.sort() };
  })
  .sort((a, b) => `${a.table}.${a.command}`.localeCompare(`${b.table}.${b.command}`));

const securityDefinerExposure = snapshot.functions
  .filter(row => row.security_definer && (row.anon_execute || row.authenticated_execute))
  .map(row => ({
    function: `${row.schema}.${row.name}(${row.identity_arguments})`,
    anon_execute: row.anon_execute,
    authenticated_execute: row.authenticated_execute,
    search_path: row.config
  }));

const report = {
  generated_at_utc: new Date().toISOString(),
  snapshot: path.relative(root, snapshotPath).replaceAll("\\", "/"),
  migration_history_relation_exists: snapshot.migration_history_relation_exists,
  migration_files: migrationFiles.length,
  migrations,
  external_prerequisites: externalPrerequisites,
  reproducible_from_empty_application_schema:
    externalPrerequisites.filter(table => !table.startsWith("auth.")).length === 0,
  live_only_policies: liveOnlyPolicies,
  multiple_permissive_policy_groups: multiplePolicies,
  security_definer_exposure: securityDefinerExposure,
  summary: {
    complete_migrations: migrations.filter(row => row.status === "present").length,
    migrations_needing_external_verification: migrations.filter(row => row.status.includes("external")).length,
    incomplete_migrations: migrations.filter(row => row.status === "incomplete").length,
    live_only_policies: liveOnlyPolicies.length,
    multiple_policy_groups: multiplePolicies.length,
    exposed_security_definer_functions: securityDefinerExposure.length
  }
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
