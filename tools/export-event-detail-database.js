const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "event-detail-database.json");
const CONFIG_PATH = path.join(ROOT, "js", "config.js");

function clean(value) {
  return String(value || "").trim();
}

function readConfigFallback() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }

  const text =
    fs.readFileSync(CONFIG_PATH, "utf8");

  return {
    url:
      /supabaseUrl:\s*"([^"]+)"/.exec(text)?.[1] || "",
    key:
      /supabasePublishableKey:\s*"([^"]+)"/.exec(text)?.[1] || ""
  };
}

const configFallback =
  readConfigFallback();

const SUPABASE_URL =
  clean(process.env.SUPABASE_URL || process.env.SPORT_EVENT_MAP_SUPABASE_URL || configFallback.url)
    .replace(/\/+$/, "");

const SUPABASE_KEY =
  clean(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SPORT_EVENT_MAP_SUPABASE_PUBLISHABLE_KEY || configFallback.key);

async function supabaseGet(table, query = "") {
  const url =
    `${SUPABASE_URL}/rest/v1/${table}${query}`;

  const response =
    await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY
      }
    });

  if (!response.ok) {
    throw new Error(`${table} export failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function stripSystemFields(row = {}) {
  const copy = { ...row };

  [
    "id",
    "event_detail_id",
    "created_at",
    "updated_at",
    "is_public",
    "event_id"
  ].forEach(field => {
    delete copy[field];
  });

  Object.keys(copy).forEach(key => {
    if (
      copy[key] === null ||
      copy[key] === "" ||
      (Array.isArray(copy[key]) && !copy[key].length)
    ) {
      delete copy[key];
    }
  });

  return copy;
}

function byDetailId(rows = []) {
  return rows.reduce((map, row) => {
    const key =
      row.event_detail_id;

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(row);
    return map;
  }, new Map());
}

function buildExportRecord(detail, groups) {
  const id = detail.id;
  const knowledgeScope = clean(detail.knowledge_scope) || "edition";
  const scopedVerification = {
    status: detail.verification_status,
    last_verified_at: detail.last_checked
  };
  const row = {
    event_slug: detail.event_slug,
    event_brand_id: detail.event_brand_id || undefined,
    edition_id: detail.edition_id || undefined,
    knowledge_scope: knowledgeScope,
    verification_status: detail.verification_status,
    last_checked: detail.last_checked,
    verification: {
      brand: knowledgeScope === "brand" ? scopedVerification : undefined,
      edition: knowledgeScope === "edition" ? scopedVerification : undefined
    },
    basis: stripSystemFields(detail),
    registration: stripSystemFields(groups.registration.get(id)?.[0]),
    course: stripSystemFields(groups.course.get(id)?.[0]),
    race_day: stripSystemFields(groups.race_day.get(id)?.[0]),
    travel: stripSystemFields(groups.travel.get(id)?.[0]),
    weather: stripSystemFields(groups.weather.get(id)?.[0]),
    statistics: stripSystemFields(groups.statistics.get(id)?.[0]),
    editorial: stripSystemFields(groups.editorial.get(id)?.[0]),
    sources: (groups.sources.get(id) || []).map(stripSystemFields),
    faq: (groups.faq.get(id) || []).map(stripSystemFields)
  };

  delete row.basis.event_slug;
  delete row.basis.event_brand_id;
  delete row.basis.edition_id;
  delete row.basis.knowledge_scope;
  delete row.basis.verification_status;
  delete row.basis.last_checked;
  // Organizer is a canonical event-brand fact. It is exported through
  // public_event_discovery/public_event_archive and not duplicated in Wiki data.
  delete row.basis.organizer;

  return row;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  }

  const details =
    await supabaseGet(
      "event_details",
      "?select=*&is_public=eq.true&verification_status=in.(verified_official_source,partially_verified)&order=event_slug.asc"
    );

  const [
    registrations,
    courses,
    raceDays,
    travel,
    weather,
    statistics,
    editorial,
    sources,
    faq
  ] = await Promise.all([
    supabaseGet("event_registration", "?select=*"),
    supabaseGet("event_course", "?select=*"),
    supabaseGet("event_race_day", "?select=*"),
    supabaseGet("event_travel", "?select=*"),
    supabaseGet("event_weather", "?select=*"),
    supabaseGet("event_statistics", "?select=*"),
    supabaseGet("event_editorial", "?select=*"),
    supabaseGet("event_detail_sources", "?select=*&order=created_at.asc"),
    supabaseGet("event_faq", "?select=*&order=sort_order.asc")
  ]);

  const groups = {
    registration: byDetailId(registrations),
    course: byDetailId(courses),
    race_day: byDetailId(raceDays),
    travel: byDetailId(travel),
    weather: byDetailId(weather),
    statistics: byDetailId(statistics),
    editorial: byDetailId(editorial),
    sources: byDetailId(sources),
    faq: byDetailId(faq)
  };

  const exported = details.map(detail => buildExportRecord(detail, groups));

  if (!exported.length && fs.existsSync(OUTPUT_PATH)) {
    const existing =
      JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));

    if (
      Array.isArray(existing) &&
      existing.length &&
      process.env.ALLOW_EMPTY_EVENT_DETAIL_EXPORT !== "1"
    ) {
      throw new Error(
        `Supabase returned 0 public Event Knowledge records. Kept existing ${path.relative(ROOT, OUTPUT_PATH)} with ${existing.length} record(s). Set ALLOW_EMPTY_EVENT_DETAIL_EXPORT=1 to overwrite intentionally.`
      );
    }
  }

  fs.writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify(exported, null, 2)}\n`,
    "utf8"
  );

  console.log(`Exported ${exported.length} public Event Knowledge record(s) to ${path.relative(ROOT, OUTPUT_PATH)}.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildExportRecord,
  byDetailId,
  main,
  stripSystemFields
};
