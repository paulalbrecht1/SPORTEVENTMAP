import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fixtureEventsCsv, fixtureEvents } from "./e2e/helpers/fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const eventName = "SEM Route Fallback Run";
const eventSlug = "sem-route-fallback-run-2030";
const eventPath = `/event/${eventSlug}/`;
const staticPath = "/event/07-stadtholz-marathon-2026/";

function inlineScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => !/\bsrc\s*=|application\/ld\+json/i.test(attrs))
    .map(([, , source]) => source);
}

function runFallback(pathname, { search = "", hash = "" } = {}) {
  const redirects = [];
  const location = {
    pathname, search, hash, origin: "https://sporteventmap.test",
    href: `https://sporteventmap.test${pathname}${search}${hash}`,
    replace: target => redirects.push(target)
  };
  const context = vm.createContext({
    location, window: { location }, URL,
    document: { getElementById: () => null, querySelector: () => null }
  });
  const scripts = inlineScripts(read("404.html"));
  assert.ok(scripts.length, "the actual public 404 must contain its route handler");
  for (const source of scripts) vm.runInContext(source, context, { timeout: 1000 });
  return redirects;
}

test('detail links use the published edition slug, with safe legacy fallback', () => {
  const source = read('js/events.js').split('function getEventDetailUrl(event) {')[1].split('function getPendingSeasonAdd')[0];
  const context = vm.createContext({ getEventDetailSlug: () => 'legacy-name-2030' });
  vm.runInContext('function getEventDetailUrl(event) {' + source, context);
  assert.equal(context.getEventDetailUrl({ edition_slug: 'canonical-edition-2030' }), 'event/canonical-edition-2030/');
  for (const edition_slug of ['', undefined, '../admin', 'https://example.test', 'bad?query']) {
    assert.equal(context.getEventDetailUrl({ edition_slug }), 'event/legacy-name-2030/');
  }
});

