import {
  closeEventDrawer,
  expect,
  openEventDrawer,
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

test("Planner event, priority, target time, note and just-for-fun survive reload", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await prepareApp(page, {
    allowPlanner: true
  });

  await openEventDrawer(page, run.event_name);
  await page.getByTestId("drawer-add-to-planner").click();
  await expect(page.getByTestId("drawer-add-to-planner")).toHaveClass(/active/);
  await closeEventDrawer(page);

  await openPlanner(page);
  await selectPlannerTab(page, "events");
  await expect(page.getByTestId("planner-event-card")).toContainText(run.event_name);
  await expect(page.getByTestId("planner-event-edit-card")).toContainText(run.event_name);

  await page.getByTestId("planner-event-edit-button").click();
  await page.getByTestId("planner-priority-select").selectOption("A");
  await expect(page.getByTestId("planner-priority-select")).toHaveValue("A");

  await ensurePlannerSectionOpen(page, "planner-section-goal-and-race-strategy");
  await page.getByTestId("planner-goal-type-target_time").click();
  await ensurePlannerSectionOpen(page, "planner-section-goal-and-race-strategy");
  await page.getByTestId("planner-time-goals-target-time-minutes").fill("45");
  await page.getByTestId("planner-time-goals-target-time-minutes").dispatchEvent("change");

  await ensurePlannerSectionOpen(page, "planner-section-goal-and-race-strategy");
  await page.getByTestId("planner-field-personal-note").fill("E2E race note survives reload");
  await page.getByTestId("planner-field-personal-note").blur();

  await page.reload();
  await openPlanner(page);
  await selectPlannerTab(page, "events");

  await expect(page.getByTestId("planner-event-edit-card")).toContainText(run.event_name);
  await page.getByTestId("planner-event-edit-button").click();
  await expect(page.getByTestId("planner-priority-select")).toHaveValue("A");
  await ensurePlannerSectionOpen(page, "planner-section-goal-and-race-strategy");
  await expect(page.getByTestId("planner-time-goals-target-time-minutes")).toHaveValue("45");

  await ensurePlannerSectionOpen(page, "planner-section-goal-and-race-strategy");
  await page.getByTestId("planner-time-goals-target-time-minutes").fill("");
  await page.getByTestId("planner-time-goals-target-time-minutes").dispatchEvent("change");

  await ensurePlannerSectionOpen(page, "planner-section-goal-and-race-strategy");
  await page.getByTestId("planner-goal-type-fun").click();
  await ensurePlannerSectionOpen(page, "planner-section-goal-and-race-strategy");
  await expect(page.getByTestId("planner-goal-type-fun")).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await openPlanner(page);
  await selectPlannerTab(page, "events");
  await ensurePlannerSectionOpen(page, "planner-section-goal-and-race-strategy");
  await expect(page.getByTestId("planner-goal-type-fun")).toHaveAttribute("aria-pressed", "true");
});

test("Planner tabs render their core structure and do not become empty", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await prepareApp(page, {
    allowPlanner: true,
    favorites: [run.event_key]
  });

  await openPlanner(page);

  await selectPlannerTab(page, "overview");
  await expect(page.getByTestId("planner-overview-panel")).toContainText(run.event_name);
  await expect(page.getByTestId("planner-countdown")).not.toBeEmpty();

  await selectPlannerTab(page, "events");
  await expect(page.getByTestId("planner-event-list")).toContainText(run.event_name);
  await expect(page.getByTestId("planner-event-editor")).toContainText(run.event_name);

  await selectPlannerTab(page, "calendar");
  await expect(page.getByTestId("planner-calendar")).toContainText(run.event_name);

  await selectPlannerTab(page, "overview");
  await expect(page.getByTestId("planner-overview-panel")).toContainText(run.event_name);
});

test("Empty planner state is explicit", async ({ page }) => {
  await prepareApp(page, {
    allowPlanner: true
  });

  await openPlanner(page);
  await selectPlannerTab(page, "events");

  await expect(page.getByTestId("planner-event-list")).toContainText(/No planned races|Keine/i);
  await expect(page.getByTestId("planner-event-editor")).toContainText(/No race selected|Select a race|Wähle/i);
});
