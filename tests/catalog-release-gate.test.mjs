import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { evaluateCatalogRelease, maximumAllowedDrop, sha256 } = require("../tools/check-catalog-release.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-release-gate-"));
const data = path.join(root, "data");
fs.mkdirSync(data, { recursive: true });

const exportedAt = "2026-08-24T08:00:00.000Z";
const discovery = "event_name;date\nTest Event;01.01.2027\n";
const archive = `${JSON.stringify({ exported_at: exportedAt, editions: [{ edition_slug: "test-event-2027" }] }, null, 2)}\n`;
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
  sha256: { discovery: sha256(discovery), archive: sha256(archive) },
  metrics: { discovery_rows: 1, archive_rows: 1, freshness_rate: 60, completeness_rate: 50 }
}));

assert.equal(evaluateCatalogRelease({ root, now: "2026-08-24T09:00:00.000Z" }).passed, true);
assert.equal(evaluateCatalogRelease({ root, now: "2026-08-26T09:00:00.000Z" }).passed, false);
fs.writeFileSync(path.join(data, "event-pages.json"), "[]\n");
assert.equal(evaluateCatalogRelease({ root, now: "2026-08-24T09:00:00.000Z" }).passed, false);
assert.equal(maximumAllowedDrop(471, 15), 400);
fs.rmSync(root, { recursive: true, force: true });

console.log("Catalog release gate blocks stale exports and rowcount drift.");
