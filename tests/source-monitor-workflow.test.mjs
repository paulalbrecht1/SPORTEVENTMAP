import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read("supabase/migrations/20260808_source_monitor_queue_worker.sql");
const worker = read("supabase/functions/event-source-check/index.ts");
const core = read("supabase/functions/_shared/source-monitor-core.mjs");
const admin = read("js/supabase.js");

for (const fragment of [
  "create table if not exists public.source_crawl_jobs",
  "create table if not exists public.source_crawl_results",
  "create table if not exists public.source_review_tasks",
  "source_crawl_jobs_one_active_source_uidx",
  "for update of job skip locked",
  "status in ('queued', 'processing', 'completed', 'failed', 'retry_scheduled', 'dead_letter')",
  "create or replace function public.schedule_due_source_crawls",
  "create or replace function public.claim_source_crawl_jobs",
  "create or replace function public.record_source_crawl_result",
  "private.source_monitor_next_at",
  "source_monitor_housekeeping",
  "enable row level security"
]) assert.ok(migration.includes(fragment), `Migration missing ${fragment}`);

for (const fragment of ["fetchSource", "resolvePublicDns", "record_source_crawl_result", "Promise.all", "SOURCE_MONITOR_USER_AGENT", "SOURCE_MONITOR_ALLOW_HTTP"]) {
  assert.ok(worker.includes(fragment), `Worker missing ${fragment}`);
}
for (const fragment of ["ssrf_blocked", "redirect: \"manual\"", "maxResponseBytes", "unsupported_content_type", "normalizeRelevantContent"]) {
  assert.ok(core.includes(fragment), `Core missing ${fragment}`);
}
assert.doesNotMatch(worker, /\.from\(["']events["']\)\.update/);
assert.doesNotMatch(worker, /\.from\(["']event_editions["']\)\.update/);
assert.ok(admin.includes("sourceMonitor"), "Admin Source Monitor integration is missing.");
console.log("Source Monitor queue, worker, safety boundary and admin integration verified.");
