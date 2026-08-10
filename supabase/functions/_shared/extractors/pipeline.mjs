import { extractJsonLd } from "./json-ld-extractor.mjs";
import { extractMetadata } from "./metadata-extractor.mjs";
import { extractPlatformAdapter, PLATFORM_ADAPTERS } from "./platform-adapters.mjs";
import { extractKnownSelectors } from "./known-selectors-extractor.mjs";
import { extractGenericHtml } from "./generic-html-extractor.mjs";
import { nameSimilarity, valuesEqual, normalizeComparableText } from "./normalization.mjs";

export const EXTRACTION_VERSION = "event-extraction-v1";
export { PLATFORM_ADAPTERS };

const EVENT_FIELDS = new Set(["canonical_name", "sport", "country", "region", "city", "address", "latitude", "longitude", "event_status", "organizer_name", "description", "image"]);
const EDITION_FIELDS = new Set(["start_date", "end_date", "start_time", "registration_url", "registration_status", "edition_status", "price_min", "price_max", "currency", "participant_limit", "race_formats"]);
const METHOD_RANK = { json_ld: 6, metadata: 5, platform: 4, css_selector: 3, generic_html: 2, ai: 1 };
const HIGH_PRIORITY_FIELDS = new Set(["start_date", "end_date", "edition_status", "registration_status", "registration_url", "city", "country"]);

function methodRank(method) {
  const key = String(method || "").startsWith("platform:") ? "platform" : method;
  return METHOD_RANK[key] || 0;
}

function baselineValue(field, context) {
  const control = (context.fieldControls || []).find(item => item.field_name === field && (!item.lock_expires_at || item.lock_expires_at > new Date().toISOString()));
  if (control?.manual_value != null) return { value: control.manual_value, control };
  if (EVENT_FIELDS.has(field)) return { value: context.event?.[field] ?? null, control };
  return { value: context.edition?.[field] ?? null, control };
}

function sourceWeight(source = {}) {
  const type = String(source.source_type || "").toLowerCase();
  if (type === "official_event_website") return { delta: 0.08, reason: "official_event_website" };
  if (type === "official_registration_platform" || type === "official_registration" || type === "registration") return { delta: 0.05, reason: "official_registration_platform" };
  if (/third|aggregator|directory/.test(type)) return { delta: -0.12, reason: "third_party_source" };
  return { delta: 0, reason: null };
}

function scoreCandidate(candidate, group, context) {
  let score = Number(candidate.confidence || 0.5);
  const reasons = [...(candidate.reasons || [])];
  const source = sourceWeight(context.source);
  score += source.delta;
  if (source.reason) reasons.push(source.reason);
  if (group.length > 1 && group.every(item => JSON.stringify(item.normalizedValue) === JSON.stringify(candidate.normalizedValue))) {
    score += 0.06; reasons.push("confirmed_by_multiple_extractors");
  }
  const conflicts = group.filter(item => JSON.stringify(item.normalizedValue) !== JSON.stringify(candidate.normalizedValue));
  if (conflicts.length) { score -= Math.min(0.2, conflicts.length * 0.07); reasons.push("conflicting_extracted_values"); }
  if (candidate.field === "canonical_name" && context.event) {
    const similarity = nameSimilarity(candidate.normalizedValue, context.event.canonical_name || context.event.event_name);
    if (similarity >= 0.5) { score += 0.05; reasons.push("event_name_match"); }
    else { score -= 0.15; reasons.push("weak_event_name_match"); }
  }
  if (candidate.warnings?.includes("date_context_not_explicit")) score -= 0.12;
  if (context.pageEventCount > 1) { score -= 0.08; reasons.push("multiple_events_on_page"); }
  return { score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)), reasons: [...new Set(reasons)], conflicts };
}

function changeType(field, oldValue, newValue) {
  if (field === "edition_status" && newValue === "cancelled") return "possible_cancellation";
  if (field === "edition_status" && newValue === "postponed") return "possible_postponement";
  if (field === "registration_status" || field === "registration_url") return "registration_change";
  if (["city", "country", "region", "address", "latitude", "longitude"].includes(field)) return "location_change";
  if (oldValue == null || oldValue === "") return "new_value";
  if (newValue == null || newValue === "") return "removed_value";
  return "updated_value";
}

function proposalPriority(type, field, score, locked) {
  if (["possible_cancellation", "possible_postponement"].includes(type)) return "critical";
  if (type === "location_change" || type === "new_edition" || locked) return "high";
  if (HIGH_PRIORITY_FIELDS.has(field) || score >= 0.9) return "high";
  return score >= 0.7 ? "medium" : "low";
}

function alreadyHandled(field, normalizedValue, context) {
  const now = Date.now();
  return (context.previousProposals || []).some(proposal => {
    if (proposal.field_name !== field || JSON.stringify(proposal.normalized_value) !== JSON.stringify(normalizedValue)) return false;
    if (["pending", "accepted", "edited_and_accepted"].includes(proposal.proposal_status)) return true;
    return proposal.proposal_status === "rejected" && now - Date.parse(proposal.reviewed_at || proposal.created_at || 0) < 30 * 86400000;
  });
}

