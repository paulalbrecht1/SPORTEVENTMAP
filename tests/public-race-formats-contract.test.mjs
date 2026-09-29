import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import catalogExport from "../tools/export-supabase-event-catalog.js";

// Exercise the actual exporter and browser CSV/normalizer/planner functions.
const source = fs.readFileSync(new URL("../js/events.js", import.meta.url), "utf8");
const context = vm.createContext({
  window: {},
  getSeasonMetaEntry: event => ({ distance: event.plannedDistance || "" })
});
for (const name of [
  "cleanValue", "parseCoordinate", "normalizeRaceFormats", "normalizeEvent",
  "parseCsvLine", "parseEventsCsv", "getSeasonPlannedDistance",
  "splitSeasonLegacyDistances", "getSeasonRaceFormats", "getSeasonDistanceOptions",
  "parseSeasonDistanceKm", "getSeasonOfficialDistanceKm"
]) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\nfunction ", start + 10);
  assert.ok(start >= 0 && end > start, `${name} is shipped`);
  vm.runInContext(source.slice(start, end), context);
}
const plain = value => JSON.parse(JSON.stringify(value));
const formats = [
  { label: "21.1 km Halbmarathon", distance_km: 21.1, sport: "Running" },
  { label: "11 km Hauptlauf", distance_km: 11, sport: "Running" },
  { label: "5 km Einsteigerlauf", distance_km: 5, sport: "Running" },
  { label: "11 km Walking / Nordic Walking", distance_km: 11, sport: "Walking" },
  { label: "400 m Zuckertütenlauf", distance_km: 0.4, sport: "Running" },
  { label: "800 m Schülerlauf", distance_km: 0.8, sport: "Running" },
  { label: "1600 m Schülerlauf", distance_km: 1.6, sport: "Running" },
  { label: 'Staffel "Gemeinsam"; 4 × 1.470 m', distance_km: 5.88, relay: true, legs: 4, leg_distance_km: 1.47 },
  { label: "Flexi-Marathon (variable Distanz, Ausstieg nach jeder Runde)", distance_mode: "variable" }
];
const row = {
  event_id: 488, event_name: "Format contract fixture", sport: "Running",
  date: "12.09.2026", city: "Hermsdorf", country: "Germany",
  edition_id: "c2bbd4ee-a3be-45d1-86fb-3161976da21c",
  event_key: "format-contract-fixture", latitude: "50.90594", longitude: "11.85193",
  distance: formats.map(format => format.label).join(", "), race_formats: formats,
  last_checked: "2026-09-08T06:00:00+00:00"
};
const untouched = JSON.stringify(row);
const mapped = catalogExport.mapDiscoveryRow(row, "2026-09-08T07:00:00Z");
assert.equal(mapped.race_formats, JSON.stringify(formats));
// CSV quoting is part of the fixture; parsing uses the shipped browser parser.
const columns = [...catalogExport.PUBLIC_CATALOG_COLUMNS, "event_key"];
const csv = columns.join(";") + "\n" + columns.map(column =>
  `"${String(column === "event_key" ? row.event_key : mapped[column] ?? "").replace(/"/g, '""')}"`
).join(";") + "\n";
const csvEvent = context.normalizeEvent(context.parseEventsCsv(csv)[0]);
const restEvent = context.normalizeEvent(row);
for (const event of [csvEvent, restEvent]) {
  assert.deepEqual(plain(event.race_formats), formats, "format metadata survives REST and CSV");
  assert.deepEqual(Array.from(context.getSeasonDistanceOptions(event)), formats.map(format => format.label),
    "internal commas/slashes/semicolons do not merge or split structured competitions");
  assert.equal(context.getSeasonOfficialDistanceKm(event), null, "no personal distance is inferred from multiple offers");
  for (const format of formats) {
    assert.equal(context.getSeasonOfficialDistanceKm({ ...event, plannedDistance: format.label }),
      format.distance_mode === "variable" ? null : format.distance_km,
      `selected ${format.label} keeps its exact structured distance`);
  }
  assert.equal(event.last_checked, row.last_checked, "decoding does not synthesize verification freshness");
}
assert.equal(JSON.stringify(row), untouched, "normalization does not mutate source data");
for (const invalid of [undefined, null, "", "[bad", '{}', '"5 km"', "123", "null", {}, 5]) {
  const normalized = context.normalizeEvent({ ...row, distance: "5 km", race_formats: invalid });
  assert.deepEqual(plain(normalized.race_formats), [], "invalid/non-array JSON is harmless");
  assert.deepEqual(Array.from(context.getSeasonDistanceOptions(normalized)), ["5 km"], "legacy fallback remains usable");
}
assert.deepEqual(plain(context.normalizeRaceFormats('[null,5,"5 km",[],{"label":"5 km","distance_km":5}]')),
  [{ label: "5 km", distance_km: 5 }], "only competition objects survive malformed list entries");
