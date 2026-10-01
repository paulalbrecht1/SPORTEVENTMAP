import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { evaluateCatalogRelease, maximumAllowedDrop, sha256 } = require("../tools/check-catalog-release.js");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-release-gate-"));
const data = path.join(root, "data");
fs.mkdirSync(data, { recursive: true });

const attributes = fs.readFileSync(path.join(repositoryRoot, ".gitattributes"), "utf8");
for (const artifact of [
  "data/events.csv",
  "data/event-editions-public.json",
  "data/catalog-export-manifest.json"
]) {
  assert.ok(
    attributes.split(/\r?\n/).some(line => line.trim() === `${artifact} text eol=lf`),
    `${artifact} must keep LF bytes because the catalog manifest hashes exact file contents.`
  );
}

const exportedAt = "2026-08-24T08:00:00.000Z";
const discovery = 'event_name;date;event_id;edition_id;edition_slug;edition_year;description\nTest Event;01.01.2027;7;edition-7;test-event-2027;2027;"First line\nSecond line"\n';
const archive = `${JSON.stringify({ exported_at: exportedAt, measured_at: exportedAt, editions: [{ event_id: 7, edition_id: "edition-7", edition_slug: "test-event-2027", edition_year: 2027, date: "01.01.2027" }] }, null, 2)}\n`;
fs.writeFileSync(path.join(data, "events.csv"), discovery);
fs.writeFileSync(path.join(data, "event-editions-public.json"), archive);
fs.writeFileSync(path.join(data, "event-pages.json"), JSON.stringify([{ slug: "test-event-2027" }]));
fs.writeFileSync(path.join(data, "catalog-release-policy.json"), JSON.stringify({
  maximum_export_age_hours: 24,
  maximum_future_clock_skew_minutes: 5,
  minimum_discovery_rows: 1,
  reference_discovery_rows: 1,
  maximum_discovery_drop_percent: 0,
  minimum_archive_rows: 1,
  reference_archive_rows: 1,
  maximum_archive_drop_percent: 0,
  minimum_freshness_rate: 55,
  minimum_completeness_rate: 45
}));
fs.writeFileSync(path.join(data, "catalog-export-manifest.json"), JSON.stringify({
  schema_version: 1,
  exported_at: exportedAt,
  measured_at: exportedAt,
  snapshot_consistency: "single_statement",
  diagnostic_only: false,
  sha256: { discovery: sha256(discovery), archive: sha256(archive) },
  metrics: { discovery_rows: 1, archive_rows: 1, freshness_rate: 60, completeness_rate: 50, freshness_guard_evaluated_at: exportedAt }
}));

assert.equal(evaluateCatalogRelease({ root, now: "2026-08-24T09:00:00.000Z" }).passed, true);
fs.mkdirSync(path.join(data, "catalog-export-manifest.json.transaction"));
assert.equal(evaluateCatalogRelease({ root, now: "2026-08-24T09:00:00.000Z" }).passed, false, "Interrupted grouped writes cannot be published.");
fs.rmdirSync(path.join(data, "catalog-export-manifest.json.transaction"));
const manifestPath = path.join(data, "catalog-export-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, diagnostic_only: true }));
assert.equal(evaluateCatalogRelease({ root, now: "2026-08-24T09:00:00.000Z" }).passed, false, "Diagnostics cannot obtain release approval.");
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
assert.equal(evaluateCatalogRelease({ root, now: "2026-08-26T09:00:00.000Z" }).passed, false);
fs.writeFileSync(path.join(data, "event-pages.json"), "[]\n");
assert.equal(evaluateCatalogRelease({ root, now: "2026-08-24T09:00:00.000Z" }).passed, false);
assert.equal(maximumAllowedDrop(471, 15), 400);
fs.rmSync(root, { recursive: true, force: true });

console.log("Catalog release gate blocks stale exports and rowcount drift.");
