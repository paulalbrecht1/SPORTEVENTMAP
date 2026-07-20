const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const NON_OFFICIAL_DOMAINS = [
  "marathon.de",
  "laufrennen.de",
  "kilometerliebe.de",
  "transition.fun",
  "ahotu.com",
  "runsignup.com"
];

const KNOWN_REGISTRATION_DOMAINS = [
  "ironman.com",
  "raceresult.com",
  "my.raceresult.com",
  "davengo.com",
  "time2finish.de",
  "mika-timing.de",
  "maxfunsports.com",
  "njuko.net",
  "eventbrite.com",
  "active.com"
];

const REGISTRATION_PATTERNS = [
  /\banmeldung\b/i,
  /\banmelden\b/i,
  /\bregistrierung\b/i,
  /\bregistration\b/i,
  /\bregister\b/i,
  /\bregister now\b/i,
  /\bentry\b/i,
  /\bentries\b/i,
  /\banmeldeportal\b/i,
  /\bteilnehmeranmeldung\b/i,
  /\bstartplatz\b/i,
  /\bstartplätze\b/i,
  /\bstartplaetze\b/i,
  /\bmelden\b/i,
  /\bmelde dich\b/i,
  /\bmeldeportal\b/i,
  /\bonline melden\b/i
];

const EVENT_PATTERNS = [
  /\bmarathon\b/i,
  /\bhalbmarathon\b/i,
  /\bhalf marathon\b/i,
  /\btriathlon\b/i,
  /\bironman\b/i,
  /\bultra\b/i,
  /\blauf\b/i,
  /\brace\b/i,
  /\btrail\b/i
];

const SOLD_OUT_PATTERNS = [
  /\bsold\s*out\b/i,
  /\bregistration\s+sold\s*out\b/i,
  /\bgeneral\s+registration\s+sold\s*out\b/i,
  /\bausverkauft\b/i,
  /\bstartpl[aÃ¤]tze\s+ausverkauft\b/i,
  /\bfully\s+booked\b/i,
  /\bregistration\s+closed\b/i,
  /\banmeldung\s+geschlossen\b/i
];

const OPEN_REGISTRATION_PATTERNS = [
  /\bregistration\s+now\s+open\b/i,
  /\bregister\s+now\b/i,
  /\banmeldung\s+ge[Ã¶o]ffnet\b/i,
  /\bjetzt\s+anmelden\b/i,
  /\bmeldung\s+offen\b/i
];

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv[3] || "data/events.verified-registration.csv",
    review:
      argv[4] ||
      "data/imports/review/events.registration-review.csv",
    report:
      argv[5] ||
      "data/imports/review/events.registration-verification-report.json",
    limit: Number(argv[6] || 2000),
    concurrency: Number(argv[7] || 8),
    timeoutMs: Number(argv[8] || 12000)
  };
}

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(
    path.dirname(filePath),
    {
      recursive: true
    }
  );
}

