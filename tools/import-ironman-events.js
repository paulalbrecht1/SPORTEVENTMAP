const {
  cleanValue,
  dedupeEvents,
  normalizeEvent,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const DEFAULT_URL =
  "https://www.transition.fun/races/";

const EUROPEAN_COUNTRIES = new Set([
  "Andorra",
  "Austria",
  "Belgium",
  "Croatia",
  "Czech Republic",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Iceland",
  "Ireland",
  "Italy",
  "Luxembourg",
  "Netherlands",
  "Norway",
  "Poland",
  "Portugal",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
  "Switzerland",
  "Turkey",
  "United Kingdom"
]);

const MONTHS = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    out: "data/imports/normalized/ironman-2026.normalized.csv",
    report: "data/imports/review/ironman-2026-import-report.json",
    scope: "europe",
    limit: 250,
    verify: true
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--url") {
      args.url = argv[index + 1] || args.url;
      index += 1;
      continue;
    }

    if (value === "--out") {
      args.out = argv[index + 1] || args.out;
      index += 1;
      continue;
    }

    if (value === "--report") {
      args.report = argv[index + 1] || args.report;
      index += 1;
      continue;
    }

    if (value === "--scope") {
      args.scope = argv[index + 1] || args.scope;
      index += 1;
      continue;
    }

    if (value === "--limit") {
      args.limit = Number(argv[index + 1] || args.limit);
      index += 1;
      continue;
    }

    if (value === "--no-verify") {
      args.verify = false;
    }
  }

  return args;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/Ã¼/g, "ü")
    .replace(/Ãœ/g, "Ü")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã–/g, "Ö")
    .replace(/Ã¤/g, "ä")
    .replace(/Ã„/g, "Ä")
    .replace(/ÃŸ/g, "ß")
    .replace(/Ãº/g, "ú")
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è")
    .replace(/Ã¡/g, "á")
    .replace(/Ã³/g, "ó")
    .replace(/Ã­/g, "í")
    .replace(/<[^>]+>/g, " ");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "SportEventMap/1.0 endurance event data import"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Request failed with ${response.status}: ${url}`
    );
  }

  return response.text();
}

function formatDate(value) {
  const match =
    /\b([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\b/.exec(
      cleanValue(value)
    );

  if (!match) {
    return "";
  }

  const month =
    MONTHS[match[1].toLowerCase()];

  if (!month) {
    return "";
  }

  return [
    String(match[2]).padStart(2, "0"),
    month,
    match[3]
  ].join(".");
}

function titleCaseSlug(value) {
  return cleanValue(value)
    .split("-")
    .filter(Boolean)
    .map(part =>
      part.length <= 3
        ? part.toUpperCase()
        : `${part[0].toUpperCase()}${part.slice(1)}`
    )
    .join(" ");
}

function getOfficialUrl(slug) {
  if (slug.startsWith("ironman-70-3-")) {
    return `https://www.ironman.com/races/im703-${slug.replace("ironman-70-3-", "")}`;
  }

  if (slug.startsWith("ironman-")) {
    return `https://www.ironman.com/races/im-${slug.replace("ironman-", "")}`;
  }

  return "";
}

async function verifyOfficialUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "SportEventMap/1.0 official URL verification"
      }
    });

    if (!response.ok) {
      return false;
    }

    const html =
      await response.text();

    return /ironman/i.test(html);
  } catch (_error) {
    return false;
  }
}

function extractRaceSnippets(html) {
  const matches = [];
  const seen = new Set();
  const cardPattern =
    /<a\b[^>]*href="\/races\/(ironman[^"]+)"[\s\S]*?<\/a>/g;
  let match;

  while ((match = cardPattern.exec(html))) {
    const slug =
      cleanValue(match[1]);

    if (
      !slug ||
      seen.has(slug) ||
      slug.includes("world-championship")
    ) {
      continue;
    }

    seen.add(slug);

    matches.push({
      slug,
      snippet: match[0]
    });
  }

  return matches;
}

function extractCountry(locationText) {
  const parts =
    cleanValue(locationText)
      .split(",")
      .map(part => cleanValue(part))
      .filter(Boolean);

  return parts[parts.length - 1] || "";
}

