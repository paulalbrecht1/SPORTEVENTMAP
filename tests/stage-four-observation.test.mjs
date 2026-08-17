import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateObservationMetrics,
  calculatePhaseBReadiness,
  evaluateObservationGate,
  GOLDEN_CASE_TYPES,
  observationIdempotencyKey,
  PHASE_A_HIGH_RISK_ACTIONS,
  validatePilotSource
} from "../supabase/functions/_shared/stage-four/observation-mode.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const profile = { id: "pilot-1", source_key: "official", source_name: "Official", country_code: "DE", domain: "example.de", source_url: "https://www.example.de/event", pilot_status: "pilot_observation", source_type: "official_event_website" };
const source = { id: "source-1", source_host: "www.example.de", country_code: "DE", is_active: true };
const settings = { dry_run: true, automation_enabled: false, observation_enabled: true, observation_country_code: "DE", global_emergency_stop: false };
const country = { country_code: "DE", rollout_status: "observation", automation_enabled: false, geocoding_enabled: false };

assert.deepEqual(validatePilotSource(profile, source), { valid: true, reasons: [] });
assert.equal(validatePilotSource({ ...profile, country_code: "AT" }, source).valid, false);
assert.equal(validatePilotSource({ ...profile, country_code: "CH" }, source).valid, false);
assert.equal(evaluateObservationGate({ settings, country, pilot: profile, eventSource: source }).allowed, true);
assert.ok(evaluateObservationGate({ settings: { ...settings, observation_enabled: false }, country, pilot: profile, eventSource: source }).reasons.includes("global_observation_stop"));
assert.ok(evaluateObservationGate({ settings, country, pilot: profile, eventSource: source, scopeControls: [{ scope_type: "parser_version", scope_key: "parser-v1", is_paused: true }], context: { parserVersion: "parser-v1" } }).reasons.includes("scope_parser_version_paused"));
assert.ok(evaluateObservationGate({ settings, country, pilot: profile, eventSource: source, context: { actionCode: "cancel_event" } }).reasons.includes("high_risk_review_only"));
assert.ok(evaluateObservationGate({ settings, country, pilot: profile, eventSource: source, context: { fieldLocked: true } }).reasons.includes("field_locked_or_manual_override"));
assert.ok(PHASE_A_HIGH_RISK_ACTIONS.includes("change_start_date"));

const keyInput = { pilotSourceId: "pilot", contentHash: "hash", requestFingerprint: "request", fieldName: "registration_status", normalizedValue: "open" };
assert.equal(observationIdempotencyKey(keyInput), observationIdempotencyKey(keyInput));
assert.notEqual(observationIdempotencyKey(keyInput), observationIdempotencyKey({ ...keyInput, normalizedValue: "closed" }));

const observations = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, proposal_id: index < 30 ? `p-${index}` : null, change_status: index < 10 ? "unchanged" : "changed", conflicts: [], parsing_warnings: [], technically_reachable: true, confidence: 0.95, source_reliability: 0.8, duplicate_match_level: "no_match", blocked_reason: null }));
const reviews = observations.slice(0, 35).map((item, index) => ({ observation_id: item.id, review_result: index < 29 ? "correct" : "incorrect" }));
const metrics = calculateObservationMetrics(observations, reviews, 30);
assert.equal(metrics.reviewedSample, 30);
assert.equal(metrics.sampleSufficient, true);
assert.equal(metrics.precision, 29 / 30);
assert.equal(calculateObservationMetrics(observations, reviews.slice(0, 10), 30).sampleWarning, "insufficient_reviewed_sample");
const ready = calculatePhaseBReadiness({ ...metrics, confirmedChangeCount: 75, precision: 0.995, falsePositiveRate: 0.005, reviewedSample: 200 }, { minimumReviewed: 150, minimumConfirmedChanges: 50, minimumPrecision: 0.99, maximumFalsePositiveRate: 0.01, auditLogging: true, idempotency: true, killSwitches: true, rlsClear: true });
assert.equal(ready.theoreticallyReady, true);
assert.equal(ready.phaseBActivated, false);
assert.ok(GOLDEN_CASE_TYPES.includes("misleading_content"));

const migration = read("supabase/migrations/20260818_stage_four_germany_observation.sql");
const calibrationMigration = read("supabase/migrations/20260819_stage_four_observation_calibration_guards.sql");
const monitoringMigration = read("supabase/migrations/20260820_stage_four_observation_operational_alerts.sql");
for (const marker of [
  "stage_four_phase_a_shadow_guard", "observation_enabled boolean not null default false", "stage_four_pilot_sources",
  "stage_four_observation_runs", "stage_four_observations", "stage_four_observation_reviews", "stage_four_golden_cases",
  "decision_mode text not null default 'shadow'", "actually_executed boolean not null default false",
  "record_stage_four_shadow_observations", "review_stage_four_observation", "refresh_stage_four_phase_b_readiness",
  "stage_four_observation_block_reason", "country_code char(2) not null default 'DE'", "enable row level security",
  "pilot_status='pilot_observation'", "public_event_changes", "phase_b_activated',false"
]) assert.ok(migration.includes(marker), `missing migration marker: ${marker}`);
assert.equal((migration.match(/'41000000-0000-4000-8000-0000000000/g) || []).length >= 12, true);
assert.ok(migration.includes("('AT','CH')"));
assert.match(calibrationMigration, /metric_basis','manually_reviewed_change_proposals/);
assert.match(calibrationMigration, /\('country','AT',true,true/);
assert.match(calibrationMigration, /\('country','CH',true,true/);
for (const signal of ["observation_reliability_drop", "observation_source_volume", "observation_html_structure_change", "observation_policy_version_change", "observation_cache_anomaly"]) assert.ok(monitoringMigration.includes(signal));

const worker = read("supabase/functions/event-source-check/index.ts");
assert.match(worker, /source-monitor-4\.1\.\d+-phase-a-shadow/);
assert.match(worker, /record_stage_four_shadow_observations/);
assert.match(worker, /public_event_changes: 0/);

console.log("Stage 4 German observation: pilot gates, shadow decisions, idempotency, metrics, readiness, golden cases and safety guards verified.");
