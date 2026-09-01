import {
  expect,
  prepareApp,
  test
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

const DISCOVERY_EVENT_COUNT = 3;

function expectContrastAtLeast(sample, minimum, label) {
  expect(
    sample.contrast,
    `${label}: ${sample.color} on ${sample.background}`
  ).toBeGreaterThanOrEqual(minimum);
}

async function readContrast(locator, pseudo = null) {
  return locator.evaluate((element, pseudoElement) => {
    const parse = value => {
      const channels = value
        .match(/[\d.]+/g)
        ?.slice(0, 4)
        .map(Number) || [];

      return {
        red: channels[0] || 0,
        green: channels[1] || 0,
        blue: channels[2] || 0,
        alpha: channels[3] ?? 1
      };
    };
    const composite = (front, back) => ({
      red: front.red * front.alpha + back.red * (1 - front.alpha),
      green: front.green * front.alpha + back.green * (1 - front.alpha),
      blue: front.blue * front.alpha + back.blue * (1 - front.alpha),
      alpha: 1
    });
    const channel = value => {
      const normalized = value / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = color =>
      0.2126 * channel(color.red) +
      0.7152 * channel(color.green) +
      0.0722 * channel(color.blue);

    const style = getComputedStyle(element);
    const foregroundStyle = pseudoElement
      ? getComputedStyle(element, pseudoElement)
      : style;
    const foreground = parse(foregroundStyle.color);
    let background = { red: 255, green: 255, blue: 255, alpha: 1 };
    const ancestors = [];

    for (let current = element; current; current = current.parentElement) {
      ancestors.push(current);
    }

    for (const ancestor of ancestors.reverse()) {
      const color = parse(getComputedStyle(ancestor).backgroundColor);
      if (color.alpha > 0) {
        background = composite(color, background);
      }
    }

    const foregroundOnBackground = composite(foreground, background);
    const light = Math.max(
      luminance(foregroundOnBackground),
      luminance(background)
    );
    const dark = Math.min(
      luminance(foregroundOnBackground),
      luminance(background)
    );

    return {
      color: foregroundStyle.color,
      background: `rgb(${Math.round(background.red)}, ${Math.round(background.green)}, ${Math.round(background.blue)})`,
      contrast: (light + 0.05) / (dark + 0.05)
    };
  }, pseudo);
}

test("mobile filters keep one state through combine, apply, remove and reset", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareApp(page, { openDiscoveryPanel: false });

  const run = fixtureByName["SEM E2E Future Run"];
  const panel = page.locator("#sidebar");
  const toggle = page.getByTestId("discovery-panel-toggle");
  const close = page.getByTestId("discovery-panel-close");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toHaveAttribute("role", "dialog");
  await expect(panel).toHaveAttribute("aria-modal", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("body")).toHaveClass(/discovery-panel-open/);
  await expect(page.locator("body")).not.toHaveClass(/mobile-filter-open/);

  const openInteractionState = await page.evaluate(() => ({
    mapPointerEvents: getComputedStyle(document.querySelector("#map")).pointerEvents,
    panelTouchAction: getComputedStyle(document.querySelector("#sidebar")).touchAction,
    panelOverscroll: getComputedStyle(document.querySelector("#sidebar")).overscrollBehavior,
    panelOverflow: getComputedStyle(document.querySelector("#sidebar-header")).overflowY
  }));

  expect(openInteractionState).toEqual({
    mapPointerEvents: "none",
    panelTouchAction: "pan-y",
    panelOverscroll: "contain",
    panelOverflow: "auto"
  });

  await page.getByTestId("filter-sport-running").click();
  await page.locator("#distanceFilterToggle").click();
  await page.locator('[data-distance-filter="10k"]').click();
  await page.locator("#countryFilter").selectOption("DE");

  await expect(page.getByTestId("filter-sport-running")).toHaveClass(/active/);
  await expect(page.locator('[data-distance-filter="10k"]')).toHaveClass(/active/);
  await expect(page.locator("#countryFilter")).toHaveValue("DE");
  await expect(page.locator("#discoveryFilterCount")).toHaveText("3");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card")).toContainText(run.event_name);

  await page.locator("#sidebar-header").evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByTestId("filter-apply")).toBeVisible();
  const applyBounds = await page.getByTestId("filter-apply").evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      height: bounds.height,
      viewportHeight: window.innerHeight
    };
  });
  expect(applyBounds.height).toBeGreaterThanOrEqual(44);
  expect(applyBounds.top).toBeGreaterThanOrEqual(0);
  expect(applyBounds.bottom).toBeLessThanOrEqual(applyBounds.viewportHeight + 1);

  await page.getByTestId("filter-apply").click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("body")).not.toHaveClass(/discovery-panel-open|mobile-filter-open/);
  await expect(page.getByTestId("filter-sport-running")).toHaveClass(/active/);
  await expect(page.locator('[data-distance-filter="10k"]')).toHaveClass(/active/);
  await expect(page.locator("#countryFilter")).toHaveValue("DE");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe("toggleSidebar");

  await toggle.click();
  await close.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("body")).toHaveClass(/discovery-panel-open/);
  await expect(page.locator("body")).not.toHaveClass(/mobile-filter-open/);

  await page.getByTestId("filter-sport-running").click();
  await expect(page.getByTestId("filter-sport-all")).toHaveClass(/active/);
  await expect(page.locator("#discoveryFilterCount")).toHaveText("2");

  await page.getByTestId("filter-reset").click();
  await expect(page.getByTestId("filter-sport-all")).toHaveClass(/active/);
  await expect(page.locator(".distance-filter-chip.active")).toHaveCount(0);
  await expect(page.locator("#countryFilter")).toHaveValue("all");
  await expect(page.locator("#dateFilter")).toHaveValue("all");
  await expect(page.getByTestId("event-search")).toHaveValue("");
  await expect(page.locator("#discoveryFilterCount")).toBeHidden();
  await expect(page.getByTestId("event-card")).toHaveCount(DISCOVERY_EVENT_COUNT);

  await close.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe("toggleSidebar");
});

