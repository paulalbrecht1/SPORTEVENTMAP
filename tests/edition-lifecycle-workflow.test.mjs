import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read("supabase/migrations/20260810_edition_lifecycle_succession_engine.sql");
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
assert.doesNotMatch(worker, /\.from\(["']event_editions["']\)\.update/);
assert.ok(admin.includes("admin_exception_inbox"));
assert.ok(admin.includes("approve_edition_succession_candidates"));
assert.ok(admin.includes("approve_edition_result_candidates"));
assert.ok(details.includes('.from("season_planner_events")'));
assert.doesNotMatch(details, /const tables\s*=\s*\[\s*["']favorites/);
assert.ok(exporter.includes("public_event_archive"));
assert.ok(generator.includes("event-editions-public.json"));
assert.ok(generator.includes("buildEditionHistorySection"));

console.log("Edition Lifecycle: archive, private drafts, exception-only review and edition planning verified.");
