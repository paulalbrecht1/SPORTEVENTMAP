import {
  closeEventDrawer,
  expect,
  openEventDrawer,
  prepareApp,
  searchForEvent,
  test,
  waitForEventList
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

test("Discovery search, drawer and filters remain usable", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];
  const tri = fixtureByName["SEM E2E Olympic Triathlon"];

  await prepareApp(page, { openDiscoveryPanel: false });

  await expect(page.getByTestId("map")).toBeVisible();
  await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await page.getByTestId("discovery-panel-toggle").click();
  await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(page.getByTestId("event-list")).toBeVisible();
  await expect(page.getByTestId("event-card")).toHaveCount(4);

  await openEventDrawer(page, run.event_name);
  await expect(page.getByTestId("drawer-event-name")).toContainText(run.event_name);
  await expect(page.getByTestId("event-drawer")).toContainText(run.city);
  await expect(page.getByTestId("event-drawer")).toContainText(run.date);
  await closeEventDrawer(page);

  await expect(page.getByTestId("event-search")).toHaveValue(run.event_name);
  await expect(page.getByTestId("event-card")).toHaveCount(1);

  await page.getByTestId("event-search").fill("SEM E2E definitely no result");
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await expect(page.getByTestId("event-list")).toContainText(/No|Keine|events/i);

  await page.getByTestId("event-search").fill("");
  await page.waitForFunction(() =>
    document.querySelectorAll("[data-testid='event-card']").length === 4
  );

  if (await page.getByTestId("discovery-panel-toggle").getAttribute("aria-expanded") === "false") {
    await page.getByTestId("discovery-panel-toggle").click();
  }
  await page.locator("#countryFilter").selectOption("DE");
  await expect(page.locator("#discoveryFilterCount")).toHaveText("1");
  await expect(page.getByTestId("event-card")).toHaveCount(4);
  await page.locator("#countryFilter").selectOption("AT");
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await page.getByTestId("filter-reset").click();
  await expect(page.locator("#countryFilter")).toHaveValue("all");

  await waitForEventList(page);
  await page.getByTestId("filter-sport-triathlon").click();
  await expect(page.locator("#discoveryFilterCount")).toBeVisible();
  await expect(page.locator("#discoveryFilterCount")).toHaveText("1");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card").first()).toContainText(tri.event_name);

  await page.getByTestId("filter-reset").click();
  await expect(page.locator("#discoveryFilterCount")).toBeHidden();
  await page.waitForFunction(() =>
    document.querySelectorAll("[data-testid='event-card']").length === 4
  );

  await searchForEvent(page, run.event_name);
  await expect(page.getByTestId("event-card")).toHaveCount(1);
});

test("Mobile Discovery filters stay tappable", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await page.setViewportSize({ width: 390, height: 844 });
  await prepareApp(page, { openDiscoveryPanel: false });

  const panelToggle = page.getByTestId("discovery-panel-toggle");
  const runningFilter = page.getByTestId("filter-sport-running");

  await panelToggle.click();
  await expect(panelToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#eventListToolbar")).toBeHidden();
  await expect(page.locator("#eventList")).toBeHidden();
  await expect(page.locator("#sidebar-header")).toHaveCSS("overflow-y", "auto");
  await page.waitForFunction(() =>
    !document.body.classList.contains("sidebar-is-transitioning")
  );
  await expect(runningFilter).toBeVisible();
  await runningFilter.click();

  await expect(runningFilter).toHaveClass(/active/);
  await expect(page.locator("#discoveryFilterCount")).toHaveText("1");
  await expect(page.getByTestId("event-card")).toHaveCount(3);
  await expect(
    page.getByTestId("event-card").filter({ hasText: run.event_name })
  ).toHaveCount(1);
});

test("closing an event restores the previous mobile map view", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];
  const previousView = {
    center: [48.1372, 11.5756],
    zoom: 11
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await prepareApp(page, { openDiscoveryPanel: false });
  await page.waitForTimeout(300);

  await page.evaluate(({ center, zoom }) => {
    map.setView(center, zoom, { animate: false });
  }, previousView);

  await openEventDrawer(page, run.event_name);
  await expect.poll(() => page.evaluate(() => map.getZoom())).toBe(14);

  await closeEventDrawer(page);

  await expect.poll(() => page.evaluate(() => ({
    center: [map.getCenter().lat, map.getCenter().lng],
    zoom: map.getZoom()
  }))).toEqual(previousView);
  await expect(page).toHaveURL(/#\/discovery$/);
});

test("official website button stays in the drawer flow in both themes", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await page.setViewportSize({ width: 1280, height: 720 });
  await prepareApp(page, { openDiscoveryPanel: false });
  await openEventDrawer(page, run.event_name);

  const websiteButton = page.locator("#eventDrawer .drawer-button");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(activeTheme => {
      document.documentElement.setAttribute("data-theme", activeTheme);
    }, theme);

    await expect(websiteButton).toHaveCSS("position", "static");
    await expect(websiteButton).toHaveCSS("bottom", "auto");
    await expect(websiteButton).toHaveCSS("z-index", "auto");
  }
});

test("fullscreen custom range aligns and sport pills are not clipped", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await prepareApp(page);
  await page.locator("#toggleEventListFullscreen").click();
  await page.locator("#dateFilter").selectOption("custom");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(activeTheme => {
      document.documentElement.setAttribute("data-theme", activeTheme);
    }, theme);

    const geometry = await page.evaluate(() => {
      const range = document.querySelector("#dateRangeFilter.active");
      const dateCard = range.closest(".filter-date-card");
      const actions = range.querySelector(".date-range-actions");
      const filters = document.querySelector(".filter-sport-card #filters");
      const activePill = filters.querySelector(".filter-chip.active");
      const rect = element => {
        const bounds = element.getBoundingClientRect();

        return {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height
        };
      };

      return {
        range: rect(range),
        dateCard: rect(dateCard),
        actions: rect(actions),
        filters: rect(filters),
        activePill: rect(activePill),
        maxWidth: getComputedStyle(range).maxWidth,
        rangeOverflows: range.scrollWidth > range.clientWidth + 1
      };
    });

    expect(geometry.maxWidth).toBe("none");
    expect(geometry.range.width).toBeGreaterThan(geometry.dateCard.width * 0.9);
    expect(geometry.actions.right).toBeLessThanOrEqual(geometry.range.right + 1);
    expect(geometry.rangeOverflows).toBe(false);
    expect(geometry.activePill.top).toBeGreaterThanOrEqual(geometry.filters.top);
    expect(geometry.activePill.bottom).toBeLessThanOrEqual(geometry.filters.bottom);
  }
});
