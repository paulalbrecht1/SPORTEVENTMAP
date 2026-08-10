const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
};

const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const apiKey = required("SUPABASE_PUBLISHABLE_KEY");
const edgeJwt = required("SUPABASE_EDGE_JWT");
const smokeSecret = required("SOURCE_MONITOR_SMOKE_SECRET");

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
let response;
try {
  response = await fetch(`${supabaseUrl}/functions/v1/event-source-check`, {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${edgeJwt}`,
      apikey: apiKey,
      "Content-Type": "application/json",
      "x-source-monitor-smoke-secret": smokeSecret
    },
    body: JSON.stringify({ action: "smoke" })
  });
} finally {
  clearTimeout(timeout);
}

const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Production smoke returned HTTP ${response.status}: ${payload.error || "unknown error"}`);
const requiredChecks = [
  "database",
  "ssrf_loopback_blocked",
  "dns_pinned",
  "tls_verified",
  "content_hash",
  "semantic_hash",
  "lifecycle_parser",
  "result_link_parser",
  "contact_user_agent"
];
const failedChecks = requiredChecks.filter(name => payload.checks?.[name] !== true);
if (payload.ok !== true || failedChecks.length) {
  throw new Error(`Production smoke failed checks: ${failedChecks.join(", ") || "unknown"}`);
}
console.log(JSON.stringify({
  ok: true,
  worker_version: payload.worker_version,
  checks: payload.checks,
  target: payload.target,
  duration_ms: payload.duration_ms
}, null, 2));
