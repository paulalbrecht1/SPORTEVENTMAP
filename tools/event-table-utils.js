const fs = require("fs");
const path = require("path");

const REQUIRED_FIELDS = [
  "event_name",
  "sport",
  "date",
  "city",
  "country",
  "distance",
  "event_url"
];

const COLUMNS = [
  "event_name",
  "sport",
  "date",
  "city",
  "country",
  "address",
  "latitude",
  "longitude",
  "distance",
  "description",
  "event_url",
  "data_source",
  "source_url",
  "verification_status",
  "priority",
  "check_frequency",
  "last_checked",
  "next_check",
  "source_note",
  "image"
];

const FIELD_ALIASES = {
  event_name: [
    "event_name",
    "name",
    "race_name",
    "event_title",
    "title"
  ],
  sport: [
    "sport",
    "event_type",
    "race_type",
    "type",
    "category"
  ],
  date: [
    "date",
    "event_date",
    "start_date",
    "start_time",
    "next_date"
  ],
  city: [
    "city",
    "event_city",
    "location_city",
    "venue",
    "event_venue"
  ],
  country: [
    "country",
    "event_country",
    "country_code"
  ],
  address: [
    "address",
    "street",
    "address_line_1",
    "location",
    "venue_address"
  ],
  latitude: [
    "latitude",
    "lat",
    "event_latitude"
  ],
  longitude: [
    "longitude",
    "lng",
    "lon",
    "event_longitude"
  ],
  distance: [
    "distance",
    "distance_text",
    "event_distance"
  ],
  description: [
    "description",
    "summary",
    "details"
  ],
  event_url: [
    "event_url",
    "url",
    "race_url",
    "homepage_url",
    "event_listing",
    "event_api_listing"
  ],
  data_source: [
    "data_source",
    "source"
  ],
  source_url: [
    "source_url",
    "official_source_url",
    "verification_source_url"
  ],
  verification_status: [
    "verification_status",
    "event_status",
    "quality_status"
  ],
  priority: [
    "priority",
    "event_priority"
  ],
  check_frequency: [
    "check_frequency",
    "verification_frequency"
  ],
  last_checked: [
    "last_checked",
    "verified_at"
  ],
  next_check: [
    "next_check",
    "next_verification"
  ],
  source_note: [
    "source_note",
    "verification_note"
  ],
  image: [
    "image",
    "image_url"
  ]
};

function cleanValue(value) {
  return String(value || "")
    .replace(/Ã¼/g, "ü")
    .replace(/Ãœ/g, "Ü")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã–/g, "Ö")
    .replace(/Ã¤/g, "ä")
    .replace(/Ã„/g, "Ä")
    .replace(/ÃŸ/g, "ß")
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è")
    .replace(/Ã¡/g, "á")
    .replace(/Ã³/g, "ó")
    .replace(/Ã­/g, "í")
    .replace(/Ãº/g, "ú")
    .replace(/&#x27;/g, "'")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureDirectoryForFile(filePath) {
  const directory =
    path.dirname(filePath);

  fs.mkdirSync(directory, {
    recursive: true
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"" && quoted && nextChar === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === ";" && !quoted) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell);

  return cells;
}

function detectDelimiter(headerLine) {
  const semicolonCount =
    (headerLine.match(/;/g) || []).length;

  const commaCount =
    (headerLine.match(/,/g) || []).length;

  return semicolonCount >= commaCount
    ? ";"
    : ",";
}

function splitDelimitedLine(line, delimiter) {
  if (delimiter === ";") {
    return splitCsvLine(line);
  }

  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"" && quoted && nextChar === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell);

  return cells;
}

function parseCsv(content) {
  const lines =
    content
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(line => line.trim());

  if (!lines.length) {
    return [];
  }

  const delimiter =
    detectDelimiter(lines[0]);

  const headers =
    splitDelimitedLine(lines[0], delimiter)
      .map(header => header.trim());

  return lines.slice(1).map(line => {
    const cells =
      splitDelimitedLine(line, delimiter);

    return headers.reduce((event, header, index) => {
      event[header.trim()] =
        cleanValue(cells[index]);

      return event;
    }, {});
  });
}

