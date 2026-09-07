import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanError, countAcceptedResultCandidate, loadSourceMonitorRuntimeCapabilities, runOptionalStageFourCall } from "../supabase/functions/_shared/source-monitor-worker-outcomes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read("supabase/migrations/20260808_source_monitor_queue_worker.sql");
const hardening = read("supabase/migrations/20260809_source_monitor_production_hardening.sql");
const worker = read("supabase/functions/event-source-check/index.ts");
const core = read("supabase/functions/_shared/source-monitor-core.mjs");
const pinned = read("supabase/functions/_shared/pinned-http.mjs");
const admin = read("js/supabase.js");

for (const fragment of [
  "create table if not exists public.source_crawl_jobs",
  "create table if not exists public.source_crawl_results",
  "create table if not exists public.source_review_tasks",
  "source_crawl_jobs_one_active_source_uidx",
  "for update of job skip locked",
  "status in ('queued', 'processing', 'completed', 'failed', 'retry_scheduled', 'dead_letter')",
  "create or replace function public.schedule_due_source_crawls",
  "create or replace function public.claim_source_crawl_jobs",
  "create or replace function public.record_source_crawl_result",
  "private.source_monitor_next_at",
  "source_monitor_housekeeping",
  "enable row level security"
]) assert.ok(migration.includes(fragment), `Migration missing ${fragment}`);

