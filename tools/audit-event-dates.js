const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  parseCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const ROOT = path.join(__dirname, "..");
const DEFAULT_INPUT = "data/events.csv";
const DEFAULT_JSON = "reports/event-date-audit.json";
const DEFAULT_CSV = "reports/event-date-audit.csv";
const DEFAULT_MD = "reports/event-date-audit.md";

const SEVERITY_RANK = {
  clean: 0,
  info: 1,
  warning: 2,
  critical: 3
};

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    json: DEFAULT_JSON,
    csv: DEFAULT_CSV,
    md: DEFAULT_MD
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--input") {
      args.input = argv[index + 1] || args.input;
      index += 1;
      continue;
    }

    if (value === "--json") {
      args.json = argv[index + 1] || args.json;
      index += 1;
      continue;
    }

    if (value === "--csv") {
      args.csv = argv[index + 1] || args.csv;
      index += 1;
      continue;
    }

    if (value === "--md") {
      args.md = argv[index + 1] || args.md;
      index += 1;
    }
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

function writeCsv(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const columns = [
    "severity",
    "event_name",
    "event_id",
    "city",
    "country",
    "current_date",
    "issues",
    "reason",
    "recommended_action"
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

function writeMarkdown(filePath, report) {
  ensureDirectoryForFile(filePath);

  const lines = [
    "# Event Date Audit",
    "",
    `Generated: ${report.generated_at}`,
    `Input: ${report.input}`,
    `Events checked: ${report.total_events}`,
    "",
    "## Summary",
    "",
    `- Critical: ${report.summary.critical}`,
    `- Warning: ${report.summary.warning}`,
    `- Info: ${report.summary.info}`,
    `- Clean: ${report.summary.clean}`,
    "",
    "## Review Queue",
    ""
  ];

  report.events
    .filter(row => row.severity !== "clean")
    .slice(0, 200)
    .forEach(row => {
      lines.push(
        `### ${row.event_name || "Unnamed event"}`,
        "",
        `- Severity: ${row.severity}`,
        `- Event ID: ${row.event_id}`,
        `- Location: ${[row.city, row.country].filter(Boolean).join(", ")}`,
        `- Current date: ${row.current_date || "missing"}`,
        `- Issues: ${row.issues.join(", ")}`,
        `- Recommended action: ${row.recommended_action}`,
        ""
      );
    });

  if (report.events.filter(row => row.severity !== "clean").length > 200) {
    lines.push(
      "_Only the first 200 review items are shown here. Use the JSON or CSV report for the full queue._",
      ""
    );
  }

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function slugify(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function eventId(event) {
  return [
    event.slug,
    event.event_slug,
    event.id,
    slugify([event.event_name, event.city, event.date].join(" "))
  ]
    .map(cleanValue)
    .find(Boolean);
}

function normalizeText(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function daysBetween(firstDate, secondDate) {
  return Math.round(
    (secondDate.getTime() - firstDate.getTime()) / 86400000
  );
}

function makeDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseFlexibleDate(value) {
  const raw = cleanValue(value);

  if (!raw) {
    return {
      date: null,
      format: "",
      exact: false
    };
  }

  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (german) {
    return {
      date: makeDate(Number(german[3]), Number(german[2]), Number(german[1])),
      format: "DD.MM.YYYY",
      exact: true
    };
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (iso) {
    return {
      date: makeDate(Number(iso[1]), Number(iso[2]), Number(iso[3])),
      format: "YYYY-MM-DD",
      exact: true
    };
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slash) {
    return {
      date: makeDate(Number(slash[3]), Number(slash[2]), Number(slash[1])),
      format: "DD/MM/YYYY",
      exact: true
    };
  }

  const embeddedGerman =
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(raw);
  if (embeddedGerman) {
    return {
      date: makeDate(
        Number(embeddedGerman[3]),
        Number(embeddedGerman[2]),
        Number(embeddedGerman[1])
      ),
      format: "embedded DD.MM.YYYY",
      exact: false
    };
  }

  const embeddedIso =
    /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (embeddedIso) {
    return {
      date: makeDate(
        Number(embeddedIso[1]),
        Number(embeddedIso[2]),
        Number(embeddedIso[3])
      ),
      format: "embedded YYYY-MM-DD",
      exact: false
    };
  }

  return {
    date: null,
    format: "",
    exact: false
  };
}

function addIssue(row, severity, type, reason, action) {
  row.issues.push(type);
  row.reasons.push(reason);
  row.actions.push(action);

  if (SEVERITY_RANK[severity] > SEVERITY_RANK[row.severity]) {
    row.severity = severity;
  }
}

function fieldExists(events, fieldName) {
  return events.some(event => Object.prototype.hasOwnProperty.call(event, fieldName));
}

function addDateFieldChecks(row, event, events, fieldName, label) {
  if (!fieldExists(events, fieldName)) {
    return null;
  }

  const value = cleanValue(event[fieldName]);
  if (!value) {
    addIssue(
      row,
      "info",
      `${fieldName}_missing`,
      `${label} is not filled.`,
      `Fill ${label} during the next source verification.`
    );
    return null;
  }

  const parsed = parseFlexibleDate(value);

  if (!parsed.date) {
    addIssue(
      row,
      "warning",
      `${fieldName}_not_parseable`,
      `${label} is present but cannot be parsed: ${value}.`,
      `Normalize ${label} to DD.MM.YYYY or ISO format.`
    );
    return null;
  }

  if (!parsed.exact) {
    addIssue(
      row,
      "info",
      `${fieldName}_non_standard_format`,
      `${label} can be parsed but is not stored as a clean standalone date: ${value}.`,
      `Normalize ${label} to DD.MM.YYYY after manual verification.`
    );
  }

  return parsed.date;
}

function yearsFromText(value) {
  return Array.from(
    new Set(
      cleanValue(value)
        .match(/\b20\d{2}\b/g) || []
    )
  )
    .map(Number)
    .filter(year => year >= 2020 && year <= 2035);
}

function auditEvent(event, events, today) {
  const row = {
    event_name: cleanValue(event.event_name),
    event_id: eventId(event),
    city: cleanValue(event.city),
    country: cleanValue(event.country),
    current_date: cleanValue(event.date),
    severity: "clean",
    issues: [],
    reasons: [],
    actions: []
  };

  const parsedDate = parseFlexibleDate(event.date);

  if (!cleanValue(event.date)) {
    addIssue(
      row,
      "critical",
      "date_missing",
      "Event date is missing.",
      "Research the official event date before launch."
    );
  } else if (!parsedDate.date) {
    addIssue(
      row,
      "critical",
      "date_not_parseable",
      `Event date cannot be parsed: ${event.date}.`,
      "Normalize or manually verify the event date."
    );
  } else {
    if (parsedDate.format !== "DD.MM.YYYY") {
      addIssue(
        row,
        "warning",
        "date_non_standard_format",
        `Event date uses ${parsedDate.format || "an unknown format"} instead of DD.MM.YYYY.`,
        "Normalize the public CSV date format after verification."
      );
    }

    if (parsedDate.date.getFullYear() < today.getFullYear()) {
      addIssue(
        row,
        "warning",
        "event_year_in_past",
        `Event year is ${parsedDate.date.getFullYear()}, current launch year is ${today.getFullYear()}.`,
        "Check whether this event needs a 2026/2027 update or should be archived."
      );
    }

    if (daysBetween(parsedDate.date, today) > 120) {
      addIssue(
        row,
        "info",
        "event_date_already_past",
        "Event date is more than 120 days in the past.",
        "Review if past events should remain visible or be moved to history."
      );
    }

    if (parsedDate.date.getFullYear() > today.getFullYear() + 3) {
      addIssue(
        row,
        "warning",
        "event_date_far_future",
        "Event date is more than three years in the future.",
        "Check for a year typo."
      );
    }
  }

  const lastChecked =
    addDateFieldChecks(row, event, events, "last_checked", "Last checked");
  const nextCheck =
    addDateFieldChecks(row, event, events, "next_check", "Next check");

  if (lastChecked && nextCheck && nextCheck < lastChecked) {
    addIssue(
      row,
      "warning",
      "next_check_before_last_checked",
      "Next check is earlier than last checked.",
      "Update the verification schedule after the next manual check."
    );
  }

  if (nextCheck && nextCheck < today) {
    addIssue(
      row,
      "info",
      "next_check_overdue",
      "Next check date is already in the past.",
      "Run source verification and move next_check forward."
    );
  }

  if (lastChecked && daysBetween(lastChecked, today) > 60) {
    addIssue(
      row,
      "info",
      "last_checked_stale",
      "Last checked is older than 60 days.",
      "Re-check the official source before beta launch."
    );
  }

  const registrationClose =
    addDateFieldChecks(
      row,
      event,
      events,
      "registration_deadline",
      "Registration deadline"
    ) ||
    addDateFieldChecks(
      row,
      event,
      events,
      "registration_close",
      "Registration close"
    );

  if (registrationClose && parsedDate.date && registrationClose > parsedDate.date) {
    addIssue(
      row,
      "warning",
      "registration_after_event_date",
      "Registration deadline/close date is later than the event date.",
      "Verify registration dates against the official source."
    );
  }

  const referenceYears = [
    ...yearsFromText(event.source_note),
    ...yearsFromText(event.source_url)
  ];

  if (
    parsedDate.date &&
    referenceYears.length &&
    !referenceYears.includes(parsedDate.date.getFullYear()) &&
    Math.max(...referenceYears) < parsedDate.date.getFullYear()
  ) {
    addIssue(
      row,
      "info",
      "source_mentions_older_year",
      `Source note or source URL mentions ${referenceYears.join(", ")} but event date is ${parsedDate.date.getFullYear()}.`,
      "Check whether the source page has been updated for the current event year."
    );
  }

  if (!cleanValue(event.source_url) && !cleanValue(event.event_url)) {
    addIssue(
      row,
      "info",
      "source_url_missing",
      "No source or official event URL is stored.",
      "Add an official source URL during the next data review."
    );
  }

  row.reason = row.reasons.join(" ");
  row.recommended_action =
    row.actions[0] || "No date action required.";

  return row;
}

function addDuplicateIssues(rows, events) {
  const groups = new Map();

  events.forEach((event, index) => {
    const key = [
      normalizeText(event.event_name),
      normalizeText(event.city),
      normalizeText(event.country)
    ].join("|");

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push({
      index,
      date: parseFlexibleDate(event.date).date
    });
  });

  groups.forEach(group => {
    if (group.length < 2) {
      return;
    }

    for (let first = 0; first < group.length; first += 1) {
      for (let second = first + 1; second < group.length; second += 1) {
        const firstDate = group[first].date;
        const secondDate = group[second].date;
        const closeDates =
          !firstDate ||
          !secondDate ||
          Math.abs(daysBetween(firstDate, secondDate)) <= 21;

        if (!closeDates) {
          continue;
        }

        [group[first].index, group[second].index].forEach(index => {
          addIssue(
            rows[index],
            "warning",
            "possible_duplicate_same_name_city_date",
            "Another event has the same name, city and a very similar date.",
            "Review duplicate candidates before launch."
          );

          rows[index].reason = rows[index].reasons.join(" ");
          rows[index].recommended_action = rows[index].actions[0];
        });
      }
    }
  });
}

function summarize(rows) {
  return rows.reduce(
    (summary, row) => {
      summary[row.severity] =
        (summary[row.severity] || 0) + 1;
      return summary;
    },
    {
      critical: 0,
      warning: 0,
      info: 0,
      clean: 0
    }
  );
}

function main() {
  const args = parseArgs(process.argv);
  const input = resolveProjectPath(args.input);
  const jsonPath = resolveProjectPath(args.json);
  const csvPath = resolveProjectPath(args.csv);
  const mdPath = resolveProjectPath(args.md);
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const events = parseCsvFile(input);
  const rows = events.map(event =>
    auditEvent(event, events, today)
  );

  addDuplicateIssues(rows, events);

  const report = {
    generated_at: new Date().toISOString(),
    input: path.relative(ROOT, input).replace(/\\/g, "/"),
    total_events: events.length,
    summary: summarize(rows),
    events: rows
  };

  writeJsonFile(jsonPath, report);
  writeCsv(csvPath, rows);
  writeMarkdown(mdPath, report);

  console.log(
    JSON.stringify(
      {
        total_events: report.total_events,
        summary: report.summary,
        json: path.relative(ROOT, jsonPath),
        csv: path.relative(ROOT, csvPath),
        md: path.relative(ROOT, mdPath)
      },
      null,
      2
    )
  );
}

main();
