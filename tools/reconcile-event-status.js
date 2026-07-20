const {
  cleanValue,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv[3] || "data/events.status-reconciled.csv",
    report:
      argv[4] ||
      "data/imports/review/event-status-reconcile-report.json"
  };
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

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);

  return date;
}

function main() {
  const args =
    parseArgs(process.argv);

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  const events =
    parseCsvFile(args.input);

  const changed = [];

  events.forEach(event => {
    const date =
      parseGermanDate(event.date);

    const oldStatus =
      cleanValue(event.verification_status);

    let newStatus =
      oldStatus || "unclear";

    if (!date) {
      newStatus = "unclear";
    } else if (date < today) {
      newStatus = "date_expected";
    }

    if (newStatus !== oldStatus) {
      changed.push({
        event_name: event.event_name,
        date: event.date,
        oldStatus,
        newStatus
      });

      event.verification_status =
        newStatus;

      event.source_note =
        cleanValue(
          `${event.source_note} Status reconciled: previous event date requires new official date confirmation.`
        );
    }
  });

  writeCsvFile(args.out, events);
  writeJsonFile(args.report, {
    generated_at: new Date().toISOString(),
    input: args.input,
    output: args.out,
    changed_count: changed.length,
    changed
  });

  console.log(`Status changes: ${changed.length}`);
}

main();
