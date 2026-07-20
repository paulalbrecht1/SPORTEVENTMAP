const fs = require("fs");

const {
  cleanValue,
  parseCoordinate,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const COUNTRY_BOUNDS = {
  Germany: ["de", [47, 5, 56, 16]],
  Austria: ["at", [46, 9, 49.5, 17.5]],
  Switzerland: ["ch", [45.7, 5.7, 47.9, 10.7]],
  Spain: ["es", [27, -19, 44, 5]],
  Italy: ["it", [35, 6, 48, 19]],
  France: ["fr", [41, -6, 51.5, 10]],
  "United Kingdom": ["gb", [49, -9, 61, 2]],
  UK: ["gb", [49, -9, 61, 2]],
  Poland: ["pl", [49, 14, 55, 25]],
  Sweden: ["se", [55, 10, 70, 25]],
  Denmark: ["dk", [54, 8, 58, 16]],
  Netherlands: ["nl", [50, 3, 54, 8]],
  Belgium: ["be", [49, 2, 52, 7]],
  Portugal: ["pt", [32, -32, 43, -6]],
  Greece: ["gr", [34, 19, 42, 30]],
  Ireland: ["ie", [51, -11, 56, -5]],
  Iceland: ["is", [63, -25, 67, -13]],
  Finland: ["fi", [59, 19, 71, 32]],
  Hungary: ["hu", [45.5, 16, 49, 23]],
  Romania: ["ro", [43, 20, 49, 30]],
  Croatia: ["hr", [42, 13, 47, 20]],
  Luxembourg: ["lu", [49, 5, 51, 7]],
  Malta: ["mt", [35, 14, 36.5, 15]],
  Liechtenstein: ["li", [47, 9, 48, 10]]
};

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv[3] || "data/events.precise-geocoded.csv",
    report:
      argv[4] ||
      "data/imports/review/precise-address-geocoding-report.json",
    keyFile:
      argv[5] ||
      "data/imports/private/geoapify-key.txt",
    limit: Number(argv[6] || 500),
    concurrency: Number(argv[7] || 6)
  };
}

function readApiKey(keyFile) {
  const envKey =
    cleanValue(process.env.GEOAPIFY_API_KEY);

  if (envKey) {
    return envKey;
  }

  if (fs.existsSync(keyFile)) {
    return cleanValue(
      fs.readFileSync(keyFile, "utf8")
    );
  }

  return "";
}

function normalizeCountry(value) {
  const country =
    cleanValue(value)
      .replace("Deutschland", "Germany")
      .replace("Österreich", "Austria")
      .replace("Schweiz", "Switzerland")
      .replace("Belgien", "Belgium")
      .replace("Dänemark", "Denmark")
      .replace("Schweden", "Sweden")
      .replace("Griechenland", "Greece")
      .replace("Irland", "Ireland")
      .replace("Island", "Iceland")
      .replace("Finnland", "Finland")
      .replace("Ungarn", "Hungary")
      .replace("Rumänien", "Romania");

  return COUNTRY_BOUNDS[country]
    ? country
    : "";
}

function hasPreciseAddress(event) {
  const address =
    cleanValue(event.address);

  const city =
    cleanValue(event.city);

  const country =
    cleanValue(event.country);

  if (
    !address ||
    address.toLowerCase() === city.toLowerCase() ||
    address.toLowerCase() === `${city}, ${country}`.toLowerCase()
  ) {
    return false;
  }

  return /\d|straße|strasse|str\.|weg|allee|platz|park|stadion|halle|arena|zentrum|center|see|ufer|brücke|bruecke|sportplatz|marktplatz|schloss|aue|trail|start/i
    .test(address);
}

function isInside(event, countryName) {
  const rule =
    COUNTRY_BOUNDS[countryName];

  if (!rule) {
    return false;
  }

  const lat =
    parseCoordinate(event.latitude);

  const lng =
    parseCoordinate(event.longitude);

  if (
    lat === "" ||
    lng === ""
  ) {
    return false;
  }

  const [
    minLat,
    minLng,
    maxLat,
    maxLng
  ] = rule[1];

  return (
    lat >= minLat &&
    lat <= maxLat &&
    lng >= minLng &&
    lng <= maxLng
  );
}

