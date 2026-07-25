import {
  expect,
  openPlanner,
  prepareApp,
  test
} from "./helpers/browser.mjs";

const detailPath =
  "/event/10-charity-lauf-koldingen-2026/";

test("theme selection is consistent across every main view and persists", async ({ page }) => {
  await prepareApp(page, {
    allowPlanner: true,
    openDiscoveryPanel: false
  });

  await page.evaluate(() => {
    window.SportEventMapTheme.apply("light", {
      persist: true
    });
  });

  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "light");
  await expect(
    page.locator("#authArea [data-theme-toggle]")
  ).toBeVisible();

  await openPlanner(page);
  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "light");
  await expect(page.getByTestId("season-planner"))
    .toHaveClass(/open/);

  await page.goto("/index.html#/events");
  await expect(page.locator("body"))
    .toHaveClass(/platform-route-events/);
  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "light");

  await page.goto(detailPath);
  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "light");
  const detailToggle =
    page.locator(".event-detail-header [data-theme-toggle]");
  await expect(detailToggle).toBeVisible();

  await detailToggle.click();
  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "dark");
  await expect.poll(() =>
    page.evaluate(() =>
      localStorage.getItem("sportEventMapTheme")
    )
  ).toBe("dark");

  await page.goto("/index.html#/home");
  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "dark");
  await expect(
    page.locator(".sem-header-actions [data-theme-toggle]")
  ).toBeVisible();

  await page.goto("/imprint.html");
  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "dark");
  await expect(
    page.locator(".legal-page-content [data-theme-toggle]")
  ).toBeVisible();
});
