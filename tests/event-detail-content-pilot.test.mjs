import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  buildEventPage,
  composeRichDetailRecords,
  getVerificationContext,
  resolveOrganizer
} = require("../tools/generate-event-pages.js");

const detailRows = JSON.parse(fs.readFileSync(
  path.join(root, "data", "event-detail-database.json"),
  "utf8"
));
const archive = JSON.parse(fs.readFileSync(
  path.join(root, "data", "event-editions-public.json"),
  "utf8"
)).editions;

const pilots = [
  {
    slug: "bmw-berlin-marathon-2026",
    organizer: "SCC EVENTS GmbH",
    organizerUrl: "https://www.scc-events.com/en/"
  },
  {
    slug: "mainova-frankfurt-marathon-2026",
    organizer: "motion events GmbH",
    organizerUrl: "https://www.motionevents.de/"
  },
  {
    slug: "generali-koln-marathon-2026",
    organizer: "Kölner Verein für AusdauerSport e.V.",
    organizerUrl: "https://www.ausdauersport.koeln/"
  },
  {
    slug: "haspa-marathon-hamburg-2027",
    organizer: "Marathon Hamburg Veranstaltungs GmbH",
    organizerUrl: "https://marathonhamburg.de/"
  },
  {
    slug: "adac-marathon-hannover-2027",
    organizer: "eichels GmbH",
    organizerUrl: "https://www.eichels-event.com/"
  },
  {
    slug: "challenge-roth-2027",
    organizer: "TEAMCHALLENGE GmbH",
    organizerUrl: "https://www.challenge-roth.com/de/"
  }
];

for (const pilot of pilots) {
  const scopedRows = detailRows.filter(row => row.event_slug === pilot.slug);
  assert.equal(scopedRows.length, 2, `${pilot.slug} must have exactly two scoped records`);
  assert.deepEqual(
    scopedRows.map(row => row.knowledge_scope).sort(),
    ["brand", "edition"]
  );

  const brand = scopedRows.find(row => row.knowledge_scope === "brand");
  const edition = scopedRows.find(row => row.knowledge_scope === "edition");
  assert.ok(brand.event_brand_id, `${pilot.slug} brand id missing`);
  assert.equal(brand.event_brand_id, edition.event_brand_id);
  assert.equal(brand.edition_id, undefined);
  assert.ok(edition.edition_id, `${pilot.slug} edition id missing`);
  assert.equal(brand.basis.organizer_name, pilot.organizer);
  assert.equal(brand.basis.organizer_url, pilot.organizerUrl);
  assert.equal(edition.basis.organizer_name, undefined);
  assert.equal(edition.basis.organizer_url, undefined);
  assert.equal(brand.registration, undefined);
  assert.equal(brand.race_day, undefined);
  assert.equal(brand.last_checked, "2026-08-24");
  assert.equal(edition.last_checked, "2026-08-24");

  for (const row of scopedRows) {
    assert.ok(row.sources.length, `${pilot.slug} ${row.knowledge_scope} sources missing`);
    for (const source of row.sources) {
      assert.equal(source.source_type, "official");
      assert.match(source.source_url, /^https:\/\//);
      assert.ok(source.field_path, `${pilot.slug} source field_path missing`);
      assert.equal(source.last_verified, "2026-08-24");
    }
  }

  const composed = composeRichDetailRecords(scopedRows);
  assert.deepEqual(resolveOrganizer({}, composed), {
    name: pilot.organizer,
    url: pilot.organizerUrl
  });
  assert.equal(composed.edition_id, edition.edition_id);
  assert.deepEqual(getVerificationContext({}, composed), {
    brand: {
      status: "verified_official_source",
      lastVerifiedAt: "2026-08-24"
    },
    edition: {
      status: "verified_official_source",
      lastVerifiedAt: "2026-08-24"
    }
  });

  const event = archive.find(row => row.edition_slug === pilot.slug);
  assert.ok(event, `${pilot.slug} archive edition missing`);
  const html = buildEventPage(event, pilot.slug, [], null, composed);
  assert.match(html, new RegExp(pilot.organizer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(html.includes(`href="${pilot.organizerUrl}"`));
  assert.match(html, /data-detail-verification-date="2026-08-24"/);
  const visibleHtml = html.replace(/<script[\s\S]*?<\/script>/g, "");
  assert.doesNotMatch(visibleHtml, /legacy_mixed|knowledge_scope|event_brand_id|edition_id/);
  const cutoffHeadings = visibleHtml.match(/<h3[^>]*>Cutoff-Zeiten<\/h3>/g) || [];
  assert.ok(cutoffHeadings.length <= 1, `${pilot.slug} must not render duplicate cutoff sections`);
}

for (const slug of ["adac-marathon-hannover-2027", "challenge-roth-2027"]) {
  const composed = composeRichDetailRecords(detailRows.filter(row => row.event_slug === slug));
  assert.match(composed.race_day.start_time, /Not yet officially confirmed/);
}
assert.doesNotMatch(
  JSON.stringify(composeRichDetailRecords(detailRows.filter(row => row.event_slug === "challenge-roth-2027"))),
  /06:30|6:30/
);

const remainingLegacy = detailRows
  .filter(row => !row.knowledge_scope)
  .map(row => row.event_slug)
  .sort();
assert.deepEqual(remainingLegacy, [
  "ironman-frankfurt-2026",
  "ironman-hamburg-european-championship-2026",
  "marathon-munchen-by-brooks-2026",
  "uniper-marathon-dusseldorf-2027"
]);

console.log("PASS six editorial pilots have verified Brand/Edition content and sources");
