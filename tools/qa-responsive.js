const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REPORT_DIR = path.join(ROOT, "reports", "responsive-screenshots");
const SCREENSHOT_DIR = path.join(REPORT_DIR, "png");
const CHROME_PROFILE_DIR = path.join(REPORT_DIR, "chrome-profile");
const FRAME_PATH = path.join(REPORT_DIR, "qa-frame.html");
const REPORT_JSON = path.join(ROOT, "reports", "responsive-qa-report.json");
const REPORT_MD = path.join(ROOT, "reports", "responsive-qa-report.md");
const PORT = Number(process.env.QA_RESPONSIVE_PORT || 4187);
const RUN_ID = String(Date.now());

const VIEWPORTS = [
  { name: "phone-320", width: 320, height: 568 },
  { name: "phone-375", width: 375, height: 667 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-414", width: 414, height: 896 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "laptop-1280", width: 1280, height: 720 },
  { name: "laptop-1366", width: 1366, height: 768 },
  { name: "laptop-1440", width: 1440, height: 900 },
  { name: "laptop-1536", width: 1536, height: 864 },
  { name: "laptop-1600", width: 1600, height: 900 },
  { name: "desktop-1728", width: 1728, height: 1117 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-2560", width: 2560, height: 1440 }
];

const PAGES = [
  { name: "home", route: "/index.html#/home", action: "none" },
  { name: "discovery", route: "/index.html#/discovery", action: "none" },
  { name: "event-detail", route: "/event/bmw-berlin-marathon-2026/", action: "none" },
  { name: "season-planner", route: "/index.html#/planner", action: "openPlanner" },
  { name: "profile", route: "/index.html#/discovery", action: "openProfile" },
  { name: "admin", route: "/index.html#/discovery", action: "openAdmin" },
  { name: "community", route: "/index.html#/community", action: "none" },
  { name: "event-wiki", route: "/index.html#/events", action: "none" }
];

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "google-chrome",
    "chrome",
    "chromium",
    "msedge"
  ].filter(Boolean);
}

function findChrome() {
  return chromeCandidates().find(candidate => {
    if (candidate.includes("\\") || candidate.includes("/")) {
      return fs.existsSync(candidate);
    }

    return true;
  });
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json"
  }[extension] || "application/octet-stream";
}

function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    const decodedPath = decodeURIComponent(url.pathname);
    const requestedPath =
      decodedPath === "/"
        ? path.join(ROOT, "index.html")
        : path.join(ROOT, decodedPath);
    const normalizedPath = path.normalize(requestedPath);

    if (!normalizedPath.startsWith(ROOT)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    let filePath = normalizedPath;

    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
    } catch (_error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": contentType(filePath),
        "Cache-Control": "no-store"
      });
      response.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

function writeFrame() {
  ensureDir(REPORT_DIR);

  const pageMap = PAGES.reduce((map, page) => {
    map[page.name] = page;
    return map;
  }, {});

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sport Event Map Responsive QA Frame</title>
  <style>
    html, body, iframe {
      width: 100%;
      height: 100%;
      margin: 0;
      border: 0;
      overflow: hidden;
      background: #07110f;
    }
  </style>
</head>
<body>
  <iframe id="appFrame" title="Sport Event Map QA target"></iframe>
  <script>
    const pages = ${JSON.stringify(pageMap)};
    const params = new URLSearchParams(location.search);
    const page = pages[params.get("page")] || pages.discovery;
    const frame = document.getElementById("appFrame");

    function openModal(selector) {
      const doc = frame.contentDocument;
      const modal = doc && doc.querySelector(selector);
      if (!modal) return;
      modal.classList.add("open");
      modal.removeAttribute("hidden");
      doc.body.classList.add("qa-modal-open");
    }

    function runAction() {
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        if (page.action === "openPlanner") openModal("#seasonPlannerModal");
        if (page.action === "openProfile") openModal("#profileModal");
        if (page.action === "openAdmin") openModal("#adminModal");
      } catch (error) {
        console.warn(error);
      }
    }

    frame.addEventListener("load", () => {
      setTimeout(runAction, 1800);
      setTimeout(runAction, 3600);
    });

    const cacheBust = "qa=" + Date.now();
    const hashIndex = page.route.indexOf("#");
    const routeWithCache =
      hashIndex >= 0
        ? page.route.slice(0, hashIndex) + "?" + cacheBust + page.route.slice(hashIndex)
        : page.route + (page.route.includes("?") ? "&" : "?") + cacheBust;

    frame.src = routeWithCache;
  </script>
