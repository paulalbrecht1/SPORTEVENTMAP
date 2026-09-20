import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildEventPage, buildSchema, composeRichDetailRecords, indexRichDetailRecords, prepareRichDetails, getVerificationContext, isRaceCutoffValue, parseEventDate } = require('../tools/generate-event-pages.js');

const event = { event_id: 7, edition_id: '11111111-1111-4111-8111-111111111111', edition_slug: 'test-triathlon-2027', event_name: 'Test Triathlon', edition_year: 2027, date: '2027-06-20', city: 'Berlin', country: 'Germany', sport: 'Triathlon', distance: '3.8 / 180 / 42.2 km', event_url: 'https://event.example/', event_status: 'scheduled' };
const source = (field_path, scope = 'edition') => ({ field_path, knowledge_scope: scope, source_url: 'https://event.example/guide', last_verified: '2026-09-01', source_type: 'official' });
const brand = { event_slug: 'test-triathlon', event_brand_id: 7, knowledge_scope: 'brand', verification_status: 'verified_official_source', last_checked: '2026-09-01', basis: { organizer_name: 'Example Events' }, course: { surface: 'Road', swim_distance: '5 km' }, sources: [source('course,basis', 'brand')] };
const edition = { event_slug: event.edition_slug, event_brand_id: 7, edition_id: event.edition_id, knowledge_scope: 'edition', verification_status: 'verified_official_source', last_checked: '2026-09-01', course: { swim_distance: '3.8 km', bike_distance: '180 km', run_distance: '42.2 km', course_map_url: 'https://event.example/course', gpx_url: 'https://event.example/course.gpx' }, registration: { registration_open_date: '2026-10-01', registration_deadline: '2027-06-01', withdrawal_deadline: '45 days before the event' }, race_day: { start_time: '06:30', total_cutoff: '15 hours', swim_cutoff: '2 hours', bike_cutoff: '10 hours', run_cutoff: '5 hours' }, sources: [source('course,registration,race_day')] };
const composed = composeRichDetailRecords([brand, edition]);
assert.equal(indexRichDetailRecords([brand, edition]).get(event.edition_slug).brand.organizer_name, 'Example Events');
assert.equal(composeRichDetailRecords([brand, { ...edition, event_brand_id: 8 }]), null);
assert.equal(composeRichDetailRecords([brand, edition, { ...edition }]), null);
assert.equal(prepareRichDetails({ ...event, edition_id: 'wrong-edition' }, composed), null);
assert.equal(prepareRichDetails({ ...event, event_id: 8 }, composed), null);
assert.equal(prepareRichDetails(event, composed).race_day.total_cutoff, '15 hours');

const html = buildEventPage(event, event.edition_slug, [], null, composed);
assert.match(html, /detail\.swim/);
assert.match(html, /3\.8 km/);
assert.match(html, /detail\.registrationOpening/);
assert.match(html, /detail\.withdrawalDeadline/);
assert.match(html, /course\.gpx/);
assert.match(html, /detail\.sourceCoverage/);
assert.doesNotMatch(html, /id="faq"/);
const raceDay = html.match(/<section id="race-day"[\s\S]*?<\/section>/)?.[0] || '';
assert.match(raceDay, /Swim/);
assert.match(raceDay, /Bike/);
assert.match(raceDay, /Run/);
assert.doesNotMatch(raceDay, /45 days/);

for (const invalid of ['Withdrawal 45 days before the event', 'Rücktritt bis 45 Tage vor dem Start', 'Anmeldeschluss 18:00', 'Refund available for 2 hours', 'Cutoff 2027-06-01', 'Cutoff to be confirmed']) {
  assert.equal(isRaceCutoffValue(invalid), false, invalid);
  const bad = composeRichDetailRecords([brand, { ...edition, race_day: { start_time: invalid, total_cutoff: invalid, swim_cutoff: invalid } }]);
  const safe = prepareRichDetails(event, bad);
  assert.equal(safe.race_day.total_cutoff, undefined);
  assert.equal(safe.race_day.start_time, undefined);
  assert.doesNotMatch(buildEventPage(event, event.edition_slug, [], null, bad), /id="race-day"/);
}
for (const valid of ['6:15 h after the last start', '2.5 hours', '90 Minuten', 'Finish 17:00']) assert.equal(isRaceCutoffValue(valid), true, valid);
const inherited = composeRichDetailRecords([brand, { ...edition, sources: [source('registration,race_day')], course: { surface: 'Technical trail', swim_distance: '9 km' } }]);
assert.equal(prepareRichDetails(event, inherited).course.surface, undefined, 'Brand source must not verify edition overlay');
assert.equal(prepareRichDetails(event, inherited).course.swim_distance, undefined);
assert.equal(prepareRichDetails(event, composeRichDetailRecords([brand])).course.swim_distance, undefined, 'Annual distances cannot be inherited from brand');
assert.equal(prepareRichDetails(event, composeRichDetailRecords([brand])).course.surface, 'Road', 'Verified stable brand facts remain reusable');

const unsupported = prepareRichDetails(event, { ...composed, sources: [], faq: [{ question: 'Generic?', answer: 'Generic advice' }] });
assert.deepEqual(unsupported.registration, {});
assert.deepEqual(unsupported.race_day, {});
assert.deepEqual(unsupported.faq, []);
assert.deepEqual(prepareRichDetails(event, { ...composed, verification: { brand: { status: 'needs_review' }, edition: { status: 'needs_review' } } }).course, {});
const partial = { ...composed, verification: { brand: { status: 'partially_verified' }, edition: { status: 'partially_verified' } } };
assert.equal(prepareRichDetails(event, partial).race_day.start_time, '06:30', 'A verified field in a partial bundle remains useful');
assert.equal(getVerificationContext({}, partial).edition.lastVerifiedAt, '', 'A partial bundle is not a verified edition');
assert.deepEqual(prepareRichDetails(event, { ...composed, sources: composed.sources.map(source => ({ ...source, source_type: 'estimated' })) }).race_day, {});
assert.equal(getVerificationContext({ verification_status: 'needs_review', last_checked: '2026-09-01' }).edition.lastVerifiedAt, '');
assert.equal(getVerificationContext({ verification_status: 'verified', last_checked: '2099-09-01' }).edition.lastVerifiedAt, '');
assert.equal(parseEventDate('2026-02-30'), '');
assert.equal(parseEventDate('2026-09-01Tinvalid'), '');
assert.equal(JSON.parse(buildSchema({ ...event, event_status: 'cancelled', verification_status: 'verified' }, 'https://event.example')).eventStatus, 'https://schema.org/EventCancelled');
const minimal = buildEventPage({ ...event, latitude: '', longitude: '' }, event.edition_slug);
assert.doesNotMatch(minimal, /id="course"|id="race-day"|id="faq"/);
console.log('PASS detail source ownership, identity, semantics, timestamps and useful sparse rendering');
