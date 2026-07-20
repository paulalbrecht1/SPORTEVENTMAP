const {
  cleanValue,
  dedupeEvents,
  normalizeEvent,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const DEFAULT_URL = "https://running.life/laufkalender/deutschland";

const MONTHS = {
  jan: "01",
  januar: "01",
  feb: "02",
  februar: "02",
  mar: "03",
  "\u006d\u00e4r": "03",
  "\u006d\u00e4rz": "03",
  mrz: "03",
  apr: "04",
  april: "04",
  may: "05",
  mai: "05",
  jun: "06",
  juni: "06",
  jul: "07",
  juli: "07",
  aug: "08",
  august: "08",
  sep: "09",
  september: "09",
  oct: "10",
  okt: "10",
  oktober: "10",
  nov: "11",
  november: "11",
  dec: "12",
  dez: "12",
  dezember: "12"
};

const BLOCKED_PATTERNS = [
  /\bfirmenlauf\b/i,
  /\bb2run\b/i,
  /\bteam[\s-]?challenge\b/i,
  /\bteamstaffel\b/i,
  /staffel/i,
  /\bpaarlauf\b/i,
  /\bstundenpaarlauf\b/i,
  /\bspendenlauf\b/i,
  /\bbenefizlauf\b/i,
  /\bcharity\b/i,
  /\bwalk(ing)?\b/i,
  /\bwand(er|erung)\b/i,
  /\bhike\b/i,
  /\bobstacle\b/i,
  /\bspartan\b/i,
  /\bmud(dy)?\b/i,
  /\bhindernis\b/i,
  /\bhindernislauf\b/i,
  /\bdeadly\s+dozen\b/i,
  /\bbusiness\s+run\b/i,
  /\bx[-\s]?treme\s+battle\b/i,
  /marsch/i,
  /\bschnadegang\b/i,
  /\bswimrun\b/i,
  /run\s*(und|&)\s*bike/i,
  /runswimrepeat/i,
  /\bgravelman\b/i,
  /\b2[-\s]?meilen\b/i,
  /\bparkrun\b/i,
  /\bschul[-\s]?triathlon\b/i
];

const NAME_ONLY_BLOCKED_PATTERNS = [
  /\bbambini\b/i,
  /\bkinderlauf\b/i,
  /\bsch\u00fclerlauf\b/i
];

function parseArgs(argv) {
  const args = {
    startUrl: DEFAULT_URL,
    pages: 8,
    startPage: 1,
    out: "data/imports/normalized/running-life-germany.normalized.csv",
    report: "data/imports/review/running-life-germany-import-report.json",
    concurrency: 5,
    limit: 220
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (value === "--start-url") {
      args.startUrl = next || args.startUrl;
      index += 1;
    } else if (value === "--pages") {
      args.pages = Number(next || args.pages);
      index += 1;
    } else if (value === "--start-page") {
      args.startPage = Number(next || args.startPage);
      index += 1;
    } else if (value === "--out") {
      args.out = next || args.out;
      index += 1;
    } else if (value === "--report") {
      args.report = next || args.report;
      index += 1;
    } else if (value === "--concurrency") {
      args.concurrency = Number(next || args.concurrency);
      index += 1;
    } else if (value === "--limit") {
      args.limit = Number(next || args.limit);
      index += 1;
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
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&auml;/g, "\u00e4")
    .replace(/&Auml;/g, "\u00c4")
    .replace(/&ouml;/g, "\u00f6")
    .replace(/&Ouml;/g, "\u00d6")
    .replace(/&uuml;/g, "\u00fc")
    .replace(/&Uuml;/g, "\u00dc")
    .replace(/&szlig;/g, "\u00df");
}

function stripTags(value) {
  return cleanValue(
    decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
  );
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SportEventMap/1.0 running-life discovery import"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }

  return response.text();
}

function buildPageUrl(startUrl, page) {
  if (page <= 1) {
    return startUrl;
  }

  const url = new URL(startUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function extractEventLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const regex =
    /href=["']([^"']*\/de\/termine\/[^"']+)["']/gi;
  let match;

  while ((match = regex.exec(html))) {
    const href = new URL(match[1], baseUrl).toString();

    if (seen.has(href)) {
      continue;
    }

    links.push(href);
    seen.add(href);
  }

  return links;
}

function extractTitle(html) {
  const titleMatch =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  return stripTags(titleMatch?.[1] || "");
}

function extractMetaDescription(html) {
  const descriptionMatch =
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i.exec(html);

  return decodeHtml(descriptionMatch?.[1] || "");
}

function parseDateFromTitle(title) {
  const match =
    /,\s*(\d{1,2})\s+([A-Za-z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc]+)\s+(20\d{2})/i.exec(title);

  if (!match) {
    return "";
  }

  const month =
    MONTHS[match[2].toLowerCase()];

  if (!month) {
    return "";
  }

  return [
    String(match[1]).padStart(2, "0"),
    month,
    match[3]
  ].join(".");
}

function parseNameFromTitle(title) {
  return cleanValue(title.replace(/,\s*\d{1,2}\s+[A-Za-z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc]+\s+20\d{2}.*$/i, ""));
}

function extractExternalLinks(html) {
  return [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)]
    .map(match => decodeHtml(match[1]))
    .filter(url =>
      !/running\.life|fonts\.|google|facebook|instagram|twitter|spotify|cdn-cgi|schema|favicon|newsletter/i.test(url)
    );
}

function chooseOfficialUrl(urls) {
  const cleanUrls =
    [...new Set(urls)]
      .filter(url =>
        !/ahotu|marathon\.de|worldsmarathons|racecheck|finishers|laufkalender24|running\.life/i.test(url)
      );

  return cleanUrls[0] || "";
}

function parseCityCountry(text) {
  const match =
    /\b(?:Mo|Di|Mi|Do|Fr|Sa|So)\.\s+\d{1,2}\s+[A-Za-z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc]+\s+20\d{2}\s+([^,]+)\s*,\s*([^,\n]+)/i.exec(text);

  if (match) {
    return {
      city: cleanValue(match[1]),
      region: cleanValue(match[2])
    };
  }

  const breadcrumb =
    /Deutschland\s*\/\s*[^/]+\s*\/\s*([^/]+)\s*\//i.exec(text);

  return {
    city: cleanValue(breadcrumb?.[1] || ""),
    region: ""
  };
}

function getEventOnlyText(text, name) {
  const afterSafetyNote =
    text.split(/Besuche immer die Website des Veranstalters/i).slice(1).join(" ");

  if (afterSafetyNote) {
    return afterSafetyNote.split(/Weitere Veranstaltungen|Veranstaltungen in der N\u00e4he|Artikel|© 2026/i)[0];
  }

  const nameIndex =
    text.indexOf(name);

  if (nameIndex >= 0) {
    return text
      .slice(nameIndex, nameIndex + 1800)
      .split(/Weitere Veranstaltungen|Veranstaltungen in der N\u00e4he|Artikel|© 2026/i)[0];
  }

  return text.slice(0, 1800);
}

function classifyTriathlonDistance(text) {
  const beforeNearby = text;

  if (/triathlon/i.test(beforeNearby)) {
    if (/70\.3|middle|mitteldistanz|halbdistanz/i.test(beforeNearby)) {
      return "Middle Distance Triathlon";
    }

    if (/ironman|langdistanz|full distance/i.test(beforeNearby)) {
      return "Full Distance Triathlon";
    }

    if (/olympisch|olympic|kurzdistanz|standard distance/i.test(beforeNearby)) {
      return "Olympic Triathlon";
    }

    if (/sprint/i.test(beforeNearby)) {
      return "Sprint Triathlon";
    }

    return "Triathlon";
  }
}

function parseDistance(text) {
  const beforeNearby = text;

  const matches =
    [...beforeNearby.matchAll(/\b(\d+(?:[,.]\d+)?)\s*(?:km|Kilometer)\b/gi)]
      .map(match => Number(match[1].replace(",", ".")))
      .filter(Number.isFinite)
      .filter(km => km >= 4.5);

  const parts = [];

  if (matches.some(km => km >= 4.5 && km <= 5.5)) {
    parts.push("5 km");
  }

  if (matches.some(km => km >= 9 && km <= 11)) {
    parts.push("10 km");
  }

  if (/halbmarathon|half marathon/i.test(beforeNearby) || matches.some(km => km >= 20 && km <= 22.5)) {
    parts.push("Half Marathon");
  }

  if (/marathon/i.test(beforeNearby.replace(/halbmarathon/gi, "")) || matches.some(km => km >= 40 && km <= 45)) {
    parts.push("Marathon");
  }

  matches
    .filter(km => km > 45)
    .forEach(km => parts.push(`${Number.isInteger(km) ? km : km.toFixed(1)} km`));

  if (!parts.length) {
    matches.slice(0, 4).forEach(km =>
      parts.push(`${Number.isInteger(km) ? km : km.toFixed(1)} km`)
    );
  }

  return [...new Set(parts)].join(", ");
}

function inferSport(name, distance, text, isTriathlonEvent = false) {
  const haystack = `${name} ${distance}`.toLowerCase();

  if (isTriathlonEvent) {
    return "Triathlon";
  }

  if (/ultra|backyard|24\s*stunden|24h|12\s*stunden|12h|\b[5-9]\d\s*km|\b1\d{2}\s*km/.test(haystack)) {
    return "Ultramarathon";
  }

  return "Running";
}

function isBlockedEvent(name, distance, text) {
  const haystack = `${name} ${distance} ${text.slice(0, 900)}`;

  if (BLOCKED_PATTERNS.some(pattern => pattern.test(haystack))) {
    return true;
  }

  if (NAME_ONLY_BLOCKED_PATTERNS.some(pattern => pattern.test(name))) {
    return true;
  }

  return !/(5\s*km|10\s*km|half marathon|halbmarathon|marathon|ultra|triathlon|\d{2,3}\s*km)/i.test(distance);
}

function getStatus(text) {
  if (/ausverkauft|sold out/i.test(text)) {
    return "sold_out";
  }

  if (/abgesagt|cancelled|canceled/i.test(text)) {
    return "cancelled";
  }

  if (/anmeldung|registrierung|registration/i.test(text)) {
    return "registration_open";
  }

  return "unclear";
}

async function parseEvent(url) {
  const html = await fetchText(url);
  const text = stripTags(html);
  const title = extractTitle(html);
  const metaDescription = extractMetaDescription(html);
  const name = parseNameFromTitle(title);
  const date = parseDateFromTitle(title);
  const officialUrl = chooseOfficialUrl(extractExternalLinks(html));
  const { city } = parseCityCountry(text);
  const eventOnlyText =
    `${title} ${metaDescription} ${getEventOnlyText(text, name)}`;
  const isTriathlonEvent =
    /triathlon|duathlon|ironman|challenge/i.test(`${name} ${metaDescription}`);
  const distance =
    isTriathlonEvent
      ? classifyTriathlonDistance(eventOnlyText)
      : parseDistance(eventOnlyText);

  if (!officialUrl) {
    return { skipped: "missing_official_url", source: url, name };
  }

  if (!name || !date || !city || !distance || isBlockedEvent(name, distance, eventOnlyText)) {
    return {
      skipped: "not_target_running_event",
      source: url,
      name,
      date,
      city,
      distance
    };
  }

  return {
    event:
      normalizeEvent({
        event_name: name,
        sport: inferSport(name, distance, eventOnlyText, isTriathlonEvent),
        date,
        city,
        country: "Germany",
        address: `${city}, Germany`,
        distance,
        description:
          "Endurance event discovered via running.life and linked to an official website or official registration page.",
        event_url: officialUrl,
        data_source:
          `running.life discovery, official target URL, source: ${url}`,
        source_url: url,
        verification_status: getStatus(text),
        last_checked: new Date().toISOString().slice(0, 10)
      })
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const eventLinks = [];
  const seenLinks = new Set();

  for (let offset = 0; offset < args.pages; offset += 1) {
    const page = args.startPage + offset;
    const pageUrl = buildPageUrl(args.startUrl, page);
    const html = await fetchText(pageUrl);

    extractEventLinks(html, pageUrl).forEach(link => {
      if (!seenLinks.has(link) && eventLinks.length < args.limit) {
        eventLinks.push(link);
        seenLinks.add(link);
      }
    });
  }

  const accepted = [];
  const skipped = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < eventLinks.length) {
      const link = eventLinks[nextIndex];
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
          source: link,
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
    source: args.startUrl,
    pages: args.pages,
    discovered: eventLinks.length,
    accepted: accepted.length,
    unique: unique.length,
    skipped: skipped.length,
    skipped_examples: skipped.slice(0, 40)
  });

  console.log(
    `running.life import complete: ${unique.length} written, ${skipped.length} skipped.`
  );
  console.log(`Output: ${args.out}`);
  console.log(`Report: ${args.report}`);
}

main();
