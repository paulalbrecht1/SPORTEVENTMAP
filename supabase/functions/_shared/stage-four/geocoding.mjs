import { normalizeComparableText } from "../extractors/normalization.mjs";
import { isCoordinateInsideCountry, normalizeCountryCode } from "./country-config.mjs";

export function geocodingCacheKey(address = {}) {
  return [address.street, address.postal_code, address.city, address.region, normalizeCountryCode(address.country)]
    .map(normalizeComparableText).filter(Boolean).join("|");
}

export function validateGeocodingResult(request, result) {
  const requestedCountry = normalizeCountryCode(request?.country);
  const resultCountry = normalizeCountryCode(result?.country_code || result?.country);
  const latitude = Number(result?.latitude ?? result?.lat);
  const longitude = Number(result?.longitude ?? result?.lon);
  const warnings = [];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) warnings.push("invalid_coordinates");
  if (!requestedCountry || resultCountry !== requestedCountry) warnings.push("country_mismatch");
  if (Number.isFinite(latitude) && Number.isFinite(longitude) && requestedCountry && !isCoordinateInsideCountry(requestedCountry, latitude, longitude)) warnings.push("outside_country_bounds");
  const providerConfidence = Math.max(0, Math.min(1, Number(result?.confidence || 0)));
  const confidence = Math.max(0, Math.min(1, Math.round((providerConfidence - warnings.length * 0.25) * 1000) / 1000));
  return {
    valid: !warnings.length && confidence >= 0.8,
    decision: !warnings.length && confidence >= 0.92 ? "eligible_for_reviewed_apply" : "review",
    latitude, longitude, country: resultCountry, confidence, warnings,
    details: { provider_confidence: providerConfidence, requested_country: requestedCountry }
  };
}

export function canQueueGeocoding(usage = {}, limits = {}) {
  const dailyLimit = Number(limits.dailyLimit ?? 100);
  const perMinuteLimit = Number(limits.perMinuteLimit ?? 10);
  const queueLimit = Number(limits.queueLimit ?? 500);
  const reasons = [];
  if (Number(usage.today || 0) >= dailyLimit) reasons.push("daily_limit_reached");
  if (Number(usage.lastMinute || 0) >= perMinuteLimit) reasons.push("minute_rate_limit_reached");
  if (Number(usage.queued || 0) >= queueLimit) reasons.push("queue_limit_reached");
  return { allowed: !reasons.length, reasons, limits: { dailyLimit, perMinuteLimit, queueLimit } };
}
