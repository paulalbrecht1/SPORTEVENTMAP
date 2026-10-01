import fs from "node:fs";
import { expect, test } from "@playwright/test";

const script = fs.readFileSync(new URL("../../js/manual-event-maintenance.js", import.meta.url), "utf8");
const descriptions = fs.readFileSync(new URL("../../js/event-description.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../../css/style.css", import.meta.url), "utf8");
const adminSource = fs.readFileSync(new URL("../../js/supabase.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const editionId = "11111111-1111-4111-8111-111111111111";
const nextId = "22222222-2222-4222-8222-222222222222";
const field = (page, name) => page.locator(`[data-maintenance-field="${name}"]`);
const modal = page => page.locator('dialog[data-maintenance-preview-box]');

async function fixture(page, mode = "success", viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.route("**/maintenance-fixture", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<html lang="de" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main></body></html>' }));
  await page.goto("/maintenance-fixture");
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: descriptions });
  await page.addScriptTag({ content: script });
  await page.evaluate(async ({ mode, editionId, nextId }) => {
    window.db = { event: { id: 7, canonical_name: "Berliner Prüflauf", event_name: "Berliner Prüflauf", sport: "Running", city: "Berlin", country: "Germany", address: "Startstraße 10", latitude: 52.52, longitude: 13.4, description: "Offizieller Lauf über mehrere angebotene Distanzen in Berlin.", official_url: "https://example.test/event", organizer_name: "Laufverein", organizer_url: "https://example.test" }, editions: [{ id: editionId, event_id: 7, edition_year: 2026, edition_key: "main", start_date: "2026-10-10", end_date: "2026-10-10", edition_status: "scheduled", registration_status: "registration_open", registration_url: "https://example.test/register", source_url: "https://example.test/2026", publication_status: mode === "publication" ? "draft" : "published", race_formats: [{ label: "10 km", distance_km: 10, surface: "road" }], legacy_distance: "10 km" }], sources: [], candidates: [], version: "one" };
    // Synthetic transport exercises the UI contract; it is not a database or
    // evidence of production transaction/RLS behaviour.
    window.calls = []; window.reads = 0; window.commits = 0; window.receipts = {}; window.mode = mode; window.staticRefreshRequired = true;
    const client = {
      from() { return { select() { return this; }, ilike() { return this; }, order() { return this; }, async limit() { return { data: [structuredClone(window.db.event)] }; } }; },
      async rpc(name, args) {
        if (name === "admin_manual_event_context") {
          window.reads++;
          const context = structuredClone(window.db);
          if (window.mode === "readback_mismatch" && window.commits) context.editions[0].start_date = "2026-10-10";
          return { data: context };
        }
        const request = args.p_request; window.calls.push(structuredClone(request));
        if (window.mode === "permission") return { error: { code: "42501", message: "Nur Administratoren dürfen Events pflegen." } };
        if (window.mode === "conflict") return { error: { code: "40001", message: "Die Daten wurden inzwischen geändert." } };
        if (window.mode === "http_conflict") return { error: { code: "PT409", message: "Die Daten wurden inzwischen geändert. Neu laden und die Änderungen erneut prüfen; Ihre Eingaben bleiben erhalten." } };
        if (window.mode === "zero") return { data: { saved: false, request_id: request.request_id } };
        if (window.mode === "zero_changed") return { data: { saved: true, affected_rows: 0, request_id: request.request_id, event_id: 7, edition_id: request.edition_id } };
        if (window.receipts[request.request_id]) return { data: { ...window.receipts[request.request_id], replayed: true } };
        let edition = window.db.editions.find(row => row.id === request.edition_id);
        if (request.action === "create") { edition = { id: nextId, event_id: 7, edition_status: "date_unconfirmed", registration_status: "unknown", publication_status: "draft", race_formats: [] }; window.db.editions.unshift(edition); }
        Object.assign(window.db.event, request.event_patch); Object.assign(edition, request.edition_patch);
        for (const path of request.clear_fields) { const [scope, key] = path.split("."); (scope === "event" ? window.db.event : edition)[key] = null; }
        if (request.publish && edition.start_date && ['scheduled', 'postponed'].includes(edition.edition_status) && edition.race_formats.length && window.mode !== "publication") edition.publication_status = "published";
        window.db.version += "x"; window.commits++;
        const receipt = { saved: true, request_id: request.request_id, event_id: window.db.event.id, edition_id: edition.id, context: structuredClone(window.db), publication: { status: window.mode === "publication" && request.publish ? "failed" : edition.publication_status === "draft" ? "draft" : "database_public", error: "source health failed", static_refresh_required: window.staticRefreshRequired }, freshness: { verified: false } };
        window.receipts[request.request_id] = receipt;
        if (window.mode === "lost") { window.mode = "success"; throw new Error("Network response lost"); }
        return { data: receipt };
      }
    };
    window.testClient = client;
    window.app = window.SemManualEventMaintenance.mount({ root: document.querySelector("#root"), client, verifyPublication: async ({ edition }) => {
      if (window.failPublic) throw new Error("Öffentlicher Katalog nicht erreichbar.");
      return edition.publication_status === "draft" ? { status: "draft" } : { status: "live_verified", archiveVerified: true, discoveryVerified: true };
    }, verifyDetail: async () => ({ detailVerified: !window.failDetail, detailUrl: '/event/test-edition/' }), refreshCatalog: async () => ({ refreshed: !window.failRefresh }) });
    await window.app.loadEvent(7, editionId);
  }, { mode, editionId, nextId });
}

async function preview(page) {
  await page.locator("[data-maintenance-preview]").click();
  await expect(modal(page)).toBeVisible();
  await expect(modal(page)).toHaveJSProperty("open", true);
  await expect(modal(page).locator('[data-maintenance-save]')).toHaveText("Übernehmen und speichern");
}

async function searchFixture(page, viewport) {
  await fixture(page, 'success', viewport);
  await page.evaluate(nextId => {
    const second = structuredClone(window.db);
    Object.assign(second.event, { id: 8, canonical_name: 'Hamburger Prüflauf', event_name: 'Hamburger Prüflauf', city: 'Hamburg' });
    Object.assign(second.editions[0], { id: nextId, event_id: 8, edition_year: 2027, start_date: '2027-04-11', end_date: '2027-04-11' });
    window.searchContexts = { 7: window.db, 8: second };
    window.deferredTransport = [];
    window.deferSearch = false; window.deferContext = false;
    window.testClient.from = () => ({
      query: '', select() { return this; }, ilike(_, query) { this.query = query.replace(/^%|%$/g, '').toLowerCase(); return this; }, order() { return this; },
      async limit() {
        const data = Object.values(window.searchContexts).map(context => context.event).filter(event => event.canonical_name.toLowerCase().includes(this.query));
        if (window.deferSearch) return new Promise((resolve, reject) => window.deferredTransport.push({ kind: 'search', resolve, reject, data: structuredClone(data) }));
        return { data: structuredClone(data) };
      }
    });
    const originalRpc = window.testClient.rpc.bind(window.testClient);
    window.testClient.rpc = async (name, args) => {
      if (name !== 'admin_manual_event_context') return originalRpc(name, args);
      if (window.deferContext) return new Promise((resolve, reject) => window.deferredTransport.push({ kind: 'context', resolve, reject, data: structuredClone(window.searchContexts[args.p_event_id]) }));
      if (Number(args.p_event_id) === 7) return originalRpc(name, args);
      return { data: structuredClone(window.searchContexts[args.p_event_id]) };
    };
  }, nextId);
}

async function searchEvent(page, query, id) {
  await page.locator('[data-maintenance-search]').fill(query);
  await page.locator('[data-maintenance-search-form]').getByRole('button', { name: 'Suchen', exact: true }).click();
  await expect(page.locator(`[data-maintenance-event="${id}"]`)).toBeVisible();
}

async function expectClosedSearch(page) {
  await expect(page.locator('[data-maintenance-editor]')).toBeEmpty();
  await expect(page.locator('[data-maintenance-results]')).toBeEmpty();
  await expect(page.locator('[data-maintenance-publication]')).toBeEmpty();
  await expect(page.locator('[data-maintenance-search]')).toHaveValue('');
  await expect(page.locator('[data-maintenance-search]')).toBeFocused();
  await expect(page.locator('[data-maintenance-close]')).toBeHidden();
  expect(await page.evaluate(() => window.app.getContext())).toBeNull();
}

test("manual: legacy race proposals remain readable and escaped in the review preview", async ({ page }) => {
  await fixture(page);
  const formats = [
    { type: "distance", unit: "km", value: 3.35, original: "3,35 km" },
    { type: "distance", unit: "km", value: 25, original: "25 km" },
    { type: "half_marathon", unit: "km", value: 21.0975, original: "Halbmarathon" },
    { type: "distance", unit: "km", value: 7.5 },
    { type: "distance", unit: "m", value: 500 },
    { type: "distance", unit: "km", value: 5, original: '<img src=x onerror="window.previewInjected=true">' }
  ];
  await page.evaluate(async ({ formats, editionId }) => {
    window.db.proposals = [{ id: "legacy-race-proposal", entity_type: "edition", edition_id: editionId,
      field_name: "race_formats", old_value: [{ label: "Triathlon", distance_km: 51.5, swim_km: 1.5, bike_km: 40, run_km: 10, elevation_gain_m: 320 }],
      normalized_value: formats, proposal_status: "pending", source_url: "https://example.test/2026" }];
    await window.app.loadEvent(7, editionId);
  }, { formats, editionId });
  const row = page.locator('[data-maintenance-review-row="legacy-race-proposal"]');
  for (const value of ["3,35 km", "25 km", "Halbmarathon", "7,5 km", "500 m", "Triathlon (51.5 km)", "Schwimmen: 1.5 km", "Radfahren: 40 km", "Laufen: 10 km", "Höhenmeter: 320 m", formats.at(-1).original]) {
    await expect(row.locator("p").first()).toContainText(value);
  }
  await row.locator("[data-maintenance-review-notes]").fill("Originalausschreibung geprüft; ältere automatisch erfasste Formate als Vorschlag lesbar verglichen.");
  await row.locator("[data-maintenance-review-preview]").click();
  const box = row.locator("[data-maintenance-preview-box]");
  await expect(box).toBeVisible();
  for (const value of ["3,35 km", "25 km", "Halbmarathon", "7,5 km", "500 m", "Triathlon (51.5 km)", formats.at(-1).original]) await expect(box).toContainText(value);
  await expect(row.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => window.previewInjected)).toBeUndefined();
  expect(await page.evaluate(() => window.calls)).toEqual([]);
  expect(await page.evaluate(() => window.db.proposals[0].normalized_value)).toEqual(formats);
});

