const fs = require("node:fs");
const path = require("node:path");
const {
  buildCatalogQualityReport, assertFreshnessGuardCoverage,
  isFreshDiscoveryRow, isCompleteDiscoveryRow
} = require("../js/catalog-quality-report.js");
const { parseCatalogDate } = require("../js/event-catalog-loader.js");
const { assertPublicCatalogSnapshot } = require("./catalog-snapshot-safety.js");

const DAY = 86400000;
const HORIZONS = Object.freeze([7, 14, 30]);
const text = value => String(value ?? "").trim();
const germany = row => ["de", "deutschland", "germany"].includes(text(row.country).toLowerCase());
const dateAt = value => Date.parse(text(value));

function numericPolicy(policy, key, { percentage = false } = {}) {
  const value = policy?.[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      (percentage ? value > 100 : !Number.isSafeInteger(value))) {
    throw new Error(`Invalid release policy: ${key}.`);
  }
  return value;
}

function requirements(policy) {
  const minimum = kind => Math.max(numericPolicy(policy, `minimum_${kind}_rows`),
    Math.floor(numericPolicy(policy, `reference_${kind}_rows`) *
      (1 - numericPolicy(policy, `maximum_${kind}_drop_percent`, { percentage: true }) / 100)));
  return {
    discovery_rows: minimum("discovery"), archive_rows: minimum("archive"),
    freshness_percent: numericPolicy(policy, "minimum_freshness_rate", { percentage: true }),
    completeness_percent: numericPolicy(policy, "minimum_completeness_rate", { percentage: true })
  };
}

function demand({ discovery, fresh, complete, archive }, target) {
  const finalDiscovery = Math.max(discovery, target.discovery_rows);
  const additions = Math.max(0, target.discovery_rows - discovery);
  // Divide last: 400 * 0.55 can round above 220 before Math.ceil.
  // Rates shown rounded in the existing report are never used as counts.
  const freshRequired = Math.ceil(finalDiscovery * target.freshness_percent / 100);
  const completeRequired = Math.ceil(finalDiscovery * target.completeness_percent / 100);
  return {
    discovery_rows: discovery, archive_rows: archive, valid_full_attestations: fresh, complete_rows: complete,
    target_discovery_rows: finalDiscovery,
    net_new_discovery_required: additions,
    full_attestations_required: freshRequired,
    additional_full_attestations_required: Math.max(0, freshRequired - fresh),
    existing_reviews_if_all_additions_fresh: Math.max(0, freshRequired - fresh - additions),
    complete_rows_required: completeRequired,
    existing_completions_if_all_additions_complete: Math.max(0, completeRequired - complete - additions),
    net_new_archive_required: Math.max(0, target.archive_rows - archive)
  };
}

function endDate(row) {
  const start = parseCatalogDate(row.date);
  const explicitEnd = text(row.end_date) ? parseCatalogDate(row.end_date) : null;
  if (text(row.end_date) && explicitEnd === null) throw new Error(`Invalid edition end date: ${row.edition_id}.`);
  if (start === null) return null;
  const end = explicitEnd ?? start;
  if (end === null || end < start) throw new Error(`Invalid edition end date: ${row.edition_id}.`);
  return end;
}

function identity(row) {
  return { event_id: Number(row.event_id), edition_id: row.edition_id,
    edition_year: row.edition_year, edition_slug: row.edition_slug,
    event_name: text(row.event_name), country: text(row.country), city: text(row.city),
    date: row.date ?? null, end_date: row.end_date ?? null, source_url: text(row.source_url),
    next_check: row.next_check ?? null };
}

