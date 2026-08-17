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

// Discovery mirrors public_event_discovery and excludes completed/past rows,
// including when the versioned CSV fallback is active.
const DISCOVERY_EVENT_COUNT = 3;
const RUNNING_DISCOVERY_EVENT_COUNT = 2;

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
  await expect(page.getByTestId("event-card")).toHaveCount(
    DISCOVERY_EVENT_COUNT
  );

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
  await page.waitForFunction(
    expectedCount =>
      document.querySelectorAll("[data-testid='event-card']").length ===
        expectedCount,
    DISCOVERY_EVENT_COUNT
  );

  if (await page.getByTestId("discovery-panel-toggle").getAttribute("aria-expanded") === "false") {
    await page.getByTestId("discovery-panel-toggle").click();
  }
  await page.locator("#countryFilter").selectOption("DE");
  await expect(page.locator("#discoveryFilterCount")).toHaveText("1");
  await expect(page.getByTestId("event-card")).toHaveCount(
    DISCOVERY_EVENT_COUNT
  );
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
  await page.waitForFunction(
    expectedCount =>
      document.querySelectorAll("[data-testid='event-card']").length ===
        expectedCount,
    DISCOVERY_EVENT_COUNT
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
  await expect(page.getByTestId("event-card")).toHaveCount(
    RUNNING_DISCOVERY_EVENT_COUNT
  );
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

test("Discovery initializes once and only reveals its final ready state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareApp(page, {
    route: "home",
    openDiscoveryPanel: false
  });

  await expect.poll(() =>
    page.evaluate(() => window.__discoveryMapDiagnostics.instances)
  ).toBe(0);

  await page.evaluate(() => {
    window.location.hash = "/discovery";
  });

  await expect(page.getByTestId("map")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#mapLoadingOverlay")).toBeHidden();
  await expect.poll(() =>
    page.evaluate(() => window.__discoveryMapDiagnostics.instances)
  ).toBe(1);

  await page.evaluate(() => {
    map.setView([48.1372, 11.5756], 11, { animate: false });
    window.location.hash = "/home";
  });
  await expect(page.locator("body")).toHaveClass(/landing-open/);

  await page.evaluate(() => {
    window.location.hash = "/discovery";
  });
  await expect(page.getByTestId("map")).toHaveAttribute("aria-busy", "false");

  const lifecycle = await page.evaluate(() => ({
    ...window.__discoveryMapDiagnostics,
    center: [map.getCenter().lat, map.getCenter().lng],
    zoom: map.getZoom()
  }));

  expect(lifecycle.instances).toBe(1);
  expect(lifecycle.activations).toBe(2);
  expect(lifecycle.center).toEqual([48.1372, 11.5756]);
  expect(lifecycle.zoom).toBe(11);
});