for (const fragment of ["fetchSource", "resolvePublicDns", "record_source_crawl_result", "record_source_crawl_observation", "runProductionSmoke", "pinnedTransport", "SOURCE_MONITOR_USER_AGENT", "SOURCE_MONITOR_ALLOW_HTTP"]) {
  assert.ok(worker.includes(fragment), `Worker missing ${fragment}`);
}
assert.match(worker, /allowedContentTypes:\s*\["text\/plain",\s*"text\/html",\s*"text\/x-robots"\]/);
for (const fragment of ["ssrf_blocked", "redirect: \"manual\"", "maxResponseBytes", "unsupported_content_type", "normalizeRelevantContent", "extractSemanticSignals", "NORMALIZATION_VERSION"]) {
  assert.ok(core.includes(fragment), `Core missing ${fragment}`);
}
assert.doesNotMatch(worker, /\.from\(["']events["']\)\.update/);
for (const fragment of ["Deno.connect", "Deno.startTls", "x-source-monitor-pinned-ip", "Accept-Encoding: identity"]) {
  assert.ok(pinned.includes(fragment), `Pinned transport missing ${fragment}`);
}
for (const fragment of [
  "source_domain_daily_metrics",
  "record_source_crawl_observation",
  "enforce_source_domain_pacing",
  "robots_crawl_delay_seconds",
  "adaptive_interval_seconds",
  "last_semantic_hash",
  "pinned_ip"
]) assert.ok(hardening.includes(fragment), `Hardening migration missing ${fragment}`);
assert.doesNotMatch(worker, /\.from\(["']event_editions["']\)\.update/);
assert.ok(admin.includes("sourceMonitor"), "Admin Source Monitor integration is missing.");

const acceptedResult = { accepted: true, result_id: "5572edeb-fbd1-43c2-b237-9ef62a1f81f5", edition_id: "041b225f-a6a4-4f62-9162-e6d0f5417a3b" };
for (const rejected of [null, undefined, {}, [], { accepted: false, reason: "edition_not_completed" }, { accepted: false, reason: "no_past_edition" }, { accepted: false, result_id: acceptedResult.result_id }, { accepted: true }, { accepted: true, result_id: "" }, { accepted: "true", result_id: acceptedResult.result_id }]) {
  assert.equal(countAcceptedResultCandidate(rejected), 0, "A rejected or empty RPC outcome is not a stored result observation.");
}
assert.equal(countAcceptedResultCandidate(acceptedResult), 1);
// The live RPC's ON CONFLICT UPDATE returns the same accepted result ID. A
// repeat counts one accepted observation in that crawl, not another inserted row.
assert.equal(countAcceptedResultCandidate({ ...acceptedResult }), 1);
assert.match(worker, /resultCount = countAcceptedResultCandidate\(data\)/);

assert.equal(cleanError({ code: "PGRST204", message: "Could not find the 'field_name' column in the schema cache", details: "private response detail", hint: "private hint", headers: { Authorization: "private header" } }), "[PGRST204] Could not find the 'field_name' column in the schema cache");
assert.equal(cleanError({ code: "42883", message: "function public.record_stage_four_crawl_automation(bigint) does not exist" }), "[42883] function public.record_stage_four_crawl_automation(bigint) does not exist");
assert.equal(cleanError(new Error("operation canceled")), "operation canceled");
assert.equal(cleanError("network error"), "network error");
assert.equal(cleanError({ details: "private", request: { secret: "private" } }), "Unknown source monitor error");
assert.equal(cleanError(null), "Unknown source monitor error");
const fakeJwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJyb2xlIjoiZXhhbXBsZSJ9", "exampleSignature"].join(".");
const diagnostic = cleanError({ message: `Bearer ${fakeJwt}; jwt=${fakeJwt}; SOURCE_MONITOR_SMOKE_SECRET=exampleSecret; {"access_token":"exampleAccess"}; url=https://example.com/?api_key=exampleKey`, details: "extraPrivateDetail" });
for (const value of [fakeJwt, "exampleSecret", "exampleAccess", "exampleKey", "extraPrivateDetail"]) assert.equal(diagnostic.includes(value), false, "Credential-shaped data must not leak through diagnostics.");
assert.ok(diagnostic.includes("[REDACTED]"));
assert.equal(cleanError({ code: "PGRST204", message: "x".repeat(3000) }).length, 2000);

const extractionOnly = { schema_version: 1, extraction_review: true, stage_four_simulation: false, stage_four_automation: false, stage_four_shadow: false };
let capabilityReads = 0;
const capabilities = await loadSourceMonitorRuntimeCapabilities(async () => {
  capabilityReads += 1;
  return { data: { ...extractionOnly, auto_publish_enabled: true }, error: null };
});
assert.equal(capabilityReads, 1);
assert.deepEqual(capabilities, extractionOnly, "Schema capabilities never carry or grant publication policy.");
assert.ok(Object.isFrozen(capabilities));
for (const data of [null, {}, { ...extractionOnly, schema_version: 2 }, { ...extractionOnly, extraction_review: false }, { ...extractionOnly, stage_four_shadow: undefined }, { ...extractionOnly, stage_four_simulation: "false" }]) {
  await assert.rejects(() => loadSourceMonitorRuntimeCapabilities(async () => ({ data, error: null })), /capabilit/i, "Missing or malformed required schema must fail before crawling.");
}
for (const error of [{ code: "PGRST202", message: "Capability RPC not found" }, { code: "42501", message: "permission denied" }]) {
  await assert.rejects(() => loadSourceMonitorRuntimeCapabilities(async () => ({ data: null, error })), new RegExp(error.code), "Capability query failures must not become a default skip.");
}
await assert.rejects(() => loadSourceMonitorRuntimeCapabilities(async () => { throw new Error("network unavailable"); }), /network unavailable/);
for (const capability of ["stage_four_simulation", "stage_four_automation", "stage_four_shadow"]) {
  let rpcCalls = 0;
  const invoke = async () => { rpcCalls += 1; return { data: { recorded: 1, dry_run: true }, error: null }; };
  assert.deepEqual(await runOptionalStageFourCall(capabilities, capability, invoke), {
    skipped: "schema_capability_unavailable", capability, dry_run: true, public_event_changes: 0, error: null
  });
  assert.equal(rpcCalls, 0, "An explicitly absent Stage-4 subsystem must not be called.");
  const installed = { ...capabilities, [capability]: true };
  assert.deepEqual(await runOptionalStageFourCall(installed, capability, invoke), { recorded: 1, dry_run: true });
  assert.equal(rpcCalls, 1, "Installed Stage-4 subsystems retain their real RPC invocation.");
  await assert.rejects(() => runOptionalStageFourCall(installed, capability, async () => ({ data: null, error: { code: "PGRST202", message: "RPC missing despite declared capability" } })), /PGRST202/);
  await assert.rejects(() => runOptionalStageFourCall(installed, capability, async () => { throw new Error("network unavailable"); }), /network unavailable/);
}
await assert.rejects(() => runOptionalStageFourCall(capabilities, "extraction_review", async () => ({ data: {}, error: null })), /Invalid optional/);
const capabilityPreflight = worker.indexOf('capabilities = await loadSourceMonitorRuntimeCapabilities');
assert.ok(capabilityPreflight > worker.indexOf('if (!authorized)'));
assert.ok(capabilityPreflight < worker.indexOf('await runProductionSmoke('));
assert.ok(capabilityPreflight < worker.indexOf('admin.from("data_workflow_runs").insert'));
assert.equal((worker.match(/admin\.rpc\("get_source_monitor_runtime_capabilities"\)/g) || []).length, 1, "Capabilities are queried once per request, not once per claimed job.");
assert.equal((worker.match(/recordPhaseAShadowObservation\(admin, transaction\?\.result_id \|\| null, capabilities\)/g) || []).length, 2, "Success and failure observations both receive the capability guard.");
const smokeRunner = read("tools/source-monitor-production-smoke.mjs");
for (const check of ["database", "ssrf_loopback_blocked", "dns_pinned", "tls_verified", "content_hash", "semantic_hash", "lifecycle_parser", "result_link_parser", "contact_user_agent", "capabilities_valid", "extraction_review_ready"]) {
  assert.ok(smokeRunner.includes(`"${check}"`), `Production smoke must require ${check}.`);
}
console.log("Source Monitor queue, worker, safety boundary and admin integration verified.");
