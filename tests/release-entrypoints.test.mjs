import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PUBLIC_CATALOG_COLUMNS } = require("../tools/export-supabase-event-catalog.js");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8")).scripts;

assert.equal(scripts.check, "node tools/check-release-readiness.js");
assert.equal(scripts["test:all"], "npm run check && npm run test:code");
assert.ok(scripts["test:gate"].startsWith("npm run check && "));
assert.equal(scripts["prepare-package"], "node tools/create-publish-package.js");
assert.equal(scripts["verify-package"], "node tools/verify-release-package.js");
const technicalGroups = [
  "test:release-entrypoints", "test:catalog-release", "test:catalog-loader",
  "test:data-freshness", "test:alert-dispatch", "test:static", "test:quality",
  "test:quality-review", "test:germany-expansion", "test:data-workflow",
  "test:event-automation", "test:source-monitor", "test:stage-four",
  "test:edition-lifecycle", "audit:layout", "test:e2e"
];
assert.deepEqual(scripts["test:code"].split(" && "), technicalGroups.map(group => `npm run ${group}`),
  "Technical checks must retain all existing groups, including data-gate fixture tests and browser checks");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-entrypoints-"));
const sha256 = content => crypto.createHash("sha256").update(content).digest("hex");
const write = (relativePath, content) => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};
const writeJson = (relativePath, value) => write(relativePath, JSON.stringify(value));
function snapshot(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? snapshot(filePath) : [[path.relative(root, filePath), sha256(fs.readFileSync(filePath))]];
  }).sort((left, right) => left[0].localeCompare(right[0]));
}
function run(script) {
  return spawnSync(process.execPath, [path.join(root, "tools", script)], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000
  });
}