test("mobile navigation and login fields stay readable in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await prepareApp(page, { openDiscoveryPanel: false });

  await page.evaluate(() => {
    window.SportEventMapTheme.apply("light", { persist: true });
    document.querySelector('[data-admin-nav]').style.display = "flex";
  });
  await page.locator("#platformMenuBtn").click();
  await expect(page.locator("#platformMobileMenu")).toHaveClass(/open/);

  const visibleMenuItems = page.locator(
    "#platformMobileMenu a:visible, #platformMobileMenu .platform-mobile-menu-actions button:visible"
  );
  const visibleMenuItemCount = await visibleMenuItems.count();
  expect(visibleMenuItemCount).toBeGreaterThanOrEqual(9);

  for (let index = 0; index < visibleMenuItemCount; index += 1) {
    const item = visibleMenuItems.nth(index);
    expectContrastAtLeast(
      await readContrast(item),
      4.5,
      (await item.innerText()).trim()
    );
    const height = await item.evaluate(element => element.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(44);
  }

  await page.locator("#platformMenuCloseBtn").click();
  await page.evaluate(() => {
    window.SportEventMapTheme.apply("dark", { persist: true });
  });
  await page.locator("#platformMenuBtn").click();
  await page.locator('[data-platform-mobile-action="loginBtn"]').click();
  await expect(page.locator("#authModal")).toHaveClass(/open/);

  const email = page.locator("#authEmail");
  const password = page.locator("#authPassword");
  await email.fill("runner@example.test");
  await password.fill("example-password");
  await expect(email).toHaveValue("runner@example.test");
  await expect(password).toHaveValue("example-password");

  for (const field of [email, password]) {
    expectContrastAtLeast(await readContrast(field), 4.5, "dark auth input");
    expectContrastAtLeast(
      await readContrast(field, "::placeholder"),
      4.5,
      "dark auth placeholder"
    );
    const appearance = await field.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        caret: style.caretColor,
        color: style.color,
        textFill: style.webkitTextFillColor
      };
    });

    expect(appearance.background).toBe("rgb(30, 41, 59)");
    expect(appearance.color).toBe("rgb(248, 250, 252)");
    expect(appearance.caret).toBe("rgb(248, 250, 252)");
    expect(appearance.textFill).toBe("rgb(248, 250, 252)");
    expect(appearance.border).not.toBe("rgb(249, 250, 251)");
  }

  await email.focus();
  await expect(email).toHaveCSS("border-color", "rgb(34, 197, 94)");
  await expect(email).not.toHaveCSS("box-shadow", "none");

  const authLayout = await page.locator("#authModal .auth-card").evaluate(card => {
    const bounds = card.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: card.scrollWidth,
      clientWidth: card.clientWidth
    };
  });
  expect(authLayout.left).toBeGreaterThanOrEqual(7);
  expect(authLayout.right).toBeLessThanOrEqual(authLayout.viewportWidth - 7);
  expect(authLayout.top).toBeGreaterThanOrEqual(7);
  expect(authLayout.bottom).toBeLessThanOrEqual(authLayout.viewportHeight - 7);
  expect(authLayout.scrollWidth).toBeLessThanOrEqual(authLayout.clientWidth + 1);

  const styleSource = await page.evaluate(async () => {
    const response = await fetch(document.querySelector('link[href*="style.css"]').href);
    return response.text();
  });
  expect(styleSource).toContain("input:is(:-webkit-autofill, :autofill)");
});

