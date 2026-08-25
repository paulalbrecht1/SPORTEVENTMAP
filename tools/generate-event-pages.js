const fs = require("fs");
const path = require("path");
const {
  parseCsvFile
} = require("./event-table-utils.js");

const ROOT = path.resolve(__dirname, "..");
const EVENTS_PATH = path.join(ROOT, "data", "events.csv");
const PRIORITY_EVENTS_PATH = path.join(ROOT, "data", "priority-detail-events.json");
const CATEGORY_DETAILS_PATH = path.join(ROOT, "data", "event-category-details.csv");
const CATEGORY_DETAILS_JSON_PATH = path.join(ROOT, "data", "event-category-details.json");
const EVENT_KNOWLEDGE_PATH = path.join(ROOT, "data", "event-knowledge.json");
const EVENT_DETAIL_DATABASE_PATH = path.join(ROOT, "data", "event-detail-database.json");
const EVENT_ARCHIVE_PATH = path.join(ROOT, "data", "event-editions-public.json");
const EVENT_DIR = path.join(ROOT, "event");
const MANIFEST_PATH = path.join(ROOT, "data", "event-pages.json");
const SITE_URL = "https://sporteventmap.com";


function clean(value) {
  return String(value || "").trim();
}

function stripTags(value) {
  return clean(value).replace(/<[^>]+>/g, "");
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJson(value) {
  return JSON.stringify(value);
}

function slugPart(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getEventYear(event) {
  const date = clean(event.date);
  const germanMatch = date.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  const isoMatch = date.match(/\b(\d{4})-\d{2}-\d{2}\b/);

  if (germanMatch) {
    return germanMatch[3];
  }

  if (isoMatch) {
    return isoMatch[1];
  }

  return "";
}

function createSlug(event, seenSlugs) {
  const suppliedSlug = slugPart(event.edition_slug);
  if (suppliedSlug && !seenSlugs.has(suppliedSlug)) {
    seenSlugs.add(suppliedSlug);
    return suppliedSlug;
  }
  const baseParts = [
    event.event_name,
    getEventYear(event)
  ].filter(Boolean);

  let slug = slugPart(baseParts.join(" "));

  if (seenSlugs.has(slug)) {
    slug = slugPart([
      event.event_name,
      event.city,
      getEventYear(event)
    ].filter(Boolean).join(" "));
  }

  let uniqueSlug = slug;
  let suffix = 2;

  while (seenSlugs.has(uniqueSlug)) {
    uniqueSlug = `${slug}-${suffix}`;
    suffix += 1;
  }

  seenSlugs.add(uniqueSlug);
  return uniqueSlug;
}

function safeWebsite(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function normalizeStatus(value) {
  const status = clean(value).replace(/_/g, " ").toLowerCase();

  if (!status) {
    return "Registration status unclear";
  }

  if (status.includes("registration open")) {
    return "Registration open";
  }

  if (status.includes("not open")) {
    return "Registration not open yet";
  }

  if (status.includes("sold out")) {
    return "Sold out";
  }

  if (status.includes("date expected")) {
    return "Date expected";
  }

  if (status.includes("unclear")) {
    return "Registration status unclear";
  }

  return status.replace(/\b\w/g, letter => letter.toUpperCase());
}

function getStatusExplanation(value) {
  const status = clean(value).toLowerCase();

  if (status.includes("registration_open")) {
    return "The current event data indicates that registration is open. Please verify final details on the official organizer website before registering.";
  }

  if (status.includes("registration_not_open")) {
    return "Registration is not confirmed as open yet. Check the official organizer website for the latest registration window.";
  }

  if (status.includes("sold_out")) {
    return "The event is currently marked as sold out in the event data. The organizer website remains the source of truth.";
  }

  if (status.includes("date_expected")) {
    return "The event is expected, but the next confirmed edition may still need verification from the organizer.";
  }

  if (status.includes("cancelled")) {
    return "This event is marked as cancelled. Please verify with the official organizer before making plans.";
  }

  return "The official event website is available, but the current registration status has not been fully verified yet. Please check the organizer website before planning or registering.";
}

function getPublicDescription(event, fallback) {
  const description = stripTags(event.description);

  if (
    !description ||
    /imported|staging|batch|review/i.test(description)
  ) {
    return fallback;
  }

  return description;
}

function schemaStatus(value) {
  const status = clean(value).toLowerCase();

  if (status.includes("cancel")) {
    return "https://schema.org/EventCancelled";
  }

  return "https://schema.org/EventScheduled";
}

function formatDateForSchema(value) {
  const date = clean(value);
  const germanMatch = date.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);

  if (germanMatch) {
    return `${germanMatch[3]}-${germanMatch[2]}-${germanMatch[1]}`;
  }

  return date;
}

function normalizeName(value) {
  return slugPart(value)
    .replace(/-/g, " ")
    .trim();
}

function loadPriorityEventNames() {
  if (!fs.existsSync(PRIORITY_EVENTS_PATH)) {
    throw new Error(`Missing priority event file: ${PRIORITY_EVENTS_PATH}`);
  }

  const names =
    JSON.parse(fs.readFileSync(PRIORITY_EVENTS_PATH, "utf8"));

  if (!Array.isArray(names) || !names.length) {
    throw new Error("Priority event list must be a non-empty JSON array.");
  }

  return names.map(clean).filter(Boolean);
}

function loadCategoryDetails() {
  if (fs.existsSync(CATEGORY_DETAILS_JSON_PATH)) {
    const structuredDetails =
      JSON.parse(fs.readFileSync(CATEGORY_DETAILS_JSON_PATH, "utf8"));

    if (Array.isArray(structuredDetails)) {
      return structuredDetails.reduce((detailsBySlug, eventDetails) => {
        const slug =
          clean(eventDetails.event_slug);
        const categories =
          Array.isArray(eventDetails.categories)
            ? eventDetails.categories
            : [];

        if (slug && categories.length) {
          detailsBySlug.set(
            slug,
            categories.map(category => ({
              ...category,
              event_name: clean(eventDetails.event_name),
              event_slug: slug
            }))
          );
        }

        return detailsBySlug;
      }, new Map());
    }
  }

  if (!fs.existsSync(CATEGORY_DETAILS_PATH)) {
    return new Map();
  }

  const rows =
    parseCsvFile(CATEGORY_DETAILS_PATH);

  return rows.reduce((detailsBySlug, row) => {
    const slug =
      clean(row.event_slug);

    if (!slug) {
      return detailsBySlug;
    }

    if (!detailsBySlug.has(slug)) {
      detailsBySlug.set(slug, []);
    }

    detailsBySlug.get(slug).push(row);
    return detailsBySlug;
  }, new Map());
}

function loadEventKnowledge() {
  if (!fs.existsSync(EVENT_KNOWLEDGE_PATH)) {
    return new Map();
  }

  const rows = JSON.parse(fs.readFileSync(EVENT_KNOWLEDGE_PATH, "utf8"));
  return new Map(
    rows
      .filter(row => clean(row.event_slug))
      .map(row => [clean(row.event_slug), row])
  );
}

function loadPublicArchive() {
  if (!fs.existsSync(EVENT_ARCHIVE_PATH)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(EVENT_ARCHIVE_PATH, "utf8"));
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.editions) ? parsed.editions : [];
}

function buildEditionHistorySection(event) {
  const results = Array.isArray(event.results) ? event.results : [];
  const isHistorical = clean(event.discovery_status) === "detail_only";
  if (!isHistorical && !results.length) {
    return "";
  }

  return `<section id="edition-history" class="event-detail-section event-detail-history">
    <div class="event-detail-section-heading">
      <span class="event-detail-kicker">Edition archive</span>
      <h2>${escapeHtml(getEventYear(event) || "Historical edition")}</h2>
    </div>
    ${isHistorical ? "<p>This edition has finished and is no longer shown on the discovery map. Its verified facts and results remain available for year-to-year comparison.</p>" : ""}
    ${results.length ? `<div class="event-detail-result-links">${results.map(result => {
      const url = safeWebsite(result.url);
      return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.title || "Official results")}</a>` : "";
    }).join("")}</div>` : "<p>Official results have not been published yet.</p>"}
  </section>`;
}

function loadEventDetailDatabase() {
  if (!fs.existsSync(EVENT_DETAIL_DATABASE_PATH)) {
    return new Map();
  }

  const rows =
    JSON.parse(fs.readFileSync(EVENT_DETAIL_DATABASE_PATH, "utf8"));

  const rowsBySlug = rows
    .filter(row => clean(row.event_slug))
    .reduce((map, row) => {
      const slug = clean(row.event_slug);
      if (!map.has(slug)) {
        map.set(slug, []);
      }
      map.get(slug).push(row);
      return map;
    }, new Map());

  return new Map(
    [...rowsBySlug.entries()].map(([slug, slugRows]) => [
      slug,
      composeRichDetailRecords(slugRows)
    ])
  );
}

function mergeDetailObjects(base = {}, overlay = {}) {
  return {
    ...(base && typeof base === "object" ? base : {}),
    ...(overlay && typeof overlay === "object" ? overlay : {})
  };
}

function composeRichDetailRecords(rows = []) {
  const usableRows = rows.filter(Boolean);
  if (!usableRows.length) {
    return null;
  }

  const brandRecord = usableRows.find(row => clean(row.knowledge_scope) === "brand");
  const editionRecord = usableRows.find(row => clean(row.knowledge_scope) === "edition");

  if (!brandRecord && !editionRecord) {
    return usableRows.at(-1);
  }

  const brand = brandRecord || {};
  const edition = editionRecord || {};
  const mergeSection = sectionName => mergeDetailObjects(
    brand[sectionName],
    edition[sectionName]
  );

  return {
    event_slug: clean(edition.event_slug || brand.event_slug),
    event_brand_id: edition.event_brand_id || brand.event_brand_id,
    edition_id: edition.edition_id,
    knowledge_scope: "resolved",
    brand: mergeDetailObjects(brand.basis, brand.brand),
    edition: mergeDetailObjects(edition.basis, edition.edition),
    verification_status: edition.verification_status,
    last_checked: edition.last_checked,
    verification: {
      brand: brandRecord ? {
        status: brand.verification_status,
        last_verified_at: brand.last_checked
      } : undefined,
      edition: editionRecord ? {
        status: edition.verification_status,
        last_verified_at: edition.last_checked
      } : undefined
    },
    registration: mergeSection("registration"),
    course: mergeSection("course"),
    race_day: mergeSection("race_day"),
    travel: mergeSection("travel"),
    weather: mergeSection("weather"),
    statistics: mergeSection("statistics"),
    editorial: mergeSection("editorial"),
    sources: [
      ...(Array.isArray(brand.sources) ? brand.sources : []),
      ...(Array.isArray(edition.sources) ? edition.sources : [])
    ],
    faq: [
      ...(Array.isArray(brand.faq) ? brand.faq : []),
      ...(Array.isArray(edition.faq) ? edition.faq : [])
    ]
  };
}

function findPriorityEvents(events, priorityNames) {
  const missing = [];
  const selected = [];
  const usedKeys = new Set();

  priorityNames.forEach(name => {
    const normalizedName =
      normalizeName(name);

    const match =
      events.find(event =>
        normalizeName(event.event_name) === normalizedName
      );

    if (!match) {
      missing.push(name);
      return;
    }

    const key =
      [
        normalizeName(match.event_name),
        clean(match.date),
        normalizeName(match.city)
      ].join("|");

    if (!usedKeys.has(key)) {
      selected.push(match);
      usedKeys.add(key);
    }
  });

  return {
    selected,
    missing
  };
}

function formatMoney(value, currency = "") {
  const text =
    clean(value);

  if (text) {
    const amount =
      /^\d+([.,]\d+)?$/.test(text)
        ? text.replace(".", ",")
        : text;

    if (/^eur$/i.test(currency)) {
      return `&euro;${escapeHtml(amount)}`;
    }

    if (/^gbp$/i.test(currency)) {
      return `&pound;${escapeHtml(amount)}`;
    }

    return `${escapeHtml(amount)}${currency ? ` ${escapeHtml(currency)}` : ""}`;
  }

  return "";
}

function detailBadge(label, tone = "neutral") {
  return `<span class="event-detail-badge ${tone}">${escapeHtml(label)}</span>`;
}

function formatDetailValue(value, fallback = "To be confirmed", tone = "neutral") {
  const text =
    clean(value);

  if (isMissingDetailValue(text)) {
    return detailBadge(formatMissingDetailLabel(text), tone);
  }

  if (text) {
    return escapeHtml(text);
  }

  return detailBadge(fallback, tone);
}

function isMissingDetailValue(value) {
  const text =
    clean(value).toLowerCase();

  if (!text) {
    return true;
  }

  return /^(n\/a|na|none|null|undefined|unknown|unclear|not available|not published yet|not verified|not yet verified|unverified|unavailable|to be confirmed|tba|tbd|needs verification|needs review|not confirmed)$/i
    .test(text);
}

function formatMissingDetailLabel(value) {
  const text =
    clean(value).toLowerCase();

  if (text === "unavailable") {
    return "Not available";
  }

  if (text === "needs verification") {
    return "To be confirmed";
  }

  return clean(value) || "To be confirmed";
}

function getFee2026(row) {
  const value =
    clean(row.fee_2026 || row.current_fee);

  return isMissingDetailValue(value) ? "" : value;
}

function getFee2025(row) {
  const value =
    clean(row.fee_2025 || row.previous_fee);

  return isMissingDetailValue(value) ? "" : value;
}

function warnInvalidDetailValue(row, fieldName, value, reason) {
  const eventLabel =
    clean(row.event_slug || row.event_name || "unknown event");
  const categoryLabel =
    clean(row.category_name || "category");

  if (!value) {
    return;
  }

  console.warn(
    `[event-detail-data] Ignored ${fieldName} for ${eventLabel} / ${categoryLabel}: "${value}" (${reason}).`
  );
}

function isRaceCutoffValue(value) {
  const text =
    clean(value);
  const normalized =
    text.toLowerCase();

  if (!text || isMissingDetailValue(text)) {
    return false;
  }

  if (/withdrawal|deferral|refund|registration|entry|deadline|cancel|cancellation|transfer/.test(normalized)) {
    return false;
  }

  return /(\b\d{1,2}:\d{2}\b)|(\b\d{1,2}\s*(h|hr|hrs|hour|hours)\b)|(\b\d{1,3}\s*(min|mins|minutes)\b)|cut[-\s]?off|cutoff/i
    .test(text);
}

function getValidatedRaceCutoff(row) {
  const candidates = [
    row.race_cutoff,
    row.overall_cutoff,
    row.cutoff,
    row.time_limit
  ];

  for (const candidate of candidates) {
    const value =
      clean(candidate);

    if (!value || isMissingDetailValue(value)) {
      continue;
    }

    if (isRaceCutoffValue(value)) {
      return value;
    }

    warnInvalidDetailValue(
      row,
      "cutoff",
      value,
      "cutoff fields must be race cutoff times or durations, not registration or withdrawal deadlines"
    );
  }

  return "";
}

function getCutoff(row) {
  return getValidatedRaceCutoff(row);
}

function isElevationValue(value) {
  const text =
    clean(value);

  if (!text || isMissingDetailValue(text)) {
    return false;
  }

  return /(\d[\d.,]*\s*(m|m\+|hm|meter|metres|meters|ft|feet|d\+))|elevation gain/i
    .test(text);
}

function getElevation(row) {
  const value =
    clean(row.elevation || row.elevation_gain);

  if (!value || isMissingDetailValue(value)) {
    return "";
  }

  if (isElevationValue(value)) {
    return value;
  }

  warnInvalidDetailValue(
    row,
    "elevation",
    value,
    "elevation fields must contain elevation gain or vertical metres/feet"
  );
  return "";
}

function inferRegistrationStatus(row) {
  const explicit =
    clean(row.registration_status);
  const feeTrend =
    clean(row.fee_trend).replace(/_/g, " ").toLowerCase();
  const reviewNote =
    clean(row.review_note).toLowerCase();

  if (explicit) {
    return explicit;
  }

  if (/sold out|ausgebucht/.test(reviewNote) || /sold out/.test(feeTrend)) {
    return "Sold out";
  }

  if (/registration open|open/.test(feeTrend)) {
    return "Registration open";
  }

  if (/not open/.test(feeTrend)) {
    return "Registration not open yet";
  }

  if (/inventory based/.test(feeTrend)) {
    return "Registration open";
  }

  return "";
}

function formatFeeCell(row, year) {
  const currency =
    clean(row.currency || "EUR");
  const value =
    year === "2026"
      ? getFee2026(row)
      : getFee2025(row);

  if (value) {
    return `
                  <div class="event-detail-fee">
                    <strong>${formatMoney(value, currency)}</strong>
                    ${detailBadge(year === "2026" ? "Verified 2026" : "Based on 2025 fee", year === "2026" ? "verified" : "reference")}
                  </div>`;
  }

  if (year === "2026" && getFee2025(row)) {
    return detailBadge("Not published yet", "pending");
  }

  return detailBadge("Not available", "muted");
}

function formatFeeSummary(row) {
  return `
              <div class="event-category-fee-panel">
                <span>2026 Entry Fee</span>
                ${formatFeeCell(row, "2026")}
                <small>2025 comparison</small>
                ${formatFeeCell(row, "2025")}
              </div>`;
}

function formatRegistrationCell(row) {
  const status =
    inferRegistrationStatus(row);
  const opens =
    clean(row.registration_opens);
  const normalizedStatus =
    clean(status).toLowerCase();

  if (/sold out/i.test(normalizedStatus)) {
    return detailBadge("Sold out", "sold-out");
  }

  if (/opening soon|opens soon/i.test(normalizedStatus)) {
    return detailBadge("Opening soon", "pending");
  }

  if (/not open/i.test(normalizedStatus)) {
    return detailBadge("Registration not open yet", "pending");
  }

  if (/registration open/i.test(normalizedStatus)) {
    return detailBadge("Registration open", "verified");
  }

  if (opens && !isMissingDetailValue(opens)) {
    return `
                  <div class="event-detail-registration">
                    ${detailBadge(`Opens ${opens}`, "pending")}
                  </div>`;
  }

  if (status) {
    return detailBadge(status, "neutral");
  }

  return detailBadge("To be confirmed", "neutral");
}

function formatSourceLink(row) {
  const url =
    safeWebsite(row.source_url || row.registration_url);

  if (!url) {
    return "";
  }

  const label =
    clean(row.source_label || "Official source");

  return `
                  <a class="event-detail-source-link" href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function detailIcon(name) {
  const paths = {
    calendar: '<path d="M7 2v3M17 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z"/>',
    location: '<path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/>',
    sport: '<path d="M8 20 11 4l5 16M9 14h6"/>',
    distance: '<path d="M4 17c3-8 13 0 16-8"/><path d="M4 17h4M16 9h4"/>',
    fee: '<path d="M8 7h8M8 12h7M8 17h5"/><path d="M17 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"/>',
    status: '<circle cx="12" cy="12" r="8"/><path d="m9 12 2 2 4-5"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    mountain: '<path d="m3 19 7-12 4 7 2-3 5 8H3Z"/>',
    info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
    question: '<path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.2 1-1.7 1.6-1.7 3.2"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
    map: '<path d="m9 18-5 2V6l5-2 6 2 5-2v14l-5 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    star: '<path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9L12 3Z"/>',
    external: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>'
  };

  return `<span class="event-detail-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${paths[name] || paths.info}</svg></span>`;
}

function detailChip(iconName, label, value) {
  const cleanValue = clean(value);

  if (!cleanValue) {
    return "";
  }

  return `<span class="event-detail-chip">${detailIcon(iconName)}<span>${escapeHtml(label)}</span><strong>${escapeHtml(cleanValue)}</strong></span>`;
}

function factCard(iconName, label, value) {
  return `<div class="event-detail-fact-card">
          ${detailIcon(iconName)}
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(clean(value) || "To be confirmed")}</strong>
        </div>`;
}

function categoryMetric(iconName, label, content) {
  return `<div class="event-category-metric">
          ${detailIcon(iconName)}
          <span>${escapeHtml(label)}</span>
          <strong>${content}</strong>
        </div>`;
}

function buildHeroChips(event, statusLabel) {
  return [
    detailChip("calendar", "Date", event.date || "Date expected"),
    detailChip("location", "Location", `${clean(event.city)}, ${clean(event.country)}`),
    detailChip("sport", "Sport", event.sport || "Endurance sport"),
    detailChip("distance", "Distance", formatDistanceSummary(event.distance) || "To be confirmed"),
    detailChip("status", "Status", statusLabel)
  ].join("");
}

function formatDistanceSummary(value) {
  const parts =
    clean(value)
      .split(/\s*\/\s*|\s*,\s*/)
      .map(clean)
      .filter(Boolean);

  const normalized =
    parts.map(part => part.toLowerCase());

  return parts
    .filter((part, index) => {
      const item =
        normalized[index];

      if (
        /^42([.,]195)?\s*km$/.test(item) &&
        normalized.some(candidate => /^marathon$/.test(candidate))
      ) {
        return false;
      }

      if (
        /^21([.,]0975)?\s*km$/.test(item) &&
        normalized.some(candidate => /half marathon|halbmarathon/.test(candidate))
      ) {
        return false;
      }

      return true;
    })
    .join(" / ") || clean(value);
}

function buildHighlights(event, detailRows = []) {
  const sport = clean(event.sport || "endurance sport");
  const distance = formatDistanceSummary(event.distance);
  const city = clean(event.city);
  const country = clean(event.country);
  const context = `${sport} ${distance} ${event.event_name}`;
  const hasTrail = /trail|ultra|mountain|alpine/i.test(context);
  const hasTriathlon = /triathlon|ironman|challenge/i.test(context);
  const hasMarathon = /marathon|42/.test(context.toLowerCase());
  const hasElevation = detailRows.some(row => Boolean(getElevation(row)));
  const hasCutoff = detailRows.some(row => Boolean(getCutoff(row)));
  const courseText =
    hasTrail || hasElevation
      ? "Expect a course profile where elevation, surface and weather can matter. Check the official route information before planning pacing or equipment."
      : hasTriathlon
        ? "Plan this race as a multi-discipline event. Review the official athlete guide for transition, course and race-day procedures."
        : hasMarathon
          ? "A road-running event where pacing, start logistics and registration timing are especially relevant for planning."
          : "Use the official event page to verify course format, start area and race-day logistics before committing.";
  const fitText =
    hasTriathlon
      ? "Best suited for athletes planning a structured triathlon season and comparing race timing, travel and distance fit."
      : hasTrail || hasElevation
        ? "Best suited for athletes who want to plan trail or ultra racing with enough time for terrain-specific preparation."
        : "Best suited for runners comparing date, location, distance and registration status while building a realistic season plan.";
  const planningText =
    hasCutoff
      ? "A verified race cutoff is available for at least one category. Use it as a planning signal and confirm the latest race guide before travel."
      : "Operational details such as start windows, cutoffs or fees may still be pending. Sport Event Map keeps uncertain fields empty instead of guessing.";

  return `
    <section id="highlights" class="event-detail-card">
      <h2>Why this event stands out</h2>
      <div class="event-detail-highlight-grid">
        <article>
          ${detailIcon("star")}
          <h3>Planning context</h3>
          <p>${escapeHtml(`${clean(event.event_name)} is listed as a ${sport} event in ${city}, ${country}. Use it to compare timing, distance and registration status against the rest of your season.`)}</p>
        </article>
        <article>
          ${detailIcon(hasTrail ? "mountain" : hasTriathlon ? "sport" : "distance")}
          <h3>Course character</h3>
          <p>${escapeHtml(courseText)}</p>
        </article>
        <article>
          ${detailIcon("check")}
          <h3>Good fit for</h3>
          <p>${escapeHtml(fitText)}</p>
        </article>
        <article>
          ${detailIcon("info")}
          <h3>Before you register</h3>
          <p>${escapeHtml(planningText)} Always confirm final details on the official organizer website.</p>
        </article>
      </div>
    </section>`;
}

function findKnowledgeValue(items = [], labelPattern) {
  if (!Array.isArray(items)) {
    return "";
  }

  const item = items.find(entry =>
    labelPattern.test(clean(entry && entry.label))
      && clean(entry && entry.value)
  );

  return item ? clean(item.value) : "";
}

function joinKnowledgeValues(items = [], labels = []) {
  if (!Array.isArray(items)) {
    return "";
  }

  const patterns =
    labels.map(label => new RegExp(label, "i"));

  return items
    .filter(entry =>
      patterns.some(pattern => pattern.test(clean(entry && entry.label)))
      && clean(entry && entry.value)
    )
    .map(entry => `${clean(entry.label)}: ${clean(entry.value)}`)
    .join(" ");
}

function buildFaq(event, detailRows = [], knowledge = null) {
  const statuses = detailRows.map(row => inferRegistrationStatus(row)).filter(Boolean);
  const hasOpen = statuses.some(status => /registration open/i.test(status));
  const hasSoldOut = statuses.some(status => /sold out/i.test(status));
  const hasClosed = statuses.some(status => /closed/i.test(status));
  const hasCategoryFacts = detailRows.some(row =>
    !isMissingDetailValue(row.start_time) ||
    !isMissingDetailValue(getCutoff(row)) ||
    !isMissingDetailValue(getElevation(row)) ||
    getFee2025(row) ||
    getFee2026(row)
  );
  const distance = formatDistanceSummary(event.distance);
  const context = `${event.sport} ${distance} ${event.event_name}`;
  const knowledgeRegistration =
    joinKnowledgeValues(knowledge && knowledge.registration_fees, [
      "registration status",
      "registration opening",
      "registration deadline",
      "entry fee",
      "fee"
    ]);
  const knowledgeFit =
    findKnowledgeValue(knowledge && knowledge.event_highlights, /best for|suitable/i);
  const knowledgeCourse =
    joinKnowledgeValues(knowledge && knowledge.course_details, [
      "swim",
      "bike",
      "run",
      "course",
      "start",
      "finish",
      "surface",
      "elevation"
    ]);
  const knowledgeSpectator =
    findKnowledgeValue(knowledge && knowledge.event_highlights, /spectator/i)
      || joinKnowledgeValues(knowledge && knowledge.travel_logistics, [
        "spectator",
        "public transport",
        "parking",
        "finish"
      ]);
  const registrationAnswer =
    knowledgeRegistration
      ? `${knowledgeRegistration} Use the official organizer website to confirm the latest registration conditions before booking travel.`
      : hasSoldOut
      ? "At least one listed category is marked as sold out. Use the official organizer website to confirm waitlist, transfer or future registration options."
      : hasClosed
        ? "At least one listed category is marked as closed. Check the official organizer website for the latest registration process."
        : hasOpen
          ? "At least one listed category is marked as open. Use the official organizer website to register and confirm the latest conditions."
          : "Registration timing is not fully verified in the current data. Use the official organizer website as the source of truth before planning or booking travel.";
  const suitableAnswer =
    knowledgeFit
      ? knowledgeFit
      : /triathlon|ironman|challenge/i.test(context)
      ? `${clean(event.event_name)} is best approached as a multi-discipline race where distance fit, travel logistics and race-week timing matter.`
      : /trail|ultra|mountain|alpine/i.test(context)
        ? `${clean(event.event_name)} is most useful for trail or ultra athletes who want enough time to plan terrain, elevation and recovery windows.`
        : `${clean(event.event_name)} helps runners compare date, location, distance and registration status while building a realistic race calendar.`;
  const courseAnswer =
    knowledgeCourse
      ? knowledgeCourse
      : hasCategoryFacts
      ? "Verified category details are shown above where available, including distance, start time, cutoff or elevation."
      : "Only verified course details are shown. If the organizer has not published specific category data yet, Sport Event Map leaves the field open rather than guessing.";
  const spectatorAnswer =
    knowledgeSpectator
      ? `${knowledgeSpectator} The map still shows an approximate event location, so use the official website for exact access and start-area information.`
      : "The map shows an approximate event location. Spectators should check the official website for exact start, finish and access information.";

  return `
      <div class="event-detail-faq-list">
        <article class="event-detail-faq-item">
          ${detailIcon("status")}
          <div>
            <h3>Is registration still open?</h3>
            <p>${escapeHtml(registrationAnswer)}</p>
          </div>
        </article>
        <article class="event-detail-faq-item">
          ${detailIcon("sport")}
          <div>
            <h3>Who is this event suitable for?</h3>
            <p>${escapeHtml(suitableAnswer)}</p>
          </div>
        </article>
        <article class="event-detail-faq-item">
          ${detailIcon("distance")}
          <div>
            <h3>What is the course like?</h3>
            <p>${escapeHtml(courseAnswer)}</p>
          </div>
        </article>
        <article class="event-detail-faq-item">
          ${detailIcon("location")}
          <div>
            <h3>What should spectators know?</h3>
            <p>${escapeHtml(spectatorAnswer)}</p>
          </div>
        </article>
        <article class="event-detail-faq-item">
          ${detailIcon("question")}
          <div>
            <h3>Why are some details missing?</h3>
            <p>Sport Event Map only displays verified information. If organizers have not published certain details yet, they remain empty instead of being guessed.</p>
          </div>
        </article>
      </div>`;
}

function knowledgeList(items = []) {
  const cleanItems =
    Array.isArray(items)
      ? items.filter(item => clean(item && item.label) && clean(item && item.value))
      : [];

  if (!cleanItems.length) {
    return "";
  }

  return cleanItems
    .map(item => `
        <article class="event-knowledge-item">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </article>`)
    .join("");
}

function knowledgeSources(sources = []) {
  const cleanSources =
    Array.isArray(sources)
      ? sources.filter(source => safeWebsite(source && source.url))
      : [];

  if (!cleanSources.length) {
    return "";
  }

  return `
      <div class="event-knowledge-sources">
        ${cleanSources.map(source => `
          <a href="${safeWebsite(source.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(clean(source.label || "Source"))}
            ${clean(source.last_checked) ? `<span>Checked ${escapeHtml(source.last_checked)}</span>` : ""}
          </a>`).join("")}
      </div>`;
}

function knowledgeSection(id, title, iconName, items, sources) {
  const body = knowledgeList(items);

  if (!body) {
    return "";
  }

  return `
    <section id="${id}" class="event-detail-card event-knowledge-section">
      <h2>${detailIcon(iconName)}${escapeHtml(title)}</h2>
      <div class="event-knowledge-grid">
        ${body}
      </div>
      ${knowledgeSources(sources)}
    </section>`;
}

function buildKnowledgeSections(knowledge) {
  if (!knowledge) {
    return "";
  }

  const sources = knowledge.sources || [];
  return [
    knowledgeSection("registration", "Registration & Fees", "fee", knowledge.registration_fees, sources),
    knowledgeSection("course", "Course", "distance", knowledge.course_details, sources),
    knowledgeSection("start-times", "Start Times & Cutoffs", "clock", knowledge.start_times_cutoffs, sources),
    knowledgeSection("event-highlights", "Event Highlights", "star", knowledge.event_highlights, sources),
    knowledgeSection("travel-logistics", "Travel & Logistics", "map", knowledge.travel_logistics, sources),
    knowledgeSection("weather-planning", "Weather & Planning", "info", knowledge.weather_planning, sources)
  ].filter(Boolean).join("");
}

function isUsefulRichValue(value) {
  if (Array.isArray(value)) {
    return value.some(isUsefulRichValue);
  }

  if (value === true || value === false) {
    return true;
  }

  if (value && typeof value === "object") {
    return Object.values(value).some(isUsefulRichValue);
  }

  const text =
    publicValueText(value);

  if (!text || isMissingDetailValue(text)) {
    return false;
  }

  if (/^(not available|not yet verified|not verified|needs review|unknown|n\/a)\b/i.test(text)) {
    return false;
  }

  return true;
}

const hasUsefulValue = isUsefulRichValue;

function formatRichValue(value) {
  if (Array.isArray(value)) {
    return value
      .filter(isUsefulRichValue)
      .map(item => formatRichValue(item))
      .join(" / ");
  }

  if (value === true) {
    return "Yes";
  }

  if (value === false) {
    return "No";
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, itemValue]) => isUsefulRichValue(itemValue))
      .map(([key, itemValue]) => `${escapeHtml(key.replace(/_/g, " "))}: ${formatRichValue(itemValue)}`)
      .join(" / ");
  }

  return escapeHtml(publicValueText(value));
}

