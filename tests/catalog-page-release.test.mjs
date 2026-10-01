import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { buildEventPage, selectPublicEditions, assertGeneratedCatalogPages } = require("../tools/generate-event-pages.js");
const { writeCatalogSnapshot } = require("../tools/export-supabase-event-catalog.js");
const { parseCsv } = require("../tools/event-table-utils.js");
const { verifyReleaseArtifacts } = require("../tools/verify-release-package.js");
const at = new Date().toISOString();
const event = {
  event_id: 7, edition_id: "11111111-1111-4111-8111-111111111111", edition_slug: "release-edition-2099", edition_year: 2099,
  event_name: 'Release fixture "same slug"', sport: "Running", date: "15.03.2099", city: "Berlin", country: "Germany",
  latitude: 52.52, longitude: 13.4, address: "Teststrasse", distance: "10 km",
  description: "The official synthetic fixture describes a concrete edition. Its updated date belongs to the same stable edition identity.\nA second quoted line stays in the same CSV record.",
  event_url: "https://example.test/2099", source_url: "https://example.test/2099", official_url: "https://example.test/2099",
  registration_url: "https://example.test/register", registration_status: "registration_open", event_status: "scheduled",
  verification_status: "verified", last_checked: at, next_check: new Date(Date.now() + 86400000).toISOString(),
  race_formats: [{ label: "10 km", distance_km: 10 }]
};
const other = { ...event, event_id: 8, edition_id: "22222222-2222-4222-8222-222222222222", edition_slug: "separate-edition-2099" };
assert.equal(selectPublicEditions([event], [event, other]).length, 2,
  "Coinciding names/dates/places must not merge two concrete edition IDs.");
assert.equal(selectPublicEditions([{ ...event, event_id: "7", latitude: "52.52" }], [event]).length, 1,
  "CSV strings and the archive join exactly the same edition.");
