const {
  cleanValue,
  dedupeEvents,
  normalizeEvent,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const DEFAULT_URL = "https://www.runnersworld.de/laufkalender/";

const MONTHS = {
  januar: "01",
  februar: "02",
  "\u006d\u00e4rz": "03",
  maerz: "03",
  april: "04",
  mai: "05",
  juni: "06",
  juli: "07",
  august: "08",
  september: "09",
  oktober: "10",
  november: "11",
  dezember: "12"
};

const BLOCKED_NAME_PATTERNS = [
  /\bfirmenlauf\b/i,
  /\bb2run\b/i,
  /\bteamstaffel\b/i,
  /\bstaffellauf\b/i,
  /\bspendenlauf\b/i,
  /\bbenefizlauf\b/i,
  /\bcharity\b/i,
  /\bwalk\b/i,
  /\bwalking\b/i,
  /\bwand(er|erung)\b/i,
  /\bhike\b/i,
  /\bobstacle\b/i,
  /\bspartan\b/i,
  /\bmud\b/i,
  /\bhindernis\b/i,
  /\bparkrun\b/i
];

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    out: "data/imports/normalized/runnersworld-germany.normalized.csv",
    report: "data/imports/review/runnersworld-germany-import-report.json",
    limit: 180,
    concurrency: 4
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (value === "--url") {
      args.url = next || args.url;
      index += 1;
    } else if (value === "--out") {
      args.out = next || args.out;
      index += 1;
    } else if (value === "--report") {
      args.report = next || args.report;
      index += 1;
    } else if (value === "--limit") {
      args.limit = Number(next || args.limit);
      index += 1;
    } else if (value === "--concurrency") {
      args.concurrency = Number(next || args.concurrency);
      index += 1;
    }
  }

  return args;
}

function decodeHtml(value) {
  return repairEncoding(String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&auml;/g, "\u00e4")
    .replace(/&Auml;/g, "\u00c4")
    .replace(/&ouml;/g, "\u00f6")
    .replace(/&Ouml;/g, "\u00d6")
    .replace(/&uuml;/g, "\u00fc")
    .replace(/&Uuml;/g, "\u00dc")
    .replace(/&szlig;/g, "\u00df"));
}

function repairEncoding(value) {
  return String(value || "")
    .replace(/Ã¤/g, "\u00e4")
    .replace(/Ã„/g, "\u00c4")
    .replace(/Ã¶/g, "\u00f6")
    .replace(/Ã–/g, "\u00d6")
    .replace(/Ã¼/g, "\u00fc")
    .replace(/Ãœ/g, "\u00dc")
    .replace(/ÃŸ/g, "\u00df")
    .replace(/â€“/g, "-")
    .replace(/â€™/g, "'")
    .replace(/â€ž|â€œ/g, "\"");
}

function stripTags(value) {
  return cleanValue(
    decodeHtml(
      String(value || "").replace(/<[^>]+>/g, " ")
    )
  );
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SportEventMap/1.0 runnersworld running import"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const charset =
    /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase() ||
    "utf-8";
  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder(
    /iso-8859-1|latin-?1|windows-1252/.test(charset)
      ? "windows-1252"
      : "utf-8"
  );

  return decoder.decode(buffer);
}

function parseListingDate(text) {
  const match =
    /(\d{1,2})\s+([A-Za-z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc]+)\s+(20\d{2})/.exec(text);

  if (!match) {
    return "";
  }

  const monthKey =
    match[2].toLowerCase().replace("\u00e4", "ae");
  const month =
    MONTHS[monthKey] || MONTHS[match[2].toLowerCase()];

  if (!month) {
    return "";
  }

  return [
    String(match[1]).padStart(2, "0"),
    month,
    match[3]
  ].join(".");
}

function extractListingLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const regex =
    /<a\b[^>]*href=["']([^"']*\/laufkalender\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const href = new URL(match[1], baseUrl).toString();

    if (href === baseUrl || href.endsWith("/laufkalender/") || seen.has(href)) {
      continue;
    }

    const text = stripTags(match[2]);
    const date = parseListingDate(text);

    if (!date) {
      continue;
    }

    links.push({ href, text, date });
    seen.add(href);
  }

  return links;
}

function extractOfficialUrl(html) {
  const organizerIndex = html.toLowerCase().indexOf("veranstalter");
  const slice =
    organizerIndex >= 0
      ? html.slice(organizerIndex, organizerIndex + 3000)
      : html;

  const hrefMatches =
    [...slice.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)]
      .map(match => decodeHtml(match[1]))
      .filter(url =>
        !/runnersworld|motorpresse|google|facebook|instagram|twitter|spotify|shop\.|newsletter|fonts|cdn|schema/i.test(url)
      );

  return hrefMatches[0] || "";
}

function extractVenue(html) {
  const marker = "Veranstaltungsort";
  const index = html.indexOf(marker);

  if (index < 0) {
    return "";
  }

  return stripTags(html.slice(index + marker.length, index + marker.length + 900))
    .replace(/^Veranstaltungsort\s*/i, "")
    .replace(/\s*Veranstalter.*$/i, "")
    .trim();
}

