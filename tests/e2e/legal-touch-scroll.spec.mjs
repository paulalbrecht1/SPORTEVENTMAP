import { devices, expect, test } from "@playwright/test";

const legalPages = [
  "/imprint.html",
  "/privacy.html",
  "/legal.html",
  "/contact.html",
  "/about.html",
  "/terms.html"
];

const viewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 }
];

async function swipeUp(page, session, viewport) {
  const x = Math.round(viewport.width / 2);
  const startY = Math.round(viewport.height * 0.8);
  const distance = Math.round(viewport.height * 0.55);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: startY }]
  });
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: startY - Math.round(distance * step / 8) }]
    });
    await page.waitForTimeout(24);
  }
  // Finish at rest so a subsequent link tap is not consumed by fling cancellation.
  await page.waitForTimeout(120);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
}

for (const viewport of viewports) {
  test(`legal pages scroll with touch and expose the footer at ${viewport.width}x${viewport.height}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      ...devices["Pixel 5"],
      baseURL,
      viewport
    });
    await context.addInitScript(() => {
      localStorage.setItem("sportEventMapLanguage", "de");
      localStorage.setItem("sportEventMapTheme", "light");
    });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);

    try {
      for (const path of legalPages) {
        await page.goto(path);
        const initial = await page.evaluate(() => ({
          scrollY,
          scrollHeight: document.scrollingElement.scrollHeight,
          viewportHeight: innerHeight
        }));

        // Browser touch input must scroll the document. A scripted scrollTop
        // or scrollIntoView would also move containers locked by overflow:hidden.
        await swipeUp(page, session, viewport);

        if (initial.scrollHeight > initial.viewportHeight + 1) {
          await expect.poll(() => page.evaluate(() => scrollY), `${path}: first touch scroll`).toBeGreaterThan(initial.scrollY);
        }

        const footer = page.locator(".legal-page-footer");
        const hasFooter = await footer.count() > 0;
        const endOfPage = hasFooter ? footer : page.locator(".legal-page-content > :last-child");
        const maxSwipes = Math.ceil(initial.scrollHeight / (viewport.height * 0.5)) + 3;
        for (let swipe = 0; swipe < maxSwipes; swipe += 1) {
          const contentBottom = await endOfPage.evaluate(element => element.getBoundingClientRect().bottom);
          if (contentBottom <= viewport.height) break;
          await swipeUp(page, session, viewport);
        }
        await expect(endOfPage, `${path}: final content is reachable with touch`).toBeInViewport({ ratio: 1 });
        const metrics = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollTop: document.body.scrollTop
        }));
        expect(metrics.scrollWidth, `${path}: horizontal overflow`).toBeLessThanOrEqual(metrics.width);
        expect(metrics.bodyScrollTop, `${path}: avoid a separate body scroller`).toBe(0);

        if (hasFooter) {
          const privacyLink = footer.locator('a[href="privacy.html"]');
          // The footer is already fully visible; wait for touch inertia to settle
          // before tapping so the gesture activates the link rather than stopping a fling.
          await privacyLink.tap();
          await expect(page).toHaveURL(/\/privacy\.html$/);
        }
      }
    } finally {
      await context.close();
    }
  });
}
