import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const admin = fs.readFileSync(new URL("../js/supabase.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const detail = {
  id: "detail-2026", event_slug: "testlauf-2026", event_name: "Reviewed Testlauf", knowledge_scope: "edition",
  event_brand_id: 42, edition_id: "edition-2026", last_checked: "2020-01-02", is_public: true,
  verification_status: "verified_official_source", registration_url: "https://race.example/register"
};

function runtime(options = {}) {
  const writes = [];
  const rows = { event_details: options.existing === null ? null : { ...detail, ...(options.existing || {}) } };
  const statuses = [];
  const formFields = [...html.matchAll(/<(?:input|textarea|select)\b[^>]*data-knowledge-table="[^"]+"[^>]*>/g)].map(([tag]) => ({
    name: /\bname="([^"]+)"/.exec(tag)[1], value: "", dataset: {
      knowledgeTable: /data-knowledge-table="([^"]+)"/.exec(tag)[1],
      knowledgeArray: /data-knowledge-array="true"/.test(tag) ? "true" : undefined,
      knowledgeJson: /data-knowledge-json="true"/.test(tag) ? "true" : undefined,
      knowledgeBoolean: /data-knowledge-boolean="true"/.test(tag) ? "true" : undefined
    }
  }));
  const form = {
    reset() { formFields.forEach(field => { field.value = ""; }); },
    querySelectorAll(selector) {
      const table = /data-knowledge-table="([^"]+)"/.exec(selector)?.[1];
      const name = /name="([^"]+)"/.exec(selector)?.[1];
      return formFields.filter(field => field.dataset.knowledgeTable === table && (!name || field.name === name));
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
  const client = { from(table) {
    let operation = "select";
    let payload;
    const filters = {};
    const run = () => {
      if (operation === "select") {
        const canonical = table === "event_editions" ? { id: "edition-2026", event_id: 42, edition_slug: "testlauf-2026" }
          : table === "events" ? { id: 42, slug: "testlauf" } : rows[table] || null;
        return Promise.resolve({ data: canonical, error: null });
      }
      writes.push({ table, operation, payload: plain(payload), filters: { ...filters } });
      const data = Array.isArray(payload) ? payload[0] : payload;
      rows[table] = { ...(rows[table] || {}), id: rows[table]?.id || "new-detail", ...data };
      return Promise.resolve({ data: { ...rows[table] }, error: null });
    };
    const query = {
      select() { return query; }, eq(field, value) { filters[field] = value; return query; },
      update(value) { operation = "update"; payload = value; return query; },
      insert(value) { operation = "insert"; payload = value; return query; },
      upsert(value) { operation = "upsert"; payload = value; return query; },
      single: run, maybeSingle: run, then(resolve, reject) { return run().then(resolve, reject); }
    };
    return query;
  } };
  const source = { source_url: "https://race.example/guide", field_path: "race_day.start_time", last_verified: "2020-01-02" };
  const context = vm.createContext({
    supabaseClient: client, currentKnowledgeDetail: options.existing === null ? null : rows.event_details,
    getAdminEventSlug: event => event.event_slug, escapeAdminHTML: value => String(value),
    KNOWLEDGE_CHILD_TABLES: { race_day: "event_race_day", registration: "event_registration", course: "event_course", travel: "event_travel" },
    KNOWLEDGE_REVIEW_FIELD_TARGETS: { cutoff: { tableKey: "race_day", field: "total_cutoff" }, start_time: { tableKey: "race_day", field: "start_time" }, registration_deadline: { tableKey: "registration", field: "registration_close_date" } },
    knowledgeElements: { form, slug: { value: "testlauf-2026" }, eventSelect: { value: "testlauf-2026" }, verificationStatus: { value: "verified_official_source" }, isPublic: { checked: true } },
    collectKnowledgeFields: table => table === "details" ? { event_name: "Reviewed Testlauf", last_checked: "2020-01-02" } : { start_time: "09:00" },
    collectKnowledgeSources: () => options.sources || [source], collectKnowledgeFaq: () => [],
    getKnowledgeSelectedEvent: () => ({ event_id: 42, edition_id: "edition-2026" }),
    setButtonLoading() {}, setKnowledgeStatus(message, type) { statuses.push({ message, type }); },
    getFriendlyErrorMessage: error => error.message, loadEventKnowledgeAdmin: async () => {},
    console: { error() {} },
    async saveSingleKnowledgeChild(table, id, payload) {
      writes.push({ table, operation: "child", payload: plain(payload) });
      if (options.failChild === table) throw new Error("child write failed");
    },
    async replaceKnowledgeRows(table) { writes.push({ table, operation: "replace" }); },
    fillKnowledgeForm(value) { context.formValue = plain(value); }, setKnowledgeAuditStatus() {},
    renderKnowledgeSources() {}, renderKnowledgeFaq() {}, getKnowledgeReviewDecision: () => null
  });
  const sections = [
    ["function normalizeKnowledgeDetailFromEvent(", "function renderKnowledgeEventOptions("],
    ["function getKnowledgeSourceTemplate(", "function renderKnowledgeSources("],
    ["async function saveSelectedEventKnowledge(", "function setKnowledgeAuditStatus("],
    ["function getKnowledgeReviewFieldRows(", "async function ensureKnowledgeDetailForTask("],
    ["async function ensureKnowledgeDetailForTask(", "async function saveKnowledgeReviewFaq("],
    ["async function acceptKnowledgeReviewField(", "function getKnowledgeAuditFilteredRows("],
    ["function applyKnowledgeReviewToForm(", "async function openKnowledgeReview("]
  ];
  for (const [start, end] of sections) vm.runInContext(admin.slice(admin.indexOf(start), admin.indexOf(end)), context);
  if (options.realForm) {
    for (const [start, end] of [["function setKnowledgeField(", "function getKnowledgeSourceTemplate("], ["function collectKnowledgeFields(", "function collectKnowledgeSources("]]) {
      vm.runInContext(admin.slice(admin.indexOf(start), admin.indexOf(end)), context);
    }
  }
  if (options.realChild) {
    vm.runInContext(admin.slice(admin.indexOf("async function saveSingleKnowledgeChild("), admin.indexOf("async function replaceKnowledgeRows(")), context);
  }
  return { context, writes, rows, statuses, formFields };
}

