const path = require("path");

const {
  cleanValue,
  ensureDirectoryForFile,
  getValidationErrors,
  normalizeEvent,
  parseCsvFile,
  parseGermanDate,
  writeJsonFile
} = require("./event-table-utils");

const fs = require("fs");

const STAGING_COLUMNS = [
  "event_name",
  "sport",
  "distance",
  "distance_category",
  "date",
  "city",
  "country",
  "latitude",
  "longitude",
  "official_website",
  "registration_status",
  "source_url",
  "source_type",
  "review_status",
  "review_reason",
  "review_note",
  "last_checked",
  "import_batch"
];

const AGGREGATOR_DOMAINS = [
  "ahotu.com",
  "finishers.com",
  "laufrennen.de",
  "marathon.de",
  "racecheck.com",
  "runsignup.com",
  "worldsmarathons.com"
];

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    input: "",
    existing: "data/events.csv",
    geocodeCache: "data/imports/geoapify-geocoding-cache.json",
    out: "",
    report: "",
    batch: ""
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (!config.input && !arg.startsWith("--")) {
      config.input = arg;
      continue;
    }

    if (arg === "--existing") {
      config.existing = next;
      index += 1;
    } else if (arg === "--geocode-cache") {
      config.geocodeCache = next;
      index += 1;
    } else if (arg === "--out") {
      config.out = next;
      index += 1;
    } else if (arg === "--report") {
      config.report = next;
      index += 1;
    } else if (arg === "--batch") {
      config.batch = next;
      index += 1;
    }
  }

  if (!config.input) {
    throw new Error(
      "Usage: node tools/validate-event-batch.js data/imports/raw/my-batch.csv --batch germany-road-running-batch-01"
    );
  }

  const batchName =
    config.batch ||
    path.basename(config.input, path.extname(config.input));

  config.batch = batchName;
  config.out =
    config.out ||
    `data/imports/staging/${batchName}.staging.csv`;
  config.report =
    config.report ||
    `data/imports/review/${batchName}.review-report.json`;

  return config;
}

