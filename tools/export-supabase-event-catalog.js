const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_CATALOG_COLUMNS = [
  "event_name", "sport", "date", "city", "country", "address", "latitude", "longitude",
  "distance", "description", "event_url", "data_source", "source_url", "verification_status",
  "priority", "check_frequency", "last_checked", "next_check", "source_note", "image",
  "event_id", "edition_id", "edition_year", "edition_slug", "brand_slug", "organizer_name",
  "organizer_url", "official_url", "registration_url", "registration_status", "event_status",
  "brand_verification_status", "brand_last_verified_at", "edition_verification_status",
  "edition_last_verified_at", "race_formats"
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
  archiveOutput,
  exportedAt,
  metrics,
  output,
  policy
}) {
  const policyResult = evaluateExportPolicy(metrics, policy);

  if (args.allowUnhealthy) {
    if (!policyResult.passed) {
      console.warn("WARNING Writing an explicitly allowed unhealthy diagnostic catalog snapshot.");
    }
  } else {
    assertExportPolicy(metrics, policy);
  }

  const manifestOutput = `${JSON.stringify({
    schema_version: 1,
    exported_at: exportedAt,
    sources: {
      discovery: "public_event_discovery",
      archive: "public_event_archive",
      freshness_guard: "get_public_event_freshness_guard"
    },
    sha256: {
      discovery: sha256(output),
      archive: sha256(archiveOutput)
    },
    metrics
  }, null, 2)}\n`;

  fs.writeFileSync(args.out, output, "utf8");
  fs.writeFileSync(args.archiveOut, archiveOutput, "utf8");
  fs.writeFileSync(args.manifestOut, manifestOutput, "utf8");

  return { manifestOutput, policyResult };
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

function hasUsableCoordinates(row) {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);

  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
}

function isCompleteDiscoveryRow(row) {
  return [
    row.event_name,
    row.sport,
    row.city,
    row.country,
    row.date,
    row.description,
    row.event_url,
    row.source_url
  ].every(value => Boolean(clean(value).trim())) &&
    hasUsableCoordinates(row) &&
    Boolean(clean(row.distance).trim()) &&
    clean(row.description).trim().length >= 80;
}

function isFreshDiscoveryRow(row, exportedAt, authoritativeDecision = false) {
  const nextCheck = Date.parse(clean(row.next_check));

  return clean(row.verification_status).toLowerCase() === "verified" &&
    Boolean(clean(row.last_checked).trim()) &&
    Number.isFinite(nextCheck) &&
    nextCheck > Date.parse(exportedAt) &&
    authoritativeDecision === true;
}

function percentage(numerator, denominator) {
  return denominator > 0
    ? Number(((numerator / denominator) * 100).toFixed(2))
    : 0;
}

function assertFreshnessGuardCoverage(rows, payload, now = Date.now()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Freshness guard returned no valid JSON object.");
  }
  if (payload.schema_version !== 1) {
    throw new Error(`Unsupported freshness guard schema version: ${clean(payload.schema_version) || "missing"}.`);
  }

  const evaluatedAt = Date.parse(clean(payload.evaluated_at));
  if (!Number.isFinite(evaluatedAt) || evaluatedAt < now - 300000 || evaluatedAt > now + 300000) {
    throw new Error("Freshness guard evaluation is missing or older than five minutes.");
  }

  const editionIds = rows.map(row => clean(row.edition_id).trim());
  if (editionIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error("Discovery export contains a missing or invalid edition id.");
  }
  const expectedIds = new Set(editionIds);
  if (expectedIds.size !== editionIds.length) {
    throw new Error("Discovery export contains duplicate edition ids.");
  }
  if (Number(payload.requested_count) !== expectedIds.size) {
    throw new Error("Freshness guard requested_count does not match the Discovery snapshot.");
  }

  const decisions = payload.decisions;
  if (!decisions || typeof decisions !== "object" || Array.isArray(decisions)) {
    throw new Error("Freshness guard decisions are missing or malformed.");
  }
  const decisionIds = Object.keys(decisions);
  if (decisionIds.length !== expectedIds.size ||
      decisionIds.some(id => !expectedIds.has(id)) ||
      editionIds.some(id => !Object.prototype.hasOwnProperty.call(decisions, id))) {
    throw new Error("Freshness guard decisions do not exactly match the Discovery snapshot.");
  }
  if (decisionIds.some(id => typeof decisions[id] !== "boolean")) {
    throw new Error("Freshness guard returned a non-boolean decision.");
  }

  return {
    decisions: new Map(decisionIds.map(id => [id, decisions[id]])),
    evaluatedAt: new Date(evaluatedAt).toISOString()
  };
}

