import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assertPublicationOutcome } = require("../js/freshness-batch-review.js");
const admin = fs.readFileSync(new URL("../js/supabase.js", import.meta.url), "utf8");
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const candidates = [uuid(1), uuid(2)];
const editions = [uuid(101), uuid(102)];
const receipt = () => ({
  requested_count: 2, approved_count: 2, approved_candidate_ids: candidates,
  published_edition_ids: editions, publication_verified: true,
  freshness: { requested_count: 2, verified_count: 2, verified_edition_ids: editions, freshness_verified: true, automatic_fact_changes: false }
});

test("publication requires exact candidate and edition receipts plus the complete nested freshness receipt", () => {
  assert.deepEqual(assertPublicationOutcome(receipt(), candidates, editions), receipt().freshness);
  const invalid = [
    {}, { approved_count: 1 }, { publication_verified: false },
    { approved_candidate_ids: [candidates[0], candidates[0]] },
    { approved_candidate_ids: [candidates[0], uuid(3)] },
    { published_edition_ids: editions.slice(0, 1) },
    { published_edition_ids: [editions[0], uuid(103)] },
    { freshness: { ...receipt().freshness, automatic_fact_changes: true } },
    { freshness: { ...receipt().freshness, verified_count: 1 } },
    { freshness: null }
  ];
  for (const patch of invalid) {
    const value = Object.keys(patch).length ? { ...receipt(), ...patch } : null;
    assert.throws(() => assertPublicationOutcome(value, candidates, editions));
  }
});

function contextFixture() {
  const futureYear = new Date().getUTCFullYear() + 1;
  const date = `${futureYear}-06-20`;
  const event = { id: 7, canonical_name: "Testlauf", event_name: "Alte Bezeichnung", status: "approved", publication_status: "published", city: "Berlin", country: "Germany", address: "Teststraße 1", latitude: "52.52000", longitude: "13.40500", sport: "Running", description: "Synthetischer Veranstaltungsstättenbeleg für einen aktuellen Lauf mit zwei verschiedenen Wettbewerben und einem gemeinsamen Ziel." };
  const candidate = { id: candidates[0], event_id: 7, source_id: uuid(301), draft_edition_id: editions[0], candidate_year: futureYear, candidate_start_date: date, candidate_status: "draft_created", validation_status: "validated", validation_reasons: [] };
  const edition = { id: editions[0], event_id: 7, generated_from_candidate_id: candidate.id, generated_from_source_id: candidate.source_id, publication_status: "draft", discovery_status: "suppressed", edition_status: "scheduled", edition_year: futureYear, start_date: date, source_url: "https://example.test/current", race_formats: [{ label: "10 km", distance_km: 10 }, { label: "5 km", distance_km: 5 }], legacy_distance: "10 km / 5 km", registration_status: "registration_open", registration_url: "https://example.test/register" };
  const source = { id: uuid(201), event_id: 7, edition_id: edition.id, source_url: edition.source_url, source_type: "official_event_website", is_active: true, crawl_status: "success", consecutive_failures: 0, last_fetched_at: new Date().toISOString(), last_change_status: "first_seen" };
  const env = { Date, dataOpsEvents: [event], dataOpsEditions: [edition], dataOpsSuccessionCandidates: [candidate], dataOpsSources: [source], sourceMonitorActiveJobs: [], sourceMonitorReviews: [], dataOpsProposals: [], dataOpsIssues: [], dataOpsAlerts: [], dataOpsFreshnessBlockingFeedback: [], editionLifecycleInbox: [{ item_id: candidate.id, metadata: { stored_values: { edition_year: futureYear - 1, distances: [{ label: "Old 42 km" }] } } }] };
  vm.createContext(env);
  vm.runInContext(admin.slice(admin.indexOf("function normalizeDataOpsEventId("), admin.indexOf("function getReviewInboxCategory(")) + "\n" + admin.slice(admin.indexOf("function getSuccessionBatchContext("), admin.indexOf("async function handleSuccessionBatchAction(")), env);
  return { env, event, edition, candidate, source, get: () => env.getSuccessionBatchContext(candidate.id) };
}

test("draft context uses the actual selected edition and all current formats, never predecessor inbox values", () => {
  const f = contextFixture();
  const context = f.get();
  assert.equal(context.eligible, true);
  assert.equal(context.storedValues.edition_year, f.edition.edition_year);
  assert.deepEqual(context.storedValues.distances, f.edition.race_formats);
  assert.equal(context.storedValues.event_name, f.event.canonical_name);
  assert.equal(Object.keys(context.storedValues).length, 14);
  assert.equal(f.env.getSuccessionInboxRows()[0].edition_id, f.edition.id);
});

