import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  candidateId,
  createReport,
  findDuplicateCandidates,
  previousResolutions,
  sha256
} = require("../tools/find-duplicate-candidates.js");
const {
  evaluateDataQualityRelease
} = require("../tools/check-data-quality-release.js");

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "data-quality-release-"));
const dataPath = path.join(root, "data");
const reviewPath = path.join(dataPath, "review");
const reportsPath = path.join(root, "reports");
fs.mkdirSync(reviewPath, { recursive: true });
fs.mkdirSync(reportsPath, { recursive: true });

function event(overrides) {
  return {
    event_name: "Example Event",
    date: "01.01.2027",
    city: "Berlin",
    country: "Germany",
    latitude: "52.52",
    longitude: "13.405",
    event_url: "https://example.test/event",
    edition_id: "default-edition",
    ...overrides
  };
}

function findPair(candidates, firstId, secondId) {
  const expected = new Set([firstId, secondId]);
  return candidates.find(candidate => {
    const ids = new Set([candidate.first.edition_id, candidate.second.edition_id]);
    return ids.size === expected.size && [...expected].every(id => ids.has(id));
  });
}

function reasonCodes(candidate) {
  return candidate?.reasons.map(reason => reason.code) || [];
}

try {
  const sameUrlFirst = event({ edition_id: "url-a", event_name: "Alpha Run", event_url: "https://race.test/alpha/" });
  const sameUrlSecond = event({ edition_id: "url-b", event_name: "Beta Run", city: "Potsdam", event_url: "http://www.race.test/alpha" });
  const nearbyFirst = event({ edition_id: "near-a", event_name: "10 Teiche Marathon", city: "Hahnenklee", latitude: "51.8602508", longitude: "10.3384485", event_url: "https://a.test" });
  const nearbySecond = event({ edition_id: "near-b", event_name: "10-Teiche-Marathon Goslar", city: "Goslar", latitude: "51.9059936", longitude: "10.4266284", event_url: "https://b.test" });
  const prefixFirst = event({ edition_id: "prefix-a", event_name: "Einstein Marathon", city: "Ulm", date: "27.09.2026", latitude: "48.398", longitude: "9.991", event_url: "https://c.test" });
  const prefixSecond = event({ edition_id: "prefix-b", event_name: "Einstein-Marathon Ulm", city: "Ulm", date: "22.09.2026", latitude: "48.398", longitude: "9.991", event_url: "https://d.test" });
  const coordinateFirst = event({ edition_id: "coord-a", event_name: "wep-Strom Lauf", city: "Hückelhoven", date: "13.09.2026", latitude: "51.0552368", longitude: "6.2247322", event_url: "https://e.test" });
  const coordinateSecond = event({ edition_id: "coord-b", event_name: "Weplauf Hückelhoven", city: "Hückelhoven", date: "13.09.2026", latitude: "51.0552368", longitude: "6.2247322", event_url: "https://f.test" });
  const cityCenterFirst = event({ edition_id: "center-a", event_name: "Campus Run Berlin", date: "03.03.2027", event_url: "https://g.test" });
  const cityCenterSecond = event({ edition_id: "center-b", event_name: "Firmenstaffel Berlin", date: "03.03.2027", event_url: "https://h.test" });
  const detectionEvents = [
    sameUrlFirst, sameUrlSecond, nearbyFirst, nearbySecond,
    prefixFirst, prefixSecond, coordinateFirst, coordinateSecond,
    cityCenterFirst, cityCenterSecond
  ];
  const candidates = findDuplicateCandidates(detectionEvents);

  assert.ok(reasonCodes(findPair(candidates, "url-a", "url-b")).includes("same_url_same_date"));
  assert.ok(reasonCodes(findPair(candidates, "near-a", "near-b")).includes("similar_name_nearby_same_date"));
  assert.ok(reasonCodes(findPair(candidates, "prefix-a", "prefix-b")).includes("similar_or_prefix_name_same_city_near_date"));
  assert.ok(reasonCodes(findPair(candidates, "coord-a", "coord-b")).includes("same_coordinates_date_with_name_signal"));
  assert.equal(findPair(candidates, "center-a", "center-b"), undefined);
  assert.equal(candidateId(sameUrlFirst, sameUrlSecond), candidateId(sameUrlSecond, sameUrlFirst));

  const mixedDateFormats = findDuplicateCandidates([
    { ...sameUrlFirst, date: "01.01.2027" },
    { ...sameUrlSecond, date: "2027-01-01" }
  ]);
  const mixedDateCandidate = findPair(mixedDateFormats, "url-a", "url-b");
  assert.ok(reasonCodes(mixedDateCandidate).includes("same_url_same_date"));
  assert.equal(mixedDateCandidate.release_blocking, true);

  const reviewedUrlCandidate = {
    ...findPair(candidates, "url-a", "url-b"),
    resolution: {
      status: "not_duplicate",
      reviewed_at: "2026-09-04T10:05:00.000Z",
      note: "Official sources confirm distinct events."
    }
  };
  const preserved = findDuplicateCandidates([sameUrlFirst, sameUrlSecond], {
    previousResolutions: previousResolutions({ candidates: [reviewedUrlCandidate] })
  });
  assert.equal(preserved[0].resolution.status, "not_duplicate");
  const changedEvidence = findDuplicateCandidates([
    sameUrlFirst,
    { ...sameUrlSecond, date: "02.01.2027" }
  ], {
    previousResolutions: previousResolutions({ candidates: [reviewedUrlCandidate] })
  });
  assert.equal(changedEvidence[0].resolution.status, "unresolved");

  const changedUrlEvidence = findDuplicateCandidates([
    { ...sameUrlFirst, event_url: "https://other-race.test/shared" },
    { ...sameUrlSecond, event_url: "https://other-race.test/shared" }
  ], {
    previousResolutions: previousResolutions({ candidates: [reviewedUrlCandidate] })
  });
  assert.equal(changedUrlEvidence[0].reasons[0].code, "same_url_same_date");
  assert.equal(changedUrlEvidence[0].resolution.status, "unresolved");

  const exportedAt = "2026-09-04T10:00:00.000Z";
  const generatedAt = "2026-09-04T10:05:00.000Z";
  const now = "2026-09-04T11:00:00.000Z";
  const csv = [
    "event_name;date;city;country;latitude;longitude;event_url;edition_id",
    "Clean Event;01.01.2027;Berlin;Germany;52.52;13.405;https://example.test/clean;clean-edition",
    ""
  ].join("\n");
  const eventsPath = path.join(dataPath, "events.csv");
  const duplicatePath = path.join(reviewPath, "duplicate-candidates.json");
  const datePath = path.join(reportsPath, "event-date-audit.json");
  const geoPath = path.join(reportsPath, "event-geo-audit.json");
  fs.writeFileSync(eventsPath, csv);
  fs.writeFileSync(path.join(dataPath, "catalog-export-manifest.json"), JSON.stringify({ exported_at: exportedAt }));

  const cleanDuplicateReport = {
    schema_version: 2,
    generated_at: generatedAt,
    input_sha256: sha256(Buffer.from(csv)),
    events_checked: 1,
    exact_duplicates: 0,
    release_blocking_candidates: 0,
    unresolved_release_blocking_candidates: 0,
    candidates: []
  };
  const cleanGeoEvent = {
    event_id: "clean-edition",
    event_name: "Clean Event",
    severity: "clean",
    issues: []
  };
  const cleanGeoReport = {
    schema_version: 2,
    generated_at: generatedAt,
    input_sha256: sha256(Buffer.from(csv)),
    total_events: 1,
    summary: { critical: 0 },
    events: [cleanGeoEvent]
  };
  const cleanDateEvent = {
    event_id: "clean-edition",
    event_name: "Clean Event",
    severity: "clean",
    issues: []
  };
  const cleanDateReport = {
    schema_version: 2,
    generated_at: generatedAt,
    input_sha256: sha256(Buffer.from(csv)),
    total_events: 1,
    summary: { critical: 0 },
    events: [cleanDateEvent]
  };

  const writeReports = (
    duplicateReport = cleanDuplicateReport,
    geoReport = cleanGeoReport,
    dateReport = cleanDateReport
  ) => {
    fs.writeFileSync(duplicatePath, JSON.stringify(duplicateReport));
    fs.writeFileSync(datePath, JSON.stringify(dateReport));
    fs.writeFileSync(geoPath, JSON.stringify(geoReport));
  };

  writeReports();
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, true);

  writeReports({ ...cleanDuplicateReport, input_sha256: "stale" });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, false);

  writeReports({ ...cleanDuplicateReport, generated_at: "2026-09-04T09:59:59.000Z" });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, false);

  writeReports(cleanDuplicateReport, cleanGeoReport, {
    ...cleanDateReport,
    input_sha256: "stale"
  });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, false);

  writeReports(cleanDuplicateReport, cleanGeoReport, {
    ...cleanDateReport,
    summary: { critical: 1 },
    events: [{ ...cleanDateEvent, severity: "critical", issues: ["invalid_date"] }]
  });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, false);

  writeReports(cleanDuplicateReport, cleanGeoReport, {
    ...cleanDateReport,
    events: [{ ...cleanDateEvent, severity: "warning", issues: ["date_not_parseable"] }]
  });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, false);

  const exactCandidate = {
    candidate_id: "dup_exact",
    classification: "exact_duplicate",
    release_blocking: true,
    confidence: 100,
    reasons: [{ code: "exact_name_date_city" }],
    resolution: { status: "not_duplicate", reviewed_at: generatedAt, note: "Reviewed" }
  };
  writeReports({
    ...cleanDuplicateReport,
    exact_duplicates: 1,
    release_blocking_candidates: 1,
    unresolved_release_blocking_candidates: 0,
    candidates: [exactCandidate]
  });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, false);

  const unresolvedExactCandidate = {
    ...exactCandidate,
    resolution: { status: "unresolved", reviewed_at: "", note: "" }
  };
  writeReports({
    ...cleanDuplicateReport,
    exact_duplicates: 1,
    release_blocking_candidates: 1,
    unresolved_release_blocking_candidates: 1,
    candidates: [unresolvedExactCandidate]
  });
  const unresolvedExactResult = evaluateDataQualityRelease({ root, now });
  assert.equal(unresolvedExactResult.passed, false);
  assert.equal(unresolvedExactResult.summary.unresolved_release_blocking_candidates, 1);

  const unresolvedCandidate = {
    ...exactCandidate,
    candidate_id: "dup_likely",
    classification: "high_confidence_duplicate",
    reasons: [{ code: "same_url_same_date" }],
    resolution: { status: "unresolved", reviewed_at: "", note: "" }
  };
  writeReports({
    ...cleanDuplicateReport,
    release_blocking_candidates: 1,
    unresolved_release_blocking_candidates: 1,
    candidates: [unresolvedCandidate]
  });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, false);

  const resolvedCandidate = {
    ...unresolvedCandidate,
    resolution: { status: "not_duplicate", reviewed_at: generatedAt, note: "Distinct races confirmed from official sources." }
  };
  writeReports({
    ...cleanDuplicateReport,
    release_blocking_candidates: 1,
    unresolved_release_blocking_candidates: 0,
    candidates: [resolvedCandidate]
  });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, true);

  writeReports(cleanDuplicateReport, {
    ...cleanGeoReport,
    events: [{ ...cleanGeoEvent, severity: "warning", issues: ["coordinates_outside_country_bbox"] }]
  });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, false);

  writeReports(cleanDuplicateReport, {
    ...cleanGeoReport,
    summary: { critical: 1 },
    events: [{ ...cleanGeoEvent, severity: "critical", issues: ["coordinates_missing"] }]
  });
  assert.equal(evaluateDataQualityRelease({ root, now }).passed, false);

  writeReports();
  const generatedDuplicatePath = path.join(reviewPath, "generated-duplicates.json");
  const generatedDuplicate = createReport(eventsPath, generatedDuplicatePath);
  assert.equal(generatedDuplicate.input_sha256, sha256(Buffer.from(csv)));
  assert.equal(generatedDuplicate.schema_version, 2);

  const generatedDatePath = path.join(reportsPath, "generated-dates.json");
  const dateResult = spawnSync(process.execPath, [
    path.join(repositoryRoot, "tools", "audit-event-dates.js"),
    "--input", eventsPath,
    "--json", generatedDatePath,
    "--csv", path.join(reportsPath, "generated-dates.csv"),
    "--md", path.join(reportsPath, "generated-dates.md")
  ], { encoding: "utf8" });
  assert.equal(dateResult.status, 0, dateResult.stderr || dateResult.stdout);
  const generatedDate = JSON.parse(fs.readFileSync(generatedDatePath, "utf8"));
  assert.equal(generatedDate.input_sha256, sha256(Buffer.from(csv)));
  assert.equal(generatedDate.schema_version, 2);
  assert.equal(generatedDate.total_events, 1);

  const generatedGeoPath = path.join(reportsPath, "generated-geo.json");
  const geoResult = spawnSync(process.execPath, [
    path.join(repositoryRoot, "tools", "audit-event-geo.js"),
    "--input", eventsPath,
    "--cache", path.join(root, "geo-cache.json"),
    "--json", generatedGeoPath,
    "--csv", path.join(reportsPath, "generated-geo.csv"),
    "--md", path.join(reportsPath, "generated-geo.md"),
    "--fixes", path.join(reportsPath, "generated-geo-fixes.json")
  ], { encoding: "utf8" });
  assert.equal(geoResult.status, 0, geoResult.stderr || geoResult.stdout);
  const generatedGeo = JSON.parse(fs.readFileSync(generatedGeoPath, "utf8"));
  assert.equal(generatedGeo.input_sha256, sha256(Buffer.from(csv)));
  assert.equal(generatedGeo.schema_version, 2);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("Data quality release gate validates bound audits and blocking findings.");
