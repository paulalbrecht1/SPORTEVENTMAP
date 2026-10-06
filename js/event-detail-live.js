/* Canonical public facts for both existing static edition pages and the live shell. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const staticPage = !byId('liveDetailContent');
  const staticConfig = window.sportEventMapDetailConfig?.event;
  const staticI18n = window.sportEventMapDetailI18n;
  let staticPrepared = false, coreRendered = false, guardSettled = false, loadSettled = false, liveResponse = false;
  let richSettled = false, richLive = false, richRendered = false, detailMap = null, detailMarker = null, mapCoordinates = '', mapPromise = null;
  let preservedFacts = [], preservedSections = [];
  const labels = {
    de: { back: 'Zur Karte', language: 'Sprache', loading: 'Eventdetails werden geladen …', retry: 'Erneut versuchen', verify: 'Bitte prüfe die endgültigen Angaben vor der Anmeldung beim Veranstalter.', official: 'Offizielle Website / Anmeldung', facts: 'Überblick', description: 'Beschreibung', sources: 'Quellen', source: 'Quelle öffnen', imprint: 'Impressum', privacy: 'Datenschutz', date: 'Datum', location: 'Ort', distance: 'Distanzen', sport: 'Sportart', address: 'Adresse', registration: 'Anmeldung', missing: 'Noch nicht angegeben', noDescription: 'Für dieses Event liegt noch keine Beschreibung vor.', checked: 'Zuletzt geprüft', notFound: 'Dieses Event ist derzeit nicht öffentlich verfügbar. Bitte nutze die Eventsuche.', unavailable: 'Die Eventdetails konnten gerade nicht geladen werden. Bitte versuche es erneut.', invalid: 'Dieser Eventlink ist ungültig. Bitte nutze die Eventsuche.', snapshot: 'Der Liveabruf ist vorübergehend nicht verfügbar. Angezeigt wird der gespeicherte Datenstand vom ', open: 'Geöffnet', closed: 'Geschlossen', sold_out: 'Ausgebucht', not_open: 'Noch nicht geöffnet', cancelled: 'Abgesagt', postponed: 'Verschoben', completed: 'Beendet', status: 'Veranstaltungsstatus', unknown: 'Beim Veranstalter prüfen', 'detail.addSeason': 'Zur Saison hinzufügen', 'detail.savedSeason': 'In deiner Saison', 'detail.removeSeason': 'Aus der Saison entfernen', 'detail.addingSeason': 'Wird hinzugefügt …', 'detail.removingSeason': 'Wird entfernt …', 'detail.addedSeason': 'Zur Saison hinzugefügt.', 'detail.removedSeason': 'Aus der Saison entfernt.', 'detail.saveUnavailable': 'Speichern gerade nicht möglich. Bitte erneut versuchen.', 'detail.removeUnavailable': 'Entfernen gerade nicht möglich. Bitte erneut versuchen.' },
    en: { back: 'Back to map', language: 'Language', loading: 'Loading event details …', retry: 'Try again', verify: 'Check the final details with the organizer before registering.', official: 'Official website / registration', facts: 'Overview', description: 'Description', sources: 'Sources', source: 'Open source', imprint: 'Legal notice', privacy: 'Privacy', date: 'Date', location: 'Location', distance: 'Distances', sport: 'Sport', address: 'Address', registration: 'Registration', missing: 'Not provided yet', noDescription: 'No description is available for this event yet.', checked: 'Last checked', notFound: 'This event is not publicly available at present. Please use the event search.', unavailable: 'Event details could not be loaded. Please try again.', invalid: 'This event link is invalid. Please use the event search.', snapshot: 'Live data is temporarily unavailable. Showing the saved data from ', open: 'Open', closed: 'Closed', sold_out: 'Sold out', not_open: 'Not open yet', cancelled: 'Cancelled', postponed: 'Postponed', completed: 'Completed', status: 'Event status', unknown: 'Check with the organizer', 'detail.addSeason': 'Add to Season', 'detail.savedSeason': 'In your season', 'detail.removeSeason': 'Remove from season', 'detail.addingSeason': 'Adding …', 'detail.removingSeason': 'Removing …', 'detail.addedSeason': 'Added to your season.', 'detail.removedSeason': 'Removed from your season.', 'detail.saveUnavailable': 'Could not save. Please try again.', 'detail.removeUnavailable': 'Could not remove. Please try again.' }
  };
  labels.de.eventLink = 'Event-Website / Anmeldung';
  labels.en.eventLink = 'Event website / registration';
  labels.de.checked = 'Kerndaten zuletzt geprüft'; labels.en.checked = 'Core facts last checked';
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
  const richLabels = {
    competitions: ['Wettbewerbe', 'Races'], editorial: ['Über die Veranstaltung', 'About the event'], performance: ['Ergebnisse & Geschichte', 'Results & history'], rules: ['Teilnahmebedingungen', 'Entry conditions'], faq: ['Häufige Fragen', 'FAQ'], weather: ['Wetter & Planung', 'Weather & planning'], logistics: ['Anreise & Standort', 'Travel & location'], 'race-day': ['Renntag', 'Race day'],
    price_tiers: ['Preisphasen', 'Fee tiers'], tier: ['Phase', 'Tier'], price: ['Preis', 'Price'], until: ['Gültig bis', 'Until'], wave_start: ['Startwellen', 'Start waves'], wave: ['Startwelle', 'Wave'], time: ['Uhrzeit', 'Time'], blocks: ['Startblock', 'Corral'], intermediate_cutoffs: ['Zwischenzeitlimits', 'Intermediate cutoffs'], point: ['Streckenpunkt', 'Point'], aid_stations: ['Verpflegung', 'Aid stations'], supplies: ['Angebot', 'Supplies'], count: ['Anzahl', 'Count'], details: ['Details', 'Details'], yes: ['Ja', 'Yes'], no: ['Nein', 'No'], mapLink: ['Karte öffnen', 'Open map'], eventLocation: ['Veranstaltungsort', 'Event location'], approxLocation: ['Ungefährer Veranstaltungsort. Genaue Start- und Zugangsbereiche bitte beim Veranstalter prüfen.', 'Approximate event location. Check exact start and access areas with the organizer.'],
    course_type: ['Streckentyp', 'Course type'], course_format: ['Streckenführung', 'Course format'], personal_best_potential: ['Bestzeitenpotenzial', 'Personal best potential'], difficulty_rating: ['Schwierigkeit', 'Difficulty'], beginner_friendly: ['Für Einsteiger', 'Beginner suitability'], crowd_support_rating: ['Publikumsunterstützung', 'Crowd support'], risk_notes: ['Streckenhinweise', 'Course notes'], iconic_sections: ['Besondere Streckenabschnitte', 'Notable sections'], start_location: ['Startbereich', 'Start area'], finish_location: ['Zielbereich', 'Finish area'], start_finish_same_place: ['Start und Ziel am selben Ort', 'Start and finish at the same place'], swim_location: ['Schwimmgewässer', 'Swim venue'], bike_course_highlight: ['Besonderheiten der Radstrecke', 'Bike course highlights'], elevation_profile_url: ['Höhenprofil', 'Elevation profile'],
    lottery_available: ['Losverfahren', 'Entry ballot'], charity_entries: ['Charity-Startplätze', 'Charity entries'], tour_operator_entries: ['Reiseveranstalter-Startplätze', 'Tour operator entries'], transfer_possible: ['Übertragung', 'Entry transfer'], refund_policy: ['Erstattung', 'Refund policy'], qualification_required: ['Qualifikation', 'Qualification'], minimum_age: ['Mindestalter', 'Minimum age'], mandatory_gear: ['Pflichtausrüstung', 'Mandatory gear'], medical_certificate: ['Ärztliches Attest', 'Medical certificate'], athlete_guide_notes: ['Hinweise aus dem Athletenleitfaden', 'Athlete guide notes'], verification_note: ['Quellenhinweise', 'Source notes'],
    cutoff_consequence: ['Hinweise zum Zeitlimit', 'Cutoff information'], showers: ['Duschen', 'Showers'], bag_drop: ['Gepäckabgabe', 'Bag drop'], toilets: ['Toiletten', 'Toilets'], medical: ['Medizinische Versorgung', 'Medical support'], medical_support: ['Medizinische Versorgung', 'Medical support'], timing_system: ['Zeitmessung', 'Timing'], pacers_available: ['Pacemaker', 'Pacers'], nearest_airport: ['Flughafen', 'Airport'], accommodation_info: ['Unterkunft', 'Accommodation'], race_day_access_note: ['Anreise am Renntag', 'Race day access'], recommended_arrival: ['Empfohlene Anreise', 'Recommended arrival'],
    typical_weather: ['Typisches Wetter', 'Typical weather'], rainfall_risk: ['Regen', 'Rain'], wind_risk: ['Wind', 'Wind'], heat_factor: ['Hitze', 'Heat'], best_conditions_note: ['Bedingungen', 'Conditions'], planning_tip: ['Planungshinweis', 'Planning tip'], participant_count: ['Teilnehmende', 'Participants'], finisher_count: ['Finisher', 'Finishers'], historic_significance: ['Geschichtliche Bedeutung', 'Historical significance'], world_championship_slots: ['WM-Startplätze', 'World championship slots'], boston_qualifier: ['Boston-Qualifikation', 'Boston qualification'],
    why_this_event_stands_out: ['Was die Veranstaltung besonders macht', 'What makes this event special'], history_summary: ['Geschichte', 'History'], seo_summary: ['Porträt', 'Profile'], best_for: ['Geeignet für', 'Best suited to'], atmosphere: ['Atmosphäre', 'Atmosphere'], good_fit_for: ['Geeignet für', 'Good fit for'], not_ideal_for: ['Weniger geeignet für', 'Less suitable for'], insider_tips: ['Hinweise', 'Tips'],
    first_edition: ['Erste Ausgabe', 'First edition'], start_finish_area: ['Start- und Zielbereich', 'Start and finish area'], waiting_list: ['Warteliste', 'Waiting list'], sold_out_status: ['Hinweise zur Auslastung', 'Entry availability notes'], loop_course: ['Rundkurs', 'Loop course'], point_to_point: ['Strecke von A nach B', 'Point-to-point course'], scenic_rating: ['Landschaft', 'Scenery'], swim_type: ['Schwimmstrecke', 'Swim course type'], bike_laps: ['Radrunden', 'Bike laps'], bike_character: ['Charakter der Radstrecke', 'Bike course character'], run_laps: ['Laufrunden', 'Run laps'], run_character: ['Charakter der Laufstrecke', 'Run course character'], transition_area: ['Wechselzone', 'Transition area'],
    changing_rooms: ['Umkleiden', 'Changing rooms'], live_tracking: ['Live-Tracking', 'Live tracking'], livestream: ['Livestream', 'Livestream'], expo_available: ['Expo', 'Expo'], camping_available: ['Camping', 'Camping'], recommended_booking_time: ['Empfohlene Buchungszeit', 'Recommended booking time'], timezone: ['Zeitzone', 'Time zone'], average_temperature: ['Durchschnittstemperatur', 'Average temperature'], average_high_temperature: ['Durchschnittliche Höchsttemperatur', 'Average high temperature'], average_low_temperature: ['Durchschnittliche Tiefsttemperatur', 'Average low temperature'], average_rainfall: ['Niederschlag', 'Rainfall'], heat_risk: ['Hitzerisiko', 'Heat risk'], seasonal_context: ['Jahreszeit', 'Seasonal context'], planning_tips: ['Planungshinweise', 'Planning tips'],
    women_percentage: ['Frauenanteil', 'Women participants'], average_finish_time: ['Durchschnittliche Zielzeit', 'Average finish time'], last_winner_male: ['Letzter Sieger', 'Last male winner'], last_winner_female: ['Letzte Siegerin', 'Last female winner'], last_winning_time_male: ['Letzte Siegerzeit Männer', 'Last male winning time'], last_winning_time_female: ['Letzte Siegerzeit Frauen', 'Last female winning time'], notable_facts: ['Wissenswertes', 'Notable facts'], world_major: ['World Marathon Major', 'World Marathon Major'], utmb_index: ['UTMB-Index', 'UTMB Index'], championship_status: ['Meisterschaft', 'Championship status'], planning_context: ['Planung', 'Planning context']
  };
  for (const [key, [de, en]] of Object.entries(richLabels)) { labels.de[key] = de; labels.en[key] = en; }
  Object.assign(labels.de, { event_series: 'Veranstaltungsserie', category: 'Kategorie', region: 'Region', organizer_relationship: 'Veranstaltungsorganisation', cutoff: 'Zeitlimit', pb_potential: 'Bestzeitenpotenzial' });
  Object.assign(labels.en, { event_series: 'Event series', category: 'Category', region: 'Region', organizer_relationship: 'Event organization', cutoff: 'Cutoff', pb_potential: 'Personal best potential' });
  let event = null, notice = 'loading', snapshotDate = '', richRecords = [], coreVerified = false;
  const t = key => labels[language][key] || key;
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const localized = value => window.SportEventMapDescriptions?.localizeEventText(value, language) ?? text(value);
  const fieldValue = (record, key) => window.SportEventMapDescriptions?.localizedField(record, key, language) ?? record?.[key];
  const descriptionText = () => window.SportEventMapDescriptions?.localizedDescription(event, language) ?? text(event?.description);
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
    document.documentElement.dataset.semPublicDetailKnowledgeState = richLive && richSettled && richRendered ? 'verified' : richSettled ? 'unavailable' : 'loading';
    byId('sem-public-detail-knowledge-data')?.remove();
    if (richLive && richSettled && richRendered) {
      const data = document.createElement('script'); data.type = 'application/json'; data.id = 'sem-public-detail-knowledge-data';
      data.textContent = JSON.stringify(visibleKnowledge()); document.head.append(data);
    }
  }

  function staticNotice() {
    if (!staticPage || byId('liveDetailStatus')) return;
    const status = document.createElement('p'); status.id = 'liveDetailStatus'; status.className = 'live-detail-notice'; status.setAttribute('role', 'status');
    const retry = document.createElement('button'); retry.id = 'liveDetailRetry'; retry.className = 'event-detail-secondary'; retry.hidden = true; retry.textContent = t('retry');
    document.querySelector('.event-detail-header')?.after(status, retry);
    document.querySelectorAll('.event-verification-strip, .race-guide-status-panel > .event-detail-badge').forEach(node => node.remove());
    document.querySelectorAll('[data-detail-i18n="detail.lastChecked"], [data-detail-i18n="detail.brandLastChecked"], [data-detail-i18n="detail.editionLastChecked"]').forEach(label => label.closest('.race-guide-fact-card, .event-rich-metric')?.remove());
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
    const canonicalLabels = new Set(['date', 'location', 'country', 'city', 'sport', 'distance', 'status', 'organizer', 'startTime', 'entryFee', 'participants', 'lastChecked']);
    preservedFacts = [...facts.querySelectorAll('.race-guide-fact-card')].filter(card => ![...card.querySelectorAll('[data-detail-i18n]')].some(label => canonicalLabels.has(label.dataset.detailI18n.split('.').pop())));
    facts.replaceChildren();
    const heading = sectionHeading('facts');
    const grid = document.createElement('div'); grid.id = 'liveDetailFacts'; grid.className = 'race-guide-fact-grid live-detail-facts';
    facts.append(heading, grid);
    // A failed live knowledge request keeps the source-dated static guide. Only
    // canonical scalar duplicates are removed; fee tiers and maps are distinct.
    document.querySelectorAll('.race-guide-registration-status, .race-guide-registration-link, .event-detail-hero .event-detail-badge').forEach(node => node.remove());
    for (const key of ['entryFee', 'startTime', 'swim', 'bike', 'run']) {
      document.querySelectorAll(`[data-detail-i18n="detail.${key}"]`).forEach(label => label.closest('article')?.remove());
    }
    const description = document.createElement('section'); description.id = 'description'; description.className = 'event-detail-card race-guide-section';
    description.innerHTML = '<h2 data-live-i18n="description"></h2><p id="liveDetailDescription" class="live-detail-copy"></p>';
    facts.after(description);
    const extra = document.createElement('div'); extra.id = 'liveDetailSections'; extra.className = 'live-detail-sections'; description.after(extra);
    preservedSections = [...byId('liveDetailContent').children].filter(node => node.matches('section') && !['key-facts', 'description', 'sources'].includes(node.id) && !node.matches('.event-detail-hero'));
    extra.append(...preservedSections);
    let sources = byId('sources');
    if (!sources) { sources = document.createElement('section'); sources.id = 'sources'; sources.className = 'event-detail-card race-guide-section'; byId('liveDetailContent').append(sources); }
    const checked = document.createElement('p'); checked.id = 'liveDetailChecked';
    const source = document.createElement('a'); source.id = 'liveDetailSource'; source.dataset.liveI18n = 'source'; source.className = 'event-detail-secondary'; source.target = '_blank'; source.rel = 'noopener noreferrer';
    const oldSources = document.createElement('div'); oldSources.id = 'liveDetailSources';
    sources.append(checked, source, oldSources);
    let official = assign('.event-detail-action-group > a.event-detail-primary', 'liveDetailOfficial');
    if (!official) { official = document.createElement('a'); official.id = 'liveDetailOfficial'; official.className = 'event-detail-primary'; official.target = '_blank'; official.rel = 'noopener noreferrer'; document.querySelector('.event-detail-action-group').append(official); }
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
  const renderedKnowledge = new Map();
  const locale = () => language === 'de' ? 'de-DE' : 'en-GB';
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const number = value => numeric(value) ? new Intl.NumberFormat(locale(), { maximumFractionDigits: 4 }).format(Number(value)) : '';
  const unit = (value, name) => numeric(value) ? new Intl.NumberFormat(locale(), { style: 'unit', unit: name, unitDisplay: 'short', maximumFractionDigits: 4 }).format(Number(value)) : '';
  const node = (tag, className = '', content = '') => { const result = document.createElement(tag); result.className = className; if (content !== '') result.textContent = content; return result; };
  function clockTime(value) {
    const match = text(value).match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/);
    if (!match) return text(value).replace(/\b([01]?\d|2[0-3]):([0-5]\d):[0-5]\d\b/g, (_, hour, minute) => `${hour.padStart(2, '0')}:${minute}`);
    return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2]))));
  }
  function sectionHeading(key) {
    const heading = node('div', 'race-guide-section-heading');
    heading.append(node('span', '', t(key)), node('h2', '', t(key))); return heading;
  }
  function section(id, key = id) {
    const result = node('section', 'event-detail-card race-guide-section'); result.id = id; result.append(sectionHeading(key)); return result;
  }
  function icon(key) {
    const paths = { date: 'M7 2v3M17 2v3M3.5 9h17M5 4.5h14v16H5Z', location: 'M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z', distance: 'M4 17c3-8 13 0 16-8M4 17h4M16 9h4', start_time: 'M12 7v5l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0', price: 'M8 7h8M8 12h7M8 17h5M7 4h10v16H7Z', default: 'm4 12 5 5L20 6' };
    const wrapper = node('span', 'event-detail-icon'); wrapper.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[key] || paths.default); svg.append(path); wrapper.append(svg); return wrapper;
  }
  function factCard(key, value, href = '') {
    const card = node('article', 'race-guide-fact-card');
    const strong = node('strong', '', value);
    if (safeUrl(href)) { const anchor = externalLink(href, value); strong.replaceChildren(anchor); }
    card.append(icon(key), node('span', '', t(key)), strong); return card;
  }
  function externalLink(url, label, className = '') {
    const anchor = node('a', className, label); anchor.href = safeUrl(url); anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return anchor;
  }
  function useful(value) {
    if (Array.isArray(value)) return value.some(useful);
    if (value && typeof value === 'object') return Object.values(value).some(useful);
    return typeof value === 'boolean' || typeof value === 'number' || Boolean(text(value) && !/^(unknown|not (?:yet )?(?:officially confirmed|verified|available)|needs review|n\/a|tba|tbd)\b/i.test(text(value)));
  }
  function valueText(value) {
    value = window.SportEventMapDescriptions?.localizedValue(value, language) ?? value;
    if (typeof value === 'boolean') return t(value ? 'yes' : 'no');
    if (typeof value === 'number') return number(value);
    if (Array.isArray(value)) return value.filter(useful).map(valueText).filter(Boolean).join(' · ');
    if (value && typeof value === 'object') return Object.entries(value).filter(([key, item]) => labels[language][key] && useful(item)).map(([key, item]) => `${t(key)}: ${valueText(item)}`).join(' · ');
    return clockTime(localized(value));
  }
  function hasFieldSource(record, section, field) {
    // The public RPC exposes only approvals whose audited value still matches.
    // An admin value approval makes this field visible without claiming a fresh
    // external source inspection or changing the edition freshness definition.
    if (record.manual_approved_fields?.includes(`${section}.${field}`)) return true;
    return /^(verified|verified_official_source|confirmed|partially_verified)$/.test(record.verification_status || '') && (record.sources || []).some(source => /^(official|trusted)(?:_|$)/i.test(text(source.source_type)) && (!source.verification_status || /^(verified|verified_official_source|confirmed|partially_verified)$/.test(source.verification_status)) && safeUrl(source.source_url) && verifiedDate(source.last_verified) && text(source.field_path).split(/\s*,\s*/).some(path => path === `${section}.${field}` || path === section));
  }
  function richOwner(section, field) {
    const annual = ['registration', 'race_day'].includes(section) || (section === 'basis' && field === 'start_finish_area') || (section === 'course' && /^(distances|main_distance|swim_distance|bike_distance|run_distance|course_map_url|gpx_url|elevation_profile_url|start_location|finish_location|aid_stations)$/.test(field));
    const path = `${section}.${field}`;
    const populated = value => Array.isArray(value) ? value.some(populated) : value && typeof value === 'object' ? Object.values(value).some(populated) : value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '');
    return [...richRecords].reverse().find(record => {
      if (annual && record.knowledge_scope !== 'edition') return false;
      // A newly inserted child row contains default NULLs; only explicit ownership
      // may mask brand knowledge. An unverified edit or deliberate clear still owns it.
      if (Array.isArray(record.owned_fields)) return record.owned_fields.includes(path) || record.cleared_fields?.includes(path);
      return populated(record[section]?.[field]);
    });
  }
  function trackField(section, field) {
    const owner = richOwner(section, field); if (!owner) return;
    if (!renderedKnowledge.has(owner)) renderedKnowledge.set(owner, new Set());
    renderedKnowledge.get(owner).add(`${section}.${field}`);
  }
  function visibleKnowledge() {
    return [...renderedKnowledge].map(([record, paths]) => {
      const result = { id: record.id, event_brand_id: record.event_brand_id, edition_id: record.edition_id, event_slug: record.event_slug, knowledge_scope: record.knowledge_scope, verification_status: record.verification_status, rendered_fields: [...paths], sources: record.sources };
      for (const path of paths) {
        const [section, field] = path.split('.');
        if (section === 'faq') { result.faq ||= []; const item = record.faq?.find((item, index) => String(item.id ?? index) === field); if (item) result.faq.push(item); }
        else { result[section] ||= {}; result[section][field] = record[section]?.[field]; }
      }
      return result;
    });
  }
  function factValue(record, section, field) {
    const value = record?.[section]?.[field];
    const formatted = valueText(value);
    if (!useful(value) || !hasFieldSource(record, section, field)) return '';
    if (/cutoff$/.test(field) && (!/\b\d{1,3}(?:[.,]\d+)?\s*(?:h|hours?|hrs?|min|minutes?|stunden?|minuten?)\b|\b\d{1,2}:[0-5]\d\b/i.test(formatted) || /withdraw|refund|registration|entry|cancel|transfer|rücktritt|anmeld|abmeld|erstatt|storn|\b(?:before|prior|vor)\b/i.test(formatted))) return '';
    if (field === 'start_time' && (!/\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b\d{1,2}\s*(?:am|pm|uhr)\b/i.test(formatted) || /cutoff|registration|anmeld|before|prior|\bvor\b/i.test(formatted))) return '';
    return fieldValue(record[section], field);
  }
  function richValue(section, field) {
    // A static detail export must never restore a canonical value that was
    // corrected or deliberately cleared through the maintenance workflow.
    if ((section === 'basis' && ['organizer_name', 'official_website'].includes(field)) ||
        (section === 'registration' && ['registration_status', 'official_registration_url', 'entry_fee_min', 'entry_fee_max'].includes(field)) ||
        (section === 'race_day' && field === 'start_time') ||
        (section === 'course' && ['swim_distance', 'bike_distance', 'run_distance', 'elevation_gain'].includes(field))) return '';
    // Annual information is never inherited from a brand record.
    const owner = richOwner(section, field);
    return owner ? factValue(owner, section, field) : '';
  }
  function detailTable(headers, rows) {
    if (!rows.length) return null;
    const wrap = node('div', 'race-guide-table-wrap is-compact'), table = node('table', 'race-guide-table'), head = node('thead'), body = node('tbody'), tr = node('tr');
    headers.forEach(key => { const th = node('th', '', t(key)); th.scope = 'col'; tr.append(th); }); head.append(tr);
    rows.forEach(values => { const row = node('tr'); headers.forEach((key, index) => { const cell = node('td', '', valueText(values[index]) || '—'); cell.dataset.label = t(key); row.append(cell); }); body.append(row); });
    table.append(head, body); wrap.append(table); return wrap;
  }
  function tierPrice(row) {
    const original = valueText(row.price), currency = text(row.currency).toUpperCase();
    const amount = typeof row.price === 'number' ? row.price : /^\d+(?:[.,]\d{1,2})?$/.test(text(row.price)) ? Number(text(row.price).replace(',', '.')) : null;
    if (amount !== null && Number.isFinite(amount) && /^[A-Z]{3}$/.test(currency)) {
      try { return new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(amount); } catch { /* Keep free text if the currency cannot be formatted. */ }
    }
    return [original, currency && !original.toUpperCase().includes(currency) ? currency : ''].filter(Boolean).join(' ');
  }
  function richField(sectionName, field) {
    const value = richValue(sectionName, field);
    if (!useful(value)) return null;
    let content;
    if (field === 'price_tiers' && Array.isArray(value)) {
      const rows = value.filter(row => row && typeof row === 'object' && useful(row.price)).map(row => {
        const until = text(row.until), date = /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(until) : null;
        const formattedUntil = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === until ? displayDate(until) : row.until;
        return [fieldValue(row, 'tier'), tierPrice(row), formattedUntil, fieldValue(row, 'note')];
      });
      const hasNotes = rows.some(row => useful(row[3]));
      content = detailTable(hasNotes ? ['tier', 'price', 'until', 'details'] : ['tier', 'price', 'until'], rows);
    } else if (field === 'intermediate_cutoffs' && Array.isArray(value)) {
      content = detailTable(['point', 'time'], value.filter(row => row && useful(row.time)).map(row => [fieldValue(row, 'point'), clockTime(row.time)]));
    } else if (field === 'wave_start' && Array.isArray(value)) {
      content = detailTable(['wave', 'time', 'blocks'], value.map(row => [fieldValue(row, 'wave') || fieldValue(row, 'label'), clockTime(row.time || row.start_time), fieldValue(row, 'blocks') || fieldValue(row, 'corral')]));
    } else if (field.endsWith('_url')) {
      if (safeUrl(value)) content = externalLink(value, t(field), 'event-detail-secondary race-guide-inline-action');
    } else {
      const formatted = /_date$|_deadline$/.test(field) && /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? displayDate(value) : /^(first_edition|average_finish_time|last_winning_time_(?:male|female))$/.test(field) ? text(value) : valueText(value);
      if (!formatted) return null;
      if (formatted.length < 85 && !Array.isArray(value) && (value === null || typeof value !== 'object')) content = factCard(field, formatted);
      else { content = node('details', 'race-guide-accordion'); content.append(node('summary', '', t(field)), node('div', 'live-detail-copy', formatted)); }
    }
    if (!content) return null;
    if (content.matches('.race-guide-table-wrap')) { const wrap = node('div', 'race-guide-subsection'); wrap.append(node('h3', '', t(field)), content); content = wrap; }
    content.dataset.knowledgeField = `${sectionName}.${field}`; trackField(sectionName, field); return content;
  }
  const richSections = [
    ['registration', 'registration', ['registration_open_date', 'registration_close_date', 'registration_deadline', 'withdrawal_deadline', 'price_tiers', 'lottery_available', 'charity_entries', 'tour_operator_entries', 'waiting_list', 'transfer_possible', 'refund_policy', 'sold_out_status', 'verification_note']],
    ['course', 'course', ['course_type', 'course_format', 'surface', 'course_character', 'personal_best_potential', 'pb_potential', 'cutoff', 'difficulty_rating', 'beginner_friendly', 'scenic_rating', 'crowd_support_rating', 'risk_notes', 'iconic_sections', 'swim_location', 'swim_type', 'bike_laps', 'bike_character', 'bike_course_highlight', 'run_laps', 'run_character', 'transition_area', 'start_location', 'finish_location', 'start_finish_same_place', 'loop_course', 'point_to_point', 'course_map_url', 'gpx_url', 'elevation_profile_url']],
    ['race-day', 'race_day', ['start_area', 'finish_area', 'wave_start', 'total_cutoff', 'intermediate_cutoffs', 'swim_cutoff', 'bike_cutoff', 'run_cutoff', 'cutoff_consequence', 'aid_stations', 'bib_pickup_info', 'expo', 'expo_available', 'showers', 'bag_drop', 'changing_rooms', 'toilets', 'medical', 'medical_support', 'timing_system', 'pacers_available', 'live_tracking', 'livestream', 'athlete_guide_url', 'verification_note']],
    ['logistics', 'travel', ['nearest_train_station', 'nearest_airport', 'public_transport_info', 'parking_info', 'accommodation_info', 'camping_available', 'race_day_access_note', 'recommended_arrival', 'recommended_booking_time', 'timezone']],
    ['rules', 'registration', ['minimum_age', 'qualification_required', 'mandatory_gear', 'medical_certificate', 'athlete_guide_notes']],
    ['weather', 'weather', ['average_temperature', 'average_high_temperature', 'average_low_temperature', 'average_rainfall', 'typical_weather', 'rainfall_risk', 'wind_risk', 'heat_risk', 'heat_factor', 'best_conditions_note', 'seasonal_context', 'planning_tips', 'planning_tip']],
    ['performance', 'statistics', ['participant_count', 'finisher_count', 'women_percentage', 'average_finish_time', 'last_winner_male', 'last_winner_female', 'last_winning_time_male', 'last_winning_time_female', 'historic_significance', 'notable_facts', 'world_major', 'world_championship_slots', 'utmb_index', 'boston_qualifier', 'championship_status']],
    ['editorial', 'editorial', ['why_this_event_stands_out', 'history_summary', 'seo_summary', 'best_for', 'course_character', 'atmosphere', 'good_fit_for', 'not_ideal_for', 'insider_tips', 'planning_context']]
  ];
  const richBasisFields = ['event_series', 'first_edition', 'category', 'region', 'organizer_relationship'];
  function renderRichDetails() {
    richRendered = false;
    document.documentElement.dataset.semPublicDetailKnowledgeState = 'loading'; byId('sem-public-detail-knowledge-data')?.remove();
    renderedKnowledge.clear();
    const container = byId('liveDetailSections');
    const existingMap = byId('liveDetailLocationMap'); existingMap?.remove();
    const snapshot = staticPage && !richLive && preservedSections.length;
    if (!snapshot) {
      const sections = [];
      for (const [id, group, fields] of richSections) {
        const content = fields.flatMap(field => {
          if (field === 'registration_deadline' && useful(richValue(group, 'registration_close_date'))) return [];
          if (field === 'pb_potential' && useful(richValue(group, 'personal_best_potential'))) return [];
          const result = richField(group, field); return result ? [result] : [];
        });
        if (id === 'editorial') for (const field of richBasisFields) { const item = richField('basis', field); if (item) content.push(item); }
        if (id === 'race-day') {
          const aid = richField('course', 'aid_stations'); if (aid) content.push(aid);
          if (!['start_location', 'finish_location'].some(field => useful(richValue('course', field))) && !['start_area', 'finish_area'].some(field => useful(richValue('race_day', field)))) {
            const area = richField('basis', 'start_finish_area'); if (area) content.push(area);
          }
        }
        if (!content.length) continue;
        const sectionNode = section(id), grid = node('div', 'race-guide-fact-grid is-tight');
        content.filter(item => item.matches('.race-guide-fact-card')).forEach(item => grid.append(item));
        if (grid.childElementCount) sectionNode.append(grid);
        sectionNode.append(...content.filter(item => !item.matches('.race-guide-fact-card')));
        sections.push(sectionNode);
      }
      const questions = [];
      for (const record of richRecords) for (const [index, item] of (Array.isArray(record.faq) ? record.faq : []).entries()) {
        const id = String(item?.id ?? index), question = localized(fieldValue(item, 'question')), answer = localized(fieldValue(item, 'answer'));
        if (!question || !answer || !hasFieldSource(record, 'faq', id)) continue;
        const accordion = node('details', 'race-guide-accordion'); accordion.dataset.knowledgeField = 'faq.' + id;
        accordion.append(node('summary', '', question), node('div', 'live-detail-copy', answer)); questions.push(accordion);
        if (!renderedKnowledge.has(record)) renderedKnowledge.set(record, new Set()); renderedKnowledge.get(record).add('faq.' + id);
      }
      if (questions.length) { const faq = section('faq'); faq.append(...questions); sections.push(faq); }
      container.replaceChildren(...sections);
      if (staticConfig?.edition_id === event.edition_id) container.append(...preservedSections.filter(item => item.id === 'edition-history'));
    }
    container.querySelectorAll('[data-canonical-detail-block]').forEach(item => item.remove());
    function ensureSection(id) {
      let result = byId(id);
      if (!result) { result = section(id); container.append(result); }
      return result;
    }
    const registrationStatus = text(event.registration_status).replace(/^registration_/, '');
    const registrationFacts = node('div', 'race-guide-action-grid'); registrationFacts.dataset.canonicalDetailBlock = '';
    if (['open', 'closed', 'sold_out', 'not_open', 'cancelled'].includes(registrationStatus)) registrationFacts.append(factCard('registration', t(registrationStatus)));
    if (priceLabel()) registrationFacts.append(factCard('price', priceLabel()));
    if (numeric(event.participant_limit)) registrationFacts.append(factCard('participant_limit', number(event.participant_limit)));
    if (safeUrl(event.registration_url)) registrationFacts.append(externalLink(event.registration_url, t('registrationLink'), 'race-guide-registration-link'));
    if (registrationFacts.childElementCount) ensureSection('registration').insertBefore(registrationFacts, ensureSection('registration').children[1] || null);
    if (text(event.start_time)) { const facts = node('div', 'race-guide-fact-grid is-tight'); facts.dataset.canonicalDetailBlock = ''; facts.append(factCard('start_time', clockTime(event.start_time))); ensureSection('race-day').insertBefore(facts, ensureSection('race-day').children[1] || null); }
    if (existingMap) ensureSection('logistics').append(existingMap);
    renderLocation(ensureSection);
    const order = ['registration', 'course', 'race-day', 'performance', 'logistics', 'weather', 'rules', 'editorial', 'faq'];
    order.forEach(id => { const item = byId(id); if (item?.parentNode === container) container.append(item); });
    const sourceNodes = richRecords.flatMap(record => (record.sources || []).filter(source => safeUrl(source.source_url) && verifiedDate(source.last_verified)).map(source => {
      const anchor = externalLink(source.source_url, '');
      anchor.append(node('strong', '', localized(fieldValue(source, 'source_label')) || t('source')), node('span', '', `${t('sourceChecked')}: ${displayDate(source.last_verified)}`)); return anchor;
    }));
    if (richLive && staticPage) { const source = byId('sources'); [...source.children].filter(child => !['liveDetailChecked', 'liveDetailSource', 'liveDetailSources'].includes(child.id)).forEach(child => child.remove()); source.prepend(sectionHeading('sources')); }
    byId('liveDetailSources').replaceChildren(...sourceNodes);
    byId('sources').hidden = !sourceNodes.length && !safeUrl(event.source_url) && !coreVerified && !snapshot;
    const sections = [['key-facts', 'facts'], ['competitions', 'competitions'], ['description', 'description'], ...[...container.children].filter(item => item.id && !item.hidden).map(item => [item.id, labels[language][item.id] ? item.id : item.querySelector('h2')?.textContent || item.id]), ['sources', 'sources']];
    byId('liveDetailNavigation').replaceChildren(...sections.filter(([id]) => byId(id) && !byId(id).hidden).map(([id, label]) => { const anchor = node('a', '', t(label)); anchor.href = '#' + id; anchor.dataset.detailSection = id; return anchor; }));
    window.dispatchEvent(new CustomEvent('sport-event-map-detail-contentchange'));
    richRendered = richLive && richSettled;
  }
  function priceLabel() {
    const fees = [number(event.price_min), number(event.price_max)].filter(Boolean);
    if (!fees.length) return '';
    const prefix = fees.length === 1 ? t(numeric(event.price_min) ? 'from' : 'upTo') + ' ' : '';
    return prefix + [...new Set(fees)].join(' – ') + (text(event.currency) ? ' ' + text(event.currency) : '');
  }
  function distanceLabel(value, distanceKm) {
    let includesDistance = false;
    const label = localized(value).replace(/\b(\d+(?:[.,]\d+)?)(\s*[-‐‑‒–—]\s*|\s*)km\b/gi, (_match, amount, separator) => {
      const kilometers = Number(amount.replace(',', '.'));
      if (numeric(distanceKm) && kilometers === Number(distanceKm)) includesDistance = true;
      return /[-‐‑‒–—]/.test(separator) ? number(kilometers) + separator + 'km' : unit(kilometers, 'kilometer');
    });
    return { label, includesDistance };
  }
  function renderCompetitions() {
    let target = byId('competitions');
    if (!target) { target = section('competitions'); byId('key-facts').after(target); }
    target.replaceChildren(sectionHeading('competitions'));
    const list = node('ol', 'live-detail-competitions'), seen = new Set();
    const stable = value => value && typeof value === 'object' ? (Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))) : value;
    const formats = (Array.isArray(event.race_formats) ? event.race_formats : []).map((format, index) => ({ format, index }))
      .sort((left, right) => (numeric(left.format?.distance_km) ? Number(left.format.distance_km) : Infinity) - (numeric(right.format?.distance_km) ? Number(right.format.distance_km) : Infinity) || left.index - right.index);
    for (const { format } of formats) {
      if (!format || typeof format !== 'object' || Array.isArray(format)) continue;
      const key = JSON.stringify(stable(format)); if (seen.has(key)) continue; seen.add(key);
      const item = node('li', 'race-guide-info-box'); item.dataset.publicRaceFormat = '';
      const { label, includesDistance: distanceInLabel } = distanceLabel(fieldValue(format, 'label'), format.distance_km);
      const hasLegs = ['swim_km', 'bike_km', 'run_km'].filter(field => numeric(format[field])).length > 1;
      const details = [['distance_km', '', 'kilometer'], ['swim_km', 'swim', 'kilometer'], ['bike_km', 'bike', 'kilometer'], ['run_km', 'run', 'kilometer'], ['elevation_gain_m', 'elevation', 'meter']].flatMap(([field, key, measurement]) => numeric(format[field]) && !(field === 'distance_km' && (distanceInLabel || hasLegs)) ? [(key ? t(key) + ': ' : '') + unit(format[field], measurement)] : []);
      if (!label && !details.length) continue;
      if (label) item.append(node('strong', '', label));
      if (details.length) item.append(node('span', '', details.join(' · ')));
      list.append(item);
    }
    target.hidden = !list.childElementCount; if (!target.hidden) target.append(list);
  }
  function renderLocation(ensureSection) {
    const valid = numeric(event.latitude) && numeric(event.longitude) && Math.abs(Number(event.latitude)) <= 90 && Math.abs(Number(event.longitude)) <= 180;
    if (!valid) { detailMap?.remove?.(); detailMap = null; byId('liveDetailLocationMap')?.remove(); byId('eventDetailMap')?.closest('.race-guide-subsection')?.remove(); return; }
    const lat = Number(event.latitude), lon = Number(event.longitude), coordinates = lat + ',' + lon;
    let subsection = byId('liveDetailLocationMap');
    if (!subsection) {
      // A generated page may already have a map with frozen coordinates. Its
      // container is replaced so the shared map always uses the anonymous row.
      const old = byId('eventDetailMap'); old?.closest('.race-guide-subsection')?.remove();
      subsection = node('div', 'race-guide-subsection'); subsection.id = 'liveDetailLocationMap';
      const target = node('div', 'event-detail-map'); target.id = 'eventDetailMap'; target.setAttribute('role', 'region');
      subsection.append(node('h3'), node('p', 'live-detail-map-address'), target, node('p', 'event-detail-map-note'));
      const link = externalLink('https://www.google.com/maps/', '', 'event-detail-secondary'); link.id = 'liveDetailMapLink'; subsection.append(link);
      ensureSection('logistics').append(subsection); mapCoordinates = '';
    }
    subsection.querySelector('h3').textContent = t('eventLocation');
    subsection.querySelector('.live-detail-map-address').textContent = text(event.address) || [text(event.city), localized(event.country)].filter(Boolean).join(', ');
    subsection.querySelector('.event-detail-map-note').textContent = t('approxLocation');
    byId('eventDetailMap').setAttribute('aria-label', t('eventLocation'));
    byId('liveDetailMapLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`;
    byId('liveDetailMapLink').textContent = t('mapLink');
    if (mapCoordinates === coordinates && detailMap) { detailMap.invalidateSize?.(); return; }
    mapCoordinates = coordinates;
    if (!mapPromise) mapPromise = new Promise(resolve => {
      if (window.L?.map) { resolve(window.L); return; }
      if (!document.querySelector('link[data-detail-map-style]')) { const css = node('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; css.dataset.detailMapStyle = ''; document.head.append(css); }
      const script = node('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload = () => resolve(window.L); script.onerror = () => resolve(null); document.head.append(script);
    });
    void mapPromise.then(L => {
      if (!L?.map || !byId('eventDetailMap') || mapCoordinates !== coordinates) return;
      if (!detailMap || detailMap.getContainer?.() !== byId('eventDetailMap')) {
        detailMap?.remove?.();
        try { detailMap = L.map('eventDetailMap', { scrollWheelZoom: false }).setView([lat, lon], 13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(detailMap); detailMarker = L.marker([lat, lon]).addTo(detailMap); } catch { detailMap = null; }
      } else { detailMap.setView([lat, lon], 13); detailMarker?.setLatLng?.([lat, lon]); }
    });
  }
  function renderMetadata() {
    // Both entry points publish the same cleaned projection, including SEO data.
    let schema = byId('liveDetailSchema');
    if (!schema) {
      document.querySelectorAll('script[type="application/ld+json"]').forEach(node => node.remove());
      schema = node('script'); schema.id = 'liveDetailSchema'; schema.type = 'application/ld+json'; document.head.append(schema);
    }
    schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Event', name: event.event_name, description: descriptionText() || undefined, inLanguage: language, startDate: isoDate(event.date), endDate: event.end_date || undefined, url: location.origin + location.pathname + location.search, eventStatus: 'https://schema.org/' + ({ cancelled: 'EventCancelled', postponed: 'EventPostponed' }[event.event_status] || 'EventScheduled'), location: { '@type': 'Place', name: text(event.city), address: text(event.address), geo: event.latitude != null && event.longitude != null ? { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude } : undefined } });
    for (const [attribute, key, value] of [['name', 'description', descriptionText()], ['property', 'og:description', descriptionText()], ['property', 'og:title', event.event_name]]) {
      const existing = [...document.querySelectorAll(`meta[${attribute}="${key}"]`)];
      if (!text(value)) { existing.forEach(item => item.remove()); continue; }
      if (!existing.length) { const item = node('meta'); item.setAttribute(attribute, key); document.head.append(item); existing.push(item); }
      existing.forEach(item => { item.content = text(value); });
    }
  }
  function render() {
    if (event) prepareStaticPage();
    // Generated documents keep their older label dictionary and fallback guide.
    // Update both as well as the canonical live sections on every language switch.
    staticI18n?.applyLanguage?.();
    document.documentElement.lang = language;
    byId('eventDetailLanguageSelect').value = language;
    byId('eventDetailLanguageSelect').setAttribute('aria-label', t('language'));
    document.querySelectorAll('[data-live-i18n]').forEach(el => { el.textContent = t(el.dataset.liveI18n); });
    byId('liveDetailRetry').textContent = t('retry');
    (byId('liveDetailNavigation') || document.querySelector('.event-detail-tabs'))?.setAttribute('aria-label', language === 'de' ? 'Eventdetails' : 'Event details');
    if (staticPage) document.querySelectorAll('.event-detail-shell p, .event-detail-shell strong, .event-detail-shell td, .event-detail-shell summary, .event-detail-shell li, .event-detail-shell span, .event-detail-shell a, .event-detail-shell h3').forEach(element => {
      if (element.children.length || element.hasAttribute('data-detail-i18n') || element.hasAttribute('data-live-i18n') || element.closest('#liveDetailFacts, #competitions, #liveDetailSections:not(:has([data-detail-i18n])), .event-detail-header') || element.id?.startsWith('liveDetail')) return;
      if (!element.dataset.originalDetailText) element.dataset.originalDetailText = element.textContent;
      element.textContent = localized(element.dataset.originalDetailText);
    });
    byId('liveDetailStatus').hidden = !notice;
    byId('liveDetailStatus').textContent = notice ? t(notice) + (notice === 'snapshot' ? displayDate(snapshotDate) : '') : '';
    if (byId('liveDetailKnowledgeNotice')) byId('liveDetailKnowledgeNotice').textContent = language === 'de' ? 'Zusätzliche Detailangaben: Gespeicherter Quellenstand. Aktuelle Detailangaben konnten nicht geladen werden.' : 'Additional details: saved source information. Current details could not be loaded.';
    if (!event) { if (!staticPage) document.title = `${language === 'de' ? 'Eventdetails' : 'Event details'} · Sport Event Map`; return; }
    renderMetadata();
    document.title = `${text(event.event_name)} · ${text(event.edition_year) || text(event.date)} | Sport Event Map`;
    byId('liveDetailName').textContent = text(event.event_name);
    byId('liveDetailSport').textContent = localized(event.sport);
    const locationLabel = [text(event.city), localized(event.country)].filter(Boolean).join(', ');
    byId('liveDetailLocation').textContent = locationLabel;
    byId('liveDetailDescription').textContent = descriptionText();
    byId('description').hidden = !descriptionText();
    byId('liveDetailChecked').hidden = !coreVerified || !verifiedDate(event.last_checked);
    byId('liveDetailChecked').textContent = coreVerified && verifiedDate(event.last_checked) ? `${t('checked')}: ${displayDate(event.last_checked)}` : '';
    const registrationStatus = text(event.registration_status).replace(/^registration_/, '');
    const hasFormats = Array.isArray(event.race_formats) && event.race_formats.some(format => format && (text(format.label) || numeric(format.distance_km)));
    const facts = [
      ['date', event.date ? displayDate(isoDate(event.date)) : ''],
      ['end_date', event.end_date && isoDate(event.end_date) !== isoDate(event.date) ? displayDate(isoDate(event.end_date)) : ''],
      ['location', locationLabel], ['sport', localized(event.sport)],
      ['distance', hasFormats ? '' : distanceLabel(event.distance).label],
      ['start_time', clockTime(event.start_time)],
      ['registration', ['open','closed','sold_out','not_open','cancelled'].includes(registrationStatus) ? t(registrationStatus) : ''],
      ['price', priceLabel()], ['participant_limit', number(event.participant_limit)]
    ];
    if (['scheduled','date_unconfirmed','cancelled','postponed','completed','inactive'].includes(event.event_status)) facts.unshift(['status', t(event.event_status)]);
    const organizer = text(event.organizer_name) || safeUrl(event.organizer_url);
    if (organizer) facts.push(['organizer', organizer]);
    byId('key-facts').querySelector('.race-guide-section-heading')?.replaceWith(sectionHeading('facts'));
    byId('liveDetailFacts').replaceChildren(...facts.filter(([, value]) => value).map(([key, value]) => { const card = factCard(key, value, key === 'organizer' ? event.organizer_url : ''); card.dataset.publicDetailField = key; return card; }), ...(!richLive ? preservedFacts : []));
    renderCompetitions();
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
  window.sportEventMapDetailI18n = { translate: key => labels[language][key] || staticI18n?.translate?.(key) || key, getLanguage: () => language };
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
    const accept = records => {
      if (!Array.isArray(records) || !event.edition_id || !event.event_id) throw new Error('Invalid knowledge response');
      const brands = records.filter(row => row?.knowledge_scope === 'brand' && String(row.event_brand_id) === String(event.event_id));
      const editions = records.filter(row => row?.knowledge_scope === 'edition' && row.edition_id === event.edition_id);
      if (brands.length > 1 || editions.length > 1 || editions.some(row => String(row.event_brand_id) !== String(event.event_id) || row.event_slug !== event.edition_slug)) throw new Error('Ambiguous knowledge identity');
      richRecords = [...brands, ...editions];
    };
    try {
      const config = window.SPORT_EVENT_MAP_CONFIG || {};
      if (!liveResponse || !config.supabaseUrl || !config.supabasePublishableKey) throw new Error('Live knowledge unavailable');
      const response = await fetch(new URL('/rest/v1/rpc/get_public_event_detail_bundle', config.supabaseUrl), {
        method: 'POST', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(12000),
        headers: { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_edition_id: event.edition_id })
      });
      if (!response.ok) throw new Error('Live knowledge unavailable');
      accept(await response.json()); richLive = true;
    } catch {
      try { accept(await json('/data/event-detail-database.json')); } catch { richRecords = []; }
      const warning = node('p', 'live-detail-notice'); warning.id = 'liveDetailKnowledgeNotice';
      warning.textContent = language === 'de' ? 'Zusätzliche Detailangaben: Gespeicherter Quellenstand. Aktuelle Detailangaben konnten nicht geladen werden.' : 'Additional details: saved source information. Current details could not be loaded.';
      byId('liveDetailSections').before(warning);
    } finally { richSettled = true; render(); }
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
    // Translation availability must not determine whether the factual source
    // description is visible. Load catalogs in order; the policy is independent.
    for (const file of ['event-content-translations', 'event-description-translations', 'event-description-translations-extra']) {
      try { await import(`./${file}.js?v=20261006-bilingual-v138`); }
      catch { /* Unknown translations retain the original text. */ }
    }
    try {
      await import('./event-description.js?v=20261006-bilingual-v138');
    } catch { /* Keep factual originals visible if translation assets cannot load. */ }
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
    // Never render a raw import note while the shared display policy is loading.
    let publicDescription = '';
    try {
      publicDescription = window.SportEventMapDescriptions?.cleanPublicEventDescription(rows[0].description) || '';
    } catch { /* Missing description policy fails closed without hiding other facts. */ }
    event = { ...rows[0], description: text(publicDescription) };
    notice = snapshotDate ? 'snapshot' : '';
    // Reuse the existing detail-page Season Planner behavior and identity.
    window.sportEventMapDetailConfig = { event: { ...event, event_slug: slug, event_key: staticConfig?.edition_id === event.edition_id && staticConfig?.event_key ? staticConfig.event_key : [event.event_name, event.date, event.city].map(text).filter(Boolean).join('|').toLowerCase() } };
    render();
    if (!staticPage) {
      const script = document.createElement('script');
      script.src = '/js/event-detail.js?v=20260929-google-maps-v133';
      script.onerror = () => { byId('detailActionStatus').textContent = t('detail.saveUnavailable'); };
      document.head.append(script);
    }
    void loadRichDetails();
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
