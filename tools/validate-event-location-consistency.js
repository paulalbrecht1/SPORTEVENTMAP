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
    code: "de",
    bbox: [47, 5, 56, 16],
    aliases: ["germany", "deutschland"]
  },
  Austria: {
    code: "at",
    bbox: [46, 9, 49.5, 17.5],
    aliases: ["austria", "oesterreich", "osterreich"]
  },
  Switzerland: {
    code: "ch",
    bbox: [45.7, 5.7, 47.9, 10.7],
    aliases: ["switzerland", "schweiz"]
  },
  Spain: {
    code: "es",
    bbox: [27, -19, 44, 5],
    aliases: ["spain", "spanien"]
  },
  Italy: {
    code: "it",
    bbox: [35, 6, 48, 19],
    aliases: ["italy", "italien"]
  },
  France: {
    code: "fr",
    bbox: [41, -6, 51.5, 10],
    aliases: ["france", "frankreich"]
  },
  "United Kingdom": {
    code: "gb",
    bbox: [49, -9, 61, 2],
    aliases: ["united kingdom", "uk", "great britain"]
  },
  Poland: {
    code: "pl",
    bbox: [49, 14, 55, 25],
    aliases: ["poland", "polen"]
  },
  Sweden: {
    code: "se",
    bbox: [55, 10, 70, 25],
    aliases: ["sweden", "schweden"]
  },
  Denmark: {
    code: "dk",
    bbox: [54, 8, 58, 16],
    aliases: ["denmark", "daenemark"]
  },
  Netherlands: {
    code: "nl",
    bbox: [50, 3, 54, 8],
    aliases: ["netherlands", "niederlande"]
  },
  Belgium: {
    code: "be",
    bbox: [49, 2, 52, 7],
    aliases: ["belgium", "belgien"]
  },
  Portugal: {
    code: "pt",
    bbox: [32, -32, 43, -6],
    aliases: ["portugal"]
  },
  Greece: {
    code: "gr",
    bbox: [34, 19, 42, 30],
    aliases: ["greece", "griechenland"]
  },
  Ireland: {
    code: "ie",
    bbox: [51, -11, 56, -5],
    aliases: ["ireland", "irland"]
  },
  Iceland: {
    code: "is",
    bbox: [63, -25, 67, -13],
    aliases: ["iceland", "island"]
  },
  Finland: {
    code: "fi",
    bbox: [59, 19, 71, 32],
    aliases: ["finland", "finnland"]
  },
  Hungary: {
    code: "hu",
    bbox: [45.5, 16, 49, 23],
    aliases: ["hungary", "ungarn"]
  },
  Romania: {
    code: "ro",
    bbox: [43, 20, 49, 30],
    aliases: ["romania", "rumaenien"]
  },
  Croatia: {
    code: "hr",
    bbox: [42, 13, 47, 20],
    aliases: ["croatia", "kroatien"]
  },
  Luxembourg: {
    code: "lu",
    bbox: [49, 5, 51, 7],
    aliases: ["luxembourg", "luxemburg"]
  },
  Malta: {
    code: "mt",
    bbox: [35, 14, 36.5, 15],
    aliases: ["malta"]
  },
  Liechtenstein: {
    code: "li",
    bbox: [47, 9, 48, 10],
    aliases: ["liechtenstein"]
  },
  Norway: {
    code: "no",
    bbox: [57, 4, 81, 32],
    aliases: ["norway", "norwegen"]
  }
};

const MANUAL_LOCATION_OVERRIDES = [
  {
    match: /pitz alpine glacier trail/i,
    city: "Mandarfen",
    country: "Austria",
    address:
      "Mandarfen, Sankt Leonhard im Pitztal, Tirol, Austria",
    latitude: "46.9686284",
    longitude: "10.8709246",
    note:
      "Manual QA correction: official Pitz Alpine Glacier Trail location is Mandarfen, Pitztal, Austria; previous Germany/Essen geocode was wrong."
  },
  {
    match: /gletschermarathon pitztal/i,
    city: "Sankt Leonhard im Pitztal",
    country: "Austria",
    address:
      "Mandarfen, Sankt Leonhard im Pitztal, Tirol, Austria",
    latitude: "46.9686284",
    longitude: "10.8709246",
    note:
      "Manual QA correction: Pitztal glacier marathon start area belongs to Mandarfen/St. Leonhard im Pitztal, Austria; previous Austria geocode pointed to the wrong St. Leonhard."
  },
  {
    match: /altra sunset wattenmeer/i,
    city: "Hamburg",
    country: "Germany",
    address:
      "St. Pauli Hafenstraße, Hamburg, Germany",
    latitude: "53.5462223",
    longitude: "9.967162",
    note:
      "Manual QA correction: event text names Hamburg/St. Pauli as start area; previous coordinates pointed far away from Hamburg."
  }
];

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv[3] || "data/events.location-fixed.csv",
    report:
      argv[4] ||
      "data/imports/review/location-consistency-report.json",
    cache:
      argv[5] ||
      "data/imports/geocoding-location-cache.json",
    keyFile:
      argv[6] ||
      "data/imports/private/geoapify-key.txt",
    limit: Number(argv[7] || 1200),
    concurrency: Number(argv[8] || 5)
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

