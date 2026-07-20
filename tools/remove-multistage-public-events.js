const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const DEFAULT_INPUT = "data/events.csv";
const DEFAULT_REPORT = "data/imports/review/multistage-cleanup-2026-06-18.json";
const DEFAULT_BACKUP = "data/backups/events-before-multistage-cleanup-2026-06-18.csv";

const TARGET_PATTERNS = [
  {
    id: "nordseelauf",
    label: "Nordseelauf stage race",
    test(event) {
      const haystack = [
        event.event_name,
        event.description,
        event.event_url,
        event.source_url
      ]
        .map(cleanValue)
        .join(" ")
        .toLowerCase();

      return /nordseelauf|nordseelauf\.de|nordseelauf\.com/.test(haystack);
    }
  },
  {
    id: "augsburger-winterlaufserie",
    label: "Augsburger Winterlaufserie",
    test(event) {
      const haystack = [
        event.event_name,
        event.description,
        event.event_url,
        event.source_url
      ]
        .map(cleanValue)
        .join(" ")
        .toLowerCase();

      return /augsburger.*winterlaufserie|winterlaufserie.*augsburg|tgva\.de\/augsburger-winterlaufserie/.test(haystack);
    }
  },
  {
    id: "terra-raetica-trails-tour",
    label: "Terra Raetica Trails Tour Festival",
    test(event) {
      const haystack = [
        event.event_name,
        event.event_url,
        event.source_url
      ]
        .map(cleanValue)
        .join(" ")
        .toLowerCase();

      return /terra[-\s]?raetica.*trails.*tour|terra-raetica-trails\.com/.test(haystack);
    }
  }
];

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    report: DEFAULT_REPORT,
    backup: DEFAULT_BACKUP,
    dryRun: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--input") {
      args.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--report") {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--backup") {
      args.backup = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function getRemovalReason(event) {
  const match = TARGET_PATTERNS.find(pattern => pattern.test(event));

  if (!match) {
    return null;
  }

  return {
    type: "multi_stage_or_series_event",
    target: match.id,
    reason: `${match.label}: official source describes this as a multi-stage event, not a single standalone race listing.`
  };
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const backupPath = path.resolve(args.backup);
  const reportPath = path.resolve(args.report);
  const events = parseCsvFile(inputPath);
  const removed = [];
  const kept = [];

  events.forEach((event, index) => {
    const reason = getRemovalReason(event);

    if (reason) {
      removed.push({
        row: index + 2,
        event_name: cleanValue(event.event_name),
        date: cleanValue(event.date),
        city: cleanValue(event.city),
        country: cleanValue(event.country),
        distance: cleanValue(event.distance),
        event_url: cleanValue(event.event_url),
        source_url: cleanValue(event.source_url),
        reason
      });
      return;
    }

    kept.push(event);
  });

  const report = {
    generated_at: new Date().toISOString(),
    input: args.input,
    dry_run: args.dryRun,
    input_events: events.length,
    output_events: kept.length,
    removed_events: removed.length,
    removed
  };

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(inputPath, backupPath);
    writeCsvFile(inputPath, kept);
  }

  writeJsonFile(reportPath, report);

  console.log(`Input events: ${events.length}`);
  console.log(`Removed multi-stage/series events: ${removed.length}`);
  console.log(`Output events: ${kept.length}`);

  if (!args.dryRun) {
    console.log(`Backup: ${args.backup}`);
  }

  console.log(`Report: ${args.report}`);
}

main();
