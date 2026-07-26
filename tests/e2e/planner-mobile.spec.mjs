import {
  assertNoHorizontalOverflow,
  expect,
  openEventDrawer,
  openPlanner,
  prepareApp,
  selectPlannerTab,
  test
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

test("Mobile discovery and planner have no horizontal overflow", async ({ page }) => {
  const longEvent = fixtureByName["SEM E2E Very Long Event Name For Responsive Planner Overflow Regression Coverage"];

  await prepareApp(page, {
    allowPlanner: true,
    openDiscoveryPanel: false
  });

  await assertNoHorizontalOverflow(page);
  const panelToggle =
    page.getByTestId("discovery-panel-toggle");

  await panelToggle.click();
  await expect(panelToggle).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(page.locator("#sidebar")).not.toHaveClass(/closed/);

  await page.getByTestId("discovery-panel-close").click();
  await expect(panelToggle).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await expect.poll(() =>
    page.evaluate(() => document.activeElement?.id)
  ).toBe("toggleSidebar");
  await assertNoHorizontalOverflow(page);

  await openEventDrawer(page, longEvent.event_name);
  await assertNoHorizontalOverflow(page);
  await page.getByTestId("drawer-add-to-planner").click();
  await expect(page.getByTestId("drawer-add-to-planner")).toHaveClass(/active/);

  await openPlanner(page);
  await selectPlannerTab(page, "overview");
  await assertNoHorizontalOverflow(page);
  await expect(page.getByTestId("planner-countdown")).toBeVisible();

  await selectPlannerTab(page, "events");
  await page.getByTestId("planner-event-card").click();
  await expect(page.getByTestId("planner-events-back")).toBeVisible();
  await expect(page.getByTestId("planner-event-edit-card")).toContainText(longEvent.event_name);
  await assertNoHorizontalOverflow(page);

  await page.getByTestId("planner-section-equipment-and-nutrition").click();
  await expect(page.getByTestId("planner-section-equipment-and-nutrition")).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.locator(".platform-pages").evaluate(node => {
    node.scrollTop = node.scrollHeight;
  });
  await assertNoHorizontalOverflow(page);
});

test("Phone filters open as a complete touch workspace", async ({ page }) => {
  await prepareApp(page, {
    openDiscoveryPanel: false
  });

  const panelToggle = page.getByTestId("discovery-panel-toggle");
  const sidebar = page.locator("#sidebar");

  await expect(panelToggle).toBeVisible();
  await expect(panelToggle).toHaveAttribute("aria-expanded", "false");

  const triggerSize = await panelToggle.evaluate(element => {
    const bounds = element.getBoundingClientRect();

    return {
      width: bounds.width,
      height: bounds.height
    };
  });

  expect(triggerSize.width).toBeGreaterThanOrEqual(100);
  expect(triggerSize.height).toBeGreaterThanOrEqual(44);

  await panelToggle.click();
  await expect(panelToggle).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar).toBeVisible();

  const workspace = await sidebar.evaluate(element => {
    const bounds = element.getBoundingClientRect();

    return {
      position: getComputedStyle(element).position,
      width: bounds.width,
      height: bounds.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });

  expect(workspace.position).toBe("fixed");
  expect(workspace.width).toBeGreaterThanOrEqual(workspace.viewportWidth - 1);
  expect(workspace.height).toBeGreaterThanOrEqual(workspace.viewportHeight - 1);

  const distanceToggle = page.locator("#distanceFilterToggle");

  await distanceToggle.scrollIntoViewIfNeeded();
  await distanceToggle.click();
  await expect(distanceToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-distance-filter='10k']")).toBeVisible();

  await page.locator("[data-distance-filter='10k']").click();
  await expect(page.locator("[data-distance-filter='10k']")).toHaveClass(/active/);
  await assertNoHorizontalOverflow(page);
});

test("Phone planner defaults to the readable calendar list", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await prepareApp(page, {
    allowPlanner: true,
    openDiscoveryPanel: false,
    favorites: [run.event_key]
  });

  await openPlanner(page);
  await selectPlannerTab(page, "calendar");

  await expect(page.getByTestId("planner-calendar")).toHaveClass(/season-calendar-view-list/);
  await assertNoHorizontalOverflow(page);
});
