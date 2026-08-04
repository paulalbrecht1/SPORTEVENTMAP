const fs = require("fs");
const path = require("path");

const {
  COLUMNS,
  cleanValue,
  parseCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const {
  auditEvents,
  parseGermanDate
} = require("./audit-event-quality");

const ROOT = path.join(__dirname, "..");
const DEFAULT_LIMIT = 100;

const STATUS_WEIGHT = {
  incomplete: 0,
  review_required: 1,
  complete: 2
};

const PRIORITY_WEIGHT = {
  high: 0,
  medium: 1,
  low: 2
};

const ISSUE_WEIGHT = {
  possible_duplicate: 0,
  missing_event_name: 1,
  missing_date: 1,
  invalid_date: 1,
  missing_event_url: 2,
  invalid_event_url: 2,
  missing_coordinates: 3,
  incomplete_coordinates: 3,
  invalid_coordinates: 3,
  missing_city: 4,
  missing_country: 4,
  missing_sport: 5,
  missing_distance: 5,
  missing_description: 6,
  non_official_url: 7,
  blog_or_news_url: 8,
  status_mismatch: 9,
  event_date_past: 10,
  city_level_coordinates: 11,
  coordinate_stack: 12,
  description_too_short: 13,
  multi_stage_or_series_event: 14
};

function parseArgs(argv) {
  const args = {
    input: "data/events.csv",
    out:
      "data/imports/review/event-quality-top-100.csv",
    report:
      "data/imports/review/event-quality-top-100-report.json",
    limit: DEFAULT_LIMIT,
    country: "Germany"
  };
  const positional = [];

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--input") {
      args.input = argv[index + 1] || args.input;
      index += 1;
    } else if (value === "--csv" || value === "--out") {
      args.out = argv[index + 1] || args.out;
      index += 1;
    } else if (value === "--json" || value === "--report") {
      args.report = argv[index + 1] || args.report;
      index += 1;
    } else if (value === "--limit") {
      args.limit =
        Math.max(1, Number(argv[index + 1]) || DEFAULT_LIMIT);
      index += 1;
    } else if (value === "--country") {
      args.country = argv[index + 1] || args.country;
      index += 1;
    } else {
      positional.push(value);
    }
  }

  if (positional[0]) args.input = positional[0];
  if (positional[1]) args.out = positional[1];
  if (positional[2]) args.report = positional[2];
  if (positional[3]) {
    args.limit =
      Math.max(1, Number(positional[3]) || DEFAULT_LIMIT);
  }

  return args;
}

function resolveProjectPath(filePath) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(ROOT, filePath);
}

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });
}

