import fs from "node:fs";
import { expect, test } from "@playwright/test";

const runtime = fs.readFileSync(new URL("../../js/freshness-batch-review.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../../css/style.css", import.meta.url), "utf8");
const fields = [
  "event_name", "edition_year", "date", "city", "country", "address", "latitude",
  "longitude", "sport", "distances", "description", "registration_status",
  "official_event_page", "registration_link"
];
const confirmation = "Alle 14 Felder dieses Events anhand der Quelle geprüft";

function contexts(count = 2) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const suffix = String(number).padStart(12, "0");
    const sourceUrl = `https://example.test/official/event-${number}`;
    return {
      eventId: String(700 + number),
      editionId: `00000000-0000-4000-8000-${suffix}`,
      sourceId: `10000000-0000-4000-8000-${suffix}`,
      sourceUrl,
      revision: `review-revision-${number}`,
      eligible: true,
      storedValues: {
        event_name: `Prüflauf ${number}`, edition_year: 2026, date: "2026-10-11",
        city: "Berlin", country: "Germany", address: `Teststraße ${number}, 10117 Berlin`,
        latitude: "52.52", longitude: "13.405", sport: "Running",
        distances: [{ label: "10 km", distance_km: 10 }],
        description: "Der Prüflauf führt auf einer ausgeschilderten Strecke durch Berlin. Die offizielle Ausschreibung beschreibt die aktuelle Ausgabe und die Anmeldung.",
        registration_status: "registration_open", official_event_page: sourceUrl,
        registration_link: `https://example.test/registration/event-${number}`
      }
    };
  });
}

function evidenceFor(selection) {
  const checked = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return {
    schema_version: 1,
    reviews: selection.map(context => ({
      event_id: context.eventId, edition_id: context.editionId,
      source_id: context.sourceId, source_url: context.sourceUrl,
      source_checked_at: checked, confidence: 0.95,
      notes: `Offizielle Ausgabe für Event ${context.eventId} in allen 14 Feldern persönlich geprüft.`,
      confirmed_fields: [...fields], uncertain_fields: [],
      observed_values: structuredClone(context.storedValues)
    }))
  };
}

// Only the two I/O boundaries are replaced. All validation, DOM events and dialog
// lifecycle run through the production module. Transaction atomicity is covered
// separately by the database suite; these tests prove one all-or-nothing request.
async function openBatch(page, selection = contexts(), mode = "success") {
  await page.setContent('<html lang="de"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><button id="start" type="button">Sammelprüfung öffnen</button><p id="launchError"></p></body></html>');
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: runtime });
  await page.evaluate(({ initial, mode }) => {
    window.currentContexts = structuredClone(initial);
    window.rpcCalls = [];
    window.refreshCalls = 0;
    window.batchSettled = false;
    window.batchResult = undefined;
    window.prompt = () => { throw new Error("Native prompt must not run"); };
    window.confirm = () => { throw new Error("Native confirm must not run"); };
    document.getElementById("start").addEventListener("click", async () => {
      try {
        window.batchResult = await window.SemFreshnessBatchReview.open({
          contexts: structuredClone(initial),
          refreshContexts: async () => {
            window.refreshCalls += 1;
            if (window.refreshFailure) throw new Error("Aktuelle Berechtigung nicht verfügbar.");
            return structuredClone(window.currentContexts);
          },
          submit: async args => {
            window.rpcCalls.push(structuredClone(args));
            if (mode === "permission") throw Object.assign(new Error("Keine Adminberechtigung für dieses Paket."), { code: "42501" });
            if (mode === "atomic-failure") throw Object.assign(new Error("Eine Edition hat einen geänderten Faktenstand; Transaktion abgebrochen."), { code: "22023" });
            if (mode === "pending") await new Promise(resolve => { window.releaseRpc = resolve; });
            const ids = args.p_edition_ids;
            const result = {
              requested_count: ids.length, verified_count: ids.length,
              verified_edition_ids: [...ids].reverse(), freshness_verified: true,
              automatic_fact_changes: false
            };
            if (mode === "partial-count") result.verified_count -= 1;
            if (mode === "wrong-id") result.verified_edition_ids[0] = "ffffffff-ffff-4fff-8fff-ffffffffffff";
            if (mode === "automatic-changes") result.automatic_fact_changes = true;
            if (mode === "missing-freshness") delete result.freshness_verified;
            return result;
          }
        });
        window.batchSettled = true;
      } catch (error) {
        document.getElementById("launchError").textContent = error.message;
      }
    });
  }, { initial: selection, mode });
  await page.locator("#start").click();
  return page.locator("#freshnessBatchDialog");
}

