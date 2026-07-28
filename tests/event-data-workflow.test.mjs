import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { parseCsvFile } = require("../tools/event-table-utils.js");
const {
  canonicalKey,
  legacyEventKey,
  prepareMigration
} = require("../tools/migrate-events-to-editions.js");

const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260728_event_data_operations_foundation.sql"
);
const migration = fs.readFileSync(migrationPath, "utf8");
const events = parseCsvFile(path.join(root, "data", "events.csv"));
const manifestRows = JSON.parse(
  fs.readFileSync(path.join(root, "data", "event-pages.json"), "utf8")
);
const manifest = new Map(
  manifestRows.map(row => [legacyEventKey(row), row.slug])
);
const prepared = prepareMigration(events, {
  manifest,
  today: new Date("2026-07-28T00:00:00Z")
});

assert.equal(events.length, 994, "Curated source row count changed unexpectedly.");
assert.equal(prepared.editions.length, events.length, "Every curated row must become one edition.");
assert.equal(prepared.events.length, 993, "The current data should group exactly one multi-year event brand.");
assert.deepEqual(prepared.rejected, [], "No curated row may be lost during preparation.");

assert.equal(
  new Set(prepared.editions.map(row => `${row.canonical_key}:${row.edition_year}`)).size,
  prepared.editions.length,
  "Event/year edition identities must be unique."
);
assert.equal(
  new Set(prepared.editions.map(row => row.legacy_event_key)).size,
  prepared.editions.length,
  "Favorite and Season Planner keys must remain unique."
);
assert.equal(
  prepared.editions.every(row => row.edition_slug),
  true,
  "Every edition needs a stable public slug."
);

const sample = events[0];
assert.equal(
  prepared.editions.some(row => row.legacy_event_key === legacyEventKey(sample)),
  true,
  "The exact legacy favorite key must survive the transition."
);
assert.ok(canonicalKey(sample), "Canonical event identity must be deterministic.");

[
  "create table if not exists public.event_editions",
  "create table if not exists public.event_sources",
  "create table if not exists public.validation_issues",
  "create table if not exists public.event_audit_log",
  "create or replace function public.run_event_validation",
  "create or replace view public.public_event_discovery",
  "with (security_invoker = true)",
  "alter table public.event_editions enable row level security",
  "revoke all on public.event_sources from anon, authenticated",
  "revoke all on public.validation_issues from anon, authenticated",
  "revoke all on public.event_audit_log from anon, authenticated",
  "grant select on public.public_event_discovery to anon, authenticated",
  "private.event_data_workflow_backup"
].forEach(fragment => {
  assert.ok(migration.includes(fragment), `Migration is missing: ${fragment}`);
});

[
  "unverified",
  "verified",
  "stale",
  "needs_review",
  "source_unreachable",
  "date_unconfirmed",
  "scheduled",
  "registration_not_open",
  "registration_open",
  "sold_out",
  "postponed",
  "cancelled",
  "completed",
  "inactive"
].forEach(status => {
  assert.ok(migration.includes(`'${status}'`), `Central status is missing: ${status}`);
});

[
  "missing_event_name",
  "missing_country",
  "invalid_date",
  "start_after_end",
  "missing_source",
  "invalid_official_url",
  "invalid_coordinates",
  "coordinates_outside_country",
  "duplicate_edition_year",
  "missing_image",
  "missing_start_time",
  "missing_registration_url",
  "missing_distance",
  "missing_price",
  "missing_organizer",
  "past_event_scheduled",
  "future_date_unverified",
  "verification_stale"
].forEach(rule => {
  assert.ok(migration.includes(`'${rule}'`), `Validation rule is missing: ${rule}`);
});

console.log(
  `Event data workflow verified: ${prepared.events.length} event brands, ` +
  `${prepared.editions.length} editions, ${prepared.rejected.length} rejected rows.`
);