test("prefill keeps event/registration semantics separate and does not attest copied facts", () => {
  const { context } = runtime();
  const prefill = context.normalizeKnowledgeDetailFromEvent({ event_slug: "race-2026", event_url: "https://legacy.example", event_id: 42, edition_id: "edition-2026", verification_status: "verified", last_checked: "2020-01-02", event_status: "scheduled" });
  assert.equal(prefill.official_website, "");
  assert.equal(prefill.registration_url, "");
  assert.equal(prefill.event_status, "scheduled");
  assert.equal(prefill.last_checked, "");
  assert.equal(prefill.event_brand_id, 42);
  assert.equal(prefill.edition_id, "edition-2026");
  for (const invalid of ["2026-02-31", "31.02.2026", "2999-01-01", "2020-01-02junk", ""]) assert.equal(context.normalizeKnowledgeDate(invalid), "");
  assert.equal(context.normalizeKnowledgeDate("02.01.2020"), "2020-01-02");
});

test("canonical identity is preserved and foreign or new legacy scope is rejected", async () => {
  const { context } = runtime();
  assert.deepEqual(plain(await context.resolveKnowledgeDetailIdentity("testlauf-2026", {}, detail)), {
    event_slug: "testlauf-2026", knowledge_scope: "edition", event_brand_id: 42, edition_id: "edition-2026"
  });
  assert.equal((await context.resolveKnowledgeDetailIdentity("testlauf", { knowledge_scope: "brand" })).edition_id, null);
  for (const supplied of [{ event_slug: "other" }, { event_brand_id: 99 }, { edition_id: "edition-2027" }, { knowledge_scope: "brand" }]) {
    await assert.rejects(context.resolveKnowledgeDetailIdentity("testlauf-2026", supplied, detail), /match|reassigned/);
  }
  await assert.rejects(context.resolveKnowledgeDetailIdentity("testlauf-2026", { knowledge_scope: "legacy_mixed" }), /explicit/);
});

test("review cannot overwrite parent facts, identity or historical verification", async () => {
  const { context, writes, rows } = runtime();
  await context.ensureKnowledgeDetailForTask({ event_slug: detail.event_slug, event_name: "Unreviewed Name", event_brand_id: 42, edition_id: "edition-2026", date: "2027-01-01" });
  assert.deepEqual(writes[0].payload, { is_public: false, verification_status: "needs_review" });
  assert.equal(rows.event_details.event_name, detail.event_name);
  assert.equal(rows.event_details.last_checked, detail.last_checked);
  await assert.rejects(context.ensureKnowledgeDetailForTask({ event_slug: detail.event_slug, edition_id: "foreign" }), /match/);
  await assert.rejects(context.ensureKnowledgeDetailForTask({ event_slug: detail.event_slug, edition_id: "foreign", supabase_payload: { details: { edition_id: "edition-2026" } } }), /match/);
  assert.equal(writes.length, 1, "foreign tasks must fail before mutation");
});

