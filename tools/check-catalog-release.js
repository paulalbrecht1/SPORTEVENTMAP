const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_ROOT = path.resolve(__dirname, "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function addCheck(checks, name, passed, actual, expected) {
  checks.push({ name, passed: Boolean(passed), actual, expected });
}

function maximumAllowedDrop(reference, maximumDropPercent) {
  return Math.floor(reference * (1 - maximumDropPercent / 100));
}

function evaluateCatalogRelease(options = {}) {
  const root = path.resolve(options.root || DEFAULT_ROOT);
  const now = options.now ? new Date(options.now) : new Date();
  const dataPath = name => path.join(root, "data", name);
  const policy = readJson(dataPath("catalog-release-policy.json"));
  const manifest = readJson(dataPath("catalog-export-manifest.json"));
  const archive = readJson(dataPath("event-editions-public.json"));
  const pages = readJson(dataPath("event-pages.json"));
  const discoveryContent = fs.readFileSync(dataPath("events.csv"), "utf8");
  const archiveContent = fs.readFileSync(dataPath("event-editions-public.json"), "utf8");
  const discoveryRows = discoveryContent.split(/\r?\n/).filter(line => line.trim()).length - 1;
  const archiveRows = Array.isArray(archive.editions) ? archive.editions.length : 0;
  const pageRows = Array.isArray(pages) ? pages.length : 0;
  const exportTime = Date.parse(manifest.exported_at || "");
  const ageHours = Number.isFinite(exportTime)
    ? (now.getTime() - exportTime) / 3600000
    : Number.POSITIVE_INFINITY;
  const checks = [];

  addCheck(checks, "manifest schema", manifest.schema_version === 1, manifest.schema_version, 1);
  addCheck(checks, "export timestamp", Number.isFinite(exportTime), manifest.exported_at, "valid ISO timestamp");
  addCheck(checks, "export is not from the future",
    ageHours >= -(Number(policy.maximum_future_clock_skew_minutes) || 0) / 60,
    Number(ageHours.toFixed(2)), `>= -${policy.maximum_future_clock_skew_minutes / 60} hours`);
  addCheck(checks, "export age", ageHours <= Number(policy.maximum_export_age_hours),
    Number(ageHours.toFixed(2)), `<= ${policy.maximum_export_age_hours} hours`);
  addCheck(checks, "discovery rowcount manifest", discoveryRows === Number(manifest.metrics?.discovery_rows),
    discoveryRows, manifest.metrics?.discovery_rows);
  addCheck(checks, "archive rowcount manifest", archiveRows === Number(manifest.metrics?.archive_rows),
    archiveRows, manifest.metrics?.archive_rows);
  addCheck(checks, "static page rowcount", pageRows === archiveRows, pageRows, archiveRows);
  addCheck(checks, "archive export timestamp", archive.exported_at === manifest.exported_at,
    archive.exported_at, manifest.exported_at);
  addCheck(checks, "discovery checksum", sha256(discoveryContent) === manifest.sha256?.discovery,
    sha256(discoveryContent), manifest.sha256?.discovery);
  addCheck(checks, "archive checksum", sha256(archiveContent) === manifest.sha256?.archive,
    sha256(archiveContent), manifest.sha256?.archive);
  addCheck(checks, "minimum discovery rows", discoveryRows >= Number(policy.minimum_discovery_rows),
    discoveryRows, `>= ${policy.minimum_discovery_rows}`);
  addCheck(checks, "discovery baseline drop",
    discoveryRows >= maximumAllowedDrop(Number(policy.reference_discovery_rows), Number(policy.maximum_discovery_drop_percent)),
    discoveryRows, `>= ${maximumAllowedDrop(Number(policy.reference_discovery_rows), Number(policy.maximum_discovery_drop_percent))}`);
  addCheck(checks, "minimum archive rows", archiveRows >= Number(policy.minimum_archive_rows),
    archiveRows, `>= ${policy.minimum_archive_rows}`);
  addCheck(checks, "archive baseline drop",
    archiveRows >= maximumAllowedDrop(Number(policy.reference_archive_rows), Number(policy.maximum_archive_drop_percent)),
    archiveRows, `>= ${maximumAllowedDrop(Number(policy.reference_archive_rows), Number(policy.maximum_archive_drop_percent))}`);
  addCheck(checks, "freshness floor", Number(manifest.metrics?.freshness_rate) >= Number(policy.minimum_freshness_rate),
    Number(manifest.metrics?.freshness_rate), `>= ${policy.minimum_freshness_rate}%`);
  addCheck(checks, "completeness floor", Number(manifest.metrics?.completeness_rate) >= Number(policy.minimum_completeness_rate),
    Number(manifest.metrics?.completeness_rate), `>= ${policy.minimum_completeness_rate}%`);

  return {
    passed: checks.every(check => check.passed),
    checks,
    summary: {
      exported_at: manifest.exported_at,
      age_hours: Number(ageHours.toFixed(2)),
      discovery_rows: discoveryRows,
      archive_rows: archiveRows,
      static_pages: pageRows,
      freshness_rate: Number(manifest.metrics?.freshness_rate),
      completeness_rate: Number(manifest.metrics?.completeness_rate)
    }
  };
}

function assertCatalogRelease(options = {}) {
  const result = evaluateCatalogRelease(options);
  if (!result.passed) {
    const failures = result.checks.filter(check => !check.passed)
      .map(check => `${check.name}: ${check.actual} (expected ${check.expected})`).join("; ");
    throw new Error(`Catalog release gate failed: ${failures}`);
  }
  return result;
}

function main() {
  const result = evaluateCatalogRelease();
  result.checks.forEach(check => console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.actual} (expected ${check.expected})`));
  console.log(result.passed ? "CATALOG RELEASE READY" : "CATALOG RELEASE BLOCKED");
  if (!result.passed) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { assertCatalogRelease, evaluateCatalogRelease, maximumAllowedDrop, sha256 };
