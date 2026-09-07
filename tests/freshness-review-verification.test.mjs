import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read("supabase/migrations/20260904080319_freshness_review_verification.sql");
const admin = read("js/supabase.js");
const page = read("index.html");

for (const fragment of [
  "create or replace function public.verify_freshness_review_editions",
  "create or replace function public.get_public_event_freshness_guard",
  "create or replace view public.admin_freshness_attestation_inbox",
  "last_verified_source_id",
  "event_audit_log_freshness_attestation_idx",
  "private.try_parse_bigint(feedback.event_id)",
  "grant execute on function private.try_parse_bigint(text) to authenticated",
  "private.try_parse_timestamptz(verification.new_value->>'last_verified_at')",
  "private.try_parse_timestamptz(verification.new_value->>'next_check_at')",
  "security definer",
  "private.is_admin()",
  "a maximum of 25 freshness reviews can be verified at once",
  "structured evidence must be a JSON object keyed by edition id",
  "jsonb_typeof(p_evidence) is distinct from 'object'",
  "checked_at is null",
  "not isfinite(checked_at)",
  "evidence_confidence is null",
  "jsonb_typeof(evidence_record->'uncertain_fields') is distinct from 'array'",
  "coalesce(review_record.last_change_status, '') not in ('unchanged', 'first_seen')",
  "source inspection timestamp is outside the accepted 24-hour window",
  "freshness verification confidence must be between 0.80 and 1",
  "all central fields must be explicitly confirmed",
  "official source differs from stored event data",
  "'address', review_record.address",
  "'latitude', review_record.latitude",
  "'longitude', review_record.longitude",
  "'description', review_record.description",
  "length(btrim(coalesce(review_record.description, ''))) < 80",
  "private.try_parse_coordinate(review_record.latitude) not between -90 and 90",
  "private.try_parse_coordinate(review_record.longitude) not between -180 and 180",
  "review_record.source_type is distinct from 'official_event_website'",
  "job.status in ('queued', 'processing', 'retry_scheduled')",
  "proposal.proposal_status = 'pending'",
  "issue.severity in ('error', 'critical')",
  "alert.severity in ('error', 'critical')",
  "feedback.category = 'incorrect_event_data'",
  "order by source.id",
  "for update of source",
  "order by event.id",
  "for update of event",
  "order by edition.event_id, edition.id",
  "for update of edition",
  "__freshness_verification__",
  "'freshness_review_queue'",
  "automatic_fact_changes",
  "create or replace function private.invalidate_current_edition_freshness",
  "create trigger event_change_proposals_invalidate_freshness",
  "create trigger source_review_tasks_invalidate_freshness",
  "create trigger validation_issues_invalidate_freshness",
  "create trigger data_workflow_alerts_invalidate_freshness",
  "create trigger user_feedback_invalidate_freshness",
  "create trigger event_sources_invalidate_freshness",
  "review_event_change_proposal_without_parent_lock",
  "do $proposal_lock_hardening$",
  "create or replace function public.review_event_change_proposal",
  "proposal parent event not found",
  "before delete or update of event_id",
  "create trigger events_invalidate_freshness_on_fact_change",
  "create trigger event_editions_invalidate_freshness_on_fact_change",
  "set verification_status = 'needs_review'",
  "revoke all on function public.verify_freshness_review_editions(uuid[], text, jsonb)",
  "grant execute on function public.verify_freshness_review_editions(uuid[], text, jsonb)"
]) assert.ok(migration.includes(fragment), `Freshness verification migration missing ${fragment}`);

const proposalWrapperStart = migration.indexOf("create or replace function public.review_event_change_proposal");
const proposalWrapperEnd = migration.indexOf("revoke all on function public.review_event_change_proposal", proposalWrapperStart);
const proposalWrapper = migration.slice(proposalWrapperStart, proposalWrapperEnd);
assert.match(proposalWrapper, /security definer/i);
assert.match(proposalWrapper, /set search_path = pg_catalog, public, private/i);
assert.ok(proposalWrapper.indexOf("private.is_admin()") < proposalWrapper.indexOf("for update of proposal"),
  "Proposal review authorization must happen before locks or writes.");