function readCache(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch (_error) {
    return {};
  }
}

function normalize(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCountryRule(country) {
  const normalized =
    normalize(country);

  return Object.entries(COUNTRY_RULES)
    .find(([_name, rule]) =>
      rule.aliases.some(alias =>
        normalize(alias) === normalized
      )
    );
}

function parsePoint(event) {
  const latitude =
    parseCoordinate(event.latitude);

  const longitude =
    parseCoordinate(event.longitude);

  if (
    latitude === "" ||
    longitude === ""
  ) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude)
  };
}

function distanceKm(pointA, pointB) {
  if (!pointA || !pointB) {
    return Infinity;
  }

  const earthRadiusKm = 6371;
  const latA =
    pointA.latitude * Math.PI / 180;
  const latB =
    pointB.latitude * Math.PI / 180;
  const deltaLat =
    (pointB.latitude - pointA.latitude) * Math.PI / 180;
  const deltaLng =
    (pointB.longitude - pointA.longitude) * Math.PI / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) *
    Math.cos(latB) *
    Math.sin(deltaLng / 2) ** 2;

  return earthRadiusKm *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );
}

function isInside(point, rule) {
  if (!point || !rule) {
    return false;
  }

  const [
    minLat,
    minLng,
    maxLat,
    maxLng
  ] = rule.bbox;

  return (
    point.latitude >= minLat &&
    point.latitude <= maxLat &&
    point.longitude >= minLng &&
    point.longitude <= maxLng
  );
}

function cleanAddress(address, country) {
  const countryValue =
    cleanValue(country);

  let value =
    cleanValue(address);

  if (!value) {
    return "";
  }

  value = value
    .replace(new RegExp(`,\\s*${countryValue}\\s*,\\s*${countryValue}$`, "i"), `, ${countryValue}`)
    .replace(/,\s*Deutschland\s*,\s*Deutschland$/i, ", Germany")
    .replace(/,\s*Germany\s*,\s*Germany$/i, ", Germany")
    .replace(/,\s*Austria\s*,\s*Austria$/i, ", Austria");

  return cleanValue(value);
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
    normalize(address) === normalize(city) ||
    normalize(address) === normalize(`${city}, ${country}`)
  ) {
    return false;
  }

  return /\d|straße|strasse|str\.|weg|allee|platz|park|stadion|halle|arena|zentrum|center|see|ufer|brücke|bruecke|sportplatz|marktplatz|schloss|aue|trail|start|ziel|hafen|bahnhof|talstation/i
    .test(address);
}

function cityQuery(event) {
  return [
    event.city,
    event.country
  ]
    .map(cleanValue)
    .filter(Boolean)
    .join(", ");
}

function addressQuery(event) {
  const address =
    cleanAddress(event.address, event.country);

  const query =
    [
      address,
      event.city,
      event.country
    ]
      .map(cleanValue)
      .filter(Boolean)
      .join(", ");

  return query || cityQuery(event);
}

function cacheKey(query, countryCode) {
  return `${countryCode || "global"}|${normalize(query)}`;
}

async function geocode(query, countryCode, apiKey, cache, stats) {
  const key =
    cacheKey(query, countryCode);

  if (cache[key]) {
    return cache[key].not_found
      ? null
      : cache[key];
  }

  if (stats.requests >= stats.limit) {
    return null;
  }

  stats.requests += 1;

  const url =
    new URL("https://api.geoapify.com/v1/geocode/search");

  url.searchParams.set("text", query);
  if (countryCode) {
    url.searchParams.set("filter", `countrycode:${countryCode}`);
  }
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
    cache[key] = {
      query,
      not_found: true
    };
    return null;
  }

  const [longitude, latitude] =
    feature.geometry.coordinates;

  cache[key] = {
    query,
    latitude,
    longitude,
    formatted:
      cleanValue(feature.properties && feature.properties.formatted),
    country:
      cleanValue(feature.properties && feature.properties.country),
    city:
      cleanValue(feature.properties && (feature.properties.city || feature.properties.town || feature.properties.village))
  };

  return cache[key];
}

function toPoint(result) {
  if (!result) {
    return null;
  }

  return {
    latitude: Number(result.latitude),
    longitude: Number(result.longitude)
  };
}