test('manual: cancelling or escaping the approval modal sends no request and preserves the edits', async ({ page }) => {
  await fixture(page);
  await field(page, 'edition.start_date').fill('2026-10-11');
  await preview(page);
  await modal(page).locator('[data-maintenance-back]').click();
  await expect(modal(page)).toHaveCount(0);
  await expect(field(page, 'edition.start_date')).toHaveValue('2026-10-11');
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits }))).toEqual({ calls: 0, commits: 0 });
  await preview(page);
  await page.keyboard.press('Escape');
  await expect(modal(page)).not.toBeVisible();
  await expect(field(page, 'edition.start_date')).toHaveValue('2026-10-11');
  expect(await page.evaluate(() => window.calls)).toEqual([]);
});

test('manual: a cross-year date correction defaults to retaining the selected edition identity', async ({ page }) => {
  await fixture(page);
  await field(page, 'edition.start_date').fill('2027-10-11');
  await preview(page);
  await expect(modal(page).locator('[data-maintenance-year-choice][value="current"]')).toBeChecked();
  await expect(modal(page).locator('[data-maintenance-year-choice][value="create"]')).not.toBeChecked();
  expect(await page.evaluate(() => window.calls)).toEqual([]);
  await modal(page).locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  const result = await page.evaluate(() => ({ call: window.calls[0], editions: window.db.editions }));
  expect(result.call.action).toBe('correct');
  expect(result.call.edition_id).toBe(editionId);
  expect(result.call.edition_patch).toEqual({ start_date: '2027-10-11', end_date: '2027-10-11' });
  expect(result.editions).toHaveLength(1);
  expect(result.editions[0]).toMatchObject({ id: editionId, edition_year: 2026, start_date: '2027-10-11' });
});

