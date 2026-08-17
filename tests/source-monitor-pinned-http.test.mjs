import assert from "node:assert/strict";
import { createPinnedHttpFetch } from "../supabase/functions/_shared/pinned-http.mjs";

const encoder = new TextEncoder();

class FakeConnection {
  constructor(response) {
    this.response = response;
    this.offset = 0;
    this.request = "";
    this.closed = false;
  }

  async write(bytes) {
    this.request += new TextDecoder().decode(bytes);
    return bytes.byteLength;
  }

  async read(buffer) {
    if (this.offset >= this.response.byteLength) return null;
    const size = Math.min(buffer.byteLength, this.response.byteLength - this.offset);
    buffer.set(this.response.subarray(this.offset, this.offset + size));
    this.offset += size;
    return size;
  }

  close() {
    this.closed = true;
  }
}

class UncleanTlsConnection extends FakeConnection {
  async read(buffer) {
    if (this.offset >= this.response.byteLength) {
      throw new Error("peer closed connection without sending TLS close_notify: unexpected EOF");
    }
    return super.read(buffer);
  }
}

const rawResponse = encoder.encode([
  "HTTP/1.1 200 OK",
  "Content-Type: text/plain",
  "Transfer-Encoding: chunked",
  "Connection: close",
  "",
  "5",
  "hello",
  "0",
  "",
  ""
].join("\r\n"));

let connectedTo;
let tlsHostname;
let tlsAlpnProtocols;
let connection;
const pinnedFetch = createPinnedHttpFetch({
  connect: async options => {
    connectedTo = options;
    connection = new FakeConnection(rawResponse);
    return connection;
  },
  startTls: async (value, options) => {
    tlsHostname = options.hostname;
    tlsAlpnProtocols = options.alpnProtocols;
    return value;
  }
});

const response = await pinnedFetch(
  new URL("https://events.example/race?year=2027"),
  { headers: { "User-Agent": "SportEventMapSourceMonitor/2.1 (+mailto:kontakt@sporteventmap.com)", Accept: "text/plain" } },
  { addresses: ["93.184.216.34"], maxResponseBytes: 1000 }
);
assert.equal(await response.text(), "hello");
assert.equal(response.headers.get("x-source-monitor-pinned-ip"), "93.184.216.34");
assert.deepEqual(connectedTo, { transport: "tcp", hostname: "93.184.216.34", port: 443 });
assert.equal(tlsHostname, "events.example");
assert.deepEqual(tlsAlpnProtocols, ["http/1.1"]);
assert.match(connection.request, /^GET \/race\?year=2027 HTTP\/1\.1\r\n/m);
assert.match(connection.request, /Host: events\.example\r\n/i);
assert.match(connection.request, /Accept-Encoding: identity\r\n/i);
assert.doesNotMatch(connection.request, /Cookie:|Authorization:/i);

let privateConnects = 0;
const privateFetch = createPinnedHttpFetch({
  connect: async () => { privateConnects += 1; },
  startTls: async value => value
});
await assert.rejects(
  () => privateFetch(new URL("https://private.example"), {}, { addresses: ["127.0.0.1"] }),
  error => error.code === "pinned_target_missing"
);
assert.equal(privateConnects, 0);

const contentLengthResponse = encoder.encode([
  "HTTP/1.1 200 OK",
  "Content-Type: text/plain",
  "Content-Length: 5",
  "Connection: close",
  "",
  "hello"
].join("\r\n"));
const uncleanTlsFetch = createPinnedHttpFetch({
  connect: async () => new UncleanTlsConnection(contentLengthResponse),
  startTls: async value => value
});
const uncleanTlsResponse = await uncleanTlsFetch(
  new URL("https://events.example/robots.txt"),
  {},
  { addresses: ["93.184.216.34"], maxResponseBytes: 1000 }
);
assert.equal(await uncleanTlsResponse.text(), "hello");

const truncatedResponse = encoder.encode([
  "HTTP/1.1 200 OK",
  "Content-Type: text/plain",
  "Content-Length: 5",
  "Connection: close",
  "",
  "hey"
].join("\r\n"));
const truncatedFetch = createPinnedHttpFetch({
  connect: async () => new UncleanTlsConnection(truncatedResponse),
  startTls: async value => value
});
await assert.rejects(
  () => truncatedFetch(new URL("https://events.example/robots.txt"), {}, { addresses: ["93.184.216.34"], maxResponseBytes: 1000 }),
  error => error.code === "invalid_http_response"
);

console.log("Pinned HTTP transport: verified IP connection, TLS hostname, safe headers, chunk decoding and private-IP refusal.");
