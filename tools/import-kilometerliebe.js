const {
  cleanValue,
  dedupeEvents,
  normalizeEvent,
  writeCsvFile
} = require("./event-table-utils");

const DEFAULT_URL =
  "https://www.kilometerliebe.de/2026";

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    limit: 180,
    out: "data/imports/normalized/kilometerliebe-2026.normalized.csv",
    source: "Kilometerliebe Discovery"
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value =
      argv[index];

    if (value === "--url") {
      args.url =
        argv[index + 1] || args.url;
      index += 1;
      continue;
    }

    if (value === "--limit") {
      args.limit =
        Number(argv[index + 1] || args.limit);
      index += 1;
      continue;
    }

    if (value === "--out") {
      args.out =
        argv[index + 1] || args.out;
      index += 1;
      continue;
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
    .replace(/&auml;/g, "ae")
    .replace(/&Auml;/g, "Ae")
    .replace(/&ouml;/g, "oe")
    .replace(/&Ouml;/g, "Oe")
    .replace(/&uuml;/g, "ue")
    .replace(/&Uuml;/g, "Ue")
    .replace(/&szlig;/g, "ss")
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCharCode(Number(code))
    );
}

async function fetchPage(url) {
  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "SportEventMap/1.0 local running import"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Kilometerliebe request failed with ${response.status}: ${url}`
    );
  }

  return response.text();
}

function extractBalancedObject(source, openIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char =
      source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(
          openIndex,
          index + 1
        );
      }
    }
  }

  return "";
}

function extractJsonEvents(html) {
  const events = [];
  const seenObjects =
    new Set();

  const marker =
    "\"slug\":";

  let searchIndex = 0;

  while (searchIndex < html.length) {
    const markerIndex =
      html.indexOf(
        marker,
        searchIndex
      );

    if (markerIndex === -1) {
      break;
    }

    const openIndex =
      html.lastIndexOf(
        "{",
        markerIndex
      );

    if (openIndex === -1) {
      searchIndex =
        markerIndex + marker.length;
      continue;
    }

    const objectText =
      extractBalancedObject(
        html,
        openIndex
      );

    searchIndex =
      markerIndex + marker.length;

    if (
      !objectText ||
      seenObjects.has(objectText)
    ) {
      continue;
    }

    seenObjects.add(objectText);

    try {
      const event =
        JSON.parse(objectText);

      if (
        event &&
        event.slug &&
        event.title &&
        event.date
      ) {
        events.push(event);
      }
    } catch (_error) {
      // Some script fragments look like event data but are not standalone JSON.
    }
  }

  return events;
}

function getFlagText(event) {
  return [
    event.title,
    event.description,
    Array.isArray(event.tags)
      ? event.tags.join(" ")
      : "",
    event.homepage
  ]
    .map(cleanValue)
    .join(" ")
    .toLowerCase();
}

function getPrimaryFormatText(event) {
  return [
    event.title,
    Array.isArray(event.tags)
      ? event.tags.join(" ")
      : "",
    event.homepage
  ]
    .map(cleanValue)
    .join(" ")
    .toLowerCase();
}

function isUsefulLocalRunningEvent(event) {
  const text =
    getFlagText(event);

  if (
    cleanValue(event.category).toLowerCase() !== "lauf" ||
    !cleanValue(event.homepage) ||
    !/^https?:\/\//i.test(cleanValue(event.homepage))
  ) {
    return false;
  }

  if (/kilometerliebe\.de/i.test(event.homepage)) {
    return false;
  }

  const excludedPatterns = [
    /\bwalk\b/,
    /\bhike\b/,
    /hiking/,
    /walking/,
    /wandern/,
    /wanderung/,
    /nordic/,
    /kinder/,
    /\bkids?\b/,
    /schueler/,
    /schüler/,
    /jugend/,
    /junior/,
    /bambini/,
    /zwergen/,
    /parkrun/,
    /laufgruppe/,
    /run\s*club/,
    /training/,
    /challenge/,
    /virtuell/,
    /virtual/,
    /spenden\W*lauf/,
    /charity\s*run/
  ];

  if (
    excludedPatterns.some(pattern =>
      pattern.test(text)
    )
  ) {
    return false;
  }

  const maxDistance =
    Number(event.distanceMax);

  const minDistance =
    Number(event.distanceMin);

  const primaryFormatText =
    getPrimaryFormatText(event);

  const hasTimedUltraSignal =
    /\b\d{1,2}[\s-]?(?:h|stunden|stundenlauf)\b|(?:\d{1,2})[\s-]?stunden[\s-]?(?:lauf|rennen)?/.test(primaryFormatText);

  const hasBackyardSignal =
    /backyard/.test(primaryFormatText);

  if (
    Number.isFinite(maxDistance) &&
    maxDistance <= 0 &&
    !hasTimedUltraSignal &&
    !hasBackyardSignal
  ) {
    return false;
  }

  if (
    Number.isFinite(maxDistance) &&
    maxDistance < 5 &&
    !hasTimedUltraSignal &&
    !event.isHalf &&
    !event.isMarathon &&
    !event.isUltra
  ) {
    return false;
  }

  return (
    Number.isFinite(maxDistance) ||
    Number.isFinite(minDistance) ||
    event.isHalf ||
    event.isMarathon ||
    event.isUltra ||
    /(5\s?km|5k|10\s?km|10k|halbmarathon|marathon|ultra|trail)/i.test(text)
  );
}

function formatDate(dateIso) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})/.exec(
      cleanValue(dateIso)
    );

  if (!match) {
    return cleanValue(dateIso);
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatDistanceNumber(value) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "";
  }

  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(1).replace(/\.0$/, "");
}

function inferDistance(event) {
  const distances = [];
  const minDistance =
    Number(event.distanceMin);
  const maxDistance =
    Number(event.distanceMax);
  const text =
    getFlagText(event);
  const primaryFormatText =
    getPrimaryFormatText(event);

  if (/backyard/.test(primaryFormatText)) {
    return "Backyard Ultra";
  }

  const mileMatch =
    /\b(\d{2,3})\s?(?:meilen|miles?)\b/.exec(
      primaryFormatText
    );

  if (mileMatch) {
    const miles =
      Number(mileMatch[1]);

    if (Number.isFinite(miles)) {
      const kilometers =
        Math.round(miles * 1.60934);

      return `${miles} miles / ${kilometers} km`;
    }
  }

  const durationMatches =
    [
      ...primaryFormatText.matchAll(/\b(\d{1,2})[\s-]?(?:h|stunden|stundenlauf)\b|(\d{1,2})[\s-]?stunden[\s-]?(?:lauf|rennen)?/g)
    ]
      .map(match => `${match[1] || match[2]}h`);

  if (
    durationMatches.length &&
    (
      event.isUltra ||
      /ultra|stundenlauf|\d{1,2}[\s-]?(?:h|stunden)|\d{1,2}[\s-]?stunden/.test(primaryFormatText)
    )
  ) {
    return `${[...new Set(durationMatches)].join(" / ")} Ultramarathon`;
  }

  if (
    Number.isFinite(minDistance) &&
    minDistance <= 5 &&
    Number.isFinite(maxDistance) &&
    maxDistance >= 5
  ) {
    distances.push("5 km");
  }

  if (
    Number.isFinite(minDistance) &&
    minDistance <= 10 &&
    Number.isFinite(maxDistance) &&
    maxDistance >= 10
  ) {
    distances.push("10 km");
  }

  if (
    event.isHalf ||
    (
      Number.isFinite(maxDistance) &&
      maxDistance >= 21 &&
      maxDistance < 30
    )
  ) {
    distances.push("Half Marathon");
  }

  if (
    event.isMarathon ||
    (
      Number.isFinite(maxDistance) &&
      maxDistance >= 42 &&
      maxDistance <= 43
    )
  ) {
    distances.push("Marathon");
  }

  if (
    event.isUltra ||
    (
      Number.isFinite(maxDistance) &&
      maxDistance > 43
    )
  ) {
    distances.push(
      `${formatDistanceNumber(maxDistance)} km`
    );
  }

  if (
    !distances.length &&
    Number.isFinite(maxDistance) &&
    maxDistance > 0
  ) {
    distances.push(
      `${formatDistanceNumber(maxDistance)} km`
    );
  }

  return [...new Set(distances)].join(", ");
}

function inferSport(event) {
  const maxDistance =
    Number(event.distanceMax);

  if (
    event.isUltra ||
    (
      Number.isFinite(maxDistance) &&
      maxDistance > 43
    )
  ) {
    return "Ultramarathon";
  }

  return "Running";
}

function getDescription(event) {
  const distance =
    inferDistance(event);

  return cleanValue(
    [
      `Official local running event in ${event.city}.`,
      distance
        ? `Distances: ${distance}.`
        : "",
      "Discovered via Kilometerliebe and linked to the official event website."
    ].join(" ")
  );
}

function normalizeKilometerliebeEvent(event, source) {
  return normalizeEvent({
    event_name: decodeHtml(event.title),
    sport: inferSport(event),
    date: formatDate(event.date),
    city: decodeHtml(event.city),
    country: "Germany",
    address: `${decodeHtml(event.city)}, Germany`,
    latitude: "",
    longitude: "",
    distance: inferDistance(event),
    description: getDescription(event),
    event_url: cleanValue(event.homepage),
    data_source: source,
    image: ""
  });
}

async function main() {
  const args =
    parseArgs(process.argv);

  const html =
    await fetchPage(args.url);

  const discovered =
    extractJsonEvents(html);

  const filtered =
    discovered
      .filter(isUsefulLocalRunningEvent)
      .slice(0, args.limit)
      .map(event =>
        normalizeKilometerliebeEvent(
          event,
          args.source
        )
      );

  const unique =
    dedupeEvents(filtered);

  writeCsvFile(
    args.out,
    unique
  );

  console.log(
    `Discovered events: ${discovered.length}`
  );

  console.log(
    `Accepted local running events: ${unique.length}`
  );

  console.log(
    `Wrote normalized CSV: ${args.out}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
