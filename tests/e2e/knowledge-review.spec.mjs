import fs from "node:fs";
import { expect, test } from "@playwright/test";

const admin = fs.readFileSync(new URL("../../js/supabase.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const form = html.match(/<form id="eventKnowledgeForm"[\s\S]*?<\/form>/)[0];
const section = (start, end) => admin.slice(admin.indexOf(start), admin.indexOf(end));

async function openKnowledge(page) {
  await page.setContent(`<html><body><input id="slug" value="testlauf-2027"><select id="verification"><option>needs_review</option></select><input id="public" type="checkbox">${form}<p id="status"></p></body></html>`);
  await page.addScriptTag({ content: `
    const KNOWLEDGE_CHILD_TABLES = { registration: "event_registration", course: "event_course", race_day: "event_race_day", travel: "event_travel" };
    const KNOWLEDGE_REVIEW_FIELD_TARGETS = { cutoff: { tableKey: "race_day", field: "total_cutoff" } };
    const knowledgeElements = { form: document.getElementById("eventKnowledgeForm"), sources: document.getElementById("knowledgeSourcesList"), slug: document.getElementById("slug"), verificationStatus: document.getElementById("verification"), isPublic: document.getElementById("public") };
    let currentKnowledgeDetail = { id: "detail", event_slug: "testlauf-2027", event_brand_id: 7, edition_id: "edition", knowledge_scope: "edition", event_name: "Testlauf", last_checked: null };
    window.writes = [];
    window.db = { event_details: currentKnowledgeDetail };
    const supabaseClient = { from(table) {
      let operation = "select", payload;
      const run = async () => {
        if (operation === "select") return { data: window.db[table] || null, error: null };
        window.writes.push({ table, operation, payload: structuredClone(payload) });
        const value = Array.isArray(payload) ? payload[0] : payload;
        window.db[table] = { id: "fixture-" + table, ...(window.db[table] || {}), ...value };
        return { data: window.db[table], error: null };
      };
      const query = { select() { return query; }, eq() { return query; }, insert(value) { operation = "insert"; payload = value; return query; }, update(value) { operation = "update"; payload = value; return query; }, upsert(value) { operation = "upsert"; payload = value; return query; }, single: run, maybeSingle: run, then(resolve,reject) { return run().then(resolve,reject); } };
      return query;
    }};
    const setButtonLoading = () => {};
    const setKnowledgeStatus = text => { document.getElementById("status").textContent = text; };
    const setKnowledgeAuditStatus = () => {};
    const getFriendlyErrorMessage = error => error.message;
    const getKnowledgeSelectedEvent = () => ({ event_id: 7, edition_id: "edition", event_name: "Testlauf" });
    const loadEventKnowledgeAdmin = async () => {};
    const escapeAdminHTML = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const renderKnowledgeFaq = () => {};
    const collectKnowledgeFaq = () => [];
    const replaceKnowledgeRows = async (table,id,payload) => window.writes.push({ table, operation: "replace", payload });
    const getKnowledgeReviewDecision = () => null;
    ${section("function normalizeKnowledgeDetailFromEvent(", "function renderKnowledgeEventOptions(")}
    ${section("function setKnowledgeField(", "function getKnowledgeSourceTemplate(")}
    ${section("function getKnowledgeSourceTemplate(", "function getKnowledgeFaqTemplate(")}
    ${section("function collectKnowledgeFields(", "function collectKnowledgeSources(")}
    ${section("function collectKnowledgeSources(", "function collectKnowledgeFaq(")}
    ${section("async function saveSingleKnowledgeChild(", "async function replaceKnowledgeRows(")}
    ${section("async function saveSelectedEventKnowledge(", "function setKnowledgeAuditStatus(")}
    ${section("function getKnowledgeReviewFieldRows(", "async function saveKnowledgeReviewFaq(")}
    ${section("async function acceptKnowledgeReviewField(", "function getKnowledgeAuditFilteredRows(")}
    ${section("function applyKnowledgeReviewToForm(", "async function openKnowledgeReview(")}
    window.fixture = { details: { ...currentKnowledgeDetail }, registration: { price_tiers: [{ tier: "Individual", price: "EUR 779" }], lottery_available: false }, course: { swim_distance: "3.8 km", bike_distance: "180 km", run_distance: "42.195 km", start_finish_same_place: false }, race_day: { intermediate_cutoffs: [{ point: "End of bike — elapsed since swim start", time: "9 h 10 min" }] }, sources: [{ source_url: "https://race.example/guide", field_path: "race_day.intermediate_cutoffs", last_verified: null }] };
    applyKnowledgeReviewToForm({ event_slug: "testlauf-2027", supabase_payload: window.fixture }, { details: currentKnowledgeDetail });
    document.getElementById("saveEventKnowledgeBtn").addEventListener("click", saveSelectedEventKnowledge);
  ` });
}

test("Knowledge editor preserves structured detail facts and false booleans through normal save", async ({ page }) => {
  await openKnowledge(page);
  const price = page.locator('[name="price_tiers"]');
  await expect(price).toHaveValue(/"tier": "Individual"/);
  await expect(price).not.toHaveValue(/\[object Object\]/);
  await expect(page.locator('[name="lottery_available"]')).toHaveValue("false");
  await expect(page.locator('[name="start_finish_same_place"]')).toHaveValue("false");
  await price.fill('[{"tier":"Individual","price":"EUR 779"},{"tier":"Relay","price":"EUR 879"}]');
  await page.getByRole("button", { name: "Save Knowledge", exact: true }).click();
  await expect(page.locator("#status")).toContainText("saved");
  const saved = await page.evaluate(() => window.db);
  expect(saved.event_registration.price_tiers).toHaveLength(2);
  expect(saved.event_registration.lottery_available).toBe(false);
  expect(saved.event_course.start_finish_same_place).toBe(false);
  expect(saved.event_course.run_distance).toBe("42.195 km");
  expect(saved.event_race_day.intermediate_cutoffs).toEqual([{ point: "End of bike — elapsed since swim start", time: "9 h 10 min" }]);
  expect(saved.event_details.is_public).toBe(false);
  expect(saved.event_details.last_checked).toBeNull();
  const sources = await page.evaluate(() => window.writes.find(write => write.table === "event_detail_sources").payload);
  expect(sources[0].last_verified).toBeNull();
  expect(sources[0].confidence_score).toBeNull();
});

test("Knowledge per-field review accepts edited JSON and false; invalid fields cannot mutate", async ({ page }) => {
  await openKnowledge(page);
  const result = await page.evaluate(async () => {
    const task = { event_slug: "testlauf-2027", event_brand_id: 7, edition_id: "edition" };
    for (const [field,value] of [["registration.price_tiers", '[{"tier":"Relay","price":"EUR 879"}]'], ["course.start_finish_same_place", false]]) {
      await acceptKnowledgeReviewField(task,field,{ value, source_url: "https://race.example/guide", confidence: null, verification_status: "needs_review" });
    }
    const before = window.writes.length;
    let error;
    try { await acceptKnowledgeReviewField(task,"details.edition_id",{ value: "foreign", source_url: "https://race.example/guide" }); } catch (failure) { error = failure.message; }
    return { db: window.db, before, after: window.writes.length, error };
  });
  expect(result.db.event_registration.price_tiers).toEqual([{ tier: "Relay", price: "EUR 879" }]);
  expect(result.db.event_course.start_finish_same_place).toBe(false);
  expect(result.db.event_detail_sources.field_path).toBe("course.start_finish_same_place");
  expect(result.db.event_detail_sources.last_verified).toBeNull();
  expect(result.db.event_detail_sources.confidence_score).toBeNull();
  expect(result.db.event_details.is_public).toBe(false);
  expect(result.error).toContain("No Supabase target");
  expect(result.after).toBe(result.before);
});
