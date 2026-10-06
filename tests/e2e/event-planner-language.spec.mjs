import { expect, openEventDrawer, openPlanner, prepareApp, selectPlannerTab, test } from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

for (const width of [1440, 390]) test.describe(`language at ${width}px`, () => {
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width, height: 900 }); });

test("an open event drawer follows both languages and keeps its event", async ({ page }) => {
  const run = fixtureByName["SEM E2E Olympic Triathlon"];
  await prepareApp(page);
  await openEventDrawer(page, run.event_name);
  for (const language of ["de", "en", "de"]) {
    await page.evaluate(language => setAppLanguage(language), language);
    await expect(page.getByTestId("drawer-event-name")).toHaveText(run.event_name);
    await expect(page.locator(".drawer-copy-btn")).toHaveText(language === "de" ? "Eventlink kopieren" : "Copy event link");
    await expect(page.locator(".drawer-share-btn")).toHaveText(language === "de" ? "Teilen" : "Share");
    await expect(page.getByTestId("drawer-add-to-planner")).toHaveText(language === "de" ? "Zur Saison hinzufügen" : "Add to Season");
    await expect(page.locator(".drawer-title-meta")).toContainText(language === "de" ? "Deutschland" : "Germany");
    await expect(page.locator(".drawer-trust-note strong")).toHaveText(language === "de" ? "Vor der Anmeldung prüfen" : "Verify before registering");
  }
});

test("planner fields, options and preset equipment switch without translating user data", async ({ page }) => {
  const tri = fixtureByName["SEM E2E Olympic Triathlon"];
  await prepareApp(page, { allowPlanner: true, favorites: [tri.event_key], seasonPlanMeta: {
    [tri.event_key]: { priority: "A", planner_details: {
      goals: { goal_type: "custom", custom_goal: "Mein persönliches Ziel / my own goal" },
      equipment: { items: ["Meine eigene Brille"], checked: { Neoprenanzug: true } }
    } }
  } });
  await openPlanner(page);
  await selectPlannerTab(page, "events");
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("seasonPlanMeta")));
  for (const language of ["de", "en", "de"]) {
    await page.evaluate(language => setAppLanguage(language), language);
    await expect(page.getByTestId("planner-section-equipment-and-nutrition")).toHaveCount(1);
    await expect(page.getByTestId("planner-section-goal-and-race-strategy")).toHaveCount(1);
    const goal = page.getByTestId("planner-field-goals-custom-goal");
    await expect(goal).toHaveAttribute("placeholder", language === "de" ? "Beschreibe dein Ziel frei..." : "Describe your goal...");
    await expect(goal).toHaveValue("Mein persönliches Ziel / my own goal");
    await expect(page.locator('[data-season-detail-field="equipment.status"] option[value="not_needed"]')).toHaveText(language === "de" ? "Nicht benötigt" : "Not needed");
    await expect(page.locator('[data-season-equipment-row="Neoprenanzug"] > span')).toHaveText(language === "de" ? "Neoprenanzug" : "Wetsuit");
    await expect(page.locator('[data-season-equipment-check="Neoprenanzug"]')).toBeChecked();
    await expect(page.locator('[data-season-equipment-row="Meine eigene Brille"] > span')).toHaveText("Meine eigene Brille");
    await expect(page.getByTestId("planner-nutrition-product")).toHaveAttribute("placeholder", language === "de" ? "Gel, Wasser, Drink..." : "Gel, water, drink...");
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("seasonPlanMeta")))).toEqual(original);
});

test("switching language preserves a focused unsaved custom goal until normal blur saves it", async ({ page }) => {
  const tri = fixtureByName["SEM E2E Olympic Triathlon"];
  const savedGoal = "Bereits gespeichertes Ziel / saved goal";
  const draftGoal = "Mein ungespeichertes Ziel: locker starten / finish strong";
  await prepareApp(page, { allowPlanner: true, favorites: [tri.event_key], seasonPlanMeta: {
    [tri.event_key]: { priority: "A", planner_details: {
      goals: { goal_type: "custom", custom_goal: savedGoal }
    } }
  } });
  await page.evaluate(() => setAppLanguage("de"));
  await openPlanner(page);
  await selectPlannerTab(page, "events");
  await page.getByTestId("planner-event-card").click();
  const section = page.getByTestId("planner-section-goal-and-race-strategy");
  if (!(await section.evaluate(element => element.open))) await section.locator("summary").first().click();
  const goal = page.getByTestId("planner-field-goals-custom-goal");
  await expect(goal).toBeVisible();
  const storedBefore = await page.evaluate(() => localStorage.getItem("seasonPlanMeta"));

  // Filling and typing dispatch input, but deliberately do not blur or change.
  await goal.fill("");
  await goal.pressSequentially(draftGoal);
  await goal.evaluate(input => input.setSelectionRange(5, 18));
  await expect(goal).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("seasonPlanMeta"))).toBe(storedBefore);
  for (const language of ["en", "de"]) {
    await page.evaluate(language => setAppLanguage(language), language);
    await expect(page.getByTestId("planner-events-panel")).toHaveClass(/active/);
    await expect(goal).toBeVisible();
    await expect(goal).toHaveValue(draftGoal);
    await expect(goal).toBeFocused();
    expect(await goal.evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([5, 18]);
    await expect(goal).toHaveAttribute("placeholder", language === "de" ? "Beschreibe dein Ziel frei..." : "Describe your goal...");
    expect(await page.evaluate(() => localStorage.getItem("seasonPlanMeta"))).toBe(storedBefore);
  }

  // A normal user blur, rather than the language action, commits the draft.
  await goal.press("Tab");
  await expect.poll(() => page.evaluate(key =>
    JSON.parse(localStorage.getItem("seasonPlanMeta"))[key]?.planner_details?.goals?.custom_goal,
    tri.event_key)).toBe(draftGoal);
  await expect(goal).toHaveValue(draftGoal);
});
});

test("discovery panel labels follow language changes and desktop-phone transitions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareApp(page);
  await page.getByTestId("event-search").fill("triathlon");
  await page.locator("#countryFilter").selectOption("DE");
  await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute("data-active-filter-count", "1");
  for (const language of ["de", "en", "de"]) {
    await page.evaluate(language => setAppLanguage(language), language);
    await expect(page.locator("#discoveryPanelTitle")).toHaveText(language === "de" ? "Events & Filter" : "Events & filters");
    await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute("aria-label", language === "de" ? "Events & Filter schließen, 1 aktiver Filter" : "Close events and filters, 1 active filter");
    await page.getByTestId("discovery-panel-toggle").click();
    await expect(page.getByTestId("discovery-panel-toggle")).toHaveAttribute("title", language === "de" ? "Events & Filter öffnen, 1 aktiver Filter" : "Open events and filters, 1 active filter");
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByTestId("discovery-panel-toggle").click();
    await expect(page.locator("#discoveryPanelTitle")).toHaveText(language === "de" ? "Events filtern" : "Filter events");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator("#discoveryPanelTitle")).toHaveText(language === "de" ? "Events & Filter" : "Events & filters");
    await expect(page.getByTestId("event-search")).toHaveValue("triathlon");
  }
});
