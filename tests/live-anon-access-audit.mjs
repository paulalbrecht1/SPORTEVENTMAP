import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root =
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );

const config =
  fs.readFileSync(
    path.join(root, "js", "config.js"),
    "utf8"
  );

const supabaseUrl =
  config.match(/supabaseUrl\s*:\s*"([^"]+)"/)?.[1];

const publishableKey =
  config.match(/supabasePublishableKey\s*:\s*"([^"]+)"/)?.[1];

if (!supabaseUrl || !publishableKey) {
  throw new Error(
    "Public Supabase URL/publishable key not found in js/config.js."
  );
}

const checks = [
  [
    "discovery competition formats",
    "public_event_discovery?select=edition_id,race_formats&order=edition_id.asc&limit=5",
    "public_formats"
  ],
  [
    "archive competition formats",
    "public_event_archive?select=edition_id,race_formats&order=edition_id.asc&limit=5",
    "public_formats"
  ],
  [
    "approved events",
    "events?select=id,status&status=eq.approved&limit=1",
    "public"
  ],
  [
    "pending events",
    "events?select=id,status&status=eq.pending&limit=1",
    "private"
  ],
  [
    "profiles",
    "profiles?select=id&limit=1",
    "private"
  ],
  [
    "favorites",
    "favorites?select=id&limit=1",
    "private"
  ],
  [
    "season planner",
    "season_planner_events?select=id&limit=1",
    "private"
  ],
  [
    "feedback",
    "user_feedback?select=id&limit=1",
    "private"
  ],
  [
    "analytics",
    "analytics_events?select=id&limit=1",
    "private"
  ]
];

let failed =
  false;

for (const [name, query, visibility] of checks) {
  const response =
    await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${query}`,
      {
        headers: {
          apikey: publishableKey
        }
      }
    );

  const text =
    await response.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch {
    data = null;
  }

  const rowCount =
    Array.isArray(data)
      ? data.length
      : null;

  const secure =
    visibility === "public_formats"
      ? response.ok && rowCount > 0 && data.every(row =>
          typeof row.edition_id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.edition_id) &&
          Array.isArray(row.race_formats)
        )
      : visibility === "public"
      ? response.ok
      : (
          response.status === 401 ||
          response.status === 403 ||
          (response.ok && rowCount === 0)
        );

  console.log(
    `${secure ? "PASS" : "FAIL"} ${name}: HTTP ${response.status}, visible rows ${rowCount ?? "n/a"}`
  );

  if (!secure) {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("\nAnonymous live-access audit passed.");
