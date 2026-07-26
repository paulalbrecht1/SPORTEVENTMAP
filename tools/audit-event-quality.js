const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  parseCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const ROOT = path.join(__dirname, "..");
const REQUIRED_FIELDS = [
  ["event_name", "event name"],
  ["sport", "sport"],
  ["date", "event date"],
  ["city", "city"],
  ["country", "country"],
  ["distance", "distance"],
  ["description", "description"],
  ["event_url", "registration or official event link"]
];
const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };
const STATUS_RANK = { complete: 0, review_required: 1, incomplete: 2 };

function parseArgs(argv) {
  const args = {
    input: "data/events.csv",
    out: "data/imports/review/event-quality-audit.csv",
    report: "data/imports/review/event-quality-audit-report.json"
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
    } else {
      positional.push(value);
    }
  }

  if (positional[0]) args.input = positional[0];
  if (positional[1]) args.out = positional[1];
  if (positional[2]) args.report = positional[2];

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

function parseGermanDate(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
    cleanValue(value)
  );

  if (!match) {
    return null;
  }

  const date = new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );

  if (
    date.getFullYear() !== Number(match[3]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[1])
  ) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function getHostname(value) {
  try {
    return new URL(cleanValue(value)).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch (_error) {
    return "";
  }
}

function validateHttpUrl(value) {
  try {
    const url = new URL(cleanValue(value));

    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname)
    );
  } catch (_error) {
    return false;
  }
}

function isLikelyAggregatorUrl(event) {
  const host = getHostname(event.event_url);

  return [
    "marathon.de",
    "laufrennen.de",
    "kilometerliebe.de",
    "transition.fun",
    "ahotu.com",
    "runsignup.com"
  ].some(domain =>
    host === domain ||
    host.endsWith(`.${domain}`)
  );
}

function isLikelyBlogUrl(event) {
  const url = cleanValue(event.event_url).toLowerCase();
  const host = getHostname(event.event_url);

  return (
    /\/blog|blogartikel|\/news|\/artikel|\/post|\/beitrag/.test(url) ||
    /blogspot\.|wordpress\.com|jimdosite\.com/.test(host)
  );
}

function isLikelyMultiStageEvent(event) {
  const titleAndLinks = [
    event.event_name,
    event.event_url,
    event.source_url
  ]
    .map(cleanValue)
    .join(" ")
    .toLowerCase();

  const description = cleanValue(event.description)
    .toLowerCase();

  return (
    /\betappe\b|\betappen\b|etappenlauf|stage race|multi[-\s]?stage|tour\s+festival|winterlaufserie/.test(titleAndLinks) ||
    /7\s+etappen|besteht aus\s+(vier|\d+)\s+l[aä]ufen|mehrt[aä]gig|etappenlauf|stage race|multi[-\s]?stage/.test(description)
  );
}

function hasCityOnlyAddress(event) {
  const address = cleanValue(event.address).toLowerCase();
  const city = cleanValue(event.city).toLowerCase();
  const country = cleanValue(event.country).toLowerCase();

  if (!address) {
    return true;
  }

  const compact = address
    .replace(/\s+/g, " ")
    .replace(/,\s*/g, ", ")
    .trim();

  if (
    compact === city ||
    compact === `${city}, ${country}`
  ) {
    return true;
  }

  return !/\d|straße|strasse|weg|allee|platz|park|stadion|see|halle|zentrum|arena|ufer|brücke|bruecke|gate|tor|denkmal|monument|memorial|castle|schloss/i.test(
    address
  );
}

function readCoordinates(event) {
  const latitudeText = cleanValue(event.latitude);
  const longitudeText = cleanValue(event.longitude);

  return {
    latitudeText,
    longitudeText,
    latitude: Number(latitudeText.replace(",", ".")),
    longitude: Number(longitudeText.replace(",", ".")),
    hasLatitude: Boolean(latitudeText),
    hasLongitude: Boolean(longitudeText)
  };
}

