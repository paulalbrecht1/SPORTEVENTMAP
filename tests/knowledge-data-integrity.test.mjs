import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { indexEventsBySlug, isUsefulValue, isCurrentEdition } = require("../tools/event-knowledge-workflow.js");
const { buildSupabasePayload, fieldCandidateFromCsv } = require("../tools/enrich-event-knowledge.js");
const { buildTask, collectResearchProposals, researchField, mergeReviewTasks } = require("../tools/research-event-knowledge.js");
const { supabaseGet, buildExportRecord } = require("../tools/export-event-detail-database.js");
const event = {
  event_id: 42, edition_id: "edition-2027", event_name: "City Race", date: "18.04.2027",
  city: "Berlin", country: "Germany", official_url: "https://race.example/",
  event_url: "https://calendar.example/race", registration_url: "https://registration.example/2027",
  verification_status: "verified", registration_status: "sold_out", last_checked: "2026-09-01"
};
const audit = { ...event, event_slug: "city-race-2027", missing_fields: ["cutoff", "sources"] };

test("research binds by exact edition identity, independent of archive/CSV order", () => {
  const other = { ...event, event_name: "Other Race", edition_id: "other-2027" };
  const pages = [
    { ...event, date: "18.04.2026", slug: "city-race-2026" },
    { ...other, slug: "other-race-2027" },
    { ...event, slug: "city-race-2027" }
  ];
  const indexed = indexEventsBySlug([event, other], pages);
  assert.equal(indexed.get("city-race-2027"), event);
  assert.equal(indexed.get("other-race-2027"), other);
  assert.equal(indexed.has("city-race-2026"), false);
  assert.throws(() => indexEventsBySlug([event, event], pages), /Duplicate/);
  assert.throws(() => indexEventsBySlug([event], [...pages, pages[2]]), /Ambiguous/);
});

test("seed generation never invents freshness or maps verification to registration", () => {
  const candidate = fieldCandidateFromCsv("registration_status", event, audit);
  assert.equal(candidate.value, "sold_out");
  assert.equal(candidate.last_checked, "");
  assert.equal(fieldCandidateFromCsv("registration_status", { ...event, registration_status: "" }, audit), null);
  const payload = buildSupabasePayload(event, audit, {
    sources: fieldCandidateFromCsv("sources", event, audit)
  });
  assert.equal(payload.details.last_checked, null);
  assert.equal(payload.details.edition_id, event.edition_id);
  assert.equal(payload.details.event_brand_id, event.event_id);
  assert.equal(payload.details.official_website, event.official_url);
  assert.equal(payload.details.registration_url, event.registration_url);
  assert.equal(payload.details.is_public, false);
  assert.equal(payload.sources[0].last_verified, null);
  assert.equal(payload.sources[0].source_type, "unknown");
});

test("cutoff and start proposals exclude registration/withdrawal context", () => {
  for (const text of [
    "Withdrawal cut-off 45 days before the start at 09:00",
    "Rücktritt Zeitlimit 12:00 Uhr",
    "Registration time limit 6 hours",
    "Anmeldestart 09:00 Uhr"
  ]) {
    for (const field of ["cutoff", "start_time"]) {
      assert.equal(researchField(field, audit, event.official_url, "Race", [text]), null);
    }
  }
  const proposal = researchField("cutoff", audit, event.official_url, "Race", ["Zielschluss nach 6 Stunden"]);
  assert.equal(proposal.value, "Zielschluss nach 6 Stunden");
  assert.equal(proposal.verification_status, "needs_review");
  assert.equal(proposal.last_checked, "");
  const task = buildTask(audit, event, [{ ...proposal, source_fetched_at: "2026-09-20T12:00:00Z" }], event.official_url);
  assert.equal(task.fields.cutoff.source_fetched_at, "2026-09-20T12:00:00Z");
  assert.equal(task.supabase_payload.details.last_checked, null);
  assert.equal(task.supabase_payload.details.is_public, false);
});

test("unconfirmed placeholder text does not count as complete knowledge", () => {
  for (const value of ["Not yet officially confirmed", "Noch nicht offiziell bestätigt", "unknown", ""]) {
    assert.equal(isUsefulValue(value), false);
  }
});

