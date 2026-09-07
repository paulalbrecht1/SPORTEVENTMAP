const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { parseCsv } = require("./event-table-utils");
const { hasCompletedResolution } = require("./find-duplicate-candidates");

const DEFAULT_ROOT = path.resolve(__dirname, "..");
const MAXIMUM_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CRITICAL_DATE_ISSUES = new Set([
  "date_missing",
  "date_not_parseable"
]);
const CRITICAL_GEO_ISSUES = new Set([
  "coordinates_missing",
  "coordinates_not_numeric",
  "coordinates_out_of_range",
  "coordinates_zero_zero",
  "coordinates_likely_swapped"
]);
const RELEASE_BLOCKING_DUPLICATE_REASONS = new Set([
  "exact_name_date_city",
  "same_url_same_date",
  "similar_name_nearby_same_date",
  "similar_or_prefix_name_same_city_near_date",
  "same_coordinates_date_with_name_signal"
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function addCheck(checks, name, passed, actual, expected) {
  checks.push({ name, passed: Boolean(passed), actual, expected });
}

function reportTimestampChecks(checks, label, report, exportTime, nowTime) {
  const generatedAt = Date.parse(report?.generated_at || "");
  addCheck(
    checks,
    `${label} generated_at`,
    Number.isFinite(generatedAt),
    report?.generated_at || "missing",
    "valid ISO timestamp"
  );
  addCheck(
    checks,
    `${label} generated after export`,
    Number.isFinite(generatedAt) && Number.isFinite(exportTime) && generatedAt >= exportTime,
    report?.generated_at || "missing",
    "at or after catalog export"
  );
  addCheck(
    checks,
    `${label} timestamp is plausible`,
    Number.isFinite(generatedAt) && generatedAt <= nowTime + MAXIMUM_FUTURE_CLOCK_SKEW_MS,
    report?.generated_at || "missing",
    "not more than 5 minutes in the future"
  );
}

function candidateHasReason(candidate, reasonCode) {
  return Array.isArray(candidate?.reasons) &&
    candidate.reasons.some(reason => reason?.code === reasonCode);
}

function isExactDuplicate(candidate) {
  return candidate?.classification === "exact_duplicate" ||
    candidateHasReason(candidate, "exact_name_date_city");
}

function isReleaseBlockingDuplicate(candidate) {
  return candidate?.release_blocking === true ||
    (Array.isArray(candidate?.reasons) && candidate.reasons.some(reason =>
      RELEASE_BLOCKING_DUPLICATE_REASONS.has(reason?.code)
    ));
}

function dateIssues(event) {
  return Array.isArray(event?.issues) ? event.issues : [];
}

function isCriticalDateEvent(event) {
  return event?.severity === "critical" ||
    dateIssues(event).some(issue => CRITICAL_DATE_ISSUES.has(issue));
}

function geoIssues(event) {
  return Array.isArray(event?.issues) ? event.issues : [];
}

function isCriticalGeoEvent(event) {
  return event?.severity === "critical" ||
    geoIssues(event).some(issue => CRITICAL_GEO_ISSUES.has(issue));
}

function evaluateDataQualityRelease(options = {}) {
  const root = path.resolve(options.root || DEFAULT_ROOT);
  const now = options.now ? new Date(options.now) : new Date();
  const nowTime = now.getTime();
  const eventsPath = path.join(root, "data", "events.csv");
  const manifestPath = path.join(root, "data", "catalog-export-manifest.json");
  const duplicatePath = path.join(root, "data", "review", "duplicate-candidates.json");
  const datePath = path.join(root, "reports", "event-date-audit.json");
  const geoPath = path.join(root, "reports", "event-geo-audit.json");
  const checks = [];

  let eventsBuffer = null;
  try {
    eventsBuffer = fs.readFileSync(eventsPath);
  } catch (_error) {
    eventsBuffer = null;
  }

  const manifest = readJson(manifestPath);
  const duplicateReport = readJson(duplicatePath);
  const dateReport = readJson(datePath);
  const geoReport = readJson(geoPath);
  const events = eventsBuffer ? parseCsv(eventsBuffer.toString("utf8")) : [];
  const inputSha256 = eventsBuffer ? sha256(eventsBuffer) : "";
  const exportTime = Date.parse(manifest?.exported_at || "");

  addCheck(checks, "events input exists", Boolean(eventsBuffer), Boolean(eventsBuffer), true);
  addCheck(
    checks,
    "catalog export timestamp",
    Number.isFinite(exportTime),
    manifest?.exported_at || "missing",
    "valid ISO timestamp"
  );

  addCheck(checks, "duplicate report exists", Boolean(duplicateReport), Boolean(duplicateReport), true);
  addCheck(
    checks,
    "duplicate report schema",
    Number(duplicateReport?.schema_version) >= 2,
    duplicateReport?.schema_version || "missing",
    ">= 2"
  );
  addCheck(
    checks,
    "duplicate report input checksum",
    Boolean(inputSha256) && duplicateReport?.input_sha256 === inputSha256,
    duplicateReport?.input_sha256 || "missing",
    inputSha256 || "events.csv unavailable"
  );
  addCheck(
    checks,
    "duplicate report event count",
    Number(duplicateReport?.events_checked) === events.length,
    duplicateReport?.events_checked ?? "missing",
    events.length
  );
  reportTimestampChecks(checks, "duplicate report", duplicateReport, exportTime, nowTime);

  const candidates = Array.isArray(duplicateReport?.candidates)
    ? duplicateReport.candidates
    : [];
  const candidateIds = candidates.map(candidate => candidate?.candidate_id).filter(Boolean);
  const validCandidates = candidates.every(candidate =>
    typeof candidate?.candidate_id === "string" &&
    typeof candidate?.release_blocking === "boolean" &&
    Number.isFinite(Number(candidate?.confidence)) &&
    Array.isArray(candidate?.reasons) &&
    candidate.reasons.length > 0
  );
  const exactDuplicates = candidates.filter(isExactDuplicate);
  const unresolvedBlocking = candidates.filter(candidate =>
    isReleaseBlockingDuplicate(candidate) &&
    !isExactDuplicate(candidate) &&
    !hasCompletedResolution(candidate)
  );
  const releaseBlockingCandidates = candidates.filter(isReleaseBlockingDuplicate);

  addCheck(
    checks,
    "duplicate candidate schema",
    Array.isArray(duplicateReport?.candidates) && validCandidates,
    validCandidates ? candidates.length : "malformed candidate",
    "valid candidates array"
  );
  addCheck(
    checks,
    "duplicate candidate ids unique",
    candidateIds.length === new Set(candidateIds).size,
    candidateIds.length - new Set(candidateIds).size,
    0
  );
  addCheck(
    checks,
    "exact duplicate candidates",
    exactDuplicates.length === 0,
    exactDuplicates.map(candidate => candidate.candidate_id).join(", ") || 0,
    0
  );
  addCheck(
    checks,
    "unresolved release-blocking duplicate candidates",
    unresolvedBlocking.length === 0,
    unresolvedBlocking.map(candidate => candidate.candidate_id).join(", ") || 0,
    0
  );
  addCheck(
    checks,
    "duplicate summary consistency",
    Number(duplicateReport?.exact_duplicates) === exactDuplicates.length &&
      Number(duplicateReport?.release_blocking_candidates) ===
        releaseBlockingCandidates.length &&
      Number(duplicateReport?.unresolved_release_blocking_candidates) ===
        releaseBlockingCandidates.filter(candidate => !hasCompletedResolution(candidate)).length,
    `${duplicateReport?.exact_duplicates ?? "missing"}/${duplicateReport?.release_blocking_candidates ?? "missing"}/${duplicateReport?.unresolved_release_blocking_candidates ?? "missing"}`,
    `${exactDuplicates.length}/${releaseBlockingCandidates.length}/${releaseBlockingCandidates.filter(candidate => !hasCompletedResolution(candidate)).length}`
  );

  addCheck(checks, "date report exists", Boolean(dateReport), Boolean(dateReport), true);
  addCheck(
    checks,
    "date report schema",
    Number(dateReport?.schema_version) >= 2,
    dateReport?.schema_version || "missing",
    ">= 2"
  );
  addCheck(
    checks,
    "date report input checksum",
    Boolean(inputSha256) && dateReport?.input_sha256 === inputSha256,
    dateReport?.input_sha256 || "missing",
    inputSha256 || "events.csv unavailable"
  );
  addCheck(
    checks,
    "date report event count",
    Number(dateReport?.total_events) === events.length &&
      Array.isArray(dateReport?.events) && dateReport.events.length === events.length,
    `${dateReport?.total_events ?? "missing"}/${Array.isArray(dateReport?.events) ? dateReport.events.length : "missing"}`,
    `${events.length}/${events.length}`
  );
  reportTimestampChecks(checks, "date report", dateReport, exportTime, nowTime);

  const dateEvents = Array.isArray(dateReport?.events) ? dateReport.events : [];
  const criticalDateEvents = dateEvents.filter(isCriticalDateEvent);

  addCheck(
    checks,
    "critical date problems",
    criticalDateEvents.length === 0,
    criticalDateEvents.map(event => event.event_id || event.event_name).join(", ") || 0,
    0
  );
  addCheck(
    checks,
    "date summary consistency",
    Number(dateReport?.summary?.critical) === criticalDateEvents.length,
    dateReport?.summary?.critical ?? "missing",
    criticalDateEvents.length
  );

  addCheck(checks, "geo report exists", Boolean(geoReport), Boolean(geoReport), true);
  addCheck(
    checks,
    "geo report schema",
    Number(geoReport?.schema_version) >= 2,
    geoReport?.schema_version || "missing",
    ">= 2"
  );
  addCheck(
    checks,
    "geo report input checksum",
    Boolean(inputSha256) && geoReport?.input_sha256 === inputSha256,
    geoReport?.input_sha256 || "missing",
    inputSha256 || "events.csv unavailable"
  );
  addCheck(
    checks,
    "geo report event count",
    Number(geoReport?.total_events) === events.length &&
      Array.isArray(geoReport?.events) && geoReport.events.length === events.length,
    `${geoReport?.total_events ?? "missing"}/${Array.isArray(geoReport?.events) ? geoReport.events.length : "missing"}`,
    `${events.length}/${events.length}`
  );
  reportTimestampChecks(checks, "geo report", geoReport, exportTime, nowTime);

  const geoEvents = Array.isArray(geoReport?.events) ? geoReport.events : [];
  const criticalGeoEvents = geoEvents.filter(isCriticalGeoEvent);
  const outsideCountryEvents = geoEvents.filter(event =>
    geoIssues(event).includes("coordinates_outside_country_bbox")
  );

  addCheck(
    checks,
    "critical geo problems",
    criticalGeoEvents.length === 0,
    criticalGeoEvents.map(event => event.event_id || event.event_name).join(", ") || 0,
    0
  );
  addCheck(
    checks,
    "coordinates outside country bounding box",
    outsideCountryEvents.length === 0,
    outsideCountryEvents.map(event => event.event_id || event.event_name).join(", ") || 0,
    0
  );
  addCheck(
    checks,
    "geo summary consistency",
    Number(geoReport?.summary?.critical) ===
      geoEvents.filter(event => event?.severity === "critical").length,
    geoReport?.summary?.critical ?? "missing",
    geoEvents.filter(event => event?.severity === "critical").length
  );

  return {
    passed: checks.every(check => check.passed),
    checks,
    summary: {
      events: events.length,
      input_sha256: inputSha256,
      exact_duplicates: exactDuplicates.length,
      unresolved_release_blocking_candidates: releaseBlockingCandidates
        .filter(candidate => !hasCompletedResolution(candidate)).length,
      critical_date_problems: criticalDateEvents.length,
      critical_geo_problems: criticalGeoEvents.length,
      coordinates_outside_country_bbox: outsideCountryEvents.length
    }
  };
}

function assertDataQualityRelease(options = {}) {
  const result = evaluateDataQualityRelease(options);
  if (!result.passed) {
    const failures = result.checks
      .filter(check => !check.passed)
      .map(check => `${check.name}: ${check.actual} (expected ${check.expected})`)
      .join("; ");
    throw new Error(`Data quality release gate failed: ${failures}`);
  }
  return result;
}

function main() {
  const result = evaluateDataQualityRelease();
  result.checks.forEach(check => {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.actual} (expected ${check.expected})`);
  });
  console.log(result.passed ? "DATA QUALITY RELEASE READY" : "DATA QUALITY RELEASE BLOCKED");
  if (!result.passed) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  assertDataQualityRelease,
  evaluateDataQualityRelease,
  isCriticalGeoEvent,
  isCriticalDateEvent,
  isExactDuplicate,
  isReleaseBlockingDuplicate,
  sha256
};
