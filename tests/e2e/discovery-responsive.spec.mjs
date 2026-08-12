import {
  expect,
  openEventDrawer,
  prepareApp,
  test
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

const viewportMatrix = [
  [1280, 720],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1600, 900],
  [1920, 1080],
  [768, 1024],
  [810, 1080],
  [820, 1180],
  [1024, 1366],
  [1024, 768],
  [1080, 810],
  [1180, 820],
  [1366, 1024],
  [320, 568],
  [360, 640],
  [360, 800],
  [375, 667],
  [375, 812],
  [390, 844],
  [412, 915],
  [430, 932],
  [568, 320],
  [640, 360],
  [800, 360],
  [667, 375],
  [812, 375],
  [844, 390],
  [915, 412],
  [932, 430],
  // Effective CSS viewports for common laptop windows at 125% zoom.
  [1024, 576],
  [1093, 614],
  [1152, 720]
];

async function waitForPanelTransition(page) {
  await page.waitForFunction(() => {
    const sidebar = document.querySelector("#sidebar");
    const hasRunningAnimation =
      sidebar?.getAnimations().some(animation =>
        animation.playState === "running"
      );

    return (
      !document.body.classList.contains("sidebar-is-transitioning") &&
      !hasRunningAnimation
    );
  });
}

test("Discovery remains usable across the responsive viewport matrix", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareApp(page, { openDiscoveryPanel: false });

  const panelToggle =
    page.getByTestId("discovery-panel-toggle");
  const panelClose =
    page.getByTestId("discovery-panel-close");

  for (const [width, height] of viewportMatrix) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(page.getByTestId("map")).toBeVisible();
    await expect(panelToggle).toHaveAttribute("aria-expanded", "false");
    await waitForPanelTransition(page);

    const closedLayout = await page.evaluate(() => {
      const rect = selector => {
        const element = document.querySelector(selector);

        if (!element) return null;

        const bounds = element.getBoundingClientRect();

        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height
        };
      };
      const map = rect("#map");
      const app = rect("#app");
      const footer = rect("#discoveryFooter");
      const tools = rect("#mapToolsToggle");
      const toggle = rect("#toggleSidebar");
      const visibleHeaderControls = [
        ...document.querySelectorAll(
          "#topbar button, #topbar select, #topbar .platform-nav a"
        )
      ]
        .map(element => element.getBoundingClientRect())
        .filter(bounds => bounds.width > 0 && bounds.height > 0);

      return {
        horizontalOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        mapHeight: map?.height || 0,
        mapFillsWorkspace: Boolean(
          map &&
          app &&
          map.left >= app.left - 1 &&
          map.right <= app.right + 1 &&
          map.width >= app.width * 0.95
        ),
        footerBelowMap:
          Boolean(map && footer && footer.top >= map.bottom - 1),
        footerInViewport:
          Boolean(footer && footer.bottom <= window.innerHeight + 4),
        footerBottom: footer?.bottom || 0,
        viewportHeight: window.innerHeight,
        toolsClearFooter:
          Boolean(tools && footer && tools.bottom < footer.top),
        toggleInViewport:
          Boolean(
            toggle &&
            toggle.left >= 0 &&
            toggle.right <= window.innerWidth &&
            toggle.top >= 0 &&
            toggle.bottom <= window.innerHeight
          ),
        headerControlsInViewport:
          visibleHeaderControls.every(bounds =>
            bounds.left >= -1 &&
            bounds.right <= window.innerWidth + 1
          )
      };
    });

    expect(closedLayout.horizontalOverflow, `${width}x${height}`).toBeLessThanOrEqual(2);
    expect(closedLayout.mapHeight, `${width}x${height}`).toBeGreaterThanOrEqual(170);
    expect(
      closedLayout.mapFillsWorkspace,
      `${width}x${height} closed ${JSON.stringify(closedLayout)}`
    ).toBe(true);
    expect(closedLayout.footerBelowMap, `${width}x${height}`).toBe(true);
    expect(
      closedLayout.footerInViewport,
      `${width}x${height} ${JSON.stringify(closedLayout)}`
    ).toBe(true);
    expect(closedLayout.toolsClearFooter, `${width}x${height}`).toBe(true);
    expect(closedLayout.toggleInViewport, `${width}x${height}`).toBe(true);
    expect(closedLayout.headerControlsInViewport, `${width}x${height}`).toBe(true);

    await panelToggle.click();
    await expect(panelToggle).toHaveAttribute("aria-expanded", "true");
    await waitForPanelTransition(page);

    const isPortraitTablet =
      width >= 1024 && width <= 1180 && height > width;
    const isShortLandscape =
      width <= 960 && height <= 500 && width > height;
    const usesDrawer =
      width <= 1023 || isPortraitTablet;
    const usesFullScreenPhonePanel =
      width <= 767;
    const openLayout = await page.evaluate(() => {
      const sidebar =
        document.querySelector("#sidebar")?.getBoundingClientRect();
      const map =
        document.querySelector("#map")?.getBoundingClientRect();
      const app =
        document.querySelector("#app")?.getBoundingClientRect();
      const tools =
        document.querySelector("#mapToolsToggle");

      return {
        horizontalOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        sidebarInWorkspace: Boolean(
          sidebar &&
          app &&
          sidebar.left >= app.left - 1 &&
          sidebar.right <= app.right + 1 &&
          sidebar.top >= app.top - 1 &&
          sidebar.bottom <= app.bottom + 1
        ),
        sidebarInViewport: Boolean(
          sidebar &&
          sidebar.left >= -1 &&
          sidebar.right <= window.innerWidth + 1 &&
          sidebar.top >= -1 &&
          sidebar.bottom <= window.innerHeight + 1
        ),
        sidebarWidth: sidebar?.width || 0,
        sidebarHeight: sidebar?.height || 0,
        mapWidth: map?.width || 0,
        sidebarRect: sidebar
          ? {
              left: sidebar.left,
              right: sidebar.right,
              top: sidebar.top,
              bottom: sidebar.bottom
            }
          : null,
        appRect: app
          ? {
              left: app.left,
              right: app.right,
              top: app.top,
              bottom: app.bottom
            }
          : null,
        toolsVisible: Boolean(
          tools &&
          getComputedStyle(tools).visibility !== "hidden" &&
          getComputedStyle(tools).opacity !== "0"
        )
      };
    });

    expect(openLayout.horizontalOverflow, `${width}x${height} open`).toBeLessThanOrEqual(2);
    expect(
      isShortLandscape || usesFullScreenPhonePanel
        ? openLayout.sidebarInViewport
        : openLayout.sidebarInWorkspace,
      `${width}x${height} open ${JSON.stringify(openLayout)}`
    ).toBe(true);

    if (isShortLandscape) {
      expect(openLayout.sidebarHeight, `${width}x${height} fullscreen`).toBeGreaterThanOrEqual(
        height - 1
      );
    }

    if (usesDrawer) {
      await expect(panelClose).toBeVisible();
      expect(openLayout.toolsVisible, `${width}x${height} drawer`).toBe(false);

      if (width <= 767) {
        expect(openLayout.sidebarWidth, `${width}x${height} drawer`).toBeGreaterThanOrEqual(
          openLayout.mapWidth * 0.95
        );
      }

      await panelClose.click();
      await expect(panelToggle).toHaveAttribute("aria-expanded", "false");
      await expect.poll(() =>
        page.evaluate(() => document.activeElement?.id)
      ).toBe("toggleSidebar");
    } else {
      expect(openLayout.mapWidth, `${width}x${height} split`).toBeGreaterThanOrEqual(480);
      await panelToggle.click();
      await expect(panelToggle).toHaveAttribute("aria-expanded", "false");
    }

    await waitForPanelTransition(page);
  }
});