async function importEvidence(dialog, evidence, viaFile = false) {
  const text = typeof evidence === "string" ? evidence : JSON.stringify(evidence);
  if (viaFile) {
    await dialog.getByLabel("Belegdatei (JSON)", { exact: true }).setInputFiles({
      name: "official-review.json", mimeType: "application/json", buffer: Buffer.from(text)
    });
  } else {
    await dialog.getByLabel("Belege als JSON", { exact: true }).fill(text);
  }
  await dialog.getByRole("button", { name: "Belege importieren", exact: true }).click();
}

async function openCard(dialog, editionId) {
  const card = dialog.locator(`[data-freshness-edition="${editionId}"]`);
  if (!(await card.evaluate(element => element.open))) await card.locator(":scope > summary").click();
  return card;
}

async function confirmAll(dialog, selection) {
  for (const context of selection) {
    const card = await openCard(dialog, context.editionId);
    await card.getByRole("checkbox", { name: confirmation, exact: true }).check();
  }
}

async function expectNoWrite(page) {
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
}

test("batch: file import requires each conscious confirmation and sends all 14 values in one request", async ({ page }) => {
  const selection = contexts();
  const evidence = evidenceFor(selection);
  const dialog = await openBatch(page, selection);
  const submit = dialog.getByRole("button", { name: "Paket bestätigen", exact: true });
  await expect(submit).toBeDisabled();
  await importEvidence(dialog, evidence, true);
  for (const context of selection) {
    const card = await openCard(dialog, context.editionId);
    await expect(card.getByRole("checkbox", { name: confirmation })).not.toBeChecked();
    await expect(card.locator('.freshness-batch-field[data-match="true"]')).toHaveCount(14);
    await expect(card.getByRole("link")).toHaveAttribute("href", context.sourceUrl);
  }
  await expect(submit).toBeDisabled();
  await (await openCard(dialog, selection[0].editionId)).getByRole("checkbox", { name: confirmation }).check();
  await expect(submit).toBeDisabled();
  await confirmAll(dialog, selection);
  await submit.click();
  await expect(dialog).toHaveCount(0);
  const state = await page.evaluate(() => ({ calls: window.rpcCalls, result: window.batchResult, refreshes: window.refreshCalls }));
  expect(state.refreshes).toBe(1);
  expect(state.calls).toHaveLength(1);
  expect(state.calls[0].p_edition_ids).toEqual(selection.map(context => context.editionId));
  expect(Object.keys(state.calls[0].p_evidence).sort()).toEqual(selection.map(context => context.editionId).sort());
  for (const review of evidence.reviews) {
    const sent = state.calls[0].p_evidence[review.edition_id];
    expect(sent.observed_values).toEqual(review.observed_values);
    expect(sent.confirmed_fields).toEqual(fields);
    expect(sent.uncertain_fields).toEqual([]);
    expect(sent.source_checked_at).toBe(review.source_checked_at);
    expect(sent.source_id).toBe(review.source_id);
    expect(sent.source_url).toBe(review.source_url);
    expect(sent.confidence).toBe(0.95);
    expect(state.calls[0].p_notes).toContain(review.notes);
  }
  expect(state.result.verified_edition_ids).toEqual(selection.map(context => context.editionId).reverse());
  expect(state.result.freshness_verified).toBe(true);
  expect(state.result.automatic_fact_changes).toBe(false);
  await expect(page.locator("#start")).toBeFocused();
});

