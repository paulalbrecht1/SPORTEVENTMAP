import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Execute the shipped browser functions without starting a DOM or an account.
const source = fs.readFileSync(new URL("../js/events.js", import.meta.url), "utf8");
const context = vm.createContext({
  window: {},
  getSeasonMetaEntry: event => ({ distance: event?.plannedDistance || "" })
});
for (const name of [
  "cleanValue", "getSeasonPlannedDistance", "splitSeasonLegacyDistances",
  "getSeasonRaceFormats", "getSeasonDistanceOptions", "getSeasonDisplayDistance",
  "parseSeasonDistanceKm", "getSeasonOfficialDistanceKm",
  "getSeasonDistancePresetOptions", "getSeasonDistanceFromResult",
  "getSeasonClassificationContext", "getSeasonDistanceCategory", "getSeasonDistanceKm",
  "seasonPlannerText", "parseSeasonDuration", "formatSeasonDuration", "formatSeasonPace",
  "formatSeasonSpeedKmh", "formatSeasonSwimPace", "getSeasonSportType",
  "getSeasonPerformanceMetric", "getSeasonNumericSeconds", "formatSeasonGoalDelta",
  "getDefaultPlannerDetails", "isPlainPlannerObject", "normalizePlannerDetails",
  "normalizeSeasonPlannerCalculations", "getSeasonResultSummaryItems"
]) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\nfunction ", start + 10);
  assert.ok(start >= 0 && end > start, `browser function ${name} exists`);
  vm.runInContext(source.slice(start, end), context, { filename: `events.js:${name}` });
}

