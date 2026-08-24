const fs = require("fs");
const path = require("path");

const {
  COLUMNS,
  cleanValue,
  ensureDirectoryForFile,
  getValidationErrors,
  normalizeCountryName,
  normalizeEvent,
  parseCsvFile,
  parseGermanDate,
  writeJsonFile
} = require("./event-table-utils");

const {
  canonicalKey,
  getEditionYear,
  legacyEventKey
} = require("./migrate-events-to-editions");

const ROOT = path.resolve(__dirname, "..");
const REVIEW_ROOT = path.join(ROOT, "data", "imports", "review");
const DEFAULT_LIMIT = 100;

const AGGREGATOR_DOMAINS = [
  "100-marathon-club.de",
  "ahotu.com",
  "finishers.com",
  "kilometerliebe.de",
  "laufkalender24.de",
  "laufrennen.de",
  "marathon.de",
  "racecheck.com",
  "runnersworld.de",
  "running-life.de",
  "runsignup.com",
  "worldsmarathons.com"
];

const REVIEW_COLUMNS = [
  "review_rank",
  "candidate_type",
  "recommended_route",
  "review_priority_score",
  "review_status",
  "review_reason",
  "existing_event_name",
  "existing_latest_edition_year",
  "candidate_canonical_key",
  "edition_year",
  "source_domain",
  "import_batch",
  ...COLUMNS
];

