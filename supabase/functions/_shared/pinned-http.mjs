import { SourceFetchError, isBlockedIp } from "./source-monitor-core.mjs";

const encoder = new TextEncoder();
const FORWARDED_HEADERS = new Set(["accept", "if-none-match", "if-modified-since", "user-agent"]);

async function writeAll(connection, bytes, throwIfAborted) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    throwIfAborted();
    const count = await connection.write(bytes.subarray(offset));
    throwIfAborted();
    if (!Number.isInteger(count) || count <= 0 || count > bytes.byteLength - offset) {
      throw new SourceFetchError("pinned_connect_error", "HTTP-Request konnte nicht vollstaendig geschrieben werden.");
    }
    offset += count;
  }
}

function isUncleanTlsEof(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /close_notify|unexpected[ -]?eof|peer closed connection/i.test(message);
}

// RFC 9112 sections 6.3, 7.1 and 8: a framed message ends at its declared
// boundary, while a close-delimited message requires a clean connection EOF.
// The existing 64 KiB wire allowance also bounds all framing overhead together
// (interim/final headers, chunk lines and trailers), independently of body size.
const MAX_FRAMING_BYTES = 65536;
const MAX_CHUNK_LINE_BYTES = 8192;
const MAX_INFORMATIONAL_RESPONSES = 8;
const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const FIELD_NAME = new RegExp(`^${TOKEN}$`);
const QUOTED_STRING = '"(?:[\\t\\x20\\x21\\x23-\\x5b\\x5d-\\x7e\\x80-\\xff]|\\\\[\\t\\x20-\\x7e\\x80-\\xff])*"';
const CHUNK_LINE = new RegExp(`^([0-9a-fA-F]+)(?:[ \\t]*;[ \\t]*${TOKEN}(?:[ \\t]*=[ \\t]*(?:${TOKEN}|${QUOTED_STRING}))?)*$`);
const FORBIDDEN_TRAILERS = new Set(["content-length", "transfer-encoding", "host", "content-encoding"]);

function invalidResponse(message) {
  return new SourceFetchError("invalid_http_response", message, { retriable: true });
}

function tooLarge() {
  return new SourceFetchError("response_too_large", "Gepinnte Antwort ueberschreitet das Body- oder Framinglimit.", { retriable: false });
}

