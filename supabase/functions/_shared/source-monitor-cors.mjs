import { cleanError } from "./source-monitor-worker-outcomes.mjs";

// These are this application's production, immutable release and local review
// origins, not a browser authorization rule. The worker still verifies every
// POST through its existing Admin/Cron/service-role authorization path.
const allowedOrigins = new Set([
  "https://sporteventmap.com",
  "https://sporteventmap.pages.dev",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:4174",
  "http://localhost:4174",
  "http://127.0.0.1:4187"
]);
// Matches the exact immutable deployment format used by tools/ui-release.js.
const immutableReleaseOrigin = /^https:\/\/[a-f0-9]{8}\.sporteventmap\.pages\.dev$/;
// The pinned supabase-js 2.57.4 caller uses these four browser request headers.
// Cron and smoke secrets are intentionally not part of this browser contract.
const allowedHeaders = ["authorization", "x-client-info", "apikey", "content-type"];

function corsHeaders(origin) {
  const headers = new Headers({ Vary: "Origin" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));
  }
  return headers;
}

function jsonError(message, status, headers) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...Object.fromEntries(headers), "Content-Type": "application/json; charset=utf-8" }
  });
}

export function withSourceMonitorCors(handler) {
  return async request => {
    const origin = request.headers.get("Origin");
    if (origin !== null && !allowedOrigins.has(origin) && !immutableReleaseOrigin.test(origin)) {
      return jsonError("Browser origin is not allowed", 403, corsHeaders(null));
    }
    const headers = corsHeaders(origin);
    // OPTIONS never reads runtime keys, authenticates, creates clients, reads a
    // database or schedules work. Ordinary originless Cron POSTs continue below.
    if (request.method === "OPTIONS") {
      const method = request.headers.get("Access-Control-Request-Method");
      if (method && method !== "POST") {
        return jsonError("Only POST may be requested", 405, headers);
      }
      const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") || "")
        .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
      if (requestedHeaders.some(header => !allowedHeaders.includes(header))) {
        return jsonError("Requested browser headers are not allowed", 403, headers);
      }
      return new Response(null, { status: 204, headers });
    }
    try {
      const result = await handler(request);
      const responseHeaders = new Headers(result.headers);
      const vary = new Set((responseHeaders.get("Vary") || "").split(",").map(value => value.trim()).filter(Boolean));
      vary.add("Origin");
      for (const [name, value] of headers) responseHeaders.set(name, value);
      responseHeaders.set("Vary", [...vary].join(", "));
      return new Response(result.body, { status: result.status, statusText: result.statusText, headers: responseHeaders });
    } catch (error) {
      // Include CORS even for an unexpected auth/client exception while keeping
      // the existing worker's credential-redacting diagnostic convention.
      return jsonError(cleanError(error), 500, headers);
    }
  };
}