test("404 is a standalone public document, with no app/admin markup or external runtime", () => {
  const html = read("404.html");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<h1\b/i);
  assert.match(html, /name=["']robots["'][^>]*content=["'][^"']*noindex/i);
  assert.doesNotMatch(html, /id=["'](?:adminModal|adminBtn|map|eventDrawer)["']/i);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel=["']stylesheet/i);
  assert.doesNotMatch(html, /supabase|Loading feedback|Adminbereich/i);
});

for (const pathname of [eventPath, eventPath.slice(0, -1), `${eventPath}index.html`]) {
  test(`missing event route ${pathname} redirects once to a standalone detail page`, () => {
    assert.deepEqual(runFallback(pathname), [`/event-detail.html?event=${eventSlug}`]);
  });
}

test("event redirect cannot inherit query/hash navigation or an external return target", () => {
  assert.deepEqual(runFallback(eventPath, {
    search: "?next=https://evil.example/admin&redirect=//evil.example",
    hash: "#/admin"
  }), [`/event-detail.html?event=${eventSlug}`]);
});

for (const pathname of ["/admin", "/admin.html", "/admin/"]) {
  test(`legacy ${pathname} enters the existing auth-protected admin route`, () => {
    assert.deepEqual(runFallback(pathname), ["/index.html#/admin"]);
  });
}

for (const pathname of [
  "/unknown-page", "/404.html", "/js/missing.js", "/css/missing.css",
  "/event/", "/event/race-2030/js/app.js", "/event/race-2030/extra/",
  "/event/race-2030/index.html/extra", "/event//race-2030/",
  "/event/%/", "/event/%E0%A4%A/", "/event/%2F%2Fevil.example/",
  "/event%2Frace-2030/", "/event/race-2030%2Findex.html", "/event/race-2030%2F",
  "/event/%5Cevil.example/", "/event/%3Cscript%3E/", "/event/race.js/",
  "/event/../", "/admin/settings", "/admin.js"
]) {
  test(`unmatched/unsafe path stays a public 404: ${pathname}`, () => {
    assert.deepEqual(runFallback(pathname), []);
  });
}

test("the actual admin button still requires an admin role before opening or loading data", async () => {
  const handler = read("js/supabase.js").match(/adminBtn\.onclick = async \(\) => \{[\s\S]*?\n\};/);
  assert.ok(handler, "existing admin handler must remain auditable");
  for (const authorized of [false, true]) {
    const opened = [];
    const messages = [];
    const loaded = [];
    const context = vm.createContext({
      adminBtn: {},
      adminModal: { classList: { add: value => opened.push(value) } },
      isCurrentUserAdmin: async () => authorized,
      showAppMessage: (...args) => messages.push(args),
      trackEvent() {}, setAdminTab() {},
      refreshAdminWorkspace: async options => loaded.push(options)
    });
    vm.runInContext(handler[0], context, { timeout: 1000 });
    await context.adminBtn.onclick();
    assert.deepEqual(opened, authorized ? ["open"] : []);
    assert.equal(loaded.length, authorized ? 1 : 0);
    assert.equal(messages.length, authorized ? 0 : 1);
  }
});

function routeHarness() {
  const timers = [], opened = [], messages = [], sdkCalls = [], uiChanges = [];
  let found = null, finishSdk;
  const sdk = new Promise(resolve => { finishSdk = resolve; });
  const context = vm.createContext({
    PLATFORM_ROUTES: new Set(["home", "discovery", "events", "admin"]),
    window: {
      location: { hash: `#/event/${eventSlug}` },
      setTimeout: (callback, delay) => timers.push({ callback, delay }),
      ensureSupabaseFeaturesLoaded: reason => { sdkCalls.push(reason); return sdk; }
    },
    document: { documentElement: { dataset: {} }, body: { classList: { remove() {} } } },
    setPlatformRouteClasses: route => uiChanges.push(route),
    showPlatformPage() {},
    findEventByPlatformSlug: () => found,
    openDrawer: event => opened.push(event),
    focusEvent() {},
    showAppMessage: (...args) => messages.push(args),
    suppressEventRouteUpdate: false
  });
  const source = read("js/app.js");
  for (const name of ["getPlatformHashRoute", "openEventRoute"]) {
    const fn = source.match(new RegExp(`function ${name}\\([^]*?\\r?\\n\\}`));
    assert.ok(fn, `${name} must be exercised from actual app source`);
    vm.runInContext(fn[0], context, { timeout: 1000 });
  }
  return {
    context, timers, opened, messages, sdkCalls, uiChanges,
    start: () => context.openEventRoute(eventSlug),
    found: event => { found = event; },
    settleSdk: async () => { finishSdk(); await Promise.resolve(); await Promise.resolve(); },
    next: () => {
      const timer = timers.shift();
      assert.ok(timer, "bounded catalog retry must remain available");
      assert.ok(timer.delay > 0 && timer.delay <= 1000);
      timer.callback();
      return timer.delay;
    }
  };
}

test("malformed event hashes recover to discovery instead of breaking app initialization", () => {
  const { context } = routeHarness();
  for (const hash of ["#/event/%", "#/event/%E0%A4%A", "#/event/%FF"]) {
    assert.equal(context.getPlatformHashRoute(hash).route, "discovery");
  }
  assert.equal(context.getPlatformHashRoute(`#/event/${eventSlug}?from=link`).slug, eventSlug);
  assert.equal(context.getPlatformHashRoute("#/admin").route, "admin");
});

test("new event requests the SDK immediately and opens a catalog entry arriving after the old retry window", async () => {
  const harness = routeHarness();
  harness.start();
  assert.deepEqual(harness.sdkCalls, ["event_route"]);
  await harness.settleSdk();
  for (let index = 0; index < 15; index++) harness.next();
  const event = { event_name: eventName };
  harness.found(event);
  harness.next();
  assert.deepEqual(harness.opened, [event]);
  assert.equal(harness.messages.length, 0);
  assert.equal(harness.timers.length, 0);
  assert.equal(harness.sdkCalls.length, 1);
});

test("a stalled SDK cannot prevent an available read-only CSV fallback from opening", async () => {
  const harness = routeHarness();
  harness.start();
  const event = { event_name: eventName };
  harness.found(event);
  harness.next();
  assert.deepEqual(harness.opened, [event]);
  await harness.settleSdk();
  assert.equal(harness.opened.length, 1, "late SDK must not start a second route retry chain");
});

test("leaving the event route cancels both pending SDK work and scheduled event retries", async () => {
  for (const destination of ["#/home", "#/event/a-different-race-2030"]) {
    const harness = routeHarness();
    harness.start();
    harness.context.window.location.hash = destination;
    harness.found({ event_name: eventName });
    harness.uiChanges.length = 0;
    await harness.settleSdk();
    while (harness.timers.length) harness.next();
    assert.deepEqual(harness.opened, []);
    assert.deepEqual(harness.messages, []);
    assert.deepEqual(harness.uiChanges, []);
  }
});

test("unknown event retries are bounded and end with one honest not-found message", async () => {
  const harness = routeHarness();
  harness.start();
  await harness.settleSdk();
  let calls = 0, totalDelay = 0;
  while (harness.timers.length && calls < 100) {
    totalDelay += harness.next();
    calls++;
  }
  assert.ok(calls > 12 && calls <= 100, "allow a slower catalog without unbounded retries");
  assert.ok(totalDelay <= 20_000, "catalog wait must stay bounded");
  assert.equal(harness.timers.length, 0);
  assert.equal(harness.messages.length, 1);
  assert.match(harness.messages[0][0], /not found/i);
  assert.deepEqual(harness.opened, []);
});

// Read-only, loopback-only Pages emulation: exact existing files win; only
// genuinely missing public paths receive the real top-level 404 document.
// No private config, real catalog rows, auth tokens or outbound writes are used.
async function startPagesServer() {
  const requests = [];
  const fixtureCsv = fixtureEventsCsv([{
    ...fixtureEvents[0], event_name: eventName, date: "20.09.2030"
  }]);
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json", ".json": "application/json" };
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    requests.push({ method: request.method, pathname });
    const send = (status, type, body) => {
      response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      response.end(body);
    };
    if (request.method !== "GET") return send(405, "text/plain", "Read-only fixture");
    if (pathname === "/js/config.js") return send(200, "text/javascript", "// No real credentials in this test.");
    if (pathname === "/data/events.csv") return send(200, "text/csv", fixtureCsv);
    if (pathname === "/data/event-editions-public.json") return send(200, "application/json", JSON.stringify({ exported_at: "2026-08-27T07:41:01Z", editions: [{ ...fixtureEvents[0], edition_slug: eventSlug, event_name: eventName, date: "20.09.2030", description: "Public race description." }] }));
    let relative;
    try { relative = decodeURIComponent(pathname).replace(/^\/+/, ""); }
    catch { return send(404, "text/html", read("404.html")); }
    if (relative.includes("\\") || relative.split("/").some(part => [".", ".."].includes(part))) {
      return send(404, "text/html", read("404.html"));
    }
    if (relative === "js/config.js") return send(200, "text/javascript", "// No real credentials in this test.");
    if (!relative) relative = "index.html";
    const permitted = /^(?:(?:css|js|assets|event)\/|(?:index|404|event-detail)\.html$|(?:favicon[^/]*|apple-touch-icon\.png|site\.webmanifest)$)/.test(relative);
    let file = path.resolve(root, relative);
    if (permitted && file.startsWith(`${root}${path.sep}`) && fs.existsSync(file)) {
      if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        return send(200, types[path.extname(file)] || "application/octet-stream", fs.readFileSync(file));
      }
    }
    send(404, "text/html", read("404.html"));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`, requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

test("Pages semantics preserve existing detail bytes and missing assets remain HTTP 404", async () => {
  const server = await startPagesServer();
  try {
    const existing = await fetch(server.url + staticPath);
    assert.equal(existing.status, 200);
    assert.equal(await existing.text(), read(`${staticPath.slice(1)}index.html`));
    for (const route of [eventPath, "/js/nonexistent.js", "/event/unknown/css/style.css", "/unknown-page"]) {
      const response = await fetch(server.url + route);
      assert.equal(response.status, 404, route);
      assert.equal(await response.text(), read("404.html"), route);
    }
  } finally { await server.close(); }
});

test("actual browser resolves missing routes, preserves static pages and hides closed admin without CSS/JS", { timeout: 90_000 }, async t => {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root, ".playwright-browsers");
  const { chromium, expect } = await import("@playwright/test");
  const server = await startPagesServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    async function newPage({ blockRuntime = false } = {}) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
      const page = await context.newPage();
      await context.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        // All external traffic, including analytics/auth, is contained locally.
        if (url.origin !== server.url) {
          return route.fulfill({ status: 200,
            contentType: request.resourceType() === "script" ? "text/javascript" : "text/css", body: "" });
        }
        assert.equal(request.method(), "GET", "browser may not mutate even the local fixture");
        if (blockRuntime && ["stylesheet", "script"].includes(request.resourceType())) return route.abort();
        return route.continue();
      });
      await page.addInitScript(() => {
        localStorage.setItem("sportEventMap.landingSeen", "true");
        localStorage.setItem("sportEventMap.betaWelcomeSeen", "true");
        localStorage.setItem("sportEventMap.betaBannerDismissed", "true");
      });
      return { context, page };
    }

    await t.test("clicking detail opens a standalone page, supports reload/back, and never returns to the drawer", async () => {
      const { page, context } = await newPage();
      const failures = [];
      page.on("pageerror", error => failures.push(error.message));
      try {
        await page.goto(`${server.url}/index.html#/event/${eventSlug}`);
        await expect(page.getByTestId("event-drawer")).toHaveClass(/open/, { timeout: 15_000 });
        await page.locator('.drawer-detail-button').click();
        await expect(page).toHaveURL(`${server.url}/event-detail.html?event=${eventSlug}`);
        await expect(page.locator('body')).toHaveClass(/\bevent-detail-page\b/);
        await expect(page.locator('h1')).toHaveText(eventName);
        await expect(page.locator('h1')).toBeVisible();
        assert.equal(await page.locator('h1').evaluate(el => getComputedStyle(el).fontSize), '28px');
        await expect(page.locator('#liveDetailDescription')).toHaveText('Public race description.');
        await expect(page.locator('#liveDetailStatus')).toContainText('gespeicherte Datenstand');
        await expect(page.locator('#adminModal, #drawer')).toHaveCount(0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
        await page.reload();
        await expect(page.locator('h1')).toHaveText(eventName);
        await page.goBack();
        await expect(page.getByTestId('event-drawer')).toHaveClass(/open/);
        await page.goForward();
        await expect(page.locator('h1')).toHaveText(eventName);
        assert.equal(await page.locator('link[href*="css/style.css"]').evaluate(link => link.sheet !== null), true);
        assert.ok(server.requests.some(request => request.pathname === "/js/app.js"));
        assert.equal(server.requests.some(request => /^\/event\/[^/]+\/(?:css|js)\//.test(request.pathname)), false);
        assert.deepEqual(failures, []);
      } finally { await context.close(); }
    });

    await t.test('live detail uses anonymous public data, escapes content, validates links and preserves Season identity', async () => {
      const { page, context } = await newPage();
      const publicRow = { ...fixtureEvents[0], event_name: '<img src=x onerror=alert(1)> Public Run', edition_slug: eventSlug, date: '20.09.2030', city: 'Hamburg', description: '<script>unsafe()</script>', event_url: 'javascript:alert(1)', source_url: 'https://organizer.example/race', race_formats: [{ label: '5 km' }, { label: '10 km' }], last_checked: null };
      let requests = 0;
      await context.route('**/js/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SPORT_EVENT_MAP_CONFIG={supabaseUrl:"https://public-detail.test",supabasePublishableKey:"public-fixture"};' }));
      await context.route('https://public-detail.test/rest/v1/public_event_archive?**', route => {
        const request = route.request(), url = new URL(request.url());
        assert.equal(request.method(), 'GET');
        assert.equal(request.headers().authorization, undefined);
        assert.equal(url.searchParams.get('edition_slug'), 'eq.' + eventSlug);
        assert.equal(url.searchParams.get('limit'), '2');
        assert.ok(!url.searchParams.get('select').includes('*'));
        requests++;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify([publicRow]) });
      });
      try {
        await page.goto(server.url + eventPath);
        await expect(page.locator('h1')).toHaveText(publicRow.event_name);
        await expect(page.locator('#liveDetailDescription')).toHaveText(publicRow.description);
        await expect(page.locator('#liveDetailDescription script, #liveDetailName img, #adminModal')).toHaveCount(0);
        await expect(page.locator('#liveDetailOfficial')).toBeHidden();
        await expect(page.locator('#liveDetailSource')).toHaveAttribute('href', publicRow.source_url);
        await expect(page.locator('#liveDetailFacts')).toContainText('5 km · 10 km');
        await expect(page.locator('#liveDetailChecked')).toBeHidden();
        await expect(page.locator('#liveDetailStatus')).toBeHidden();
        await page.locator('#eventDetailLanguageSelect').selectOption('en');
        await expect(page.locator('#liveDetailFacts')).toContainText('Date');
        await expect(page.locator('#addDetailEventToSeason')).toBeEnabled();
        await page.locator('#addDetailEventToSeason').click();
        await expect(page.locator('#addDetailEventToSeason')).toHaveAttribute('aria-pressed', 'true');
        await page.reload();
        await expect(page.locator('#addDetailEventToSeason')).toHaveAttribute('aria-pressed', 'true');
        assert.equal(requests, 2);
      } finally { await context.close(); }
    });

    await t.test('absent, malformed and unavailable public editions show explicit errors without a drawer or invented data', async () => {
      for (const kind of ['missing', 'malformed', 'outage', 'invalid']) {
        const { page, context } = await newPage();
        await context.route('**/js/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SPORT_EVENT_MAP_CONFIG={supabaseUrl:"https://public-detail.test",supabasePublishableKey:"public-fixture"};' }));
        await context.route('https://public-detail.test/rest/v1/public_event_archive?**', route => kind === 'outage' ? route.abort() : route.fulfill({ contentType: 'application/json', body: kind === 'malformed' ? '[null]' : '[]' }));
        await context.route('**/data/event-editions-public.json', route => route.abort());
        try {
          await page.goto(`${server.url}/event-detail.html?event=${kind === 'invalid' ? '%2Fbad' : eventSlug}`);
          await expect(page.locator('#liveDetailStatus')).toContainText(kind === 'outage' ? 'nicht geladen' : kind === 'invalid' ? 'ungültig' : 'nicht öffentlich');
          await expect(page.locator('#liveDetailContent')).toBeHidden();
          await expect(page.locator('#adminModal, #drawer')).toHaveCount(0);
          if (kind === 'outage') await expect(page.locator('#liveDetailRetry')).toBeVisible();
        } finally { await context.close(); }
      }
    });

    await t.test("existing static event never enters the fallback or full app", async () => {
      const { page, context } = await newPage();
      try {
        const response = await page.goto(server.url + staticPath);
        assert.equal(response.status(), 200);
        assert.equal(await response.text(), read(`${staticPath.slice(1)}index.html`));
        await expect(page).toHaveURL(server.url + staticPath);
        await expect(page.locator("h1")).toContainText("Stadtholz Marathon");
        await expect(page.locator("#adminModal")).toHaveCount(0);
      } finally { await context.close(); }
    });

    await t.test("unknown asset/path stays on a public error page with no app or admin", async () => {
      const { page, context } = await newPage();
      try {
        for (const route of ["/js/missing.js", "/event/unknown/css/style.css", "/not-a-route"]) {
          const response = await page.goto(server.url + route);
          assert.equal(response.status(), 404);
          await expect(page).toHaveURL(server.url + route);
          await expect(page.locator("h1")).toBeVisible();
          await expect(page.locator("#adminModal, #map")).toHaveCount(0);
        }
      } finally { await context.close(); }
    });

    await t.test("a cached legacy SPA fallback still resolves root assets and hides the admin shell", async () => {
      const { page, context } = await newPage({ blockRuntime: true });
      try {
        const legacyPath = "/event/legacy-spa-fixture-2030/";
        await context.route(server.url + legacyPath, route => route.fulfill({
          status: 200, contentType: "text/html", body: read("index.html")
        }));
        await page.goto(server.url + legacyPath);
        assert.equal(await page.evaluate(() => document.baseURI), `${server.url}/`);
        const urls = await page.locator('script[src], link[rel="stylesheet"]').evaluateAll(elements =>
          elements.map(element => element.src || element.href));
        assert.equal(urls.some(url => url.includes("/event/legacy-spa-fixture-2030/")), false);
        await expect(page.locator("#adminModal")).toBeAttached();
        await expect(page.locator("#adminModal")).toBeHidden();
      } finally { await context.close(); }
    });

    await t.test("legacy admin URL and total runtime failure cannot expose closed admin markup", async () => {
      const { page, context } = await newPage({ blockRuntime: true });
      try {
        await page.goto(`${server.url}/admin.html`);
        await expect(page).toHaveURL(`${server.url}/index.html#/admin`);
        await expect(page.locator("#adminModal")).toBeAttached();
        await expect(page.locator("#adminModal")).toBeHidden();
        await expect(page.locator("#adminBtn")).toBeHidden();
        assert.equal(await page.evaluate(() => document.baseURI), `${server.url}/`);
        // The critical rule guards the closed state; the existing authorized
        // handler can still reveal the modal by applying its normal open class.
        await page.locator("#adminModal").evaluate(element => element.classList.add("open"));
        await expect(page.locator("#adminModal")).toBeVisible();
        await page.locator("#adminModal").evaluate(element => element.classList.remove("open"));
        await expect(page.locator("#adminModal")).toBeHidden();
      } finally { await context.close(); }
    });
  } finally {
    await browser?.close();
    await server.close();
  }
});
