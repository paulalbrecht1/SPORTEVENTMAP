const fs = require("fs");
const path = require("path");
const { parseCsvFile } = require("./event-table-utils.js");

const ROOT = path.resolve(__dirname, "..");
const EVENTS_PATH = path.join(ROOT, "data", "events.csv");
const PAGES_PATH = path.join(ROOT, "data", "event-pages.json");
const EXPORT_DIR = path.join(ROOT, "exports");
const SITE_URL = "https://sporteventmap.com";

function csvEscape(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function markdownEscape(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

const events = parseCsvFile(EVENTS_PATH);
const pages = JSON.parse(fs.readFileSync(PAGES_PATH, "utf8"));

const rows = pages.map((page, index) => {
  const event = events[index] || {};

  return {
    event_name: page.event_name,
    date: page.date,
    city: page.city,
    country: page.country,
    sport: page.sport,
    distance: page.distance,
    official_url: event.event_url || "",
    detail_url: `${SITE_URL}${page.url}`
  };
});

fs.mkdirSync(EXPORT_DIR, { recursive: true });

const csvHeaders = [
  "event_name",
  "date",
  "city",
  "country",
  "sport",
  "distance",
  "official_url",
  "detail_url"
];

const csv = [
  csvHeaders.join(";"),
  ...rows.map(row => csvHeaders.map(header => csvEscape(row[header])).join(";"))
].join("\r\n") + "\r\n";

fs.writeFileSync(path.join(EXPORT_DIR, "event-url-list.csv"), csv, "utf8");

const markdown = [
  "# Event URLs",
  "",
  "| Event | Date | City | Official URL | Detail URL |",
  "|---|---:|---|---|---|",
  ...rows.map(row => {
    const official = row.official_url
      ? `[official](${row.official_url})`
      : "Not available";

    return `| ${markdownEscape(row.event_name)} | ${markdownEscape(row.date)} | ${markdownEscape(row.city)} | ${official} | [detail](${row.detail_url}) |`;
  })
].join("\n") + "\n";

fs.writeFileSync(path.join(EXPORT_DIR, "event-url-list.md"), markdown, "utf8");

console.log(`Wrote ${rows.length} events to exports/event-url-list.csv and exports/event-url-list.md`);
