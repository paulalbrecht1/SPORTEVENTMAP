import { nameSimilarity, normalizeComparableText, normalizeUrl } from "../extractors/normalization.mjs";

const SPONSOR_SEGMENTS = /\b(?:powered by|presented by|präsentiert von|praesentiert von|title sponsor|hauptsponsor)\b.*$/i;

export function normalizeDiscoveryName(value) {
  return normalizeComparableText(String(value || "")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(SPONSOR_SEGMENTS, " ")
    .replace(/\b\d+(?:st|nd|rd|th|\.)?\s+(?:edition|auflage)\b/gi, " "));
}

function host(value) {
  try { return new URL(normalizeUrl(value)).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function dateDistanceDays(left, right) {
  const a = Date.parse(`${left || ""}T00:00:00Z`);
  const b = Date.parse(`${right || ""}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / 86400000 : null;
}

export function coordinateDistanceKm(left, right) {
  if (![left?.latitude, left?.longitude, right?.latitude, right?.longitude].every(value => Number.isFinite(Number(value)))) return null;
  const toRad = value => Number(value) * Math.PI / 180;
  const lat1 = toRad(left.latitude); const lat2 = toRad(right.latitude);
  const dLat = lat2 - lat1; const dLon = toRad(right.longitude) - toRad(left.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function scoreDuplicateCandidate(candidate, existing) {
  const factors = [];
  const normalizedCandidate = normalizeDiscoveryName(candidate?.name || candidate?.canonical_name);
  const normalizedExisting = normalizeDiscoveryName(existing?.name || existing?.canonical_name || existing?.event_name);
  const similarity = nameSimilarity(normalizedCandidate, normalizedExisting);
  let score = similarity * 0.42;
  factors.push({ factor: "name_similarity", value: similarity, contribution: similarity * 0.42 });

  const sameCountry = String(candidate?.country || "").toUpperCase() === String(existing?.country || "").toUpperCase();
  if (sameCountry) { score += 0.1; factors.push({ factor: "same_country", contribution: 0.1 }); }
  const sameCity = normalizeComparableText(candidate?.city) && normalizeComparableText(candidate?.city) === normalizeComparableText(existing?.city);
  if (sameCity) { score += 0.14; factors.push({ factor: "same_city", contribution: 0.14 }); }
  const domainMatch = host(candidate?.official_url) && host(candidate?.official_url) === host(existing?.official_url || existing?.event_url);
  if (domainMatch) { score += 0.13; factors.push({ factor: "official_domain_match", contribution: 0.13 }); }
  const registrationMatch = host(candidate?.registration_url) && host(candidate?.registration_url) === host(existing?.registration_url);
  if (registrationMatch) { score += 0.05; factors.push({ factor: "registration_platform_match", contribution: 0.05 }); }
  const days = dateDistanceDays(candidate?.start_date, existing?.start_date);
  if (days != null && days <= 2) { score += 0.09; factors.push({ factor: "date_within_two_days", contribution: 0.09 }); }
  const distanceKm = coordinateDistanceKm(candidate, existing);
  if (distanceKm != null && distanceKm <= 10) { score += 0.07; factors.push({ factor: "coordinates_within_10km", contribution: 0.07 }); }

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
  const exactIdentity = similarity >= 0.96 && sameCountry && (sameCity || (distanceKm != null && distanceKm <= 2)) && (domainMatch || (days != null && days === 0));
  const classification = exactIdentity && score >= 0.9 ? "confirmed_duplicate"
    : score >= 0.72 ? "probable_match"
    : score >= 0.42 ? "possible_match" : "no_match";
  return { score, classification, factors, normalizedCandidate, normalizedExisting };
}

export function findDuplicateMatches(candidate, existingEvents, limit = 5) {
  return (existingEvents || []).map(existing => ({ existing, ...scoreDuplicateCandidate(candidate, existing) }))
    .filter(match => match.classification !== "no_match")
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(20, limit)));
}
