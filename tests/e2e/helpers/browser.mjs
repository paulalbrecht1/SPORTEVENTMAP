import { expect, test as base } from "@playwright/test";
import { fixtureEventsCsv } from "./fixtures.mjs";

const ignoredConsolePatterns = [
  /PapaParse unavailable/i,
  /Supabase SDK unavailable/i,
  /Supabase approved events query failed/i,
  /Supabase features could not be lazy-loaded/i,
  /Auth and cloud sync are disabled/i,
  /Queued analytics event could not be sent/i
];

const externalHosts = [
  "unpkg.com",
  "cdn.jsdelivr.net",
  "tile.openstreetmap.org",
  "basemaps.cartocdn.com",
  "tile.opentopomap.org",
  "raw.githubusercontent.com",
  "cdnjs.cloudflare.com"
];

const leafletStub = `
  window.L = window.L || {
    icon() { return {}; },
    divIcon() { return {}; },
    layerGroup() {
      return {
        addLayer() {},
        addLayers() {},
        clearLayers() {},
        getLayers() { return []; }
      };
    },
    markerClusterGroup() { return this.layerGroup(); },
    map() {
      return {
        setView() { return this; },
        addLayer() {},
        removeLayer() {},
        fitBounds() {},
        flyTo() {},
        invalidateSize() {},
        closePopup() {},
        on() {},
        getZoom() { return 6; }
      };
    },
    tileLayer() {
      return { addTo() {}, remove() {} };
    },
    marker(coords) {
      return {
        bindPopup() { return this; },
        on() { return this; },
        openPopup() {},
        getLatLng() {
          return { lat: coords?.[0] || 0, lng: coords?.[1] || 0 };
        }
      };
    },
    circleMarker() {
      return { addTo() {} };
    },
    latLngBounds() {
      return {
        isValid() { return false; },
        extend() {}
      };
    },
    featureGroup() {
      return { getBounds() { return {}; } };
    }
  };
`;

export const test = base.extend({
  pageErrors: [async ({ page }, use) => {
    const errors = [];

    page.on("pageerror", error => {
      errors.push(error.message);
    });

    page.on("console", message => {
      if (message.type() !== "error") {
        return;
      }

      const text = message.text();

      if (ignoredConsolePatterns.some(pattern => pattern.test(text))) {
        return;
      }

      errors.push(text);
    });

    page.on("requestfailed", request => {
      const url = new URL(request.url());

      if (externalHosts.includes(url.hostname)) {
        return;
      }

      errors.push(
        `Request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`
      );
    });

    await use(errors);

    expect(errors).toEqual([]);
  }, { auto: true }]
});

export { expect };

export async function prepareApp(page, options = {}) {
  const {
    route = "discovery",
    favorites = [],
    seasonPlanMeta = {},
    allowPlanner = false,
    openDiscoveryPanel = true
  } = options;

  await routeStableAssets(page);

  await page.addInitScript(({ favorites, seasonPlanMeta }) => {
    if (window.localStorage.getItem("sportEventMap.e2ePrepared") === "true") {
      return;
    }

    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("sportEventMap.landingSeen", "true");
    window.localStorage.setItem("sportEventMap.betaWelcomeSeen", "true");
    window.localStorage.setItem("sportEventMap.betaBannerDismissed", "true");
    window.localStorage.setItem("sportEventMap.e2ePrepared", "true");
    window.localStorage.setItem("favorites", JSON.stringify(favorites));
    window.localStorage.setItem("seasonPlanMeta", JSON.stringify(seasonPlanMeta));
  }, {
    favorites,
    seasonPlanMeta
  });

  await page.goto(`/index.html#/${route}`);
  await waitForEventList(page, { openPanel: openDiscoveryPanel });

  if (allowPlanner) {
    await enablePlannerTestAuth(page);
  }

  await seedPlannerState(page, {
    favorites,
    seasonPlanMeta
  });
}

