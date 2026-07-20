const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CSS_PATH = path.join(ROOT, "css", "style.css");
const HTML_PATH = path.join(ROOT, "index.html");
const REPORT_JSON = path.join(ROOT, "reports", "responsive-layout-audit.json");
const REPORT_MD = path.join(ROOT, "reports", "responsive-layout-audit.md");

const REQUIRED_TOKENS = [
  "--space-2xs",
  "--space-xs",
  "--space-sm",
  "--space-md",
  "--space-lg",
  "--space-xl",
  "--space-2xl",
  "--page-padding",
  "--section-gap",
  "--card-gap",
  "--content-max-width",
  "--text-max-width",
  "--card-max-width"
];

const BREAKPOINTS = [
  {
    name: "small phones",
    pattern: /max-width:\s*480px/
  },
  {
    name: "large phones",
    pattern: /max-width:\s*767px/
  },
  {
    name: "tablets",
    pattern: /max-width:\s*1023px/
  },
  {
    name: "small laptops",
    pattern: /max-width:\s*1279px/
  },
  {
    name: "common laptops",
    pattern: /max-width:\s*1439px/
  },
  {
    name: "large laptops",
    pattern: /max-width:\s*1599px/
  },
  {
    name: "desktop",
    pattern: /min-width:\s*1280px/
  },
  {
    name: "large desktop",
    pattern: /min-width:\s*1536px/
  }
];

const CRITICAL_SELECTORS = [
  "#topbar",
  "#platformNav",
  "#topbar-search",
  "#app",
  "#map",
  "#eventDrawer",
  ".event-detail-shell",
  ".season-planner-card",
  ".profile-card",
  "#adminModal"
];

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });
}

function countMatches(source, pattern) {
  const matches = source.match(new RegExp(pattern.source, `${pattern.flags}g`));
  return matches ? matches.length : 0;
}

function audit() {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  const html = fs.readFileSync(HTML_PATH, "utf8");

  const missingTokens = REQUIRED_TOKENS
    .filter(token => !css.includes(token));

  const breakpointCoverage = BREAKPOINTS
    .map(item => ({
      name: item.name,
      present: item.pattern.test(css),
      matches: countMatches(css, item.pattern)
    }));

  const missingSelectors = CRITICAL_SELECTORS
    .filter(selector => !css.includes(selector) && !html.includes(selector.replace(/^[.#]/, "")));

  const horizontalRiskSelectors = [
    {
      selector: "body",
      has_overflow_guard: /body[\s\S]*overflow-x:\s*hidden/.test(css)
    },
    {
      selector: "tables",
      has_overflow_guard: /table-wrap[\s\S]*overflow-x:\s*auto/.test(css) ||
        /table[\s\S]*overflow-x:\s*auto/.test(css)
    },
    {
      selector: "mobile navigation",
      has_overflow_guard: /platformNav[\s\S]*overflow-x:\s*auto/.test(css) ||
        /platform-nav[\s\S]*overflow-x:\s*auto/.test(css)
    }
  ];

  const warnings = [];

  if (missingTokens.length) {
    warnings.push("Spacing tokens are incomplete.");
  }

  breakpointCoverage
    .filter(item => !item.present)
    .forEach(item => {
      warnings.push(`Missing explicit breakpoint coverage for ${item.name}.`);
    });

  if (missingSelectors.length) {
    warnings.push(`Missing responsive selectors: ${missingSelectors.join(", ")}.`);
  }

  horizontalRiskSelectors
    .filter(item => !item.has_overflow_guard)
    .forEach(item => {
      warnings.push(`No obvious horizontal overflow guard for ${item.selector}.`);
    });

  return {
    generated_at: new Date().toISOString(),
    css: path.relative(ROOT, CSS_PATH).replace(/\\/g, "/"),
    html: path.relative(ROOT, HTML_PATH).replace(/\\/g, "/"),
    status: warnings.length ? "needs_review" : "pass",
    missing_tokens: missingTokens,
    breakpoint_coverage: breakpointCoverage,
    missing_selectors: missingSelectors,
    horizontal_overflow_guards: horizontalRiskSelectors,
    warnings,
    note:
      "This is a static layout audit. Use browser screenshots for visual QA before launch."
  };
}

function writeMarkdown(report) {
  const lines = [
    "# Responsive Layout Audit",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    "",
    "## Breakpoints",
    "",
    ...report.breakpoint_coverage.map(item =>
      `- ${item.name}: ${item.present ? "present" : "missing"} (${item.matches})`
    ),
    "",
    "## Spacing Tokens",
    "",
    report.missing_tokens.length
      ? `Missing: ${report.missing_tokens.join(", ")}`
      : "All required spacing tokens are present.",
    "",
    "## Warnings",
    "",
    ...(report.warnings.length
      ? report.warnings.map(item => `- ${item}`)
      : ["- No static layout warnings found."])
  ];

  fs.writeFileSync(REPORT_MD, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const report = audit();

  ensureDirectoryForFile(REPORT_JSON);

  fs.writeFileSync(
    REPORT_JSON,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );

  writeMarkdown(report);

  console.log(
    JSON.stringify(
      {
        status: report.status,
        warnings: report.warnings.length,
        json: path.relative(ROOT, REPORT_JSON),
        md: path.relative(ROOT, REPORT_MD)
      },
      null,
      2
    )
  );

  if (report.status !== "pass") {
    process.exitCode = 1;
  }
}

main();