assert.ok(proposalWrapper.indexOf("for update of event") < proposalWrapper.indexOf("return private.review_event_change_proposal_without_parent_lock"),
  "Proposal review must lock the parent event before the legacy implementation can mutate an edition.");
assert.match(migration, /create or replace function public\.apply_event_change_proposal[\s\S]*select public\.review_event_change_proposal/,
  "The convenience RPC must point at the hardened proposal reviewer.");

assert.ok(migration.trimEnd().endsWith("commit;"), "Freshness migration must commit when deployed.");

const rpcStart = migration.indexOf("create or replace function public.verify_freshness_review_editions");
const rpcEnd = migration.indexOf("revoke all on function public.verify_freshness_review_editions", rpcStart);
const rpc = migration.slice(rpcStart, rpcEnd);
assert.match(rpc, /security definer/i);
assert.match(rpc, /set search_path = pg_catalog, public, private/i);
assert.ok(rpc.indexOf("private.is_admin()") < rpc.indexOf("for update of source"),
  "Admin authorization must happen before verifier locks or writes.");
assert.doesNotMatch(rpc, /update public\.events\b/i,
  "Freshness verification must never mutate event master data.");
assert.doesNotMatch(rpc, /update public\.event_sources\b/i,
  "Freshness verification must never mutate source facts.");

const update = rpc.match(/update public\.event_editions\s+set([\s\S]*?)where id = review_record\.edition_id;/i);
assert.ok(update, "Freshness verification must update one locked edition.");
for (const factualField of [
  "start_date", "end_date", "registration_url", "registration_status", "edition_status",
  "publication_status", "discovery_status", "race_formats", "legacy_distance", "source_url"
]) {
  assert.doesNotMatch(update[1], new RegExp(`\\b${factualField}\\s*=`, "i"),
    `Freshness verification must not mutate factual field ${factualField}.`);
}

for (const fragment of [
  "getCurrentDataOpsEdition",
  "getFreshnessReviewForEdition",
  "getEligibleFreshnessReviewSource",
  "getFreshnessVerificationStoredValues",
  "hasCompleteFreshnessVerificationShape",
  "canVerifyFreshnessReview",
  "freshness_review",
  "Edition feldweise bestaetigen",
  "verify_freshness_review_editions",
  "p_edition_ids",
  "source_id: sourceId",
  "event_editions\").update",
  "In Review Inbox pruefen",
  "data-item-type=\"freshness_review\"",
  "data-lifecycle-item-id",
  "error?.message || \"Lifecycle-Aktion fehlgeschlagen.\"",
  "[\"queued\", \"processing\", \"retry_scheduled\"].includes(job.status)",
  "source.source_url !== metadata.source_url",
  "source.source_url !== edition.source_url",
  "event.status !== \"approved\"",
  "edition.discovery_status === \"active\"",
  "address: event?.address ?? null",
  "description: event?.description ?? null",
  "sourceMonitorActiveJobs",
  "dataOpsFreshnessBlockingFeedback",
  "loadFreshnessBlockingFeedback",
  "hasFreshnessBlockingFeedback",
  "hasFreshnessOpenReviewConflict",
  "matchesFreshnessBlockerScope",
  "admin_freshness_attestation_inbox",
  "stableTieBreakFields.forEach",
  "null, [\"item_type\", \"item_id\"]"
]) assert.ok(admin.includes(fragment), `Admin freshness workflow missing ${fragment}`);

const gateStart = admin.indexOf("function canVerifyFreshnessReview");
const gateEnd = admin.indexOf("function getReviewInboxCategory", gateStart);
const gate = admin.slice(gateStart, gateEnd);
assert.doesNotMatch(gate, /metadata\.source_reachable/,
  "Freshness UI must not trust the aggregate source reachability rollup.");

