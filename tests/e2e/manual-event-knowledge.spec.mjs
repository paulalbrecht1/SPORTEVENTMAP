import fs from 'node:fs';
import { expect, test } from '@playwright/test';
const script = fs.readFileSync(new URL('../../js/manual-event-maintenance.js', import.meta.url), 'utf8');
const descriptions = fs.readFileSync(new URL('../../js/event-description.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../css/style.css', import.meta.url), 'utf8');
const editionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const nextEditionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/knowledge-maintenance-fixture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main></body></html>' }));
  await page.goto('/knowledge-maintenance-fixture');
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: descriptions });
  await page.addScriptTag({ content: script });
  await page.evaluate(async ({ id, nextEditionId }) => {
    window.db = { event: { id: 7, canonical_name: 'Pflegebeispiel', sport: 'Running', city: 'Paderborn', country: 'Germany', official_url: 'https://example.test/' }, editions: [{ id, edition_year: 2027, start_date: '2027-03-27', end_date: '2027-03-27', start_time: '09:30:00', registration_status: 'registration_open', edition_status: 'scheduled', publication_status: 'published', source_url: 'https://example.test/2027', race_formats: [{ label: 'Halbmarathon', distance_km: 21.0975 }] }], knowledge: [{ knowledge_scope: 'edition', event_brand_id: 7, edition_id: id, registration: { price_tiers: [{ tier: 'Halbmarathon · Phase 1', price: '30', currency: 'EUR', note: 'Erste 500 Meldungen' }] }, race_day: { wave_start: 'Halbmarathon 12:00 Uhr' }, faq: [], sources: [] }], version: 'one', sources: [], candidates: [] };
    // UI-only transport with synthetic private maintenance context.
    window.db.knowledge[0].id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    window.calls = []; window.proofs = []; window.failProof = false;
    const client = { async rpc(name, args) {
      if (name === 'admin_manual_event_context') return { data: structuredClone(window.db) };
      const request = args.p_request; window.calls.push(structuredClone(request));
      if (request.expected_version !== window.db.version) return { error: { code: 'PT409', message: 'Daten zwischenzeitlich verändert' } };
      let edition = window.db.editions.find(row => row.id === request.edition_id);
      if (request.action === 'create') {
        edition = { id: nextEditionId, event_id: 7, publication_status: 'draft' };
        window.db.editions.unshift(edition);
      }
      Object.assign(window.db.event, request.event_patch);
      Object.assign(edition, request.edition_patch);
      for (const path of request.clear_fields) { const [scope, key] = path.split('.'); (scope === 'event' ? window.db.event : edition)[key] = null; }
      const k = request.knowledge;
      if (k) {
        let record = window.db.knowledge.find(row => row.knowledge_scope === k.scope && (k.scope === 'brand' || row.edition_id === edition.id));
        if (!record) { record = { id: crypto.randomUUID(), knowledge_scope: k.scope, event_brand_id: 7, edition_id: k.scope === 'edition' ? edition.id : null, faq: [] }; window.db.knowledge.push(record); }
        for (const [section, values] of Object.entries(k.patch)) Object.assign(record[section] ||= {}, values);
        for (const path of k.clear_fields) { const [section, field] = path.split('.'); (record[section] ||= {})[field] = ['price_tiers', 'intermediate_cutoffs'].includes(field) ? [] : null; }
        record.faq = record.faq.filter(row => !k.faq_remove.includes(row.id));
        // A real Postgres FAQ readback also includes server-owned columns. These
        // metadata fields must not make correctly persisted content look lost.
        for (const row of k.faq_upserts) {
          const previous = record.faq.find(item => item.id === row.id);
          const persisted = { ...row, event_detail_id: record.id,
            created_at: previous?.created_at || '2026-10-01T12:00:00+02:00', updated_at: '2026-10-01T12:01:00+02:00',
            source_url: previous?.source_url || null, last_verified: previous?.last_verified || null };
          if (previous) Object.assign(previous, persisted); else record.faq.push(persisted);
        }
        // Administrative approval is separate from a source verification.
        record.manual_approved_fields = [...new Set([...(record.manual_approved_fields || []),
          ...Object.entries(k.patch).flatMap(([section, values]) => Object.keys(values).map(key => `${section}.${key}`)),
          ...k.faq_upserts.map(row => `faq.${row.id}`)])];
      }
      window.db.version += 'x';
      return { data: { saved: true, request_id: request.request_id, event_id: 7, edition_id: edition.id, publication: { status: edition.publication_status === 'draft' ? 'draft' : 'database_public' }, freshness: { verified: false } } };
    } };
    window.app = window.SemManualEventMaintenance.mount({ root: document.querySelector('#root'), client, verifyPublication: async ({ edition }) => edition.publication_status === 'draft' ? { status: 'draft' } : ({ archiveVerified: true, discoveryVerified: true, discoveryPresent: true }), refreshCatalog: async () => ({ refreshed: true }), verifyDetail: async args => { window.proofs.push(args); return { detailVerified: !window.failProof }; } });
    await window.app.loadEvent(7, id);
  }, { id: editionId, nextEditionId });
}
async function openKnowledge(page, section = 'registration') {
  await page.locator('[data-maintenance-knowledge] > details > summary').click();
  await page.locator(`[data-knowledge-section="${section}"] > summary`).click();
}
async function preview(page) {
  await page.locator('[data-maintenance-preview]').click();
  await expect(page.locator('dialog[data-maintenance-preview-box]')).toBeVisible();
  await expect(page.locator('dialog[data-maintenance-preview-box]')).toHaveJSProperty('open', true);
}
test('knowledge: fee tier correction, manual modal approval, rendered proof and persisted reload on mobile', async ({ page }) => {
  await fixture(page); await openKnowledge(page);
  await page.locator('[data-knowledge-cell="price"]').fill('35');
  await expect(page.locator('[data-knowledge-confirm]')).toHaveCount(0);
  await preview(page);
  await expect(page.locator('[data-maintenance-preview-box]')).toContainText('35 EUR');
  await expect(page.locator('[data-maintenance-preview-box]')).not.toContainText('"price":');
  await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert');
  const saved = await page.evaluate(() => ({ call: window.calls[0], proof: window.proofs[0] }));
  expect(saved.call.confirmations).toEqual([]);
  expect(saved.call.manual_approval).toBe(true);
  expect(saved.call.knowledge.patch.registration.price_tiers[0]).toEqual({ tier: 'Halbmarathon · Phase 1', price: '35', currency: 'EUR', note: 'Erste 500 Meldungen' });
  expect(saved.call.knowledge.confirmations).toEqual([]);
  expect(saved.proof.knowledge.fields[0].visible).toBe(true);
  await page.evaluate(id => window.app.loadEvent(7, id), editionId);
  await openKnowledge(page);
  await expect(page.locator('[data-knowledge-cell="price"]')).toHaveValue('35');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('knowledge: untouched collapsed values remain preserved and missing rendered proof never succeeds', async ({ page }) => {
  await fixture(page); await openKnowledge(page, 'race_day');
  await page.locator('[data-maintenance-field="edition.start_date"]').fill('2027-03-28');
  await page.evaluate(() => { window.failProof = true; });
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('öffentliche Übernahme ist noch nicht bestätigt');
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
  const faqId = await page.locator('[data-knowledge-faq]').getAttribute('data-knowledge-faq');
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  const storedFaq = await page.evaluate(() => {
    const record = window.db.knowledge.find(row => row.knowledge_scope === 'brand');
    return { detailId: record.id, row: record.faq[0], request: window.calls[0].knowledge.faq_upserts[0] };
  });
  expect(storedFaq.row).toMatchObject({ ...storedFaq.request, id: faqId, event_detail_id: storedFaq.detailId, source_url: null, last_verified: null });
  expect(storedFaq.row).toHaveProperty('created_at');expect(storedFaq.row).toHaveProperty('updated_at');
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
  await page.locator('[data-knowledge-faq] [data-knowledge-remove]').check();
  await page.locator('[data-maintenance-field="edition.start_date"]').fill('2027-03-28');
  await preview(page); await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  expect(await page.evaluate(() => window.calls[0].knowledge)).toBeUndefined();
});
test('knowledge: removing all rows plus the explicit field clear produces one intentional deletion', async ({ page }) => {
  await fixture(page); await openKnowledge(page);
  await page.locator('[data-knowledge-array="registration.price_tiers"] [data-knowledge-remove]').check();
  await page.locator('[data-knowledge-clear="registration.price_tiers"]').check();
  await preview(page);
  await expect(page.locator('[data-maintenance-preview-box]')).toContainText('Gebührenstaffeln');
  await expect(page.locator('[data-maintenance-preview-box]')).toContainText('Neu: Nicht angegeben');
  await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  expect(await page.evaluate(() => window.calls[0].knowledge.clear_fields)).toEqual(['registration.price_tiers']);
  expect(await page.evaluate(() => window.calls[0].knowledge.patch)).toEqual({});
});

test('knowledge: a changed annual detail and FAQ can form a new edition in the same approval dialog', async ({ page }) => {
  await fixture(page);
  const oldFaqId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const removedFaqId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await page.evaluate(async ({ oldFaqId, removedFaqId, editionId }) => {
    window.db.knowledge[0].faq = [
      { id: oldFaqId, question: 'Wo findet der Lauf statt?', answer: 'Am alten Start.', sort_order: 10 },
      { id: removedFaqId, question: 'Alte Parkmöglichkeit?', answer: 'Am alten Parkplatz.', sort_order: 20 }
    ];
    await window.app.loadEvent(7, editionId);
  }, { oldFaqId, removedFaqId, editionId });
  const original = await page.evaluate(() => ({ edition: structuredClone(window.db.editions[0]), knowledge: structuredClone(window.db.knowledge[0]) }));
  await openKnowledge(page);
  await page.locator('[data-knowledge-cell="price"]').fill('36');
  await page.locator('[data-knowledge-section="race_day"] > summary').click();
  await page.locator('[data-knowledge-field="race_day.wave_start"]').fill('');
  await page.locator('[data-knowledge-section="faq"] > summary').click();
  await page.locator(`[data-knowledge-faq="${oldFaqId}"] [data-knowledge-answer]`).fill('Am neuen Start.');
  await page.locator(`[data-knowledge-faq="${removedFaqId}"] [data-knowledge-remove]`).check();
  await page.locator('[data-maintenance-field="edition.start_date"]').fill('2028-03-26');
  await preview(page);
  const dialog = page.locator('dialog[data-maintenance-preview-box]');
  await dialog.locator('[data-maintenance-year-choice][value="create"]').check();
  await expect(dialog.locator('[data-maintenance-save]')).toBeEnabled();
  await expect(dialog.locator('[data-maintenance-dialog-error]')).toBeEmpty();
  expect(await page.evaluate(() => window.calls)).toEqual([]);
  await dialog.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  const saved = await page.evaluate(() => ({ call: window.calls[0], editions: window.db.editions, knowledge: window.db.knowledge, calls: window.calls.length }));
  expect(saved.calls).toBe(1);
  expect(saved.call.action).toBe('create');
  expect(saved.call.edition_patch).toMatchObject({ edition_year: 2028, start_date: '2028-03-26', end_date: '2028-03-26' });
  expect(saved.call.knowledge.patch).toEqual({ registration: { price_tiers: [{ tier: 'Halbmarathon · Phase 1', price: '36', currency: 'EUR', note: 'Erste 500 Meldungen' }] } });
  expect(saved.call.knowledge.clear_fields).toEqual([]);
  expect(saved.call.knowledge.faq_remove).toEqual([]);
  expect(saved.call.knowledge.confirmations).toEqual([]);
  const newFaq = saved.call.knowledge.faq_upserts[0];
  expect(newFaq.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(newFaq.id).not.toBe(oldFaqId);
  expect(newFaq).toMatchObject({ question: 'Wo findet der Lauf statt?', answer: 'Am neuen Start.' });
  expect(saved.editions.find(row => row.id === editionId)).toEqual(original.edition);
  expect(saved.knowledge.find(row => row.edition_id === editionId)).toEqual(original.knowledge);
  const newKnowledge = saved.knowledge.find(row => row.edition_id === nextEditionId);
  expect(newKnowledge.faq).toHaveLength(1);
  expect(newKnowledge.faq[0]).toMatchObject({ ...newFaq, event_detail_id: newKnowledge.id, source_url: null, last_verified: null });
  expect(newKnowledge.race_day).toBeUndefined();
  await expect(page.locator('[data-maintenance-publication]')).toContainText('Privater Entwurf');
});

test('knowledge: intentionally clearing an optional fee tier cell removes the old value in payload and reread', async ({ page }) => {
  await fixture(page); await openKnowledge(page);
  await page.locator('[data-knowledge-cell="note"]').fill('');
  await preview(page);
  await page.locator('[data-maintenance-save]').click();
  await expect(page.locator('[data-maintenance-status]')).toContainText('In der Datenbank gespeichert');
  const tier = await page.evaluate(() => window.calls[0].knowledge.patch.registration.price_tiers[0]);
  expect(tier).toEqual({ tier: 'Halbmarathon · Phase 1', price: '30', currency: 'EUR' });
  await page.evaluate(id => window.app.loadEvent(7, id), editionId);
  await openKnowledge(page);
  await expect(page.locator('[data-knowledge-cell="note"]')).toHaveValue('');
  expect(await page.evaluate(() => window.db.knowledge[0].registration.price_tiers[0].note)).toBeUndefined();
});