function buildExportMetrics(rows, archiveRows, exportedAt, freshnessGuardPayload) {
  const guard = assertFreshnessGuardCoverage(rows, freshnessGuardPayload);
  const freshRows = rows.filter(row => isFreshDiscoveryRow(
    row,
    exportedAt,
    guard.decisions.get(clean(row.edition_id).trim())
  ));
  const completeRows = rows.filter(isCompleteDiscoveryRow);

  return {
    discovery_rows: rows.length,
    archive_rows: archiveRows.length,
    fresh_rows: freshRows.length,
    freshness_rate: percentage(freshRows.length, rows.length),
    complete_rows: completeRows.length,
    completeness_rate: percentage(completeRows.length, rows.length),
    review_required_rows: rows.length - freshRows.length,
    freshness_guard_evaluated_at: guard.evaluatedAt
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
    data_source: "Sport Event Map verified event catalog",
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
    race_formats: jsonCell(row.race_formats)
  };
}

async function requestPage(url, key, view, offset, limit) {
  const response = await fetch(`${url}/rest/v1/${view}?select=*&order=edition_slug.asc&offset=${offset}&limit=${limit}`, {
    headers: { apikey: key }
  });
  if (!response.ok) throw new Error(`Supabase export failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

async function requestAll(url, key, view) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await requestPage(url, key, view, offset, pageSize);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
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

async function main() {
  const args = parseArgs(process.argv);
  const runtime = readPublicRuntimeConfig();
  const url = clean(process.env.SUPABASE_URL || runtime.url).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_PUBLISHABLE_KEY || runtime.key);
  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY or provide js/config.js.");
  }
  if (!args.write) throw new Error("Export is explicit: add --write and review the git diff before publishing.");

  const [rows, archiveRows] = await Promise.all([
    requestAll(url, key, "public_event_discovery"),
    requestAll(url, key, "public_event_archive")
  ]);
  if (!rows.length) throw new Error("Refusing to replace the discovery fallback with an empty active catalog.");
  if (archiveRows.length < 900) throw new Error(`Refusing to replace the archive with only ${archiveRows.length} public editions.`);

  const freshnessGuard = await requestFreshnessGuard(
    url,
    key,
    rows.map(row => clean(row.edition_id).trim())
  );
  const exportedAt = new Date().toISOString();
  const mapped = rows.map(row => mapDiscoveryRow(row, exportedAt));
  const output = [PUBLIC_CATALOG_COLUMNS.join(";"), ...mapped.map(row => PUBLIC_CATALOG_COLUMNS.map(column => csvCell(row[column])).join(";"))].join("\n") + "\n";
  const archiveOutput = `${JSON.stringify({ exported_at: exportedAt, editions: archiveRows }, null, 2)}\n`;
  const metrics = buildExportMetrics(rows, archiveRows, exportedAt, freshnessGuard);
  const policy = JSON.parse(
    fs.readFileSync(path.join(ROOT, "data", "catalog-release-policy.json"), "utf8")
  );

  console.log(`Fetched ${mapped.length} active discovery editions and ${archiveRows.length} public archive editions.`);
  console.log(`Freshness ${metrics.freshness_rate}%; completeness ${metrics.completeness_rate}%.`);

  writeCatalogSnapshot({
    args,
    archiveOutput,
    exportedAt,
    metrics,
    output,
    policy
  });
  console.log(`Exported ${mapped.length} active discovery editions and ${archiveRows.length} public archive editions.`);
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
  evaluateExportPolicy,
  isCompleteDiscoveryRow,
  isFreshDiscoveryRow,
  mapDiscoveryRow,
  main,
  maximumAllowedDrop,
  percentage,
  readPublicRuntimeConfig,
  requestFreshnessGuard,
  sha256,
  writeCatalogSnapshot
};
