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

test("Phone planner keeps its header compact and training blocks readable", async ({ page }) => {
  const plannedEvents = [
    fixtureByName["SEM E2E Olympic Triathlon"],
    fixtureByName["SEM E2E Future Run"],
    fixtureByName["SEM E2E Very Long Event Name For Responsive Planner Overflow Regression Coverage"]
  ];

  await prepareApp(page, {
    allowPlanner: true,
    openDiscoveryPanel: false,
    favorites: plannedEvents.map(event => event.event_key)
  });

  await openPlanner(page);
  await selectPlannerTab(page, "overview");

  await expect(page.getByTestId("filter-open")).toBeHidden();
  await expect(page.getByTestId("discovery-panel-toggle")).toBeHidden();

  const headerLayout = await page.locator("#topbar").evaluate(element => {
    const bounds = element.getBoundingClientRect();

    return {
      height: bounds.height,
      bottom: bounds.bottom
    };
  });

  expect(headerLayout.height).toBeLessThanOrEqual(66);

  const blocks = page.locator(".season-training-block-item");
  await expect(blocks).toHaveCount(2);

  const blockLayout = await blocks.evaluateAll(elements =>
    elements.map(element => {
      const children = [...element.children].map(child => {
        const bounds = child.getBoundingClientRect();

        return {
          top: bounds.top,
          bottom: bounds.bottom
        };
      });

      return {
        display: getComputedStyle(element).display,
        height: element.getBoundingClientRect().height,
        scrollHeight: element.scrollHeight,
        children
      };
    })
  );

  expect(blockLayout.every(block => block.display === "flex")).toBe(true);
  expect(blockLayout.every(block => block.scrollHeight <= block.height + 1)).toBe(true);
  expect(blockLayout.every(block => block.children.every((child, index) =>
    index === 0 || child.top >= block.children[index - 1].bottom - 1
  ))).toBe(true);
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
