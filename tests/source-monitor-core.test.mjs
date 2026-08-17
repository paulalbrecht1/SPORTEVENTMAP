import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifySourceFailure,
  evaluateRobots,
  extractSemanticSignals,
  extractLifecycleSignals,
  NORMALIZATION_VERSION,
  SourceFetchError,
  fetchSource,
  isBlockedIp,
  normalizeRelevantContent,
  resolveHttpAllowance,
  robotsAllows,
  sha256Hex,
  validateSourceUrl
} from "../supabase/functions/_shared/source-monitor-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = name => fs.readFileSync(path.join(root, "tests/fixtures/source-monitor", name), "utf8");
const publicDns = async hostname => hostname === "dns-error.test" ? Promise.reject(new Error("ENOTFOUND")) : ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];
const response = (body, init = {}) => new Response(body, init);
const queueFetch = entries => async () => {
  const next = entries.shift();
  if (next instanceof Error) throw next;
  return next;
};

assert.equal(isBlockedIp("127.0.0.1"), true);
assert.equal(isBlockedIp("10.0.0.2"), true);
assert.equal(isBlockedIp("169.254.169.254"), true);
assert.equal(isBlockedIp("::1"), true);
assert.equal(isBlockedIp("fc00::1"), true);
assert.equal(isBlockedIp("fe80::1"), true);
assert.equal(isBlockedIp("fec0::1"), true);
assert.equal(isBlockedIp("93.184.216.34"), false);
assert.equal(resolveHttpAllowance(true, "false"), true, "An explicit domain policy must allow HTTP even when the global opt-in is false.");
assert.equal(resolveHttpAllowance(false, "true"), true, "The global opt-in may allow HTTP for a domain without an override.");
assert.equal(resolveHttpAllowance(false, "false"), false);

assert.deepEqual(classifySourceFailure("timeout"), {
  category: "timeout_or_connection",
  temporality: "temporary",
  defaultRetriable: true,
  requiresReview: false
});
assert.deepEqual(classifySourceFailure("http_410"), {
  category: "page_removed_or_changed",
  temporality: "possibly_permanent",
  defaultRetriable: false,
  requiresReview: true
});
assert.equal(classifySourceFailure("http_429").category, "rate_limit");
assert.equal(classifySourceFailure("http_404").defaultRetriable, false);
assert.equal(classifySourceFailure("http_403").defaultRetriable, false);
assert.equal(classifySourceFailure("http_402").category, "http_other");
assert.equal(classifySourceFailure("http_402").requiresReview, true);
assert.equal(classifySourceFailure("http_503").defaultRetriable, true);
assert.equal(classifySourceFailure("robots_denied").requiresReview, true);
assert.equal(classifySourceFailure("response_too_large").defaultRetriable, false);

for (const unsafe of ["file:///etc/passwd", "http://user:pass@example.com", "http://localhost/a", "https://127.0.0.1/a", "https://[::1]/a", "https://example.com:8443/a"]) {
  await assert.rejects(() => validateSourceUrl(unsafe, { allowHttp: true, resolveDns: publicDns }), SourceFetchError);
}
await assert.rejects(() => validateSourceUrl("https://dns-error.test", { resolveDns: publicDns }), error => error.code === "dns_error");
await assert.rejects(() => validateSourceUrl("https://safe.test", { resolveDns: async () => ["192.168.1.10"] }), error => error.code === "ssrf_blocked");

const normalizedV1 = normalizeRelevantContent(fixture("event-v1.html"));
const normalizedDynamic = normalizeRelevantContent(fixture("event-v1-dynamic.html"));

const lifecycleSignals = extractLifecycleSignals(`
  <script type="application/ld+json">{
    "@context":"https://schema.org","@type":"SportsEvent","name":"Testlauf 2027",
    "startDate":"2027-09-12","endDate":"2027-09-12",
    "offers":{"url":"/anmeldung-2027"}
  }</script>
  <a href="/ergebnisse/2026.pdf">Ergebnisse 2026</a>
`, "text/html", "https://example.com/event");
assert.deepEqual(lifecycleSignals.editions[0], {
  start_date: "2027-09-12",
  end_date: "2027-09-12",
  name: "Testlauf 2027",
  registration_url: "https://example.com/anmeldung-2027",
  confidence: 0.97,
  evidence_type: "json_ld",
  year: 2027
});
assert.equal(lifecycleSignals.results[0].url, "https://example.com/ergebnisse/2026.pdf");
assert.equal(lifecycleSignals.results[0].result_type, "official_results");
assert.deepEqual(extractLifecycleSignals("Termin: 31.02.2027").editions, [], "Impossible dates must be ignored.");
const normalizedV2 = normalizeRelevantContent(fixture("event-v2.html"));
assert.equal(normalizedV1, normalizedDynamic, "Dynamic navigation, cookie, scripts and timestamps must not alter the relevant content.");
assert.notEqual(normalizedV1, normalizedV2);
assert.equal(await sha256Hex(normalizedV1), await sha256Hex(normalizedDynamic));
assert.notEqual(await sha256Hex(normalizedV1), await sha256Hex(normalizedV2));
assert.equal(extractSemanticSignals(fixture("event-v1.html")), extractSemanticSignals(fixture("event-v1-dynamic.html")));
assert.notEqual(extractSemanticSignals(fixture("event-v1.html")), extractSemanticSignals(fixture("event-v2.html")));
assert.equal(NORMALIZATION_VERSION, "sem-v2");

