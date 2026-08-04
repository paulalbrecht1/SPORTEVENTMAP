import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAutomationPolicy } from "../supabase/functions/_shared/stage-four/policy-engine.mjs";
import { calculateReliabilityMetric } from "../supabase/functions/_shared/stage-four/reliability.mjs";
import { prepareDiscoveryCandidate } from "../supabase/functions/_shared/stage-four/discovery.mjs";
import { findDuplicateMatches, normalizeDiscoveryName, scoreDuplicateCandidate } from "../supabase/functions/_shared/stage-four/duplicate-detector.mjs";
import { canQueueGeocoding, geocodingCacheKey, validateGeocodingResult } from "../supabase/functions/_shared/stage-four/geocoding.mjs";
import { COUNTRY_CONFIG, getCountryConfig, isCoordinateInsideCountry, normalizeCountryCode } from "../supabase/functions/_shared/stage-four/country-config.mjs";
import { calculateDataQualityScore } from "../supabase/functions/_shared/stage-four/quality-score.mjs";
import { planBulkOperation } from "../supabase/functions/_shared/stage-four/bulk-actions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const safeDry = evaluateAutomationPolicy({
  settings: { enabled: true, dryRun: true, phase: "technical" },
  action: "unchanged_official_verification", officialSource: true, confidence: 1
});
assert.equal(safeDry.decision, "auto_apply");
assert.equal(safeDry.effectiveDecision, "review");
assert.equal(safeDry.simulated, true);

const safeLive = evaluateAutomationPolicy({
  settings: { enabled: true, dryRun: false, phase: "technical" },
  action: "technical_reachability", officialSource: true, confidence: 0.99
});
assert.equal(safeLive.effectiveDecision, "auto_apply");

for (const proposal of [
  { field_name: "start_date", change_type: "updated_value", confidence: 1 },
  { field_name: "edition_status", change_type: "possible_cancellation", confidence: 1 },
  { field_name: "city", change_type: "location_change", confidence: 1 },
  { field_name: "edition_year", change_type: "new_edition", confidence: 1 }
]) {
  assert.equal(evaluateAutomationPolicy({ settings: { enabled: true, dryRun: false, phase: "expansion" }, proposal }).effectiveDecision, "review");
}
assert.equal(evaluateAutomationPolicy({ settings: { enabled: true }, proposal: { field_name: "registration_status", locked_field: true } }).decision, "block");

const trustedRegistration = evaluateAutomationPolicy({
  settings: { enabled: true, dryRun: false, phase: "trusted_content" }, country: "DE", officialSource: true,
  proposal: { field_name: "registration_status", change_type: "registration_change", confidence: 0.99 },
  reliability: { score: 0.97, reviewedCount: 80, errorRate: 0.01 }
});
assert.equal(trustedRegistration.decision, "auto_apply");
assert.equal(evaluateAutomationPolicy({
  fieldName: "registration_status",
  sourceTier: "official_event_website",
  confidenceScore: 0.98,
  reliabilityScore: 0.97,
  extractorVersion: "registration-v1",
  country: "AT",
  rolloutPhase: "content_low_risk",
  automationEnabled: true,
  dryRun: false
}).effectiveDecision, "block");

const reliable = calculateReliabilityMetric(Array.from({ length: 200 }, (_, index) => ({
  proposal_status: index < 198 ? "accepted" : "edited_and_accepted", confidence: 0.99
})));
assert.equal(reliable.eligibleForAutomation, true);
assert.ok(reliable.score >= 0.92);
const unreliable = calculateReliabilityMetric(Array.from({ length: 60 }, (_, index) => ({
  proposal_status: index < 25 ? "accepted" : "rejected", confidence: 0.7,
  field_name: "start_date", change_type: index % 10 === 0 ? "possible_cancellation" : "updated_value"
})));
assert.equal(unreliable.eligibleForAutomation, false);

const existing = [{ id: 7, event_name: "Zürich Marathon", city: "Zürich", country: "CH", official_url: "https://zuerichmarathon.ch", start_date: "2027-04-18", latitude: 47.3769, longitude: 8.5417 }];
const discovery = prepareDiscoveryCandidate({
  name: "Zürich Marathon 2027", date: "18.04.2027", city: "Zürich", country: "Schweiz",
  sport: "Straßenlauf", official_url: "https://zuerichmarathon.ch", distances: "Marathon, Halbmarathon"
}, { method: "official_federation_calendar", sourceUrl: "https://verband.example/kalender", officialSource: true }, existing);
assert.equal(discovery.candidate.country, "CH");
assert.equal(discovery.candidate.sport, "running");
assert.equal(discovery.publishable, false);
assert.equal(discovery.rollout.reason, "country_pilot_disabled");
assert.equal(discovery.possible_event_id, 7);
assert.ok(["probable_match", "confirmed_duplicate"].includes(discovery.match_status));

