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
const check = (page, name) => page.locator(`[data-maintenance-confirm="${name}"]`);

async function fixture(page, mode = "success", viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.route("**/maintenance-fixture", route => route.fulfill({ contentType: "text/html", body: '<html lang="de" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main></body></html>' }));
  await page.goto("/maintenance-fixture");
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: descriptions });
  await page.addScriptTag({ content: script });
  await page.evaluate(async ({ mode, editionId, nextId }) => {
    window.db = { event: { id: 7, canonical_name: "Berliner Prüflauf", event_name: "Berliner Prüflauf", sport: "Running", city: "Berlin", country: "Germany", address: "Startstraße 10", latitude: 52.52, longitude: 13.4, description: "Offizieller Lauf über mehrere angebotene Distanzen in Berlin.", official_url: "https://example.test/event", organizer_name: "Laufverein", organizer_url: "https://example.test" }, editions: [{ id: editionId, event_id: 7, edition_year: 2026, edition_key: "main", start_date: "2026-10-10", end_date: "2026-10-10", edition_status: "scheduled", registration_status: "registration_open", registration_url: "https://example.test/register", source_url: "https://example.test/2026", publication_status: mode === "publication" ? "draft" : "published", race_formats: [{ label: "10 km", distance_km: 10, surface: "road" }], legacy_distance: "10 km" }], sources: [], candidates: [], version: "one" };
    window.calls = []; window.reads = 0; window.commits = 0; window.receipts = {}; window.mode = mode;
    const client = {
      from() { return { select() { return this; }, ilike() { return this; }, order() { return this; }, async limit() { return { data: [structuredClone(window.db.event)] }; } }; },
      async rpc(name, args) {
        if (name === "admin_manual_event_context") { window.reads++; return { data: structuredClone(window.db) }; }
        const request = args.p_request; window.calls.push(structuredClone(request));
        if (window.mode === "permission") return { error: { code: "42501", message: "Nur Administratoren dürfen Events pflegen." } };
        if (window.mode === "conflict") return { error: { code: "40001", message: "Die Daten wurden inzwischen geändert." } };
        if (window.mode === "http_conflict") return { error: { code: "PT409", message: "Die Daten wurden inzwischen geändert. Neu laden und die Änderungen erneut prüfen; Ihre Eingaben bleiben erhalten." } };
        if (window.mode === "zero") return { data: { saved: false, request_id: request.request_id } };
        if (window.receipts[request.request_id]) return { data: { ...window.receipts[request.request_id], replayed: true } };
        let edition = window.db.editions.find(row => row.id === request.edition_id);
        if (request.action === "create") { edition = { id: nextId, event_id: 7, edition_status: "date_unconfirmed", registration_status: "unknown", publication_status: "draft", race_formats: [] }; window.db.editions.unshift(edition); }
        Object.assign(window.db.event, request.event_patch); Object.assign(edition, request.edition_patch);
        for (const path of request.clear_fields) { const [scope, key] = path.split("."); (scope === "event" ? window.db.event : edition)[key] = null; }
        window.db.version += "x"; window.commits++;
        const receipt = { saved: true, request_id: request.request_id, event_id: 7, edition_id: edition.id, context: structuredClone(window.db), publication: { status: window.mode === "publication" && request.publish ? "failed" : edition.publication_status === "draft" ? "draft" : "database_public", error: "source health failed" }, freshness: { verified: false } };
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
  await page.locator("[data-maintenance-notes]").fill("Offizielle Ausschreibung persönlich geprüft.");
  await page.locator("[data-maintenance-preview]").click();
  await expect(page.locator("[data-maintenance-preview-box]")).toBeVisible();
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

for (const width of [390, 1280]) test(`manual: ${width}px date correction, targeted confirmation, preview and DB reload`, async ({ page }) => {
  await fixture(page, "success", { width, height: 900 });
  await expect(page.locator("[data-maintenance-open-source]")).toHaveAttribute("target", "_blank");
  await field(page, "edition.start_date").fill("2026-10-11");
  await check(page, "edition.start_date").check();
  await preview(page);
  await expect(page.locator("[data-maintenance-preview-box]")).toContainText("Enddatum");
  expect(await page.evaluate(() => window.calls)).toEqual([]);
  await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert und neu geladen");
  await expect(field(page, "edition.start_date")).toHaveValue("2026-10-11");
  const result = await page.evaluate(() => ({ calls: window.calls, db: window.db, reads: window.reads }));
  expect(result.calls).toHaveLength(1);
  expect(result.calls[0].confirmations).toEqual(["edition.start_date"]);
  expect(result.calls[0].event_patch).toEqual({});
  expect(result.calls[0].edition_patch).toEqual({ start_date: "2026-10-11", end_date: "2026-10-11" });
  expect(result.db.event.description).toContain("Offizieller Lauf");
  expect(result.reads).toBe(2);
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Öffentlich aktualisiert: Normale Detailseite geprüft");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("manual: unchanged date reconfirmation and hidden/empty values do not delete", async ({ page }) => {
  await fixture(page);
  await field(page, "edition.registration_url").fill("");
  await check(page, "edition.start_date").check();
  await preview(page);
  await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  const request = await page.evaluate(() => window.calls[0]);
  expect(request.edition_patch).toEqual({}); expect(request.clear_fields).toEqual([]);
  await expect(field(page, "edition.registration_url")).toHaveValue("https://example.test/register");
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
  await expect(page.locator("[data-maintenance-source]")).toHaveValue("https://example.test/2026");
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
  await page.locator("[data-maintenance-source]").fill("https://example.test/winter");
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  const result = await page.evaluate(() => ({ editions: window.db.editions, call: window.calls[0] }));
  expect(result.editions).toHaveLength(2);
  expect(result.editions.find(row => row.id === editionId).start_date).toBe("2026-10-10");
  expect(result.call.edition_patch).toEqual({ edition_year: 2026, edition_key: "winter" });
  expect(result.call.confirmations).toEqual([]);
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Privater Entwurf");
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
  await fixture(page, "lost"); await check(page, "edition.start_date").check();
  await preview(page); await page.locator("[data-maintenance-save]").dblclick();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  const result = await page.evaluate(() => ({ calls: window.calls, commits: window.commits }));
  expect(result.calls).toHaveLength(2); expect(result.calls[0]).toEqual(result.calls[1]); expect(result.commits).toBe(1);
});

test("manual: authorization and zero-row outcomes preserve inputs and never report success", async ({ page }) => {
  for (const mode of ["permission", "zero"]) {
    await fixture(page, mode); await field(page, "edition.start_date").fill("2026-10-12");
    await preview(page); await page.locator("[data-maintenance-save]").click();
    await expect(page.locator("[data-maintenance-status]")).toHaveClass(/is-error/);
    await expect(page.locator("[data-maintenance-status]")).not.toContainText("In der Datenbank gespeichert");
    await expect(field(page, "edition.start_date")).toHaveValue("2026-10-12");
    await expect(page.locator("[data-maintenance-notes]")).toHaveValue("Offizielle Ausschreibung persönlich geprüft.");
  }
});

for (const mode of ["conflict", "http_conflict"]) test(`manual: ${mode} reload preserves edited field and requires renewed review`, async ({ page }) => {
  await fixture(page, mode); await field(page, "edition.start_date").fill("2026-10-12");
  await check(page, "edition.start_date").check(); await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("Zwischenzeitlich wurden diese Daten geändert. Deine Eingaben bleiben erhalten.");
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits }))).toEqual({ calls: 1, commits: 0 });
  await expect(field(page, "edition.start_date")).toHaveValue("2026-10-12");
  await expect(page.locator("[data-maintenance-notes]")).toHaveValue("Offizielle Ausschreibung persönlich geprüft.");
  await expect(page.locator("[data-maintenance-status]")).not.toContainText("Speicherstand ist noch unklar");
  await page.evaluate(() => { window.db.event.city = "Potsdam"; window.db.version = "two"; window.mode = "success"; });
  await page.locator("[data-maintenance-reload]").click();
  await expect(field(page, "event.city")).toHaveValue("Potsdam");
  await expect(field(page, "edition.start_date")).toHaveValue("2026-10-12");
  await expect(check(page, "edition.start_date")).not.toBeChecked();
  await expect(page.locator("[data-maintenance-preview-box]")).toHaveCount(0);
  await check(page, "edition.start_date").check(); await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  expect(await page.evaluate(() => window.calls[1].expected_version)).toBe("two");
  expect(await page.evaluate(() => window.calls[1].request_id !== window.calls[0].request_id)).toBe(true);
  expect(await page.evaluate(() => ({ calls: window.calls.length, commits: window.commits }))).toEqual({ calls: 2, commits: 1 });
});

