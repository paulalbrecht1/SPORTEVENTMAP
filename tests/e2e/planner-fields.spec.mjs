import {
  expect,
  openPlanner,
  prepareApp,
  selectPlannerTab,
  test
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

async function ensurePlannerSectionOpen(page, testId) {
  const section = page.getByTestId(testId);

  await expect(section).toBeVisible();

  if (!(await section.evaluate(node => node.open))) {
    const summary = section.locator("summary");
    const box = await summary.boundingBox();

    await summary.click({
      position: {
        x: Math.max(1, (box?.width || 48) - 20),
        y: Math.max(1, Math.min((box?.height || 32) / 2, (box?.height || 32) - 2))
      }
    });
  }
}

test("Planner detail sections can be edited without tab jumps or lost state", async ({ page }) => {
  const tri = fixtureByName["SEM E2E Olympic Triathlon"];

  await prepareApp(page, {
    allowPlanner: true,
    favorites: [tri.event_key]
  });

  await openPlanner(page);
  await selectPlannerTab(page, "events");

  const scrollBefore = await page.locator(".season-planner-card").evaluate(node => node.scrollTop);

  await ensurePlannerSectionOpen(page, "planner-section-equipment");
  await page.getByTestId("planner-equipment-input").fill("E2E Ersatzbrille");
  await page.getByTestId("planner-equipment-add").click();
  await expect(page.getByTestId("planner-section-equipment")).toContainText("E2E Ersatzbrille");

  const firstEquipmentCheckbox = page.locator("[data-season-equipment-check]").first();
  await firstEquipmentCheckbox.check();
  await expect(firstEquipmentCheckbox).toBeChecked();
  await expect(page.getByTestId("planner-tab-events")).toHaveClass(/active/);
  await expect(page.getByTestId("planner-event-edit-card")).toContainText(tri.event_name);

  await ensurePlannerSectionOpen(page, "planner-section-verpflegung");
  await page.getByTestId("planner-nutrition-trigger").fill("km 10");
  await page.getByTestId("planner-nutrition-product").fill("E2E Gel");
  await page.getByTestId("planner-nutrition-amount").fill("1");
  await page.getByTestId("planner-nutrition-add").click();
  await expect(page.getByTestId("planner-section-verpflegung")).toContainText("E2E Gel");

  await ensurePlannerSectionOpen(page, "planner-section-travel-and-booking");
  await page.locator("[data-season-detail-field='logistics.accommodation_status']").selectOption("not_needed");
  await expect(page.locator("[data-season-detail-field='logistics.accommodation_status']")).toHaveValue("not_needed");

  const scrollAfter = await page.locator(".season-planner-card").evaluate(node => node.scrollTop);
  expect(scrollAfter).toBeGreaterThanOrEqual(scrollBefore);

  await page.reload();
  await openPlanner(page);
  await selectPlannerTab(page, "events");
  await ensurePlannerSectionOpen(page, "planner-section-equipment");
  await expect(page.getByTestId("planner-section-equipment")).toContainText("E2E Ersatzbrille");
  await ensurePlannerSectionOpen(page, "planner-section-verpflegung");
  await expect(page.getByTestId("planner-section-verpflegung")).toContainText("E2E Gel");
  await ensurePlannerSectionOpen(page, "planner-section-travel-and-booking");
  await expect(page.locator("[data-season-detail-field='logistics.accommodation_status']")).toHaveValue("not_needed");
});

test("Removing one planner event keeps other planned events", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];
  const tri = fixtureByName["SEM E2E Olympic Triathlon"];

  await prepareApp(page, {
    allowPlanner: true,
    favorites: [run.event_key, tri.event_key]
  });

  await page.on("dialog", dialog => dialog.accept());

  await openPlanner(page);
  await selectPlannerTab(page, "events");

  await page
    .getByTestId("planner-event-card")
    .filter({ hasText: run.event_name })
    .click();
  await expect(page.getByTestId("planner-event-edit-card")).toContainText(run.event_name);
  await page.getByTestId("planner-remove-event").click();

  await expect(page.getByTestId("planner-event-list")).not.toContainText(run.event_name);
  await expect(page.getByTestId("planner-event-list")).toContainText(tri.event_name);

  await page.reload();
  await openPlanner(page);
  await selectPlannerTab(page, "events");
  await expect(page.getByTestId("planner-event-list")).not.toContainText(run.event_name);
  await expect(page.getByTestId("planner-event-list")).toContainText(tri.event_name);
});
