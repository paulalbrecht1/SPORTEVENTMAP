import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const admin = fs.readFileSync(new URL("../js/supabase.js", import.meta.url), "utf8");
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
    KNOWLEDGE_CHILD_TABLES: { race_day: "event_race_day", registration: "event_registration" },
    KNOWLEDGE_REVIEW_FIELD_TARGETS: { cutoff: { tableKey: "race_day", field: "total_cutoff" }, start_time: { tableKey: "race_day", field: "start_time" } },
    knowledgeElements: { slug: { value: "testlauf-2026" }, eventSelect: { value: "testlauf-2026" }, verificationStatus: { value: "verified_official_source" }, isPublic: { checked: true } },
    collectKnowledgeFields: table => table === "details" ? { event_name: "Reviewed Testlauf", last_checked: "2020-01-02" } : { start_time: "09:00" },
    collectKnowledgeSources: () => options.sources || [source], collectKnowledgeFaq: () => [],
    getKnowledgeSelectedEvent: () => ({ event_id: 42, edition_id: "edition-2026" }),
    setButtonLoading() {}, setKnowledgeStatus(message, type) { statuses.push({ message, type }); },
    getFriendlyErrorMessage: error => error.message, loadEventKnowledgeAdmin: async () => {},
    console: { error() {} },
    async saveSingleKnowledgeChild(table) {
      writes.push({ table, operation: "child" });
      if (options.failChild === table) throw new Error("child write failed");
    },
    async replaceKnowledgeRows(table) { writes.push({ table, operation: "replace" }); },
    fillKnowledgeForm(value) { context.formValue = plain(value); }, setKnowledgeAuditStatus() {}
  });
  const sections = [
    ["function normalizeKnowledgeDetailFromEvent(", "function renderKnowledgeEventOptions("],
    ["function getKnowledgeSourceTemplate(", "function renderKnowledgeSources("],
    ["async function saveSelectedEventKnowledge(", "function setKnowledgeAuditStatus("],
    ["async function ensureKnowledgeDetailForTask(", "async function saveKnowledgeReviewFaq("],
    ["async function acceptKnowledgeReviewField(", "function getKnowledgeAuditFilteredRows("],
    ["function applyKnowledgeReviewToForm(", "async function openKnowledgeReview("]
  ];
  for (const [start, end] of sections) vm.runInContext(admin.slice(admin.indexOf(start), admin.indexOf(end)), context);
  return { context, writes, rows, statuses };
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
