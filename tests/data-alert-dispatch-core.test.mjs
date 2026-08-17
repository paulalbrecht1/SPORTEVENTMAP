import assert from "node:assert/strict";
import {
  buildWebhookPayload,
  clipText
} from "../supabase/functions/_shared/data-alert-dispatch-core.mjs";

const notification = {
  claim_token: "00000000-0000-0000-0000-000000000001",
  kind: "critical",
  status: "critical",
  title: "Kritischer Datenqualitätsalarm",
  captured_at: "2026-08-12T06:16:19.000Z",
  snapshot_id: 7,
  metrics: {
    catalog_rows: 498,
    expected_catalog_rows: 498,
    fresh_editions: 315,
    current_editions: 498,
    freshness_percent: 63.25,
    overdue_sources: 0,
    recent_failures: 0,
    open_critical_alerts: 36
  },
  signals: { catalog: "healthy", freshness: "warning", technical: "critical" },
  open_alerts: [
    { alert_code: "source_repeated_failures", severity: "critical", alert_count: 36 }
  ]
};

const generic = buildWebhookPayload(notification, {
  format: "generic",
  dashboardUrl: "https://sporteventmap.com/#admin"
});
assert.equal(generic.schema_version, 1);
assert.equal(generic.product, "SportEventMap");
assert.equal(generic.kind, "critical");
assert.equal(generic.metrics.catalog_rows, 498);
assert.match(generic.summary, /63,25 %/);
assert.match(generic.summary, /source_repeated_failures/);

const slack = buildWebhookPayload(notification, { format: "slack" });
assert.match(slack.text, /Kritischer Datenqualitätsalarm/);
assert.ok(slack.blocks.length >= 2);
assert.equal(slack.blocks[0].type, "header");

const recovery = buildWebhookPayload({ ...notification, kind: "recovery" });
assert.equal(recovery.kind, "recovery");
const slackRecovery = buildWebhookPayload(
  { ...notification, kind: "recovery" },
  { format: "slack" }
);
assert.match(slackRecovery.text, /RECOVERY/);
assert.match(slackRecovery.text, /Entwarnung/);
assert.match(slackRecovery.blocks[0].text.text, /Quellenmonitor wieder stabil/);
const slackRecoveryTest = buildWebhookPayload(
  { ...notification, kind: "recovery", status: "test" },
  { format: "slack" }
);
assert.match(slackRecoveryTest.text, /RECOVERY-TEST/);
assert.match(slackRecoveryTest.text, /kein Produktionsalarm geschlossen/);
assert.equal(clipText("x".repeat(20), 10).length, 10);
assert.ok(clipText("x".repeat(20), 10).endsWith("…"));

console.log("Data alert payloads verified: generic, Slack, recovery and clipping.");