const redirectFetch = queueFetch([
  response(null, { status: 302, headers: { location: "https://example.org/final" } }),
  response(fixture("event-v1.html"), { status: 200, headers: { "content-type": "text/html", etag: "v1" } })
]);
const redirected = await fetchSource("https://example.com/start", { fetchImpl: redirectFetch, resolveDns: publicDns, policy: { maxRedirects: 3 } });
assert.equal(redirected.redirectCount, 1);
assert.equal(redirected.finalUrl, "https://example.org/final");
assert.equal(redirected.etag, "v1");

let unsafeFetchCount = 0;
await assert.rejects(() => fetchSource("https://example.com", {
  resolveDns: publicDns,
  fetchImpl: async () => {
    unsafeFetchCount += 1;
    return response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
  }
}), error => error.code === "ssrf_blocked");
assert.equal(unsafeFetchCount, 1, "Unsafe redirect target must be rejected before it is fetched.");

await assert.rejects(() => fetchSource("https://example.com/missing", {
  resolveDns: publicDns, fetchImpl: async () => response("missing", { status: 404 })
}), error => error.code === "http_404" && error.retriable === false);
await assert.rejects(() => fetchSource("https://example.com/blocked", {
  resolveDns: publicDns, fetchImpl: async () => response("blocked", { status: 403 })
}), error => error.code === "http_403" && error.retriable === false && error.classification.requiresReview);
await assert.rejects(() => fetchSource("https://example.com/rate", {
  resolveDns: publicDns, fetchImpl: async () => response("later", { status: 429, headers: { "retry-after": "120" } })
}), error => error.code === "http_429" && error.retriable === true && error.retryAfterSeconds === 120);
await assert.rejects(() => fetchSource("https://example.com/image", {
  resolveDns: publicDns, fetchImpl: async () => response("png", { status: 200, headers: { "content-type": "image/png" } })
}), error => error.code === "unsupported_content_type" && error.retriable === false);
await assert.rejects(() => fetchSource("https://example.com/large", {
  resolveDns: publicDns, policy: { maxResponseBytes: 100 },
  fetchImpl: async () => response("x", { status: 200, headers: { "content-type": "text/html", "content-length": "101" } })
}), error => error.code === "response_too_large");
await assert.rejects(() => fetchSource("https://example.com/timeout", {
  resolveDns: publicDns, policy: { requestTimeoutMs: 5 },
  fetchImpl: async (_url, options) => await new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
}), error => error.code === "timeout");

await assert.rejects(() => fetchSource("https://example.com/empty", {
  resolveDns: publicDns,
  policy: { allowedContentTypes: ["text/plain"] },
  fetchImpl: async () => response("", { status: 200, headers: { "content-type": "text/plain" } })
}), error => error.code === "empty_content");
const emptyRobots = await fetchSource("https://example.com/robots.txt", {
  resolveDns: publicDns,
  policy: { allowedContentTypes: ["text/plain"], allowEmptyContent: true },
  fetchImpl: async () => response("", { status: 200, headers: { "content-type": "text/plain" } })
});
assert.equal(emptyRobots.rawText, "");
assert.equal(emptyRobots.normalized, "");

const notModified = await fetchSource("https://example.com/cached", {
  resolveDns: publicDns, previousHash: "abc123",
  fetchImpl: async (_url, options) => {
    assert.equal(options.headers["If-None-Match"], "v1");
    return response(null, { status: 304 });
  }, etag: "v1"
});
assert.equal(notModified.notModified, true);
assert.equal(notModified.contentHash, "abc123");

assert.equal(robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/event", new URL("https://example.com/private/event")), true);
assert.equal(robotsAllows("User-agent: *\nDisallow: /private", new URL("https://example.com/private/event")), false);
assert.equal(robotsAllows("User-agent: *\nDisallow: /*.pdf$", new URL("https://example.com/info.pdf")), false);
assert.equal(robotsAllows("User-agent: *\nDisallow: /*.pdf$", new URL("https://example.com/info.pdf?download=1")), true);
const robotsDecision = evaluateRobots(
  "User-agent: *\nCrawl-delay: 2\nDisallow: /private\nUser-agent: SportEventMapSourceMonitor\nCrawl-delay: 7.5\nAllow: /private/event",
  new URL("https://example.com/private/event")
);
assert.deepEqual(robotsDecision, { allowed: true, crawlDelaySeconds: 7.5, matchedAgent: "SportEventMapSourceMonitor" });
await assert.rejects(() => fetchSource("https://example.com/pinned", {
  resolveDns: publicDns,
  requirePinnedTransport: true
}), error => error.code === "pinned_transport_required");

console.log("Source Monitor core: SSRF, redirects, limits, dual hashes, crawl-delay and pinned transport requirement verified.");