function parseCsvFile(filePath) {
  return parseCsv(
    fs.readFileSync(filePath, "utf8")
  );
}

function escapeCsvValue(value) {
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

function toCsv(events) {
  const rows = [
    COLUMNS.join(";")
  ];

  events.forEach(event => {
    rows.push(
      COLUMNS
        .map(column =>
          escapeCsvValue(event[column])
        )
        .join(";")
    );
  });

  return `${rows.join("\n")}\n`;
}

function writeCsvFile(filePath, events) {
  ensureDirectoryForFile(filePath);

  fs.writeFileSync(
    filePath,
    toCsv(events),
    "utf8"
  );
}

function writeJsonFile(filePath, data) {
  ensureDirectoryForFile(filePath);

  fs.writeFileSync(
    filePath,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  );
}

function readJsonFile(filePath, fallback = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch (error) {
    console.warn(
      `Could not read JSON cache ${filePath}:`,
      error.message
    );

    return fallback;
  }
}

function loadGeocodeCache(filePath) {
  return readJsonFile(
    filePath,
    {}
  );
}

function saveGeocodeCache(filePath, cache) {
  if (!filePath) {
    return;
  }

  writeJsonFile(
    filePath,
    cache
  );
}

function findValue(rawEvent, field) {
  const aliases =
    FIELD_ALIASES[field] || [field];

  const rawKeys =
    Object.keys(rawEvent || {});

  for (const alias of aliases) {
    const matchingKey =
      rawKeys.find(key =>
        key.trim().toLowerCase() === alias
      );

    if (matchingKey && cleanValue(rawEvent[matchingKey])) {
      return cleanValue(rawEvent[matchingKey]);
    }
  }

  return "";
}

function parseCoordinate(value) {
  const cleaned =
    cleanValue(value)
      .replace(",", ".");

  if (!cleaned) {
    return "";
  }

  const parts =
    cleaned.split(".");

  const parsed =
    parts.length > 2
      ? Number(`${parts[0]}.${parts.slice(1).join("")}`)
      : Number(cleaned);

  return Number.isFinite(parsed)
    ? parsed
    : "";
}

function formatDateToGerman(value) {
  const text =
    cleanValue(value);

  if (!text) {
    return "";
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
    return text;
  }

  const isoMatch =
    /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  }

  const usMatch =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);

  if (usMatch) {
    return [
      usMatch[2].padStart(2, "0"),
      usMatch[1].padStart(2, "0"),
      usMatch[3]
    ].join(".");
  }

  const parsedDate =
    new Date(text);

  if (!Number.isNaN(parsedDate.getTime())) {
    return [
      String(parsedDate.getDate()).padStart(2, "0"),
      String(parsedDate.getMonth() + 1).padStart(2, "0"),
      String(parsedDate.getFullYear())
    ].join(".");
  }

  return text;
}

function isGermanDate(value) {
  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
      cleanValue(value)
    );

  if (!match) {
    return false;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function parseGermanDate(value) {
  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
      cleanValue(value)
    );

  if (!match) {
    return null;
  }

  const parsed =
    new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);

  return parsed;
}

function parseIsoDate(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})/.exec(
      cleanValue(value)
    );

  if (!match) {
    return null;
  }

  const parsed =
    new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);

  return parsed;
}

function hasUltraDistance(distance) {
  const matches =
    cleanValue(distance)
      .replace(/,/g, ".")
      .match(/\d+(?:\.\d+)?\s*(?:km|kilometer|k)\b/gi) ||
    [];

  return matches.some(match => {
    const value =
      Number(
        match
          .replace(/,/g, ".")
          .replace(/[^\d.]/g, "")
      );

    return Number.isFinite(value) && value > 42.3;
  });
}