function publicValueText(value) {
  return clean(value)
    .replace(/;?\s*exact[^.;]*(?:not yet verified|not verified|needs review)[^.;]*\.?/gi, "")
    .replace(/;?\s*[^.;]*(?:exact source url|source url)[^.;]*(?:not yet verified|not verified|needs review)[^.;]*\.?/gi, "")
    .replace(/\b(?:not yet verified|not verified|needs review)\b\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.;,])/g, "$1")
    .trim();
}

function richMetric(label, value, iconName = "info", tone = "") {
  if (!isUsefulRichValue(value)) {
    return "";
  }

  return `
        <article class="event-rich-metric ${tone ? `is-${tone}` : ""}">
          ${detailIcon(iconName)}
          <span>${escapeHtml(label)}</span>
          <strong>${formatRichValue(value)}</strong>
        </article>`;
}

function richSection(id, title, iconName, fields = []) {
  const items =
    fields.filter(Boolean).join("");

  if (!items) {
    return "";
  }

  return `
    <section id="${id}" class="event-detail-card event-rich-section">
      <h2>${detailIcon(iconName)}${escapeHtml(title)}</h2>
      <div class="event-rich-grid">
        ${items}
      </div>
    </section>`;
}

function buildRichRegistrationSection(details) {
  const data = details && details.registration;

  if (!data) {
    return "";
  }

  return richSection("registration", "Registration", "fee", [
    richMetric("Status", data.registration_status, "status", "highlight"),
    richMetric("Opens", data.registration_open_date, "calendar"),
    richMetric("Closes", data.registration_close_date, "calendar"),
    richMetric("Entry fee", data.entry_fee_current_year || data.entry_fee_min, "fee", "price"),
    richMetric("Fee range", data.entry_fee_min && data.entry_fee_max ? `${data.entry_fee_min} - ${data.entry_fee_max}` : "", "fee"),
    richMetric("Previous fee", data.entry_fee_previous_year, "fee"),
    richMetric("Price tiers", data.price_tiers, "fee"),
    richMetric("Lottery", data.lottery_available, "status"),
    richMetric("Qualification", data.qualification_required, "check"),
    richMetric("Charity entries", data.charity_entries, "check"),
    richMetric("Waiting list", data.waiting_list, "status"),
    richMetric("Transfer", data.transfer_possible, "info"),
    richMetric("Refund policy", data.refund_policy, "info"),
    richMetric("Participant limit", data.participant_limit, "sport"),
    richMetric("Sold out", data.sold_out_status, "status")
  ]);
}