test("new review details use canonical edition identity without invented URLs or freshness", async () => {
  const { context, rows } = runtime({ existing: null });
  await context.ensureKnowledgeDetailForTask({ event_slug: detail.event_slug, event_name: "Testlauf", research_sources: ["https://directory.example"] });
  assert.equal(rows.event_details.knowledge_scope, "edition");
  assert.equal(rows.event_details.edition_id, "edition-2026");
  assert.equal(rows.event_details.last_checked, null);
  assert.equal(rows.event_details.registration_url, "");
  assert.equal(rows.event_details.official_website, "");
});

test("field provenance retains explicit verification only and survives source form editing", async () => {
  const { context, writes } = runtime();
  const proposal = { source_url: "https://race.example/guide", confidence: 0.9, last_checked: "2020-01-02" };
  await context.saveKnowledgeReviewSource(detail.id, "start_time", proposal);
  assert.equal(writes.at(-1).payload[0].last_verified, null);
  assert.equal(writes.at(-1).payload[0].source_type, "unknown");
  await context.saveKnowledgeReviewSource(detail.id, "start_time", { ...proposal, verification_status: "verified_official_source" });
  const saved = writes.at(-1).payload[0];
  assert.equal(saved.last_verified, "2020-01-02");
  assert.equal(saved.field_path, "race_day.start_time");
  assert.equal(saved.source_type, "official");
  assert.match(context.getKnowledgeSourceTemplate(saved), /data-source-field="field_path" value="race_day.start_time"/);
  await context.saveKnowledgeReviewSource(detail.id, "start_time", { ...proposal, verification_status: "verified_official_source", last_checked: null });
  assert.equal(writes.at(-1).payload[0].last_verified, null);
});

test("publication is the final write after all children and provenance; failures remain private", async () => {
  const success = runtime();
  assert.equal(await success.context.saveSelectedEventKnowledge(), true);
  assert.equal(success.writes[0].payload.is_public, false);
  assert.deepEqual(success.writes.at(-1).payload, { is_public: true });
  assert.equal(success.writes.at(-2).table, "event_faq");
  const failed = runtime({ failChild: "event_registration" });
  assert.equal(await failed.context.saveSelectedEventKnowledge(), false);
  assert.equal(failed.rows.event_details.is_public, false);
  assert.ok(!failed.writes.some(write => write.payload?.is_public === true));
  assert.equal(failed.statuses.at(-1).type, "error");
  const unsupported = runtime({ sources: [{ source_url: "https://race.example" }] });
  assert.equal(await unsupported.context.saveSelectedEventKnowledge(), false);
  assert.equal(unsupported.writes.length, 0, "unverified publication fails before mutation");
  const legacy = runtime({ existing: { knowledge_scope: "legacy_mixed", event_brand_id: null, edition_id: null } });
  assert.equal(await legacy.context.saveSelectedEventKnowledge(), true);
  assert.equal(legacy.writes[0].payload.knowledge_scope, "legacy_mixed");
  assert.equal(legacy.writes[0].payload.edition_id, null, "saving legacy content cannot silently relink it to the catalog selection");
});

test("partial research form keeps existing evidence and never upgrades new source timestamps", () => {
  const { context } = runtime();
  context.applyKnowledgeReviewToForm({ event_slug: detail.event_slug, supabase_payload: {
    details: { last_checked: "2026-09-01" }, race_day: { start_time: "10:00" }, sources: [{ source_url: "https://new.example", last_verified: "2026-09-01" }]
  } }, { details: detail, race_day: { total_cutoff: "6 hours" }, sources: [{ source_url: "https://existing.example", field_path: "race_day.total_cutoff", last_verified: "2020-01-02" }] });
  assert.equal(context.formValue.details.last_checked, "2020-01-02");
  assert.equal(context.formValue.race_day.total_cutoff, "6 hours");
  assert.equal(context.formValue.sources[0].field_path, "race_day.total_cutoff");
  assert.equal(context.formValue.sources[1].last_verified, null);
});

