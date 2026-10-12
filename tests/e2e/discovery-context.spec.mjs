import fs from "node:fs";
import {
  expect,
  prepareApp,
  test,
  waitForEventList
} from "./helpers/browser.mjs";
import { fixtureByName, fixtureEventsCsv } from "./helpers/fixtures.mjs";

const runs = Array.from({ length: 60 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    ...fixtureByName["SEM E2E Future Run"],
    event_name: `SEM Context Run ${number}`,
    date: `${String(28 - index % 28).padStart(2, "0")}.04.2099`,
    city: "Berlin",
    edition_slug: `sem-context-run-${number}-2099`,
    edition_id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
    event_id: index + 1,
    edition_year: 2099
  };
});
const catalog = [
  ...runs,
  { ...runs[0], event_name: "SEM Context Triathlon", sport: "Triathlon", edition_slug: "sem-context-triathlon-2099", edition_id: "22222222-2222-4222-8222-222222222222", event_id: 101 },
  { ...runs[0], event_name: "SEM Context Austria", city: "Vienna", country: "Austria", edition_slug: "sem-context-austria-2099", edition_id: "33333333-3333-4333-8333-333333333333", event_id: 102 }
];
const additionalColumns = ["edition_slug", "edition_id", "event_id", "edition_year"];
const csv = fixtureEventsCsv(catalog).trimEnd().split("\n").map((line, index) =>
  `${line};${index === 0 ? additionalColumns.join(";") : additionalColumns.map(key => catalog[index - 1][key]).join(";")}`
).join("\n") + "\n";

async function prepareContextCatalog(page, options = {}) {
  await prepareApp(page, { openDiscoveryPanel: false });
  await page.route("**/data/events.csv*", route => route.fulfill({ contentType: "text/csv", body: csv }));
  await page.route("**/js/config.js*", route => route.fulfill({
    contentType: "text/javascript", body: "window.SPORT_EVENT_MAP_CONFIG = {};"
  }));
  await page.route("**/data/event-editions-public.json", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ exported_at: "2026-10-01T12:00:00Z", editions: catalog })
  }));
  await page.route("**/data/event-detail-database.json*", route => route.fulfill({
    contentType: "application/json", body: "[]"
  }));
  // Use the application's real detail document and scripts at the catalog URL.
  // The local test server does not otherwise rewrite generated edition routes.
  await page.route("**/event/sem-context-*/", route => route.fulfill({
    contentType: "text/html",
    body: fs.readFileSync(new URL("../../event-detail.html", import.meta.url), "utf8")
  }));
  await page.reload();
  await waitForEventList(page, { openPanel: options.openPanel !== false });
  await expect(page.getByTestId("event-card")).toHaveCount(catalog.length);
  await page.waitForFunction(() => !document.body.classList.contains("sidebar-is-transitioning"));
}

async function openDetailFromList(page, index = 8) {
  const card = page.getByTestId("event-card").nth(index);
  const title = await card.locator(".event-title").innerText();
  const detail = card.locator(".event-status-action[data-event-detail-link]");
  await detail.scrollIntoViewIfNeeded();
  await expect(detail).toBeInViewport();
  const scrollTop = await page.getByTestId("event-list").evaluate(node => node.scrollTop);
  expect(scrollTop).toBeGreaterThan(100);
  await detail.click();
  await expect(page.locator("#liveDetailName")).toHaveText(title);
  return scrollTop;
}

async function expectListScroll(page, expected) {
  await expect.poll(async () => Math.abs(
    await page.getByTestId("event-list").evaluate(node => node.scrollTop) - expected
  )).toBeLessThanOrEqual(3);
}