test("batch: Escape and cancel restore focus without a write", async ({ page }) => {
  let dialog = await openBatch(page);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.batchResult)).toBeNull();
  await expect(page.locator("#start")).toBeFocused();
  await page.locator("#start").click();
  dialog = page.locator("#freshnessBatchDialog");
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#start")).toBeFocused();
  await expectNoWrite(page);
});

test("batch: template contains identifiers but no invented observed values or review timestamps", async ({ page }) => {
  const selection = contexts();
  const dialog = await openBatch(page, selection);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Vorlage herunterladen", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const template = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(template.schema_version).toBe(1);
  expect(template.reviews.map(review => review.edition_id)).toEqual(selection.map(context => context.editionId));
  for (const [index, review] of template.reviews.entries()) {
    expect(review.source_id).toBe(selection[index].sourceId);
    expect(review.source_url).toBe(selection[index].sourceUrl);
    expect(review.source_checked_at).toBe("");
    expect(review.confidence).toBeNull();
    expect(review.notes).toBe("");
    expect(review.observed_values).toEqual(Object.fromEntries(fields.map(field => [field, null])));
  }
  await expectNoWrite(page);
});

test("batch: malformed and unrelated imports never partly replace an existing valid package", async ({ page }) => {
  const selection = contexts();
  const evidence = evidenceFor(selection);
  const dialog = await openBatch(page, selection);
  await importEvidence(dialog, evidence);
  await confirmAll(dialog, selection);
  const first = await openCard(dialog, selection[0].editionId);
  const before = await first.getByLabel("Prüfnotiz", { exact: true }).inputValue();
  const foreign = structuredClone(evidence);
  foreign.reviews[0].notes = "Dieser Teil darf nicht übernommen werden.";
  foreign.reviews[1].edition_id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  for (const invalid of ["{invalid-json", foreign, { ...evidence, reviews: [evidence.reviews[0], evidence.reviews[0]] }]) {
    await importEvidence(dialog, invalid);
    await expect(dialog.getByRole("alert")).not.toHaveText("");
    await expect(first.getByLabel("Prüfnotiz", { exact: true })).toHaveValue(before);
    await expectNoWrite(page);
  }
  await importEvidence(dialog, evidence);
  for (const context of selection) {
    await expect((await openCard(dialog, context.editionId)).getByRole("checkbox", { name: confirmation })).not.toBeChecked();
  }
  await expect(dialog.getByRole("button", { name: "Paket bestätigen", exact: true })).toBeDisabled();
});

test("batch: each evidence blocker disables confirmation until corrected", async ({ page }) => {
  const selection = contexts(1);
  const valid = evidenceFor(selection);
  const dialog = await openBatch(page, selection);
  const variants = [
    review => { review.source_id = "ffffffff-ffff-4fff-8fff-ffffffffffff"; },
    review => { review.source_url = "https://example.test/different-source"; },
    review => { review.observed_values.date = "2026-10-12"; },
    review => { review.confirmed_fields.pop(); },
    review => { review.uncertain_fields = ["latitude"]; },
    review => { review.source_checked_at = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(); },
    review => { review.source_checked_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); },
    review => { review.source_checked_at = "2026-09-08T10:00:00"; },
    review => { review.confidence = 0.79; }
  ];
  for (const mutate of variants) {
    const evidence = structuredClone(valid);
    mutate(evidence.reviews[0]);
    await importEvidence(dialog, evidence);
    const card = await openCard(dialog, selection[0].editionId);
    await expect(card.getByRole("checkbox", { name: confirmation })).toBeDisabled();
    await expect(card.locator(".freshness-batch-errors")).not.toHaveText("");
    await expect(dialog.getByRole("button", { name: "Paket bestätigen", exact: true })).toBeDisabled();
    await expectNoWrite(page);
  }
  await importEvidence(dialog, valid);
  const card = await openCard(dialog, selection[0].editionId);
  await card.getByRole("checkbox", { name: confirmation }).check();
  await card.getByLabel("Prüfnotiz", { exact: true }).fill("Die Quelle wurde gerade nochmals vollständig geprüft.");
  await expect(card.getByRole("checkbox", { name: confirmation })).not.toBeChecked();
  await card.getByText("Beobachtete Werte bearbeiten", { exact: true }).click();
  await card.getByLabel("Beobachtete Werte (JSON)", { exact: true }).fill("{bad-json");
  await expect(card.getByRole("checkbox", { name: confirmation })).toBeDisabled();
  await card.getByLabel("Beobachtete Werte (JSON)", { exact: true }).fill(JSON.stringify(selection[0].storedValues));
  await expect(card.getByRole("checkbox", { name: confirmation })).toBeEnabled();
  await expect(card.getByRole("checkbox", { name: confirmation })).not.toBeChecked();
});

