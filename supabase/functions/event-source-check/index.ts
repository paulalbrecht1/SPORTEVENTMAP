import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  SourceFetchError,
  fetchSource,
  robotsAllows
} from "../_shared/source-monitor-core.mjs";

const BOT_NAME = "SportEventMapSourceMonitor";
const WORKER_VERSION = "source-monitor-2.0.0";
const DEFAULT_BATCH_SIZE = 5;
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

async function authorize(request: Request, supabaseUrl: string, anonKey: string) {
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
    allow_http: true
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
    userAgent: Deno.env.get("SOURCE_MONITOR_USER_AGENT") || `${BOT_NAME}/2.0 (+https://sporteventmap.de/bot)`
  };
}

function isRobotsCacheFresh(claim: Record<string, unknown>, policy: Record<string, unknown>) {
  if (!claim.robots_checked_at) return false;
  const checked = Date.parse(String(claim.robots_checked_at));
  const ttl = Number(policy.robots_cache_hours || 24) * 3600_000;
  return Number.isFinite(checked) && Date.now() - checked < ttl;
}

async function checkRobots(admin: ReturnType<typeof createClient>, claim: Record<string, unknown>, policy: Record<string, unknown>, fetchPolicy: Record<string, unknown>, blockedHostnames: string[]) {
  if (!policy.respect_robots_txt) return;
  if (isRobotsCacheFresh(claim, policy)) {
    if (claim.robots_allowed === false) {
      throw new SourceFetchError("robots_denied", "robots.txt verbietet den Abruf dieser Quelle.", { retriable: false });
    }
    return;
  }

  const sourceUrl = new URL(String(claim.source_url));
  let allowed = true;
  try {
    const robots = await fetchSource(`${sourceUrl.origin}/robots.txt`, {
      policy: {
        ...fetchPolicy,
        maxResponseBytes: Math.min(Number(fetchPolicy.maxResponseBytes), 250000),
        allowedContentTypes: ["text/plain", "text/html"],
        accept: "text/plain,*/*;q=0.1"
      },
      blockedHostnames,
      resolveDns: resolvePublicDns
    });
    allowed = robotsAllows(robots.rawText, sourceUrl, BOT_NAME);
  } catch (error) {
    if (!(error instanceof SourceFetchError) || !["http_404", "http_410"].includes(error.code)) {
      // A missing or temporarily unavailable robots.txt is not a prohibition.
      allowed = true;
    }
  }
  await admin.from("event_sources").update({
    robots_checked_at: new Date().toISOString(),
    robots_allowed: allowed
  }).eq("id", claim.source_id);
  if (!allowed) {
    throw new SourceFetchError("robots_denied", "robots.txt verbietet den Abruf dieser Quelle.", { retriable: false });
  }
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

async function processClaim(admin: ReturnType<typeof createClient>, claim: Record<string, unknown>, workerId: string, blockedHostnames: string[]) {
  const startedAt = Date.now();
  const { data: policyRow, error: policyError } = await admin
    .from("crawler_domain_policies")
    .select("respect_robots_txt,request_timeout_ms,max_response_bytes,max_redirects,robots_cache_hours,allowed_content_types,allow_http")
    .eq("source_host", claim.source_host)
    .maybeSingle();
  if (policyError) throw new Error(`Domain policy unavailable: ${cleanError(policyError)}`);
  const policy = { ...defaultPolicy(), ...(policyRow || {}) };
  const fetchPolicy = toFetchPolicy(policy);

  try {
    await checkRobots(admin, claim, policy, fetchPolicy, blockedHostnames);
    const fetched = await fetchSource(String(claim.source_url), {
      policy: fetchPolicy,
      blockedHostnames,
      resolveDns: resolvePublicDns,
      previousHash: claim.previous_content_hash,
      etag: claim.previous_etag,
      lastModified: claim.previous_last_modified
    });
    const changeStatus = fetched.notModified || fetched.contentHash === claim.previous_content_hash
      ? "unchanged"
      : claim.previous_content_hash ? "changed" : "first_seen";
    const transaction = await recordResult(admin, claim, workerId, {
      outcome: "success",
      retriable: false,
      ...fetched,
      changeStatus,
      normalizedExcerpt: changeStatus === "changed" ? fetched.normalized.slice(0, 4000) : null
    });
    return { source_id: claim.source_id, job_id: claim.job_id, status: changeStatus, transaction };
  } catch (error) {
    const failure = error instanceof SourceFetchError
      ? error
      : new SourceFetchError("worker_error", cleanError(error), { retriable: true });
    const metadata = failure.metadata || {};
    const changeStatus = ["unsupported_content_type", "empty_content", "response_too_large"].includes(failure.code)
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
    return { source_id: claim.source_id, job_id: claim.job_id, status: transaction?.status || "failed", error_type: failure.code, transaction };
  }
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
      processClaim(admin, claim, workerId, blockedHostnames)
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
