const {
  cleanValue,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv[3] || "data/events.official-only.csv",
    quarantine:
      argv[4] ||
      "data/imports/review/events.nonofficial-quarantine.csv",
    report:
      argv[5] ||
      "data/imports/review/events.nonofficial-quarantine-report.json"
  };
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

function isNonOfficialUrl(event) {
  const url =
    cleanValue(event.event_url)
      .toLowerCase();

  const host =
    getHostname(event.event_url);

  return (
    /\/blog|blogartikel|\/news|\/artikel|\/post|\/beitrag/.test(url) ||
    /blogspot\.|wordpress\.com|jimdosite\.com/.test(host) ||
    [
      "marathon.de",
      "laufrennen.de",
      "kilometerliebe.de",
      "transition.fun",
      "ahotu.com",
      "runsignup.com"
    ].some(domain =>
      host === domain ||
      host.endsWith(`.${domain}`)
    )
  );
}

function main() {
  const args =
    parseArgs(process.argv);

  const events =
    parseCsvFile(args.input);

  const kept = [];
  const quarantined = [];

  events.forEach(event => {
    if (isNonOfficialUrl(event)) {
      quarantined.push({
        ...event,
        source_note:
          `${cleanValue(event.source_note)} Pending manual official URL review.`
      });
      return;
    }

    kept.push(event);
  });

  writeCsvFile(args.out, kept);
  writeCsvFile(args.quarantine, quarantined);
  writeJsonFile(args.report, {
    generated_at: new Date().toISOString(),
    input: args.input,
    output: args.out,
    quarantine: args.quarantine,
    kept_events: kept.length,
    quarantined_events: quarantined.length,
    quarantined_names:
      quarantined.map(event => event.event_name)
  });

  console.log(`Kept events: ${kept.length}`);
  console.log(`Quarantined events: ${quarantined.length}`);
}

main();
