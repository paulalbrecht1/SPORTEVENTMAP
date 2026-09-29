import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { buildEventPage, indexRichDetailRecords } = require('../../tools/generate-event-pages.js');
const records = JSON.parse(fs.readFileSync(new URL('../../data/event-detail-database.json', import.meta.url), 'utf8'));
const archive = JSON.parse(fs.readFileSync(new URL('../../data/event-editions-public.json', import.meta.url), 'utf8')).editions;
const detailIndex = indexRichDetailRecords(records);
const widths = [1440, 1280, 1024, 768, 480, 390, 360];

async function isolate(page) {
  await page.addInitScript(() => localStorage.setItem('sportEventMapLanguage', 'de'));
  await page.route('**/js/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SPORT_EVENT_MAP_CONFIG = {supabaseUrl:"https://detail-data.test",supabasePublishableKey:"public-test"};' }));
  await page.route('https://unpkg.com/**', route => route.fulfill({ contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/javascript', body: '' }));
  await page.route('https://detail-data.test/rest/v1/rpc/get_public_event_freshness_guard', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.route('https://detail-data.test/rest/v1/rpc/get_public_event_detail_bundle', route => {
    const event = archive.find(item => item.edition_id === route.request().postDataJSON()?.p_edition_id);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(records.filter(row => event &&
      (row.edition_id === event.edition_id || (row.knowledge_scope === 'brand' && String(row.event_brand_id) === String(event.event_id))))) });
  });
  // Static-layout cases deliberately exercise the labelled saved-page fallback.
  // Live cases override the API route below with their exact public fixture.
  await page.route('https://detail-data.test/rest/v1/public_event_archive?**', route => route.abort());
  await page.route('**/data/event-editions-public.json', route => route.abort());
}
async function checkWidths(page) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      const result = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        clipped: [...document.querySelectorAll('.race-guide-fact-card, .live-detail-field dd, .event-detail-action-group > *, .race-guide-table, .race-guide-table td, .race-guide-timeline article')].filter(node => node.getClientRects().length && (node.scrollWidth > node.clientWidth + 1 || node.getBoundingClientRect().right > innerWidth + 1)).map(node => node.textContent.trim())
      }));
      expect(result, `${width}px / ${theme}`).toEqual({ overflow: false, clipped: [] });
    }
  }
}

test('structured detail tables wrap long race categories, omit absent fee deadlines and render each cutoff once', async ({ page }) => {
  const slug = 'challenge-roth-2027';
  const event = archive.find(row => row.edition_slug === slug);
  const detail = {
    event_slug: slug, event_brand_id: event.event_id, edition_id: event.edition_id,
    knowledge_scope: 'edition', verification_status: 'partially_verified',
    registration: { refund_policy: 'No refund after collecting race documents.', price_tiers: [
      { tier: 'Individual — regular entry; annual licence or EUR 35 day licence required', price: 'EUR 779' },
      { tier: 'Relay team — regular entry', price: 'EUR 879' }
    ] },
    race_day: {
      total_cutoff: 'Individual: 15 h 00 min; relay: 13 h 50 min (swim + bike + run, cumulative).',
      swim_cutoff: '2 h 05 min for individual and relay',
      intermediate_cutoffs: [{ point: 'Individual — end of bike, elapsed since swim start', time: '9 h 10 min' }],
      wave_start: [{ label: 'Individual athletes with assigned start group', blocks: 'Use your individual start assignment from the organizer', time: '06:30' }]
    },
    sources: [{ source_url: 'https://fixture.example/2027-guide', source_type: 'official', field_path: 'registration,race_day', last_verified: '2026-09-01' }]
  };
  await isolate(page);
  await page.route(`**/event/${slug}/`, route => route.fulfill({ contentType: 'text/html', body: buildEventPage(event, slug, [], null, indexRichDetailRecords([detail]).get(slug)) }));
  await page.goto(`/event/${slug}/`);
  await expect(page.locator('#registration .race-guide-table th')).toHaveCount(2);
  await expect(page.locator('#registration [data-detail-i18n="detail.until"]')).toHaveCount(0);
  await expect(page.locator('#race-day .race-guide-timeline article')).toHaveCount(2);
  await expect(page.locator('#race-day').getByText('9 h 10 min', { exact: true })).toHaveCount(1);
  await expect(page.locator('#race-day .race-guide-table')).toHaveCount(1); // Start waves only.
  await expect(page.locator('#rules')).toHaveCount(0);
  await expect(page.getByText('No refund after collecting race documents.', { exact: true })).toHaveCount(1);
  await checkWidths(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    const labels = await page.locator('.race-guide-table').evaluateAll(tables => tables.map(table => ({
      expected: getComputedStyle(table.querySelector('th')).color,
      actual: getComputedStyle(table.querySelector('td'), '::before').color
    })));
    expect(labels.every(label => label.expected === label.actual), `Readable mobile labels in ${theme}`).toBe(true);
  }
});

