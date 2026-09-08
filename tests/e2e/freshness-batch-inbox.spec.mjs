import fs from "node:fs";
import { expect, test } from "@playwright/test";

const admin = fs.readFileSync(new URL("../../js/supabase.js", import.meta.url), "utf8");
const actions = admin.slice(admin.indexOf("async function handleEditionLifecycleAction("), admin.indexOf("function toDateTimeLocal("));
const selectionListener = admin.slice(admin.indexOf('editionLifecycleElements.list?.addEventListener("change"'), admin.indexOf('editionLifecycleElements.filter?.addEventListener("change"'));

async function inbox(page, count = 2) {
  await page.route("**/batch-inbox-fixture", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/style.css"></head><body><button data-lifecycle-action="select-freshness">Wählen</button><button data-lifecycle-action="review-freshness-selected">Prüfen</button><p id="status"></p><div id="inbox"></div></body></html>' }));
  await page.goto("/batch-inbox-fixture");
  await page.evaluate(count => {
    const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    window.rows = Array.from({ length: count }, (_, index) => {
      const values = { event_name: `Testlauf ${index + 1}`, edition_year: 2026, date: "2026-09-20", city: "Berlin", country: "Germany", address: "Teststraße 1", latitude: "52.52", longitude: "13.40", sport: "Running", distances: [{ distance_km: 10, label: "10 km" }], description: "Vollständige synthetische Beschreibung der offiziellen Testveranstaltung für die getrennte Prüfung der Admin-Inbox.", registration_status: "registration_open", official_event_page: `https://example.test/event-${index}`, registration_link: `https://example.test/register-${index}` };
      return { item_type: "freshness_review", item_id: uuid(index + 1), edition_id: uuid(index + 1), event_id: index + 1, eligible: true, metadata: { source_id: uuid(index + 101), source_url: values.official_event_page, stored_values: values } };
    });
    window.rpcCalls = [];
    window.reloads = [];
    document.getElementById("inbox").innerHTML = rows.map(row => `<input type="checkbox" aria-label="Event ${row.event_id}" data-freshness-select value="${row.edition_id}">`).join("") + '<input type="checkbox" data-lifecycle-select checked value="foreign-content-review">';
  }, count);
  // Serve the actual production handlers as a script so their relative import
  // resolves exactly as it does in js/supabase.js; only the remote boundary is mocked.
  await page.route("**/js/batch-inbox-fixture.js", route => route.fulfill({ contentType: "text/javascript", body: `
    const editionLifecycleInbox = window.rows;
    const dataOpsEditions = window.rows.map(row => ({id: row.edition_id}));
    const editionLifecycleElements = { list: document.getElementById("inbox") };
    const getEligibleFreshnessReviewSource = row => ({id: row.metadata.source_id, source_url: row.metadata.source_url});
    const getFreshnessVerificationStoredValues = row => row.metadata.stored_values;
    const canVerifyFreshnessReview = row => row.eligible;
    const getFriendlyErrorMessage = (error, fallback) => error.message || fallback;
    const setButtonLoading = (button, loading) => { button.disabled = loading; };
    const setEditionLifecycleStatus = value => { document.getElementById("status").textContent = value; };
    const loadDataOperations = async options => { window.reloads.push(options); if (window.failReload) throw new Error("Reload unavailable"); };
    const supabaseClient = {rpc: async (name,args) => {
      window.rpcCalls.push({name,args});
      return {data:{requested_count:args.p_edition_ids.length,verified_count:args.p_edition_ids.length,verified_edition_ids:args.p_edition_ids,freshness_verified:true,automatic_fact_changes:false},error:null};
    }};
    ${actions}
    ${selectionListener}
    document.querySelectorAll("[data-lifecycle-action]").forEach(button => button.addEventListener("click", () => handleEditionLifecycleAction(button)));
  ` }));
  await page.addScriptTag({ url: "/js/batch-inbox-fixture.js" });
}

async function fillEvidence(page) {
  const text = await page.evaluate(() => JSON.stringify({ schema_version: 1, reviews: rows.map(row => ({ event_id: row.event_id, edition_id: row.edition_id, source_id: row.metadata.source_id, source_url: row.metadata.source_url, source_checked_at: new Date().toISOString(), confidence: 0.95, notes: "Alle offiziellen Werte unabhängig geprüft.", confirmed_fields: Object.keys(row.metadata.stored_values), uncertain_fields: [], observed_values: row.metadata.stored_values })) }));
  await page.getByLabel("Belege als JSON", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Belege importieren", exact: true }).click();
  for (const card of await page.locator(".freshness-batch-card").all()) {
    if (await card.getAttribute("open") === null) await card.locator(":scope > summary").click();
    await card.getByRole("checkbox").check();
  }
}

test("inbox limits freshness selection to 25 independently of lifecycle selection", async ({ page }) => {
  await inbox(page, 26);
  await page.getByRole("button", { name: "Wählen", exact: true }).click();
  await expect(page.locator("[data-freshness-select]:checked")).toHaveCount(25);
  await page.getByLabel("Event 26", { exact: true }).click();
  await expect(page.getByLabel("Event 26", { exact: true })).not.toBeChecked();
  await expect(page.locator("#status")).toContainText("höchstens 25");
  await page.locator("[data-freshness-select]").evaluateAll(inputs => inputs.forEach(input => { input.checked = false; }));
  await page.getByRole("button", { name: "Prüfen", exact: true }).click();
  await expect(page.locator("#status")).toContainText("1 bis 25");
  expect(await page.evaluate(() => rpcCalls)).toEqual([]);
});

test("inbox loads the real lazy module and sends one complete freshness RPC", async ({ page }) => {
  await inbox(page);
  await page.getByRole("button", { name: "Wählen", exact: true }).click();
  await page.getByRole("button", { name: "Prüfen", exact: true }).click();
  await expect(page.locator("#freshnessBatchDialog")).toBeVisible();
  await fillEvidence(page);
  await page.getByRole("button", { name: "Paket bestätigen", exact: true }).click();
  await expect(page.locator("#freshnessBatchDialog")).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("2 Events mit vollständigen Feldbelegen");
  const outcome = await page.evaluate(() => ({ rpcCalls, reloads }));
  expect(outcome.rpcCalls).toHaveLength(1);
  expect(outcome.rpcCalls[0].name).toBe("verify_freshness_review_editions");
  expect(outcome.rpcCalls[0].args.p_edition_ids).toHaveLength(2);
  expect(Object.keys(outcome.rpcCalls[0].args.p_evidence)).toEqual(outcome.rpcCalls[0].args.p_edition_ids);
  expect(outcome.reloads).toEqual([{ throwOnError: true }, { throwOnError: true }]);
});

test("failed strict reload prevents the actual handler from calling the RPC", async ({ page }) => {
  await inbox(page);
  await page.getByRole("button", { name: "Wählen", exact: true }).click();
  await page.getByRole("button", { name: "Prüfen", exact: true }).click();
  await fillEvidence(page);
  await page.evaluate(() => { window.failReload = true; });
  await page.getByRole("button", { name: "Paket bestätigen", exact: true }).click();
  await expect(page.locator("#freshnessBatchDialog > form > .freshness-batch-errors")).toContainText("Reload unavailable");
  expect(await page.evaluate(() => rpcCalls)).toEqual([]);
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Prüfen", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Prüfen", exact: true })).toBeFocused();
});
