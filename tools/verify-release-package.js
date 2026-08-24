const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function main() {
  const releasePath = path.join(DIST, "release.json");
  assert.equal(fs.existsSync(releasePath), true, "dist/release.json is missing");
  const release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: ROOT,
    encoding: "utf8"
  }).trim();

  assert.match(release.version, /^\d{8}-[a-z0-9-]+-v\d+$/);
  assert.equal(release.git_commit, head);
  assert.equal(release.source_dirty, false);
  assert.equal(status, "", "Release verification requires a clean source tree");
  assert.equal(Number.isFinite(Date.parse(release.built_at)), true);
  Object.entries(release.critical_files).forEach(([relativePath, expected]) => {
    assert.equal(sha256(path.join(DIST, relativePath)), expected, `Hash mismatch: ${relativePath}`);
  });
  assert.equal(release.event_pages.count, 994);
  console.log(`Verified release ${release.version} at ${release.git_commit} (${release.built_at}).`);
}

if (require.main === module) main();
