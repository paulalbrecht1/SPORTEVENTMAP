const PHASES = { observation: 0, technical: 1, trusted_content: 2, austria_pilot: 3, switzerland_pilot: 4, expansion: 5 };
const HIGH_RISK_FIELDS = new Set(["start_date", "end_date", "city", "region", "country", "address", "latitude", "longitude", "sport", "official_url", "edition_year"]);
const HIGH_RISK_TYPES = new Set(["possible_cancellation", "possible_postponement", "location_change", "source_change", "new_edition", "removed_value"]);
const TECHNICAL_ACTIONS = new Set(["technical_reachability", "last_crawled_at", "unchanged_official_verification", "schedule_next_check", "reset_failure_counter", "complete_past_edition"]);

function phaseAtLeast(current, required) {
  return (PHASES[current] ?? -1) >= (PHASES[required] ?? 99);
}

export function evaluateAutomationPolicy(input = {}) {
  const proposal = input.proposal || {};
  const settings = { dryRun: true, phase: "observation", enabled: false, ...(input.settings || {}) };
  const reliability = input.reliability || {};
  const reasons = [];
  const conflicts = proposal.validation_warnings || proposal.conflicts || [];
  const country = String(input.country || proposal.country || "").toUpperCase();

  if (!settings.enabled) return { decision: "block", effectiveDecision: "block", policyCode: "automation_disabled", reasons: ["global_automation_disabled"], dryRun: settings.dryRun };
  if (input.countryPaused || input.sourcePaused || input.domainPaused) return { decision: "block", effectiveDecision: "block", policyCode: "scope_paused", reasons: ["country_source_or_domain_paused"], dryRun: settings.dryRun };
  if (proposal.locked_field || input.manualOverride) return { decision: "block", effectiveDecision: "block", policyCode: "manual_control", reasons: ["field_locked_or_manual_override"], dryRun: settings.dryRun };
  if (conflicts.length) return { decision: "review", effectiveDecision: "review", policyCode: "conflicting_evidence", reasons: ["conflicting_sources_or_validation_warnings"], dryRun: settings.dryRun };
  if (HIGH_RISK_FIELDS.has(proposal.field_name) || HIGH_RISK_TYPES.has(proposal.change_type)) {
    return { decision: "review", effectiveDecision: "review", policyCode: "high_risk_review_only", reasons: ["high_risk_field_or_change_type"], dryRun: settings.dryRun };
  }

  const action = input.action || proposal.action;
  if (TECHNICAL_ACTIONS.has(action)) {
    if (!phaseAtLeast(settings.phase, "technical")) reasons.push("phase_b_not_enabled");
    else if (!input.officialSource) reasons.push("source_not_official");
    else if (Number(proposal.confidence ?? input.confidence ?? 0) < 0.98) reasons.push("confidence_below_0_98");
    else {
      const decision = "auto_apply";
      return { decision, effectiveDecision: settings.dryRun ? "review" : decision, policyCode: "safe_technical_action", reasons: ["phase_b", "official_source", "confidence_at_least_0_98"], dryRun: settings.dryRun, simulated: settings.dryRun };
    }
    return { decision: "review", effectiveDecision: "review", policyCode: "technical_guard_not_met", reasons, dryRun: settings.dryRun };
  }

  if (proposal.field_name === "registration_status") {
    if (!phaseAtLeast(settings.phase, "trusted_content")) reasons.push("phase_c_not_enabled");
    if (country !== "DE") reasons.push("country_not_de");
    if (!input.officialSource) reasons.push("source_not_official");
    if (Number(proposal.confidence || 0) < 0.985) reasons.push("confidence_below_0_985");
    if (Number(reliability.score || 0) < 0.95) reasons.push("reliability_below_0_95");
    if (Number(reliability.reviewedCount || reliability.reviewed_count || 0) < 50) reasons.push("insufficient_review_sample");
    if (Number(reliability.errorRate || reliability.error_rate || 1) > 0.02) reasons.push("error_rate_above_0_02");
    if (!reasons.length) {
      const decision = "auto_apply";
      return { decision, effectiveDecision: settings.dryRun ? "review" : decision, policyCode: "trusted_registration_status", reasons: ["phase_c", "germany", "trusted_official_source"], dryRun: settings.dryRun, simulated: settings.dryRun };
    }
    return { decision: "review", effectiveDecision: "review", policyCode: "registration_guard_not_met", reasons, dryRun: settings.dryRun };
  }

  return { decision: "review", effectiveDecision: "review", policyCode: "default_review", reasons: ["no_auto_approval_policy"], dryRun: settings.dryRun };
}

export { HIGH_RISK_FIELDS, HIGH_RISK_TYPES, TECHNICAL_ACTIONS };