function inferSport(rawSport, eventName = "", distance = "") {
  const value =
    `${rawSport} ${eventName} ${distance}`.toLowerCase();

  if (value.includes("triathlon")) {
    return "Triathlon";
  }

  if (
    value.includes("ultra") ||
    value.includes("100k") ||
    value.includes("100 km") ||
    value.includes("50k") ||
    value.includes("50 km") ||
    hasUltraDistance(distance)
  ) {
    return "Ultramarathon";
  }

  return "Running";
}

function normalizeSport(rawSport, eventName, distance) {
  const sport =
    cleanValue(rawSport).toLowerCase();

  if (sport === "running") {
    return "Running";
  }

  if (sport === "triathlon") {
    return "Triathlon";
  }

  if (
    sport === "ultramarathon" ||
    sport === "ultra"
  ) {
    return "Ultramarathon";
  }

  if (
    sport.includes("triathlon") ||
    sport.includes("duathlon") ||
    sport.includes("aqua")
  ) {
    return "Triathlon";
  }

  if (
    sport.includes("ultra") ||
    sport.includes("trail")
  ) {
    return "Ultramarathon";
  }

  return inferSport(
    rawSport,
    eventName,
    distance
  );
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
}

function normalizeDistanceText(value) {
  let text =
    cleanValue(value);

  if (!text) {
    return "";
  }

  text = text
    .replace(/\b13\.109\b\s*Miles?/gi, "Half Marathon")
    .replace(/\b13\.1\b\s*Miles?/gi, "Half Marathon")
    .replace(/\b26\.2\b\s*Miles?/gi, "Marathon")
    .replace(/\b6\.554\b\s*Miles?/gi, "Quarter Marathon")
    .replace(/\b6\.2\b\s*Miles?/gi, "10 km")
    .replace(/\b3\.1\b\s*Miles?/gi, "5 km");

  text = text.replace(
    /\b(\d+(?:[.,]\d+)?)\s*Miles?\b/gi,
    (_match, rawNumber) => {
      const miles =
        Number(
          String(rawNumber).replace(",", ".")
        );

      if (!Number.isFinite(miles)) {
        return `${rawNumber} Miles`;
      }

      return `${formatNumber(miles)} Miles`;
    }
  );

  text = text.replace(
    /\b(\d+(?:[.,]\d+)?)\s*Kilometers?\b/gi,
    (_match, rawNumber) => {
      const km =
        Number(
          String(rawNumber).replace(",", ".")
        );

      if (!Number.isFinite(km)) {
        return `${rawNumber} km`;
      }

      return `${formatNumber(km)} km`;
    }
  );

  return cleanValue(text);
}

function normalizeCountryName(value) {
  const country =
    cleanValue(value);

  if (/^(deut|germany|germania|allemagne)/i.test(country)) {
    return "Germany";
  }

  if (/^(oesterreic|österreic|austria)/i.test(country)) {
    return "Austria";
  }

  if (/^(schweiz|switzerland|suisse)/i.test(country)) {
    return "Switzerland";
  }

  if (/^(spanien|spain|espana|españa)/i.test(country)) {
    return "Spain";
  }

  if (/^(niederlande|netherlands|holland)/i.test(country)) {
    return "Netherlands";
  }

  if (/^(italien|italy|italia)/i.test(country)) {
    return "Italy";
  }

  return country;
}

function normalizeEvent(rawEvent, defaults = {}) {
  const event = {};

  COLUMNS.forEach(column => {
    event[column] =
      findValue(rawEvent, column) ||
      cleanValue(defaults[column]);
  });

  event.event_name =
    cleanValue(event.event_name);

  event.date =
    formatDateToGerman(event.date);

  event.distance =
    normalizeDistanceText(event.distance);

  event.country =
    normalizeCountryName(event.country);

  if (
    event.country === "Germany" &&
    /,\s*deut\w*$/i.test(event.address)
  ) {
    event.address =
      event.address.replace(
        /,\s*deut\w*$/i,
        ", Germany"
      );
  }

  event.sport =
    normalizeSport(
      event.sport,
      event.event_name,
      event.distance
    );

  event.latitude =
    parseCoordinate(event.latitude);

  event.longitude =
    parseCoordinate(event.longitude);

  event.data_source =
    event.data_source ||
    cleanValue(defaults.data_source);

  return event;
}