function concatenate(chunks, total) {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function decodeHttpLine(bytes) {
  // HTTP field values may contain opaque bytes, not necessarily UTF-8.
  let line = "";
  for (const byte of bytes) line += String.fromCharCode(byte);
  return line;
}

function parseField(line) {
  const colon = line.indexOf(":");
  const name = line.slice(0, colon);
  if (colon <= 0 || !FIELD_NAME.test(name) || /[\x00-\x08\x0a-\x1f\x7f]/.test(line.slice(colon + 1))) {
    throw invalidResponse("Ungueltiger HTTP-Header oder Trailer.");
  }
  return [name.toLowerCase(), line.slice(colon + 1).replace(/^[ \t]+|[ \t]+$/g, "")];
}

function createResponseReader(connection, maximumBodyBytes, throwIfAborted) {
  const buffer = new Uint8Array(16384);
  let pending = new Uint8Array(0);
  let received = 0;
  let framingBytes = 0;
  let ended = false;

  async function fill() {
    throwIfAborted();
    if (ended) return false;
    let count;
    try { count = await connection.read(buffer); }
    catch (error) {
      throwIfAborted();
      if (isUncleanTlsEof(error)) throw invalidResponse("TLS-Verbindung endete vor dem vollstaendigen HTTP-Nachrichtenende.");
      throw error;
    }
    throwIfAborted();
    if (count === null) { ended = true; return false; }
    if (!Number.isInteger(count) || count <= 0 || count > buffer.byteLength) throw invalidResponse("Ungueltiger TCP-Lesefortschritt.");
    received += count;
    if (received > maximumBodyBytes + MAX_FRAMING_BYTES) throw tooLarge();
    pending = concatenate([pending, buffer.subarray(0, count)], pending.byteLength + count);
    return true;
  }

  async function line(maximum = MAX_FRAMING_BYTES) {
    const limit = Math.min(maximum, MAX_FRAMING_BYTES - framingBytes);
    let scanned = 0;
    while (true) {
      for (let index = scanned; index < pending.byteLength - 1; index += 1) {
        if (pending[index] !== 13 || pending[index + 1] !== 10) continue;
        if (index + 2 > limit) throw tooLarge();
        const result = decodeHttpLine(pending.subarray(0, index));
        framingBytes += index + 2;
        pending = pending.subarray(index + 2);
        return result;
      }
      if (pending.byteLength >= limit) throw tooLarge();
      scanned = Math.max(0, pending.byteLength - 1);
      if (!await fill()) throw invalidResponse("Unvollstaendige HTTP-Zeile.");
    }
  }

  async function exactly(length) {
    const chunks = [];
    let remaining = length;
    while (remaining > 0) {
      if (!pending.byteLength && !await fill()) throw invalidResponse("Unvollstaendige HTTP-Antwort.");
      const count = Math.min(remaining, pending.byteLength);
      chunks.push(pending.subarray(0, count));
      pending = pending.subarray(count);
      remaining -= count;
    }
    return concatenate(chunks, length);
  }

  async function chunkEnd() {
    const bytes = await exactly(2);
    if (bytes[0] !== 13 || bytes[1] !== 10) throw invalidResponse("Chunk-Daten enden nicht mit CRLF.");
    framingBytes += 2;
    if (framingBytes > MAX_FRAMING_BYTES) throw tooLarge();
  }

  async function toCleanEof() {
    const chunks = [];
    let total = 0;
    while (pending.byteLength || await fill()) {
      total += pending.byteLength;
      if (total > maximumBodyBytes) throw tooLarge();
      chunks.push(pending);
      pending = new Uint8Array(0);
    }
    return concatenate(chunks, total);
  }

  return { line, exactly, chunkEnd, toCleanEof };
}

async function readHttpResponse(connection, pinnedIp, maximumBodyBytes, throwIfAborted) {
  const reader = createResponseReader(connection, maximumBodyBytes, throwIfAborted);
  let status;
  let version;
  let headers;
  let informationalCount = 0;
  do {
    const statusMatch = (await reader.line()).match(/^HTTP\/(1\.[01]) ([1-5]\d{2})(?: [\t\x20-\x7e\x80-\xff]*)?$/);
    if (!statusMatch) throw invalidResponse("Ungueltige HTTP-Statuszeile.");
    [, version] = statusMatch;
    status = Number(statusMatch[2]);
    headers = new Headers();
    for (let line = await reader.line(); line !== ""; line = await reader.line()) {
      const [name, value] = parseField(line);
      headers.append(name, value);
    }
    if (headers.has("transfer-encoding") && headers.has("content-length")) {
      throw invalidResponse("Mehrdeutige HTTP-Antwort mit Transfer-Encoding und Content-Length.");
    }
    if (status === 101 || (status < 200 && ++informationalCount > MAX_INFORMATIONAL_RESPONSES)) {
      throw invalidResponse("Protokollwechsel oder zu viele vorlaeufige HTTP-Antworten.");
    }
  } while (status < 200);
  headers.set("x-source-monitor-pinned-ip", pinnedIp);
  // These responses end at the header, even when metadata describes the
  // representation that would have been sent in a normal 200 response.
  if (status === 204 || status === 304) return new Response(null, { status, headers });

  const encoding = (headers.get("content-encoding") || "identity").toLowerCase();
  if (encoding !== "identity") throw new SourceFetchError("unsupported_content_encoding", `Content-Encoding ${encoding} wird im gepinnten Transport nicht akzeptiert.`, { retriable: false });
  let body;
  if (headers.has("transfer-encoding")) {
    if (version !== "1.1" || headers.get("transfer-encoding").toLowerCase() !== "chunked") {
      throw invalidResponse("Nicht unterstuetztes oder mehrdeutiges Transfer-Encoding.");
    }
    const chunks = [];
    let total = 0;
    while (true) {
      const sizeMatch = (await reader.line(MAX_CHUNK_LINE_BYTES)).match(CHUNK_LINE);
      if (!sizeMatch) throw invalidResponse("Ungueltige Chunk-Laengenzeile.");
      const size = Number.parseInt(sizeMatch[1], 16);
      if (!Number.isSafeInteger(size)) throw invalidResponse("Ungueltige Chunk-Laenge.");
      if (size === 0) {
        for (let line = await reader.line(); line !== ""; line = await reader.line()) {
          const [name] = parseField(line);
          if (FORBIDDEN_TRAILERS.has(name)) throw invalidResponse("Trailer darf das HTTP-Framing nicht veraendern.");
          // Trailers are validated and bounded, never merged into trusted headers.
        }
        break;
      }
      if (status === 205) throw invalidResponse("HTTP 205 darf keinen Inhalt enthalten.");
      total += size;
      if (total > maximumBodyBytes) throw tooLarge();
      chunks.push(await reader.exactly(size));
      await reader.chunkEnd();
    }
    body = concatenate(chunks, total);
  } else if (headers.has("content-length")) {
    const rawLength = headers.get("content-length");
    if (!/^\d+$/.test(rawLength) || !Number.isSafeInteger(Number(rawLength))) {
      // Repeated/list Content-Length is deliberately rejected, even if equal.
      throw invalidResponse("Ungueltiger oder wiederholter Content-Length-Header.");
    }
    const length = Number(rawLength);
    if (status === 205 && length !== 0) throw invalidResponse("HTTP 205 darf keinen Inhalt enthalten.");
    if (length > maximumBodyBytes) throw tooLarge();
    body = await reader.exactly(length);
  } else {
    body = await reader.toCleanEof();
  }
  if (status === 205 && body.byteLength !== 0) throw invalidResponse("HTTP 205 darf keinen Inhalt enthalten.");
  return new Response(status === 205 ? null : body, { status, headers });
}

function requestHeaders(url, input) {
  const headers = new Headers(input || {});
  const output = [];
  for (const [name, value] of headers.entries()) {
    if (!FORWARDED_HEADERS.has(name.toLowerCase())) continue;
    if (/\r|\n/.test(name) || /\r|\n/.test(value)) throw new SourceFetchError("invalid_request_header", "Ungueltiger Request-Header.", { retriable: false });
    output.push(`${name}: ${value}`);
  }
  const defaultPort = url.protocol === "https:" ? "443" : "80";
  const host = url.port && url.port !== defaultPort ? `${url.hostname}:${url.port}` : url.hostname;
  output.push(`Host: ${host}`, "Accept-Encoding: identity", "Connection: close");
  return output;
}

export function createPinnedHttpFetch(runtime) {
  if (!runtime?.connect || !runtime?.startTls) throw new Error("Pinned transport runtime is incomplete.");
  return async function pinnedFetch(input, init = {}, target = {}) {
    const url = input instanceof URL ? input : new URL(String(input));
    const addresses = [...new Set((target.addresses || []).map(String))].filter(address => !isBlockedIp(address));
    if (!addresses.length) throw new SourceFetchError("pinned_target_missing", "Keine gepruefte oeffentliche Ziel-IP vorhanden.", { retriable: false });
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    const path = `${url.pathname || "/"}${url.search}`;
    const lines = [`GET ${path} HTTP/1.1`, ...requestHeaders(url, init.headers), "", ""];
    const throwIfAborted = () => {
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
    };
    let lastError;
    for (const address of addresses) {
      let connection;
      const abort = () => { try { connection?.close(); } catch { /* already closed */ } };
      try {
        throwIfAborted();
        init.signal?.addEventListener("abort", abort, { once: true });
        connection = await runtime.connect({ transport: "tcp", hostname: address, port });
        throwIfAborted();
        if (url.protocol === "https:") {
          connection = await runtime.startTls(connection, {
            hostname: url.hostname,
            alpnProtocols: ["http/1.1"]
          });
          throwIfAborted();
        }
        await writeAll(connection, encoder.encode(lines.join("\r\n")), throwIfAborted);
        throwIfAborted();
        const maximum = Number(target.maxResponseBytes || 1500000);
        const response = await readHttpResponse(connection, address, maximum, throwIfAborted);
        throwIfAborted();
        return response;
      } catch (error) {
        // Closing a timed-out TCP/TLS socket may report a runtime-specific error
        // or even EOF. Preserve the caller's deadline instead of retrying IPs or
        // presenting this as a failed connection.
        throwIfAborted();
        if (error?.name === "AbortError") throw error;
        lastError = error;
      } finally {
        init.signal?.removeEventListener("abort", abort);
        try { connection?.close(); } catch { /* already closed */ }
      }
    }
    if (lastError instanceof SourceFetchError) throw lastError;
    throw new SourceFetchError("pinned_connect_error", lastError instanceof Error ? lastError.message : "Verbindung zu geprueften IPs fehlgeschlagen.");
  };
}

export function createDenoPinnedFetch() {
  if (typeof Deno === "undefined" || typeof Deno.connect !== "function" || typeof Deno.startTls !== "function") {
    throw new SourceFetchError("pinned_transport_unavailable", "Die Edge Runtime bietet keinen IP-gepinnten TCP/TLS-Transport.", { retriable: false });
  }
  return createPinnedHttpFetch({ connect: options => Deno.connect(options), startTls: (connection, options) => Deno.startTls(connection, options) });
}
