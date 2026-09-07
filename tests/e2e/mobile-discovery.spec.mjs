import { expect, prepareApp, test } from "./helpers/browser.mjs";

test.use({ hasTouch: true, isMobile: true });

async function swipeUp(page, locator) {
  const bounds = await locator.boundingBox();
  const session = await page.context().newCDPSession(page);
  const x = Math.round(bounds.x + bounds.width / 2);
  const start = Math.round(bounds.y + bounds.height * 0.85);
  const distance = Math.round(bounds.height * 0.65);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart", touchPoints: [{ x, y: start }]
  });
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ x, y: start - distance * step / 8 }]
    });
    await page.waitForTimeout(24);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

for (const [width, height] of [[320, 568], [390, 844], [667, 375], [844, 390]]) {
  test(`phone map, list and fixed filter actions work at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepareApp(page, { openDiscoveryPanel: false });
    await page.locator("#topbarLanguageSelect").evaluate(select => {
      window.setAppLanguage("de");
    });
    await expect(page.locator("#mobileMapViewBtn")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#mapToolsToggle").tap();
    await expect(page.locator("#mapToolsMenu")).toBeVisible();
    await page.locator("#mobileListViewBtn").tap();
    await expect(page.locator("#mapToolsMenu")).toBeHidden();
    await expect(page.getByTestId("event-list")).toBeVisible();
    await expect(page.locator("#mobileResultCount")).toHaveText("3");
    await expect(page.locator("#eventListFavoritesToggle")).toBeVisible();
    await expect(page.locator("#toggleEventListFullscreen")).toBeHidden();
    await expect(page.getByTestId("event-search")).toHaveCSS("font-size", "16px");

    const list = page.getByTestId("event-list");
    await swipeUp(page, list);
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(10);
    for (let swipe = 0; swipe < 20; swipe += 1) {
      const atEnd = await list.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
      if (atEnd) break;
      await swipeUp(page, list);
    }
    await expect.poll(() => list.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(3);
    await expect(page.getByTestId("event-card").last().locator(".event-status-bar")).toBeInViewport();

    await page.getByTestId("discovery-panel-toggle").tap();
    await expect(page.locator("#sidebar")).toHaveAttribute("aria-modal", "true");
    await expect(list).toBeHidden();
    const apply = page.getByTestId("filter-apply");
    await expect(apply).toBeInViewport({ ratio: 1 });
    await expect(apply).toHaveText("3 Events anzeigen");
    const header = page.locator("#sidebar-header");
    expect(await header.evaluate(el => el.clientHeight)).toBeGreaterThan(height * 0.5);
    await page.getByTestId("filter-sport-running").tap();
    await expect(apply).toHaveText("2 Events anzeigen");
    await swipeUp(page, header);
    await expect(apply).toBeInViewport({ ratio: 1 });
    await apply.tap();
    await expect(page.locator("#mobileListViewBtn")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("event-card")).toHaveCount(2);
    await expect(list).toBeVisible();
    await expect(page.locator("#mapToolsMenu")).toBeHidden();
    await page.locator("#mobileMapViewBtn").tap();
    await expect(page.getByTestId("map")).toBeVisible();
    await expect(list).toBeHidden();
    await page.locator("#mobileListViewBtn").tap();
    await expect(page.getByTestId("event-card")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  });
}

test("phone search, favorites and drawer use the visible result list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareApp(page, { openDiscoveryPanel: false });
  const search = page.getByTestId("event-search");
  await search.fill("SEM E2E Future Run");
  await search.press("Enter");
  await expect(page.getByTestId("event-list")).toBeVisible();
  await expect(search).not.toBeFocused();
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.getByTestId("event-card-favorite").tap();
  await expect(page.getByTestId("event-card-favorite")).toHaveClass(/active/);
  await page.locator("#eventListFavoritesToggle").tap();
  await expect(page.locator("#eventListFavoritesToggle")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("event-card").locator(".event-facts-grid").tap();
  await expect(page.getByTestId("event-drawer")).toHaveClass(/open/);
  await page.getByTestId("drawer-close").tap();
  await expect(page.getByTestId("event-list")).toBeVisible();
  await page.locator("#eventListFavoritesToggle").tap();
  await search.fill("no matching event whatsoever");
  await search.press("Enter");
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await expect(page.locator(".event-list-empty")).toBeVisible();
  await expect(page.locator("#mobileResultCount")).toHaveText("0");
  await search.fill("");
  await search.press("Enter");
  await expect(page.getByTestId("event-card")).toHaveCount(3);
  await search.fill("run");
  await expect(page.locator("#searchSuggestions")).toBeVisible();
});

test("leaving a paginated desktop list exposes every result on the phone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareApp(page);
  await page.evaluate(() => {
    renderEventList(Array.from({ length: 60 }, (_, index) => ({
      ...currentRenderedEvents[0], event_name: `Mobile resize event ${index + 1}`
    })));
  });
  await page.locator("#toggleEventListFullscreen").click();
  await expect(page.getByTestId("event-card")).toHaveCount(48);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("discovery-panel-close").tap();
  await page.locator("#mobileListViewBtn").tap();
  await expect(page.getByTestId("event-card")).toHaveCount(60);
  await expect(page.locator("#mobileResultCount")).toHaveText("60");
  await expect(page.locator("#eventListPagination")).toBeEmpty();
});

test("tablet results scroll to the last event and survive phone/desktop resizing", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await prepareApp(page);
  const list = page.getByTestId("event-list");
  await expect(list).toHaveCSS("overflow-y", "auto");
  await expect(page.locator("#sidebar")).not.toHaveAttribute("aria-modal", "true");
  await swipeUp(page, list);
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(10);
  for (let swipe = 0; swipe < 5; swipe += 1) await swipeUp(page, list);
  await expect(page.getByTestId("event-card").last().locator(".event-status-bar")).toBeInViewport();
  await page.getByTestId("filter-sport-running").tap();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#sidebar")).toHaveAttribute("aria-modal", "true");
  await page.getByTestId("filter-apply").tap();
  await expect(list).toBeVisible();
  await expect(page.getByTestId("event-card")).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("discovery-panel-toggle").tap();
  await expect(page.locator("#sidebar #eventList")).toBeVisible();
  await expect(page.locator("#sidebar-header .filter-actions-row")).toBeVisible();
  await expect(page.getByTestId("event-card")).toHaveCount(2);
  await expect(page.locator("#mobileDiscoveryViews")).toBeHidden();
  await expect(page.locator("#sidebar")).not.toHaveAttribute("aria-modal", "true");
});
