const {
  COLUMNS,
  cleanValue,
  dedupeEvents,
  ensureDirectoryForFile,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

function getSignature(event) {
  return COLUMNS
    .map(column => cleanValue(event[column]))
    .join("|");
}

function parseArgs(argv) {
  const args = {
    input: "data/events.csv",
    out: "data/events.deduped.csv",
    removedOut: "data/imports/review/events-duplicates-removed.json"
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value =
      argv[index];

    if (value === "--input") {
      args.input =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--out") {
      args.out =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--removed-out") {
      args.removedOut =
        argv[index + 1];
      index += 1;
      continue;
    }
  }

  return args;
}

function main() {
  const args =
    parseArgs(process.argv);

  const events =
    parseCsvFile(args.input);

  const deduped =
    dedupeEvents(events);

  const keptSignatures =
    new Set(
      deduped.map(getSignature)
    );

  const removed =
    events
      .map((event, index) => ({
        row: index + 2,
        event
      }))
      .filter(item =>
        !keptSignatures.has(
          getSignature(item.event)
        )
      );

  writeCsvFile(
    args.out,
    deduped
  );

  ensureDirectoryForFile(args.removedOut);

  writeJsonFile(
    args.removedOut,
    {
      generated_at:
        new Date().toISOString(),
      input:
        args.input,
      output:
        args.out,
      input_events:
        events.length,
      output_events:
        deduped.length,
      removed_events:
        removed.length,
      removed
    }
  );

  console.log(
    `Input events: ${events.length}`
  );

  console.log(
    `Output events: ${deduped.length}`
  );

  console.log(
    `Removed duplicates: ${removed.length}`
  );

  console.log(
    `Wrote deduped CSV: ${args.out}`
  );

  console.log(
    `Wrote duplicate report: ${args.removedOut}`
  );
}

main();
