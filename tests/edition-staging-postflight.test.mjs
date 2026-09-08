import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(
  path.join(root, "tools", "edition-staging-postflight.sql"),
  "utf8"
);

const statements = sql
  .replace(/--[^\n]*/g, "")
  .split(";")
  .map(statement => statement.trim())
  .filter(Boolean);

assert.equal(statements.length, 1, "Staging postflight must contain one SQL statement.");
assert.match(statements[0], /^with\b/i);
assert.match(sql, /'execution_guard', 'single_select_static_allowlist'/i);
assert.match(sql, /'writes_attempted', 0/i);
assert.match(sql, /'deployment_authorized', false/i);
assert.match(sql, /'backfill_authorized', false/i);
assert.match(sql, /'target_confirmation_required', true/i);

for (const marker of [
  "candidate_validation_columns",
  "manual_lock_table_present",
  "lifecycle_state_view_present",
  "season_planner_delete_restricted",
  "register_service_only",
  "detection_does_not_materialize_edition",
  "approval_requires_admin_and_explicit_ids",
  "approval_admin_only_invoker",
  "approval_publishes_reviewed_draft_atomically",
  "legacy_approval_fails_closed",
  "postponed_not_auto_completed",
  "disable_constraint_present",
  "legacy_unvalidated",
  "contradictory_open_candidate_groups",
  "ready_for_manual_candidate_smoke"
]) assert.ok(sql.includes(marker), `Staging postflight missing ${marker}`);
for (const marker of [
  'public.approve_edition_succession_candidates(uuid[],integer,text,jsonb)',
  'public.approve_edition_succession_candidates(uuid[],integer)',
  'public.verify_freshness_review_editions(uuid[],text,jsonb)',
  'requested_count not between 1 and 25',
  'p_limit is distinct from requested_count',
  'not p.prosecdef',
  "has_function_privilege('anon', bodies.approve_oid, 'execute')",
  "has_function_privilege('service_role', bodies.approve_oid, 'execute')",
  "position('insert into public.event_editions' in bodies.approve_body) = 0",
  'generated_from_candidate_id is distinct from candidate_row.id',
  'publication_source.edition_id is distinct from draft_row.id',
  'verify_freshness_review_editions(edition_ids, notes, p_evidence)',
  "position('exception when' in bodies.approve_body) = 0",
  "position('set_config(''app.freshness_verification''' in bodies.approve_body) = 0"
]) assert.ok(sql.includes(marker), `Staging postflight omits a safe publication condition: ${marker}`);

const executableSql = sql
  .replace(/--[^\n]*/g, "")
  .replace(/'(?:''|[^'])*'/g, "''");
assert.doesNotMatch(executableSql, /\b(?:insert\s+into|update\s+public\.|delete\s+from|merge\s+into|truncate\s+|alter\s+table|create\s+(?:table|view|function)|drop\s+)\b/i,
  "Staging postflight contains a mutating SQL operation.");

console.log("Edition staging postflight is read-only and keeps deployment/backfill unauthorized.");
