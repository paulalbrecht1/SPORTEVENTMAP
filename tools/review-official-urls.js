const {
  parseCsvFile,
  writeCsvFile
} = require("./event-table-utils");

const SOURCE_HOSTS = [
  "marathon.de",
  "www.marathon.de",
  "ahotu",
  "runsignup",
  "worldtriathlon"
];

const KNOWN_OFFICIAL_URLS = {
  "Salzkotten Marathon": "https://salzkotten-marathon.de/",
  "Europamarathon Görlitz": "https://www.europamarathon.de/",
  "Skatstadtmarathon": "https://www.skatstadtmarathon.de/",
  "Sparkassen Metropolmarathon": "https://metropolmarathon.de/",
  "EVL Halbmarathon Leverkusen": "https://www.evl-halbmarathon.de/",
  "Remmers-Hasetal Marathon": "https://www.hasetal-marathon.de/",
  "Monschau Marathon": "https://www.monschau-marathon.de/",
  "Allgäuer Panorama Marathon": "https://www.allgaeuer-panorama-marathon.de/",
  "Fehmarn Marathon": "https://www.fehmarn-marathon.de/",
  "Stadtwerke Halbmarathon Bochum": "https://www.stadtwerke-halbmarathon.de/",
  "Flensburg liebt dich Marathon": "https://www.flensburg-marathon.de/",
  "Fränkische Schweiz Marathon": "https://www.fs-marathon.de/",
  "City Marathon Bremerhaven": "https://www.bremerhaven-marathon.de/",
  "Erfurt Marathon": "https://www.erfurt-marathon.de/",
  "Pfälzerwald Marathon": "https://www.pfaelzerwald-marathon.de/",
  "ebm-papst Marathon": "https://www.ebmpapst-marathon.de/",
  "Bodensee Marathon": "https://www.bodensee-marathon.de/",
  "Seenlandmarathon": "https://www.seenlandmarathon.de/",
  "Baden Marathon Karlsruhe": "https://www.badenmarathon.de/",
  "Einstein Marathon": "https://www.einsteinmarathon.de/",
  "Mitteldeutscher Marathon": "https://www.mitteldeutscher-marathon.de/",
  "Rügenbrücken Marathon": "https://www.ruegenbrueckenmarathon.de/",
  "Schwarzwald Marathon": "https://www.schwarzwaldmarathon.de/",
  "Lübeck Marathon": "https://www.luebeck-marathon.de/",
  "Bottwartal Marathon": "https://www.bottwartal-marathon.de/",
  "Oldenburg Marathon": "https://www.oldenburg-marathon.de/",
  "Rursee Marathon": "https://www.rursee-marathon.de/",
  "Königsforst Marathon": "https://www.koenigsforst-marathon.de/",
  "Bienwald Marathon": "https://www.bienwald-marathon.de/",
  "Generali Berliner Halbmarathon": "https://www.generali-berliner-halbmarathon.de/",
  "Mein Freiburg Marathon": "https://www.mein-freiburgmarathon.de/",
  "uniper Marathon Düsseldorf": "https://www.uniper-duesseldorfmarathon.de/",
  "Leipzig Marathon": "https://leipzigmarathon.de/",
  "Oberelbe Marathon": "https://www.oberelbe-marathon.de/",
  "Heilbronner Trollinger Marathon": "https://www.trollinger-marathon.de/",
  "Spreewald Marathon": "https://www.spreewaldmarathon.de/",
  "Cuxhaven Marathon": "https://www.cuxhaven-marathon.de/",
  "WVV Würzburg Marathon": "https://www.wuerzburg-marathon.de/"
};

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv.includes("--out")
      ? argv[argv.indexOf("--out") + 1]
      : "data/imports/review/events-url-review.csv",
    fix: argv.includes("--fix")
  };
}

function needsReview(url) {
  if (!url) {
    return true;
  }

  try {
    const hostname =
      new URL(url)
        .hostname
        .toLowerCase();

    return SOURCE_HOSTS.some(sourceHost =>
      hostname === sourceHost ||
      hostname.endsWith(`.${sourceHost}`)
    );
  } catch (_error) {
    return true;
  }
}

function main() {
  const args =
    parseArgs(process.argv);

  const rows =
    parseCsvFile(args.input);

  let fixedCount = 0;

  rows.forEach(row => {
    const officialUrl =
      KNOWN_OFFICIAL_URLS[row.event_name];

    if (
      args.fix &&
      officialUrl &&
      row.event_url !== officialUrl
    ) {
      row.event_url = officialUrl;
      fixedCount += 1;
    }
  });

  if (args.fix) {
    writeCsvFile(args.input, rows);
  }

  const reviewRows =
    rows
      .filter(row =>
        needsReview(row.event_url)
      )
      .map(row => ({
        event_name: row.event_name,
        date: row.date,
        city: row.city,
        country: row.country,
        current_url: row.event_url,
        suggested_url: KNOWN_OFFICIAL_URLS[row.event_name] || "",
        reason: row.event_url
          ? "Source or listing URL"
          : "Missing URL"
      }));

  writeCsvFile(
    args.out,
    reviewRows
  );

  console.log(`Review URLs: ${reviewRows.length}`);
  console.log(`Fixed URLs: ${fixedCount}`);
  console.log(`Wrote: ${args.out}`);
}

main();
