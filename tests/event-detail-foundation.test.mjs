import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  buildEventPage,
  buildSchema,
  createSlug,
  formatVerificationDate,
  getVerificationContext,
  resolveOrganizer
} = require("../tools/generate-event-pages.js");
const { mapDiscoveryRow } = require("../tools/export-supabase-event-catalog.js");
const { buildExportRecord } = require("../tools/export-event-detail-database.js");

function event(overrides = {}) {
  return {
    event_id: 42,
    edition_id: "11111111-1111-4111-8111-111111111111",
    edition_year: 2027,
    edition_slug: "test-city-marathon-2027",
    event_name: "Test City Marathon",
    sport: "Running",
    date: "18.04.2027",
    city: "Berlin",
    country: "Germany",
    address: "Berlin, Germany",
    latitude: "52.52",
    longitude: "13.405",
    distance: "42.195 km",
    official_url: "https://event.example/",
    registration_url: "https://event.example/register-2027",
    registration_status: "registration_not_open",
    edition_verification_status: "verified",
    edition_last_verified_at: "2026-08-18T09:30:00+00:00",
    ...overrides
  };
}

const brandedEvent = event({
  organizer_name: "Example Events GmbH",
  organizer_url: "https://organizer.example/",
  brand_verification_status: "verified",
  brand_last_verified_at: "2026-08-10T10:00:00+00:00"
});
const brandedPage = buildEventPage(
  brandedEvent,
  "test-city-marathon-2027"
);

assert.deepEqual(resolveOrganizer(brandedEvent), {
  name: "Example Events GmbH",
  url: "https://organizer.example/"
});
assert.doesNotMatch(brandedPage, /id="event-brand"/);
const brandedFacts = /<section id="key-facts"[\s\S]*?<\/section>/.exec(brandedPage)?.[0] || "";
assert.match(brandedFacts, /<h2>Test City Marathon \u00b7 18\.04\.2027<\/h2>/);
assert.match(brandedFacts, />Example Events GmbH<\/a>/);
assert.match(brandedFacts, /href="https:\/\/organizer\.example\/"/);
assert.ok(
  brandedPage.indexOf('id="key-facts"') < brandedPage.indexOf('id="registration"'),
  "Key Facts must remain the first public detail section"
);

const schema = JSON.parse(buildSchema(
  brandedEvent,
  "https://sporteventmap.com/event/test-city-marathon-2027/"
));
assert.deepEqual(schema.organizer, {
  "@type": "Organization",
  name: "Example Events GmbH",
  url: "https://organizer.example/"
});

const noOrganizerPage = buildEventPage(
  event({
    organizer_name: "",
    organizer_url: "",
    data_source: "Random Calendar Aggregator"
  }),
  "test-city-marathon-2027"
);
const noOrganizerFacts = /<section id="key-facts"[\s\S]*?<\/section>/.exec(noOrganizerPage)?.[0] || "";
assert.doesNotMatch(noOrganizerFacts, /detail\.organizer/);
assert.doesNotMatch(noOrganizerPage, /Random Calendar Aggregator/);
assert.equal(resolveOrganizer({ data_source: "Random Calendar Aggregator" }), null);

const internalOrganizerValue = "Supabase public_event_discovery export";
const internalOrganizerPage = buildEventPage(
  event({
    organizer_name: internalOrganizerValue,
    organizer_url: "",
    edition_last_verified_at: "source-monitor-run-42"
  }),
  "internal-metadata-test-2027"
);
assert.equal(resolveOrganizer({ organizer_name: internalOrganizerValue }), null);
assert.doesNotMatch(internalOrganizerPage, /Supabase public_event_discovery export/);
assert.doesNotMatch(internalOrganizerPage, /source-monitor-run-42/);
assert.equal(
  resolveOrganizer(
    { organizer_name: internalOrganizerValue },
    { brand: { organizer: "Safe Organizer e.V." } }
  ).name,
  "Safe Organizer e.V."
);

assert.equal(
  formatVerificationDate("2026-08-18T09:30:00+00:00", "de"),
  "18. August 2026"
);
assert.equal(formatVerificationDate("source-monitor-run-42", "de"), "");
assert.match(brandedPage, /data-detail-verification-date="2026-08-18"/);
assert.equal(
  getVerificationContext({
    updated_at: "2026-08-24T12:00:00Z",
    generated_at: "2026-08-24T13:00:00Z",
    source_last_fetched_at: "2026-08-24T14:00:00Z"
  }).edition.lastVerifiedAt,
  ""
);
const noVerificationPage = buildEventPage(
  event({
    edition_last_verified_at: "",
    last_checked: "",
    updated_at: "2026-08-24T12:00:00Z",
    generated_at: "2026-08-24T13:00:00Z",
    source_last_fetched_at: "2026-08-24T14:00:00Z"
  }),
  "unverified-test-city-marathon-2027"
);
assert.doesNotMatch(noVerificationPage, /data-detail-verification-date="2026-08-24"/);

