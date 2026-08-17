(function initializeDataFreshnessHealth(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.DataFreshnessHealth = api;
  }
})(
  typeof window !== "undefined" ? window : globalThis,
  function createDataFreshnessHealth() {
    const PUBLIC_EXCLUDED_EDITION_STATUSES = new Set([
      "cancelled",
      "inactive",
      "completed"
    ]);
    const REVIEW_STATUSES = new Set([
      "stale",
      "needs_review",
      "source_unreachable",
      "unverified"
    ]);
    const SOURCE_FAILURE_STATUSES = new Set([
      "failed",
      "source_unreachable",
      "unreachable",
      "dead_letter"
    ]);
    const SOURCE_OVERDUE_GRACE_MS = 30 * 60 * 1000;

    function toTime(value) {
      if (!value) return null;
      const time = Date.parse(value);
      return Number.isFinite(time) ? time : null;
    }

    function uniqueRows(rows) {
      const seen = new Set();
      return (Array.isArray(rows) ? rows : []).filter((row, index) => {
        const key = row && row.id != null
          ? `id:${String(row.id)}`
          : `index:${index}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function isCurrentPublicEdition(edition, today) {
      if (!edition || edition.publication_status !== "published") return false;
      if (edition.discovery_status !== "active") return false;
      if (PUBLIC_EXCLUDED_EDITION_STATUSES.has(edition.edition_status)) {
        return false;
      }

      const finalDate = String(
        edition.end_date || edition.start_date || ""
      ).slice(0, 10);

      return !finalDate || finalDate >= today;
    }

    function isOpenAlert(alert) {
      return alert &&
        alert.alert_status === "open" &&
        ["critical", "error"].includes(alert.severity);
    }

    function selectCurrentPublicEditions(editions, today) {
      const candidates = uniqueRows(editions)
        .filter(edition => isCurrentPublicEdition(edition, today))
        .sort((left, right) => {
          const leftDate = String(left.start_date || "9999-12-31");
          const rightDate = String(right.start_date || "9999-12-31");
          return leftDate.localeCompare(rightDate) ||
            Number(left.edition_year || 9999) -
              Number(right.edition_year || 9999);
        });
      const selected = new Map();

      candidates.forEach(edition => {
        const key = edition.event_id != null
          ? `event:${String(edition.event_id)}`
          : `edition:${String(edition.id)}`;
        if (!selected.has(key)) selected.set(key, edition);
      });

      return [...selected.values()];
    }

    function isActiveSourceFailure(source) {
      return Boolean(
        source &&
        source.is_active === true &&
        (
          Number(source.consecutive_failures || 0) > 0 ||
          SOURCE_FAILURE_STATUSES.has(source.crawl_status) ||
          SOURCE_FAILURE_STATUSES.has(source.last_change_status)
        )
      );
    }

    function jobActivityTime(job) {
      return toTime(
        job && (
          job.completed_at ||
          job.last_processed_at ||
          job.updated_at ||
          job.created_at ||
          job.scheduled_at
        )
      ) || 0;
    }

    function selectActiveDeadLetterJobs(jobs, sources) {
      const sourceById = new Map(
        uniqueRows(sources)
          .filter(source => source && source.id != null)
          .map(source => [String(source.id), source])
      );
      const latestJobBySource = new Map();
      const jobsWithoutSource = [];

      uniqueRows(jobs).forEach(job => {
        if (!job || job.source_id == null) {
          if (job?.status === "dead_letter") jobsWithoutSource.push(job);
          return;
        }

        const key = String(job.source_id);
        const previous = latestJobBySource.get(key);
        if (!previous || jobActivityTime(job) > jobActivityTime(previous)) {
          latestJobBySource.set(key, job);
        }
      });

      const active = [...latestJobBySource.entries()]
        .filter(([, job]) => job.status === "dead_letter")
        .filter(([sourceId]) => {
          const source = sourceById.get(sourceId);
          // Missing source state is treated conservatively as an active problem.
          return !source || isActiveSourceFailure(source);
        })
        .map(([, job]) => job);

      return active.concat(jobsWithoutSource);
    }

    function buildFreshnessSummary({
      catalogDiagnostics = {},
      editions = [],
      sources = [],
      jobs = [],
      proposals = [],
      alerts = [],
      now = new Date()
    } = {}) {
      const nowDate = now instanceof Date ? now : new Date(now);
      if (Number.isNaN(nowDate.getTime())) {
        throw new TypeError("A valid freshness reference time is required.");
      }

      const nowTime = nowDate.getTime();
      const nowIso = nowDate.toISOString();
      const today = nowIso.slice(0, 10);
      // Mirrors public_event_discovery: one earliest active edition per event.
      const currentEditions = selectCurrentPublicEditions(editions, today);

      const overdueEditions = currentEditions.filter(edition => {
        const nextCheck = toTime(edition.next_check_at);
        return nextCheck !== null && nextCheck <= nowTime;
      });
      const unscheduledEditions = currentEditions.filter(edition =>
        toTime(edition.next_check_at) === null
      );
      const needsReviewEditions = currentEditions.filter(edition =>
        edition.needs_review === true ||
        REVIEW_STATUSES.has(edition.verification_status)
      );
      const freshEditions = currentEditions.filter(edition => {
        const lastVerified = toTime(edition.last_verified_at);
        const nextCheck = toTime(edition.next_check_at);
        return edition.verification_status === "verified" &&
          edition.needs_review !== true &&
          lastVerified !== null &&
          nextCheck !== null &&
          nextCheck > nowTime;
      });

      const activeSources = uniqueRows(sources)
        .filter(source => source && source.is_active === true);
      const dueSources = activeSources.filter(source => {
        const nextFetch = toTime(source.next_fetch_at);
        return nextFetch !== null && nextFetch <= nowTime;
      });
      const overdueSources = activeSources.filter(source => {
        const nextFetch = toTime(source.next_fetch_at);
        return nextFetch !== null &&
          nextFetch <= nowTime - SOURCE_OVERDUE_GRACE_MS;
      });
      const unscheduledSources = activeSources.filter(source =>
        toTime(source.next_fetch_at) === null
      );
      const failedSources = activeSources.filter(isActiveSourceFailure);
      const deadLetterJobs = selectActiveDeadLetterJobs(jobs, sources);
      const pendingProposals = uniqueRows(proposals)
        .filter(proposal => proposal && proposal.proposal_status === "pending");
      const criticalAlerts = uniqueRows(alerts).filter(isOpenAlert);

      const source = String(catalogDiagnostics.source || "unknown");
      const rowCount = Number(catalogDiagnostics.rowCount);
      const expectedRowCount = Number(catalogDiagnostics.expectedRowCount);
      const hasCounts = Number.isInteger(rowCount) && rowCount >= 0 &&
        Number.isInteger(expectedRowCount) && expectedRowCount >= 0;
      const catalogComplete = source === "supabase" &&
        hasCounts &&
        rowCount > 0 &&
        rowCount === expectedRowCount;
      const catalogFallback = source === "csv-fallback";
      const catalogIncomplete = source === "supabase" &&
        hasCounts &&
        rowCount !== expectedRowCount;
      const freshnessRate = currentEditions.length
        ? Math.round(freshEditions.length / currentEditions.length * 1000) / 10
        : 0;

      const critical = catalogFallback ||
        catalogIncomplete ||
        criticalAlerts.length > 0 ||
        deadLetterJobs.length > 0 ||
        (catalogComplete && currentEditions.length === 0);
      const attention = !catalogComplete ||
        overdueEditions.length > 0 ||
        unscheduledEditions.length > 0 ||
        needsReviewEditions.length > 0 ||
        failedSources.length > 0 ||
        overdueSources.length > 0 ||
        unscheduledSources.length > 0 ||
        pendingProposals.length > 0;

      let nextAction = "healthy";
      if (catalogFallback || catalogIncomplete) nextAction = "catalog";
      else if (criticalAlerts.length) nextAction = "alerts";
      else if (
        deadLetterJobs.length ||
        failedSources.length ||
        overdueSources.length
      ) nextAction = "sources";
      else if (overdueEditions.length || unscheduledEditions.length) nextAction = "editions";
      else if (pendingProposals.length) nextAction = "proposals";

      return {
        status: critical ? "critical" : attention ? "attention" : "healthy",
        nextAction,
        catalog: {
          source,
          rowCount: hasCounts ? rowCount : null,
          expectedRowCount: hasCounts ? expectedRowCount : null,
          complete: catalogComplete,
          fallback: catalogFallback,
          incomplete: catalogIncomplete
        },
        editions: {
          current: currentEditions.length,
          fresh: freshEditions.length,
          freshnessRate,
          overdue: overdueEditions.length,
          unscheduled: unscheduledEditions.length,
          needsReview: needsReviewEditions.length
        },
        sources: {
          active: activeSources.length,
          due: dueSources.length,
          overdue: overdueSources.length,
          unscheduled: unscheduledSources.length,
          failed: failedSources.length,
          deadLetters: deadLetterJobs.length
        },
        review: {
          pendingProposals: pendingProposals.length,
          criticalAlerts: criticalAlerts.length
        },
        calculatedAt: nowIso
      };
    }

    return Object.freeze({
      buildFreshnessSummary,
      isActiveSourceFailure,
      isCurrentPublicEdition,
      selectActiveDeadLetterJobs,
      selectCurrentPublicEditions
    });
  }
);
