const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const COLUMNS = [
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
    write: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = path.resolve(argv[++index]);
    if (argv[index] === "--archive-out") args.archiveOut = path.resolve(argv[++index]);
    if (argv[index] === "--manifest-out") args.manifestOut = path.resolve(argv[++index]);
    if (argv[index] === "--write") args.write = true;
  }
  return args;
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

function isFreshDiscoveryRow(row, exportedAt) {
  const nextCheck = Date.parse(clean(row.next_check));

  return clean(row.verification_status).toLowerCase() === "verified" &&
    Boolean(clean(row.last_checked).trim()) &&
    Number.isFinite(nextCheck) &&
    nextCheck > Date.parse(exportedAt) &&
    row.needs_review !== true;
}

function percentage(numerator, denominator) {
  return denominator > 0
    ? Number(((numerator / denominator) * 100).toFixed(2))
    : 0;
}

function buildExportMetrics(rows, archiveRows, exportedAt) {
  const freshRows = rows.filter(row => isFreshDiscoveryRow(row, exportedAt));
  const completeRows = rows.filter(isCompleteDiscoveryRow);

  return {
    discovery_rows: rows.length,
    archive_rows: archiveRows.length,
    fresh_rows: freshRows.length,
    freshness_rate: percentage(freshRows.length, rows.length),
    complete_rows: completeRows.length,
    completeness_rate: percentage(completeRows.length, rows.length),
    review_required_rows: rows.length - freshRows.length
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
    data_source: "Supabase public_event_discovery export",
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

  const exportedAt = new Date().toISOString();
  const mapped = rows.map(row => mapDiscoveryRow(row, exportedAt));
  const output = [COLUMNS.join(";"), ...mapped.map(row => COLUMNS.map(column => csvCell(row[column])).join(";"))].join("\n") + "\n";
  const archiveOutput = `${JSON.stringify({ exported_at: exportedAt, editions: archiveRows }, null, 2)}\n`;
  const metrics = buildExportMetrics(rows, archiveRows, exportedAt);
  const manifestOutput = `${JSON.stringify({
    schema_version: 1,
    exported_at: exportedAt,
    sources: {
      discovery: "public_event_discovery",
      archive: "public_event_archive"
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
  console.log(`Exported ${mapped.length} active discovery editions and ${archiveRows.length} public archive editions.`);
  console.log(`Freshness ${metrics.freshness_rate}%; completeness ${metrics.completeness_rate}%.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildExportMetrics,
  isCompleteDiscoveryRow,
  isFreshDiscoveryRow,
  mapDiscoveryRow,
  main,
  percentage,
  readPublicRuntimeConfig,
  sha256
};