function buildRichCourseSection(details) {
  const data = details && details.course;

  if (!data) {
    return "";
  }

  return richSection("course", "Course", "distance", [
    richMetric("Main distance", data.main_distance, "distance", "highlight"),
    richMetric("Distances", data.distances, "distance"),
    richMetric("Course type", data.course_type, "map"),
    richMetric("Surface", data.surface, "map"),
    richMetric("Elevation gain", data.elevation_gain, "mountain"),
    richMetric("Elevation loss", data.elevation_loss, "mountain"),
    richMetric("Start", data.start_location, "location"),
    richMetric("Finish", data.finish_location, "location"),
    richMetric("Start/finish same place", data.start_finish_same_place, "check"),
    richMetric("Loop course", data.loop_course, "map"),
    richMetric("Point to point", data.point_to_point, "map"),
    richMetric("Difficulty", data.difficulty_rating, "mountain"),
    richMetric("Beginner-friendly", data.beginner_friendly, "check"),
    richMetric("PB potential", data.personal_best_potential, "star"),
    richMetric("Scenic rating", data.scenic_rating, "star"),
    richMetric("Crowd support", data.crowd_support_rating, "star"),
    richMetric("Swim", data.swim_distance, "sport"),
    richMetric("Swim location", data.swim_location, "location"),
    richMetric("Bike", data.bike_distance, "sport"),
    richMetric("Bike laps", data.bike_laps, "map"),
    richMetric("Bike elevation", data.bike_elevation, "mountain"),
    richMetric("Run", data.run_distance, "sport"),
    richMetric("Run laps", data.run_laps, "map"),
    richMetric("Transition", data.transition_area, "location"),
    richMetric("Course map", safeWebsite(data.course_map_url) ? `<a href="${safeWebsite(data.course_map_url)}" target="_blank" rel="noopener noreferrer">Official map</a>` : "", "map")
  ]);
}

function buildRichRaceDaySection(details) {
  const data = details && details.race_day;

  if (!data) {
    return "";
  }

  return richSection("race-day", "Cutoffs & Race Day", "clock", [
    richMetric("Start time", data.start_time, "clock", "highlight"),
    richMetric("Wave start", data.wave_start, "clock"),
    richMetric("Total cutoff", data.total_cutoff, "clock"),
    richMetric("Intermediate cutoffs", data.intermediate_cutoffs, "clock"),
    richMetric("Swim cutoff", data.swim_cutoff, "clock"),
    richMetric("Bike cutoff", data.bike_cutoff, "clock"),
    richMetric("Run cutoff", data.run_cutoff, "clock"),
    richMetric("Aid stations", data.aid_stations, "info"),
    richMetric("Pacers", data.pacers_available, "sport"),
    richMetric("Timing", data.timing_system, "check"),
    richMetric("Bag drop", data.bag_drop, "info"),
    richMetric("Showers", data.showers, "info"),
    richMetric("Changing rooms", data.changing_rooms, "info"),
    richMetric("Toilets", data.toilets, "info"),
    richMetric("Medical support", data.medical_support, "check"),
    richMetric("Live tracking", data.live_tracking, "status"),
    richMetric("Livestream", data.livestream, "status"),
    richMetric("Expo", data.expo_available, "map"),
    richMetric("Bib pickup", data.bib_pickup_info, "check")
  ]);
}

function buildRichTravelSection(details) {
  const data = details && details.travel;

  if (!data) {
    return "";
  }

  return richSection("travel-logistics", "Travel & Logistics", "map", [
    richMetric("Nearest airport", data.nearest_airport, "location"),
    richMetric("Nearest train station", data.nearest_train_station, "location"),
    richMetric("Public transport", data.public_transport_info, "map"),
    richMetric("Parking", data.parking_info, "map"),
    richMetric("Accommodation", data.accommodation_info, "info"),
    richMetric("Camping", data.camping_available, "info"),
    richMetric("Recommended arrival", data.recommended_arrival, "calendar"),
    richMetric("Book early", data.recommended_booking_time, "calendar"),
    richMetric("Timezone", data.timezone, "clock")
  ]);
}

function buildRichWeatherSection(details) {
  const data = details && details.weather;

  if (!data) {
    return "";
  }

  return richSection("weather-planning", "Weather & Planning", "info", [
    richMetric("Typical weather", data.typical_weather, "info", "highlight"),
    richMetric("Average temperature", data.average_temperature, "info"),
    richMetric("Average high", data.average_high_temperature, "info"),
    richMetric("Average low", data.average_low_temperature, "info"),
    richMetric("Average rainfall", data.average_rainfall, "info"),
    richMetric("Heat risk", data.heat_risk, "status"),
    richMetric("Wind risk", data.wind_risk, "status"),
    richMetric("Best conditions", data.best_conditions_note, "check"),
    richMetric("Planning tip", data.planning_tips, "info"),
    richMetric("Seasonal context", data.seasonal_context, "calendar")
  ]);
}

function buildRichStatisticsSection(details) {
  const data = details && details.statistics;

  if (!data) {
    return "";
  }

  return richSection("statistics-history", "Statistics & History", "star", [
    richMetric("Participants", data.participant_count, "sport"),
    richMetric("Finishers", data.finisher_count, "check"),
    richMetric("Women", data.women_percentage, "sport"),
    richMetric("Average finish", data.average_finish_time, "clock"),
    richMetric("Last male winner", data.last_winner_male, "star"),
    richMetric("Last female winner", data.last_winner_female, "star"),
    richMetric("Male winning time", data.last_winning_time_male, "clock"),
    richMetric("Female winning time", data.last_winning_time_female, "clock"),
    richMetric("Historic note", data.historic_significance, "info"),
    richMetric("Notable facts", data.notable_facts, "info"),
    richMetric("World Major", data.world_major, "star"),
    richMetric("UTMB Index", data.utmb_index, "mountain"),
    richMetric("Boston qualifier", data.boston_qualifier, "check"),
    richMetric("Championship", data.championship_status, "star")
  ]);
}

function buildRichEditorialSection(details) {
  const data = details && details.editorial;

  if (!data) {
    return "";
  }

  const items = [
    ["Why this event stands out", data.why_this_event_stands_out, "star"],
    ["Known for", data.known_for, "info"],
    ["Course character", data.course_character || (details.course && details.course.course_character), "distance"],
    ["Atmosphere", data.atmosphere, "star"],
    ["Good fit for", data.good_fit_for, "check"],
    ["Not ideal for", data.not_ideal_for, "info"],
    ["Insider tips", data.insider_tips, "info"],
    ["Planning context", data.planning_context, "calendar"]
  ]
    .filter(([, value]) => isUsefulRichValue(value))
    .map(([label, value, iconName]) => `
        <article class="event-editorial-item">
          ${detailIcon(iconName)}
          <div>
            <h3>${escapeHtml(label)}</h3>
            <p>${formatRichValue(value)}</p>
          </div>
        </article>`)
    .join("");

  if (!items) {
    return "";
  }

  return `
    <section id="event-highlights" class="event-detail-card event-editorial-section">
      <h2>${detailIcon("star")}Why this event stands out</h2>
      <div class="event-editorial-grid">
        ${items}
      </div>
    </section>`;
}

function buildRichSourcesSection(details) {
  const sources =
    Array.isArray(details && details.sources)
      ? details.sources.filter(source => safeWebsite(source.source_url || source.url))
      : [];

  const status =
    clean(details && details.verification_status);
  const lastChecked =
    clean(details && details.last_checked);

  if (!sources.length && !status && !lastChecked) {
    return "";
  }

  return `
    <section id="sources" class="event-detail-card event-sources-section">
      <h2>${detailIcon("check")}Sources / Last checked</h2>
      <div class="event-verification-strip">
        ${lastChecked ? detailBadge(`Data last checked: ${lastChecked}`, "verified") : ""}
        ${status ? detailBadge(`Status: ${status.replace(/_/g, " ")}`, status === "demo_seed" ? "pending" : "reference") : ""}
      </div>
      ${sources.length ? `
        <div class="event-source-list">
          ${sources.map(source => `
            <a href="${safeWebsite(source.source_url || source.url)}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(source.source_label || source.source_type || "Source")}</strong>
              <span>${escapeHtml(source.source_type || "source")}${source.last_verified ? ` · Checked ${escapeHtml(source.last_verified)}` : ""}</span>
              ${source.confidence_score ? `<em>Confidence ${escapeHtml(String(source.confidence_score))}</em>` : ""}
            </a>`).join("")}
        </div>` : ""}
    </section>`;
}

function buildRichKnowledgeSections(details) {
  if (!details) {
    return "";
  }

  return [
    buildRichRegistrationSection(details),
    buildRichCourseSection(details),
    buildRichRaceDaySection(details),
    buildRichTravelSection(details),
    buildRichWeatherSection(details),
    buildRichStatisticsSection(details),
    buildRichEditorialSection(details),
    buildRichSourcesSection(details)
  ].filter(Boolean).join("");
}

function buildRichFaq(event, details) {
  if (!details) {
    return "";
  }

  const registration =
    details.registration || {};
  const course =
    details.course || {};
  const raceDay =
    details.race_day || {};
  const travel =
    details.travel || {};
  const weather =
    details.weather || {};

  const faqs = [];

  if (isUsefulRichValue(registration.entry_fee_current_year || registration.entry_fee_min || registration.entry_fee_previous_year)) {
    faqs.push([
      "How much does the event cost?",
      `Current fee information: ${formatRichValue(registration.entry_fee_current_year || registration.entry_fee_min || registration.entry_fee_previous_year)}. Always verify the latest tier on the official organizer website.`
    ]);
  }

  if (isUsefulRichValue(registration.registration_status || registration.registration_open_date)) {
    faqs.push([
      "When does registration open?",
      `${formatRichValue(registration.registration_status || "Registration status pending")}${registration.registration_open_date ? `. Opens: ${formatRichValue(registration.registration_open_date)}.` : "."}`
    ]);
  }

  if (isUsefulRichValue(raceDay.total_cutoff || raceDay.swim_cutoff || raceDay.bike_cutoff || raceDay.run_cutoff)) {
    faqs.push([
      "Is there a cutoff time?",
      [
        raceDay.total_cutoff ? `Total cutoff: ${formatRichValue(raceDay.total_cutoff)}` : "",
        raceDay.swim_cutoff ? `Swim: ${formatRichValue(raceDay.swim_cutoff)}` : "",
        raceDay.bike_cutoff ? `Bike: ${formatRichValue(raceDay.bike_cutoff)}` : "",
        raceDay.run_cutoff ? `Run: ${formatRichValue(raceDay.run_cutoff)}` : ""
      ].filter(Boolean).join(" · ")
    ]);
  }

  if (isUsefulRichValue(course.beginner_friendly || course.difficulty_rating)) {
    faqs.push([
      "Is the course beginner-friendly?",
      `Beginner-friendly: ${formatRichValue(course.beginner_friendly || "Depends on category")}${course.difficulty_rating ? `. Difficulty: ${formatRichValue(course.difficulty_rating)}.` : "."}`
    ]);
  }

  if (isUsefulRichValue(course.course_character || course.course_type || course.surface)) {
    faqs.push([
      "What is the course like?",
      formatRichValue(course.course_character || [course.course_type, course.surface].filter(Boolean).join(" / "))
    ]);
  }

  if (isUsefulRichValue(course.start_location || course.finish_location)) {
    faqs.push([
      "Where does the race start and finish?",
      [
        course.start_location ? `Start: ${formatRichValue(course.start_location)}` : "",
        course.finish_location ? `Finish: ${formatRichValue(course.finish_location)}` : ""
      ].filter(Boolean).join(" · ")
    ]);
  }

  if (isUsefulRichValue(travel.nearest_train_station || travel.nearest_airport || travel.public_transport_info)) {
    faqs.push([
      "How do I get there?",
      formatRichValue(travel.public_transport_info || [travel.nearest_train_station, travel.nearest_airport].filter(Boolean).join(" / "))
    ]);
  }

  if (isUsefulRichValue(weather.typical_weather || weather.average_temperature || weather.heat_risk)) {
    faqs.push([
      "What is the typical weather?",
      formatRichValue(weather.typical_weather || weather.average_temperature || `Heat risk: ${weather.heat_risk}`)
    ]);
  }

  if (!faqs.length) {
    return "";
  }

  return `
      <div class="event-detail-faq-list">
        ${faqs.map(([question, answer]) => `
          <article class="event-detail-faq-item">
            ${detailIcon("question")}
            <div>
              <h3>${escapeHtml(question)}</h3>
              <p>${answer}</p>
            </div>
          </article>`).join("")}
      </div>`;
}

function categoryRows(event, detailRows = []) {
  if (detailRows.length) {
    return detailRows
      .map(row => `
              <article class="event-category-card">
                <div class="event-category-card-header">
                  <div>
                    <span class="event-category-label">Category</span>
                    <strong class="event-detail-category-name">${escapeHtml(row.category_name || "General entry")}</strong>
                    ${formatSourceLink(row)}
                  </div>
                  <div class="event-category-distance">
                    <span>Distance</span>
                    <strong>${escapeHtml(row.distance || event.distance || "To be confirmed")}</strong>
                  </div>
                </div>
                <div class="event-category-card-body">
                  ${formatFeeSummary(row)}
                  <div class="event-category-detail-grid">
                    ${categoryMetric("status", "Registration", formatRegistrationCell(row))}
                    ${categoryMetric("calendar", "Registration Deadline", formatDetailValue(row.registration_deadline, "Not published yet", "pending"))}
                    ${categoryMetric("clock", "Start Time", formatDetailValue(row.start_time, "To be confirmed", "neutral"))}
                    ${categoryMetric("clock", "Cutoff", formatDetailValue(getCutoff(row), "Not yet verified", "muted"))}
                    ${categoryMetric("mountain", "Elevation", formatDetailValue(getElevation(row), "Not yet verified", "muted"))}
                  </div>
                </div>
              </article>`)
      .join("");
  }

  const distance = clean(event.distance);

  if (!distance) {
    return "";
  }

  return formatDistanceSummary(distance)
    .split(/\s*\/\s*|\s*,\s*/)
    .map(item => clean(item))
    .filter(Boolean)
    .map(item => `
              <article class="event-category-card">
                <div class="event-category-card-header">
                  <div>
                    <span class="event-category-label">Category</span>
                    <strong class="event-detail-category-name">${escapeHtml(item)}</strong>
                  </div>
                  <div class="event-category-distance">
                    <span>Distance</span>
                    <strong>${escapeHtml(item)}</strong>
                  </div>
                </div>
                <div class="event-category-card-body">
                  <div class="event-category-fee-panel">
                    <span>Entry Fee</span>
                    ${detailBadge("Not yet verified", "pending")}
                    <small>Reference fee</small>
                    ${detailBadge("Not available", "muted")}
                  </div>
                  <div class="event-category-detail-grid">
                    ${categoryMetric("status", "Registration", detailBadge("To be confirmed", "neutral"))}
                    ${categoryMetric("calendar", "Registration Deadline", detailBadge("Not published yet", "pending"))}
                    ${categoryMetric("clock", "Start Time", detailBadge("To be confirmed", "neutral"))}
                    ${categoryMetric("clock", "Cutoff", detailBadge("Not yet verified", "muted"))}
                    ${categoryMetric("mountain", "Elevation", detailBadge("Not yet verified", "muted"))}
                  </div>
                </div>
              </article>`)
    .join("");
}

function mapScript(event) {
  const lat = Number(event.latitude);
  const lng = Number(event.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "";
  }

  return `
  <script>
    window.addEventListener("DOMContentLoaded", function () {
      var target = document.getElementById("eventDetailMap");
      if (!target || typeof L === "undefined") {
        return;
      }

      var map = L.map("eventDetailMap", {
        scrollWheelZoom: false
      }).setView([${lat}, ${lng}], 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      L.marker([${lat}, ${lng}]).addTo(map);
    });
  </script>`;
}

function buildSchema(event, canonicalUrl, detailRows = [], richDetails = null) {
  const website = getOfficialEventWebsite(event, richDetails);
  const organizer = resolveOrganizer(event, richDetails);
  const offers =
    detailRows
      .map(row => {
        const price =
          getFee2026(row);

        if (!price) {
          return null;
        }

        return {
          "@type": "Offer",
          name: clean(row.category_name || "General entry"),
          price: clean(price).replace(",", "."),
          priceCurrency: clean(row.currency || "EUR"),
          url: safeWebsite(row.registration_url || row.source_url || event.event_url),
          availability:
            /sold out/i.test(inferRegistrationStatus(row))
              ? "https://schema.org/SoldOut"
              : "https://schema.org/InStock"
        };
      })
      .filter(Boolean);

  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: clean(event.event_name),
    startDate: formatDateForSchema(event.date),
    eventStatus: schemaStatus(event.verification_status),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: canonicalUrl,
    location: {
      "@type": "Place",
      name: clean(event.address || `${event.city}, ${event.country}`),
      address: {
        "@type": "PostalAddress",
        addressLocality: clean(event.city),
        addressCountry: clean(event.country)
      }
    },
    organizer: organizer
      ? {
          "@type": "Organization",
          name: organizer.name,
          url: organizer.url || undefined
        }
      : undefined,
    offers: offers.length
      ? offers
      : undefined
  };

  Object.keys(schema).forEach(key => {
    if (schema[key] === undefined || schema[key] === "") {
      delete schema[key];
    }
  });

  return JSON.stringify(schema, null, 2)
    .replace(/</g, "\\u003c");
}

function firstUsefulValue(...values) {
  for (const value of values) {
    if (isUsefulRichValue(value)) {
      return value;
    }
  }

  return "";
}

function getBrandDetails(richDetails = null) {
  if (richDetails && richDetails.brand) {
    return richDetails.brand;
  }

  // Compatibility for the ten pre-foundation pilot records. New exports use
  // events.* for brand facts and must not add further organizer copies here.
  return getRichDetailsSection(richDetails, "basis");
}

