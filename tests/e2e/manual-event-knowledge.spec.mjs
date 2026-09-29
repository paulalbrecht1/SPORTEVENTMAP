import fs from 'node:fs';
import { expect, test } from '@playwright/test';
const script = fs.readFileSync(new URL('../../js/manual-event-maintenance.js', import.meta.url), 'utf8');
const descriptions = fs.readFileSync(new URL('../../js/event-description.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../css/style.css', import.meta.url), 'utf8');
const editionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function fixture(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/knowledge-maintenance-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html lang="de"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main></body></html>' }));
  await page.goto('/knowledge-maintenance-fixture');
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: descriptions });
  await page.addScriptTag({ content: script });
  await page.evaluate(async id => {
    window.db = { event: { id: 7, canonical_name: 'Pflegebeispiel', sport: 'Running', city: 'Paderborn', country: 'Germany', official_url: 'https://example.test/' }, editions: [{ id, edition_year: 2027, start_date: '2027-03-27', end_date: '2027-03-27', start_time: '09:30:00', registration_status: 'registration_open', edition_status: 'scheduled', publication_status: 'published', source_url: 'https://example.test/2027', race_formats: [{ label: 'Halbmarathon', distance_km: 21.0975 }] }], knowledge: [{ knowledge_scope: 'edition', event_brand_id: 7, edition_id: id, registration: { price_tiers: [{ tier: 'Halbmarathon · Phase 1', price: '30', currency: 'EUR', note: 'Erste 500 Meldungen' }] }, race_day: { wave_start: 'Halbmarathon 12:00 Uhr' }, faq: [], sources: [] }], version: 'one', sources: [], candidates: [] };
    window.calls = []; window.proofs = []; window.failProof = false;
    const client = { async rpc(name, args) {
      if (name === 'admin_manual_event_context') return { data: structuredClone(window.db) };
      const request = args.p_request; window.calls.push(structuredClone(request));
      if (request.expected_version !== window.db.version) return { error: { code: 'PT409', message: 'Daten zwischenzeitlich verändert' } };
      const k = request.knowledge;
      if (k) {
        let record = window.db.knowledge.find(row => row.knowledge_scope === k.scope);
        if (!record) { record = { knowledge_scope: k.scope, event_brand_id: 7, edition_id: k.scope === 'edition' ? id : null, faq: [] }; window.db.knowledge.push(record); }
        for (const [section, values] of Object.entries(k.patch)) Object.assign(record[section] ||= {}, values);
        for (const path of k.clear_fields) { const [section, field] = path.split('.'); delete (record[section] ||= {})[field]; }
        record.faq = record.faq.filter(row => !k.faq_remove.includes(row.id));
        for (const row of k.faq_upserts) { const previous = record.faq.find(item => item.id === row.id); if (previous) Object.assign(previous, row); else record.faq.push(row); }
      }
      window.db.version += 'x';
      return { data: { saved: true, request_id: request.request_id, event_id: 7, edition_id: id, publication: { status: 'database_public' }, freshness: { verified: false } } };
    } };
    window.app = window.SemManualEventMaintenance.mount({ root: document.querySelector('#root'), client, verifyPublication: async () => ({ archiveVerified: true, discoveryVerified: true, discoveryPresent: true }), refreshCatalog: async () => ({ refreshed: true }), verifyDetail: async args => { window.proofs.push(args); return { detailVerified: !window.failProof }; } });
    await window.app.loadEvent(7, id);
  }, editionId);
}
async function openKnowledge(page, section = 'registration') {
  await page.locator('[data-maintenance-knowledge] > details > summary').click();
  await page.locator(`[data-knowledge-section="${section}"] > summary`).click();
}
async function preview(page) {
  await page.locator('[data-maintenance-notes]').fill('Offizielle Ausschreibung dieser Ausgabe persönlich geprüft.');
  await page.locator('[data-maintenance-preview]').click();
  await expect(page.locator('[data-maintenance-preview-box]')).toBeVisible();
}
test('knowledge: fee tier correction, explicit confirmation, rendered proof and persisted reload on mobile', async ({ page }) => {
  await fixture(page); await openKnowledge(page);
  await page.locator('[data-knowledge-cell="price"]').fill('35');
  await page.locator('[data-knowledge-confirm="registration.price_tiers"]').check();
  await preview(page);
  await expect(page.locator('[data-maintenance-preview-box]')).toContainText('35 EUR');
  await expect(page.locator('[data-maintenance-preview-box]')).not.toContainText('"price":');
  await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert');
  const saved = await page.evaluate(() => ({ call: window.calls[0], proof: window.proofs[0] }));
  expect(saved.call.confirmations).toEqual([]);
  expect(saved.call.knowledge.patch.registration.price_tiers[0]).toEqual({ tier: 'Halbmarathon · Phase 1', price: '35', currency: 'EUR', note: 'Erste 500 Meldungen' });
  expect(saved.call.knowledge.confirmations).toEqual([{ field: 'registration.price_tiers', source_url: 'https://example.test/2027' }]);
  expect(saved.proof.knowledge.fields[0].visible).toBe(true);
  await page.evaluate(id => window.app.loadEvent(7, id), editionId);
  await openKnowledge(page);
  await expect(page.locator('[data-knowledge-cell="price"]')).toHaveValue('35');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('knowledge: blank or collapsed values preserved, no blanket freshness, missing rendered proof never succeeds', async ({ page }) => {
  await fixture(page); await openKnowledge(page, 'race_day');
  await page.locator('[data-knowledge-field="race_day.wave_start"]').fill('');
  await page.locator('[data-maintenance-confirm="edition.start_date"]').check();
  await page.evaluate(() => { window.failProof = true; });
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('noch nicht vollständig verifiziert');
  expect(await page.evaluate(() => window.calls[0].knowledge)).toBeUndefined();
  expect(await page.evaluate(() => window.db.knowledge[0].race_day.wave_start)).toBe('Halbmarathon 12:00 Uhr');
});
test('knowledge: brand scope excludes annual data and FAQ identity survives save/reload', async ({ page }) => {
  await fixture(page);
  await page.locator('[data-maintenance-knowledge] > details > summary').click();
  await page.locator('[data-knowledge-scope]').selectOption('brand');
  await expect(page.locator('[data-knowledge-section="registration"]')).toHaveCount(0);
  await expect(page.locator('[data-knowledge-section="race_day"]')).toHaveCount(0);
  await page.locator('[data-knowledge-section="faq"] > summary').click();
  await page.locator('[data-knowledge-add-faq]').click();
  await page.locator('[data-knowledge-question]').fill('Wo findet der Lauf statt?');
  await page.locator('[data-knowledge-answer]').fill('In Paderborn.');
  await page.locator('[data-knowledge-faq] [data-knowledge-confirm]').check();
  const faqId = await page.locator('[data-knowledge-faq]').getAttribute('data-knowledge-faq');
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  expect(await page.evaluate(() => window.db.knowledge.find(row => row.knowledge_scope === 'brand').faq[0].id)).toBe(faqId);
  await page.locator('[data-maintenance-knowledge] > details > summary').click();
  await page.locator('[data-knowledge-section="faq"] > summary').click();
  await expect(page.locator('[data-knowledge-faq]')).toHaveAttribute('data-knowledge-faq', faqId);
});
test('knowledge: parallel detail edits conflict without clearing inputs or silently replacing arrays', async ({ page }) => {
  await fixture(page); await openKnowledge(page);
  await page.locator('[data-knowledge-cell="price"]').fill('40');
  await page.evaluate(() => { window.db.version = 'changed'; window.db.knowledge[0].registration.price_tiers[0].price = '36'; });
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('Zwischenzeitlich');
  await expect(page.locator('[data-knowledge-cell="price"]')).toHaveValue('40');
  await page.locator('[data-maintenance-reload]').click();
  await expect(page.locator('[data-knowledge-cell="price"]')).toHaveValue('40');
  await page.locator('[data-maintenance-preview]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('Zusatzdetails wurden zwischenzeitlich geändert');
  expect(await page.evaluate(() => window.calls.length)).toBe(1);
});
test('knowledge: empty new rows and removed new FAQ never create facts or confirmations', async ({ page }) => {
  await fixture(page); await openKnowledge(page, 'race_day');
  await page.locator('[data-knowledge-add="race_day.intermediate_cutoffs"]').click();
  await page.locator('[data-knowledge-section="faq"] > summary').click();
  await page.locator('[data-knowledge-add-faq]').click();
  await page.locator('[data-knowledge-question]').fill('Verworfene neue Frage');
  await page.locator('[data-knowledge-answer]').fill('Nicht speichern');
  await page.locator('[data-knowledge-faq] [data-knowledge-confirm]').check();
  await page.locator('[data-knowledge-faq] [data-knowledge-remove]').check();
  await page.locator('[data-maintenance-confirm="edition.start_date"]').check();
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  expect(await page.evaluate(() => window.calls[0].knowledge)).toBeUndefined();
});
test('knowledge: removing all rows plus the explicit field clear produces one intentional deletion', async ({ page }) => {
  await fixture(page); await openKnowledge(page);
  await page.locator('[data-knowledge-array="registration.price_tiers"] [data-knowledge-remove]').check();
  await page.locator('[data-knowledge-clear="registration.price_tiers"]').check();
  await preview(page);
  await expect(page.locator('[data-maintenance-preview-box]')).toContainText('Bewusst entfernen');
  await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  expect(await page.evaluate(() => window.calls[0].knowledge.clear_fields)).toEqual(['registration.price_tiers']);
  expect(await page.evaluate(() => window.calls[0].knowledge.patch)).toEqual({});
});
