const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const COLUMNS = [
  "event_name", "sport", "date", "city", "country", "address", "latitude", "longitude",
  "distance", "description", "event_url", "data_source", "source_url", "verification_status",
  "priority", "check_frequency", "last_checked", "next_check", "source_note", "image"
];

function clean(value) {
  return value === null || value === undefined ? "" : String(value);
}

function csvCell(value) {
  const text = clean(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseArgs(argv) {
  const args = { out: path.join(ROOT, "data", "events.csv"), write: false };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = path.resolve(argv[++index]);
    if (argv[index] === "--write") args.write = true;
  }
  return args;
}

async function requestPage(url, key, offset, limit) {
  const response = await fetch(`${url}/rest/v1/public_event_discovery?select=*&order=edition_slug.asc&offset=${offset}&limit=${limit}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!response.ok) throw new Error(`Supabase export failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv);
  const url = clean(process.env.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY.");
  if (!args.write) throw new Error("Export is explicit: add --write and review the git diff before publishing.");

  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await requestPage(url, key, offset, pageSize);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  if (rows.length < 900) throw new Error(`Refusing to replace the fallback with only ${rows.length} public rows.`);

  const exportedAt = new Date().toISOString();
  const mapped = rows.map(row => ({
    event_name: row.event_name,
    sport: row.sport,
    date: row.date,
    city: row.city,
    country: row.country,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    distance: row.distance,
    description: row.description,
    event_url: row.event_url,
    data_source: "Supabase public_event_discovery export",
    source_url: row.source_url,
    verification_status: row.verification_status,
    priority: row.priority,
    check_frequency: "",
    last_checked: row.last_checked,
    next_check: row.next_check,
    source_note: `Generated fallback export ${exportedAt}`,
    image: row.image
  }));
  const output = [COLUMNS.join(";"), ...mapped.map(row => COLUMNS.map(column => csvCell(row[column])).join(";"))].join("\n") + "\n";
  fs.writeFileSync(args.out, output, "utf8");
  console.log(`Exported ${mapped.length} published editions to ${path.relative(ROOT, args.out)}.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