test("Home to Discovery reaches the final shell before markers are revealed", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await prepareApp(page, {
    route: "home",
    openDiscoveryPanel: false
  });

  const initialClusterColor = await page.evaluate(() => {
    const defaultClusterStyles = document.createElement("style");
    defaultClusterStyles.textContent = `
      .marker-cluster-small {
        background: rgba(110, 204, 57, 0.6);
      }
    `;
    document.head.append(defaultClusterStyles);

    const cluster = document.createElement("div");
    cluster.className = "marker-cluster marker-cluster-small";
    cluster.innerHTML = "<div><span>3</span></div>";
    document.querySelector("#map").append(cluster);

    return getComputedStyle(cluster).backgroundColor;
  });

  expect(initialClusterColor).toBe("rgba(15, 118, 110, 0.28)");

  await page.evaluate(() => {
    window.__discoveryTransitionTiming = {
      startedAt: null,
      landingClosedAt: null,
      readyAt: null
    };
    window.__discoveryTransitionFrames = [];

    const sampleDiscoveryShell = () => {
      const now = performance.now();
      const mapElement = document.querySelector("#map");
      const sidebarElement = document.querySelector("#sidebar");
      const drawerElement = document.querySelector("#eventDrawer");

      window.__discoveryTransitionFrames.push({
        time: now,
        mapWidth: mapElement.getBoundingClientRect().width,
        sidebarWidth: sidebarElement.getBoundingClientRect().width,
        drawerWidth: drawerElement.getBoundingClientRect().width,
        drawerPosition: getComputedStyle(drawerElement).position,
        drawerOpen: drawerElement.classList.contains("open"),
        busy: mapElement.getAttribute("aria-busy") === "true"
      });

      if (
        window.__discoveryTransitionTiming.readyAt === null ||
        now - window.__discoveryTransitionTiming.readyAt < 300
      ) {
        requestAnimationFrame(sampleDiscoveryShell);
      }
    };

    document.addEventListener(
      "click",
      event => {
        if (event.target.closest('[data-landing-route="discovery"]')) {
          window.__discoveryTransitionTiming.startedAt = performance.now();
          requestAnimationFrame(sampleDiscoveryShell);
        }
      },
      { capture: true, once: true }
    );

    const observer = new MutationObserver(() => {
      if (
        window.__discoveryTransitionTiming.landingClosedAt === null &&
        !document.body.classList.contains("landing-open")
      ) {
        window.__discoveryTransitionTiming.landingClosedAt = performance.now();
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"]
    });

    window.addEventListener(
      "sport-event-map-discovery-ready",
      () => {
        window.__discoveryTransitionTiming.readyAt = performance.now();
        observer.disconnect();
      },
      { once: true }
    );
  });

  await page
    .locator('.landing-page [data-landing-route="discovery"]')
    .first()
    .click();

  await expect(page.getByTestId("map")).toHaveAttribute("aria-busy", "false");
  await page.waitForTimeout(320);

  const transition = await page.evaluate(() => {
    const topbar = document.querySelector("#topbar").getBoundingClientRect();
    const app = document.querySelector("#app").getBoundingClientRect();

    const visibleMapWidths = window.__discoveryTransitionFrames
      .filter(frame => !frame.busy)
      .map(frame => frame.mapWidth);
    const visibleShellFrames = window.__discoveryTransitionFrames
      .filter(frame => !frame.busy);

    return {
      ...window.__discoveryTransitionTiming,
      bodyClasses: document.body.className,
      appGap: app.top - topbar.bottom,
      appHeight: app.height,
      visibleMapWidthDelta:
        Math.max(...visibleMapWidths) - Math.min(...visibleMapWidths),
      maxVisibleSidebarWidth:
        Math.max(...visibleShellFrames.map(frame => frame.sidebarWidth)),
      maxVisibleClosedDrawerWidth:
        Math.max(...visibleShellFrames
          .filter(frame => !frame.drawerOpen)
          .map(frame => frame.drawerWidth)),
      visibleDrawerPositions:
        [...new Set(visibleShellFrames.map(frame => frame.drawerPosition))]
    };
  });

  expect(transition.landingClosedAt).not.toBeNull();
  expect(transition.readyAt).not.toBeNull();
  expect(transition.startedAt).not.toBeNull();
  expect(transition.landingClosedAt).toBeLessThanOrEqual(transition.readyAt);
  expect(transition.landingClosedAt - transition.startedAt).toBeLessThan(150);
  expect(transition.bodyClasses).not.toMatch(/landing-(open|exiting|revealing-app)/);
  expect(transition.appGap).toBeGreaterThanOrEqual(11);
  expect(transition.appGap).toBeLessThanOrEqual(13);
  expect(transition.appHeight).toBeGreaterThan(600);
  expect(transition.visibleMapWidthDelta).toBeLessThanOrEqual(1);
  expect(transition.maxVisibleSidebarWidth).toBeLessThanOrEqual(1);
  expect(transition.maxVisibleClosedDrawerWidth).toBeLessThanOrEqual(2.5);
  expect(transition.visibleDrawerPositions).toEqual(["absolute"]);
});

test("combined filters keep marker and result state identical", async ({ page }) => {
  await prepareApp(page);

  await page.getByTestId("filter-sport-running").click();
  await page.locator("#distanceFilterToggle").click();
  await page.locator('[data-distance-filter="10k"]').click();
  await page.locator("#countryFilter").selectOption("DE");
  await page.locator("#dateFilter").selectOption("upcoming");

  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card").first()).toContainText(
    "SEM E2E Future Run"
  );

  const synchronizedKeys = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('[data-testid="event-card"]')]
      .map(card => card.dataset.key)
      .sort(),
    markers: [...window.__visibleDiscoveryMarkerKeys].sort()
  }));

  expect(synchronizedKeys.markers).toEqual(synchronizedKeys.cards);

  await page.getByTestId("filter-reset").click();
  await expect(page.getByTestId("event-card")).toHaveCount(
    DISCOVERY_EVENT_COUNT
  );
  await expect(page.getByTestId("filter-sport-all")).toHaveClass(/active/);
  await expect(page.locator('[data-distance-filter="10k"]')).not.toHaveClass(/active/);
  await expect(page.locator("#countryFilter")).toHaveValue("all");
  await expect(page.locator("#dateFilter")).toHaveValue("all");

  const resetCounts = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-testid="event-card"]').length,
    markers: window.__visibleDiscoveryMarkerKeys.length
  }));

  expect(resetCounts.markers).toBe(resetCounts.cards);
});
