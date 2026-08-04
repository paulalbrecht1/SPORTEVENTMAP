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
  await page.waitForSelector("#sourceMonitorSection", { state: "attached" });
  await page.waitForSelector("#editionLifecycleInbox", { state: "attached" });
  await page.waitForSelector("#stageFourOperationsCenter", { state: "attached" });

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

        const sourceDetails = document.getElementById("sourceMonitorSection");
        sourceDetails.open = true;

        const sourceBody = document.getElementById("sourceMonitorTableBody");
        sourceBody.innerHTML = `<tr>
          <td data-label="Event / Austragung"><strong>Test Marathon</strong><span>2026</span></td>
          <td data-label="Quelle"><strong>example.com</strong><span>official</span></td>
          <td data-label="Letzter Status"><strong>unchanged</strong><span>HTTP 200</span></td>
          <td data-label="Pruefplan"><label>Naechster Crawl<input type="datetime-local"></label></td>
          <td data-label="Review"><span>kein offenes Review</span></td>
          <td data-label="Aktionen"><div class="source-monitor-actions"><button type="button">Jetzt pruefen</button><a href="https://example.com">Quelle oeffnen</a></div></td>
        </tr>`;

        const reviewList = document.getElementById("editionLifecycleList");
        reviewList.innerHTML = `<article class="edition-lifecycle-card is-high">
          <div class="admin-review-card-main"><div class="admin-review-card-badges"><span class="admin-data-operations-status is-high">Neuer Jahrgang</span></div><h6>Neue Austragung 2027</h6><p><strong>Test Marathon</strong> · Offizieller Entwurf wartet auf Entscheidung.</p><div class="admin-review-diff"><div><span>start date</span><del>12.09.2026</del><strong>11.09.2027</strong></div></div></div>
          <dl><div><dt>Status</dt><dd>draft_created</dd></div><div><dt>Konfidenz</dt><dd>99,5%</dd></div></dl>
          <div class="source-monitor-actions"><button type="button">Freigeben</button><a href="https://example.com">Quelle oeffnen</a></div>
        </article>`;
      }, theme);

      await expect(page.locator("#adminDataOperationsPanel")).toBeVisible();
      await expect(page.locator("#adminDataOperationsPanel select")).toHaveCount(17);
      await expect(page.locator("#adminDataOperationsPanel input[type=\"date\"]")).toHaveCount(2);
      await expect(page.locator("#runDataValidationBtn")).toBeVisible();
      await expect(page.locator("#editionLifecycleInbox")).toBeVisible();
      await expect(page.locator("#editionLifecycleInbox .edition-lifecycle-kpis > div")).toHaveCount(4);
      await expect(page.locator("#editionLifecycleList .edition-lifecycle-card")).toBeVisible();
      await expect(page.locator("#dataOpsInventoryDetails")).toBeVisible();
      await expect(page.locator("#sourceMonitorSection")).toBeVisible();
      await expect(page.locator("#sourceMonitorSection .source-monitor-kpis > div")).toHaveCount(10);
      await expect(page.locator("#sourceMonitorTableBody tr")).toHaveCount(1);
      await expect(page.locator("#sourceMonitorTableBody button").first()).toBeVisible();
      await expect(page.locator("#stageFourOperationsCenter")).toBeVisible();
      await expect(page.locator("#stageFourOperationsCenter .stage-four-kpis > div")).toHaveCount(6);

      const sourceLayout = await page.locator("#sourceMonitorSection").evaluate(section => ({
        tableHeadDisplay: getComputedStyle(section.querySelector("thead")).display,
        rowDisplay: getComputedStyle(section.querySelector("tbody tr")).display,
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      }));
      expect(sourceLayout.documentScrollWidth).toBeLessThanOrEqual(sourceLayout.viewportWidth + 1);
      if (viewport.width <= 760) {
        expect(sourceLayout.tableHeadDisplay).toBe("none");
        expect(sourceLayout.rowDisplay).toBe("block");
      } else {
        expect(sourceLayout.tableHeadDisplay).not.toBe("none");
      }

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