test('manual: explicit new year creates a distinct edition without copying untouched annual facts or evidence', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    Object.assign(window.db.editions[0], { price_min: 30, price_max: 40, currency: 'EUR', participant_limit: 500, start_time: '09:30:00' });
    window.db.verifications = [{ entity_id: window.db.editions[0].id, created_at: '2026-09-29T08:00:00Z', new_value: { field: 'edition.start_date', value: '2026-10-10', result: 'confirmed' } }];
    await window.app.loadEvent(7);
  });
  const before = await page.evaluate(() => structuredClone(window.db.editions[0]));
  await field(page, 'edition.start_date').fill('2027-10-11');
  await field(page, 'edition.source_url').fill('https://example.test/2027');
  await preview(page);
  await modal(page).locator('[data-maintenance-year-choice][value="create"]').check();
  await modal(page).locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  const result = await page.evaluate(() => ({ call: window.calls[0], editions: window.db.editions, verifications: window.db.verifications }));
  expect(result.call.action).toBe('create');
  expect(result.call.event_patch).toEqual({});
  expect(result.call.edition_patch).toMatchObject({ edition_year: 2027, edition_key: 'main', start_date: '2027-10-11', end_date: '2027-10-11', source_url: 'https://example.test/2027' });
  expect(result.call.edition_patch.race_formats).toEqual([]);
  expect(result.call.edition_patch.registration_status).toBe('unknown');
  for (const key of ['price_min', 'price_max', 'currency', 'participant_limit', 'registration_url', 'start_time']) expect(result.call.edition_patch).not.toHaveProperty(key);
  expect(result.call.confirmations).toEqual([]);
  expect(result.call.knowledge).toBeUndefined();
  expect(result.editions).toHaveLength(2);
  expect(result.editions.find(row => row.id === editionId)).toEqual(before);
  expect(result.editions.find(row => row.id === nextId)).toMatchObject({ edition_year: 2027, registration_status: 'unknown', race_formats: [] });
  expect(result.verifications.map(row => row.entity_id)).toEqual([editionId]);
});

test('manual: existing target year and edition key prevent an accidental duplicate new edition', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async nextId => {
    window.db.editions.push({ ...structuredClone(window.db.editions[0]), id: nextId, edition_year: 2027, start_date: '2027-10-10', end_date: '2027-10-10' });
    await window.app.loadEvent(7);
  }, nextId);
  await field(page, 'edition.start_date').fill('2027-10-11');
  await preview(page);
  await modal(page).locator('[data-maintenance-year-choice][value="create"]').check();
  await expect(modal(page).locator('[data-maintenance-save]')).toBeDisabled();
  await expect(modal(page).locator('[data-maintenance-dialog-error]')).toContainText(/bereits|existiert/);
  expect(await page.evaluate(() => ({ calls: window.calls.length, editions: window.db.editions.length }))).toEqual({ calls: 0, editions: 2 });
  await expect(field(page, 'edition.start_date')).toHaveValue('2027-10-11');
});

test('manual: saved true with zero changed rows cannot replace a value readback check', async ({ page }) => {
  await fixture(page, 'zero_changed');
  await field(page, 'edition.start_date').fill('2026-10-11');
  await preview(page);
  await modal(page).locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toHaveClass(/is-error/);
  await expect(page.locator('[data-maintenance-status]')).not.toContainText('In der Datenbank gespeichert');
  await expect(page.locator('[data-maintenance-publication]')).not.toContainText('Öffentlich aktualisiert');
  await expect(field(page, 'edition.start_date')).toHaveValue('2026-10-11');
  expect(await page.evaluate(() => ({ reads: window.reads, commits: window.commits, stored: window.db.editions[0].start_date }))).toMatchObject({ commits: 0, stored: '2026-10-10' });
});

test('manual: double approval commits one operation', async ({ page }) => {
  await fixture(page);
  await field(page, 'edition.start_date').fill('2026-10-11');
  await preview(page);
  await modal(page).locator('[data-maintenance-save]').click({ clickCount: 2 });
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits }))).toEqual({ calls: 1, commits: 1 });
});

test('manual: an unchanged form never pretends to have saved changed facts', async ({ page }) => {
  await fixture(page);
  await page.locator('[data-maintenance-preview]').click();
  await expect(page.locator('[data-maintenance-status]')).toHaveClass(/is-error/);
  await expect(modal(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.calls)).toEqual([]);
});

