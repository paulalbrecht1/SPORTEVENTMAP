import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildEventPage, indexRichDetailRecords } = require('../../tools/generate-event-pages.js');
const archive = JSON.parse(fs.readFileSync(new URL('../../data/event-editions-public.json', import.meta.url), 'utf8')).editions;
const exportedDetails = JSON.parse(fs.readFileSync(new URL('../../data/event-detail-database.json', import.meta.url), 'utf8'));
const slug = 'bmw-berlin-marathon-2026';
const original = archive.find(row => row.edition_slug === slug);

// Public responses are controlled fixtures, never evidence of a DB write. The
// separate local Auth/PostgREST acceptance suite covers the real persistence chain.
const canonical = () => ({ ...original, event_name: 'Gemeinsamer Detailtest', date: '2027-08-07', end_date: '2027-08-08',
  start_time: '09:15:00', city: 'Berlin', address: 'Prüfstraße 8', latitude: 52.51467, longitude: 13.35019,
  description: 'Aktuelle Beschreibung nach dem Speichern.', registration_status: 'registration_open', event_status: 'scheduled',
  price_min: 25, price_max: 65, currency: 'EUR', participant_limit: 750, last_checked: '2026-09-29T10:00:00Z',
  race_formats: [{ label: 'Halbmarathon', distance_km: 21.097 }, { label: '5 km', distance_km: 5 },
    { label: 'Halbmarathon', distance_km: 21.097 }, { label: 'Stadtlauf', distance_km: 10 },
    { label: 'Triathlon', swim_km: 1.5, bike_km: 40, run_km: 10, elevation_gain_m: 320 }] });
const details = () => [{ event_slug: slug, event_brand_id: original.event_id, edition_id: original.edition_id,
  knowledge_scope: 'edition', verification_status: 'verified_official_source', last_checked: '2026-09-01',
  registration: { price_tiers: [{ tier: 'Frühbuchung', price: '25 EUR', until: '2027-01-31' }, { tier: 'Regulär', price: '65 EUR' }],
    registration_open_date: '2026-10-01', registration_close_date: '2027-08-01', refund_policy: 'Belegte Erstattung bis zur Meldefrist.', minimum_age: '18 Jahre' },
  course: { course_character: 'Belegter Rundkurs entlang des Flusses.', surface: 'Asphalt', aid_stations: 'Belegte Verpflegung bei Kilometer 5 und 10.' },
  race_day: { wave_start: [{ label: 'Welle A', time: '09:15' }, { label: 'Welle B', time: '09:30' }], total_cutoff: '6 h',
    bib_pickup_info: 'Belegte Startnummernausgabe am Vortag.', expo: 'Belegte Sportmesse am Bahnhof.' },
  travel: { nearest_train_station: 'Hauptbahnhof', public_transport_info: 'Belegte Anreise mit der S-Bahn.' },
  editorial: { history_summary: 'Belegte Veranstaltungsgeschichte seit 1984.', why_this_event_stands_out: 'Belegtes Publikum am Flussufer.' },
  faq: [{ question: 'Wo liegen die Startunterlagen?', answer: 'Im belegten Startbüro am Bahnhof.' }],
  sources: [{ source_url: 'https://fixture.example/guide', source_type: 'official', source_label: 'Belegter Editionsleitfaden',
    field_path: 'registration,course,race_day,travel,editorial,faq', last_verified: '2026-09-01' }] }];

async function setup(page, state, mode) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('sportEventMapLanguage', 'de');
    // Instrument only the map library boundary; verify actual application calls.
    window.__detailMarkers = [];
    window.L = {
      map: () => ({ setView() { return this; }, remove() {}, invalidateSize() {}, scrollWheelZoom: { disable() {} } }),
      tileLayer: () => ({ addTo() { return this; } }),
      marker: point => ({ addTo() { window.__detailMarkers.push(point); return this; }, bindPopup() { return this; },
        setLatLng(next) { window.__detailMarkers.push(next); return this; }, remove() {} }),
      icon: () => ({}), divIcon: () => ({})
    };
  });
  await page.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    if (['127.0.0.1', 'localhost'].includes(host)) return route.continue();
    if (host === 'unpkg.com') return route.fulfill({ contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/javascript', body: '' });
    return route.abort();
  });
  await page.route('**/js/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SPORT_EVENT_MAP_CONFIG={supabaseUrl:"https://detail-parity.test",supabasePublishableKey:"public-test"};' }));
  await page.route('https://detail-parity.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([state.event]) }));
  await page.route('https://detail-parity.test/rest/v1/rpc/get_public_event_freshness_guard', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ decisions: { [state.event.edition_id]: true } }) }));
  await page.route('https://detail-parity.test/rest/v1/rpc/get_public_event_detail_bundle', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(state.publicDetails ?? state.details) }));
  await page.route('**/data/event-detail-database.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(state.details) }));
  if (mode === 'static') {
    // Keep the saved static document unchanged when the public values change.
    const html = buildEventPage({ ...state.event, date: '07.08.2027' }, slug, [], null, indexRichDetailRecords(state.details).get(slug));
    await page.route(`**/event/${slug}/`, route => route.fulfill({ contentType: 'text/html', body: html }));
  }
  return { url: mode === 'static' ? `/event/${slug}/` : `/event-detail.html?event=${slug}`, errors };
}