assert.deepEqual(plain(context.normalizeRaceFormats("[]")), []);
console.log("Public race-format export, CSV normalization and planner contract assertions passed.");

// The same public rows feed list bars and map popups. Verification is not a
// registration state, and canonical unknowns must not revive stale CSV values.
vm.runInContext(source.slice(
  source.indexOf("const EVENT_STATUS_CONFIG ="),
  source.indexOf("function createEventStatusBadge(")
), context);
const statusCases = [
  [{ verification_status: "verified", event_status: "scheduled", registration_status: "registration_open" }, "registration_open"],
  [{ verification_status: "verified", event_status: "scheduled", registration_status: "registration_not_open" }, "registration_not_open"],
  [{ verification_status: "verified", event_status: "scheduled", registration_status: "sold_out" }, "sold_out"],
  [{ verification_status: "registration_open", event_status: "scheduled", registration_status: "cancelled" }, "registration_cancelled"],
  ...["cancelled", "postponed", "completed", "inactive", "date_unconfirmed"].map(eventStatus => [
    { verification_status: "verified", event_status: eventStatus, registration_status: "registration_open" }, eventStatus
  ]),
  ...["unknown", "unclear", "", null, undefined, "invalid"].flatMap(registrationStatus => [
    [{ verification_status: "registration_open", registration_status: registrationStatus }, "unclear"],
    [{ verification_status: "sold_out", event_status: "scheduled", registration_status: registrationStatus }, "scheduled"]
  ]),
  [{ verification_status: "verified" }, "unclear"],
  [{ verification_status: "registration_open", event_status: "unknown" }, "unclear"],
  [{ verification_status: "registration_open", event_status: "scheduled" }, "scheduled"],
  [{ verification_status: "registration_open", event_status: "active" }, "registration_open"],
  ...["confirmed", "date_expected", "registration_open", "registration_not_open", "sold_out", "cancelled", "unclear"].map(status => [
    { verification_status: status }, status
  ])
];
for (const [statuses, expected] of statusCases) {
  const input = { ...row, ...statuses };
  const before = JSON.stringify(input);
  const normalized = context.normalizeEvent(input);
  assert.equal(context.getEventStatusConfig(normalized).status, expected, JSON.stringify(statuses));
  assert.equal(normalized.verification_status, statuses.verification_status,
    "normalization preserves verification independently");
  assert.equal(Object.hasOwn(normalized, "registration_status"), Object.hasOwn(statuses, "registration_status"),
    "a missing legacy column remains distinct from an explicitly unknown canonical state");
  assert.equal(JSON.stringify(input), before, "status normalization does not mutate the source row");
}
const separateStatuses = context.normalizeEvent({ ...row,
  verification_status: " verified ", event_status: " scheduled ", registration_status: " registration_open "
});
assert.equal(separateStatuses.verification_status, "verified");
assert.equal(separateStatuses.event_status, "scheduled");
assert.equal(separateStatuses.registration_status, "registration_open");
assert.equal(context.normalizeEvent({ ...row, registration_status: "registration_open" }).verification_status, "",
  "an open registration never invents verification");
const legacyCsvEvent = context.normalizeEvent(context.parseEventsCsv(
  "event_key;event_name;verification_status\nlegacy;Legacy CSV;registration_open\n"
)[0]);
assert.equal(context.getEventStatusConfig(legacyCsvEvent).status, "registration_open");
assert.equal(Object.hasOwn(legacyCsvEvent, "registration_status"), false);
console.log(`Public status contract: ${statusCases.length} canonical/legacy combinations plus CSV and independent normalization passed.`);
