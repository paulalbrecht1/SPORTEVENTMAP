import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const safety = require("../tools/catalog-snapshot-safety.js");
const { writeCatalogSnapshot, requestCatalogSnapshot, mapDiscoveryRow } = require("../tools/export-supabase-event-catalog.js");
const { parseCsv } = require("../tools/event-table-utils.js");
const { buildCatalogQualityReport } = require("../js/catalog-quality-report.js");

const measuredAt = new Date().toISOString();
const row = {
  event_id: 7, edition_id: "11111111-1111-4111-8111-111111111111", edition_slug: "snapshot-test-2027", edition_year: 2027,
  event_name: "Snapshot Test", sport: "Running", date: "15.03.2027", city: "Berlin", country: "Germany",
  address: "Teststrasse", latitude: 52.52, longitude: 13.4, distance: "10 km",
  description: "This is the official public description of the synthetic snapshot fixture. It has enough content for the existing completeness rule.",
  source_url: "https://example.test/2027", event_url: "https://example.test/register", registration_url: "https://example.test/register",
  verification_status: "verified", registration_status: "registration_open", last_checked: "2026-09-29T12:00:00Z",
  next_check: new Date(Date.now() + 86400000).toISOString(), event_status: "scheduled",
  end_date: "2027-03-15", start_time: "09:30:00", price_min: 10, price_max: 20, currency: "EUR", participant_limit: 200,
  race_formats: [{ label: "10 km", distance_km: 10, internal_notes: "PRIVATE_SENTINEL" }],
  internal_notes: "PRIVATE_SENTINEL", updated_at: measuredAt, admin_email: "PRIVATE_SENTINEL",
  results: [{ type: "official", title: "Results", url: "https://example.test/results", published_at: null, reviewer: "PRIVATE_SENTINEL" }]
};
const snapshot = {
  schema_version: 1, consistency: "single_statement", measured_at: measuredAt,
  discovery_count: 1, archive_count: 1, discovery: [structuredClone(row)], archive: [structuredClone(row)],
  freshness_guard: { schema_version: 1, evaluated_at: measuredAt, requested_count: 1, decisions: { [row.edition_id]: true } }
};
assert.doesNotThrow(() => safety.assertPublicCatalogSnapshot(snapshot));
assert.equal(mapDiscoveryRow(row, measuredAt).last_checked, row.last_checked, "Export time must not replace the actual verification time.");
assert.equal(mapDiscoveryRow({ ...row, verification_status: "needs_review" }, measuredAt).data_source,
  "Sport Event Map event catalog", "Catalog provenance must not claim that an unverified edition was verified.");
for (const [description, change, expected] of [
  ["server cap", value => { value.archive_count = 2; }, /incomplete/],
  ["empty output", value => { value.discovery = []; value.discovery_count = 0; }, /empty/],
  ["different edition value", value => { value.archive[0].date = "16.03.2027"; }, /same edition snapshot/],
  ["invalid year", value => { value.discovery[0].edition_year = 0; }, /identity/],
  ["impossible date", value => { value.discovery[0].date = "31.02.2027"; }, /impossible date/],
  ["invalid geo", value => { value.discovery[0].latitude = 100; }, /latitude/],
  ["invalid distance", value => { value.discovery[0].race_formats[0].distance_km = -1; }, /competition distance/],
  ["private draft", value => { value.archive[0].publication_status = "draft"; }, /unpublished/],
  ["duplicate edition", value => { value.archive.push(value.archive[0]); value.archive_count = 2; }, /duplicate/],
  ["independent guard", value => { value.freshness_guard.evaluated_at = new Date(Date.parse(measuredAt) + 1).toISOString(); }, /same database statement/]
]) {
  const changed = structuredClone(snapshot); change(changed);
  assert.throws(() => safety.assertPublicCatalogSnapshot(changed), expected, description);
}
const postponed = structuredClone(snapshot);
postponed.discovery[0].edition_year = postponed.archive[0].edition_year = 2026;
assert.doesNotThrow(() => safety.assertPublicCatalogSnapshot(postponed),
  "A postponed edition keeps its identity even when its actual date moves across New Year.");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-snapshot-safety-"));
