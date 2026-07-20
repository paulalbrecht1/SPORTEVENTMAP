const fs = require("fs");

const {
  cleanValue,
  parseCoordinate,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

function parseArgs(argv) {
  const args = {
    input: "data/events.csv",
    out: "data/events.coordinates-fixed.csv",
    reviewOut: "data/imports/review/events.coordinate-review.csv",
    report: "data/imports/review/events-coordinate-report.json",
    cache: "data/imports/geocoding-cache.json",
    cityThresholdKm: 60,
    addressThresholdKm: 60,
    limit: 250,
    delayMs: 1100
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value =
      argv[index];

    if (value === "--input") {
      args.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--out") {
      args.out = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--review-out") {
      args.reviewOut = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--report") {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--cache") {
      args.cache = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--city-threshold-km") {
      args.cityThresholdKm =
        Number(argv[index + 1] || args.cityThresholdKm);
      index += 1;
      continue;
    }

    if (value === "--address-threshold-km") {
      args.addressThresholdKm =
        Number(argv[index + 1] || args.addressThresholdKm);
      index += 1;
      continue;
    }

    if (value === "--limit") {
      args.limit =
        Number(argv[index + 1] || args.limit);
      index += 1;
      continue;
    }
  }

  return args;
}

function delay(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function readCache(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
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

function cacheKey(query) {
  return cleanValue(query)
    .toLowerCase();
}

function hasCoords(value) {
  return (
    parseCoordinate(value.latitude) !== "" &&
    parseCoordinate(value.longitude) !== ""
  );
}

function toPoint(value) {
  return {
    latitude: Number(parseCoordinate(value.latitude)),
    longitude: Number(parseCoordinate(value.longitude))
  };
}

function distanceKm(pointA, pointB) {
  const earthRadiusKm = 6371;
  const latA = pointA.latitude * Math.PI / 180;
  const latB = pointB.latitude * Math.PI / 180;
  const deltaLat =
    (pointB.latitude - pointA.latitude) * Math.PI / 180;
  const deltaLng =
    (pointB.longitude - pointA.longitude) * Math.PI / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) *
    Math.cos(latB) *
    Math.sin(deltaLng / 2) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function cityQuery(event) {
  const address =
    cleanValue(event.address);

  const stateMatch =
    /,\s*([A-Z]{2})\s*,\s*US$/i.exec(address);

  return [
    event.city,
    stateMatch
      ? stateMatch[1].toUpperCase()
      : "",
    event.country
  ]
    .map(cleanValue)
    .filter(Boolean)
    .join(", ");
}

function addressQuery(event) {
  const address =
    cleanValue(event.address);

  const city =
    cleanValue(event.city);

  const country =
    cleanValue(event.country);

  const cityCountry =
    [
      city,
      country
    ]
      .filter(Boolean)
      .join(", ");

  if (
    !address ||
    address.toLowerCase() === cityCountry.toLowerCase()
  ) {
    return cityCountry;
  }

  return [
    address,
    city,
    country
  ]
    .filter(Boolean)
    .join(", ");
}

async function geocode(query, cache, args, stats) {
  const key =
    cacheKey(query);

  const cached =
    cache[key];

  if (cached) {
    const latitude =
      parseCoordinate(cached.latitude);

    const longitude =
      parseCoordinate(cached.longitude);

    if (latitude !== "" && longitude !== "") {
      return {
        latitude: Number(latitude),
        longitude: Number(longitude),
        display_name: cached.display_name || cached.formatted || ""
      };
    }

    if (cached.not_found) {
      return null;
    }
  }

  if (stats.requests >= args.limit) {
    return null;
  }

  stats.requests += 1;

  const response =
    await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "SportsEventExplorer/1.0 coordinate validation"
        }
      }
    );

  if (!response.ok) {
    return null;
  }

  const data =
    await response.json();

  await delay(args.delayMs);

  if (!data.length) {
    cache[key] = {
      query,
      latitude: "",
      longitude: "",
      not_found: true,
      provider: "nominatim",
      updated_at: new Date().toISOString()
    };

    return null;
  }

  cache[key] = {
    query,
    latitude: data[0].lat,
    longitude: data[0].lon,
    display_name: cleanValue(data[0].display_name),
    provider: "nominatim",
    updated_at: new Date().toISOString()
  };

  return {
    latitude: Number(data[0].lat),
    longitude: Number(data[0].lon),
    display_name: cleanValue(data[0].display_name)
  };
}

async function main() {
  const args =
    parseArgs(process.argv);

  const events =
    parseCsvFile(args.input);

  const cache =
    readCache(args.cache);

  const stats = {
    checked: 0,
    repaired: 0,
    review: 0,
    requests: 0
  };

  const review = [];

  for (const event of events) {
    if (!hasCoords(event)) {
      continue;
    }

    const address =
      addressQuery(event);

    const city =
      cityQuery(event);

    if (!city && !address) {
      continue;
    }

    const currentPoint =
      toPoint(event);

    const addressPoint =
      address
        ? await geocode(
            address,
            cache,
            args,
            stats
          )
        : null;

    if (addressPoint) {
      stats.checked += 1;

      const addressDistance =
        distanceKm(
          currentPoint,
          addressPoint
        );

      if (addressDistance <= args.addressThresholdKm) {
        continue;
      }

      event.latitude =
        String(addressPoint.latitude);

      event.longitude =
        String(addressPoint.longitude);

      stats.repaired += 1;

      continue;
    }

    const cityPoint =
      await geocode(
        city,
        cache,
        args,
        stats
      );

    if (!cityPoint) {
      continue;
    }

    stats.checked += 1;

    const cityDistance =
      distanceKm(
        currentPoint,
        cityPoint
      );

    if (cityDistance <= args.cityThresholdKm) {
      continue;
    }

    review.push({
      ...event,
      description:
        `${event.description || ""} Coordinate review: pin is ${cityDistance.toFixed(1)} km from ${city}.`
    });

    stats.review += 1;
  }

  writeCsvFile(
    args.out,
    events
  );

  writeCsvFile(
    args.reviewOut,
    review
  );

  writeJsonFile(
    args.cache,
    cache
  );

  writeJsonFile(
    args.report,
    {
      generated_at: new Date().toISOString(),
      ...stats,
      input: args.input,
      output: args.out,
      review_output: args.reviewOut
    }
  );

  console.log(
    `Checked events: ${stats.checked}`
  );

  console.log(
    `Repaired coordinates: ${stats.repaired}`
  );

  console.log(
    `Needs review: ${stats.review}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