async function settled(page) {
  await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-state', 'verified');
  await expect(page.locator('#liveDetailContent')).toBeVisible();
}
async function openDetails(page) {
  const remaining = page.locator('main details:not([open]) > summary');
  while (await remaining.count()) await remaining.first().click();
}
async function responsive(page) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}/${theme}`).toBeLessThanOrEqual(1);
    }
  }
}

for (const mode of ['static', 'dynamic']) {
  test(`${mode} hyphenated competition distance appears once and unrelated name numbers stay intact`, async ({ page }) => {
    const state = { event: { ...canonical(), race_formats: [
      { label: '10-km-Lauf', distance_km: 10 },
      { label: 'Jubiläum 2027 / 10-km-Lauf', distance_km: 12 }
    ] }, details: [] };
    const { url } = await setup(page, state, mode);
    await page.goto(url); await settled(page);
    const formats = page.locator('#competitions [data-public-race-format]');
    await expect(formats).toHaveCount(2);
    for (const language of ['de', 'en', 'de']) {
      await page.locator('#eventDetailLanguageSelect').selectOption(language);
      await expect(formats.nth(0)).toHaveText('10-km-Lauf');
      await expect(formats.nth(1)).toContainText('Jubiläum 2027 / 10-km-Lauf');
      await expect(formats.nth(1)).toContainText('12 km');
    }
  });

  test(`${mode} legacy Marathon distance localizes km without changing unrelated event-name numbers`, async ({ page }) => {
    const state = { event: { ...canonical(), race_formats: [], distance: 'Marathon /42.195 km', event_name: 'Marathon Jubiläum 2027' }, details: [] };
    const { url } = await setup(page, state, mode);
    await page.goto(url); await settled(page);
    const distance = page.locator('[data-public-detail-field="distance"] strong');
    for (const language of ['de', 'en', 'de']) {
      await page.locator('#eventDetailLanguageSelect').selectOption(language);
      await expect(distance).toHaveText(language === 'en' ? 'Marathon /42.195 km' : 'Marathon /42,195 km');
      await expect(page.locator('#liveDetailName')).toHaveText('Marathon Jubiläum 2027');
    }
    await expect(page.locator('#competitions [data-public-race-format]')).toHaveCount(0);
  });

  test(`${mode} detail uses shared canonical layout, ordered competitions and a location pin after changed public data`, async ({ page }, testInfo) => {
    const state = { event: canonical(), details: details() };
    const { url, errors } = await setup(page, state, mode);
    await page.goto(url); await settled(page);
    const time = page.locator('[data-public-detail-field="start_time"] strong');
    await expect(time).toHaveText('09:15');
    await expect(page.locator('[data-public-detail-field="coordinates"]')).toHaveCount(0);
    const formats = page.locator('#competitions [data-public-race-format]');
    await expect(formats).toHaveCount(4);
    for (const [index, label] of ['5 km', 'Stadtlauf', 'Halbmarathon', 'Triathlon'].entries()) await expect(formats.nth(index)).toContainText(label);
    expect((await formats.nth(0).innerText()).match(/5\s*km/g)).toHaveLength(1);
    await expect(formats.nth(2)).toContainText('21,097 km');
    for (const value of ['1,5 km', '40 km', '10 km', '320 m']) await expect(formats.nth(3)).toContainText(value);
    await expect(page.locator('#eventDetailMap')).toBeVisible();
    await expect(page.locator('#liveDetailMapLink')).toBeVisible();
    const href = await page.locator('#liveDetailMapLink').getAttribute('href');
    expect(href).toContain('52.51467'); expect(href).toContain('13.35019');
    expect(await page.locator('main').innerText()).not.toContain('52.51467');
    expect(await page.locator('main').innerText()).not.toContain('13.35019');
    await expect.poll(() => page.evaluate(() => window.__detailMarkers.at(-1))).toEqual([52.51467, 13.35019]);
    expect(JSON.parse(await page.locator('#sem-public-detail-data').textContent()).start_time).toBe('09:15:00');
    if (mode === 'static') {
      await openDetails(page);
      await page.evaluate(() => document.documentElement.dataset.theme = 'light');
      for (const [name, width] of [['mobile', 390], ['desktop', 1280]]) {
        await page.setViewportSize({ width, height: 900 });
        const screenshot = testInfo.outputPath(`shared-detail-${name}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        await testInfo.attach(`shared-detail-${name}`, { path: screenshot, contentType: 'image/png' });
      }
    }

    // Model the next anonymous read after an independently committed core edit.
    state.event = { ...state.event, start_time: '10:05:00', description: 'Korrigierte Beschreibung aus dem öffentlichen Datenstand.', latitude: 52.52091, longitude: 13.40123 };
    await page.reload(); await settled(page);
    await expect(time).toHaveText('10:05');
    await expect(page.locator('#liveDetailDescription')).toHaveText(state.event.description);
    await expect.poll(() => page.evaluate(() => window.__detailMarkers.at(-1))).toEqual([52.52091, 13.40123]);
    await page.locator('#eventDetailLanguageSelect').selectOption('en');
    await expect(time).toHaveText('10:05');
    await expect(formats.nth(2)).toContainText('21.097 km');
    await responsive(page); expect(errors).toEqual([]);
  });

  test(`${mode} detail retains verified rich and Wiki content across corrected public values and language changes`, async ({ page }) => {
    const state = { event: canonical(), details: details() };
    const { url, errors } = await setup(page, state, mode);
    await page.goto(url); await settled(page);
    const richValues = ['Frühbuchung', 'Regulär', 'Welle A', 'Welle B', 'Belegte Verpflegung bei Kilometer 5 und 10.',
      'Belegte Startnummernausgabe am Vortag.', 'Belegte Anreise mit der S-Bahn.', '18 Jahre',
      'Belegte Veranstaltungsgeschichte seit 1984.', 'Im belegten Startbüro am Bahnhof.'];
    for (const phase of ['initial', 'corrected', 'english']) {
      if (phase === 'corrected') { state.event = { ...state.event, description: 'Korrigierte Kernbeschreibung.', participant_limit: 900 }; await page.reload(); await settled(page); }
      if (phase === 'english') await page.locator('#eventDetailLanguageSelect').selectOption('en');
      await openDetails(page);
      for (const value of richValues) await expect(page.locator('main')).toContainText(value);
      await expect(page.locator('#registration .race-guide-table')).toHaveCount(1);
      await expect(page.locator('#registration .race-guide-table tbody tr')).toHaveCount(2);
      await expect(page.locator('#race-day .race-guide-table').first()).toBeVisible();
      await expect(page.locator('#faq details')).toHaveCount(1);
      await expect(page.locator('#sources')).toContainText('2026');
      await expect(page.locator('#liveDetailFacts')).toContainText('25 – 65 EUR');
    }
    await responsive(page); expect(errors).toEqual([]);
  });

  test(`${mode} sparse detail omits unknown optional blocks and never invents a map or competitions`, async ({ page }) => {
    const state = { event: { ...canonical(), start_time: null, end_date: null, price_min: null, price_max: null,
      participant_limit: null, latitude: null, longitude: null, race_formats: [], distance: '', description: '' }, details: [] };
    const { url, errors } = await setup(page, state, mode);
    await page.goto(url); await settled(page);
    await expect(page.locator('#description')).toBeHidden();
    await expect(page.locator('[data-public-detail-field="start_time"], [data-public-detail-field="price"], [data-public-detail-field="coordinates"]')).toHaveCount(0);
    for (const id of ['competitions', 'course', 'race-day', 'logistics', 'rules', 'faq', 'editorial', 'eventDetailMap', 'liveDetailMapLink']) {
      await expect(page.locator(`#${id}:visible`)).toHaveCount(0);
      await expect(page.locator(`#liveDetailNavigation a[href="#${id}"]:visible`)).toHaveCount(0);
    }
    await responsive(page); expect(errors).toEqual([]);
  });
}

