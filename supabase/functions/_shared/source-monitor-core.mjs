export const DEFAULT_ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "application/json"
];

export const NORMALIZATION_VERSION = "sem-v2";

export class SourceFetchError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "SourceFetchError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? null;
    this.retriable = options.retriable ?? true;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.metadata = options.metadata || {};
  }
}

function ipv4Parts(value) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  return numbers.every(part => part >= 0 && part <= 255) ? numbers : null;
}

function expandIpv6(value) {
  let address = value.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const ipv4Match = address.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Match) {
    const parts = ipv4Parts(ipv4Match[1]);
    if (!parts) return null;
    address = address.slice(0, -ipv4Match[1].length) +
      `${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  if (!/^[0-9a-f:]+$/.test(address) || (address.match(/::/g) || []).length > 1) return null;
  const [leftRaw, rightRaw = ""] = address.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if ([...left, ...right].some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if ((address.includes("::") && missing < 1) || (!address.includes("::") && missing !== 0)) return null;
  return [...left, ...Array(Math.max(0, missing)).fill("0"), ...right].map(part => parseInt(part, 16));
}

export function isBlockedIp(value) {
  const address = String(value || "").trim().replace(/^\[|\]$/g, "");
  const v4 = ipv4Parts(address);
  if (v4) {
    const [a, b, c] = v4;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113);
  }
  const v6 = expandIpv6(address);
  if (!v6) return false;
  const allZero = v6.every(part => part === 0);
  const loopback = v6.slice(0, 7).every(part => part === 0) && v6[7] === 1;
  const uniqueLocal = (v6[0] & 0xfe00) === 0xfc00;
  const linkLocal = (v6[0] & 0xffc0) === 0xfe80;
  const siteLocal = (v6[0] & 0xffc0) === 0xfec0;
  const documentation = v6[0] === 0x2001 && v6[1] === 0x0db8;
  const mappedV4 = v6.slice(0, 5).every(part => part === 0) && v6[5] === 0xffff;
  if (mappedV4) {
    return isBlockedIp(`${v6[6] >> 8}.${v6[6] & 255}.${v6[7] >> 8}.${v6[7] & 255}`);
  }
  return allZero || loopback || uniqueLocal || linkLocal || siteLocal || documentation || (v6[0] & 0xff00) === 0xff00;
}

export function isBlockedHostname(hostname, blockedHostnames = []) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  if (["localhost", "localhost.localdomain", "metadata", "metadata.google.internal", "host.docker.internal", "gateway.docker.internal"].includes(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home")) return true;
  return blockedHostnames.some(blocked => {
    const normalized = String(blocked || "").toLowerCase().replace(/\.$/, "");
    return normalized && (host === normalized || host.endsWith(`.${normalized}`));
  });
}

export async function resolveSourceTarget(rawUrl, options = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceFetchError("invalid_url", "Die Quell-URL ist ungueltig.", { retriable: false });
  }
  const allowedProtocols = options.allowHttp ? ["https:", "http:"] : ["https:"];
  if (!allowedProtocols.includes(url.protocol)) {
    throw new SourceFetchError("unsupported_protocol", `Protokoll ${url.protocol} ist nicht erlaubt.`, { retriable: false });
  }
  if (url.username || url.password) {
    throw new SourceFetchError("embedded_credentials", "URLs mit eingebetteten Zugangsdaten sind nicht erlaubt.", { retriable: false });
  }
  if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) {
    throw new SourceFetchError("unsupported_port", `Port ${url.port} ist nicht erlaubt.`, { retriable: false });
  }
  if (isBlockedHostname(url.hostname, options.blockedHostnames || []) || isBlockedIp(url.hostname)) {
    throw new SourceFetchError("ssrf_blocked", "Die Zieladresse liegt in einem gesperrten Netzwerkbereich.", { retriable: false });
  }
  if (!options.resolveDns || ipv4Parts(url.hostname) || expandIpv6(url.hostname)) {
    return { url, addresses: [url.hostname.replace(/^\\[|\\]$/g, "")] };
  }

  let addresses = [];
  try {
    addresses = await options.resolveDns(url.hostname);
  } catch (error) {
    throw new SourceFetchError("dns_error", `DNS-Aufloesung fehlgeschlagen: ${error instanceof Error ? error.message : error}`);
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new SourceFetchError("dns_error", "DNS-Aufloesung lieferte keine Adresse.");
  }
  if (addresses.some(isBlockedIp)) {
    throw new SourceFetchError("ssrf_blocked", "DNS verweist auf einen gesperrten Netzwerkbereich.", { retriable: false });
  }
  return { url, addresses: [...new Set(addresses.map(String))] };
}

export async function validateSourceUrl(rawUrl, options = {}) {
  return (await resolveSourceTarget(rawUrl, options)).url;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]));
  }
  return value;
}

export function normalizeRelevantContent(content, contentType = "text/html") {
  let value = String(content || "").normalize("NFKC");
  if (contentType.includes("json")) {
    try { return JSON.stringify(stableJson(JSON.parse(value))); } catch { return value.replace(/\s+/g, " ").trim(); }
  }
  value = value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<([a-z0-9]+)\b[^>]*(?:id|class)=["'][^"']*(?:cookie|consent|tracking|newsletter-popup|random-id)[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/([?&])(utm_[a-z]+|fbclid|gclid|mc_[a-z]+)=[^&#"'\s<]*/gi, "$1")
    .replace(/\b(?:generated|updated|rendered)\s*(?:at|on)?\s*[:=-]?\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[\d:.+-]+/gi, " ")
    .replace(/\b\d{13}\b/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return value;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function extractSemanticSignals(content, contentType = "text/html") {
  const raw = String(content || "").normalize("NFKC");
  if (contentType.includes("json")) {
    try {
      return JSON.stringify({ version: NORMALIZATION_VERSION, structured: stableJson(JSON.parse(raw)) });
    } catch {
      return JSON.stringify({ version: NORMALIZATION_VERSION, text: raw.replace(/\s+/g, " ").trim() });
    }
  }

  const structured = [];
  for (const match of raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const entries = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
      for (const entry of entries) {
        const type = String(entry?.["@type"] || "").toLowerCase();
        if (!/(event|sport)/.test(type)) continue;
        structured.push(stableJson({
          type: entry["@type"], name: entry.name, startDate: entry.startDate,
          endDate: entry.endDate, location: entry.location, offers: entry.offers,
          eventStatus: entry.eventStatus, url: entry.url
        }));
      }
    } catch { /* malformed JSON-LD is ignored; visible text remains covered */ }
  }

  const visible = decodeEntities(raw
    .replace(/\b(?:generated|updated|rendered)\s*(?:at|on)?\s*[:=-]?\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[\d:.+-]+/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<([a-z0-9]+)\b[^>]*(?:id|class)=["'][^"']*(?:cookie|consent|tracking|newsletter-popup)[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  const patterns = [
    /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])(?:[t\s]\d{1,2}:\d{2})?\b/gi,
    /\b(?:0?[1-9]|[12]\d|3[01])[.\/-](?:0?[1-9]|1[0-2])[.\/-](?:19|20)?\d{2}\b/g,
    /\b\d+(?:[.,]\d+)?\s*(?:km|kilometer|meilen|miles?|meter|m)\b/gi,
    /\b(?:anmeldung|registration|register|startzeit|start time|startgeld|entry fee|ort|location|strecke|course|distanz|distance|abgesagt|cancelled|verschoben|postponed|ausverkauft|sold out)\b.{0,120}/gi,
    /\b\d+(?:[.,]\d{2})?\s*(?:eur|euro|\u{20ac})\b/giu
  ];
  const signals = patterns.flatMap(pattern => [...visible.matchAll(pattern)].map(match => match[0].toLowerCase().trim()));
  return JSON.stringify({
    version: NORMALIZATION_VERSION,
    structured: structured.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    signals: [...new Set(signals)].sort()
  });
}

export async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 604800);
  const date = Date.parse(value);
  return Number.isFinite(date) && date > now ? Math.min(Math.ceil((date - now) / 1000), 604800) : null;
}

async function readLimitedBody(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    throw new SourceFetchError("response_too_large", `Antwort ueberschreitet ${maxBytes} Bytes.`, { retriable: false });
  }
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new SourceFetchError("response_too_large", `Antwort ueberschreitet ${maxBytes} Bytes.`, { retriable: false });
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SourceFetchError("response_too_large", `Antwort ueberschreitet ${maxBytes} Bytes.`, { retriable: false });
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function mapNetworkError(error) {
  if (error instanceof SourceFetchError) return error;
  if (error?.name === "AbortError") return new SourceFetchError("timeout", "Zeitlimit beim Abruf ueberschritten.");
  const message = error instanceof Error ? error.message : String(error);
  if (/certificate|tls|ssl|handshake/i.test(message)) return new SourceFetchError("tls_error", message);
  if (/dns|resolve|name not known|enotfound/i.test(message)) return new SourceFetchError("dns_error", message);
  return new SourceFetchError("network_error", message || "Netzwerkfehler beim Abruf.");
}

export async function fetchSource(rawUrl, options = {}) {
  const policy = {
    requestTimeoutMs: 12000,
    maxResponseBytes: 1500000,
    maxRedirects: 5,
    allowedContentTypes: DEFAULT_ALLOWED_CONTENT_TYPES,
    allowHttp: true,
    userAgent: "SportEventMapSourceMonitor/2.0",
    ...options.policy
  };
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), policy.requestTimeoutMs);
  let current = rawUrl;
  let redirects = 0;
  try {
    while (true) {
      const target = await resolveSourceTarget(current, {
        allowHttp: policy.allowHttp,
        blockedHostnames: options.blockedHostnames,
        resolveDns: options.resolveDns
      });
      const url = target.url;
      const headers = {
        "User-Agent": policy.userAgent,
        "Accept": policy.accept || "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1"
      };
      if (redirects === 0 && options.etag) headers["If-None-Match"] = options.etag;
      if (redirects === 0 && options.lastModified) headers["If-Modified-Since"] = options.lastModified;
      let response;
      try {
        if (options.requirePinnedTransport && !options.fetchImpl) {
          throw new SourceFetchError("pinned_transport_required", "Ein IP-gepinnter Transport ist fuer diesen Abruf erforderlich.", { retriable: false });
        }
        response = await (options.fetchImpl || fetch)(url, {
          redirect: "manual", signal: controller.signal, headers
        }, { ...target, maxResponseBytes: policy.maxResponseBytes });
      } catch (error) { throw mapNetworkError(error); }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new SourceFetchError("invalid_redirect", "Redirect ohne Location-Header.", { retriable: false });
        if (redirects >= policy.maxRedirects) throw new SourceFetchError("too_many_redirects", "Maximale Redirect-Anzahl ueberschritten.", { retriable: false });
        current = new URL(location, url).toString();
        redirects += 1;
        continue;
      }

      const metadata = {
        httpStatus: response.status,
        finalUrl: url.toString(),
        redirectCount: redirects,
        responseTimeMs: Date.now() - startedAt,
        contentType: response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || null,
        contentLength: Number(response.headers.get("content-length") || 0) || null,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        pinnedIp: response.headers.get("x-source-monitor-pinned-ip")
      };
      if (response.status === 304) return { ...metadata, notModified: true, contentHash: options.previousHash || null, normalized: "", rawText: "" };
      if (response.status !== 200) {
        throw new SourceFetchError(`http_${response.status}`, `HTTP ${response.status}`, {
          httpStatus: response.status,
          retriable: response.status !== 410,
          retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
          metadata
        });
      }

      if (!metadata.contentType || !policy.allowedContentTypes.includes(metadata.contentType)) {
        throw new SourceFetchError("unsupported_content_type", `Content-Type ${metadata.contentType || "unbekannt"} wird nicht unterstuetzt.`, { retriable: false, metadata });
      }
      const bytes = await readLimitedBody(response, policy.maxResponseBytes);
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const normalized = normalizeRelevantContent(rawText, metadata.contentType);
      if (!normalized) throw new SourceFetchError("empty_content", "Die Antwort enthaelt keinen relevanten Inhalt.", { retriable: true, metadata });
      const semanticSignals = extractSemanticSignals(rawText, metadata.contentType);
      return {
        ...metadata,
        contentLength: bytes.byteLength,
        contentHash: await sha256Hex(normalized),
        semanticHash: await sha256Hex(semanticSignals),
        normalizationVersion: NORMALIZATION_VERSION,
        semanticSignals,
        normalized,
        rawText,
        notModified: false
      };
    }
  } catch (error) {
    const mapped = mapNetworkError(error);
    mapped.metadata = { responseTimeMs: Date.now() - startedAt, redirectCount: redirects, ...(mapped.metadata || {}) };
    throw mapped;
  } finally {
    clearTimeout(timeout);
  }
}

function pathMatches(pathname, rulePath) {
  if (!rulePath) return false;
  const endAnchored = rulePath.endsWith("$");
  const path = endAnchored ? rulePath.slice(0, -1) : rulePath;
  const escaped = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${endAnchored ? "$" : ""}`).test(pathname);
}

