import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const projectId = process.argv[2];
const sqlPath = path.resolve(process.argv[3] || "");

assert.match(
  projectId || "",
  /^sport-event-map-recovery-drill-[a-f0-9]{8}$/,
  "Refusing SQL import for an unexpected project id."
);
assert.equal(fs.existsSync(sqlPath), true, `SQL file does not exist: ${sqlPath}`);
assert.equal(fs.statSync(sqlPath).isFile(), true, `SQL path is not a file: ${sqlPath}`);

function dockerRequest(method, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const call = http.request({
      socketPath: "\\\\.\\pipe\\docker_engine",
      path: requestPath,
      method,
      headers: {
        ...headers,
        ...(body ? { "Content-Length": body.length } : {})
      }
    }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        const responseBody = Buffer.concat(chunks);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(responseBody);
          return;
        }
        reject(new Error(
          `Docker Engine ${method} ${requestPath} failed (${response.statusCode}): ${responseBody.toString("utf8")}`
        ));
      });
    });
    call.setTimeout(600000, () => call.destroy(new Error("Docker Engine request timed out.")));
    call.on("error", reject);
    if (body) call.write(body);
    call.end();
  });
}

function parseJson(buffer) {
  return JSON.parse(buffer.toString("utf8") || "null");
}

function writeTarString(header, offset, length, value) {
  const bytes = Buffer.from(value, "utf8");
  assert.ok(bytes.length <= length, `Tar value is too long: ${value}`);
  bytes.copy(header, offset, 0, bytes.length);
}

function writeTarOctal(header, offset, length, value) {
  const octal = Math.trunc(value).toString(8).padStart(length - 1, "0") + "\0";
  writeTarString(header, offset, length, octal);
}

function createSingleFileTar(fileName, contents) {
  const header = Buffer.alloc(512, 0);
  writeTarString(header, 0, 100, fileName);
  writeTarOctal(header, 100, 8, 0o600);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, contents.length);
  writeTarOctal(header, 136, 12, Math.floor(Date.now() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeTarString(header, 257, 6, "ustar\0");
  writeTarString(header, 263, 2, "00");
  writeTarString(header, 265, 32, "postgres");
  writeTarString(header, 297, 32, "postgres");
  const checksum = [...header].reduce((total, byte) => total + byte, 0);
  writeTarString(header, 148, 8, checksum.toString(8).padStart(6, "0") + "\0 ");

  const padding = Buffer.alloc((512 - (contents.length % 512)) % 512, 0);
  return Buffer.concat([header, contents, padding, Buffer.alloc(1024, 0)]);
}

function readSingleFileTar(tar) {
  assert.ok(tar.length >= 512, "Docker archive response is truncated.");
  const sizeText = tar.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
  const size = Number.parseInt(sizeText || "0", 8);
  assert.ok(Number.isFinite(size), "Docker archive has an invalid file size.");
  return tar.subarray(512, 512 + size);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function redact(message) {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]");
}

const filters = encodeURIComponent(JSON.stringify({
  label: [`com.supabase.cli.project=${projectId}`]
}));
const containers = parseJson(await dockerRequest("GET", `/containers/json?all=true&filters=${filters}`));
const databaseContainers = containers.filter(container =>
  container.Labels?.["com.supabase.cli.project"] === projectId &&
  container.Names?.includes(`/supabase_db_${projectId}`)
);
assert.equal(databaseContainers.length, 1, "Expected exactly one isolated Supabase database container.");
const containerId = databaseContainers[0].Id;

const contents = fs.readFileSync(sqlPath);
const inContainerName = `sporteventmap-${path.basename(sqlPath).replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
const logName = `${inContainerName}.log`;
const tar = createSingleFileTar(inContainerName, contents);
await dockerRequest(
  "PUT",
  `/containers/${encodeURIComponent(containerId)}/archive?path=/tmp`,
  tar,
  { "Content-Type": "application/x-tar" }
);

const execCreate = parseJson(await dockerRequest(
  "POST",
  `/containers/${encodeURIComponent(containerId)}/exec`,
  Buffer.from(JSON.stringify({
    AttachStdout: true,
    AttachStderr: true,
    Cmd: [
      "sh", "-c",
      `psql --quiet --set ON_ERROR_STOP=1 --username postgres --dbname postgres --file /tmp/${inContainerName} > /tmp/${logName} 2>&1`
    ]
  })),
  { "Content-Type": "application/json" }
));

await dockerRequest(
  "POST",
  `/exec/${encodeURIComponent(execCreate.Id)}/start`,
  Buffer.from(JSON.stringify({ Detach: true, Tty: false })),
  { "Content-Type": "application/json" }
);

const deadline = Date.now() + 600_000;
let execInspect;
do {
  execInspect = parseJson(await dockerRequest("GET", `/exec/${encodeURIComponent(execCreate.Id)}/json`));
  if (!execInspect.Running) break;
  if (Date.now() >= deadline) {
    throw new Error("Local psql import did not finish within ten minutes.");
  }
  await delay(250);
} while (true);

if (execInspect.ExitCode !== 0) {
  const logTar = await dockerRequest(
    "GET",
    `/containers/${encodeURIComponent(containerId)}/archive?path=${encodeURIComponent(`/tmp/${logName}`)}`
  );
  const logTail = redact(readSingleFileTar(logTar).toString("utf8").slice(-4000));
  throw new Error(`Local psql import failed with exit code ${execInspect.ExitCode}:\n${logTail}`);
}

process.stdout.write(`Imported ${contents.length} SQL bytes into isolated local database.\n`);
