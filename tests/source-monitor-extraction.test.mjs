import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDateCandidates, normalizeDate } from "../supabase/functions/_shared/extractors/date-extractor.mjs";
import { extractEventChanges, PLATFORM_ADAPTERS } from "../supabase/functions/_shared/extractors/pipeline.mjs";
import { normalizeCountry, normalizeDistance, valuesEqual } from "../supabase/functions/_shared/extractors/normalization.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => fs.readFileSync(path.join(root, "fixtures", "source-extraction", name), "utf8");
const now = new Date("2026-08-04T10:00:00Z");
const base = {
  contentType: "text/html", sourceUrl: "https://official.example/event",
  event: { id: 1, event_name: "Köln Marathon", canonical_name: "Köln Marathon", city: "Köln", country: "DE", sport: "running" },
  edition: { id: "edition-2026", edition_year: 2026, start_date: "2026-10-04", edition_status: "completed", registration_status: "registration_not_open" },
  editions: [{ id: "edition-2026", edition_year: 2026, start_date: "2026-10-04", edition_status: "completed" }],
  previousProposals: [], fieldControls: [], source: { source_type: "official_event_website" }, now
};

assert.equal(normalizeDate("6. Mai 2027"), "2027-05-06");
assert.equal(normalizeDate("06.05.2027"), "2027-05-06");
assert.equal(normalizeDate("May 6, 2027"), "2027-05-06");
assert.equal(normalizeDate("2027-05-06"), "2027-05-06");
assert.ok(extractDateCandidates("Saison 2027. Race day: 6. Mai").some(item => item.normalizedValue === "2027-05-06"));
assert.equal(normalizeCountry("Germany"), "DE");
assert.equal(normalizeDistance("13.1 miles").value, 21.0824);
assert.equal(valuesEqual("registration_url", "https://race.test/register?utm_source=x", "https://race.test/register"), true);

const rangeDates = extractDateCandidates("Race day: 6–7 May 2027. Meldeschluss: 1 May 2027.");
assert.ok(rangeDates.some(item => item.field === "start_date" && item.normalizedValue === "2027-05-06"));
assert.ok(rangeDates.some(item => item.field === "end_date" && item.normalizedValue === "2027-05-07"));
assert.ok(!rangeDates.some(item => item.normalizedValue === "2027-05-01"), "Registration deadline was mistaken for race date.");

const jsonLd = extractEventChanges(fixture("jsonld-sports-event.html"), { ...base, sourceUrl: "https://koeln-marathon.de/event" });
assert.ok(jsonLd.candidates.some(item => item.field === "start_time" && item.normalizedValue === "09:00:00"));
assert.ok(jsonLd.candidates.some(item => item.field === "country" && item.normalizedValue === "DE"));
assert.ok(jsonLd.candidates.some(item => item.field === "race_formats"));
assert.ok(jsonLd.proposals.some(item => item.change_type === "new_edition" && item.normalized_value === 2027));
assert.ok(!jsonLd.proposals.some(item => item.field_name === "start_date"), "A successor date must not overwrite the old edition.");

const english = extractEventChanges(fixture("english-date.html"), { ...base, event: { ...base.event, canonical_name: "City Run" } });
assert.ok(english.proposals.some(item => item.change_type === "new_edition" && item.proposed_changes.start_date === "2027-05-06"));
assert.ok(!english.candidates.some(item => item.normalizedValue === "2027-04-30"));

const multi = extractEventChanges(fixture("multiple-events.html"), {
  ...base, event: { ...base.event, canonical_name: "Hamburg Nachtlauf", event_name: "Hamburg Nachtlauf", city: "Hamburg" }
});
assert.ok(multi.candidates.some(item => item.field === "start_date" && item.normalizedValue === "2027-06-12"));
assert.ok(!multi.candidates.some(item => item.normalizedValue === "2027-04-04"));

const cancelled = extractEventChanges(fixture("cancelled.html"), { ...base, event: { ...base.event, canonical_name: "Abendlauf" }, edition: { ...base.edition, edition_status: "scheduled" } });
const cancellation = cancelled.proposals.find(item => item.change_type === "possible_cancellation");
assert.equal(cancellation?.priority, "critical");

