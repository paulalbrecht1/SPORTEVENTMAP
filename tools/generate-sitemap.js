const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE_URL = "https://sporteventmap.com";
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const ROBOTS_PATH = path.join(ROOT, "robots.txt");
const EVENTS_PATH = path.join(ROOT, "data", "events.csv");
const EVENT_PAGES_MANIFEST_PATH =
  path.join(ROOT, "data", "event-pages.json");

const STATIC_URLS = [
  "/",
  "/about",
  "/contact",
  "/privacy",
  "/legal",
  "/imprint"
];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeUrl(pathname) {
  if (pathname === "/") {
    return SITE_URL + "/";
  }

  return SITE_URL + pathname;
}

function writeFileIfChanged(filePath, content) {
  if (
    fs.existsSync(filePath) &&
    fs.readFileSync(filePath, "utf8") === content
  ) {
    return false;
  }

  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function readEventRows() {
  if (!fs.existsSync(EVENTS_PATH)) {
    return [];
  }

  const content = fs.readFileSync(EVENTS_PATH, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1);
}

function shouldIncludeEventUrls() {
  return fs.existsSync(EVENT_PAGES_MANIFEST_PATH);
}

function readEventPageUrls() {
  if (!fs.existsSync(EVENT_PAGES_MANIFEST_PATH)) {
    return [];
  }

  try {
    const pages =
      JSON.parse(
        fs.readFileSync(
          EVENT_PAGES_MANIFEST_PATH,
          "utf8"
        )
      );

    return Array.isArray(pages)
      ? pages
          .filter(page => page && page.url)
          .map(page => page.url)
      : [];
  } catch (error) {
    console.warn(
      `Could not read event pages manifest: ${error.message}`
    );
    return [];
  }
}

function buildUrls() {
  const urls = STATIC_URLS.map(pathname => ({
    loc: normalizeUrl(pathname),
    changefreq: pathname === "/" ? "weekly" : "monthly",
    priority: pathname === "/" ? "1.0" : "0.6"
  }));

  if (shouldIncludeEventUrls()) {
    readEventPageUrls().forEach(pathname => {
      urls.push({
        loc: normalizeUrl(pathname),
        changefreq: "monthly",
        priority: "0.7"
      });
    });
  }

  return urls;
}

function writeSitemap() {
  const urls = buildUrls();
  const lastmod = new Date().toISOString().slice(0, 10);
  const body = urls
    .map(
      url => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

  writeFileIfChanged(SITEMAP_PATH, xml);
  return urls.length;
}

function writeRobots() {
  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

  writeFileIfChanged(ROBOTS_PATH, robots);
}

function main() {
  const count = writeSitemap();
  writeRobots();

  console.log(`Generated sitemap.xml with ${count} URL(s).`);
  console.log("Generated robots.txt.");
}

main();