function hasRaceSignal(event) {
  const value =
    [
      event.event_name,
      event.distance,
      event.sport
    ]
      .map(cleanValue)
      .join(" ")
      .toLowerCase();

  return /(\b5k\b|\b10k\b|\b15k\b|\b20k\b|\b25k\b|\b30k\b|\b50k\b|\b100k\b|13\.1|26\.2|marathon|half marathon|halbmarathon|triathlon|duathlon|aquathlon|ironman|ultra|trail|relay|race|rennen|lauf|fun run|run\/walk|run walk|cross country|miler|\bmile\b|\bmiles\b|\bkm\b|kilometer)/i
    .test(value);
}

function hasStrictRaceDistanceSignal(event) {
  const value =
    [
      event.event_name,
      event.distance,
      event.sport
    ]
      .map(cleanValue)
      .join(" ")
      .toLowerCase();

  return /(\b5\s?k\b|\b10\s?k\b|\b15\s?k\b|\b20\s?k\b|\b21\s?k\b|\b25\s?k\b|\b30\s?k\b|\b42\s?k\b|\b50\s?k\b|\b60\s?k\b|\b80\s?k\b|\b100\s?k\b|\b5\s?km\b|\b10\s?km\b|\b15\s?km\b|\b20\s?km\b|\b21\s?km\b|\b25\s?km\b|\b30\s?km\b|\b42\s?km\b|\b50\s?km\b|\b60\s?km\b|\b80\s?km\b|\b100\s?km\b|3\.1\s?miles?|6\.2\s?miles?|13\.1\s?miles?|26\.2\s?miles?|marathon|half marathon|halbmarathon|triathlon|duathlon|aquathlon|ironman|ultra|trail)/i
    .test(value) ||
    hasDistanceAtLeast(
      event.distance,
      5
    );
}

function hasDistanceAtLeast(distance, minimumKm) {
  const text =
    cleanValue(distance)
      .toLowerCase()
      .replace(/,/g, ".");

  const kmMatches =
    text.matchAll(
      /(\d+(?:\.\d+)?)\s*(?:km|kilometer|k)\b/g
    );

  for (const match of kmMatches) {
    const km =
      Number(match[1]);

    if (Number.isFinite(km) && km >= minimumKm) {
      return true;
    }
  }

  const mileMatches =
    text.matchAll(
      /(\d+(?:\.\d+)?)\s*miles?\b/g
    );

  for (const match of mileMatches) {
    const km =
      Number(match[1]) * 1.60934;

    if (Number.isFinite(km) && km >= minimumKm) {
      return true;
    }
  }

  return false;
}

