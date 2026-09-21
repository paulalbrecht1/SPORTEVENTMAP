import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { withSourceMonitorCors } from "../supabase/functions/_shared/source-monitor-cors.mjs";
import { cleanError, loadSourceMonitorRuntimeCapabilities } from "../supabase/functions/_shared/source-monitor-worker-outcomes.mjs";

// Run the real registered worker handler. Replacing its external imports keeps
// tests entirely local while exposing any accidental auth/DB work on OPTIONS.
const worker = fs.readFileSync(new URL("../supabase/functions/event-source-check/index.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(worker.replace(/^import[\s\S]*?;\r?$/gm, ""));
const functionUrl = "https://project.example.test/functions/v1/event-source-check";
const origin = "https://sporteventmap.com";
const browserHeaders = "authorization, x-client-info, apikey, content-type";
const runtimeKeys = { SUPABASE_URL: "https://project.example.test", SUPABASE_PUBLISHABLE_KEY: "fixture-publishable", SUPABASE_SECRET_KEY: "fixture-server" };

function fixture(options = {}) {
  const calls = { env: [], clients: [], auth: 0, reads: [], writes: [], rpcs: [], transport: 0 };
  let handler;
  const createClient = (url, key, config) => {
    calls.clients.push({ url, key, config });
    return {
      auth: { async getUser() {
        calls.auth++;
        if (options.throwOnAuth) throw new Error("auth unavailable; token=fixturePrivateToken");
        return { data: { user: options.role ? { id: "fixture-user" } : null }, error: null };
      } },
      from(table) {
        let operation = "select";
        const result = async () => {
          if (operation === "select") calls.reads.push(table);
          if (table === "profiles") return { data: { role: options.role }, error: null };
          if (operation === "insert" && options.failInsert) return { data: null, error: { message: "run insert failed" } };
          return { data: { id: "fixture-run" }, error: null };
        };
        const query = {
          select() { return query; }, eq() { return query; },
          insert(value) { operation = "insert"; calls.writes.push({ table, operation, value }); return query; },
          update(value) { operation = "update"; calls.writes.push({ table, operation, value }); return query; },
          single: result, maybeSingle: result, then(resolve, reject) { return result().then(resolve, reject); }
        };
        return query;
      },
      async rpc(name, args) {
        calls.rpcs.push({ name, args });
        if (name === "verify_event_source_cron_secret") return { data: options.cronValid === true, error: null };
        if (name === "get_source_monitor_runtime_capabilities") return {
          data: options.failCapabilities ? null : { schema_version: 1, extraction_review: true,
            stage_four_simulation: false, stage_four_automation: false, stage_four_shadow: false },
          error: null
        };
        if (name === "schedule_due_source_crawls" && options.failScheduler) return { data: null, error: { message: "scheduler failed" } };
        return { data: name === "claim_source_crawl_jobs" ? [] : 0, error: null };
      }
    };
  };
  const context = vm.createContext({
    Request, Response, Headers, URL, atob, crypto: webcrypto, createClient,
    cleanError, loadSourceMonitorRuntimeCapabilities, withSourceMonitorCors,
    createDenoPinnedFetch() { calls.transport++; return () => { throw new Error("No network is permitted in CORS tests"); }; },
    Deno: {
      env: { get(name) { calls.env.push(name); return (options.env ?? runtimeKeys)[name]; } },
      serve(callback) { handler = callback; }
    }
  });
  vm.runInContext(executable, context, { timeout: 1000 });
  assert.equal(typeof handler, "function");
  return { calls, handler };
}

function request(method = "OPTIONS", extra = {}) {
  return new Request(functionUrl, { method, headers: { Origin: origin, ...extra }, ...(method === "POST" ? { body: "{}" } : {}) });
}
function assertCors(response, expectedOrigin = origin) {
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), expectedOrigin);
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assert.equal(response.headers.get("Access-Control-Allow-Headers"), browserHeaders);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
  assert.match(response.headers.get("Vary"), /Origin/);
}
function assertNoWorkerWork(calls) {
  assert.deepEqual(calls, { env: [], clients: [], auth: 0, reads: [], writes: [], rpcs: [], transport: 0 });
}

test("the real worker accepts app/release/local preflights before keys, auth, clients or database", async () => {
  for (const allowedOrigin of [origin, "https://sporteventmap.pages.dev", "https://9cd74f1c.sporteventmap.pages.dev",
    "http://127.0.0.1:5500", "http://localhost:5500", "http://127.0.0.1:4173", "http://localhost:4173",
    "http://127.0.0.1:4174", "http://localhost:4174", "http://127.0.0.1:4187"]) {
    const { handler, calls } = fixture({ env: {} });
    const response = await handler(request("OPTIONS", { Origin: allowedOrigin,
      "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Authorization, X-Client-Info, Apikey, Content-Type" }));
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assertCors(response, allowedOrigin);
    assertNoWorkerWork(calls);
  }
});

test("foreign, opaque and lookalike origins fail before worker work and receive no origin grant", async () => {
  for (const untrusted of ["https://evil.example", "null", "https://sporteventmap.com.evil.example",
    "https://www.sporteventmap.com", "https://branch.sporteventmap.pages.dev", "https://123456789.sporteventmap.pages.dev",
    "https://9cd74f1c.sporteventmap.pages.dev.evil.example", "http://sporteventmap.com", "http://127.0.0.1:9999",
    "https://user@sporteventmap.com", "https://sporteventmap.com/path", ""]) {
    for (const method of ["OPTIONS", "POST"]) {
      const { handler, calls } = fixture({ role: "admin" });
      const response = await handler(request(method, { Origin: untrusted }));
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
      assertNoWorkerWork(calls);
    }
  }
});

