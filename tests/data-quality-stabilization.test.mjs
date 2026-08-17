import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read("supabase/migrations/20260817121601_data_quality_stabilization.sql");
const admin = read("js/supabase.js");

for (const marker of [
  "auto_publish_enabled = false",
  "auto_result_publish_enabled = false",
  "edition_lifecycle_publication_automation_disabled_check",
  "admin_current_event_quality_metrics",
  "freshness_rate",
  "complete_rate",
  "source_health_rate",
  "review_rate",
  "admin_source_failure_history",
  "retryable_now",
  "page_removed_or_changed",
  "robots_temporarily_unavailable",
  "content_or_parser",
  "create or replace view public.admin_review_inbox",
  "'P0'",
  "'P1'",
  "'P2'",
  "'P3'",
  "priority_score",
  "freshness_review",
  "current_german_discovery_event",
  "high_risk_new_edition",
  "content_verified",
  "review_required"
]) assert.ok(migration.includes(marker), `Data-quality migration is missing ${marker}`);

assert.match(migration, /with \(security_invoker = true\)/i);
assert.match(migration, /edition\.last_verified_at is null/i,
  "A missing successful verification timestamp must require review.");
assert.match(migration, /least\(99, greatest\(0, 120 - coalesce\(context\.start_date - current_date, 120\)\)\)/i,
  "Freshness urgency must not make a lower tier outrank the next tier.");
assert.doesNotMatch(migration, /berlin marathon|challenge roth|ironman frankfurt/i,
  "Queue priority must not hardcode individual events.");
assert.ok(admin.includes("metadata?.priority_score"));
assert.ok(admin.includes("metadata.review_tier"));
assert.ok(admin.includes("freshness_review: \"Freshness\""));
assert.ok(admin.includes("renderReviewPriorityContext"));

console.log("Data quality stabilization: safe automation, metrics, source classification and P0-P3 queue verified.");