test('manual: start time and core prices persist after approving and reloading the edition', async ({ page }) => {
  await fixture(page);
  await page.getByText('Optionale Details und Veranstalterangaben', { exact: true }).click();
  await field(page, 'edition.start_time').fill('09:45');
  await field(page, 'edition.price_min').fill('35');
  await field(page, 'edition.price_max').fill('45');
  await field(page, 'edition.currency').fill('EUR');
  await preview(page);
  await expect(modal(page)).toContainText('Startzeit');
  await expect(modal(page)).toContainText('09:45');
  await modal(page).locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  const patch = await page.evaluate(() => window.calls[0].edition_patch);
  expect(patch).toMatchObject({ start_time: '09:45', price_min: 35, price_max: 45, currency: 'EUR' });
  await page.evaluate(async editionId => window.app.loadEvent(7, editionId), editionId);
  await page.getByText('Optionale Details und Veranstalterangaben', { exact: true }).click();
  await expect(field(page, 'edition.start_time')).toHaveValue('09:45');
  await expect(field(page, 'edition.price_min')).toHaveValue('35');
  await expect(field(page, 'edition.price_max')).toHaveValue('45');
  await expect(field(page, 'edition.currency')).toHaveValue('EUR');
});

for (const width of [390, 1280]) test(`manual: ${width}px date correction, modal approval and readback`, async ({ page }, testInfo) => {
  await fixture(page, "success", { width, height: 900 });
  await expect(page.locator("[data-maintenance-open-source]")).toHaveAttribute("target", "_blank");
  await field(page, "edition.start_date").fill("2026-10-11");
  await expect(page.locator('[data-maintenance-confirm]')).toHaveCount(0);
  await expect(page.locator('[data-maintenance-preview]')).toHaveText('Änderungen speichern');
  await preview(page);
  await expect(page.locator("[data-maintenance-preview-box]")).toContainText("Enddatum");
  expect(await page.evaluate(() => window.calls)).toEqual([]);
  expect(await modal(page).evaluate(element => ({ width: element.getBoundingClientRect().width, scroll: element.scrollWidth, client: element.clientWidth }))).toMatchObject({ scroll: expect.any(Number), client: expect.any(Number) });
  if (width === 390) {
    const box = await modal(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    await modal(page).screenshot({ path: testInfo.outputPath('manual-save-modal-mobile.png') });
  }
  await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert und neu geladen");
  await expect(field(page, "edition.start_date")).toHaveValue("2026-10-11");
  const result = await page.evaluate(() => ({ calls: window.calls, db: window.db, reads: window.reads }));
  expect(result.calls).toHaveLength(1);
  expect(result.calls[0].confirmations).toEqual([]);
  expect(result.calls[0].manual_approval).toBe(true);
  expect(result.calls[0].publish).toBe(true);
  expect(result.calls[0].event_patch).toEqual({});
  expect(result.calls[0].edition_patch).toEqual({ start_date: "2026-10-11", end_date: "2026-10-11" });
  expect(result.db.event.description).toContain("Offizieller Lauf");
  expect(result.reads).toBe(2);
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Öffentlich aktualisiert: Normale Detailseite geprüft");
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Ausfallexport: Veröffentlichung erforderlich");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (width === 390) await page.locator("[data-maintenance-publication]").screenshot({ path: testInfo.outputPath("manual-publication-status-mobile.png") });
});

test("manual: intentionally emptied optional fields are cleared without mandatory source or notes", async ({ page }) => {
  await fixture(page);
  await field(page, "edition.registration_url").fill("");
  await field(page, 'edition.source_url').fill('');
  await field(page, 'event.city').fill('Potsdam');
  await expect(page.locator('[data-maintenance-notes]')).toHaveValue('');
  await preview(page);
  await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  const request = await page.evaluate(() => window.calls[0]);
  expect(request.event_patch).toEqual({ city: 'Potsdam' });
  expect(request.edition_patch).toEqual({}); expect(request.clear_fields).toEqual(['edition.registration_url', 'edition.source_url']);
  expect(request.confirmations).toEqual([]);
  expect(request.manual_approval).toBe(true);
  await expect(field(page, "edition.registration_url")).toHaveValue('');
  await expect(field(page, 'edition.source_url')).toHaveValue('');
});

test("manual: edition evidence source wins over an earlier registration source", async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const edition = window.db.editions[0];
    window.db.sources = [
      { edition_id: edition.id, is_active: true, source_type: "official_registration_platform", source_url: "https://example.test/register" },
      { edition_id: edition.id, is_active: true, source_type: "official_event_website", source_url: edition.source_url }
    ];
    await window.app.loadEvent(7, edition.id);
  });
  await expect(field(page, 'edition.source_url')).toHaveValue("https://example.test/2026");
  await expect(page.locator("[data-maintenance-open-source]")).toHaveAttribute("href", "https://example.test/2026");
});

test("manual: explicit removal, status select and formats retain unexposed properties", async ({ page }) => {
  await fixture(page);
  await page.locator('[data-maintenance-clear="edition.registration_url"]').check();
  await field(page, "edition.registration_status").selectOption("sold_out");
  await page.locator("[data-format-label]").fill("Hauptlauf 10 km");
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  const request = await page.evaluate(() => window.calls[0]);
  expect(request.clear_fields).toEqual(["edition.registration_url"]);
  expect(request.edition_patch.registration_status).toBe("sold_out");
  expect(request.edition_patch.race_formats[0]).toEqual({ label: "Hauptlauf 10 km", distance_km: 10, surface: "road" });
});

