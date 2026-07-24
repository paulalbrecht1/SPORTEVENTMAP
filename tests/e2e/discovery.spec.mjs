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
