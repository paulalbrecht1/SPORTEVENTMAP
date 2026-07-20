const {
  cleanValue,
  parseCsvFile,
  writeCsvFile
} = require("./event-table-utils");

function normalizeIronmanName(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ironman|70|3|triathlon|european|championship)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArgs(argv) {
  return {
    base: argv[2] || "data/events.csv",
    importFile:
      argv[3] ||
      "data/imports/normalized/ironman-2026.geoapify.csv",
    out:
      argv[4] ||
      "data/events.without-replaced-ironman.csv"
  };
}

function main() {
  const args =
    parseArgs(process.argv);

  const baseEvents =
    parseCsvFile(args.base);

  const importedEvents =
    parseCsvFile(args.importFile);

  const importedKeys =
    new Set(
      importedEvents
        .map(event =>
          normalizeIronmanName(event.event_name)
        )
        .filter(Boolean)
    );

  const filteredEvents =
    baseEvents.filter(event => {
      const isIronman =
        /ironman/i.test(
          `${event.event_name} ${event.event_url}`
        );

      if (!isIronman) {
        return true;
      }

      return !importedKeys.has(
        normalizeIronmanName(event.event_name)
      );
    });

  writeCsvFile(
    args.out,
    filteredEvents
  );

  console.log(`Base events: ${baseEvents.length}`);
  console.log(`Imported Ironman events: ${importedEvents.length}`);
  console.log(`Kept base events: ${filteredEvents.length}`);
  console.log(`Replaced old Ironman rows: ${baseEvents.length - filteredEvents.length}`);
  console.log(`Output: ${args.out}`);
}

main();