test("manual: new same-year edition has no inherited dates, races or verification", async ({ page }) => {
  await fixture(page);
  await page.locator("[data-maintenance-action]").selectOption("create");
  await expect(field(page, "event.canonical_name")).toBeDisabled();
  await expect(field(page, "edition.start_date")).toHaveValue("");
  await expect(field(page, "edition.registration_url")).toHaveValue("");
  await expect(page.locator("[data-maintenance-format]")).toHaveCount(0);
  await field(page, "edition.edition_year").fill("2026");
  await field(page, "edition.edition_key").fill("winter");
  await field(page, 'edition.source_url').fill("https://example.test/winter");
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  const result = await page.evaluate(() => ({ editions: window.db.editions, call: window.calls[0] }));
  expect(result.editions).toHaveLength(2);
  expect(result.editions.find(row => row.id === editionId).start_date).toBe("2026-10-10");
  expect(result.call.edition_patch).toMatchObject({ edition_year: 2026, edition_key: "winter", source_url: 'https://example.test/winter' });
  expect(result.call.confirmations).toEqual([]);
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Privater Entwurf");
  await expect(page.locator("[data-maintenance-publication]")).toContainText("öffentliche Übernahme ausstehend");
  await expect(page.locator("[data-maintenance-publication]")).not.toContainText("Ausfallexport: Veröffentlichung erforderlich");
});

test("manual: fallback publication state requires the server flag, including when public readback fails", async ({ page }) => {
  for (const flag of [false, undefined, true]) {
    await fixture(page);
    await page.evaluate(flag => { window.staticRefreshRequired = flag; window.failPublic = true; }, flag);
    await field(page, 'edition.start_date').fill('2026-10-11');
    await preview(page); await page.locator("[data-maintenance-save]").click();
    const publication = page.locator("[data-maintenance-publication]");
    await expect(publication).toContainText("Veröffentlichung konnte nicht geprüft werden");
    if (flag === true) await expect(publication).toContainText("Ausfallexport: Veröffentlichung erforderlich");
    else await expect(publication).not.toContainText("Ausfallexport: Veröffentlichung erforderlich");
    await expect(publication).not.toContainText("Öffentlich aktualisiert");
    expect(await page.evaluate(() => window.commits)).toBe(1);
  }
});

test("manual: triathlon legs and elevation are visible, editable and only explicitly cleared", async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    Object.assign(window.db.editions[0].race_formats[0], { label: "Triathlon", swim_km: 1.5, bike_km: 40, run_km: 10, elevation_gain_m: 200 });
    await window.app.loadEvent(7);
  });
  await expect(page.locator(".maintenance-format-details summary")).toContainText("Radfahren: 40 km");
  await page.locator(".maintenance-format-details summary").click();
  await page.locator('[data-format-detail="bike_km"]').fill("42");
  await page.locator('[data-format-detail="swim_km"]').fill("");
  await page.locator('[data-format-clear="elevation_gain_m"]').check();
  await preview(page);
  await expect(page.locator("[data-maintenance-preview-box]")).toContainText("Radfahren: 42 km");
  await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  const race = await page.evaluate(() => window.calls[0].edition_patch.race_formats[0]);
  expect(race.bike_km).toBe(42); expect(race.swim_km).toBe(1.5); expect(race.run_km).toBe(10); expect(race.elevation_gain_m).toBeUndefined();
});

test("manual: field history distinguishes matching values, changed facts and failed sources", async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const common = { entity_id: window.db.editions[0].id, created_at: "2026-09-29T08:00:00Z", reason: "Offizielle Quelle persönlich geprüft." };
    window.db.verifications = [
      { ...common, new_value: { field: "edition.start_date", value: "2026-10-10", result: "confirmed", source_url: "https://example.test/2026" } },
      { ...common, new_value: { field: "event.city", value: "Potsdam", result: "confirmed" } },
      { ...common, new_value: { result: "unreachable", source_url: "https://example.test/2026" } }
    ];
    await window.app.loadEvent(7);
  });
  await page.locator(".maintenance-history > summary").click();
  await expect(page.locator(".maintenance-history")).toContainText("Datum: Wert entspricht der letzten Prüfung");
  await expect(page.locator(".maintenance-history")).toContainText("Ort: Wert seit der Prüfung geändert");
  await expect(page.locator(".maintenance-history")).toContainText("Quelle nicht erreichbar – keine Bestätigung");
});

test("manual: lost response replays identical operation once without duplicate", async ({ page }) => {
  await fixture(page, "lost"); await field(page, 'edition.start_date').fill('2026-10-11');
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  const result = await page.evaluate(() => ({ calls: window.calls, commits: window.commits }));
  expect(result.calls).toHaveLength(2); expect(result.calls[0]).toEqual(result.calls[1]); expect(result.commits).toBe(1);
});

test("manual: a later failed save removes the previous publication success", async ({ page }) => {
  await fixture(page);
  await field(page, 'edition.start_date').fill('2026-10-11');
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert');
  await page.evaluate(() => { window.mode = 'permission'; });
  await field(page, 'edition.start_date').fill('2026-10-12');
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toHaveClass(/is-error/);
  await expect(page.locator('[data-maintenance-publication]')).toBeEmpty();
  await expect(field(page, 'edition.start_date')).toHaveValue('2026-10-12');
  expect(await page.evaluate(() => window.commits)).toBe(1);
});

test("manual: authorization and zero-row outcomes preserve inputs and never report success", async ({ page }) => {
  for (const mode of ["permission", "zero"]) {
    await fixture(page, mode); await field(page, "edition.start_date").fill("2026-10-12");
    await page.locator('[data-maintenance-notes]').fill('Offizielle Ausschreibung persönlich geprüft.');
    await preview(page); await page.locator("[data-maintenance-save]").click();
    await expect(page.locator("[data-maintenance-status]")).toHaveClass(/is-error/);
    await expect(page.locator("[data-maintenance-status]")).not.toContainText("In der Datenbank gespeichert");
    await expect(field(page, "edition.start_date")).toHaveValue("2026-10-12");
    await expect(page.locator("[data-maintenance-notes]")).toHaveValue("Offizielle Ausschreibung persönlich geprüft.");
  }
});

