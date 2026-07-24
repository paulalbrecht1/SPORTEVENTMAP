import {
  assertNoHorizontalOverflow,
  expect,
  openPlanner,
  prepareApp,
  selectPlannerTab,
  test
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

const viewports = [
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 768, height: 1024 },
  { width: 810, height: 1080 },
  { width: 820, height: 1180 },
  { width: 1024, height: 1366 },
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 }
];

test("Planner is a full page without horizontal overflow across required viewports", async ({ page }) => {
  const longEvent = fixtureByName[
    "SEM E2E Very Long Event Name For Responsive Planner Overflow Regression Coverage"
  ];

  await prepareApp(page, {
    allowPlanner: true,
    favorites: [longEvent.event_key]
  });
  await openPlanner(page);

  await expect(page.locator("#plannerPageMount > #seasonPlannerModal")).toBeVisible();
  await expect(page.locator("#closeSeasonPlanner")).toHaveCount(0);
  await expect(page.locator("body")).toHaveClass(/platform-route-planner/);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await assertNoHorizontalOverflow(page);

    const layout = await page.evaluate(() => {
      const modal = document.querySelector("#seasonPlannerModal");
      const card = document.querySelector(".season-planner-card");
      const pages = document.querySelector(".platform-pages");

      return {
        modalPosition: modal ? getComputedStyle(modal).position : "missing",
        cardOverflowY: card ? getComputedStyle(card).overflowY : "missing",
        pageOverflowY: pages ? getComputedStyle(pages).overflowY : "missing"
      };
    });

    expect(layout.modalPosition).toBe("static");
    expect(layout.cardOverflowY).not.toBe("auto");
    expect(layout.cardOverflowY).not.toBe("scroll");
    expect(["auto", "scroll"]).toContain(layout.pageOverflowY);
  }
});

test("Events uses split view on wide screens and list-to-detail on portrait tablets and phones", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await page.setViewportSize({ width: 1024, height: 1366 });
  await prepareApp(page, {
    allowPlanner: true,
    favorites: [run.event_key]
  });
  await openPlanner(page);
  await selectPlannerTab(page, "events");

  await expect(page.getByTestId("planner-event-list")).toBeVisible();
  await expect(page.getByTestId("planner-event-editor")).not.toBeVisible();

  await page.getByTestId("planner-event-card").click();
  await expect(page.getByTestId("planner-events-back")).toBeVisible();
  await expect(page.getByTestId("planner-event-editor")).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByTestId("planner-event-list")).toBeVisible();
  await expect(page.getByTestId("planner-event-editor")).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByTestId("planner-events-back")).toBeVisible();
  await expect(page.getByTestId("planner-event-editor")).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.getByTestId("planner-events-back").click();
  await expect(page.getByTestId("planner-event-list")).toBeVisible();
  await expect(page.getByTestId("planner-event-editor")).not.toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("planner-event-list")).toBeVisible();
  await expect(page.getByTestId("planner-event-editor")).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
