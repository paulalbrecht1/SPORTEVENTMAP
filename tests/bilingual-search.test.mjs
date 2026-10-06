import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import descriptions from "../js/event-description.js";
import descriptionCatalog from "../js/event-description-translations.js";

const searchSource = fs.readFileSync(new URL("../js/search.js", import.meta.url), "utf8");
const eventSource = fs.readFileSync(new URL("../js/events.js", import.meta.url), "utf8");
function loadSearch(language = "en") {
  const context = vm.createContext({
    window: { getAppLanguage: () => language },
    cleanValue: value => String(value || "").trim(),
    eventUiText: value => value,
    document: { getElementById: () => null, querySelector: () => null }
  });
  vm.runInContext(eventSource.slice(eventSource.indexOf("const EVENT_STATUS_CONFIG ="),
    eventSource.indexOf("function createEventStatusBadge(")), context);
  vm.runInContext(searchSource, context);
  return context;
}
const event = (overrides = {}) => ({
  event_name: "Stadtlauf", city: "München", country: "Germany", date: "15.03.2027",
  sport: "Running", distance: "Half Marathon, 5 km", event_status: "scheduled",
  registration_status: "registration_open", ...overrides
});

test("German and English queries find the same events in either interface language", () => {
  for (const language of ["de", "en"]) {
    const search = loadSearch(language);
    for (const query of ["Halbmarathon München März 2027 Deutschland", "half marathon Muenchen March 2027 Germany",
      "Läufe Deutschland", "running Germany", "Straßenlauf München", "road running Muenchen",
      "Straße München", "road Muenchen", "5 Kilometer im März", "5 kilometres in March",
      "Anmeldung offen Deutschland", "registration open Germany"]) {
      assert.equal(search.eventMatchesSmartSearch(event(), search.parseSmartSearch(query)), true, `${language}: ${query}`);
    }
    for (const query of ["Halbmarathon Berlin", "half marathon April", "running 2028", "triathlon München",
      "Anmeldung nicht offen", "registration closed", "ausverkauft", "marathon München"]) {
      assert.equal(search.eventMatchesSmartSearch(event(), search.parseSmartSearch(query)), false, `${language}: ${query}`);
    }
  }
});

test("country names work in both directions, including accented and transliterated names", () => {
  const search = loadSearch();
  for (const [country, queries] of [
    ["Deutschland", ["Germany", "Deutschland", "DE"]],
    ["Austria", ["Österreich", "Oesterreich", "Austria"]],
    ["Österreich", ["Austria", "Oesterreich"]],
    ["CH", ["Switzerland", "Schweiz"]],
    ["Frankreich", ["France", "Frankreich"]],
    ["Italy", ["Italien", "Italy"]],
    ["Netherlands", ["Niederlande", "Netherlands"]]
  ]) {
    for (const query of queries) assert.equal(search.eventMatchesSmartSearch(event({ country }), search.parseSmartSearch(query)), true, query);
  }
  assert.equal(search.eventMatchesSmartSearch(event({ country: "Austria" }), search.parseSmartSearch("Germany")), false);
});

test("exact city aliases work in both languages without translating names or unrelated places", () => {
  const pairs = [["München", "Munich"], ["Köln", "Cologne"], ["Nürnberg", "Nuremberg"],
    ["Hannover", "Hanover"], ["Konstanz", "Constance"]];
  for (const language of ["de", "en"]) {
    const search = loadSearch(language);
    for (const names of pairs) for (const city of names) {
      const source = Object.freeze(event({ city }));
      for (const query of names) {
        assert.equal(search.eventMatchesSmartSearch(source, search.parseSmartSearch(query)), true, `${city}: ${query}`);
        search.window.allMarkers = [{ data: source }];
        assert.ok(search.getSearchSuggestionItems(query).some(item => item.query === city && item.title === `Events in ${city}`));
      }
      assert.equal(source.city, city);
    }
    assert.equal(search.eventMatchesSmartSearch(event({ city: "Muenchen" }), search.parseSmartSearch("Munich")), true);
    assert.equal(search.eventMatchesSmartSearch(event({ city: "Koeln" }), search.parseSmartSearch("Cologne")), true);
    assert.equal(search.eventMatchesSmartSearch(event({ city: "Köln/Bonn" }), search.parseSmartSearch("Cologne")), false);
    assert.equal(search.eventMatchesSmartSearch(event({ city: "Berlin", event_name: "Munich Challenge" }), search.parseSmartSearch("München")), false);
    assert.equal(search.eventMatchesSmartSearch(event({ city: "Berlin", description: "Visit Hanover after the event." }), search.parseSmartSearch("Hannover")), false);
  }
});

test("both displayed description translations are searchable using the shipped helper and catalog", () => {
  const pair = descriptionCatalog.find(([en, de]) => en.includes("linen wedding anniversary") && de.includes("Leinenhochzeit"));
  assert.ok(pair, "The real translated Stadtholz description remains in the shipped catalog");
  for (const language of ["de", "en"]) {
    const search = loadSearch(language);
    search.window.SportEventMapDescriptions = descriptions;
    for (const description of pair) {
      const source = Object.freeze(event({ event_name: "Stadtholz Marathon", city: "Rheda-Wiedenbrück", description }));
      assert.equal(descriptions.localizedDescription(source, "en"), pair[0]);
      assert.equal(descriptions.localizedDescription(source, "de"), pair[1]);
      for (const query of ["linen wedding anniversary", "Leinenhochzeit"]) {
        assert.equal(search.eventMatchesSmartSearch(source, search.parseSmartSearch(query)), true, `${language}: ${query}`);
      }
      assert.equal(source.description, description, "Search never rewrites organizer content");
      assert.equal(Object.hasOwn(source, "description_en"), false, "Dictionary translations work without materialized language fields");
    }
  }
});

