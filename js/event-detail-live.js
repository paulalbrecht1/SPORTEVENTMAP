/* Public detail page for published editions that have no static export yet. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const labels = {
    de: { back: 'Zur Karte', language: 'Sprache', loading: 'Eventdetails werden geladen …', retry: 'Erneut versuchen', verify: 'Bitte prüfe die endgültigen Angaben vor der Anmeldung beim Veranstalter.', official: 'Offizielle Website / Anmeldung', facts: 'Überblick', description: 'Beschreibung', sources: 'Quellen', source: 'Quelle öffnen', imprint: 'Impressum', privacy: 'Datenschutz', date: 'Datum', location: 'Ort', distance: 'Distanzen', sport: 'Sportart', address: 'Adresse', registration: 'Anmeldung', missing: 'Noch nicht angegeben', noDescription: 'Für dieses Event liegt noch keine Beschreibung vor.', checked: 'Zuletzt geprüft', notFound: 'Dieses Event ist derzeit nicht öffentlich verfügbar. Bitte nutze die Eventsuche.', unavailable: 'Die Eventdetails konnten gerade nicht geladen werden. Bitte versuche es erneut.', invalid: 'Dieser Eventlink ist ungültig. Bitte nutze die Eventsuche.', snapshot: 'Der Liveabruf ist vorübergehend nicht verfügbar. Angezeigt wird der gespeicherte Datenstand vom ', open: 'Geöffnet', closed: 'Geschlossen', sold_out: 'Ausgebucht', not_open: 'Noch nicht geöffnet', cancelled: 'Abgesagt', postponed: 'Verschoben', completed: 'Beendet', status: 'Veranstaltungsstatus', unknown: 'Beim Veranstalter prüfen', 'detail.addSeason': 'Zur Saison hinzufügen', 'detail.savedSeason': 'In deiner Saison', 'detail.removeSeason': 'Aus der Saison entfernen', 'detail.addingSeason': 'Wird hinzugefügt …', 'detail.removingSeason': 'Wird entfernt …', 'detail.addedSeason': 'Zur Saison hinzugefügt.', 'detail.removedSeason': 'Aus der Saison entfernt.', 'detail.saveUnavailable': 'Speichern gerade nicht möglich. Bitte erneut versuchen.', 'detail.removeUnavailable': 'Entfernen gerade nicht möglich. Bitte erneut versuchen.' },
    en: { back: 'Back to map', language: 'Language', loading: 'Loading event details …', retry: 'Try again', verify: 'Check the final details with the organizer before registering.', official: 'Official website / registration', facts: 'Overview', description: 'Description', sources: 'Sources', source: 'Open source', imprint: 'Legal notice', privacy: 'Privacy', date: 'Date', location: 'Location', distance: 'Distances', sport: 'Sport', address: 'Address', registration: 'Registration', missing: 'Not provided yet', noDescription: 'No description is available for this event yet.', checked: 'Last checked', notFound: 'This event is not publicly available at present. Please use the event search.', unavailable: 'Event details could not be loaded. Please try again.', invalid: 'This event link is invalid. Please use the event search.', snapshot: 'Live data is temporarily unavailable. Showing the saved data from ', open: 'Open', closed: 'Closed', sold_out: 'Sold out', not_open: 'Not open yet', cancelled: 'Cancelled', postponed: 'Postponed', completed: 'Completed', status: 'Event status', unknown: 'Check with the organizer', 'detail.addSeason': 'Add to Season', 'detail.savedSeason': 'In your season', 'detail.removeSeason': 'Remove from season', 'detail.addingSeason': 'Adding …', 'detail.removingSeason': 'Removing …', 'detail.addedSeason': 'Added to your season.', 'detail.removedSeason': 'Removed from your season.', 'detail.saveUnavailable': 'Could not save. Please try again.', 'detail.removeUnavailable': 'Could not remove. Please try again.' }
  };
  labels.de.eventLink = 'Event-Website / Anmeldung';
  labels.en.eventLink = 'Event website / registration';
  let language = 'de';
  try { language = localStorage.getItem('sportEventMapLanguage') === 'en' ? 'en' : 'de'; } catch { /* Storage is optional. */ }
  Object.assign(labels.de, { organizer: 'Veranstalter', course: 'Strecke', race_day: 'Renntag', travel: 'Anreise & Logistik', registration_open_date: 'Anmeldung ab', registration_deadline: 'Anmeldeschluss', registration_close_date: 'Anmeldeschluss', withdrawal_deadline: 'Rücktrittsfrist', entry_fee_min: 'Startgebühr ab', entry_fee_max: 'Startgebühr bis', official_registration_url: 'Offizielle Anmeldung', start_time: 'Startzeit', start_area: 'Startbereich', finish_area: 'Zielbereich', total_cutoff: 'Gesamt-Zeitlimit', swim_cutoff: 'Schwimm-Zeitlimit', bike_cutoff: 'Rad-Zeitlimit', run_cutoff: 'Lauf-Zeitlimit', bib_pickup_info: 'Startunterlagen', expo: 'Expo', athlete_guide_url: 'Athletenleitfaden', swim_distance: 'Schwimmstrecke', bike_distance: 'Radstrecke', run_distance: 'Laufstrecke', elevation_gain: 'Höhenmeter', surface: 'Untergrund', course_character: 'Streckencharakter', course_map_url: 'Offizieller Streckenplan', gpx_url: 'Offizielle GPX-Route', public_transport_info: 'Öffentliche Verkehrsmittel', parking_info: 'Parken', nearest_train_station: 'Bahnhof', sourceChecked: 'Quelle geprüft', sourceCoverage: 'Angaben zu' });
  Object.assign(labels.en, { organizer: 'Organizer', course: 'Course', race_day: 'Race day', travel: 'Travel & logistics', registration_open_date: 'Registration opens', registration_deadline: 'Registration deadline', registration_close_date: 'Registration deadline', withdrawal_deadline: 'Withdrawal deadline', entry_fee_min: 'Entry fee from', entry_fee_max: 'Entry fee up to', official_registration_url: 'Official registration', start_time: 'Start time', start_area: 'Start area', finish_area: 'Finish area', total_cutoff: 'Overall cutoff', swim_cutoff: 'Swim cutoff', bike_cutoff: 'Bike cutoff', run_cutoff: 'Run cutoff', bib_pickup_info: 'Bib pickup', expo: 'Expo', athlete_guide_url: 'Athlete guide', swim_distance: 'Swim distance', bike_distance: 'Bike distance', run_distance: 'Run distance', elevation_gain: 'Elevation gain', surface: 'Surface', course_character: 'Course character', course_map_url: 'Official course map', gpx_url: 'Official GPX route', public_transport_info: 'Public transport', parking_info: 'Parking', nearest_train_station: 'Train station', sourceChecked: 'Source checked', sourceCoverage: 'Source covers' });
  let event = null, notice = 'loading', snapshotDate = '', richRecords = [], coreVerified = false;
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
  function verifiedDate(value) {
    const date = text(value).match(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/)?.[0];
    const parsed = date ? new Date(date) : null;
    return parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date.slice(0, 10) && parsed.getTime() <= Date.now() ? date : '';
  }
  function factValue(record, section, field) {
    const value = record?.[section]?.[field];
    const formatted = Array.isArray(value) ? value.map(text).filter(Boolean).join(' · ') : text(value);
    if (!formatted || /^(unknown|not (?:yet )?(?:officially confirmed|verified|available)|tba|tbd)\b/i.test(formatted)) return '';
    if (!/^(verified|verified_official_source|confirmed|partially_verified)$/.test(record.verification_status || '')) return '';
    const covered = (record.sources || []).some(source => /^(official|trusted)(?:_|$)/i.test(text(source.source_type)) && (!source.verification_status || /^(verified|verified_official_source|confirmed|partially_verified)$/.test(source.verification_status)) && safeUrl(source.source_url) && verifiedDate(source.last_verified) && text(source.field_path).split(/\s*,\s*/).some(path => path === `${section}.${field}` || path === section));
    if (!covered) return '';
    if (/cutoff$/.test(field) && (!/\b\d{1,3}(?:[.,]\d+)?\s*(?:h|hours?|hrs?|min|minutes?|stunden?|minuten?)\b|\b\d{1,2}:[0-5]\d\b/i.test(formatted) || /withdraw|refund|registration|entry|cancel|transfer|rücktritt|anmeld|abmeld|erstatt|storn|\b(?:before|prior|vor)\b/i.test(formatted))) return '';
    if (field === 'start_time' && (!/\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b\d{1,2}\s*(?:am|pm|uhr)\b/i.test(formatted) || /cutoff|registration|anmeld|before|prior|\bvor\b/i.test(formatted))) return '';
    return formatted;
  }
  function richValue(section, field) {
    // Annual information is never inherited from a brand record.
    const annual = ['registration', 'race_day'].includes(section) || (section === 'course' && /^(distances|main_distance|swim_distance|bike_distance|run_distance|course_map_url|gpx_url|elevation_profile_url)$/.test(field));
    const candidates = richRecords.filter(record => !annual || record.knowledge_scope === 'edition');
    const owner = [...candidates].reverse().find(record => Object.hasOwn(record[section] || {}, field));
    return owner ? factValue(owner, section, field) : '';
  }
  function renderRichDetails() {
    const sections = {
      registration: ['registration_status', 'registration_open_date', 'registration_close_date', 'registration_deadline', 'withdrawal_deadline', 'entry_fee_min', 'entry_fee_max', 'official_registration_url'],
      course: ['swim_distance', 'bike_distance', 'run_distance', 'elevation_gain', 'surface', 'course_character', 'course_map_url', 'gpx_url'],
      race_day: ['start_time', 'start_area', 'finish_area', 'total_cutoff', 'swim_cutoff', 'bike_cutoff', 'run_cutoff', 'bib_pickup_info', 'expo', 'athlete_guide_url'],
      travel: ['nearest_train_station', 'public_transport_info', 'parking_info']
    };
    const nodes = [];
    for (const [section, fields] of Object.entries(sections)) {
      const rows = fields.flatMap(field => {
        const value = richValue(section, field);
        if (!value || (field.endsWith('_url') && !safeUrl(value)) || (field === 'registration_deadline' && richValue(section, 'registration_close_date'))) return [];
        const term = document.createElement('dt'); term.textContent = t(field === 'registration_status' ? 'status' : field);
        const description = document.createElement('dd');
        if (field.endsWith('_url')) { const anchor = document.createElement('a'); anchor.href = safeUrl(value); anchor.textContent = t(field); anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; description.append(anchor); }
        else description.textContent = value;
        return [term, description];
      });
      if (!rows.length) continue;
      const node = document.createElement('section'); node.id = section; node.className = 'event-detail-card race-guide-section';
      const heading = document.createElement('h2'); heading.textContent = t(section);
      const list = document.createElement('dl'); list.className = 'live-detail-field'; list.append(...rows);
      node.append(heading, list); nodes.push(node);
    }
    byId('liveDetailSections').replaceChildren(...nodes);
    const sourceNodes = richRecords.flatMap(record => (record.sources || []).filter(source => safeUrl(source.source_url) && verifiedDate(source.last_verified)).map(source => {
      const anchor = document.createElement('a'); anchor.href = safeUrl(source.source_url); anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      const name = document.createElement('strong'); name.textContent = text(source.source_label) || t('source');
      const checked = document.createElement('span'); checked.textContent = `${t('sourceChecked')}: ${displayDate(source.last_verified)}`;
      const coverage = document.createElement('span');
      coverage.textContent = `${t('sourceCoverage')}: ${[...new Set(text(source.field_path).split(',').map(path => ({ basis: 'facts', editorial: 'description', race_day: 'race_day', course: 'course', registration: 'registration', travel: 'travel' })[path.trim().split('.')[0]]).filter(Boolean))].map(t).join(' · ')}`;
      anchor.append(name, checked, coverage); return anchor;
    }));
    byId('liveDetailSources').replaceChildren(...sourceNodes);
    byId('sources').hidden = !sourceNodes.length && !safeUrl(event.source_url) && !coreVerified;
    const anchors = [['key-facts', 'facts'], ...(byId('description').hidden ? [] : [['description', 'description']]), ...nodes.map(node => [node.id, node.id]), ...(byId('sources').hidden ? [] : [['sources', 'sources']])].map(([id, label]) => {
      const anchor = document.createElement('a'); anchor.href = `#${id}`; anchor.dataset.detailSection = id; anchor.textContent = t(label); return anchor;
    });
    byId('liveDetailNavigation').replaceChildren(...anchors);
    window.dispatchEvent(new CustomEvent('sport-event-map-detail-contentchange'));
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
    byId('liveDetailDescription').textContent = text(event.description);
    byId('description').hidden = !text(event.description);
    byId('liveDetailChecked').hidden = !coreVerified || !verifiedDate(event.last_checked);
    byId('liveDetailChecked').textContent = coreVerified && verifiedDate(event.last_checked) ? `${t('checked')}: ${displayDate(event.last_checked)}` : '';
    const formats = (Array.isArray(event.race_formats) ? event.race_formats : []).map(f => text(f?.label)).filter(Boolean);
    const registrationStatus = text(event.registration_status).replace(/^registration_/, '');
    const facts = [['date', text(event.date)], ['location', locationLabel], ['distance', formats.length ? [...new Set(formats)].join(' · ') : text(event.distance)], ['sport', text(event.sport)], ['address', text(event.address)], ['registration', ['open','closed','sold_out','not_open'].includes(registrationStatus) ? t(registrationStatus) : '']];
    if (['cancelled','postponed','completed'].includes(event.event_status)) facts.unshift(['status', t(event.event_status)]);
    const organizer = richValue('basis', 'organizer_name');
    if (organizer) facts.push(['organizer', organizer]);
    byId('liveDetailFacts').replaceChildren(...facts.filter(([, value]) => value).map(([key, value]) => {
      const card = document.createElement('div'); card.className = 'race-guide-fact-card';
      const label = document.createElement('span'); label.textContent = t(key);
      const content = document.createElement('strong'); content.textContent = value || t('missing');
      card.append(label, content); return card;
    }));
    const officialWebsite = safeUrl(event.official_url) || safeUrl(richValue('basis', 'official_website'));
    link('liveDetailOfficial', officialWebsite || event.event_url);
    byId('liveDetailOfficial').textContent = t(officialWebsite ? 'official' : 'eventLink');
    link('liveDetailSource', event.source_url);
    renderRichDetails();
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
  async function loadRichDetails() {
    try {
      const records = await json('/data/event-detail-database.json');
      if (!Array.isArray(records) || !event.edition_id || !event.event_id) return;
      const brands = records.filter(row => row?.knowledge_scope === 'brand' && String(row.event_brand_id) === String(event.event_id));
      const editions = records.filter(row => row?.knowledge_scope === 'edition' && row.edition_id === event.edition_id);
      if (brands.length > 1 || editions.length > 1 || editions.some(row => String(row.event_brand_id) !== String(event.event_id) || row.event_slug !== event.edition_slug)) return;
      richRecords = [...brands, ...editions];
      render();
    } catch { /* Optional details never prevent the published edition from opening. */ }
  }
  async function loadFreshnessGuard() {
    const config = window.SPORT_EVENT_MAP_CONFIG || {};
    if (!config.supabaseUrl || !config.supabasePublishableKey || !/^[0-9a-f-]{36}$/i.test(event.edition_id || '') || snapshotDate) return;
    try {
      const response = await fetch(new URL('/rest/v1/rpc/get_public_event_freshness_guard', config.supabaseUrl), {
        method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(6000),
        headers: { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_edition_ids: [event.edition_id] })
      });
      if (!response.ok) return;
      const decisions = await response.json();
      coreVerified = decisions?.[event.edition_id] === true;
      render();
    } catch { /* A missing freshness decision must not create a verified badge. */ }
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
    void loadRichDetails();
    void loadFreshnessGuard();
  }
  load();
})();
