/* Public detail page for published editions that have no static export yet. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const labels = {
    de: { back: 'Zur Karte', language: 'Sprache', loading: 'Eventdetails werden geladen …', retry: 'Erneut versuchen', verify: 'Bitte prüfe die endgültigen Angaben vor der Anmeldung beim Veranstalter.', official: 'Offizielle Website / Anmeldung', facts: 'Überblick', description: 'Beschreibung', sources: 'Quellen', source: 'Quelle öffnen', imprint: 'Impressum', privacy: 'Datenschutz', date: 'Datum', location: 'Ort', distance: 'Distanzen', sport: 'Sportart', address: 'Adresse', registration: 'Anmeldung', missing: 'Noch nicht angegeben', noDescription: 'Für dieses Event liegt noch keine Beschreibung vor.', checked: 'Zuletzt geprüft', notFound: 'Dieses Event ist derzeit nicht öffentlich verfügbar. Bitte nutze die Eventsuche.', unavailable: 'Die Eventdetails konnten gerade nicht geladen werden. Bitte versuche es erneut.', invalid: 'Dieser Eventlink ist ungültig. Bitte nutze die Eventsuche.', snapshot: 'Der Liveabruf ist vorübergehend nicht verfügbar. Angezeigt wird der gespeicherte Datenstand vom ', open: 'Geöffnet', closed: 'Geschlossen', sold_out: 'Ausgebucht', not_open: 'Noch nicht geöffnet', cancelled: 'Abgesagt', postponed: 'Verschoben', completed: 'Beendet', status: 'Veranstaltungsstatus', unknown: 'Beim Veranstalter prüfen', 'detail.addSeason': 'Zur Saison hinzufügen', 'detail.savedSeason': 'In deiner Saison', 'detail.removeSeason': 'Aus der Saison entfernen', 'detail.addingSeason': 'Wird hinzugefügt …', 'detail.removingSeason': 'Wird entfernt …', 'detail.addedSeason': 'Zur Saison hinzugefügt.', 'detail.removedSeason': 'Aus der Saison entfernt.', 'detail.saveUnavailable': 'Speichern gerade nicht möglich. Bitte erneut versuchen.', 'detail.removeUnavailable': 'Entfernen gerade nicht möglich. Bitte erneut versuchen.' },
    en: { back: 'Back to map', language: 'Language', loading: 'Loading event details …', retry: 'Try again', verify: 'Check the final details with the organizer before registering.', official: 'Official website / registration', facts: 'Overview', description: 'Description', sources: 'Sources', source: 'Open source', imprint: 'Legal notice', privacy: 'Privacy', date: 'Date', location: 'Location', distance: 'Distances', sport: 'Sport', address: 'Address', registration: 'Registration', missing: 'Not provided yet', noDescription: 'No description is available for this event yet.', checked: 'Last checked', notFound: 'This event is not publicly available at present. Please use the event search.', unavailable: 'Event details could not be loaded. Please try again.', invalid: 'This event link is invalid. Please use the event search.', snapshot: 'Live data is temporarily unavailable. Showing the saved data from ', open: 'Open', closed: 'Closed', sold_out: 'Sold out', not_open: 'Not open yet', cancelled: 'Cancelled', postponed: 'Postponed', completed: 'Completed', status: 'Event status', unknown: 'Check with the organizer', 'detail.addSeason': 'Add to Season', 'detail.savedSeason': 'In your season', 'detail.removeSeason': 'Remove from season', 'detail.addingSeason': 'Adding …', 'detail.removingSeason': 'Removing …', 'detail.addedSeason': 'Added to your season.', 'detail.removedSeason': 'Removed from your season.', 'detail.saveUnavailable': 'Could not save. Please try again.', 'detail.removeUnavailable': 'Could not remove. Please try again.' }
  };
  let language = 'de';
  try { language = localStorage.getItem('sportEventMapLanguage') === 'en' ? 'en' : 'de'; } catch { /* Storage is optional. */ }
  let event = null, notice = 'loading', snapshotDate = '';
  const t = key => labels[language][key] || key;
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const slug = new URLSearchParams(location.search).get('event') || '';
  const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 240;
  const fields = 'event_id,edition_id,event_name,sport,date,city,country,address,latitude,longitude,distance,description,event_url,source_url,last_checked,event_status,edition_slug,edition_year,registration_status,race_formats';

  function safeUrl(value) {
    try { const url = new URL(text(value)); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; }
    catch { return ''; }
  }
  function link(id, value) {
    const element = byId(id), href = safeUrl(value);
    element.hidden = !href;
    if (href) element.href = href; else element.removeAttribute('href');
  }
  function displayDate(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(date) : t('missing');
  }
  function render() {
    document.documentElement.lang = language;
    byId('eventDetailLanguageSelect').value = language;
    byId('eventDetailLanguageSelect').setAttribute('aria-label', t('language'));
    document.querySelectorAll('[data-live-i18n]').forEach(el => { el.textContent = t(el.dataset.liveI18n); });
    byId('liveDetailStatus').hidden = !notice;
    byId('liveDetailStatus').textContent = notice ? t(notice) + (notice === 'snapshot' ? displayDate(snapshotDate) : '') : '';
    if (!event) return;
    document.title = `${text(event.event_name)} · ${text(event.edition_year) || text(event.date)} | Sport Event Map`;
    byId('liveDetailName').textContent = text(event.event_name);
    byId('liveDetailSport').textContent = text(event.sport);
    const locationLabel = [event.city, event.country].map(text).filter(Boolean).join(', ');
    byId('liveDetailLocation').textContent = locationLabel;
    byId('liveDetailDescription').textContent = text(event.description) || t('noDescription');
    byId('liveDetailChecked').textContent = `${t('checked')}: ${displayDate(event.last_checked)}`;
    const formats = (Array.isArray(event.race_formats) ? event.race_formats : []).map(f => text(f?.label)).filter(Boolean);
    const facts = [['date', text(event.date)], ['location', locationLabel], ['distance', formats.length ? [...new Set(formats)].join(' · ') : text(event.distance)], ['sport', text(event.sport)], ['address', text(event.address)], ['registration', ['open','closed','sold_out','not_open'].includes(event.registration_status) ? t(event.registration_status) : t('unknown')]];
    if (['cancelled','postponed','completed'].includes(event.event_status)) facts.unshift(['status', t(event.event_status)]);
    byId('liveDetailFacts').replaceChildren(...facts.map(([key, value]) => {
      const card = document.createElement('div'); card.className = 'race-guide-fact-card';
      const label = document.createElement('span'); label.textContent = t(key);
      const content = document.createElement('strong'); content.textContent = value || t('missing');
      card.append(label, content); return card;
    }));
    link('liveDetailOfficial', event.event_url);
    link('liveDetailSource', event.source_url);
    byId('liveDetailContent').hidden = false;
  }
  window.sportEventMapDetailI18n = { translate: t };
  byId('eventDetailLanguageSelect').addEventListener('change', e => {
    language = e.target.value === 'en' ? 'en' : 'de';
    try { localStorage.setItem('sportEventMapLanguage', language); } catch { /* Storage is optional. */ }
    render();
    window.dispatchEvent(new CustomEvent('sport-event-map-detail-languagechange'));
  });
  byId('liveDetailRetry').addEventListener('click', () => location.reload());

  async function json(url, headers = {}) {
    const response = await fetch(url, { headers, credentials: 'omit', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Public detail unavailable');
    return response.json();
  }
  async function load() {
    if (!validSlug) { notice = 'invalid'; render(); return; }
    render();
    let rows;
    try {
      const config = window.SPORT_EVENT_MAP_CONFIG || {};
      if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('Public config unavailable');
      const url = new URL('/rest/v1/public_event_archive', config.supabaseUrl);
      url.search = new URLSearchParams({ select: fields, edition_slug: 'eq.' + slug, limit: '2' });
      // Only the established public view and public key; no user session token.
      rows = await json(url, { apikey: config.supabasePublishableKey });
      if (!Array.isArray(rows)) throw new Error('Invalid public response');
    } catch {
      try {
        const archive = await json('/data/event-editions-public.json');
        if (!Array.isArray(archive.editions) || !Number.isFinite(Date.parse(archive.exported_at))) throw new Error('Invalid snapshot');
        rows = archive.editions.filter(row => row.edition_slug === slug);
        if (rows.length !== 1) throw new Error('No saved edition');
        snapshotDate = archive.exported_at;
      } catch { notice = 'unavailable'; byId('liveDetailRetry').hidden = false; render(); return; }
    }
    if (rows.length !== 1 || rows[0]?.edition_slug !== slug || !text(rows[0]?.event_name)) { notice = 'notFound'; render(); return; }
    event = rows[0];
    notice = snapshotDate ? 'snapshot' : '';
    // Reuse the existing detail-page Season Planner behavior and identity.
    window.sportEventMapDetailConfig = { event: { ...event, event_slug: slug, event_key: [event.event_name, event.date, event.city].map(text).filter(Boolean).join('|').toLowerCase() } };
    render();
    const script = document.createElement('script');
    script.src = '/js/event-detail.js?v=20260725-publish-runtime-v96';
    script.onerror = () => { byId('detailActionStatus').textContent = t('detail.saveUnavailable'); };
    document.head.append(script);
  }
  load();
})();