const args = { out: path.join(tmp, "events.csv"), archiveOut: path.join(tmp, "archive.json"), manifestOut: path.join(tmp, "manifest.json"), allowUnhealthy: false };
const policy = { minimum_discovery_rows: 1, reference_discovery_rows: 1, maximum_discovery_drop_percent: 0,
  minimum_archive_rows: 1, reference_archive_rows: 1, maximum_archive_drop_percent: 0, minimum_freshness_rate: 55, minimum_completeness_rate: 45 };
const targets = [args.out, args.archiveOut, args.manifestOut];
try {
  const sentinel = targets.map((target, index) => { const content = `previous-${index}\n`; fs.writeFileSync(target, content); return content; });
  const failedFs = Object.create(fs);
  let renames = 0;
  failedFs.renameSync = (...values) => { if (++renames === 2) throw new Error("injected disk failure"); return fs.renameSync(...values); };
  assert.throws(() => writeCatalogSnapshot({ args, policy, exportedAt: measuredAt, snapshot, io: failedFs }), /injected disk failure/);
  targets.forEach((target, index) => assert.equal(fs.readFileSync(target, "utf8"), sentinel[index], "Every previous artifact survives a group-write failure."));
  assert.equal(fs.existsSync(`${args.manifestOut}.transaction`), false);

  const invalidGuard = structuredClone(snapshot); invalidGuard.freshness_guard.decisions = {};
  assert.throws(() => writeCatalogSnapshot({ args: { ...args, allowUnhealthy: true }, policy, exportedAt: measuredAt, snapshot: invalidGuard }), /exactly match/);
  targets.forEach((target, index) => assert.equal(fs.readFileSync(target, "utf8"), sentinel[index]));
  assert.throws(() => safety.assertDiagnosticPaths({ ...args, out: path.resolve("data/events.csv"), allowUnhealthy: true }, path.resolve(".")), /separate output paths/);

  for (const [label, change, expected] of [
    ["unknown date", value => { value.discovery[0].date = value.archive[0].date = ""; }, /date/],
    ["missing geo", value => { value.discovery[0].latitude = value.archive[0].latitude = null; }, /geo/],
    ["country mismatch", value => { value.discovery[0].latitude = value.archive[0].latitude = 20; }, /country bounding box/],
    ["uncertain duplicate", value => { value.discovery[1].event_name = value.archive[1].event_name = row.event_name; value.discovery[1].city = value.archive[1].city = row.city; }, /duplicate/]
  ]) {
    const value = structuredClone(snapshot);
    const second = { ...structuredClone(row), event_id:8, edition_id:"22222222-2222-4222-8222-222222222222", edition_slug:"other-test-2027", event_name:"Other Competition", city:"Hamburg", latitude:53.55, longitude:9.99, event_url:"https://example.test/other", source_url:"https://example.test/other" };
    value.discovery.push(structuredClone(second)); value.archive.push(structuredClone(second));
    value.discovery_count = value.archive_count = 2;
    value.freshness_guard.requested_count = 2; value.freshness_guard.decisions[second.edition_id] = true;
    change(value);
    assert.throws(() => writeCatalogSnapshot({ args, policy, exportedAt:measuredAt, snapshot:value }), expected, `${label} is rejected by the existing bound audits before replacement.`);
    targets.forEach((target,index) => assert.equal(fs.readFileSync(target,"utf8"),sentinel[index]));
  }

  const result = writeCatalogSnapshot({ args, policy, exportedAt: measuredAt, snapshot });
  assert.equal(result.policyResult.passed, true);
  const discovery = parseCsv(fs.readFileSync(args.out, "utf8"))[0];
  const archive = JSON.parse(fs.readFileSync(args.archiveOut, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(args.manifestOut, "utf8"));
  assert.equal(discovery.edition_id, archive.editions[0].edition_id);
  assert.equal(discovery.date, archive.editions[0].date);
  assert.equal(discovery.last_checked, row.last_checked);
  assert.equal(discovery.start_time, archive.editions[0].start_time);
  assert.equal(discovery.price_min, String(archive.editions[0].price_min));
  assert.equal(manifest.measured_at, archive.measured_at);
  assert.equal(manifest.diagnostic_only, false);
  for (const target of targets) assert.doesNotMatch(fs.readFileSync(target, "utf8"), /PRIVATE_SENTINEL|admin_email|internal_notes|updated_at|reviewer/);
  const allTargets = [...targets, ...fs.readdirSync(path.join(tmp,"audit-reports")).map(file=>path.join(tmp,"audit-reports",file))];
  const previous = allTargets.map(target=>fs.readFileSync(target,"utf8"));
  let groupRenames = 0;
  const failingAudits = Object.create(fs);
  failingAudits.renameSync = (...values) => { if (++groupRenames === 5) throw new Error("injected audit commit failure"); return fs.renameSync(...values); };
  assert.throws(() => writeCatalogSnapshot({ args, policy, exportedAt:measuredAt, snapshot, io:failingAudits }), /audit commit failure/);
  allTargets.forEach((target,index)=>assert.equal(fs.readFileSync(target,"utf8"),previous[index],"Data and bound audit artifacts roll back together."));

  // A deadline crossed while preparing files must not change the measured cohort.
  const exportTime = new Date().toISOString();
  const boundary = structuredClone(snapshot);
  boundary.measured_at = boundary.freshness_guard.evaluated_at = new Date(Date.parse(exportTime) - 4000).toISOString();
  boundary.discovery[0].next_check = boundary.archive[0].next_check = new Date(Date.parse(exportTime) - 2000).toISOString();
  const boundaryReport = buildCatalogQualityReport({ snapshot: boundary, policy, now: exportTime });
  assert.equal(boundaryReport.metrics.fresh_rows, 1);
  const boundaryExport = writeCatalogSnapshot({ args, policy, exportedAt: exportTime, snapshot: boundary });
  assert.deepEqual(boundaryExport.metrics, boundaryReport.metrics, "Export and Admin report evaluate freshness at the same database measurement time.");

  // An interrupted exporter cannot be silently reused or overwritten.
  fs.mkdirSync(`${args.manifestOut}.transaction`);
  assert.throws(() => writeCatalogSnapshot({ args, policy, exportedAt: measuredAt, snapshot }), /EEXIST/);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, options) => {
    assert.match(url, /rpc\/get_public_event_catalog_snapshot$/);
    assert.equal(options.method, "POST"); assert.equal(options.body, "{}");
    return { ok: true, json: async () => snapshot };
  };
  assert.equal((await requestCatalogSnapshot("https://example.supabase.co", "publishable")).measured_at, measuredAt);
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  await assert.rejects(() => requestCatalogSnapshot("https://example.supabase.co", "publishable"), /snapshot unavailable.*fallback files remain unchanged/);
} finally { globalThis.fetch = originalFetch; }