function publicOrganizerName(value) {
  const name = clean(value);

  if (!name) {
    return "";
  }

  // Organizer fields are public product facts. Never render technical
  // provenance, database views or export labels as an organizer, even if a
  // malformed import accidentally stores one in an organizer column.
  if (/\b(?:supabase|postgrest)\b|public_event_(?:discovery|archive)|\b(?:database|data|discovery|archive)\s+(?:export|view)\b/i.test(name)) {
    return "";
  }

  return name;
}

function resolveOrganizer(event, richDetails = null) {
  const brand = getBrandDetails(richDetails);
  const name = firstUsefulValue(
    publicOrganizerName(event.organizer_name),
    publicOrganizerName(brand.organizer_name),
    publicOrganizerName(brand.organizer)
  );

  if (!name) {
    return null;
  }

  return {
    name: clean(name),
    url: safeWebsite(firstUsefulValue(event.organizer_url, brand.organizer_url))
  };
}

function getOfficialEventWebsite(event, richDetails = null) {
  const brand = getBrandDetails(richDetails);
  return safeWebsite(firstUsefulValue(
    event.official_url,
    brand.official_website,
    event.event_url
  ));
}

function getVerificationContext(event, richDetails = null) {
  const detailsVerification =
    richDetails && richDetails.verification && typeof richDetails.verification === "object"
      ? richDetails.verification
      : {};
  const brand = detailsVerification.brand || {};
  const edition = detailsVerification.edition || {};

  return {
    brand: {
      status: clean(firstUsefulValue(
        event.brand_verification_status,
        brand.status,
        brand.verification_status
      )),
      lastVerifiedAt: clean(firstUsefulValue(
        event.brand_last_verified_at,
        brand.last_verified_at,
        brand.last_checked
      ))
    },
    edition: {
      status: clean(firstUsefulValue(
        event.edition_verification_status,
        edition.status,
        edition.verification_status,
        richDetails && richDetails.verification_status
      )),
      lastVerifiedAt: clean(firstUsefulValue(
        event.edition_last_verified_at,
        edition.last_verified_at,
        edition.last_checked,
        richDetails && richDetails.last_checked,
        event.last_checked
      ))
    }
  };
}

function parseEventDate(value) {
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const german = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  if (german) {
    return `${german[3]}-${german[2]}-${german[1]}`;
  }

  return "";
}

