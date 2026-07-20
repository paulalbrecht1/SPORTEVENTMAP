import {
  closeEventDrawer,
  expect,
  openEventDrawer,
  prepareApp,
  test
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

test("Favorite state persists through drawer reopen and reload", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await prepareApp(page);
  await openEventDrawer(page, run.event_name);

  await page.getByTestId("drawer-favorite").click();
  await expect(page.getByTestId("drawer-favorite")).toHaveClass(/active/);

  await closeEventDrawer(page);
  await openEventDrawer(page, run.event_name);
  await expect(page.getByTestId("drawer-favorite")).toHaveClass(/active/);

  await closeEventDrawer(page);
  await page.reload();
  await openEventDrawer(page, run.event_name);
  await expect(page.getByTestId("drawer-favorite")).toHaveClass(/active/);

  await page.getByTestId("drawer-favorite").click();
  await expect(page.getByTestId("drawer-favorite")).not.toHaveClass(/active/);
});

test("Add-to-planner action is auth-gated for anonymous users", async ({ page }) => {
  const run = fixtureByName["SEM E2E Future Run"];

  await prepareApp(page);
  await openEventDrawer(page, run.event_name);

  await page.getByTestId("drawer-add-to-planner").click();
  await expect(page.getByTestId("drawer-add-to-planner")).toContainText("Add to Season");

  const favorites = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("favorites") || "[]")
  );

  expect(favorites).toEqual([]);
});
