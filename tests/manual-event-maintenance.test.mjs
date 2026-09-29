import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const api = require('../js/manual-event-maintenance.js');
const request = Object.freeze({ request_id: 'request-1', action: 'correct', event_id: 21, edition_id: 'edition-1', expected_version: 'version-1' });
const context = { event: { id: 21 }, editions: [{ id: 'edition-1' }], version: 'version-2' };
const receipt = { saved: true, ...request, context, publication: { status: 'database_public' } };

test('manual admin release uses a new runtime URL instead of the four-hour cached pre-maintenance script', () => {
  const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const runtime = page.match(/data-supabase-src="([^"]+)"/)?.[1];
  assert.ok(runtime, 'Lazy admin runtime URL is required');
  assert.notEqual(runtime, 'js/supabase.js?v=20260908-freshness-batch-v127', 'v89 and v90 reused this URL and existing sessions kept the old admin tab router');
  assert.ok(Number(runtime.match(/-v(\d+)$/)?.[1]) >= 128, 'Manual maintenance needs the advanced runtime cache key');
});

test('all changed v90 UI assets use advanced URLs in overlay pages, dynamic imports and the next regular page generator', () => {
  const references = [
    ['index.html', 'css/style.css'], ['index.html', 'js/app.js'],
    ['event-detail.html', 'css/style.css'], ['event-detail.html', 'js/event-detail-live.js'],
    ['js/event-detail-live.js', 'js/event-detail.js'],
    ['tools/generate-event-pages.js', 'css/style.css'], ['tools/generate-event-pages.js', 'js/event-detail.js'],
    ...['about.html', 'contact.html', 'imprint.html', 'legal.html', 'privacy.html'].map(file => [file, 'css/style.css'])
  ];
  for (const [file, asset] of references) {
    const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    const version = source.match(new RegExp(asset.replaceAll('.', '\\.') + '\\?v=([A-Za-z0-9-]+)'))?.[1];
    assert.ok(Number(version?.match(/-v(\d+)$/)?.[1]) >= 128, `${file}: ${asset} still references the pre-v91 browser cache`);
  }
});

test('patch contains only changed explicitly touched allowed values; blank and collapsed fields preserve data', () => {
  const before = { city: 'Berlin', description: 'Existing description', price_min: 25, participant_limit: 200 };
  const values = { city: 'Hamburg', description: '', price_min: 0, participant_limit: undefined, role: 'admin' };
  assert.deepEqual(api.buildPatch(before, values, Object.keys(values), [], Object.keys(before)), { city: 'Hamburg', price_min: 0 });
  assert.deepEqual(api.buildPatch(before, { city: 'Changed without touching', description: '' }, [], [], Object.keys(before)), {});
  assert.deepEqual(api.buildPatch(before, { city: 'Berlin' }, ['city'], [], ['city']), {});
  assert.deepEqual(api.buildPatch(before, values, ['description'], ['description'], ['description']), {});
  assert.throws(() => api.buildPatch({}, { price_min: NaN }, ['price_min'], [], ['price_min']), /gültige Zahl/);
});

test('new-edition seed never carries annual values, dates, references, locks or prior verification', () => {
  const seed = api.seedNextEdition({ id: 'previous', edition_year: 2026, start_date: '2026-06-01', last_verified_at: 'today', price_min: 60,
    registration_url: 'https://old.invalid/2026', race_formats: [{ label: '42 km' }], result_id: 'result-old', is_locked: true });
  assert.deepEqual(seed, { edition_key: 'main', edition_status: 'date_unconfirmed', registration_status: 'unknown', race_formats: [] });
});

test('race editing preserves unexposed canonical triathlon and elevation metadata and supports explicit removal', () => {
  const original = [{ label: 'Triathlon', distance_km: 51.5, swim_km: 1.5, bike_km: 40, run_km: 10, elevation_gain_m: 450 }, { label: 'Kids', distance_km: 1 }];
  assert.deepEqual(api.mergeRaceFormats(original, [{ index: 0, label: 'Olympisch', distance_km: '' }, { index: 1, label: 'Kids', distance_km: 1 }], [1]),
    [{ ...original[0], label: 'Olympisch' }]);
  assert.deepEqual(api.mergeRaceFormats(original, [{ index: 0, label: 'Triathlon', distance_km: '', clear_distance: true }]),
    [{ label: 'Triathlon', swim_km: 1.5, bike_km: 40, run_km: 10, elevation_gain_m: 450 }]);
  assert.throws(() => api.mergeRaceFormats([], [{ label: 'Invalid', distance_km: -2 }]), /Kilometer/);
  assert.throws(() => api.mergeRaceFormats([], [{ label: '', distance_km: 10 }]), /Bezeichnung/);
  assert.equal(original[0].distance_km, 51.5, 'input is never mutated');
});

test('success requires exact operation event and edition identities', () => {
  assert.equal(api.assertSaveOutcome(receipt, request), receipt);
  for (const invalid of [null, {}, { ...receipt, saved: false }, { ...receipt, request_id: 'wrong' }, { ...receipt, event_id: 22 }, { ...receipt, edition_id: 'wrong' }]) {
    assert.throws(() => api.assertSaveOutcome(invalid, request), /nicht eindeutig/);
  }
});

test('lost response repeats the same immutable operation and then reloads persisted data', async () => {
  const calls = []; let recovered = 0;
  const client = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (calls.length === 1) throw new Error('Network response lost after commit');
    return { data: name === 'save_manual_event_maintenance' ? { ...receipt, replayed: true } : context, error: null };
  } };
  const result = await api.saveWithRecovery(client, request, { onRecovery: () => recovered++ });
  assert.deepEqual(calls.map(call => call.name), ['save_manual_event_maintenance', 'save_manual_event_maintenance', 'admin_manual_event_context']);
  assert.equal(calls[0].args.p_request, request);
  assert.equal(calls[1].args.p_request, request);
  assert.equal(recovered, 1);
  assert.equal(result.replayed, true);
  assert.equal(result.context, context);
});

