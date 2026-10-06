import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { buildP0CompletionPlan, parseArgs, writePlan } = require("../tools/p0-completion-plan.js");
const policy = require("../data/catalog-release-policy.json");
const NOW = new Date("2026-10-06T12:00:00Z");
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(count = 193, fresh = 5) {
  const rows = Array.from({ length: count }, (_, index) => ({
    event_id: index + 1, edition_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    edition_slug: `event-${index + 1}-2027`, edition_year: 2027, event_name: `Event ${index + 1}`,
    sport: "Running", date: "2027-04-04", end_date: "2027-04-04", city: "Berlin", country: "Germany",
    latitude: 52.5, longitude: 13.4, distance: "10 km", description: "Official complete description. ".repeat(4),
    event_url: "https://example.org", source_url: "https://example.org", verification_status: "verified",
    last_checked: "2026-10-06T10:00:00Z", next_check: "2026-12-01T12:00:00Z"
  }));
  return { schema_version: 1, consistency: "single_statement", measured_at: NOW.toISOString(),
    discovery_count: count, archive_count: count, discovery: rows, archive: clone(rows),
    freshness_guard: { schema_version: 1, evaluated_at: NOW.toISOString(), requested_count: count,
      decisions: Object.fromEntries(rows.map((row, index) => [row.edition_id, index < fresh])) } };
}
const plan = snapshot => buildP0CompletionPlan({ snapshot, policy, now: NOW });
function update(snapshot, index, patch) {
  Object.assign(snapshot.discovery[index], patch);
  Object.assign(snapshot.archive[index], patch);
}

test("193/5 distinguishes 207 net additions, 215 full attestations and 8 existing reviews", () => {
  const result = plan(fixture());
  assert.equal(result.current.net_new_discovery_required, 207);
  assert.equal(result.current.full_attestations_required, 220);
  assert.equal(result.current.additional_full_attestations_required, 215);
  assert.equal(result.current.existing_reviews_if_all_additions_fresh, 8);
  assert.equal(result.current.net_new_archive_required, 781);
  assert.equal(result.current.existing_completions_if_all_additions_complete, 0);
  assert.equal(result.planning_only, true);
  assert.equal(result.data_release_complete, false);
  assert.equal(result.first_review_batch_edition_ids.length, 25);
  assert.ok(result.review_queue.every(row => row.eligibility_confirmed === false));
  assert.deepEqual(result, plan(clone(fixture())));
});

test("review arithmetic uses actual cohort above 400 and avoids rounded threshold admission", () => {
  const result = plan(fixture(1011, 556));
  assert.equal(result.current.net_new_discovery_required, 0);
  assert.equal(result.current.full_attestations_required, 557);
  assert.equal(result.current.additional_full_attestations_required, 1);
  assert.equal(result.current.existing_reviews_if_all_additions_fresh, 1);
  assert.ok(result.current_catalog_blockers.some(message => /Vollnachweise \(exakte Anzahl\) 556 \/ mindestens 557/.test(message)));
  assert.equal(result.exact_current_quality_blockers.length, 1);
});

test("rounded 45-percent completeness cannot hide one missing complete record", () => {
  const snapshot = fixture(1009, 1009);
  for (let index = 454; index < snapshot.discovery.length; index++) update(snapshot, index, { description: "" });
  const result = plan(snapshot);
  assert.equal(result.current.complete_rows, 454);
  assert.equal(result.current.complete_rows_required, 455);
  assert.equal(result.current.existing_completions_if_all_additions_complete, 1);
  assert.ok(result.current_catalog_blockers.some(message => /Vollständigkeit \(exakte Anzahl\) 454 \/ mindestens 455/.test(message)));
  assert.equal(result.exact_current_quality_blockers.length, 1);
});

test("single-statement archive and Discovery identity alignment is mandatory", () => {
  const mutations = [
    snapshot => { snapshot.discovery[1].event_id = snapshot.discovery[0].event_id; },
    snapshot => { snapshot.discovery[1].event_id = "01"; snapshot.archive[1].event_id = "01"; },
    snapshot => { snapshot.discovery[1].edition_id = snapshot.discovery[0].edition_id; },
    snapshot => { snapshot.archive[0].date = "2027-04-05"; },
    snapshot => { snapshot.discovery_count++; },
    snapshot => { snapshot.consistency = "multiple_statements"; },
    snapshot => { delete snapshot.freshness_guard.decisions[snapshot.discovery[0].edition_id]; },
    snapshot => { snapshot.freshness_guard.decisions[snapshot.discovery[0].edition_id] = "true"; },
    snapshot => { snapshot.discovery[0] = null; }
  ];
  for (const mutate of mutations) {
    const snapshot = fixture(); mutate(snapshot);
    assert.throws(() => plan(snapshot));
  }
});

