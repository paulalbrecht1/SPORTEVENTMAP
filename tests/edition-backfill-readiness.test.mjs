import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditPath = path.join(root, "tools", "edition-backfill-readiness.sql");
const sql = fs.readFileSync(auditPath, "utf8");

assert.match(sql, /^\s*--[\s\S]*?\bwith\b/i,
  "The inventory must be a single WITH ... SELECT statement.");
assert.match(sql, /'execution_guard', 'single_select_static_allowlist'/i);
assert.match(sql, /current_setting\('transaction_read_only'\)/i);
assert.match(sql, /'writes_attempted', 0/i);
assert.match(sql, /'automatic_backfill_allowed', false/i);
assert.match(sql, /false as safe_to_auto_backfill/i);
assert.match(sql, /from audit_session;\s*$/i);

const statements = sql
  .replace(/--[^\n]*/g, "")
  .split(";")
  .map(statement => statement.trim())
  .filter(Boolean);

assert.equal(statements.length, 1, "The audit must contain exactly one SQL statement.");
assert.match(statements[0], /^with\b/i);

for (const marker of [
  "duplicate_event_year_groups",
  "rows_without_edition_reference",
  "edition_delete_is_restricted",
  "candidate_source_event_mismatches",
  "candidate_crawl_binding_mismatches",
  "has_peer_date_conflict",
  "has_high_risk_evidence",
  "manual_lock_gate_available",
  "has_critical_validation_issue",
  "dependency_mapping_required_before_field_moves",
  "no_knowledge_base_backfill_before_consumer_audit",
  "reconcile_legacy_draft_manually",
  "revalidate_from_fresh_source_crawl",
  "eligible_for_explicit_admin_review",
  "manual_review_before_any_backfill"
]) {
  assert.ok(sql.includes(marker), `Backfill readiness audit missing ${marker}`);
}

assert.doesNotMatch(sql, /\b(?:insert\s+into|update\s+public\.|delete\s+from|merge\s+into|truncate\s+|alter\s+table|create\s+(?:table|view|function)|drop\s+)\b/i,
  "The readiness audit contains a mutating SQL operation.");

console.log("Edition backfill inventory is read-only and all preview actions remain manual.");