for (const mode of ["conflict", "http_conflict"]) test(`manual: ${mode} reload preserves edited field and requires renewed review`, async ({ page }) => {
  await fixture(page, mode); await field(page, "edition.start_date").fill("2026-10-12");
  await page.locator('[data-maintenance-notes]').fill('Offizielle Ausschreibung persönlich geprüft.');
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("Zwischenzeitlich wurden diese Daten geändert. Deine Eingaben bleiben erhalten.");
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits }))).toEqual({ calls: 1, commits: 0 });
  await expect(field(page, "edition.start_date")).toHaveValue("2026-10-12");
  await expect(page.locator("[data-maintenance-notes]")).toHaveValue("Offizielle Ausschreibung persönlich geprüft.");
  await expect(page.locator("[data-maintenance-status]")).not.toContainText("Speicherstand ist noch unklar");
  await page.evaluate(() => { window.db.event.city = "Potsdam"; window.db.version = "two"; window.mode = "success"; });
  await page.locator("[data-maintenance-reload]").click();
  await expect(field(page, "event.city")).toHaveValue("Potsdam");
  await expect(field(page, "edition.start_date")).toHaveValue("2026-10-12");
  await expect(page.locator("[data-maintenance-preview-box]")).toHaveCount(0);
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  expect(await page.evaluate(() => window.calls[1].expected_version)).toBe("two");
  expect(await page.evaluate(() => window.calls[1].request_id !== window.calls[0].request_id)).toBe(true);
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits }))).toEqual({ calls: 2, commits: 1 });
});

test("manual: missing public readback remains retryable and does not masquerade as source verification", async ({ page }) => {
  await fixture(page);
  await field(page, 'edition.start_date').fill('2026-10-11');
  await page.evaluate(() => { window.failPublic = true; });
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Veröffentlichung konnte nicht geprüft werden");
  await page.evaluate(() => { window.failPublic = false; });
  await page.locator("[data-maintenance-check-publication]").click();
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Öffentlich aktualisiert: Normale Detailseite geprüft");
  expect(await page.evaluate(() => window.commits)).toBe(1);
  expect(await page.evaluate(() => window.calls[0].confirmations)).toEqual([]);
});

test("manual: explicit full publication failure saves draft and explains retry without false public success", async ({ page }) => {
  await fixture(page, "publication");
  await field(page, 'edition.start_date').fill('2026-10-11');
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  await expect(page.locator("[data-maintenance-publication]")).toContainText("öffentliche Übernahme fehlgeschlagen");
  await expect(page.locator("[data-maintenance-publication]")).not.toContainText("Im öffentlichen Live-Archiv geprüft");
  expect(await page.evaluate(() => window.calls[0].publish)).toBe(true);
});