/** Read-only planning from one exact, authoritative measurement; never an attestation. */
function buildP0CompletionPlan({ snapshot, policy, now, historicalReplay = false } = {}) {
  if (typeof historicalReplay !== "boolean") throw new TypeError("historicalReplay must be explicit boolean.");
  const measuredTime = dateAt(snapshot?.measured_at);
  const evaluationTime = historicalReplay ? measuredTime : new Date(now).getTime();
  if (!Number.isFinite(evaluationTime)) throw new TypeError("A valid current measurement time is required.");
  const target = requirements(policy);
  assertPublicCatalogSnapshot(snapshot, evaluationTime);
  // Canonical numeric IDs also reject 1 and "01" describing the same identity.
  if (new Set(snapshot.discovery.map(row => Number(row.event_id))).size !== snapshot.discovery.length) {
    throw new Error("Discovery contains duplicate event identities.");
  }
  const report = buildCatalogQualityReport({ snapshot, policy, now: new Date(evaluationTime) });
  if (!report.available) throw new Error(report.blockers.join("; "));
  const guard = assertFreshnessGuardCoverage(snapshot.discovery, snapshot.freshness_guard, evaluationTime);
  const today = Date.parse(new Date(measuredTime).toISOString().slice(0, 10));
  const rows = snapshot.discovery.map(row => ({ row, end: endDate(row),
    complete: isCompleteDiscoveryRow(row),
    fresh: isFreshDiscoveryRow(row, snapshot.measured_at, guard.decisions.get(text(row.edition_id))) }));
  const count = list => ({ discovery: list.length, fresh: list.filter(item => item.fresh).length,
    complete: list.filter(item => item.complete).length, archive: snapshot.archive.length });
  const currentCounts = count(rows);
  const exactQualityBlockers = [];
  const requiredCurrentFresh = Math.ceil(currentCounts.discovery * target.freshness_percent / 100);
  const requiredCurrentComplete = Math.ceil(currentCounts.discovery * target.completeness_percent / 100);
  if (currentCounts.fresh < requiredCurrentFresh) {
    exactQualityBlockers.push(`Vollnachweise (exakte Anzahl) ${currentCounts.fresh} / mindestens ${requiredCurrentFresh} für ${currentCounts.discovery} Discovery.`);
  }
  if (currentCounts.complete < requiredCurrentComplete) {
    exactQualityBlockers.push(`Vollständigkeit (exakte Anzahl) ${currentCounts.complete} / mindestens ${requiredCurrentComplete} für ${currentCounts.discovery} Discovery.`);
  }
  const reviewQueue = rows.filter(item => !item.fresh).map(item => ({
    ...identity(item.row), currently_complete: item.complete,
    full_attestation_required: true, eligibility_confirmed: false,
    days_until_end: item.end === null ? null : Math.round((item.end - today) / DAY),
    remains_dated_in_30_day_projection: item.end !== null && item.end >= today + 30 * DAY,
    action: item.complete ? "official_source_review_all_14_fields" : "correct_missing_facts_then_review_all_14_fields"
  })).sort((a, b) => Number(germany(b)) - Number(germany(a)) ||
    Number(b.currently_complete) - Number(a.currently_complete) ||
    Number(b.remains_dated_in_30_day_projection) - Number(a.remains_dated_in_30_day_projection) ||
    (a.days_until_end ?? Infinity) - (b.days_until_end ?? Infinity) || a.event_id - b.event_id)
    .map((row, index) => ({ rank: index + 1, ...row }));
  const projections = HORIZONS.map(days => {
    const at = measuredTime + days * DAY, day = today + days * DAY;
    const departed = rows.filter(item => item.end !== null && item.end < day);
    const surviving = rows.filter(item => item.end === null || item.end >= day);
    const expired = surviving.filter(item => item.fresh && dateAt(item.row.next_check) <= at);
    const projected = surviving.map(item => ({ ...item,
      fresh: item.fresh && dateAt(item.row.next_check) > at }));
    const departedByEvent = new Map(departed.map(item => [Number(item.row.event_id), item.row.edition_id]));
    const successors = new Map();
    for (const row of snapshot.archive) {
      const eventId = Number(row.event_id), predecessor = departedByEvent.get(eventId);
      if (!predecessor || row.edition_id === predecessor || row.discovery_status !== "active" ||
          !["active", "scheduled", "postponed"].includes(row.event_status)) continue;
      const end = endDate(row);
      if (end === null || end < day) continue;
      const ids = successors.get(eventId) || [];
      ids.push(row.edition_id); successors.set(eventId, ids);
    }
    const projectedDemand = demand(count(projected), target);
    const { discovery_rows, valid_full_attestations, net_new_discovery_required, ...remainingDemand } = projectedDemand;
    return { days, at: new Date(at).toISOString(), projection_only: true,
      projection_kind: "initial_discovery_cohort_retention",
      total_future_discovery_not_measured: true,
      net_addition_demand_classification: "upper_bound_if_no_published_successors_take_over",
      initial_cohort_remaining_rows: discovery_rows,
      retained_initial_cohort_attestations_upper_bound: valid_full_attestations,
      net_new_discovery_required_upper_bound_without_successor_takeover: net_new_discovery_required,
      published_successor_edition_ids_by_event: Object.fromEntries([...successors].sort((a, b) => a[0] - b[0])
        .map(([eventId, ids]) => [eventId, ids.sort()])),
      successor_freshness_not_measured: true,
      attestation_count_definition: "Upper bound from currently valid evidence after known next_check expiries; no future guard decision has been measured.",
      dated_departures: departed.length,
      departed_edition_ids: departed.map(item => item.row.edition_id).sort(),
      known_attestation_expiries_among_remaining: expired.length,
      expiring_edition_ids: expired.map(item => item.row.edition_id).sort(),
      unknown_date_rows: surviving.filter(item => item.end === null).length,
      ...remainingDemand };
  });
  return {
    schema_version: 1, planning_only: true, data_release_complete: false,
    measurement_mode: historicalReplay ? "replay_of_original_read_only_snapshot" : "current_read_only_snapshot",
    measured_at: snapshot.measured_at, evaluated_at: new Date(evaluationTime).toISOString(),
    definition: report.definition, requirements: target, current: demand(currentCounts, target),
    germany_discovery_rows: rows.filter(item => germany(item.row)).length,
    current_catalog_blockers: [...report.blockers, ...exactQualityBlockers],
    exact_current_quality_blockers: exactQualityBlockers,
    assumptions: [
      "Each net addition must create a distinct public Discovery event identity; another edition of the same identity is not an extra entry.",
      "The minimum existing-review scenario assumes every required addition has a complete valid full attestation at the target measurement.",
      "7/14/30-day projections describe retention of the initial Discovery cohort, not future total Discovery. Published successors are listed separately, require live selection/readback and have no measured freshness decision here.",
      "Projected net-addition demand is an upper bound assuming no published successor takes over. Other demand scenarios assume only the retained initial cohort plus required fresh, complete additions. Known attestations expire at next_check; surviving evidence is not a future freshness guarantee.",
      "Unknown dates remain in the release denominator and are not projected as departures. Sources, blockers and all 14 field values require a fresh live review before confirmation.",
      "No additions, reviews, attestations, publication or release are performed by this plan."
    ],
    projections,
    review_priority: "Germany, structural completeness, retention beyond 30 days, event date, event ID; urgent upcoming reviews are listed separately.",
    review_queue: reviewQueue,
    urgent_review_edition_ids: reviewQueue.filter(item => item.days_until_end !== null &&
      item.days_until_end >= 0 && item.days_until_end <= 7).map(item => item.edition_id),
    first_review_batch_edition_ids: reviewQueue.slice(0, 25).map(item => item.edition_id),
    reverification_queue: rows.filter(item => item.fresh && dateAt(item.row.next_check) <= measuredTime + 30 * DAY)
      .map(item => ({ ...identity(item.row), eligibility_confirmed: false,
        current_attestation_expires_at: item.row.next_check,
        action: "reload_live_context_and_repeat_official_source_review_before_expiry" }))
      .sort((a, b) => dateAt(a.next_check) - dateAt(b.next_check) || a.event_id - b.event_id)
  };
}

