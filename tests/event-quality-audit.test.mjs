import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  auditEvents,
  buildSummary,
  hasValidCoordinates,
  parseArgs,
  validateHttpUrl
} = require("../tools/audit-event-quality.js");

function validEvent(overrides = {}) {
  return {
    event_name: "Berlin Endurance Run",
    sport: "Running",
    date: "12.09.2027",
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
    ...overrides
  };
}

const fixedToday = "2026-07-26T00:00:00";
const completeRows = auditEvents([validEvent()], {
  today: fixedToday
});

assert.equal(completeRows[0].quality_status, "complete");
assert.equal(completeRows[0].issue_count, 0);

const incompleteRows = auditEvents(
  [
    validEvent({
      description: "",
      event_url: "not-a-url",
      latitude: "95",
      longitude: "0"
    })
  ],
  { today: fixedToday }
);

assert.equal(incompleteRows[0].quality_status, "incomplete");
assert.match(incompleteRows[0].issue_types, /missing_description/);
assert.match(incompleteRows[0].issue_types, /invalid_event_url/);
assert.match(incompleteRows[0].issue_types, /invalid_coordinates/);

const duplicateRows = auditEvents(
  [
    validEvent(),
    validEvent({
      event_name: "Berlin Endurance Run 2027",
      event_url: "https://example.org/second-registration"
    })
  ],
  { today: fixedToday }
);

assert.equal(duplicateRows.length, 2);
duplicateRows.forEach(row => {
  assert.equal(row.quality_status, "review_required");
  assert.match(row.issue_types, /possible_duplicate/);
});

const pastRows = auditEvents(
  [
    validEvent({
      date: "01.01.2026",
      verification_status: "confirmed"
    })
  ],
  { today: fixedToday }
);

assert.equal(pastRows[0].quality_status, "review_required");
assert.match(pastRows[0].issue_types, /event_date_past/);
assert.match(pastRows[0].issue_types, /status_mismatch/);

const summary = buildSummary([
  ...completeRows,
  ...incompleteRows,
  ...pastRows
]);

assert.deepEqual(summary.status_counts, {
  complete: 1,
  review_required: 1,
  incomplete: 1
});
assert.equal(summary.total_events, 3);
assert.equal(summary.complete_events, 1);
assert.equal(summary.review_required_events, 1);
assert.equal(summary.incomplete_events, 1);
assert.equal(summary.data_complete_events, 2);
assert.equal(summary.problematic_events, 2);
assert.equal(summary.completeness_percent, 66.7);
assert.equal(summary.clean_percent, 33.3);

assert.equal(validateHttpUrl("https://example.org/register"), true);
assert.equal(validateHttpUrl("javascript:alert(1)"), false);
assert.equal(
  hasValidCoordinates({ latitude: "52,52", longitude: "13,40" }),
  true
);
assert.equal(
  hasValidCoordinates({ latitude: "", longitude: "" }),
  false
);

assert.deepEqual(
  parseArgs([
    "node",
    "audit-event-quality.js",
    "--input",
    "custom.csv",
    "--csv",
    "audit.csv",
    "--json",
    "audit.json"
  ]),
  {
    input: "custom.csv",
    out: "audit.csv",
    report: "audit.json"
  }
);

console.log("Event quality audit tests passed.");