function escapeCsv(value) {
  const text =
    cleanValue(value);

  if (
    text.includes(";") ||
    text.includes("\"") ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function writeReviewCsv(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const columns = [
    "review_reason",
    "event_name",
    "date",
    "city",
    "country",
    "sport",
    "distance",
    "event_url",
    "source_url",
    "verification_status",
    "page_status",
    "date_signal",
    "registration_signal",
    "detected_registration_status",
    "note"
  ];

  const lines = [
    columns.join(";"),
    ...rows.map(row =>
      columns
        .map(column =>
          escapeCsv(row[column])
        )
        .join(";")
    )
  ];

  fs.writeFileSync(
    filePath,
    `${lines.join("\n")}\n`,
    "utf8"
  );
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

function getDateSignals(date) {
  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
      cleanValue(date)
    );

  if (!match) {
    return [];
  }

  const day =
    match[1].replace(/^0/, "");

  const month =
    match[2].replace(/^0/, "");

  const year =
    match[3];

  const monthNames = {
    "01": ["januar", "january", "jan"],
    "02": ["februar", "february", "feb"],
    "03": ["märz", "maerz", "march", "mar"],
    "04": ["april", "apr"],
    "05": ["mai", "may"],
    "06": ["juni", "june", "jun"],
    "07": ["juli", "july", "jul"],
    "08": ["august", "aug"],
    "09": ["september", "sep"],
    "10": ["oktober", "october", "okt", "oct"],
    "11": ["november", "nov"],
    "12": ["dezember", "december", "dez", "dec"]
  };

  const textMonthSignals =
    (monthNames[match[2]] || [])
      .flatMap(name => [
        `${day}. ${name} ${year}`,
        `${day} ${name} ${year}`,
        `${match[1]}. ${name} ${year}`,
        `${match[1]} ${name} ${year}`
      ]);

  return [
    `${match[1]}.${match[2]}.${year}`,
    `${day}.${month}.${year}`,
    `${match[1]}/${match[2]}/${year}`,
    `${year}-${match[2]}-${match[1]}`,
    ...textMonthSignals
  ];
}

function parseGermanDate(value) {
  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
      cleanValue(value)
    );

  if (!match) {
    return null;
  }

  const date =
    new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );

  if (
    date.getFullYear() !== Number(match[3]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[1])
  ) {
    return null;
  }

  date.setHours(0, 0, 0, 0);

  return date;
}

function isNonOfficialUrl(url) {
  const lowerUrl =
    cleanValue(url)
      .toLowerCase();

  const host =
    getHostname(url);

  return (
    /\/blog|blogartikel|\/news|\/artikel|\/post|\/beitrag/.test(lowerUrl) ||
    /blogspot\.|wordpress\.com|jimdosite\.com/.test(host) ||
    NON_OFFICIAL_DOMAINS.some(domain =>
      host === domain ||
      host.endsWith(`.${domain}`)
    )
  );
}

function isKnownRegistrationHost(url) {
  const host =
    getHostname(url);

  return KNOWN_REGISTRATION_DOMAINS.some(domain =>
    host === domain ||
    host.endsWith(`.${domain}`)
  );
}

function stripHtml(html) {
  return cleanValue(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&uuml;/g, "ü")
      .replace(/&ouml;/g, "ö")
      .replace(/&auml;/g, "ä")
      .replace(/&szlig;/g, "ß")
  );
}

async function fetchPage(url, timeoutMs) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "SportEventMap/1.0 event quality verification"
        }
      });

    const text =
      await response.text();

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      text: stripHtml(text)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function hasRegistrationSignal(text, event) {
  const combined =
    `${text} ${event.event_url} ${event.source_url}`;

  return REGISTRATION_PATTERNS.some(pattern =>
    pattern.test(combined)
  );
}

function hasEventSignal(text, event) {
  const combined =
    `${text} ${event.event_name} ${event.distance} ${event.sport}`;

  return EVENT_PATTERNS.some(pattern =>
    pattern.test(combined)
  );
}

function hasDateSignal(text, event) {
  const signals =
    getDateSignals(event.date);

  if (!signals.length) {
    return false;
  }

  const normalizedText =
    text
      .toLowerCase()
      .replace(/\s+/g, " ");

  return signals.some(signal =>
    normalizedText.includes(
      signal.toLowerCase()
    )
  );
}

function detectRegistrationStatus(text) {
  if (
    SOLD_OUT_PATTERNS.some(pattern =>
      pattern.test(text)
    )
  ) {
    return "sold_out";
  }

  if (
    OPEN_REGISTRATION_PATTERNS.some(pattern =>
      pattern.test(text)
    )
  ) {
    return "registration_open";
  }

  return "confirmed";
}

function reviewRow(event, reason, result, note) {
  return {
    ...event,
    review_reason: reason,
    page_status:
      result
        ? String(result.status)
        : "",
    date_signal:
      result && result.dateSignal
        ? "yes"
        : "no",
    registration_signal:
      result && result.registrationSignal
        ? "yes"
        : "no",
    detected_registration_status:
      result && result.detectedRegistrationStatus
        ? result.detectedRegistrationStatus
        : "",
    note
  };
}