test('real Berlin exported knowledge remains available in both public detail paths', async ({ page }) => {
  const state = { event: { ...original, start_time: '08:45:00' }, details: exportedDetails.filter(row => row.event_slug === slug) };
  for (const mode of ['static', 'dynamic']) {
    const { url } = await setup(page, state, mode);
    await page.goto(url); await settled(page); await openDetails(page);
    for (const value of ['The event began in 1974', 'Runner waves: 08:45', 'Water points at km 5', '18 years on race day']) await expect(page.locator('main')).toContainText(value);
    await page.locator('#eventDetailLanguageSelect').selectOption('en');
    await expect(page.locator('#race-day')).toBeVisible();
    await expect(page.locator('#sources')).toContainText('2026');
  }
});

for (const mode of ['static', 'dynamic']) {
  test(`${mode} fee tiers localize numeric currency and exact dates while preserving quota text`, async ({ page }) => {
    const records = details();
    records[0].registration.price_tiers = [
      { tier: 'Frühbuchung', price: '25,50', currency: 'EUR', until: '2027-01-31' },
      { tier: 'Kontingent', price: 'EUR 65', currency: 'EUR', until: 'Bis das Kontingent ausgeschöpft ist' }
    ];
    const state = { event: canonical(), details: records };
    const { url } = await setup(page, state, mode);
    await page.goto(url); await settled(page);
    const rows = page.locator('#registration .race-guide-table tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('25,50');
    await expect(rows.nth(0)).toContainText('€');
    await expect(rows.nth(0)).toContainText('31.01.2027');
    for (const language of ['en', 'de']) {
      await page.locator('#eventDetailLanguageSelect').selectOption(language);
      await expect(rows.nth(0)).toContainText(language === 'en' ? '25.50' : '25,50');
      await expect(rows.nth(0)).toContainText(language === 'en' ? '31 Jan 2027' : '31.01.2027');
      await expect(rows.nth(1)).toContainText('Bis das Kontingent ausgeschöpft ist');
      expect((await rows.nth(1).innerText()).match(/EUR/g)).toHaveLength(1);
      expect((await rows.nth(0).innerText()).match(/€/g)).toHaveLength(1);
    }
  });

  test(`${mode} untouched edition NULL allows brand proof but explicit ownership blocks stale fallback`, async ({ page }) => {
    const brand = { ...details()[0], edition_id: null, knowledge_scope: 'brand',
      registration: {}, course: {}, race_day: {}, editorial: {}, faq: [],
      travel: { nearest_train_station: 'Belegter gemeinsamer Bahnhof' },
      owned_fields: ['travel.nearest_train_station'], cleared_fields: [],
      sources: [{ source_url: 'https://fixture.example/travel', source_type: 'official',
        field_path: 'travel.nearest_train_station', last_verified: '2026-09-01' }] };
    const edition = { ...details()[0], registration: {}, course: {}, race_day: {}, editorial: {}, faq: [],
      travel: { nearest_train_station: null, parking_info: 'Unbestätigter Parkplatz' },
      owned_fields: ['travel.parking_info'], cleared_fields: [], sources: [] };
    const state = { event: canonical(), details: [brand, edition] };
    const { url, errors } = await setup(page, state, mode);
    await page.goto(url); await settled(page);
    await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-knowledge-state', 'verified');
    await expect(page.locator('#logistics')).toContainText('Belegter gemeinsamer Bahnhof');
    let rendered = JSON.parse(await page.locator('#sem-public-detail-knowledge-data').textContent());
    expect(rendered.some(row => row.rendered_fields?.includes('travel.nearest_train_station'))).toBe(true);
    for (const value of ['Unbestätigter Editionsbahnhof', null]) {
      edition.travel.nearest_train_station = value;
      edition.owned_fields = ['travel.parking_info', 'travel.nearest_train_station'];
      edition.cleared_fields = value === null ? ['travel.nearest_train_station'] : [];
      await page.reload(); await settled(page);
      await expect(page.locator('main')).not.toContainText('Belegter gemeinsamer Bahnhof');
      await expect(page.locator('main')).not.toContainText('Unbestätigter Editionsbahnhof');
      rendered = JSON.parse(await page.locator('#sem-public-detail-knowledge-data').textContent());
      expect(rendered.some(row => row.rendered_fields?.includes('travel.nearest_train_station'))).toBe(false);
    }
    expect(errors).toEqual([]);
  });

  test(`${mode} successful empty public knowledge never restores stale static or exported details`, async ({ page }) => {
    const state = { event: canonical(), details: details(), publicDetails: [] };
    const { url, errors } = await setup(page, state, mode);
    await page.goto(url); await settled(page);
    await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-knowledge-state', 'verified');
    for (const value of ['Frühbuchung', 'Belegte Veranstaltungsgeschichte seit 1984.', 'Belegte Anreise mit der S-Bahn.', 'Wo liegen die Startunterlagen?']) await expect(page.locator('main')).not.toContainText(value);
    await expect(page.locator('#liveDetailFacts')).toContainText('25 – 65 EUR');
    await expect(page.locator('#competitions [data-public-race-format]')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test(`${mode} public description omits import placeholders and preserves genuine mixed prose in body and metadata`, async ({ page }) => {
    const state = { event: { ...canonical(), description: 'Official endurance event in Mainz. Imported from verified staging batch.' }, details: [] };
    const { url, errors } = await setup(page, state, mode);
    await page.goto(url); await settled(page);
    await expect(page.locator('#description')).toBeHidden();
    await expect(page.locator('#liveDetailNavigation a[href="#description"]')).toHaveCount(0);
    await expect(page.locator('meta[name="description"], meta[property="og:description"]')).toHaveCount(0);
    expect(JSON.parse(await page.locator('#liveDetailSchema').textContent())).not.toHaveProperty('description');
    expect(JSON.parse(await page.locator('#sem-public-detail-data').textContent()).description).toBe('');
    expect(await page.evaluate(() => window.sportEventMapDetailConfig.event.description)).toBe('');
    await expect(page.locator('main')).not.toContainText('Imported from');

    const genuine = 'Ein flacher Lauf am Rhein mit stimmungsvoller Zielgeraden.';
    state.event.description = `${genuine} Imported from verified staging batch.`;
    await page.reload(); await settled(page);
    for (const language of ['de', 'en']) {
      await page.locator('#eventDetailLanguageSelect').selectOption(language);
      await expect(page.locator('#description')).toBeVisible();
      await expect(page.locator('#liveDetailDescription')).toHaveText(genuine);
      await expect(page.locator('#liveDetailNavigation a[href="#description"]')).toHaveCount(1);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', genuine);
      await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', genuine);
      expect(JSON.parse(await page.locator('#liveDetailSchema').textContent()).description).toBe(genuine);
      expect(JSON.parse(await page.locator('#sem-public-detail-data').textContent()).description).toBe(genuine);
      expect(await page.evaluate(() => window.sportEventMapDetailConfig.event.description)).toBe(genuine);
      await expect(page.locator('main')).not.toContainText('Imported from');
    }
    expect(errors).toEqual([]);
  });

  test(`${mode} public description fails closed when its shared policy cannot load`, async ({ page }) => {
    const state = { event: { ...canonical(), description: 'Official endurance event in Mainz. Imported from verified staging batch.' }, details: [] };
    const { url, errors } = await setup(page, state, mode);
    await page.route('**/js/event-description.js?**', route => route.abort());
    await page.goto(url); await settled(page);
    await expect(page.locator('#description')).toBeHidden();
    await expect(page.locator('#liveDetailFacts')).toContainText('07.08.2027');
    await expect(page.locator('main')).not.toContainText('Imported from');
    await expect(page.locator('meta[name="description"], meta[property="og:description"]')).toHaveCount(0);
    expect(JSON.parse(await page.locator('#liveDetailSchema').textContent())).not.toHaveProperty('description');
    expect(JSON.parse(await page.locator('#sem-public-detail-data').textContent()).description).toBe('');
    expect(await page.evaluate(() => window.sportEventMapDetailConfig.event.description)).toBe('');
    expect(errors).toEqual([]);
  });
}

test('dynamic public description also cleans the explicitly unverified archive fallback', async ({ page }) => {
  const state = { event: { ...canonical(), description: 'Official endurance event in Mainz. Imported from verified staging batch.' }, details: [] };
  const { url, errors } = await setup(page, state, 'dynamic');
  await page.route('https://detail-parity.test/rest/v1/public_event_archive?**', route => route.abort());
  await page.route('**/data/event-editions-public.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ exported_at: '2026-09-29T12:00:00Z', editions: [state.event] }) }));
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-state', 'unavailable');
  await expect(page.locator('#liveDetailContent')).toBeVisible();
  await expect(page.locator('#liveDetailStatus')).toContainText('gespeicherte Datenstand');
  await expect(page.locator('#description')).toBeHidden();
  await expect(page.locator('#liveDetailChecked')).toBeHidden();
  await expect(page.locator('main')).not.toContainText('Imported from');
  await expect(page.locator('meta[name="description"], meta[property="og:description"]')).toHaveCount(0);
  expect(JSON.parse(await page.locator('#liveDetailSchema').textContent())).not.toHaveProperty('description');
  await expect(page.locator('#sem-public-detail-data')).toHaveCount(0);
  expect(await page.evaluate(() => window.sportEventMapDetailConfig.event.description)).toBe('');
  expect(errors).toEqual([]);
});
