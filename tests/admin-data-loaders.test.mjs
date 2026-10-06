import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../js/supabase.js", import.meta.url), "utf8");
function between(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "Production function boundaries must exist");
  return source.slice(from, to);
}
const production = [
  between("const ADMIN_ANALYTICS_PAGE_SIZE =", "async function loadAnalyticsRows("),
  between("async function loadSourceMonitorRecent(", "function sourceMonitorLatestBy("),
  between("async function loadBoundedAdminTasks(", "async function runDataOperationsValidation(")
].join("\n");

function rows(count, extra = {}) {
  return Array.from({ length: count }, (_, i) => ({ id: String(i).padStart(8, "0"), created_at: "2026-10-06T12:00:00Z", ...extra }));
}
function client(tables, { serverCap = 1000, failAt, malformedAt, pause } = {}) {
  const requests = [];
  let active = 0, peak = 0;
  return {
    requests, get peak() { return peak; },
    from(table) {
      const state = { table, orders: [], filters: [], options: {}, from: 0, to: Infinity };
      const query = {
        select(fields, options = {}) { state.fields = fields; state.options = options; return query; },
        order(field, options = {}) { state.orders.push({ field, ascending: options.ascending !== false }); return query; },
        range(from, to) { state.from = from; state.to = to; return query; },
        limit(limit) { state.to = limit - 1; return query; },
        eq(field, value) { state.filters.push(row => row[field] === value); return query; },
        in(field, values) { state.filters.push(row => values.includes(row[field])); return query; },
        gte(field, value) { state.filters.push(row => row[field] >= value); return query; },
        async then(resolve, reject) {
          const request = { ...state, orders: [...state.orders] };
          requests.push(request); active++; peak = Math.max(peak, active);
          try {
            if (pause) await pause(request);
            if (failAt?.(request)) return resolve({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" }, count: null });
            if (malformedAt?.(request)) return resolve({ data: null, error: null, count: null });
            const filtered = (tables[table] || []).filter(row => state.filters.every(filter => filter(row)));
            filtered.sort((a, b) => {
              for (const { field, ascending } of state.orders) {
                const compared = String(a[field]).localeCompare(String(b[field]));
                if (compared) return ascending ? compared : -compared;
              }
              return 0;
            });
            const data = filtered.slice(state.from, Math.min(state.to + 1, state.from + serverCap));
            return resolve({ data, error: null, count: state.options.count === "exact" ? filtered.length : null });
          } catch (error) { return reject(error); }
          finally { active--; }
        }
      };
      return query;
    }
  };
}
function runtime(fakeClient, { rowLimit = 100000, language = "en" } = {}) {
  const statuses = [], diagnostics = [];
  let renders = 0;
  const context = vm.createContext({
    supabaseClient: fakeClient,
    console: { error: message => diagnostics.push(message) },
    dataOpsElements: { panel: {}, country: {}, sport: {}, proposalType: {}, proposalField: {}, proposalSource: {}, proposalDomain: {} },
    dataOpsEvents: [{ id: "previous-event" }], dataOpsEditions: [], dataOpsSuccessionCandidates: [], dataOpsIssues: [],
    dataOpsSources: [], dataOpsProposals: [], dataOpsAlerts: [], dataOpsRuns: [], sourceMonitorJobs: [],
    sourceMonitorActiveJobs: [], sourceMonitorResults: [], sourceMonitorReviews: [], dataOpsFreshnessBlockingFeedback: [],
    editionLifecycleInbox: [{ item_type: "freshness_review", item_id: "stale" }],
    dataOpsMeasuredAt: "previous-measurement", catalogQualityReport: {},
    setDataOpsStatus: (...args) => statuses.push(args),
    dataOpsText: (_key, fallback) => fallback,
    adminUiFormatted: (en, de) => language === "de" ? de : en,
    renderCatalogQualityReport() {}, renderDataFreshnessOverview() {}, renderEditionLifecycleInbox() {},
    loadCatalogQualityReport: async () => {}, loadStageFourOperations: async () => {},
    populateDataOpsSelect() {}, renderDataOperations: () => renders++,
    getSuccessionInboxRows: () => []
  });
  vm.runInContext(production.replace("const ADMIN_ANALYTICS_ROW_LIMIT = 100000;", "const ADMIN_ANALYTICS_ROW_LIMIT = " + rowLimit + ";"), context);
  return { context, statuses, diagnostics, get renders() { return renders; } };
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test("complete count-free paging reads >1000 rows including tied timestamps", async () => {
  const input = rows(2301).reverse();
  const fake = client({ events: input });
  const { context } = runtime(fake);
  const result = await context.loadDataOpsTablePages("events", "id,created_at");
  assert.equal(result.error, null); assert.equal(result.truncated, false);
  assert.deepEqual(plain(result.rows), rows(2301));
  assert.equal(new Set(result.rows.map(row => row.id)).size, 2301);
  assert.deepEqual(fake.requests.map(r => r.from), [0, 1000, 2000, 2301]);
  assert.ok(fake.requests.every(r => r.options.count === undefined));
  assert.ok(fake.requests.every(r => JSON.stringify(r.orders) === JSON.stringify([{ field: "created_at", ascending: false }, { field: "id", ascending: true }])));
});

test("exact 1000-row boundary requires a real empty next page", async () => {
  const fake = client({ events: rows(1000) });
  const result = await runtime(fake).context.loadDataOpsTablePages("events", "id,created_at");
  assert.equal(result.rows.length, 1000); assert.equal(result.truncated, false);
  assert.deepEqual(fake.requests.map(r => [r.from, r.to]), [[0, 999], [1000, 1999]]);
});

test("a smaller backend page cap does not silently truncate the complete read", async () => {
  const fake = client({ events: rows(1101) }, { serverCap: 250 });
  const result = await runtime(fake).context.loadDataOpsTablePages("events", "id,created_at");
  assert.equal(result.rows.length, 1101); assert.equal(result.truncated, false);
  assert.deepEqual(fake.requests.map(r => r.from), [0, 250, 500, 750, 1000, 1101]);
});

test("inbox composite identity tie breaks preserve every distinct row across pages", async () => {
  const input = rows(1001).flatMap(row => ["proposal", "freshness_review"].map(item_type => ({ ...row, item_type, item_id: row.id }))).reverse();
  const fake = client({ admin_review_inbox: input });
  const result = await runtime(fake).context.loadDataOpsTablePages("admin_review_inbox", "item_type,item_id,created_at", null, ["item_type", "item_id"]);
  assert.equal(result.rows.length, 2002);
  assert.equal(new Set(result.rows.map(r => r.item_type + ":" + r.item_id)).size, 2002);
  assert.ok(fake.requests.every(r => r.orders.slice(1).map(x => x.field).join(",") === "item_type,item_id"));
});

test("default analytics exact-count behavior and date filter remain unchanged", async () => {
  const fake = client({ analytics_events: rows(1001) });
  const result = await runtime(fake).context.loadAdminTablePages("analytics_events", "id,created_at", "2026-10-01");
  assert.equal(result.rows.length, 1001); assert.equal(result.truncated, false);
  assert.equal(fake.requests.length, 2);
  assert.ok(fake.requests.every(r => r.options.count === "exact" && r.orders.length === 1 && r.filters.length === 1));
});

test("page-two error discards partial rows rather than treating them as complete", async () => {
  const fake = client({ events: rows(1001) }, { failAt: r => r.from === 1000 });
  const result = await runtime(fake).context.loadDataOpsTablePages("events", "id,created_at");
  assert.equal(result.rows, null); assert.equal(result.error.code, "57014");
});

test("malformed count-free responses fail closed", async () => {
  for (const input of [null, [null], [{}]]) {
    const fake = input === null ? client({}, { malformedAt: () => true }) : client({ events: input });
    const result = await runtime(fake).context.loadDataOpsTablePages("events", "id,created_at");
    assert.equal(result.rows, null); assert.ok(result.error);
  }
});

test("row cap distinguishes exactly 100000 complete rows from 100001", async () => {
  for (const count of [100000, 100001]) {
    const fake = client({ events: rows(count) });
    const result = await runtime(fake).context.loadDataOpsTablePages("events", "id,created_at");
    assert.equal(result.rows.length, 100000); assert.equal(result.truncated, count > 100000);
    assert.deepEqual([fake.requests.at(-1).from, fake.requests.at(-1).to], [100000, 100000]);
  }
});

test("row cap probe preserves filters and reports a probe error", async () => {
  const fake = client({ user_feedback: rows(1002, { category: "incorrect_event_data", status: "planned", event_id: 186 }) }, { failAt: r => r.from === 1000 });
  const result = await runtime(fake, { rowLimit: 1000 }).context.loadFreshnessBlockingFeedback();
  assert.equal(result.rows, null); assert.equal(result.error.code, "57014");
  assert.ok(fake.requests.every(r => r.filters.length === 2 && r.options.count === undefined));
});

test("active-job and feedback loaders preserve scope and fail closed on cap", async () => {
  const fake = client({
    source_crawl_jobs: [...rows(1001, { status: "processing", source_id: "source" }), { id: "ignored", created_at: "2026-10-06", status: "completed" }],
    user_feedback: [...rows(1001, { category: "incorrect_event_data", status: "planned", event_id: 186 }), { id: "ignored", created_at: "2026-10-06", category: "bug", status: "planned" }]
  });
  const { context } = runtime(fake, { rowLimit: 1000 });
  for (const result of [await context.loadSourceMonitorActiveJobs(), await context.loadFreshnessBlockingFeedback()]) {
    assert.equal(result.rows, null); assert.equal(result.truncated, true); assert.ok(result.error);
  }
  assert.ok(fake.requests.every(r => r.options.count === undefined));
});

test("lazy bounded workers peak at three and preserve results and rejected errors", async () => {
  const { context } = runtime(client({}));
  const pending = []; let active = 0, peak = 0, started = 0;
  const loaders = Array.from({ length: 15 }, (_, id) => () => new Promise((resolve, reject) => {
    started++; active++; peak = Math.max(peak, active);
    pending.push(() => { active--; if (id === 7) reject(new Error("transport")); else resolve({ rows: [id], error: null }); });
  }));
  const work = context.loadBoundedAdminTasks(loaders);
  assert.equal(started, 3);
  while (pending.length) { pending.shift()(); await new Promise(resolve => setImmediate(resolve)); }
  const results = await work;
  assert.equal(peak, 3); assert.equal(started, 15);
  assert.equal(results[7].error.message, "transport");
  assert.deepEqual(plain(results.filter((_, i) => i !== 7).map(r => r.rows[0])), Array.from({ length: 15 }, (_, i) => i).filter(i => i !== 7));
});

test("real Data Operations performs bounded reads without exact counts and includes second-page rows", async () => {
  const fake = client({
    events: rows(1001, { country: "Germany", sport: "Running" }),
    admin_freshness_attestation_inbox: [{ id: "unused", item_type: "freshness_review", item_id: "new-edition", created_at: "2026-10-06" }]
  }, { pause: () => new Promise(resolve => setImmediate(resolve)) });
  const r = runtime(fake);
  await r.context.loadDataOperations({ throwOnError: true });
  assert.equal(fake.peak, 3);
  assert.ok(fake.requests.every(request => request.options.count === undefined));
  assert.equal(r.context.dataOpsEvents.length, 1001);
  assert.equal(r.context.editionLifecycleInbox[0].item_id, "new-edition");
  assert.notEqual(r.context.dataOpsMeasuredAt, null); assert.equal(r.renders, 1);
});

test("Data Operations timeout clears stale actions and never publishes partial state", async () => {
  for (const language of ["en", "de"]) {
    const fake = client({ events: rows(1) }, { failAt: r => r.table === "admin_review_inbox" });
    const r = runtime(fake, { language });
    await assert.rejects(r.context.loadDataOperations({ throwOnError: true }), /Keine Freigabe möglich/);
    assert.equal(r.context.dataOpsMeasuredAt, null);
    assert.deepEqual(plain(r.context.editionLifecycleInbox), []);
    assert.equal(r.context.dataOpsEvents[0].id, "previous-event"); assert.equal(r.renders, 0);
    assert.match(r.diagnostics[0], /57014: canceling statement due to statement timeout/);
    assert.match(r.statuses.at(-1)[0], language === "de" ? /Zeitlimit der Datenbank/ : /database time limit/);
  }
});

test("Data Operations treats truncated rows as failure even when no error was returned", async () => {
  const fake = client({ events: rows(1001) });
  const r = runtime(fake, { rowLimit: 1000 });
  await r.context.loadDataOperations();
  assert.equal(r.context.dataOpsMeasuredAt, null);
  assert.equal(r.context.dataOpsEvents[0].id, "previous-event"); assert.equal(r.renders, 0);
  assert.deepEqual(plain(r.context.editionLifecycleInbox), []);
  assert.match(r.diagnostics[0], /row limit/);
});

test("overlapping tab and refresh runs stay within three reads and each reload sees a fresh snapshot", async () => {
  const tables = { events: rows(1) };
  const fake = client(tables, { pause: () => new Promise(resolve => setImmediate(resolve)) });
  const r = runtime(fake);
  const snapshots = [];
  r.context.renderDataOperations = () => { snapshots.push(r.context.dataOpsEvents.length); tables.events = rows(2); };
  const first = r.context.loadDataOperations();
  const second = r.context.loadDataOperations({ throwOnError: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fake.requests.filter(request => request.table === "events").length, 1);
  await Promise.all([first, second]);
  assert.equal(fake.peak, 3);
  assert.deepEqual(snapshots, [1, 2]);
  assert.equal(r.context.dataOpsEvents.length, 2);
});

test("a failed strict run rejects its caller but does not poison the next queued fresh reload", async () => {
  let failed = false;
  const fake = client({ events: rows(1) }, {
    pause: () => new Promise(resolve => setImmediate(resolve)),
    failAt: r => r.table === "admin_review_inbox" && !failed && (failed = true)
  });
  const r = runtime(fake);
  const first = r.context.loadDataOperations({ throwOnError: true });
  const second = r.context.loadDataOperations({ throwOnError: true });
  await assert.rejects(first, /Keine Freigabe möglich/);
  await second;
  assert.equal(fake.peak, 3);
  assert.notEqual(r.context.dataOpsMeasuredAt, null);
  assert.equal(r.renders, 1);
});

test("a queued throwOnError reload cannot reuse an earlier successful checkpoint", async () => {
  let inboxReads = 0;
  const fake = client({ events: rows(1) }, { failAt: r => r.table === "admin_review_inbox" && ++inboxReads === 2 });
  const r = runtime(fake);
  const first = r.context.loadDataOperations();
  const second = r.context.loadDataOperations({ throwOnError: true });
  await first;
  await assert.rejects(second, /Keine Freigabe möglich/);
  assert.equal(r.context.dataOpsMeasuredAt, null);
  assert.deepEqual(plain(r.context.editionLifecycleInbox), []);
});