function hasValidCoordinates(event) {
  const coordinates = readCoordinates(event);

  return (
    coordinates.hasLatitude &&
    coordinates.hasLongitude &&
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180 &&
    !(
      coordinates.latitude === 0 &&
      coordinates.longitude === 0
    )
  );
}

function coordinateKey(event) {
  if (!hasValidCoordinates(event)) {
    return "";
  }

  const { latitude, longitude } =
    readCoordinates(event);

  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function normalizeDuplicatePart(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function duplicateKey(event) {
  const name = normalizeDuplicatePart(event.event_name);
  const date = cleanValue(event.date);
  const city = normalizeDuplicatePart(event.city);

  if (!name || !date || !city) {
    return "";
  }

  return `${name}|${date}|${city}`;
}

function expectedStatus(event, today) {
  const date = parseGermanDate(event.date);
  const content =
    `${event.description || ""} ${event.event_name || ""}`;

  if (date && date < today) {
    return "date_expected";
  }

  if (/cancelled|canceled|abgesagt/i.test(content)) {
    return "cancelled";
  }

  if (/sold\s*out|ausverkauft/i.test(content)) {
    return "sold_out";
  }

  if (
    /Live URL verification: official registration signal found/i.test(
      cleanValue(event.source_note)
    )
  ) {
    return "registration_open";
  }

  return "";
}

function createRow(event, index) {
  return {
    event_index: index + 1,
    quality_status: "complete",
    highest_severity: "",
    issue_count: 0,
    issue_types: [],
    issue_notes: [],
    event_name: cleanValue(event.event_name),
    date: cleanValue(event.date),
    city: cleanValue(event.city),
    country: cleanValue(event.country),
    sport: cleanValue(event.sport),
    distance: cleanValue(event.distance),
    verification_status:
      cleanValue(event.verification_status),
    priority: cleanValue(event.priority),
    event_url: cleanValue(event.event_url),
    source_url: cleanValue(event.source_url),
    address: cleanValue(event.address),
    latitude: cleanValue(event.latitude),
    longitude: cleanValue(event.longitude)
  };
}

function addIssue(row, issue) {
  row.issue_types.push(issue.type);
  row.issue_notes.push(issue.note);
  row.issue_count += 1;

  if (
    !row.highest_severity ||
    SEVERITY_RANK[issue.severity] >
      SEVERITY_RANK[row.highest_severity]
  ) {
    row.highest_severity = issue.severity;
  }

  const nextStatus = issue.incomplete
    ? "incomplete"
    : "review_required";

  if (
    STATUS_RANK[nextStatus] >
    STATUS_RANK[row.quality_status]
  ) {
    row.quality_status = nextStatus;
  }
}

function addCoreFieldIssues(row, event) {
  REQUIRED_FIELDS.forEach(([field, label]) => {
    if (!cleanValue(event[field])) {
      addIssue(row, {
        type: `missing_${field}`,
        severity: "high",
        incomplete: true,
        note: `Missing ${label}.`
      });
    }
  });

  const rawDate = cleanValue(event.date);

  if (rawDate && !parseGermanDate(rawDate)) {
    addIssue(row, {
      type: "invalid_date",
      severity: "high",
      incomplete: true,
      note:
        "Event date is invalid or does not use DD.MM.YYYY."
    });
  }

  const rawUrl = cleanValue(event.event_url);

  if (rawUrl && !validateHttpUrl(rawUrl)) {
    addIssue(row, {
      type: "invalid_event_url",
      severity: "high",
      incomplete: true,
      note:
        "Registration or official event link is not a valid HTTP(S) URL."
    });
  }

  const coordinates = readCoordinates(event);

  if (
    !coordinates.hasLatitude &&
    !coordinates.hasLongitude
  ) {
    addIssue(row, {
      type: "missing_coordinates",
      severity: "high",
      incomplete: true,
      note: "Latitude and longitude are missing."
    });
  } else if (
    !coordinates.hasLatitude ||
    !coordinates.hasLongitude
  ) {
    addIssue(row, {
      type: "incomplete_coordinates",
      severity: "high",
      incomplete: true,
      note:
        "Only one coordinate is present; latitude and longitude are both required."
    });
  } else if (!hasValidCoordinates(event)) {
    addIssue(row, {
      type: "invalid_coordinates",
      severity: "high",
      incomplete: true,
      note:
        "Coordinates are invalid, outside the valid range, or equal to 0/0."
    });
  }
}

function addReviewIssues(row, event, today) {
  const date = parseGermanDate(event.date);

  if (date && date < today) {
    addIssue(row, {
      type: "event_date_past",
      severity: "medium",
      note:
        "Event date is in the past and should be updated or archived."
    });
  }

  const description = cleanValue(event.description);

  if (description && description.length < 40) {
    addIssue(row, {
      type: "description_too_short",
      severity: "low",
      note: "Description contains fewer than 40 characters."
    });
  }

  if (
    cleanValue(event.event_url) &&
    isLikelyAggregatorUrl(event)
  ) {
    addIssue(row, {
      type: "non_official_url",
      severity: "high",
      note:
        "Event URL points to an aggregator instead of an official organizer page."
    });
  }

  if (
    cleanValue(event.event_url) &&
    isLikelyBlogUrl(event)
  ) {
    addIssue(row, {
      type: "blog_or_news_url",
      severity: "medium",
      note:
        "Event URL looks like a blog, news, or article page."
    });
  }

  if (isLikelyMultiStageEvent(event)) {
    addIssue(row, {
      type: "multi_stage_or_series_event",
      severity: "high",
      note:
        "Event looks like a stage race, race series, or multi-day tour."
    });
  }

  if (
    hasValidCoordinates(event) &&
    hasCityOnlyAddress(event)
  ) {
    addIssue(row, {
      type: "city_level_coordinates",
      severity: "medium",
      note:
        "Address has no precise venue or start-area signal."
    });
  }

  const expected = expectedStatus(event, today);
  const current = cleanValue(event.verification_status);

  if (expected && current && current !== expected) {
    addIssue(row, {
      type: "status_mismatch",
      severity: "medium",
      note:
        `Current status is ${current}; expected ${expected} from strong date or content signals.`
    });
  }
}

function auditEvents(events, options = {}) {
  const today = options.today
    ? new Date(options.today)
    : new Date();

  today.setHours(0, 0, 0, 0);

  const rows = events.map((event, index) => {
    const row = createRow(event, index);

    addCoreFieldIssues(row, event);
    addReviewIssues(row, event, today);

    return row;
  });

  const duplicateGroups = new Map();
  const coordinateGroups = new Map();

  events.forEach((event, index) => {
    const eventDuplicateKey = duplicateKey(event);
    const eventCoordinateKey = coordinateKey(event);

    if (eventDuplicateKey) {
      duplicateGroups.set(
        eventDuplicateKey,
        [
          ...(duplicateGroups.get(eventDuplicateKey) || []),
          index
        ]
      );
    }

    if (eventCoordinateKey) {
      coordinateGroups.set(
        eventCoordinateKey,
        [
          ...(coordinateGroups.get(eventCoordinateKey) || []),
          index
        ]
      );
    }
  });

  duplicateGroups.forEach(indexes => {
    if (indexes.length < 2) {
      return;
    }

    indexes.forEach(index => {
      addIssue(rows[index], {
        type: "possible_duplicate",
        severity: "high",
        note:
          `${indexes.length} events share normalized name, date, and city.`
      });
    });
  });

  coordinateGroups.forEach(indexes => {
    if (indexes.length < 3) {
      return;
    }

    indexes.forEach(index => {
      addIssue(rows[index], {
        type: "coordinate_stack",
        severity: "medium",
        note:
          `${indexes.length} events share the same coordinates.`
      });
    });
  });

  rows.forEach(row => {
    row.issue_types = row.issue_types.join(" | ");
    row.issue_notes = row.issue_notes.join(" | ");
  });

  rows.sort((first, second) => {
    const statusDifference =
      STATUS_RANK[second.quality_status] -
      STATUS_RANK[first.quality_status];

    if (statusDifference) {
      return statusDifference;
    }

    const severityDifference =
      (SEVERITY_RANK[second.highest_severity] || 0) -
      (SEVERITY_RANK[first.highest_severity] || 0);

    return (
      severityDifference ||
      second.issue_count - first.issue_count
    );
  });

  return rows;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "unknown";

    counts[value] = (counts[value] || 0) + 1;

    return counts;
  }, {});
}