test("an old snapshot is rejected unless explicitly replayed at its original measurement", () => {
  const snapshot = fixture(), later = new Date(NOW.getTime() + 6 * 60000);
  assert.throws(() => buildP0CompletionPlan({ snapshot, policy, now: later }), /older than five minutes/);
  const replay = buildP0CompletionPlan({ snapshot, policy, now: later, historicalReplay: true });
  assert.equal(replay.measurement_mode, "replay_of_original_read_only_snapshot");
  assert.equal(replay.evaluated_at, NOW.toISOString());
  assert.equal(replay.current.valid_full_attestations, 5);
  assert.equal(replay.data_release_complete, false);
  assert.throws(() => buildP0CompletionPlan({ snapshot, policy }), /valid current measurement time/);
});

test("7/14/30-day projections remove known expiries and dates, include a running edition through its end day", () => {
  const snapshot = fixture(6, 3);
  update(snapshot, 0, { next_check: "2026-10-13T12:00:00Z" });
  update(snapshot, 1, { date: "2026-10-07", end_date: "2026-10-07" });
  update(snapshot, 2, { next_check: "2026-10-21T12:00:00Z" });
  update(snapshot, 3, { date: "2026-10-12", end_date: "2026-10-13" });
  update(snapshot, 4, { date: "2026-10-25", end_date: "2026-10-25" });
  const result = plan(snapshot), [seven, fourteen, thirty] = result.projections;
  assert.deepEqual(result.projections.map(row => row.days), [7, 14, 30]);
  assert.equal(seven.dated_departures, 1);
  assert.equal(seven.initial_cohort_remaining_rows, 5);
  assert.equal(seven.known_attestation_expiries_among_remaining, 1);
  assert.equal(seven.retained_initial_cohort_attestations_upper_bound, 1);
  assert.equal(fourteen.dated_departures, 2);
  assert.equal(fourteen.retained_initial_cohort_attestations_upper_bound, 1);
  assert.equal(thirty.dated_departures, 3);
  assert.equal(thirty.retained_initial_cohort_attestations_upper_bound, 0);
  assert.equal(thirty.net_new_discovery_required_upper_bound_without_successor_takeover, 397);
  assert.ok(result.projections.every(row => row.projection_only));
  assert.equal(result.reverification_queue.length, 2);
});

test("authoritative false decisions and expired next_check never count as valid attestations", () => {
  const snapshot = fixture(3, 2);
  update(snapshot, 0, { next_check: NOW.toISOString() });
  const result = plan(snapshot);
  assert.equal(result.current.valid_full_attestations, 1);
  assert.equal(result.review_queue.length, 2);
  assert.ok(result.review_queue.some(row => row.edition_id === snapshot.discovery[2].edition_id));
});

test("unknown dates stay in the denominator while invalid end dates are rejected", () => {
  const snapshot = fixture(3, 0);
  update(snapshot, 0, { date: null, end_date: null });
  const result = plan(snapshot);
  assert.equal(result.current.discovery_rows, 3);
  assert.equal(result.projections[2].unknown_date_rows, 1);
  assert.equal(result.projections[2].initial_cohort_remaining_rows, 3);
  for (const end_date of ["2027-02-30", "2027-04-03", "garbage"]) {
    const invalid = fixture(2, 0); update(invalid, 0, { end_date });
    assert.throws(() => plan(invalid), /Invalid edition end date/);
  }
  const unknownStart = fixture(2, 0);
  update(unknownStart, 0, { date: null, end_date: "garbage" });
  assert.throws(() => plan(unknownStart), /Invalid edition end date/);
});