function appendSourceNote(event, note) {
  if (
    cleanValue(event.source_note)
      .includes(note)
  ) {
    return;
  }

  event.source_note =
    cleanValue(
      `${event.source_note} ${note}`
    );
}

function applyOverride(event) {
  const override =
    MANUAL_LOCATION_OVERRIDES.find(item =>
      item.match.test(event.event_name)
    );

  if (!override) {
    return null;
  }

  const old = {
    city: event.city,
    country: event.country,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude
  };

  event.city =
    override.city;
  event.country =
    override.country;
  event.address =
    override.address;
  event.latitude =
    override.latitude;
  event.longitude =
    override.longitude;

  appendSourceNote(event, override.note);

  return {
    type: "manual_override",
    event_name: event.event_name,
    old,
    new: {
      city: event.city,
      country: event.country,
      address: event.address,
      latitude: event.latitude,
      longitude: event.longitude
    },
    note: override.note
  };
}

async function validateEvent(event, apiKey, cache, stats) {
  event.address =
    cleanAddress(event.address, event.country);

  const override =
    applyOverride(event);

  if (override) {
    return override;
  }

  const countryMatch =
    getCountryRule(event.country);

  if (!countryMatch) {
    return {
      type: "needs_review",
      event_name: event.event_name,
      reason: "Unknown country for bounded geocoding",
      city: event.city,
      country: event.country
    };
  }

  const [_countryName, rule] =
    countryMatch;

  const currentPoint =
    parsePoint(event);

  const cityResult =
    await geocode(
      cityQuery(event),
      rule.code,
      apiKey,
      cache,
      stats
    );

  const cityPoint =
    toPoint(cityResult);

  let addressResult = null;
  let addressPoint = null;

  if (hasPreciseAddress(event)) {
    addressResult =
      await geocode(
        addressQuery(event),
        rule.code,
        apiKey,
        cache,
        stats
      );

    addressPoint =
      toPoint(addressResult);
  }

  const issues = [];

  if (
    currentPoint &&
    !isInside(currentPoint, rule)
  ) {
    issues.push("coordinates_outside_country");
  }

  if (
    cityPoint &&
    currentPoint &&
    distanceKm(currentPoint, cityPoint) > 120
  ) {
    issues.push("coordinates_far_from_city");
  }

  if (
    cityPoint &&
    addressPoint &&
    distanceKm(addressPoint, cityPoint) > 90
  ) {
    issues.push("address_geocode_far_from_city");
  }

  let replacement = null;
  let replacementReason = "";

  if (
    addressPoint &&
    cityPoint &&
    distanceKm(addressPoint, cityPoint) <= 90
  ) {
    replacement =
      addressResult;
    replacementReason =
      "address";
  }

  if (
    replacement &&
    currentPoint &&
    distanceKm(
      currentPoint,
      toPoint(replacement)
    ) > 25
  ) {
    const old = {
      latitude: event.latitude,
      longitude: event.longitude,
      address: event.address
    };

    event.latitude =
      String(replacement.latitude);

    event.longitude =
      String(replacement.longitude);

    appendSourceNote(
      event,
      `Location QA: coordinates repaired using ${replacementReason} geocoding (${replacement.query}).`
    );

    return {
      type: "repaired",
      event_name: event.event_name,
      city: event.city,
      country: event.country,
      reason: issues.join(", ") || "precise address available",
      replacementReason,
      old,
      new: {
        latitude: event.latitude,
        longitude: event.longitude,
        formatted: replacement.formatted
      }
    };
  }

  if (issues.length) {
    return {
      type: "needs_review",
      event_name: event.event_name,
      city: event.city,
      country: event.country,
      reason: issues.join(", "),
      current: currentPoint,
      cityResult,
      addressResult
    };
  }

  return null;
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

  const cache =
    readCache(args.cache);

  const stats = {
    requests: 0,
    limit: args.limit
  };

  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < events.length) {
      const index =
        nextIndex;

      nextIndex += 1;

      const result =
        await validateEvent(
          events[index],
          apiKey,
          cache,
          stats
        );

      if (result) {
        results.push({
          row: index + 2,
          ...result
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
  writeJsonFile(args.cache, cache);

  const summary =
    results.reduce((counts, result) => {
      counts[result.type] =
        (counts[result.type] || 0) + 1;
      return counts;
    }, {});

  writeJsonFile(args.report, {
    generated_at: new Date().toISOString(),
    input: args.input,
    output: args.out,
    total_events: events.length,
    requests: stats.requests,
    summary,
    results
  });

  console.log(
    JSON.stringify(
      {
        total_events: events.length,
        requests: stats.requests,
        summary,
        output: args.out,
        report: args.report
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
