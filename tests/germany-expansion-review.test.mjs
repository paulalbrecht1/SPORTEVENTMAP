import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildExpansionReview,
  isOfficialLookingUrl,
  isSafeReviewOutputPath,
  parseArgs
} = require("../tools/create-germany-expansion-review.js");

function event(name, overrides = {}) {
  return {
    event_name: name,
    sport: "Running",
    date: "12.09.2027",
    city: "Berlin",
    country: "Germany",
    address: "Olympischer Platz 3, 14053 Berlin",
    latitude: "52.51469",
    longitude: "13.23945",
    distance: "10 km",
    description:
      "A well documented endurance event candidate that still requires manual official-source verification.",
    event_url: "https://official-race.example/events/berlin-run",
    data_source: "Official organizer website",
    source_url: "https://official-race.example/events/berlin-run",
    verification_status: "unverified",
    priority: "medium",
    last_checked: "2026-08-20",
    ...overrides
  };
}

const existingArchive = [
  event("Existing City Race", {
    date: "15.09.2026",
    city: "Hamburg",
    event_url: "https://city-race.example/hamburg",
    source_url: "https://city-race.example/hamburg"
  })
];

const candidates = [
  event("Existing City Race", {
    date: "15.09.2026",
    city: "Hamburg",
    event_url: "https://city-race.example/hamburg",
    source_url: "https://city-race.example/hamburg"
  }),
  event("Existing City Race", {
    date: "14.09.2027",
    city: "Hamburg",
    event_url: "https://city-race.example/hamburg-2027",
    source_url: "https://city-race.example/hamburg-2027"
  }),
  event("New Berlin Run"),
  event("New Berlin Run", {
    description: "Short candidate version."
  }),
  event("Aggregator Candidate", {
    event_url: "https://www.marathon.de/laufevent/example",
    source_url: "https://www.marathon.de/laufevent/example"
  }),
  event("Austria Candidate", {
    country: "Austria",
    city: "Vienna"
  }),
  event("Past Candidate", {
    date: "20.08.2026"
  }),
  event("Missing Coordinates", {
    latitude: "",
    longitude: ""
  })
];

const result = buildExpansionReview(candidates, [], existingArchive, {
  today: "2026-08-24",
  limit: 10,
  type: "all",
  batch: "test-germany-expansion"
});

assert.equal(result.queue.length, 2, JSON.stringify(result.report));
assert.deepEqual(
  new Set(result.queue.map(row => row.candidate_type)),
  new Set(["new_event", "new_edition"])
);
assert.equal(
  result.queue.find(row => row.candidate_type === "new_event").event_name,
  "New Berlin Run"
);
assert.equal(
  result.queue.find(row => row.candidate_type === "new_edition").recommended_route,
  "edition_succession_candidate_review"
);
assert.equal(
  result.queue.every(row => row.review_status === "needs_review"),
  true
);
assert.deepEqual(result.queue.map(row => row.review_rank), [1, 2]);
assert.equal(result.report.safety.production_mutation, false);
assert.equal(result.report.safety.supabase_write, false);
assert.equal(result.report.reference_date, "2026-08-24");
assert.equal(result.report.excluded.existing_edition, 1);
assert.equal(result.report.excluded.duplicate_candidate_versions, 1);
assert.equal(result.report.excluded.aggregator_or_missing_official_url, 1);
assert.equal(result.report.excluded.non_germany, 1);
assert.equal(result.report.excluded.outdated_date, 1);
assert.equal(result.report.excluded.invalid_required_fields, 1);

const newEventsOnly = buildExpansionReview(candidates, [], existingArchive, {
  today: "2026-08-24",
  limit: 10,
  type: "new-event"
});
assert.deepEqual(
  newEventsOnly.queue.map(row => row.candidate_type),
  ["new_event"]
);

assert.equal(isOfficialLookingUrl("https://www.marathon.de/laufevent/test"), false);
assert.equal(isOfficialLookingUrl("https://veranstalter.example/race"), true);
assert.equal(
  isSafeReviewOutputPath("data/imports/review/germany-expansion.csv"),
  true
);
assert.equal(isSafeReviewOutputPath("data/events.csv"), false);

assert.deepEqual(
  parseArgs([
    "node",
    "create-germany-expansion-review.js",
    "--limit",
    "25",
    "--type",
    "new-event",
    "--today",
    "2026-08-24"
  ]),
  {
    input: "data/events.generated.csv",
    existing: "data/events.csv",
    archive: "data/event-editions-public.json",
    out: "data/imports/review/germany-expansion-review.csv",
    report: "data/imports/review/germany-expansion-report.json",
    limit: 25,
    type: "new-event",
    today: "2026-08-24"
  }
);

console.log("Germany expansion review: safe routing, quality gates and deduplication verified.");