function getEventQualityIssue(event) {
  const nameDistanceUrl =
    [
      event.event_name,
      event.distance,
      event.event_url
    ]
      .map(cleanValue)
      .join(" ")
      .toLowerCase();

  const nameAndDistance =
    [
      event.event_name,
      event.distance
    ]
      .map(cleanValue)
      .join(" ")
      .toLowerCase();

  const description =
    cleanValue(event.description)
      .toLowerCase();

  const strongNonEventPatterns = [
    /run\s*clubs?/,
    /running\s*clubs?/,
    /group\s+runs?/,
    /membership/,
    /membership\s+fee/,
    /annual\s+dues?/,
    /donations?/,
    /fundraising?/,
    /training/,
    /certification/,
    /clinic/,
    /course/,
    /program/,
    /workout\s+wednesday/,
    /yoga/,
    /volunteer/,
    /sponsor(ship)?/,
    /subscription/,
    /timer\s+account/,
    /racejoy\s+certification/,
    /team\s+ckf/,
    /team\s+.*\b(berlin|boston|london|chicago|new york|tokyo)\s+marathon/,
    /charity\s+team/,
    /fundraising\s+team/,
    /spectator/,
    /park\s+entry/,
    /\bentry\s+passes?\b/,
    /\bpasses?\b/,
    /pacer\s+registration/,
    /\bpacers?\s+only\b/,
    /early\s+access/,
    /supporting\s+the\s+cause/,
    /\bno\s+swag\b/,
    /registration\s+only/
  ];

  const participantNonEventPatterns = [
    /\bkids?\b/,
    /\bchildren\b/,
    /\bchild\b/,
    /\byouth\b/,
    /\bjunior\b/,
    /\bsquirt\b/,
    /\bunder\s+\d+\b/,
    /\bwalk\b/,
    /\bwalker(s)?\b/,
    /run\/walk/,
    /walk\/run/,
    /non[-\s]?competitive\s+walk/,
    /\b1\s?m(ile)?\b/,
    /\b1\s?mile\b/,
    /\b1\s?k\b/,
    /\b2\s?k\b/,
    /\b200\s?m\b/,
    /\b400\s?m\b/
  ];

  const descriptionNonEventPatterns = [
    /join\s+(our|the)\s+.*club/,
    /free\s+run\s+club/,
    /weekly\s+run\s+clubs?/,
    /annual\s+dues?/,
    /general\s+membership/,
    /training\s+program/,
    /training\s+sessions?/,
    /workout\s+program/,
    /group\s+run\/walk/,
    /meet\s+up\s+for\s+.*group\s+run/,
    /every\s+(saturday|sunday|monday|tuesday|wednesday|thursday|friday)\s+morning/,
    /certification\s+training/,
    /donation\s+page/,
    /starting\s+a\s+fundraiser/
  ];

  const matchedStrongPattern =
    strongNonEventPatterns.find(pattern =>
      pattern.test(nameDistanceUrl)
    );

  if (matchedStrongPattern) {
    return "Likely club, membership, donation, training, or non-race listing";
  }

  const matchedParticipantPattern =
    participantNonEventPatterns.find(pattern =>
      pattern.test(nameAndDistance)
    );

  if (matchedParticipantPattern) {
    return "Likely kids, youth, walk, spectator, pacer, or side-event listing";
  }

  const matchedDescriptionPattern =
    descriptionNonEventPatterns.find(pattern =>
      pattern.test(description)
    );

  if (matchedDescriptionPattern) {
    return "Description indicates club, membership, donation, training, or non-race listing";
  }

  if (!hasRaceSignal(event)) {
    return "Missing race distance/type signal";
  }

  if (!hasStrictRaceDistanceSignal(event)) {
    return "Missing strict 5K/10K/marathon/ultra/triathlon distance signal";
  }

  return "";
}

function isEventWithinIsoRange(
  event,
  startDate,
  endDate
) {
  const eventDate =
    parseGermanDate(event.date);

  const start =
    parseIsoDate(startDate);

  const end =
    parseIsoDate(endDate);

  if (!eventDate) {
    return false;
  }

  if (start && eventDate < start) {
    return false;
  }

  if (end && eventDate > end) {
    return false;
  }

  return true;
}

function getEventKey(event) {
  return [
    event.event_name,
    event.date,
    event.city,
    event.country,
    event.sport
  ]
    .map(value =>
      cleanValue(value).toLowerCase()
    )
    .join("|");
}

