import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const exporterSource = fs.readFileSync(new URL("../tools/export-supabase-event-catalog.js", import.meta.url), "utf8");
const {
  assertExportPolicy,
  assertFreshnessGuardCoverage,
  buildExportMetrics,
  evaluateExportPolicy,
  isFreshDiscoveryRow,
  requestFreshnessGuard,
  writeCatalogSnapshot
} = require("../tools/export-supabase-event-catalog.js");

const exporterMain = exporterSource.slice(
  exporterSource.indexOf("async function main()"),
  exporterSource.indexOf("if (require.main === module)")
);
assert.ok(exporterMain.indexOf("requestFreshnessGuard(") < exporterMain.indexOf("writeCatalogSnapshot({"),
  "The authoritative guard must be validated before any snapshot write, including diagnostic exports.");

const policy = {
  minimum_discovery_rows: 400,
  reference_discovery_rows: 471,
  maximum_discovery_drop_percent: 15,
  minimum_archive_rows: 950,
  reference_archive_rows: 994,
  maximum_archive_drop_percent: 2,
  minimum_freshness_rate: 55,
  minimum_completeness_rate: 45
};

const healthyMetrics = {
  discovery_rows: 431,
  archive_rows: 994,
  freshness_rate: 64.04,
  completeness_rate: 48.49
};

assert.equal(evaluateExportPolicy(healthyMetrics, policy).passed, true);
assert.doesNotThrow(() => assertExportPolicy(healthyMetrics, policy));

const unhealthyMetrics = {
  discovery_rows: 380,
  archive_rows: 994,
  freshness_rate: 0.53,
  completeness_rate: 49.21
};
const unhealthy = evaluateExportPolicy(unhealthyMetrics, policy);

assert.equal(unhealthy.passed, false);
assert.deepEqual(
  unhealthy.checks.filter(check => !check.passed).map(check => check.name),
  ["minimum discovery rows", "discovery baseline drop", "freshness floor"]
);
assert.throws(
  () => assertExportPolicy(unhealthyMetrics, policy),
  /Refusing to replace the public fallback with an unhealthy catalog/
);

const editionId = "11111111-1111-4111-8111-111111111111";
const secondEditionId = "22222222-2222-4222-8222-222222222222";
const exportedAt = new Date().toISOString();
const discoveryRow = {
  edition_id: editionId,
  event_name: "Guarded Event",
  sport: "Running",
  city: "Berlin",
  country: "Germany",
  date: "15.10.2027",
  address: "Teststrasse 1",
  latitude: "52.52",
  longitude: "13.405",
  distance: "10 km",
  description: "A complete public event description long enough for the strict catalog completeness and freshness test.",
  event_url: "https://example.com/register",
  source_url: "https://example.com/event",
  verification_status: "verified",
  last_checked: exportedAt,
  next_check: new Date(Date.now() + 86400000).toISOString()
};
const guardPayload = decisions => ({
  schema_version: 1,
  evaluated_at: new Date().toISOString(),
  requested_count: Object.keys(decisions).length,
  decisions
});

assert.equal(isFreshDiscoveryRow(discoveryRow, exportedAt), false,
  "Public row metadata alone must never establish freshness.");
assert.equal(
  buildExportMetrics([discoveryRow], [], exportedAt, guardPayload({ [editionId]: false })).fresh_rows,
  0,
  "An authoritative false decision must override apparently verified public metadata."
);
assert.equal(
  buildExportMetrics([discoveryRow], [], exportedAt, guardPayload({ [editionId]: true })).fresh_rows,
  1
);
assert.throws(
  () => assertFreshnessGuardCoverage([discoveryRow], guardPayload({})),
  /requested_count does not match|do not exactly match/
);
assert.throws(
  () => assertFreshnessGuardCoverage([discoveryRow], guardPayload({
    [editionId]: true,
    [secondEditionId]: false
  })),
  /requested_count does not match|do not exactly match/
);
assert.throws(
  () => assertFreshnessGuardCoverage([discoveryRow], guardPayload({ [editionId]: "true" })),
  /non-boolean/
);
assert.throws(
  () => assertFreshnessGuardCoverage([discoveryRow, discoveryRow], {
    ...guardPayload({ [editionId]: true }),
    requested_count: 2
  }),
  /duplicate edition ids/
);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () => "guard unavailable"
  });
  await assert.rejects(
    () => requestFreshnessGuard("https://example.supabase.co", "anon-key", [editionId]),
    /freshness guard failed \(503\)/
  );
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => { throw new Error("invalid json"); }
  });
  await assert.rejects(
    () => requestFreshnessGuard("https://example.supabase.co", "anon-key", [editionId]),
    /malformed JSON/
  );
} finally {
  globalThis.fetch = originalFetch;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-export-policy-"));
try {
  const out = path.join(root, "events.csv");
  const archiveOut = path.join(root, "event-editions-public.json");
  const manifestOut = path.join(root, "catalog-export-manifest.json");
  const sentinelFiles = new Map([
    [out, "existing discovery\n"],
    [archiveOut, "existing archive\n"],
    [manifestOut, "existing manifest\n"]
  ]);

  sentinelFiles.forEach((content, filePath) => fs.writeFileSync(filePath, content));

  assert.throws(
    () => writeCatalogSnapshot({
      args: { out, archiveOut, manifestOut, allowUnhealthy: false },
      archiveOutput: "replacement archive\n",
      exportedAt: "2026-09-04T10:00:00.000Z",
      metrics: unhealthyMetrics,
      output: "replacement discovery\n",
      policy
    }),
    /Refusing to replace the public fallback with an unhealthy catalog/
  );

  sentinelFiles.forEach((content, filePath) => {
    assert.equal(fs.readFileSync(filePath, "utf8"), content);
  });
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("Catalog export policy prevents unhealthy Supabase snapshots from replacing the fallback.");
