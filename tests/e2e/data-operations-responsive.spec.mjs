import {
  expect,
  prepareApp,
  test
} from "./helpers/browser.mjs";

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 }
];

test("Data Operations stays usable across themes and required viewports", async ({ page }) => {
  await prepareApp(page, {
    openDiscoveryPanel: false
  });

  for (const theme of ["light", "dark"]) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(activeTheme => {
        window.SportEventMapTheme.apply(activeTheme, {
          persist: false
        });

        const modal = document.getElementById("adminModal");
        const analytics = document.getElementById("adminAnalyticsPanel");
        const dataOperations = document.getElementById("adminDataOperationsPanel");
        const feedback = document.getElementById("adminFeedbackPanel");

        modal.classList.add("open");
        analytics.classList.remove("active");
        analytics.hidden = true;
        feedback.classList.remove("active");
        feedback.hidden = true;
        dataOperations.classList.add("active");
        dataOperations.hidden = false;
      }, theme);

      await expect(page.locator("#adminDataOperationsPanel")).toBeVisible();
      await expect(page.locator("#adminDataOperationsPanel select")).toHaveCount(6);
      await expect(page.locator("#adminDataOperationsPanel input[type=\"date\"]")).toHaveCount(2);
      await expect(page.locator("#runDataValidationBtn")).toBeVisible();

      const layout = await page.locator("#adminModal .admin-card").evaluate(card => ({
        cardLeft: card.getBoundingClientRect().left,
        cardRight: card.getBoundingClientRect().right,
        cardScrollWidth: card.scrollWidth,
        cardClientWidth: card.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      }));

      expect(layout.cardLeft).toBeGreaterThanOrEqual(7);
      expect(layout.cardRight).toBeLessThanOrEqual(layout.viewportWidth - 7);
      expect(layout.cardScrollWidth).toBeLessThanOrEqual(layout.cardClientWidth + 1);
      expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  }
});
