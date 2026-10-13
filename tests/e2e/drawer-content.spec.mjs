import { expect, openEventDrawer, prepareApp, test } from "./helpers/browser.mjs";

const baseEvent = {
  event_id: 991,
  edition_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  edition_slug: "sem-drawer-race-2099",
  edition_year: 2099,
  event_name: "SEM Drawer Race",
  sport: "Running",
  date: "20.09.2099",
  city: "Berlin",
  country: "Germany",
  latitude: 52.52,
  longitude: 13.4,
  distance: "21.097 km",
  event_url: "https://legacy.example/old-drawer-race",
  source_url: "https://official.example/drawer-race",
  registration_status: "registration_open",
  event_status: "scheduled"
};
const officialDescription = "A riverside race with official aid stations.";
const importNotes = "Imported from verified staging batch.\nOfficial endurance event in Berlin.\nSource listing: https://fixture.example/internal";
const richEvent = {
  ...baseEvent,
  description: `${importNotes}\n${officialDescription}`,
  start_time: "09:15:00",
  price_min: 25,
  price_max: 65,
  currency: "EUR",
  organizer_name: "SEM Organizer",
  participant_limit: 750,
  official_url: "https://official.example/current-drawer-race",
  registration_url: "https://entries.example/drawer-race",
  race_formats: JSON.stringify([
    { label: "Olympic distance", swim_km: 1.5, bike_km: 40, run_km: 10 },
    { label: "Half Marathon", distance_km: 21.097 }
  ])
};

async function usePublishedCatalog(page, rows) {
  await prepareApp(page);
  await page.evaluate(() => window.ensureSupabaseFeaturesLoaded("drawer-content-test"));
  await page.evaluate(async publishedRows => {
    const originalFrom = supabaseClient.from.bind(supabaseClient);
    supabaseClient.from = table => {
      if (table !== "public_event_discovery") return originalFrom(table);
      let afterCursor = false;
      return {
        select() { return this; },
        order() { return this; },
        limit() { return this; },
        gt() { afterCursor = true; return this; },
        then(resolve) {
          resolve({ data: afterCursor ? [] : publishedRows, count: publishedRows.length, error: null });
        }
      };
    };
    await window.refreshEvents({ preserveView: true });
  }, rows);
  expect(await page.evaluate(() => window.eventCatalogDiagnostics.source)).toBe("supabase");
  await expect(page.getByTestId("event-card")).toHaveCount(rows.length);
}