function selectCandidates(candidates) {
  const grouped = new Map();
  for (const candidate of candidates) {
    if (!candidate?.field || candidate.normalizedValue == null) continue;
    if (!grouped.has(candidate.field)) grouped.set(candidate.field, []);
    grouped.get(candidate.field).push(candidate);
  }
  return grouped;
}

function possibleNewEdition(selected, context, now) {
  const dateGroup = selected.get("start_date") || [];
  if (!dateGroup.length || !context.editions?.length) return null;
  const latest = [...context.editions].sort((a, b) => Number(b.edition_year) - Number(a.edition_year))[0];
  const candidate = [...dateGroup].sort((a, b) => methodRank(b.method) - methodRank(a.method) || b.confidence - a.confidence)[0];
  const year = Number(String(candidate.normalizedValue).slice(0, 4));
  const exists = context.editions.some(edition => Number(edition.edition_year) === year);
  const future = candidate.normalizedValue > now.toISOString().slice(0, 10);
  if (!latest || exists || !future || year <= Number(latest.edition_year)) return null;
  const eventNameMatch = !candidate.eventName || nameSimilarity(candidate.eventName, context.event?.canonical_name || context.event?.event_name) >= 0.35;
  if (!eventNameMatch) return null;
  const scored = scoreCandidate(candidate, dateGroup, context);
  return {
    entity_type: "event", field_name: "edition_year", old_value: latest.edition_year,
    proposed_value: { edition_year: year, start_date: candidate.normalizedValue }, normalized_value: year,
    proposed_changes: { edition_year: year, start_date: candidate.normalizedValue }, change_type: "new_edition",
    confidence: Math.max(0, Math.min(1, scored.score - 0.02)), confidence_reasons: [...scored.reasons, "future_year_without_existing_edition"],
    extraction_method: candidate.method, extractor_version: candidate.methodVersion,
    evidence: { raw_value: candidate.rawValue, context: candidate.context, alternatives: scored.conflicts.slice(0, 4).map(item => ({ value: item.rawValue, normalized: item.normalizedValue, method: item.method })) }, source_context: candidate.context,
    validation_warnings: [], priority: "high", locked_field: false
  };
}

export function extractEventChanges(content, options = {}) {
  const context = { ...options, source: options.source || {}, pageEventCount: 0 };
  const layers = [
    extractJsonLd(content, options),
    extractMetadata(content, options),
    extractPlatformAdapter(content, options),
    extractKnownSelectors(content, options),
    extractGenericHtml(content, { ...options, defaultYear: options.edition?.edition_year })
  ];
  context.pageEventCount = layers[0].pageEventCount || 0;
  const candidates = layers.flatMap(layer => layer.candidates || []);
  const selected = selectCandidates(candidates);
  const proposals = [];
  const newEdition = possibleNewEdition(selected, context, options.now || new Date());

  for (const [field, group] of selected) {
    if (!EVENT_FIELDS.has(field) && !EDITION_FIELDS.has(field)) continue;
    if (newEdition && ["start_date", "end_date"].includes(field)) continue;
    const ranked = [...group].sort((left, right) => methodRank(right.method) - methodRank(left.method) || Number(right.confidence) - Number(left.confidence));
    const winner = ranked[0];
    const baseline = baselineValue(field, context);
    if (valuesEqual(field, baseline.value, winner.normalizedValue) || alreadyHandled(field, winner.normalizedValue, context)) continue;
    const scored = scoreCandidate(winner, group, context);
    if (scored.score < 0.35) continue;
    const type = changeType(field, baseline.value, winner.normalizedValue);
    const locked = Boolean(baseline.control?.is_locked);
    const warnings = [...new Set([...(winner.warnings || []), ...(scored.conflicts.length ? ["conflicting_values"] : []), ...(locked ? ["field_locked_or_manual_override"] : [])])];
    proposals.push({
      entity_type: EVENT_FIELDS.has(field) ? "event" : "edition", field_name: field,
      old_value: baseline.value, proposed_value: winner.rawValue, normalized_value: winner.normalizedValue,
      proposed_changes: { [field]: winner.normalizedValue }, change_type: type,
      confidence: scored.score, confidence_reasons: scored.reasons,
      extraction_method: winner.method, extractor_version: winner.methodVersion,
      evidence: { raw_value: winner.rawValue, context: winner.context, alternatives: scored.conflicts.slice(0, 4).map(item => ({ value: item.rawValue, normalized: item.normalizedValue, method: item.method })) },
      source_context: winner.context, validation_warnings: warnings,
      priority: proposalPriority(type, field, scored.score, locked), locked_field: locked
    });
  }
  if (newEdition && !alreadyHandled("edition_year", newEdition.normalized_value, context)) proposals.push(newEdition);
  return {
    version: EXTRACTION_VERSION,
    proposals,
    candidates,
    diagnostics: layers.flatMap(layer => layer.diagnostics || []),
    adapters: layers[2].adapter ? [{ id: layers[2].adapter, version: layers[2].version }] : []
  };
}
