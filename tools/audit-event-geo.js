const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  parseCoordinate,
  parseCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const ROOT = path.join(__dirname, "..");
const DEFAULT_INPUT = "data/events.csv";
const DEFAULT_CACHE = "data/geocode-cache.json";
const DEFAULT_JSON = "reports/event-geo-audit.json";
const DEFAULT_CSV = "reports/event-geo-audit.csv";
const DEFAULT_MD = "reports/event-geo-audit.md";
const DEFAULT_FIXES = "reports/event-geo-fixes-proposed.json";

const COUNTRY_RULES = {
  Germany: {
    code: "de",
    bbox: [47, 5, 56, 16],
    aliases: ["germany", "deutschland"]
  },
  Austria: {
    code: "at",
    bbox: [46, 9, 49.5, 17.5],
    aliases: ["austria", "oesterreich", "osterreich", "austria"]
  },
  Switzerland: {
    code: "ch",
    bbox: [45.7, 5.7, 47.9, 10.7],
    aliases: ["switzerland", "schweiz"]
  },
  Netherlands: {
    code: "nl",
    bbox: [50, 3, 54, 8],
    aliases: ["netherlands", "niederlande"]
  },
  Belgium: {
    code: "be",
    bbox: [49, 2, 52, 7],
    aliases: ["belgium", "belgien"]
  },
  Luxembourg: {
    code: "lu",
    bbox: [49, 5, 51, 7],
    aliases: ["luxembourg", "luxemburg"]
  },
  France: {
    code: "fr",
    bbox: [41, -6, 51.5, 10],
    aliases: ["france", "frankreich"]
  },
  Denmark: {
    code: "dk",
    bbox: [54, 8, 58, 16],
    aliases: ["denmark", "daenemark", "danmark"]
  },
  Sweden: {
    code: "se",
    bbox: [55, 10, 70, 25],
    aliases: ["sweden", "schweden"]
  },
  Norway: {
    code: "no",
    bbox: [57, 4, 81, 32],
    aliases: ["norway", "norwegen"]
  },
  Finland: {
    code: "fi",
    bbox: [59, 19, 71, 32],
    aliases: ["finland", "finnland"]
  },
  Spain: {
    code: "es",
    bbox: [27, -19, 44, 5],
    aliases: ["spain", "spanien"]
  },
  Italy: {
    code: "it",
    bbox: [35, 6, 48, 19],
    aliases: ["italy", "italien"]
  },
  Poland: {
    code: "pl",
    bbox: [49, 14, 55, 25],
    aliases: ["poland", "polen"]
  },
  Czechia: {
    code: "cz",
    bbox: [48, 12, 52, 19],
    aliases: ["czechia", "czech republic", "tschechien"]
  },
  Portugal: {
    code: "pt",
    bbox: [32, -32, 43, -6],
    aliases: ["portugal"]
  },
  Ireland: {
    code: "ie",
    bbox: [51, -11, 56, -5],
    aliases: ["ireland", "irland"]
  },
  "United Kingdom": {
    code: "gb",
    bbox: [49, -9, 61, 2],
    aliases: ["united kingdom", "uk", "great britain", "großbritannien"]
  },
  Iceland: {
    code: "is",
    bbox: [63, -25, 67, -13],
    aliases: ["iceland", "island"]
  },
  Greece: {
    code: "gr",
    bbox: [34, 19, 42, 30],
    aliases: ["greece", "griechenland"]
  },
  Hungary: {
    code: "hu",
    bbox: [45.5, 16, 49, 23],
    aliases: ["hungary", "ungarn"]
  },
  Romania: {
    code: "ro",
    bbox: [43, 20, 49, 30],
    aliases: ["romania", "rumaenien", "rumänien"]
  },
  Croatia: {
    code: "hr",
    bbox: [42, 13, 47, 20],
    aliases: ["croatia", "kroatien"]
  },
  Malta: {
    code: "mt",
    bbox: [35, 14, 36.5, 15],
    aliases: ["malta"]
  },
  Liechtenstein: {
    code: "li",
    bbox: [47, 9, 48, 10],
    aliases: ["liechtenstein"]
  }
};

