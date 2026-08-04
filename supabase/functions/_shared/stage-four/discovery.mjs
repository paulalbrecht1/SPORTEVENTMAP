import { cleanText, normalizeDistance, normalizeSport, normalizeUrl } from "../extractors/normalization.mjs";
import { normalizeDate } from "../extractors/date-extractor.mjs";
import { normalizeCountryCode, validateCountryPilot } from "./country-config.mjs";
import { findDuplicateMatches, normalizeDiscoveryName } from "./duplicate-detector.mjs";

export const DISCOVERY_METHODS = new Set(["official_federation_calendar", "organizer_calendar", "registration_platform", "timing_platform", "race_series", "structured_event_list", "sitemap"]);

export function normalizeDiscoveryCandidate(raw = {}, context = {}) {
  const name = cleanText(raw.name || raw.event_name);
  const country = normalizeCountryCode(raw.country || context.country);
  const sport = normalizeSport(raw.sport || raw.category);
  const startDate = normalizeDate(raw.start_date || raw.date, { defaultYear: raw.year });
  const distances = (Array.isArray(raw.distances) ? raw.distances : String(raw.distances || "").split(/[,;|]/))
    .map(normalizeDistance).filter(Boolean);
  const warnings = [];
  if (!name) warnings.push("missing_event_name");
  if (!country) warnings.push("unsupported_or_missing_country");
  if (!sport) warnings.push("unsupported_or_missing_sport");
  if (!startDate) warnings.push("missing_or_invalid_date");
  if (!DISCOVERY_METHODS.has(context.method)) warnings.push("unsupported_discovery_method");
  const officialUrl = normalizeUrl(raw.official_url || raw.url, context.sourceUrl);
  const registrationUrl = normalizeUrl(raw.registration_url, context.sourceUrl);
  let confidence = 0.25;
  if (name) confidence += 0.2;
  if (startDate) confidence += 0.15;
  if (country) confidence += 0.1;
  if (sport) confidence += 0.1;
  if (raw.city) confidence += 0.08;
  if (officialUrl) confidence += 0.08;
  if (context.officialSource) confidence += 0.08;
  confidence = Math.max(0, Math.min(1, Math.round((confidence - warnings.length * 0.04) * 1000) / 1000));
  return {
    name, normalized_name: normalizeDiscoveryName(name), start_date: startDate,
    city: cleanText(raw.city), region: cleanText(raw.region), country, sport,
    distances, official_url: officialUrl, registration_url: registrationUrl,
    source_page_url: normalizeUrl(context.sourceUrl), discovery_method: context.method,
    confidence, warnings, original: raw
  };
}

export function prepareDiscoveryCandidate(raw, context, existingEvents = []) {
  const candidate = normalizeDiscoveryCandidate(raw, context);
  const rollout = validateCountryPilot(candidate, context.rollouts);
  const matches = findDuplicateMatches(candidate, existingEvents);
  const topMatch = matches[0] || null;
  return {
    candidate, matches, rollout,
    match_status: topMatch?.classification || "no_match",
    possible_event_id: topMatch?.existing?.id || null,
    review_status: "pending",
    publishable: false
  };
}