test("withdrawal and registration conditions fail before any race timing mutation", async () => {
  const { context, writes } = runtime();
  for (const [field, value] of [["cutoff", "Withdrawal 45 days before the race"], ["registration_deadline", "Rücktritt bis 1. Mai"], ["start_time", "Registration opens at 09:00"]]) {
    await assert.rejects(context.acceptKnowledgeReviewField({ event_slug: detail.event_slug }, field, { value, source_url: "https://race.example" }), /Withdrawal|Registration/);
  }
  assert.equal(writes.length, 0);
});

test("dotted review fields preserve typed arrays and false booleans with exact provenance", async () => {
  const { context, writes, rows } = runtime();
  const tiers = [{ tier: "Individual", price: "EUR 779" }, { tier: "Relay", price: "EUR 879" }];
  for (const [field, value] of [["registration.price_tiers", JSON.stringify(tiers)], ["course.start_finish_same_place", "false"], ["course.swim_distance", "3.8 km"], ["details.official_website", "https://race.example"]]) {
    await context.acceptKnowledgeReviewField({ event_slug: detail.event_slug }, field, { value, source_url: "https://race.example/2026", confidence: null, verification_status: "needs_review", last_checked: "2026-09-20" });
  }
  assert.deepEqual(writes.find(write => write.payload?.price_tiers)?.payload.price_tiers, tiers);
  assert.equal(writes.find(write => Object.hasOwn(write.payload || {}, "start_finish_same_place"))?.payload.start_finish_same_place, false);
  assert.equal(rows.event_details.official_website, "https://race.example");
  assert.equal(rows.event_details.is_public, false);
  assert.equal(rows.event_details.last_checked, detail.last_checked);
  assert.equal(writes.at(-1).payload[0].field_path, "basis.official_website");
  assert.equal(writes.at(-1).payload[0].confidence_score, null);
  assert.ok(writes.filter(write => write.table === "event_detail_sources").every(write => write.payload[0].last_verified === null));
  assert.equal(context.getKnowledgeReviewFieldRows({ event_slug: detail.event_slug, proposals: [{ field_name: "course.start_finish_same_place", suggested_value: false, source_url: "https://race.example" }] }).length, 1);
  assert.deepEqual(JSON.parse(context.formatKnowledgeReviewValue(tiers)), tiers);
  assert.doesNotMatch(context.formatKnowledgeReviewValue(tiers), /\[object Object\]/);
});

test("unsupported targets and incompatible typed/semantic values fail before mutation", async () => {
  const { context, writes } = runtime();
  for (const [field, value] of [
    ["details.edition_id", "foreign"], ["details.is_public", true], ["details.last_checked", "2026-09-20"],
    ["details.__proto__", "bad"], ["course.nonexistent", "value"], ["course.distances.extra", "value"],
    ["registration.price_tiers", "[broken"], ["race_day.intermediate_cutoffs", { point: "Finish", time: "17:00" }],
    ["course.start_finish_same_place", "yes"], ["course.swim_distance", { arbitrary: "object" }],
    ["race_day.swim_cutoff", "Withdrawal 45 days before race"],
    ["race_day.intermediate_cutoffs", [{ point: "Registration deadline", time: "10:00" }]],
    ["registration.registration_close_date", "Rücktritt bis 1. Mai"]
  ]) await assert.rejects(context.acceptKnowledgeReviewField({ event_slug: detail.event_slug }, field, { value, source_url: "https://race.example" }));
  await assert.rejects(context.acceptKnowledgeReviewField({ event_slug: detail.event_slug }, "start_time", { value: "09:00", source_url: "javascript:alert(1)" }), /source URL/);
  await assert.rejects(context.acceptKnowledgeReviewField({ event_slug: detail.event_slug }, "start_time", { value: "09:00", source_url: "https://race.example", confidence: "unverified" }), /confidence/);
  assert.equal(writes.length, 0);
});

test("existing empty JSON arrays stay empty through editor fill and collection", () => {
  const { context } = runtime({ realForm: true });
  context.fillKnowledgeForm({ registration: { price_tiers: [] }, race_day: { intermediate_cutoffs: [] } });
  assert.deepEqual(plain(context.collectKnowledgeFields("registration").price_tiers), []);
  assert.deepEqual(plain(context.collectKnowledgeFields("race_day").intermediate_cutoffs), []);
});

