import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  extractLifecycleSignals,
  evaluateRobots,
  SourceFetchError,
  fetchSource,
  validateSourceUrl
} from "../_shared/source-monitor-core.mjs";
import { createDenoPinnedFetch } from "../_shared/pinned-http.mjs";

const BOT_NAME = "SportEventMapSourceMonitor";
const WORKER_VERSION = "source-monitor-3.1.0";
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_USER_AGENT = "SportEventMapSourceMonitor/3.1 (+mailto:kontakt@sporteventmap.com)";
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function cleanError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
}

function parseJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

function readKeyDictionary(name: string) {
  try { return JSON.parse(Deno.env.get(name) || "{}"); } catch { return {}; }
}

function runtimeKeys() {
  const publishable = readKeyDictionary("SUPABASE_PUBLISHABLE_KEYS");
  const secret = readKeyDictionary("SUPABASE_SECRET_KEYS");
  return {
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || publishable.default || "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || secret.default || ""
  };
}

function configuredUserAgent() {
  const value = (Deno.env.get("SOURCE_MONITOR_USER_AGENT") || DEFAULT_USER_AGENT).trim();
  if (!/^(?=.{10,300}$)[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[0-9A-Za-z._-]+\s+\(\+(?:https:\/\/|mailto:)[^)]+\)$/.test(value)) {
    throw new Error("SOURCE_MONITOR_USER_AGENT must contain product/version and a public HTTPS or mailto contact.");
  }
  return value;
}

function pinnedTransport() {
  try { return createDenoPinnedFetch(); }
  catch (error) {
    if (Deno.env.get("SOURCE_MONITOR_REQUIRE_PINNED_TRANSPORT") === "false") return fetch;
    throw error;
  }
}

async function authorize(request: Request, supabaseUrl: string, anonKey: string) {
  const smokeSecret = Deno.env.get("SOURCE_MONITOR_SMOKE_SECRET") || "";
  if (smokeSecret && request.headers.get("x-source-monitor-smoke-secret") === smokeSecret) {
    return { kind: "smoke", userId: null };
  }
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const payload = parseJwtPayload(token);
  if (payload?.role === "service_role") return { kind: "service_role", userId: null };

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  });
  const cronSecret = request.headers.get("x-cron-secret") || "";
  if (payload?.role === "anon" && cronSecret) {
    const { data, error } = await userClient.rpc("verify_event_source_cron_secret", { p_secret: cronSecret });
    if (!error && data === true) return { kind: "scheduler", userId: null };
  }

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await userClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "admin" ? { kind: "admin", userId: user.id } : null;
}

async function resolvePublicDns(hostname: string) {
  const lookups = await Promise.allSettled([
    Deno.resolveDns(hostname, "A"),
    Deno.resolveDns(hostname, "AAAA")
  ]);
  const addresses = lookups.flatMap(result => result.status === "fulfilled" ? result.value : []);
  if (!addresses.length) {
    const reason = lookups.find(result => result.status === "rejected");
    throw reason?.status === "rejected" ? reason.reason : new Error("DNS returned no addresses");
  }
  return addresses;
}

function internalHostnames(supabaseUrl: string) {
  const values = ["supabase", "supabase-db", "db", "kong", "rest", "auth"];
  try { values.push(new URL(supabaseUrl).hostname); } catch { /* checked during runtime setup */ }
  for (const name of ["SUPABASE_DB_HOST", "DB_HOST", "POSTGRES_HOST"]) {
    const value = Deno.env.get(name);
    if (value) values.push(value);
  }
  return values;
}

function defaultPolicy() {
  return {
    respect_robots_txt: true,
    request_timeout_ms: 12000,
    max_response_bytes: 1500000,
    max_redirects: 5,
    robots_cache_hours: 24,
    allowed_content_types: ["text/html", "application/xhtml+xml", "application/json"],
    allow_http: false
  };
}

