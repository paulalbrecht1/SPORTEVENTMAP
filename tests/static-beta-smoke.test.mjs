import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import eventTableUtils from "../tools/event-table-utils.js";

const {
  COLUMNS,
  getValidationErrors,
  parseCsvFile,
  splitDelimitedLine
} = eventTableUtils;

const root =
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8"
  );
}

function pass(message) {
  console.log(`PASS ${message}`);
}

const html =
  read("index.html");
const css =
  read("css/style.css");

const ids =
  [...html.matchAll(/\sid=["']([^"']+)["']/g)]
    .map(match => match[1]);

const duplicateIds =
  ids.filter((id, index) =>
    ids.indexOf(id) !== index
  );

assert.deepEqual(
  [...new Set(duplicateIds)],
  [],
  "index.html contains duplicate ids"
);
pass("HTML ids are unique");

[
  "authModal",
  "eventModal",
  "adminModal",
  "adminReviewPanel",
  "adminQualityPanel",
  "adminFeedbackPanel",
  "adminAnalyticsPanel",
  "adminImportsPanel",
  "adminSystemStatus",
  "pendingEventsList",
  "pendingEventSearch",
  "pendingEventFilter",
  "pendingEventSort",
  "adminAnalyticsRange",
  "refreshAdminAnalyticsBtn",
  "analyticsActivityBreakdown",
  "analyticsTopEvents",
  "analyticsTopPlannedEvents",
  "landingLanguageSelect",
  "topbarLanguageSelect",
  "profileLanguageSelect",
  "feedbackModal",
  "welcomeModal",
  "seasonPlannerModal",
  "eventDrawer",
  "map",
  "sidebar"
].forEach(id => {
  assert.equal(
    ids.includes(id),
    true,
    `Missing required UI id: ${id}`
  );
});
pass("required beta views and modals exist");