function normalizeText(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(generali|bmw|datev|mainova|tcs|nn|adac|sparkasse)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDateBucket(value) {
  const date = parseGermanDate(value);

  if (!date) {
    return "";
  }

  return Math.round(
    date.getTime() / (7 * 24 * 60 * 60 * 1000)
  );
}

function isPastDate(value) {
  const date = parseGermanDate(value);

  if (!date) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return date < today;
}

function isValidUrl(value) {
  try {
    const url = new URL(cleanValue(value));
    return ["http:", "https:"].includes(url.protocol);
  } catch (_error) {
    return false;
  }
}

function getHostname(value) {
  try {
    return new URL(cleanValue(value))
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
}

function isAggregatorUrl(value) {
  const hostname = getHostname(value);

  return AGGREGATOR_DOMAINS.some(domain =>
    hostname === domain ||
    hostname.endsWith(`.${domain}`)
  );
}

function deriveDistanceCategory(value) {
  const text =
    cleanValue(value)
      .toLowerCase()
      .replace(/,/g, ".")
      .replace(/\s+/g, " ");

  const categories =
    new Set();

  if (/70\.3|middle|mitteldistanz|halbdistanz/.test(text)) {
    categories.add("Middle Distance Triathlon");
  }

  if (/ironman|full distance|langdistanz/.test(text)) {
    categories.add("Full Distance Triathlon");
  }

  if (/olympic|olympisch|standard distance|kurzdistanz/.test(text)) {
    categories.add("Olympic Triathlon");
  }

  if (/sprint/.test(text)) {
    categories.add("Sprint Triathlon");
  }

  if (/\btriathlon\b/.test(text) && !categories.size) {
    categories.add("Triathlon");
  }

  if (/backyard/.test(text)) {
    categories.add("Backyard Ultra");
  }

  if (/\b24\s*(?:h|hour|stunden)\b/.test(text)) {
    categories.add("24h");
  }

  if (/\b12\s*(?:h|hour|stunden)\b/.test(text)) {
    categories.add("12h");
  }

  if (/half marathon|halbmarathon/.test(text)) {
    categories.add("Half Marathon");
  }

  const textWithoutHalf =
    text.replace(/half marathon|halbmarathon/g, " ");

  if (/\bmarathon\b|full marathon/.test(textWithoutHalf)) {
    categories.add("Marathon");
  }

  const kmMatches =
    text.matchAll(/(\d+(?:\.\d+)?)\s*(?:km|kilometer|k)\b/g);

  let sawNumericDistance =
    false;

  for (const match of kmMatches) {
    const km =
      Number(match[1]);

    if (!Number.isFinite(km)) {
      continue;
    }

    sawNumericDistance =
      true;

    if (km >= 4.5 && km <= 5.5) {
      categories.add("5K");
      continue;
    }

    if (km >= 9 && km <= 11) {
      categories.add("10K");
      continue;
    }

    if (km >= 20 && km <= 22.5) {
      categories.add("Half Marathon");
      continue;
    }

    if (km >= 40 && km <= 45) {
      categories.add("Marathon");
      continue;
    }

    if (km > 45) {
      categories.add("Ultra");
    }
  }

  const mileMatches =
    text.matchAll(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/g);

  for (const match of mileMatches) {
    const miles =
      Number(match[1]);

    if (!Number.isFinite(miles)) {
      continue;
    }

    sawNumericDistance =
      true;

    if (miles >= 3 && miles <= 3.5) {
      categories.add("5K");
      continue;
    }

    if (miles >= 6 && miles <= 6.5) {
      categories.add("10K");
      continue;
    }

    if (miles >= 12.8 && miles <= 13.4) {
      categories.add("Half Marathon");
      continue;
    }

    if (miles >= 25.5 && miles <= 27) {
      categories.add("Marathon");
      continue;
    }

    if (miles > 27) {
      categories.add("Ultra");
    }
  }

  if (/ultra|ultramarathon|trail/.test(text) && !categories.size) {
    categories.add("Ultra");
  }

  if (sawNumericDistance && !categories.size) {
    categories.add("Other Running");
  }

  return [...categories].join(", ");
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch (error) {
    console.warn(
      `Could not read geocode cache ${filePath}:`,
      error.message
    );
    return {};
  }
}

function getGeocodeCacheKey(row) {
  return [
    row.city,
    row.country
  ]
    .map(cleanValue)
    .filter(Boolean)
    .join(", ")
    .toLowerCase();
}

function hasCityCoordinateMismatch(row, geocodeCache) {
  const cacheEntry =
    geocodeCache[getGeocodeCacheKey(row)];

  if (!cacheEntry || !cacheEntry.formatted) {
    return false;
  }

  const cityTokens =
    normalizeText(row.city)
      .split(" ")
      .filter(token =>
        token.length >= 4
      );

  const formatted =
    normalizeText(cacheEntry.formatted);

  if (!cityTokens.length || !formatted) {
    return false;
  }

  return !cityTokens.some(token =>
    formatted.includes(token)
  );
}

function mapBatchRow(row, batchName) {
  const officialWebsite =
    cleanValue(
      row.official_website ||
      row.event_url ||
      row.url
    );

  const normalized =
    normalizeEvent(
      {
        ...row,
        event_url: officialWebsite,
        data_source:
          row.source_type === "official"
            ? "Official organizer website"
            : "Batch import staging",
        verification_status:
          row.registration_status ||
          "unclear",
        source_note:
          row.review_note ||
          row.review_reason ||
          ""
      },
      {}
    );

  const mapped = {
    event_name: normalized.event_name,
    sport: normalized.sport,
    distance: normalized.distance,
    distance_category:
      cleanValue(row.distance_category),
    date: normalized.date,
    city: normalized.city,
    country: normalized.country,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    official_website: officialWebsite,
    registration_status:
      cleanValue(row.registration_status) ||
      "unclear",
    source_url:
      cleanValue(row.source_url) ||
      officialWebsite,
    source_type:
      cleanValue(row.source_type) ||
      "unknown",
    review_status:
      cleanValue(row.review_status) ||
      "pending",
    review_reason:
      cleanValue(row.review_reason),
    review_note:
      cleanValue(row.review_note),
    last_checked:
      cleanValue(row.last_checked),
    import_batch:
      cleanValue(row.import_batch) ||
      batchName
  };

  mapped.distance_category =
    cleanValue(row.distance_category) ||
    deriveDistanceCategory(mapped.distance);

  return mapped;
}

function toPublicEvent(row) {
  return normalizeEvent({
    event_name: row.event_name,
    sport: row.sport,
    date: row.date,
    city: row.city,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    distance: row.distance,
    event_url: row.official_website,
    source_url: row.source_url,
    verification_status: row.registration_status,
    data_source:
      row.source_type === "official"
        ? "Official organizer website"
        : "Batch import staging",
    source_note: row.review_note
  });
}

function getDuplicateCandidate(row, existingEvents, currentBatchRows) {
  const website =
    getHostname(row.official_website);

  const name =
    normalizeText(row.event_name);

  const city =
    normalizeText(row.city);

  const country =
    normalizeText(row.country);

  const dateBucket =
    normalizeDateBucket(row.date);

  const candidates = [
    ...existingEvents,
    ...currentBatchRows
  ];

  return candidates.find(candidate => {
    const candidateWebsite =
      getHostname(
        candidate.event_url ||
        candidate.official_website
      );

    if (
      website &&
      candidateWebsite &&
      website === candidateWebsite
    ) {
      return true;
    }

    return (
      normalizeText(candidate.event_name) === name &&
      normalizeText(candidate.city) === city &&
      normalizeText(candidate.country) === country &&
      normalizeDateBucket(candidate.date) === dateBucket
    );
  });
}

function getReviewReasons(row, publicEvent, duplicateCandidate, geocodeCache) {
  const reasons = [];

  getValidationErrors(
    publicEvent,
    {
      requireCoordinates: true
    }
  ).forEach(reason => {
    reasons.push(
      reason
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
    );
  });

  if (!cleanValue(row.distance_category)) {
    reasons.push("missing_distance_category");
  }

  if (!cleanValue(row.official_website)) {
    reasons.push("missing_official_website");
  } else if (!isValidUrl(row.official_website)) {
    reasons.push("invalid_official_website");
  } else if (isAggregatorUrl(row.official_website)) {
    reasons.push("source_not_official");
  }

  if (isPastDate(row.date)) {
    reasons.push("date_outdated");
  }

  if (row.source_type !== "official") {
    reasons.push("source_type_not_official");
  }

  if (duplicateCandidate) {
    reasons.push("possible_duplicate");
  }

  if (hasCityCoordinateMismatch(row, geocodeCache)) {
    reasons.push("coordinates_city_mismatch");
  }

  return [...new Set(reasons)];
}

function escapeCsvValue(value) {
  const text = cleanValue(value);

  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function writeStagingCsv(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const lines = [
    STAGING_COLUMNS.join(";"),
    ...rows.map(row =>
      STAGING_COLUMNS
        .map(column =>
          escapeCsvValue(row[column])
        )
        .join(";")
    )
  ];

  fs.writeFileSync(
    filePath,
    `${lines.join("\n")}\n`,
    "utf8"
  );
}

function main() {
  const config = parseArgs();
  const rawRows = parseCsvFile(config.input);
  const geocodeCache = readJsonFile(config.geocodeCache);
  const existingEvents = fs.existsSync(config.existing)
    ? parseCsvFile(config.existing)
    : [];

  const stagedRows = [];
  const reportRows = [];
  const acceptedForDuplicateCheck = [];

  rawRows.forEach((rawRow, index) => {
    const row =
      mapBatchRow(rawRow, config.batch);

    const publicEvent =
      toPublicEvent(row);

    const duplicateCandidate =
      getDuplicateCandidate(
        row,
        existingEvents,
        acceptedForDuplicateCheck
      );

    const reviewReasons =
      getReviewReasons(
        row,
        publicEvent,
        duplicateCandidate,
        geocodeCache
      );

    row.review_reason =
      reviewReasons.join(",");

    row.review_status =
      reviewReasons.length
        ? "needs_review"
        : "pending";

    if (
      row.source_type === "official" &&
      row.last_checked === ""
    ) {
      row.last_checked =
        new Date().toISOString().slice(0, 10);
    }

    stagedRows.push(row);

    reportRows.push({
      row_number: index + 2,
      event_name: row.event_name,
      city: row.city,
      country: row.country,
      import_batch: row.import_batch,
      review_status: row.review_status,
      review_reason: row.review_reason,
      duplicate_of:
        duplicateCandidate?.event_name || "",
      official_website: row.official_website
    });

    if (!reviewReasons.includes("possible_duplicate")) {
      acceptedForDuplicateCheck.push(row);
    }
  });

  const summary = {
    batch: config.batch,
    total_rows: stagedRows.length,
    pending_rows:
      stagedRows.filter(row =>
        row.review_status === "pending"
      ).length,
    needs_review_rows:
      stagedRows.filter(row =>
        row.review_status === "needs_review"
      ).length,
    possible_duplicates:
      reportRows.filter(row =>
        row.review_reason.includes("possible_duplicate")
      ).length,
    missing_coordinates:
      reportRows.filter(row =>
        row.review_reason.includes("missing_coordinates")
      ).length,
    missing_official_website:
      reportRows.filter(row =>
        row.review_reason.includes("missing_official_website")
      ).length,
    date_outdated:
      reportRows.filter(row =>
        row.review_reason.includes("date_outdated")
      ).length,
    coordinates_city_mismatch:
      reportRows.filter(row =>
        row.review_reason.includes("coordinates_city_mismatch")
      ).length
  };

  writeStagingCsv(config.out, stagedRows);
  writeJsonFile(config.report, {
    summary,
    rows: reportRows
  });

  console.log(
    `Validated ${summary.total_rows} rows for ${config.batch}.`
  );
  console.log(
    `Pending: ${summary.pending_rows}, needs review: ${summary.needs_review_rows}, possible duplicates: ${summary.possible_duplicates}.`
  );
  console.log(`Staging CSV: ${config.out}`);
  console.log(`Review report: ${config.report}`);
}

main();
