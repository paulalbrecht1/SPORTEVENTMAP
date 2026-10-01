import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const eventSource = fs.readFileSync(new URL("../js/events.js", import.meta.url), "utf8");
const cloudSource = fs.readFileSync(new URL("../js/supabase.js", import.meta.url), "utf8");
const past = { event_id: 7, edition_id: "11111111-1111-4111-8111-111111111111", edition_year: 2020,
  event_key: "same race|15.03.2020|berlin", event_name: "Same race", date: "15.03.2020", city: "Berlin", country: "Germany", event_status: "completed" };
const upcoming = { ...past, edition_id: "22222222-2222-4222-8222-222222222222", edition_year: 2035,
  event_key: "same race|15.03.2035|berlin", date: "15.03.2035", event_status: "scheduled" };
const raw = value => JSON.parse(JSON.stringify(value));

function harness({ archive = [past, upcoming], remote = [], ownedArchive = [], rpcError = null, writeError = null, noOp = false } = {}) {
  const store = new Map(), queries = [], writes = [], rpcCalls = [];
  let currentRemote = raw(remote);
  let userId = "user-one";
  const context = vm.createContext({
    window: { dispatchEvent() {} }, Event, Map, Set, Date, console: { warn() {} },
    events: raw([upcoming]), favorites: [], plannedEditions: [], personalPlannedCatalog: new Map(), personalPlanningLoadVersion: 0,
    personalPlannerSyncQueues: new Map(),
    personalPlanningCloudLoadVersion: 0,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    fetch: async () => { throw new Error("No snapshot in this test."); },
    supabaseClient: { auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
      async rpc(name, args) {
        rpcCalls.push({ name, args: raw(args) });
        return rpcError ? { error: rpcError } : { data: raw(ownedArchive.filter(row => args.p_edition_ids.includes(row.edition_id))), error: null };
      }, from(table) {
      const filters = []; let rowLimit = Infinity;
      const query = { select() { return query; }, eq(column, value) { filters.push([column, value]); return query; },
        in(column, value) { filters.push([column, value]); queries.push({ table, column, value }); return query; },
        ilike(column, pattern) {
          const prefix = pattern.slice(0, -1).replace(/\\([\\%_])/g, "$1");
          filters.push([column, value => String(value || "").toLowerCase().startsWith(prefix.toLowerCase())]);
          queries.push({ table, column, pattern }); return query;
        }, limit(value) { rowLimit = value; if (queries.at(-1)?.pattern) queries.at(-1).limit = value; return query; },
        upsert(payload) { writes.push(raw(payload)); if (writeError) return Promise.resolve({ error: { message: writeError } });
          if (!noOp) currentRemote = [{ ...currentRemote.find(row => row.event_id === payload.event_id), ...raw(payload) }];
          return Promise.resolve({ error: null }); },
        then(resolve, reject) { const rows = table === "public_event_archive" ? archive : table === "season_planner_events" ? currentRemote : [];
          return Promise.resolve({ data: raw(rows.filter(row => filters.every(([field, value]) => typeof value === "function" ? value(row[field]) : Array.isArray(value) ? value.includes(row[field]) : row[field] === value)).slice(0, rowLimit)), error: null }).then(resolve, reject); } };
      return query;
    } }
  });
  const define = (source, name) => {
    const match = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(source);
    assert.ok(match, name);
    const next = /\n(?:async )?function \w+\(/g; next.lastIndex = match.index + match[0].length;
    const end = next.exec(source)?.index ?? source.length;
    vm.runInContext(source.slice(match.index, end).split("\nwindow.")[0], context, { filename: name });
  };
  for (const name of ["cleanValue", "createEventKey", "createLegacyEventKey", "createLegacyAdminEventKey", "getEventKeyAliases", "getEventKey",
    "getExactPlannedMatches", "getPersonalPlannedEvents", "createPersonalPlannerPlaceholder", "getPersonalParticipationState", "notifyPersonalPlanningChange", "refreshPersonalPlannedCatalog", "personalPlannerSnapshot",
    "saveFavorites", "savePlannedEditions", "getSeasonPlanMeta", "saveSeasonPlanMeta", "getDefaultPlannerDetails", "isPlainPlannerObject",
    "normalizePlannerDetails", "normalizeSeasonMetaEntry", "getSeasonMetaEntry", "getSeasonPlannerDetails", "mergePersonalPlannerDetails",
    "applyRemotePlanningState", "findSeasonEventByKey", "setPersonalPlannerSyncState", "migrateLocalPlanningKeys",
    "createLocalSeasonDate", "parseSeasonDateRange", "parseSeasonDate", "parseSeasonEndDate", "getLocalDateStart", "getUpcomingSeasonEvents"]) define(eventSource, name);
  for (const name of ["loadPersonalPlannedEditions", "loadRemotePlanningState", "samePersonalPlannerValue", "syncSeasonPlanMetaToSupabase"]) define(cloudSource, name);
  context.window.applyRemotePlanningState = context.applyRemotePlanningState;
  context.window.loadPersonalPlannedEditions = context.loadPersonalPlannedEditions;
  context.window.setPersonalPlannerSyncState = context.setPersonalPlannerSyncState;
  context.window.cancelPersonalPlanningLoad = () => { context.personalPlanningCloudLoadVersion += 1; };
  store.set("personalPlanningUser", "user-one");
  return { context, store, queries, writes, rpcCalls, remote: () => currentRemote, setUser: value => { userId = value; } };
}

test("own archived edition and results survive Cloud loading while Discovery shows a successor", async () => {
  const row = { user_id: "user-one", event_id: "stable-old-cloud-key", edition_id: past.edition_id, priority: "A", planned_distance: "10 km",
    planner_details: { result: { finish_status: "Finished", finish_time: "45:00" } } };
  const { context, queries } = harness({ remote: [row] });
  await context.loadRemotePlanningState({ id: "user-one" });
  const planned = context.getPersonalPlannedEvents();
  assert.equal(planned.length, 1); assert.equal(planned[0].edition_id, past.edition_id);
  assert.equal(context.getEventKey(planned[0]), row.event_id);
  assert.equal(context.getSeasonPlannerDetails(planned[0]).result.finish_time, "45:00");
  assert.equal(context.events.length, 1); assert.equal(context.events[0].edition_id, upcoming.edition_id);
  assert.deepEqual(raw(queries), [{ table: "public_event_archive", column: "edition_id", value: [past.edition_id] }]);
});

test("ambiguous legacy names and duplicate exact keys stay unresolved; nothing guesses the latest year", async () => {
  const { context, store } = harness({ archive: [past, { ...upcoming, event_key: past.event_key }] });
  const meta = { "Same race": { planner_details: { result: { finish_status: "Finished", finish_time: "45:00" } } } };
  store.set("seasonPlanMeta", JSON.stringify(meta)); context.plannedEditions = ["Same race"];
  context.migrateLocalPlanningKeys(context.events);
  assert.equal(context.getPersonalPlannedEvents()[0]._planner_unresolved.includes("bleibt erhalten"), true);
  assert.equal(context.getSeasonPlanMeta()[upcoming.event_key], undefined);
  assert.equal((await context.loadPersonalPlannedEditions([{ event_id: past.event_key }]))[0]._planner_resolution, "ambiguous");
});

test("a successful empty archive lookup is not deletion and does not resurrect fallback records", async () => {
  const { context, store } = harness({ archive: [] }); let fallbackCalls = 0;
  context.fetch = async () => { fallbackCalls++; return { ok: true, json: async () => ({ exported_at: new Date().toISOString(), editions: [past] }) }; };
  context.plannedEditions = ["hidden-edition"];
  store.set("seasonPlanMeta", JSON.stringify({ "hidden-edition": { edition_id: past.edition_id, planner_details: { result: { finish_status: "DNF" } } } }));
  await context.refreshPersonalPlannedCatalog();
  const event = context.getPersonalPlannedEvents()[0];
  assert.equal(fallbackCalls, 0); assert.equal(event.date, ""); assert.equal(event.edition_id, past.edition_id);
  assert.equal(context.getPersonalParticipationState(event).personal, "dnf");
  assert.doesNotMatch(event._planner_unresolved, /gelöscht/i);
});

test("failed extra archive lookup preserves an exact loaded public edition; successful missing and ambiguous answers do not", () => {
  const { context, store } = harness();
  context.plannedEditions = [upcoming.event_key];
  store.set("seasonPlanMeta", JSON.stringify({ [upcoming.event_key]: { edition_id: upcoming.edition_id } }));
  for (const resolution of ["unavailable", "permission_denied", "owned_archive_unavailable", "not_publicly_available", "ambiguous"]) {
    context.personalPlannedCatalog.set(upcoming.event_key, { _planner_key: upcoming.event_key, edition_id: upcoming.edition_id, _planner_resolution: resolution });
    const event = context.getPersonalPlannedEvents()[0];
    const lookupFailed = ["unavailable", "permission_denied", "owned_archive_unavailable"].includes(resolution);
    assert.equal(Boolean(event._planner_lookup_warning), lookupFailed);
    assert.equal(context.getPersonalParticipationState(event).isUpcoming, lookupFailed);
    assert.equal(event.edition_id, upcoming.edition_id);
  }
  context.events = [upcoming, { ...upcoming }];
  context.personalPlannedCatalog.set(upcoming.event_key, { _planner_resolution: "unavailable" });
  assert.equal(context.getPersonalParticipationState(context.getPersonalPlannedEvents()[0]).temporal, "unknown");
});

test("temporal, catalog and personal outcome are independent; only explicit Finished/Finisher is a finisher", () => {
  const { context, store } = harness(); context.plannedEditions = [past.event_key];
  context.personalPlannedCatalog.set(past.event_key, past);
  for (const status of ["", "Finished", " finisher ", "DNF", "DNS", "DSQ"]) {
    store.set("seasonPlanMeta", JSON.stringify({ [past.event_key]: { planner_details: { result: { finish_status: status } } } }));
    const state = context.getPersonalParticipationState(context.getPersonalPlannedEvents()[0]);
    assert.equal(state.temporal, "past"); assert.equal(state.finished, /^(finished|finisher)$/i.test(status.trim()));
  }
  store.set("seasonPlanMeta", JSON.stringify({ [upcoming.event_key]: { planner_details: { result: { finish_status: "DNS" } } } }));
  assert.equal(context.getPersonalParticipationState(upcoming).isUpcoming, false);
  for (const status of ["Cancelled", "Other", "unrecognized legacy outcome"]) {
    store.set("seasonPlanMeta", JSON.stringify({ [upcoming.event_key]: { planner_details: { result: { finish_status: status } } } }));
    assert.equal(context.getPersonalParticipationState(upcoming).isUpcoming, false);
    assert.equal(context.getPersonalParticipationState(upcoming).finished, false);
  }
  store.set("seasonPlanMeta", "{}");
  assert.equal(context.getPersonalParticipationState({ ...upcoming, event_status: "cancelled" }).isUpcoming, false);
  assert.equal(context.getPersonalParticipationState({ ...upcoming, event_status: "date_unconfirmed" }).isUpcoming, false);
  assert.equal(context.getPersonalParticipationState({ ...upcoming, event_status: "postponed" }).isUpcoming, false);
  assert.equal(context.getPersonalParticipationState({ ...upcoming, date: "31.02.2035" }).temporal, "unknown");
  assert.equal(context.getPersonalParticipationState({ ...upcoming, date: "", end_date: "2035-03-15" }).temporal, "unknown");
});

test("an exact legacy planner key keeps its own metadata when public canonical keys are migrated", () => {
  const { context, store } = harness();
  const canonical = { ...past, event_key: `${past.event_key}|germany` };
  context.plannedEditions = [past.event_key]; context.events = [canonical];
  store.set("seasonPlanMeta", JSON.stringify({ [past.event_key]: { planner_details: { result: { finish_status: "Finished", finish_time: "45:00" } } } }));
  context.migrateLocalPlanningKeys(context.events);
  const planned = context.getPersonalPlannedEvents()[0];
  assert.equal(context.getEventKey(planned), past.event_key);
  assert.equal(context.getSeasonPlannerDetails(planned).result.finish_time, "45:00");
  assert.equal(context.getSeasonPlanMeta()[canonical.event_key], undefined);
});

test("pending local results survive empty remote details, reload and duplicate legacy references", () => {
  const { context, store } = harness();
  context.plannedEditions = [past.event_key, "old-alias"];
  store.set("seasonPlanMeta", JSON.stringify({ [past.event_key]: { edition_id: past.edition_id, _sync_state: "error", _sync_revision: 1,
    planner_details: { result: { finish_status: "Finished", finish_time: "45:00" } } }, "old-alias": { edition_id: past.edition_id } }));
  context.applyRemotePlanningState({ userId: "user-one", favorites: [], plannedEditions: [past.event_key, "old-alias"], plannedEvents: [{ ...past, _planner_key: past.event_key }],
    seasonMeta: { [past.event_key]: { edition_id: past.edition_id, planner_details: {} }, "old-alias": { edition_id: past.edition_id } } });
  assert.equal(context.getPersonalPlannedEvents().length, 1);
  assert.equal(context.getSeasonPlannerDetails(context.getPersonalPlannedEvents()[0]).result.finish_time, "45:00");
  assert.equal(JSON.parse(store.get("seasonPlanMeta"))[past.event_key]._sync_state, "error");
});

for (const variant of ["success", "schema-error", "no-op"]) test(`result write ${variant} is checked by readback and never strips results`, async () => {
  const remote = { user_id: "user-one", event_id: past.event_key, edition_id: past.edition_id, planner_details: {} };
  const { context, store, writes } = harness({ remote: [remote], writeError: variant === "schema-error" ? "planner_details column unavailable" : null, noOp: variant === "no-op" });
  context.plannedEditions = [past.event_key]; context.personalPlannedCatalog.set(past.event_key, past);
  const details = { result: { finish_status: "Finished", finish_time: "45:00" } };
  store.set("seasonPlanMeta", JSON.stringify({ [past.event_key]: { edition_id: past.edition_id, _sync_revision: 3, _sync_state: "pending", planner_details: details } }));
  assert.equal(await context.syncSeasonPlanMetaToSupabase(past.event_key, { planner_details: details }), variant === "success");
  assert.equal(writes.length, 1); assert.deepEqual(writes[0].planner_details, details); assert.equal(writes[0].edition_id, past.edition_id);
  const stored = JSON.parse(store.get("seasonPlanMeta"))[past.event_key];
  assert.equal(stored._sync_state, variant === "success" ? "synced" : "error"); assert.equal(stored.planner_details.result.finish_time, "45:00");
});

test("logout and user switch clear the previous personal cohort and late result callbacks cannot restore it", () => {
  const { context, store } = harness(); context.plannedEditions = [past.event_key]; context.personalPlannedCatalog.set(past.event_key, past);
  store.set("seasonPlanMeta", JSON.stringify({ [past.event_key]: { _sync_revision: 1, planner_details: { result: { finish_status: "Finished" } } } }));
  context.applyRemotePlanningState({ clear: true, favorites: [], plannedEditions: [], seasonMeta: {} });
  context.setPersonalPlannerSyncState(past.event_key, 1, "synced", "late", "user-one");
  assert.equal(context.getPersonalPlannedEvents().length, 0); assert.deepEqual(raw(context.getSeasonPlanMeta()), {});
  context.applyRemotePlanningState({ userId: "user-two", favorites: [], plannedEditions: [], plannedEvents: [], seasonMeta: {} });
  assert.equal(store.get("personalPlanningUser"), "user-two"); assert.deepEqual(raw(context.getSeasonPlanMeta()), {});
});

test("an old user's late Cloud load is discarded after another account signs in", async () => {
  const { context, setUser, store } = harness({ remote: [{ user_id: "user-one", event_id: past.event_key,
    edition_id: past.edition_id, planner_details: { personal_note: "PRIVATE OLD USER NOTE" } }] });
  const loading = context.loadRemotePlanningState({ id: "user-one" });
  setUser("user-two");
  context.applyRemotePlanningState({ clear: true, favorites: [], plannedEditions: [], seasonMeta: {} });
  context.applyRemotePlanningState({ userId: "user-two", favorites: [], plannedEditions: [], plannedEvents: [], seasonMeta: {} });
  await loading;
  assert.equal(context.getPersonalPlannedEvents().length, 0);
  assert.doesNotMatch(store.get("seasonPlanMeta"), /PRIVATE OLD USER NOTE/);
});

test("archive failures and denied access stay distinct from missing public records; saved facts are explicitly historical", async () => {
  for (const [code, expected] of [["503", "unavailable"], ["42501", "permission_denied"]]) {
    const { context, store } = harness();
    context.supabaseClient.from = () => ({ select() { return this; }, in() { return Promise.resolve({ error: { code } }); } });
    context.plannedEditions = [past.event_key];
    store.set("seasonPlanMeta", JSON.stringify({ [past.event_key]: { edition_id: past.edition_id,
      catalog_snapshot: { event_name: past.event_name, date: past.date, city: past.city, sport: "Running", distance: "10 km" } } }));
    await context.refreshPersonalPlannedCatalog();
    const event = context.getPersonalPlannedEvents()[0];
    assert.equal(event._planner_resolution, expected); assert.equal(event.date, past.date);
    assert.equal(event._planner_saved_facts, true);
    assert.equal(context.getPersonalParticipationState(event).temporal, "unknown");
    assert.doesNotMatch(event._planner_unresolved, /gelöscht/i);
  }
});

test("date-only stays local; explicit ISO offsets respect instants, DST and documented start/end precision", () => {
  const { context } = harness();
  const dateOnly = context.parseSeasonDate("2026-03-29");
  assert.equal(dateOnly.getFullYear(), 2026); assert.equal(dateOnly.getMonth(), 2); assert.equal(dateOnly.getDate(), 29);
  for (const date of ["2026-03-29T01:30:00+01:00", "2026-03-29T03:30:00+02:00", "2026-10-25T02:30:00+02:00", "2026-10-25T02:30:00+01:00", "2026-10-01T09:00:00Z"]) {
    assert.equal(context.parseSeasonDate(date).getTime(), Date.parse(date));
  }
  for (const date of ["2026-02-31T09:00:00+01:00", "2026-10-01T24:99:00+02:00", "2026-10-01T09:00:00+25:00", "01.10.2026 24:99"]) assert.equal(context.parseSeasonDate(date), null);
  const now = new Date("2026-10-01T10:00:00Z");
  const event = { ...upcoming, date: "2026-10-01T09:00:00Z" };
  assert.equal(context.getPersonalParticipationState(event, now).temporal, "ongoing");
  assert.equal(context.getPersonalParticipationState(event, now).isUpcoming, false);
  assert.equal(context.getPersonalParticipationState({ ...event, end_date: "2026-10-01T09:45:00Z" }, now).temporal, "past");
  assert.equal(context.getPersonalParticipationState({ ...event, date: "2026-10-01", start_time: "09:00:00" }, now).temporal, "unknown");
});

test("a genuinely archived owned edition is loaded only through the authenticated targeted RPC", async () => {
  const row = { ...past, publication_status: "archived", catalog_visibility: "owned_archived" };
  const remote = { user_id: "user-one", event_id: "personal-archived-key", edition_id: past.edition_id,
    planner_details: { result: { finish_status: "Finished", finish_time: "45:00" } } };
  const { context, queries, rpcCalls } = harness({ archive: [upcoming], remote: [remote], ownedArchive: [row] });
  await context.loadRemotePlanningState({ id: "user-one" });
  const planned = context.getPersonalPlannedEvents()[0];
  assert.equal(planned.edition_id, past.edition_id); assert.equal(planned._planner_owned_archive, true);
  assert.equal(context.getSeasonPlannerDetails(planned).result.finish_time, "45:00");
  assert.equal(context.events.some(event => event.edition_id === past.edition_id), false);
  assert.deepEqual(raw(rpcCalls), [{ name: "get_own_planner_archived_editions", args: { p_edition_ids: [past.edition_id] } }]);
  assert.equal(queries[0].table, "public_event_archive");
});

test("missing archived RPC keeps honest placeholders and results; unauthenticated clients never call it", async () => {
  const { context, store, rpcCalls, setUser } = harness({ archive: [], rpcError: { code: "PGRST202", message: "Function missing" } });
  context.plannedEditions = [past.event_key];
  store.set("seasonPlanMeta", JSON.stringify({ [past.event_key]: { edition_id: past.edition_id, planner_details: { result: { finish_status: "DNF" } } } }));
  await context.refreshPersonalPlannedCatalog();
  const planned = context.getPersonalPlannedEvents()[0];
  assert.equal(planned._planner_resolution, "owned_archive_unavailable");
  assert.equal(context.getPersonalParticipationState(planned).personal, "dnf");
  const previousCalls = rpcCalls.length; setUser(null);
  await context.refreshPersonalPlannedCatalog();
  assert.equal(rpcCalls.length, previousCalls);
  assert.equal(context.getPersonalPlannedEvents()[0]._planner_resolution, "permission_denied");
});

test("unexpected foreign or non-archived RPC rows never enter the personal collection", async () => {
  const { context, store } = harness({ archive: [] });
  context.plannedEditions = [past.event_key]; store.set("seasonPlanMeta", JSON.stringify({ [past.event_key]: { edition_id: past.edition_id } }));
  for (const row of [{ ...upcoming, catalog_visibility: "owned_archived", publication_status: "archived" }, { ...past, catalog_visibility: "draft" }, { ...past, catalog_visibility: "owned_archived", publication_status: "draft" }]) {
    context.supabaseClient.rpc = async () => ({ data: [row], error: null });
    await context.refreshPersonalPlannedCatalog();
    assert.equal(context.getPersonalPlannedEvents()[0]._planner_resolution, "owned_archive_unavailable");
    assert.equal(context.getPersonalPlannedEvents()[0].edition_id, past.edition_id);
  }
});

test("a three-part legacy reference resolves a unique real four-part public key and keeps its personal key", async () => {
  const publicEdition = { ...past, event_key: `${past.event_key}|germany` };
  const { context, store, queries } = harness({ archive: [publicEdition] });
  context.plannedEditions = [past.event_key];
  store.set("seasonPlanMeta", JSON.stringify({ [past.event_key]: { planner_details: { result: { finish_status: "Finished", finish_time: "45:00" } } } }));
  await context.refreshPersonalPlannedCatalog();
  const planned = context.getPersonalPlannedEvents()[0];
  assert.equal(planned.edition_id, past.edition_id); assert.equal(context.getEventKey(planned), past.event_key);
  assert.equal(context.getSeasonPlanMeta()[past.event_key].edition_id, past.edition_id);
  assert.equal(context.getSeasonPlannerDetails(planned).result.finish_time, "45:00");
  assert.deepEqual(raw(queries[1]), { table: "public_event_archive", column: "event_key", pattern: `${past.event_key}|%`, limit: 3 });
});

test("two four-part editions matching the same legacy date/city remain ambiguous and wildcard characters stay literal", async () => {
  const key = "race_%\\test|15.03.2020|berlin";
  const { context, store, queries } = harness({ archive: [{ ...past, event_key: `${key}|germany` },
    { ...past, edition_id: upcoming.edition_id, event_key: `${key}|deutschland` },
    { ...upcoming, event_key: "racexAXtest|15.03.2035|berlin|germany" }] });
  context.plannedEditions = [key]; store.set("seasonPlanMeta", JSON.stringify({ [key]: { planner_details: { result: { finish_status: "DNF" } } } }));
  await context.refreshPersonalPlannedCatalog();
  const planned = context.getPersonalPlannedEvents()[0];
  assert.equal(planned._planner_resolution, "ambiguous"); assert.equal(planned.edition_id, null);
  assert.equal(context.getSeasonPlannerDetails(planned).result.finish_status, "DNF");
  assert.equal(queries[1].pattern, "race\\_\\%\\\\test|15.03.2020|berlin|%"); assert.equal(queries[1].limit, 3);
});
