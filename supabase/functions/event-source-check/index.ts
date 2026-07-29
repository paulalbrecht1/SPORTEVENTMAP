import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const BOT_NAME = "SportEventMapBot";
const USER_AGENT = `${BOT_NAME}/1.0 (+https://sporteventmap.de/bot)`;
const DEFAULT_BATCH_SIZE = 5;

type SourceRow = {
  id: string;
  event_id: number;
  edition_id: string | null;
  source_url: string;
  source_host: string;
  last_content_hash: string | null;
  consecutive_failures: number;
};

type DomainPolicy = {
  respect_robots_txt: boolean;
  request_timeout_ms: number;
  max_response_bytes: number;
  retry_backoff_minutes: number[];
};

const jsonHeaders = { "Content-Type": "application/json" };

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

async function authorize(request: Request, supabaseUrl: string, anonKey: string) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const payload = parseJwtPayload(token);

  // The Edge gateway verifies the JWT before this function runs.
  if (payload?.role === "service_role") return { kind: "service_role", userId: null };

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }
  });

  const cronSecret = request.headers.get("x-cron-secret") || "";
  if (payload?.role === "anon" && cronSecret) {
    const { data: cronAuthorized, error: cronError } = await userClient.rpc(
      "verify_event_source_cron_secret",
      { p_secret: cronSecret }
    );
    if (!cronError && cronAuthorized === true) return { kind: "scheduler", userId: null };
  }

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "admin" ? { kind: "admin", userId: user.id } : null;
}

async function sha256(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function pathMatches(pathname: string, rulePath: string) {
  if (!rulePath) return false;
  const escaped = rulePath
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\$$/, "$");
  return new RegExp(`^${escaped}`).test(pathname);
}

function robotsAllows(content: string, url: URL) {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current = { agents: [] as string[], rules: [] as Array<{ allow: boolean; path: string }> };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line || !line.includes(":")) continue;
    const separator = line.indexOf(":");
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (current.rules.length) {
        groups.push(current);
        current = { agents: [], rules: [] };
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current.agents.length) {
      current.rules.push({ allow: field === "allow", path: value });
    }
  }
  if (current.agents.length || current.rules.length) groups.push(current);

  const applicable = groups.filter(group =>
    group.agents.some(agent => agent === "*" || BOT_NAME.toLowerCase().includes(agent))
  );
  const matches = applicable
    .flatMap(group => group.rules)
    .filter(rule => pathMatches(`${url.pathname}${url.search}`, rule.path))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow));

  return matches.length === 0 || matches[0].allow;
}

async function fetchWithLimit(url: string, policy: DomainPolicy) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), policy.request_timeout_ms);
  try {
    const result = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5"
      }
    });
    const declaredLength = Number(result.headers.get("content-length") || 0);
    if (declaredLength > policy.max_response_bytes) {
      throw new Error(`Response exceeds ${policy.max_response_bytes} bytes`);
    }
    const bytes = new Uint8Array(await result.arrayBuffer());
    if (bytes.byteLength > policy.max_response_bytes) {
      throw new Error(`Response exceeds ${policy.max_response_bytes} bytes`);
    }
    return { result, bytes };
  } finally {
    clearTimeout(timeout);
  }
}

function retryAt(failureCount: number, policy: DomainPolicy, retryAfter = "") {
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return new Date(Date.now() + Math.min(retryAfterSeconds, 604800) * 1000).toISOString();
  }
  const index = Math.min(Math.max(failureCount - 1, 0), policy.retry_backoff_minutes.length - 1);
  return new Date(Date.now() + policy.retry_backoff_minutes[index] * 60_000).toISOString();
}

