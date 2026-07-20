const {
  normalizeEvent,
  parseCsvFile,
  writeCsvFile
} = require("./event-table-utils");

function parseArgs(argv) {
  const args = {
    input: "",
    out: "data/imports/normalized/ahotu.normalized.csv",
    source: "Ahotu"
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--out") {
      args.out = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--source") {
      args.source = argv[index + 1];
      index += 1;
      continue;
    }

    if (!args.input) {
      args.input = value;
    }
  }

  if (!args.input) {
    throw new Error(
      "Usage: node tools/import-ahotu-csv.js <input.csv> [--out data/imports/normalized/ahotu.normalized.csv]"
    );
  }

  return args;
}

function main() {
  const args =
    parseArgs(process.argv);

  const events =
    parseCsvFile(args.input)
      .map(event =>
        normalizeEvent(
          event,
          {
            data_source: args.source
          }
        )
      );

  writeCsvFile(
    args.out,
    events
  );

  console.log(
    `Normalized ${events.length} events to ${args.out}`
  );
}

main();