const migration = fs.readFileSync(new URL("../supabase/migrations/20261001095043_public_catalog_consistent_snapshot.sql", import.meta.url), "utf8");
assert.match(migration, /language sql stable security invoker/);
assert.match(migration, /revoke all.*from public;/);
assert.match(migration, /grant execute.*to anon, authenticated;/);
assert.doesNotMatch(migration, /\b(insert|update|delete|security definer)\b/i);
for (const field of [...safety.PUBLIC_VIEW_COLUMNS, ...safety.PUBLIC_RACE_COLUMNS, ...safety.PUBLIC_RESULT_COLUMNS]) {
  assert.ok(migration.includes(`'${field}'`), `Snapshot SQL preserves the public field ${field}.`);
}
const sqlRegression = fs.readFileSync(new URL("./catalog-consistent-snapshot.sql", import.meta.url), "utf8");
const localRunner = fs.readFileSync(new URL("./run-manual-event-maintenance-local.mjs", import.meta.url), "utf8");
assert.match(sqlRegression, /test_catalog_snapshot.*is distinct from 'isolated'/);
assert.match(sqlRegression, /snapshot is STABLE and security invoker/);
assert.match(sqlRegression, /Discovery exactly matches its archived edition facts/);
assert.match(sqlRegression, /ordinary authenticated and anon see identical public snapshot/);
assert.match(sqlRegression, /nested competition whitelist/);
assert.match(sqlRegression, /nested result whitelist/);
assert.match(sqlRegression, /snapshot performs no data evidence or audit writes/);
assert.match(sqlRegression, /rollback;\s*$/);
assert.match(localRunner, /test_catalog_snapshot = 'isolated'[\s\S]*catalog-consistent-snapshot\.sql/);
assert.match(localRunner, /CATALOG_SNAPSHOT_ASSERTIONS=\\d\+/);
console.log("Catalog snapshot safety verified: one statement contract, public whitelist, edition parity, validation, rollback and diagnostic isolation.");
