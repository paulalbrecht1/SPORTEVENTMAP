const fs = require("fs");
const path = require("path");
const { cleanValue } = require("./event-table-utils.js");

const ROOT = path.resolve(__dirname, "..");
const EVENTS_PATH = path.join(ROOT, "data", "events.csv");
const EVENT_PAGES_PATH = path.join(ROOT, "data", "event-pages.json");
const DETAIL_DATABASE_PATH = path.join(ROOT, "data", "event-detail-database.json");
const AUDIT_JSON_PATH = path.join(ROOT, "data", "event-knowledge-audit.json");
const AUDIT_CSV_PATH = path.join(ROOT, "data", "event-knowledge-audit.csv");
const REVIEW_JSON_PATH = path.join(ROOT, "data", "event-knowledge-review.json");
const RESEARCH_STATUS_JSON_PATH = path.join(ROOT, "data", "event-knowledge-research-status.json");

const KNOWLEDGE_FIELDS = [
  "entry_fee",
  "registration_status",
  "registration_deadline",
  "start_time",
  "cutoff",
  "elevation",
  "course_info",
  "race_day_info",
  "travel_info",
  "weather_info",
  "statistics",
  "faq",
  "sources"
];

const FIELD_GROUPS = {
  entry_fee: {
    section: "registration",
    paths: [
      "registration.entry_fee_min",
      "registration.entry_fee_max",
      "registration.entry_fee_previous_year",
      "registration.price_phases",
      "registration.entry_fee"
    ],
    target: "registration.entry_fee_min"
  },
  registration_status: {
    section: "registration",
    paths: [
      "registration.registration_status",
      "basis.registration_status"
    ],
    target: "registration.registration_status"
  },
  registration_deadline: {
    section: "registration",
    paths: [
      "registration.registration_close_date",
      "registration.registration_deadline"
    ],
    target: "registration.registration_close_date"
  },
  start_time: {
    section: "race_day",
    paths: [
      "race_day.start_time",
      "race_day.wave_start"
    ],
    target: "race_day.start_time"
  },
  cutoff: {
    section: "race_day",
    paths: [
      "race_day.total_cutoff",
      "race_day.cutoff",
      "race_day.swim_cutoff",
      "race_day.bike_cutoff",
      "race_day.run_cutoff"
    ],
    target: "race_day.total_cutoff"
  },
  elevation: {
    section: "course",
    paths: [
      "course.elevation_gain",
      "course.elevation",
      "course.elevation_profile"
    ],
    target: "course.elevation_gain"
  },
  course_info: {
    section: "course",
    paths: [
      "course.course_character",
      "course.course_type",
      "course.surface",
      "course.start_location",
      "course.finish_location",
      "course.distances"
    ],
    target: "course.course_character"
  },
  race_day_info: {
    section: "race_day",
    paths: [
      "race_day.aid_stations",
      "race_day.bib_pickup_info",
      "race_day.bag_drop",
      "race_day.medical_support",
      "race_day.check_in_times"
    ],
    target: "race_day.bib_pickup_info"
  },
  travel_info: {
    section: "travel",
    paths: [
      "travel.nearest_airport",
      "travel.nearest_train_station",
      "travel.public_transport_info",
      "travel.accommodation_info"
    ],
    target: "travel.public_transport_info"
  },
  weather_info: {
    section: "weather",
    paths: [
      "weather.typical_weather",
      "weather.average_temperature",
      "weather.heat_risk",
      "weather.wind_risk",
      "weather.planning_tips"
    ],
    target: "weather.typical_weather"
  },
  statistics: {
    section: "statistics",
    paths: [
      "statistics.participant_count",
      "statistics.finisher_count",
      "statistics.winner_times",
      "statistics.course_record_male",
      "statistics.course_record_female",
      "statistics.historic_significance"
    ],
    target: "statistics.historic_significance"
  },
  faq: {
    section: "faq",
    paths: [
      "faq"
    ],
    target: "faq"
  },
  sources: {
    section: "sources",
    paths: [
      "sources"
    ],
    target: "sources"
  }
};

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDataDirectory() {
  fs.mkdirSync(path.join(ROOT, "data"), {
    recursive: true
  });
}

function getPathValue(object, pathExpression) {
  return pathExpression
    .split(".")
    .reduce((value, key) => {
      if (value == null) {
        return undefined;
      }

      return value[key];
    }, object);
}

function isUsefulValue(value) {
  if (Array.isArray(value)) {
    return value.some(isUsefulValue);
  }

  if (value && typeof value === "object") {
    return Object.values(value).some(isUsefulValue);
  }

  const text =
    cleanValue(value).toLowerCase();

  return Boolean(text) &&
    ![
      "not yet verified",
      "not available",
      "unknown",
      "tbd",
      "to be confirmed",
      "to be announced"
    ].includes(text);
}

function hasAnyPath(details, field) {
  return FIELD_GROUPS[field].paths.some(pathExpression =>
    isUsefulValue(getPathValue(details, pathExpression))
  );
}

function normalizeSlug(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/ÃŸ/g, "ss")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getEventYear(event) {
  const date =
    cleanValue(event.date);

  const german =
    /\b(\d{2})\.(\d{2})\.(\d{4})\b/.exec(date);

  if (german) {
    return german[3];
  }

  const year =
    /\b(20\d{2})\b/.exec(date);

  return year ? year[1] : "";
}

