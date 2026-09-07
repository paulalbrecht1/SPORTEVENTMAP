import assert from "node:assert/strict";
import { createPinnedHttpFetch } from "../supabase/functions/_shared/pinned-http.mjs";
import { fetchSource } from "../supabase/functions/_shared/source-monitor-core.mjs";

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

// Runtime cancellation can surface as a generic socket error, a clean EOF or
// the tolerated TLS close_notify error. None may turn a deadline into success
// or cause a second target IP to be contacted.
for (const outcome of ["operation canceled", "close_notify: unexpected EOF", "eof"]) {
  const controller = new AbortController();
  let connections = 0;
  let canceledConnection;
  const canceledFetch = createPinnedHttpFetch({
    connect: async () => {
      connections += 1;
      canceledConnection = new FakeConnection(contentLengthResponse);
      const read = canceledConnection.read.bind(canceledConnection);
      canceledConnection.read = async buffer => {
        if (canceledConnection.offset < contentLengthResponse.byteLength) return read(buffer);
        controller.abort();
        if (outcome === "eof") return null;
        throw new Error(outcome);
      };
      return canceledConnection;
    },
    startTls: async value => value
  });
  await assert.rejects(() => canceledFetch("https://events.example/", {
    signal: controller.signal
  }, { addresses: ["93.184.216.34", "93.184.216.35"] }), error => error.name === "AbortError");
  assert.equal(connections, 1, "An aborted request must not try the next public IP.");
  assert.equal(canceledConnection.closed, true);
}

for (const phase of ["connect", "tls"]) {
  const controller = new AbortController();
  const lateConnection = new FakeConnection(contentLengthResponse);
  const lateFetch = createPinnedHttpFetch({
    connect: async () => {
      if (phase === "connect") controller.abort();
      return lateConnection;
    },
    startTls: async value => {
      controller.abort();
      return value;
    }
  });
  await assert.rejects(() => lateFetch("https://events.example/", {
    signal: controller.signal
  }, { addresses: ["93.184.216.34"] }), error => error.name === "AbortError");
  assert.equal(lateConnection.request, "", "No HTTP request may be sent after cancellation.");
  assert.equal(lateConnection.closed, true);
}

let rejectPendingRead;
let timeoutConnections = 0;
const deadlineFetch = createPinnedHttpFetch({
  connect: async () => {
    timeoutConnections += 1;
    return {
      async write(bytes) { return bytes.byteLength; },
      read() { return new Promise((_resolve, reject) => { rejectPendingRead = reject; }); },
      close() { rejectPendingRead?.(new Error("operation canceled")); }
    };
  },
  startTls: async value => value
});
await assert.rejects(() => fetchSource("https://events.example/", {
  resolveDns: async () => ["93.184.216.34", "93.184.216.35"],
  requirePinnedTransport: true,
  fetchImpl: deadlineFetch,
  policy: { requestTimeoutMs: 5 }
}), error => error.code === "timeout" && error.retriable === true);
assert.equal(timeoutConnections, 1);

console.log("Pinned HTTP transport: verified IP/TLS, headers, chunk decoding, private-IP refusal and preserved deadline cancellation.");
