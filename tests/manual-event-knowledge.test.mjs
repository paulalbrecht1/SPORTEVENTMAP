import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const api = createRequire(import.meta.url)('../js/manual-event-maintenance.js');
const record = { knowledge_scope: 'edition', event_brand_id: 7, edition_id: 'edition', registration: { price_tiers: [{ tier: '10 km', price: '25', currency: 'EUR' }] }, travel: { parking_info: 'Park & Ride' }, faq: [{ id: 'question', question: 'Wann?', answer: '09:30 Uhr', sort_order: 10 }] };
const context = { event: { id: 7 }, knowledge: [record] };

test('knowledge patches preserve collapsed/blank fields, false and structured rows; allowlist blocks foreign keys', () => {
  const patch = api.buildKnowledgePatch(record, { 'travel.parking_info': '', 'registration.charity_entries': false, 'registration.price_tiers': [{ tier: '10 km', price: '0', currency: 'EUR' }], 'basis.is_public': true }, new Set(['travel.parking_info', 'registration.charity_entries', 'registration.price_tiers', 'basis.is_public']), [], 'edition');
  assert.deepEqual(patch, { registration: { charity_entries: false, price_tiers: [{ tier: '10 km', price: '0', currency: 'EUR' }] } });
  assert.deepEqual(api.buildKnowledgePatch(record, { 'travel.parking_info': 'New' }, new Set(['travel.parking_info']), ['travel.parking_info'], 'edition'), {});
});
test('brand patches cannot inherit annual fees or race day values', () => {
  assert.deepEqual(api.buildKnowledgePatch({}, { 'registration.price_tiers': [{ tier: 'Next year', price: '25' }], 'race_day.wave_start': '09:30', 'editorial.atmosphere': 'City event' }, new Set(['registration.price_tiers', 'race_day.wave_start', 'editorial.atmosphere']), [], 'brand'), { editorial: { atmosphere: 'City event' } });
});
test('a new blank structured row is an omission, not an empty-array deletion', () => {
  assert.deepEqual(api.buildKnowledgePatch({}, { 'registration.price_tiers': [] }, new Set(['registration.price_tiers']), [], 'edition'), {});
});
test('knowledge selection is scoped and rejects ambiguous records', () => {
  assert.equal(api.knowledgeRecord(context, 'edition', 'edition'), record);
  assert.deepEqual(api.knowledgeRecord(context, 'edition', 'next'), {});
  assert.throws(() => api.knowledgeRecord({ knowledge: [record, record] }, 'edition', 'edition'), /Mehrere/);
});
test('only explicitly confirmed requested values may count as visibly published', () => {
  const request = { scope: 'edition', patch: { registration: { price_tiers: record.registration.price_tiers }, travel: { parking_info: 'Park & Ride' } }, confirmations: [{ field: 'registration.price_tiers' }], clear_fields: [], faq_remove: [], faq_upserts: [] };
  const expected = api.knowledgeExpectation(context, request, 'edition');
  const rendered = { ...record, travel: {}, faq: [], rendered_fields: ['registration.price_tiers'] };
  assert.equal(api.compareRenderedKnowledge([rendered], expected), true);
  assert.equal(api.compareRenderedKnowledge([{ ...rendered, rendered_fields: [] }], expected), false, 'API value without rendered field cannot claim publication');
  assert.equal(api.compareRenderedKnowledge([{ ...rendered, travel: record.travel }], expected), false, 'unconfirmed value must not reappear');
  assert.equal(api.compareRenderedKnowledge([{ ...rendered, edition_id: 'old' }], expected), false);
  assert.equal(api.compareRenderedKnowledge([{ ...rendered, event_brand_id: 8 }], expected), false);
});
test('stale fee values, duplicates, missing marker and unconfirmed FAQ fail publication proof', () => {
  const expected = api.knowledgeExpectation(context, { scope: 'edition', confirmations: [{ field: 'registration.price_tiers' }, { field: 'faq.question' }] }, 'edition');
  const rendered = { ...record, rendered_fields: ['registration.price_tiers', 'faq.question'] };
  assert.equal(api.compareRenderedKnowledge([rendered], expected), true);
  assert.equal(api.compareRenderedKnowledge(null, expected), false);
  assert.equal(api.compareRenderedKnowledge([rendered, rendered], expected), false);
  assert.equal(api.compareRenderedKnowledge([{ ...rendered, registration: { price_tiers: [{ tier: '10 km', price: '20' }] } }], expected), false);
  assert.equal(api.compareRenderedKnowledge([{ ...rendered, faq: [] }], expected), false);
});
test('explicit removals must disappear from both rendered fields and their data', () => {
  const expected = api.knowledgeExpectation(context, { scope: 'edition', clear_fields: ['registration.price_tiers'], faq_remove: ['question'] }, 'edition');
  assert.equal(api.compareRenderedKnowledge([{ ...record, registration: {}, faq: [], rendered_fields: [] }], expected), true);
  assert.equal(api.compareRenderedKnowledge([record], expected), false);
});
test('human preview explains tiers and FAQ without JSON or technical IDs', () => {
  assert.equal(api.displayKnowledge([{ tier: '10 km · Phase 1', price: '25', currency: 'EUR', until: '2027-03-10', note: 'First quota' }]), '10 km · Phase 1 · 25 EUR · 2027-03-10 · First quota');
  assert.equal(api.displayKnowledge(record.faq[0]), 'Wann? – 09:30 Uhr');
  assert.equal(api.displayKnowledge(false), 'Nein');
});
