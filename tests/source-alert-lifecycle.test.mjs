import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(
  root,
  "supabase/migrations/20260812185304_source_alert_lifecycle_recovery.sql"
), "utf8");
const stabilization = fs.readFileSync(path.join(
  root,
  "supabase/migrations/20260815000000_data_quality_stabilization.sql"
), "utf8");

assert.match(migration, /create or replace function private\.resolve_source_failure_alerts/i);
assert.match(migration, /source\.last_fetched_at >= alert\.last_detected_at/i);
assert.match(migration, /source\.is_active is false/i);
assert.match(migration, /alert\.alert_code = 'source_repeated_failures'/i);
assert.match(migration, /alert\.alert_code like 'http\\_%'/i);
assert.doesNotMatch(migration, /source_content_changed[^\n]*resolved/i);
assert.match(migration, /create trigger event_sources_resolve_failure_alerts/i);
assert.match(migration, /resolved_source_alerts := private\.resolve_source_failure_alerts\(\)/i);
assert.match(migration, /revoke all on function private\.resolve_source_failure_alerts\(uuid\)/i);
assert.match(migration, /create or replace function private\.resolve_source_failure_review_tasks/i);
assert.match(migration, /task\.task_type in \('dead_letter', 'source_unreachable', 'content_invalid'\)/i);
assert.match(migration, /source\.last_fetched_at >= task\.updated_at/i);
assert.match(migration, /create or replace function private\.resolve_source_failure_validation_issues/i);
assert.match(migration, /'source_unreachable_' \|\| replace\(source\.id::text, '-', '_'\)/i);
assert.match(migration, /create or replace function private\.restore_recovered_source_events/i);
assert.match(migration, /event\.verification_status = 'source_unreachable'/i);
assert.match(migration, /perform private\.resolve_source_failure_review_tasks\(new\.id\)/i);
assert.match(migration, /select private\.resolve_source_failure_review_tasks\(\)/i);
assert.match(migration, /revoke all on function private\.resolve_source_failure_review_tasks\(uuid\)/i);
assert.doesNotMatch(
  migration,
  /task\.task_type in \([^)]*content_changed/i,
  "Content-change reviews must remain open for manual verification."
);
const recoveryStart = stabilization.indexOf("create or replace function private.restore_recovered_source_events");
const recoveryEnd = stabilization.indexOf("revoke all on function private.restore_recovered_source_events", recoveryStart);
const recovery = stabilization.slice(recoveryStart, recoveryEnd);
assert.match(recovery, /verification_status = 'needs_review'/i);
assert.match(recovery, /needs_review = true/i);
assert.doesNotMatch(recovery, /verification_status = 'verified'/i);
assert.doesNotMatch(recovery, /last_verified_at\s*=/i);

console.log(
  "Source lifecycle verified: recovery sweep closes stale technical artifacts " +
  "without discarding crawl history or content-change reviews."
);
