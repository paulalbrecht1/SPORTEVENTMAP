import fs from "node:fs";
import { expect, prepareApp, test } from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

const event = {
  ...fixtureByName["SEM E2E Future Run"],
  edition_slug: "sem-e2e-future-run-2030",
  edition_id: "11111111-1111-4111-8111-111111111111",
  event_id: 1,
  edition_year: 2030
};

for (const mode of ["login", "register"]) {
  test(`anonymous standalone detail leads to ${mode} without claiming a season save`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const writes = [];
    page.on("request", request => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
          /\/(?:auth|rest)\/v1\//.test(new URL(request.url()).pathname)) writes.push(request.url());
    });
    await prepareApp(page, { openDiscoveryPanel: false });
    await page.route("**/js/config.js*", route => route.fulfill({
      contentType: "text/javascript", body: "window.SPORT_EVENT_MAP_CONFIG = {};"
    }));
    await page.route("**/data/event-editions-public.json", route => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ exported_at: "2026-10-01T12:00:00Z", editions: [event] })
    }));
    await page.route("**/data/event-detail-database.json*", route => route.fulfill({ contentType: "application/json", body: "[]" }));
    await page.route(`**/event/${event.edition_slug}/`, route => route.fulfill({
      contentType: "text/html", body: fs.readFileSync(new URL("../../event-detail.html", import.meta.url), "utf8")
    }));
    await page.goto(`/event/${event.edition_slug}/`);
    await expect(page.locator("#liveDetailName")).toHaveText(event.event_name);
    const add = page.locator("#addDetailEventToSeason");
    await expect(add).toBeEnabled();
    await add.click();
    await expect(add).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#detailActionStatus")).toContainText(/Sign in or create an account|Melde dich an/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("seasonPlannerEvents") || "[]"))).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("lastSeasonPlannerAdd"))).toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pendingSeasonAdd")).event_slug)).toBe(event.edition_slug);
    const action = page.locator(`#detailActionStatus a[href*="auth=${mode}"]`);
    await expect(action).toBeVisible();
    await action.click();
    await expect(page).toHaveURL(new RegExp(`auth=${mode}#/planner$`));
    await expect(page.locator("#authModal")).toHaveClass(/open/);
    await expect(page.locator("#authTitle")).toHaveText(mode === "login" ? "Welcome Back" : "Create Account");
    await page.locator("#closeAuthModal").click();
    await expect(page.getByTestId("planner-auth-required")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("pendingSeasonAdd"))).toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("seasonPlannerEvents") || "[]"))).toEqual([]);
    expect(writes).toEqual([]);
  });
}