function toFetchPolicy(policy: Record<string, unknown>) {
  const allowHttpOverride = Deno.env.get("SOURCE_MONITOR_ALLOW_HTTP");
  return {
    requestTimeoutMs: Number(policy.request_timeout_ms || 12000),
    maxResponseBytes: Number(policy.max_response_bytes || 1500000),
    maxRedirects: Number(policy.max_redirects || 5),
    allowedContentTypes: Array.isArray(policy.allowed_content_types) ? policy.allowed_content_types : defaultPolicy().allowed_content_types,
    allowHttp: allowHttpOverride == null ? policy.allow_http !== false : allowHttpOverride.toLowerCase() === "true",
    userAgent: configuredUserAgent()
  };
}

function isRobotsCacheFresh(claim: Record<string, unknown>, policy: Record<string, unknown>) {
  if (!claim.robots_checked_at) return false;
  const checked = Date.parse(String(claim.robots_checked_at));
  const ttl = Number(policy.robots_cache_hours || 24) * 3600_000;
  return Number.isFinite(checked) && Date.now() - checked < ttl;
}

async function checkRobots(admin: ReturnType<typeof createClient>, claim: Record<string, unknown>, policy: Record<string, unknown>, fetchPolicy: Record<string, unknown>, blockedHostnames: string[], fetchImpl: typeof fetch) {
  if (!policy.respect_robots_txt) return 0;
  if (isRobotsCacheFresh(claim, policy)) {
    if (claim.robots_allowed === false) {
      throw new SourceFetchError("robots_denied", "robots.txt verbietet den Abruf dieser Quelle.", { retriable: false });
    }
    return Number(policy.robots_crawl_delay_seconds || 0);
  }

  const sourceUrl = new URL(String(claim.source_url));
  let allowed = true;
  let crawlDelaySeconds = 0;
  let robotsStatus = "allowed";
  try {
    const robots = await fetchSource(`${sourceUrl.origin}/robots.txt`, {
      policy: {
        ...fetchPolicy,
        maxResponseBytes: Math.min(Number(fetchPolicy.maxResponseBytes), 250000),
        allowedContentTypes: ["text/plain", "text/html"],
        accept: "text/plain,*/*;q=0.1"
      },
      blockedHostnames,
      resolveDns: resolvePublicDns,
      fetchImpl,
      requirePinnedTransport: true
    });
    const decision = evaluateRobots(robots.rawText, sourceUrl, BOT_NAME);
    allowed = decision.allowed;
    crawlDelaySeconds = decision.crawlDelaySeconds;
    robotsStatus = allowed ? "allowed" : "denied";
  } catch (error) {
    if (error instanceof SourceFetchError && ["http_404", "http_410"].includes(error.code)) {
      robotsStatus = "missing";
    } else if (error instanceof SourceFetchError && ["http_401", "http_403"].includes(error.code)) {
      allowed = false;
      robotsStatus = "denied";
    } else {
      throw new SourceFetchError("robots_unavailable", `robots.txt konnte nicht sicher geprueft werden: ${cleanError(error)}`, {
        retriable: true,
        retryAfterSeconds: error instanceof SourceFetchError ? error.retryAfterSeconds : null
      });
    }
  }
  const checkedAt = new Date().toISOString();
  const { error: domainPolicyError } = await admin.from("crawler_domain_policies").update({
    robots_checked_at: checkedAt,
    robots_crawl_delay_seconds: crawlDelaySeconds,
    robots_status: robotsStatus,
    last_user_agent: String(fetchPolicy.userAgent)
  }).eq("source_host", claim.source_host);
  if (domainPolicyError) throw new Error(`Robots domain policy update failed: ${cleanError(domainPolicyError)}`);
  const { error: sourceRobotsError } = await admin.from("event_sources").update({
    robots_checked_at: checkedAt,
    robots_allowed: allowed
  }).eq("id", claim.source_id);
  if (sourceRobotsError) throw new Error(`Robots source update failed: ${cleanError(sourceRobotsError)}`);
  if (!allowed) {
    throw new SourceFetchError("robots_denied", "robots.txt verbietet den Abruf dieser Quelle.", { retriable: false });
  }
  return crawlDelaySeconds;
}