try {
  // Copy the real entry points and checks; only the isolated source/data inputs
  // are fixtures. Never run a generator or modify the repository's catalog.
  for (const script of [
    "check-release-readiness.js", "check-publish-readiness.js",
    "check-data-quality-release.js", "check-catalog-release.js",
    "create-publish-package.js", "verify-release-package.js",
    "export-supabase-event-catalog.js", "event-table-utils.js", "find-duplicate-candidates.js"
  ]) {
    write(`tools/${script}`, fs.readFileSync(path.join(repositoryRoot, "tools", script)));
  }
  for (const script of ["generate-event-pages.js", "generate-sitemap.js"]) {
    write(`tools/${script}`, 'require("fs").writeFileSync(require("path").join(__dirname, "..", "generator-ran.txt"), "unexpected mutation");');
  }
  const indexHtml = [
    '<script src="js/config.js"></script><script src="js/supabase.js"></script>',
    '<a href="imprint.html">Imprint</a><a href="privacy.html">Privacy</a>',
    '<a href="mailto:kontakt@sporteventmap.com">Contact</a>',
    ...["landingDiscoverBtn", "landingSeasonBtn", "loginBtn", "logoutBtn", "seasonPlannerBtn",
      "seasonCountdownCards", "seasonTrainingBlocks", "seasonRecommendedEvents", "feedbackModal"]
      .map(id => `<div id="${id}"></div>`)
  ].join("\n");
  write("index.html", indexHtml);
  write("imprint.html", "Fixture imprint");
  write("privacy.html", "Fixture privacy");
  write(".gitignore", "data/imports/private/geoapify-key.txt\n");
  write("css/style.css", "--bg-dark --accent-green --space-md --button-primary-bg .landing-return-section .season-countdown-card");
  write("js/events.js", "renderSeasonMonthCalendar getSeasonTrainingBlocks seasonCountdownCards data-season-note recommendation_clicked planner_opened");
  writeJson("data/imports/review/priority-events-report.json", { missing: 0 });
  write("dist/keep.txt", "previous verified package must survive a failed preflight");
  write("event/keep/index.html", "previous generated page");
  write("sitemap.xml", "previous sitemap");

  const policy = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "data/catalog-release-policy.json"), "utf8"));
  writeJson("data/catalog-release-policy.json", policy);
  const discoveryCount = Math.max(policy.minimum_discovery_rows, policy.reference_discovery_rows);
  const archiveCount = Math.max(policy.minimum_archive_rows, policy.reference_archive_rows);
  const events = Array.from({ length: discoveryCount }, (_, index) => ({
    event_name: `Fixture Event ${index}`, sport: "Running", date: "01.01.2099",
    city: `Fixture City ${index}`, country: "Germany", latitude: "52.52", longitude: "13.405",
    distance: "10 km", event_url: `https://example.test/events/${index}`,
    verification_status: "confirmed", edition_id: `fixture-edition-${index}`
  }));
  const csv = [PUBLIC_CATALOG_COLUMNS.join(";"), ...events.map(event =>
    PUBLIC_CATALOG_COLUMNS.map(column => event[column] || "").join(";")), ""].join("\n");
  write("data/events.csv", csv);
  const auditEvents = events.map(event => ({ event_id: event.edition_id, severity: "clean", issues: [] }));
  const now = new Date().toISOString();

  function writeHealthyData({ exportedAt = now, freshness = 100 } = {}) {
    write("index.html", indexHtml);
    const archive = JSON.stringify({ exported_at: exportedAt, editions: Array.from({ length: archiveCount }, (_, index) => ({ edition_slug: `fixture-${index}` })) });
    write("data/event-editions-public.json", archive);
    writeJson("data/event-pages.json", Array.from({ length: archiveCount }, (_, index) => ({ slug: `fixture-${index}` })));
    writeJson("data/catalog-export-manifest.json", {
      schema_version: 1, exported_at: exportedAt,
      sha256: { discovery: sha256(csv), archive: sha256(archive) },
      metrics: { discovery_rows: discoveryCount, archive_rows: archiveCount, freshness_rate: freshness, completeness_rate: 100 }
    });
    writeJson("data/review/duplicate-candidates.json", {
      schema_version: 2, generated_at: now, input_sha256: sha256(csv), events_checked: discoveryCount,
      exact_duplicates: 0, release_blocking_candidates: 0, unresolved_release_blocking_candidates: 0, candidates: []
    });
    for (const kind of ["date", "geo"]) writeJson(`reports/event-${kind}-audit.json`, {
      schema_version: 2, generated_at: now, input_sha256: sha256(csv), total_events: discoveryCount,
      summary: { critical: 0 }, events: auditEvents
    });
  }
  const updateJson = (relativePath, update) => {
    const value = JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
    update(value);
    writeJson(relativePath, value);
  };

  writeHealthyData();
  const healthy = run("check-release-readiness.js");
  assert.equal(healthy.status, 0, healthy.error?.message || healthy.stderr || healthy.stdout);
  assert.match(healthy.stdout, /LAUNCH READY/);
  assert.match(healthy.stdout, /DATA QUALITY RELEASE READY/);
  assert.match(healthy.stdout, /CATALOG RELEASE READY/);

  const cases = [
    { name: "stale export", expected: /FAIL export age/, change: () => writeHealthyData({ exportedAt: new Date(Date.now() - 48 * 3600000).toISOString() }) },
    { name: "unhealthy freshness", expected: /FAIL freshness floor/, change: () => writeHealthyData({ freshness: policy.minimum_freshness_rate - 1 }) },
    { name: "unresolved duplicate", expected: /FAIL unresolved release-blocking duplicate candidates/, change: () => updateJson("data/review/duplicate-candidates.json", report => {
      report.release_blocking_candidates = report.unresolved_release_blocking_candidates = 1;
      report.candidates = [{ candidate_id: "fixture-duplicate", classification: "high_confidence_duplicate", release_blocking: true, confidence: 99,
        reasons: [{ code: "same_url_same_date" }], resolution: { status: "unresolved", reviewed_at: "", note: "" } }];
    }) },
    { name: "missing geo audit", expected: /FAIL geo report exists/, change: () => fs.unlinkSync(path.join(root, "reports/event-geo-audit.json")) },
    { name: "outdated audit checksum", expected: /FAIL date report input checksum/, change: () => updateJson("reports/event-date-audit.json", report => { report.input_sha256 = "obsolete"; }) },
    { name: "critical country error", expected: /FAIL coordinates outside country bounding box/, change: () => updateJson("reports/event-geo-audit.json", report => { report.events[0].issues = ["coordinates_outside_country_bbox"]; }) },
    { name: "publishable secret", expected: /FAIL Private key marker found/, change: () => write("index.html", `${indexHtml}\n${["-----BEGIN", "PRIVATE KEY-----"].join(" ")}`) }
  ];
  for (const testCase of cases) {
    writeHealthyData();
    testCase.change();
    for (const entrypoint of ["check-release-readiness.js", "create-publish-package.js", "verify-release-package.js"]) {
      const before = snapshot();
      const result = run(entrypoint);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.equal(result.error, undefined, `${testCase.name}/${entrypoint}: ${result.error?.message}`);
      assert.notEqual(result.status, 0, `${testCase.name}/${entrypoint} must fail`);
      assert.match(output, testCase.expected, `${testCase.name}/${entrypoint} must run the real data/publish check`);
      assert.doesNotMatch(output, /Publish package ready|Verified release/);
      assert.deepEqual(snapshot(), before, `${testCase.name}/${entrypoint} must not mutate source, generated pages or an existing package`);
    }
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("Release entry points share strict checks and block unsafe input before any file mutation; code tests retain all technical groups.");
