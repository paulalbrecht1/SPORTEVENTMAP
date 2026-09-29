/* Canonical public facts for both existing static edition pages and the live shell. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const staticPage = !byId('liveDetailContent');
  const staticConfig = window.sportEventMapDetailConfig?.event;
  let staticPrepared = false, coreRendered = false, guardSettled = false, loadSettled = false, liveResponse = false;
  const labels = {
    de: { back: 'Zur Karte', language: 'Sprache', loading: 'Eventdetails werden geladen …', retry: 'Erneut versuchen', verify: 'Bitte prüfe die endgültigen Angaben vor der Anmeldung beim Veranstalter.', official: 'Offizielle Website / Anmeldung', facts: 'Überblick', description: 'Beschreibung', sources: 'Quellen', source: 'Quelle öffnen', imprint: 'Impressum', privacy: 'Datenschutz', date: 'Datum', location: 'Ort', distance: 'Distanzen', sport: 'Sportart', address: 'Adresse', registration: 'Anmeldung', missing: 'Noch nicht angegeben', noDescription: 'Für dieses Event liegt noch keine Beschreibung vor.', checked: 'Zuletzt geprüft', notFound: 'Dieses Event ist derzeit nicht öffentlich verfügbar. Bitte nutze die Eventsuche.', unavailable: 'Die Eventdetails konnten gerade nicht geladen werden. Bitte versuche es erneut.', invalid: 'Dieser Eventlink ist ungültig. Bitte nutze die Eventsuche.', snapshot: 'Der Liveabruf ist vorübergehend nicht verfügbar. Angezeigt wird der gespeicherte Datenstand vom ', open: 'Geöffnet', closed: 'Geschlossen', sold_out: 'Ausgebucht', not_open: 'Noch nicht geöffnet', cancelled: 'Abgesagt', postponed: 'Verschoben', completed: 'Beendet', status: 'Veranstaltungsstatus', unknown: 'Beim Veranstalter prüfen', 'detail.addSeason': 'Zur Saison hinzufügen', 'detail.savedSeason': 'In deiner Saison', 'detail.removeSeason': 'Aus der Saison entfernen', 'detail.addingSeason': 'Wird hinzugefügt …', 'detail.removingSeason': 'Wird entfernt …', 'detail.addedSeason': 'Zur Saison hinzugefügt.', 'detail.removedSeason': 'Aus der Saison entfernt.', 'detail.saveUnavailable': 'Speichern gerade nicht möglich. Bitte erneut versuchen.', 'detail.removeUnavailable': 'Entfernen gerade nicht möglich. Bitte erneut versuchen.' },
    en: { back: 'Back to map', language: 'Language', loading: 'Loading event details …', retry: 'Try again', verify: 'Check the final details with the organizer before registering.', official: 'Official website / registration', facts: 'Overview', description: 'Description', sources: 'Sources', source: 'Open source', imprint: 'Legal notice', privacy: 'Privacy', date: 'Date', location: 'Location', distance: 'Distances', sport: 'Sport', address: 'Address', registration: 'Registration', missing: 'Not provided yet', noDescription: 'No description is available for this event yet.', checked: 'Last checked', notFound: 'This event is not publicly available at present. Please use the event search.', unavailable: 'Event details could not be loaded. Please try again.', invalid: 'This event link is invalid. Please use the event search.', snapshot: 'Live data is temporarily unavailable. Showing the saved data from ', open: 'Open', closed: 'Closed', sold_out: 'Sold out', not_open: 'Not open yet', cancelled: 'Cancelled', postponed: 'Postponed', completed: 'Completed', status: 'Event status', unknown: 'Check with the organizer', 'detail.addSeason': 'Add to Season', 'detail.savedSeason': 'In your season', 'detail.removeSeason': 'Remove from season', 'detail.addingSeason': 'Adding …', 'detail.removingSeason': 'Removing …', 'detail.addedSeason': 'Added to your season.', 'detail.removedSeason': 'Removed from your season.', 'detail.saveUnavailable': 'Could not save. Please try again.', 'detail.removeUnavailable': 'Could not remove. Please try again.' }
  };
  labels.de.eventLink = 'Event-Website / Anmeldung';
  labels.en.eventLink = 'Event website / registration';
  labels.de.scheduled = 'Geplant'; labels.en.scheduled = 'Scheduled';
  labels.de.date_unconfirmed = 'Termin noch nicht bestätigt'; labels.en.date_unconfirmed = 'Date not confirmed';
  labels.de.inactive = 'Inaktiv'; labels.en.inactive = 'Inactive';
  labels.de.from = 'ab'; labels.en.from = 'from'; labels.de.upTo = 'bis'; labels.en.upTo = 'up to';
  Object.assign(labels.de, { end_date: 'Enddatum', start_time: 'Startzeit', price: 'Startgebühr', participant_limit: 'Teilnahmelimit', coordinates: 'Koordinaten', registrationLink: 'Zur Anmeldung', swim: 'Schwimmen', bike: 'Radfahren', run: 'Laufen', elevation: 'Höhenmeter', staticSnapshot: 'Gespeicherter Datenstand: Der Liveabruf ist vorübergehend nicht verfügbar. Bitte aktuelle Angaben beim Veranstalter prüfen.' });
  Object.assign(labels.en, { end_date: 'End date', start_time: 'Start time', price: 'Entry fee', participant_limit: 'Entry limit', coordinates: 'Coordinates', registrationLink: 'Register', swim: 'Swim', bike: 'Bike', run: 'Run', elevation: 'Elevation gain', staticSnapshot: 'Saved data: Live data is temporarily unavailable. Check current details with the organizer.' });
  let language = staticPage && document.documentElement.lang === 'en' ? 'en' : 'de';
  try { const preference = localStorage.getItem('sportEventMapLanguage'); if (preference) language = preference === 'en' ? 'en' : 'de'; } catch { /* Storage is optional. */ }
  Object.assign(labels.de, { organizer: 'Veranstalter', course: 'Strecke', race_day: 'Renntag', travel: 'Anreise & Logistik', registration_open_date: 'Anmeldung ab', registration_deadline: 'Anmeldeschluss', registration_close_date: 'Anmeldeschluss', withdrawal_deadline: 'Rücktrittsfrist', entry_fee_min: 'Startgebühr ab', entry_fee_max: 'Startgebühr bis', official_registration_url: 'Offizielle Anmeldung', start_time: 'Startzeit', start_area: 'Startbereich', finish_area: 'Zielbereich', total_cutoff: 'Gesamt-Zeitlimit', swim_cutoff: 'Schwimm-Zeitlimit', bike_cutoff: 'Rad-Zeitlimit', run_cutoff: 'Lauf-Zeitlimit', bib_pickup_info: 'Startunterlagen', expo: 'Expo', athlete_guide_url: 'Athletenleitfaden', swim_distance: 'Schwimmstrecke', bike_distance: 'Radstrecke', run_distance: 'Laufstrecke', elevation_gain: 'Höhenmeter', surface: 'Untergrund', course_character: 'Streckencharakter', course_map_url: 'Offizieller Streckenplan', gpx_url: 'Offizielle GPX-Route', public_transport_info: 'Öffentliche Verkehrsmittel', parking_info: 'Parken', nearest_train_station: 'Bahnhof', sourceChecked: 'Quelle geprüft', sourceCoverage: 'Angaben zu' });
  Object.assign(labels.en, { organizer: 'Organizer', course: 'Course', race_day: 'Race day', travel: 'Travel & logistics', registration_open_date: 'Registration opens', registration_deadline: 'Registration deadline', registration_close_date: 'Registration deadline', withdrawal_deadline: 'Withdrawal deadline', entry_fee_min: 'Entry fee from', entry_fee_max: 'Entry fee up to', official_registration_url: 'Official registration', start_time: 'Start time', start_area: 'Start area', finish_area: 'Finish area', total_cutoff: 'Overall cutoff', swim_cutoff: 'Swim cutoff', bike_cutoff: 'Bike cutoff', run_cutoff: 'Run cutoff', bib_pickup_info: 'Bib pickup', expo: 'Expo', athlete_guide_url: 'Athlete guide', swim_distance: 'Swim distance', bike_distance: 'Bike distance', run_distance: 'Run distance', elevation_gain: 'Elevation gain', surface: 'Surface', course_character: 'Course character', course_map_url: 'Official course map', gpx_url: 'Official GPX route', public_transport_info: 'Public transport', parking_info: 'Parking', nearest_train_station: 'Train station', sourceChecked: 'Source checked', sourceCoverage: 'Source covers' });
  let event = null, notice = 'loading', snapshotDate = '', richRecords = [], coreVerified = false;
  const t = key => labels[language][key] || key;
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const slug = location.pathname.match(/^\/event\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(?:index\.html)?$/)?.[1] || new URLSearchParams(location.search).get('event') || '';
  const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 240;
  const fields = 'event_id,edition_id,event_name,sport,date,end_date,start_time,city,country,address,latitude,longitude,distance,description,event_url,official_url,registration_url,organizer_name,organizer_url,source_url,last_checked,event_status,edition_slug,edition_year,registration_status,race_formats,price_min,price_max,currency,participant_limit';

  function markPublicState() {
    const verified = liveResponse && coreRendered && guardSettled && event && (!staticPage || staticPrepared);
    document.documentElement.dataset.semPublicDetailState = verified ? 'verified' : loadSettled ? 'unavailable' : 'loading';
    document.documentElement.dataset.semPublicEditionId = verified ? event.edition_id : '';
    byId('sem-public-detail-data')?.remove();
    if (verified) {
      const data = document.createElement('script'); data.type = 'application/json'; data.id = 'sem-public-detail-data';
      data.textContent = JSON.stringify(event); document.head.append(data);
    }
  }

  function staticNotice() {
    if (!staticPage || byId('liveDetailStatus')) return;
    const status = document.createElement('p'); status.id = 'liveDetailStatus'; status.className = 'live-detail-notice'; status.setAttribute('role', 'status');
    const retry = document.createElement('button'); retry.id = 'liveDetailRetry'; retry.className = 'event-detail-secondary'; retry.hidden = true; retry.textContent = t('retry');
    document.querySelector('.event-detail-header')?.after(status, retry);
    const style = document.createElement('style');
    style.textContent = '[hidden]{display:none!important}.live-detail-copy{white-space:pre-line;overflow-wrap:anywhere;line-height:1.7}.live-detail-notice{padding:16px;border:1px solid var(--border-color,#9ca3af);border-radius:12px;line-height:1.6}.live-detail-facts .race-guide-fact-card{min-width:0;overflow-wrap:anywhere;grid-template-columns:minmax(0,1fr);grid-template-areas:"label" "value"}';
    document.head.append(style);
    document.querySelectorAll('.event-verification-strip, .race-guide-status-panel > .event-detail-badge').forEach(node => node.remove());
  }

  function prepareStaticPage() {
    if (!staticPage || staticPrepared) return;
    staticPrepared = true;
    const assign = (selector, id) => { const node = document.querySelector(selector); if (node) node.id = id; return node; };
    assign('.event-detail-shell', 'liveDetailContent');
    assign('.event-detail-hero h1', 'liveDetailName');
    assign('.event-detail-hero .event-detail-kicker', 'liveDetailSport');
    assign('.event-detail-hero-main > p', 'liveDetailLocation');
    assign('.event-detail-tabs', 'liveDetailNavigation');
    const facts = byId('key-facts');
    facts.replaceChildren();
    const heading = document.createElement('h2'); heading.dataset.liveI18n = 'facts';
    const grid = document.createElement('div'); grid.id = 'liveDetailFacts'; grid.className = 'race-guide-fact-grid live-detail-facts';
    facts.append(heading, grid);
    // Remove duplicated static facts; retain distinct route, travel and result knowledge.
    document.querySelectorAll('.race-guide-registration-status, .race-guide-registration-link, #why-this-event-matters, #event-highlights, #highlights, .event-detail-hero .event-detail-badge').forEach(node => node.remove());
    for (const key of ['entryFee', 'feeTiers', 'startTime', 'swim', 'bike', 'run', 'elevation', 'eventLocation']) {
      document.querySelectorAll(`[data-detail-i18n="detail.${key}"]`).forEach(label => label.closest(key === 'feeTiers' || key === 'eventLocation' ? '.race-guide-subsection' : 'article')?.remove());
    }
    const description = document.createElement('section'); description.id = 'description'; description.className = 'event-detail-card race-guide-section';
    description.innerHTML = '<h2 data-live-i18n="description"></h2><p id="liveDetailDescription" class="live-detail-copy"></p>';
    facts.after(description);
    const extra = document.createElement('div'); extra.id = 'liveDetailSections'; extra.className = 'live-detail-sections'; description.after(extra);
    let sources = byId('sources');
    if (!sources) { sources = document.createElement('section'); sources.id = 'sources'; sources.className = 'event-detail-card race-guide-section'; byId('liveDetailContent').append(sources); }
    const checked = document.createElement('p'); checked.id = 'liveDetailChecked';
    const source = document.createElement('a'); source.id = 'liveDetailSource'; source.dataset.liveI18n = 'source'; source.className = 'event-detail-secondary'; source.target = '_blank'; source.rel = 'noopener noreferrer';
    const oldSources = document.createElement('div'); oldSources.id = 'liveDetailSources';
    sources.append(checked, source, oldSources);
    let official = assign('.event-detail-action-group > a.event-detail-primary', 'liveDetailOfficial');
    if (!official) { official = document.createElement('a'); official.id = 'liveDetailOfficial'; official.className = 'event-detail-primary'; official.target = '_blank'; official.rel = 'noopener noreferrer'; document.querySelector('.event-detail-action-group').append(official); }
    // The old JSON-LD is a frozen export too; update it only from this anonymous row.
    document.querySelectorAll('script[type="application/ld+json"]').forEach(node => node.remove());
    const schema = document.createElement('script'); schema.type = 'application/ld+json';
    const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? value : text(value).replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, '$3-$2-$1');
    schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Event', name: event.event_name, description: event.description || undefined, startDate: isoDate(event.date), endDate: event.end_date || undefined, url: location.origin + location.pathname, eventStatus: 'https://schema.org/' + ({ cancelled: 'EventCancelled', postponed: 'EventPostponed' }[event.event_status] || 'EventScheduled'), location: { '@type': 'Place', name: text(event.city), address: text(event.address), geo: event.latitude != null && event.longitude != null ? { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude } : undefined } });
    document.head.append(schema);
    document.querySelectorAll('meta[name="description"], meta[property="og:description"]').forEach(node => node.content = text(event.description));
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', text(event.event_name));
  }
  staticNotice();
  markPublicState();

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
  function isoDate(value) {
    return text(value).replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, '$3-$2-$1').slice(0, 10);
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
    // A static detail export must never restore a canonical value that was
    // corrected or deliberately cleared through the maintenance workflow.
    if ((section === 'basis' && ['organizer_name', 'official_website'].includes(field)) ||
        (section === 'registration' && ['registration_status', 'official_registration_url', 'entry_fee_min', 'entry_fee_max'].includes(field)) ||
        (section === 'race_day' && field === 'start_time') ||
        (section === 'course' && ['swim_distance', 'bike_distance', 'run_distance', 'elevation_gain'].includes(field))) return '';
    // Annual information is never inherited from a brand record.
    const annual = ['registration', 'race_day'].includes(section) || (section === 'course' && /^(distances|main_distance|swim_distance|bike_distance|run_distance|course_map_url|gpx_url|elevation_profile_url)$/.test(field));
    const candidates = richRecords.filter(record => !annual || record.knowledge_scope === 'edition');
    const owner = [...candidates].reverse().find(record => Object.hasOwn(record[section] || {}, field));
    return owner ? factValue(owner, section, field) : '';
  }
  function renderRichDetails() {
    if (staticPage) {
      const navigation = byId('liveDetailNavigation');
      if (!navigation.querySelector('[href="#description"]')) {
        const anchor = document.createElement('a'); anchor.href = '#description'; anchor.dataset.detailSection = 'description'; anchor.dataset.liveI18n = 'description'; anchor.textContent = t('description'); navigation.append(anchor);
      }
      navigation.querySelector('[href="#description"]').hidden = byId('description').hidden;
      window.dispatchEvent(new CustomEvent('sport-event-map-detail-contentchange'));
      return;
    }
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
    if (event) prepareStaticPage();
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
    const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 3 }).format(Number(value)) : '';
    const formats = (Array.isArray(event.race_formats) ? event.race_formats : []).map(format => {
      const details = [['distance_km', '', 'km'], ['swim_km', 'swim', 'km'], ['bike_km', 'bike', 'km'], ['run_km', 'run', 'km'], ['elevation_gain_m', 'elevation', 'm']].flatMap(([key, label, unit]) => number(format?.[key]) ? [`${label ? t(label) + ' ' : ''}${number(format[key])} ${unit}`] : []);
      return [text(format?.label), ...details].filter(Boolean).join(' · ');
    }).filter(Boolean);
    const registrationStatus = text(event.registration_status).replace(/^registration_/, '');
    const fees = [number(event.price_min), number(event.price_max)].filter(Boolean);
    const priceBound = fees.length === 1 ? t(number(event.price_min) ? 'from' : 'upTo') + ' ' : '';
    const price = fees.length ? `${priceBound}${[...new Set(fees)].join(' – ')}${text(event.currency) ? ' ' + text(event.currency) : ''}` : '';
    const facts = [['date', event.date ? displayDate(isoDate(event.date)) : ''], ['end_date', event.end_date && isoDate(event.end_date) !== isoDate(event.date) ? displayDate(isoDate(event.end_date)) : ''], ['start_time', text(event.start_time)], ['location', locationLabel], ['distance', formats.length ? [...new Set(formats)].join(' · ') : text(event.distance)], ['sport', text(event.sport)], ['address', text(event.address)], ['coordinates', number(event.latitude) && number(event.longitude) ? `${text(event.latitude)}, ${text(event.longitude)}` : ''], ['registration', ['open','closed','sold_out','not_open','cancelled'].includes(registrationStatus) ? t(registrationStatus) : t('unknown')], ['price', price], ['participant_limit', number(event.participant_limit)]];
    if (['scheduled','date_unconfirmed','cancelled','postponed','completed','inactive'].includes(event.event_status)) facts.unshift(['status', t(event.event_status)]);
    const organizer = text(event.organizer_name) || safeUrl(event.organizer_url);
    if (organizer) facts.push(['organizer', organizer]);
    byId('liveDetailFacts').replaceChildren(...facts.filter(([, value]) => value).map(([key, value]) => {
      const card = document.createElement('div'); card.className = 'race-guide-fact-card';
      card.dataset.publicDetailField = key;
      const label = document.createElement('span'); label.textContent = t(key);
      const content = document.createElement('strong'); content.textContent = value || t('missing');
      if (key === 'organizer' && safeUrl(event.organizer_url)) { const anchor = document.createElement('a'); anchor.href = safeUrl(event.organizer_url); anchor.textContent = value; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; content.replaceChildren(anchor); }
      card.append(label, content); return card;
    }));
    const officialWebsite = safeUrl(event.official_url);
    link('liveDetailOfficial', officialWebsite || event.event_url);
    byId('liveDetailOfficial').textContent = t(officialWebsite ? 'official' : 'eventLink');
    link('liveDetailSource', event.source_url);
    let registration = byId('liveDetailRegistration');
    if (!registration) { registration = document.createElement('a'); registration.id = 'liveDetailRegistration'; registration.className = 'event-detail-primary'; registration.target = '_blank'; registration.rel = 'noopener noreferrer'; byId('liveDetailOfficial').after(registration); }
    registration.textContent = t('registrationLink'); link('liveDetailRegistration', event.registration_url);
    renderRichDetails();
    byId('liveDetailContent').hidden = false;
    coreRendered = true;
    markPublicState();
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
    const response = await fetch(url, { headers, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(12000) });
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
        method: 'POST', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(6000),
        headers: { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_edition_ids: [event.edition_id] })
      });
      if (!response.ok) return;
      const result = await response.json();
      coreVerified = result?.decisions?.[event.edition_id] === true;
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
      liveResponse = true;
    } catch {
      try {
        const archive = await json('/data/event-editions-public.json');
        if (!Array.isArray(archive.editions) || !Number.isFinite(Date.parse(archive.exported_at))) throw new Error('Invalid snapshot');
        rows = archive.editions.filter(row => row.edition_slug === slug);
        if (rows.length !== 1) throw new Error('No saved edition');
        snapshotDate = archive.exported_at;
      } catch { notice = staticPage ? 'staticSnapshot' : 'unavailable'; byId('liveDetailRetry').hidden = false; render(); return; }
    }
    if (rows.length !== 1 || rows[0]?.edition_slug !== slug || !text(rows[0]?.event_name)) {
      notice = 'notFound';
      if (staticPage) document.querySelectorAll('.event-detail-shell > section, .event-detail-shell > nav').forEach(node => { node.hidden = true; });
      render(); return;
    }
    event = rows[0];
    notice = snapshotDate ? 'snapshot' : '';
    // Reuse the existing detail-page Season Planner behavior and identity.
    window.sportEventMapDetailConfig = { event: { ...event, event_slug: slug, event_key: staticConfig?.edition_id === event.edition_id && staticConfig?.event_key ? staticConfig.event_key : [event.event_name, event.date, event.city].map(text).filter(Boolean).join('|').toLowerCase() } };
    render();
    if (!staticPage) {
      const script = document.createElement('script');
      script.src = '/js/event-detail.js?v=20260929-public-detail-v129';
      script.onerror = () => { byId('detailActionStatus').textContent = t('detail.saveUnavailable'); };
      document.head.append(script);
      void loadRichDetails();
    }
    await loadFreshnessGuard();
    guardSettled = true;
    render();
  }
  load().catch(() => {
    liveResponse = false; notice = staticPage ? 'staticSnapshot' : 'unavailable';
    byId('liveDetailStatus').hidden = false; byId('liveDetailStatus').textContent = t(notice);
    byId('liveDetailRetry').hidden = false;
  }).finally(() => { loadSettled = true; markPublicState(); window.sportEventMapPublicDetailReady?.(); });
})();