async function returnFromDetail(page) {
  await page.locator(".event-detail-back").click();
  await expect(page).toHaveURL(/\/index\.html#\/discovery$/);
  // Do not use the default helper here: opening the panel would mask a failure
  // to restore the actual view selected before the detail navigation.
  await waitForEventList(page, { openPanel: false });
}

test("desktop detail return preserves search, combined filters, sorting and list position", async ({ page }) => {
  await prepareContextCatalog(page);
  await page.getByTestId("event-search").fill("SEM Context");
  await page.getByTestId("event-search").press("Enter");
  await page.getByTestId("filter-sport-running").click();
  await page.locator("#countryFilter").selectOption("DE");
  await page.locator("#distanceFilterToggle").click();
  await page.locator('[data-distance-filter="10k"]').click();
  await page.locator("#dateFilter").selectOption("custom");
  await page.locator("#dateFromFilter").fill("2099-04-01");
  await page.locator("#dateToFilter").fill("2099-04-30");
  await page.locator("#applyDateRangeFilter").click();
  await page.locator("#sortSelect").selectOption("name");
  await expect(page.getByTestId("event-card")).toHaveCount(runs.length);
  const expectedTitles = await page.locator("#eventList .event-title").allTextContents();
  const scrollTop = await openDetailFromList(page);

  await returnFromDetail(page);

  await expect(page.getByTestId("event-search")).toHaveValue("SEM Context");
  await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("event-list")).toBeVisible();
  await expect(page.getByTestId("filter-sport-running")).toHaveClass(/active/);
  await expect(page.locator("#countryFilter")).toHaveValue("DE");
  await expect(page.locator('[data-distance-filter="10k"]')).toHaveClass(/active/);
  await expect(page.locator("#dateFilter")).toHaveValue("custom");
  await expect(page.locator("#dateFromFilter")).toHaveValue("2099-04-01");
  await expect(page.locator("#dateToFilter")).toHaveValue("2099-04-30");
  await expect(page.locator("#sortSelect")).toHaveValue("name");
  await expect(page.locator("#eventList .event-title")).toHaveText(expectedTitles);
  await expectListScroll(page, scrollTop);
});

for (const returnMethod of ["browser back", "back link"]) {
test(`phone ${returnMethod} restores the selected list and its search position`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareContextCatalog(page, { openPanel: false });
  await page.getByTestId("event-search").fill("SEM Context Run Berlin");
  await page.getByTestId("event-search").press("Enter");
  await page.locator("#mobileListViewBtn").click();
  await expect(page.getByTestId("event-card")).toHaveCount(runs.length);
  const scrollTop = await openDetailFromList(page, 6);

  if (returnMethod === "browser back") {
    await page.goBack();
    await waitForEventList(page, { openPanel: false });
  } else {
    await returnFromDetail(page);
  }

  await expect(page.getByTestId("event-search")).toHaveValue("SEM Context Run Berlin");
  await expect(page.locator("#mobileListViewBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("event-list")).toBeVisible();
  await expect(page.getByTestId("event-card")).toHaveCount(runs.length);
  await expectListScroll(page, scrollTop);
});
}

test("fullscreen results keep their page and current scroll after return and catalog refresh", async ({ page }) => {
  await prepareContextCatalog(page);
  await page.getByTestId("event-search").fill("SEM Context Run Berlin");
  await page.getByTestId("event-search").press("Enter");
  await page.locator("#sortSelect").selectOption("name");
  await page.locator("#toggleEventListFullscreen").click();
  await page.locator("#eventListPagination button").last().click();
  await expect(page.locator(".event-list-page-info")).toHaveText(/(?:Page|Seite) 2 /);
  const expectedTitles = await page.locator("#eventList .event-title").allTextContents();
  const scrollTop = await openDetailFromList(page, 10);

  await returnFromDetail(page);

  await expect(page.locator("body")).toHaveClass(/event-list-fullscreen/);
  await expect(page.locator(".event-list-page-info")).toHaveText(/(?:Page|Seite) 2 /);
  await expect(page.locator("#eventList .event-title")).toHaveText(expectedTitles);
  await expectListScroll(page, scrollTop);

  // Continue browsing before a background catalog reload. The newer position
  // must win over the one captured before opening the detail page.
  await page.getByTestId("event-list").hover();
  await page.mouse.wheel(0, -240);
  const updatedScrollTop = Math.max(0, scrollTop - 240);
  await expectListScroll(page, updatedScrollTop);
  await page.evaluate(() => refreshEvents({ preserveView: true }));
  await expect(page.getByTestId("map")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".event-list-page-info")).toHaveText(/(?:Page|Seite) 2 /);
  await expect(page.locator("#eventList .event-title")).toHaveText(expectedTitles);
  await expectListScroll(page, updatedScrollTop);
});