assert.match(
  html,
  /<nav class="sem-desktop-nav"[^>]*>[\s\S]*?<a class="active" href="#\/home"[^>]*>Home<\/a>/i,
  "Home landing navigation must expose an active Home pill"
);
assert.match(
  css,
  /\.sem-desktop-nav a\s*\{[\s\S]*?border-radius:\s*999px;[\s\S]*?background:/i,
  "Home landing navigation links must render as pills"
);
assert.match(
  css,
  /\.platform-nav a\s*\{[\s\S]*?border:\s*1px solid rgba\(148, 163, 184, 0\.24\);[\s\S]*?border-radius:\s*999px;[\s\S]*?background:/i,
  "Platform navigation links must render as visible pills"
);
pass("Home and platform navigation labels render as pills");

assert.match(
  css,
  /\.app-language-select\s*\{[\s\S]*?appearance:\s*none;[\s\S]*?background:[\s\S]*?data:image\/svg\+xml/i,
  "Language controls must use the polished custom pill treatment"
);
assert.match(
  css,
  /\.app-language-select:focus-visible\s*\{[\s\S]*?box-shadow:[\s\S]*?rgba\(34, 197, 94, 0\.16\)/i,
  "Language controls must expose a visible keyboard focus state"
);
pass("language controls use a polished custom appearance");

const themeSource =
  read("js/theme.js");
const detailPageSource =
  read("js/event-detail.js");

[
  "sportEventMapTheme",
  "document.documentElement.dataset.theme",
  'querySelectorAll("[data-theme-toggle]")',
  '".sem-header-actions"',
  '"#authArea"',
  '".event-detail-header"',
  '".legal-page-content"'
].forEach(fragment => {
  assert.ok(
    themeSource.includes(fragment),
    `Global theme system is missing: ${fragment}`
  );
});

[
  'html[data-theme="light"]',
  ".global-theme-toggle",
  ".sem-home",
  "#topbar",
  "#seasonPlannerModal",
  ".event-detail-page"
].forEach(fragment => {
  assert.ok(
    css.includes(fragment),
    `Global theme CSS coverage is missing: ${fragment}`
  );
});

[
  "imprint.html",
  "privacy.html",
  "legal.html",
  "contact.html"
].forEach(page => {
  assert.match(
    read(page),
    /js\/theme.js/,
    `Theme script missing from ${page}`
  );
});

assert.match(detailPageSource, /theme.js/);
assert.match(detailPageSource, /ensureControls/);
pass("global light and dark themes cover application, detail and legal views");

[
  "Discovery professional visual system",
  "body.platform-route-discovery:not(.landing-open) .platform-nav a",
  "body.platform-route-discovery:not(.landing-open) .event-card",
  "body.platform-route-discovery:not(.landing-open) #sidebar-header",
  "body.platform-route-discovery:not(.landing-open) #topbar-search input",
  '.filter-chip[data-filter="Ultramarathon"]'
].forEach(fragment => {
  assert.ok(
    css.includes(fragment),
    `Professional Discovery styling is missing: ${fragment}`
  );
});
pass("Discovery uses the professional Home-aligned visual system");

assert.doesNotMatch(
  html,
  /href=["']#\/community["']/i,
  "Deferred Community must not appear in primary beta navigation"
);
pass("beta navigation stays focused on event discovery and season planning");

const requiredScripts = [
  "js/theme.js",
  "js/config.js",
  "js/i18n.js",
  "js/supabase.js",
  "js/events.js",
  "js/map.js",
  "js/search.js",
  "js/app.js"
];

let previousScriptIndex = -1;

requiredScripts.forEach(script => {
  const currentIndex =
    html.indexOf(script);

  assert.ok(
    currentIndex > previousScriptIndex,
    `Incorrect or missing script order at ${script}`
  );

  previousScriptIndex =
    currentIndex;
});
pass("application scripts load in the required order");

const frontendSource =
  [
    "js/config.js",
    "js/supabase.js",
    "js/events.js",
    "js/map.js",
    "js/search.js",
    "js/app.js"
  ]
    .map(read)
    .join("\n");

assert.equal(
  /service_role|SUPABASE_SERVICE_ROLE/i.test(frontendSource),
  false,
  "A service-role reference exists in browser code"
);
pass("browser code contains no service-role credential");

const csvPath =
  path.join(root, "data", "events.csv");

const csvContent =
  fs.readFileSync(csvPath, "utf8")
    .replace(/^\uFEFF/, "");

const csvRows =
  csvContent
    .split(/\r?\n/)
    .filter(line => line.trim());

csvRows.forEach((line, index) => {
  assert.equal(
    splitDelimitedLine(line, ";").length,
    COLUMNS.length,
    `CSV line ${index + 1} has an invalid column count`
  );
});

const events =
  parseCsvFile(csvPath);

assert.ok(
  events.length >= 400,
  "Expected at least 400 curated events"
);

events.forEach((event, index) => {
  assert.deepEqual(
    getValidationErrors(event, {
      requireCoordinates: true
    }),
    [],
    `Invalid event row ${index + 2}: ${event.event_name}`
  );
});
pass(`${events.length} event rows pass schema validation`);

assert.match(
  css,
  /@media\s*\(max-width:\s*768px\)/
);
assert.match(
  css,
  /@media\s*\(max-width:\s*420px\)/
);
assert.match(
  css,
  /100dvh/
);
assert.match(
  css,
  /min-height:\s*44px/
);
pass("mobile breakpoints, viewport-safe modals and touch targets exist");

const securityMigration =
  read("supabase/migrations/20260608_closed_beta_security.sql");

[
  "profiles",
  "events",
  "favorites",
  "season_planner_events",
  "analytics_events",
  "user_feedback"
].forEach(table => {
  assert.match(
    securityMigration,
    new RegExp(
      `alter table public\\.${table} enable row level security`,
      "i"
    ),
    `RLS enable statement missing for ${table}`
  );
});

assert.match(
  securityMigration,
  /private\.is_admin\(\)/i
);
assert.match(
  securityMigration,
  /status\s*=\s*'pending'/i
);
pass("closed-beta migration covers all protected tables");

const gateHardeningMigration =
  read("supabase/migrations/20260725_closed_beta_gate_hardening.sql");

[
  /drop function if exists public\.handle_new_user\(\)/i,
  /drop function if exists public\.set_updated_at\(\)/i,
  /drop policy if exists events_admin_read_all on public\.events/i,
  /create policy "Authenticated can read accessible events"/i,
  /create policy "Authenticated can update accessible profiles"/i,
  /drop index if exists public\.analytics_events_event_name_idx/i,
  /create policy sem_authenticated_read_accessible/i
].forEach(pattern => {
  assert.match(
    gateHardeningMigration,
    pattern,
    `Closed-beta gate hardening is missing: ${pattern}`
  );
});
pass("closed-beta gate migration removes production drift and policy overlap");

const adminWorkflowMigration =
  read("supabase/migrations/20260609_admin_workflow.sql");

[
  "registration_status",
  "status_note",
  "last_checked",
  "review_priority",
  "needs_review",
  "reviewed_at",
  "reviewed_by"
].forEach(column => {
  assert.match(
    adminWorkflowMigration,
    new RegExp(column, "i"),
    `Admin workflow column missing: ${column}`
  );
});
pass("admin workflow migration covers review metadata");

const eventSource =
  read("js/events.js");

assert.match(
  eventSource,
  /rawEvent\.registration_status/
);
assert.match(
  eventSource,
  /rawEvent\.status_note/
);
pass("approved database review status maps into public event cards");

const supabaseSource =
  read("js/supabase.js");

const i18nSource =
  read("js/i18n.js");

assert.match(
  i18nSource,
  /"landing\.headline1": "Plan your"/
);
assert.match(
  i18nSource,
  /"landing\.headline1": "Plane deine"/
);
assert.match(
  i18nSource,
  /"landing\.search": "Suche nach Event, Ort, Sportart, Distanz oder Monat\.\.\."/
);
assert.match(
  i18nSource,
  /app-language-changed/
);
assert.match(
  i18nSource,
  /"search\.smart": "Intelligente Suche"/
);
assert.match(
  i18nSource,
  /"month\.2": "März"/
);
assert.doesNotMatch(
  i18nSource,
  /Ã|Â|�/
);

const searchSource =
  read("js/search.js");

assert.match(
  searchSource,
  /getSearchTranslation/
);
assert.match(
  searchSource,
  /search\.selected/
);
assert.doesNotMatch(
  searchSource,
  /Ã|Â|�/
);
pass("English and German UI translations are present and correctly encoded");

assert.match(
  supabaseSource,
  /aggregateAnalyticsRows/
);
assert.match(
  supabaseSource,
  /data-feedback-complete/
);
assert.match(
  supabaseSource,
  /getQualityReviewIssues/
);
assert.match(
  supabaseSource,
  /Missing official website/
);
assert.match(
  supabaseSource,
  /date_outdated/
);
assert.match(
  supabaseSource,
  /possible_duplicate/
);
assert.match(
  supabaseSource,
  /ADMIN_QUALITY_GOAL\s*=\s*1000/
);
assert.doesNotMatch(
  html,
  /analyticsFeedbackList/
);
assert.match(
  html,
  /eventGoalProgressCount/
);
assert.match(
  html,
  /possibleDuplicateCount/
);
assert.match(
  html,
  /pendingBatchFilter/
);
assert.match(
  html,
  /value="active" selected>Active reviews/
);
assert.match(
  supabaseSource,
  /pendingBatchFilter/
);
assert.match(
  supabaseSource,
  /import_batch/
);
assert.match(
  supabaseSource,
  /source_type/
);
pass("admin feedback completion and professional analytics workspace exist");

const batchValidator =
  read("tools/validate-event-batch.js");

const batchTemplate =
  read("data/imports/raw/event-batch-template.csv");

const reviewWorkflowMigration =
  read("supabase/migrations/20260616_admin_review_workflow.sql");

assert.match(
  batchValidator,
  /possible_duplicate/
);
assert.match(
  batchValidator,
  /missing_official_website/
);
assert.match(
  batchTemplate,
  /event_name;sport;distance;distance_category;date;city;country;latitude;longitude;official_website;registration_status;source_url;source_type;review_status;review_reason;review_note;last_checked;import_batch/
);
assert.match(
  reviewWorkflowMigration,
  /import_batch/
);
assert.match(
  reviewWorkflowMigration,
  /source_type/
);
pass("controlled event batch workflow is present");

console.log("\nStatic beta smoke tests passed.");