for (const slug of ['bmw-berlin-marathon-2026', 'challenge-roth-2027', 'adac-marathon-hannover-2027']) {
  test(`verified ${slug} static content remains responsive at all required widths`, async ({ page }) => {
    const event = archive.find(row => row.edition_slug === slug);
    await isolate(page);
    await page.route(`**/event/${slug}/`, route => route.fulfill({ contentType: 'text/html', body: buildEventPage(event, slug, [], null, detailIndex.get(slug)) }));
    await page.goto(`/event/${slug}/`);
    await expect(page.locator('#key-facts')).toBeVisible();
    await expect(page.locator('#sources')).toContainText('2026');
    await expect(page.locator('#sources [data-detail-i18n="detail.sourceCoverage"]').first()).toBeVisible();
    await expect(page.locator('#faq')).toHaveCount(0);
    if (slug === 'challenge-roth-2027') await expect(page.locator('#race-day')).not.toContainText('06:30');
    await checkWidths(page);
  });
}

test('Rennsteiglauf ultra page remains useful and responsive with no verified optional detail bundle', async ({ page }) => {
  await isolate(page);
  await page.goto('/event/gutsmuths-rennsteiglauf-2027/');
  await expect(page.locator('h1')).toHaveText('GutsMuths Rennsteiglauf');
  await expect(page.locator('#key-facts')).toContainText('22.05.2027');
  await expect(page.locator('#key-facts')).toContainText('74 km');
  await expect(page.locator('#sources a').first()).toBeVisible();
  await expect(page.locator('#course, #race-day, #faq, [data-detail-section="course"]')).toHaveCount(0);
  await expect(page.locator('#addDetailEventToSeason')).toBeEnabled();
  await checkWidths(page);
});

