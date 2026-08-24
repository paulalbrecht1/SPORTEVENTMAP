const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow" });
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const baseUrl = String(process.argv[2] || "").replace(/\/$/, "");
  assert.match(baseUrl, /^https:\/\//, "Pass the HTTPS deployment URL.");
  const local = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "release.json"), "utf8"));
  const remoteBytes = await fetchBytes(`${baseUrl}/release.json`);
  const remote = JSON.parse(remoteBytes.toString("utf8"));

  assert.equal(remote.version, local.version, "Release version mismatch");
  assert.equal(remote.git_commit, local.git_commit, "Git commit mismatch");
  assert.equal(remote.built_at, local.built_at, "Build timestamp mismatch");
  assert.deepEqual(remote.critical_files, local.critical_files, "Critical-file manifest mismatch");
  assert.deepEqual(remote.event_pages, local.event_pages, "Event-page manifest mismatch");

  for (const [relativePath, expected] of Object.entries(local.critical_files)) {
    const content = await fetchBytes(`${baseUrl}/${relativePath}`);
    assert.equal(sha256(content), expected, `Remote hash mismatch: ${relativePath}`);
  }

  console.log(`Verified deployment ${local.version} at ${local.git_commit} (${baseUrl}).`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { fetchBytes, main, sha256 };
