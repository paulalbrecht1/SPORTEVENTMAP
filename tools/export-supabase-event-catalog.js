const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  assertFreshnessGuardCoverage, buildExportMetrics, isCompleteDiscoveryRow,
  isFreshDiscoveryRow
} = require("../js/catalog-quality-report.js");
const {
  publicRow, assertPublicCatalogSnapshot, assertDiagnosticPaths, prepareBoundQualityAudits, replaceCatalogArtifacts
} = require("./catalog-snapshot-safety.js");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_CATALOG_COLUMNS = [
  "event_name", "sport", "date", "city", "country", "address", "latitude", "longitude",
  "distance", "description", "event_url", "data_source", "source_url", "verification_status",
  "priority", "check_frequency", "last_checked", "next_check", "source_note", "image",
  "event_id", "edition_id", "edition_year", "edition_slug", "brand_slug", "organizer_name",
  "organizer_url", "official_url", "registration_url", "registration_status", "event_status",
  "brand_verification_status", "brand_last_verified_at", "edition_verification_status",
  "edition_last_verified_at", "race_formats", "end_date", "start_time",
  "price_min", "price_max", "currency", "participant_limit"
];

function clean(value) {
  return value === null || value === undefined ? "" : String(value);
}

function csvCell(value) {
  const text = clean(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseArgs(argv) {
  const args = {
    out: path.join(ROOT, "data", "events.csv"),
    archiveOut: path.join(ROOT, "data", "event-editions-public.json"),
    manifestOut: path.join(ROOT, "data", "catalog-export-manifest.json"),
    write: false,
    allowUnhealthy: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = path.resolve(argv[++index]);
    if (argv[index] === "--archive-out") args.archiveOut = path.resolve(argv[++index]);
    if (argv[index] === "--manifest-out") args.manifestOut = path.resolve(argv[++index]);
    if (argv[index] === "--write") args.write = true;
    if (argv[index] === "--allow-unhealthy") args.allowUnhealthy = true;
  }
  return args;
}

function maximumAllowedDrop(reference, maximumDropPercent) {
  return Math.floor(reference * (1 - maximumDropPercent / 100));
}

function evaluateExportPolicy(metrics, policy) {
  const checks = [
    {
      name: "minimum discovery rows",
      passed: Number(metrics.discovery_rows) >= Number(policy.minimum_discovery_rows),
      actual: Number(metrics.discovery_rows),
      expected: `>= ${policy.minimum_discovery_rows}`
    },
    {
      name: "discovery baseline drop",
      passed: Number(metrics.discovery_rows) >= maximumAllowedDrop(
        Number(policy.reference_discovery_rows),
        Number(policy.maximum_discovery_drop_percent)
      ),
      actual: Number(metrics.discovery_rows),
      expected: `>= ${maximumAllowedDrop(
        Number(policy.reference_discovery_rows),
        Number(policy.maximum_discovery_drop_percent)
      )}`
    },
    {
      name: "minimum archive rows",
      passed: Number(metrics.archive_rows) >= Number(policy.minimum_archive_rows),
      actual: Number(metrics.archive_rows),
      expected: `>= ${policy.minimum_archive_rows}`
    },
    {
      name: "archive baseline drop",
      passed: Number(metrics.archive_rows) >= maximumAllowedDrop(
        Number(policy.reference_archive_rows),
        Number(policy.maximum_archive_drop_percent)
      ),
      actual: Number(metrics.archive_rows),
      expected: `>= ${maximumAllowedDrop(
        Number(policy.reference_archive_rows),
        Number(policy.maximum_archive_drop_percent)
      )}`
    },
    {
      name: "freshness floor",
      passed: Number(metrics.freshness_rate) >= Number(policy.minimum_freshness_rate),
      actual: Number(metrics.freshness_rate),
      expected: `>= ${policy.minimum_freshness_rate}%`
    },
    {
      name: "completeness floor",
      passed: Number(metrics.completeness_rate) >= Number(policy.minimum_completeness_rate),
      actual: Number(metrics.completeness_rate),
      expected: `>= ${policy.minimum_completeness_rate}%`
    }
  ];

  return {
    passed: checks.every(check => check.passed),
    checks
  };
}

function assertExportPolicy(metrics, policy) {
  const result = evaluateExportPolicy(metrics, policy);

  if (!result.passed) {
    const failures = result.checks
      .filter(check => !check.passed)
      .map(check => `${check.name}: ${check.actual} (expected ${check.expected})`)
      .join("; ");

    throw new Error(
      "Refusing to replace the public fallback with an unhealthy catalog: " +
      `${failures}. Use --allow-unhealthy only for an explicitly reviewed diagnostic snapshot.`
    );
  }

  return result;
}

function writeCatalogSnapshot({
  args,
  exportedAt,
  policy,
  snapshot,
  io = fs
}) {
  assertDiagnosticPaths(args, ROOT);
  assertPublicCatalogSnapshot(snapshot);
  assertFreshnessGuardCoverage(snapshot.discovery, snapshot.freshness_guard);
  const metrics = buildExportMetrics(snapshot.discovery, snapshot.archive, snapshot.measured_at, snapshot.freshness_guard);
  const policyResult = evaluateExportPolicy(metrics, policy);

  if (args.allowUnhealthy) {
    if (!policyResult.passed) {
      console.warn("WARNING Writing an explicitly allowed unhealthy diagnostic catalog snapshot.");
    }
  } else {
    assertExportPolicy(metrics, policy);
  }

  // Build only from the validated database envelope; callers cannot substitute
  // unrelated healthy metrics, raw archive rows or private columns.
  const { output, archiveOutput } = buildCatalogArtifacts(snapshot, exportedAt);
  const audits = prepareBoundQualityAudits({ args, root: ROOT, output, exportedAt });

  const manifestOutput = `${JSON.stringify({
    schema_version: 1,
    exported_at: exportedAt,
    measured_at: new Date(snapshot.measured_at).toISOString(),
    snapshot_consistency: snapshot.consistency,
    diagnostic_only: Boolean(args.allowUnhealthy),
    data_quality_checked_at: audits.checkedAt,
    data_quality_passed: audits.quality.passed,
    sources: {
      discovery: "public_event_discovery",
      archive: "public_event_archive",
      freshness_guard: "get_public_event_freshness_guard",
      snapshot: "get_public_event_catalog_snapshot"
    },
    sha256: {
      discovery: sha256(output),
      archive: sha256(archiveOutput)
    },
    metrics
  }, null, 2)}\n`;

  replaceCatalogArtifacts([
    { target: args.out, content: output },
    { target: args.archiveOut, content: archiveOutput },
    ...audits.artifacts,
    { target: args.manifestOut, content: manifestOutput }
  ], io);

  return { manifestOutput, policyResult, metrics, qualityResult: audits.quality };
}

function buildCatalogArtifacts(snapshot, exportedAt) {
  const mapped = snapshot.discovery.map(row => mapDiscoveryRow(row, exportedAt));
  const output = [PUBLIC_CATALOG_COLUMNS.join(";"), ...mapped.map(row => PUBLIC_CATALOG_COLUMNS.map(column => csvCell(row[column])).join(";"))].join("\n") + "\n";
  const archiveOutput = `${JSON.stringify({ exported_at: exportedAt, measured_at: new Date(snapshot.measured_at).toISOString(), editions: snapshot.archive.map(row => publicRow(row, true)) }, null, 2)}\n`;
  return { output, archiveOutput };
}

function readPublicRuntimeConfig() {
  const configPath = path.join(ROOT, "js", "config.js");
  const source = fs.readFileSync(configPath, "utf8");
  const read = key => {
    const match = new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`).exec(source);
    return match ? match[1] : "";
  };
  return {
    url: read("supabaseUrl"),
    key: read("supabasePublishableKey")
  };
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function jsonCell(value) {
  if (value === null || value === undefined || value === "") return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function mapDiscoveryRow(row, exportedAt) {
  const editionLastVerifiedAt =
    row.edition_last_verified_at || row.last_checked || null;

  return {
    event_name: row.event_name,
    sport: row.sport,
    date: row.date,
    city: row.city,
    country: row.country,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    distance: row.distance,
    description: row.description,
    event_url: row.event_url,
    // Keep implementation provenance out of the public fallback catalog. The
    // concrete database/view remains an internal operational detail.
    data_source: "Sport Event Map event catalog",
    source_url: row.source_url,
    // Legacy CSV readers use this column for the public registration state.
    // The explicit columns below preserve verification and registration as
    // separate concepts for detail pages and future clients.
    verification_status: row.registration_status === "unknown"
      ? "unclear"
      : (row.registration_status || "unclear"),
    priority: row.priority,
    check_frequency: "",
    // This is an edition verification time from the database. It must never be
    // populated from exportedAt, updated_at or the static-page build time.
    last_checked: editionLastVerifiedAt,
    next_check: row.next_check,
    source_note: `Generated fallback export ${exportedAt}`,
    image: row.image,
    event_id: row.event_id,
    edition_id: row.edition_id,
    edition_year: row.edition_year,
    edition_slug: row.edition_slug,
    brand_slug: row.slug,
    organizer_name: row.organizer_name,
    organizer_url: row.organizer_url,
    official_url: row.official_url,
    registration_url: row.registration_url,
    registration_status: row.registration_status,
    event_status: row.event_status,
    brand_verification_status: row.brand_verification_status,
    brand_last_verified_at: row.brand_last_verified_at,
    edition_verification_status: row.edition_verification_status || row.verification_status,
    edition_last_verified_at: editionLastVerifiedAt,
    race_formats: jsonCell(publicRow(row).race_formats),
    end_date: row.end_date,
    start_time: row.start_time,
    price_min: row.price_min,
    price_max: row.price_max,
    currency: row.currency,
    participant_limit: row.participant_limit
  };
}

async function requestFreshnessGuard(url, key, editionIds) {
  const response = await fetch(`${url}/rest/v1/rpc/get_public_event_freshness_guard`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ p_edition_ids: editionIds })
  });
  if (!response.ok) {
    throw new Error(`Supabase freshness guard failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Supabase freshness guard returned malformed JSON.");
  }
}

async function requestCatalogSnapshot(url, key) {
  const response = await fetch(`${url}/rest/v1/rpc/get_public_event_catalog_snapshot`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}"
  });
  if (!response.ok) {
    throw new Error(`Consistent catalog snapshot unavailable (${response.status}); fallback files remain unchanged. Deploy the reviewed read-only snapshot migration before exporting.`);
  }
  let snapshot;
  try { snapshot = await response.json(); }
  catch { throw new Error("Catalog snapshot returned malformed JSON; fallback files remain unchanged."); }
  return assertPublicCatalogSnapshot(snapshot);
}

