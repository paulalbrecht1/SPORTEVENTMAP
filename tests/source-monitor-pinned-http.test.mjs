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

// Packet boundaries must have no meaning to HTTP framing. An optional sentinel
// fails immediately if the transport waits for socket EOF after a full message.
class PacketConnection extends FakeConnection {
  constructor(raw, { packetSize = 1, forbidEofRead = false, uncleanEof = false } = {}) {
    super(encoder.encode(raw));
    this.packetSize = packetSize;
    this.forbidEofRead = forbidEofRead;
    this.uncleanEof = uncleanEof;
    this.reads = 0;
  }

  async read(buffer) {
    this.reads += 1;
    if (this.offset >= this.response.byteLength) {
      if (this.forbidEofRead) throw new Error("Unexpected read after the complete HTTP message.");
      if (this.uncleanEof) throw new Error("TLS close_notify missing: unexpected EOF");
      return null;
    }
    return super.read(buffer.subarray(0, this.packetSize));
  }
}

async function readFixture(raw, { maximum = 1000, ...options } = {}) {
  const fixture = new PacketConnection(raw, options);
  const fetch = createPinnedHttpFetch({ connect: async () => fixture, startTls: async value => value });
  const result = await fetch("https://events.example/", {}, {
    addresses: ["93.184.216.34"], maxResponseBytes: maximum
  });
  assert.equal(fixture.closed, true, "Completed responses release the pinned connection.");
  return result;
}

const http = (headers, body = "", status = "200 OK") => `HTTP/1.1 ${status}\r\n${headers}\r\n\r\n${body}`;

// Completion, including CRLF and trailer boundaries, must work with one-byte
// packets and without asking a still-open connection for any more bytes.
for (const packetSize of [1, 2, 7, 16384]) {
  for (const [raw, expected] of [
    [http("Content-Length: 5", "hello"), "hello"],
    [http("Content-Length: 0"), ""],
    [http("Transfer-Encoding: chunked", '2;foo="semi;colon\\\"quoted"\r\nhe\r\n3\r\nllo\r\n0\r\nX-Checksum: okay\r\n\r\n'), "hello"],
    [http("Transfer-Encoding: chunked", "0\r\n\r\n"), ""],
    [http("Content-Length: 500000", "", "304 Not Modified"), ""],
    [http("Transfer-Encoding: chunked", "", "304 Not Modified"), ""],
    [http("Content-Encoding: gzip", "", "304 Not Modified"), ""],
    [http("Content-Length: 0", "", "204 No Content"), ""],
    [http("Content-Length: 0", "", "205 Reset Content"), ""],
    [http("Transfer-Encoding: chunked", "0\r\n\r\n", "205 Reset Content"), ""],
    [http("Link: </style.css>; rel=preload", "", "103 Early Hints") + http("Content-Length: 5", "hello"), "hello"]
  ]) {
    const result = await readFixture(raw, { packetSize, forbidEofRead: true });
    assert.equal(await result.text(), expected, `Complete message with ${packetSize}-byte packets`);
  }
}

assert.equal(await (await readFixture(http("Content-Length: 5", "ä€"), { maximum: 5 })).text(), "ä€",
  "Content-Length and body limits count bytes, not decoded characters.");
assert.equal(await (await readFixture(http("Content-Length: 5", "helloIGNORED"), { packetSize: 16384 })).text(), "hello",
  "Bytes following a complete response are never appended to its body.");

for (const raw of [
  http("Content-Length: 5", "hey"),
  http("Transfer-Encoding: chunked", "5\r\nhello\r\n"),
  http("Transfer-Encoding: chunked", "5\r\nhey"),
  http("Transfer-Encoding: chunked", "5\r\nhello\r\n0\r\n"),
  http("Transfer-Encoding: chunked", "5\r\nhelloXY0\r\n\r\n"),
  http("Transfer-Encoding: chunked", "5\r\nhello\r\n0\r\nX-Checksum: okay\r\n"),
  http("Transfer-Encoding: chunked", "0\r\nnot-a-header\r\n\r\n"),
  http("Transfer-Encoding: chunked", "0\r\nContent-Length: 0\r\n\r\n"),
  http("Transfer-Encoding: chunked", "-1\r\nhello\r\n0\r\n\r\n"),
  http("Transfer-Encoding: chunked", "1z\r\nh\r\n0\r\n\r\n"),
  http("Transfer-Encoding: chunked", "20000000000000\r\n"),
  http("Transfer-Encoding: chunked", '1;foo="unterminated\r\nh\r\n0\r\n\r\n'),
  http("Content-Length: 5\r\nTransfer-Encoding: chunked", "0\r\n\r\n"),
  http("Transfer-Encoding: gzip, chunked", "0\r\n\r\n"),
  http("Transfer-Encoding: chunked, gzip", "0\r\n\r\n"),
  http("Transfer-Encoding: chunked\r\nTransfer-Encoding: chunked", "0\r\n\r\n"),
  http("Transfer-Encoding:"),
  http("Transfer-Encoding: chunked", "0\r\n\r\n").replace("HTTP/1.1", "HTTP/1.0"),
  http("Content-Length: 5\r\nContent-Length: 5", "hello"),
  http("Content-Length: 5\r\nContent-Length: 7", "hello"),
  http("Content-Length: 5, 7", "hello"),
  http("Content-Length: +5", "hello"),
  http("Content-Length: 9007199254740992"),
  http("Content-Length : 5", "hello"),
  http("Content-Length: 5\r\n folded: true", "hello"),
  http("Content-Length: 0\r\nX-Control: a\u0000b"),
  http("Content-Length: 1", "x", "205 Reset Content"),
  http("Transfer-Encoding: chunked", "1\r\nx\r\n0\r\n\r\n", "205 Reset Content"),
  http("Upgrade: websocket", "", "101 Switching Protocols"),
  http("Content-Length: 0", "", "099 Invalid"),
  http("Content-Length: 0", "", "600 Invalid"),
  "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n",
  "HTTP/1.1 200 OK\nContent-Length: 0\n\n",
  http("X-Hint: yes", "", "103 Early Hints").repeat(9) + http("Content-Length: 0")
]) {
  await assert.rejects(() => readFixture(raw), error => error.code === "invalid_http_response", raw.slice(0, 120));
}

