const {
  parseCsvFile,
  writeCsvFile
} = require("./event-table-utils");

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv.includes("--out")
      ? argv[argv.indexOf("--out") + 1]
      : argv[2] || "data/events.csv",
    removedOut: argv.includes("--removed-out")
      ? argv[argv.indexOf("--removed-out") + 1]
      : "data/imports/review/events.removed-non-europe.csv"
  };
}

function normalizeCountry(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isNonEuropeEvent(event) {
  const country =
    normalizeCountry(event.country);

  return [
    "united states",
    "usa",
    "us"
  ].includes(country);
}

function main() {
  const args =
    parseArgs(process.argv);

  const rows =
    parseCsvFile(args.input);

  const kept =
    rows.filter(row =>
      !isNonEuropeEvent(row)
    );

  const removed =
    rows.filter(isNonEuropeEvent);

  writeCsvFile(
    args.out,
    kept
  );

  writeCsvFile(
    args.removedOut,
    removed
  );

  console.log(`Input events: ${rows.length}`);
  console.log(`Kept Europe-focused events: ${kept.length}`);
  console.log(`Removed non-Europe events: ${removed.length}`);
  console.log(`Wrote: ${args.out}`);
  console.log(`Removed rows: ${args.removedOut}`);
}

main();