test("manual: unreachable source is not confirmation; publication fetch failure remains retryable", async ({ page }) => {
  await fixture(page); await check(page, "edition.start_date").check();
  await page.locator("[data-maintenance-source-result]").selectOption("unreachable");
  await page.locator("[data-maintenance-notes]").fill("Offizielle Website ist derzeit nicht erreichbar.");
  await page.locator("[data-maintenance-preview]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("dürfen keine Felder bestätigt");
  expect(await page.evaluate(() => window.calls)).toEqual([]);
  await check(page, "edition.start_date").uncheck();
  await page.evaluate(() => { window.failPublic = true; });
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Veröffentlichung konnte nicht geprüft werden");
  await page.evaluate(() => { window.failPublic = false; });
  await page.locator("[data-maintenance-check-publication]").click();
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Öffentlich aktualisiert: Normale Detailseite geprüft");
  expect(await page.evaluate(() => window.commits)).toBe(1);
});

test("manual: explicit full publication failure saves draft and explains retry without false public success", async ({ page }) => {
  await fixture(page, "publication");
  await page.locator("details").evaluateAll(elements => elements.forEach(element => { element.open = true; }));
  const paths = await page.evaluate(() => window.SemManualEventMaintenance.REQUIRED_CHECKS);
  for (const path of paths) await check(page, path).check();
  await page.locator("[data-maintenance-publish]").check();
  await preview(page); await page.locator("[data-maintenance-save]").click();
  await expect(page.locator("[data-maintenance-status]")).toContainText("In der Datenbank gespeichert");
  await expect(page.locator("[data-maintenance-publication]")).toContainText("Veröffentlichung fehlgeschlagen");
  await expect(page.locator("[data-maintenance-publication]")).not.toContainText("Im öffentlichen Live-Archiv geprüft");
  await expect(page.locator("[data-maintenance-publish]")).not.toBeChecked();
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
  await page.locator("[data-maintenance-search-form]").getByRole("button", { name: "Suchen" }).click();
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
  await page.evaluate(key => { window[key] = true; }, failure);
  await check(page, 'edition.start_date').check(); await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('noch nicht vollständig verifiziert');
  await expect(page.locator('[data-maintenance-publication]')).not.toContainText('Öffentlich aktualisiert');
  await page.evaluate(key => { window[key] = false; }, failure);
  await page.locator('[data-maintenance-check-publication]').click();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert');
  expect(await page.evaluate(() => window.commits)).toBe(1);
});
