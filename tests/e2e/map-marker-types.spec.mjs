import {
  expect,
  prepareApp,
  test
} from "./helpers/browser.mjs";

test("Discovery distinguishes running, ultra and triathlon markers", async ({ page }) => {
  await prepareApp(page, {
    openDiscoveryPanel: false
  });

  const legend =
    page.getByTestId("map-legend");

  await expect(legend).toBeVisible();
  await expect(legend).toContainText("Running");
  await expect(legend).toContainText("Ultra");
  await expect(legend).toContainText("Triathlon");

  const markerTypes =
    await page.evaluate(() => [
      getEventMarkerType({
        sport: "Running",
        event_name: "City Run",
        distance: "10 km"
      }),
      getEventMarkerType({
        sport: "Running",
        event_name: "Alpine Ultra Trail",
        distance: "80 km"
      }),
      getEventMarkerType({
        sport: "Triathlon",
        event_name: "Olympic Triathlon",
        distance: "Olympic"
      })
    ]);

  expect(markerTypes).toEqual([
    "running",
    "ultra",
    "triathlon"
  ]);

  const markerMarkup = await page.evaluate(() => [
    renderEventMarkerPin("running"),
    renderEventMarkerPin("ultra"),
    renderEventMarkerPin("triathlon")
  ]);

  expect(markerMarkup).toEqual([
    '<span class="event-map-pin event-map-pin--running" data-event-marker-type="running" aria-hidden="true"></span>',
    '<span class="event-map-pin event-map-pin--ultra" data-event-marker-type="ultra" aria-hidden="true"></span>',
    '<span class="event-map-pin event-map-pin--triathlon" data-event-marker-type="triathlon" aria-hidden="true"></span>'
  ]);

  await page.setViewportSize({
    width: 320,
    height: 720
  });

  const layout =
    await legend.evaluate(element => ({
      right:
        element.getBoundingClientRect().right,
      width:
        element.getBoundingClientRect().width,
      viewport:
        document.documentElement.clientWidth,
      documentWidth:
        document.documentElement.scrollWidth
    }));

  expect(layout.right).toBeLessThanOrEqual(layout.viewport);
  expect(layout.width).toBeLessThan(layout.viewport);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
});
