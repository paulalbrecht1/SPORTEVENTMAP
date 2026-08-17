import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read("supabase/migrations/20260810_edition_lifecycle_succession_engine.sql");
const automationMigration = read("supabase/migrations/20260813_review_inbox_safe_automation.sql");
const inboxMigration = read("supabase/migrations/20260814_review_inbox_deduplication.sql");
const candidateFirstMigration = read("supabase/migrations/20260817124600_edition_candidate_first_lifecycle.sql");
const worker = read("supabase/functions/event-source-check/index.ts");
const core = read("supabase/functions/_shared/source-monitor-core.mjs");
const admin = read("js/supabase.js");
const details = read("js/event-detail.js");
const exporter = read("tools/export-supabase-event-catalog.js");
const generator = read("tools/generate-event-pages.js");

for (const fragment of [
  "create table if not exists public.edition_results",
  "create table if not exists public.edition_succession_candidates",
  "create table if not exists public.edition_lifecycle_settings",
  "create or replace function public.register_edition_successor_candidate",
  "create or replace function public.register_edition_result_candidate",
  "create or replace function public.approve_edition_succession_candidates",
  "create or replace function public.approve_edition_result_candidates",
  "create or replace function private.run_edition_lifecycle",
  "create or replace view public.public_event_archive",
  "create or replace view public.admin_exception_inbox",
  "with (security_invoker = true)",
  "sem-edition-lifecycle-daily",
  "discovery_status = 'detail_only'",
  "publication_status = 'draft'"
]) assert.ok(migration.includes(fragment), `Lifecycle migration missing ${fragment}`);

assert.ok(core.includes("extractLifecycleSignals"));
assert.ok(worker.includes("register_edition_successor_candidate"));
assert.ok(worker.includes("register_edition_result_candidate"));
assert.ok(worker.includes("evidence_type: successor.evidence_type"));
assert.ok(worker.includes('.eq("publication_status", "published")'));
assert.ok(candidateFirstMigration.includes("validation_status text not null default 'pending'"));
assert.ok(candidateFirstMigration.includes("next_edition_unknown_watching"));
assert.ok(candidateFirstMigration.includes("explicit candidate ids are required"));
assert.doesNotMatch(candidateFirstMigration.slice(
  candidateFirstMigration.indexOf("create or replace function public.register_edition_successor_candidate"),
  candidateFirstMigration.indexOf("create or replace function public.approve_edition_succession_candidates")
), /insert into public\.event_editions/i);
assert.doesNotMatch(worker, /\.from\(["']event_editions["']\)\.update/);
assert.ok(admin.includes("admin_review_inbox"));
assert.ok(admin.includes("approve_edition_succession_candidates"));
assert.ok(admin.includes("approve_edition_result_candidates"));
assert.ok(admin.includes("Jetzt zu pruefen"));
assert.ok(admin.includes("wait_automation"));
assert.ok(admin.includes("renderReviewInboxDiff"));
for (const fragment of [
  "auto_publish_min_confirmations",
  "auto_result_publish_enabled",
  "min_confirmation_interval_hours",
  "private.track_successor_confirmation",
  "private.auto_publish_confirmed_successor",
  "private.auto_publish_confirmed_result",
  "confirmed_confidence",
  "wait_automation",
  "proposal.proposed_changes <> '{}'::jsonb",
  "with (security_invoker = true)"
]) assert.ok(automationMigration.includes(fragment), `Safe automation migration missing ${fragment}`);
for (const fragment of [
  "create or replace view public.admin_review_inbox",
  "with (security_invoker = true)",
  "distinct on (task.source_id)",
  "create or replace function public.resolve_source_exception_bundle",
  "security invoker",
  "private.is_admin()"
]) assert.ok(inboxMigration.includes(fragment), `Review inbox migration missing ${fragment}`);
assert.ok(details.includes('.from("season_planner_events")'));
assert.doesNotMatch(details, /const tables\s*=\s*\[\s*["']favorites/);
assert.ok(exporter.includes("public_event_archive"));
assert.ok(generator.includes("event-editions-public.json"));
assert.ok(generator.includes("buildEditionHistorySection"));

console.log("Edition Lifecycle: immutable history, candidate-first succession, review gates and edition planning verified.");
