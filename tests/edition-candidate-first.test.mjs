import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractLifecycleSignals,
  selectLifecycleSuccessors,
  selectLifecycleResults
} from "../supabase/functions/_shared/source-monitor-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read("supabase/migrations/20260817124600_edition_candidate_first_lifecycle.sql");
const worker = read("supabase/functions/event-source-check/index.ts");
const audit = read("docs/EDITION_LIFECYCLE_FOUNDATION_AUDIT.md");

for (const fragment of [
  "validation_status text not null default 'pending'",
  "validation_reasons text[] not null",
  "crawl_source_event_mismatch",
  "source_not_authoritative",
  "manual_lock_active",
  "cancellation_or_postponement_signal",
  "contradictory_candidate_date",
  "explicit candidate ids are required",
  "create or replace view public.admin_event_edition_lifecycle_state",
  "next_edition_unknown_watching",
  "future.publication_status = 'published'",
  "edition.edition_status in ('scheduled', 'cancelled')",
  "foreign key (edition_id) references public.event_editions(id) on delete restrict",
  "source_row.edition_id is not null",
  "now(), 'pending', 0",
  "'[]'::jsonb",
  "false,",
  "edition_lifecycle_publication_automation_disabled_check"
]) {
  assert.ok(
    migration.includes(fragment) || (fragment === "edition_lifecycle_publication_automation_disabled_check" &&
      read("supabase/migrations/20260817121601_data_quality_stabilization.sql").includes(fragment)),
    `Candidate-first migration missing ${fragment}`
  );
}

const registerBody = migration.slice(
  migration.indexOf("create or replace function public.register_edition_successor_candidate"),
  migration.indexOf("create or replace function public.approve_edition_succession_candidates")
);
assert.doesNotMatch(registerBody, /insert into public\.event_editions/i,
  "Detection must not create an edition or hidden draft.");
assert.doesNotMatch(registerBody, /predecessor\.race_formats|predecessor\.legacy_distance/i,
  "Candidate registration must not copy predecessor facts.");

const approvalBody = migration.slice(
  migration.indexOf("create or replace function public.approve_edition_succession_candidates"),
  migration.indexOf("create or replace function private.run_edition_lifecycle")
);
assert.match(approvalBody, /insert into public\.event_editions/i);
assert.match(approvalBody, /candidate_status = 'detected'[\s\S]*validation_status = 'validated'/i);
assert.doesNotMatch(approvalBody, /predecessor\.race_formats|predecessor\.legacy_distance/i);

assert.match(worker, /\.eq\("publication_status", "published"\)/);
assert.match(worker, /selectLifecycleSuccessors/);
assert.match(worker, /filter\(proposal => proposal\.change_type !== "new_edition"\)/);

const structuredSignals = extractLifecycleSignals(`
  <script type="application/ld+json">{
    "@context":"https://schema.org",
    "@type":"SportsEvent",
    "name":"IRONMAN Hamburg 2027",
    "startDate":"2027-06-06"
  }</script>
`, "text/html", "https://example.com/event");
assert.deepEqual(
  selectLifecycleSuccessors(structuredSignals, { edition_year: 2026, start_date: "2026-06-07" }, "2026-08-17")
    .map(candidate => candidate.start_date),
  ["2027-06-06"]
);

const ambiguousVisibleSignals = extractLifecycleSignals(
  "Termine 06.06.2027 und 13.06.2027", "text/html", "https://example.com/event"
);
assert.deepEqual(
  selectLifecycleSuccessors(ambiguousVisibleSignals, { edition_year: 2026 }, "2026-08-17"),
  [],
  "Multiple weak visible dates must not become arbitrary successor candidates."
);

const rotatingThirdPartyDate = extractLifecycleSignals(
  "Weitere Veranstaltungen auf der Insel: 20.08.2027",
  "text/html",
  "https://tourism.example/event"
);
assert.deepEqual(
  selectLifecycleSuccessors(
    rotatingThirdPartyDate,
    { edition_year: 2026 },
    "2026-08-17",
    { source_type: "third_party_platform" }
  ),
  [],
  "A lone visible date on a third-party page must not create a successor candidate."
);

assert.deepEqual(
  selectLifecycleSuccessors(
    structuredSignals,
    { edition_year: 2026, start_date: "2026-06-07" },
    "2026-08-17",
    { source_type: "third_party_platform" }
  ).map(candidate => candidate.start_date),
  ["2027-06-06"],
  "Named JSON-LD event evidence remains eligible on a third-party page."
);