function normalizeDuplicateName(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(generali|bmw|volksbank|gutsmuths|haspa|mainova|adac|sparkasse|stadtwerke|deutsche|bank|tcs|nn|standard|chartered|schneider|electric)\b/g, " ")
    .replace(/\b(the|der|die|das|and|und|powered|by|presented)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDuplicateDistance(value) {
  const distance =
    normalizeDistanceText(value)
      .toLowerCase()
      .replace(/half marathon/g, "21 km")
      .replace(/halbmarathon/g, "21 km")
      .replace(/marathon/g, "42 km")
      .replace(/full/g, "42 km")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (/21\s?km/.test(distance) && /42\s?km/.test(distance)) {
    return "21 km 42 km";
  }

  if (/42\s?km/.test(distance)) {
    return "42 km";
  }

  if (/21\s?km/.test(distance)) {
    return "21 km";
  }

  return distance;
}

function getDuplicateLocationKey(event) {
  return [
    cleanValue(event.date).toLowerCase(),
    cleanValue(event.city).toLowerCase(),
    cleanValue(event.country).toLowerCase(),
    cleanValue(event.sport).toLowerCase()
  ].join("|");
}

function getDuplicateEventKey(event) {
  return [
    normalizeDuplicateName(event.event_name),
    getDuplicateLocationKey(event)
  ].join("|");
}

function extractDistanceBuckets(value) {
  const text =
    normalizeDistanceText(value)
      .toLowerCase()
      .replace(/,/g, ".");

  const buckets =
    new Set();

  if (/half marathon|halbmarathon/.test(text)) {
    buckets.add("21");
  }

  const textWithoutHalfMarathon =
    text.replace(
      /half marathon|halbmarathon/g,
      " "
    );

  if (/\bmarathon\b|full/.test(textWithoutHalfMarathon)) {
    buckets.add("42");
  }

  const kmMatches =
    text.matchAll(
      /(\d+(?:\.\d+)?)\s*(?:km|kilometer|k)\b/g
    );

  for (const match of kmMatches) {
    const km =
      Number(match[1]);

    if (!Number.isFinite(km)) {
      continue;
    }

    if (km >= 40 && km <= 45) {
      buckets.add("42");
      continue;
    }

    if (km >= 20 && km <= 22.5) {
      buckets.add("21");
      continue;
    }

    buckets.add(String(Math.round(km)));
  }

  const mileMatches =
    text.matchAll(
      /(\d+(?:\.\d+)?)\s*miles?\b/g
    );

  for (const match of mileMatches) {
    const miles =
      Number(match[1]);

    if (!Number.isFinite(miles)) {
      continue;
    }

    const km =
      miles * 1.60934;

    if (km >= 40 && km <= 45) {
      buckets.add("42");
      continue;
    }

    if (km >= 20 && km <= 22.5) {
      buckets.add("21");
      continue;
    }

    buckets.add(String(Math.round(km)));
  }

  if (!buckets.size && text) {
    buckets.add(
      normalizeDuplicateDistance(text)
    );
  }

  return buckets;
}

function haveOverlappingDistances(firstEvent, secondEvent) {
  const firstBuckets =
    extractDistanceBuckets(firstEvent.distance);

  const secondBuckets =
    extractDistanceBuckets(secondEvent.distance);

  if (!firstBuckets.size || !secondBuckets.size) {
    return true;
  }

  for (const bucket of firstBuckets) {
    if (secondBuckets.has(bucket)) {
      return true;
    }
  }

  return false;
}

function areDuplicateNames(firstEvent, secondEvent) {
  const firstName =
    normalizeDuplicateName(firstEvent.event_name);

  const secondName =
    normalizeDuplicateName(secondEvent.event_name);

  if (!firstName || !secondName) {
    return false;
  }

  return (
    firstName === secondName ||
    firstName.includes(secondName) ||
    secondName.includes(firstName)
  );
}

function areLikelyDuplicateEvents(firstEvent, secondEvent) {
  return (
    getDuplicateLocationKey(firstEvent) ===
      getDuplicateLocationKey(secondEvent) &&
    areDuplicateNames(firstEvent, secondEvent) &&
    haveOverlappingDistances(firstEvent, secondEvent)
  );
}

function getEventCompletenessScore(event) {
  let score = 0;

  COLUMNS.forEach(column => {
    const value =
      cleanValue(event[column]);

    if (value) {
      score += 1;
    }

    if (
      column === "description" &&
      value.length > 20
    ) {
      score += 1;
    }

    if (
      column === "event_url" &&
      value &&
      !/marathon\.de\/laufevent/i.test(value)
    ) {
      score += 2;
    }
  });

  if (/marathon\.de\/laufevent/i.test(event.event_url)) {
    score -= 3;
  }

  if (/relay|team\s+rwb|pacer/i.test(event.event_name)) {
    score -= 2;
  }

  return score;
}

function shouldReplaceDuplicate(existing, candidate) {
  return getEventCompletenessScore(candidate) >
    getEventCompletenessScore(existing);
}

function dedupeEvents(events) {
  const uniqueEvents = [];

  events.forEach(event => {
    const exactKey =
      getEventKey(event);

    if (!exactKey.replace(/\|/g, "")) {
      return;
    }

    const existingIndex =
      uniqueEvents.findIndex(existing =>
        areLikelyDuplicateEvents(
          existing,
          event
        )
      );

    if (existingIndex === -1) {
      uniqueEvents.push(event);
      return;
    }

    const existing =
      uniqueEvents[existingIndex];

    if (
      shouldReplaceDuplicate(existing, event)
    ) {
      uniqueEvents[existingIndex] =
        event;
    }
  });

  return uniqueEvents;
}

function getValidationErrors(
  event,
  options = {}
) {
  const errors = [];

  REQUIRED_FIELDS.forEach(field => {
    if (!cleanValue(event[field])) {
      errors.push(`Missing ${field}`);
    }
  });

  if (event.date && !isGermanDate(event.date)) {
    errors.push("Date must be DD.MM.YYYY");
  }

  const hasLatitude =
    event.latitude !== "";

  const hasLongitude =
    event.longitude !== "";

  if (
    options.requireCoordinates &&
    (!hasLatitude || !hasLongitude)
  ) {
    errors.push("Missing coordinates");
  }

  if (
    (hasLatitude || hasLongitude) &&
    (
      !Number.isFinite(Number(event.latitude)) ||
      !Number.isFinite(Number(event.longitude)) ||
      Number(event.latitude) < -90 ||
      Number(event.latitude) > 90 ||
      Number(event.longitude) < -180 ||
      Number(event.longitude) > 180
    )
  ) {
    errors.push("Invalid coordinates");
  }

  if (event.event_url) {
    try {
      const url =
        new URL(cleanValue(event.event_url));

      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push("Event URL must use HTTP or HTTPS");
      }
    } catch (_error) {
      errors.push("Invalid event URL");
    }
  }

  return errors;
}

