const fs = require("fs");
const path = require("path");

const {
  COLUMNS,
  cleanValue,
  dedupeEvents,
  ensureDirectoryForFile,
  getValidationErrors,
  normalizeEvent,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const AGGREGATOR_DOMAINS = [
  "ahotu.com",
  "finishers.com",
  "laufkalender24.de",
  "laufrennen.de",
  "marathon.de",
  "racecheck.com",
  "runsignup.com",
  "worldsmarathons.com"
];

function parseArgs(argv) {
  const args = {
    input: "",
    events: "data/events.csv",
    out: "data/events.csv",
    reviewOut: "data/imports/review/promote-clean-review.csv",
    report: "data/imports/review/promote-clean-report.json",
    batch: ""
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (!args.input && !value.startsWith("--")) {
      args.input = value;
      continue;
    }

    if (value === "--events") {
      args.events = next;
      index += 1;
    } else if (value === "--out") {
      args.out = next;
      index += 1;
    } else if (value === "--review-out") {
      args.reviewOut = next;
      index += 1;
    } else if (value === "--report") {
      args.report = next;
      index += 1;
    } else if (value === "--batch") {
      args.batch = next;
      index += 1;
    }
  }

  if (!args.input) {
    throw new Error("Usage: node tools/promote-clean-staging-events.js data/imports/staging/my-batch.staging.csv");
  }

  return args;
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

function isOfficialUrl(value) {
  const hostname =
    getHostname(value);

  return Boolean(hostname) &&
    !AGGREGATOR_DOMAINS.some(domain =>
      hostname === domain ||
      hostname.endsWith(`.${domain}`)
    );
}

function isPastDate(value) {
  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(cleanValue(value));

  if (!match) {
    return true;
  }

  const date =
    new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return date < today;
}

function mapStagingToPublicEvent(row) {
  const eventUrl =
    cleanValue(row.official_website || row.event_url || row.source_url);

  return normalizeEvent({
    event_name:
      row.event_name,
    sport:
      row.sport,
    date:
      row.date,
    city:
      row.city,
    country:
      row.country,
    address:
      [row.address, row.city, row.country]
        .map(cleanValue)
        .filter(Boolean)
        .join(", "),
    latitude:
      row.latitude,
    longitude:
      row.longitude,
    distance:
      row.distance,
    description:
      row.description ||
      `Official endurance event in ${cleanValue(row.city)}. Imported from verified staging batch.`,
    event_url:
      eventUrl,
    data_source:
      "Official organizer website",
    source_url:
      cleanValue(row.source_url) || eventUrl,
    verification_status:
      cleanValue(row.registration_status) || "registration_open",
    priority:
      "medium",
    check_frequency:
      "monthly",
    last_checked:
      cleanValue(row.last_checked) ||
      new Date().toISOString().slice(0, 10),
    next_check:
      "",
    source_note:
      `Promoted from clean staging batch${row.import_batch ? ` ${cleanValue(row.import_batch)}` : ""}.`,
    image:
      ""
  });
}

function getPromotionIssues(row, event) {
  const issues = [];

  getValidationErrors(event, {
    requireCoordinates: true
  }).forEach(issue =>
    issues.push(issue)
  );

  if (cleanValue(row.review_reason)) {
    issues.push(`Review reason: ${cleanValue(row.review_reason)}`);
  }

  if (!isOfficialUrl(event.event_url)) {
    issues.push("Official website missing or aggregator URL");
  }

  if (isPastDate(event.date)) {
    issues.push("Date is outdated");
  }

  if (
    cleanValue(row.source_type) &&
    cleanValue(row.source_type) !== "official"
  ) {
    issues.push("Source type not official");
  }

  return [...new Set(issues)];
}

function getEventKey(event) {
  return [
    cleanValue(event.event_name).toLowerCase(),
    cleanValue(event.date),
    cleanValue(event.city).toLowerCase(),
    cleanValue(event.country).toLowerCase()
  ].join("|");
}

function main() {
  const args =
    parseArgs(process.argv);

  const existing =
    parseCsvFile(args.events)
      .map(row => normalizeEvent(row));

  const existingKeys =
    new Set(existing.map(getEventKey));

  const stagingRows =
    parseCsvFile(args.input);

  const promoted = [];
  const review = [];

  stagingRows.forEach(row => {
    const event =
      mapStagingToPublicEvent(row);

    const issues =
      getPromotionIssues(row, event);

    if (existingKeys.has(getEventKey(event))) {
      issues.push("Duplicate of existing event");
    }

    if (issues.length) {
      review.push({
        ...event,
        description:
          `Not promoted: ${issues.join(", ")}`
      });
      return;
    }

    promoted.push(event);
    existingKeys.add(getEventKey(event));
  });

  const merged =
    dedupeEvents([
      ...existing,
      ...promoted
    ]);

  ensureDirectoryForFile(args.out);
  writeCsvFile(args.out, merged);

  ensureDirectoryForFile(args.reviewOut);
  writeCsvFile(args.reviewOut, review);

  writeJsonFile(args.report, {
    batch:
      args.batch ||
      path.basename(args.input),
    input_rows:
      stagingRows.length,
    existing_before:
      existing.length,
    promoted:
      promoted.length,
    review:
      review.length,
    events_after:
      merged.length
  });

  console.log(`Promoted ${promoted.length} clean events.`);
  console.log(`Kept ${review.length} events in review.`);
  console.log(`Events before: ${existing.length}, after: ${merged.length}.`);
}

main();
