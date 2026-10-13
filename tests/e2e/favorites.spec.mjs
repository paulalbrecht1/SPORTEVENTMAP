import fs from "node:fs";
import {
  closeEventDrawer,
  expect,
  openEventDrawer,
  prepareApp,
  test,
  waitForEventList
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

test("Favorite state persists through drawer reopen and reload", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await prepareApp(page);
  await openEventDrawer(page, run.event_name);

  await page.getByTestId("drawer-favorite").click();
  await expect(page.getByTestId("drawer-favorite")).toHaveClass(/active/);

  await closeEventDrawer(page);
  await openEventDrawer(page, run.event_name);
  await expect(page.getByTestId("drawer-favorite")).toHaveClass(/active/);

  await closeEventDrawer(page);
  await page.reload();
  await openEventDrawer(page, run.event_name);
  await expect(page.getByTestId("drawer-favorite")).toHaveClass(/active/);

  await page.getByTestId("drawer-favorite").click();
  await expect(page.getByTestId("drawer-favorite")).not.toHaveClass(/active/);
});

test("Add-to-planner action is auth-gated for anonymous users", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await prepareApp(page);
  await openEventDrawer(page, run.event_name);

  await page.getByTestId("drawer-add-to-planner").click();
  await expect(page.getByTestId("drawer-add-to-planner")).toContainText("Add to Season");

  const favorites = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("favorites") || "[]")
  );

  expect(favorites).toEqual([]);
});

const favoriteRun = fixtureByName["SEM E2E Future Run"];
const otherRace = fixtureByName["SEM E2E Olympic Triathlon"];

async function favoriteCard(page, event) {
  const card = page.getByTestId("event-card").filter({ hasText: event.event_name });
  await card.getByTestId("event-card-favorite").click();
  await expect(card.getByTestId("event-card-favorite")).toHaveClass(/active/);
}

async function submitSearch(page, query) {
  await page.getByTestId("event-search").fill(query);
  await page.getByTestId("event-search").press("Enter");
}

for (const width of [1440, 390]) {
  test(`favorites and search intersect without exposing unsaved races at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepareApp(page, { openDiscoveryPanel: width > 767 });
    if (width <= 767) await page.locator("#mobileListViewBtn").click();
    else await page.locator("#toggleEventListFullscreen").click();
    await favoriteCard(page, favoriteRun);
    const favoritesToggle = page.locator("#eventListFavoritesToggle");
    await favoritesToggle.click();
    await expect(favoritesToggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("event-card")).toHaveCount(1);

    await submitSearch(page, otherRace.event_name);
    await expect(page.getByTestId("event-card")).toHaveCount(0);
    await expect(page.locator(".event-list-empty")).toBeVisible();
    await expect(favoritesToggle).toHaveAttribute("aria-pressed", "true");
    await submitSearch(page, favoriteRun.event_name);
    await expect(page.getByTestId("event-card")).toHaveCount(1);
    await expect(page.getByTestId("event-card")).toContainText(favoriteRun.event_name);

    await submitSearch(page, otherRace.event_name);
    await favoritesToggle.click();
    await expect(favoritesToggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("event-search")).toHaveValue(otherRace.event_name);
    await expect(page.getByTestId("event-card")).toHaveCount(1);
    await expect(page.getByTestId("event-card")).toContainText(otherRace.event_name);
  });
}

test("favorites intersect with sport, country and date filters in both interaction orders", async ({ page }) => {
  await prepareApp(page);
  await page.locator("#toggleEventListFullscreen").click();
  await favoriteCard(page, favoriteRun);
  await page.getByTestId("filter-sport-triathlon").click();
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.locator("#eventListFavoritesToggle").click();
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await expect(page.getByTestId("filter-sport-triathlon")).toHaveClass(/active/);

  await page.getByTestId("filter-sport-triathlon").click();
  await page.getByTestId("filter-sport-running").click();
  await page.locator("#countryFilter").selectOption("DE");
  await page.locator("#dateFilter").selectOption("custom");
  await page.locator("#dateFromFilter").fill("2030-09-01");
  await page.locator("#dateToFilter").fill("2030-09-30");
  await page.locator("#applyDateRangeFilter").click();
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card")).toContainText(favoriteRun.event_name);
  await page.locator("#countryFilter").selectOption("AT");
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await page.locator("#countryFilter").selectOption("DE");
  await page.locator("#dateFromFilter").fill("2030-10-01");
  await page.locator("#dateToFilter").fill("2030-10-31");
  await page.locator("#applyDateRangeFilter").click();
  // There is an unsaved running fixture in October; it must remain excluded.
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await expect(page.locator("#eventListFavoritesToggle")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("filter-reset").click();
  await expect(page.locator("#eventListFavoritesToggle")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#dateFilter")).toHaveValue("all");
  await expect(page.locator("#countryFilter")).toHaveValue("all");
  await expect(page.getByTestId("event-card")).toHaveCount(3);
});

test("removing matching and final favorites keeps the active search and favorites mode", async ({ page }) => {
  await prepareApp(page);
  await page.locator("#toggleEventListFullscreen").click();
  await favoriteCard(page, favoriteRun);
  await favoriteCard(page, otherRace);
  await page.locator("#eventListFavoritesToggle").click();
  await submitSearch(page, favoriteRun.event_name);
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.getByTestId("event-card-favorite").click();
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await expect(page.getByTestId("event-search")).toHaveValue(favoriteRun.event_name);
  await expect(page.locator("#eventListFavoritesToggle")).toHaveAttribute("aria-pressed", "true");

  await submitSearch(page, "");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card")).toContainText(otherRace.event_name);
  await page.getByTestId("event-card-favorite").click();
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await expect(page.locator(".event-list-empty")).toBeVisible();
  await expect(page.locator("#eventListFavoritesToggle")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#eventListFavoritesToggle").click();
  await expect(page.getByTestId("event-card")).toHaveCount(3);
});

test("returning from a standalone detail keeps the favorites filter and search", async ({ page }) => {
  await prepareApp(page);
  await page.locator("#toggleEventListFullscreen").click();
  const detailEvent = {
    ...favoriteRun,
    edition_slug: "sem-e2e-future-run-2030",
    edition_id: "11111111-1111-4111-8111-111111111111",
    event_id: 1,
    edition_year: 2030
  };
  await page.route("**/js/config.js*", route => route.fulfill({
    contentType: "text/javascript", body: "window.SPORT_EVENT_MAP_CONFIG = {};"
  }));
  await page.route("**/data/event-editions-public.json", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ exported_at: "2026-10-01T12:00:00Z", editions: [detailEvent] })
  }));
  await page.route("**/data/event-detail-database.json*", route => route.fulfill({
    contentType: "application/json", body: "[]"
  }));
  await page.route(`**/event/${detailEvent.edition_slug}/`, route => route.fulfill({
    contentType: "text/html",
    body: fs.readFileSync(new URL("../../event-detail.html", import.meta.url), "utf8")
  }));
  await favoriteCard(page, favoriteRun);
  await page.locator("#eventListFavoritesToggle").click();
  await submitSearch(page, "SEM E2E");
  // Use the actual title link to exercise native document navigation.
  await page.getByTestId("event-card").filter({ hasText: favoriteRun.event_name })
    .locator(".event-title-link").click();
  await expect(page.locator("#liveDetailName")).toHaveText(favoriteRun.event_name);
  await page.locator(".event-detail-back").click();
  await waitForEventList(page, { openPanel: false });

  await expect(page.getByTestId("event-search")).toHaveValue("SEM E2E");
  await expect(page.locator("#eventListFavoritesToggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card")).toContainText(favoriteRun.event_name);
});
