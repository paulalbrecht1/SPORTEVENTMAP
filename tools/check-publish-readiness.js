const fs = require("fs");
const path = require("path");

const {
  COLUMNS,
  dedupeEvents,
  getValidationErrors,
  parseCsvFile,
  splitDelimitedLine
} = require("./event-table-utils");

const ROOT =
  path.resolve(__dirname, "..");

const FILES_TO_SCAN = [
  "index.html",
  "imprint.html",
  "privacy.html",
  "js",
  "css",
  "data/imports/README.md",
  "supabase",
  "docs/LOCAL_PUBLISH.md",
  "SECURITY.md"
];

const SECRET_PATTERNS = [
  {
    name: "Geoapify raw key",
    pattern: /\b[0-9a-f]{32}\b/i
  },
  {
    name: "Supabase service role JWT",
    pattern: /eyJ[\w-]+\.[\w-]+service_role[\w-]*\.[\w-]+/i
  },
  {
    name: "Private key marker",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/
  },
  {
    name: "Secret assignment",
    pattern: /(api_secret|service_role|private_key)\s*[:=]\s*["'][^"']{8,}/i
  }
];

function walk(inputPath, files = []) {
  if (!fs.existsSync(inputPath)) {
    return files;
  }

  const stat =
    fs.statSync(inputPath);

  if (stat.isDirectory()) {
    fs.readdirSync(inputPath)
      .forEach(child => {
        const childPath =
          path.join(inputPath, child);

        if (
          childPath.includes(
            path.join("data", "imports", "private")
          )
        ) {
          return;
        }

        walk(childPath, files);
      });

    return files;
  }

  if (
    stat.isFile() &&
    /\.(html|css|js|md|sql|json|toml|txt)$/i.test(inputPath)
  ) {
    files.push(inputPath);
  }

  return files;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message) {
  console.log(`FAIL ${message}`);
  return message;
}

function checkSecrets() {
  const failures = [];
  const files =
    FILES_TO_SCAN.flatMap(entry =>
      walk(path.join(ROOT, entry))
    );

  files.forEach(filePath => {
    const relativePath =
      path.relative(ROOT, filePath);

    const content =
      fs.readFileSync(filePath, "utf8");

    SECRET_PATTERNS.forEach(({ name, pattern }) => {
      if (pattern.test(content)) {
        failures.push(
          fail(`${name} found in ${relativePath}`)
        );
      }
    });
  });

  if (!failures.length) {
    pass("no obvious private secrets in publishable files");
  }

  return failures;
}

function checkScriptOrder() {
  const html =
    fs.readFileSync(
      path.join(ROOT, "index.html"),
      "utf8"
    );

  const configIndex =
    html.indexOf("js/config.js");

  const supabaseIndex =
    html.indexOf("js/supabase.js");

  if (
    configIndex === -1 ||
    supabaseIndex === -1 ||
    configIndex > supabaseIndex
  ) {
    return [
      fail("js/config.js must be loaded before js/supabase.js")
    ];
  }

  pass("script order loads config before Supabase logic");

  return [];
}

function checkGitignore() {
  const gitignorePath =
    path.join(ROOT, ".gitignore");

  if (!fs.existsSync(gitignorePath)) {
    return [
      fail(".gitignore is missing")
    ];
  }

  const gitignore =
    fs.readFileSync(gitignorePath, "utf8");

  if (!gitignore.includes("data/imports/private/geoapify-key.txt")) {
    return [
      fail("Geoapify private key file is not ignored")
    ];
  }

  pass("private Geoapify key file is ignored");

  return [];
}

function checkLegalLinks() {
  const failures = [];
  const html =
    fs.readFileSync(
      path.join(ROOT, "index.html"),
      "utf8"
    );

  [
    "imprint.html",
    "privacy.html"
  ].forEach(file => {
    if (!html.includes(file)) {
      failures.push(
        fail(`index.html does not link to ${file}`)
      );
      return;
    }

    if (!fs.existsSync(path.join(ROOT, file))) {
      failures.push(
        fail(`${file} is missing`)
      );
    }
  });

  if (!html.includes("mailto:kontakt@sporteventmap.com")) {
    failures.push(
      fail("index.html does not link to the launch contact email")
    );
  }

  if (!failures.length) {
    pass("imprint/privacy/contact legal links are present");
  }

  return failures;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkLaunchSurface() {
  const failures = [];
  const html =
    fs.readFileSync(
      path.join(ROOT, "index.html"),
      "utf8"
    );

  [
    "landingDiscoverBtn",
    "landingSeasonBtn",
    "loginBtn",
    "logoutBtn",
    "seasonPlannerBtn",
    "seasonCountdownCards",
    "seasonTrainingBlocks",
    "seasonRecommendedEvents",
    "feedbackModal"
  ].forEach(id => {
    if (!html.includes(`id="${id}"`)) {
      failures.push(
        fail(`launch UI is missing #${id}`)
      );
    }
  });

  const css =
    fs.readFileSync(
      path.join(ROOT, "css", "style.css"),
      "utf8"
    );

  [
    "--bg-dark",
    "--accent-green",
    "--space-md",
    "--button-primary-bg",
    ".landing-return-section",
    ".season-countdown-card"
  ].forEach(token => {
    if (!css.includes(token)) {
      failures.push(
        fail(`design-system/polish token missing: ${token}`)
      );
    }
  });

  if (!failures.length) {
    pass("launch UI, planner surfaces and design tokens are present");
  }

  return failures;
}

function checkPriorityEvents() {
  const reportPath =
    path.join(
      ROOT,
      "data",
      "imports",
      "review",
      "priority-events-report.json"
    );

  if (!fs.existsSync(reportPath)) {
    return [
      fail("priority events report is missing; run node tools/check-priority-events.js")
    ];
  }

  const report =
    JSON.parse(
      fs.readFileSync(reportPath, "utf8")
    );

  if (Number(report.missing || 0) > 0) {
    const missingNames =
      (report.rows || [])
        .filter(row => !row.exists_in_csv)
        .map(row => row.official_name)
        .slice(0, 5)
        .join(", ");

    return [
      fail(`priority events missing: ${report.missing}${missingNames ? ` (${missingNames})` : ""}`)
    ];
  }

  pass("priority events checklist is covered");

  return [];
}

function checkDuplicateReviewReport() {
  const reportPath =
    path.join(ROOT, "data", "review", "duplicate-candidates.json");

  if (!fs.existsSync(reportPath)) {
    return [
      fail("duplicate candidate report is missing; run node tools/find-duplicate-candidates.js")
    ];
  }

  const report =
    JSON.parse(
      fs.readFileSync(reportPath, "utf8")
    );

  if (Number(report.exact_duplicates || 0) > 0) {
    return [
      fail(`duplicate report has ${report.exact_duplicates} exact duplicate(s)`)
    ];
  }

  pass("duplicate candidate report exists and has no exact duplicates");

  return [];
}

function checkSeasonPlannerRenderHooks() {
  const eventsJs =
    fs.readFileSync(
      path.join(ROOT, "js", "events.js"),
      "utf8"
    );

  const requiredHooks = [
    "renderSeasonMonthCalendar",
    "getSeasonTrainingBlocks",
    "seasonCountdownCards",
    "data-season-note",
    "recommendation_clicked",
    "planner_opened"
  ];

  const failures =
    requiredHooks
      .filter(hook => !eventsJs.includes(hook))
      .map(hook =>
        fail(`Season Planner render hook missing: ${hook}`)
      );

  if (!failures.length) {
    pass("Season Planner launch hooks are present");
  }

  return failures;
}

function checkEventsCsv() {
  const csvPath =
    path.join(ROOT, "data", "events.csv");

  const csvContent =
    fs.readFileSync(csvPath, "utf8")
      .replace(/^\uFEFF/, "");

  const physicalRows =
    csvContent
      .split(/\r?\n/)
      .filter(line => line.trim());

  const malformedRows =
    physicalRows
      .map((line, index) => ({
        line: index + 1,
        columns: splitDelimitedLine(line, ";").length
      }))
      .filter(row => row.columns !== COLUMNS.length);

  const events =
    parseCsvFile(csvPath);

  const deduped =
    dedupeEvents(events);

  const invalid =
    events.filter(event =>
      getValidationErrors(event, {
        requireCoordinates: true
      }).length
    );

  const allowedStatuses =
    new Set([
      "registration_open",
      "registration_not_open",
      "sold_out",
      "cancelled",
      "date_expected",
      "date_refreshed",
      "unclear",
      "confirmed"
    ]);

  const invalidStatuses =
    events.filter(event =>
      !allowedStatuses.has(
        String(event.verification_status || "")
          .trim()
          .toLowerCase()
      )
    );

  const failures = [];

  const exactKeys =
    new Set();

  const exactDuplicates = [];

  events.forEach(event => {
    const key = [
      normalizeText(event.event_name),
      event.date,
      normalizeText(event.city)
    ].join("|");

    if (exactKeys.has(key)) {
      exactDuplicates.push(key);
      return;
    }

    exactKeys.add(key);
  });

  if (!events.length) {
    failures.push(
      fail("data/events.csv has no events")
    );
  } else {
    pass(`data/events.csv contains ${events.length} events`);
  }

  if (deduped.length !== events.length) {
    failures.push(
      fail(`data/events.csv has ${events.length - deduped.length} likely duplicates`)
    );
  } else {
    pass("data/events.csv has no likely duplicates");
  }

  if (exactDuplicates.length) {
    failures.push(
      fail(`data/events.csv has ${exactDuplicates.length} exact duplicate key(s)`)
    );
  } else {
    pass("data/events.csv has no exact name/date/city duplicates");
  }

  if (malformedRows.length) {
    const sample =
      malformedRows
        .slice(0, 5)
        .map(row => `${row.line} (${row.columns} columns)`)
        .join(", ");

    failures.push(
      fail(`data/events.csv has ${malformedRows.length} malformed physical rows: ${sample}`)
    );
  } else {
    pass(`data/events.csv has exactly ${COLUMNS.length} columns per row`);
  }

  if (invalid.length) {
    failures.push(
      fail(`data/events.csv has ${invalid.length} invalid rows`)
    );
  } else {
    pass("data/events.csv rows have required fields and coordinates");
  }

  if (invalidStatuses.length) {
    failures.push(
      fail(`data/events.csv has ${invalidStatuses.length} invalid registration statuses`)
    );
  } else {
    pass("data/events.csv registration statuses use the supported vocabulary");
  }

  return failures;
}

function main() {
  const failures = [
    ...checkSecrets(),
    ...checkScriptOrder(),
    ...checkGitignore(),
    ...checkLegalLinks(),
    ...checkEventsCsv(),
    ...checkLaunchSurface(),
    ...checkSeasonPlannerRenderHooks(),
    ...checkPriorityEvents(),
    ...checkDuplicateReviewReport()
  ];

  if (failures.length) {
    console.log("");
    console.log(`NOT READY - ${failures.length} issue(s) need review.`);
    process.exit(1);
  }

  console.log("");
  console.log("LAUNCH READY - publish readiness passed.");
}

main();
