import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildFreshnessSummary,
  isCurrentPublicEdition,
  selectActiveDeadLetterJobs
} = require("../js/data-freshness-health.js");

const now = new Date("2026-08-10T12:00:00.000Z");

const currentEdition = {
  id: "edition-current",
  event_id: "event-current",
  publication_status: "published",
  discovery_status: "active",
  edition_status: "scheduled",
  start_date: "2026-10-01",
  verification_status: "verified",
  last_verified_at: "2026-08-09T08:00:00.000Z",
  next_check_at: "2026-08-17T08:00:00.000Z",
  needs_review: false
};

assert.equal(isCurrentPublicEdition(currentEdition, "2026-08-10"), true);
assert.equal(isCurrentPublicEdition({
  ...currentEdition,
  id: "edition-past",
  start_date: "2026-08-09"
}, "2026-08-10"), false);
assert.equal(isCurrentPublicEdition({
  ...currentEdition,
  id: "edition-draft",
  publication_status: "draft"
}, "2026-08-10"), false);

const healthy = buildFreshnessSummary({
  now,
  catalogDiagnostics: {
    source: "supabase",
    rowCount: 1255,
    expectedRowCount: 1255
  },
  editions: [
    currentEdition,
    {
      ...currentEdition,
      id: "edition-second",
      event_id: "event-second",
      start_date: "2026-11-01"
    },
    {
      ...currentEdition,
      id: "edition-successor",
      event_id: "event-current",
      start_date: "2027-10-01"
    },
    { ...currentEdition }
  ],
  sources: [{
    id: "source-1",
    is_active: true,
    next_fetch_at: "2026-08-11T12:00:00.000Z",
    consecutive_failures: 0,
    crawl_status: "ready"
  }],
  jobs: [],
  proposals: [],
  alerts: []
});

assert.equal(healthy.status, "healthy");
assert.equal(healthy.catalog.complete, true);
assert.equal(healthy.editions.current, 2);
assert.equal(healthy.editions.fresh, 2);
assert.equal(healthy.editions.freshnessRate, 100);
assert.equal(healthy.nextAction, "healthy");

const recoveredDeadLetterHistory = [
  {
    id: "job-dead-history",
    source_id: "source-1",
    status: "dead_letter",
    completed_at: "2026-08-08T10:00:00.000Z",
    created_at: "2026-08-08T09:00:00.000Z"
  },
  {
    id: "job-recovered",
    source_id: "source-1",
    status: "completed",
    completed_at: "2026-08-09T10:00:00.000Z",
    created_at: "2026-08-09T09:00:00.000Z"
  }
];

assert.equal(selectActiveDeadLetterJobs(recoveredDeadLetterHistory, [{
  id: "source-1",
  is_active: true,
  crawl_status: "success",
  consecutive_failures: 0
}]).length, 0);

const recoveredHistorySummary = buildFreshnessSummary({
  now,
  catalogDiagnostics: {
    source: "supabase",
    rowCount: 1255,
    expectedRowCount: 1255
  },
  editions: [currentEdition],
  sources: [{
    id: "source-1",
    is_active: true,
    next_fetch_at: "2026-08-11T12:00:00.000Z",
    consecutive_failures: 0,
    crawl_status: "success"
  }],
  jobs: recoveredDeadLetterHistory
});

assert.equal(recoveredHistorySummary.status, "healthy");
assert.equal(recoveredHistorySummary.sources.deadLetters, 0);

assert.equal(selectActiveDeadLetterJobs([{
  id: "job-current-dead",
  source_id: "source-failed",
  status: "dead_letter",
  completed_at: "2026-08-10T10:00:00.000Z"
}], [{
  id: "source-failed",
  is_active: true,
  crawl_status: "unreachable",
  consecutive_failures: 5
}]).length, 1);

assert.equal(selectActiveDeadLetterJobs([{
  id: "job-inactive-dead",
  source_id: "source-inactive",
  status: "dead_letter",
  completed_at: "2026-08-10T10:00:00.000Z"
}], [{
  id: "source-inactive",
  is_active: false,
  crawl_status: "inactive",
  consecutive_failures: 5
}]).length, 0);

const critical = buildFreshnessSummary({
  now,
  catalogDiagnostics: {
    source: "csv-fallback",
    rowCount: 520,
    expectedRowCount: 520
  },
  editions: [
    {
      ...currentEdition,
      id: "edition-overdue",
      event_id: "event-overdue",
      next_check_at: "2026-08-09T12:00:00.000Z"
    },
    {
      ...currentEdition,
      id: "edition-unscheduled",
      event_id: "event-unscheduled",
      next_check_at: null
    },
    {
      ...currentEdition,
      id: "edition-review",
      event_id: "event-review",
      verification_status: "needs_review",
      needs_review: true
    },
    {
      ...currentEdition,
      id: "edition-completed",
      event_id: "event-completed",
      start_date: "2026-07-01",
      edition_status: "completed"
    }
  ],
  sources: [
    {
      id: "source-failed",
      is_active: true,
      next_fetch_at: "2026-08-10T10:00:00.000Z",
      consecutive_failures: 2,
      crawl_status: "failed"
    },
    {
      id: "source-unscheduled",
      is_active: true,
      next_fetch_at: null,
      consecutive_failures: 0,
      crawl_status: "ready"
    }
  ],
  jobs: [{ id: "job-dead", status: "dead_letter" }],
  proposals: [{ id: "proposal-open", proposal_status: "pending" }],
  alerts: [{
    id: "alert-critical",
    alert_status: "open",
    severity: "critical"
  }]
});

assert.equal(critical.status, "critical");
assert.equal(critical.nextAction, "catalog");
assert.equal(critical.catalog.fallback, true);
assert.equal(critical.editions.current, 3);
assert.equal(critical.editions.overdue, 1);
assert.equal(critical.editions.unscheduled, 1);
assert.equal(critical.editions.needsReview, 1);
assert.equal(critical.sources.due, 1);
assert.equal(critical.sources.overdue, 1);
assert.equal(critical.sources.unscheduled, 1);
assert.equal(critical.sources.failed, 1);
assert.equal(critical.sources.deadLetters, 1);
assert.equal(critical.review.pendingProposals, 1);
assert.equal(critical.review.criticalAlerts, 1);

assert.throws(
  () => buildFreshnessSummary({ now: "not-a-date" }),
  /valid freshness reference time/
);

console.log(
  "Data freshness health verified: catalog completeness, active editions, " +
  "verification schedules, source failures and review priorities."
);