test("manual: real lazy loader avoids the cached pre-maintenance router and keeps the mobile form mounted", async ({ page }, testInfo) => {
  await fixture(page, "success", { width: 390, height: 844 });
  await page.evaluate(html => {
    const original = new DOMParser().parseFromString(html, "text/html");
    document.querySelectorAll('style').forEach(style => style.remove());
    document.head.appendChild(document.importNode(original.querySelector('link[href*="css/style.css"]'), true));
    document.body.replaceChildren(document.importNode(original.querySelector("#adminModal"), true));
    document.body.dataset.theme = "light";
    document.querySelector("#adminModal").classList.add("open");
  }, indexSource);
  const switchTab = adminSource.slice(adminSource.indexOf("function setAdminTab("), adminSource.indexOf("function setDataOpsStatus("));
  const tabMap = adminSource.slice(adminSource.indexOf("const ADMIN_TAB_PANEL_IDS ="), adminSource.indexOf("adminBtn.onclick ="));
  const loadedRuntimeUrls = [];
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js", route => route.fulfill({ contentType: "text/javascript", body: "/* SDK transport is supplied by the isolated fixture. */" }));
  await page.route("**/js/supabase.js?*", route => {
    loadedRuntimeUrls.push(new URL(route.request().url()).pathname + new URL(route.request().url()).search);
    // The old URL still has the v89 router in an existing browser's four-hour
    // HTTP cache. Reusing it reproduces the production fallback to Analytics.
    const servedMap = route.request().url().includes("20260908-freshness-batch-v127")
      ? tabMap.replace(/\s*eventMaintenance: "adminEventMaintenancePanel",/, "")
      : tabMap;
    return route.fulfill({ contentType: "text/javascript", body: `
    const supabaseClient = window.testClient;
    const SUPABASE_URL = 'https://example.test'; const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    const adminTabs = document.querySelectorAll('.admin-tab'); const adminTabPanels = document.querySelectorAll('.admin-tab-panel');
    ${servedMap}
    let currentAdminTab = 'analytics';
    const isCurrentUserAdmin = async () => true;
    const getFriendlyErrorMessage = error => error.message;
    ${switchTab}
    document.querySelector('[data-admin-tab="eventMaintenance"]').addEventListener('click', async () => {setAdminTab('eventMaintenance');await loadAdminTab('eventMaintenance');});
  ` });
  });
  await page.evaluate(html => {
    const original = new DOMParser().parseFromString(html, "text/html");
    const publishedLoader = original.querySelector("script[data-supabase-src]");
    const loader = document.createElement("script");
    for (const attribute of publishedLoader.attributes) loader.setAttribute(attribute.name, attribute.value);
    document.head.appendChild(loader);
  }, indexSource);
  await expect(page.locator("html")).toHaveAttribute("data-supabase-loaded", "true");
  await page.locator('[data-admin-tab="eventMaintenance"]').click();
  await expect(page.locator('[data-admin-tab="eventMaintenance"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#adminEventMaintenancePanel")).toBeVisible();
  expect(loadedRuntimeUrls).toEqual(["/" + indexSource.match(/data-supabase-src="([^"]+)"/)[1]]);
  await page.locator("[data-maintenance-search]").fill("Berliner");
  await page.locator("[data-maintenance-search-form]").getByRole("button", { name: "Suchen", exact: true }).click();
  await page.locator("[data-maintenance-event]").click();
  await expect(field(page, "edition.start_date")).toHaveValue("2026-10-10");
  await expect(page.locator(".maintenance-grid").first()).toHaveCSS("display", "grid");
  await page.locator('[data-admin-tab="eventMaintenance"]').click();
  await expect(field(page, "edition.start_date")).toHaveValue("2026-10-10");
  const overflow = await page.locator("#adminModal .admin-card").evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
  await page.locator("[data-maintenance-action]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("manual-admin-mobile-light.png"), fullPage: true });
  await page.evaluate(() => { document.body.dataset.theme = "dark"; document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({ path: testInfo.outputPath("manual-admin-mobile-dark.png"), fullPage: true });
});

for (const failure of ['failDetail', 'failRefresh']) test('manual: public API success cannot hide ' + failure + ' and retry verifies the website', async ({ page }) => {
  await fixture(page);
  await field(page, 'edition.start_date').fill('2026-10-11');
  await page.evaluate(key => { window[key] = true; }, failure);
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('öffentliche Übernahme ist noch nicht bestätigt');
  await expect(page.locator('[data-maintenance-publication]')).not.toContainText('Öffentlich aktualisiert');
  await page.evaluate(key => { window[key] = false; }, failure);
  await page.locator('[data-maintenance-check-publication]').click();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert');
  expect(await page.evaluate(() => window.commits)).toBe(1);
});

for (const width of [390, 1280]) test(`manual: closing the ${width}px selection permits searching and opening another event without writes`, async ({ page }, testInfo) => {
  await searchFixture(page, { width, height: 900 });
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  const close = page.locator('[data-maintenance-close]');
  await expect(close).toHaveText('Schließen und anderes Event suchen');
  await close.click();
  await expectClosedSearch(page);
  await searchEvent(page, 'Berliner', 7);
  await page.locator('[data-maintenance-event="7"]').click();
  await expect(field(page, 'event.city')).toHaveValue('Berlin');
  await expect(page.locator('[data-maintenance-results]')).toBeEmpty();
  const box = await close.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  if (width === 390) await page.locator('[data-maintenance-search-form]').screenshot({ path: testInfo.outputPath('manual-close-search-mobile.png') });
  await close.click();
  await expectClosedSearch(page);
  await searchEvent(page, 'Hamburger', 8);
  await page.locator('[data-maintenance-event="8"]').click();
  await expect(field(page, 'event.city')).toHaveValue('Hamburg');
  await expect(field(page, 'edition.start_date')).toHaveValue('2027-04-11');
  await expect(page.locator('[data-maintenance-results]')).toBeEmpty();
  expect(await page.evaluate(() => window.app.getContext().event.id)).toBe(8);
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits }))).toEqual({ calls: 0, commits: 0 });
  expect(dialogs).toBe(0);
});

test('manual: closing a saved selection clears its public message without another request or discard prompt', async ({ page }) => {
  await searchFixture(page);
  await field(page, 'edition.start_date').fill('2026-10-11');
  await preview(page);
  await modal(page).locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  await expect(page.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert');
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await page.locator('[data-maintenance-close]').click();
  await expectClosedSearch(page);
  expect(dialogs).toBe(0);
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits, date: window.db.editions[0].start_date }))).toEqual({ calls: 1, commits: 1, date: '2026-10-11' });
});

test('manual: a correction after closing and selecting another event saves only the newly selected edition', async ({ page }) => {
  await searchFixture(page);
  const original = await page.evaluate(() => structuredClone(window.searchContexts[7]));
  await page.locator('[data-maintenance-close]').click();
  await searchEvent(page, 'Hamburger', 8);
  await page.locator('[data-maintenance-event="8"]').click();
  // Use the selected synthetic database for the existing write/readback transport.
  await page.evaluate(() => { window.db = window.searchContexts[8]; });
  await field(page, 'edition.start_date').fill('2027-04-12');
  await preview(page);
  await modal(page).locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  expect(await page.evaluate(() => window.calls[0])).toMatchObject({ event_id: 8, edition_id: nextId, action: 'correct', edition_patch: { start_date: '2027-04-12', end_date: '2027-04-12' } });
  expect(await page.evaluate(() => window.searchContexts[7])).toEqual(original);
  expect(await page.evaluate(() => window.db.editions[0].start_date)).toBe('2027-04-12');
});

test('manual: closing a reverted edit and merely opened sections requires no discard confirmation', async ({ page }) => {
  await searchFixture(page);
  await field(page, 'edition.start_date').fill('2026-10-11');
  await field(page, 'edition.start_date').fill('2026-10-10');
  await page.getByText('Optionale Details und Veranstalterangaben', { exact: true }).click();
  await page.getByText('Zusatzdetails für Detailseite und Event-Wiki', { exact: true }).click();
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await page.locator('[data-maintenance-close]').click();
  await expectClosedSearch(page);
  expect(dialogs).toBe(0);
  expect(await page.evaluate(() => window.calls)).toEqual([]);
});