const SEVERITY_RANK = {
  clean: 0,
  info: 1,
  warning: 2,
  critical: 3
};

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    cache: DEFAULT_CACHE,
    json: DEFAULT_JSON,
    csv: DEFAULT_CSV,
    md: DEFAULT_MD,
    fixes: DEFAULT_FIXES
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--input") {
      args.input = argv[index + 1] || args.input;
      index += 1;
      continue;
    }

    if (value === "--cache") {
      args.cache = argv[index + 1] || args.cache;
      index += 1;
      continue;
    }

    if (value === "--json") {
      args.json = argv[index + 1] || args.json;
      index += 1;
      continue;
    }

    if (value === "--csv") {
      args.csv = argv[index + 1] || args.csv;
      index += 1;
      continue;
    }

    if (value === "--md") {
      args.md = argv[index + 1] || args.md;
      index += 1;
      continue;
    }

    if (value === "--fixes") {
      args.fixes = argv[index + 1] || args.fixes;
      index += 1;
    }
  }

  return args;
}

function resolveProjectPath(filePath) {
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

  if (
    text.includes(";") ||
    text.includes("\"") ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function writeCsv(filePath, rows) {
  ensureDirectoryForFile(filePath);

  const columns = [
    "severity",
    "event_name",
    "event_id",
    "city",
    "country",
    "address",
    "latitude",
    "longitude",
    "issues",
    "distance_to_city_km",
    "distance_to_address_km",
    "confidence_score",
    "suggested_latitude",
    "suggested_longitude",
    "recommended_action"
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

function issueBreakdown(rows) {
  return rows.reduce((counts, row) => {
    row.issues.forEach(issue => {
      counts[issue] = (counts[issue] || 0) + 1;
    });
    return counts;
  }, {});
}

function writeMarkdown(filePath, report, proposedFixes) {
  ensureDirectoryForFile(filePath);

  const reviewRows = report.events
    .filter(row => row.severity !== "clean")
    .slice(0, 200);
  const counts = issueBreakdown(report.events);
  const lines = [
    "# Event Geo Audit",
    "",
    `Generated: ${report.generated_at}`,
    `Input: ${report.input}`,
    `Events checked: ${report.total_events}`,
    "",
    "## Summary",
    "",
    `- Critical: ${report.summary.critical}`,
    `- Warning: ${report.summary.warning}`,
    `- Info: ${report.summary.info}`,
    `- Clean: ${report.summary.clean}`,
    `- Proposed automatic fixes: ${proposedFixes.length}`,
    "",
    "## Issue Breakdown",
    "",
    ...Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([issue, count]) => `- ${issue}: ${count}`),
    "",
    "## Review Queue",
    ""
  ];

  reviewRows.forEach(row => {
    lines.push(
      `### ${row.event_name || "Unnamed event"}`,
      "",
      `- Severity: ${row.severity}`,
      `- Event ID: ${row.event_id}`,
      `- Location: ${[row.city, row.country].filter(Boolean).join(", ")}`,
      `- Current coordinate: ${[row.latitude, row.longitude].filter(Boolean).join(", ") || "missing"}`,
      `- Issues: ${row.issues.join(", ")}`,
      `- Distance to city: ${row.distance_to_city_km || "not available"} km`,
      `- Confidence: ${row.confidence_score}`,
      `- Recommended action: ${row.recommended_action}`,
      ""
    );
  });

  if (report.events.filter(row => row.severity !== "clean").length > 200) {
    lines.push(
      "_Only the first 200 review items are shown here. Use the JSON or CSV report for the full queue._",
      ""
    );
  }

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

function normalize(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value)
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function eventId(event) {
  return [
    event.slug,
    event.event_slug,
    event.id,
    slugify([event.event_name, event.city, event.date].join(" "))
  ]
    .map(cleanValue)
    .find(Boolean);
}

function getCountryRule(country) {
  const value = normalize(country);

  return Object.entries(COUNTRY_RULES)
    .find(([_name, rule]) =>
      rule.aliases.some(alias => normalize(alias) === value)
    );
}

function parsePoint(event) {
  const latitude = parseCoordinate(event.latitude);
  const longitude = parseCoordinate(event.longitude);

  if (latitude === "" || longitude === "") {
    return null;
  }

  const point = {
    latitude: Number(latitude),
    longitude: Number(longitude)
  };

  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return null;
  }

  return point;
}

function isInside(point, rule) {
  if (!point || !rule) {
    return false;
  }

  const [minLat, minLng, maxLat, maxLng] = rule.bbox;

  return (
    point.latitude >= minLat &&
    point.latitude <= maxLat &&
    point.longitude >= minLng &&
    point.longitude <= maxLng
  );
}

function distanceKm(pointA, pointB) {
  if (!pointA || !pointB) {
    return null;
  }

  const earthRadiusKm = 6371;
  const latA = pointA.latitude * Math.PI / 180;
  const latB = pointB.latitude * Math.PI / 180;
  const deltaLat =
    (pointB.latitude - pointA.latitude) * Math.PI / 180;
  const deltaLng =
    (pointB.longitude - pointA.longitude) * Math.PI / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) *
    Math.cos(latB) *
    Math.sin(deltaLng / 2) ** 2;

  return earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasPreciseAddress(event) {
  const address = cleanValue(event.address);
  const city = cleanValue(event.city);
  const country = cleanValue(event.country);

  if (
    !address ||
    normalize(address) === normalize(city) ||
    normalize(address) === normalize(`${city}, ${country}`)
  ) {
    return false;
  }

  return /\d|strasse|straße|str\.|weg|allee|platz|park|stadion|halle|arena|zentrum|center|see|ufer|bruecke|brücke|sportplatz|marktplatz|schloss|trail|start|ziel|hafen|bahnhof|bad|pool/i
    .test(address);
}

function buildCacheIndex(cacheFiles) {
  const index = new Map();

  cacheFiles.forEach(filePath => {
    const cache = readJson(filePath, {});

    Object.entries(cache).forEach(([rawKey, value]) => {
      if (!value || value.not_found) {
        return;
      }

      const latitude = parseCoordinate(value.latitude);
      const longitude = parseCoordinate(value.longitude);

      if (latitude === "" || longitude === "") {
        return;
      }

      const result = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        query: cleanValue(value.query || rawKey),
        formatted: cleanValue(value.formatted || value.display_name),
        provider: cleanValue(value.provider || "cache"),
        source_cache: path.relative(ROOT, filePath).replace(/\\/g, "/")
      };

      [
        rawKey,
        value.query,
        value.formatted,
        value.display_name
      ]
        .map(normalize)
        .filter(Boolean)
        .forEach(key => index.set(key, result));
    });
  });

  return index;
}

function cacheQueries(event) {
  const cityCountry = [event.city, event.country]
    .map(cleanValue)
    .filter(Boolean)
    .join(", ");

  const addressCityCountry = [event.address, event.city, event.country]
    .map(cleanValue)
    .filter(Boolean)
    .join(", ");

  const countryRule = getCountryRule(event.country);
  const countryCode = countryRule ? countryRule[1].code : "";

  return {
    city: [
      cityCountry,
      `${event.city} ${event.country}`,
      countryCode
        ? `${countryCode}|${normalize(`${event.city} ${event.country}`)}`
        : ""
    ],
    address: [
      addressCityCountry,
      `${event.address} ${event.city} ${event.country}`,
      countryCode
        ? `${countryCode}|${normalize(addressCityCountry)}`
        : ""
    ]
  };
}

function lookup(cacheIndex, queries) {
  return queries
    .map(normalize)
    .filter(Boolean)
    .map(key => cacheIndex.get(key))
    .find(Boolean) || null;
}

function addIssue(row, severity, type, action) {
  row.issues.push(type);

  if (SEVERITY_RANK[severity] > SEVERITY_RANK[row.severity]) {
    row.severity = severity;
  }

  if (!row.recommended_action) {
    row.recommended_action = action;
  }
}

function confidenceFromRow(row) {
  if (row.severity === "critical") {
    return 0.2;
  }

  if (row.issues.includes("coordinates_far_from_address")) {
    return 0.55;
  }

  if (row.issues.includes("coordinates_far_from_city")) {
    return 0.5;
  }

  if (row.issues.includes("city_level_pin_with_precise_address")) {
    return 0.72;
  }

  if (row.severity === "warning") {
    return 0.65;
  }

  if (row.severity === "info") {
    return 0.82;
  }

  return 0.95;
}

function auditEvent(event, cacheIndex) {
  const point = parsePoint(event);
  const countryMatch = getCountryRule(event.country);
  const countryRule = countryMatch ? countryMatch[1] : null;
  const queries = cacheQueries(event);
  const cityReference = lookup(cacheIndex, queries.city);
  const addressReference =
    hasPreciseAddress(event)
      ? lookup(cacheIndex, queries.address)
      : null;

  const cityDistance =
    point && cityReference
      ? distanceKm(point, cityReference)
      : null;

  const addressDistance =
    point && addressReference
      ? distanceKm(point, addressReference)
      : null;

  const row = {
    event_name: cleanValue(event.event_name),
    event_id: eventId(event),
    city: cleanValue(event.city),
    country: cleanValue(event.country),
    address: cleanValue(event.address),
    latitude: cleanValue(event.latitude),
    longitude: cleanValue(event.longitude),
    severity: "clean",
    issues: [],
    distance_to_city_km:
      cityDistance === null ? "" : cityDistance.toFixed(1),
    distance_to_address_km:
      addressDistance === null ? "" : addressDistance.toFixed(1),
    confidence_score: "",
    suggested_latitude: "",
    suggested_longitude: "",
    suggested_source: "",
    recommended_action: ""
  };

  if (!cleanValue(event.latitude) || !cleanValue(event.longitude)) {
    addIssue(
      row,
      "critical",
      "coordinates_missing",
      "Add coordinates from an official venue/start area source before launch."
    );
  } else if (!point) {
    addIssue(
      row,
      "critical",
      "coordinates_not_numeric",
      "Normalize latitude and longitude to numeric decimal degrees."
    );
  } else {
    if (
      point.latitude < -90 ||
      point.latitude > 90 ||
      point.longitude < -180 ||
      point.longitude > 180
    ) {
      addIssue(
        row,
        "critical",
        "coordinates_out_of_range",
        "Fix latitude/longitude ranges manually."
      );
    }

    if (point.latitude === 0 && point.longitude === 0) {
      addIssue(
        row,
        "critical",
        "coordinates_zero_zero",
        "Replace the 0,0 pin with a verified event location."
      );
    }

    if (
      Math.abs(point.latitude) > 90 &&
      Math.abs(point.longitude) <= 90
    ) {
      addIssue(
        row,
        "critical",
        "coordinates_likely_swapped",
        "Review whether latitude and longitude were swapped."
      );
    }

    if (countryRule && !isInside(point, countryRule)) {
      addIssue(
        row,
        "warning",
        "coordinates_outside_country_bbox",
        "Review the pin against the event country."
      );
    }
  }

  if (!countryRule && cleanValue(event.country)) {
    addIssue(
      row,
      "info",
      "country_without_local_bbox_rule",
      "Add a country bounding-box rule if this country becomes common."
    );
  }

  if (point && cityReference && cityDistance > 80) {
    addIssue(
      row,
      "warning",
      "coordinates_far_from_city",
      "Review the city or pin; the current point is far from the cached city reference."
    );
  }

  if (point && addressReference && addressDistance > 10) {
    addIssue(
      row,
      "warning",
      "coordinates_far_from_address",
      "Review the venue/start address or accept a verified pin correction."
    );
  }

  if (point && hasPreciseAddress(event) && cityReference && cityDistance <= 2 && !addressReference) {
    addIssue(
      row,
      "info",
      "city_level_pin_with_precise_address",
      "Geocode the precise venue/address and replace city-center pins after review."
    );
  }

  if (!cityReference) {
    addIssue(
      row,
      "info",
      "no_cached_city_reference",
      "Add this city to the geocode cache during the next controlled geocoding run."
    );
  }

  const suggestion =
    addressReference &&
    (
      !point ||
      addressDistance === null ||
      addressDistance > 3
    )
      ? addressReference
      : null;

  if (suggestion && row.severity !== "clean") {
    row.suggested_latitude = String(suggestion.latitude);
    row.suggested_longitude = String(suggestion.longitude);
    row.suggested_source = suggestion.source_cache || suggestion.provider;
  }

  row.confidence_score =
    confidenceFromRow(row).toFixed(2);

  if (!row.recommended_action) {
    row.recommended_action = "No pin action required.";
  }

  row.issues_text = row.issues.join(", ");

  return row;
}

function addDuplicateCoordinateIssues(rows) {
  const groups = new Map();

  rows.forEach((row, index) => {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(index);
  });

  groups.forEach(indexes => {
    const places = new Set(
      indexes.map(index =>
        normalize(`${rows[index].city} ${rows[index].address}`)
      )
    );

    if (indexes.length < 3 || places.size < 2) {
      return;
    }

    indexes.forEach(index => {
      addIssue(
        rows[index],
        "warning",
        "shared_coordinates_multiple_places",
        "Review stacked pins; multiple events with different places use the exact same coordinate."
      );
      rows[index].issues_text = rows[index].issues.join(", ");
      rows[index].confidence_score = confidenceFromRow(rows[index]).toFixed(2);
    });
  });
}

function summarize(rows) {
  return rows.reduce(
    (summary, row) => {
      summary[row.severity] =
        (summary[row.severity] || 0) + 1;
      return summary;
    },
    {
      critical: 0,
      warning: 0,
      info: 0,
      clean: 0
    }
  );
}

function main() {
  const args = parseArgs(process.argv);
  const input = resolveProjectPath(args.input);
  const cachePath = resolveProjectPath(args.cache);
  const jsonPath = resolveProjectPath(args.json);
  const csvPath = resolveProjectPath(args.csv);
  const mdPath = resolveProjectPath(args.md);
  const fixesPath = resolveProjectPath(args.fixes);
  const cacheFiles = [
    cachePath,
    path.join(ROOT, "data/imports/geocoding-location-cache.json"),
    path.join(ROOT, "data/imports/geoapify-geocoding-cache.json"),
    path.join(ROOT, "data/imports/geocoding-cache.json")
  ].filter(filePath => fs.existsSync(filePath));

  if (!fs.existsSync(cachePath)) {
    writeJsonFile(cachePath, {
      note:
        "Local cache reserved for reviewed geocoding references. The audit also reads existing import caches and never changes events.csv.",
      entries: {}
    });
  }

  const events = parseCsvFile(input);
  const cacheIndex = buildCacheIndex(cacheFiles);
  const rows = events.map(event => auditEvent(event, cacheIndex));

  addDuplicateCoordinateIssues(rows);

  const proposedFixes = rows
    .filter(row =>
      row.suggested_latitude &&
      row.suggested_longitude &&
      row.severity !== "clean"
    )
    .map(row => ({
      event_name: row.event_name,
      event_id: row.event_id,
      city: row.city,
      country: row.country,
      current_coordinate: {
        latitude: row.latitude,
        longitude: row.longitude
      },
      suggested_coordinate: {
        latitude: row.suggested_latitude,
        longitude: row.suggested_longitude
      },
      issues: row.issues,
      confidence_score: Number(row.confidence_score),
      verification_status: "needs_review",
      recommended_action:
        "Review in Admin before applying. Do not publish automatically."
    }));

  const report = {
    generated_at: new Date().toISOString(),
    input: path.relative(ROOT, input).replace(/\\/g, "/"),
    total_events: events.length,
    cache_files: cacheFiles.map(filePath =>
      path.relative(ROOT, filePath).replace(/\\/g, "/")
    ),
    summary: summarize(rows),
    events: rows
  };

  writeJsonFile(jsonPath, report);
  writeCsv(csvPath, rows);
  writeMarkdown(mdPath, report, proposedFixes);
  writeJsonFile(fixesPath, {
    generated_at: report.generated_at,
    total_proposed_fixes: proposedFixes.length,
    proposed_fixes: proposedFixes
  });

  console.log(
    JSON.stringify(
      {
        total_events: report.total_events,
        summary: report.summary,
        proposed_fixes: proposedFixes.length,
        json: path.relative(ROOT, jsonPath),
        csv: path.relative(ROOT, csvPath),
        md: path.relative(ROOT, mdPath),
        fixes: path.relative(ROOT, fixesPath)
      },
      null,
      2
    )
  );
}

main();
