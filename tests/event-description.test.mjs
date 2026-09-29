import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { cleanPublicEventDescription: clean } = require('../js/event-description.js');
const maintenance = require('../js/manual-event-maintenance.js');

test('known import-only templates and synthetic city placeholders are omitted', () => {
  for (const city of ['Mainz', 'Hofheim i. UFr.', 'Frankenberg/Sa.', 'St. Anton', 'Oettingen i. Bayern', 'St. Wolfgang', 'Gmund a. Tegernsee']) {
    assert.equal(clean(`Official endurance event in ${city}. Imported from verified staging batch.`), '', city);
  }
  for (const value of [null, undefined, '', '  ', 'Official endurance event in Mainz.',
    'Imported from marathon.de running calendar. Source listing: https://www.marathon.de/laufevent/test/',
    'Imported from marathon.de Laufkalender.', 'Imported from verified staging batch.',
    'Imported from verified staging batch. Imported from marathon.de running calendar.',
    'IMPORTED FROM MARATHON.DE RUNNING CALENDAR.']) assert.equal(clean(value), '');
});

test('real sentences survive adjacent import and source-listing notes', () => {
  assert.equal(clean('Eine Runde entlang des Rheins. Imported from verified staging batch. Anmeldung beim Verein.'),
    'Eine Runde entlang des Rheins. Anmeldung beim Verein.');
  assert.equal(clean('Official endurance event in Mainz. Imported from verified staging batch. Start am Rheinufer.'), 'Start am Rheinufer.');
  assert.equal(clean('Imported from marathon.de running calendar.\nDie Strecke führt durch den Wald.\nSource listing: https://example.invalid/race\nStart um 9 Uhr.'),
    'Die Strecke führt durch den Wald.\n\nStart um 9 Uhr.');
  assert.equal(clean('Region: Bayern Source listing: https://example.invalid/race'), 'Region: Bayern');
});

test('ordinary source mentions and words containing review batch or staging are preserved', () => {
  for (const value of ['Read the race preview and review the route.', 'Startplätze werden batchweise freigeschaltet.',
    'Das staging area liegt am Sportplatz.', 'Weitere Termine findest du auf marathon.de.',
    'The prizes were imported from France.', 'Source listing is explained by the organizer.',
    'Official endurance event information is available from the organizer.']) assert.equal(clean(value), value);
});

test('browser and CommonJS share the same nonmutating idempotent projection', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(new URL('../js/event-description.js', import.meta.url), 'utf8'), context);
  const input = 'Anmeldung ab Montag. Imported from verified staging batch.';
  assert.equal(context.SportEventMapDescriptions.cleanPublicEventDescription(input), clean(input));
  assert.equal(clean(clean(input)), clean(input));
  assert.equal(input, 'Anmeldung ab Montag. Imported from verified staging batch.');
});

test('admin public API comparison projects raw text while rendered comparison remains exact', async () => {
  const event = Object.freeze({ id: 1, description: 'Official endurance event in Mainz. Imported from verified staging batch.' });
  const edition = { id: 'edition-1', publication_status: 'published' };
  const projected = maintenance.publicProjection(event, edition);
  assert.equal(projected.description, '');
  assert.equal(maintenance.comparePublicRow({ ...projected, description: event.description }, projected), false);
  assert.equal(maintenance.comparePublicRow({ ...projected, description: '' }, projected), true);
  assert.equal(maintenance.comparePublicRow({ ...projected, description: 'Eine echte andere Beschreibung.' }, projected), false);
  assert.match(event.description, /Imported from/);
  const missing = { ...projected }; delete missing.description;
  assert.equal(maintenance.comparePublicRow(missing, projected), false);
  const read = await maintenance.verifyPublicEdition({ supabaseUrl: 'https://public.invalid', publishableKey: 'public-test', event, edition,
    fetchImpl: async () => ({ ok: true, json: async () => [{ ...projected, description: event.description }] }) });
  assert.equal(read.archiveVerified, true);
  assert.equal(read.discoveryVerified, true);
});

test('old iframe renderer exposing an import note cannot claim publication success', async () => {
  const event = { id: 1, description: 'Official endurance event in Mainz. Imported from verified staging batch.' };
  const edition = { id: 'edition-1', edition_slug: 'test-event-2027' };
  for (const [description, expected] of [[event.description, false], ['', true]]) {
    let onLoad;
    const frame = { setAttribute() {}, remove() {}, addEventListener(name, callback) { if (name === 'load') onLoad = callback; },
      contentDocument: { documentElement: { dataset: { semPublicDetailState: 'verified', semPublicEditionId: edition.id } },
        getElementById: () => ({ textContent: JSON.stringify({ ...maintenance.publicProjection(event, edition), description }) }) } };
    const documentRef = { location: { href: 'https://local.invalid/' }, createElement: () => frame,
      body: { appendChild: () => queueMicrotask(() => onLoad()) } };
    const result = await maintenance.verifyRenderedDetail({ event, edition, documentRef, timeoutMs: 500 });
    assert.equal(result.detailVerified, expected);
  }
});

test('missing browser helper prevents a false successful public comparison', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(new URL('../js/manual-event-maintenance.js', import.meta.url), 'utf8'), context);
  assert.throws(() => context.SemManualEventMaintenance.publicProjection({ id: 1, description: 'Text' }, { id: 'edition-1' }),
    /Beschreibungsprüfung konnte nicht geladen/);
});

test('actual app loads the shared helper before public event normalization', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const helper = html.match(/<script\s+defer\s+src="js\/event-description\.js\?v=[^"]+"><\/script>/)?.[0];
  assert.ok(helper, 'The public helper must be an ordered deferred dependency');
  assert.ok(html.indexOf(helper) < html.indexOf('src="js/events.js?'), 'Description policy must be available before events.js');
});