test("preflight does not permit unsupported methods or privileged server headers", async () => {
  for (const [headers, status] of [
    [{ "Access-Control-Request-Method": "GET" }, 405],
    [{ "Access-Control-Request-Method": "DELETE" }, 405],
    [{ "Access-Control-Request-Headers": "authorization, x-cron-secret" }, 403],
    [{ "Access-Control-Request-Headers": "x-source-monitor-smoke-secret" }, 403],
    [{ "Access-Control-Request-Headers": "x-unreviewed-header" }, 403]
  ]) {
    const { handler, calls } = fixture();
    const response = await handler(request("OPTIONS", headers));
    assert.equal(response.status, status);
    assertCors(response);
    assertNoWorkerWork(calls);
  }
});

test("method and runtime failures keep their JSON status and CORS without scheduling jobs", async () => {
  for (const [method, expectedStatus] of [["GET", 405], ["POST", 500]]) {
    const { handler, calls } = fixture({ env: {} });
    const response = await handler(request(method));
    assert.equal(response.status, expectedStatus);
    assertCors(response);
    assert.equal(typeof (await response.json()).error, "string");
    assert.deepEqual(calls.clients, []);
    assert.deepEqual(calls.writes, []);
  }
});

test("allowed origin does not authorize anonymous or non-admin users", async () => {
  for (const role of [undefined, "user"]) {
    const { handler, calls } = fixture({ role });
    const response = await handler(request("POST", { Authorization: "Bearer fixture-user-jwt" }));
    assert.equal(response.status, 403);
    assertCors(response);
    assert.match((await response.json()).error, /Admin or scheduler/);
    assert.equal(calls.auth, 1);
    assert.deepEqual(calls.writes, []);
    assert.deepEqual(calls.rpcs, []);
    if (role) assert.deepEqual(calls.reads, ["profiles"]);
  }
});

test("a real admin path retains auth and source-specific bounded queue RPCs", async () => {
  const { handler, calls } = fixture({ role: "admin" });
  const response = await handler(new Request(functionUrl, { method: "POST", headers: { Origin: origin,
    Authorization: "Bearer fixture-user-jwt", "Content-Type": "application/json" },
    body: JSON.stringify({ source_id: "fixture-source", batch_size: 1 }) }));
  assert.equal(response.status, 200);
  assertCors(response);
  assert.equal(calls.auth, 1);
  assert.deepEqual(calls.reads, ["profiles"]);
  assert.equal((await response.json()).claimed, 0);
  assert.deepEqual(calls.rpcs.map(call => call.name), ["get_source_monitor_runtime_capabilities", "enqueue_source_crawl", "schedule_due_source_crawls", "claim_source_crawl_jobs"]);
  assert.equal(calls.rpcs[1].args.p_source_id, "fixture-source");
  assert.equal(calls.rpcs[1].args.p_trigger_source, "admin");
  assert.equal(calls.rpcs[3].args.p_limit, 1);
  assert.equal(calls.rpcs[3].args.p_source_id, "fixture-source");
  assert.equal(calls.writes[0].value.trigger_source, "admin");
});

test("originless cron still verifies its existing secret; a wrong secret cannot schedule", async () => {
  for (const cronValid of [false, true]) {
    const { handler, calls } = fixture({ cronValid });
    const response = await handler(new Request(functionUrl, { method: "POST", headers: {
      Authorization: "Bearer fixture-anon-jwt", "x-cron-secret": "fixture-cron-secret"
    }, body: "{}" }));
    assert.equal(response.status, cronValid ? 200 : 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    assert.deepEqual(JSON.parse(JSON.stringify(calls.rpcs[0])), { name: "verify_event_source_cron_secret", args: { p_secret: "fixture-cron-secret" } });
    if (cronValid) {
      assert.equal(calls.auth, 0);
      assert.equal(calls.writes[0].value.trigger_source, "scheduler");
    } else {
      assert.equal(calls.auth, 1);
      assert.deepEqual(calls.writes, []);
      assert.equal(calls.rpcs.length, 1);
    }
  }
});

test("known worker errors and unexpected authentication exceptions expose readable redacted CORS failures", async () => {
  for (const options of [{ failCapabilities: true }, { failInsert: true }, { failScheduler: true }, { throwOnAuth: true }]) {
    const { handler } = fixture({ role: "admin", ...options });
    const response = await handler(request("POST"));
    assert.equal(response.status, 500);
    assertCors(response);
    const body = await response.json();
    assert.equal(typeof body.error, "string");
    assert.equal(body.error.includes("fixturePrivateToken"), false);
    if (options.throwOnAuth) assert.match(body.error, /REDACTED/);
  }
});

test("request-scoped CORS cannot leak one origin into a concurrent response and retains other Vary values", async () => {
  const handler = withSourceMonitorCors(async () => new Response("fixture", {
    status: 202, headers: { "Vary": "Accept-Encoding", "X-Worker-Test": "retained" }
  }));
  const responses = await Promise.all([origin, "http://127.0.0.1:4187"].map(value => handler(request("POST", { Origin: value }))));
  for (const [index, response] of responses.entries()) {
    assert.equal(response.status, 202);
    assertCors(response, index ? "http://127.0.0.1:4187" : origin);
    assert.equal(response.headers.get("X-Worker-Test"), "retained");
    assert.equal(response.headers.get("Vary"), "Accept-Encoding, Origin");
    assert.equal(await response.text(), "fixture");
  }
});