function getQuery(event, countryName) {
  return [
    cleanValue(event.address)
      .replace(/,\s*Germany,\s*Germany$/i, ", Germany")
      .replace(/,\s*Deutschland,\s*Deutschland$/i, ", Germany"),
    countryName
  ]
    .filter(Boolean)
    .join(", ");
}

async function geocode(event, countryName, apiKey) {
  const [countryCode] =
    COUNTRY_BOUNDS[countryName];

  const query =
    getQuery(event, countryName);

  const url =
    new URL("https://api.geoapify.com/v1/geocode/search");

  url.searchParams.set("text", query);
  url.searchParams.set("filter", `countrycode:${countryCode}`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "de");
  url.searchParams.set("apiKey", apiKey);

  const response =
    await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `Geoapify failed ${response.status}: ${await response.text()}`
    );
  }

  const data =
    await response.json();

  const feature =
    data.features && data.features[0];

  if (!feature) {
    return null;
  }

  const [lng, lat] =
    feature.geometry.coordinates;

  return {
    latitude: lat,
    longitude: lng,
    formatted:
      cleanValue(feature.properties && feature.properties.formatted),
    query
  };
}

async function main() {
  const args =
    parseArgs(process.argv);

  const apiKey =
    readApiKey(args.keyFile);

  if (!apiKey) {
    throw new Error(
      `Set GEOAPIFY_API_KEY or paste the key into ${args.keyFile}.`
    );
  }

  const events =
    parseCsvFile(args.input);

  const candidates =
    events
      .map((event, index) => ({
        event,
        index,
        countryName: normalizeCountry(event.country)
      }))
      .filter(item =>
        item.countryName &&
        hasPreciseAddress(item.event)
      )
      .slice(0, args.limit);

  const updated = [];
  const skipped = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < candidates.length) {
      const item =
        candidates[nextIndex];

      nextIndex += 1;

      try {
        const result =
          await geocode(
            item.event,
            item.countryName,
            apiKey
          );

        if (!result) {
          skipped.push({
            event_name: item.event.event_name,
            reason: "No geocoding result"
          });
          continue;
        }

        const testEvent = {
          ...item.event,
          latitude: result.latitude,
          longitude: result.longitude
        };

        if (!isInside(testEvent, item.countryName)) {
          skipped.push({
            event_name: item.event.event_name,
            reason: "Result outside country bounds",
            formatted: result.formatted
          });
          continue;
        }

        const oldLatitude =
          item.event.latitude;

        const oldLongitude =
          item.event.longitude;

        item.event.latitude =
          result.latitude;

        item.event.longitude =
          result.longitude;

        item.event.source_note =
          cleanValue(
            `${item.event.source_note} Precise address geocoded with Geoapify (${result.query}).`
          );

        updated.push({
          event_name: item.event.event_name,
          city: item.event.city,
          oldLatitude,
          oldLongitude,
          newLatitude: result.latitude,
          newLongitude: result.longitude,
          query: result.query,
          formatted: result.formatted
        });
      } catch (error) {
        skipped.push({
          event_name: item.event.event_name,
          reason: error.message
        });
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.max(1, args.concurrency)
      },
      worker
    )
  );

  writeCsvFile(args.out, events);
  writeJsonFile(args.report, {
    generated_at: new Date().toISOString(),
    input: args.input,
    output: args.out,
    candidates: candidates.length,
    updated: updated.length,
    skipped: skipped.length,
    updated_events: updated,
    skipped_events: skipped.slice(0, 120)
  });

  console.log(`Precise address candidates: ${candidates.length}`);
  console.log(`Updated coordinates: ${updated.length}`);
  console.log(`Skipped: ${skipped.length}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