export function evaluateRobots(content, url, botName = "SportEventMapSourceMonitor") {
  const groups = [];
  let current = { agents: [], rules: [], crawlDelays: [] };
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line || !line.includes(":")) continue;
    const separator = line.indexOf(":");
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (current.rules.length || current.crawlDelays.length) {
        groups.push(current);
        current = { agents: [], rules: [], crawlDelays: [] };
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current.agents.length) {
      current.rules.push({ allow: field === "allow", path: value });
    } else if (field === "crawl-delay" && current.agents.length) {
      const delay = Number(value);
      if (Number.isFinite(delay) && delay >= 0) current.crawlDelays.push(Math.min(delay, 86400));
    }
  }
  if (current.agents.length || current.rules.length || current.crawlDelays.length) groups.push(current);
  const normalizedBot = botName.toLowerCase();
  const scored = groups.map(group => ({
    group,
    score: Math.max(...group.agents.map(agent => agent === "*" ? 0 : normalizedBot.includes(agent) ? agent.length : -1))
  })).filter(entry => entry.score >= 0);
  const bestScore = scored.length ? Math.max(...scored.map(entry => entry.score)) : -1;
  const applicable = scored.filter(entry => entry.score === bestScore).map(entry => entry.group);
  const matches = applicable.flatMap(group => group.rules)
    .filter(rule => pathMatches(`${url.pathname}${url.search}`, rule.path))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow));
  return {
    allowed: matches.length === 0 || matches[0].allow,
    crawlDelaySeconds: applicable.flatMap(group => group.crawlDelays).reduce((maximum, delay) => Math.max(maximum, delay), 0),
    matchedAgent: bestScore > 0 ? botName : bestScore === 0 ? "*" : null
  };
}

export function robotsAllows(content, url, botName = "SportEventMapSourceMonitor") {
  return evaluateRobots(content, url, botName).allowed;
}
