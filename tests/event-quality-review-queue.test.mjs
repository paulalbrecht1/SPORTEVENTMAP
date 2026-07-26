import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildReport,
  buildReviewQueue,
  getRecommendedAction,
  matchesCountry,
  parseArgs
} = require("../tools/create-event-review-queue.js");

function event(name, overrides = {}) {
  return {
    event_name: name,
    sport: "Running",
    date: "10.09.2027",
    city: "Berlin",
    country: "Germany",
    address: "Olympischer Platz 3, 14053 Berlin",
    latitude: "52.51469",
    longitude: "13.23945",
    distance: "10 km",
    description:
      "A verified road race with a measured ten kilometre course.",
    event_url: "https://example.org/registration",
    verification_status: "confirmed",
    priority: "medium",
    ...overrides
  };
}

const today = "2026-07-26T00:00:00";
const events = [
  event("Clean Event"),
  event("Future High Review", {
    address: "Berlin, Germany",
    latitude: "52.52000",
    longitude: "13.40000",
    priority: "high"
  }),
  event("Future Low Review", {
    address: "Berlin, Germany",
    latitude: "52.53000",
    longitude: "13.41000",
    priority: "low"
  }),
  event("Past High Review", {
    date: "20.07.2026",
    latitude: "52.54000",
    longitude: "13.42000",
    priority: "high"
  }),
  event("Incomplete Event", {
    description: "",
    latitude: "52.55000",
    longitude: "13.43000",
    priority: "low"
  }),
  event("Austria Review", {
    city: "Vienna",
    country: "Austria",
    address: "Vienna, Austria",
    latitude: "48.2082",
    longitude: "16.3738",
    priority: "high"
  })
];

const queue = buildReviewQueue(events, {
  today,
  country: "Germany",
  limit: 3
});

assert.deepEqual(
  queue.map(row => row.event_name),
  [
    "Incomplete Event",
    "Future High Review",
    "Future Low Review"
  ]
);
assert.deepEqual(
  queue.map(row => row.review_rank),
  [1, 2, 3]
);
assert.equal(queue[0].quality_status, "incomplete");
assert.match(queue[0].review_reason, /missing_description/);
assert.match(
  queue[0].recommended_action,
  /blocking fields/
);
assert.match(
  queue[1].recommended_action,
  /precise start or venue/
);

const report = buildReport(events, queue, {
  today,
  country: "Germany"
});

assert.equal(report.total_events, 6);
assert.equal(report.country_filter, "Germany");
assert.equal(report.eligible_problematic_events, 4);
assert.equal(report.queued_events, 3);
assert.equal(report.remaining_after_queue, 1);
assert.equal(report.upcoming_events, 3);
assert.equal(report.past_events, 0);
assert.equal(report.by_quality_status.incomplete, 1);
assert.equal(report.by_quality_status.review_required, 2);

assert.equal(
  matchesCountry({ country: "Deutschland" }, "Germany"),
  true
);
assert.equal(
  matchesCountry({ country: "Austria" }, "all"),
  true
);
assert.match(
  getRecommendedAction("possible_duplicate | city_level_coordinates"),
  /Compare/
);

assert.deepEqual(
  parseArgs([
    "node",
    "create-event-review-queue.js",
    "--input",
    "events.csv",
    "--csv",
    "queue.csv",
    "--json",
    "report.json",
    "--limit",
    "25",
    "--country",
    "all"
  ]),
  {
    input: "events.csv",
    out: "queue.csv",
    report: "report.json",
    limit: 25,
    country: "all"
  }
);

console.log("Event quality review queue tests passed.");
