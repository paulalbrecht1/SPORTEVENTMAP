import { expect, prepareApp, test } from "./helpers/browser.mjs";

test.use({ hasTouch: true });

const menus = [
  {
    route: "home",
    menu: "#landingMobileMenu",
    opener: "#landingMenuBtn",
    closer: "#landingMenuCloseBtn",
    scroll: ".sem-mobile-menu-scroll",
    language: "#landingMobileLanguageSelect"
  },
  {
    route: "discovery",
    menu: "#platformMobileMenu",
    opener: "#platformMenuBtn",
    closer: "#platformMenuCloseBtn",
    scroll: ".platform-mobile-menu-scroll",
    language: "#topbarLanguageSelect"
  }
];

const infoLinks = [
  ["about.html", "Über uns", "About"],
  ["contact.html", "Kontakt", "Contact"],
  ["imprint.html", "Impressum", "Legal notice"],
  ["privacy.html", "Datenschutz", "Privacy"],
  ["legal.html", "Nutzungsbedingungen", "Terms"]
];

async function swipeUp(page, locator) {
  const bounds = await locator.boundingBox();
  const x = Math.round(bounds.x + bounds.width / 2);
  const bottom = Math.round(bounds.y + bounds.height - 22);
  const top = Math.round(bounds.y + 22);
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: bottom }]
  });
  for (let step = 1; step <= 10; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: bottom - (bottom - top) * step / 10 }]
    });
    await page.waitForTimeout(25);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  await session.detach();
}

for (const navigation of menus) {
  test(`${navigation.route} mobile menu scrolls by touch while its close control stays reachable`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await prepareApp(page, {
      route: navigation.route,
      openDiscoveryPanel: false
    });

    const menu = page.locator(navigation.menu);
    const opener = page.locator(navigation.opener);
    const closer = page.locator(navigation.closer);
    const scroll = menu.locator(navigation.scroll);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 667, height: 375 }
    ]) {
      await page.setViewportSize(viewport);
      await expect(menu).toHaveAttribute("aria-hidden", "true");
      await expect(menu).toHaveJSProperty("inert", true);
      await menu.locator("a").first().evaluate(link => link.focus());
      await expect(menu.locator("a").first()).not.toBeFocused();

      await opener.click();
      await expect(menu).toHaveAttribute("aria-hidden", "false");
      await expect(menu).toHaveJSProperty("inert", false);
      await expect(closer).toBeFocused();

      const closeBounds = await closer.boundingBox();
      const initialScroll = await scroll.evaluate(element => element.scrollTop);
      await swipeUp(page, scroll);
      await expect.poll(() => scroll.evaluate(element => element.scrollTop))
        .toBeGreaterThan(initialScroll + 20);

      for (let index = 0; index < 4; index += 1) {
        await swipeUp(page, scroll);
      }
      await expect(menu.locator('a[href="legal.html"]')).toBeInViewport();
      await expect(closer).toBeInViewport();
      const afterCloseBounds = await closer.boundingBox();
      expect(Math.abs(afterCloseBounds.y - closeBounds.y)).toBeLessThan(2);
      expect(afterCloseBounds.height).toBeGreaterThanOrEqual(44);

      await closer.click();
      await expect(menu).toHaveAttribute("aria-hidden", "true");
      await expect(opener).toBeFocused();
    }
  });

  test(`${navigation.route} mobile information links translate and keyboard navigation stays within the menu`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareApp(page, {
      route: navigation.route,
      openDiscoveryPanel: false
    });

    const menu = page.locator(navigation.menu);
    const opener = page.locator(navigation.opener);
    const closer = page.locator(navigation.closer);
    const lastLink = menu.locator('a[href="legal.html"]');

    for (const language of ["de", "en"]) {
      if (navigation.route === "home") {
        await opener.click();
      }
      await page.locator(navigation.language).selectOption(language);
      if (navigation.route !== "home") {
        await opener.click();
      }
      await expect(closer).toHaveAttribute(
        "aria-label",
        language === "de" ? "Navigation schließen" : "Close navigation"
      );
      await expect(menu.locator('[data-i18n="nav.information"]')).toHaveText(
        language === "de" ? "Information & Kontakt" : "Information & contact"
      );

      for (const [href, german, english] of infoLinks) {
        await expect(menu.locator(`a[href="${href}"]`))
          .toHaveText(language === "de" ? german : english);
      }

      // Theme controls may precede Close; Tab from the last item must still
      // stay in the menu, and Shift+Tab from the first must wrap to Terms.
      await lastLink.focus();
      await page.keyboard.press("Tab");
      expect(await menu.evaluate(element => element.contains(document.activeElement)))
        .toBe(true);
      await page.keyboard.press("Shift+Tab");
      await expect(lastLink).toBeFocused();

      const backgroundClasses = await page.locator("body").getAttribute("class");
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-hidden", "true");
      await expect(opener).toBeFocused();
      expect(await page.locator("body").getAttribute("class"))
        .toBe(backgroundClasses.replace(/\s*(platform-menu-open|sem-menu-open)/g, ""));
    }

    await opener.click();
    await menu.locator('a[href="imprint.html"]').click();
    await expect(page).toHaveURL(/\/imprint\.html$/);
    await expect(page.locator("h1")).toHaveText("Legal notice");
  });
}
