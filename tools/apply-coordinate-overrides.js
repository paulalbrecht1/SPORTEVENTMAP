const {
  cleanValue,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const OVERRIDES = [
  {
    event_name: "Flutlicht-Crosslauf",
    city: "Lüchtringen",
    latitude: "51.7926627",
    longitude: "9.4302307",
    note:
      "Manual Geoapify correction: Lüchtringen, Höxter, Germany. Address query previously matched Sölling/Büchlberg."
  }
];

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv[3] || "data/events.overrides-applied.csv",
    report:
      argv[4] ||
      "data/imports/review/coordinate-overrides-report.json"
  };
}

function matchesOverride(event, override) {
  return (
    cleanValue(event.event_name).toLowerCase() ===
      cleanValue(override.event_name).toLowerCase() &&
    cleanValue(event.city).toLowerCase() ===
      cleanValue(override.city).toLowerCase()
  );
}

function main() {
  const args =
    parseArgs(process.argv);

  const events =
    parseCsvFile(args.input);

  const applied = [];

  events.forEach(event => {
    const override =
      OVERRIDES.find(item =>
        matchesOverride(event, item)
      );

    if (!override) {
      return;
    }

    applied.push({
      event_name: event.event_name,
      city: event.city,
      oldLatitude: event.latitude,
      oldLongitude: event.longitude,
      newLatitude: override.latitude,
      newLongitude: override.longitude,
      note: override.note
    });

    event.latitude =
      override.latitude;

    event.longitude =
      override.longitude;

    event.source_note =
      cleanValue(
        `${event.source_note} ${override.note}`
      );
  });

  writeCsvFile(args.out, events);
  writeJsonFile(args.report, {
    generated_at: new Date().toISOString(),
    input: args.input,
    output: args.out,
    applied_count: applied.length,
    applied
  });

  console.log(`Coordinate overrides applied: ${applied.length}`);
}

main();