assert.throws(() => selectPublicEditions([event], [{ ...event, date: "16.03.2099" }]), /disagree.*date/);
assert.throws(() => selectPublicEditions([], [{ ...event, publication_status: "draft" }]), /Unpublished/);
const legacy = { event_name: "Legacy", date: event.date, city: event.city, country: event.country };
assert.equal(selectPublicEditions([legacy], [legacy]).length, 1, "Existing legacy-only inputs retain their natural key.");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sem-catalog-page-release-"));
const write = (relative, content) => {
  const file = path.join(directory, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
try {
  const args = { out: path.join(directory, "data/events.csv"), archiveOut: path.join(directory, "data/event-editions-public.json"),
    manifestOut: path.join(directory, "data/catalog-export-manifest.json"), allowUnhealthy: false };
  const snapshot = { schema_version: 1, consistency: "single_statement", measured_at: at,
    discovery_count: 1, archive_count: 1, discovery: [event], archive: [event],
    freshness_guard: { schema_version: 1, evaluated_at: at, requested_count: 1, decisions: { [event.edition_id]: true } } };
  const policy = { minimum_discovery_rows: 1, reference_discovery_rows: 1, maximum_discovery_drop_percent: 0,
    minimum_archive_rows: 1, reference_archive_rows: 1, maximum_archive_drop_percent: 0, minimum_freshness_rate: 55, minimum_completeness_rate: 45 };
  writeCatalogSnapshot({ args, snapshot, policy, exportedAt: at });
  const protectedBytes = [args.out, args.archiveOut, args.manifestOut].map(file => fs.readFileSync(file, "utf8"));
  const previousPage = buildEventPage({ ...event, date: "15.03.2098" }, event.edition_slug);
  write(`event/${event.edition_slug}/index.html`, previousPage);
  const pages = [{ slug: event.edition_slug }];
  assert.throws(() => assertGeneratedCatalogPages({ events: [event], pages, directory: path.join(directory, "event") }), /does not match/,
    "Same slug and rowcount do not make an old stored date acceptable.");
  write("dist/keep.txt", "previous package");

  for (const script of ["create-publish-package.js", "generate-event-pages.js", "generate-sitemap.js", "event-table-utils.js"]) {
    write(`tools/${script}`, fs.readFileSync(path.join(repositoryRoot, "tools", script)));
  }
  const source = fs.readFileSync(path.join(directory, "tools/create-publish-package.js"), "utf8");
  const copyEntries = vm.runInNewContext(source.match(/const COPY_ENTRIES = (\[[\s\S]*?\n\]);/)[1]);
  for (const relative of copyEntries) {
    if (!fs.existsSync(path.join(directory, relative))) write(relative, "Public local package fixture\n");
  }
  for (const relative of ["data/event-category-details.json", "data/event-knowledge.json", "data/event-detail-database.json"]) write(relative, "[]");
  write("index.html", "<html><head></head><body>Local package fixture</body></html>");
  write("RELEASE_VERSION.txt", "Version: 20261001-local-fixture-v1\n");
  write("js/config.js", 'window.SPORT_EVENT_MAP_CONFIG={supabaseUrl:"https://example.test",supabasePublishableKey:"public-fixture"};');
  const localRequire = createRequire(path.join(directory, "tools/create-publish-package.js"));
  const module = { exports: {} };
  // This narrow package test isolates Git and approval gates; the real gates
  // are covered in release-entrypoints.test.mjs. Generation, copy, public
  // config checks and package inventory validation run on actual local files.
  vm.runInNewContext(source, {
    __dirname: path.join(directory, "tools"), module, console: { log() {} }, process,
    require(name) {
      if (name === "./check-release-readiness") return { assertReleaseReadiness() {} };
      if (name === "child_process") return { execFileSync(command, argv) {
        assert.equal(command, "git");
        if (argv[0] === "status") return "";
        assert.deepEqual(Array.from(argv), ["rev-parse", "HEAD"]);
        return "1".repeat(40);
      } };
      return localRequire(name);
    }
  }, { filename: path.join(directory, "tools/create-publish-package.js") });
  module.exports.main();
  const generatedManifest = JSON.parse(fs.readFileSync(path.join(directory, "data/event-pages.json"), "utf8"));
  const storedHtml = fs.readFileSync(path.join(directory, "dist/event", event.edition_slug, "index.html"), "utf8");
  assert.notEqual(storedHtml, previousPage, "The package entry point must actually invoke the guarded generator.");
  assertGeneratedCatalogPages({ events: [event], pages: generatedManifest, directory: path.join(directory, "dist/event") });
  assert.match(storedHtml, /15\.03\.2099/);
  assert.doesNotMatch(storedHtml, /15\.03\.2098/);
  const csv = parseCsv(fs.readFileSync(path.join(directory, "dist/data/events.csv"), "utf8"))[0];
  const archive = JSON.parse(fs.readFileSync(path.join(directory, "dist/data/event-editions-public.json"), "utf8")).editions[0];
  assert.equal(csv.edition_id, archive.edition_id);
  assert.equal(csv.date, archive.date);
  assert.equal(csv.last_checked, event.last_checked);
  [args.out, args.archiveOut, args.manifestOut].forEach((file, index) => assert.equal(fs.readFileSync(file, "utf8"), protectedBytes[index]));
  const release = JSON.parse(fs.readFileSync(path.join(directory, "dist/release.json"), "utf8"));
  verifyReleaseArtifacts(path.join(directory, "dist"), release);

  // A conflicting input is rejected before the generator removes old pages.
  const localGenerator = localRequire("./generate-event-pages.js");
  const storedSourcePage = fs.readFileSync(path.join(directory, "event", event.edition_slug, "index.html"), "utf8");
  write("data/event-editions-public.json", JSON.stringify({ editions: [{ ...event, date: "16.03.2099" }] }));
  assert.throws(() => localGenerator.main(), /disagree.*date/);
  assert.equal(fs.readFileSync(path.join(directory, "event", event.edition_slug, "index.html"), "utf8"), storedSourcePage);
  write("data/event-editions-public.json", JSON.stringify({ editions: [event, other] }));
  const separateEditions = localGenerator.main();
  assert.equal(separateEditions.pages.length, 2, "The actual generator preserves both concrete identities, even with identical natural keys.");
  assert.deepEqual(separateEditions.events.map(row => row.edition_id), [event.edition_id, other.edition_id]);
  assertGeneratedCatalogPages({ ...separateEditions, directory: path.join(directory, "event") });
} finally { fs.rmSync(directory, { recursive: true, force: true }); }

console.log("Catalog pages preserve edition identity and a real package build refreshes/validates saved HTML against its export candidate.");