const postponedSignals = extractLifecycleSignals(`
  <script type="application/ld+json">{
    "@type":"SportsEvent",
    "name":"IRONMAN Hamburg 2027",
    "startDate":"2027-06-06",
    "eventStatus":"https://schema.org/EventPostponed"
  }</script>
`, "text/html", "https://example.com/event");
assert.deepEqual(postponedSignals.editions[0].risk_signals, ["postponement"]);

assert.equal(structuredSignals.editions[0].registration_url, null,
  "Missing registration evidence must stay empty, never become the source homepage.");
for (const deadline of [
  "Registration deadline: 2027-03-01", "Registration opening: 2027-03-01",
  "Withdrawal deadline: 01.03.2027", "Rücktritt bis 01.03.2027",
  "Anmeldung öffnet am 01.03.2027", "Abmeldung: 1. März 2027"
]) {
  assert.deepEqual(extractLifecycleSignals(`<p>${deadline}</p>`).editions, [],
    `A deadline must not become a successor edition: ${deadline}`);
}
assert.deepEqual(extractLifecycleSignals(`
  <p>Race day: 6 May 2027.</p><p>Withdrawal deadline: 1 April 2027.</p>
  <footer>News: 2027-06-01</footer>
`).editions.map(candidate => candidate.start_date), ["2027-05-06"],
"Lifecycle dates reuse the contextual date parser and ignore footer/deadline dates.");
const weekend = extractLifecycleSignals("<p>Race day: 6–7 May 2027.</p>");
assert.deepEqual(weekend.editions.map(candidate => [candidate.start_date, candidate.end_date]), [["2027-05-06", "2027-05-07"]],
  "A race weekend is one edition range, not two conflicting start dates.");

const calendarSignals = extractLifecycleSignals(`<script type="application/ld+json">[
  {"@type":"SportsEvent","name":"IRONMAN Hamburg 2027","startDate":"2027-06-06"},
  {"@type":"SportsEvent","name":"Berlin Halbmarathon 2027","startDate":"2027-04-04"}
]</script>`, "text/html", "https://example.com/events");
assert.deepEqual(selectLifecycleSuccessors(calendarSignals, { edition_year: 2026 }, "2026-09-20", {
  source_type: "official_event_website", event_name: "IRONMAN Hamburg"
}).map(candidate => candidate.start_date), ["2027-06-06"],
"An organizer calendar must not attach another brand's event to the monitored series.");
assert.deepEqual(selectLifecycleSuccessors(calendarSignals, { edition_year: 2026 }, "2026-09-20", {
  source_type: "official_event_website", event_name: "Bodensee Triathlon"
}), [], "Unrelated structured events must not fall back to arbitrary visible dates.");

const resultsArchive = extractLifecycleSignals(`
  <a href="/results/2027">Results 2027</a><a href="/results/2026">Results 2026</a>
  <a href="/results">Results</a><a href="/results/2025">Results 2026</a>
`, "text/html", "https://example.com/event");
assert.deepEqual(selectLifecycleResults(resultsArchive, { edition_year: 2026 }).map(result => result.url),
  ["https://example.com/results/2026"],
  "Results from another or an unknown/conflicting year must not attach to the source's historical edition.");
assert.deepEqual(selectLifecycleResults(resultsArchive, null), []);
const duplicatedStatus = extractLifecycleSignals(`<script type="application/ld+json">[
  {"@type":"SportsEvent","name":"Testlauf","startDate":"2027-06-06"},
  {"@type":"SportsEvent","name":"Testlauf","startDate":"2027-06-06","eventStatus":"https://schema.org/EventCancelled"}
]</script>`);
assert.deepEqual(duplicatedStatus.editions[0].risk_signals, ["cancellation"],
  "Deduplicating structured dates must preserve cancellation evidence from every matching entry.");

for (const fragment of [
  "Legacy-Synchronisation",
  "season_planner_events.edition_id",
  "detect -> validate -> candidate -> review/approval -> edition",
  "Diese Stufe fuehrt keinen Backfill"
]) assert.ok(audit.includes(fragment), `Foundation audit missing ${fragment}`);

console.log("Edition candidate-first lifecycle, safety gates, watching state and worker routing verified.");