function formatVerificationDate(value, language = "en") {
  const isoDate = parseEventDate(value);
  if (!isoDate) {
    return "";
  }

  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function renderVerificationDate(value) {
  const isoDate = parseEventDate(value);
  if (!isoDate) {
    return "";
  }

  return `<time datetime="${isoDate}" data-detail-verification-date="${isoDate}">${escapeHtml(formatVerificationDate(isoDate))}</time>`;
}

function isFutureEdition(event, now = new Date()) {
  const isoDate = parseEventDate(event.date);
  if (isoDate) {
    const eventTime = Date.parse(`${isoDate}T00:00:00Z`);
    if (Number.isFinite(eventTime)) {
      return eventTime > now.getTime();
    }
  }

  const year = Number(event.edition_year || getEventYear(event));
  return Number.isInteger(year) && year > now.getUTCFullYear();
}

function editionFallbackKey(event) {
  return isFutureEdition(event)
    ? "detail.notOfficiallyConfirmed"
    : "detail.tba";
}

function getRegistrationStatus(event, richDetails = null, detailRows = []) {
  const registration = getRichDetailsSection(richDetails, "registration");
  const rawStatus = firstUsefulValue(
    registration.registration_status,
    detailRows.map(row => inferRegistrationStatus(row)).filter(hasUsefulValue).join(" / "),
    event.registration_status,
    event.verification_status
  );
  const normalized = clean(rawStatus).toLowerCase().replace(/\s+/g, "_");

  if (!rawStatus || normalized === "unknown" || normalized === "unclear" || normalized === "unverified") {
    return isFutureEdition(event)
      ? detailTranslation("detail.notOfficiallyConfirmed")
      : detailTranslation("detail.unknown");
  }

  return /^[a-z_]+$/i.test(clean(rawStatus))
    ? normalizeStatus(rawStatus)
    : clean(rawStatus);
}

function detailText(value, fallback = "Not yet verified") {
  const text =
    publicValueText(value);

  if (/^<a\s/i.test(text)) {
    return text;
  }

  return isUsefulRichValue(value)
    ? formatRichValue(value)
    : `<span class="event-detail-missing">${escapeHtml(fallback)}</span>`;
}

function plainDetailText(value, fallback = "Not yet verified") {
  return isUsefulRichValue(value)
    ? clean(Array.isArray(value) ? value.join(" / ") : value)
    : fallback;
}

function sentenceValue(value, fallback = "Not yet verified") {
  return plainDetailText(value, fallback)
    .replace(/\.+$/, "");
}

function lowerFirst(value) {
  const text =
    clean(value);

  return text
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

function getRichDetailsSection(richDetails, sectionName) {
  return richDetails && richDetails[sectionName]
    ? richDetails[sectionName]
    : {};
}

function getEventGuideContext(event, richDetails = null) {
  const text =
    [
      event.event_name,
      event.sport,
      event.distance,
      getRichDetailsSection(richDetails, "course").course_type,
      getRichDetailsSection(richDetails, "course").surface
    ].map(clean).join(" ").toLowerCase();

  return {
    isTriathlon: /triathlon|ironman|challenge/.test(text),
    isTrail: /trail|mountain|alpine|berg|utmb/.test(text),
    isUltra: /ultra|100\s?km|100\s?miles|backyard/.test(text),
    isMarathon: /marathon|42/.test(text)
  };
}

function buildEventTeaser(event, richDetails = null) {
  const editorial =
    getRichDetailsSection(richDetails, "editorial");
  if (isUsefulRichValue(editorial.seo_summary)) {
    return plainDetailText(editorial.seo_summary);
  }

  if (isUsefulRichValue(editorial.why_this_event_stands_out)) {
    return plainDetailText(editorial.why_this_event_stands_out);
  }

  const location =
    [clean(event.city), clean(event.country)]
      .filter(Boolean)
      .join(", ");

  return `Explore ${clean(event.event_name)}${location ? ` in ${location}` : ""}, including race distances, registration details, course information and everything needed to plan it as part of your season.`;
}

function keyFactCard(iconName, label, value, fallback = "Not yet verified") {
  return `<article class="event-guide-key-fact">
          ${detailIcon(iconName)}
          <span>${escapeHtml(label)}</span>
          <strong>${detailText(value, fallback)}</strong>
        </article>`;
}

function getPriceSummary(registration = {}, detailRows = []) {
  return firstUsefulValue(
    registration.entry_fee_current_year,
    registration.entry_fee_min && registration.entry_fee_max
      ? `${registration.entry_fee_min} - ${registration.entry_fee_max}`
      : "",
    registration.entry_fee_min,
    registration.entry_fee_previous_year,
    detailRows.map(row => getFee2026(row)).filter(Boolean).join(" / "),
    detailRows.map(row => getFee2025(row)).filter(Boolean).join(" / ")
  );
}

function buildKeyFacts(event, detailRows = [], richDetails = null, statusLabel = "") {
  const registration =
    getRichDetailsSection(richDetails, "registration");
  const course =
    getRichDetailsSection(richDetails, "course");
  const raceDay =
    getRichDetailsSection(richDetails, "race_day");
  const statistics =
    getRichDetailsSection(richDetails, "statistics");
  const elevation =
    firstUsefulValue(
      course.elevation_gain,
      course.bike_elevation,
      detailRows.map(row => getElevation(row)).filter(Boolean).join(" / ")
    );
  const cutoff =
    firstUsefulValue(
      raceDay.total_cutoff,
      raceDay.swim_cutoff || raceDay.bike_cutoff || raceDay.run_cutoff,
      detailRows.map(row => getCutoff(row)).filter(Boolean).join(" / ")
    );
  const startTime =
    firstUsefulValue(
      raceDay.start_time,
      detailRows.map(row => clean(row.start_time)).filter(isUsefulRichValue).join(" / ")
    );
  const registrationStatus =
    firstUsefulValue(registration.registration_status, statusLabel);

  return `
    <section id="key-facts" class="event-detail-card event-guide-key-facts-section">
      <div class="event-guide-section-heading">
        <span>Planning snapshot</span>
        <h2>Key Facts</h2>
      </div>
      <div class="event-guide-key-facts">
        ${keyFactCard("calendar", "Date", event.date || "Date expected")}
        ${keyFactCard("location", "Location", `${clean(event.city)}, ${clean(event.country)}`)}
        ${keyFactCard("distance", "Distance", firstUsefulValue(course.main_distance, course.distances, formatDistanceSummary(event.distance)))}
        ${keyFactCard("mountain", "Elevation", elevation)}
        ${keyFactCard("clock", "Cutoff", cutoff)}
        ${keyFactCard("clock", "Start time", startTime)}
        ${keyFactCard("sport", "Participants", firstUsefulValue(statistics.participant_count, statistics.finisher_count), "Not available")}
        ${keyFactCard("fee", "Entry fee", getPriceSummary(registration, detailRows), "Not available")}
        ${keyFactCard("status", "Registration", registrationStatus)}
        ${keyFactCard("check", "Last checked", firstUsefulValue(richDetails && richDetails.last_checked, event.last_checked), "Not available")}
      </div>
    </section>`;
}

function buildEditorialSummary(event, richDetails = null) {
  const editorial =
    getRichDetailsSection(richDetails, "editorial");
  const course =
    getRichDetailsSection(richDetails, "course");
  const weather =
    getRichDetailsSection(richDetails, "weather");
  const context =
    getEventGuideContext(event, richDetails);
  const sentences = [];

  sentences.push(
    plainDetailText(
      editorial.why_this_event_stands_out,
      buildEventTeaser(event, richDetails)
    )
  );

  if (isUsefulRichValue(editorial.good_fit_for)) {
    sentences.push(`It is a strong fit for ${lowerFirst(sentenceValue(editorial.good_fit_for))}.`);
  } else if (context.isTriathlon) {
    sentences.push("It is best suited to athletes who can manage long race-day logistics across swim, bike, run and transitions.");
  } else if (context.isTrail || context.isUltra) {
    sentences.push("It is most relevant for athletes who plan around terrain, weather, fueling and recovery rather than just pace.");
  } else {
    sentences.push("It is most relevant for runners comparing date, course speed, crowding and registration demand.");
  }

  if (isUsefulRichValue(course.course_character)) {
    sentences.push(`Course character: ${sentenceValue(course.course_character)}.`);
  } else if (isUsefulRichValue(course.personal_best_potential)) {
    sentences.push(`PB potential is currently marked as ${plainDetailText(course.personal_best_potential)}.`);
  }

  if (isUsefulRichValue(weather.typical_weather || weather.heat_risk || weather.wind_risk)) {
    sentences.push(`Weather planning: ${sentenceValue(weather.typical_weather || `heat risk ${weather.heat_risk || "not verified"}, wind risk ${weather.wind_risk || "not verified"}`)}.`);
  }

  if (isUsefulRichValue(editorial.planning_context)) {
    sentences.push(plainDetailText(editorial.planning_context));
  }

  return `
    <section id="why-this-event-matters" class="event-detail-card event-guide-editorial-summary">
      <div class="event-guide-section-heading">
        <span>Editorial guide</span>
        <h2>Why this event matters</h2>
      </div>
      <p>${escapeHtml(sentences.slice(0, 5).join(" "))}</p>
    </section>`;
}

function guideMetric(label, value, iconName = "info", fallback = "Not yet verified") {
  return `<article class="event-guide-metric">
          ${detailIcon(iconName)}
          <span>${escapeHtml(label)}</span>
          <strong>${detailText(value, fallback)}</strong>
        </article>`;
}

function guideSection(id, eyebrow, title, intro, metrics) {
  const items =
    metrics.filter(Boolean).join("");

  return `
    <section id="${id}" class="event-detail-card event-guide-section">
      <div class="event-guide-section-heading">
        <span>${escapeHtml(eyebrow)}</span>
        <h2>${escapeHtml(title)}</h2>
        ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
      </div>
      <div class="event-guide-metric-grid">
        ${items}
      </div>
    </section>`;
}

function buildCourseGuide(event, detailRows = [], richDetails = null) {
  const course =
    getRichDetailsSection(richDetails, "course");
  const raceDay =
    getRichDetailsSection(richDetails, "race_day");
  const weather =
    getRichDetailsSection(richDetails, "weather");
  const elevation =
    firstUsefulValue(course.elevation_gain, course.bike_elevation, detailRows.map(row => getElevation(row)).filter(Boolean).join(" / "));

  return guideSection(
    "course",
    "Course",
    "Course",
    "Use this section to judge pacing, equipment, risk and race fit. Unverified course fields stay marked clearly.",
    [
      guideMetric("Character", course.course_character, "distance"),
      guideMetric("Profile", elevation, "mountain"),
      guideMetric("Surface", course.surface, "map"),
      guideMetric("Aid stations", firstUsefulValue(raceDay.aid_stations, course.aid_stations), "info"),
      guideMetric("Pacers", raceDay.pacers_available, "sport", "Not available"),
      guideMetric("Cutoff", firstUsefulValue(raceDay.total_cutoff, detailRows.map(row => getCutoff(row)).filter(Boolean).join(" / ")), "clock"),
      guideMetric("PB / difficulty", firstUsefulValue(course.personal_best_potential, course.difficulty_rating), "star"),
      guideMetric("Risk notes", firstUsefulValue(weather.heat_risk && `Heat risk: ${weather.heat_risk}`, weather.wind_risk && `Wind risk: ${weather.wind_risk}`, course.bike_character, course.run_character), "status")
    ]
  );
}

function buildRegistrationGuide(event, detailRows = [], richDetails = null, website = "") {
  const registration =
    getRichDetailsSection(richDetails, "registration");
  const registrationUrl =
    safeWebsite(registration.registration_url || event.event_url || website);

  return guideSection(
    "registration",
    "Entry",
    "Registration",
    "Registration data changes quickly. Treat the organizer as the final source before payment.",
    [
      guideMetric("Status", registration.registration_status || normalizeStatus(event.verification_status), "status"),
      guideMetric("Price phases", firstUsefulValue(registration.price_tiers, getPriceSummary(registration, detailRows)), "fee", "Not available"),
      guideMetric("Lottery / allocation", registration.lottery_available === true ? "Lottery available" : registration.lottery_available === false ? "First come or standard entry, if available" : "", "check"),
      guideMetric("Sold-out note", firstUsefulValue(registration.sold_out_status, /sold/i.test(clean(registration.registration_status)) ? registration.registration_status : ""), "status", "Not available"),
      guideMetric("Transfer / withdrawal", firstUsefulValue(registration.transfer_possible, registration.refund_policy), "info", "Not available"),
      guideMetric("Official registration", registrationUrl ? `<a href="${registrationUrl}" target="_blank" rel="noopener noreferrer">Open registration</a>` : "", "fee", "Not available")
    ]
  );
}

function buildRaceDayGuide(event, richDetails = null) {
  const raceDay =
    getRichDetailsSection(richDetails, "race_day");
  const course =
    getRichDetailsSection(richDetails, "course");

  return guideSection(
    "race-day",
    "Race day",
    "Race Day",
    "Operational details should always be checked against the final race guide or athlete guide.",
    [
      guideMetric("Start / finish", [course.start_location, course.finish_location].filter(isUsefulRichValue).join(" / "), "location"),
      guideMetric("Start waves", raceDay.wave_start, "clock"),
      guideMetric("Bib pickup", raceDay.bib_pickup_info, "check"),
      guideMetric("Bag drop", raceDay.bag_drop, "info", "Not available"),
      guideMetric("Toilets", raceDay.toilets, "info", "Not available"),
      guideMetric("Medical", raceDay.medical_support, "check"),
      guideMetric("Aid stations", firstUsefulValue(raceDay.aid_stations, course.aid_stations), "info"),
      guideMetric("Cutoff times", firstUsefulValue(raceDay.total_cutoff, raceDay.swim_cutoff, raceDay.bike_cutoff, raceDay.run_cutoff), "clock")
    ]
  );
}

function buildTravelGuide(richDetails = null) {
  const travel =
    getRichDetailsSection(richDetails, "travel");

  return guideSection(
    "travel",
    "Logistics",
    "Travel",
    "Plan travel around road closures, expo pickup and race-day access. Exact access rules can change close to the event.",
    [
      guideMetric("Train station", travel.nearest_train_station, "location"),
      guideMetric("Airport", travel.nearest_airport, "location"),
      guideMetric("Public transport", travel.public_transport_info, "map"),
      guideMetric("Accommodation", travel.accommodation_info, "info", "Not available"),
      guideMetric("Parking", travel.parking_info, "map", "Not available"),
      guideMetric("Race-day note", firstUsefulValue(travel.recommended_arrival, travel.recommended_booking_time), "calendar", "Not yet verified")
    ]
  );
}

function buildWeatherGuide(richDetails = null) {
  const weather =
    getRichDetailsSection(richDetails, "weather");

  return guideSection(
    "weather",
    "Conditions",
    "Weather",
    "Weather can change the practical difficulty of a race. Use this as planning context, then check the race-week forecast.",
    [
      guideMetric("Typical weather", weather.typical_weather, "info"),
      guideMetric("Temperature", firstUsefulValue(weather.average_temperature, weather.average_high_temperature && weather.average_low_temperature ? `${weather.average_high_temperature} / ${weather.average_low_temperature}` : ""), "info"),
      guideMetric("Rain risk", weather.average_rainfall, "status", "Not yet verified"),
      guideMetric("Wind risk", weather.wind_risk, "status", "Not yet verified"),
      guideMetric("Special conditions", firstUsefulValue(weather.best_conditions_note, weather.seasonal_context), "check"),
      guideMetric("Strategy note", weather.planning_tips, "info")
    ]
  );
}

function buildStatisticsGuide(richDetails = null) {
  const statistics =
    getRichDetailsSection(richDetails, "statistics");

  return guideSection(
    "statistics",
    "History",
    "Statistics",
    "Only sourced statistics are shown. Missing winner, finisher or DNF data remains transparent.",
    [
      guideMetric("Finishers", statistics.finisher_count, "check", "Not available"),
      guideMetric("Participants", statistics.participant_count, "sport", "Not available"),
      guideMetric("Winner times", [statistics.last_winning_time_male, statistics.last_winning_time_female].filter(isUsefulRichValue).join(" / "), "clock", "Not available"),
      guideMetric("Course records", [statistics.course_record_male, statistics.course_record_female].filter(isUsefulRichValue).join(" / "), "star", "Not available"),
      guideMetric("Historic note", statistics.historic_significance, "info"),
      guideMetric("DNF rate", statistics.dnf_rate, "status", "Not available")
    ]
  );
}

function buildGuideSourcesSection(event, richDetails = null) {
  const sources =
    Array.isArray(richDetails && richDetails.sources)
      ? richDetails.sources.filter(source => safeWebsite(source.source_url || source.url))
      : [];
  const website =
    safeWebsite(event.event_url);
  const fallbackSources =
    website && !sources.length
      ? [{
          source_url: website,
          source_type: "official",
          source_label: "Official event website",
          last_verified: event.last_checked || ""
        }]
      : sources;
  const status =
    clean((richDetails && richDetails.verification_status) || event.verification_status);
  const lastChecked =
    clean((richDetails && richDetails.last_checked) || event.last_checked);

  return `
    <section id="sources" class="event-detail-card event-sources-section">
      <div class="event-guide-section-heading">
        <span>Verification</span>
        <h2>Sources</h2>
        <p>Organizer pages, registration pages and race guides are preferred. Sport Event Map keeps unknown values visible instead of guessing.</p>
      </div>
      <div class="event-verification-strip">
        ${lastChecked ? detailBadge(`Last checked: ${lastChecked}`, "verified") : detailBadge("Last checked: Not available", "muted")}
        ${status ? detailBadge(`Verification: ${status.replace(/_/g, " ")}`, "reference") : detailBadge("Verification: Not yet verified", "pending")}
      </div>
      <div class="event-source-list">
        ${fallbackSources.map(source => `
          <a href="${safeWebsite(source.source_url || source.url)}" target="_blank" rel="noopener noreferrer">
            <strong>${escapeHtml(source.source_label || source.source_type || "Official source")}</strong>
            <span>${escapeHtml(source.source_type || "source")}${source.last_verified ? ` · Checked ${escapeHtml(source.last_verified)}` : ""}</span>
            ${source.verification_note ? `<em>${escapeHtml(source.verification_note)}</em>` : ""}
          </a>`).join("") || `<span class="event-detail-muted">No source URL available yet.</span>`}
      </div>
    </section>`;
}

function buildGuideFaq(event, detailRows = [], richDetails = null, knowledge = null) {
  const registration =
    getRichDetailsSection(richDetails, "registration");
  const course =
    getRichDetailsSection(richDetails, "course");
  const raceDay =
    getRichDetailsSection(richDetails, "race_day");
  const travel =
    getRichDetailsSection(richDetails, "travel");
  const weather =
    getRichDetailsSection(richDetails, "weather");
  const statistics =
    getRichDetailsSection(richDetails, "statistics");
  const eventName =
    clean(event.event_name);
  const context =
    getEventGuideContext(event, richDetails);
  const questions = [];
  const customQuestions =
    Array.isArray(richDetails && richDetails.faq)
      ? richDetails.faq
          .map(item => {
            if (Array.isArray(item)) {
              return {
                question: item[0],
                answer: item[1]
              };
            }

            return item || {};
          })
          .filter(item =>
            isUsefulRichValue(item.question) &&
            isUsefulRichValue(item.answer)
          )
      : [];

  if (customQuestions.length) {
    return `
      <div class="event-detail-faq-list">
        ${customQuestions.slice(0, 10).map(item => `
          <article class="event-detail-faq-item">
            ${detailIcon("question")}
            <div>
              <h3>${escapeHtml(item.question)}</h3>
              <p>${escapeHtml(item.answer)}</p>
            </div>
          </article>`).join("")}
      </div>`;
  }

  questions.push([
    context.isMarathon ? `Is ${eventName} good for a personal best?` : `How difficult is ${eventName}?`,
    context.isMarathon
      ? `PB potential: ${sentenceValue(course.personal_best_potential, "Not yet verified")}. Course note: ${sentenceValue(course.course_character, "Not yet verified")}.`
      : `Difficulty: ${sentenceValue(course.difficulty_rating, "Not yet verified")}. Course note: ${sentenceValue(course.course_character, "Not yet verified")}.`
  ]);

  questions.push([
    `How does registration work for ${eventName}?`,
    `Registration status: ${plainDetailText(registration.registration_status || normalizeStatus(event.verification_status))}. ${registration.lottery_available === true ? "Lottery or allocated entry is part of the available information." : "Lottery or first-come-first-served details are not fully verified unless shown in the registration block."}`
  ]);

  questions.push([
    "Where does the race start and finish?",
    `Start: ${plainDetailText(course.start_location, "Not yet verified")}. Finish: ${plainDetailText(course.finish_location, "Not yet verified")}.`
  ]);

  questions.push([
    "What is the cutoff time?",
    `Cutoff: ${plainDetailText(firstUsefulValue(raceDay.total_cutoff, raceDay.swim_cutoff, raceDay.bike_cutoff, raceDay.run_cutoff, detailRows.map(row => getCutoff(row)).filter(Boolean).join(" / ")))}.`
  ]);

  questions.push([
    "Are pacers available?",
    `Pacers: ${plainDetailText(raceDay.pacers_available, "Not available")}.`
  ]);

  questions.push([
    "What should I know about aid stations and race-day logistics?",
    `Aid stations: ${sentenceValue(firstUsefulValue(raceDay.aid_stations, course.aid_stations))}. Bib pickup: ${sentenceValue(raceDay.bib_pickup_info)}. Bag drop: ${sentenceValue(raceDay.bag_drop, "Not available")}.`
  ]);

  questions.push([
    "How should I travel to the event?",
    `Nearest train station: ${sentenceValue(travel.nearest_train_station)}. Airport: ${sentenceValue(travel.nearest_airport)}. Public transport: ${sentenceValue(travel.public_transport_info)}.`
  ]);

  questions.push([
    "What weather should I plan for?",
    `${plainDetailText(weather.typical_weather)} Temperature: ${plainDetailText(firstUsefulValue(weather.average_temperature, weather.average_high_temperature && weather.average_low_temperature ? `${weather.average_high_temperature} / ${weather.average_low_temperature}` : ""))}.`
  ]);

  if (context.isTriathlon) {
    questions.push([
      "What triathlon-specific check-in details are verified?",
      `Swim cutoff: ${plainDetailText(raceDay.swim_cutoff)}. Bike cutoff: ${plainDetailText(raceDay.bike_cutoff)}. Run cutoff: ${plainDetailText(raceDay.run_cutoff)}. Transition: ${plainDetailText(course.transition_area)}.`
    ]);
  } else {
    questions.push([
      "How crowded or large is the event?",
      `Participant data: ${plainDetailText(firstUsefulValue(statistics.participant_count, statistics.finisher_count), "Not available")}. Crowd support: ${plainDetailText(course.crowd_support_rating, "Not yet verified")}.`
    ]);
  }

  return `
      <div class="event-detail-faq-list">
        ${questions.slice(0, 10).map(([question, answer]) => `
          <article class="event-detail-faq-item">
            ${detailIcon("question")}
            <div>
              <h3>${escapeHtml(question)}</h3>
              <p>${escapeHtml(answer)}</p>
            </div>
          </article>`).join("")}
      </div>`;
}

const DETAIL_TRANSLATIONS = {
  en: {
    "detail.backToMap": "Back to map",
    "detail.language": "Language",
    "detail.favorite": "Save Favorite",
    "detail.addSeason": "+ Add to Season",
    "detail.addingSeason": "Adding\u2026",
    "detail.savedSeason": "\u2713 Added to Season",
    "detail.removeSeason": "Remove from Season",
    "detail.removingSeason": "Removing\u2026",
    "detail.addedSeason": "Added to your Season Planner.",
    "detail.removedSeason": "Removed from your Season Planner.",
    "detail.saveUnavailable": "Could not save this event right now.",
    "detail.removeUnavailable": "Could not remove this event right now.",
    "detail.officialWebsite": "Official website",
    "detail.openOfficialWebsite": "Open official website",
    "detail.verifyOrganizer": "Verify final race details on the official organizer website before booking or registering.",
    "detail.event": "Event",
    "detail.edition": "Edition",
    "detail.overview": "Overview",
    "detail.keyFacts": "Key Facts",
    "detail.registration": "Registration",
    "detail.course": "Course",
    "detail.raceDay": "Race Day",
    "detail.performance": "Performance",
    "detail.logistics": "Logistics",
    "detail.weather": "Weather",
    "detail.rules": "Rules",
    "detail.faq": "FAQ",
    "detail.sources": "Sources",
    "detail.date": "Date",
    "detail.location": "Location",
    "detail.country": "Country",
    "detail.city": "City",
    "detail.sport": "Sport",
    "detail.distance": "Distance",
    "detail.eventType": "Event type",
    "detail.status": "Status",
    "detail.startTime": "Start time",
    "detail.cutoff": "Cutoff",
    "detail.elevation": "Elevation",
    "detail.entryFee": "Entry fee",
    "detail.participants": "Participants",
    "detail.organizer": "Organizer",
    "detail.lastChecked": "Last checked",
    "detail.brandLastChecked": "Brand facts checked",
    "detail.editionLastChecked": "Edition checked",
    "detail.registrationPeriod": "Registration period",
    "detail.deadline": "Deadline",
    "detail.feeTiers": "Fee tiers",
    "detail.tier": "Tier",
    "detail.price": "Price",
    "detail.until": "Until",
    "detail.openRegistration": "Open registration",
    "detail.courseProfile": "Course profile",
    "detail.surface": "Surface",
    "detail.routeType": "Route type",
    "detail.mapGpx": "Map / GPX",
    "detail.start": "Start",
    "detail.finish": "Finish",
    "detail.startWaves": "Start Waves",
    "detail.wave": "Wave",
    "detail.blocks": "Blocks / corral",
    "detail.time": "Time",
    "detail.cutoffTimes": "Cutoff Times",
    "detail.point": "Point",
    "detail.deadlineTime": "Deadline",
    "detail.overallCutoff": "Overall Cutoff",
    "detail.aidStations": "Aid Stations",
    "detail.stationCount": "Stations",
    "detail.supplies": "Supplies",
    "detail.kilometer": "km",
    "detail.details": "Details",
    "detail.bibPickup": "Bib pickup",
    "detail.expo": "Expo",
    "detail.bagDrop": "Bag drop",
    "detail.toilets": "Toilets",
    "detail.medical": "Medical",
    "detail.pacers": "Pacers",
    "detail.records": "Records",
    "detail.category": "Category",
    "detail.name": "Name",
    "detail.timeResult": "Time",
    "detail.year": "Year",
    "detail.finishers": "Finishers",
    "detail.avgFinish": "Average finish",
    "detail.dnfRate": "DNF rate",
    "detail.winners": "Recent winners",
    "detail.train": "Train",
    "detail.airport": "Airport",
    "detail.publicTransport": "Public transport",
    "detail.parking": "Parking",
    "detail.accommodation": "Accommodation",
    "detail.travelNotes": "Travel notes",
    "detail.eventLocation": "Event location",
    "detail.approxLocation": "Approximate event location. Use organizer information for the exact start and access areas.",
    "detail.minimumAge": "Minimum age",
    "detail.qualification": "Qualification",
    "detail.refundPolicy": "Refund policy",
    "detail.transferPolicy": "Transfer policy",
    "detail.mandatoryGear": "Mandatory gear",
    "detail.medicalCertificate": "Medical certificate",
    "detail.athleteGuide": "Athlete guide notes",
    "detail.verification": "Verification",
    "detail.sourceType": "Source type",
    "detail.needsReview": "Needs review",
    "detail.notVerified": "Not verified",
    "detail.notOfficiallyConfirmed": "Not yet officially confirmed",
    "detail.unknown": "Unknown",
    "detail.tba": "TBA"
  },
  de: {
    "detail.backToMap": "Zur\u00fcck zur Karte",
    "detail.language": "Sprache",
    "detail.favorite": "Favorit speichern",
    "detail.addSeason": "+ Zur Saison hinzuf\u00fcgen",
    "detail.addingSeason": "Wird hinzugef\u00fcgt\u2026",
    "detail.savedSeason": "\u2713 Zur Saison hinzugef\u00fcgt",
    "detail.removeSeason": "Aus Saison entfernen",
    "detail.removingSeason": "Wird entfernt\u2026",
    "detail.addedSeason": "Event wurde deinem Saisonplaner hinzugef\u00fcgt.",
    "detail.removedSeason": "Event wurde aus deinem Saisonplaner entfernt.",
    "detail.saveUnavailable": "Dieses Event konnte gerade nicht gespeichert werden.",
    "detail.removeUnavailable": "Dieses Event konnte gerade nicht entfernt werden.",
    "detail.officialWebsite": "Offizielle Website",
    "detail.openOfficialWebsite": "Offizielle Website \u00f6ffnen",
    "detail.verifyOrganizer": "Pr\u00fcfe finale Renndetails vor Buchung oder Anmeldung immer auf der offiziellen Veranstalterseite.",
    "detail.event": "Veranstaltung",
    "detail.edition": "Ausgabe",
    "detail.overview": "\u00dcbersicht",
    "detail.keyFacts": "Key Facts",
    "detail.registration": "Anmeldung",
    "detail.course": "Strecke",
    "detail.raceDay": "Renntag",
    "detail.performance": "Performance",
    "detail.logistics": "Logistik",
    "detail.weather": "Wetter",
    "detail.rules": "Regeln",
    "detail.faq": "FAQ",
    "detail.sources": "Quellen",
    "detail.date": "Datum",
    "detail.location": "Ort",
    "detail.country": "Land",
    "detail.city": "Stadt",
    "detail.sport": "Sportart",
    "detail.distance": "Distanz",
    "detail.eventType": "Eventtyp",
    "detail.status": "Status",
    "detail.startTime": "Startzeit",
    "detail.cutoff": "Cutoff",
    "detail.elevation": "H\u00f6henmeter",
    "detail.entryFee": "Startgeld",
    "detail.participants": "Teilnehmende",
    "detail.organizer": "Veranstalter",
    "detail.lastChecked": "Zuletzt gepr\u00fcft",
    "detail.brandLastChecked": "Brand-Daten gepr\u00fcft",
    "detail.editionLastChecked": "Ausgabe gepr\u00fcft",
    "detail.registrationPeriod": "Anmeldezeitraum",
    "detail.deadline": "Deadline",
    "detail.feeTiers": "Preisphasen",
    "detail.tier": "Phase",
    "detail.price": "Preis",
    "detail.until": "Bis",
    "detail.openRegistration": "Anmeldung \u00f6ffnen",
    "detail.courseProfile": "Streckenprofil",
    "detail.surface": "Untergrund",
    "detail.routeType": "Streckentyp",
    "detail.mapGpx": "Karte / GPX",
    "detail.start": "Start",
    "detail.finish": "Ziel",
    "detail.startWaves": "Startwellen",
    "detail.wave": "Welle",
    "detail.blocks": "Bl\u00f6cke / Corral",
    "detail.time": "Zeit",
    "detail.cutoffTimes": "Cutoff-Zeiten",
    "detail.point": "Punkt",
    "detail.deadlineTime": "Zeitlimit",
    "detail.overallCutoff": "Gesamt-Cutoff",
    "detail.aidStations": "Verpflegung",
    "detail.stationCount": "Stationen",
    "detail.supplies": "Angebot",
    "detail.kilometer": "km",
    "detail.details": "Details",
    "detail.bibPickup": "Startunterlagen",
    "detail.expo": "Expo",
    "detail.bagDrop": "Kleiderbeutel",
    "detail.toilets": "Toiletten",
    "detail.medical": "Medical",
    "detail.pacers": "Pacemaker",
    "detail.records": "Rekorde",
    "detail.category": "Kategorie",
    "detail.name": "Name",
    "detail.timeResult": "Zeit",
    "detail.year": "Jahr",
    "detail.finishers": "Finisher",
    "detail.avgFinish": "Durchschnittszeit",
    "detail.dnfRate": "DNF-Rate",
    "detail.winners": "Letzte Sieger",
    "detail.train": "Bahnhof",
    "detail.airport": "Flughafen",
    "detail.publicTransport": "\u00d6PNV",
    "detail.parking": "Parken",
    "detail.accommodation": "Unterkunft",
    "detail.travelNotes": "Reisehinweise",
    "detail.eventLocation": "Eventort",
    "detail.approxLocation": "Ungef\u00e4hrer Eventort. Nutze Veranstalterinfos f\u00fcr genaue Start- und Zugangsbereiche.",
    "detail.minimumAge": "Mindestalter",
    "detail.qualification": "Qualifikation",
    "detail.refundPolicy": "Erstattung",
    "detail.transferPolicy": "\u00dcbertragung",
    "detail.mandatoryGear": "Pflichtausr\u00fcstung",
    "detail.medicalCertificate": "\u00c4rztliches Attest",
    "detail.athleteGuide": "Athlete-Guide-Hinweise",
    "detail.verification": "Verifizierung",
    "detail.sourceType": "Quellentyp",
    "detail.needsReview": "Zu pr\u00fcfen",
    "detail.notVerified": "Nicht best\u00e4tigt",
    "detail.notOfficiallyConfirmed": "Noch nicht offiziell best\u00e4tigt",
    "detail.unknown": "Unbekannt",
    "detail.tba": "TBA"
  }
};

function detailTranslation(key) {
  return DETAIL_TRANSLATIONS.en[key] || key;
}

function detailLabel(key) {
  return `<span data-detail-i18n="${escapeHtml(key)}">${escapeHtml(detailTranslation(key))}</span>`;
}

function detailI18nAttr(key) {
  return `data-detail-i18n="${escapeHtml(key)}"`;
}

function detailDataLabelAttr(key) {
  return `data-label="${escapeHtml(detailTranslation(key))}" data-detail-i18n-label="${escapeHtml(key)}"`;
}

function detailFallback(key = "detail.tba") {
  return `<span class="event-detail-tba" ${detailI18nAttr(key)}>${escapeHtml(detailTranslation(key))}</span>`;
}

function buildDetailLanguageControl() {
  return `
      <label class="event-detail-language-control">
        <span ${detailI18nAttr("detail.language")}>${escapeHtml(detailTranslation("detail.language"))}</span>
        <select id="eventDetailLanguageSelect" aria-label="${escapeHtml(detailTranslation("detail.language"))}">
          <option value="en">EN</option>
          <option value="de">DE</option>
        </select>
      </label>`;
}

function buildDetailI18nScript() {
  const translations =
    JSON.stringify(DETAIL_TRANSLATIONS).replace(/</g, "\\u003c");

  return `
  <script>
    (function () {
      var storageKey = "sportEventMapLanguage";
      var dictionary = ${translations};

      function getLanguage() {
        try {
          return localStorage.getItem(storageKey) === "de" ? "de" : "en";
        } catch (_error) {
          return "en";
        }
      }

      function translate(key) {
        var language = getLanguage();
        var labels = dictionary[language] || dictionary.en;
        return labels[key] || dictionary.en[key] || key;
      }

      window.sportEventMapDetailI18n = {
        getLanguage: getLanguage,
        translate: translate,
        applyLanguage: applyLanguage
      };

      function applyLanguage() {
        var language = getLanguage();
        var labels = dictionary[language] || dictionary.en;
        document.documentElement.lang = language;

        document.querySelectorAll("[data-detail-i18n]").forEach(function (element) {
          var key = element.getAttribute("data-detail-i18n");
          if (labels[key]) {
            element.textContent = labels[key];
          }
        });

        document.querySelectorAll("[data-detail-i18n-label]").forEach(function (element) {
          var key = element.getAttribute("data-detail-i18n-label");
          if (labels[key]) {
            element.setAttribute("data-label", labels[key]);
          }
        });

        document.querySelectorAll("[data-detail-verification-date]").forEach(function (element) {
          var value = element.getAttribute("data-detail-verification-date");
          var parts = value ? value.split("-").map(Number) : [];
          if (parts.length === 3 && parts.every(Number.isFinite)) {
            element.textContent = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC"
            }).format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
          }
        });

        var select = document.getElementById("eventDetailLanguageSelect");
        if (select) {
          select.value = language;
          select.setAttribute("aria-label", labels["detail.language"] || "Language");
        }
      }

      document.addEventListener("DOMContentLoaded", function () {
        var select = document.getElementById("eventDetailLanguageSelect");
        if (select) {
          select.value = getLanguage();
          select.addEventListener("change", function () {
            try {
              localStorage.setItem(storageKey, select.value === "de" ? "de" : "en");
            } catch (_error) {}
            applyLanguage();
            window.dispatchEvent(new CustomEvent("sport-event-map-detail-languagechange", {
              detail: {
                language: getLanguage()
              }
            }));
          });
        }

        applyLanguage();
      });
    })();
  </script>`;
}

function toUsefulArray(value) {
  if (Array.isArray(value)) {
    return value.flatMap(toUsefulArray).filter(hasUsefulValue);
  }

  if (!hasUsefulValue(value)) {
    return [];
  }

  if (typeof value === "object") {
    return [value];
  }

  return clean(value)
    .split(/\s*\/\s*|\s*;\s*/)
    .map(clean)
    .filter(hasUsefulValue);
}

function compactFactValue(value, options = {}) {
  if (Array.isArray(value)) {
    return value
      .map(item => typeof item === "object" ? formatRichValue(item) : clean(item))
      .filter(hasUsefulValue)
      .join(" / ");
  }

  const text =
    clean(value);

  if (!text) {
    return "";
  }

  if (options.kind === "cutoff") {
    const duration =
      text.match(/\b\d{1,2}:\d{2}\s*h\b/i) ||
      text.match(/\b\d{1,2}(?:[.,]\d+)?\s*(?:h|hr|hrs|hours|Stunden)\b/i);

    if (duration) {
      return duration[0];
    }
  }

  if (options.kind === "status") {
    const statusText = text
      .split(/[.;]/)[0]
      .replace(/\s+/g, " ")
      .trim();

    if (/lottery closed/i.test(statusText)) {
      return "Lottery closed";
    }

    if (/registration open/i.test(statusText)) {
      return "Registration open";
    }

    if (/sold out/i.test(statusText)) {
      return "Sold out";
    }

    return statusText.length <= 32
      ? statusText
      : `${statusText.slice(0, 29).trim()}...`;
  }

  if (options.kind === "date") {
    const isoDate =
      text.match(/\b\d{4}-\d{2}-\d{2}\b/);
    const germanDate =
      text.match(/\b\d{2}\.\d{2}\.\d{4}\b/);

    if (isoDate) {
      return isoDate[0];
    }

    if (germanDate) {
      return germanDate[0];
    }
  }

  if (options.kind === "elevation") {
    if (/very little elevation/i.test(text)) {
      return "Very low";
    }

    if (/flat/i.test(text)) {
      return "Flat";
    }

    const elevationMatch =
      text.match(/\b\d[\d.,]*\s*(?:m|m\+|hm|meter|metres|meters|ft|feet|d\+)\b/i);

    if (elevationMatch) {
      return elevationMatch[0];
    }
  }

  if (options.kind === "participants") {
    const participants =
      text.match(/\b(?:approximately|approx\.?|around|ca\.?)?\s*[\d.,]+\s*(?:athletes|participants|runners|starter|Teilnehmende)?\b/i);

    if (participants) {
      return participants[0].trim();
    }
  }

  if (text.length <= 58) {
    return text;
  }

  const firstSentence =
    text.split(/[.!?]\s+/).find(part => part.length <= 72);

  if (firstSentence) {
    return firstSentence.replace(/[.!?]+$/, "");
  }

  return `${text.slice(0, 68).trim()}...`;
}

function compactSummaryValue(value) {
  const text =
    clean(value);

  if (text.length <= 260) {
    return text;
  }

  const sentences =
    text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary =
    sentences.reduce((parts, sentence) => {
      const candidate =
        [...parts, sentence].join(" ");

      return candidate.length <= 260
        ? [...parts, sentence]
        : parts;
    }, []).join(" ");

  return summary || `${text.slice(0, 240).trim()}...`;
}

function sectionHeading(eyebrowKey, titleKey, intro = "") {
  return `
      <div class="race-guide-section-heading">
        <span ${detailI18nAttr(eyebrowKey)}>${escapeHtml(detailTranslation(eyebrowKey))}</span>
        <h2 ${detailI18nAttr(titleKey)}>${escapeHtml(detailTranslation(titleKey))}</h2>
        ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
      </div>`;
}

function renderFactCard(iconName, labelKey, value, options = {}) {
  const useful =
    hasUsefulValue(value);

  if (!useful && !options.always) {
    return "";
  }

  const display =
    useful
      ? compactFactValue(value, options)
      : "";
  const fullText =
    useful
      ? publicValueText(Array.isArray(value) ? value.join(" / ") : value)
      : "";

  return `
        <article class="race-guide-fact-card ${options.tone ? `is-${options.tone}` : ""}">
          ${detailIcon(iconName)}
          <span>${detailLabel(labelKey)}</span>
          <strong ${fullText && display !== fullText ? `title="${escapeHtml(fullText)}"` : ""}>${useful ? options.html || escapeHtml(display) : detailFallback(options.fallbackKey)}</strong>
        </article>`;
}

function renderStatusBadge(value) {
  if (!hasUsefulValue(value)) {
    return "";
  }

  const text =
    clean(value);
  const normalized =
    text.toLowerCase();
  const tone =
    /cancel|sold|geschlossen|ausverkauft/.test(normalized)
      ? "sold-out"
      : /lottery|soon|expected|review|pending|closed|not open/.test(normalized)
          ? "pending"
          : /open|available|verified/.test(normalized)
        ? "verified"
          : "reference";

  return detailBadge(text, tone);
}

function renderRegistrationStatusCard(value) {
  if (!hasUsefulValue(value)) {
    return "";
  }

  const text =
    publicValueText(value);
  const parts =
    text
      .split(/[.;]/)
      .map(clean)
      .filter(Boolean);
  const primary =
    parts[0] || text;
  const secondary =
    parts.slice(1).join(". ");

  return `
        <article class="race-guide-registration-status">
          ${detailIcon("status")}
          <span>${detailLabel("detail.status")}</span>
          <strong>${escapeHtml(primary)}</strong>
          ${secondary ? `<small title="${escapeHtml(secondary)}">${escapeHtml(compactFactValue(secondary))}</small>` : ""}
        </article>`;
}

function renderChipList(labelKey, values) {
  const chips =
    toUsefulArray(values)
      .filter(item => typeof item !== "object")
      .map(item => `<span class="race-guide-chip">${escapeHtml(item)}</span>`)
      .join("");

  if (!chips) {
    return "";
  }

  return `
      <div class="race-guide-chip-group">
        <span>${detailLabel(labelKey)}</span>
        <div class="race-guide-chips">${chips}</div>
      </div>`;
}

function renderInfoBox(titleKey, value, iconName = "info") {
  if (!hasUsefulValue(value)) {
    return "";
  }

  return `
      <article class="race-guide-info-box">
        ${detailIcon(iconName)}
        <div>
          <h3>${detailLabel(titleKey)}</h3>
          <p>${formatRichValue(value)}</p>
        </div>
      </article>`;
}

function renderAccordion(titleKey, value) {
  if (!hasUsefulValue(value)) {
    return "";
  }

  return `
      <details class="race-guide-accordion">
        <summary>${detailLabel(titleKey)}</summary>
        <div>${formatRichValue(value)}</div>
      </details>`;
}

function renderTable(headers, rows, className = "") {
  const cleanRows =
    rows.filter(row => row.some(cell => hasUsefulValue(cell.value)));

  if (!cleanRows.length) {
    return "";
  }

  return `
      <div class="race-guide-table-wrap ${className}">
        <table class="race-guide-table">
          <thead>
            <tr>${headers.map(header => `<th ${detailI18nAttr(header.key)}>${escapeHtml(detailTranslation(header.key))}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${cleanRows.map(row => `
              <tr>
                ${row.map((cell, index) => `
                  <td ${detailDataLabelAttr(headers[index].key)}>${hasUsefulValue(cell.value) ? cell.html || escapeHtml(publicValueText(cell.value)) : ""}</td>`).join("")}
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
}

function parseStartWaves(raceDay = {}) {
  const source =
    firstUsefulValue(raceDay.start_waves, raceDay.wave_start);

  if (Array.isArray(source)) {
    return source
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const explicitWave =
          clean(entry.label || entry.wave_number || entry.name);
        const blocks =
          clean(entry.blocks || entry.block || entry.corral || entry.corrals || entry.wave || entry.category);
        const time =
          clean(entry.time || entry.start_time || entry.start);

        return {
          wave: explicitWave || `Wave ${index + 1}`,
          blocks,
          time
        };
      })
      .filter(row => hasUsefulValue(row));
  }

  const text =
    clean(source);

  if (!text) {
    return [];
  }

  return text
    .split(/\s*;\s*/)
    .map((part, index) => {
      const item =
        clean(part);
      const withWave =
        item.match(/^(?:wave|welle)\s*(\d+)?\s*([^:]*?)\s*:\s*(\d{1,2}:\d{2})/i);

      if (withWave) {
        return {
          wave: withWave[1] ? `Wave ${withWave[1]}` : `Wave ${index + 1}`,
          blocks: clean(withWave[2]),
          time: withWave[3]
        };
      }

      const timeFirst =
        item.match(/^(\d{1,2}:\d{2})\s+(.+)$/);

      if (timeFirst) {
        return {
          wave: `Wave ${index + 1}`,
          blocks: clean(timeFirst[2]),
          time: timeFirst[1]
        };
      }

      return null;
    })
    .filter(row => row && hasUsefulValue(row.time || row.blocks));
}

function parseCutoffRows(raceDay = {}) {
  const rows = [];
  const seen = new Set();

  function add(point, deadline) {
    const cleanPoint =
      clean(point);
    const cleanDeadline =
      clean(deadline);
    const key =
      `${cleanPoint}|${cleanDeadline}`.toLowerCase();

    if (!cleanPoint || !cleanDeadline || seen.has(key)) {
      return;
    }

    seen.add(key);
    rows.push({
      point: cleanPoint,
      deadline: cleanDeadline
    });
  }

  const structured =
    raceDay.intermediate_cutoffs || raceDay.cutoff_times || raceDay.cutoffs;

  if (Array.isArray(structured)) {
    structured.forEach(entry => {
      if (!entry || typeof entry !== "object") {
        return;
      }

      add(
        entry.location || entry.point || entry.km || entry.kilometer || entry.name,
        entry.deadline || entry.time || entry.cutoff || entry.value
      );
    });
  }

  const text =
    [
      raceDay.intermediate_cutoffs,
      raceDay.cutoff_times,
      raceDay.total_cutoff,
      raceDay.swim_cutoff && `Swim ${raceDay.swim_cutoff}`,
      raceDay.bike_cutoff && `Bike ${raceDay.bike_cutoff}`,
      raceDay.run_cutoff && `Run ${raceDay.run_cutoff}`
    ]
      .filter(value => typeof value === "string" && hasUsefulValue(value))
      .join(" ");

  if (text) {
    let match;
    const kmPattern =
      /\b(km|kilometer|mile)\s*([\d.,]+)\s*(?:by|bis|at|um)?\s*(\d{1,2}:\d{2})/gi;

    while ((match = kmPattern.exec(text)) !== null) {
      add(`${match[1].toLowerCase() === "mile" ? "mile" : "km"} ${match[2]}`, match[3]);
    }

    const finishPattern =
      /\b(finish|ziel|official finish)[^\d]{0,34}(\d{1,2}:\d{2})/gi;

    while ((match = finishPattern.exec(text)) !== null) {
      add("Finish", match[2]);
    }
  }

  return rows;
}

function renderStartWaves(raceDay = {}) {
  const rows =
    parseStartWaves(raceDay);

  if (!rows.length) {
    return "";
  }

  return `
    <div class="race-guide-subsection">
      <h3>${detailLabel("detail.startWaves")}</h3>
      ${renderTable(
        [
          { key: "detail.wave" },
          { key: "detail.blocks" },
          { key: "detail.time" }
        ],
        rows.map(row => [
          { value: row.wave },
          { value: row.blocks },
          { value: row.time }
        ]),
        "is-compact"
      )}
    </div>`;
}

function renderCutoffTimes(raceDay = {}) {
  const rows =
    parseCutoffRows(raceDay);
  const overall =
    firstUsefulValue(raceDay.total_cutoff, raceDay.overall_cutoff);

  if (!rows.length && !hasUsefulValue(overall)) {
    return "";
  }

  return `
    <div class="race-guide-subsection">
      <h3>${detailLabel("detail.cutoffTimes")}</h3>
      ${hasUsefulValue(overall) ? `
        <div class="race-guide-highlight">
          <span>${detailLabel("detail.overallCutoff")}</span>
          <strong>${escapeHtml(compactFactValue(overall, { kind: "cutoff" }))}</strong>
        </div>` : ""}
      ${rows.length ? `
        <div class="race-guide-timeline">
          ${rows.map(row => `
            <article>
              <span>${escapeHtml(row.point)}</span>
              <strong>${escapeHtml(row.deadline)}</strong>
            </article>`).join("")}
        </div>
        ${renderTable(
          [
            { key: "detail.point" },
            { key: "detail.deadlineTime" }
          ],
          rows.map(row => [
            { value: row.point },
            { value: row.deadline }
          ]),
          "is-compact"
        )}` : ""}
    </div>`;
}

function extractAidStationData(value) {
  const text =
    clean(value);
  const parseText =
    text.replace(/(\d)\.(\d)/g, "$1,$2");
  const supplies = [];
  const tableRows = [];
  const supplyPatterns = [
    ["Water", /water|wasser/i],
    ["Fruit", /fruit|obst|banana|banane/i],
    ["Tea", /tea|tee/i],
    ["Sports drink", /sports drink|drink mix|isotonic|iso/i],
    ["Gels", /gel/i],
    ["Cola", /cola/i],
    ["Refill", /refill/i]
  ];

  supplyPatterns.forEach(([label, pattern]) => {
    if (pattern.test(parseText)) {
      supplies.push(label);
    }
  });

  let match;
  const atKmPattern =
    /([A-Z][^.;:]{2,90}?)\s+(?:(?:is|are)\s+listed|(?:is|are)|available|listed)\s+(?:at|bei)\s+km\s+([^.;]+)/gi;

  while ((match = atKmPattern.exec(parseText)) !== null) {
    tableRows.push({
      km: clean(match[2]).replace(/\s+and\s+/gi, ", "),
      supplies: clean(match[1])
    });
  }

  const countMatch =
    parseText.match(/\b(\d+)\s+(?:official\s+)?(?:refreshment|aid|water|supply|Verpflegungs)[-\s]?(?:stations|points|Stationen)?/i);

  return {
    text,
    count: countMatch ? countMatch[1] : "",
    supplies,
    tableRows
  };
}

function renderAidStations(raceDay = {}, course = {}) {
  const value =
    firstUsefulValue(course.aid_stations, raceDay.aid_stations);

  if (!hasUsefulValue(value)) {
    return "";
  }

  const data =
    extractAidStationData(value);

  return `
    <div class="race-guide-subsection">
      <h3>${detailLabel("detail.aidStations")}</h3>
      <div class="race-guide-aid-layout">
        ${data.count ? `
          <div class="race-guide-highlight">
            <span>${detailLabel("detail.stationCount")}</span>
            <strong>${escapeHtml(data.count)}</strong>
          </div>` : ""}
        ${data.supplies.length ? renderChipList("detail.supplies", data.supplies) : ""}
      </div>
      ${data.tableRows.length ? renderTable(
        [
          { key: "detail.kilometer" },
          { key: "detail.supplies" }
        ],
        data.tableRows.map(row => [
          { value: row.km },
          { value: row.supplies }
        ]),
        "is-compact"
      ) : renderAccordion("detail.details", data.text)}
    </div>`;
}

function parseCourseRecord(value, category) {
  const text =
    clean(value);

  if (!hasUsefulValue(text)) {
    return null;
  }

  const timeMatch =
    text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
  const yearMatch =
    text.match(/\b(?:19|20)\d{2}\b/);
  let name =
    text;

  if (timeMatch) {
    name = name.replace(timeMatch[0], "");
  }

  if (yearMatch) {
    name = name.replace(yearMatch[0], "");
  }

  name = name
    .replace(/[-–—(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    category,
    name,
    time: timeMatch ? timeMatch[0] : "",
    year: yearMatch ? yearMatch[0] : ""
  };
}

function getCourseRecords(statistics = {}, course = {}) {
  const structured =
    firstUsefulValue(statistics.course_records, course.course_records);

  if (Array.isArray(structured)) {
    return structured
      .filter(hasUsefulValue)
      .map(record => ({
        category: clean(record.category || record.gender || record.division),
        name: clean(record.name || record.athlete),
        country: clean(record.country),
        time: clean(record.time || record.result),
        year: clean(record.year)
      }));
  }

  return [
    parseCourseRecord(statistics.course_record_male || course.course_record_male, "Men"),
    parseCourseRecord(statistics.course_record_female || course.course_record_female, "Women")
  ].filter(Boolean);
}

function getFeeRows(registration = {}, detailRows = []) {
  const rows = [];
  const tiers =
    registration.price_tiers;

  if (Array.isArray(tiers)) {
    tiers.forEach((tier, index) => {
      if (!hasUsefulValue(tier)) {
        return;
      }

      if (typeof tier === "object") {
        rows.push({
          tier: tier.tier || tier.name || `Tier ${index + 1}`,
          price: tier.price || tier.fee || tier.value,
          until: formatDetailDate(tier.until || tier.deadline || tier.valid_until)
        });
        return;
      }

      rows.push({
        tier: `Tier ${index + 1}`,
        price: clean(tier),
        until: ""
      });
    });
  }

  if (!rows.length) {
    detailRows.forEach(row => {
      const fee =
        getFee2026(row) || getFee2025(row);

      if (!hasUsefulValue(fee)) {
        return;
      }

      rows.push({
        tier: clean(row.category_name || "Entry Fee"),
        price: formatMoney(fee, row.currency || "EUR").replace(/&euro;/g, "EUR "),
        until: formatDetailDate(row.registration_deadline)
      });
    });
  }

  if (!rows.length && hasUsefulValue(registration.entry_fee_min || registration.entry_fee_current_year || registration.entry_fee_max)) {
    rows.push({
      tier: "Entry Fee",
      price: firstUsefulValue(
        registration.entry_fee_current_year,
        registration.entry_fee_min && registration.entry_fee_max
          ? `${registration.entry_fee_min} - ${registration.entry_fee_max}`
          : "",
        registration.entry_fee_min
      ),
      until: formatDetailDate(registration.registration_deadline || registration.registration_close_date)
    });
  }

  return rows;
}

function formatDetailDate(value) {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  return match
    ? `${match[3]}.${match[2]}.${match[1]}`
    : text;
}

function buildRaceGuideHero(event, richDetails = null, statusLabel = "", website = "") {
  const registration =
    getRichDetailsSection(richDetails, "registration");
  const teaser =
    compactSummaryValue(buildEventTeaser(event, richDetails));
  const status =
    firstUsefulValue(registration.registration_status, statusLabel);

  return `
    <section class="event-detail-hero race-guide-hero">
      <div class="event-detail-hero-main">
        <span class="event-detail-kicker">${escapeHtml(clean(event.sport) || "Event")}</span>
        <h1>${escapeHtml(event.event_name)}</h1>
        <p>${escapeHtml(teaser)}</p>
      </div>
      <div class="event-detail-cta-card">
        <div class="race-guide-status-panel">
          ${renderStatusBadge(status)}
          <p class="event-detail-status-note" ${detailI18nAttr("detail.verifyOrganizer")}>${escapeHtml(detailTranslation("detail.verifyOrganizer"))}</p>
        </div>
        <div class="event-detail-action-group">
          <button class="event-detail-secondary" id="addDetailEventToSeason" type="button" aria-pressed="false">${escapeHtml(detailTranslation("detail.addSeason"))}</button>
          ${website ? `<a class="event-detail-primary" href="${website}" target="_blank" rel="noopener noreferrer"><span ${detailI18nAttr("detail.officialWebsite")}>${escapeHtml(detailTranslation("detail.officialWebsite"))}</span>${detailIcon("external")}</a>` : ""}
        </div>
        <p class="event-detail-action-status" id="detailActionStatus" role="status" aria-live="polite"></p>
      </div>
    </section>`;
}

function buildRaceGuideEventBrand(event, richDetails = null) {
  const organizer = resolveOrganizer(event, richDetails);
  const officialWebsite = getOfficialEventWebsite(event, richDetails);
  const cards = [
    organizer
      ? renderFactCard("check", "detail.organizer", organizer.name, {
          html: organizer.url
            ? `<a href="${organizer.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(organizer.name)}</a>`
            : escapeHtml(organizer.name)
        })
      : "",
    officialWebsite
      ? renderFactCard("external", "detail.officialWebsite", officialWebsite, {
          html: `<a href="${officialWebsite}" target="_blank" rel="noopener noreferrer" ${detailI18nAttr("detail.openOfficialWebsite")}>${escapeHtml(detailTranslation("detail.openOfficialWebsite"))}</a>`
        })
      : ""
  ].filter(Boolean).join("");

  if (!cards) {
    return "";
  }

  return `
    <section id="event-brand" class="event-detail-card race-guide-section event-brand-section">
      ${sectionHeading("detail.event", "detail.event")}
      <div class="race-guide-fact-grid is-tight">${cards}</div>
    </section>`;
}

function buildEditionSectionHeading(event) {
  const year = clean(event.edition_year || getEventYear(event));
  return `
      <div class="race-guide-section-heading">
        <span ${detailI18nAttr("detail.overview")}>${escapeHtml(detailTranslation("detail.overview"))}</span>
        <h2><span ${detailI18nAttr("detail.edition")}>${escapeHtml(detailTranslation("detail.edition"))}</span>${year ? ` ${escapeHtml(year)}` : ""}</h2>
      </div>`;
}

function buildRaceGuideKeyFacts(event, detailRows = [], richDetails = null, statusLabel = "") {
  const registration =
    getRichDetailsSection(richDetails, "registration");
  const course =
    getRichDetailsSection(richDetails, "course");
  const raceDay =
    getRichDetailsSection(richDetails, "race_day");
  const statistics =
    getRichDetailsSection(richDetails, "statistics");
  const elevation =
    firstUsefulValue(
      course.elevation_gain,
      course.bike_elevation,
      detailRows.map(row => getElevation(row)).filter(Boolean).join(" / ")
    );
  const cutoff =
    firstUsefulValue(
      raceDay.total_cutoff,
      raceDay.swim_cutoff || raceDay.bike_cutoff || raceDay.run_cutoff,
      detailRows.map(row => getCutoff(row)).filter(Boolean).join(" / ")
    );
  const startTime =
    firstUsefulValue(
      raceDay.start_time,
      detailRows.map(row => clean(row.start_time)).filter(hasUsefulValue).join(" / ")
    );
  const verification = getVerificationContext(event, richDetails);
  const lastChecked = parseEventDate(verification.edition.lastVerifiedAt);
  const fallbackKey = editionFallbackKey(event);
  const date = clean(event.event_status).toLowerCase() === "date_unconfirmed"
    ? ""
    : event.date;
  const distance = firstUsefulValue(
    course.main_distance,
    course.distances,
    formatDistanceSummary(event.distance)
  );

  return `
    <section id="key-facts" class="event-detail-card race-guide-section race-guide-key-facts-section">
      ${buildEditionSectionHeading(event)}
      <div class="race-guide-fact-grid">
        ${renderFactCard("calendar", "detail.date", date, { always: true, fallbackKey })}
        ${renderFactCard("location", "detail.location", `${clean(event.city)}, ${clean(event.country)}`, { always: true })}
        ${renderFactCard("sport", "detail.sport", event.sport, { always: true })}
        ${renderFactCard("distance", "detail.distance", distance, { always: true, fallbackKey })}
        ${renderFactCard("clock", "detail.startTime", startTime)}
        ${renderFactCard("clock", "detail.cutoff", cutoff, { kind: "cutoff" })}
        ${renderFactCard("mountain", "detail.elevation", elevation, { kind: "elevation" })}
        ${renderFactCard("fee", "detail.entryFee", getPriceSummary(registration, detailRows))}
        ${renderFactCard("sport", "detail.participants", firstUsefulValue(statistics.participant_count, statistics.finisher_count), { kind: "participants" })}
        ${renderFactCard("status", "detail.status", firstUsefulValue(registration.registration_status, statusLabel), { kind: "status" })}
        ${renderFactCard("check", "detail.lastChecked", lastChecked, {
          html: lastChecked ? renderVerificationDate(lastChecked) : ""
        })}
      </div>
    </section>`;
}

function formatLastChecked(value) {
  return formatVerificationDate(value);
}

function buildRaceGuideRegistration(event, detailRows = [], richDetails = null, website = "") {
  const registration =
    getRichDetailsSection(richDetails, "registration");
  const registrationUrl =
    safeWebsite(registration.official_registration_url || registration.registration_url || event.registration_url);
  const feeRows =
    getFeeRows(registration, detailRows);
  const period =
    [
      registration.registration_open_date,
      registration.registration_close_date
    ].filter(hasUsefulValue).map(formatDetailDate).join(" – ");
  const blocks = [
    renderRegistrationStatusCard(firstUsefulValue(
      registration.registration_status,
      detailRows.map(row => inferRegistrationStatus(row)).filter(hasUsefulValue).join(" / "),
      getRegistrationStatus(event, richDetails, detailRows)
    )),
    renderFactCard("calendar", "detail.registrationPeriod", period, { tone: "registration-period" }),
    renderFactCard("calendar", "detail.deadline", formatDetailDate(firstUsefulValue(registration.registration_close_date, registration.registration_deadline)), { kind: "date", tone: "registration-deadline" }),
    renderFactCard("fee", "detail.entryFee", getPriceSummary(registration, detailRows)),
    registrationUrl ? `<a class="race-guide-registration-link" href="${registrationUrl}" target="_blank" rel="noopener noreferrer"><span ${detailI18nAttr("detail.openRegistration")}>${escapeHtml(detailTranslation("detail.openRegistration"))}</span></a>` : ""
  ].filter(Boolean).join("");
  const feeTable =
    feeRows.length
      ? renderTable(
          [
            { key: "detail.tier" },
            { key: "detail.price" },
            { key: "detail.until" }
          ],
          feeRows.map(row => [
            { value: row.tier },
            { value: row.price },
            { value: row.until }
          ]),
          "is-compact"
        )
      : "";
  const accordions = [
    renderAccordion("detail.transferPolicy", registration.transfer_possible),
    renderAccordion("detail.refundPolicy", registration.refund_policy),
    renderAccordion("detail.qualification", registration.qualification_required),
    renderAccordion("detail.details", registration.verification_note)
  ].join("");

  if (!blocks && !feeTable && !accordions) {
    return "";
  }

  return `
    <section id="registration" class="event-detail-card race-guide-section">
      ${sectionHeading("detail.registration", "detail.registration")}
      <div class="race-guide-action-grid">${blocks}</div>
      ${feeTable ? `
        <div class="race-guide-subsection">
          <h3>${detailLabel("detail.feeTiers")}</h3>
          ${feeTable}
        </div>` : ""}
      ${accordions ? `<div class="race-guide-accordion-list">${accordions}</div>` : ""}
    </section>`;
}

function buildRaceGuideCourse(event, detailRows = [], richDetails = null) {
  const course =
    getRichDetailsSection(richDetails, "course");
  const raceDay =
    getRichDetailsSection(richDetails, "race_day");
  const elevation =
    firstUsefulValue(course.elevation_gain, course.bike_elevation, detailRows.map(row => getElevation(row)).filter(Boolean).join(" / "));
  const mapUrl =
    safeWebsite(course.course_map_url || course.gpx_url || course.elevation_profile_url);
  const cards = [
    renderFactCard("distance", "detail.distance", firstUsefulValue(course.main_distance, course.distances, formatDistanceSummary(event.distance)), { always: true }),
    renderFactCard("mountain", "detail.elevation", elevation),
    renderFactCard("map", "detail.routeType", firstUsefulValue(course.course_type, course.course_format)),
    renderFactCard("star", "detail.courseProfile", firstUsefulValue(course.personal_best_potential, course.difficulty_rating))
  ].join("");
  const chips = [
    renderChipList("detail.surface", firstUsefulValue(course.surface, course.course_type)),
    renderChipList("detail.routeType", [course.course_format, course.loop_course === true ? "Loop" : "", course.point_to_point === true ? "Point-to-point" : ""].filter(Boolean))
  ].join("");
  const content = [
    cards,
    chips,
    renderInfoBox("detail.courseProfile", firstUsefulValue(course.course_character, course.risk_notes), "distance"),
    mapUrl ? `<a class="event-detail-primary race-guide-inline-action" href="${mapUrl}" target="_blank" rel="noopener noreferrer" ${detailI18nAttr("detail.mapGpx")}>${escapeHtml(detailTranslation("detail.mapGpx"))}</a>` : ""
  ].filter(Boolean).join("");

  if (!content) {
    return "";
  }

  return `
    <section id="course" class="event-detail-card race-guide-section">
      ${sectionHeading("detail.course", "detail.course")}
      <div class="race-guide-fact-grid is-tight">${cards}</div>
      ${chips}
      ${renderInfoBox("detail.courseProfile", firstUsefulValue(course.course_character, course.risk_notes), "distance")}
      ${mapUrl ? `<a class="event-detail-primary race-guide-inline-action" href="${mapUrl}" target="_blank" rel="noopener noreferrer" ${detailI18nAttr("detail.mapGpx")}>${escapeHtml(detailTranslation("detail.mapGpx"))}</a>` : ""}
    </section>`;
}

function buildRaceGuideRaceDay(richDetails = null, detailRows = []) {
  const raceDay =
    getRichDetailsSection(richDetails, "race_day");
  const course =
    getRichDetailsSection(richDetails, "course");
  const startTime =
    firstUsefulValue(
      raceDay.start_time,
      detailRows.map(row => clean(row.start_time)).filter(hasUsefulValue).join(" / ")
    );
  const cutoff =
    firstUsefulValue(
      raceDay.total_cutoff,
      detailRows.map(row => getCutoff(row)).filter(Boolean).join(" / ")
    );
  const quickFacts = [
    renderFactCard("clock", "detail.startTime", startTime),
    renderFactCard("location", "detail.start", firstUsefulValue(raceDay.start_area, course.start_location)),
    renderFactCard("location", "detail.finish", firstUsefulValue(raceDay.finish_area, course.finish_location)),
    renderFactCard("info", "detail.bagDrop", raceDay.bag_drop),
    renderFactCard("info", "detail.toilets", raceDay.toilets),
    renderFactCard("check", "detail.medical", firstUsefulValue(raceDay.medical, raceDay.medical_support)),
    renderFactCard("check", "detail.bibPickup", compactFactValue(raceDay.bib_pickup_info))
  ].join("");
  const details = [
    renderStartWaves(raceDay),
    renderCutoffTimes(raceDay),
    !parseCutoffRows(raceDay).length &&
    !hasUsefulValue(firstUsefulValue(raceDay.total_cutoff, raceDay.overall_cutoff)) &&
    hasUsefulValue(cutoff) ? `
      <div class="race-guide-subsection">
        <h3>${detailLabel("detail.cutoffTimes")}</h3>
        <div class="race-guide-highlight">
          <span>${detailLabel("detail.overallCutoff")}</span>
          <strong>${escapeHtml(compactFactValue(cutoff, { kind: "cutoff" }))}</strong>
        </div>
      </div>` : "",
    renderAidStations(raceDay, course),
    renderFactCard("sport", "detail.pacers", raceDay.pacers_available),
    renderAccordion("detail.bibPickup", raceDay.bib_pickup_info),
    renderAccordion("detail.expo", firstUsefulValue(raceDay.expo, raceDay.expo_available)),
    renderAccordion("detail.details", firstUsefulValue(raceDay.cutoff_consequence, raceDay.self_catering, raceDay.verification_note))
  ].join("");

  if (!quickFacts && !details) {
    return "";
  }

  return `
    <section id="race-day" class="event-detail-card race-guide-section">
      ${sectionHeading("detail.raceDay", "detail.raceDay")}
      ${quickFacts ? `<div class="race-guide-fact-grid is-tight">${quickFacts}</div>` : ""}
      ${details}
    </section>`;
}

function buildRaceGuidePerformance(richDetails = null) {
  const statistics =
    getRichDetailsSection(richDetails, "statistics");
  const course =
    getRichDetailsSection(richDetails, "course");
  const records =
    getCourseRecords(statistics, course);
  const recordTable =
    records.length
      ? renderTable(
          [
            { key: "detail.category" },
            { key: "detail.name" },
            { key: "detail.timeResult" },
            { key: "detail.year" }
          ],
          records.map(record => [
            { value: record.category },
            { value: record.name || record.country },
            { value: record.time },
            { value: record.year }
          ]),
          "is-compact"
        )
      : "";
  const winnerRows = [];

  if (hasUsefulValue(statistics.last_winner_male || statistics.last_winning_time_male)) {
    winnerRows.push([
      { value: "Men" },
      { value: statistics.last_winner_male },
      { value: statistics.last_winning_time_male },
      { value: "" }
    ]);
  }

  if (hasUsefulValue(statistics.last_winner_female || statistics.last_winning_time_female)) {
    winnerRows.push([
      { value: "Women" },
      { value: statistics.last_winner_female },
      { value: statistics.last_winning_time_female },
      { value: "" }
    ]);
  }

  const statsCards = [
    renderFactCard("sport", "detail.participants", statistics.participant_count, { kind: "participants" }),
    renderFactCard("check", "detail.finishers", statistics.finisher_count),
    renderFactCard("clock", "detail.avgFinish", statistics.average_finish_time),
    renderFactCard("status", "detail.dnfRate", statistics.dnf_rate)
  ].join("");
  const winners =
    winnerRows.length
      ? `<div class="race-guide-subsection"><h3>${detailLabel("detail.winners")}</h3>${renderTable(
          [
            { key: "detail.category" },
            { key: "detail.name" },
            { key: "detail.timeResult" },
            { key: "detail.year" }
          ],
          winnerRows,
          "is-compact"
        )}</div>`
      : "";

  if (!recordTable && !statsCards && !winners && !hasUsefulValue(statistics.historic_significance)) {
    return "";
  }

  return `
    <section id="performance" class="event-detail-card race-guide-section">
      ${sectionHeading("detail.performance", "detail.performance")}
      ${statsCards ? `<div class="race-guide-fact-grid is-tight">${statsCards}</div>` : ""}
      ${recordTable ? `<div class="race-guide-subsection"><h3>${detailLabel("detail.records")}</h3>${recordTable}</div>` : ""}
      ${winners}
      ${renderInfoBox("detail.details", statistics.historic_significance, "star")}
    </section>`;
}

function buildRaceGuideLogistics(event, richDetails = null) {
  const travel =
    getRichDetailsSection(richDetails, "travel");
  const raceDay =
    getRichDetailsSection(richDetails, "race_day");
  const weather =
    getRichDetailsSection(richDetails, "weather");
  const hasMap =
    Number.isFinite(Number(event.latitude)) &&
    Number.isFinite(Number(event.longitude));
  const cards = [
    renderFactCard("location", "detail.train", travel.nearest_train_station),
    renderFactCard("location", "detail.airport", travel.nearest_airport),
    renderFactCard("map", "detail.expo", firstUsefulValue(travel.expo_location, raceDay.expo)),
    renderFactCard("info", "detail.bagDrop", raceDay.bag_drop)
  ].join("");
  const accordions = [
    renderAccordion("detail.publicTransport", travel.public_transport_info),
    renderAccordion("detail.parking", travel.parking_info),
    renderAccordion("detail.accommodation", travel.accommodation_info),
    renderAccordion("detail.travelNotes", firstUsefulValue(travel.race_day_access_note, travel.recommended_arrival, travel.recommended_booking_time)),
    renderAccordion("detail.weather", firstUsefulValue(weather.typical_weather, weather.best_conditions_note, weather.planning_tip, weather.planning_tips, weather.seasonal_context))
  ].join("");

  if (!cards && !accordions && !hasMap) {
    return "";
  }

  return `
    <section id="logistics" class="event-detail-card race-guide-section">
      ${sectionHeading("detail.logistics", "detail.logistics")}
      ${cards ? `<div class="race-guide-fact-grid is-tight">${cards}</div>` : ""}
      ${accordions ? `<div class="race-guide-accordion-list">${accordions}</div>` : ""}
      ${hasMap ? `
        <div class="race-guide-subsection">
          <h3>${detailLabel("detail.eventLocation")}</h3>
          <div id="eventDetailMap" class="event-detail-map"></div>
          <p class="event-detail-map-note" ${detailI18nAttr("detail.approxLocation")}>${escapeHtml(detailTranslation("detail.approxLocation"))}</p>
        </div>` : ""}
    </section>`;
}

function buildRaceGuideRules(richDetails = null) {
  const registration =
    getRichDetailsSection(richDetails, "registration");
  const raceDay =
    getRichDetailsSection(richDetails, "race_day");
  const rules = [
    renderInfoBox("detail.minimumAge", registration.minimum_age, "check"),
    renderInfoBox("detail.qualification", registration.qualification_required, "check"),
    renderInfoBox("detail.medicalCertificate", registration.medical_certificate, "check"),
    renderInfoBox("detail.mandatoryGear", registration.mandatory_gear || raceDay.mandatory_gear, "check"),
    renderAccordion("detail.refundPolicy", registration.refund_policy),
    renderAccordion("detail.transferPolicy", registration.transfer_possible),
    renderAccordion("detail.cutoff", firstUsefulValue(raceDay.total_cutoff, raceDay.cutoff_consequence)),
    renderAccordion("detail.athleteGuide", firstUsefulValue(raceDay.athlete_guide_notes, registration.athlete_guide_notes))
  ].join("");

  if (!rules) {
    return "";
  }

  return `
    <section id="rules" class="event-detail-card race-guide-section">
      ${sectionHeading("detail.rules", "detail.rules")}
      <div class="race-guide-rule-list">${rules}</div>
    </section>`;
}

function buildRaceGuideFaqSection(event, detailRows = [], richDetails = null, knowledge = null) {
  const customQuestions =
    Array.isArray(richDetails && richDetails.faq)
      ? richDetails.faq
          .map(item => {
            if (Array.isArray(item)) {
              return {
                question: item[0],
                answer: item[1]
              };
            }

            return item || {};
          })
          .filter(item =>
            hasUsefulValue(item.question) &&
            hasUsefulValue(item.answer)
          )
      : [];

  if (!customQuestions.length) {
    return "";
  }

  return `
    <section id="faq" class="event-detail-card race-guide-section">
      ${sectionHeading("detail.faq", "detail.faq")}
      <div class="race-guide-accordion-list">
        ${customQuestions.slice(0, 10).map(item => `
          <details class="race-guide-accordion">
            <summary>${escapeHtml(item.question)}</summary>
            <div>${escapeHtml(item.answer)}</div>
          </details>`).join("")}
      </div>
    </section>`;
}

function buildRaceGuideSources(event, richDetails = null) {
  const sources =
    Array.isArray(richDetails && richDetails.sources)
      ? richDetails.sources.filter(source => safeWebsite(source.source_url || source.url))
      : [];
  const website =
    getOfficialEventWebsite(event, richDetails);
  const fallbackSources =
    website && !sources.length
      ? [{
          source_url: website,
          source_type: "official",
          source_label: "Official event website"
        }]
      : sources;
  const verification = getVerificationContext(event, richDetails);
  const status = verification.edition.status;
  const lastChecked = parseEventDate(verification.edition.lastVerifiedAt);
  const brandLastChecked = parseEventDate(verification.brand.lastVerifiedAt);
  const verificationBadges = [
    lastChecked ? `<span class="event-detail-badge verified">${detailLabel("detail.lastChecked")}: ${renderVerificationDate(lastChecked)}</span>` : "",
    brandLastChecked && parseEventDate(brandLastChecked) !== parseEventDate(lastChecked)
      ? `<span class="event-detail-badge reference">${detailLabel("detail.brandLastChecked")}: ${renderVerificationDate(brandLastChecked)}</span>`
      : "",
    status ? `<span class="event-detail-badge reference">${detailLabel("detail.verification")}: ${escapeHtml(status.replace(/_/g, " "))}</span>` : ""
  ].join("");

  if (!fallbackSources.length && !verificationBadges) {
    return "";
  }

  return `
    <section id="sources" class="event-detail-card race-guide-section event-sources-section is-subtle">
      ${sectionHeading("detail.sources", "detail.sources")}
      ${verificationBadges ? `<div class="event-verification-strip">${verificationBadges}</div>` : ""}
      ${fallbackSources.length ? `
        <div class="event-source-list">
          ${fallbackSources.map(source => `
            <a href="${safeWebsite(source.source_url || source.url)}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(source.source_label || source.source_type || "Official source")}</strong>
              <span>${escapeHtml(source.source_type || "source")}${source.last_verified ? ` &middot; ${renderVerificationDate(source.last_verified)}` : ""}</span>
              ${source.verification_note ? `<em>${escapeHtml(source.verification_note)}</em>` : ""}
            </a>`).join("")}
        </div>` : ""}
    </section>`;
}

function buildRaceGuideNavigation(sections) {
  return `
    <nav class="event-detail-tabs race-guide-tabs" aria-label="Event detail sections">
      ${sections.map(section => `
        <a href="#${section.id}" data-detail-section="${section.id}">${detailIcon(section.icon)}<span ${detailI18nAttr(section.labelKey)}>${escapeHtml(detailTranslation(section.labelKey))}</span></a>`).join("")}
    </nav>`;
}

function buildEventPage(event, slug, detailRows = [], knowledge = null, richDetails = null) {
  const year = getEventYear(event);
  const canonicalUrl = `${SITE_URL}/event/${slug}/`;
  const website = getOfficialEventWebsite(event, richDetails);
  const eventKey = [
    event.event_name,
    event.date,
    event.city
  ].map(clean).join("|").toLowerCase();
  const title = `${clean(event.event_name)} ${year} | Date, Location & Registration | Sport Event Map`;
  const metaDescription =
    clean(richDetails && richDetails.editorial && richDetails.editorial.seo_summary) ||
    `${clean(event.event_name)} in ${clean(event.city)}, ${clean(event.country)}. View date, distance, registration status and official organizer link.`;
  const statusLabel = getRegistrationStatus(event, richDetails, detailRows);
  const hero =
    buildRaceGuideHero(event, richDetails, statusLabel, website);
  const sections =
    [
      {
        id: "event-brand",
        icon: "check",
        labelKey: "detail.event",
        html: buildRaceGuideEventBrand(event, richDetails)
      },
      {
        id: "key-facts",
        icon: "info",
        labelKey: "detail.keyFacts",
        html: buildRaceGuideKeyFacts(event, detailRows, richDetails, statusLabel)
      },
      {
        id: "registration",
        icon: "fee",
        labelKey: "detail.registration",
        html: buildRaceGuideRegistration(event, detailRows, richDetails, website)
      },
      {
        id: "course",
        icon: "distance",
        labelKey: "detail.course",
        html: buildRaceGuideCourse(event, detailRows, richDetails)
      },
      {
        id: "race-day",
        icon: "clock",
        labelKey: "detail.raceDay",
        html: buildRaceGuideRaceDay(richDetails, detailRows)
      },
      {
        id: "performance",
        icon: "star",
        labelKey: "detail.performance",
        html: buildRaceGuidePerformance(richDetails)
      },
      {
        id: "logistics",
        icon: "map",
        labelKey: "detail.logistics",
        html: buildRaceGuideLogistics(event, richDetails)
      },
      {
        id: "rules",
        icon: "check",
        labelKey: "detail.rules",
        html: buildRaceGuideRules(richDetails)
      },
      {
        id: "faq",
        icon: "question",
        labelKey: "detail.faq",
        html: buildRaceGuideFaqSection(event, detailRows, richDetails, knowledge)
      },
      {
        id: "edition-history",
        icon: "star",
        labelKey: "detail.performance",
        html: buildEditionHistorySection(event)
      },
      {
        id: "sources",
        icon: "check",
        labelKey: "detail.sources",
        html: buildRaceGuideSources(event, richDetails)
      }
    ]
      .filter(section => hasUsefulValue(section.html));
  const guideSections =
    sections.map(section => section.html).join("");
  const navigation =
    buildRaceGuideNavigation(sections);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(metaDescription)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(metaDescription)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="stylesheet" href="../../css/style.css?v=20260824-detail-verification-v97" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
  <style>
    html,
    body.event-detail-page {
      height: auto !important;
      min-height: 100% !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
    }
  </style>
  <script type="application/ld+json">${buildSchema(event, canonicalUrl, detailRows, richDetails)}</script>
</head>
<body class="event-detail-page">
  <main class="event-detail-shell">
    <header class="event-detail-header">
      <a class="event-detail-back" href="../../index.html#/discovery" ${detailI18nAttr("detail.backToMap")}>${escapeHtml(detailTranslation("detail.backToMap"))}</a>
      <a class="event-detail-brand brand" href="../../index.html#/discovery" aria-label="Back to Event Map">
        <img class="brand-icon" src="../../assets/brand/sport-event-map-icon.svg" alt="" aria-hidden="true" />
        <span class="brand-name">Sport Event Map</span>
      </a>
      ${buildDetailLanguageControl()}
    </header>

    ${hero}

    ${navigation}

    ${guideSections}
  </main>
  ${buildDetailI18nScript()}
  <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
  <script>
    window.sportEventMapDetailConfig = {
      event: ${escapeJson({
        event_id: event.event_id || null,
        edition_id: event.edition_id || null,
        edition_year: event.edition_year || getEventYear(event) || null,
        event_key: eventKey,
        event_slug: slug,
        event_name: clean(event.event_name),
        date: clean(event.date),
        city: clean(event.city),
        country: clean(event.country),
        sport: clean(event.sport_type || event.sport || event.category),
        distance: clean(event.distance),
        event_url: clean(event.event_url),
        latitude: clean(event.latitude),
        longitude: clean(event.longitude)
      })}
    };
  </script>
  <script src="../../js/config.js"></script>
  <script defer src="../../js/supabase-loader.js" data-supabase-src="../../js/event-detail-supabase.js?v=20260725-publish-runtime-v96"></script>
  <script defer src="../../js/event-detail.js?v=20260725-publish-runtime-v96"></script>
  ${mapScript(event)}
</body>
</html>
`;
}

function removeGeneratedPages() {
  fs.rmSync(EVENT_DIR, {
    recursive: true,
    force: true
  });
}

function main() {
  const rows = parseCsvFile(EVENTS_PATH);
  const archiveRows = loadPublicArchive();
  const categoryDetails =
    loadCategoryDetails();
  const eventKnowledge =
    loadEventKnowledge();
  const richEventDetails =
    loadEventDetailDatabase();
  const mergedRows = [...rows, ...archiveRows];
  const uniqueRows = new Map();
  mergedRows.forEach(event => {
    const naturalKey = [event.event_name, event.date, event.city, event.country]
      .map(clean)
      .join("|")
      .toLowerCase();
    const key = naturalKey.replace(/\|/g, "") ? naturalKey : clean(event.edition_slug) || clean(event.edition_id);
    uniqueRows.set(key, { ...(uniqueRows.get(key) || {}), ...event });
  });
  const selected =
    [...uniqueRows.values()].filter(event =>
      clean(event.event_name) &&
      clean(event.city) &&
      clean(event.country)
    );

  if (!selected.length) {
    throw new Error("No events found for event page generation.");
  }

  removeGeneratedPages();
  fs.mkdirSync(EVENT_DIR, { recursive: true });

  const seenSlugs = new Set();
  const manifest = selected.map(event => {
    const slug = createSlug(event, seenSlugs);
    const eventCategoryDetails =
      categoryDetails.get(slug) || [];
    const knowledge =
      eventKnowledge.get(slug) || null;
    const richDetails =
      richEventDetails.get(slug) || null;
    const pageDir = path.join(EVENT_DIR, slug);
    fs.mkdirSync(pageDir, { recursive: true });
    const pageHtml = buildEventPage(
      event,
      slug,
      eventCategoryDetails,
      knowledge,
      richDetails
    ).replace(/[ \t]+$/gm, "");
    fs.writeFileSync(
      path.join(pageDir, "index.html"),
      pageHtml,
      "utf8"
    );

    return {
      slug,
      url: `/event/${slug}/`,
      event_name: clean(event.event_name),
      date: clean(event.date),
      city: clean(event.city),
      country: clean(event.country),
      sport: clean(event.sport),
      distance: clean(event.distance),
      has_category_details: Boolean(eventCategoryDetails.length),
      has_knowledge_details: Boolean(knowledge),
      has_rich_details: Boolean(richDetails)
    };
  });

  fs.writeFileSync(
    MANIFEST_PATH,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  console.log(`Generated ${manifest.length} event detail page(s).`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildEventPage,
  buildRaceGuideEventBrand,
  buildRaceGuideKeyFacts,
  buildRaceGuideRegistration,
  buildRaceGuideSources,
  buildSchema,
  composeRichDetailRecords,
  createSlug,
  editionFallbackKey,
  formatVerificationDate,
  getOfficialEventWebsite,
  getRegistrationStatus,
  getVerificationContext,
  isFutureEdition,
  main,
  parseEventDate,
  resolveOrganizer
};



