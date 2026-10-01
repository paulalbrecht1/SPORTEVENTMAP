import { test, expect } from "@playwright/test";
import { prepareApp } from "./helpers/browser.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { writeCatalogSnapshot } = require("../../tools/export-supabase-event-catalog.js");

test("A simulated primary outage keeps search and standalone detail on the same saved edition", async ({ page }) => {
  const measuredAt = new Date().toISOString();
  const event = {
    id: 7, event_id: 7, edition_id: "11111111-1111-4111-8111-111111111111", edition_year: 2099,
    edition_slug: "fallback-release-fixture-2099", slug: "fallback-release-fixture",
    event_name: "SEM saved release fixture", sport: "Running", date: "15.03.2099", city: "Berlin", country: "Germany",
    address: "Teststrasse", latitude: 52.52, longitude: 13.4, distance: "10 km",
    description: 'The synthetic official release fixture contains a saved edition, a confirmed race date and competition facts.\nThe second "quoted" line belongs to the same event.',
    event_url: "https://example.test/2099", source_url: "https://example.test/2099", official_url: "https://example.test/2099",
    registration_url: "https://example.test/register/2099", registration_status: "registration_open",
    verification_status: "verified", last_checked: "2026-09-29T12:00:00Z", next_check: new Date(Date.now()+86400000).toISOString(),
    event_status: "scheduled", race_formats: [{ label: "10 km", distance_km: 10 }], end_date: "2099-03-15", start_time: "09:30:00"
  };
  const snapshot = { schema_version: 1, consistency: "single_statement", measured_at: measuredAt,
    discovery_count: 1, archive_count: 1, discovery: [event], archive: [event],
    freshness_guard: { schema_version: 1, evaluated_at: measuredAt, requested_count: 1, decisions: { [event.edition_id]: true } } };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sem-fallback-browser-"));
  const args = { out: path.join(tmp,"events.csv"), archiveOut: path.join(tmp,"archive.json"), manifestOut: path.join(tmp,"manifest.json"), allowUnhealthy: false };
  const policy = { minimum_discovery_rows: 1, reference_discovery_rows: 1, maximum_discovery_drop_percent: 0,
    minimum_archive_rows: 1, reference_archive_rows: 1, maximum_archive_drop_percent: 0, minimum_freshness_rate: 55, minimum_completeness_rate: 45 };
  try {
    writeCatalogSnapshot({ args, snapshot, policy, exportedAt: measuredAt });
    const csv = fs.readFileSync(args.out,"utf8");
    const archive = fs.readFileSync(args.archiveOut,"utf8");
    await prepareApp(page);
    await page.route("**/data/events.csv*", route => route.fulfill({ contentType: "text/csv", body: csv }));
    const search = await page.evaluate(async () => {
      window.primaryAttempts = 0;
      supabaseClient.from = function () {
        window.primaryAttempts += 1;
        const query = { select(){return this;}, order(){return this;}, limit(){return this;},
          then(resolve){return Promise.resolve({ data:null, count:null, error:{message:"simulated primary unavailable",code:"503"} }).then(resolve);} };
        return query;
      };
      csvEventsPromise = null;
      await loadEvents((loaded,discovery) => { renderEventList(discovery); return true; });
      return { attempted: window.primaryAttempts, diagnostics:window.eventCatalogDiagnostics,
        event:events.find(row => row.edition_slug === "fallback-release-fixture-2099") };
    });
    expect(search.attempted).toBe(1);
    expect(search.diagnostics.source).toBe("csv-fallback");
    expect(search.diagnostics.fallbackReason).toBe("supabase-error");
    await expect(page.getByTestId("event-card")).toHaveCount(1);
    await expect(page.getByTestId("event-card")).toContainText(event.event_name);
    await page.route("**/js/config.js*", route => route.fulfill({ contentType:"text/javascript", body:'window.SPORT_EVENT_MAP_CONFIG={supabaseUrl:"https://catalog-outage.test",supabasePublishableKey:"public-fixture"};' }));
    await page.route("https://catalog-outage.test/rest/v1/**", route => route.fulfill({ status:503, contentType:"application/json", body:'{"message":"simulated primary unavailable"}' }));
    await page.route("**/data/event-editions-public.json", route => route.fulfill({ contentType:"application/json", body:archive }));
    await page.goto(`/event-detail.html?event=${event.edition_slug}`);
    await expect(page.locator("#liveDetailContent")).toBeVisible();
    await expect(page.locator("#liveDetailStatus")).toContainText(/gespeicherte[nr]? Datenstand|saved data/);
    await expect(page.locator("h1")).toContainText(event.event_name);
    const detail = await page.evaluate(() => window.sportEventMapDetailConfig.event);
    expect(detail.edition_id).toBe(search.event.edition_id);
    expect(detail.event_id).toBe(Number(search.event.event_id));
    expect(detail.date).toBe(search.event.date);
    expect(detail.last_checked).toBe(event.last_checked);
    expect(detail.registration_status).toBe(search.event.registration_status);
    expect(detail.race_formats).toEqual(search.event.race_formats);
    await expect(page.locator("#adminModal")).toHaveCount(0);
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
