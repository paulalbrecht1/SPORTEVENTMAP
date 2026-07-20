const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT = "data/events.csv";
const DEFAULT_OUT = "data/events.csv";
const DEFAULT_REVIEW = "data/imports/review/past-event-date-refresh-review.csv";
const DEFAULT_REPORT = "data/imports/review/past-event-date-refresh-report.json";
const DEFAULT_DETAILS = "data/event-detail-database.json";
const TODAY = new Date(2026, 6, 10);

const MONTHS = {
  januar: 1,
  january: 1,
  jan: 1,
  februar: 2,
  february: 2,
  feb: 2,
  maerz: 3,
  märz: 3,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mai: 5,
  may: 5,
  juni: 6,
  june: 6,
  jun: 6,
  juli: 7,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  oktober: 10,
  october: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nov: 11,
  dezember: 12,
  december: 12,
  dez: 12,
  dec: 12
};

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    out: DEFAULT_OUT,
    review: DEFAULT_REVIEW,
    report: DEFAULT_REPORT,
    details: DEFAULT_DETAILS,
    limit: 0,
    concurrency: 5,
    timeoutMs: 12000,
    dryRun: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--input") {
      args.input = argv[index + 1] || args.input;
      index += 1;
      continue;
    }

    if (value === "--out") {
      args.out = argv[index + 1] || args.out;
      index += 1;
      continue;
    }

    if (value === "--review") {
      args.review = argv[index + 1] || args.review;
      index += 1;
      continue;
    }

    if (value === "--report") {
      args.report = argv[index + 1] || args.report;
      index += 1;
      continue;
    }

    if (value === "--details") {
      args.details = argv[index + 1] || args.details;
      index += 1;
      continue;
    }

    if (value === "--limit") {
      args.limit = Number(argv[index + 1] || 0);
      index += 1;
      continue;
    }

    if (value === "--concurrency") {
      args.concurrency = Number(argv[index + 1] || args.concurrency);
      index += 1;
      continue;
    }

    if (value === "--timeout-ms") {
      args.timeoutMs = Number(argv[index + 1] || args.timeoutMs);
      index += 1;
      continue;
    }

    if (value === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function projectPath(filePath) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(ROOT, filePath);
}

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });
}

