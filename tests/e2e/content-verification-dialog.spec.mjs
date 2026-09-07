import fs from "node:fs";
import { expect, test } from "@playwright/test";

const admin = fs.readFileSync(new URL("../../js/supabase.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../../css/style.css", import.meta.url), "utf8");
const dialogRuntime = admin.slice(
  admin.indexOf("function buildContentVerificationEvidence("),
  admin.indexOf("function renderEditionLifecycleInbox(")
);
const actionRuntime = admin.slice(
  admin.indexOf("async function approveEditionLifecycleItems("),
  admin.indexOf("function toDateTimeLocal(")
);

async function openReview(page, type = "freshness_review") {
  await page.setContent('<html lang="de"><body><button id="start" type="button">Review öffnen</button></body></html>');
  await page.addStyleTag({ content: styles });
  await page.evaluate(itemType => {
    window.fixtureValues = {
      event_name: "Dialog-Testlauf",
      edition_year: 2026,
      date: "2026-09-13",
      city: "Berlin",
      country: "Germany",
      sport: "Running",
      distances: [{ label: "10 km", distance_km: 10 }],
      registration_status: "registration_open",
      official_event_page: "https://example.test/official",
      registration_link: "https://example.test/register",
      ...(itemType === "freshness_review" ? {
        address: "Teststraße 1",
        latitude: "52.52",
        longitude: "13.405",
        description: "Eine ausreichend ausführliche Beschreibung der aktuellen Veranstaltung für die vollständige Feldprüfung."
      } : {})
    };
    window.fixtureRow = {
      item_type: itemType, item_id: "fixture-review", event_id: 7, edition_id: "fixture-edition",
      metadata: {
        source_id: "fixture-source",
        source_url: "https://example.test/official",
        stored_values: window.fixtureValues
      }
    };
    window.rpcCalls = [];
    window.confirm = () => { throw new Error("Native confirm must not run"); };
    window.prompt = () => { throw new Error("Native prompt must not run"); };
  }, type);
  await page.addScriptTag({ content: `
    const dataOpsEvents = [{ id: 7, canonical_name: "Dialog-Testlauf" }];
    const editionLifecycleInbox = [window.fixtureRow];
    const editionLifecycleElements = { list: document.createElement("div") };
    const supabaseClient = { rpc: async (name, args) => {
      window.rpcCalls.push({ name, args });
      return { data: { verified_count: 1 }, error: null };
    }};
    const getEligibleFreshnessReviewSource = () => ({ id: "fixture-source", source_url: "https://example.test/official" });
    const getFreshnessVerificationStoredValues = () => window.fixtureValues;
    const hasCompleteFreshnessVerificationShape = () => true;
    const canVerifyFreshnessReview = () => true;
    const safeAdminUrl = value => value;
    const escapeAdminHTML = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const setEditionLifecycleStatus = text => { window.reviewStatus = text; };
    const setButtonLoading = (button, loading) => { button.disabled = loading; };
    const getFriendlyErrorMessage = (error, fallback) => error.message || fallback;
    const loadDataOperations = async () => {};
    ${dialogRuntime}
    ${actionRuntime}
    const start = document.getElementById("start");
    start.dataset.lifecycleAction = "approve-one";
    start.dataset.itemId = window.fixtureRow.item_id;
    start.dataset.itemType = window.fixtureRow.item_type;
    start.addEventListener("click", () => handleEditionLifecycleAction(start));
  ` });
  await page.locator("#start").click();
  return page.getByRole("dialog", { name: "Feldprüfung bestätigen" });
}

async function completeReview(page) {
  await page.getByRole("checkbox").check();
  await page.getByLabel("Confidence (0,80 bis 1,00)").fill("0,95");
  await page.getByLabel("Nachvollziehbare Prüfnotiz").fill("Aktuelle offizielle Ausgabe feldweise geprüft.");
}

test("HTML verification: Escape and cancel restore focus without a write", async ({ page }) => {
  const dialog = await openReview(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Dialog-Testlauf", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link")).toHaveAttribute("href", "https://example.test/official");
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await expect(dialog.getByLabel("Confidence (0,80 bis 1,00)")).toHaveValue("");
  await expect(dialog.getByLabel("Nachvollziehbare Prüfnotiz")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#start")).toBeFocused();
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
  await page.locator("#start").click();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
});

test("HTML verification: invalid inputs remain editable and never call the verifier", async ({ page }) => {
  const dialog = await openReview(page);
  const submit = dialog.getByRole("button", { name: "Feldprüfung verbindlich bestätigen", exact: true });
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("Bitte bestätigen");
  await completeReview(page);
  await dialog.getByLabel("Extern beobachtete Werte (JSON)").fill("invalid");
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("gültiges JSON");
  await dialog.getByLabel("Extern beobachtete Werte (JSON)").fill(
    await page.evaluate(() => JSON.stringify(window.fixtureValues))
  );
  await dialog.getByLabel("Unsichere Felder (kommagetrennt)").fill("date");
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("menschlichen Review");
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
});

for (const [type, fieldCount, rpcName] of [
  ["freshness_review", 14, "verify_freshness_review_editions"],
  ["content_verification", 10, "verify_content_change_tasks"]
]) {
  test(`HTML verification: explicit ${fieldCount}-field confirmation submits exact evidence once`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const dialog = await openReview(page, type);
    await expect(dialog.getByRole("checkbox")).toHaveAccessibleName(new RegExp(`alle ${fieldCount} zentralen Felder`));
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
    expect(bounds.height).toBeLessThanOrEqual(812);
    expect(await dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    const observed = await page.evaluate(() => ({ ...window.fixtureValues, city: "Extern beobachteter Ort" }));
    await dialog.getByLabel("Extern beobachtete Werte (JSON)").fill(JSON.stringify(observed));
    await completeReview(page);
    expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
    await dialog.getByRole("button", { name: "Feldprüfung verbindlich bestätigen", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const calls = await page.evaluate(() => window.rpcCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe(rpcName);
    const evidence = Object.values(calls[0].args.p_evidence)[0];
    expect(evidence.confirmed_fields).toHaveLength(fieldCount);
    expect(evidence.observed_values).toEqual(observed);
    expect(evidence.uncertain_fields).toEqual([]);
    expect(evidence.confidence).toBe(0.95);
    expect(evidence.source_id).toBe("fixture-source");
    expect(evidence.source_url).toBe("https://example.test/official");
    expect(Number.isNaN(Date.parse(evidence.source_checked_at))).toBe(false);
  });
}