async function recordResult(admin: ReturnType<typeof createClient>, claim: Record<string, unknown>, workerId: string, payload: Record<string, unknown>) {
  const { data, error } = await admin.rpc("record_source_crawl_result", {
    p_job_id: claim.job_id,
    p_worker_id: workerId,
    p_outcome: payload.outcome,
    p_retriable: payload.retriable ?? false,
    p_http_status: payload.httpStatus ?? null,
    p_final_url: payload.finalUrl ?? null,
    p_redirect_count: payload.redirectCount ?? 0,
    p_response_time_ms: payload.responseTimeMs ?? null,
    p_content_type: payload.contentType ?? null,
    p_content_length: payload.contentLength ?? null,
    p_content_hash: payload.contentHash ?? null,
    p_change_status: payload.changeStatus,
    p_etag: payload.etag ?? null,
    p_last_modified: payload.lastModified ?? null,
    p_error_type: payload.errorType ?? null,
    p_error_message: payload.errorMessage ?? null,
    p_retry_after_seconds: payload.retryAfterSeconds ?? null,
    p_worker_version: WORKER_VERSION,
    p_normalized_excerpt: payload.normalizedExcerpt ?? null
  });
  if (error) throw new Error(`Result transaction failed: ${cleanError(error)}`);
  return data;
}

function classifyChange(claim: Record<string, unknown>, fetched: Record<string, unknown>, changeStatus: string) {
  if (changeStatus === "unchanged") return { confidence: "exact", reasons: ["content_hash_equal"] };
  if (changeStatus === "first_seen") return { confidence: "baseline", reasons: ["first_seen"] };
  if (claim.previous_normalization_version && claim.previous_normalization_version !== fetched.normalizationVersion) {
    return { confidence: "medium", reasons: ["normalization_version_changed"] };
  }
  if (claim.previous_semantic_hash && claim.previous_semantic_hash === fetched.semanticHash) {
    return { confidence: "low", reasons: ["content_changed_semantic_signals_equal"] };
  }
  if (claim.previous_semantic_hash && fetched.semanticHash) {
    return { confidence: "high", reasons: ["semantic_event_signals_changed"] };
  }
  return { confidence: "medium", reasons: ["content_hash_changed"] };
}

async function recordObservation(admin: ReturnType<typeof createClient>, claim: Record<string, unknown>, payload: Record<string, unknown>, userAgent: string) {
  const { data, error } = await admin.rpc("record_source_crawl_observation", {
    p_job_id: claim.job_id,
    p_semantic_hash: payload.semanticHash ?? null,
    p_normalization_version: payload.normalizationVersion ?? null,
    p_change_confidence: payload.changeConfidence ?? null,
    p_change_reasons: payload.changeReasons ?? [],
    p_http_status: payload.httpStatus ?? null,
    p_response_time_ms: payload.responseTimeMs ?? null,
    p_content_length: payload.contentLength ?? null,
    p_pinned_ip: payload.pinnedIp ?? null,
    p_error_type: payload.errorType ?? null,
    p_retry_after_seconds: payload.retryAfterSeconds ?? null,
    p_user_agent: userAgent
  });
  if (error) throw new Error(`Observation transaction failed: ${cleanError(error)}`);
  return data;
}


