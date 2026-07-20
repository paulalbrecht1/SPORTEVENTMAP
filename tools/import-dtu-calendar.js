const {
  cleanValue,
  dedupeEvents,
  normalizeEvent,
  writeCsvFile
} = require("./event-table-utils");

const BASE_URL =
  "https://www.triathlondeutschland.de";

function parseArgs(argv) {
  const args = {
    limit: 120,
    maxPages: 8,
    out: "data/imports/normalized/dtu-calendar.normalized.csv",
    resolveOfficialUrls: true,
    delayMs: 500
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value =
      argv[index];

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

    if (value === "--out") {
      args.out =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--no-resolve-official-urls") {
      args.resolveOfficialUrls = false;
      continue;
    }
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
    .replace(/&auml;/g, "ä")
    .replace(/&Auml;/g, "Ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
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

async function fetchPage(url) {
  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "SportEventMap/1.0 DTU data import"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `DTU request failed with ${response.status}: ${url}`
    );
  }

  return response.text();
}

function getPageUrl(page) {
  const url =
    new URL(
      "/termine/veranstaltungskalender",
      BASE_URL
    );

  url.searchParams.set(
    "page",
    String(page)
  );

  url.searchParams.set(
    "select_date",
    "upcoming"
  );

  return url.toString();
}

function getFirstMatch(source, pattern) {
  const match =
    pattern.exec(source);

  return match
    ? match[1]
    : "";
}

function inferTriathlonDistance(name) {
  const text =
    cleanValue(name)
      .toLowerCase();

  const distances = [];

  if (/\bsprint\b|\bsd\b/.test(text)) {
    distances.push("Sprint");
  }

  if (/\bolympic\b|\bod\b|kurzdistanz/.test(text)) {
    distances.push("Olympic");
  }

  if (/\bmiddle\b|\bmd\b|mitteldistanz|70\.3/.test(text)) {
    distances.push("Middle");
  }

  if (/\bfull\b|\bironman\b|langdistanz/.test(text)) {
    distances.push("Full");
  }

  return distances.length
    ? distances.join(", ")
    : "Triathlon";
}

function isUsefulTriathlonEvent(name) {
  const text =
    cleanValue(name)
      .toLowerCase();

  if (
    /kinder|kids|junior|schüler|schueler|jugend|para|swim\s*&\s*run|swim and run|swimrun|bike\s*&\s*run|aquabike/.test(text)
  ) {
    return false;
  }

  return /triathlon|ironman|70\.3/.test(text);
}

function parseEventCard(card) {
  const latitude =
    cleanValue(
      getFirstMatch(
        card,
        /data-lat="([^"]+)"/i
      )
    );

  const longitude =
    cleanValue(
      getFirstMatch(
        card,
        /data-lon="([^"]+)"/i
      )
    );

  const dateIso =
    cleanValue(
      getFirstMatch(
        card,
        /property="startDate"\s+content="([^"]+)"/i
      )
    );

  const linkMatch =
    /<p[^>]+property="name"[^>]*class="h3"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
      .exec(card);

  if (!linkMatch) {
    return null;
  }

  const eventUrl =
    new URL(
      decodeHtml(linkMatch[1]),
      BASE_URL
    ).toString();

  const name =
    stripTags(linkMatch[2]);

  const locality =
    stripTags(
      getFirstMatch(
        card,
        /<span class="locality">([\s\S]*?)<\/span>/i
      )
    );

  const region =
    stripTags(
      getFirstMatch(
        card,
        /<span property="addressLocality">([\s\S]*?)<\/span>/i
      )
    );

  if (
    !name ||
    !isUsefulTriathlonEvent(name) ||
    !dateIso ||
    !locality ||
    !latitude ||
    !longitude
  ) {
    return null;
  }

  const [
    year,
    month,
    day
  ] = dateIso.split("-");

  return normalizeEvent(
    {
      event_name: name,
      sport: "Triathlon",
      date: `${day}.${month}.${year}`,
      city: locality,
      country: "Germany",
      address: `${locality}, Germany`,
      latitude,
      longitude,
      distance: inferTriathlonDistance(name),
      description: region
        ? `Region: ${region}`
        : "",
      event_url: eventUrl,
      data_source: "DTU Veranstaltungskalender",
      image: ""
    }
  );
}

function parseEvents(html) {
  return html
    .split('<div class="views-row">')
    .slice(1)
    .map(parseEventCard)
    .filter(Boolean);
}

function isIgnoredExternalLink(url) {
  try {
    const hostname =
      new URL(url, BASE_URL)
        .hostname
        .toLowerCase();

    return (
      hostname.includes("triathlondeutschland.de") ||
      hostname.includes("dtu-kalender.de") ||
      hostname.includes("facebook.com") ||
      hostname.includes("instagram.com") ||
      hostname.includes("linkedin.com") ||
      hostname.includes("tiktok.com") ||
      hostname.includes("twitter.com") ||
      hostname.includes("youtube.com")
    );
  } catch (_error) {
    return true;
  }
}

function findOfficialUrl(html) {
  const links =
    Array
      .from(
        html.matchAll(
          /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
        )
      )
      .map(match => ({
        href: decodeHtml(match[1]),
        text: stripTags(match[2])
      }))
      .filter(link =>
        /^https?:\/\//i.test(link.href) &&
        !isIgnoredExternalLink(link.href)
      );

  const visibleWebsite =
    links.find(link =>
      /^www\.|\.de$|\.com$/i.test(link.text)
    );

  return (
    visibleWebsite ||
    links[0]
  )?.href || "";
}

async function enrichOfficialUrls(events, args) {
  for (const event of events) {
    try {
      const html =
        await fetchPage(event.event_url);

      const officialUrl =
        findOfficialUrl(html);

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
        `Could not resolve official DTU URL for ${event.event_name}:`,
        error.message
      );
    }

    await delay(args.delayMs);
  }
}

async function collectEvents(args) {
  const events = [];

  for (let page = 0; page < args.maxPages; page += 1) {
    const url =
      getPageUrl(page);

    const html =
      await fetchPage(url);

    const pageEvents =
      parseEvents(html);

    events.push(...pageEvents);

    console.log(
      `Fetched ${pageEvents.length} useful DTU triathlon events from ${url}`
    );

    if (events.length >= args.limit) {
      break;
    }

    await delay(args.delayMs);
  }

  return dedupeEvents(events)
    .slice(0, args.limit);
}

async function main() {
  const args =
    parseArgs(process.argv);

  const events =
    await collectEvents(args);

  if (args.resolveOfficialUrls) {
    await enrichOfficialUrls(
      events,
      args
    );
  }

  writeCsvFile(
    args.out,
    events
  );

  console.log(
    `Normalized DTU events: ${events.length}`
  );

  console.log(
    `Wrote ${args.out}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