test("unprepared, foreign, ambiguous or conflicted drafts cannot enter publication", () => {
  const changes = [
    f => { f.candidate.validation_status = "pending"; },
    f => { f.candidate.validation_reasons = ["manual_lock_active"]; },
    f => { f.candidate.candidate_status = "approved"; },
    f => { f.candidate.draft_edition_id = uuid(999); },
    f => { f.edition.generated_from_candidate_id = uuid(999); },
    f => { f.edition.generated_from_source_id = uuid(999); },
    f => { f.env.dataOpsEditions.push({ ...f.edition, id: uuid(999), publication_status: "published", discovery_status: "active" }); },
    f => { f.edition.event_id = 8; },
    f => { f.edition.publication_status = "published"; },
    f => { f.edition.discovery_status = "active"; },
    f => { f.edition.start_date = "2020-01-01"; },
    f => { f.source.edition_id = null; },
    f => { f.source.event_id = 8; },
    f => { f.source.source_type = "organizer_calendar"; },
    f => { f.source.crawl_status = "pending"; },
    f => { f.source.last_change_status = "changed"; },
    f => { f.source.last_fetched_at = null; },
    f => { f.env.dataOpsSources.push({ ...f.source, id: uuid(202) }); },
    f => { f.env.sourceMonitorActiveJobs.push({ source_id: f.source.id, status: "retry_scheduled" }); },
    f => { f.env.sourceMonitorReviews.push({ event_id: 7, status: "open" }); },
    f => { f.env.dataOpsProposals.push({ edition_id: f.edition.id, proposal_status: "pending" }); },
    f => { f.env.dataOpsIssues.push({ event_id: 7, status: "open", severity: "critical" }); },
    f => { f.env.dataOpsAlerts.push({ source_id: f.source.id, alert_status: "open", severity: "error" }); },
    f => { f.env.dataOpsFreshnessBlockingFeedback.push({ event_id: "0007", category: "incorrect_event_data", status: "planned" }); },
    f => { f.event.description = "Incomplete"; }
  ];
  for (const change of changes) { const f = contextFixture(); change(f); assert.equal(f.get().eligible, false, String(change)); }
});

test("source, candidate and draft mutations invalidate the original context revision", () => {
  for (const mutate of [f => { f.source.last_fetched_at = "2026-09-08T09:00:00Z"; }, f => { f.candidate.crawl_result_id = uuid(333); }, f => { f.edition.registration_status = "registration_closed"; }]) {
    const f = contextFixture(); const before = f.get().revision; mutate(f); assert.notEqual(f.get().revision, before);
  }
});

test("publication handles only its own bound review task; every other conflict and ordinary freshness stay blocked", () => {
  const f = contextFixture();
  const task = { id: uuid(501), fingerprint: `succession:${f.candidate.id}`, task_type: "new_edition_candidate", status: "open", event_id: f.event.id, source_id: f.candidate.source_id, edition_id: null };
  f.env.sourceMonitorReviews.push(task);
  assert.equal(f.get().eligible, true);
  assert.equal(f.env.hasFreshnessOpenReviewConflict({ event_id: f.event.id, edition_id: f.edition.id }, f.source), true);
  task.edition_id = f.edition.id;
  assert.equal(f.get().eligible, true);
  for (const patch of [{ fingerprint: `succession:${uuid(999)}` }, { task_type: "content_changed" }, { source_id: f.source.id }]) {
    const original = { ...task };
    Object.assign(task, patch);
    assert.equal(f.get().eligible, false, JSON.stringify(patch));
    Object.assign(task, original);
  }
  f.env.sourceMonitorReviews.push({ ...task, id: uuid(502), fingerprint: "unrelated-review" });
  assert.equal(f.get().eligible, false);
});

test("legacy lifecycle approval cannot publish a candidate or partly approve mixed selections", async () => {
  const env = { supabaseClient: { rpc: () => { throw new Error("Unexpected RPC"); } } };
  vm.createContext(env);
  vm.runInContext(admin.slice(admin.indexOf("async function approveEditionLifecycleItems("), admin.indexOf("async function handleEditionLifecycleAction(")), env);
  await assert.rejects(env.approveEditionLifecycleItems([{ item_type: "new_edition", item_id: candidates[0] }, { item_type: "result", item_id: uuid(9) }]), /eigenes|eigene/);
});
