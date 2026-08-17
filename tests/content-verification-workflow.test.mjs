import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read("supabase/migrations/20260812200435_content_change_verification_queue.sql");
const invokerMigration = read("supabase/migrations/20260812200627_content_change_verification_rpc_invoker.sql");
const stabilization = read("supabase/migrations/20260817121601_data_quality_stabilization.sql");
const admin = read("js/supabase.js");
const styles = read("css/source-monitor.css");
const page = read("index.html");

for (const fragment of [
  "source_review_tasks_content_verification_idx",
  "'content_verification'::text",
  "'verify_content'::text",
  "source.source_type = 'official_event_website'",
  "result.processing_status = 'completed'",
  "result.http_status between 200 and 299",
  "proposal.proposal_status = 'pending'",
  "issue.severity in ('error', 'critical')",
  "alert.severity in ('error', 'critical')",
  "create or replace function public.verify_content_change_tasks",
  "security invoker",
  "a maximum of 50 tasks can be verified at once",
  "order by task.id",
  "for update of task",
  "verification_status = 'verified'",
  "needs_review = false",
  "private.is_admin()",
  "revoke all on function public.verify_content_change_tasks(uuid[], text)",
  "grant execute on function public.verify_content_change_tasks(uuid[], text)"
]) assert.ok(migration.includes(fragment), `Content verification migration missing ${fragment}`);

const rpcStart = migration.indexOf("create or replace function public.verify_content_change_tasks");
const rpcEnd = migration.indexOf("revoke all on function public.verify_content_change_tasks", rpcStart);
const rpc = migration.slice(rpcStart, rpcEnd);
assert.doesNotMatch(rpc, /update public\.events\b/i, "Verification must not mutate event master facts.");
assert.doesNotMatch(rpc, /\b(start_date|end_date|registration_url|race_formats|legacy_distance|source_url)\s*=/i,
  "Verification must not mutate edition facts.");
assert.ok(invokerMigration.includes("alter function public.verify_content_change_tasks(uuid[], text)"));
assert.ok(invokerMigration.includes("security invoker"));

for (const fragment of [
  "p_evidence jsonb",
  "confirmed_fields",
  "uncertain_fields",
  "observed_values",
  "all central fields must be explicitly confirmed",
  "official source differs from stored event data",
  "__content_verification__",
  "automatic_fact_changes",
  "revoke all on function public.verify_content_change_tasks(uuid[], text, jsonb)"
]) assert.ok(stabilization.includes(fragment), `Stabilized verification is missing ${fragment}`);

const stabilizedRpcStart = stabilization.indexOf("create function public.verify_content_change_tasks");
const stabilizedRpcEnd = stabilization.indexOf("revoke all on function public.verify_content_change_tasks", stabilizedRpcStart);
const stabilizedRpc = stabilization.slice(stabilizedRpcStart, stabilizedRpcEnd);
assert.doesNotMatch(stabilizedRpc, /update public\.events\b/i, "Content verification must not mutate event master facts.");
assert.doesNotMatch(stabilizedRpc, /\b(start_date|end_date|registration_url|race_formats|legacy_distance|source_url)\s*=/i,
  "Content verification must not mutate stored edition facts.");

for (const fragment of [
  "renderContentVerificationEvidence",
  "content_verification: \"Quellenpruefung\"",
  "verify_content",
  "verify_content_change_tasks",
  "Feldweise bestaetigen",
  "collectContentVerificationEvidence",
  "p_evidence",
  "Quellenpruefungen müssen wegen der Feld-Evidenz einzeln"
]) assert.ok(admin.includes(fragment), `Admin verification UI missing ${fragment}`);

assert.ok(styles.includes(".admin-review-evidence"), "Evidence cards need responsive styling.");
assert.ok(page.includes("20260817-data-quality-v122"), "Admin runtime cache key was not advanced.");

console.log("Evidence-backed content verification queue and admin batch workflow verified.");
