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

test("Discovery search is prominent in dark mode without changing light mode", async ({ page }) => {
  await prepareApp(page, {
    allowPlanner: true,
    openDiscoveryPanel: false
  });

  await page.evaluate(() => {
    window.SportEventMapTheme.apply("dark", {
      persist: true
    });
  });
  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(220);

  const getSearchAppearance = () =>
    page.locator("#searchInput").evaluate((input) => {
      const style = getComputedStyle(input);
      const placeholder = getComputedStyle(input, "::placeholder");

      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        placeholderColor: placeholder.color
      };
    });

  const darkAppearance = await getSearchAppearance();
  expect(darkAppearance.backgroundImage).toContain("linear-gradient");
  expect(darkAppearance.backgroundImage).toContain("rgb(24, 53, 43)");
  expect(darkAppearance.borderColor).toBe("rgba(190, 218, 203, 0.42)");
  expect(darkAppearance.boxShadow).not.toBe("none");
  expect(darkAppearance.placeholderColor).toBe("rgb(175, 190, 182)");

  await page.evaluate(() => {
    window.SportEventMapTheme.apply("light", {
      persist: false
    });
  });
  await page.waitForTimeout(220);

  const lightAppearance = await getSearchAppearance();
  expect(lightAppearance.backgroundImage).toBe("none");
  expect(lightAppearance.backgroundColor).toBe("rgb(255, 255, 255)");
});
