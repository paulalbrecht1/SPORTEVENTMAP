const {
  cleanValue,
  dedupeEvents,
  normalizeEvent,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const DEFAULT_URL =
  "https://www.laufrennen.de/laufkalender/";

const GERMAN_STATES = new Set([
  "baden-wuerttemberg",
  "baden-württemberg",
  "bavaria",
  "bayern",
  "berlin",
  "brandenburg",
  "bremen",
  "hamburg",
  "hessen",
  "mecklenburg-vorpommern",
  "lower saxony",
  "niedersachsen",
  "north rhine-westphalia",
  "nordrhein-westfalen",
  "rheinland-pfalz",
  "saarland",
  "saxony",
  "sachsen",
  "sachsen-anhalt",
  "schleswig-holstein",
  "thuringia",
  "thueringen",
  "thüringen"
]);

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    out: "data/imports/normalized/laufrennen.normalized.csv",
    report: "data/imports/review/laufrennen-import-report.json",
    limit: 450,
    delayMs: 120,
    concurrency: 5
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

    if (value === "--limit") {
      args.limit = Number(argv[index + 1] || args.limit);
      index += 1;
      continue;
    }

    if (value === "--delay-ms") {
      args.delayMs = Number(argv[index + 1] || args.delayMs);
      index += 1;
      continue;
    }

    if (value === "--concurrency") {
      args.concurrency = Number(argv[index + 1] || args.concurrency);
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
    .replace(/&#x27;/g, "'")
    .replace(/&auml;/g, "ä")
    .replace(/&Auml;/g, "Ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/<[^>]+>/g, " ");
}

function delay(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "SportEventMap/1.0 local running data import"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Request failed with ${response.status}: ${url}`
    );
  }

  return response.text();
}

function extractEventUrls(html) {
  const urls =
    new Set();

  for (const match of html.matchAll(/<loc>(https:\/\/(?:www\.)?laufrennen\.de\/rennseiten\/[^<]+)<\/loc>/g)) {
    urls.add(
      match[1].replace(
        "https://www.laufrennen.de/",
        "https://laufrennen.de/"
      )
    );
  }

  for (const match of html.matchAll(/https:\/\/laufrennen\.de\/rennseiten\/[^"'}<\s]+/g)) {
    urls.add(match[0]);
  }

  for (const match of html.matchAll(/href="(\/rennseiten\/[^"]+)"/g)) {
    urls.add(
      new URL(match[1], DEFAULT_URL)
        .toString()
        .replace(
          "https://www.laufrennen.de/",
          "https://laufrennen.de/"
        )
    );
  }

  return [...urls]
    .filter(url =>
      !url.includes("#") &&
      !url.includes("?")
    );
}

function parseJsonLdEvents(html) {
  const events = [];

  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const parsed =
        JSON.parse(match[1]);

      const items =
        Array.isArray(parsed)
          ? parsed
          : [parsed];

      items.forEach(item => {
        if (item && item["@type"] === "Event") {
          events.push(item);
        }
      });
    } catch (_error) {
      // Ignore malformed non-event JSON-LD blocks.
    }
  }

  return events;
}

function formatDate(value) {
  const text =
    cleanValue(value);

  const match =
    /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  if (!match) {
    return "";
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function extractCardValue(html, label) {
  const pattern =
    new RegExp(
      `<span class="race-detail-card__eyebrow">\\s*${label}:\\s*<\\/span>\\s*<div class="race-detail-card__value">([\\s\\S]*?)<\\/div>`,
      "i"
    );

  const match =
    pattern.exec(html);

  return match
    ? cleanValue(decodeHtml(match[1]))
    : "";
}

function keepDistance(part) {
  const text =
    cleanValue(part).toLowerCase();

  if (
    /backyard|marathon|halbmarathon|half marathon|ultra|trail/.test(text)
  ) {
    return true;
  }

  const hourMatch =
    /\b(6|12|24|48)\s?h\b|\b(6|12|24|48)\s?stunden\b/.exec(text);

  if (hourMatch) {
    return true;
  }

  const kmMatch =
    /(\d+(?:[.,]\d+)?)\s?km\b/.exec(text);

  if (kmMatch) {
    const km =
      Number(kmMatch[1].replace(",", "."));

    return Number.isFinite(km) && km >= 5;
  }

  return false;
}

function normalizeDistances(value) {
  const parts =
    cleanValue(value)
      .split(",")
      .map(part => cleanValue(part))
      .filter(keepDistance);

  const unique =
    [...new Set(parts)];

  return unique.join(", ");
}

function hasBlockedSignal(event, distance) {
  const value =
    [
      event.name,
      event.description,
      event.url,
      distance
    ]
      .map(cleanValue)
      .join(" ")
      .toLowerCase();

  return /wanderung|hike|walking|walk\b|spendenlauf|firmenlauf only|relay only/.test(value);
}

function getOrganizerUrl(event) {
  const organizer =
    event.organizer;

  if (Array.isArray(organizer)) {
    const item =
      organizer.find(entry =>
        cleanValue(entry && entry.url)
      );

    return item
      ? cleanValue(item.url)
      : "";
  }

  return cleanValue(organizer && organizer.url);
}

function getLocationName(event) {
  return cleanValue(
    event.location &&
    event.location.name
  );
}

function getCity(locationName) {
  const parts =
    cleanValue(locationName)
      .split(",")
      .map(part => cleanValue(part))
      .filter(Boolean);

  const candidates =
    parts.filter(part => {
      const value =
        part.toLowerCase();

      return value !== "germany" &&
        value !== "deutschland" &&
        !GERMAN_STATES.has(value);
    });

  if (candidates.length >= 2) {
    return candidates[candidates.length - 1];
  }

  return candidates[0] || "";
}

function getSport(name, distance) {
  const text =
    `${name} ${distance}`.toLowerCase();

  if (/ultra|backyard|12\s?h|24\s?h|48\s?h|stunden/.test(text)) {
    return "Ultramarathon";
  }

  return "Running";
}

function toEvent(jsonEvent, html, sourceUrl) {
  const distance =
    normalizeDistances(
      extractCardValue(html, "Distanzen")
    );

  if (!distance) {
    return null;
  }

  if (hasBlockedSignal(jsonEvent, distance)) {
    return null;
  }

  const eventUrl =
    getOrganizerUrl(jsonEvent);

  if (
    !eventUrl ||
    /laufrennen\.de/i.test(eventUrl)
  ) {
    return null;
  }

  const locationName =
    getLocationName(jsonEvent);

  const city =
    getCity(locationName);

  if (!city) {
    return null;
  }

  return normalizeEvent({
    event_name: jsonEvent.name,
    sport: getSport(jsonEvent.name, distance),
    date: formatDate(jsonEvent.startDate),
    city,
    country: "Germany",
    address: [
      locationName,
      "Germany"
    ]
      .filter(Boolean)
      .join(", "),
    distance,
    description:
      cleanValue(jsonEvent.description).slice(0, 420),
    event_url: eventUrl,
    data_source:
      `Laufrennen discovery, official organizer URL, source: ${sourceUrl}`
  });
}

async function main() {
  const args =
    parseArgs(process.argv);

  const indexHtml =
    await fetchText(args.url);

  const urls =
    extractEventUrls(indexHtml)
      .slice(0, args.limit);

  const accepted = [];
  const skipped = [];

  let nextIndex = 0;

  async function worker() {
    while (nextIndex < urls.length) {
      const url =
        urls[nextIndex];

      nextIndex += 1;

      try {
        const html =
          await fetchText(url);

        const events =
          parseJsonLdEvents(html);

        const event =
          events.length
            ? toEvent(events[0], html, url)
            : null;

        if (event) {
          accepted.push(event);
        } else {
          skipped.push(url);
        }
      } catch (error) {
        skipped.push(`${url} - ${error.message}`);
      }

      if (args.delayMs > 0) {
        await delay(args.delayMs);
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.max(1, args.concurrency)
      },
      worker
    )
  );

  const events =
    dedupeEvents(accepted);

  writeCsvFile(
    args.out,
    events
  );

  writeJsonFile(
    args.report,
    {
      source: args.url,
      discovered: urls.length,
      accepted: accepted.length,
      written: events.length,
      skipped: skipped.length,
      skippedSample: skipped.slice(0, 80)
    }
  );

  console.log(`Laufrennen import complete: ${events.length} written, ${skipped.length} skipped.`);
  console.log(`Output: ${args.out}`);
  console.log(`Report: ${args.report}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
