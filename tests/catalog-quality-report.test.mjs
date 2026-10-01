import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const { buildCatalogQualityReport, buildExportMetrics, hasUsableCoordinates } = require("../js/catalog-quality-report.js");
const now = new Date("2026-10-01T10:00:00Z");
const policy = require("../data/catalog-release-policy.json");
const row = (index, country = "Germany") => ({ event_id: index,
  edition_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  event_name: `Event ${index}`, sport: "Running", date: "2027-04-04", city: "Berlin", country,
  latitude: 52.5, longitude: 13.4, distance: "10 km", description: "Offizielle Beschreibung ".repeat(5),
  event_url: "https://example.org", source_url: "https://example.org", verification_status: "verified",
  last_checked: "2026-09-29T10:00:00Z", next_check: "2026-10-05T10:00:00Z" });
const rows = [row(1), row(2), row(3, "France")];
const snapshot = { schema_version: 1, consistency: "single_statement", discovery_count: 3, archive_count: 3, measured_at: now.toISOString(), discovery: rows,
  archive: rows, freshness_guard: { schema_version: 1, evaluated_at: now.toISOString(), requested_count: 3,
    decisions: Object.fromEntries(rows.map((r, index) => [r.edition_id, index > 0])) } };

test("same Discovery cohort and authoritative false decision in admin and export", () => {
  const report = buildCatalogQualityReport({ snapshot, policy, now });
  assert.equal(report.available, true);
  assert.deepEqual(report.metrics, buildExportMetrics(rows, rows, now.toISOString(), snapshot.freshness_guard, now.getTime()));
  assert.equal(report.future.total, 3);
  assert.equal(report.future.germany, 2);
  assert.equal(report.future.germany_fresh, 1);
  assert.equal(report.future.germany_freshness_rate, 50);
  assert.equal(report.metrics.fresh_rows, 2);
  assert.equal(report.future.missing_or_invalid_attestation, 1);
  assert.ok(report.blockers.some(text => /Discovery/.test(text)));
});
test("inaccessible, stale and incomplete evidence is unknown rather than zero", () => {
  for (const input of [null, { ...snapshot, measured_at: "2026-09-29T10:00:00Z" },
    { ...snapshot, freshness_guard: { ...snapshot.freshness_guard, decisions: {} } }]) {
    const result = buildCatalogQualityReport({ snapshot: input, policy, now });
    assert.equal(result.available, false);
    assert.equal(result.metrics, null);
    assert.equal(result.future, null);
  }
});
test("null/blank location values do not become zero coordinates", () => {
  for (const latitude of [null, undefined, "", " "]) assert.equal(hasUsableCoordinates({ latitude, longitude: 13 }), false);
  assert.equal(hasUsableCoordinates({ latitude: 52, longitude: 13 }), true);
});
test("undated published records stay in release denominator, separately counted", () => {
  const modified = { ...snapshot, discovery: [{ ...rows[0], date: null }, ...rows.slice(1)] };
  const report = buildCatalogQualityReport({ snapshot: modified, policy, now });
  assert.equal(report.metrics.discovery_rows, 3);
  assert.equal(report.future.total, 2);
  assert.equal(report.future.unknown_date, 1);
  assert.equal(report.operations, null);
});
test("zero cohort has no invented verification percentage", () => {
  const empty = { schema_version: 1, consistency: "single_statement", discovery_count: 0, archive_count: 0, measured_at: now.toISOString(), discovery: [], archive: [],
    freshness_guard: { schema_version: 1, evaluated_at: now.toISOString(), requested_count: 0, decisions: {} } };
  const report = buildCatalogQualityReport({ snapshot: empty, policy, now });
  assert.equal(report.future.freshness_rate, null);
  assert.ok(report.blockers.length);
});
test("existing German date format is future dated; past dates are not unknown", () => {
  const changed = { ...snapshot, discovery: [{ ...rows[0], date: "04.04.2027" }, { ...rows[1], date: "30.09.2026" }, rows[2]] };
  const report = buildCatalogQualityReport({ snapshot: changed, policy, now });
  assert.equal(report.future.total, 2);
  assert.equal(report.future.unknown_date, 0);
  assert.equal(report.future.past_dated, 1);
  assert.equal(buildCatalogQualityReport({ snapshot: { ...snapshot, discovery_count: 4 }, policy, now }).available, false);
});

test("freshness guard and public rows must share the exact statement measurement", () => {
  const changed = { ...snapshot, freshness_guard: { ...snapshot.freshness_guard,
    evaluated_at: new Date(now.getTime() + 240000).toISOString() } };
  const report = buildCatalogQualityReport({ snapshot: changed, policy, now });
  assert.equal(report.available, false);
  assert.equal(report.metrics, null);
  assert.match(report.blockers[0], /derselben Messung/);
});

test("malformed snapshot rows remain unavailable instead of breaking the admin", () => {
  for (const invalid of [null, [], "invalid"]) {
    for (const kind of ["discovery", "archive"]) {
      const changed = { ...snapshot, [kind]: [invalid, ...snapshot[kind].slice(1)] };
      const report = buildCatalogQualityReport({ snapshot: changed, policy, now });
      assert.equal(report.available, false);
      assert.equal(report.future, null);
    }
  }
});
