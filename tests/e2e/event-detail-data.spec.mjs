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
  await page.route('**/js/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SPORT_EVENT_MAP_CONFIG = {supabaseUrl:"https://detail-data.test",supabasePublishableKey:"public-test"};' }));
  await page.route('https://unpkg.com/**', route => route.fulfill({ contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/javascript', body: '' }));
  await page.route('https://detail-data.test/rest/v1/rpc/get_public_event_freshness_guard', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
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
  await page.route('https://detail-data.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...event, description: '' }]) }));
  await page.goto(`/event-detail.html?event=${slug}`);
  await expect(page.locator('#registration')).toBeVisible();
  await expect(page.locator('#race_day')).toBeVisible();
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
  await expect(page.locator('#race_day h2')).toHaveText('Race day');
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
  await page.route('https://detail-data.test/rest/v1/rpc/get_public_event_freshness_guard', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ [event.edition_id]: true }) }));
  await page.route('**/data/event-detail-database.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(scoped) }));
  await page.goto(`/event-detail.html?event=${slug}`);
  await expect(page.locator('#liveDetailChecked')).toBeVisible();
  await expect(page.locator('#liveDetailSources')).toContainText('2026');
  await expect(page.locator('#race_day')).toHaveCount(0);
  await expect(page.locator('#liveDetailSections')).not.toContainText('999 km');
  await expect(page.locator('#liveDetailSections')).not.toContainText('45 days');
  edition.event_brand_id = -1;
  await page.reload();
  await expect(page.locator('#liveDetailContent')).toBeVisible();
  await expect(page.locator('#liveDetailSections > section')).toHaveCount(0);
});