for (const drift of ["revision", "values", "source", "eligibility", "missing-edition"]) {
  test(`batch: ${drift} drift cancels the whole preflight and clears every confirmation`, async ({ page }) => {
    const selection = contexts();
    const dialog = await openBatch(page, selection);
    await importEvidence(dialog, evidenceFor(selection));
    await confirmAll(dialog, selection);
    await page.evaluate(kind => {
      const context = window.currentContexts[1];
      if (kind === "revision") context.revision = "new-revision";
      if (kind === "values") context.storedValues.address = "Andere Straße 9";
      if (kind === "source") context.sourceId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
      if (kind === "eligibility") context.eligible = false;
      if (kind === "missing-edition") window.currentContexts.pop();
    }, drift);
    await dialog.getByRole("button", { name: "Paket bestätigen", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("geändert");
    for (const context of selection) {
      await expect((await openCard(dialog, context.editionId)).getByRole("checkbox", { name: confirmation })).not.toBeChecked();
    }
    await expect(dialog.getByRole("button", { name: "Paket bestätigen", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.refreshCalls)).toBe(1);
    await expectNoWrite(page);
  });
}

test("batch: removing an uncertain event sends only the remaining edition after refreshing the original selection", async ({ page }) => {
  const selection = contexts();
  const evidence = evidenceFor(selection);
  evidence.reviews[1].uncertain_fields = ["distances"];
  const dialog = await openBatch(page, selection);
  await importEvidence(dialog, evidence);
  await (await openCard(dialog, selection[1].editionId)).getByRole("button", { name: "Aus Paket nehmen", exact: true }).click();
  await expect(dialog.locator("[data-freshness-edition]")).toHaveCount(1);
  await confirmAll(dialog, [selection[0]]);
  await dialog.getByRole("button", { name: "Paket bestätigen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const calls = await page.evaluate(() => window.rpcCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].p_edition_ids).toEqual([selection[0].editionId]);
  expect(Object.keys(calls[0].p_evidence)).toEqual([selection[0].editionId]);
});

for (const mode of ["permission", "atomic-failure", "partial-count", "wrong-id", "automatic-changes", "missing-freshness"]) {
  test(`batch: ${mode} cannot be reported as success or automatically retried`, async ({ page }) => {
    const selection = contexts();
    const dialog = await openBatch(page, selection, mode);
    await importEvidence(dialog, evidenceFor(selection));
    await confirmAll(dialog, selection);
    await dialog.getByRole("button", { name: "Paket bestätigen", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Abschluss nicht bestätigt");
    await expect(dialog.getByRole("button", { name: "Paket bestätigen", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.batchSettled)).toBe(false);
    const calls = await page.evaluate(() => window.rpcCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0].p_edition_ids).toEqual(selection.map(context => context.editionId));
    for (const context of selection) {
      const checkbox = (await openCard(dialog, context.editionId)).getByRole("checkbox", { name: confirmation });
      await expect(checkbox).not.toBeChecked();
      await expect(checkbox).toBeDisabled();
    }
    await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
    expect(await page.evaluate(() => window.batchResult)).toBeNull();
    expect(await page.evaluate(() => window.rpcCalls.length)).toBe(1);
  });
}

test("batch: refresh failure fails closed before a write", async ({ page }) => {
  const selection = contexts();
  const dialog = await openBatch(page, selection);
  await importEvidence(dialog, evidenceFor(selection));
  await confirmAll(dialog, selection);
  await page.evaluate(() => { window.refreshFailure = true; });
  await dialog.getByRole("button", { name: "Paket bestätigen", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Berechtigung");
  await expectNoWrite(page);
  expect(await page.evaluate(() => window.batchSettled)).toBe(false);
});

test("batch: pending submit blocks duplicates and Escape without falsely reporting cancellation", async ({ page }) => {
  const selection = contexts();
  const dialog = await openBatch(page, selection, "pending");
  await importEvidence(dialog, evidenceFor(selection));
  await confirmAll(dialog, selection);
  const submit = dialog.getByRole("button", { name: "Paket bestätigen", exact: true });
  await submit.click();
  await expect.poll(() => page.evaluate(() => window.rpcCalls.length)).toBe(1);
  await expect(submit).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Abbrechen", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.batchSettled)).toBe(false);
  await dialog.locator("form").evaluate(form => form.requestSubmit());
  expect(await page.evaluate(() => window.rpcCalls.length)).toBe(1);
  await page.evaluate(() => window.releaseRpc());
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.batchResult.verified_count)).toBe(2);
});

test("batch: empty, duplicate and over-25 selections fail before showing a review", async ({ page }) => {
  const single = contexts(1);
  for (const selection of [[], [single[0], single[0]], contexts(26)]) {
    const dialog = await openBatch(page, selection);
    await expect(page.locator("#launchError")).not.toHaveText("");
    await expect(dialog).toHaveCount(0);
    await expectNoWrite(page);
  }
});

test.describe("batch mobile", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("25 reviews remain usable without horizontal overflow and submit as one package", async ({ page }) => {
    test.setTimeout(90_000);
    const selection = contexts(25);
    selection[0].storedValues.event_name = '<img src=x onerror="window.injected=true">' + "SehrLangerVeranstaltungsname".repeat(6);
    selection[0].storedValues.description += " " + "LangerQuellenwert".repeat(25);
    const dialog = await openBatch(page, selection);
    await importEvidence(dialog, evidenceFor(selection), true);
    await expect(dialog.locator("[data-freshness-edition]")).toHaveCount(25);
    expect(await page.evaluate(() => Boolean(window.injected))).toBe(false);
    await expect(dialog.locator("img")).toHaveCount(0);
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      const dimensions = await dialog.evaluate(element => ({
        left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
        client: element.clientWidth, scroll: element.scrollWidth,
        page: document.documentElement.scrollWidth, viewport: window.innerWidth
      }));
      expect(dimensions.viewport).toBe(width);
      expect(dimensions.left).toBeGreaterThanOrEqual(0);
      expect(dimensions.right).toBeLessThanOrEqual(dimensions.viewport + 1);
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
      expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await confirmAll(dialog, selection);
    const submit = dialog.getByRole("button", { name: "Paket bestätigen", exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    const box = await submit.boundingBox();
    // Browser zoom/scroll transforms can round 44 CSS px to 43.99988.
    expect(box.height).toBeGreaterThanOrEqual(43.99);
    await submit.tap();
    await expect(dialog).toHaveCount(0);
    const calls = await page.evaluate(() => window.rpcCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0].p_edition_ids).toHaveLength(25);
    expect(Object.keys(calls[0].p_evidence)).toHaveLength(25);
  });
});
