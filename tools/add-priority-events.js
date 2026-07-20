const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  ensureDirectoryForFile,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const EVENTS_FILE = "data/events.csv";
const BACKUP_FILE =
  "data/backups/events-before-priority-events-2026-06-18.csv";
const REPORT_FILE =
  "data/imports/review/priority-events-added-2026-06-18.json";

const today = "18.06.2026";

function normalizeText(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  try {
    const url = new URL(cleanValue(value));
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`;
  } catch (error) {
    return normalizeText(value);
  }
}

function eventIdentity(event) {
  return [
    normalizeText(event.event_name),
    normalizeText(event.city),
    normalizeText(event.country)
  ].join("|");
}

const priorityEvents = [
  {
    event_name: "Hermannslauf Bielefeld",
    sport: "Trail Running",
    date: "26.04.2026",
    city: "Detmold",
    country: "Germany",
    address: "Hermannsdenkmal, 32760 Detmold, Germany",
    latitude: "51.9111",
    longitude: "8.8391",
    distance: "31.1 km",
    description:
      "Participants: sold out quickly | Course: point-to-point classic through the Teutoburger Wald | Format: 31.1 km from Hermannsdenkmal to Bielefeld.",
    event_url: "https://hermannslauf.de/",
    data_source: "Official organizer website",
    source_url: "https://hermannslauf.de/",
    verification_status: "date_expected",
    priority: "high",
    check_frequency: "monthly",
    last_checked: today,
    next_check: "18.07.2026",
    source_note:
      "Official website confirms 26 April 2026, 31.1 km from Detmold/Hermannsdenkmal to Bielefeld and sold-out registration for the listed edition. Current map record is kept as date_expected because the date is past relative to the app check date and the next edition must be confirmed."
  },
  {
    event_name: "NN Marathon Rotterdam",
    sport: "Running",
    date: "12.04.2026",
    city: "Rotterdam",
    country: "Netherlands",
    address: "Coolsingel, Rotterdam, Netherlands",
    latitude: "51.92195",
    longitude: "4.47915",
    distance: "Marathon / 42.195 km",
    description:
      "Participants: sold out marathon field | Course: fast city marathon | Format: marathon weekend in Rotterdam.",
    event_url: "https://nnmarathonrotterdam.nl/en/",
    data_source: "Official organizer website",
    source_url: "https://nnmarathonrotterdam.nl/en/",
    verification_status: "date_expected",
    priority: "high",
    check_frequency: "monthly",
    last_checked: today,
    next_check: "18.07.2026",
    source_note:
      "Official website confirms 11-12 April 2026 and marathon distance. It also marks the marathon as sold out / pre-registration closed. Record is date_expected because the next future edition must be confirmed."
  },
  {
    event_name: "Schneider Electric Marathon de Paris",
    sport: "Running",
    date: "12.04.2026",
    city: "Paris",
    country: "France",
    address: "Avenue des Champs-Elysees, Paris, France",
    latitude: "48.8698",
    longitude: "2.3078",
    distance: "Marathon / 42.195 km",
    description:
      "Participants: major international city marathon | Course: Paris city course | Format: marathon.",
    event_url: "https://www.schneiderelectricparismarathon.com/en",
    data_source: "Official organizer website",
    source_url: "https://www.schneiderelectricparismarathon.com/en",
    verification_status: "date_expected",
    priority: "high",
    check_frequency: "monthly",
    last_checked: today,
    next_check: "18.07.2026",
    source_note:
      "Official website confirms the 12 April 2026 edition and exposes registration navigation. Record is date_expected because the next future edition must be confirmed."
  },
  {
    event_name: "Vodafone Prague Marathon",
    sport: "Running",
    date: "03.05.2026",
    city: "Prague",
    country: "Czech Republic",
    address: "Old Town Square, Prague, Czech Republic",
    latitude: "50.0870",
    longitude: "14.4208",
    distance: "Marathon / 42.195 km",
    description:
      "Participants: 16,000 capacity | Course: historic Prague city course | Format: marathon.",
    event_url:
      "https://www.runczech.com/en/events/vodafone-prague-marathon-2026",
    data_source: "Official organizer website",
    source_url:
      "https://www.runczech.com/en/events/vodafone-prague-marathon-2026",
    verification_status: "date_expected",
    priority: "high",
    check_frequency: "monthly",
    last_checked: today,
    next_check: "18.07.2026",
    source_note:
      "Official RunCzech page confirms the 3 May 2026 marathon, 42.195 km distance and 16,000 runners. Record is date_expected because the next future edition must be confirmed."
  },
  {
    event_name: "Mozart 100 by UTMB",
    sport: "Ultramarathon",
    date: "23.05.2026",
    city: "Salzburg",
    country: "Austria",
    address: "Kapitelplatz, Salzburg, Austria",
    latitude: "47.7973",
    longitude: "13.0478",
    distance: "100 km / Ultra / Marathon / Half Marathon",
    description:
      "Participants: UTMB World Series trail event | Course: alpine trail routes around Salzburg | Format: 100 km, ultra, marathon and shorter trail distances.",
    event_url: "https://mozart.utmb.world/",
    data_source: "Official organizer website",
    source_url: "https://mozart.utmb.world/",
    verification_status: "date_expected",
    priority: "high",
    check_frequency: "monthly",
    last_checked: today,
    next_check: "18.07.2026",
    source_note:
      "Official event page confirms 23 May 2026 and lists mozart 100 plus ultra, marathon, half marathon, lake trail and relay formats. Record is date_expected because the next future edition must be confirmed."
  },
  {
    event_name: "Transvulcania",
    sport: "Ultramarathon",
    date: "08.05.2027",
    city: "Fuencaliente de La Palma",
    country: "Spain",
    address: "Faro de Fuencaliente, La Palma, Spain",
    latitude: "28.4565",
    longitude: "-17.8453",
    distance: "Ultramarathon / Marathon / Half Marathon / Vertical KM",
    description:
      "Participants: major international trail event | Course: volcanic mountain route on La Palma | Format: ultramarathon, marathon, half marathon and vertical kilometre.",
    event_url: "https://transvulcania.com/",
    data_source: "Official organizer website and registration page",
    source_url:
      "https://www.avaibooksports.com/inscripcion/transvulcania-2027/",
    verification_status: "registration_open",
    priority: "high",
    check_frequency: "monthly",
    last_checked: today,
    next_check: "18.07.2026",
    source_note:
      "Official Transvulcania site links to the registration provider. Registration page confirms event date 8 May 2027, mountain race specialty and registration deadline running from 22 May 2026 to 8 April 2027."
  },
  {
    event_name: "Paderborner Osterlauf",
    sport: "Running",
    date: "04.04.2026",
    city: "Paderborn",
    country: "Germany",
    address: "Heierswall, 33098 Paderborn, Germany",
    latitude: "51.7209",
    longitude: "8.7536",
    distance: "5 km / 10 km / Half Marathon",
    description:
      "Participants: historic German road race | Course: city road course | Format: 5 km, 10 km and half marathon.",
    event_url: "https://www.paderborner-osterlauf.de/",
    data_source: "Official organizer website",
    source_url: "https://www.paderborner-osterlauf.de/",
    verification_status: "date_expected",
    priority: "high",
    check_frequency: "monthly",
    last_checked: today,
    next_check: "18.07.2026",
    source_note:
      "Official website confirms 78th Paderborner Osterlauf on 4 April 2026 with registration navigation. Record is date_expected because the next future edition must be confirmed."
  }
];

function run() {
  const existingEvents =
    parseCsvFile(EVENTS_FILE)
      .filter(event =>
        cleanValue(event.event_name)
      );

  ensureDirectoryForFile(BACKUP_FILE);

  if (!fs.existsSync(BACKUP_FILE)) {
    fs.copyFileSync(EVENTS_FILE, BACKUP_FILE);
  }

  const existingIdentities =
    new Set(existingEvents.map(eventIdentity));

  const existingUrls =
    new Set(
      existingEvents
        .map(event => normalizeUrl(event.event_url))
        .filter(Boolean)
    );

  const added = [];
  const skipped = [];

  for (const event of priorityEvents) {
    const identity =
      eventIdentity(event);

    const url =
      normalizeUrl(event.event_url);

    if (
      existingIdentities.has(identity) ||
      existingUrls.has(url)
    ) {
      skipped.push({
        event_name: event.event_name,
        reason: "already_exists"
      });
      continue;
    }

    existingEvents.push(event);
    existingIdentities.add(identity);
    existingUrls.add(url);
    added.push(event.event_name);
  }

  writeCsvFile(EVENTS_FILE, existingEvents);

  writeJsonFile(REPORT_FILE, {
    generated_at: new Date().toISOString(),
    events_file: EVENTS_FILE,
    backup_file: BACKUP_FILE,
    added_count: added.length,
    skipped_count: skipped.length,
    added,
    skipped,
    not_added: [
      {
        event_name: "Munich Marathon",
        reason:
          "Official site currently does not provide a clean future date and describes unresolved organizer/legal uncertainty. Keep in priority review until a confirmed edition is published."
      }
    ]
  });

  console.log(
    `Added ${added.length} priority events. Skipped ${skipped.length}.`
  );
}

run();