function buildSummary(rows) {
  const issueCounts = {};

  rows.forEach(row => {
    cleanValue(row.issue_types)
      .split(" | ")
      .filter(Boolean)
      .forEach(type => {
        issueCounts[type] =
          (issueCounts[type] || 0) + 1;
      });
  });

  const statusCounts = {
    complete: 0,
    review_required: 0,
    incomplete: 0,
    ...countBy(rows, "quality_status")
  };

  const totalEvents = rows.length;
  const completeEvents = statusCounts.complete;
  const incompleteEvents = statusCounts.incomplete;
  const dataCompleteEvents =
    totalEvents - incompleteEvents;

  return {
    total_events: totalEvents,
    complete_events: completeEvents,
    review_required_events:
      statusCounts.review_required,
    incomplete_events: incompleteEvents,
    data_complete_events: dataCompleteEvents,
    problematic_events:
      totalEvents - completeEvents,
    completeness_percent: totalEvents
      ? Number(
          (
            (dataCompleteEvents / totalEvents) *
            100
          ).toFixed(1)
        )
      : 100,
    clean_percent: totalEvents
      ? Number(
          (
            (completeEvents / totalEvents) *
            100
          ).toFixed(1)
        )
      : 100,
    total_issues: rows.reduce(
      (sum, row) => sum + row.issue_count,
      0
    ),
    status_counts: statusCounts,
    severity_counts: {
      high: 0,
      medium: 0,
      low: 0,
      ...countBy(
        rows.filter(row => row.highest_severity),
        "highest_severity"
      )
    },
    issue_counts: Object.fromEntries(
      Object.entries(issueCounts)
        .sort(
          (first, second) =>
            second[1] - first[1]
        )
    )
  };
}

