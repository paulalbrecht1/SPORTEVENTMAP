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
        event_name: "Durlacher Turmberglauf",
        distance: "10 km"
      }),
      getEventMarkerType({
        sport: "Trail Running",
        event_name: "Hermannslauf",
        distance: "31.1 km"
      }),
      getEventMarkerType({
        sport: "Ultramarathon",
        event_name: "Incorrect short trail",
        distance: "10 km"
      }),
      getEventMarkerType({
        sport: "Running",
        event_name: "Marathon",
        distance: "42,195 km"
      }),
      getEventMarkerType({
        sport: "Ultramarathon",
        event_name: "Kaiserkrone Trail",
        distance: "56.1 km"
      }),
      getEventMarkerType({
        sport: "Ultramarathon",
        event_name: "HOKA UTMB Mont-Blanc",
        distance: "OCC / CCC / TDS / UTMB"
      }),
      getEventMarkerType({
        sport: "Ultramarathon",
        event_name: "24-Stunden-Lauf",
        distance: "24h Ultramarathon"
      }),
      getEventMarkerType({
        sport: "Triathlon",
        event_name: "Olympic Triathlon",
        distance: "Olympic"
      }),
      getEventMarkerType({
        sport: "Running",
        event_name: "Indeland-Triathlon",
        distance: "5 km / 20 km / 5 km"
      })
    ]);

  expect(markerTypes).toEqual([
    "running",
    "running",
    "running",
    "running",
    "running",
    "ultra",
    "ultra",
    "ultra",
    "triathlon",
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
