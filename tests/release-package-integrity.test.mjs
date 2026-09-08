import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { CRITICAL_PATHS } = require("../tools/create-publish-package.js");
const { verifyReleaseArtifacts } = require("../tools/verify-release-package.js");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-integrity-"));
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const files = new Map(CRITICAL_PATHS.map(relativePath => [relativePath, `fixture ${relativePath}\n`]));
files.set("data/catalog-export-manifest.json", JSON.stringify({ metrics: { archive_rows: 2 } }));
files.set("data/event-editions-public.json", JSON.stringify({ editions: [{ edition_slug: "first" }, { edition_slug: "second" }] }));
files.set("event/first/index.html", "First event page");
files.set("event/second/index.html", "Second event page");
files.set("js/config.js", "public runtime config");

function restoreFiles() {
  for (const [relativePath, content] of files) {
    const filePath = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}
const entries = [...files].map(([relativePath, content]) => ({ path: relativePath, sha256: hash(content) }))
  .sort((left, right) => left.path.localeCompare(right.path));
const eventEntries = entries.filter(entry => entry.path.startsWith("event/"));
const digest = inventory => hash(inventory.map(entry => `${entry.path}\0${entry.sha256}\n`).join(""));
const release = {
  schema_version: 1,
  critical_files: Object.fromEntries(CRITICAL_PATHS.map(relativePath => [relativePath, hash(files.get(relativePath))])),
  event_pages: { count: eventEntries.length, aggregate_sha256: digest(eventEntries) },
  artifacts: { count: entries.length, aggregate_sha256: digest(entries) }
};

try {
  assert.ok(CRITICAL_PATHS.includes("css/mobile-discovery.css"));
  assert.ok(CRITICAL_PATHS.includes("js/mobile-discovery.js"));
  assert.ok(CRITICAL_PATHS.includes("js/freshness-batch-review.js"));
  restoreFiles();
  fs.writeFileSync(path.join(directory, "release.json"), JSON.stringify(release));
  assert.doesNotThrow(() => verifyReleaseArtifacts(directory, release), "Verified archive count must replace the historic hard-coded 994 pages");

  const incompleteManifest = structuredClone(release);
  delete incompleteManifest.critical_files["js/mobile-discovery.js"];
  assert.throws(() => verifyReleaseArtifacts(directory, incompleteManifest), /Missing critical file checksum/);

  for (const relativePath of ["js/mobile-discovery.js", "css/mobile-discovery.css", "js/freshness-batch-review.js"]) {
    fs.appendFileSync(path.join(directory, relativePath), "unexpected change");
    assert.throws(() => verifyReleaseArtifacts(directory, release), /Hash mismatch/);
    restoreFiles();
  }

  fs.appendFileSync(path.join(directory, "event/first/index.html"), "unexpected event change");
  assert.throws(() => verifyReleaseArtifacts(directory, release), /Event page inventory hash mismatch/);
  restoreFiles();

  fs.unlinkSync(path.join(directory, "event/second/index.html"));
  assert.throws(() => verifyReleaseArtifacts(directory, release), /Event page count differs from catalog archive/);
  restoreFiles();

  fs.appendFileSync(path.join(directory, "js/config.js"), "unexpected noncritical change");
  assert.throws(() => verifyReleaseArtifacts(directory, release), /Full artifact inventory hash mismatch/);
  restoreFiles();

  fs.writeFileSync(path.join(directory, "unexpected.txt"), "extra publish file");
  assert.throws(() => verifyReleaseArtifacts(directory, release), /Release artifact count differs from package/);
  fs.unlinkSync(path.join(directory, "unexpected.txt"));

  const wrongArchive = JSON.stringify({ metrics: { archive_rows: 3 } });
  fs.writeFileSync(path.join(directory, "data/catalog-export-manifest.json"), wrongArchive);
  const wrongArchiveRelease = structuredClone(release);
  wrongArchiveRelease.critical_files["data/catalog-export-manifest.json"] = hash(wrongArchive);
  assert.throws(() => verifyReleaseArtifacts(directory, wrongArchiveRelease), /Archive count differs from catalog manifest/);
  restoreFiles();
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log("Package verification checks all critical/mobile files and complete artifact/page inventories against the actual catalog count.");
