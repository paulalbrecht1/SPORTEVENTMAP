const path = require("path");
const { parseCsvFile } = require("./event-table-utils.js");
const { prepareMigration } = require("./migrate-events-to-editions.js");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { kind: "events", offset: 0, limit: 100, canonicalKey: "" };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--kind") args.kind = argv[++index];
    if (argv[index] === "--offset") args.offset = Number(argv[++index]);
    if (argv[index] === "--limit") args.limit = Number(argv[++index]);
    if (argv[index] === "--canonical-key") args.canonicalKey = argv[++index];
  }
  if (!['events', 'editions'].includes(args.kind)) throw new Error("--kind must be events or editions");
  if (!Number.isInteger(args.offset) || args.offset < 0) throw new Error("--offset must be a non-negative integer");
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 200) throw new Error("--limit must be between 1 and 200");
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const prepared = prepareMigration(parseCsvFile(path.join(ROOT, "data", "events.csv")), {
    manifestPath: path.join(ROOT, "data", "event-pages.json")
  });
  if (prepared.rejected.length) throw new Error(`Refusing import with ${prepared.rejected.length} rejected rows`);
  const sourceRows = args.canonicalKey
    ? prepared[args.kind].filter(row => row.canonical_key === args.canonicalKey)
    : prepared[args.kind];
  const rows = sourceRows.slice(args.offset, args.offset + args.limit);
  process.stdout.write(JSON.stringify(rows));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
