import { SourceFetchError, isBlockedIp } from "./source-monitor-core.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const FORWARDED_HEADERS = new Set(["accept", "if-none-match", "if-modified-since", "user-agent"]);

async function writeAll(connection, bytes) {
  let offset = 0;
  while (offset < bytes.byteLength) offset += await connection.write(bytes.subarray(offset));
}

function isUncleanTlsEof(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /close_notify|unexpected[ -]?eof|peer closed connection/i.test(message);
}

async function readAll(connection, limit) {
  const chunks = [];
  let total = 0;
  const buffer = new Uint8Array(16384);
  while (true) {
    let count;
    try {
      count = await connection.read(buffer);
    } catch (error) {
      if (total > 0 && isUncleanTlsEof(error)) break;
      throw error;
    }
    if (count === null) break;
    total += count;
    if (total > limit) throw new SourceFetchError("response_too_large", `Gepinnte Antwort ueberschreitet ${limit} Bytes.`, { retriable: false });
    chunks.push(buffer.slice(0, count));
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function indexOfSequence(bytes, sequence, start = 0) {
  outer: for (let index = start; index <= bytes.length - sequence.length; index += 1) {
    for (let offset = 0; offset < sequence.length; offset += 1) if (bytes[index + offset] !== sequence[offset]) continue outer;
    return index;
  }
  return -1;
}

function decodeChunked(bytes) {
  const crlf = encoder.encode("\r\n");
  const chunks = [];
  let total = 0;
  let offset = 0;
  while (offset < bytes.length) {
    const lineEnd = indexOfSequence(bytes, crlf, offset);
    if (lineEnd < 0) throw new SourceFetchError("invalid_http_response", "Ungueltige Chunk-Laengenzeile.", { retriable: true });
    const sizeToken = decoder.decode(bytes.subarray(offset, lineEnd)).split(";", 1)[0].trim();
    if (!/^[0-9a-f]+$/i.test(sizeToken)) throw new SourceFetchError("invalid_http_response", "Ungueltige Chunk-Laenge.", { retriable: true });
    const size = Number.parseInt(sizeToken, 16);
    offset = lineEnd + 2;
    if (size === 0) break;
    if (offset + size + 2 > bytes.length) throw new SourceFetchError("invalid_http_response", "Unvollstaendige Chunk-Antwort.", { retriable: true });
    const chunk = bytes.slice(offset, offset + size);
    chunks.push(chunk);
    total += chunk.byteLength;
    offset += size + 2;
  }
  const output = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) { output.set(chunk, position); position += chunk.byteLength; }
  return output;
}

function parseHttpResponse(bytes, pinnedIp) {
  const separator = encoder.encode("\r\n\r\n");
  const headerEnd = indexOfSequence(bytes, separator);
  if (headerEnd < 0 || headerEnd > 65536) throw new SourceFetchError("invalid_http_response", "HTTP-Header fehlt oder ist zu gross.", { retriable: true });
  const lines = decoder.decode(bytes.subarray(0, headerEnd)).split("\r\n");
  const statusMatch = lines.shift()?.match(/^HTTP\/1\.[01]\s+(\d{3})(?:\s|$)/i);
  if (!statusMatch) throw new SourceFetchError("invalid_http_response", "Ungueltige HTTP-Statuszeile.", { retriable: true });
  const headers = new Headers();
  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) throw new SourceFetchError("invalid_http_response", "Ungueltiger HTTP-Header.", { retriable: true });
    headers.append(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }
  headers.set("x-source-monitor-pinned-ip", pinnedIp);
  const encoding = (headers.get("content-encoding") || "identity").toLowerCase();
  if (!["", "identity"].includes(encoding)) throw new SourceFetchError("unsupported_content_encoding", `Content-Encoding ${encoding} wird im gepinnten Transport nicht akzeptiert.`, { retriable: false });
  let body = bytes.slice(headerEnd + separator.byteLength);
  const status = Number(statusMatch[1]);
  if (/\bchunked\b/i.test(headers.get("transfer-encoding") || "")) {
    body = decodeChunked(body);
  } else if (![204, 205, 304].includes(status) && headers.has("content-length")) {
    const rawLength = headers.get("content-length")?.trim() || "";
    if (!/^\d+$/.test(rawLength)) {
      throw new SourceFetchError("invalid_http_response", "Ungueltiger Content-Length-Header.", { retriable: true });
    }
    const expectedLength = Number(rawLength);
    if (!Number.isSafeInteger(expectedLength) || body.byteLength < expectedLength) {
      throw new SourceFetchError("invalid_http_response", "Unvollstaendige HTTP-Antwort.", { retriable: true });
    }
    if (body.byteLength > expectedLength) body = body.slice(0, expectedLength);
  }
  return new Response([204, 205, 304].includes(status) ? null : body, { status, headers });
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
    let lastError;
    for (const address of addresses) {
      let connection;
      const abort = () => { try { connection?.close(); } catch { /* already closed */ } };
      try {
        if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
        init.signal?.addEventListener("abort", abort, { once: true });
        connection = await runtime.connect({ transport: "tcp", hostname: address, port });
        if (url.protocol === "https:") {
          connection = await runtime.startTls(connection, {
            hostname: url.hostname,
            alpnProtocols: ["http/1.1"]
          });
        }
        await writeAll(connection, encoder.encode(lines.join("\r\n")));
        const maximum = Number(target.maxResponseBytes || 1500000) + 65536;
        return parseHttpResponse(await readAll(connection, maximum), address);
      } catch (error) {
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
