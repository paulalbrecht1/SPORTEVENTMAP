import {
  closeEventDrawer,
  expect,
  openEventDrawer,
  prepareApp,
  test
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

function observeAccountWrites(page) {
  const writes = [];
  page.on("request", request => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
      /\/(?:auth|rest)\/v1\//.test(new URL(request.url()).pathname)
    ) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  return writes;
}

async function expectNoSeasonSaved(page, writes) {
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem("seasonPlannerEvents") || "[]")
  )).toEqual([]);
  expect(writes).toEqual([]);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 }
]) {
  test(`${viewport.name}: the anonymous Planner gate offers registration directly`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = observeAccountWrites(page);
    await prepareApp(page, { route: "planner", openDiscoveryPanel: false });

    await expect(page.getByTestId("planner-auth-required")).toBeVisible();
    const register = page.locator("#plannerAuthRegisterBtn");
    await expect(register).toBeVisible();
    await expect(register).not.toHaveText("");
    await register.click();

    await expect(page.locator("#authModal")).toHaveClass(/open/);
    await expect(page.locator("#authTitle")).toHaveText("Create Account");
    await expect(page.locator("#authPassword")).toHaveAttribute("autocomplete", "new-password");
    await page.locator("#closeAuthModal").click();
    await expect(page.locator("#authModal")).not.toHaveClass(/open/);
    await expect(page.getByTestId("planner-auth-required")).toBeVisible();
    await expectNoSeasonSaved(page, writes);
  });

  test(`${viewport.name}: Login and registration remain reachable within the same modal`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = observeAccountWrites(page);
    await prepareApp(page, { route: "planner", openDiscoveryPanel: false });
    await page.locator("#plannerAuthLoginBtn").click();

    const modal = page.locator("#authModal");
    const title = page.locator("#authTitle");
    const email = page.locator("#authEmail");
    const password = page.locator("#authPassword");
    const modeSwitch = page.locator("#authModeSwitchBtn");
    await expect(modal).toHaveClass(/open/);
    await expect(title).toHaveText("Welcome Back");
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await email.fill("season-auth-ui@example.invalid");
    await modeSwitch.click();

    await expect(title).toHaveText("Create Account");
    await expect(email).toHaveValue("season-auth-ui@example.invalid");
    await expect(password).toHaveAttribute("autocomplete", "new-password");

    await page.evaluate(() => window.setAppLanguage("de"));
    await expect(title).toHaveText("Konto erstellen");
    await expect(modeSwitch).toContainText(/Anmelden|anmelden|Login/);
    await modeSwitch.click();
    await expect(title).toHaveText("Willkommen zurück");
    await expect(email).toHaveValue("season-auth-ui@example.invalid");
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await expect(modeSwitch).toContainText(/Konto|Registrieren|registrieren/);

    const card = modal.locator(".auth-card");
    const bounds = await card.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    await page.locator("#closeAuthModal").click();
    await expect(modal).not.toHaveClass(/open/);
    await expectNoSeasonSaved(page, writes);
  });

  test(`${viewport.name}: canceling sign-in after adding a race leaves the season empty`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const writes = observeAccountWrites(page);
    await prepareApp(page);
    await openEventDrawer(page, fixtureByName["SEM E2E Future Run"].event_name);
    const add = page.getByTestId("drawer-add-to-planner");
    await add.click();

    await expect(page.locator("#authModal")).toHaveClass(/open/);
    await expect(add).not.toHaveClass(/active/);
    await expect(page.locator(".app-toast strong").filter({
      hasText: /Added to Season Planner|Already in Season Planner/
    })).toHaveCount(0);
    await expectNoSeasonSaved(page, writes);
    await page.locator("#closeAuthModal").click();
    await expect(page.locator("#authModal")).not.toHaveClass(/open/);
    await expect(add).not.toHaveClass(/active/);
    expect(await page.evaluate(() => localStorage.getItem("pendingSeasonAdd"))).toBeNull();
    await closeEventDrawer(page);
    await expectNoSeasonSaved(page, writes);
  });
}

test("phone: successful sign-in opens the Planner from its anonymous gate immediately", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = observeAccountWrites(page);
  await prepareApp(page, { route: "planner", openDiscoveryPanel: false });
  await page.locator("#plannerAuthLoginBtn").click();
  await expect(page.locator("#authModal")).toHaveClass(/open/);

  // Keep the production auth handlers and Planner access check intact. Only
  // the SDK boundary receives an in-memory session; no real account is used.
  await page.evaluate(() => {
    const user = { id: "season-auth-ui-user", email: "season-auth-ui@example.invalid" };
    let session = null;
    window.seasonAuthTestLogins = [];
    supabaseClient.auth.getSession = async () => ({ data: { session }, error: null });
    supabaseClient.auth.getUser = async () => ({ data: { user: session?.user || null }, error: null });
    supabaseClient.auth.signInWithPassword = async credentials => {
      window.seasonAuthTestLogins.push({ email: credentials.email });
      session = { user };
      return { data: { user, session }, error: null };
    };
    supabaseClient.from = table => {
      const query = {
        select() { return this; },
        eq() { return this; },
        neq() { return this; },
        in() { return this; },
        gte() { return this; },
        lte() { return this; },
        limit() { return this; },
        order() { return this; },
        async upsert() { return { data: null, error: null }; },
        async insert() { return { data: null, error: null }; },
        then(resolve) {
          resolve({ data: table === "profiles" ? [{ role: "user" }] : [], error: null });
        }
      };
      return query;
    };
  });
  expect(await page.evaluate(() => window.canOpenSeasonPlanner())).toBe(false);

  await page.locator("#authEmail").fill("season-auth-ui@example.invalid");
  await page.locator("#authPassword").fill("Example-ui-password-2099");
  await page.locator("#authSubmitBtn").click();

  await expect(page.locator("#authModal")).not.toHaveClass(/open/);
  await expect(page.getByTestId("planner-auth-required")).not.toBeVisible();
  await expect(page.getByTestId("season-planner")).toHaveClass(/open/);
  await expect(page.getByTestId("planner-overview-panel")).toBeVisible();
  expect(await page.evaluate(() => window.canOpenSeasonPlanner())).toBe(true);
  expect(await page.evaluate(() => window.seasonAuthTestLogins)).toEqual([
    { email: "season-auth-ui@example.invalid" }
  ]);
  await expectNoSeasonSaved(page, writes);
});
