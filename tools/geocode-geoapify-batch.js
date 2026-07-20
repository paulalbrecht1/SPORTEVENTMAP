const {
  cleanValue,
  parseCoordinate,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const fs = require("fs");

function parseArgs(argv) {
  const args = {
    input: "data/events.csv",
    out: "data/events.geoapify.csv",
    cache: "data/imports/geoapify-geocoding-cache.json",
    keyFile: "data/imports/private/geoapify-key.txt",
    limit: 1000,
    pollIntervalMs: 5000,
    maxPolls: 60,
    lang: "de"
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value =
      argv[index];

    if (value === "--input") {
      args.input =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--out") {
      args.out =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--cache") {
      args.cache =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--key-file") {
      args.keyFile =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--limit") {
      args.limit =
        Number(argv[index + 1] || args.limit);
      index += 1;
      continue;
    }

    if (value === "--poll-interval-ms") {
      args.pollIntervalMs =
        Number(argv[index + 1] || args.pollIntervalMs);
      index += 1;
      continue;
    }

    if (value === "--max-polls") {
      args.maxPolls =
        Number(argv[index + 1] || args.maxPolls);
      index += 1;
      continue;
    }

    if (value === "--lang") {
      args.lang =
        cleanValue(argv[index + 1]) || args.lang;
      index += 1;
      continue;
    }
  }

  return args;
}

function readApiKey(args) {
  const envKey =
    cleanValue(process.env.GEOAPIFY_API_KEY);

  if (envKey) {
    return envKey;
  }

  if (
    args.keyFile &&
    fs.existsSync(args.keyFile)
  ) {
    return cleanValue(
      fs.readFileSync(args.keyFile, "utf8")
    );
  }

  return "";
}

function readCache(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function delay(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function hasCoordinates(event) {
  return (
    parseCoordinate(event.latitude) !== "" &&
    parseCoordinate(event.longitude) !== ""
  );
}

function getQuery(event) {
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

function getCacheKey(query) {
  return cleanValue(query)
    .toLowerCase();
}

async function createBatchJob(addresses, args, apiKey) {
  const url =
    new URL(
      "https://api.geoapify.com/v1/batch/geocode/search"
    );

  url.searchParams.set(
    "apiKey",
    apiKey
  );

  url.searchParams.set(
    "lang",
    args.lang
  );

  const response =
    await fetch(
      url.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(addresses)
      }
    );

  if (!response.ok) {
    throw new Error(
      `Geoapify batch request failed: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

async function getBatchResults(jobId, args, apiKey) {
  const url =
    new URL(
      "https://api.geoapify.com/v1/batch/geocode/search"
    );

  url.searchParams.set(
    "id",
    jobId
  );

  url.searchParams.set(
    "apiKey",
    apiKey
  );

  for (let attempt = 0; attempt < args.maxPolls; attempt += 1) {
    const response =
      await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 404) {
        console.log("Geoapify batch status: not ready");
        await delay(args.pollIntervalMs);
        continue;
      }

      throw new Error(
        `Geoapify result request failed: ${response.status} ${await response.text()}`
      );
    }

    const data =
      await response.json();

    if (Array.isArray(data)) {
      return data;
    }

    console.log(
      `Geoapify batch status: ${data.status || "pending"}`
    );

    await delay(args.pollIntervalMs);
  }

  throw new Error(
    "Geoapify batch job did not finish before max polls."
  );
}

async function main() {
  const args =
    parseArgs(process.argv);

  const apiKey =
    readApiKey(args);

  if (!apiKey) {
    throw new Error(
      `Set GEOAPIFY_API_KEY or paste the key into ${args.keyFile}.`
    );
  }

  const events =
    parseCsvFile(args.input);

  const cache =
    readCache(args.cache);

  const missing =
    events
      .map((event, index) => ({
        event,
        index,
        query: getQuery(event)
      }))
      .filter(item =>
        !hasCoordinates(item.event) &&
        item.query
      );

  missing.forEach(item => {
    const cached =
      cache[getCacheKey(item.query)];

    if (
      cached &&
      cached.latitude &&
      cached.longitude
    ) {
      item.event.latitude =
        cached.latitude;

      item.event.longitude =
        cached.longitude;
    }
  });

  const toGeocode =
    missing
      .filter(item =>
        !hasCoordinates(item.event)
      )
      .slice(0, args.limit);

  if (!toGeocode.length) {
    writeCsvFile(
      args.out,
      events
    );

    console.log(
      "No missing coordinates to geocode."
    );

    return;
  }

  const addresses =
    toGeocode.map(item =>
      item.query
    );

  console.log(
    `Submitting ${addresses.length} addresses to Geoapify batch geocoding.`
  );

  const job =
    await createBatchJob(
      addresses,
      args,
      apiKey
    );

  const results =
    await getBatchResults(
      job.id,
      args,
      apiKey
    );

  results.forEach((result, index) => {
    const item =
      toGeocode[index];

    if (
      !item ||
      !Number.isFinite(Number(result.lat)) ||
      !Number.isFinite(Number(result.lon))
    ) {
      return;
    }

    item.event.latitude =
      result.lat;

    item.event.longitude =
      result.lon;

    cache[getCacheKey(item.query)] = {
      query: item.query,
      latitude: result.lat,
      longitude: result.lon,
      formatted: cleanValue(result.formatted),
      provider: "geoapify",
      updated_at: new Date().toISOString()
    };
  });

  writeJsonFile(
    args.cache,
    cache
  );

  writeCsvFile(
    args.out,
    events
  );

  console.log(
    `Wrote geocoded CSV: ${args.out}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