function parseCityFromVenue(venue) {
  const normalizedVenue = cleanValue(
    String(venue || "").replace(/\b(AT|DE|CH)\s+(?=\d{4,5}\b)/i, "")
  );

  const postal = /\b\d{4,5}\s+([^,()]+)/.exec(normalizedVenue);

  if (postal) {
    return cleanValue(
      postal[1]
        .replace(/\b\d+\s*km.*$/i, "")
        .replace(/\s+(Super|Beast|Sprint)\b.*$/i, "")
    );
  }

  return cleanValue(
    normalizedVenue
      .split(",")[0]
      .replace(/\([^)]*\)/g, "")
  );
}

function parseDistance(text) {
  const distanceText =
    text
      .replace(/^.*?\b20\d{2}\b/, "")
      .replace(/\b(?:AT|DE|CH)?\s*\d{4,5}\b\s+[^0-9]+/, " ");

  const matches =
    [...distanceText.matchAll(/\b(\d+(?:[,.]\d+)?)\s*km\b/gi)]
      .map(match => Number(match[1].replace(",", ".")))
      .filter(Number.isFinite);

  const adult = matches.filter(km => km >= 4.5);

  if (!adult.length) {
    return "";
  }

  const parts = [];

  if (adult.some(km => km >= 4.5 && km <= 5.5)) {
    parts.push("5 km");
  }

  if (adult.some(km => km >= 9 && km <= 11)) {
    parts.push("10 km");
  }

  if (/halbmarathon|half marathon/i.test(text) || adult.some(km => km >= 20 && km <= 22.5)) {
    parts.push("Half Marathon");
  }

  if (/marathon/i.test(text.replace(/halbmarathon/gi, "")) || adult.some(km => km >= 40 && km <= 45)) {
    parts.push("Marathon");
  }

  adult
    .filter(km => km > 45)
    .forEach(km =>
      parts.push(`${Number.isInteger(km) ? km : km.toFixed(1)} km`)
    );

  if (!parts.length) {
    adult.slice(0, 4).forEach(km =>
      parts.push(`${Number.isInteger(km) ? km : km.toFixed(1)} km`)
    );
  }

  return [...new Set(parts)].join(", ");
}

function isBlockedEvent(name, distance) {
  const text = `${name} ${distance}`;

  if (BLOCKED_NAME_PATTERNS.some(pattern => pattern.test(text))) {
    return true;
  }

  return !/(5\s*km|10\s*km|half marathon|halbmarathon|marathon|ultra|\d{2,3}\s*km)/i.test(distance);
}

function inferSport(name, distance) {
  const text = `${name} ${distance}`.toLowerCase();

  if (/ultra|24h|12h|\b[5-9]\d\s*km|\b1\d{2}\s*km/.test(text)) {
    return "Ultramarathon";
  }

  return "Running";
}

function normalizeNameFromListing(text) {
  return cleanValue(
    text
      .replace(/^\s*Toplauf\s*/i, "")
      .replace(/^\d{1,2}\s+[A-Za-z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc]+\s+20\d{2}\s*/, "")
      .replace(/\s+(?:AT|CH)\s*\d{4}\s+.*$/g, "")
      .replace(/\s+\d{4}\s+.*$/g, "")
      .replace(/\s+(?:DE\s*)?\d{5}\s+.*$/g, "")
  );
}

async function parseEvent(link) {
  const html = await fetchText(link.href);
  const officialUrl = extractOfficialUrl(html);

  if (!officialUrl) {
    return {
      skipped: "missing_official_url",
      source: link.href
    };
  }

  const venue = extractVenue(html);
  const city = parseCityFromVenue(venue) || "";
  const distance = parseDistance(link.text);
  const name = normalizeNameFromListing(link.text);

  if (!name || !city || !distance || isBlockedEvent(name, distance)) {
    return {
      skipped: "not_target_running_event",
      source: link.href,
      name,
      city,
      distance
    };
  }

  return {
    event:
      normalizeEvent({
        event_name: name,
        sport: inferSport(name, distance),
        date: link.date,
        city,
        country:
          /\u00f6sterreich|austria|wien|st\. p\u00f6lten/i.test(venue)
            ? "Austria"
            : "Germany",
        address: venue,
        distance,
        description:
          "Running event discovered via Runner's World and linked to the official organizer website.",
        event_url: officialUrl,
        data_source:
          `Runner's World discovery, official organizer URL, source: ${link.href}`,
        source_url: link.href,
        source_type: "official",
        last_checked: new Date().toISOString().slice(0, 10),
        verification_status: "unclear"
      })
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const html = await fetchText(args.url);
  const links = extractListingLinks(html, args.url).slice(0, args.limit);
  const accepted = [];
  const skipped = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < links.length) {
      const link = links[nextIndex];
      nextIndex += 1;

      try {
        const result = await parseEvent(link);

        if (result.event) {
          accepted.push(result.event);
        } else {
          skipped.push(result);
        }
      } catch (error) {
        skipped.push({
          source: link.href,
          skipped: error.message
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, args.concurrency) }, worker)
  );

  const unique = dedupeEvents(accepted);

  writeCsvFile(args.out, unique);
  writeJsonFile(args.report, {
    source: args.url,
    discovered: links.length,
    accepted: accepted.length,
    unique: unique.length,
    skipped: skipped.length,
    skipped_examples: skipped.slice(0, 30)
  });

  console.log(
    `Runner's World import complete: ${unique.length} written, ${skipped.length} skipped.`
  );
  console.log(`Output: ${args.out}`);
  console.log(`Report: ${args.report}`);
}

main();
