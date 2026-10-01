import { expect, openPlanner, prepareApp, selectPlannerTab, test } from "./helpers/browser.mjs";

async function ownArchivedFixture(page) {
  await prepareApp(page);
  await page.waitForFunction(() => typeof loadRemotePlanningState === "function");
  await page.evaluate(() => {
    window.actualPersonalPlannerSync = window.syncSeasonPlanMetaToSupabase;
    const old = { event_id: 7, edition_id: "11111111-1111-4111-8111-111111111111", edition_year: 2020,
      event_key: "sem personal history|15.03.2020|berlin", edition_slug: "sem-personal-history-2020",
      event_name: "SEM Personal History 2020", date: "15.03.2020", city: "Berlin", country: "Germany", sport: "Running",
      publication_status: "archived", catalog_visibility: "owned_archived",
      event_status: "completed", distance: "10 km", race_formats: [{ label: "10 km", distance_km: 10 }] };
    window.personalHistoryEdition = old;
    window.personalHistoryCloud = [{ user_id: "history-user", event_id: "preserved-cloud-key-2020", edition_id: old.edition_id,
      priority: "A", planned_distance: "10 km", planner_details: { result: { finish_status: "Finished", finish_time: "00:45:00" } } }];
    window.personalHistoryFailWrite = false;
    supabaseClient.auth.getUser = async () => ({ data: { user: { id: "history-user" } }, error: null });
    supabaseClient.rpc = async (name, args) => name === "get_own_planner_archived_editions"
      ? { data: window.personalHistoryCloud.some(row => row.edition_id === old.edition_id) && args.p_edition_ids.includes(old.edition_id) ? [old] : [], error: null }
      : { data: [], error: { code: "PGRST202" } };
    supabaseClient.from = table => {
      const filters = []; const query = {
        select() { return query; }, eq(field, value) { filters.push([field, value]); return query; },
        in(field, value) { filters.push([field, value]); return query; }, limit() { return query; },
        upsert(payload) {
          if (window.personalHistoryFailWrite) return Promise.resolve({ error: { message: "Synthetic cloud failure" } });
          window.personalHistoryCloud = [{ ...window.personalHistoryCloud[0], ...JSON.parse(JSON.stringify(payload)) }];
          return Promise.resolve({ error: null });
        },
        then(resolve) {
          // Real archived editions are deliberately absent from the public view.
          const rows = table === "season_planner_events" ? window.personalHistoryCloud : [];
          return Promise.resolve({ data: rows.filter(row => filters.every(([field, value]) => Array.isArray(value) ? value.includes(row[field]) : row[field] === value)), error: null }).then(resolve);
        }
      }; return query;
    };
  });
  await page.evaluate(async () => { await loadRemotePlanningState({ id: "history-user" }); });
  await openPlanner(page);
  await page.evaluate(() => { window.syncSeasonPlanMetaToSupabase = window.actualPersonalPlannerSync; });
  await selectPlannerTab(page, "events");
}

async function resultForm(page) {
  if (!await page.getByTestId("planner-field-result-finish-status").isVisible()) await page.locator("[data-season-result-edit]").first().click();
  await expect(page.getByTestId("planner-field-result-finish-status")).toBeVisible();
}

test("owned historical edition stays visible outside Discovery, with its original cloud key and confirmed result", async ({ page }) => {
  await ownArchivedFixture(page);
  await expect(page.getByTestId("planner-event-list")).toContainText("SEM Personal History 2020");
  await expect(page.getByTestId("planner-event-edit-card")).toContainText("SEM Personal History 2020");
  await expect(page.getByTestId("planner-event-edit-card")).toContainText("Eigene archivierte Edition");
  expect(await page.evaluate(() => events.some(row => row.edition_id === window.personalHistoryEdition.edition_id))).toBe(false);
  await resultForm(page);
  await page.getByTestId("planner-field-result-overall-place").fill("124");
  await page.getByTestId("planner-field-result-overall-place").dispatchEvent("change");
  await expect(page.locator("[data-planner-sync-status]")).toContainText("In der Cloud gespeichert und erneut gelesen");
  const persisted = await page.evaluate(() => window.personalHistoryCloud[0]);
  expect(persisted.event_id).toBe("preserved-cloud-key-2020");
  expect(persisted.edition_id).toBe("11111111-1111-4111-8111-111111111111");
  expect(persisted.planner_details.result.overall_place).toBe("124");
  await page.evaluate(async () => { await loadRemotePlanningState({ id: "history-user" }); renderSeasonPlanner(); });
  await resultForm(page);
  await expect(page.getByTestId("planner-field-result-overall-place")).toHaveValue("124");
});

test("cloud failure preserves result after reload; unresolved edition remains editable on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ownArchivedFixture(page);
  // On mobile the editor is reached through the personal card.
  await page.getByTestId("planner-event-card").click();
  await page.evaluate(() => { window.personalHistoryFailWrite = true; });
  await resultForm(page);
  await page.getByTestId("planner-field-result-overall-place").fill("321");
  await page.getByTestId("planner-field-result-overall-place").dispatchEvent("change");
  await expect(page.locator("[data-planner-sync-status]")).toContainText("Cloudspeicherung fehlgeschlagen");
  await page.evaluate(async () => { window.personalHistoryCloud[0].planner_details = {}; await loadRemotePlanningState({ id: "history-user" }); renderSeasonPlanner(); });
  await resultForm(page);
  await expect(page.getByTestId("planner-field-result-overall-place")).toHaveValue("321");
  await page.reload();
  await openPlanner(page); await selectPlannerTab(page, "events");
  await page.getByTestId("planner-event-card").click();
  await expect(page.getByTestId("planner-event-edit-card")).toContainText("Planung bleibt erhalten");
  await expect(page.getByTestId("planner-event-edit-card")).not.toContainText("gelöscht");
  await resultForm(page);
  await expect(page.getByTestId("planner-field-result-overall-place")).toHaveValue("321");
  await expect(page.locator("[data-planner-retry]")).toBeVisible();
  const overflow = await page.locator("#seasonPlannerModal .season-planner-card").evaluate(element => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
