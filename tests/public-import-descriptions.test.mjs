import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { mapStagingToPublicEvent } = require("../tools/promote-clean-staging-events.js");
const { parseEventCard, enrichOfficialUrls } = require("../tools/import-marathon-de.js");
const { writeCsvFile, parseCsvFile } = require("../tools/event-table-utils.js");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staging = {
  event_name: "Gutenberg Halbmarathon Mainz", sport: "Running", date: "02.05.2099",
  city: "Mainz", country: "Deutschland", address: "Mainz", latitude: "50.00",
  longitude: "8.27", distance: "21.1 km", event_url: "https://organizer.example/race",
  source_url: "https://organizer.example/race", last_checked: "2026-09-29"
};

test("staging promotion keeps unknown descriptions empty and audit notes separate", () => {
  const event = mapStagingToPublicEvent({ ...staging, description: "   ", import_batch: "review-123", source_note: "Official source reviewed." });
  assert.equal(event.description, "");
  assert.match(event.source_note, /Official source reviewed\./);
  assert.match(event.source_note, /Promoted from clean staging batch review-123\./);
  assert.equal(event.source_url, staging.source_url);
});

test("staging promotion preserves an actual event description", () => {
  const description = "Halbmarathon durch Mainz mit Ziel am Rhein.";
  assert.equal(mapStagingToPublicEvent({ ...staging, description }).description, description);
});

test("real CSV promotion writes no process prose into public or review descriptions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sem-import-descriptions-"));
  try {
    const files = Object.fromEntries(["staging", "events", "out", "review", "report"].map(name => [name, path.join(directory, `${name}.${name === "report" ? "json" : "csv"}`)]));
    writeCsvFile(files.events, []);
    const description = "Laufveranstaltung in Mainz.";
    writeCsvFile(files.staging, [
      staging,
      { ...staging, event_name: "Mainz Reviewlauf", event_url: "https://marathon.de/laufevent/review", source_url: "https://marathon.de/laufevent/review", description }
    ]);
    execFileSync(process.execPath, [path.join(repo, "tools/promote-clean-staging-events.js"), files.staging,
      "--events", files.events, "--out", files.out, "--review-out", files.review, "--report", files.report], { cwd: repo, stdio: "pipe" });
    const promoted = parseCsvFile(files.out);
    const review = parseCsvFile(files.review);
    assert.equal(promoted.length, 1);
    assert.equal(promoted[0].description, "");
    assert.match(promoted[0].source_note, /Promoted from clean staging batch/);
    assert.equal(review.length, 1);
    assert.equal(review[0].description, description);
    assert.match(review[0].source_note, /Not promoted: Official website missing or aggregator URL/);
  } finally {
    const resolved = fs.realpathSync(directory);
    const parent = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith("sem-import-descriptions-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test("marathon listing imports source metadata without fabricating a public description", async () => {
  const event = parseEventCard(`<div class="eventstext"><a href="/laufevent/mainz">Mainz Halbmarathon</a></div>
    <div class="eventsdistanz">21.1 km</div><div class="eventsort">Mainz, Deutschland</div>
    <div class="eventsdatum">02.05.2099</div>`);
  assert.ok(event);
  assert.equal(event.description, "");
  assert.equal(event.source_url, "https://www.marathon.de/laufevent/mainz");
  assert.equal(event.source_note, "Imported from marathon.de Laufkalender.");
  // A resolved organizer link must keep listing provenance out of any real prose.
  event.description = "Laufveranstaltung in Mainz.";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, event.source_url);
    return { ok: true, text: async () => 'Homepage: <a href="https://organizer.example/race">Veranstalter</a>' };
  };
  try {
    await enrichOfficialUrls([event]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(event.event_url, "https://organizer.example/race");
  assert.equal(event.description, "Laufveranstaltung in Mainz.");
  assert.equal(event.source_url, "https://www.marathon.de/laufevent/mainz");
  assert.match(event.source_note, /Imported from marathon\.de Laufkalender\. Source listing: https:\/\/www\.marathon\.de\/laufevent\/mainz/);
});