const attestationViewStart = migration.indexOf("create or replace view public.admin_freshness_attestation_inbox");
const attestationViewEnd = migration.indexOf("revoke all on public.admin_freshness_attestation_inbox", attestationViewStart);
const attestationView = migration.slice(attestationViewStart, attestationViewEnd);
for (const blocker of [
  "from public.source_review_tasks task",
  "from public.event_change_proposals proposal",
  "from public.validation_issues issue",
  "from public.data_workflow_alerts alert",
  "from public.user_feedback feedback"
]) assert.ok(attestationView.includes(blocker), `Attestation inbox must suppress ${blocker}.`);

const currentEditionStart = admin.indexOf("function getCurrentDataOpsEdition");
const currentEditionEnd = admin.indexOf("function getFreshnessReviewForEdition", currentEditionStart);
const currentEdition = admin.slice(currentEditionStart, currentEditionEnd);
assert.match(currentEdition, /publication_status === "published"/);
assert.match(currentEdition, /discovery_status === "active"/);
assert.match(currentEdition, /String\(left\.start_date \|\| "9999-12-31"\)/);

function extractFunction(name) {
  const start = admin.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = admin.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < admin.length; index += 1) {
    if (admin[index] === "{") depth += 1;
    if (admin[index] === "}") depth -= 1;
    if (depth === 0) return admin.slice(start, index + 1);
  }
  throw new Error(`Could not extract function ${name}`);
}

const uiRuntime = {
  dataOpsEvents: [{
    id: 7,
    status: "approved",
    publication_status: "published",
    event_status: "active",
    address: "Teststrasse 1",
    latitude: "52.52",
    longitude: "13.405",
    description: "A sufficiently complete event description for the freshness evidence fixture and its release gate."
  }],
  dataOpsEditions: [
    {
      id: "draft-2999",
      event_id: 7,
      edition_year: 2999,
      start_date: "2999-10-01",
      end_date: "2999-10-01",
      publication_status: "draft",
      discovery_status: "inactive",
      edition_status: "draft"
    },
    {
      id: "current-2998",
      event_id: 7,
      edition_year: 2998,
      start_date: "2998-10-01",
      end_date: "2998-10-01",
      publication_status: "published",
      discovery_status: "active",
      edition_status: "scheduled",
      source_url: "https://example.com/current"
    }
  ],
  editionLifecycleInbox: [{
    item_type: "freshness_review",
    item_id: "current-2998",
    edition_id: "current-2998"
  }],
  dataOpsSources: [
    {
      id: "selected-source",
      event_id: 7,
      edition_id: "current-2998",
      is_active: true,
      source_type: "official_event_website",
      source_url: "https://example.com/current",
      crawl_status: "not_modified",
      consecutive_failures: 0,
      last_fetched_at: "2026-09-04T08:00:00.000Z",
      last_change_status: null
    },
    {
      id: "other-healthy-source",
      event_id: 7,
      edition_id: "current-2998",
      is_active: true,
      source_type: "official_event_website",
      source_url: "https://example.com/other",
      crawl_status: "success",
      consecutive_failures: 0,
      last_fetched_at: "2026-09-04T08:00:00.000Z",
      last_change_status: "unchanged"
    }
  ],
  sourceMonitorActiveJobs: [],
  sourceMonitorReviews: [],
  dataOpsProposals: [],
  dataOpsIssues: [],
  dataOpsAlerts: [],
  dataOpsFreshnessBlockingFeedback: []
};
vm.createContext(uiRuntime);
vm.runInContext([
  "getDataOpsEditions",
  "getCurrentDataOpsEdition",
  "getFreshnessReviewForEdition",
  "normalizeDataOpsEventId",
  "hasFreshnessBlockingFeedback",
  "matchesFreshnessBlockerScope",
  "hasFreshnessOpenReviewConflict",
  "getEligibleFreshnessReviewSource",
  "getFreshnessVerificationStoredValues",
  "hasCompleteFreshnessVerificationShape",
  "canVerifyFreshnessReview"
].map(extractFunction).join("\n"), uiRuntime);

assert.equal(uiRuntime.getCurrentDataOpsEdition(7).id, "current-2998",
  "A newer draft must never become the current operational edition.");
assert.equal(uiRuntime.getFreshnessReviewForEdition("current-2998").item_id, "current-2998");