function parseArgs(argv) {
  const args = {
    input: "data/events.generated.csv",
    existing: "data/events.csv",
    archive: "data/event-editions-public.json",
    out: "data/imports/review/germany-expansion-review.csv",
    report: "data/imports/review/germany-expansion-report.json",
    limit: DEFAULT_LIMIT,
    type: "all",
    today: ""
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (value === "--input") {
      args.input = next;
      index += 1;
    } else if (value === "--existing") {
      args.existing = next;
      index += 1;
    } else if (value === "--archive") {
      args.archive = next;
      index += 1;
    } else if (value === "--out") {
      args.out = next;
      index += 1;
    } else if (value === "--report") {
      args.report = next;
      index += 1;
    } else if (value === "--limit") {
      args.limit = Number(next);
      index += 1;
    } else if (value === "--type") {
      args.type = next;
      index += 1;
    } else if (value === "--today") {
      args.today = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 500) {
    throw new Error("--limit must be an integer between 1 and 500");
  }

  if (!["all", "new-event", "new-edition"].includes(args.type)) {
    throw new Error("--type must be all, new-event or new-edition");
  }

  if (args.today && !/^\d{4}-\d{2}-\d{2}$/.test(args.today)) {
    throw new Error("--today must use YYYY-MM-DD");
  }

  return args;
}

function resolveProjectPath(filePath) {
  return path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(ROOT, filePath);
}

function isSafeReviewOutputPath(filePath) {
  const resolved = resolveProjectPath(filePath);
  return resolved.startsWith(`${REVIEW_ROOT}${path.sep}`);
}

function getReferenceDate(value = "") {
  const date = value
    ? new Date(`${value}T00:00:00`)
    : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid reference date");
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function formatLocalIsoDate(date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function normalizeUrl(value) {
  try {
    const url = new URL(cleanValue(value));
    url.hash = "";
    [
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
      "utm_term"
    ].forEach(parameter => url.searchParams.delete(parameter));
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch (_error) {
    return "";
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

function isOfficialLookingUrl(value) {
  const hostname = getHostname(value);

  if (!hostname) {
    return false;
  }

  return !AGGREGATOR_DOMAINS.some(domain =>
    hostname === domain ||
    hostname.endsWith(`.${domain}`)
  );
}

function escapeCsvValue(value) {
  const text = cleanValue(value);

  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function writeReviewCsv(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const lines = [
    REVIEW_COLUMNS.join(";"),
    ...rows.map(row =>
      REVIEW_COLUMNS
        .map(column => escapeCsvValue(row[column]))
        .join(";")
    )
  ];

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function isPreciseAddress(event) {
  const address = cleanValue(event.address).toLowerCase();
  const city = cleanValue(event.city).toLowerCase();
  const country = cleanValue(event.country).toLowerCase();

  return Boolean(address) &&
    address !== city &&
    address !== `${city}, ${country}` &&
    /\d|straße|strasse|weg|platz|allee|stadion|park|see|halle|arena/i.test(address);
}

function reviewPriorityScore(event, today) {
  let score = 30;
  const eventUrl = cleanValue(event.event_url);
  const sourceUrl = cleanValue(event.source_url);
  const eventHost = getHostname(eventUrl);
  const sourceHost = getHostname(sourceUrl);
  const eventDate = parseGermanDate(event.date);
  const lastChecked = Date.parse(cleanValue(event.last_checked));

  if (/^https:\/\//i.test(eventUrl)) score += 10;
  if (eventHost && sourceHost && eventHost === sourceHost) score += 10;
  if (cleanValue(event.description).length >= 80) score += 10;
  if (isPreciseAddress(event)) score += 10;
  if (cleanValue(event.priority).toLowerCase() === "high") score += 5;
  if (/official|organizer|veranstalter|federation|verband|dtu/i.test(cleanValue(event.data_source))) {
    score += 5;
  }

  if (Number.isFinite(lastChecked)) {
    const ageDays = Math.floor((today.getTime() - lastChecked) / 86400000);
    if (ageDays >= 0 && ageDays <= 120) score += 15;
    else if (ageDays >= 0 && ageDays <= 365) score += 5;
  }

  if (eventDate) {
    const daysUntilEvent = Math.floor((eventDate.getTime() - today.getTime()) / 86400000);
    if (daysUntilEvent >= 0 && daysUntilEvent <= 365) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

function editionKey(event) {
  return `${canonicalKey(event)}|${getEditionYear(event) || "unknown"}`;
}

function buildExistingIndex(existingRows, archiveRows) {
  const allRows = [...archiveRows, ...existingRows]
    .map(row => normalizeEvent(row));
  const series = new Map();
  const editions = new Set();
  const legacyKeys = new Set();
  const urlsByEdition = new Set();

  allRows.forEach(row => {
    const key = canonicalKey(row);
    const year = getEditionYear(row);
    const normalizedEventUrl = normalizeUrl(row.event_url || row.source_url);

    if (!key || !year) {
      return;
    }

    editions.add(`${key}|${year}`);
    legacyKeys.add(legacyEventKey(row));

    if (normalizedEventUrl) {
      urlsByEdition.add(`${normalizedEventUrl}|${year}`);
    }

    const current = series.get(key) || {
      canonical_key: key,
      event_name: row.event_name,
      latest_edition_year: 0,
      years: new Set()
    };

    current.years.add(year);

    if (year >= current.latest_edition_year) {
      current.event_name = row.event_name;
      current.latest_edition_year = year;
    }

    series.set(key, current);
  });

  return {
    editions,
    legacyKeys,
    series,
    urlsByEdition
  };
}

function candidateTypeMatches(candidateType, requestedType) {
  if (requestedType === "all") return true;
  if (requestedType === "new-event") return candidateType === "new_event";
  return candidateType === "new_edition";
}

function compareReviewRows(first, second) {
  if (first.review_priority_score !== second.review_priority_score) {
    return second.review_priority_score - first.review_priority_score;
  }

  const firstDate = parseGermanDate(first.date)?.getTime() || Number.MAX_SAFE_INTEGER;
  const secondDate = parseGermanDate(second.date)?.getTime() || Number.MAX_SAFE_INTEGER;

  if (firstDate !== secondDate) {
    return firstDate - secondDate;
  }

  return cleanValue(first.event_name).localeCompare(cleanValue(second.event_name), "de");
}

function buildExpansionReview(candidateRows, existingRows, archiveRows, options = {}) {
  const today = getReferenceDate(options.today || "");
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const requestedType = options.type || "all";
  const batch = options.batch ||
    `germany-expansion-${formatLocalIsoDate(today).replace(/-/g, "")}`;
  const existing = buildExistingIndex(existingRows, archiveRows);
  const selected = new Map();
  const excluded = {
    non_germany: 0,
    invalid_required_fields: 0,
    outdated_date: 0,
    aggregator_or_missing_official_url: 0,
    existing_edition: 0,
    duplicate_candidate_versions: 0,
    filtered_candidate_type: 0
  };

  candidateRows.forEach(rawRow => {
    const event = normalizeEvent(rawRow);

    if (normalizeCountryName(event.country) !== "Germany") {
      excluded.non_germany += 1;
      return;
    }

    const validationErrors = getValidationErrors(event, {
      requireCoordinates: true
    });

    if (validationErrors.length) {
      excluded.invalid_required_fields += 1;
      return;
    }

    const eventDate = parseGermanDate(event.date);

    if (!eventDate || eventDate < today) {
      excluded.outdated_date += 1;
      return;
    }

    if (!isOfficialLookingUrl(event.event_url || event.source_url)) {
      excluded.aggregator_or_missing_official_url += 1;
      return;
    }

    const key = canonicalKey(event);
    const year = getEditionYear(event);
    const normalizedEventUrl = normalizeUrl(event.event_url || event.source_url);

    if (
      existing.legacyKeys.has(legacyEventKey(event)) ||
      existing.editions.has(`${key}|${year}`) ||
      (normalizedEventUrl && existing.urlsByEdition.has(`${normalizedEventUrl}|${year}`))
    ) {
      excluded.existing_edition += 1;
      return;
    }

    const existingSeries = existing.series.get(key) || null;
    const candidateType = existingSeries
      ? "new_edition"
      : "new_event";

    if (!candidateTypeMatches(candidateType, requestedType)) {
      excluded.filtered_candidate_type += 1;
      return;
    }

    const score = reviewPriorityScore(event, today);
    const row = {
      review_rank: 0,
      candidate_type: candidateType,
      recommended_route: candidateType === "new_edition"
        ? "edition_succession_candidate_review"
        : "supabase_admin_event_review",
      review_priority_score: score,
      review_status: "needs_review",
      review_reason: candidateType === "new_edition"
        ? "manual_official_source_verification_required | possible_new_edition"
        : "manual_official_source_verification_required | possible_new_event_series",
      existing_event_name: existingSeries?.event_name || "",
      existing_latest_edition_year: existingSeries?.latest_edition_year || "",
      candidate_canonical_key: key,
      edition_year: year,
      source_domain: getHostname(event.event_url || event.source_url),
      import_batch: batch,
      ...event
    };

    const keyForCandidate = editionKey(event);
    const previous = selected.get(keyForCandidate);

    if (previous) {
      excluded.duplicate_candidate_versions += 1;

      if (compareReviewRows(row, previous) < 0) {
        selected.set(keyForCandidate, row);
      }

      return;
    }

    selected.set(keyForCandidate, row);
  });

  const eligibleRows = [...selected.values()]
    .sort(compareReviewRows);
  const queue = eligibleRows
    .slice(0, limit)
    .map((row, index) => ({
      ...row,
      review_rank: index + 1
    }));
  const byType = eligibleRows.reduce((counts, row) => {
    counts[row.candidate_type] = (counts[row.candidate_type] || 0) + 1;
    return counts;
  }, {});

  return {
    queue,
    report: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      reference_date: formatLocalIsoDate(today),
      country: "Germany",
      requested_type: requestedType,
      input_rows: candidateRows.length,
      existing_discovery_rows: existingRows.length,
      existing_archive_rows: archiveRows.length,
      eligible_unique_candidates: eligibleRows.length,
      queued_candidates: queue.length,
      remaining_after_queue: Math.max(0, eligibleRows.length - queue.length),
      by_candidate_type: byType,
      excluded,
      safety: {
        production_mutation: false,
        supabase_write: false,
        auto_publish: false,
        required_review_status: "needs_review"
      }
    }
  };
}

function readArchive(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload.editions)
      ? payload.editions
      : [];
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = resolveProjectPath(args.input);
  const existingPath = resolveProjectPath(args.existing);
  const archivePath = resolveProjectPath(args.archive);
  const outputPath = resolveProjectPath(args.out);
  const reportPath = resolveProjectPath(args.report);

  if (!fs.existsSync(inputPath)) {
    throw new Error(
      `${args.input} is missing. Run npm run build-events before creating the review queue.`
    );
  }

  if (!isSafeReviewOutputPath(outputPath) || !isSafeReviewOutputPath(reportPath)) {
    throw new Error("Review outputs must stay under data/imports/review/");
  }

  const result = buildExpansionReview(
    parseCsvFile(inputPath),
    parseCsvFile(existingPath),
    readArchive(archivePath),
    {
      limit: args.limit,
      type: args.type,
      today: args.today
    }
  );

  writeReviewCsv(outputPath, result.queue);
  writeJsonFile(reportPath, {
    ...result.report,
    source_file: path.relative(ROOT, inputPath).replaceAll("\\", "/"),
    review_csv: path.relative(ROOT, outputPath).replaceAll("\\", "/")
  });

  console.log(`Germany review queue: ${result.queue.length} candidate(s).`);
  console.log(
    `Eligible: ${result.report.eligible_unique_candidates}; ` +
    `new events: ${result.report.by_candidate_type.new_event || 0}; ` +
    `new editions: ${result.report.by_candidate_type.new_edition || 0}.`
  );
  console.log("No Supabase or public event data was changed.");
  console.log(`Review CSV: ${path.relative(ROOT, outputPath)}`);
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  AGGREGATOR_DOMAINS,
  REVIEW_COLUMNS,
  buildExpansionReview,
  formatLocalIsoDate,
  getHostname,
  isOfficialLookingUrl,
  isSafeReviewOutputPath,
  parseArgs,
  reviewPriorityScore,
  writeReviewCsv
};