async function main() {
  const args = parseArgs(process.argv);
  const runtime = readPublicRuntimeConfig();
  const url = clean(process.env.SUPABASE_URL || runtime.url).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_PUBLISHABLE_KEY || runtime.key);
  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY or provide js/config.js.");
  }
  if (!args.write) throw new Error("Export is explicit: add --write and review the git diff before publishing.");
  assertDiagnosticPaths(args, ROOT);

  const snapshot = await requestCatalogSnapshot(url, key);
  const rows = snapshot.discovery;
  const archiveRows = snapshot.archive.map(row => publicRow(row, true));
  const freshnessGuard = snapshot.freshness_guard;
  assertFreshnessGuardCoverage(rows, freshnessGuard);
  const exportedAt = new Date().toISOString();
  const metrics = buildExportMetrics(rows, archiveRows, snapshot.measured_at, freshnessGuard);
  const policy = JSON.parse(
    fs.readFileSync(path.join(ROOT, "data", "catalog-release-policy.json"), "utf8")
  );

  console.log(`Fetched ${rows.length} active discovery editions and ${archiveRows.length} public archive editions from ${snapshot.measured_at}.`);
  console.log(`Freshness ${metrics.freshness_rate}%; completeness ${metrics.completeness_rate}%.`);

  writeCatalogSnapshot({
    args,
    exportedAt,
    policy,
    snapshot
  });
  console.log(`Exported ${rows.length} active discovery editions and ${archiveRows.length} public archive editions locally; no publication was performed.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  PUBLIC_CATALOG_COLUMNS,
  assertExportPolicy,
  assertFreshnessGuardCoverage,
  buildExportMetrics,
  buildCatalogArtifacts,
  evaluateExportPolicy,
  isCompleteDiscoveryRow,
  isFreshDiscoveryRow,
  mapDiscoveryRow,
  main,
  maximumAllowedDrop,
  readPublicRuntimeConfig,
  requestCatalogSnapshot,
  requestFreshnessGuard,
  sha256,
  writeCatalogSnapshot
};