test('timeout resolves by idempotent repeat and a real reload rather than optimistic success', async () => {
  let calls = 0;
  const client = { rpc: async name => {
    calls++;
    if (calls === 1) return new Promise(() => {});
    return { data: name === 'save_manual_event_maintenance' ? receipt : context, error: null };
  } };
  const result = await api.saveWithRecovery(client, request, { timeoutMs: 5 });
  assert.equal(calls, 3);
  assert.equal(result.context.version, 'version-2');
});

test('authorization and parallel-version errors including HTTP conflict PT409 are not retried and never return success', async () => {
  for (const code of ['42501', '40001', 'PT409', '23514']) {
    let calls = 0;
    const message = code === 'PT409' ? 'Die Daten wurden inzwischen geändert. Neu laden und die Änderungen erneut prüfen; Ihre Eingaben bleiben erhalten.' : 'Rejected';
    const client = { rpc: async () => { calls++; return { error: { code, message } }; } };
    await assert.rejects(api.saveWithRecovery(client, request), error => error.code === code && error.message === message && !error.uncertain);
    assert.equal(calls, 1);
  }
});

test('committed receipt with failed missing or wrong database reload never reports success', async () => {
  for (const reload of [{ error: new Error('Database reload unavailable') }, { data: { ...context, editions: [] } }, { data: { ...context, event: { id: 99 } } }]) {
    const client = { rpc: async name => name === 'save_manual_event_maintenance' ? { data: receipt } : reload };
    await assert.rejects(api.saveWithRecovery(client, request));
  }
});

test('database success preserves publication failure for separate retryable UI handling', async () => {
  const failed = { ...receipt, publication: { status: 'failed', error: 'Source not ready' } };
  const client = { rpc: async name => ({ data: name === 'save_manual_event_maintenance' ? failed : context }) };
  const result = await api.saveWithRecovery(client, request);
  assert.equal(result.saved, true);
  assert.equal(result.publication.status, 'failed');
  assert.equal(result.publication.error, 'Source not ready');
});

const publicEvent = { id: 21, canonical_name: 'Testlauf', sport: 'Running', city: 'Berlin', country: 'Germany', latitude: '52.5', longitude: '13.4' };
const publicEdition = { id: 'edition-1', edition_year: 2027, start_date: '2027-05-01', publication_status: 'published', edition_status: 'scheduled', registration_status: 'unknown', race_formats: [{ label: '10 km', distance_km: 10 }] };
test('publication check reads anonymously with cache bypass and compares canonical values', async () => {
  const calls = [];
  const result = await api.verifyPublicEdition({ supabaseUrl: 'https://test.invalid', publishableKey: 'sb_publishable_test', event: publicEvent, edition: publicEdition,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [{ ...api.publicProjection(publicEvent, publicEdition), latitude: 52.5 }] }; } });
  assert.equal(result.archiveVerified, true);
  assert.equal(result.discoveryVerified, true);
  assert.equal(result.staticVerified, false, 'live response cannot assert export/build deployment');
  assert.equal(calls.length, 2);
  for (const { url, options } of calls) {
    assert.match(url, /edition_id=eq.edition-1/);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, { apikey: 'sb_publishable_test' });
  }
});

test('missing stale inaccessible and unpublished public rows never claim public synchronization', async () => {
  const options = { supabaseUrl: 'https://test.invalid', publishableKey: 'sb_publishable_test', event: publicEvent, edition: publicEdition };
  for (const rows of [[], [{ ...api.publicProjection(publicEvent, publicEdition), date: '01.05.2026' }]]) {
    const result = await api.verifyPublicEdition({ ...options, fetchImpl: async () => ({ ok: true, json: async () => rows }) });
    assert.equal(result.archiveVerified, false);
    assert.equal(result.discoveryVerified, false);
  }
  await assert.rejects(api.verifyPublicEdition({ ...options, fetchImpl: async () => ({ ok: false }) }), /nicht erreichbar/);
  let called = false;
  const draft = await api.verifyPublicEdition({ ...options, edition: { ...publicEdition, publication_status: 'draft' }, fetchImpl: () => { called = true; } });
  assert.equal(called, false);
  assert.equal(draft.status, 'draft');
});

test('every optional saved field including explicit deletion is part of the public contract', async () => {
  const edition = { ...publicEdition, end_date: '2027-05-02', start_time: '09:30:00', price_min: 0, price_max: 42, currency: 'EUR', participant_limit: 350 };
  const expected = api.publicProjection(publicEvent, edition);
  for (const key of ['end_date', 'start_time', 'price_min', 'price_max', 'currency', 'participant_limit']) {
    assert.equal(expected[key], edition[key]);
    const missing = { ...expected }; delete missing[key];
    assert.equal(api.comparePublicRow(missing, expected), false, `Missing public column ${key} cannot report success`);
    const changed = { ...expected, [key]: null };
    assert.equal(api.comparePublicRow(changed, expected), false, `Stale public column ${key} cannot report success`);
    const cleared = api.publicProjection(publicEvent, { ...edition, [key]: null });
    assert.equal(api.comparePublicRow(missing, cleared), false, `Missing ${key} is not a verified deletion`);
    assert.equal(api.comparePublicRow(changed, cleared), true);
  }
  assert.equal(api.comparePublicRow({ ...expected, price_min: '0', price_max: '42.00', participant_limit: '350', start_time: '09:30' }, expected), true);
});
