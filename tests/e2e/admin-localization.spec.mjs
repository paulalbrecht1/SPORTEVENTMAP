import fs from 'node:fs';
import { expect, prepareApp, test } from './helpers/browser.mjs';

const adminSource = fs.readFileSync(new URL('../../js/supabase.js', import.meta.url), 'utf8');
const sourceTemplate = adminSource.slice(adminSource.indexOf('function getKnowledgeSourceTemplate('), adminSource.indexOf('function renderKnowledgeSources('));

test('admin labels and inserted source forms switch languages while preserving input values and machine enums', async ({ page }) => {
  await prepareApp(page, { openDiscoveryPanel: false });
  await page.waitForSelector('#stageFourOperationsCenter', { state: 'attached' });
  await page.addScriptTag({ content: `
    (() => {
    const escapeAdminHTML = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const normalizeKnowledgeDate = value => value || '';
    ${sourceTemplate}
    window.__adminSourceTemplate = getKnowledgeSourceTemplate;
    })();
  ` });
  await page.evaluate(() => {
    const panel = document.getElementById('adminDataOperationsPanel'); panel.hidden = true;
    document.getElementById('sourceMonitorSection').open = true;
    const body = document.getElementById('sourceMonitorTableBody');
    body.innerHTML = '<tr><td data-label="Quelle" data-i18n-label-text="Quelle">Source fixture</td></tr>';
    const holder = document.createElement('div'); holder.id = 'adminLocaleSourceFixture';
    holder.innerHTML = window.__adminSourceTemplate({ source_label: 'Official Germany Race', source_url: 'https://example.test/original', source_type: 'official', verification_note: 'Original note: do not translate.' });
    panel.append(holder);
  });
  for (const language of ['en', 'de', 'en']) {
    await page.evaluate(value => window.setAppLanguage(value), language);
    await expect(page.locator('#editionLifecycleTitle')).toHaveText(language === 'en' ? 'Review now' : 'Jetzt zu pruefen');
    await expect(page.locator('#stageFourBulkItemType option[value="source"]')).toHaveText(language === 'en' ? 'Source' : 'Quelle');
    await expect(page.locator('#sourceMonitorTableBody td')).toHaveAttribute('data-label', language === 'en' ? 'Source' : 'Quelle');
    await expect(page.locator('#adminLocaleSourceFixture [data-source-field="source_type"] option[value="official"]')).toHaveText(language === 'en' ? 'Official' : 'Offiziell');
    await expect(page.locator('#adminLocaleSourceFixture button')).toHaveText(language === 'en' ? 'Remove' : 'Entfernen');
    await expect(page.locator('#adminLocaleSourceFixture [data-source-field="source_type"]')).toHaveValue('official');
    await expect(page.locator('#adminLocaleSourceFixture [data-source-field="source_label"]')).toHaveValue('Official Germany Race');
    await expect(page.locator('#adminLocaleSourceFixture [data-source-field="verification_note"]')).toHaveValue('Original note: do not translate.');
  }
});

test('visible source monitor keeps an edited schedule across German and English redraws', async ({ page }) => {
  await prepareApp(page, { openDiscoveryPanel: false });
  await page.waitForSelector('#sourceMonitorSection', { state: 'attached' });
  await page.evaluate(() => {
    setAdminTab('dataOperations');
    document.getElementById('adminModal').classList.add('open');
    dataOpsEvents = [{ id: 1, event_name: 'Original event name', country: 'Germany', sport: 'Running' }];
    dataOpsSources = [{ id: 'source-locale-test', event_id: 1, source_type: 'official', source_host: 'example.test',
      source_url: 'https://example.test/race', is_active: true, crawl_status: 'pending', next_fetch_at: '2027-04-05T10:00:00Z' }];
    renderSourceMonitor();
    document.getElementById('sourceMonitorSection').open = true;
  });
  const schedule = page.locator('[data-source-id="source-locale-test"] [data-source-next]');
  await expect(schedule).toBeVisible();
  await schedule.fill('2027-06-12T14:25');
  for (const language of ['de', 'en', 'de']) {
    await page.evaluate(value => window.setAppLanguage(value), language);
    await expect(schedule).toHaveValue('2027-06-12T14:25');
    await expect(page.locator('#sourceMonitorTableBody td[data-i18n-label-text="Quelle"]')).toHaveAttribute('data-label', language === 'en' ? 'Source' : 'Quelle');
    await expect(page.locator('#sourceMonitorTableBody')).toContainText('Original event name');
    await expect(page.locator('#sourceMonitorTableBody button[data-source-action="check"]')).toHaveText(language === 'en' ? 'Check now' : 'Jetzt pruefen');
  }
});
