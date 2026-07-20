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

const anonKey =
  config.match(/supabaseAnonKey\s*:\s*"([^"]+)"/)?.[1];

if (!supabaseUrl || !anonKey) {
  throw new Error(
    "Public Supabase URL/anon key not found in js/config.js."
  );
}

const checks = [
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
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`
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
    visibility === "public"
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
