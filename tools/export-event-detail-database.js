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
      /supabaseAnonKey:\s*"([^"]+)"/.exec(text)?.[1] || ""
  };
}

const configFallback =
  readConfigFallback();

const SUPABASE_URL =
  clean(process.env.SUPABASE_URL || process.env.SPORT_EVENT_MAP_SUPABASE_URL || configFallback.url)
    .replace(/\/+$/, "");

const SUPABASE_KEY =
  clean(process.env.SUPABASE_ANON_KEY || process.env.SPORT_EVENT_MAP_SUPABASE_PUBLIC_KEY || process.env.SPORT_EVENT_MAP_SUPABASE_ANON_KEY || configFallback.key);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY or public publishable key.");
}

async function supabaseGet(table, query = "") {
  const url =
    `${SUPABASE_URL}/rest/v1/${table}${query}`;

  const response =
    await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
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

async function main() {
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
    supabaseGet("event_sources", "?select=*&order=created_at.asc"),
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

  const exported =
    details.map(detail => {
      const id =
        detail.id;

      const row = {
        event_slug: detail.event_slug,
        verification_status: detail.verification_status,
        last_checked: detail.last_checked,
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
      delete row.basis.verification_status;
      delete row.basis.last_checked;

      return row;
    });

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

main().catch(error => {
  console.error(error);
  process.exit(1);
});