test("standalone season intent survives sign-in and adds exactly the selected edition to the Planner", async ({ page }) => {
  const event = {
    ...fixtureByName["SEM E2E Future Run"],
    edition_slug: "sem-e2e-published-running-edition-2030",
    edition_id: "11111111-1111-4111-8111-111111111111",
    event_id: 1,
    edition_year: 2030
  };
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = [];
  page.on("request", request => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
        /\/(?:auth|rest)\/v1\//.test(new URL(request.url()).pathname)) writes.push(request.url());
  });
  await prepareApp(page, { openDiscoveryPanel: false });
  await page.route("**/js/config.js*", route => route.fulfill({
    contentType: "text/javascript", body: "window.SPORT_EVENT_MAP_CONFIG = {};"
  }));
  await page.route("**/data/event-editions-public.json", route => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ exported_at: "2026-10-01T12:00:00Z", editions: [event] })
  }));
  await page.route("**/data/event-detail-database.json*", route => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route(`**/event/${event.edition_slug}/`, route => route.fulfill({
    contentType: "text/html", body: fs.readFileSync(new URL("../../event-detail.html", import.meta.url), "utf8")
  }));
  await page.goto(`/event/${event.edition_slug}/`);
  await expect(page.locator("#liveDetailName")).toHaveText(event.event_name);
  await page.locator("#addDetailEventToSeason").click();
  await expect(page.locator("#addDetailEventToSeason")).toHaveAttribute("aria-pressed", "false");
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem("pendingSeasonAdd")));
  expect(pending.event_slug).toBe(event.edition_slug);
  expect(pending.event_key).not.toBe(event.event_key);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("seasonPlannerEvents") || "[]"))).toEqual([]);
  expect(writes).toEqual([]);
  await page.locator('#detailActionStatus a[href*="auth=login"]').click();
  await expect(page.locator("#authModal")).toHaveClass(/open/);
  await page.waitForFunction(() => Array.isArray(events) && events.length > 0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pendingSeasonAdd")))).toEqual(pending);

  // Only the SDK session, catalog responses and persisted rows are simulated.
  // The real login, catalog normalization and pending-intent handlers run.
  await page.evaluate(catalogEvent => {
    const user = { id: "season-detail-login-user", email: "detail-login@example.invalid" };
    let session = null;
    const cloudRows = [];
    window.standaloneLoginCloudRows = cloudRows;
    window.standaloneLoginSdkWrites = [];
    supabaseClient.auth.getSession = async () => ({ data: { session }, error: null });
    supabaseClient.auth.getUser = async () => ({ data: { user: session?.user || null }, error: null });
    supabaseClient.auth.signInWithPassword = async () => {
      session = { user };
      return { data: { user, session }, error: null };
    };
    supabaseClient.from = table => {
      const filters = new Map();
      let afterCursor = false;
      const query = {
        select() { return this; },
        eq(key, value) { filters.set(key, value); return this; },
        neq() { return this; },
        in() { return this; },
        gt() { afterCursor = true; return this; },
        gte() { return this; },
        lte() { return this; },
        limit() { return this; },
        order() { return this; },
        async upsert(row) {
          window.standaloneLoginSdkWrites.push({ table, user_id: session?.user?.id || null, row });
          if (!session) return { data: null, error: { message: "Unauthenticated test write rejected" } };
          if (table === "season_planner_events") {
            const index = cloudRows.findIndex(item => item.user_id === row.user_id && item.event_id === row.event_id);
            if (index < 0) cloudRows.push({ ...row });
            else cloudRows[index] = { ...cloudRows[index], ...row };
          }
          return { data: null, error: null };
        },
        async insert() { return { data: null, error: null }; },
        then(resolve) {
          const rows = table === "profiles" ? [{ role: "user" }]
            : table === "public_event_discovery" ? (afterCursor ? [] : [catalogEvent])
            : table === "public_event_archive" ? [catalogEvent]
            : table === "season_planner_events" ? cloudRows.filter(row =>
              [...filters].every(([key, value]) => row[key] === value)
            ) : [];
          resolve({ data: rows, count: rows.length, error: null });
        }
      };
      return query;
    };
    supabaseClient.rpc = async () => ({ data: [], error: null });
  }, event);
  expect(await page.evaluate(() => window.canOpenSeasonPlanner())).toBe(false);
  await page.evaluate(() => window.refreshEvents({ preserveView: true }));
  expect(await page.evaluate(() => window.standaloneLoginSdkWrites)).toEqual([]);
  const selected = await page.evaluate(editionId => {
    const current = events.find(row => row.edition_id === editionId);
    return { key: getEventKey(current), edition_id: current.edition_id, slug: current.edition_slug };
  }, event.edition_id);
  expect(selected).toEqual({ key: event.event_key, edition_id: event.edition_id, slug: event.edition_slug });
  expect(await page.evaluate(editionId => getEventDetailSlug(events.find(row =>
    row.edition_id === editionId
  )), event.edition_id)).not.toBe(event.edition_slug);

  await page.locator("#authEmail").fill("detail-login@example.invalid");
  await page.locator("#authPassword").fill("Example-ui-password-2099");
  await page.locator("#authSubmitBtn").click();
  await expect(page.locator("#authModal")).not.toHaveClass(/open/);
  await expect(page.getByTestId("season-planner")).toHaveClass(/open/);
  await page.getByTestId("planner-tab-events").click();
  await expect(page.getByTestId("planner-event-card")).toHaveCount(1);
  await expect(page.getByTestId("planner-event-card")).toContainText(event.event_name);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("seasonPlannerEvents")))).toEqual([event.event_key]);
  expect(await page.evaluate(() => localStorage.getItem("pendingSeasonAdd"))).toBeNull();
  await expect.poll(() => page.evaluate(() => window.standaloneLoginCloudRows)).toEqual([{
    user_id: "season-detail-login-user", event_id: event.event_key, edition_id: event.edition_id
  }]);
  expect(await page.evaluate(() => window.standaloneLoginSdkWrites.every(write => write.user_id === "season-detail-login-user"))).toBe(true);
  expect(writes).toEqual([]);
});