function fallbackSlug(event) {
  return normalizeSlug(
    [
      event.event_name,
      getEventYear(event)
    ].filter(Boolean).join(" ")
  );
}

function loadEventPages() {
  const pages =
    readJson(EVENT_PAGES_PATH, []);

  return Array.isArray(pages)
    ? pages
    : [];
}

function loadDetailDatabase() {
  const rows =
    readJson(DETAIL_DATABASE_PATH, []);

  return new Map(
    (Array.isArray(rows) ? rows : [])
      .filter(row => row && row.event_slug)
      .map(row => [cleanValue(row.event_slug), row])
  );
}

function getPriority(event, completionScore, missingFields) {
  const value =
    [
      event.event_name,
      event.sport,
      event.distance,
      event.city,
      event.country,
      event.priority
    ].map(cleanValue).join(" ").toLowerCase();

  const strategicEvent =
    /berlin marathon|frankfurt marathon|koeln marathon|köln marathon|hamburg marathon|muenchen marathon|münchen marathon|hannover marathon|duesseldorf marathon|düsseldorf marathon|ironman hamburg|ironman frankfurt|challenge roth|ironman|marathon/.test(value);

  if (
    cleanValue(event.priority).toLowerCase() === "high" ||
    strategicEvent
  ) {
    return "high";
  }

  if (
    cleanValue(event.priority).toLowerCase() === "medium" ||
    completionScore < 75 ||
    missingFields.length >= 4
  ) {
    return "medium";
  }

  return "low";
}

function buildAuditRows(events) {
  const pages =
    loadEventPages();
  const detailsBySlug =
    loadDetailDatabase();

  return events.map((event, index) => {
    const page =
      pages[index] || {};
    const slug =
      page.slug || fallbackSlug(event);
    const details =
      detailsBySlug.get(slug) || null;
    const missingFields =
      KNOWLEDGE_FIELDS.filter(field =>
        !details || !hasAnyPath(details, field)
      );
    const presentFields =
      KNOWLEDGE_FIELDS.filter(field =>
        !missingFields.includes(field)
      );
    const completionScore =
      Math.round((presentFields.length / KNOWLEDGE_FIELDS.length) * 100);
    const priority =
      getPriority(event, completionScore, missingFields);

    return {
      event_slug: slug,
      event_name: cleanValue(event.event_name),
      date: cleanValue(event.date),
      city: cleanValue(event.city),
      country: cleanValue(event.country),
      sport: cleanValue(event.sport),
      distance: cleanValue(event.distance),
      official_url: cleanValue(event.event_url),
      source_url: cleanValue(event.source_url || event.event_url),
      csv_priority: cleanValue(event.priority),
      has_detail_record: Boolean(details),
      completion_score: completionScore,
      priority,
      present_fields: presentFields,
      missing_fields: missingFields,
      missing_count: missingFields.length,
      last_checked: cleanValue(details?.last_checked || event.last_checked),
      verification_status: cleanValue(details?.verification_status || event.verification_status)
    };
  });
}

function csvEscape(value) {
  if (Array.isArray(value)) {
    value = value.join(", ");
  }

  const text =
    value == null
      ? ""
      : String(value).trim();

  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function writeAuditFiles(rows) {
  ensureDataDirectory();

  const summary = {
    generated_at: new Date().toISOString(),
    total_events: rows.length,
    by_priority: rows.reduce((map, row) => {
      map[row.priority] =
        Number(map[row.priority] || 0) + 1;
      return map;
    }, {}),
    average_completion_score: rows.length
      ? Number((rows.reduce((sum, row) => sum + row.completion_score, 0) / rows.length).toFixed(1))
      : 0
  };

  fs.writeFileSync(
    AUDIT_JSON_PATH,
    `${JSON.stringify({ summary, events: rows }, null, 2)}\n`,
    "utf8"
  );

  const headers = [
    "event_slug",
    "event_name",
    "date",
    "city",
    "country",
    "sport",
    "distance",
    "official_url",
    "completion_score",
    "priority",
    "missing_count",
    "missing_fields",
    "present_fields",
    "has_detail_record",
    "last_checked",
    "verification_status"
  ];

  const csv = [
    headers.join(";"),
    ...rows.map(row =>
      headers.map(header => csvEscape(row[header])).join(";")
    )
  ].join("\n") + "\n";

  fs.writeFileSync(AUDIT_CSV_PATH, csv, "utf8");

  return summary;
}

module.exports = {
  AUDIT_CSV_PATH,
  AUDIT_JSON_PATH,
  DETAIL_DATABASE_PATH,
  EVENTS_PATH,
  FIELD_GROUPS,
  KNOWLEDGE_FIELDS,
  REVIEW_JSON_PATH,
  RESEARCH_STATUS_JSON_PATH,
  ROOT,
  buildAuditRows,
  cleanValue,
  csvEscape,
  fallbackSlug,
  getPriority,
  isUsefulValue,
  loadDetailDatabase,
  loadEventPages,
  readJson,
  writeAuditFiles
};