test("resetting restored filters survives another detail round trip", async ({ page }) => {
  await prepareContextCatalog(page);
  await page.getByTestId("event-search").fill("SEM Context");
  await page.getByTestId("event-search").press("Enter");
  await page.getByTestId("filter-sport-running").click();
  await page.locator("#countryFilter").selectOption("DE");
  await page.locator("#sortSelect").selectOption("name");
  await expect(page.getByTestId("event-card")).toHaveCount(runs.length);
  await openDetailFromList(page);
  await returnFromDetail(page);
  await expect(page.locator("#countryFilter")).toHaveValue("DE");
  await expect(page.locator("#sortSelect")).toHaveValue("name");

  await page.getByTestId("filter-reset").click();
  await expect(page.getByTestId("event-search")).toHaveValue("");
  await expect(page.getByTestId("event-card")).toHaveCount(catalog.length);
  await openDetailFromList(page);
  await returnFromDetail(page);

  await expect(page.getByTestId("event-search")).toHaveValue("");
  await expect(page.getByTestId("filter-sport-all")).toHaveClass(/active/);
  await expect(page.getByTestId("filter-sport-running")).not.toHaveClass(/active/);
  await expect(page.locator("#countryFilter")).toHaveValue("all");
  await expect(page.locator("#dateFilter")).toHaveValue("all");
  await expect(page.locator("#sortSelect")).toHaveValue("date");
  await expect(page.getByTestId("event-card")).toHaveCount(catalog.length);
});

test("a malformed saved context does not block discovery or a new search", async ({ page }) => {
  await prepareContextCatalog(page);
  // Seed on the next document so the current page's pagehide save cannot
  // replace the damaged data before startup reads it. Clear its history copy.
  await page.addInitScript(() => {
    sessionStorage.setItem("sportEventMap.discoveryContext.v1", "{invalid-json");
    history.replaceState(null, "");
  });
  await page.reload();
  await waitForEventList(page);
  await expect(page.getByTestId("map")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByTestId("event-card")).toHaveCount(catalog.length);
  await page.getByTestId("event-search").fill(runs[0].event_name);
  await page.getByTestId("event-search").press("Enter");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card")).toContainText(runs[0].event_name);
});

test("returning from a drawer detail restores the original map viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareContextCatalog(page, { openPanel: false });
  await page.getByTestId("event-search").fill(runs[0].event_name);
  await page.getByTestId("event-search").press("Enter");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.locator("#mobileMapViewBtn").click();
  const previousView = { center: [48.1372, 11.5756], zoom: 11 };
  // Leaflet is a local stub in this suite. Set its public viewport API to
  // represent a user pan, then use the real drawer and detail navigation.
  await page.evaluate(({ center, zoom }) => map.setView(center, zoom), previousView);
  await page.getByTestId("event-card").evaluate(card => card.click());
  await expect(page.getByTestId("event-drawer")).toHaveClass(/open/);
  // Reading and scrolling the drawer must not replace the original discovery
  // viewport with the temporary event-focused map position.
  await page.getByTestId("event-drawer").hover();
  await page.mouse.wheel(0, 160);
  await page.locator(".drawer-detail-button").click();
  await expect(page.locator("#liveDetailName")).toHaveText(runs[0].event_name);

  await returnFromDetail(page);

  await expect(page.locator("#mobileMapViewBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("event-search")).toHaveValue(runs[0].event_name);
  await expect(page.getByTestId("event-drawer")).not.toHaveClass(/open/);
  await expect.poll(() => page.evaluate(() => ({
    center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom()
  }))).toEqual(previousView);
});

test("a new search made while the drawer is open survives closing the drawer", async ({ page }) => {
  await prepareContextCatalog(page);
  const search = page.getByTestId("event-search");
  await search.fill(runs[0].event_name);
  await search.press("Enter");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.getByTestId("event-card").locator(".event-facts-grid").click();
  await expect(page.getByTestId("event-drawer")).toHaveClass(/open/);

  await search.fill("SEM Context Austria");
  await search.press("Enter");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card")).toContainText("SEM Context Austria");
  await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId("drawer-close").click();

  await expect(page).toHaveURL(/#\/discovery$/);
  await expect(page.getByTestId("event-drawer")).not.toHaveClass(/open/);
  await expect(search).toHaveValue("SEM Context Austria");
  await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("event-list")).toBeVisible();
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card")).toContainText("SEM Context Austria");
});

test("limited map APIs do not interrupt opening details or returning to the search list", async ({ page }) => {
  await prepareContextCatalog(page);
  await page.getByTestId("event-search").fill("SEM Context Run Berlin");
  await page.getByTestId("event-search").press("Enter");
  await expect(page.getByTestId("event-card")).toHaveCount(runs.length);
  await page.evaluate(() => {
    delete map.getCenter;
    delete map.stop;
  });
  // Apply the same reduced map API to the new discovery document on return.
  // Page errors remain checked by the standard fixture throughout this test.
  await page.addInitScript(() => {
    window.addEventListener("sport-event-map-discovery-ready", () => {
      delete map.getCenter;
      delete map.stop;
    });
  });
  const card = page.getByTestId("event-card").first();
  const title = await card.locator(".event-title").innerText();
  await card.locator(".event-facts-grid").click();
  await expect(page.getByTestId("event-drawer")).toHaveClass(/open/);
  await page.locator(".drawer-detail-button").click();
  await expect(page.locator("#liveDetailName")).toHaveText(title);

  await returnFromDetail(page);

  await expect(page.getByTestId("event-search")).toHaveValue("SEM Context Run Berlin");
  await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("event-list")).toBeVisible();
  await expect(page.getByTestId("event-card")).toHaveCount(runs.length);
});

