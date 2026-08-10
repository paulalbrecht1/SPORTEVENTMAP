export const PHASE_A_REVIEW_RESULTS = Object.freeze([
  "correct", "partially_correct", "incorrect", "outdated", "duplicate",
  "source_unsuitable", "unclear", "manual_review_required"
]);

export const GOLDEN_CASE_TYPES = Object.freeze([
  "unchanged_event", "registration_opened", "registration_closed", "sold_out", "waitlist",
  "url_changed", "unreachable_page", "temporary_server_error", "date_changed", "location_changed",
  "cancelled", "postponed", "new_edition", "duplicate", "similar_event_name", "sponsor_name_changed",
  "misleading_content", "outdated_website", "different_registration_platform", "multiple_events_same_domain"
]);

export const PHASE_A_HIGH_RISK_ACTIONS = Object.freeze([
  "cancel_event", "postpone_event", "change_start_date", "change_location", "change_domain",
  "create_edition", "delete_event", "merge_duplicate"
]);

function canonicalDomain(value) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "");
}

export function validatePilotSource(profile = {}, eventSource = null) {
  const reasons = [];
  if (profile.country_code !== "DE") reasons.push("country_not_germany");
  if (!profile.source_key || !profile.source_name) reasons.push("identity_missing");
  if (!/^https:\/\//i.test(profile.source_url || "")) reasons.push("https_url_required");
  let hostname = "";
  try { hostname = canonicalDomain(new URL(profile.source_url).hostname); } catch { reasons.push("source_url_invalid"); }
  if (hostname && hostname !== canonicalDomain(profile.domain)) reasons.push("profile_domain_mismatch");
  if (profile.pilot_status === "pilot_observation" && !eventSource) reasons.push("event_source_binding_required");
  if (eventSource) {
    if (canonicalDomain(eventSource.source_host) !== canonicalDomain(profile.domain)) reasons.push("event_source_domain_mismatch");
    if (eventSource.country_code !== "DE") reasons.push("event_country_not_germany");
    if (!eventSource.is_active) reasons.push("event_source_inactive");
  }
  return { valid: reasons.length === 0, reasons };
}

export function observationIdempotencyKey({ pilotSourceId, contentHash = "", requestFingerprint = "", fieldName = "__source__", normalizedValue = null }) {
  return [pilotSourceId, contentHash, requestFingerprint, fieldName, JSON.stringify(normalizedValue)].join(":");
}

export function evaluateObservationGate({ settings = {}, country = {}, pilot = {}, eventSource = {}, scopeControls = [], context = {} }) {
  const reasons = [];
  if (settings.dry_run !== true || settings.automation_enabled !== false) reasons.push("phase_a_safety_configuration_invalid");
  if (settings.global_emergency_stop) reasons.push("global_emergency_stop");
  if (!settings.observation_enabled) reasons.push("global_observation_stop");
  if (settings.observation_country_code !== "DE" || country.country_code !== "DE") reasons.push("country_not_germany");
  if (country.rollout_status !== "observation" || country.automation_enabled || country.geocoding_enabled) reasons.push("country_rollout_not_observation_safe");
  reasons.push(...validatePilotSource(pilot, eventSource).reasons);
  if (PHASE_A_HIGH_RISK_ACTIONS.includes(context.actionCode)) reasons.push("high_risk_review_only");
  if (context.fieldLocked) reasons.push("field_locked_or_manual_override");
  for (const control of scopeControls) {
    if (control.expired) continue;
    const matches = control.scope_type === "country" && control.scope_key === "DE"
      || control.scope_type === "domain" && canonicalDomain(control.scope_key) === canonicalDomain(pilot.domain)
      || control.scope_type === "source" && [pilot.id, eventSource.id].includes(control.scope_key)
      || control.scope_type === "source_type" && control.scope_key === pilot.source_type
      || control.scope_type === "field" && control.scope_key === context.fieldName
      || control.scope_type === "policy" && control.scope_key === context.policyCode
      || control.scope_type === "action" && control.scope_key === context.actionCode
      || control.scope_type === "parser_version" && control.scope_key === context.parserVersion;
    if (matches && (control.is_paused || control.emergency_stop)) reasons.push(`scope_${control.scope_type}_paused`);
  }
  return { allowed: reasons.length === 0, reasons: [...new Set(reasons)], decisionMode: "shadow", actuallyExecuted: false };
}

export function calculateObservationMetrics(observations = [], reviews = [], minimumSample = 30) {
  const reviewByObservation = new Map(reviews.map(review => [String(review.observation_id), review]));
  const joined = observations.map(observation => ({ ...observation, review: reviewByObservation.get(String(observation.id)) || null }));
  const proposals = joined.filter(item => item.proposal_id);
  const reviewed = proposals.filter(item => item.review);
  const correct = reviewed.filter(item => item.review.review_result === "correct").length;
  const partial = reviewed.filter(item => item.review.review_result === "partially_correct").length;
  const incorrect = reviewed.filter(item => item.review.review_result === "incorrect").length;
  const rate = numerator => joined.length ? numerator / joined.length : null;
  return {
    totalObservations: joined.length,
    unchangedObservations: joined.filter(item => item.change_status === "unchanged").length,
    changeProposals: proposals.length,
    reviewedSample: reviewed.length,
    correctProposals: correct,
    partiallyCorrectProposals: partial,
    incorrectProposals: incorrect,
    unreviewedProposals: proposals.filter(item => !item.review).length,
    precision: reviewed.length ? correct / reviewed.length : null,
    falsePositiveRate: reviewed.length ? incorrect / reviewed.length : null,
    manualReviewRate: proposals.length ? reviewed.length / proposals.length : null,
    conflictRate: rate(joined.filter(item => (item.conflicts || []).length).length),
    blockingRate: rate(joined.filter(item => item.blocked_reason).length),
    duplicateRate: rate(joined.filter(item => item.duplicate_match_level && item.duplicate_match_level !== "no_match").length),
    parserErrorRate: rate(joined.filter(item => (item.parsing_warnings || []).length).length),
    technicalReachability: rate(joined.filter(item => item.technically_reachable).length),
    averageConfidence: joined.length ? joined.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / joined.length : null,
    averageReliability: joined.length ? joined.reduce((sum, item) => sum + Number(item.source_reliability || 0), 0) / joined.length : null,
    sampleSufficient: reviewed.length >= minimumSample,
    sampleWarning: reviewed.length < minimumSample ? "insufficient_reviewed_sample" : null
  };
}

export function calculatePhaseBReadiness(metrics = {}, criterion = {}) {
  const blockers = [];
  if ((metrics.reviewedSample || 0) < (criterion.minimumReviewed || 150)) blockers.push("insufficient_reviewed_sample");
  if ((metrics.confirmedChangeCount || 0) < (criterion.minimumConfirmedChanges || 0)) blockers.push("insufficient_confirmed_changes");
  if (metrics.precision == null || metrics.precision < (criterion.minimumPrecision || 0.985)) blockers.push("precision_below_threshold");
  if (metrics.falsePositiveRate == null || metrics.falsePositiveRate > (criterion.maximumFalsePositiveRate ?? 0.015)) blockers.push("false_positive_rate_above_threshold");
  for (const guard of ["auditLogging", "idempotency", "killSwitches", "rlsClear"]) {
    if (criterion[guard] !== true) blockers.push(`${guard}_not_verified`);
  }
  return {
    theoreticallyReady: blockers.length === 0,
    blockers,
    phaseBActivated: false,
    decisionMode: "shadow"
  };
}
