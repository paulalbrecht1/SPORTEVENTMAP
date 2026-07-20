const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  ensureDirectoryForFile,
  parseCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const DEFAULT_EVENTS = "data/events.csv";
const DEFAULT_CHECKLIST = "data/priority-events-checklist.json";
const DEFAULT_JSON_REPORT = "data/imports/review/priority-events-report.json";
const DEFAULT_CSV_REPORT = "data/imports/review/priority-events-report.csv";

const AGGREGATOR_DOMAINS = [
  "ahotu.com",
  "finishers.com",
  "kilometerliebe.de",
  "laufkalender.com",
  "laufkalender24.de",
  "laufrennen.de",
  "marathon.de",
  "racecheck.com",
  "runnersworld.de",
  "running.life",
  "worldsmarathons.com"
];

function parseArgs(argv) {
  const args = {
    events: DEFAULT_EVENTS,
    checklist: DEFAULT_CHECKLIST,
    json: DEFAULT_JSON_REPORT,
    csv: DEFAULT_CSV_REPORT
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--events") {
      args.events = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--checklist") {
      args.checklist = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--json") {
      args.json = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--csv") {
      args.csv = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function normalize(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalize(value)
    .split(/\s+/)
    .filter(token => token.length > 1);
}

function getHost(value) {
  try {
    return new URL(cleanValue(value)).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch (_error) {
    return "";
  }
}

function isSameOrSubdomain(host, expectedHost) {
  return Boolean(
    host &&
    expectedHost &&
    (host === expectedHost || host.endsWith(`.${expectedHost}`))
  );
}

function isAggregatorHost(host) {
  return AGGREGATOR_DOMAINS.some(domain =>
    host === domain || host.endsWith(`.${domain}`)
  );
}

function levenshtein(first, second) {
  const a = normalize(first);
  const b = normalize(second);

  if (a === b) {
    return 0;
  }

  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from(
    { length: b.length + 1 },
    (_, index) => index
  );

  const current = new Array(b.length + 1);

  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;

    for (let col = 1; col <= b.length; col += 1) {
      current[col] = Math.min(
        previous[col] + 1,
        current[col - 1] + 1,
        previous[col - 1] + (a[row - 1] === b[col - 1] ? 0 : 1)
      );
    }

    for (let col = 0; col <= b.length; col += 1) {
      previous[col] = current[col];
    }
  }

  return previous[b.length];
}

function similarity(first, second) {
  const a = normalize(first);
  const b = normalize(second);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  if (a.includes(b) || b.includes(a)) {
    return 0.9;
  }

  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

function tokenOverlap(first, second) {
  const firstTokens = new Set(tokenize(first));
  const secondTokens = new Set(tokenize(second));

  if (!firstTokens.size || !secondTokens.size) {
    return 0;
  }

  let overlap = 0;
  secondTokens.forEach(token => {
    if (firstTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap / Math.max(firstTokens.size, secondTokens.size);
}

function getBestNameScore(event, priorityEvent) {
  const aliases = [
    priorityEvent.official_name,
    ...(priorityEvent.expected_aliases || [])
  ];

  return Math.max(
    ...aliases.map(alias =>
      Math.max(
        similarity(event.event_name, alias),
        tokenOverlap(event.event_name, alias)
      )
    )
  );
}

function parseGermanDate(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(cleanValue(value));

  if (!match) {
    return null;
  }

  const date = new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );

  date.setHours(0, 0, 0, 0);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function hasWeakOrMissingDate(event) {
  const date = parseGermanDate(event.date);

  if (!date) {
    return true;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date < today;
}

function hasCityOnlyCoordinates(event) {
  const address = normalize(event.address);
  const city = normalize(event.city);

  if (!cleanValue(event.latitude) || !cleanValue(event.longitude)) {
    return true;
  }

  if (!address || address === city) {
    return true;
  }

  return !/\d|strasse|straße|road|street|weg|allee|platz|stadion|park|see|ufer|arena|halle|zentrum|center/.test(
    cleanValue(event.address).toLowerCase()
  );
}

function scoreCandidate(event, priorityEvent) {
  const eventHost = getHost(event.event_url);
  const expectedHost = getHost(priorityEvent.official_website);
  const nameScore = getBestNameScore(event, priorityEvent);
  const cityScore = Math.max(
    similarity(event.city, priorityEvent.city),
    tokenOverlap(event.city, priorityEvent.city)
  );
  const countryScore =
    normalize(event.country) === normalize(priorityEvent.country)
      ? 1
      : 0;
  const sportScore =
    normalize(`${event.sport} ${event.distance} ${event.event_name}`).includes(
      normalize(priorityEvent.sport_type).split(" ")[0] || ""
    )
      ? 1
      : 0.4;
  const websiteScore =
    isSameOrSubdomain(eventHost, expectedHost)
      ? 1
      : 0;

  const score = Math.round(
    nameScore * 48 +
    cityScore * 18 +
    countryScore * 14 +
    sportScore * 8 +
    websiteScore * 12
  );

  return {
    score,
    nameScore,
    cityScore,
    countryScore,
    sportScore,
    websiteScore,
    eventHost,
    expectedHost
  };
}

function getReviewFlags(match, priorityEvent) {
  if (!match) {
    return ["missing_priority_event"];
  }

  const flags = [];
  const event = match.event;

  if (!cleanValue(event.event_url)) {
    flags.push("missing_url");
  } else if (isAggregatorHost(match.eventHost)) {
    flags.push("weak_url_aggregator");
  } else if (
    match.expectedHost &&
    !isSameOrSubdomain(match.eventHost, match.expectedHost)
  ) {
    flags.push("official_website_mismatch");
  }

  if (hasWeakOrMissingDate(event)) {
    flags.push("missing_or_unclear_date");
  }

  if (hasCityOnlyCoordinates(event)) {
    flags.push("city_only_coordinates");
  }

  if (
    normalize(event.city) !== normalize(priorityEvent.city) &&
    match.cityScore < 0.72
  ) {
    flags.push("city_mismatch");
  }

  return flags;
}

function escapeCsv(value) {
  const text = cleanValue(value);

  if (/[;"\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function writeCsvReport(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const columns = [
    "category",
    "official_name",
    "exists_in_csv",
    "confidence",
    "matched_event",
    "matched_city",
    "matched_date",
    "event_url",
    "review_flags",
    "possible_matches",
    "notes"
  ];

  const lines = [
    columns.join(";"),
    ...rows.map(row =>
      columns
        .map(column => escapeCsv(row[column]))
        .join(";")
    )
  ];

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  const events = parseCsvFile(args.events);
  const checklist = JSON.parse(
    fs.readFileSync(path.resolve(args.checklist), "utf8")
  );

  const rows = checklist.map(priorityEvent => {
    const possibleMatches = events
      .map(event => ({
        event,
        ...scoreCandidate(event, priorityEvent)
      }))
      .filter(match => match.score >= 42)
      .sort((first, second) => second.score - first.score)
      .slice(0, 5);

    const best = possibleMatches[0] || null;
    const existsInCsv = Boolean(
      best &&
      (
        best.score >= 72 ||
        (best.websiteScore === 1 && best.cityScore >= 0.5)
      )
    );
    const selectedMatch = existsInCsv ? best : null;
    const reviewFlags = getReviewFlags(selectedMatch, priorityEvent);

    return {
      category: priorityEvent.category,
      official_name: priorityEvent.official_name,
      city: priorityEvent.city,
      country: priorityEvent.country,
      sport_type: priorityEvent.sport_type,
      expected_website: priorityEvent.official_website,
      exists_in_csv: existsInCsv,
      confidence: best ? best.score : 0,
      matched_event: selectedMatch ? selectedMatch.event.event_name : "",
      matched_city: selectedMatch ? selectedMatch.event.city : "",
      matched_date: selectedMatch ? selectedMatch.event.date : "",
      event_url: selectedMatch ? selectedMatch.event.event_url : "",
      review_flags: reviewFlags.join(", "),
      possible_matches: possibleMatches
        .map(match => `${match.event.event_name} (${match.score})`)
        .join(" | "),
      notes: priorityEvent.notes || ""
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    events_file: args.events,
    checklist_file: args.checklist,
    priority_events: checklist.length,
    found: rows.filter(row => row.exists_in_csv).length,
    missing: rows.filter(row => !row.exists_in_csv).length,
    weak_url: rows.filter(row => row.review_flags.includes("url")).length,
    missing_or_unclear_date: rows.filter(row =>
      row.review_flags.includes("missing_or_unclear_date")
    ).length,
    city_only_coordinates: rows.filter(row =>
      row.review_flags.includes("city_only_coordinates")
    ).length,
    rows
  };

  writeJsonFile(args.json, report);
  writeCsvReport(args.csv, rows);

  console.log(`Priority events checked: ${checklist.length}`);
  console.log(`Found in CSV: ${report.found}`);
  console.log(`Missing: ${report.missing}`);
  console.log(`Weak URL / URL mismatch: ${report.weak_url}`);
  console.log(`Missing or unclear date: ${report.missing_or_unclear_date}`);
  console.log(`City-only coordinates: ${report.city_only_coordinates}`);
  console.log(`JSON report: ${args.json}`);
  console.log(`CSV report: ${args.csv}`);
}

main();