test('manual: closing a changed selection offers native discard confirmation and cancellation retains inputs', async ({ page }) => {
  await searchFixture(page);
  await field(page, 'edition.start_date').fill('2026-10-11');
  const before = await page.evaluate(() => structuredClone(window.db));
  const dialogs = [];
  page.once('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  await page.locator('[data-maintenance-close]').click();
  await expect(field(page, 'edition.start_date')).toHaveValue('2026-10-11');
  await expect(page.locator('[data-maintenance-close]')).toBeVisible();
  expect(await page.evaluate(() => window.app.getContext().event.id)).toBe(7);
  expect(dialogs).toEqual([{ type: 'confirm', message: expect.stringMatching(/Ungespeicherte Änderungen verwerfen/) }]);
  page.once('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); });
  await page.locator('[data-maintenance-close]').click();
  await expectClosedSearch(page);
  expect(dialogs).toHaveLength(2);
  expect(await page.evaluate(() => window.db)).toEqual(before);
  expect(await page.evaluate(() => window.calls)).toEqual([]);
});

for (const kind of ['knowledge', 'formats']) test(`manual: closing detects unsaved ${kind} changes without writing them`, async ({ page }) => {
  await searchFixture(page);
  if (kind === 'knowledge') {
    await page.getByText('Zusatzdetails für Detailseite und Event-Wiki', { exact: true }).click();
    await page.locator('[data-knowledge-section="race_day"] > summary').click();
    await page.locator('[data-knowledge-field="race_day.wave_start"]').fill('Neue Startwelle 10:30 Uhr');
  } else await page.locator('[data-format-label]').fill('Hauptlauf 10 km');
  let dialogs = 0;
  page.once('dialog', async dialog => { dialogs++; expect(dialog.type()).toBe('confirm'); await dialog.accept(); });
  await page.locator('[data-maintenance-close]').click();
  await expectClosedSearch(page);
  expect(dialogs).toBe(1);
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits }))).toEqual({ calls: 0, commits: 0 });
});

for (const kind of ['search', 'context']) for (const outcome of ['success', 'error']) test(`manual: closing ignores stale ${kind} ${outcome} after another event is opened`, async ({ page }) => {
  await searchFixture(page);
  await page.locator('[data-maintenance-close]').click();
  if (kind === 'search') {
    await page.evaluate(() => { window.deferSearch = true; });
    await page.locator('[data-maintenance-search]').fill('Berliner');
    await page.locator('[data-maintenance-search-form]').getByRole('button', { name: 'Suchen', exact: true }).click();
  } else {
    await searchEvent(page, 'Berliner', 7);
    await page.evaluate(() => { window.deferContext = true; });
    await page.locator('[data-maintenance-event="7"]').click();
  }
  await expect.poll(() => page.evaluate(() => window.deferredTransport.map(item => item.kind))).toEqual([kind]);
  await expect(page.locator('[data-maintenance-close]')).toBeEnabled();
  await page.locator('[data-maintenance-close]').click();
  await expectClosedSearch(page);
  await page.evaluate(() => { window.deferSearch = false; window.deferContext = false; });
  await searchEvent(page, 'Hamburger', 8);
  await page.locator('[data-maintenance-event="8"]').click();
  await expect(field(page, 'event.city')).toHaveValue('Hamburg');
  const currentStatus = await page.locator('[data-maintenance-status]').textContent();
  await page.evaluate(async outcome => {
    const deferred = window.deferredTransport.shift();
    deferred.resolve(outcome === 'success' ? { data: deferred.data } : { error: { code: 'TEST_STALE', message: 'Alte Anfrage fehlgeschlagen.' } });
    await new Promise(resolve => requestAnimationFrame(resolve));
  }, outcome);
  await expect(field(page, 'event.city')).toHaveValue('Hamburg');
  await expect(field(page, 'edition.start_date')).toHaveValue('2027-04-11');
  await expect(page.locator('[data-maintenance-status]')).toHaveText(currentStatus);
  await expect(page.locator('[data-maintenance-status]')).not.toHaveClass(/is-error/);
  await expect(page.locator('[data-maintenance-results]')).toBeEmpty();
  await expect(page.locator('[data-maintenance-search]')).toHaveValue('Hamburger');
  expect(await page.evaluate(() => window.app.getContext().event.id)).toBe(8);
  expect(await page.evaluate(() => window.calls)).toEqual([]);
});

test('manual: closing remains disabled during a pending save and is enabled after verified readback', async ({ page }) => {
  await searchFixture(page);
  await page.evaluate(() => {
    const originalRpc = window.testClient.rpc.bind(window.testClient);
    window.testClient.rpc = async (name, args) => {
      if (name === 'admin_manual_event_context') return originalRpc(name, args);
      await new Promise(resolve => { window.resumeSave = resolve; });
      return originalRpc(name, args);
    };
  });
  await field(page, 'edition.start_date').fill('2026-10-11');
  await preview(page);
  await modal(page).locator('[data-maintenance-save]').click();
  await expect.poll(() => page.evaluate(() => typeof window.resumeSave)).toBe('function');
  await expect(page.locator('[data-maintenance-close]')).toBeDisabled();
  expect(await page.evaluate(() => window.app.getContext().event.id)).toBe(7);
  await page.evaluate(() => window.resumeSave());
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  await expect(page.locator('[data-maintenance-close]')).toBeEnabled();
  await page.locator('[data-maintenance-close]').click();
  await expectClosedSearch(page);
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits }))).toEqual({ calls: 1, commits: 1 });
});

test('manual: closing cannot discard an unresolved save receipt', async ({ page }) => {
  await fixture(page, 'zero_changed');
  await field(page, 'edition.start_date').fill('2026-10-11');
  await preview(page);
  await modal(page).locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toHaveClass(/is-error/);
  await expect(page.locator('[data-maintenance-close]')).toBeDisabled();
  await expect(modal(page)).toBeVisible();
  await expect(modal(page).locator('[data-maintenance-save]')).toBeEnabled();
  await expect(field(page, 'edition.start_date')).toHaveValue('2026-10-11');
  expect(await page.evaluate(() => ({ context: window.app.getContext().event.id, calls: window.calls.length, commits: window.commits }))).toEqual({ context: 7, calls: 1, commits: 0 });
});