const mapped = mapDiscoveryRow({
  event_name: "Mapped Event",
  registration_status: "unknown",
  verification_status: "verified",
  last_checked: "2026-08-17T10:00:00Z",
  edition_last_verified_at: "2026-08-18T10:00:00Z",
  updated_at: "2026-08-24T10:00:00Z"
}, "2026-08-24T11:00:00Z");
assert.equal(mapped.last_checked, "2026-08-18T10:00:00Z");
assert.equal(mapped.edition_last_verified_at, "2026-08-18T10:00:00Z");
assert.notEqual(mapped.last_checked, "2026-08-24T11:00:00Z");
assert.equal(mapped.data_source, "Sport Event Map verified event catalog");
assert.doesNotMatch(mapped.data_source, /supabase|public_event_discovery/i);

const publicCatalog = fs.readFileSync(path.join(root, "data/events.csv"), "utf8");
assert.doesNotMatch(publicCatalog, /Supabase public_event_discovery export/);

const sharedBrand = {
  brand: {
    organizer: "Reusable Organizer e.V.",
    official_website: "https://reusable-event.example/"
  }
};
const edition2026 = buildEventPage(
  event({
    edition_year: 2026,
    edition_slug: "reusable-event-2026",
    date: "20.09.2026",
    registration_url: "https://reusable-event.example/register-2026",
    distance: "10 km",
    organizer_name: "",
    official_url: ""
  }),
  "reusable-event-2026",
  [],
  null,
  sharedBrand
);
const edition2027 = buildEventPage(
  event({
    edition_year: 2027,
    edition_slug: "reusable-event-2027",
    date: "",
    event_status: "date_unconfirmed",
    registration_url: "",
    registration_status: "unknown",
    distance: "",
    organizer_name: "",
    official_url: ""
  }),
  "reusable-event-2027",
  [],
  null,
  sharedBrand
);
assert.match(edition2026, /Reusable Organizer e\.V\./);
assert.match(edition2027, /Reusable Organizer e\.V\./);
assert.match(edition2026, /register-2026/);
assert.doesNotMatch(edition2027, /register-2026/);
assert.doesNotMatch(edition2027, />10 km</);
const edition2027Facts = /<section id="key-facts"[\s\S]*?<\/section>/.exec(edition2027)?.[0] || "";
assert.match(edition2027Facts, /Not yet officially confirmed/);
assert.match(edition2027Facts, /<h2>Test City Marathon<\/h2>/);
assert.doesNotMatch(edition2027Facts, /data-detail-i18n="detail\.edition"|>Edition(?:\s|<)/);

const seen = new Set();
assert.equal(createSlug(event({ edition_slug: "stable-public-slug-2027" }), seen), "stable-public-slug-2027");
assert.match(brandedPage, /<link rel="canonical" href="https:\/\/sporteventmap\.com\/event\/test-city-marathon-2027\/"/);
assert.match(brandedPage, /window\.sportEventMapDetailConfig/);

const knowledgeGroups = Object.fromEntries([
  "registration", "course", "race_day", "travel", "weather",
  "statistics", "editorial", "sources", "faq"
].map(name => [name, new Map()]));
const exportedKnowledge = buildExportRecord({
  id: "22222222-2222-4222-8222-222222222222",
  event_slug: "linked-event-2027",
  event_brand_id: 42,
  edition_id: "11111111-1111-4111-8111-111111111111",
  knowledge_scope: "edition",
  organizer: "Legacy Organizer Copy",
  verification_status: "verified_official_source",
  last_checked: "2026-08-18"
}, knowledgeGroups);
assert.equal(exportedKnowledge.knowledge_scope, "edition");
assert.equal(exportedKnowledge.verification.edition.last_verified_at, "2026-08-18");
assert.equal(exportedKnowledge.basis.organizer, undefined);

const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260824_event_detail_verification_foundation.sql"),
  "utf8"
);
for (const fragment of [
  "add column if not exists organizer_url text",
  "knowledge_scope in ('brand', 'edition', 'legacy_mixed')",
  "event_brand_id bigint references public.events",
  "edition_id uuid references public.event_editions",
  "with (security_invoker = true)",
  "event.organizer_name",
  "event.last_verified_at as brand_last_verified_at",
  "edition.last_verified_at as edition_last_verified_at",
  "Technical source-monitor fetch time"
]) {
  assert.ok(migration.includes(fragment), `Detail foundation migration missing: ${fragment}`);
}

const generatorSource = fs.readFileSync(
  path.join(root, "tools/generate-event-pages.js"),
  "utf8"
);
assert.doesNotMatch(generatorSource, /firstUsefulValue\(basis\.organizer, event\.data_source\)/);

console.log("PASS event detail Brand/Edition/verification foundation and static URL regressions");