function writeAuditCsv(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const columns = [
    "quality_status",
    "highest_severity",
    "issue_count",
    "issue_types",
    "event_name",
    "date",
    "city",
    "country",
    "sport",
    "distance",
    "verification_status",
    "priority",
    "event_url",
    "source_url",
    "address",
    "latitude",
    "longitude",
    "issue_notes"
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

function runAudit(args) {
  const inputPath = resolveProjectPath(args.input);
  const outputPath = resolveProjectPath(args.out);
  const reportPath = resolveProjectPath(args.report);
  const events = parseCsvFile(inputPath);
  const rows = auditEvents(events);
  const summary = buildSummary(rows);

  writeAuditCsv(outputPath, rows);
  writeJsonFile(reportPath, {
    generated_at: new Date().toISOString(),
    input: path.relative(ROOT, inputPath),
    ...summary,
    output: path.relative(ROOT, outputPath)
  });

  return {
    rows,
    summary,
    outputPath,
    reportPath
  };
}

function main() {
  const result = runAudit(parseArgs(process.argv));

  console.log(
    `Events checked: ${result.summary.total_events}`
  );
  console.log(
    `Complete: ${result.summary.status_counts.complete}`
  );
  console.log(
    `Review required: ${result.summary.status_counts.review_required}`
  );
  console.log(
    `Incomplete: ${result.summary.status_counts.incomplete}`
  );
  console.log(
    `Quality issues: ${result.summary.total_issues}`
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
  auditEvents,
  buildSummary,
  duplicateKey,
  hasValidCoordinates,
  parseArgs,
  parseGermanDate,
  runAudit,
  validateHttpUrl,
  writeAuditCsv
};