test("retention of initial editions exposes published successors without predicting a lost identity", () => {
  const snapshot = fixture(3, 1);
  update(snapshot, 0, { date: "2026-10-07", end_date: "2026-10-07" });
  const successor = { ...snapshot.archive[0],
    edition_id: "00000000-0000-4000-8000-000000000009", edition_slug: "event-1-2027",
    edition_year: 2027, date: "2027-04-04", end_date: "2027-04-04",
    discovery_status: "active", event_status: "scheduled" };
  snapshot.archive[0].edition_slug = "event-1-2026";
  snapshot.discovery[0].edition_slug = "event-1-2026";
  snapshot.archive.push(successor); snapshot.archive_count++;
  const result = plan(snapshot), seven = result.projections[0];
  assert.equal(seven.projection_kind, "initial_discovery_cohort_retention");
  assert.equal(seven.initial_cohort_remaining_rows, 2);
  assert.equal(seven.total_future_discovery_not_measured, true);
  assert.equal(seven.net_addition_demand_classification, "upper_bound_if_no_published_successors_take_over");
  assert.deepEqual(seven.published_successor_edition_ids_by_event, { "1": [successor.edition_id] });
  assert.equal(seven.successor_freshness_not_measured, true);
  assert.equal(seven.retained_initial_cohort_attestations_upper_bound, 0);
  assert.ok(!("discovery_rows" in seven));
  assert.ok(!("valid_full_attestations" in seven));
});

test("review order favors complete retained German entries and retains explicit urgent work", () => {
  const snapshot = fixture(5, 0);
  update(snapshot, 0, { country: "France" });
  update(snapshot, 1, { date: "2026-10-08", end_date: "2026-10-08" });
  update(snapshot, 2, { description: "" });
  update(snapshot, 4, { date: "2026-11-20", end_date: "2026-11-20" });
  const result = plan(snapshot);
  assert.deepEqual(result.review_queue.map(row => row.event_id), [5, 4, 2, 3, 1]);
  assert.deepEqual(result.urgent_review_edition_ids, [snapshot.discovery[1].edition_id]);
  assert.equal(result.review_queue.find(row => row.event_id === 3).action, "correct_missing_facts_then_review_all_14_fields");
});

test("policy requirements use effective baseline floors without silently coercing missing values", () => {
  const custom = { ...policy, minimum_discovery_rows: 100, reference_discovery_rows: 500,
    maximum_discovery_drop_percent: 10 };
  const result = buildP0CompletionPlan({ snapshot: fixture(), policy: custom, now: NOW });
  assert.equal(result.requirements.discovery_rows, 450);
  for (const value of [null, "55", -1, 101, undefined]) {
    assert.throws(() => buildP0CompletionPlan({ snapshot: fixture(), policy: { ...policy, minimum_freshness_rate: value }, now: NOW }), /Invalid release policy/);
  }
});

test("CLI requires explicit snapshot/replay and rejects missing, duplicate and unknown flags", () => {
  assert.deepEqual(parseArgs(["--snapshot", "snapshot.json", "--at-snapshot-time", "--out", "exports/plan.json"]),
    { snapshot: "snapshot.json", historicalReplay: true, out: "exports/plan.json" });
  for (const args of [[], ["--snapshot"], ["--snapshot", "--out", "plan.json"],
    ["--snapshot", "one", "--snapshot", "two"], ["--snapshot", "one", "--skip-guards"],
    ["--snapshot", "one", "--at-snapshot-time", "--at-snapshot-time"]]) assert.throws(() => parseArgs(args));
});

test("private report output refuses overwrites and linked or lexical escapes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sem-p0-completion-"));
  try {
    const exportsDir = path.join(root, "exports"); fs.mkdirSync(exportsDir);
    const target = path.join(exportsDir, "batch", "plan.json");
    writePlan(target, "original report\n", root);
    assert.equal(fs.readFileSync(target, "utf8"), "original report\n");
    assert.throws(() => writePlan(target, "replacement", root), /EEXIST/);
    assert.throws(() => writePlan(path.join(root, "outside.json"), "outside", root), /private exports/);
    assert.equal(fs.readFileSync(target, "utf8"), "original report\n");
    const outsideDir = path.join(root, "external"); fs.mkdirSync(outsideDir);
    const link = path.join(exportsDir, "link");
    fs.symlinkSync(outsideDir, link, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => writePlan(path.join(link, "nested", "plan.json"), "outside", root), /escapes private exports/);
    assert.deepEqual(fs.readdirSync(outsideDir), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