</body>
</html>`;

  fs.writeFileSync(FRAME_PATH, html, "utf8");
}

function runChrome(chromePath, args) {
  return new Promise(resolve => {
    const child = spawn(chromePath, args, {
      windowsHide: true,
      stdio: "ignore"
    });

    child.on("error", error => {
      resolve({
        ok: false,
        error: error.message
      });
    });

    child.on("exit", code => {
      resolve({
        ok: code === 0,
        code
      });
    });
  });
}

function makeScreenshotPath(page, viewport) {
  return path.join(
    SCREENSHOT_DIR,
    `${viewport.name}__${page.name}.png`
  );
}

async function captureAll(chromePath) {
  const results = [];

  for (const viewport of VIEWPORTS) {
    for (const page of PAGES) {
      const screenshotPath = makeScreenshotPath(page, viewport);
      const targetUrl =
        `http://127.0.0.1:${PORT}/reports/responsive-screenshots/qa-frame.html?run=${RUN_ID}&page=${encodeURIComponent(page.name)}`;

      const result = await runChrome(chromePath, [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-cache",
        "--disk-cache-size=1",
        "--disable-sync",
        "--disable-extensions",
        "--disable-component-update",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=6500",
        `--user-data-dir=${CHROME_PROFILE_DIR}-${RUN_ID}`,
        `--window-size=${viewport.width},${viewport.height}`,
        `--screenshot=${screenshotPath}`,
        targetUrl
      ]);

      results.push({
        viewport,
        page: page.name,
        screenshot: path.relative(ROOT, screenshotPath).replace(/\\/g, "/"),
        ok: result.ok,
        code: result.code ?? null,
        error: result.error || ""
      });
    }
  }

  return results;
}

function writeReports(chromePath, results) {
  const failed = results.filter(result => !result.ok);
  const report = {
    generated_at: new Date().toISOString(),
    chrome_path: chromePath,
    viewport_count: VIEWPORTS.length,
    page_count: PAGES.length,
    screenshot_count: results.filter(result => result.ok).length,
    failed_count: failed.length,
    screenshots_dir: "reports/responsive-screenshots/png",
    viewports: VIEWPORTS,
    pages: PAGES,
    results,
    manual_review_checklist: [
      "Header/navigation: no overlap, no clipped action pills, active route visible.",
      "Discovery: search field centered, map starts below header, no horizontal scrollbar.",
      "Event cards: titles and metadata wrap cleanly, buttons remain tappable.",
      "Detail page: content width is bounded, cards/grid do not become too wide.",
      "Season Planner/Profile/Admin modals: tabs and controls wrap with visible gaps.",
      "Tables: either readable or horizontally scrollable on phone/tablet.",
      "Large screens: content is centered and does not run full-width indefinitely."
    ]
  };

  ensureDir(path.dirname(REPORT_JSON));
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const lines = [
    "# Responsive QA Report",
    "",
    `Generated: ${report.generated_at}`,
    `Chrome: ${chromePath}`,
    `Screenshots: ${report.screenshot_count}`,
    `Failures: ${report.failed_count}`,
    "",
    "## Viewports",
    "",
    ...VIEWPORTS.map(viewport =>
      `- ${viewport.name}: ${viewport.width}x${viewport.height}`
    ),
    "",
    "## Pages",
    "",
    ...PAGES.map(page => `- ${page.name}: ${page.route}`),
    "",
    "## Manual Review Checklist",
    "",
    ...report.manual_review_checklist.map(item => `- ${item}`)
  ];

  if (failed.length) {
    lines.push(
      "",
      "## Failed Captures",
      "",
      ...failed.map(result =>
        `- ${result.viewport.name} / ${result.page}: ${result.error || `exit ${result.code}`}`
      )
    );
  }

  fs.writeFileSync(REPORT_MD, `${lines.join("\n")}\n`, "utf8");

  return report;
}

async function main() {
  ensureDir(SCREENSHOT_DIR);
  ensureDir(CHROME_PROFILE_DIR);
  writeFrame();

  const chromePath = findChrome();

  if (!chromePath) {
    throw new Error(
      "Chrome/Edge was not found. Set CHROME_PATH to run responsive screenshots."
    );
  }

  const server = await startServer();

  try {
    const results = await captureAll(chromePath);
    const report = writeReports(chromePath, results);

    console.log(
      JSON.stringify(
        {
          screenshots: report.screenshot_count,
          failures: report.failed_count,
          report: path.relative(ROOT, REPORT_JSON),
          screenshots_dir: report.screenshots_dir
        },
        null,
        2
      )
    );

    if (report.failed_count) {
      process.exitCode = 1;
    }
  } finally {
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