// Close-delimited responses need an actual clean EOF. TLS truncation is never
// evidence of a complete body, even if it happens after non-empty HTML.
assert.equal(await (await readFixture(http("Connection: close", "hello"))).text(), "hello");
await assert.rejects(() => readFixture(http("Connection: close", "hello"), { uncleanEof: true }),
  error => error.code === "invalid_http_response");
assert.equal(await (await readFixture(http("Connection: close", "", "205 Reset Content"))).text(), "");
await assert.rejects(() => readFixture(http("Connection: close", "x", "205 Reset Content")),
  error => error.code === "invalid_http_response");

for (const raw of [
  http("Content-Length: 6", "abcdef"),
  http("Transfer-Encoding: chunked", "3\r\nabc\r\n3\r\ndef\r\n0\r\n\r\n"),
  http("Connection: close", "abcdef")
]) {
  await assert.rejects(() => readFixture(raw, { maximum: 5 }),
    error => error.code === "response_too_large" && error.retriable === false);
}
for (const raw of [
  http(`X-Large: ${"h".repeat(65536)}\r\nContent-Length: 0`),
  http("Transfer-Encoding: chunked", `0\r\nX-Large: ${"t".repeat(65536)}\r\n\r\n`),
  http("Transfer-Encoding: chunked", `1;name=${"e".repeat(8192)}\r\nx\r\n0\r\n\r\n`),
  http("Transfer-Encoding: chunked", "1\r\nx\r\n".repeat(14000) + "0\r\n\r\n")
]) {
  await assert.rejects(() => readFixture(raw, { maximum: 100000, packetSize: 16384 }),
    error => error.code === "response_too_large" && error.retriable === false);
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
  { headers: { "User-Agent": "SportEventMapSourceMonitor/2.1 (+mailto:kontakt@sporteventmap.com)", Accept: "text/plain", Cookie: "private-session=not-forwarded", Authorization: "Bearer not-forwarded" } },
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
// a missing TLS close_notify. None may turn a deadline into success
// or cause a second target IP to be contacted.
for (const outcome of ["operation canceled", "close_notify: unexpected EOF", "eof"]) {
  const controller = new AbortController();
  let connections = 0;
  let canceledConnection;
  const canceledFetch = createPinnedHttpFetch({
    connect: async () => {
      connections += 1;
      canceledConnection = new FakeConnection(truncatedResponse);
      const read = canceledConnection.read.bind(canceledConnection);
      canceledConnection.read = async buffer => {
        if (canceledConnection.offset < truncatedResponse.byteLength) return read(buffer);
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

// Cancellation arriving with the final packet still takes precedence over a
// valid response, including header-only and empty responses.
for (const raw of [
  http("Content-Length: 5", "hello"),
  http("Transfer-Encoding: chunked", "5\r\nhello\r\n0\r\n\r\n"),
  http("Content-Length: 0"),
  http("Content-Length: 500", "", "304 Not Modified")
]) {
  const controller = new AbortController();
  const finalPacketConnection = new FakeConnection(encoder.encode(raw));
  let connections = 0;
  const read = finalPacketConnection.read.bind(finalPacketConnection);
  finalPacketConnection.read = async buffer => {
    const result = await read(buffer);
    controller.abort();
    return result;
  };
  const fetch = createPinnedHttpFetch({
    connect: async () => { connections += 1; return finalPacketConnection; },
    startTls: async value => value
  });
  await assert.rejects(() => fetch("https://events.example/", { signal: controller.signal }, {
    addresses: ["93.184.216.34", "93.184.216.35"]
  }), error => error.name === "AbortError");
  assert.equal(connections, 1);
  assert.equal(finalPacketConnection.closed, true);
}

const partialWriteController = new AbortController();
const partialWriteConnection = new FakeConnection(contentLengthResponse);
let writes = 0;
partialWriteConnection.write = async () => {
  writes += 1;
  partialWriteController.abort();
  return 1;
};
const partialWriteFetch = createPinnedHttpFetch({
  connect: async () => partialWriteConnection,
  startTls: async value => value
});
await assert.rejects(() => partialWriteFetch("https://events.example/", { signal: partialWriteController.signal }, {
  addresses: ["93.184.216.34"]
}), error => error.name === "AbortError");
assert.equal(writes, 1, "A partial write must not continue after cancellation.");
assert.equal(partialWriteConnection.closed, true);

const alreadyAborted = new AbortController();
alreadyAborted.abort();
let abortedConnects = 0;
const alreadyAbortedFetch = createPinnedHttpFetch({
  connect: async () => { abortedConnects += 1; return new FakeConnection(contentLengthResponse); },
  startTls: async value => value
});
await assert.rejects(() => alreadyAbortedFetch("https://events.example/", { signal: alreadyAborted.signal }, {
  addresses: ["93.184.216.34"]
}), error => error.name === "AbortError");
assert.equal(abortedConnects, 0);

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

console.log("Pinned HTTP transport: verified IP/TLS and header boundaries; complete/split/framed/bodyless responses; strict truncation, ambiguity and size rejection; cancellation at connect/TLS/partial-write/final-read/deadline.");