async function expectDrawerFits(page) {
  try {
    await expect.poll(() => page.getByTestId("event-drawer").evaluate(drawer => {
      const content = document.getElementById("drawerContent");
      const published = content.querySelectorAll(".drawer-description, .drawer-detail-facts, .drawer-detail-facts dd, .drawer-competitions, .drawer-competitions li, .drawer-competitions p");
      return {
        drawerOutsideViewport: drawer.getBoundingClientRect().right > innerWidth + 1,
        publishedContentOverflows: [...published].some(node => node.getClientRects().length &&
          (node.scrollWidth > node.clientWidth + 1 || node.getBoundingClientRect().right > content.getBoundingClientRect().right + 1)
        ),
        pageOverflows: document.documentElement.scrollWidth > innerWidth + 1
      };
    })).toEqual({ drawerOutsideViewport: false, publishedContentOverflows: false, pageOverflows: false });
  } catch (error) {
    const measurements = await page.locator("#drawerContent").evaluate(content => ({
      client: content.clientWidth,
      scroll: content.scrollWidth,
      clipped: [...content.querySelectorAll(".drawer-description, .drawer-detail-facts, .drawer-detail-facts dd, .drawer-competitions, .drawer-competitions li, .drawer-competitions p")].filter(node => node.getClientRects().length &&
        (node.scrollWidth > node.clientWidth + 1 || node.getBoundingClientRect().right > content.getBoundingClientRect().right + 1)
      ).map(node => ({ element: node.tagName, class: node.className, client: node.clientWidth,
        scroll: node.scrollWidth, text: node.textContent.trim().slice(0, 100) }))
    }));
    console.log("Drawer overflow measurements:", JSON.stringify(measurements));
    throw error;
  }
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 }
]) {
  test(`${viewport.name}: Drawer exposes published facts, clean prose and localized race formats`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await usePublishedCatalog(page, [richEvent]);
    await openEventDrawer(page, richEvent.event_name);
    const drawer = page.getByTestId("event-drawer");
    const facts = page.getByTestId("drawer-event-facts");
    const competitions = page.getByTestId("drawer-competitions");

    for (const language of ["de", "en"]) {
      await page.evaluate(value => window.setAppLanguage(value), language);
      await expect(page.getByTestId("drawer-description")).toHaveText(officialDescription);
      await expect(drawer).not.toContainText(/Imported from|Official endurance event|Source listing|fixture\.example\/internal/);
      await expect(facts).toBeVisible();
      await expect(facts.getByText("09:15", { exact: true })).toBeVisible();
      await expect(facts.getByText("25 – 65 EUR", { exact: true })).toBeVisible();
      await expect(facts).toContainText("SEM Organizer");
      await expect(facts).toContainText("750");
      await expect(facts).toContainText(language === "de" ? "Startzeit" : "Start time");
      await expect(competitions.locator("li")).toHaveCount(2);
      await expect(competitions).toContainText(language === "de" ? "Olympische Distanz" : "Olympic distance");
      await expect(competitions).toContainText(language === "de" ? "Halbmarathon" : "Half Marathon");
      await expect(competitions).toContainText(language === "de" ? "Schwimmen: 1,5 km" : "Swim: 1.5 km");
      await expect(competitions).toContainText(language === "de" ? "Radfahren: 40 km" : "Bike: 40 km");
      await expect(competitions).toContainText(language === "de" ? "Laufen: 10 km" : "Run: 10 km");
      await expect(competitions).toContainText(language === "de" ? "21,097 km" : "21.097 km");
      await expect(drawer.locator(".drawer-button")).toHaveAttribute("href", richEvent.official_url);
      await expect(drawer.locator(".drawer-register-button")).toHaveAttribute("href", richEvent.registration_url);
      await expect(drawer.locator(".drawer-register-button")).toHaveAttribute("target", "_blank");
      await expect(drawer.locator('a[href="https://legacy.example/old-drawer-race"]')).toHaveCount(0);
      await expectDrawerFits(page);
    }
  });
}

test("a Berlin Marathon name cannot create missing facts or promotional claims", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const event = {
    ...baseEvent,
    event_name: "Berlin Marathon",
    distance: "42.195 km",
    description: importNotes,
    start_time: null,
    price_min: null,
    price_max: null,
    organizer_name: null,
    participant_limit: null,
    event_url: null,
    official_url: "javascript:alert('invalid-test-link')",
    registration_url: "data:text/html,invalid-test-link",
    race_formats: []
  };
  await usePublishedCatalog(page, [event]);
  await openEventDrawer(page, event.event_name);
  for (const language of ["de", "en"]) {
    await page.evaluate(value => window.setAppLanguage(value), language);
    await expect(page.getByTestId("drawer-event-facts")).toHaveCount(0);
    await expect(page.getByTestId("drawer-competitions")).toHaveCount(0);
    await expect(page.getByTestId("drawer-description")).toHaveCount(0);
    await expect(page.getByTestId("event-drawer").locator(".drawer-button, .drawer-register-button")).toHaveCount(0);
    await expect(page.getByTestId("event-drawer")).not.toContainText(/60[.,]000|World Marathon Major|Brandenburg|very little elevation|Flat course|flache Strecke|Imported from|More event details will be added soon/);
    await expectDrawerFits(page);
  }
});

test("a known event name preserves its actual organizer description", async ({ page }) => {
  const event = {
    ...baseEvent,
    event_name: "Berlin Marathon",
    distance: "42.195 km",
    description: "This edition uses an organizer-confirmed route around the lake.",
    race_formats: []
  };
  await usePublishedCatalog(page, [event]);
  await openEventDrawer(page, event.event_name);
  await expect(page.getByTestId("drawer-description")).toHaveText(event.description);
  await expect(page.getByTestId("event-drawer")).not.toContainText(/60[.,]000|World Marathon Major|Brandenburg/);
});
