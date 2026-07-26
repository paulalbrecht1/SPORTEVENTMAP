import {
  expect,
  prepareApp,
  test
} from "./helpers/browser.mjs";

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