function parseArgs(args) {
  const options = { historicalReplay: false };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--at-snapshot-time") {
      if (options.historicalReplay) throw new Error("Duplicate --at-snapshot-time.");
      options.historicalReplay = true;
    } else if (flag === "--snapshot" || flag === "--out") {
      const key = flag === "--snapshot" ? "snapshot" : "out";
      if (options[key] || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing or duplicate ${flag}.`);
      options[key] = args[++index];
    } else throw new Error(`Unknown argument: ${flag}.`);
  }
  if (!options.snapshot) throw new Error("Usage: node tools/p0-completion-plan.js --snapshot <snapshot.json> [--at-snapshot-time] [--out <new exports report.json>]");
  return options;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function writePlan(file, content, root) {
  const scope = fs.realpathSync(path.join(root, "exports")), target = path.resolve(file);
  if (!inside(scope, target)) throw new Error("Completion plans must stay in private exports.");
  // Check the real existing ancestor before creating parents; linked paths cannot escape.
  let ancestor = path.dirname(target);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const realAncestor = fs.realpathSync(ancestor);
  if (realAncestor !== scope && !inside(scope, realAncestor)) throw new Error("Completion plan path escapes private exports.");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!inside(scope, path.join(fs.realpathSync(path.dirname(target)), path.basename(target)))) {
    throw new Error("Completion plan path escapes private exports.");
  }
  fs.writeFileSync(target, content, { encoding: "utf8", flag: "wx" });
}

function main(args = process.argv.slice(2)) {
  const options = parseArgs(args), root = path.resolve(__dirname, "..");
  const snapshot = JSON.parse(fs.readFileSync(options.snapshot, "utf8").replace(/^\uFEFF/, ""));
  const policy = JSON.parse(fs.readFileSync(path.join(root, "data/catalog-release-policy.json"), "utf8"));
  const plan = buildP0CompletionPlan({ snapshot, policy, now: new Date(), historicalReplay: options.historicalReplay });
  const output = `${JSON.stringify(plan, null, 2)}\n`;
  if (options.out) writePlan(options.out, output, root);
  else process.stdout.write(output);
  return plan;
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildP0CompletionPlan, parseArgs, writePlan, main };