function collectCsvFiles(inputs) {
  const files = [];

  function walk(inputPath) {
    if (!fs.existsSync(inputPath)) {
      return;
    }

    const stat =
      fs.statSync(inputPath);

    if (stat.isDirectory()) {
      fs.readdirSync(inputPath)
        .forEach(child =>
          walk(path.join(inputPath, child))
        );

      return;
    }

    if (
      stat.isFile() &&
      inputPath.toLowerCase().endsWith(".csv")
    ) {
      files.push(inputPath);
    }
  }

  inputs.forEach(walk);

  return files;
}

function delay(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function getGeocodeQuery(event) {
  const address =
    cleanValue(event.address);

  const city =
    cleanValue(event.city);

  const country =
    cleanValue(event.country);

  const cityCountry =
    [
      city,
      country
    ]
      .filter(Boolean)
      .join(", ");

  if (!address) {
    return cityCountry;
  }

  if (
    cityCountry &&
    address.toLowerCase() === cityCountry.toLowerCase()
  ) {
    return address;
  }

  return [
    address,
    city,
    country
  ]
    .filter(Boolean)
    .join(", ");
}

function getGeocodeCacheKey(query) {
  return cleanValue(query)
    .toLowerCase();
}

function getGeocodeQueries(event) {
  const queries =
    [
      getGeocodeQuery(event)
    ];

  const city =
    cleanValue(event.city);

  const country =
    cleanValue(event.country);

  if (city.includes("-") && country) {
    queries.push(
      [
        city.split("-")[0],
        country
      ]
        .filter(Boolean)
        .join(", ")
    );
  }

  return Array.from(
    new Set(
      queries
        .map(cleanValue)
        .filter(Boolean)
    )
  );
}

async function geocodeEvent(
  event,
  options = {}
) {
  if (typeof fetch !== "function") {
    throw new Error(
      "This script needs Node.js 18+ for fetch support."
    );
  }

  const queries =
    getGeocodeQueries(event);

  if (!queries.length) {
    return event;
  }

  const cache =
    options.cache;

  for (let index = 0; index < queries.length; index += 1) {
    const query =
      queries[index];

    const cacheKey =
      getGeocodeCacheKey(query);

    if (cache && cache[cacheKey]) {
      const cached =
        cache[cacheKey];

      const cachedLatitude =
        parseCoordinate(cached.latitude);

      const cachedLongitude =
        parseCoordinate(cached.longitude);

      if (
        cachedLatitude !== "" &&
        cachedLongitude !== ""
      ) {
        event.latitude =
          cachedLatitude;

        event.longitude =
          cachedLongitude;

        return event;
      }

      continue;
    }

    if (index > 0) {
      await delay(
        Number(options.delayMs || 1100)
      );
    }

    if (options.stats) {
      options.stats.requests =
        Number(options.stats.requests || 0) + 1;
    }

    const response =
      await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        {
          headers: {
            "User-Agent":
              options.userAgent ||
              "SportsEventExplorer/1.0"
          }
        }
      );

    if (!response.ok) {
      console.warn(
        `Geocoding failed for "${query}" with status ${response.status}`
      );

      continue;
    }

    const data =
      await response.json();

    if (!data.length) {
      if (cache) {
        cache[cacheKey] = {
          query,
          latitude: "",
          longitude: "",
          not_found: true,
          provider: "nominatim",
          updated_at: new Date().toISOString()
        };
      }

      continue;
    }

    event.latitude =
      parseCoordinate(data[0].lat);

    event.longitude =
      parseCoordinate(data[0].lon);

    if (cache) {
      cache[cacheKey] = {
        query,
        latitude: event.latitude,
        longitude: event.longitude,
        display_name: cleanValue(data[0].display_name),
        provider: "nominatim",
        updated_at: new Date().toISOString()
      };
    }

    return event;
  }

  return event;
}