test("reloading the drawer route after browser back preserves the original fullscreen search", async ({ page }) => {
  await prepareContextCatalog(page);
  await page.getByTestId("event-search").fill("SEM Context Run Berlin");
  await page.getByTestId("event-search").press("Enter");
  await page.locator("#sortSelect").selectOption("name");
  const previousView = { center: [48.1372, 11.5756], zoom: 11 };
  await page.evaluate(({ center, zoom }) => map.setView(center, zoom), previousView);
  await page.locator("#toggleEventListFullscreen").click();
  await page.locator("#eventListPagination button").last().click();
  await expect(page.locator(".event-list-page-info")).toHaveText(/(?:Page|Seite) 2 /);
  const expectedTitles = await page.locator("#eventList .event-title").allTextContents();
  const card = page.getByTestId("event-card").nth(10);
  const title = await card.locator(".event-title").innerText();
  const facts = card.locator(".event-facts-grid");
  await facts.scrollIntoViewIfNeeded();
  await expect(facts).toBeInViewport();
  const scrollTop = await page.getByTestId("event-list").evaluate(node => node.scrollTop);
  expect(scrollTop).toBeGreaterThan(100);
  await facts.click();
  await expect(page.getByTestId("event-drawer")).toHaveClass(/open/);
  await expect(page).toHaveURL(/#\/event\/[^/]+$/);
  await page.locator(".drawer-detail-button").click();
  await expect(page.locator("#liveDetailName")).toHaveText(title);

  await page.goBack();
  await expect(page).toHaveURL(/#\/event\/[^/]+$/);
  await expect(page.getByTestId("event-drawer")).toHaveClass(/open/);
  // Reinitialize the actual event route instead of relying on a cached DOM.
  await page.reload();
  await expect(page.getByTestId("event-drawer")).toHaveClass(/open/);
  await expect(page.getByTestId("drawer-event-name")).toHaveText(title);
  await page.getByTestId("drawer-close").click();

  await expect(page).toHaveURL(/#\/discovery$/);
  await expect(page.getByTestId("event-drawer")).not.toHaveClass(/open/);
  await expect(page.getByTestId("event-search")).toHaveValue("SEM Context Run Berlin");
  await expect(page.locator("#sortSelect")).toHaveValue("name");
  await expect(page.locator("body")).toHaveClass(/event-list-fullscreen/);
  await expect(page.locator(".event-list-page-info")).toHaveText(/(?:Page|Seite) 2 /);
  await expect(page.locator("#eventList .event-title")).toHaveText(expectedTitles);
  await expectListScroll(page, scrollTop);
  await expect.poll(() => page.evaluate(() => ({
    center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom()
  }))).toEqual(previousView);
});