const formats108 = [
  { label: "wep Marathon (42,195 km)", distance_km: 42.195 },
  { label: "Flexi-Marathon (variable Distanz, Ausstieg nach jeder Runde)", distance_mode: "variable" },
  { label: "Decathlon Halbmarathon (21,098 km)", distance_km: 21.098 },
  { label: "10 km Walk / Nordic Walk (ungefähre Veranstalterangabe)", distance_km: 10 },
  { label: "Provinzial Run (ca. 5 km)", distance_km: 5 },
  { label: "Jugendläufe U14/U16 (ca. 1.300 m)", distance_km: 1.3 },
  { label: "Kinderläufe U12 (ca. 1.000 m)", distance_km: 1 },
  { label: "Firmenstaffel (4 × 1.470 m)", distance_km: 5.88, relay: true, legs: 4, leg_distance_km: 1.47 },
  { label: "Eltern-Kind-Lauf und Kinderläufe U8 (ca. 340 m)", distance_km: 0.34 },
  { label: "Kinderläufe U10 (ca. 680 m)", distance_km: 0.68 },
  { label: "Intersport 10 km Run", distance_km: 10 },
  { label: "Spaßstaffel (4 × 340 m)", distance_km: 1.36, relay: true, legs: 4, leg_distance_km: 0.34 }
];
const formats109 = [
  { label: "21.1 km (Halbmarathon, 4 Runden)", distance_km: 21.1 },
  { label: "5.3 km (1 Runde, Teilwertung)", distance_km: 5.3 },
  { label: "10.6 km (2 Runden, Teilwertung)", distance_km: 10.6 },
  { label: "15.9 km (3 Runden, Teilwertung)", distance_km: 15.9 }
];
const formats284 = [
  { label: "10 Meilen (16,1 km)", distance_km: 16.1 },
  { label: "5 km", distance_km: 5 },
  { label: "Mini Airport Race 400 m", distance_km: 0.4 },
  { label: "Mini Airport Race 1 Meile" }
];
const event = (id, race_formats) => ({
  id, sport: "Running", event_name: `Reviewed event ${id}`,
  race_formats, distance: race_formats.map(format => format.label).join("; ")
});
const wep = event(108, formats108);
const friedberg = event(109, formats109);
const airport = event(284, formats284);
const selected = (item, index) => ({ ...item, plannedDistance: item.race_formats[index].label });
const near = (actual, expected, message) => assert.ok(
  Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`
);

for (const item of [wep, friedberg, airport]) {
  assert.deepEqual(Array.from(context.getSeasonDistanceOptions(item)), item.race_formats.map(format => format.label),
    `event ${item.id}: punctuation inside structured labels remains intact`);
  assert.equal(context.getSeasonOfficialDistanceKm(item), null, `event ${item.id}: an offer is not a personal distance`);
  assert.equal(context.getSeasonDistanceKm(item), null);
  assert.equal(context.getSeasonDistanceCategory(item), "Other");
  assert.equal(context.getSeasonDistanceFromResult({}, item), null);
  for (const [index, format] of item.race_formats.entries()) {
    const chosen = selected(item, index);
    const expected = format.distance_mode === "variable" ? null
      : format.distance_km ?? 1.609344;
    if (expected === null) {
      assert.equal(context.getSeasonOfficialDistanceKm(chosen), null);
      assert.equal(context.getSeasonDistanceCategory(chosen), "Other");
    } else {
      near(context.getSeasonOfficialDistanceKm(chosen), expected, `${item.id}: ${format.label}`);
      near(context.getSeasonDistanceKm(chosen), expected, `${item.id}: dashboard agrees`);
      near(context.getSeasonDistanceFromResult({}, chosen), expected, `${item.id}: result agrees`);
    }
  }
}

assert.equal(context.getSeasonDistanceCategory(selected(wep, 0)), "Marathon");
assert.equal(context.getSeasonDistanceCategory(selected(wep, 2)), "Half");
assert.equal(context.getSeasonDistanceCategory(selected(wep, 4)), "5K");
assert.equal(context.getSeasonDistanceCategory(selected(airport, 0)), "Other");
assert.equal(context.getSeasonDistanceCategory(selected(airport, 3)), "Other");
assert.equal(context.getSeasonOfficialDistanceKm({ ...wep, plannedDistance: "5 km" }), 5,
  "an older saved plain choice is not overwritten by the full new offer");
assert.equal(context.getSeasonOfficialDistanceKm({ ...wep, plannedDistance: "Distance pending" }), null,
  "an unknown explicit choice never falls back to the offered half marathon");
assert.equal(context.getSeasonOfficialDistanceKm(event(1, [{ label: "Marathon", distance_mode: "variable", distance_km: 42.195 }])), null,
  "variable metadata overrides an obsolete numeric distance");
assert.equal(context.getSeasonOfficialDistanceKm(event(1, [{ label: "Half marathon", distance_km: 21.098 }])), 21.098,
  "reviewed structured kilometers take precedence over a name-based standard");

for (const [label, km] of [
  ["10 km", 10], ["5k", 5], ["42.195 km", 42.195], ["42,195 km", 42.195],
  ["Marathon", 42.195], ["Halbmarathon", 21.0975], ["Half Marathon", 21.0975],
  ["Halbmarathon (21,098 km)", 21.098], ["Mini Airport Race 400 m", 0.4],
  ["Mini Airport Race 1 Meile", 1.609344], ["10 miles", 16.09344],
  ["10 Meilen (16,1 km)", 16.1], ["1300 Meter", 1.3], ["1.300 m", 1.3],
  ["4 × 1.470 m", 5.88], ["4 x 340 m", 1.36], ["4 × 1.47 km", 5.88],
  ["Ironman 70.3", 113], ["Ironman", 226]
]) {
  near(context.parseSeasonDistanceKm(label), km, `legacy ${label}`);
  near(context.getSeasonOfficialDistanceKm({ distance: label }), km, `legacy event ${label}`);
}
for (const label of ["", "Olympic", "Flexi-Marathon", "variable 10 km", "6 h", "Backyard Ultra", "unknown", "0 km", "5 km / 10 km"]) {
  assert.equal(context.parseSeasonDistanceKm(label), null, `no invented km for ${label}`);
}
for (const label of ["5 km / 10 km", "5km/10km", "5 km, 10 km", "5 km; 10 km", "5 km | 10 km", "5 km + 10 km"]) {
  assert.equal(context.getSeasonDistanceOptions({ distance: label }).length, 2, `legacy alternatives ${label}`);
}
assert.deepEqual(Array.from(context.getSeasonDistanceOptions({ distance: "Marathon / Halbmarathon" })), ["Marathon", "Halbmarathon"]);
assert.deepEqual(Array.from(context.getSeasonDistanceOptions({ distance: "10 km Walk / Nordic Walk" })), ["10 km Walk / Nordic Walk"]);
assert.deepEqual(Array.from(context.getSeasonDistanceOptions({ distance: "Jugendläufe U14/U16 (ca. 1.300 m)" })), ["Jugendläufe U14/U16 (ca. 1.300 m)"]);
assert.deepEqual(Array.from(context.getSeasonDistanceOptions({ race_formats: [{ label: "5 km / 10 km" }] })), ["5 km", "10 km"],
  "a legacy sync row with one combined label remains selectable");

assert.equal(context.getSeasonDistanceFromResult({ distance_source: "5k" }, wep), 5, "legacy result preset alias survives");
assert.equal(context.getSeasonDistanceFromResult({ distance_preset: "marathon" }, selected(wep, 4)), 42.195,
  "explicit result preset has precedence over planned choice");
assert.equal(context.getSeasonDistanceFromResult({ distance_preset: "custom", custom_distance_km: "1,47" }, wep), 1.47);
assert.equal(context.getSeasonDistanceFromResult({ distance_preset: "custom", custom_distance_km: "" }, wep), null);
assert.equal(context.getSeasonDistanceFromResult({ distance_preset: "unrecognized" }, selected(wep, 4)), null);

const details = {
  goals: { target_time: "00:25:00" },
  result: { finish_time: "00:30:00", distance_source: "official" }
};
const normalized = context.normalizeSeasonPlannerCalculations(details, selected(wep, 4));
assert.equal(normalized.result.distanceKm, 5);
assert.equal(normalized.goals.targetPaceSecondsPerKm, 300);
assert.equal(normalized.result.finishPaceSecondsPerKm, 360);
assert.equal(normalized.result.finish_pace, "6:00/km");
assert.equal(details.result.distanceKm, undefined, "normalization does not mutate input details");
for (const noDistanceEvent of [selected(wep, 1), { ...wep, plannedDistance: "unknown" }, wep]) {
  const cleared = context.normalizeSeasonPlannerCalculations(normalized, noDistanceEvent);
  assert.equal(cleared.result.distanceKm, null, "clear formerly inferred distance");
  assert.equal(cleared.result.finishPaceSecondsPerKm, null, "clear stale calculated finish pace");
  assert.equal(cleared.result.finish_pace, "");
  assert.equal(cleared.goals.targetPaceSecondsPerKm, null, "clear stale calculated target pace");
  assert.equal(cleared.goals.target_pace, "");
  assert.equal(cleared.result.finishTimeSeconds, 1800, "retain the athlete's finish time");
  assert.equal(cleared.goals.targetTimeSeconds, 1500, "retain the athlete's target time");
  const summary = context.getSeasonResultSummaryItems(noDistanceEvent, cleared.goals, cleared.result);
  assert.equal(summary.distanceKm, null, "unknown is not displayed as 0 km");
  assert.equal(summary.finishMetric.value, "");
}
const mini = context.normalizeSeasonPlannerCalculations(details, selected(airport, 2));
assert.equal(mini.result.distanceKm, 0.4);
assert.equal(mini.result.finishPaceSecondsPerKm, 4500, "400 m never inherits the 16.1 km event offer");

const profileSource = fs.readFileSync(new URL("../js/supabase.js", import.meta.url), "utf8");
for (const name of [
  "getDefaultProfilePlannerDetails", "normalizeProfilePlannerDetails", "getProfilePlannerEntry",
  "getProfileNullableNumber", "getProfileNumericSeconds", "parseProfileDuration", "getProfileResultMetrics"
]) {
  const start = profileSource.indexOf(`function ${name}(`);
  const end = profileSource.indexOf("\nfunction ", start + 10);
  assert.ok(start >= 0 && end > start, `profile function ${name} exists`);
  vm.runInContext(profileSource.slice(start, end), context, { filename: `supabase.js:${name}` });
}
const storedMeta = Object.fromEntries(Array.from({ length: 48 }, (_, index) => [
  String(1000 + index), { distance: "10 km", planner_details: structuredClone(details) }
]));
context.getProfileSeasonMeta = () => storedMeta;
context.getProfileFavoriteKey = item => String(item.id);
context.getSeasonMetaEntry = item => storedMeta[String(item.id)] || {};
storedMeta[108] = { distance: wep.race_formats[0].label, planner_details: normalized };
for (const [choice, expected] of [
  [wep.race_formats[0].label, 42.195],
  [wep.race_formats[4].label, 5],
  [wep.race_formats[1].label, null],
  ["unknown", null]
]) {
  // The actual choice handler saves only the new label; old derived km remain in storage.
  storedMeta[108].distance = choice;
  const before = JSON.stringify(storedMeta);
  const entry = context.getProfilePlannerEntry(wep);
  const metrics = context.getProfileResultMetrics(wep, entry.planner_details);
  assert.equal(metrics.distanceKm, expected, `profile follows the current choice: ${choice}`);
  assert.equal(metrics.finishPaceSecondsPerKm, expected === null ? null : 1800 / expected);
  if (expected === null) {
    assert.equal(entry.planner_details.result.finish_pace, "", "profile does not show stale free-text derived pace");
    assert.equal(entry.planner_details.goals.target_pace, "");
  }
  assert.equal(JSON.stringify(storedMeta), before, "profile normalization never rewrites stored planner entries");
}
storedMeta[284] = { distance: airport.race_formats[2].label, planner_details: normalized };
const miniEntry = context.getProfilePlannerEntry(airport);
assert.equal(context.getProfileResultMetrics(airport, miniEntry.planner_details).distanceKm, 0.4);
storedMeta[284].distance = airport.race_formats[3].label;
const mileEntry = context.getProfilePlannerEntry(airport);
assert.equal(context.getProfileResultMetrics(airport, mileEntry.planner_details).distanceKm, 1.609344);
console.log("Season distance consumer regressions passed: reviewed formats, legacy labels, presets, stale pace clearing and read-only profile integration.");
