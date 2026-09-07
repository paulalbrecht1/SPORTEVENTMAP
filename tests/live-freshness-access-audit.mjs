import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = fs.readFileSync(path.join(root, "js", "config.js"), "utf8");

const supabaseUrl = config.match(/supabaseUrl\s*:\s*"([^"]+)"/)?.[1];
const publishableKey = config.match(/supabasePublishableKey\s*:\s*"([^"]+)"/)?.[1];

assert.ok(supabaseUrl, "Public Supabase URL not found in js/config.js.");
assert.ok(publishableKey, "Supabase publishable key not found in js/config.js.");

const baseUrl = supabaseUrl.replace(/\/+$/, "");

async function restRequest(pathname, options = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: publishableKey,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { response, data };
}

function report(label, response) {
  console.log(`PASS ${label}: HTTP ${response.status}`);
}

const discovery = await restRequest(
  "public_event_discovery?select=edition_id&order=event_id.asc,edition_id.asc&limit=2"
);
assert.equal(discovery.response.ok, true, "Public discovery lookup failed.");
assert.ok(Array.isArray(discovery.data) && discovery.data.length > 0, "No Discovery edition available for the live guard check.");
const editionIds = discovery.data.map(row => row.edition_id);

for (const editionId of editionIds) {
  assert.match(
    editionId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Discovery returned an invalid edition id."
  );
}

const editionId = editionIds[0];
report("public Discovery lookup", discovery.response);

const guard = await restRequest("rpc/get_public_event_freshness_guard", {
  method: "POST",
  body: { p_edition_ids: editionIds }
});
assert.equal(guard.response.ok, true, "Anonymous freshness guard request failed.");
assert.equal(guard.data?.schema_version, 1, "Unexpected freshness guard schema version.");
assert.equal(guard.data?.requested_count, editionIds.length, "Freshness guard did not evaluate the exact request set.");
assert.deepEqual(
  Object.keys(guard.data?.decisions || {}).sort(),
  [...editionIds].sort(),
  "Freshness guard returned a partial or expanded decision set."
);

for (const requestedEditionId of editionIds) {
  assert.equal(typeof guard.data.decisions[requestedEditionId], "boolean", "Discovery decision is not boolean.");
}

assert.ok(Number.isFinite(Date.parse(guard.data?.evaluated_at)), "Freshness guard timestamp is invalid.");
report("anonymous boolean-only freshness guard", guard.response);

const unknownEditionId = "00000000-0000-4000-8000-000000000000";
const unknownGuard = await restRequest("rpc/get_public_event_freshness_guard", {
  method: "POST",
  body: { p_edition_ids: [unknownEditionId] }
});
assert.equal(unknownGuard.response.ok, true, "Unknown-edition guard request failed.");
assert.notEqual(unknownGuard.data?.decisions?.[unknownEditionId], true, "Unknown editions must never be fresh.");
report("unknown-edition fail-closed guard", unknownGuard.response);

const verifier = await restRequest("rpc/verify_freshness_review_editions", {
  method: "POST",
  body: {
    p_edition_ids: [editionId],
    p_notes: "Anonymous access denial smoke test.",
    p_evidence: {}
  }
});
assert.ok(
  verifier.response.status === 401 || verifier.response.status === 403,
  `Anonymous verifier access was not denied at the permission boundary (HTTP ${verifier.response.status}).`
);
report("anonymous verifier denial", verifier.response);

const inbox = await restRequest("admin_freshness_attestation_inbox?select=item_id&limit=1");
assert.ok(
  inbox.response.status === 401 || inbox.response.status === 403,
  `Anonymous freshness inbox access was not denied (HTTP ${inbox.response.status}).`
);
report("anonymous admin-inbox denial", inbox.response);

console.log("\nLive freshness access audit passed without writes.");