const statuses = extractEventChanges(fixture("statuses.html"), { ...base, event: { ...base.event, canonical_name: "Testlauf" }, edition: { ...base.edition, edition_status: "scheduled" } });
assert.ok(statuses.proposals.some(item => item.change_type === "possible_postponement" && item.priority === "critical"));
assert.ok(statuses.candidates.some(item => item.field === "registration_status" && item.normalizedValue === "sold_out"));
assert.ok(statuses.candidates.some(item => item.field === "registration_url"));

for (const [name, domain, adapter] of [
  ["marathon-de.html", "https://marathon.de/race", "marathon_de"],
  ["running-life.html", "https://running.life/race", "running_life"],
  ["ironman.html", "https://ironman.com/race", "ironman"]
]) {
  const result = extractEventChanges(fixture(name), { ...base, sourceUrl: domain });
  assert.equal(result.adapters[0]?.id, adapter);
  assert.ok(result.candidates.some(item => item.method === `platform:${adapter}`));
}
assert.deepEqual(PLATFORM_ADAPTERS.map(item => item.id), ["marathon_de", "running_life", "ironman"]);

const knownSelector = extractEventChanges('<time itemprop="startDate" datetime="2027-09-19T08:30:00+02:00">19.09.2027</time>', { ...base, event: { ...base.event, canonical_name: "Selector Run" } });
assert.ok(knownSelector.candidates.some(item => item.method === "css_selector" && item.normalizedValue === "2027-09-19"));

const conflict = extractEventChanges(`
  <meta name="event:start_date" content="2027-05-07">
  <script type="application/ld+json">{"@type":"SportsEvent","name":"Köln Marathon","startDate":"2027-05-06"}</script>
`, base);
const conflictedEdition = conflict.proposals.find(item => item.change_type === "new_edition");
assert.ok(conflictedEdition?.confidence_reasons.includes("conflicting_extracted_values"));
assert.ok(conflictedEdition?.evidence.alternatives.length > 0);

const identical = extractEventChanges(fixture("jsonld-sports-event.html"), {
  ...base, edition: { ...base.edition, edition_year: 2027, start_date: "2027-10-03", end_date: "2027-10-03", start_time: "09:00:00" },
  editions: [{ ...base.edition, edition_year: 2027, start_date: "2027-10-03" }]
});
assert.ok(!identical.proposals.some(item => item.field_name === "start_date"));

const pending = jsonLd.proposals.find(item => item.field_name === "edition_year");
const deduped = extractEventChanges(fixture("jsonld-sports-event.html"), {
  ...base, previousProposals: [{ field_name: "edition_year", normalized_value: 2027, proposal_status: "pending", created_at: now.toISOString() }]
});
assert.ok(!deduped.proposals.some(item => item.field_name === "edition_year"));

const rejected = extractEventChanges(fixture("jsonld-sports-event.html"), {
  ...base, previousProposals: [{ field_name: "edition_year", normalized_value: 2027, proposal_status: "rejected", reviewed_at: "2026-07-25T00:00:00Z" }]
});
assert.ok(!rejected.proposals.some(item => item.field_name === "edition_year"));

const locked = extractEventChanges(fixture("jsonld-sports-event.html"), {
  ...base, event: { ...base.event, city: "Cologne" },
  fieldControls: [{ field_name: "city", is_locked: true, manual_value: "Cologne", lock_reason: "Admin confirmed" }]
});
const lockedCity = locked.proposals.find(item => item.field_name === "city");
assert.equal(lockedCity?.locked_field, true);
assert.ok(lockedCity?.validation_warnings.includes("field_locked_or_manual_override"));

const migration = fs.readFileSync(path.join(root, "..", "supabase", "migrations", "20260815_source_monitor_extraction_review.sql"), "utf8").toLowerCase();
for (const fragment of [
  "create table if not exists public.event_field_controls", "record_extraction_proposals",
  "review_event_change_proposal", "for update", "baseline changed before review",
  "proposal_status = 'superseded'", "perform public.run_event_validation",
  "proposal_status in ('pending', 'accepted', 'rejected', 'edited_and_accepted', 'superseded', 'expired')"
]) assert.ok(migration.includes(fragment), `Missing migration guarantee: ${fragment}`);

assert.ok(pending, "New edition proposal fixture did not produce a proposal.");
console.log("Source Monitor extraction: JSON-LD, dates, status, adapters, normalization, locks, dedupe and review race guard verified.");
