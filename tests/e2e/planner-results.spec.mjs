import {
  expect,
  openPlanner,
  prepareApp,
  selectPlannerTab,
  test
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

async function ensureResultFormOpen(page) {
  const finishStatus = page.getByTestId("planner-field-result-finish-status");

  if (await finishStatus.isVisible()) {
    return;
  }

  await page.locator("[data-season-result-edit]").first().click();
  await expect(finishStatus).toBeVisible();
}

test("Past event result values persist after reload", async ({ page }) => {
  const past = fixtureByName["SEM E2E Past Marathon"];

  await prepareApp(page, {
    allowPlanner: true,
    favorites: [past.event_key]
  });

  await openPlanner(page);
  await selectPlannerTab(page, "events");
  await expect(page.getByTestId("planner-event-edit-card")).toContainText(past.event_name);
  await expect(page.getByTestId("planner-event-edit-card")).toContainText(/Result & Review|Ergebnis/i);

  await ensureResultFormOpen(page);
  await page.getByTestId("planner-field-result-finish-status").selectOption("Finished");
  await page.getByTestId("planner-time-result-finish-time-hours").fill("3");
  await page.getByTestId("planner-time-result-finish-time-hours").dispatchEvent("change");
  await page.getByTestId("planner-field-result-overall-place").fill("124");
  await page.getByTestId("planner-field-result-overall-place").dispatchEvent("change");
  await page.getByTestId("planner-field-result-age-group-place").fill("8");
  await page.getByTestId("planner-field-result-age-group-place").dispatchEvent("change");

  await page.reload();
  await openPlanner(page);
  await selectPlannerTab(page, "events");

  await ensureResultFormOpen(page);
  await expect(page.getByTestId("planner-field-result-finish-status")).toHaveValue("Finished");
  await expect(page.getByTestId("planner-time-result-finish-time-hours")).toHaveValue("3");
  await expect(page.getByTestId("planner-field-result-overall-place")).toHaveValue("124");
  await expect(page.getByTestId("planner-field-result-age-group-place")).toHaveValue("8");
});

for (const status of ["DNS", "DNF", "DSQ"]) {
  test(`Past event supports ${status} without inconsistent required finish time`, async ({ page }) => {
    const past = fixtureByName["SEM E2E Past Marathon"];

    await prepareApp(page, {
      allowPlanner: true,
      favorites: [past.event_key]
    });

    await openPlanner(page);
    await selectPlannerTab(page, "events");
    await ensureResultFormOpen(page);
    await page.getByTestId("planner-field-result-finish-status").selectOption(status);
    await expect(page.getByTestId("planner-field-result-finish-status")).toHaveValue(status);

    await page.reload();
    await openPlanner(page);
    await selectPlannerTab(page, "events");
    await ensureResultFormOpen(page);
    await expect(page.getByTestId("planner-field-result-finish-status")).toHaveValue(status);
  });
}
