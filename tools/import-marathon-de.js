const {
  cleanValue,
  dedupeEvents,
  getEventQualityIssue,
  inferSport,
  isEventWithinIsoRange,
  normalizeEvent,
  writeCsvFile
} = require("./event-table-utils");

const BASE_URL =
  "https://www.marathon.de";

function parseArgs(argv) {
  const args = {
    region: "europe",
    limit: 100,
    maxPages: 8,
    startDate: "",
    endDate: "",
    year: "",
    out: "data/imports/normalized/marathon-de.normalized.csv",
    resolveOfficialUrls: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value =
      argv[index];

    if (value === "--region") {
      args.region =
        cleanValue(argv[index + 1]).toLowerCase();
      index += 1;
      continue;
    }

    if (value === "--limit") {
      args.limit =
        Number(argv[index + 1] || args.limit);
      index += 1;
      continue;
    }

    if (value === "--max-pages") {
      args.maxPages =
        Number(argv[index + 1] || args.maxPages);
      index += 1;
      continue;
    }

    if (value === "--start-date") {
      args.startDate =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--end-date") {
      args.endDate =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--year") {
      args.year =
        cleanValue(argv[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--out") {
      args.out =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--resolve-official-urls") {
      args.resolveOfficialUrls = true;
      continue;
    }
  }

  if (
    ![
      "de",
      "germany",
      "deutschland",
      "eu",
      "europe",
      "europa"
    ].includes(args.region)
  ) {
    throw new Error(
      "Usage: node tools/import-marathon-de.js [--region europe|germany] [--limit 100]"
    );
  }

  return args;
}

function delay(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&auml;/g, "\u00e4")
    .replace(/&Auml;/g, "\u00c4")
    .replace(/&ouml;/g, "\u00f6")
    .replace(/&Ouml;/g, "\u00d6")
    .replace(/&uuml;/g, "\u00fc")
    .replace(/&Uuml;/g, "\u00dc")
    .replace(/&szlig;/g, "\u00df")
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCharCode(Number(code))
    );
}

function stripTags(value) {
  return cleanValue(
    decodeHtml(
      String(value || "")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function getListingUrl(region, start, year = "") {
  const isGermany =
    [
      "de",
      "germany",
      "deutschland"
    ].includes(region);

  if (start === 0 && !year) {
    return isGermany
      ? `${BASE_URL}/deutschland`
      : `${BASE_URL}/europa`;
  }

  const params =
    new URLSearchParams({
      site: "suche",
      start: String(start),
    esSort: "termin_von",
    esDir: "ASC"
  });

  if (year) {
    params.set("esJahr", year);
  }

  if (isGermany) {
    params.set("esLand", "3|0");
  } else {
    params.set("esKont", "3");
  }

  return `${BASE_URL}/index.php?${params.toString()}`;
}

async function fetchPage(url) {
  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "SportsEventExplorer/1.0 data import"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `marathon.de request failed with ${response.status}: ${url}`
    );
  }

  return response.text();
}

function getFirstMatch(source, pattern) {
  const match =
    pattern.exec(source);

  return match
    ? match[1]
    : "";
}

function getFirstDate(value) {
  const match =
    /(\d{2}\.\d{2}\.\d{4})/.exec(
      cleanValue(value)
    );

  return match
    ? match[1]
    : cleanValue(value);
}

function splitLocation(value) {
  const cleaned =
    stripTags(value)
      .replace(/\.\.\.$/, "");

  const parts =
    cleaned
      .split(",")
      .map(part => cleanValue(part))
      .filter(Boolean);

  const countryRaw =
    parts.length > 1
      ? parts.pop()
      : "";

  const country =
    normalizeCountry(countryRaw);

  return {
    city: parts.join(", "),
    country
  };
}

function normalizeCountry(value) {
  const cleaned =
    cleanValue(value)
      .replace(/\.\.\.$/, "");

  if (/^deutschl/i.test(cleaned)) {
    return "Deutschland";
  }

  if (/^(oesterreic|\u00f6sterreic)/i.test(cleaned)) {
    return "\u00d6sterreich";
  }

  if (/^schweiz/i.test(cleaned)) {
    return "Schweiz";
  }

  return cleaned;
}

function getSport(name, distance) {
  return inferSport(
    "",
    name,
    distance
  );
}

function parseEventCard(card) {
  const linkMatch =
    /<div class="eventstext">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/div>/i
      .exec(card);

  if (!linkMatch) {
    return null;
  }

  const name =
    stripTags(linkMatch[2]);

  const distance =
    stripTags(
      getFirstMatch(
        card,
        /<div class="eventsdistanz">([\s\S]*?)<\/div>/i
      )
    )
      .replace(/\s*\.\.\.$/, "");

  const location =
    splitLocation(
      getFirstMatch(
        card,
        /<div class="eventsort">([\s\S]*?)<\/div>/i
      )
    );

  const date =
    getFirstDate(
      stripTags(
        getFirstMatch(
          card,
          /<div class="eventsdatum">([\s\S]*?)<\/div>/i
        )
      )
    );

  const image =
    cleanValue(
      getFirstMatch(
        card,
        /background-image:\s*url\(([^)]+)\)/i
      )
    );

  const eventUrl =
    new URL(
      decodeHtml(linkMatch[1]),
      BASE_URL
    ).toString();

  if (
    !name ||
    !location.city ||
    !location.country ||
    !date
  ) {
    return null;
  }

  return normalizeEvent(
    {
      event_name: name,
      sport: getSport(name, distance),
      date,
      city: location.city,
      country: location.country,
      address: `${location.city}, ${location.country}`,
      distance,
      description:
        "Imported from marathon.de Laufkalender.",
      event_url: eventUrl,
      data_source: "marathon.de",
      image
    }
  );
}

