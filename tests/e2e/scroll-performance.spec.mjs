import { expect, prepareApp, test } from "./helpers/browser.mjs";

async function exerciseFastScroll(page, selector) {
  return page.locator(selector).evaluate(async element => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const frameGaps = [];
    let previousFrame = performance.now();

    for (let index = 0; index <= 18; index += 1) {
      await new Promise(resolve => requestAnimationFrame(now => {
        frameGaps.push(now - previousFrame);
        previousFrame = now;
        resolve();
      }));
      element.scrollTop = maxScrollTop * (index / 18);
    }

    const bottomScrollTop = element.scrollTop;

    for (let index = 18; index >= 0; index -= 1) {
      await new Promise(resolve => requestAnimationFrame(now => {
        frameGaps.push(now - previousFrame);
        previousFrame = now;
        resolve();
      }));
      element.scrollTop = maxScrollTop * (index / 18);
    }

    const sortedGaps = [...frameGaps].sort((a, b) => a - b);

    return {
      maxScrollTop,
      bottomScrollTop,
      finalScrollTop: element.scrollTop,
      p95FrameGap: sortedGaps[Math.floor(sortedGaps.length * 0.95)] || 0
    };
  });
}

test("fast Home scrolling uses a stable, paint-efficient scroll surface", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await prepareApp(page, { route: "home", openDiscoveryPanel: false });

  const home = page.locator("#landingPage");
  await expect(home).toBeVisible();

  const styles = await page.evaluate(() => {
    const homeElement = document.querySelector("#landingPage");
    const header = document.querySelector(".sem-header");
    const previewCard = document.querySelector(".sem-next-race-card");
    const homeStyle = getComputedStyle(homeElement);
    const headerStyle = getComputedStyle(header);
    const previewStyle = getComputedStyle(previewCard);

    return {
      overflowY: homeStyle.overflowY,
      overscrollY: homeStyle.overscrollBehaviorY,
      scrollBehavior: homeStyle.scrollBehavior,
      headerBackdrop: headerStyle.backdropFilter,
      previewBackdrop: previewStyle.backdropFilter
    };
  });

  expect(styles).toEqual({
    overflowY: "auto",
    overscrollY: "contain",
    scrollBehavior: "auto",
    headerBackdrop: "none",
    previewBackdrop: "none"
  });

  const result = await exerciseFastScroll(page, "#landingPage");

  console.log(
    `SCROLL_PERF p95=${result.p95FrameGap.toFixed(2)}ms maxScrollTop=${result.maxScrollTop.toFixed(0)}`
  );

  expect(result.maxScrollTop).toBeGreaterThan(1500);
  expect(result.bottomScrollTop).toBeGreaterThanOrEqual(result.maxScrollTop - 2);
  expect(result.finalScrollTop).toBeLessThanOrEqual(2);
  expect(result.p95FrameGap).toBeLessThan(80);
});

test("shared full-page scroll surfaces keep native scrolling enabled", async ({ page }) => {
  await prepareApp(page, { openDiscoveryPanel: false });

  const styles = await page.evaluate(() => {
    const platformPages = document.querySelector("#platformPages");
    const platformStyle = getComputedStyle(platformPages);

    return {
      rootScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      bodyScrollBehavior: getComputedStyle(document.body).scrollBehavior,
      platformOverflowY: platformStyle.overflowY,
      platformOverscrollY: platformStyle.overscrollBehaviorY,
      platformScrollBehavior: platformStyle.scrollBehavior
    };
  });

  expect(styles).toEqual({
    rootScrollBehavior: "auto",
    bodyScrollBehavior: "auto",
    platformOverflowY: "auto",
    platformOverscrollY: "contain",
    platformScrollBehavior: "auto"
  });
});