test('live page loads exact edition details lazily, keeps genuine source dates separate from core verification and preserves Season state', async ({ page }) => {
  const slug = 'bmw-berlin-marathon-2026';
  const event = archive.find(row => row.edition_slug === slug);
  await isolate(page);
  await page.route('https://detail-data.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...event, description: '', organizer_name: 'SCC EVENTS', start_time: null }]) }));
  await page.goto(`/event-detail.html?event=${slug}`);
  await expect(page.locator('#registration')).toBeVisible();
  await expect(page.locator('#race-day')).toBeVisible();
  await expect(page.locator('#liveDetailFacts')).toContainText('SCC EVENTS');
  await expect(page.locator('#description')).toBeHidden();
  await expect(page.locator('#liveDetailNavigation a[href="#description"]')).toHaveCount(0);
  await expect(page.locator('#liveDetailChecked')).toBeHidden();
  await expect(page.locator('#liveDetailSources')).toContainText('2026');
  await expect(page.locator('#liveDetailSources')).toContainText('Quelle geprüft');
  await expect(page.locator('#addDetailEventToSeason')).toBeEnabled();
  await page.locator('#addDetailEventToSeason').click();
  await expect(page.locator('#addDetailEventToSeason')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#eventDetailLanguageSelect').selectOption('en');
  await expect(page.locator('#race-day h2')).toHaveText('Race day');
  await expect(page.locator('#addDetailEventToSeason')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#liveDetailNavigation [data-detail-section="registration"]').click();
  await expect(page.locator('#liveDetailNavigation [data-detail-section="registration"]')).toHaveAttribute('aria-current', 'location');
  await expect(page).toHaveURL(new RegExp(`event=${slug}#registration$`));
  await checkWidths(page);
});

test('live page hides unsupported or conflicting annual facts and requires an explicit freshness decision', async ({ page }) => {
  const slug = 'bmw-berlin-marathon-2026';
  const event = { ...archive.find(row => row.edition_slug === slug), last_checked: '2026-09-01T12:00:00Z' };
  const scoped = records.filter(row => row.event_slug === slug).map(row => structuredClone(row));
  const edition = scoped.find(row => row.knowledge_scope === 'edition');
  edition.race_day = { total_cutoff: 'Withdrawal 45 days before the event', start_time: 'Registration closes 18:00' };
  edition.course = { swim_distance: '999 km' };
  edition.sources = [{ source_url: 'https://event.example/guide', source_type: 'official', field_path: 'race_day', last_verified: '2026-09-01' }];
  await isolate(page);
  await page.route('https://detail-data.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([event]) }));
  await page.route('https://detail-data.test/rest/v1/rpc/get_public_event_freshness_guard', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ decisions: { [event.edition_id]: true } }) }));
  await page.route('**/data/event-detail-database.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(scoped) }));
  await page.route('https://detail-data.test/rest/v1/rpc/get_public_event_detail_bundle', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(scoped) }));
  await page.goto(`/event-detail.html?event=${slug}`);
  await expect(page.locator('#liveDetailChecked')).toBeVisible();
  await expect(page.locator('#liveDetailSources')).toContainText('2026');
  await expect(page.locator('#race-day')).toHaveCount(0);
  await expect(page.locator('#liveDetailSections')).not.toContainText('999 km');
  await expect(page.locator('#liveDetailSections')).not.toContainText('45 days');
  edition.event_brand_id = -1;
  await page.reload();
  await expect(page.locator('#liveDetailContent')).toBeVisible();
  await expect(page.locator('#liveDetailSections > section:not(#logistics)')).toHaveCount(0);
  await expect(page.locator('#logistics')).not.toContainText('999 km');
});

