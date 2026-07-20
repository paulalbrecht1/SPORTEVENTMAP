const {
  cleanValue,
  formatDateToGerman,
  normalizeEvent,
  parseCoordinate,
  writeCsvFile
} = require("./event-table-utils");

function parseArgs(argv) {
  const args = {
    startDate: "",
    endDate: "",
    out: "data/imports/normalized/world-triathlon.normalized.csv"
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

    if (value === "--out") {
      args.out = argv[index + 1];
      index += 1;
      continue;
    }
  }

  if (!args.startDate || !args.endDate) {
    throw new Error(
      "Usage: node tools/import-world-triathlon.js --start-date YYYY-MM-DD --end-date YYYY-MM-DD"
    );
  }

  return args;
}

function getEventsFromResponse(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.data)) {
      return payload.data;
    }

    if (Array.isArray(payload.events)) {
      return payload.events;
    }
  }

  return [];
}

function mapWorldTriathlonEvent(event) {
  return normalizeEvent(
    {
      event_name:
        cleanValue(event.event_title),
      sport:
        "Triathlon",
      date:
        formatDateToGerman(event.event_date),
      city:
        cleanValue(event.event_venue),
      country:
        cleanValue(event.event_country),
      latitude:
        parseCoordinate(event.event_latitude),
      longitude:
        parseCoordinate(event.event_longitude),
      distance:
        "Triathlon",
      event_url:
        cleanValue(event.event_listing) ||
        cleanValue(event.event_api_listing),
      data_source:
        "World Triathlon"
    }
  );
}

async function fetchWorldTriathlonEvents(args) {
  if (typeof fetch !== "function") {
    throw new Error(
      "This script needs Node.js 18+ for fetch support."
    );
  }

  const apiKey =
    process.env.WORLD_TRIATHLON_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing WORLD_TRIATHLON_API_KEY environment variable."
    );
  }

  const url =
    new URL("https://api.triathlon.org/v1/events");

  url.searchParams.set(
    "start_date",
    args.startDate
  );

  url.searchParams.set(
    "end_date",
    args.endDate
  );

  url.searchParams.set("order", "asc");

  const response =
    await fetch(
      url,
      {
        headers: {
          apikey: apiKey
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `World Triathlon API returned ${response.status}`
    );
  }

  return await response.json();
}

async function main() {
  const args =
    parseArgs(process.argv);

  const payload =
    await fetchWorldTriathlonEvents(args);

  const events =
    getEventsFromResponse(payload)
      .map(mapWorldTriathlonEvent)
      .filter(event =>
        event.event_name &&
        event.date
      );

  writeCsvFile(
    args.out,
    events
  );

  console.log(
    `Imported ${events.length} World Triathlon events to ${args.out}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