async function routeStableAssets(page) {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith("/data/events.csv")) {
      await route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: fixtureEventsCsv()
      });
      return;
    }

    if (!externalHosts.includes(url.hostname)) {
      await route.continue();
      return;
    }

    const resourceType = route.request().resourceType();

    if (resourceType === "stylesheet") {
      await route.fulfill({
        status: 200,
        contentType: "text/css",
        body: ""
      });
      return;
    }

    if (resourceType === "script") {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: url.href.includes("leaflet")
          ? leafletStub
          : ""
      });
      return;
    }

    await route.fulfill({
      status: 204,
      body: ""
    });
  });
}

export async function waitForEventList(page, options = {}) {
  const { openPanel = true } = options;
  await expect(page.getByTestId("event-list")).toBeAttached();

  if (openPanel) {
    const panelToggle = page.getByTestId("discovery-panel-toggle");

    if ((await panelToggle.getAttribute("aria-expanded")) !== "true") {
      await panelToggle.click();
    }

    await expect(panelToggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("event-list")).toBeVisible();
  }

  await page.waitForFunction(() =>
    document.querySelectorAll("[data-testid='event-card']").length > 0 ||
    document.querySelector(".event-empty")
  );
}

export async function searchForEvent(page, name) {
  await page.getByTestId("event-search").fill(name);
  await page.waitForFunction(searchTerm =>
    [...document.querySelectorAll("[data-testid='event-card']")]
      .some(card => card.textContent.includes(searchTerm)) ||
    document.querySelector(".event-empty"),
    name
  );
}

export async function openEventDrawer(page, name) {
  await waitForEventList(page);
  await searchForEvent(page, name);

  if (await page.locator("body.mobile-filter-open").count()) {
    await page.evaluate(() => {
      document.body.classList.remove("mobile-filter-open");
    });
    await expect(page.locator("body")).not.toHaveClass(/mobile-filter-open/);
  }

  await page
    .getByTestId("event-card")
    .filter({ hasText: name })
    .first()
    .click();
  await expect(page.getByTestId("event-drawer")).toHaveClass(/open/);
  await expect(page.getByTestId("drawer-event-name")).toContainText(name);
}

export async function closeEventDrawer(page) {
  await page.getByTestId("drawer-close").click();
  await expect(page.getByTestId("event-drawer")).not.toHaveClass(/open/);
}

export async function enablePlannerTestAuth(page) {
  await page.evaluate(() => {
    window.canOpenSeasonPlanner = async () => true;
    window.syncFavoriteToSupabase = async () => {};
    window.syncSeasonPlanMetaToSupabase = async () => {};
  });
}

export async function openPlanner(page) {
  await waitForEventList(page, { openPanel: false });
  await enablePlannerTestAuth(page);
  const planner = page.getByTestId("season-planner");
  await page.evaluate(async () => {
    await window.openSeasonPlanner();
  });
  await expect(planner).toHaveClass(/open/);

  const plannedEventCount = await page.evaluate(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("favorites") || "[]");
      return Array.isArray(stored) ? new Set(stored).size : 0;
    } catch (_error) {
      return 0;
    }
  });

  if (plannedEventCount > 0) {
    await expect(page.getByTestId("planner-event-card"))
      .toHaveCount(plannedEventCount);
  } else {
    await expect(page.getByTestId("planner-event-list"))
      .toContainText(/No planned races|Keine/i);
  }
}

export async function selectPlannerTab(page, tabName) {
  await page.getByTestId(`planner-tab-${tabName}`).click();
  await expect(page.getByTestId(`planner-${tabName}-panel`)).toHaveClass(/active/);
}

export async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
}

export async function seedPlannerState(page, {
  favorites = [],
  seasonPlanMeta = {}
}) {
  await page.evaluate(({ favorites, seasonPlanMeta }) => {
    window.localStorage.setItem("favorites", JSON.stringify(favorites));
    window.localStorage.setItem("seasonPlanMeta", JSON.stringify(seasonPlanMeta));

    if (typeof window.applyRemotePlanningState === "function") {
      window.applyRemotePlanningState({
        favorites,
        seasonMeta: seasonPlanMeta
      });
    }
  }, {
    favorites,
    seasonPlanMeta
  });
}
