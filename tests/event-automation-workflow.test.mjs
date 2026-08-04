import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const operations = read("supabase/migrations/20260731_event_operations_stage_two.sql");
const catalog = read("supabase/migrations/20260801_catalog_import_transition.sql");
const polygons = read("supabase/migrations/20260802_postgis_country_boundaries.sql");
const exceptions = read("supabase/migrations/20260803_country_boundary_exceptions.sql");
const scheduler = read("supabase/migrations/20260805_source_worker_schedule.sql");
const sourceMonitor = read("supabase/migrations/20260808_source_monitor_queue_worker.sql");
const worker = read("supabase/functions/event-source-check/index.ts");
const eventsClient = read("js/events.js");
const adminClient = read("js/supabase.js");

[
  "for update skip locked",
  "create table if not exists public.event_change_proposals",
  "create table if not exists public.data_workflow_runs",
  "create table if not exists public.data_workflow_alerts",
  "create or replace function public.apply_event_change_proposal",
  "sem-event-operations-hourly"
].forEach(fragment => assert.ok(operations.includes(fragment), `Operations migration missing ${fragment}`));

[
  "private.catalog_import_backups",
  "private.begin_catalog_import",
  "private.import_catalog_events",
  "private.import_catalog_editions",
  "private.finalize_catalog_import",
  "duplicate event editions detected"
].forEach(fragment => assert.ok(catalog.includes(fragment), `Catalog migration missing ${fragment}`));

assert.ok(polygons.includes("create extension if not exists postgis"));
assert.ok(polygons.includes("country_boundaries_geom_gix"));
assert.ok(exceptions.includes("no_svalbard"));
assert.ok(exceptions.includes("es_canary_islands"));
assert.ok(scheduler.includes("vault.decrypted_secrets"));
assert.ok(scheduler.includes("sem-event-source-check"));

assert.ok(worker.includes("evaluateRobots"));
assert.ok(sourceMonitor.includes("retry_backoff_minutes"));
assert.ok(sourceMonitor.includes("event_change_proposals"));
assert.ok(worker.includes("claim_source_crawl_jobs"));
assert.ok(worker.includes("record_source_crawl_result"));
assert.ok(worker.includes("verify_event_source_cron_secret"));
assert.doesNotMatch(worker, /\.from\(["']events["']\)\.update/);
assert.doesNotMatch(worker, /\.from\(["']event_editions["']\)\.update/);

assert.ok(eventsClient.includes("MIN_SUPABASE_CATALOG_ROWS = 1"));
assert.ok(eventsClient.includes('"csv-fallback"'));
assert.ok(adminClient.includes('data-dataops-action="approve-proposal"'));
assert.ok(adminClient.includes('data-dataops-action="resolve-alert"'));

console.log("Event automation workflow structure verified.");