async function geocodeMissingCoordinates(
  events,
  options = {}
) {
  const limit =
    Number(options.limit || 100);

  const delayMs =
    Number(options.delayMs || 1100);

  const cachePath =
    options.cachePath === false
      ? ""
      : options.cachePath ||
        "data/imports/geocoding-cache.json";

  const cache =
    options.cache ||
    (
      cachePath
        ? loadGeocodeCache(cachePath)
        : null
    );

  let geocoded = 0;
  const stats =
    options.stats || {
      requests: 0
    };

  for (const event of events) {
    if (
      event.latitude &&
      event.longitude
    ) {
      continue;
    }

    if (geocoded >= limit) {
      break;
    }

    const requestsBefore =
      stats.requests;

    await geocodeEvent(
      event,
      {
        ...options,
        cache,
        stats
      }
    );

    geocoded += 1;

    if (stats.requests > requestsBefore) {
      await delay(delayMs);
    }
  }

  if (cachePath && cache) {
    saveGeocodeCache(
      cachePath,
      cache
    );
  }

  return {
    events,
    geocoded
  };
}

module.exports = {
  COLUMNS,
  REQUIRED_FIELDS,
  cleanValue,
  collectCsvFiles,
  dedupeEvents,
  ensureDirectoryForFile,
  formatDateToGerman,
  getEventKey,
  getEventQualityIssue,
  getValidationErrors,
  geocodeMissingCoordinates,
  inferSport,
  isEventWithinIsoRange,
  normalizeEvent,
  normalizeDistanceText,
  normalizeCountryName,
  parseGermanDate,
  parseCoordinate,
  parseCsv,
  parseCsvFile,
  splitDelimitedLine,
  toCsv,
  writeCsvFile,
  writeJsonFile
};
