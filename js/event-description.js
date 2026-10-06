(function (root, factory) {
  const api = factory(root, typeof module === "object" && module.exports
    ? require("./event-content-translations.js") : null, typeof module === "object" && module.exports
    ? [...require("./event-description-translations.js"), ...require("./event-description-translations-extra.js")] : null);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SportEventMapDescriptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, contentCatalog, descriptionCatalog) {
  "use strict";

  // Match known import templates, never isolated words such as "review", "batch"
  // or an organizer's ordinary reference to marathon.de. This is a presentation
  // projection; callers keep the original database value for editing and audit.
  function cleanPublicEventDescription(value) {
    if (value === null || value === undefined) return "";
    let result = String(value).trim();
    const boundary = "(^|[.!?]\\s+|[\\r\\n]+)";
    let previous;
    do {
      previous = result;
      result = result.replace(new RegExp(boundary + "Imported from (?:verified staging batch|marathon\\.de(?:[ \\t]+(?:running calendar|Laufkalender))?)[ \\t]*\\.?(?=\\s|$)", "gi"), "$1");
      result = result.replace(/\bSource listing:[ \t]*https?:\/\/[^\s<>"']+/gi, "");
      // Place names can contain common abbreviations (St. Anton, Hofheim i. UFr.).
      // A following real sentence is retained rather than deleting the paragraph.
      result = result.replace(new RegExp(boundary + "Official endurance event in (?:\\b(?:St|i|a|b|d|UFr)\\.[ \\t]*|[^.!?\\r\\n])+(?:\\.|(?=[\\r\\n]|$))", "gi"), "$1");
      result = result.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    } while (result !== previous);
    return /^[\s.!?;:-]*$/.test(result) ? "" : result;
  }

  // Translate exact source values, never event identities or arbitrary words
  // inside organizer prose. Changed or unknown prose remains available intact.
  const common = [
    ['Running', 'Laufen'], ['Run', 'Lauf'], ['Road running', 'Straßenlauf'],
    ['Road marathon', 'Straßenmarathon'], ['Road marathon weekend', 'Straßenmarathon-Wochenende'],
    ['Trail running', 'Traillauf'], ['Trail run', 'Traillauf'], ['Ultra running', 'Ultralauf'],
    ['Cycling', 'Radsport'], ['Swimming', 'Schwimmen'], ['Swimrun', 'Swimrun'],
    ['Half Marathon', 'Halbmarathon'], ['Marathon Relay', 'Marathonstaffel'],
    ['Relay Marathon', 'Staffelmarathon'], ['Relay', 'Staffel'], ['Kids Run', 'Kinderlauf'],
    ['School Run', 'Schülerlauf'], ['Family Events', 'Familienangebote'],
    ['Sprint distance', 'Sprintdistanz'], ['Olympic distance', 'Olympische Distanz'],
    ['Middle distance', 'Mitteldistanz'], ['Long distance', 'Langdistanz'],
    ['Sprint triathlon', 'Sprint-Triathlon'], ['Olympic triathlon', 'Olympischer Triathlon'],
    ['Middle-distance triathlon', 'Mitteldistanz-Triathlon'], ['Long-distance triathlon', 'Langdistanz-Triathlon'],
    ['Short distance', 'Kurzdistanz'], ['City run', 'Stadtlauf'], ['Fun run', 'Jedermannlauf'],
    ['Olympic', 'Olympische Distanz'], ['Middle', 'Mitteldistanz'], ['Full', 'Langdistanz'], ['Short', 'Kurzdistanz'],
    ['Popular', 'Volksdistanz'], ['Youth', 'Jugend'], ['Kids', 'Kinder'], ['Relays', 'Staffeln'],
    ['Olympic Relay', 'Olympische Staffel'], ['Middle Relay', 'Mitteldistanz-Staffel'],
    ['Swim and Run', 'Schwimmen und Laufen'], ['Full / Long Distance Triathlon', 'Langdistanz-Triathlon'],
    ['multi-distance trail', 'Trail mit mehreren Distanzen'], ['Vertical KM', 'Vertikalkilometer'],
    ['5-person Marathon Relay', 'Fünfer-Marathonstaffel'], ['4 x 5.274 km Relay', '4 × 5,274 km Staffel'],
    ['ca. 250 km team relay: 10-person, Ultra 5-person, 5 Pack', 'ca. 250 km Teamstaffel: 10 Personen, Ultra 5 Personen, 5 Pack'],
    ['Road', 'Straße'], ['Asphalt', 'Asphalt'], ['Flat', 'Flach'], ['Rolling', 'Wellig'], ['Hilly', 'Hügelig'],
    ['Lake', 'See'], ['River', 'Fluss'], ['Sea', 'Meer'], ['Bay', 'Bucht'], ['Open water', 'Freiwasser'],
    ['Loop course', 'Rundkurs'], ['Point to point', 'Von A nach B'], ['Point-to-point', 'Von A nach B'],
    ['High', 'Hoch'], ['Very high', 'Sehr hoch'], ['Medium', 'Mittel'], ['Low', 'Niedrig'],
    ['Easy', 'Leicht'], ['Moderate', 'Moderat'], ['Difficult', 'Schwierig'],
    ['Yes', 'Ja'], ['No', 'Nein'], ['Available', 'Verfügbar'], ['Not available', 'Nicht verfügbar'],
    ['Early bird', 'Frühbuchung'], ['Regular', 'Regulär'], ['Main station', 'Hauptbahnhof'],
    ['Germany', 'Deutschland'], ['Austria', 'Österreich'], ['Switzerland', 'Schweiz'],
    ['France', 'Frankreich'], ['Italy', 'Italien'], ['Spain', 'Spanien'], ['Portugal', 'Portugal'],
    ['Netherlands', 'Niederlande'], ['Belgium', 'Belgien'], ['Luxembourg', 'Luxemburg'],
    ['Denmark', 'Dänemark'], ['Sweden', 'Schweden'], ['Norway', 'Norwegen'], ['Finland', 'Finnland'],
    ['Poland', 'Polen'], ['Czech Republic', 'Tschechien'], ['United Kingdom', 'Vereinigtes Königreich'],
    ['United States', 'Vereinigte Staaten'], ['Ireland', 'Irland'], ['Greece', 'Griechenland'],
    ['Hungary', 'Ungarn'], ['Romania', 'Rumänien'], ['Iceland', 'Island'], ['UK', 'Großbritannien'],
    ['Lower Saxony', 'Niedersachsen'], ['Bavaria', 'Bayern'], ['Hesse', 'Hessen'],
    ['North Rhine-Westphalia', 'Nordrhein-Westfalen'], ['Rhineland-Palatinate', 'Rheinland-Pfalz'],
    ['Saxony', 'Sachsen'], ['Saxony-Anhalt', 'Sachsen-Anhalt'], ['Thuringia', 'Thüringen'],
    ['Mecklenburg-Western Pomerania', 'Mecklenburg-Vorpommern']
  ];
  let lastContent, lastDescriptions, dictionary;
  const normalize = value => String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  function translations() {
    const content = contentCatalog || root.SportEventMapContentTranslations;
    const descriptions = descriptionCatalog || root.SportEventMapDescriptionTranslations;
    if (!dictionary || content !== lastContent || descriptions !== lastDescriptions) {
      dictionary = new Map();
      for (const pair of [...common, ...(content || []), ...(descriptions || [])]) {
        if (!Array.isArray(pair) || pair.length < 2 || pair.some(value => typeof value !== 'string')) continue;
        const [en, de] = pair;
        for (const value of pair) if (!dictionary.has(normalize(value))) dictionary.set(normalize(value), { en, de });
      }
      lastContent = content; lastDescriptions = descriptions;
    }
    return dictionary;
  }
  function localizedValue(value, language) {
    if (value && typeof value === 'object' && !Array.isArray(value) && ('de' in value || 'en' in value)) {
      return value[language] ?? value[language === 'de' ? 'en' : 'de'] ?? '';
    }
    return value;
  }
  function localizeEventText(value, language = 'de') {
    const locale = language === 'en' ? 'en' : 'de';
    value = localizedValue(value, locale);
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const original = String(value).trim();
    const found = translations().get(normalize(original));
    if (found) return found[locale];
    const imported = original.match(/^Official local running event in (.+)\. Distances: (.+)\. Discovered via Kilometerliebe and linked to the official event website\.$/);
    if (imported && locale === 'de') {
      const distances = imported[2].split(/,\s*/).map(value => localizeEventText(value, locale)).join(', ');
      return `Offizielle lokale Laufveranstaltung in ${imported[1]}. Distanzen: ${distances}. Über Kilometerliebe gefunden und mit der offiziellen Veranstaltungswebsite verknüpft.`;
    }
    const sourceLabel = original.match(/^Official (.+?) (imprint|course page|landing page|registration overview|media guide|website|registration information|race-day information|course information|MARATHON EXPO information|homepage|history|participation terms|marathon information|half-marathon information|page|marathon and registration page|marathon race information|race page|company website|marathon rules and race information|marathon registration page)$/);
    if (sourceLabel && locale === 'de') {
      const names = { imprint: 'Impressum', 'course page': 'Streckenseite', 'landing page': 'Veranstaltungsseite', 'registration overview': 'Anmeldeübersicht', 'media guide': 'Medienleitfaden', website: 'Website', 'registration information': 'Anmeldeinformationen', 'race-day information': 'Informationen zum Renntag', 'course information': 'Streckeninformationen', 'MARATHON EXPO information': 'Informationen zur MARATHON EXPO', homepage: 'Homepage', history: 'Geschichte', 'participation terms': 'Teilnahmebedingungen', 'marathon information': 'Marathoninformationen', 'half-marathon information': 'Halbmarathoninformationen', page: 'Veranstaltungsseite', 'marathon and registration page': 'Marathon- und Anmeldeseite', 'marathon race information': 'Marathon-Wettkampfinformationen', 'race page': 'Wettkampfseite', 'company website': 'Unternehmenswebsite', 'marathon rules and race information': 'Marathonregeln und Wettkampfinformationen', 'marathon registration page': 'Marathon-Anmeldeseite' };
      return sourceLabel[1] + ': ' + names[sourceLabel[2]] + ' (offiziell)';
    }
    // Lists and conventional numeric labels can be translated losslessly.
    if (!/[.!?](?:\s|$)/.test(original) && /\s[·|/]|[·|/]\s|,\s/.test(original)) return original.split(/(\s*[·|/]\s*|,\s+)/).map((part, index) => index % 2 ? part : localizeEventText(part, locale)).join('');
    const region = original.match(/^Region:\s*(.+)$/i);
    if (region) return 'Region: ' + localizeEventText(region[1], locale);
    const leg = original.match(/^(Swim|Bike|Run|Schwimmen|Radfahren|Laufen):\s*(.+)$/i);
    if (leg) {
      const names = /^(Swim|Schwimmen)$/i.test(leg[1]) ? ['Swim', 'Schwimmen'] : /^(Bike|Radfahren)$/i.test(leg[1]) ? ['Bike', 'Radfahren'] : ['Run', 'Laufen'];
      return names[locale === 'de' ? 1 : 0] + ': ' + localizeEventText(leg[2], locale);
    }
    const distance = original.match(/^(\d+(?:[.,]\d+)?)\s*[-–]?\s*(km|k)\s*[-–]?\s*(Lauf|Run)$/i);
    if (distance) return distance[1] + (locale === 'de' ? '-km-Lauf' : ' km run');
    const discipline = original.match(/^(\d+(?:[.,]\d+)?)\s*km\s+(swim|bike|run|hike|Schwimmen|Radfahren|Laufen|Wandern)$/i);
    if (discipline) {
      const names = /^(swim|Schwimmen)$/i.test(discipline[2]) ? ['swim', 'Schwimmen'] : /^(bike|Radfahren)$/i.test(discipline[2]) ? ['bike', 'Radfahren'] : /^(hike|Wandern)$/i.test(discipline[2]) ? ['hike', 'Wandern'] : ['run', 'Laufen'];
      return discipline[1] + ' km ' + names[locale === 'de' ? 1 : 0];
    }
    const miles = original.match(/^(\d+(?:[.,]\d+)?)\s+(Miles|Meilen)$/i);
    if (miles) return miles[1] + (locale === 'de' ? ' Meilen' : ' Miles');
    const age = original.match(/^(\d+)\s*(Jahre|years)(\s+(?:am Renntag|on race day))?$/i);
    if (age) return age[1] + (locale === 'de' ? ' Jahre' : ' years') + (age[3] ? (locale === 'de' ? ' am Renntag' : ' on race day') : '');
    const wave = original.match(/^(Welle|Wave)\s+([A-Z0-9]+)$/i);
    if (wave) return (locale === 'de' ? 'Welle ' : 'Wave ') + wave[2];
    return original;
  }
  function localizedField(record, key, language = 'de') {
    if (!record || typeof record !== 'object') return '';
    const locale = language === 'en' ? 'en' : 'de';
    return localizedValue(record[`${key}_${locale}`] ?? record.translations?.[locale]?.[key] ?? record[key], locale);
  }
  function localizedDescription(record, language = 'de') {
    return localizeEventText(cleanPublicEventDescription(localizedField(record, 'description', language)), language);
  }

  return { cleanPublicEventDescription, localizeEventText, localizedValue, localizedField, localizedDescription };
});