test("decimal distances and translated triathlon disciplines survive query parsing", () => {
  const search = loadSearch();
  for (const [distance, queries, sport] of [
    ["21,1 km", ["half marathon", "Halbmarathon", "21.1 km", "21,1 km"], "Running"],
    ["42.195 km", ["marathon", "42,195 km"], "Running"],
    ["70.3", ["70.3", "70,3", "Mitteldistanz", "middle distance triathlon", "half ironman"], "Triathlon"],
    ["Olympische Distanz", ["Olympic triathlon", "olympische Distanz", "Kurzdistanz"], "Triathlon"],
    ["Sprintdistanz", ["Sprinttriathlon", "sprint triathlon"], "Triathlon"],
    ["Langdistanz", ["full distance", "Langdistanz", "long distance"], "Triathlon"]
  ]) {
    for (const query of queries) assert.equal(search.eventMatchesSmartSearch(event({ distance, sport }), search.parseSmartSearch(query)), true, `${distance}: ${query}`);
  }
  assert.equal(search.eventMatchesSmartSearch(event({ distance: "0.5 km" }), search.parseSmartSearch("5 km")), false);
  assert.equal(search.eventMatchesSmartSearch(event({ distance: "110 km" }), search.parseSmartSearch("10 km")), false);
  assert.equal(search.eventMatchesSmartSearch(event({ distance: "70.3", sport: "Triathlon" }), search.parseSmartSearch("Langdistanz")), false);
});

test("trail running is parsed as one discipline and does not also select ordinary running", () => {
  const search = loadSearch();
  for (const query of ["trail running", "Trail-Lauf", "Traillauf", "trail run"]) {
    assert.deepEqual(Array.from(search.parseSmartSearch(query).sports), ["Ultramarathon"], query);
    assert.equal(search.eventMatchesSmartSearch(event({ sport: "Ultramarathon", distance: "Trail 60 km" }), search.parseSmartSearch(query)), true, query);
    assert.equal(search.eventMatchesSmartSearch(event(), search.parseSmartSearch(query)), false, query);
  }
  assert.deepEqual(Array.from(search.parseSmartSearch("ultra running").sports), ["Ultramarathon"]);
  assert.equal(search.eventMatchesSmartSearch(event({ sport: "Ultra Running", distance: "60 km" }), search.parseSmartSearch("Ultralauf")), true);
});

test("registration searches use the actual displayed lifecycle status and never revive stale data", () => {
  const search = loadSearch();
  const matches = (value, query) => search.eventMatchesSmartSearch(event(value), search.parseSmartSearch(query));
  for (const [status, queries] of [
    ["sold_out", ["ausverkauft", "sold out"]],
    ["registration_not_open", ["Anmeldung noch nicht geöffnet", "registration not open"]],
    ["cancelled", ["Anmeldung abgesagt", "registration cancelled"]]
  ]) for (const query of queries) assert.equal(matches({ registration_status: status }, query), true, query);
  for (const query of ["Anmeldung offen", "registration open"]) {
    assert.equal(matches({ event_status: "cancelled" }, query), false, query);
    assert.equal(matches({ registration_status: "unknown", verification_status: "registration_open" }, query), false, query);
  }
  for (const query of ["abgesagt", "cancelled"]) assert.equal(matches({ event_status: "cancelled" }, query), true, query);
});

test("ordinary name and location searches retain partial matching without missing-value false positives", () => {
  const search = loadSearch();
  const source = Object.freeze(event({ event_name: "Frühlingslauf", race_formats: [{ label: "10 km Hauptlauf", distance_km: 10 }] }));
  for (const query of ["Frühling", "fruehling", "Mün", "10k", "Hauptlauf"]) {
    assert.equal(search.eventMatchesSmartSearch(source, search.parseSmartSearch(query)), true, query);
  }
  assert.equal(search.eventMatchesSmartSearch({}, search.parseSmartSearch("undefined")), false);
  assert.equal(source.event_name, "Frühlingslauf");
});

test("smart search titles and filter summaries use current language translations", () => {
  const search = loadSearch("de");
  const translations = {
    "filter.half": "Halbmarathon", "search.in": "im", "month.2": "März",
    "search.running": "Laufen", "search.found": "{count} gefunden", "search.queryLabel": "Suche: {query}"
  };
  search.window.tFormat = (key, replacements, fallback) => Object.entries(replacements)
    .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), translations[key] || fallback);
  assert.equal(search.getSmartSearchTitle(search.parseSmartSearch("half marathon March"), ""), "Halbmarathon im März");
  assert.equal(search.getSmartSearchTitle(search.parseSmartSearch("running"), ""), "Laufen");
  search.document.getElementById = id => id === "searchInput" ? { value: "München" } : null;
  assert.ok(search.getActiveFilterLabels(3).includes("3 gefunden"));
  assert.ok(search.getActiveFilterLabels().includes("Suche: München"));
});