test('regular static URL renders current canonical fields and a settled anonymous readback, preserving edition and Season identity', async ({ page }) => {
  const slug = 'ring-running-series-2026';
  const old = archive.find(row => row.edition_slug === slug);
  const staticSeasonKey = fs.readFileSync(new URL(`../../event/${slug}/index.html`, import.meta.url), 'utf8').match(/"event_key":"([^"]+)"/)[1];
  const event = { ...old, event_name: 'Current Ring Run', date: '2027-08-07', end_date: '2027-08-08', start_time: '09:15:00',
    address: 'Aktuelle Startstraße 8', description: 'Aktueller offizieller Text.', registration_status: 'registration_open',
    official_url: 'https://official.example/current', registration_url: 'https://entries.example/2027', organizer_name: 'Current Organizer', organizer_url: 'https://organizer.example/',
    price_min: 25, price_max: 65, currency: 'EUR', participant_limit: 750, last_checked: '2026-09-29T10:00:00Z',
    race_formats: [{ label: 'Triathlon', swim_km: 1.5, bike_km: 40, run_km: 10, elevation_gain_m: 320 }, { label: 'Lauf', distance_km: 21.097 }] };
  await isolate(page);
  let requests = 0;
  let releaseGuard;
  const guardWait = new Promise(resolve => { releaseGuard = resolve; });
  await page.route('https://detail-data.test/rest/v1/public_event_archive?**', route => {
    const request = route.request(), url = new URL(request.url());
    expect(request.headers().authorization).toBeUndefined();
    expect(url.searchParams.get('edition_slug')).toBe('eq.' + slug);
    for (const key of ['end_date', 'start_time', 'price_min', 'price_max', 'currency', 'participant_limit', 'organizer_url']) expect(url.searchParams.get('select')).toContain(key);
    requests++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([event]) });
  });
  await page.route('https://detail-data.test/rest/v1/rpc/get_public_event_freshness_guard', async route => {
    await guardWait;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ decisions: { [event.edition_id]: true } }) });
  });
  await page.goto(`/event/${slug}/`);
  await expect(page.locator('#liveDetailName')).toHaveText(event.event_name);
  await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-state', 'loading');
  await expect(page.locator('#sem-public-detail-data')).toHaveCount(0);
  releaseGuard();
  await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-state', 'verified');
  await expect(page).toHaveURL(new RegExp(`/event/${slug}/$`));
  await expect(page.locator('#liveDetailName')).toHaveText(event.event_name);
  for (const value of ['07.08.2027', '08.08.2027', '09:15', '25 – 65 EUR', '750']) await expect(page.locator('#liveDetailFacts')).toContainText(value);
  await expect(page.locator('#logistics')).toContainText('Aktuelle Startstraße 8');
  for (const value of [/Schwimmen:?\s*1,5 km/, /Radfahren:?\s*40 km/, /Laufen:?\s*10 km/, '320 m', '21,097 km']) await expect(page.locator('#competitions')).toContainText(value);
  await expect(page.locator('#liveDetailDescription')).toHaveText(event.description);
  await expect(page.locator('#liveDetailOfficial')).toHaveAttribute('href', event.official_url);
  await expect(page.locator('#liveDetailRegistration')).toHaveAttribute('href', event.registration_url);
  await expect(page.locator('#liveDetailChecked')).toBeVisible();
  expect(JSON.parse(await page.locator('#sem-public-detail-data').textContent())).toEqual(event);
  expect(await page.locator('main').innerText()).not.toContain('21 km / 42 km');
  expect(await page.locator('main').innerText()).not.toContain('21.11.2026');
  expect(await page.evaluate(() => window.sportEventMapDetailConfig.event.edition_id)).toBe(event.edition_id);
  expect(await page.evaluate(() => window.sportEventMapDetailConfig.event.event_key)).toBe(staticSeasonKey);
  await expect(page.locator('#addDetailEventToSeason')).toBeEnabled();
  await page.locator('#addDetailEventToSeason').click();
  await expect(page.locator('#addDetailEventToSeason')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#eventDetailLanguageSelect').selectOption('en');
  await expect(page.locator('[data-public-detail-field="price"]')).toContainText('Price');
  await expect(page.locator('#competitions')).toContainText('21.097 km');
  await checkWidths(page);
  expect(requests).toBe(1);
});

for (const shape of ['flat', 'false', 'error']) {
  test(`canonical readback settles while freshness fails closed for ${shape} guard`, async ({ page }) => {
    const event = { ...archive.find(row => row.edition_slug === 'ring-running-series-2026'), last_checked: '2026-09-29T10:00:00Z', start_time: null, price_min: null, price_max: null, organizer_name: null, official_url: null };
    await isolate(page);
    await page.route('https://detail-data.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([event]) }));
    await page.route('https://detail-data.test/rest/v1/rpc/get_public_event_freshness_guard', route => shape === 'error' ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ contentType: 'application/json', body: JSON.stringify(shape === 'flat' ? { [event.edition_id]: true } : { decisions: { [event.edition_id]: false } }) }));
    await page.goto(`/event-detail.html?event=${event.edition_slug}`);
    await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-state', 'verified');
    await expect(page.locator('#liveDetailChecked')).toBeHidden();
    await expect(page.locator('[data-public-detail-field="start_time"], [data-public-detail-field="price"], [data-public-detail-field="organizer"]')).toHaveCount(0);
  });
}