Deno.serve(async request => {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: "Missing Supabase runtime secrets" }, 500);
  }

  const authorized = await authorize(request, supabaseUrl, anonKey);
  if (!authorized) return response({ error: "Admin or service role required" }, 403);

  const body = await request.json().catch(() => ({}));
  const requestedBatchSize = Number(body.batch_size || DEFAULT_BATCH_SIZE);
  const batchSize = Math.max(1, Math.min(Number.isFinite(requestedBatchSize) ? requestedBatchSize : DEFAULT_BATCH_SIZE, 20));
  const workerId = `edge-${crypto.randomUUID()}`;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: run, error: runError } = await admin
    .from("data_workflow_runs")
    .insert({ job_type: "source_crawl", run_status: "running", trigger_source: authorized.kind })
    .select("id")
    .single();
  if (runError) return response({ error: cleanError(runError) }, 500);

  const { data: claimed, error: claimError } = await admin.rpc("claim_event_sources", {
    p_limit: batchSize,
    p_worker_id: workerId
  });
  if (claimError) {
    await admin.from("data_workflow_runs").update({
      run_status: "failed", finished_at: new Date().toISOString(), error_count: 1,
      error_message: cleanError(claimError)
    }).eq("id", run.id);
    return response({ error: cleanError(claimError) }, 500);
  }

  const results: unknown[] = [];
  let changedCount = 0;
  let errorCount = 0;

  for (const source of (claimed || []) as SourceRow[]) {
    const startedAt = Date.now();
    const { data: policyRow } = await admin
      .from("crawler_domain_policies")
      .select("respect_robots_txt,request_timeout_ms,max_response_bytes,retry_backoff_minutes")
      .eq("source_host", source.source_host)
      .maybeSingle();
    const policy: DomainPolicy = policyRow || {
      respect_robots_txt: true,
      request_timeout_ms: 12000,
      max_response_bytes: 1500000,
      retry_backoff_minutes: [15, 60, 360, 1440, 10080]
    };

    try {
      const sourceUrl = new URL(source.source_url);
      let robotsAllowed = true;
      if (policy.respect_robots_txt) {
        try {
          const robots = await fetchWithLimit(`${sourceUrl.origin}/robots.txt`, {
            ...policy,
            max_response_bytes: Math.min(policy.max_response_bytes, 250000)
          });
          if (robots.result.ok) {
            robotsAllowed = robotsAllows(new TextDecoder().decode(robots.bytes), sourceUrl);
          }
        } catch {
          // An unavailable robots.txt does not imply a prohibition.
        }
      }

      if (!robotsAllowed) {
        await admin.from("event_sources").update({
          crawl_status: "robots_denied", robots_allowed: false,
          robots_checked_at: new Date().toISOString(), last_fetched_at: new Date().toISOString(),
          next_fetch_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
          last_error: "robots.txt disallows this path", claimed_at: null, claimed_by: null,
          last_duration_ms: Date.now() - startedAt
        }).eq("id", source.id);
        results.push({ source_id: source.id, status: "robots_denied" });
        continue;
      }

      const fetched = await fetchWithLimit(source.source_url, policy);
      if (!fetched.result.ok) {
        const failureCount = source.consecutive_failures + 1;
        const crawlStatus = fetched.result.status === 429 ? "rate_limited" : "http_error";
        await admin.from("event_sources").update({
          crawl_status: crawlStatus, last_http_status: fetched.result.status,
          consecutive_failures: failureCount,
          next_fetch_at: retryAt(failureCount, policy, fetched.result.headers.get("retry-after") || ""),
          last_error: `HTTP ${fetched.result.status}`,
          last_fetched_at: new Date().toISOString(), robots_allowed: true,
          robots_checked_at: new Date().toISOString(), claimed_at: null, claimed_by: null,
          last_duration_ms: Date.now() - startedAt
        }).eq("id", source.id);
        errorCount += 1;
        results.push({ source_id: source.id, status: crawlStatus, http_status: fetched.result.status });
        continue;
      }

      const contentHash = await sha256(fetched.bytes);
      const changed = Boolean(source.last_content_hash && source.last_content_hash !== contentHash);
      if (changed) {
        const fingerprint = await sha256(`${source.id}:${contentHash}:source_content_changed`);
        await admin.from("event_change_proposals").upsert({
          event_id: source.event_id,
          edition_id: source.edition_id,
          source_id: source.id,
          entity_type: source.edition_id ? "edition" : "event",
          rule_code: "source_content_changed",
          proposed_changes: {},
          observed_values: {
            previous_content_hash: source.last_content_hash,
            content_hash: contentHash,
            http_status: fetched.result.status,
            content_type: fetched.result.headers.get("content-type")
          },
          proposal_fingerprint: fingerprint,
          confidence: 0.2,
          reason: "Official source content changed; parser review required.",
          source_url: source.source_url,
          content_hash: contentHash
        }, { onConflict: "proposal_fingerprint", ignoreDuplicates: true });
        changedCount += 1;
      }

      await admin.from("event_sources").update({
        crawl_status: changed ? "success" : "not_modified",
        last_http_status: fetched.result.status,
        last_content_hash: contentHash,
        last_changed_at: changed ? new Date().toISOString() : undefined,
        consecutive_failures: 0,
        last_error: null,
        last_fetched_at: new Date().toISOString(),
        next_fetch_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
        robots_allowed: true,
        robots_checked_at: new Date().toISOString(),
        claimed_at: null,
        claimed_by: null,
        last_duration_ms: Date.now() - startedAt
      }).eq("id", source.id);
      results.push({ source_id: source.id, status: changed ? "changed" : "not_modified" });
    } catch (error) {
      const failureCount = source.consecutive_failures + 1;
      await admin.from("event_sources").update({
        crawl_status: "unreachable", consecutive_failures: failureCount,
        next_fetch_at: retryAt(failureCount, policy), last_error: cleanError(error),
        last_fetched_at: new Date().toISOString(), claimed_at: null, claimed_by: null,
        last_duration_ms: Date.now() - startedAt
      }).eq("id", source.id);
      errorCount += 1;
      results.push({ source_id: source.id, status: "unreachable", error: cleanError(error) });
    }
  }

  await admin.from("data_workflow_runs").update({
    run_status: errorCount === 0 ? "succeeded" : errorCount < (claimed || []).length ? "partial" : "failed",
    finished_at: new Date().toISOString(),
    claimed_count: (claimed || []).length,
    processed_count: (claimed || []).length,
    changed_count: changedCount,
    error_count: errorCount,
    metadata: { worker_id: workerId, results }
  }).eq("id", run.id);

  return response({ run_id: run.id, claimed: (claimed || []).length, changed: changedCount, errors: errorCount, results });
});