function escapeCsv(value) {
  const text = cleanValue(value);

  if (text.includes(";") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function writeReviewCsv(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const columns = [
    "action",
    "reason",
    "event_name",
    "old_date",
    "new_date",
    "city",
    "country",
    "event_url",
    "final_url",
    "confidence",
    "candidate_count",
    "candidates",
    "note"
  ];

  const lines = [
    columns.join(";"),
    ...rows.map(row =>
      columns
        .map(column => escapeCsv(row[column]))
        .join(";")
    )
  ];

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function makeDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseGermanDate(value) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(cleanValue(value));

  if (!match) {
    return null;
  }

  return makeDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

function formatGermanDate(date) {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear())
  ].join(".");
}

function formatIsoDate(date) {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&auml;/gi, "ä")
    .replace(/&Auml;/g, "Ä")
    .replace(/&szlig;/gi, "ß")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function stripHtml(html) {
  return cleanValue(
    decodeEntities(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function normalizeText(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugPart(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ÃŸ/g, "ss")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function yearFromDate(value) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(cleanValue(value));
  return match ? match[3] : "";
}

function simpleSlug(eventName, date) {
  return slugPart([eventName, yearFromDate(date)].filter(Boolean).join(" "));
}

function isUsefulUrl(value) {
  try {
    const url = new URL(cleanValue(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

async function fetchPage(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "SportEventMap/1.0 date refresh audit"
      }
    });

    const html = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      html,
      text: stripHtml(html)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function contextAround(text, index, length) {
  return text.slice(Math.max(0, index - 180), Math.min(text.length, index + length + 180));
}

function pushCandidate(candidates, date, raw, context, kind) {
  if (!date || date <= TODAY || date.getFullYear() > TODAY.getFullYear() + 2) {
    return;
  }

  candidates.push({
    date,
    dateText: formatGermanDate(date),
    iso: formatIsoDate(date),
    raw: cleanValue(raw),
    context: cleanValue(context),
    kind
  });
}

function extractDateCandidates(text, html) {
  const haystacks = [
    {
      value: text,
      kind: "visible_text"
    },
    {
      value: decodeEntities(html),
      kind: "html"
    }
  ];

  const candidates = [];

  for (const haystack of haystacks) {
    const value = haystack.value || "";

    for (const match of value.matchAll(/\b(20[2-8]\d)[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/g)) {
      pushCandidate(
        candidates,
        makeDate(Number(match[1]), Number(match[2]), Number(match[3])),
        match[0],
        contextAround(value, match.index, match[0].length),
        haystack.kind
      );
    }

    for (const match of value.matchAll(/\b(0?[1-9]|[12]\d|3[01])\.(0?[1-9]|1[0-2])\.(20[2-8]\d)\b/g)) {
      pushCandidate(
        candidates,
        makeDate(Number(match[3]), Number(match[2]), Number(match[1])),
        match[0],
        contextAround(value, match.index, match[0].length),
        haystack.kind
      );
    }

    for (const match of value.matchAll(/\b(0?[1-9]|[12]\d|3[01])\s*[-/.]\s*(0?[1-9]|1[0-2])\s*[-/.]\s*(20[2-8]\d)\b/g)) {
      pushCandidate(
        candidates,
        makeDate(Number(match[3]), Number(match[2]), Number(match[1])),
        match[0],
        contextAround(value, match.index, match[0].length),
        haystack.kind
      );
    }

    const monthPattern = Object.keys(MONTHS).join("|");
    const textDatePattern = new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])\\.?\\s+(${monthPattern})\\s+(20[2-8]\\d)\\b`, "gi");

    for (const match of value.matchAll(textDatePattern)) {
      const month = MONTHS[match[2].toLowerCase()];

      pushCandidate(
        candidates,
        makeDate(Number(match[3]), month, Number(match[1])),
        match[0],
        contextAround(value, match.index, match[0].length),
        haystack.kind
      );
    }

    const monthFirstPattern = new RegExp(`\\b(${monthPattern})\\s+(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?[,]?\\s+(20[2-8]\\d)\\b`, "gi");

    for (const match of value.matchAll(monthFirstPattern)) {
      const month = MONTHS[match[1].toLowerCase()];

      pushCandidate(
        candidates,
        makeDate(Number(match[3]), month, Number(match[2])),
        match[0],
        contextAround(value, match.index, match[0].length),
        haystack.kind
      );
    }
  }

  return candidates;
}

function scoreCandidate(candidate, event) {
  const context = normalizeText(candidate.context);
  const eventName = normalizeText(event.event_name);
  const city = normalizeText(event.city);
  const sport = normalizeText(event.sport);
  const distance = normalizeText(event.distance);
  const oldYear = Number(yearFromDate(event.date));
  let score = 0;

  if (candidate.date.getFullYear() > oldYear) {
    score += 3;
  }

  if (candidate.date.getFullYear() === oldYear && candidate.date > TODAY) {
    score += 1;
  }

  if (candidate.kind === "html") {
    score += 1;
  }

  if (context.includes("date") || context.includes("datum") || context.includes("termin") || context.includes("event date")) {
    score += 3;
  }

  if (context.includes("registration") || context.includes("anmeldung") || context.includes("register") || context.includes("jetzt anmelden")) {
    score += 2;
  }

  if (context.includes("marathon") || context.includes("triathlon") || context.includes("lauf") || context.includes("trail") || context.includes("race")) {
    score += 2;
  }

  if (eventName && context.includes(eventName.slice(0, Math.min(28, eventName.length)))) {
    score += 3;
  }

  if (city && context.includes(city)) {
    score += 2;
  }

  if (sport && context.includes(sport)) {
    score += 1;
  }

  if (distance && distance.length < 40 && context.includes(distance)) {
    score += 1;
  }

  if (/results?|ergebnisse?|photos?|bilder|archive|archiv|ranking|past|history|historie|rückblick|review/i.test(candidate.context)) {
    score -= 5;
  }

  if (/copyright|footer|newsletter|privacy|datenschutz|impressum/i.test(candidate.context)) {
    score -= 2;
  }

  return score;
}

function chooseDate(candidates, event) {
  const grouped = new Map();

  for (const candidate of candidates) {
    const key = candidate.dateText;
    const current = grouped.get(key) || {
      date: candidate.date,
      dateText: candidate.dateText,
      iso: candidate.iso,
      raw: new Set(),
      contexts: [],
      score: 0,
      occurrences: 0
    };

    current.raw.add(candidate.raw);
    current.contexts.push(candidate.context);
    current.score += scoreCandidate(candidate, event);
    current.occurrences += 1;
    grouped.set(key, current);
  }

  const scored = [...grouped.values()]
    .map(candidate => ({
      ...candidate,
      raw: [...candidate.raw].join(" | "),
      score: candidate.score + Math.min(candidate.occurrences, 5)
    }))
    .sort((a, b) => b.score - a.score || a.date - b.date);

  const best = scored[0];
  const second = scored[1];
  const oldYear = Number(yearFromDate(event.date));
  const oldDate = parseGermanDate(event.date);

  if (!best) {
    return {
      action: "review",
      reason: "no_future_date_found",
      candidates: scored
    };
  }

  if (best.score < 8) {
    return {
      action: "review",
      reason: "low_confidence_date",
      candidates: scored
    };
  }

  if (best.date.getFullYear() <= oldYear) {
    return {
      action: "review",
      reason: "future_date_same_event_year",
      candidates: scored
    };
  }

  if (best.score < 18) {
    return {
      action: "review",
      reason: "below_safe_auto_update_threshold",
      candidates: scored
    };
  }

  if (oldDate) {
    const oldMonthDay = makeDate(2000, oldDate.getMonth() + 1, oldDate.getDate());
    const newMonthDay = makeDate(2000, best.date.getMonth() + 1, best.date.getDate());
    const dayDistance = Math.abs(Math.round((newMonthDay - oldMonthDay) / 86400000));
    const wrappedDistance = Math.min(dayDistance, 366 - dayDistance);

    if (wrappedDistance > 60 && best.score < 50) {
      return {
        action: "review",
        reason: "new_date_too_far_from_annual_window",
        candidates: scored
      };
    }
  }

  if (second && second.score >= best.score - 2 && second.dateText !== best.dateText) {
    return {
      action: "review",
      reason: "ambiguous_future_dates",
      candidates: scored
    };
  }

  return {
    action: "update",
    reason: "single_high_confidence_future_date",
    selected: best,
    candidates: scored
  };
}

function reviewRow(event, action, reason, page, selected, candidates, note) {
  return {
    action,
    reason,
    event_name: event.event_name,
    old_date: event.date,
    new_date: selected ? selected.dateText : "",
    city: event.city,
    country: event.country,
    event_url: event.event_url,
    final_url: page ? page.finalUrl : "",
    confidence: selected ? String(selected.score) : "",
    candidate_count: String(candidates.length),
    candidates: candidates.slice(0, 8).map(candidate => `${candidate.dateText}(${candidate.score})`).join(", "),
    note
  };
}

async function inspectEvent(event, args) {
  const oldDate = parseGermanDate(event.date);

  if (!oldDate || oldDate >= TODAY) {
    return {
      event,
      changed: null,
      review: null
    };
  }

  const url = cleanValue(event.event_url || event.source_url);

  if (!isUsefulUrl(url)) {
    return {
      event,
      changed: null,
      review: reviewRow(event, "review", "missing_or_invalid_url", null, null, [], "No usable official URL is available.")
    };
  }

  let page;

  try {
    page = await fetchPage(url, args.timeoutMs);
  } catch (error) {
    return {
      event,
      changed: null,
      review: reviewRow(event, "review", "fetch_failed", null, null, [], error.message)
    };
  }

  if (!page.ok) {
    return {
      event,
      changed: null,
      review: reviewRow(event, "review", "http_error", page, null, [], `HTTP ${page.status}`)
    };
  }

  const candidates = extractDateCandidates(page.text, page.html);
  const decision = chooseDate(candidates, event);

  if (decision.action !== "update") {
    return {
      event,
      changed: null,
      review: reviewRow(event, "review", decision.reason, page, null, decision.candidates, "No automatic date update applied.")
    };
  }

  const selected = decision.selected;
  const updated = {
    ...event,
    date: selected.dateText,
    event_url: page.finalUrl || event.event_url,
    source_url: page.finalUrl || event.source_url || event.event_url,
    verification_status: "date_refreshed",
    last_checked: "10.07.2026",
    next_check: "10.08.2026",
    source_note: cleanValue(
      `${event.source_note} Date refreshed locally on 10.07.2026 after official website showed ${selected.dateText}. Previous date: ${event.date}.`
    )
  };

  return {
    event: updated,
    changed: {
      event_name: event.event_name,
      old_date: event.date,
      new_date: selected.dateText,
      old_slug: simpleSlug(event.event_name, event.date),
      new_slug: simpleSlug(event.event_name, selected.dateText),
      score: selected.score,
      final_url: page.finalUrl || event.event_url
    },
    review: reviewRow(event, "updated", decision.reason, page, selected, decision.candidates, `Updated ${event.date} -> ${selected.dateText}.`)
  };
}

function applyDetailDateUpdates(detailsPath, changes) {
  const absolutePath = projectPath(detailsPath);

  if (!fs.existsSync(absolutePath)) {
    return {
      updated: 0,
      skipped: changes.length
    };
  }

  const details = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  let updated = 0;

  for (const change of changes) {
    const detail = details.find(entry => entry.event_slug === change.old_slug);

    if (!detail || change.old_slug === change.new_slug) {
      continue;
    }

    detail.event_slug = change.new_slug;
    detail.last_checked = "2026-07-10";
    detail.next_check = "2026-08-10";
    detail.source_note = cleanValue(
      `${detail.source_note || ""} Event slug rolled forward locally from ${change.old_slug} to ${change.new_slug} after official date refresh.`
    );

    if (detail.basis) {
      detail.basis.event_date = change.new_date.split(".").reverse().join("-");
      detail.basis.display_date = change.new_date;
      detail.basis.event_status = "Scheduled";
      detail.basis.data_quality_note = cleanValue(
        `${detail.basis.data_quality_note || ""} Date rolled forward from ${change.old_date} to ${change.new_date} on 10.07.2026.`
      );
    }

    if (detail.race_day) {
      detail.race_day.race_day = change.new_date;
      detail.race_day.verification_note = cleanValue(
        `${detail.race_day.verification_note || ""} Race-day date rolled forward from ${change.old_date} to ${change.new_date}; start times and cutoff values should be rechecked.`
      );
    }

    updated += 1;
  }

  fs.writeFileSync(absolutePath, `${JSON.stringify(details, null, 2)}\n`, "utf8");

  return {
    updated,
    skipped: changes.length - updated
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const inputPath = projectPath(args.input);
  const rows = parseCsvFile(inputPath);
  const pastIndexes = rows
    .map((event, index) => ({
      event,
      index,
      date: parseGermanDate(event.date)
    }))
    .filter(row => row.date && row.date < TODAY);

  const queue = args.limit > 0
    ? pastIndexes.slice(0, args.limit)
    : pastIndexes;

  const reviews = [];
  const changes = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < queue.length) {
      const itemIndex = nextIndex;
      nextIndex += 1;

      const item = queue[itemIndex];
      const result = await inspectEvent(item.event, args);
      rows[item.index] = result.event;

      if (result.changed) {
        changes.push(result.changed);
      }

      if (result.review) {
        reviews.push(result.review);
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

  const detailUpdateResult = args.dryRun
    ? {
      updated: 0,
      skipped: changes.length
    }
    : applyDetailDateUpdates(args.details, changes);

  const report = {
    generated_at: new Date().toISOString(),
    today: "2026-07-10",
    input: args.input,
    output: args.out,
    checked_past_events: queue.length,
    total_past_events: pastIndexes.length,
    updated_events: changes.length,
    review_events: reviews.filter(row => row.action === "review").length,
    detail_records_updated: detailUpdateResult.updated,
    detail_records_skipped: detailUpdateResult.skipped,
    dry_run: args.dryRun,
    changes
  };

  if (!args.dryRun) {
    writeCsvFile(projectPath(args.out), rows);
  }

  writeReviewCsv(projectPath(args.review), reviews);
  writeJsonFile(projectPath(args.report), report);

  console.log(`Past events checked: ${queue.length}/${pastIndexes.length}`);
  console.log(`Updated events: ${changes.length}`);
  console.log(`Review events: ${report.review_events}`);
  console.log(`Detail records updated: ${detailUpdateResult.updated}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
