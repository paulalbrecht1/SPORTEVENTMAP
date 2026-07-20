const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  parseCsvFile,
  writeJsonFile
} = require("./event-table-utils");

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out:
      argv[3] ||
      "data/imports/review/event-quality-audit.csv",
    report:
      argv[4] ||
      "data/imports/review/event-quality-audit-report.json"
  };
}

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(
    path.dirname(filePath),
    {
      recursive: true
    }
  );
}

function escapeCsv(value) {
  const text =
    cleanValue(value);

  if (
    text.includes(";") ||
    text.includes("\"") ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function writeAuditCsv(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const columns = [
    "issue_type",
    "severity",
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
    "note"
  ];

  const lines = [
    columns.join(";"),
    ...rows.map(row =>
      columns
        .map(column =>
          escapeCsv(row[column])
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

function parseGermanDate(value) {
  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
      cleanValue(value)
    );

  if (!match) {
    return null;
  }

  const date =
    new Date(
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

function addIssue(rows, event, issue) {
  rows.push({
    issue_type: issue.type,
    severity: issue.severity,
    event_name: event.event_name,
    date: event.date,
    city: event.city,
    country: event.country,
    sport: event.sport,
    distance: event.distance,
    verification_status: event.verification_status,
    priority: event.priority,
    event_url: event.event_url,
    source_url: event.source_url,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    note: issue.note
  });
}

function isLikelyAggregatorUrl(event) {
  const host =
    getHostname(event.event_url);

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
  const url =
    cleanValue(event.event_url)
      .toLowerCase();

  const host =
    getHostname(event.event_url);

  return (
    /\/blog|blogartikel|\/news|\/artikel|\/post|\/beitrag/.test(url) ||
    /blogspot\.|wordpress\.com|jimdosite\.com/.test(host)
  );
}

function isLikelyMultiStageEvent(event) {
  const titleAndLinks =
    [
      event.event_name,
      event.event_url,
      event.source_url
    ]
      .map(cleanValue)
      .join(" ")
      .toLowerCase();

  const description =
    cleanValue(event.description)
      .toLowerCase();

  return (
    /\betappe\b|\betappen\b|etappenlauf|stage race|multi[-\s]?stage|tour\s+festival|winterlaufserie/.test(titleAndLinks) ||
    /7\s+etappen|besteht aus\s+(vier|\d+)\s+l[äa]ufen|mehrt[äa]gig|etappenlauf|stage race|multi[-\s]?stage/.test(description)
  );
}

function hasCityOnlyAddress(event) {
  const address =
    cleanValue(event.address)
      .toLowerCase();

  const city =
    cleanValue(event.city)
      .toLowerCase();

  const country =
    cleanValue(event.country)
      .toLowerCase();

  if (!address) {
    return true;
  }

  const compact =
    address
      .replace(/\s+/g, " ")
      .replace(/,\s*/g, ", ")
      .trim();

  return (
    compact === city ||
    compact === `${city}, ${country}` ||
    compact.endsWith(`, ${city}, ${country}`) === false &&
      !/\d|straße|strasse|weg|allee|platz|park|stadion|see|halle|zentrum|arena|ufer|brücke|bruecke/i.test(address)
  );
}

function coordinateKey(event) {
  const lat =
    Number(event.latitude);

  const lng =
    Number(event.longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return "";
  }

  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function expectedStatus(event, today) {
  const date =
    parseGermanDate(event.date);

  if (!date) {
    return "unclear";
  }

  if (date < today) {
    return "date_expected";
  }

  if (
    /date needs manual confirmation/i.test(
      cleanValue(event.source_note)
    )
  ) {
    return "date_expected";
  }

  if (
    /Live URL verification: official registration signal found/i.test(
      cleanValue(event.source_note)
    )
  ) {
    return "registration_open";
  }

  if (/sold\s*out|ausverkauft/i.test(`${event.description} ${event.event_name}`)) {
    return "sold_out";
  }

  if (/cancelled|canceled|abgesagt/i.test(`${event.description} ${event.event_name}`)) {
    return "cancelled";
  }

  if (/anmeldung|registration|register|raceresult/i.test(event.event_url)) {
    return "registration_open";
  }

  return "confirmed";
}

function main() {
  const args =
    parseArgs(process.argv);

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  const events =
    parseCsvFile(args.input);

  const issues = [];
  const coordinateGroups = new Map();

  events.forEach(event => {
    const key =
      coordinateKey(event);

    if (key) {
      coordinateGroups.set(
        key,
        [
          ...(coordinateGroups.get(key) || []),
          event
        ]
      );
    }

    if (isLikelyAggregatorUrl(event)) {
      addIssue(issues, event, {
        type: "non_official_url",
        severity: "high",
        note: "Event URL points to an aggregator/discovery platform, not an official organizer website."
      });
    }

    if (isLikelyBlogUrl(event)) {
      addIssue(issues, event, {
        type: "blog_or_news_url",
        severity: "medium",
        note: "Event URL looks like a blog/news/article page and should be checked against the official organizer page."
      });
    }

    if (isLikelyMultiStageEvent(event)) {
      addIssue(issues, event, {
        type: "multi_stage_or_series_event",
        severity: "high",
        note: "Event looks like a stage race, race series, or multi-day tour. Public map should usually contain one clean event entry or none, not separate stage pins."
      });
    }

    if (hasCityOnlyAddress(event)) {
      addIssue(issues, event, {
        type: "city_level_coordinates",
        severity: "medium",
        note: "Address does not contain a precise venue/start-area signal. Pins may overlap in large cities."
      });
    }

    const expected =
      expectedStatus(event, today);

    if (
      cleanValue(event.verification_status) &&
      cleanValue(event.verification_status) !== expected
    ) {
      addIssue(issues, event, {
        type: "status_mismatch",
        severity: "medium",
        note: `Current status is ${event.verification_status}; expected ${expected} from date/url signals.`
      });
    }
  });

  coordinateGroups.forEach(group => {
    if (group.length < 3) {
      return;
    }

    group.forEach(event => {
      addIssue(issues, event, {
        type: "coordinate_stack",
        severity: "medium",
        note: `${group.length} events share the same coordinates. Add precise venue/start addresses and geocode again.`
      });
    });
  });

  const counts =
    issues.reduce((summary, issue) => {
      summary[issue.issue_type] =
        (summary[issue.issue_type] || 0) + 1;

      return summary;
    }, {});

  writeAuditCsv(
    args.out,
    issues
  );

  writeJsonFile(
    args.report,
    {
      generated_at: new Date().toISOString(),
      input: args.input,
      total_events: events.length,
      total_issues: issues.length,
      issue_counts: counts,
      output: args.out
    }
  );

  console.log(`Quality issues: ${issues.length}`);
  console.log(counts);
  console.log(`Output: ${args.out}`);
}

main();