test("routine research targets current editions rather than enriching completed exports", () => {
  const today = "2026-09-20T12:00:00Z";
  assert.equal(isCurrentEdition({ date: "19.09.2026" }, today), false);
  assert.equal(isCurrentEdition({ date: "20.09.2026" }, today), true);
  assert.equal(isCurrentEdition({ date: "", event_status: "date_unconfirmed" }, today), true);
  assert.equal(isCurrentEdition({ date: "20.09.2027", event_status: "completed" }, today), false);
  assert.equal(isCurrentEdition({ date: "20.09.2027", event_status: "active", edition_status: "completed" }, today), false);
  assert.equal(isCurrentEdition({ date: "19.09.2026", event_status: "postponed" }, today), true);
  assert.equal(isCurrentEdition({ date: "19.09.2026", event_status: "date_unconfirmed" }, today), true);
  assert.equal(isCurrentEdition({ date: "19.09.2026", end_date: "2026-09-21", edition_status: "scheduled" }, today), true);
  assert.equal(isCurrentEdition({ date: "31.02.2027" }, today), false);
});

test("review regeneration preserves identity and never carries technical dates as verification", () => {
  const proposal = researchField("cutoff", audit, event.official_url, "Race", ["Zielschluss nach 6 Stunden"]);
  const task = buildTask(audit, event, [proposal], event.official_url);
  const older = structuredClone(task);
  older.fields.cutoff.last_checked = "2026-08-01";
  older.proposals[0].last_checked = "2026-08-01";
  const merged = mergeReviewTasks({ tasks: [older] }, [], {});
  assert.equal(merged.tasks[0].fields.cutoff.last_checked, "");
  assert.equal(merged.tasks[0].proposals[0].last_checked, "");
  assert.throws(() => mergeReviewTasks({ tasks: [older] }, [{ ...task, edition_id: "other-edition" }], {}), /identity conflict/);
});

test("Knowledge research reuses source-monitor edition guard for next-year pages", async () => {
  const html = '<script type="application/ld+json">{"@type":"SportsEvent","name":"City Race 2028","startDate":"2028-04-16"}</script><p>Start time 09:00. Entry fee 50 EUR.</p>';
  const result = await collectResearchProposals(audit, event, event.official_url, {
    html, title: "City Race 2028", segments: ["Start time 09:00", "Entry fee 50 EUR"], fetched_at: "2026-09-20T12:00:00Z"
  }, ["start_time", "entry_fee", "sources"]);
  assert.deepEqual(result.proposals.map(proposal => proposal.field_name), ["sources"]);
  assert.ok(result.diagnostics.includes("source_dates_do_not_identify_target_edition"));
  const historical = await collectResearchProposals(audit, { ...event, date: "01.01.2020", edition_status: "scheduled" }, event.official_url, {
    html: "<p>Start time 09:00</p>", title: "City Race", segments: ["Start time 09:00"]
  }, ["start_time", "sources"]);
  assert.deepEqual(historical.proposals.map(proposal => proposal.field_name), ["sources"]);
  assert.ok(historical.diagnostics.includes("historical_edition_evidence_missing"));
});

test("detail export retrieves all pages even when API caps results below requested limit", async () => {
  const all = Array.from({ length: 1203 }, (_, index) => ({ id: `id-${index}`, last_verified: "2026-08-24" }));
  const requests = [];
  const rows = await supabaseGet("event_detail_sources", "?select=*&order=created_at.asc", {
    url: "https://db.example", key: "test-public-key",
    fetch: async url => {
      const params = new URL(url).searchParams;
      requests.push(params);
      const offset = Number(params.get("offset"));
      return { ok: true, json: async () => all.slice(offset, offset + 200) };
    }
  });
  assert.deepEqual(rows, all);
  assert.equal(requests.length, 8);
  assert.equal(requests[0].get("order"), "created_at.asc,id.asc");
  assert.equal(rows[1202].last_verified, "2026-08-24");
});

test("failed or overlapping export pages abort instead of writing an incomplete snapshot", async () => {
  await assert.rejects(supabaseGet("event_course", "", {
    url: "https://db.example", fetch: async () => ({ ok: false, status: 503 })
  }), /HTTP 503/);
  await assert.rejects(supabaseGet("event_course", "", {
    url: "https://db.example", fetch: async () => ({ ok: true, json: async () => [{ id: "same" }] })
  }), /changed while paginating/);
});

test("unscoped legacy records are never silently promoted to verified edition knowledge", () => {
  const groups = Object.fromEntries(["registration", "course", "race_day", "travel", "weather", "statistics", "editorial", "sources", "faq"].map(key => [key, new Map()]));
  const row = buildExportRecord({ id: "old", event_slug: "race-2026", last_checked: "2026-08-01" }, groups);
  assert.equal(row.knowledge_scope, "legacy_mixed");
  assert.equal(row.verification.edition, undefined);
});
