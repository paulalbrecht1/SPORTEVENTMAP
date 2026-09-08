import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { parseImport, validateReview, preparePayload, assertOutcome } = require("../js/freshness-batch-review.js");
const NOW = Date.parse("2026-09-08T02:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const FUTURE_ALLOWANCE = 5 * 60 * 1000;
const FIELDS = [
  "event_name", "edition_year", "date", "city", "country", "address", "latitude",
  "longitude", "sport", "distances", "description", "registration_status",
  "official_event_page", "registration_link"
];
const copy = value => structuredClone(value);
const uuid = (index, source = false) => `${source ? "10000000" : "00000000"}-0000-4000-8000-${String(index).padStart(12, "0")}`;

function fixture(index = 1) {
  const eventId = 900000 + index;
  const editionId = uuid(index);
  const sourceId = uuid(index, true);
  const sourceUrl = `https://events.example/race-${index}/`;
  const observed = {
    event_name: `Synthetic reviewed race ${index}`,
    edition_year: 2026,
    date: "2026-09-18",
    city: "Berlin",
    country: "Germany",
    address: "Testplatz 1, 10115 Berlin",
    latitude: "52.52000",
    longitude: "13.40500",
    sport: "Running",
    distances: [
      { label: "10 km", distance_km: 10, sport: "Running" },
      { label: "2 x 5 km Staffel", distance_km: 10, legs: [5, 5], relay: true }
    ],
    description: "Synthetic official-source evidence for a local unit fixture. The public running event starts and finishes at the designated test venue.",
    registration_status: "registration_open",
    official_event_page: sourceUrl,
    registration_link: `https://registration.example/race-${index}/`
  };
  return {
    review: {
      event_id: eventId,
      edition_id: editionId,
      source_id: sourceId,
      source_url: sourceUrl,
      source_checked_at: "2026-09-08T01:30:00.000Z",
      confidence: 0.95,
      notes: `Official facts for event ${eventId} were independently checked.`,
      confirmed_fields: [...FIELDS],
      uncertain_fields: [],
      observed_values: observed
    },
    context: {
      eventId: String(eventId), editionId, sourceId, sourceUrl,
      storedValues: copy(observed), revision: `revision-${index}`, eligible: true
    }
  };
}

const envelope = reviews => JSON.stringify({ schema_version: 1, reviews });
function rejected(review, context, message) {
  const result = validateReview(review, context, NOW);
  assert.equal(result.valid, false, message);
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, message);
  assert.ok(result.errors.every(error => typeof error === "string" && error.length > 0));
  return result;
}
function frozen(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

test("strict versioned import keeps independent evidence and its original timestamp", () => {
  const { review } = fixture();
  const input = envelope([review]);
  assert.deepEqual(parseImport(input), [review]);
  assert.equal(parseImport(input)[0].source_checked_at, "2026-09-08T01:30:00.000Z");
  for (const invalid of ["", "{", "null", "[]", "{}", JSON.stringify([review]),
    JSON.stringify({ schema_version: "1", reviews: [review] }),
    JSON.stringify({ schema_version: 2, reviews: [review] }),
    JSON.stringify({ schema_version: 1, reviews: {} })]) {
    assert.throws(() => parseImport(invalid), `Unexpectedly accepted import: ${invalid.slice(0, 90)}`);
  }
});

test("import accepts 1 and 25 reviews, rejects 0, 26 and duplicate edition identities", () => {
  for (const length of [1, 25]) {
    const reviews = Array.from({ length }, (_, i) => fixture(i + 1).review);
    assert.equal(parseImport(envelope(reviews)).length, length);
  }
  for (const length of [0, 26]) {
    assert.throws(() => parseImport(envelope(Array.from({ length }, (_, i) => fixture(i + 1).review))));
  }
  const { review } = fixture();
  assert.throws(() => parseImport(envelope([review, copy(review)])));
  const letterUuid = "abcdef01-2345-4678-8abc-abcdef012345";
  assert.throws(() => parseImport(envelope([
    { ...review, edition_id: letterUuid }, { ...review, edition_id: letterUuid.toUpperCase() }
  ])), "Case changes cannot hide a duplicate edition.");
  for (const edition_id of [null, "", "not-a-uuid", 1, "00000000-0000-4000-8000-00000000000z"]) {
    assert.throws(() => parseImport(envelope([{ ...review, edition_id }])));
  }
});

test("a complete bound review compares all 14 fields without mutating evidence or context", () => {
  const { review, context } = fixture();
  const before = copy({ review, context });
  const result = validateReview(frozen(review), frozen(context), NOW);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(new Set(result.differences.map(item => item.field)), new Set(FIELDS));
  assert.equal(result.differences.length, 14);
  for (const item of result.differences) {
    assert.equal(item.match, true, item.field);
    assert.deepEqual(item.stored, before.context.storedValues[item.field]);
    assert.deepEqual(item.observed, before.review.observed_values[item.field]);
  }
  assert.deepEqual({ review, context }, before);
});

test("identity normalization permits string event IDs and a confirmation Set without converting facts", () => {
  const { review, context } = fixture();
  review.event_id = String(review.event_id);
  review.edition_id = "ABCDEF01-2345-4678-8ABC-ABCDEF012345";
  review.source_id = "FEDCBA01-2345-4678-8ABC-ABCDEF012345";
  context.editionId = review.edition_id.toLowerCase();
  context.sourceId = review.source_id.toLowerCase();
  const imported = parseImport(envelope([review]));
  assert.equal(imported[0].edition_id, context.editionId);
  assert.equal(imported[0].source_id, context.sourceId);
  assert.equal(imported[0].event_id, review.event_id);
  assert.deepEqual(imported[0].observed_values, review.observed_values);
  const payload = preparePayload(imported, [context], new Set([context.editionId]), NOW);
  assert.deepEqual(payload.p_edition_ids, [context.editionId]);
  assert.deepEqual(payload.p_evidence[context.editionId].observed_values, context.storedValues);
});

test("source and event/edition binding are checked against the latest context", () => {
  for (const [name, mutate] of [
    ["wrong event", r => { r.event_id += 1; }],
    ["wrong edition", r => { r.edition_id = uuid(2); }],
    ["wrong source", r => { r.source_id = uuid(2, true); }],
    ["different source URL", r => { r.source_url += "other"; }],
    ["URL slash normalization", r => { r.source_url = r.source_url.slice(0, -1); }],
    ["missing source", r => { delete r.source_id; }]
  ]) {
    const { review, context } = fixture();
    mutate(review);
    rejected(review, context, name);
  }
  for (const eligible of [false, null, undefined]) {
    const { review, context } = fixture();
    context.eligible = eligible;
    rejected(review, context, "Only explicitly eligible current editions can be prepared.");
  }
  const { review, context } = fixture();
  rejected(review, { ...context, sourceId: uuid(2, true) }, "Source changed after review.");
});

test("evidence time boundaries match the backend, including explicit timezone offsets", () => {
  for (const source_checked_at of [
    new Date(NOW - DAY).toISOString(),
    new Date(NOW + FUTURE_ALLOWANCE).toISOString(),
    "2026-09-08T03:30:00.000+02:00",
    "2026-09-07T23:01:18.132899+00:00"
  ]) {
    const { review, context } = fixture();
    review.source_checked_at = source_checked_at;
    assert.equal(validateReview(review, context, NOW).valid, true, source_checked_at);
    const payload = preparePayload([review], [context], [review.edition_id], NOW);
    assert.equal(payload.p_evidence[review.edition_id].source_checked_at, source_checked_at,
      "Source-check time must survive import and preparation; it is never refreshed automatically.");
  }
  for (const source_checked_at of [
    new Date(NOW - DAY - 1).toISOString(), new Date(NOW + FUTURE_ALLOWANCE + 1).toISOString(),
    "2026-09-08T01:30:00", "2026-09-08", "2026-02-30T01:30:00Z", "not a date", "", null, NOW
  ]) {
    const { review, context } = fixture();
    review.source_checked_at = source_checked_at;
    rejected(review, context, `Invalid source-check time: ${source_checked_at}`);
  }
  const { review, context } = fixture();
  assert.equal(validateReview(review, context, NOW).valid, true);
  assert.throws(() => preparePayload([review], [context], [review.edition_id], NOW + DAY),
    "Evidence expiring while a dialog remains open cannot be submitted.");
  review.source_checked_at = "2026-02-30T01:30:00Z";
  const calendarResult = validateReview(review, context, Date.parse("2026-03-02T02:00:00Z"));
  assert.equal(calendarResult.valid, false,
    "Date.parse's normalization of February 30 must not turn an impossible date into recent evidence.");
});

test("confidence requires an explicit finite numeric value in the accepted range", () => {
  for (const confidence of [0.8, 0.95, 1]) {
    const { review, context } = fixture();
    review.confidence = confidence;
    assert.equal(validateReview(review, context, NOW).valid, true);
  }
  for (const confidence of [0.799999, 1.000001, -1, 0, null, undefined, "", "0.95", NaN, Infinity]) {
    const { review, context } = fixture();
    review.confidence = confidence;
    rejected(review, context, `Invalid confidence: ${confidence}`);
  }
});

test("all 14 unique fields and an empty uncertainty list must be explicit", () => {
  const invalidFields = [null, {}, [], FIELDS.slice(1), [...FIELDS, "start_time"],
    [...FIELDS.slice(1), FIELDS[1]], FIELDS.map(field => field === "date" ? "Date" : field)];
  for (const confirmed_fields of invalidFields) {
    const { review, context } = fixture();
    review.confirmed_fields = confirmed_fields;
    rejected(review, context, "Missing, duplicated or unknown field confirmations.");
  }
  for (const uncertain_fields of [null, undefined, "", {}, ["distances"], [""]]) {
    const { review, context } = fixture();
    review.uncertain_fields = uncertain_fields;
    rejected(review, context, "Uncertainty must be an explicit empty array.");
  }
  const { review, context } = fixture();
  review.confirmed_fields.reverse();
  assert.equal(validateReview(review, context, NOW).valid, true, "Field confirmation order has no meaning.");
});

test("notes require at least twelve non-padding characters per reviewed event", () => {
  for (const notes of ["abcdefghijkl", "  abcdefghijkl  "]) {
    const { review, context } = fixture();
    review.notes = notes;
    assert.equal(validateReview(review, context, NOW).valid, true);
  }
  for (const notes of ["abcdefghijk", " abcdefghijk ", "            ", "", null, undefined, 123456789012]) {
    const { review, context } = fixture();
    review.notes = notes;
    rejected(review, context, "Each edition needs its own meaningful explicit review note.");
  }
});

test("every changed fact is reported and blocks the entire payload", () => {
  for (const field of FIELDS) {
    const { review, context } = fixture();
    const before = copy(review.observed_values[field]);
    delete review.observed_values[field];
    const missing = rejected(review, context, `Missing observed ${field}`);
    assert.equal(missing.differences.find(item => item.field === field)?.match, false);
    review.observed_values[field] = before;
    context.storedValues[field] = field === "distances" ? [] : `${before} changed`;
    const drift = rejected(review, context, `Current fact ${field} drifted.`);
    assert.equal(drift.differences.find(item => item.field === field)?.match, false);
    assert.throws(() => preparePayload([review], [context], [review.edition_id], NOW));
  }
  for (const observed_values of [null, [], "", undefined]) {
    const { review, context } = fixture();
    review.observed_values = observed_values;
    rejected(review, context, "Observed facts must be an object.");
  }
});

test("JSONB-compatible equality ignores object key order but preserves arrays, types and strings", () => {
  const { review, context } = fixture();
  review.observed_values = Object.fromEntries(Object.entries(review.observed_values).reverse());
  review.observed_values.distances = review.observed_values.distances.map(format =>
    Object.fromEntries(Object.entries(format).reverse()));
  assert.equal(validateReview(review, context, NOW).valid, true);
  for (const [name, mutate] of [
    ["numeric year is not a string", values => { values.edition_year = "2026"; }],
    ["coordinate strings are not numbers", values => { values.latitude = 52.52; }],
    ["coordinate precision is not normalized", values => { values.latitude = "52.52"; }],
    ["whitespace is not trimmed", values => { values.city += " "; }],
    ["URL trailing slash is factual", values => { values.registration_link = values.registration_link.slice(0, -1); }],
    ["array order is significant", values => { values.distances.reverse(); }],
    ["nested number type is significant", values => { values.distances[0].distance_km = "10"; }],
    ["nested shape is significant", values => { values.distances[1].legs = [4, 6]; }]
  ]) {
    const fixtureValues = fixture();
    mutate(fixtureValues.review.observed_values);
    rejected(fixtureValues.review, fixtureValues.context, name);
  }
});

test("preparation emits one exact RPC payload for all explicitly confirmed reviews", () => {
  for (const length of [1, 25]) {
    const fixtures = Array.from({ length }, (_, i) => fixture(i + 1));
    const reviews = fixtures.map(item => item.review);
    const contexts = fixtures.map(item => item.context);
    const ids = reviews.map(review => review.edition_id);
    const before = copy({ reviews, contexts, ids });
    const payload = preparePayload(frozen(reviews), frozen(contexts), frozen(ids), NOW);
    assert.deepEqual(Object.keys(payload).sort(), ["p_edition_ids", "p_evidence", "p_notes"]);
    assert.deepEqual(payload.p_edition_ids, ids);
    assert.deepEqual(Object.keys(payload.p_evidence).sort(), [...ids].sort());
    for (const review of reviews) {
      const { event_id, edition_id, notes, ...evidence } = review;
      assert.deepEqual(payload.p_evidence[edition_id], evidence);
      assert.ok(payload.p_notes.includes(String(event_id)), "Combined notes remain traceable to the event.");
      assert.ok(payload.p_notes.includes(notes), "Every individual review note reaches the atomic RPC.");
    }
    assert.deepEqual({ reviews, contexts, ids }, before);
  }
});

test("preparation fails closed for incomplete, extra or duplicate selections and changed eligibility", () => {
  const a = fixture(1);
  const b = fixture(2);
  const reviews = [a.review, b.review];
  const contexts = [a.context, b.context];
  const ids = reviews.map(review => review.edition_id);
  for (const confirmations of [[], [ids[0]], [ids[1]], [ids[0], ids[0]], [...ids, uuid(3)]]) {
    assert.throws(() => preparePayload(reviews, contexts, confirmations, NOW),
      "Every selected edition must be explicitly confirmed exactly once, with no foreign IDs.");
  }
  for (const currentContexts of [[a.context], [a.context, a.context],
    [a.context, { ...b.context, eligible: false }], [a.context, { ...b.context, sourceUrl: "https://changed.example/" }]]) {
    assert.throws(() => preparePayload(reviews, currentContexts, ids, NOW));
  }
  assert.throws(() => preparePayload([], [], [], NOW));
  assert.throws(() => preparePayload([a.review, a.review], contexts, ids, NOW));
  const tooMany = Array.from({ length: 26 }, (_, i) => fixture(i + 1));
  assert.throws(() => preparePayload(tooMany.map(item => item.review), tooMany.map(item => item.context),
    tooMany.map(item => item.review.edition_id), NOW));
  const changedSecond = copy(b.review);
  changedSecond.observed_values.city = "Different city";
  assert.throws(() => preparePayload([a.review, changedSecond], contexts, ids, NOW),
    "A valid first edition must never produce a partial payload when the second is invalid.");
});

test("successful outcomes must identify the exact batch and attest no automatic fact writes", () => {
  const ids = [uuid(1), uuid(2)];
  const success = {
    requested_count: 2, verified_count: 2, verified_edition_ids: [...ids].reverse(),
    freshness_verified: true, automatic_fact_changes: false
  };
  assert.doesNotThrow(() => assertOutcome(success, ids), "Server lock order may differ from UI selection order.");
  for (const invalid of [null, {}, { ...success, verified_count: 1 }, { ...success, verified_count: "2" },
    { ...success, requested_count: 1 }, { ...success, freshness_verified: false },
    { ...success, automatic_fact_changes: true },
    { ...success, verified_edition_ids: [ids[0], ids[0]] },
    { ...success, verified_edition_ids: [ids[0], uuid(3)] },
    { ...success, verified_edition_ids: [ids[0]] },
    { ...success, verified_edition_ids: [...ids, uuid(3)] },
    { ...success, verified_edition_ids: null }]) {
    assert.throws(() => assertOutcome(invalid, ids), "An ambiguous or partial response cannot become a success notice.");
  }
});
