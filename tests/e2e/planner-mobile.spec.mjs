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