async function verifyEvent(event, args) {
  const url =
    cleanValue(event.event_url);

  if (!url) {
    return {
      keep: false,
      event,
      review:
        reviewRow(
          event,
          "missing_url",
          null,
          "No event URL is available."
        )
    };
  }

  const eventDate =
    parseGermanDate(event.date);

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  if (!eventDate) {
    return {
      keep: false,
      event,
      review:
        reviewRow(
          event,
          "invalid_date",
          null,
          "Event date is missing or invalid."
        )
    };
  }

  if (eventDate < today) {
    return {
      keep: false,
      event,
      review:
        reviewRow(
          event,
          "past_date",
          null,
          "Event date is in the past and needs a new official date before it can be public."
        )
    };
  }

  if (isNonOfficialUrl(url)) {
    return {
      keep: false,
      event,
      review:
        reviewRow(
          event,
          "non_official_url",
          null,
          "URL is an aggregator, blog, or news page."
        )
    };
  }

  let page;

  try {
    page =
      await fetchPage(url, args.timeoutMs);
  } catch (error) {
    return {
      keep: false,
      event,
      review:
        reviewRow(
          event,
          "unreachable_url",
          {
            status: "",
            dateSignal: false,
            registrationSignal: false
          },
          error.message
        )
    };
  }

  const registrationSignal =
    isKnownRegistrationHost(page.finalUrl || url) ||
    hasRegistrationSignal(page.text, event);

  const eventSignal =
    hasEventSignal(page.text, event);

  const dateSignal =
    hasDateSignal(page.text, event);

  const result = {
    status: page.status,
    registrationSignal,
    dateSignal,
    detectedRegistrationStatus:
      detectRegistrationStatus(page.text)
  };

  if (!page.ok) {
    return {
      keep: false,
      event,
      review:
        reviewRow(
          event,
          "unreachable_url",
          result,
          `HTTP status ${page.status}.`
        )
    };
  }

  if (!registrationSignal) {
    return {
      keep: false,
      event,
      review:
        reviewRow(
          event,
          "missing_registration_signal",
          result,
          "Official registration/anmeldung signal was not found on the page."
        )
    };
  }

  if (!eventSignal) {
    return {
      keep: false,
      event,
      review:
        reviewRow(
          event,
          "missing_event_signal",
          result,
          "The page is reachable but does not clearly look like an endurance event page."
        )
    };
  }

  if (!dateSignal) {
    return {
      keep: false,
      event,
      review:
        reviewRow(
          event,
          "date_needs_confirmation",
          result,
          "Registration page is valid, but the configured event date was not found on the page."
        )
    };
  }

  return {
    keep: true,
    event: {
      ...event,
      event_url:
        page.finalUrl || event.event_url,
      source_url:
        page.finalUrl || event.source_url || event.event_url,
      verification_status:
        result.detectedRegistrationStatus,
      source_note:
        cleanValue(
          `${event.source_note} Live URL verification: official registration signal and exact date signal found. Detected registration status: ${result.detectedRegistrationStatus}.`
        )
    },
    review: null
  };
}

async function main() {
  const args =
    parseArgs(process.argv);

  const events =
    parseCsvFile(args.input)
      .slice(0, args.limit);

  const kept = [];
  const review = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < events.length) {
      const index =
        nextIndex;

      nextIndex += 1;

      const result =
        await verifyEvent(events[index], args);

      if (result.keep) {
        kept.push(result.event);
      }

      if (result.review) {
        review.push(result.review);
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

  const reviewCounts =
    review.reduce((counts, event) => {
      counts[event.review_reason] =
        (counts[event.review_reason] || 0) + 1;

      return counts;
    }, {});

  writeCsvFile(args.out, kept);
  writeReviewCsv(args.review, review);
  writeJsonFile(args.report, {
    generated_at: new Date().toISOString(),
    input: args.input,
    output: args.out,
    review: args.review,
    checked_events: events.length,
    kept_events: kept.length,
    review_events: review.length,
    review_counts: reviewCounts
  });

  console.log(`Checked events: ${events.length}`);
  console.log(`Kept events: ${kept.length}`);
  console.log(`Review events: ${review.length}`);
  console.log(reviewCounts);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