test('a regular URL with a hidden or ambiguous edition cannot retain old public facts or success readback', async ({ page }) => {
  await isolate(page);
  await page.route('https://detail-data.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto('/event/ring-running-series-2026/');
  await expect(page.locator('#liveDetailStatus')).toContainText('nicht öffentlich');
  await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-state', 'unavailable');
  await expect(page.locator('#sem-public-detail-data')).toHaveCount(0);
  await expect(page.locator('.event-detail-hero')).toBeHidden();
});

test('static hydration removes conflicting rich core facts but keeps distinct logistics and course knowledge', async ({ page }) => {
  const slug = 'challenge-roth-2027';
  const event = { ...archive.find(row => row.edition_slug === slug), date: '2027-07-04', end_date: null, start_time: null, price_min: null, price_max: null, currency: 'EUR', participant_limit: 800,
    official_url: null, organizer_name: null, organizer_url: null, registration_url: 'https://entries.example/current', registration_status: 'sold_out', event_status: 'scheduled',
    race_formats: [{ label: 'Aktueller Triathlon', swim_km: 1.5, bike_km: 40, run_km: 10 }] };
  const rich = { event_slug: slug, event_brand_id: event.event_id, edition_id: event.edition_id, knowledge_scope: 'edition', verification_status: 'verified',
    registration: { registration_status: 'Old opened status', entry_fee_min: '999 EUR', official_registration_url: 'https://entries.example/old', price_tiers: [{ tier: 'Early entry', price: '25 EUR' }, { tier: 'Regular entry', price: '65 EUR' }] },
    race_day: { start_time: '04:44', total_cutoff: '16 h' }, course: { swim_distance: '99 km', course_character: 'Distinct preserved course note' },
    travel: { public_transport_info: 'Distinct preserved train advice' },
    sources: [{ source_url: 'https://official.example/old-guide', source_type: 'official', field_path: 'registration,race_day,course,travel', last_verified: '2026-09-01' }] };
  await isolate(page);
  await page.route(`**/event/${slug}/`, route => route.fulfill({ contentType: 'text/html', body: buildEventPage({ ...event, date: '04.07.2027' }, slug, [], null, indexRichDetailRecords([rich]).get(slug)) }));
  await page.route('https://detail-data.test/rest/v1/rpc/get_public_event_detail_bundle', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([rich]) }));
  await page.route('https://detail-data.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([event]) }));
  await page.goto(`/event/${slug}/`);
  await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-state', 'verified');
  await expect(page.locator('#logistics')).toBeVisible();
  const visible = await page.locator('main').innerText();
  for (const stale of ['999 EUR', '04:44', '99 km', 'Old opened status']) expect(visible).not.toContain(stale);
  expect(visible).toContain('Distinct preserved train advice');
  expect(visible).toContain('Distinct preserved course note');
  await expect(page.locator('#registration .race-guide-table')).toContainText('Early entry');
  await expect(page.locator('#registration .race-guide-table')).toContainText('Regular entry');
  await expect(page.locator('#race-day')).toContainText('16 h');
  await expect(page.locator('[data-public-detail-field="price"], [data-public-detail-field="start_time"]')).toHaveCount(0);
  await expect(page.locator('#liveDetailRegistration')).toHaveAttribute('href', event.registration_url);
  await expect(page.locator('a[href="https://entries.example/old"]')).toHaveCount(0);
  await expect(page.locator('#liveDetailFacts')).toContainText('Ausgebucht');
  await expect(page.locator('#liveDetailFacts')).toContainText('Geplant');
});

for (const [price_min, price_max, price] of [[25, null, 'ab 25 EUR'], [null, 25, 'bis 25 EUR'], [25, 25, '25 EUR']]) {
  test(`canonical price bound ${price} and same-day end date are unambiguous`, async ({ page }) => {
    const event = { ...archive.find(row => row.edition_slug === 'ring-running-series-2026'), date: '21.11.2026', end_date: '2026-11-21', price_min, price_max, currency: 'EUR', event_status: 'inactive' };
    await isolate(page);
    await page.route('https://detail-data.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([event]) }));
    await page.goto(`/event-detail.html?event=${event.edition_slug}`);
    await expect(page.locator('[data-public-detail-field="price"] strong')).toHaveText(price);
    await expect(page.locator('[data-public-detail-field="end_date"]')).toHaveCount(0);
    await expect(page.locator('[data-public-detail-field="status"]')).toContainText('Inaktiv');
  });
}