async function recordLifecycleSignals(
  admin: ReturnType<typeof createClient>,
  claim: Record<string, unknown>,
  fetched: Record<string, unknown>,
  crawlResultId: string | null
) {
  if (fetched.notModified || !fetched.rawText) return { editions: 0, results: 0 };
  const signals = extractLifecycleSignals(
    String(fetched.rawText),
    String(fetched.contentType || "text/html"),
    String(fetched.finalUrl || claim.source_url)
  );
  const { data: latestEdition, error: editionError } = await admin
    .from("event_editions")
    .select("id,edition_year,start_date")
    .eq("event_id", claim.event_id)
    .order("edition_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (editionError) throw new Error(`Lifecycle edition context failed: ${cleanError(editionError)}`);

  let editionCount = 0;
  const successor = signals.editions.find(candidate =>
    Number(candidate.year) > Number(latestEdition?.edition_year || 0) &&
    (!latestEdition?.start_date || candidate.start_date > latestEdition.start_date)
  );
  if (successor) {
    const { error } = await admin.rpc("register_edition_successor_candidate", {
      p_source_id: claim.source_id,
      p_crawl_result_id: crawlResultId,
      p_candidate: {
        ...successor,
        final_url: fetched.finalUrl,
        crawl_result_id: crawlResultId,
        evidence: {
          evidence_type: successor.evidence_type || "unknown",
          final_url: fetched.finalUrl,
          crawl_result_id: crawlResultId
        }
      },
      p_worker_version: WORKER_VERSION
    });
    if (error) throw new Error(`Successor candidate registration failed: ${cleanError(error)}`);
    editionCount = 1;
  }

  let resultCount = 0;
  if (claim.edition_id && signals.results.length) {
    const result = signals.results[0];
    const { data, error } = await admin.rpc("register_edition_result_candidate", {
      p_source_id: claim.source_id,
      p_crawl_result_id: crawlResultId,
      p_result_url: result.url,
      p_title: result.title,
      p_confidence: result.confidence
    });
    if (error) throw new Error(`Result candidate registration failed: ${cleanError(error)}`);
    resultCount = data ? 1 : 0;
  }
  return { editions: editionCount, results: resultCount };
}
async function processClaim(admin: ReturnType<typeof createClient>, claim: Record<string, unknown>, workerId: string, blockedHostnames: string[], fetchImpl: typeof fetch) {
  const startedAt = Date.now();
  const { error: domainPolicyEnsureError } = await admin
    .from("crawler_domain_policies")
    .upsert({ source_host: claim.source_host }, { onConflict: "source_host", ignoreDuplicates: true });
  if (domainPolicyEnsureError) throw new Error(`Domain policy ensure failed: ${cleanError(domainPolicyEnsureError)}`);
  const { data: policyRow, error: policyError } = await admin
    .from("crawler_domain_policies")
    .select("respect_robots_txt,request_timeout_ms,max_response_bytes,max_redirects,robots_cache_hours,allowed_content_types,allow_http,robots_crawl_delay_seconds")
    .eq("source_host", claim.source_host)
    .maybeSingle();
  if (policyError) throw new Error(`Domain policy unavailable: ${cleanError(policyError)}`);
  const { data: semanticContext, error: semanticContextError } = await admin
    .from("event_sources")
    .select("last_semantic_hash,last_normalization_version")
    .eq("id", claim.source_id)
    .single();
  if (semanticContextError) throw new Error(`Semantic source context unavailable: ${cleanError(semanticContextError)}`);
  claim.previous_semantic_hash = semanticContext.last_semantic_hash;
  claim.previous_normalization_version = semanticContext.last_normalization_version;
  const policy = { ...defaultPolicy(), ...(policyRow || {}) };
  const fetchPolicy = toFetchPolicy(policy);

  try {
    await checkRobots(admin, claim, policy, fetchPolicy, blockedHostnames, fetchImpl);
    const fetched = await fetchSource(String(claim.source_url), {
      policy: fetchPolicy,
      blockedHostnames,
      resolveDns: resolvePublicDns,
      fetchImpl,
      requirePinnedTransport: true,
      previousHash: claim.previous_content_hash,
      etag: claim.previous_etag,
      lastModified: claim.previous_last_modified
    });
    const changeStatus = fetched.notModified || fetched.contentHash === claim.previous_content_hash
      ? "unchanged"
      : claim.previous_content_hash ? "changed" : "first_seen";
    const classification = classifyChange(claim, fetched, changeStatus);
    const transaction = await recordResult(admin, claim, workerId, {
      outcome: "success",
      retriable: false,
      ...fetched,
      changeStatus,
      normalizedExcerpt: changeStatus === "changed" ? fetched.normalized.slice(0, 4000) : null
    });
    const observation = await recordObservation(admin, claim, {
      ...fetched,
      semanticHash: fetched.semanticHash || claim.previous_semantic_hash || null,
      normalizationVersion: fetched.normalizationVersion || claim.previous_normalization_version || null,
      changeConfidence: classification.confidence,
      changeReasons: classification.reasons
    }, String(fetchPolicy.userAgent));
    let lifecycle = { editions: 0, results: 0, error: null as string | null };
    try {
      lifecycle = { ...lifecycle, ...await recordLifecycleSignals(admin, claim, fetched, transaction?.result_id || null) };
    } catch (error) {
      lifecycle.error = cleanError(error);
    }
    return { source_id: claim.source_id, job_id: claim.job_id, status: changeStatus, confidence: classification.confidence, transaction, observation, lifecycle };
  } catch (error) {
    const failure = error instanceof SourceFetchError
      ? error
      : new SourceFetchError("worker_error", cleanError(error), { retriable: true });
    const metadata = failure.metadata || {};
    const changeStatus = ["unsupported_content_type", "unsupported_content_encoding", "empty_content", "response_too_large"].includes(failure.code)
      ? "content_invalid" : "unreachable";
    const transaction = await recordResult(admin, claim, workerId, {
      outcome: "error",
      retriable: failure.retriable,
      httpStatus: failure.httpStatus ?? metadata.httpStatus ?? null,
      finalUrl: metadata.finalUrl ?? null,
      redirectCount: metadata.redirectCount ?? 0,
      responseTimeMs: metadata.responseTimeMs ?? Date.now() - startedAt,
      contentType: metadata.contentType ?? null,
      contentLength: metadata.contentLength ?? null,
      changeStatus,
      errorType: failure.code,
      errorMessage: failure.message,
      retryAfterSeconds: failure.retryAfterSeconds,
      normalizedExcerpt: failure.message
    });
    const observation = await recordObservation(admin, claim, {
      httpStatus: failure.httpStatus ?? metadata.httpStatus ?? null,
      responseTimeMs: metadata.responseTimeMs ?? Date.now() - startedAt,
      contentLength: metadata.contentLength ?? null,
      pinnedIp: metadata.pinnedIp ?? null,
      errorType: failure.code,
      retryAfterSeconds: failure.retryAfterSeconds,
      changeConfidence: "technical",
      changeReasons: [failure.code]
    }, String(fetchPolicy.userAgent));
    return { source_id: claim.source_id, job_id: claim.job_id, status: transaction?.status || "failed", error_type: failure.code, transaction, observation };
  }
}

async function runProductionSmoke(admin: ReturnType<typeof createClient>, supabaseUrl: string, fetchImpl: typeof fetch) {
  const startedAt = Date.now();
  const { data: settings, error: settingsError } = await admin
    .from("source_monitor_settings")
    .select("singleton,worker_batch_size,global_max_processing")
    .eq("singleton", true)
    .single();
  if (settingsError) throw new Error(`Source Monitor schema probe failed: ${cleanError(settingsError)}`);

  let ssrfBlocked = false;
  try {
    await validateSourceUrl("http://127.0.0.1/latest/meta-data", {
      allowHttp: true,
      blockedHostnames: internalHostnames(supabaseUrl),
      resolveDns: resolvePublicDns
    });
  } catch (error) {
    ssrfBlocked = error instanceof SourceFetchError && error.code === "ssrf_blocked";
  }
  if (!ssrfBlocked) throw new Error("SSRF self-test did not block loopback.");

  const fetched = await fetchSource("https://example.com/", {
    policy: {
      requestTimeoutMs: 10000,
      maxResponseBytes: 250000,
      maxRedirects: 2,
      allowedContentTypes: ["text/html"],
      allowHttp: false,
      userAgent: configuredUserAgent()
    },
    blockedHostnames: internalHostnames(supabaseUrl),
    resolveDns: resolvePublicDns,
    fetchImpl,
    requirePinnedTransport: true
  });
  if (!fetched.contentHash || !fetched.semanticHash) throw new Error("Smoke fetch did not produce both hashes.");
  const lifecycleSignals = extractLifecycleSignals(`
    <script type="application/ld+json">{"@type":"SportsEvent","name":"Smoke 2027","startDate":"2027-09-12"}</script>
    <a href="/results/2026">Official results</a>
  `, "text/html", "https://example.com/event");
  if (lifecycleSignals.editions[0]?.start_date !== "2027-09-12" || !lifecycleSignals.results[0]?.url) {
    throw new Error("Lifecycle parser self-test failed.");
  }
  return {
    ok: true,
    worker_version: WORKER_VERSION,
    checks: {
      database: Boolean(settings?.singleton),
      ssrf_loopback_blocked: ssrfBlocked,
      dns_pinned: Boolean(fetched.pinnedIp),
      tls_verified: fetched.finalUrl?.startsWith("https://"),
      content_hash: true,
      semantic_hash: true,
      lifecycle_parser: true,
      result_link_parser: true,
      contact_user_agent: configuredUserAgent().includes("kontakt@sporteventmap.com")
    },
    target: {
      http_status: fetched.httpStatus,
      final_url: fetched.finalUrl,
      pinned_ip: fetched.pinnedIp,
      response_time_ms: fetched.responseTimeMs,
      content_length: fetched.contentLength,
      normalization_version: fetched.normalizationVersion
    },
    duration_ms: Date.now() - startedAt
  };
}

Deno.serve(async request => {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const { anonKey, serviceKey } = runtimeKeys();
  if (!supabaseUrl || !anonKey || !serviceKey) return response({ error: "Missing Supabase runtime secrets" }, 500);

  const authorized = await authorize(request, supabaseUrl, anonKey);
  if (!authorized) return response({ error: "Admin or scheduler authorization required" }, 403);
  const body = await request.json().catch(() => ({}));
  const requestedBatch = Number(body.batch_size || DEFAULT_BATCH_SIZE);
  const batchSize = Math.max(1, Math.min(Number.isFinite(requestedBatch) ? requestedBatch : DEFAULT_BATCH_SIZE, 20));
  const sourceId = typeof body.source_id === "string" && body.source_id ? body.source_id : null;
  const workerId = `edge-${crypto.randomUUID()}`;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let fetchImpl: typeof fetch;
  try {
    fetchImpl = pinnedTransport();
  } catch (error) {
    return response({ error: cleanError(error), worker_version: WORKER_VERSION }, 500);
  }

  if (body.action === "smoke") {
    if (!["smoke", "service_role", "admin"].includes(authorized.kind)) {
      return response({ error: "Dedicated smoke, service-role or admin authorization required" }, 403);
    }
    try { return response(await runProductionSmoke(admin, supabaseUrl, fetchImpl)); }
    catch (error) { return response({ ok: false, worker_version: WORKER_VERSION, error: cleanError(error) }, 500); }
  }

  const { data: run, error: runError } = await admin.from("data_workflow_runs").insert({
    job_type: "source_crawl", run_status: "running", trigger_source: authorized.kind,
    metadata: { worker_id: workerId, worker_version: WORKER_VERSION, requested_source_id: sourceId }
  }).select("id").single();
  if (runError) return response({ error: cleanError(runError) }, 500);

  try {
    if (sourceId) {
      const { error } = await admin.rpc("enqueue_source_crawl", {
        p_source_id: sourceId, p_priority: 1, p_scheduled_at: new Date().toISOString(),
        p_trigger_source: authorized.kind === "admin" ? "admin" : "scheduler"
      });
      if (error) throw new Error(cleanError(error));
    }
    const { data: scheduled, error: scheduleError } = await admin.rpc("schedule_due_source_crawls", { p_limit: body.schedule_limit || null });
    if (scheduleError) throw new Error(`Scheduler failed: ${cleanError(scheduleError)}`);

    const { data: claimed, error: claimError } = await admin.rpc("claim_source_crawl_jobs", {
      p_limit: batchSize, p_worker_id: workerId, p_source_id: sourceId
    });
    if (claimError) throw new Error(`Queue claim failed: ${cleanError(claimError)}`);

    const blockedHostnames = internalHostnames(supabaseUrl);
    const results = await Promise.all((claimed || []).map((claim: Record<string, unknown>) =>
      processClaim(admin, claim, workerId, blockedHostnames, fetchImpl)
    ));
    const changed = results.filter(result => result.status === "changed").length;
    const errors = results.filter(result => result.error_type).length;
    await admin.from("data_workflow_runs").update({
      run_status: errors === 0 ? "succeeded" : errors < results.length ? "partial" : "failed",
      finished_at: new Date().toISOString(), claimed_count: (claimed || []).length,
      processed_count: results.length, changed_count: changed, error_count: errors,
      metadata: { worker_id: workerId, worker_version: WORKER_VERSION, scheduled, results }
    }).eq("id", run.id);
    return response({ run_id: run.id, scheduled, claimed: (claimed || []).length, changed, errors, results });
  } catch (error) {
    await admin.from("data_workflow_runs").update({
      run_status: "failed", finished_at: new Date().toISOString(), error_count: 1,
      error_message: cleanError(error)
    }).eq("id", run.id);
    return response({ run_id: run.id, error: cleanError(error) }, 500);
  }
});
