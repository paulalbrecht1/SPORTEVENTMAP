const fs = require("fs");

const {
  cleanValue,
  parseCoordinate,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const COUNTRY_RULES = {
  Germany: {
    aliases: ["germany", "deutschland"],
    countryCode: "de",
    bbox: [47, 5, 56, 16]
  },
  Austria: {
    aliases: ["austria", "österreich", "oesterreich"],
    countryCode: "at",
    bbox: [46, 9, 49.5, 17.5]
  },
  Switzerland: {
    aliases: ["switzerland", "schweiz"],
    countryCode: "ch",
    bbox: [45.7, 5.7, 47.9, 10.7]
  },
  Spain: {
    aliases: ["spain", "spanien"],
    countryCode: "es",
    bbox: [27, -19, 44, 5]
  },
  Italy: {
    aliases: ["italy", "italien"],
    countryCode: "it",
    bbox: [35, 6, 48, 19]
  },
  France: {
    aliases: ["france", "frankreich"],
    countryCode: "fr",
    bbox: [41, -6, 51.5, 10]
  },
  "United Kingdom": {
    aliases: ["united kingdom", "uk", "great britain"],
    countryCode: "gb",
    bbox: [49, -9, 61, 2]
  },
  Poland: {
    aliases: ["poland", "polen"],
    countryCode: "pl",
    bbox: [49, 14, 55, 25]
  },
  Sweden: {
    aliases: ["sweden", "schweden"],
    countryCode: "se",
    bbox: [55, 10, 70, 25]
  },
  Denmark: {
    aliases: ["denmark", "dänemark", "daenemark"],
    countryCode: "dk",
    bbox: [54, 8, 58, 16]
  },
  Netherlands: {
    aliases: ["netherlands", "niederlande"],
    countryCode: "nl",
    bbox: [50, 3, 54, 8]
  },
  Belgium: {
    aliases: ["belgium", "belgien"],
    countryCode: "be",
    bbox: [49, 2, 52, 7]
  },
  Portugal: {
    aliases: ["portugal"],
    countryCode: "pt",
    bbox: [32, -32, 43, -6]
  },
  Greece: {
    aliases: ["greece", "griechenland"],
    countryCode: "gr",
    bbox: [34, 19, 42, 30]
  },
  Ireland: {
    aliases: ["ireland", "irland"],
    countryCode: "ie",
    bbox: [51, -11, 56, -5]
  },
  Iceland: {
    aliases: ["iceland", "island"],
    countryCode: "is",
    bbox: [63, -25, 67, -13]
  },
  Finland: {
    aliases: ["finland", "finnland"],
    countryCode: "fi",
    bbox: [59, 19, 71, 32]
  },
  Hungary: {
    aliases: ["hungary", "ungarn"],
    countryCode: "hu",
    bbox: [45.5, 16, 49, 23]
  },
  Romania: {
    aliases: ["romania", "rumänien", "rumaenien"],
    countryCode: "ro",
    bbox: [43, 20, 49, 30]
  },
  Croatia: {
    aliases: ["croatia", "kroatien"],
    countryCode: "hr",
    bbox: [42, 13, 47, 20]
  },
  Luxembourg: {
    aliases: ["luxembourg", "luxemburg"],
    countryCode: "lu",
    bbox: [49, 5, 51, 7]
  },
  Malta: {
    aliases: ["malta"],
    countryCode: "mt",
    bbox: [35, 14, 36.5, 15]
  },
  Liechtenstein: {
    aliases: ["liechtenstein"],
    countryCode: "li",
    bbox: [47, 9, 48, 10]
  }
};

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv[3] || "data/events.coordinates-fixed.csv",
    report:
      argv[4] ||
      "data/imports/review/coordinate-country-fix-report.json",
    keyFile:
      argv[5] ||
      "data/imports/private/geoapify-key.txt",
    limit: Number(argv[6] || 200)
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
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  return Object.entries(COUNTRY_RULES)
    .find(([_name, rule]) =>
      rule.aliases.some(alias =>
        alias
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase() === country
      )
    );
}

function isInsideBbox(event, rule) {
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
  ] = rule.bbox;

  return (
    lat >= minLat &&
    lat <= maxLat &&
    lng >= minLng &&
    lng <= maxLng
  );
}

function cleanQueryPart(value) {
  return cleanValue(value)
    .replace(/,\s*Germany,\s*Germany$/i, ", Germany")
    .replace(/,\s*Deutschland,\s*Deutschland$/i, ", Germany")
    .replace(/\s+/g, " ");
}

function getQueries(event, countryName) {
  const cityCountry =
    [
      cleanQueryPart(event.city),
      countryName
    ]
      .filter(Boolean)
      .join(", ");

  const addressQuery =
    cleanQueryPart(event.address);

  const queries = [];

  if (
    addressQuery &&
    addressQuery.toLowerCase() !== cityCountry.toLowerCase()
  ) {
    queries.push(addressQuery);
  }

  queries.push(cityCountry);

  return [...new Set(queries.filter(Boolean))];
}

async function geocode(query, rule, apiKey) {
  const url =
    new URL("https://api.geoapify.com/v1/geocode/search");

  url.searchParams.set("text", query);
  url.searchParams.set("filter", `countrycode:${rule.countryCode}`);
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

  const mismatches =
    events
      .map((event, index) => {
        const match =
          normalizeCountry(event.country);

        if (!match) {
          return null;
        }

        const [countryName, rule] =
          match;

        if (isInsideBbox(event, rule)) {
          return null;
        }

        return {
          event,
          index,
          countryName,
          rule,
          oldLatitude: event.latitude,
          oldLongitude: event.longitude
        };
      })
      .filter(Boolean)
      .slice(0, args.limit);

  const fixed = [];
  const unresolved = [];

  for (const item of mismatches) {
    const queries =
      getQueries(item.event, item.countryName);

    let replacement = null;

    for (const query of queries) {
      replacement =
        await geocode(query, item.rule, apiKey);

      if (replacement) {
        const testEvent = {
          ...item.event,
          latitude: replacement.latitude,
          longitude: replacement.longitude
        };

        if (isInsideBbox(testEvent, item.rule)) {
          break;
        }
      }

      replacement = null;
    }

    if (!replacement) {
      unresolved.push({
        event_name: item.event.event_name,
        city: item.event.city,
        country: item.event.country,
        oldLatitude: item.oldLatitude,
        oldLongitude: item.oldLongitude,
        queries
      });
      continue;
    }

    item.event.latitude =
      replacement.latitude;

    item.event.longitude =
      replacement.longitude;

    item.event.source_note =
      cleanValue(
        `${item.event.source_note} Coordinates corrected by country-bounded Geoapify geocoding (${replacement.query}).`
      );

    fixed.push({
      event_name: item.event.event_name,
      city: item.event.city,
      country: item.event.country,
      oldLatitude: item.oldLatitude,
      oldLongitude: item.oldLongitude,
      newLatitude: replacement.latitude,
      newLongitude: replacement.longitude,
      query: replacement.query,
      formatted: replacement.formatted
    });
  }

  writeCsvFile(args.out, events);

  writeJsonFile(args.report, {
    generated_at: new Date().toISOString(),
    input: args.input,
    output: args.out,
    detected_mismatches: mismatches.length,
    fixed: fixed.length,
    unresolved: unresolved.length,
    fixed_events: fixed,
    unresolved_events: unresolved
  });

  console.log(`Detected mismatches: ${mismatches.length}`);
  console.log(`Fixed: ${fixed.length}`);
  console.log(`Unresolved: ${unresolved.length}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
