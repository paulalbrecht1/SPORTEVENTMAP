const {
  cleanValue,
  formatDateToGerman,
  getEventQualityIssue,
  isEventWithinIsoRange,
  normalizeEvent,
  parseCoordinate,
  writeCsvFile
} = require("./event-table-utils");

const DEFAULT_EVENT_TYPES = [
  "running_race",
  "running_only",
  "trail_race",
  "ultra",
  "triathlon"
];

function parseArgs(argv) {
  const args = {
    startDate: "",
    endDate: "",
    country: "",
    eventTypes: DEFAULT_EVENT_TYPES,
    maxPages: 3,
    resultsPerPage: 1000,
    out: "data/imports/normalized/runsignup.normalized.csv",
    includeVirtual: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--start-date") {
      args.startDate = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--end-date") {
      args.endDate = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--country") {
      args.country = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--event-types") {
      args.eventTypes =
        argv[index + 1]
          .split(",")
          .map(type => type.trim())
          .filter(Boolean);
      index += 1;
      continue;
    }

    if (value === "--max-pages") {
      args.maxPages =
        Number(argv[index + 1] || args.maxPages);
      index += 1;
      continue;
    }

    if (value === "--results-per-page") {
      args.resultsPerPage =
        Number(argv[index + 1] || args.resultsPerPage);
      index += 1;
      continue;
    }

    if (value === "--out") {
      args.out = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--include-virtual") {
      args.includeVirtual = true;
      continue;
    }
  }

  if (!args.startDate || !args.endDate) {
    throw new Error(
      "Usage: node tools/import-runsignup.js --start-date YYYY-MM-DD --end-date YYYY-MM-DD [--country US]"
    );
  }

  return args;
}

function getRaceItems(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const races =
    payload.races ||
    payload.response?.races ||
    [];

  return Array.isArray(races)
    ? races
    : [];
}

function unwrapRace(item) {
  return item.race || item;
}

function unwrapEvent(item) {
  return item.event || item;
}

function getRaceEvents(race) {
  const events =
    race.events ||
    race.race_events ||
    [];

  if (Array.isArray(events) && events.length) {
    return events.map(unwrapEvent);
  }

  return [null];
}

function getAddress(race) {
  return race.address || {};
}

function getEventDate(race, event) {
  return formatDateToGerman(
    event?.start_time ||
    event?.event_date ||
    event?.date ||
    race.next_date ||
    race.start_time ||
    race.start_date
  );
}

function getDistance(event) {
  if (!event) {
    return "";
  }

  const distance =
    cleanValue(event.distance);

  const units =
    cleanValue(
      event.distance_units ||
      event.distance_unit
    );

  if (distance && units) {
    return `${distance} ${units}`;
  }

  return (
    distance ||
    cleanValue(event.name) ||
    cleanValue(event.event_name)
  );
}

function cleanDescription(value) {
  return cleanValue(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x[0-9a-f]+;/gi, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function isVirtualRace(race, event) {
  const value =
    [
      race.name,
      race.race_name,
      race.virtual_race,
      race.is_virtual,
      event?.name,
      event?.event_name,
      event?.is_virtual
    ]
      .map(cleanValue)
      .join(" ")
      .toLowerCase();

  return (
    value.includes("virtual") ||
    value.includes("anywhere")
  );
}

function mapRunSignupEvent(
  race,
  event,
  eventType
) {
  const address =
    getAddress(race);

  const raceName =
    cleanValue(race.name || race.race_name);

  const eventName =
    cleanValue(event?.name || event?.event_name);

  const fullName =
    eventName && eventName !== raceName
      ? `${raceName} - ${eventName}`
      : raceName || eventName;

  const street =
    cleanValue(
      address.street ||
      address.address_line_1 ||
      race.street
    );

  const city =
    cleanValue(
      address.city ||
      race.city
    );

  const state =
    cleanValue(
      address.state ||
      race.state
    );

  const country =
    cleanValue(
      address.country_code ||
      address.country ||
      race.country_code ||
      race.country
    );

  const distance =
    getDistance(event);

  return normalizeEvent(
    {
      event_name:
        fullName,
      sport:
        eventType,
      date:
        getEventDate(race, event),
      city,
      country,
      address:
        [street, city, state, country]
          .filter(Boolean)
          .join(", "),
      latitude:
        parseCoordinate(
          address.latitude ||
          race.latitude
        ),
      longitude:
        parseCoordinate(
          address.longitude ||
          address.lng ||
          race.longitude ||
          race.lng
        ),
      distance,
      description:
        cleanDescription(race.description),
      event_url:
        cleanValue(
          race.url ||
          race.race_url ||
          race.homepage_url
        ),
      data_source:
        "RunSignup"
    }
  );
}

async function fetchRacePage(args, eventType, page) {
  if (typeof fetch !== "function") {
    throw new Error(
      "This script needs Node.js 18+ for fetch support."
    );
  }

  const url =
    new URL("https://api.runsignup.com/rest/races");

  url.searchParams.set("format", "json");
  url.searchParams.set("events", "T");
  url.searchParams.set("include_event_days", "T");
  url.searchParams.set("start_date", args.startDate);
  url.searchParams.set("end_date", args.endDate);
  url.searchParams.set("event_type", eventType);
  url.searchParams.set("page", String(page));
  url.searchParams.set(
    "results_per_page",
    String(args.resultsPerPage)
  );
  url.searchParams.set("sort", "date ASC");

  if (args.country) {
    url.searchParams.set("country", args.country);
  }

  if (
    process.env.RUNSIGNUP_API_KEY &&
    process.env.RUNSIGNUP_API_SECRET
  ) {
    url.searchParams.set(
      "api_key",
      process.env.RUNSIGNUP_API_KEY
    );

    url.searchParams.set(
      "api_secret",
      process.env.RUNSIGNUP_API_SECRET
    );
  }

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `RunSignup API returned ${response.status} for ${eventType} page ${page}`
    );
  }

  return await response.json();
}

async function main() {
  const args =
    parseArgs(process.argv);

  const events = [];
  let skipped = 0;

  for (const eventType of args.eventTypes) {
    for (let page = 1; page <= args.maxPages; page += 1) {
      const payload =
        await fetchRacePage(
          args,
          eventType,
          page
        );

      const raceItems =
        getRaceItems(payload);

      if (!raceItems.length) {
        break;
      }

      raceItems.forEach(item => {
        const race =
          unwrapRace(item);

        getRaceEvents(race)
          .forEach(event => {
            if (
              !args.includeVirtual &&
              isVirtualRace(race, event)
            ) {
              skipped += 1;
              return;
            }

            const mappedEvent =
              mapRunSignupEvent(
                race,
                event,
                eventType
              );

            if (
              !isEventWithinIsoRange(
                mappedEvent,
                args.startDate,
                args.endDate
              )
            ) {
              skipped += 1;
              return;
            }

            if (getEventQualityIssue(mappedEvent)) {
              skipped += 1;
              return;
            }

            events.push(mappedEvent);
          });
      });
    }
  }

  writeCsvFile(
    args.out,
    events
  );

  console.log(
    `Imported ${events.length} RunSignup events to ${args.out}`
  );

  console.log(
    `Skipped ${skipped} non-event or out-of-range RunSignup rows`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