function escapeCsv(value) {
  const text = cleanValue(value);

  if (
    text.includes(";") ||
    text.includes("\"") ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function splitIssues(value) {
  return cleanValue(value)
    .split(" | ")
    .map(cleanValue)
    .filter(Boolean);
}

function normalizedCountry(value) {
  const country = cleanValue(value)
    .toLowerCase();

  if (
    country === "deutschland" ||
    country === "de"
  ) {
    return "germany";
  }

  return country;
}

function matchesCountry(event, countryFilter) {
  const requested =
    normalizedCountry(countryFilter);

  if (!requested || requested === "all") {
    return true;
  }

  return normalizedCountry(event.country) === requested;
}

function getPriorityWeight(value) {
  return PRIORITY_WEIGHT[
    cleanValue(value).toLowerCase()
  ] ?? 3;
}

function getIssueWeight(issueTypes) {
  const weights = splitIssues(issueTypes)
    .map(type => ISSUE_WEIGHT[type] ?? 50);

  return weights.length
    ? Math.min(...weights)
    : 99;
}

function getDateState(value, today) {
  const date = parseGermanDate(value);

  if (!date) {
    return {
      weight: 1,
      timestamp: Number.MAX_SAFE_INTEGER,
      isPast: false
    };
  }

  if (date < today) {
    return {
      weight: 2,
      timestamp: date.getTime(),
      isPast: true
    };
  }

  return {
    weight: 0,
    timestamp: date.getTime(),
    isPast: false
  };
}

function getRecommendedAction(issueTypes) {
  const issues = new Set(
    splitIssues(issueTypes)
  );

  if (issues.has("possible_duplicate")) {
    return "Compare the candidate records and keep one verified event entry.";
  }

  if (
    [...issues].some(issue =>
      issue.startsWith("missing_") ||
      [
        "invalid_date",
        "invalid_event_url",
        "invalid_coordinates",
        "incomplete_coordinates"
      ].includes(issue)
    )
  ) {
    return "Research the official source and complete or correct the blocking fields.";
  }

  if (
    issues.has("non_official_url") ||
    issues.has("blog_or_news_url")
  ) {
    return "Replace the link with the official organizer or registration page.";
  }

  if (
    issues.has("event_date_past") ||
    issues.has("status_mismatch")
  ) {
    return "Verify the next edition and update the date and registration status.";
  }

  if (
    issues.has("city_level_coordinates") ||
    issues.has("coordinate_stack")
  ) {
    return "Research the precise start or venue address and geocode it after review.";
  }

  if (issues.has("description_too_short")) {
    return "Expand the description using verified facts from the official source.";
  }

  if (issues.has("multi_stage_or_series_event")) {
    return "Confirm whether this belongs on the public map as one event entry.";
  }

  return "Review the listed quality signals against the official source.";
}

function compareCandidates(first, second, today) {
  const statusDifference =
    (STATUS_WEIGHT[first.quality_status] ?? 9) -
    (STATUS_WEIGHT[second.quality_status] ?? 9);

  if (statusDifference) {
    return statusDifference;
  }

  const firstDate =
    getDateState(first.date, today);

  const secondDate =
    getDateState(second.date, today);

  if (firstDate.weight !== secondDate.weight) {
    return firstDate.weight - secondDate.weight;
  }

  const priorityDifference =
    getPriorityWeight(first.priority) -
    getPriorityWeight(second.priority);

  if (priorityDifference) {
    return priorityDifference;
  }

  const issueDifference =
    getIssueWeight(first.issue_types) -
    getIssueWeight(second.issue_types);

  if (issueDifference) {
    return issueDifference;
  }

  if (firstDate.timestamp !== secondDate.timestamp) {
    return firstDate.isPast
      ? secondDate.timestamp - firstDate.timestamp
      : firstDate.timestamp - secondDate.timestamp;
  }

  return cleanValue(first.event_name)
    .localeCompare(
      cleanValue(second.event_name),
      "de"
    );
}

function buildReviewQueue(events, options = {}) {
  const today = options.today
    ? new Date(options.today)
    : new Date();

  today.setHours(0, 0, 0, 0);

  const limit =
    Math.max(
      1,
      Number(options.limit) || DEFAULT_LIMIT
    );

  const country =
    options.country === undefined
      ? "Germany"
      : options.country;

  const qualityRows =
    auditEvents(events, { today });

  return qualityRows
    .filter(row =>
      row.quality_status !== "complete" &&
      matchesCountry(row, country)
    )
    .map(row => {
      const original =
        events[row.event_index - 1] || {};

      return {
        ...original,
        review_rank: 0,
        quality_status: row.quality_status,
        highest_severity: row.highest_severity,
        issue_count: row.issue_count,
        review_reason: row.issue_types,
        recommended_action:
          getRecommendedAction(row.issue_types)
      };
    })
    .sort((first, second) =>
      compareCandidates(first, second, today)
    )
    .slice(0, limit)
    .map((row, index) => ({
      ...row,
      review_rank: index + 1
    }));
}

function countIssues(rows) {
  const counts = {};

  rows.forEach(row => {
    splitIssues(row.review_reason)
      .forEach(issue => {
        counts[issue] =
          (counts[issue] || 0) + 1;
      });
  });

  return Object.fromEntries(
    Object.entries(counts)
      .sort(
        (first, second) =>
          second[1] - first[1]
      )
  );
}

function countValues(rows, field) {
  return rows.reduce((counts, row) => {
    const value = cleanValue(row[field]) || "unknown";

    counts[value] =
      (counts[value] || 0) + 1;

    return counts;
  }, {});
}

function buildReport(events, queue, options = {}) {
  const today = options.today
    ? new Date(options.today)
    : new Date();

  today.setHours(0, 0, 0, 0);

  const country =
    options.country === undefined
      ? "Germany"
      : options.country;

  const allProblematic =
    auditEvents(events, { today })
      .filter(row =>
        row.quality_status !== "complete" &&
        matchesCountry(row, country)
      );

  return {
    total_events: events.length,
    country_filter: country || "all",
    eligible_problematic_events:
      allProblematic.length,
    queued_events: queue.length,
    remaining_after_queue:
      Math.max(0, allProblematic.length - queue.length),
    upcoming_events:
      queue.filter(row => {
        const date = parseGermanDate(row.date);
        return date && date >= today;
      }).length,
    past_events:
      queue.filter(row => {
        const date = parseGermanDate(row.date);
        return date && date < today;
      }).length,
    by_quality_status:
      countValues(queue, "quality_status"),
    by_priority:
      countValues(queue, "priority"),
    by_reason:
      countIssues(queue)
  };
}

function writeReviewCsv(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const reviewColumns = [
    "review_rank",
    "quality_status",
    "highest_severity",
    "issue_count",
    "review_reason",
    "recommended_action"
  ];

  const columns = [
    ...reviewColumns,
    ...COLUMNS.filter(column =>
      !reviewColumns.includes(column)
    )
  ];

  const lines = [
    columns.join(";"),
    ...rows.map(row =>
      columns
        .map(column => escapeCsv(row[column]))
        .join(";")
    )
  ];

  fs.writeFileSync(
    filePath,
    `${lines.join("\n")}\n`,
    "utf8"
  );
}

function runQueue(args) {
  const inputPath =
    resolveProjectPath(args.input);

  const outputPath =
    resolveProjectPath(args.out);

  const reportPath =
    resolveProjectPath(args.report);

  const events =
    parseCsvFile(inputPath);

  const queue =
    buildReviewQueue(events, {
      limit: args.limit,
      country: args.country
    });

  const summary =
    buildReport(events, queue, {
      country: args.country
    });

  writeReviewCsv(outputPath, queue);

  writeJsonFile(reportPath, {
    generated_at: new Date().toISOString(),
    input:
      path.relative(ROOT, inputPath),
    output:
      path.relative(ROOT, outputPath),
    limit: args.limit,
    ...summary
  });

  return {
    queue,
    summary,
    outputPath,
    reportPath
  };
}

function main() {
  const result =
    runQueue(parseArgs(process.argv));

  console.log(
    `Review queue: ${result.summary.queued_events}/${result.summary.eligible_problematic_events} eligible events`
  );
  console.log(
    `Upcoming: ${result.summary.upcoming_events}`
  );
  console.log(
    `Past: ${result.summary.past_events}`
  );
  console.log(
    `CSV: ${path.relative(ROOT, result.outputPath)}`
  );
  console.log(
    `JSON: ${path.relative(ROOT, result.reportPath)}`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  buildReport,
  buildReviewQueue,
  compareCandidates,
  getRecommendedAction,
  matchesCountry,
  parseArgs,
  runQueue,
  splitIssues,
  writeReviewCsv
};