test("whole review form roundtrip saves structured prices, cutoffs, false values and triathlon legs without attesting", async () => {
  const { context, writes, rows } = runtime({ realForm: true });
  const payload = {
    details: { ...detail, last_checked: "2026-09-20" },
    registration: { price_tiers: [{ tier: "Individual", price: "EUR 779" }], lottery_available: false },
    course: { swim_distance: "3.8 km", bike_distance: "180 km", run_distance: "42.195 km", start_finish_same_place: false },
    race_day: { intermediate_cutoffs: [{ point: "End of bike — cumulative swim + bike", time: "9 h 10 min" }] },
    sources: [{ source_url: "https://race.example/guide", field_path: "race_day.intermediate_cutoffs", last_verified: "2026-09-20" }]
  };
  context.applyKnowledgeReviewToForm({ event_slug: detail.event_slug, supabase_payload: payload }, { details: detail });
  for (const section of ["registration", "course", "race_day"]) {
    const actual = plain(context.collectKnowledgeFields(section));
    for (const [key, value] of Object.entries(payload[section])) assert.deepEqual(actual[key], value);
  }
  assert.equal(await context.saveSelectedEventKnowledge(), true);
  assert.equal(rows.event_details.is_public, false);
  assert.equal(rows.event_details.verification_status, "needs_review");
  assert.equal(rows.event_details.last_checked, detail.last_checked);
  assert.deepEqual(writes.find(write => write.table === "event_registration").payload.price_tiers, payload.registration.price_tiers);
  assert.equal(writes.find(write => write.table === "event_course").payload.start_finish_same_place, false);
  assert.deepEqual(writes.find(write => write.table === "event_race_day").payload.intermediate_cutoffs, payload.race_day.intermediate_cutoffs);
});

test("normal save actually clears existing text, arrays and unknown booleans without dropping other facts", async () => {
  const { context, rows, writes } = runtime({ realForm: true, realChild: true });
  rows.event_registration = { id: "registration", price_tiers: [{ price: "EUR 79" }], lottery_available: true, currency: "EUR" };
  rows.event_race_day = { id: "race-day", intermediate_cutoffs: [{ point: "Finish", time: "6h" }], start_time: "09:00" };
  rows.event_course = { id: "course", swim_distance: "3.8 km", bike_distance: "180 km" };
  context.fillKnowledgeForm({ details: { ...detail, is_public: false, verification_status: "needs_review" },
    registration: rows.event_registration, race_day: rows.event_race_day, course: rows.event_course });
  for (const [table, name, value] of [["registration", "price_tiers", "[]"], ["registration", "lottery_available", ""], ["race_day", "intermediate_cutoffs", ""], ["course", "swim_distance", ""]]) {
    context.knowledgeElements.form.querySelector(`[data-knowledge-table="${table}"][name="${name}"]`).value = value;
  }
  assert.equal(await context.saveSelectedEventKnowledge(), true);
  assert.deepEqual(plain(rows.event_registration.price_tiers), []);
  assert.equal(rows.event_registration.lottery_available, null);
  assert.equal(rows.event_registration.currency, "EUR");
  assert.deepEqual(plain(rows.event_race_day.intermediate_cutoffs), []);
  assert.equal(rows.event_race_day.start_time, "09:00");
  assert.equal(rows.event_course.swim_distance, "");
  assert.equal(rows.event_course.bike_distance, "180 km");
  assert.equal(rows.event_details.is_public, false);
  assert.ok(writes.some(write => write.table === "event_registration" && write.operation === "update" && write.payload.lottery_available === null));
});

test("actual child persistence keeps omitted fields and skips empty new records while preserving false", async () => {
  const { context, rows, writes } = runtime({ realChild: true });
  rows.event_course = { id: "course", swim_distance: "3.8 km", bike_distance: "180 km", run_distance: "42 km", start_finish_same_place: false };
  await context.acceptKnowledgeReviewField({ event_slug: detail.event_slug }, "course.run_distance", {
    value: "42.195 km", source_url: "https://race.example/guide", verification_status: "needs_review"
  });
  assert.deepEqual(rows.event_course, { id: "course", swim_distance: "3.8 km", bike_distance: "180 km", run_distance: "42.195 km", start_finish_same_place: false });
  assert.deepEqual(writes.find(write => write.table === "event_course").payload, { run_distance: "42.195 km" });
  const before = writes.length;
  await context.saveSingleKnowledgeChild("event_registration", detail.id, { price_tiers: [], lottery_available: null, currency: "" });
  assert.equal(writes.length, before);
  assert.equal(rows.event_registration, undefined);
  await context.saveSingleKnowledgeChild("event_registration", detail.id, { lottery_available: false });
  assert.equal(rows.event_registration.lottery_available, false);
});