const freshnessRow = {
  item_type: "freshness_review",
  event_id: 7,
  edition_id: "current-2998",
  metadata: {
    source_id: "selected-source",
    source_url: "https://example.com/current",
    source_reachable: true,
    affected_fields: [],
    stored_values: {
      event_name: "Fixture",
      edition_year: 2998,
      date: "2998-10-01",
      city: "Berlin",
      country: "Germany",
      sport: "Running",
      distances: [{ label: "10 km", distance_km: 10 }],
      registration_status: null,
      official_event_page: "https://example.com/current",
      registration_link: "https://example.com/register"
    }
  }
};
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), false,
  "A healthy aggregate source must not mask an unstable selected source.");
uiRuntime.dataOpsSources[0].last_change_status = "unchanged";
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), true);
uiRuntime.dataOpsEditions[1].source_url = "https://example.com/different-edition-source";
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), false,
  "The selected official source must match the stored edition source URL.");
uiRuntime.dataOpsEditions[1].source_url = "https://example.com/current";
uiRuntime.dataOpsEvents[0].status = "pending";
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), false,
  "Only the current edition of an approved, published, active event may be verified.");
uiRuntime.dataOpsEvents[0].status = "approved";
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), true);
uiRuntime.dataOpsFreshnessBlockingFeedback.push({
  event_id: "0007",
  category: "incorrect_event_data",
  status: "reviewed"
});
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), false,
  "Admin-moderated incorrect-data feedback must disable freshness confirmation, including numeric aliases.");
uiRuntime.dataOpsFreshnessBlockingFeedback[0].status = "resolved";
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), true);
uiRuntime.sourceMonitorReviews.push({
  source_id: "selected-source",
  event_id: 7,
  edition_id: "historical-edition",
  status: "open"
});
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), false,
  "A source-scoped blocker must disable confirmation even when it names a historical sibling edition.");
uiRuntime.sourceMonitorReviews.length = 0;
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), true);
uiRuntime.sourceMonitorActiveJobs.push({ source_id: "selected-source", status: "processing" });
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), false,
  "An active crawl must disable freshness confirmation.");
uiRuntime.sourceMonitorActiveJobs.length = 0;
const completeDescription = uiRuntime.dataOpsEvents[0].description;
uiRuntime.dataOpsEvents[0].description = "Too short";
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), false,
  "Descriptions below the server-side 80 character floor must stay in review.");
uiRuntime.dataOpsEvents[0].description = completeDescription;
uiRuntime.dataOpsEvents[0].address = null;
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), false,
  "A missing address must stay in review.");
uiRuntime.dataOpsEvents[0].address = "Teststrasse 1";
uiRuntime.dataOpsEvents[0].latitude = "95";
assert.equal(uiRuntime.canVerifyFreshnessReview(freshnessRow), false,
  "Out-of-range coordinates must stay in review.");
uiRuntime.dataOpsEvents[0].latitude = "52.52";
assert.deepEqual(
  JSON.parse(JSON.stringify(uiRuntime.getFreshnessVerificationStoredValues(freshnessRow))),
  {
    event_name: "Fixture",
    edition_year: 2998,
    date: "2998-10-01",
    city: "Berlin",
    country: "Germany",
    sport: "Running",
    distances: [{ label: "10 km", distance_km: 10 }],
    registration_status: null,
    official_event_page: "https://example.com/current",
    registration_link: "https://example.com/register",
    address: "Teststrasse 1",
    latitude: "52.52",
    longitude: "13.405",
    description: "A sufficiently complete event description for the freshness evidence fixture and its release gate."
  }
);

assert.doesNotMatch(admin, /data-dataops-action="verify"/,
  "Unsafe event-master verification button must remain removed.");
assert.doesNotMatch(admin, /if \(action === "verify"\) patch/,
  "Unsafe event-master verification handler must remain removed.");
assert.doesNotMatch(admin, /from\("events"\)\.update\(patch\)/,
  "Generic event-master update path must not return.");
assert.ok(page.includes("20260904-p0-freshness-v126"),
  "Admin runtime cache key was not advanced for the freshness workflow.");

console.log("Evidence-backed edition freshness review and safe admin routing verified.");
