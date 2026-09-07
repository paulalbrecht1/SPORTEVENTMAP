import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  auditEvent,
  parseFlexibleDate,
  parseIsoTimestamp
} = require("../tools/audit-event-dates.js");

const utcTimestamp = parseFlexibleDate("2026-08-27T07:41:01.290Z");
assert.equal(utcTimestamp.format, "ISO 8601 timestamp");
assert.equal(utcTimestamp.exact, true);
assert.equal(utcTimestamp.date.getFullYear(), 2026);
assert.equal(utcTimestamp.date.getMonth(), 7);
assert.equal(utcTimestamp.date.getDate(), 27);

const postgresTimestamp = parseFlexibleDate(
  "2026-08-28T08:53:13.870001+00:00"
);
assert.equal(postgresTimestamp.format, "ISO 8601 timestamp");
assert.equal(postgresTimestamp.exact, true);

assert.equal(parseIsoTimestamp("2026-02-30T08:53:13+00:00"), null);
assert.equal(parseIsoTimestamp("2026-08-28T24:00:00+00:00"), null);
assert.equal(parseIsoTimestamp("2026-08-28T08:53:13+14:30"), null);
assert.equal(
  parseFlexibleDate("2026-08-28T24:00:00+00:00").date,
  null
);

const event = {
  event_name: "Berlin Endurance Run",
  sport: "Running",
  date: "12.09.2027",
  city: "Berlin",
  country: "Germany",
  source_url: "https://example.org/event",
  last_checked: "2026-08-27T07:41:01.290Z",
  next_check: "2026-09-30T08:53:13.870001+00:00"
};
const today = new Date(2026, 7, 27);
const cleanRow = auditEvent(event, [event], today);

assert.equal(cleanRow.severity, "clean");
assert.deepEqual(cleanRow.issues, []);

const embeddedTimestampEvent = {
  ...event,
  last_checked: "verified at 2026-08-27T07:41:01.290Z"
};
const embeddedTimestampRow = auditEvent(
  embeddedTimestampEvent,
  [embeddedTimestampEvent],
  today
);

assert.match(
  embeddedTimestampRow.issues.join(","),
  /last_checked_non_standard_format/
);
assert.match(
  embeddedTimestampRow.recommended_action,
  /standalone ISO 8601 date or timestamp/
);

console.log("Event date audit tests passed.");