function parseEvents(html) {
  return html
    .split('<div class="events">')
    .slice(1)
    .map(parseEventCard)
    .filter(Boolean);
}

function isExternalEventUrl(url) {
  try {
    const parsed =
      new URL(
        decodeHtml(url),
        BASE_URL
      );

    return (
      parsed.protocol.startsWith("http") &&
      parsed.hostname &&
      !parsed.hostname.endsWith("marathon.de")
    );
  } catch (_error) {
    return false;
  }
}

function findOfficialEventUrl(html) {
  const homepageIndex =
    html.search(/Homepage:/i);

  if (homepageIndex >= 0) {
    const homepageBlock =
      html.slice(
        homepageIndex,
        homepageIndex + 1200
      );

    const homepageMatch =
      /<a[^>]+href="([^"]+)"/i
        .exec(homepageBlock);

    if (
      homepageMatch &&
      isExternalEventUrl(homepageMatch[1])
    ) {
      return new URL(
        decodeHtml(homepageMatch[1]),
        BASE_URL
      ).toString();
    }
  }

  const externalLinks =
    Array
      .from(
        html.matchAll(
          /<a[^>]+href="([^"]+)"/gi
        )
      )
      .map(match => match[1])
      .filter(isExternalEventUrl);

  return externalLinks[0]
    ? new URL(
        decodeHtml(externalLinks[0]),
        BASE_URL
      ).toString()
    : "";
}

async function enrichOfficialUrls(events) {
  for (const event of events) {
    if (
      !event.event_url ||
      !event.event_url.includes("marathon.de/laufevent/")
    ) {
      continue;
    }

    try {
      const html =
        await fetchPage(event.event_url);

      const officialUrl =
        findOfficialEventUrl(html);

      if (officialUrl) {
        event.description =
          cleanValue(
            `${event.description} Source listing: ${event.event_url}`
          );

        event.event_url =
          officialUrl;
      }
    } catch (error) {
      console.warn(
        `Could not resolve official event URL for ${event.event_name}:`,
        error.message
      );
    }

    await delay(500);
  }
}

function isInDateRange(event, args) {
  if (!args.startDate && !args.endDate) {
    return true;
  }

  return isEventWithinIsoRange(
    event,
    args.startDate,
    args.endDate
  );
}

async function collectEvents(args) {
  const events = [];
  let skippedQuality = 0;
  let skippedDate = 0;

  for (let page = 0; page < args.maxPages; page += 1) {
    const start =
      page * 30;

    const url =
      getListingUrl(
        args.region,
        start,
        args.year
      );

    const html =
      await fetchPage(url);

    const pageEvents =
      parseEvents(html);

    pageEvents.forEach(event => {
      if (!isInDateRange(event, args)) {
        skippedDate += 1;
        return;
      }

      const qualityIssue =
        getEventQualityIssue(event);

      if (qualityIssue) {
        skippedQuality += 1;
        return;
      }

      events.push(event);
    });

    console.log(
      `Fetched ${pageEvents.length} marathon.de events from ${url}`
    );

    if (events.length >= args.limit) {
      break;
    }

    await delay(600);
  }

  return {
    events:
      dedupeEvents(events)
        .slice(0, args.limit),
    skippedDate,
    skippedQuality
  };
}

async function main() {
  const args =
    parseArgs(process.argv);

  const {
    events,
    skippedDate,
    skippedQuality
  } = await collectEvents(args);

  if (args.resolveOfficialUrls) {
    await enrichOfficialUrls(events);
  }

  writeCsvFile(
    args.out,
    events
  );

  console.log(
    `Normalized marathon.de events: ${events.length}`
  );

  console.log(
    `Skipped outside date range: ${skippedDate}`
  );

  console.log(
    `Skipped quality issues: ${skippedQuality}`
  );

  console.log(
    `Wrote ${args.out}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