assert.equal(normalizeDiscoveryName("2027 Zürich Marathon powered by Sponsor"), "zurich marathon");
const confirmed = scoreDuplicateCandidate({
  name: "Zürich Marathon 2027", city: "Zürich", country: "CH", official_url: "https://zuerichmarathon.ch", start_date: "2027-04-18", latitude: 47.377, longitude: 8.542
}, existing[0]);
assert.equal(confirmed.classification, "confirmed_duplicate");
assert.equal(findDuplicateMatches({ name: "Völlig anderes Rennen", city: "Bern", country: "CH" }, existing).length, 0);

assert.equal(normalizeCountryCode("Österreich"), "AT");
assert.equal(normalizeCountryCode("Suisse"), "CH");
assert.equal(getCountryConfig("Svizzera").currency, "CHF");
assert.deepEqual(COUNTRY_CONFIG.CH.languages, ["de", "fr", "it"]);
assert.equal(isCoordinateInsideCountry("DE", 52.52, 13.405), true);
assert.equal(isCoordinateInsideCountry("CH", 48.13, 11.58), false);

const geoSuccess = validateGeocodingResult({ country: "DE" }, { country_code: "DE", latitude: 52.52, longitude: 13.405, confidence: 0.98 });
assert.equal(geoSuccess.valid, true);
assert.equal(geoSuccess.decision, "eligible_for_reviewed_apply");
const wrongCountry = validateGeocodingResult({ country: "CH" }, { country_code: "DE", latitude: 52.52, longitude: 13.405, confidence: 0.99 });
assert.equal(wrongCountry.valid, false);
assert.ok(wrongCountry.warnings.includes("country_mismatch"));
assert.equal(geocodingCacheKey({ street: "  Bahnhofstraße 1 ", postal_code: "8001", city: "Zürich", country: "CH" }), "bahnhofstrasse 1|8001|zurich|ch");
assert.equal(canQueueGeocoding({ today: 100 }, { dailyLimit: 100 }).allowed, false);
assert.equal(canQueueGeocoding({ today: 1, lastMinute: 1, queued: 2 }, {}).allowed, true);

const quality = calculateDataQualityScore({
  verifiedActiveRate: 0.9, officialUrlRate: 1, coordinateRate: 1, futureDateRate: 0.9,
  nextCheckRate: 1, imageRate: 0.8, registrationUrlRate: 0.9, distanceRate: 0.9, sourceRate: 1,
  criticalIssueRate: 0, warningRate: 0.02, duplicateRate: 0.01
});
assert.ok(quality.score > 85);
assert.equal(quality.factors.length, 9);

const bulk = planBulkOperation("retry_selected_sources", ["a", "b", "a"], { dryRun: true });
assert.equal(bulk.affectedCount, 2);
assert.equal(bulk.confirmationRequired, true);
assert.equal(bulk.transactional, true);
assert.throws(() => planBulkOperation("delete_everything", ["a"]), /unsupported_bulk_action/);
assert.throws(() => planBulkOperation("retry_selected_sources", Array.from({ length: 101 }, (_, i) => i)), /bulk_item_limit_exceeded/);

const migration = read("supabase/migrations/20260816_stage_four_preparation.sql");
for (const marker of [
  "dry_run boolean not null default true", "automation_enabled boolean not null default false",
  "global_emergency_stop boolean not null default false", "high_risk_review_only",
  "source_reliability_metrics", "discovery_candidates", "duplicate_candidates", "geocoding_cache",
  "stage_four_usage_daily", "data_quality_snapshots", "prepare_stage_four_bulk_operation",
  "execute_stage_four_bulk_operation", "refresh_stage_four_monitoring", "stage_four_audit_log", "security_invoker=true",
  "enable row level security", "revoke all on function public.evaluate_change_proposal_automation"
]) assert.ok(migration.includes(marker), `missing migration marker: ${marker}`);
assert.match(migration, /live bulk execution is not enabled/i);
assert.match(migration, /candidate batch exceeds configured limit/i);

const worker = read("supabase/functions/event-source-check/index.ts");
assert.match(worker, /source-monitor-4\.0\.0-preparation/);
assert.match(worker, /simulate_stage_four_for_crawl/);
assert.match(worker, /record_stage_four_crawl_automation/);

const admin = read("js/supabase.js");
const css = read("css/source-monitor.css");
assert.match(admin, /Data Operations Center/);
assert.match(admin, /Stage 4 · Phase A/);
assert.match(admin, /stage_four_country_dashboard/);
assert.match(admin, /prepare_stage_four_bulk_operation/);
assert.match(css, /\.stage-four-center/);
assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.stage-four-grid/);

console.log("Stage 4 preparation: policy, reliability, discovery, duplicate, geocoding, DACH, quality, limits, bulk, RLS and audit guards verified.");
