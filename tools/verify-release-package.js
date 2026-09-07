const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { assertReleaseReadiness } = require("./check-release-readiness");
const { CRITICAL_PATHS, inventoryDigest } = require("./create-publish-package");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function artifactInventory(directory, root = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `Unexpected package symlink: ${filePath}`);
    if (entry.isDirectory()) return artifactInventory(filePath, root);
    const relativePath = path.relative(root, filePath).replaceAll("\\", "/");
    return relativePath === "release.json" ? [] : [{ path: relativePath, sha256: sha256(filePath) }];
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function verifyReleaseArtifacts(directory, release) {
  assert.equal(release.schema_version, 1, "Unsupported release manifest schema");
  for (const relativePath of CRITICAL_PATHS) {
    assert.match(release.critical_files?.[relativePath] || "", /^[a-f0-9]{64}$/,
      `Missing critical file checksum: ${relativePath}`);
  }
  for (const [relativePath, expected] of Object.entries(release.critical_files)) {
    assert.ok(CRITICAL_PATHS.includes(relativePath), `Unknown critical file: ${relativePath}`);
    assert.equal(sha256(path.join(directory, relativePath)), expected, `Hash mismatch: ${relativePath}`);
  }

  const entries = artifactInventory(directory);
  const eventPages = entries.filter(entry => /^event\/[^/]+\/index\.html$/.test(entry.path));
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "data", "catalog-export-manifest.json"), "utf8"));
  const archive = JSON.parse(fs.readFileSync(path.join(directory, "data", "event-editions-public.json"), "utf8"));
  assert.ok(Array.isArray(archive.editions), "Archive editions are missing");
  assert.equal(archive.editions.length, manifest.metrics?.archive_rows, "Archive count differs from catalog manifest");
  assert.equal(eventPages.length, archive.editions.length, "Event page count differs from catalog archive");
  assert.equal(release.event_pages?.count, eventPages.length, "Release event page count differs from package");
  assert.equal(release.event_pages?.aggregate_sha256, inventoryDigest(eventPages), "Event page inventory hash mismatch");
  assert.equal(release.artifacts?.count, entries.length, "Release artifact count differs from package");
  assert.equal(release.artifacts?.aggregate_sha256, inventoryDigest(entries), "Full artifact inventory hash mismatch");
}

function main() {
  assertReleaseReadiness();
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
  verifyReleaseArtifacts(DIST, release);
  console.log(`Verified release ${release.version} at ${release.git_commit} (${release.built_at}).`);
}

if (require.main === module) main();

module.exports = { verifyReleaseArtifacts };