test("mobile footer controls keep contrast, touch size and page width", async ({ page }) => {
  await prepareApp(page, { openDiscoveryPanel: false });

  for (const theme of ["light", "dark"]) {
    await page.evaluate(activeTheme => {
      window.SportEventMapTheme.apply(activeTheme, { persist: false });
    }, theme);

    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const controls = page.locator("#discoveryFooter #legalLinks a, #discoveryFooter #legalLinks button");
      const count = await controls.count();

      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        expectContrastAtLeast(
          await readContrast(control),
          4.5,
          `${theme} footer at ${width}px`
        );
        const height = await control.evaluate(element => element.getBoundingClientRect().height);
        expect(height).toBeGreaterThanOrEqual(44);
      }

      const layout = await page.evaluate(() => ({
        pageOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        footerOverflow:
          document.querySelector("#legalLinks").scrollWidth -
          document.querySelector("#legalLinks").clientWidth
      }));

      expect(layout.pageOverflow, `${theme} ${width}px`).toBeLessThanOrEqual(2);
      expect(layout.footerOverflow, `${theme} ${width}px internal scroll`).toBeGreaterThanOrEqual(0);
    }
  }
});

test("tablet filter panel stays non-modal across map and list views", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareApp(page, { openDiscoveryPanel: false });

  const panel = page.locator("#sidebar");
  const toggle = page.getByTestId("discovery-panel-toggle");
  const fullscreen = page.locator("#toggleEventListFullscreen");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toHaveAttribute("role", "complementary");
  await expect(panel).not.toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("event-list")).toBeVisible();
  await expect(fullscreen).toBeVisible();
  await expect(page.getByTestId("map")).toHaveCSS("pointer-events", "auto");

  const splitLayout = await page.evaluate(() => {
    const panelBounds = document.querySelector("#sidebar").getBoundingClientRect();
    const mapBounds = document.querySelector("#map").getBoundingClientRect();

    return {
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      panelInsideMap:
        panelBounds.left >= mapBounds.left - 1 &&
        panelBounds.right <= mapBounds.right + 1 &&
        panelBounds.top >= mapBounds.top - 1 &&
        panelBounds.bottom <= mapBounds.bottom + 1
    };
  });

  expect(splitLayout.pageOverflow).toBeLessThanOrEqual(2);
  expect(splitLayout.panelInsideMap).toBe(true);

  await fullscreen.click();
  await expect(page.locator("body")).toHaveClass(/event-list-fullscreen/);
  const fullscreenFilterLayout = await page.evaluate(() => {
    const sport = document.querySelector(".filter-sport-card")
      .getBoundingClientRect();
    const distance = document.querySelector(".filter-distance-card")
      .getBoundingClientRect();

    return {
      gap: distance.top - sport.bottom,
      headerOverflow:
        getComputedStyle(document.querySelector("#sidebar-header")).overflowY
    };
  });
  expect(fullscreenFilterLayout.gap).toBeGreaterThanOrEqual(0);
  expect(fullscreenFilterLayout.headerOverflow).toBe("auto");
  await page.getByTestId("filter-sport-running").click();
  await expect(page.getByTestId("filter-sport-running")).toHaveClass(/active/);
  await expect(page.getByTestId("event-card")).toHaveCount(2);

  await fullscreen.click();
  await expect(page.locator("body")).not.toHaveClass(/event-list-fullscreen/);
  await expect(page.getByTestId("filter-sport-running")).toHaveClass(/active/);
  await expect(page.getByTestId("event-card")).toHaveCount(2);

  await page.getByTestId("discovery-panel-close").click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