function extractCity(locationText) {
  const parts =
    cleanValue(locationText)
      .split(",")
      .map(part => cleanValue(part))
      .filter(Boolean);

  return parts[0] || "";
}

function normalizeCourseInfo(value) {
  const text =
    cleanValue(value);

  const swim =
    /\b(ocean|lake|river|bay|harbor|reservoir)\b/i.exec(text);

  const terrains =
    [...text.matchAll(/\b(flat|rolling|hilly)\b/gi)]
      .map(match =>
        `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`
      );

  const parts = [];

  if (swim) {
    parts.push(`Swim: ${swim[1][0].toUpperCase()}${swim[1].slice(1).toLowerCase()}`);
  }

  if (terrains[0]) {
    parts.push(`Bike: ${terrains[0]}`);
  }

  if (terrains[1]) {
    parts.push(`Run: ${terrains[1]}`);
  }

  return parts.join(" | ");
}

function parseSnippet(entry) {
  const slugTitle =
    entry.slug
      .replace(/^ironman-70-3-/, "IRONMAN 70.3 ")
      .replace(/^ironman-/, "IRONMAN ");

  const fallbackName =
    titleCaseSlug(slugTitle);

  const text =
    decodeHtml(entry.snippet)
      .replace(/<!--\s*-->/g, " ")
      .replace(/\s+/g, " ");

  const nameFromCard =
    cleanValue(
      (/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(entry.snippet) || [])[1]
    );

  const date =
    formatDate(text);

  const dateMatch =
    /\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+.\s+(.+?)(?:\s+(?:Ocean|Lake|River|Bay|Harbor|Reservoir|Flat|Rolling|Hilly)\b|$)/i.exec(
      text
    );

  const location =
    dateMatch
      ? cleanValue(dateMatch[1])
      : "";

  const country =
    extractCountry(location);

  const city =
    extractCity(location);

  const distance =
    entry.slug.startsWith("ironman-70-3-")
      ? "Middle"
      : "Full";

  const eventName =
    nameFromCard ||
    fallbackName
      .replace("IRONMAN 70 3", "IRONMAN 70.3")
      .replace(/\s+/g, " ");

  const description =
    normalizeCourseInfo(text);

  return normalizeEvent({
    event_name: eventName,
    sport: "Triathlon",
    date,
    city,
    country,
    address: [city, country].filter(Boolean).join(", "),
    distance,
    description,
    event_url: getOfficialUrl(entry.slug),
    data_source:
      "IRONMAN official URL verified via Transition discovery"
  });
}

function isInScope(event, scope) {
  if (scope === "world") {
    return true;
  }

  if (scope === "germany") {
    return event.country === "Germany";
  }

  return EUROPEAN_COUNTRIES.has(event.country);
}

async function main() {
  const args =
    parseArgs(process.argv);

  const html =
    await fetchText(args.url);

  const candidates =
    extractRaceSnippets(html)
      .map(parseSnippet)
      .filter(event =>
        event.event_name &&
        event.date &&
        event.city &&
        event.country &&
        isInScope(event, args.scope)
      )
      .slice(0, args.limit);

  const verified = [];
  const skipped = [];

  for (const event of candidates) {
    const isVerified =
      !args.verify ||
      await verifyOfficialUrl(event.event_url);

    if (!isVerified) {
      skipped.push({
        ...event,
        reason: "Official ironman.com/races URL could not be verified"
      });
      continue;
    }

    verified.push(event);
  }

  const events =
    dedupeEvents(verified);

  writeCsvFile(
    args.out,
    events
  );

  writeJsonFile(
    args.report,
    {
      source: args.url,
      scope: args.scope,
      candidates: candidates.length,
      verified: verified.length,
      written: events.length,
      skipped: skipped.length,
      skippedEvents: skipped
    }
  );

  console.log(
    `Ironman import complete: ${events.length} written, ${skipped.length} skipped.`
  );
  console.log(`Output: ${args.out}`);
  console.log(`Report: ${args.report}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