test("event drawer stays contained and scrollable at release viewports", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });

  const run = fixtureByName["SEM E2E Future Run"];
  const triathlon = fixtureByName["SEM E2E Olympic Triathlon"];
  const releaseViewports = [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [430, 932],
    [390, 844],
    [375, 812],
    [360, 800]
  ];

  for (const [width, height] of releaseViewports) {
    await page.setViewportSize({ width, height });
    await prepareApp(page, { openDiscoveryPanel: false });
    await openEventDrawer(page, run.event_name);
    await page.waitForFunction(() => {
      const drawer = document.querySelector("#eventDrawer.open");

      return (
        drawer?.getBoundingClientRect().width > 250 &&
        !drawer.getAnimations().some(animation => animation.playState === "running")
      );
    });

    const drawer = page.getByTestId("event-drawer");
    const drawerContent = page.locator("#drawerContent");
    const drawerLayout = await drawer.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const content = element.querySelector("#drawerContent");
      const titlebar = content.querySelector(".drawer-titlebar")?.getBoundingClientRect();
      const descendants = [...content.querySelectorAll("*")];
      const overflowingDescendants = descendants
        .filter(child => !child.classList.contains("drawer-titlebar"))
        .filter(child => {
          const childBounds = child.getBoundingClientRect();

          return (
            childBounds.left < bounds.left - 1 ||
            childBounds.right > bounds.right + 1
          );
        })
        .map(child => child.className || child.id || child.tagName)
        .slice(0, 5);

      return {
        viewportWidth: window.innerWidth,
        pageOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        drawerLeft: bounds.left,
        drawerRight: bounds.right,
        drawerWidth: bounds.width,
        titlebarLeft: titlebar?.left ?? 0,
        titlebarRight: titlebar?.right ?? 0,
        contentClientWidth: content.clientWidth,
        contentScrollWidth: content.scrollWidth,
        contentClientHeight: content.clientHeight,
        contentScrollHeight: content.scrollHeight,
        overflowX: getComputedStyle(content).overflowX,
        overflowY: getComputedStyle(content).overflowY,
        overflowingDescendants
      };
    });

    expect(drawerLayout.pageOverflow, `${width}x${height}`).toBeLessThanOrEqual(2);
    expect(drawerLayout.drawerLeft, `${width}x${height}`).toBeGreaterThanOrEqual(-1);
    expect(drawerLayout.drawerRight, `${width}x${height}`).toBeLessThanOrEqual(width + 1);
    if (width <= 767) {
      expect(drawerLayout.titlebarLeft, `${width}x${height} titlebar`).toBeGreaterThanOrEqual(
        drawerLayout.drawerLeft - 1
      );
      expect(drawerLayout.titlebarRight, `${width}x${height} titlebar`).toBeLessThanOrEqual(
        drawerLayout.drawerRight + 1
      );
    }
    expect(drawerLayout.contentScrollWidth, `${width}x${height}`).toBeLessThanOrEqual(
      drawerLayout.contentClientWidth + (width <= 767 ? 1 : 4)
    );
    expect(drawerLayout.overflowX, `${width}x${height}`).toMatch(/clip|hidden/);
    expect(drawerLayout.overflowY, `${width}x${height}`).toBe("auto");
    expect(drawerLayout.contentScrollHeight, `${width}x${height}`).toBeGreaterThanOrEqual(
      drawerLayout.contentClientHeight
    );
    if (width <= 767) {
      expect(drawerLayout.contentScrollHeight, `${width}x${height} mobile scroll`).toBeGreaterThan(
        drawerLayout.contentClientHeight
      );
    }
    expect(drawerLayout.overflowingDescendants, `${width}x${height}`).toEqual([]);

    if (drawerLayout.contentScrollHeight > drawerLayout.contentClientHeight) {
      await drawerContent.evaluate(element => {
        element.scrollTop = element.scrollHeight;
      });
      await expect.poll(() => drawerContent.evaluate(element =>
        Math.round(element.scrollTop + element.clientHeight) >= element.scrollHeight - 1
      )).toBe(true);
    }
    await expect(page.locator("#eventDrawer .drawer-button")).toBeVisible();

    const favorite = page.getByTestId("drawer-favorite");
    const wasFavorite = await favorite.evaluate(element => element.classList.contains("active"));
    await favorite.click();
    await expect.poll(() => favorite.evaluate(element => element.classList.contains("active")))
      .toBe(!wasFavorite);
    await favorite.click();

    await page.getByTestId("drawer-close").click();
    await expect(drawer).not.toHaveClass(/open/);
    await openEventDrawer(page, triathlon.event_name);
    await expect(page.getByTestId("drawer-event-name")).toContainText(triathlon.event_name);
    await page.getByTestId("drawer-close").click();
  }
});
