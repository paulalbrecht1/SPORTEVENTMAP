const {
  cleanValue,
  parseCsvFile,
  writeCsvFile
} = require("./event-table-utils");

const BASE_URL =
  "https://www.marathon.de";

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv.includes("--out")
      ? argv[argv.indexOf("--out") + 1]
      : argv[2] || "data/events.csv",
    reviewOut: argv.includes("--review-out")
      ? argv[argv.indexOf("--review-out") + 1]
      : "data/imports/review/events-source-url-review.csv",
    delayMs: argv.includes("--delay-ms")
      ? Number(argv[argv.indexOf("--delay-ms") + 1] || 600)
      : 600
  };
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

function getHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_error) {
    return "";
  }
}

function isMarathonDeSource(url) {
  return [
    "marathon.de",
    "www.marathon.de"
  ].includes(getHost(url));
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
      ![
        "marathon.de",
        "www.marathon.de"
      ].includes(parsed.hostname.toLowerCase())
    );
  } catch (_error) {
    return false;
  }
}

async function fetchPage(url) {
  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "SportEventMap/1.0 official URL resolver"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

function findOfficialEventUrl(html) {
  const homepageIndex =
    html.search(/Homepage:/i);

  if (homepageIndex >= 0) {
    const homepageBlock =
      html.slice(
        homepageIndex,
        homepageIndex + 1600
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

async function main() {
  const args =
    parseArgs(process.argv);

  const rows =
    parseCsvFile(args.input);

  const review = [];
  let fixed = 0;

  for (const row of rows) {
    if (!isMarathonDeSource(row.event_url)) {
      continue;
    }

    try {
      const html =
        await fetchPage(row.event_url);

      const officialUrl =
        findOfficialEventUrl(html);

      if (officialUrl) {
        row.description =
          cleanValue(row.description)
            .replace(
              /\s*Source listing:\s*https?:\/\/www\.marathon\.de\/\S+/i,
              ""
            );

        row.event_url =
          officialUrl;

        fixed += 1;
      } else {
        review.push({
          event_name: row.event_name,
          date: row.date,
          city: row.city,
          country: row.country,
          current_url: row.event_url,
          reason: "No external official URL found on marathon.de detail page"
        });
      }
    } catch (error) {
      review.push({
        event_name: row.event_name,
        date: row.date,
        city: row.city,
        country: row.country,
        current_url: row.event_url,
        reason: error.message
      });
    }

    await delay(args.delayMs);
  }

  writeCsvFile(
    args.out,
    rows
  );

  writeCsvFile(
    args.reviewOut,
    review
  );

  console.log(`Fixed source URLs: ${fixed}`);
  console.log(`Still needs URL review: ${review.length}`);
  console.log(`Wrote: ${args.out}`);
  console.log(`Review: ${args.reviewOut}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
