import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = fs.readFileSync(path.join(root, "js/config.js"), "utf8");
const base = config.match(/supabaseUrl\s*:\s*"([^"]+)"/)?.[1];
const key = config.match(/supabasePublishableKey\s*:\s*"([^"]+)"/)?.[1];
assert.ok(base && key, "Public Supabase configuration missing.");

// All identifiers are nonexistent sentinels and every requested RPC must fail
// at the permission boundary. No existing proposal/event is submitted to review.
const absent = "00000000-0000-4000-8000-000000000000";
const checks = [
  ["private field controls", "event_field_controls?select=id&limit=1"],
  ["private extraction proposals", "event_change_proposals?select=id&limit=1"],
  ["worker schema capabilities", "rpc/get_source_monitor_runtime_capabilities", {}],
  ["extraction writer", "rpc/record_extraction_proposals", {
    p_source_id: absent, p_crawl_result_id: -1, p_proposals: [], p_worker_version: "anonymous-denial-audit"
  }],
  ["fact reviewer", "rpc/review_event_change_proposal", {
    p_proposal_id: absent, p_action: "accepted", p_review_notes: null,
    p_edited_value: null, p_rejection_reason: null
  }],
  ["field control writer", "rpc/set_event_field_control", {
    p_event_id: -1, p_edition_id: null, p_field_name: "city", p_manual_value: null,
    p_reason: "Anonymous denial audit", p_expires_at: null,
    p_is_locked: true, p_source_priority: 1
  }]
];

const results = await Promise.all(checks.map(async ([label, route, body]) => {
  const response = await fetch(`${base.replace(/\/+$/, "")}/rest/v1/${route}`, {
    method: body === undefined ? "GET" : "POST",
    signal: AbortSignal.timeout(20000),
    headers: { apikey: key, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  await response.arrayBuffer();
  assert.ok([401, 403].includes(response.status),
    `${label} was not denied at the permission boundary: HTTP ${response.status}`);
  return `PASS anonymous ${label} denied: HTTP ${response.status}`;
}));
results.forEach(line => console.log(line));
console.log("Source Monitor live permission audit passed; no application records written.");
