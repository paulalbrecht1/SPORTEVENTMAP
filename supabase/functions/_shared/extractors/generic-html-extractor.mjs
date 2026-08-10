import { cleanText, normalizeCurrency, normalizeDistance, normalizeEventStatus, normalizePrice, normalizeRegistrationStatus, normalizeUrl } from "./normalization.mjs";
import { extractDateCandidates } from "./date-extractor.mjs";

export function htmlToVisibleText(content) {
  return cleanText(String(content || "")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(script|style|noscript|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<\/(?:p|li|div|article|section)\s*>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'"));
}

function genericCandidate(field, rawValue, normalizedValue, context, confidence, reasons, warnings = []) {
  return { field, rawValue, normalizedValue, context: cleanText(context), confidence, reasons, warnings, method: "generic_html", methodVersion: "generic-html-v1" };
}

export function extractGenericHtml(content, options = {}) {
  const raw = String(content || "");
  const visible = htmlToVisibleText(raw);
  const candidates = extractDateCandidates(visible, { defaultYear: options.defaultYear })
    .map(item => ({ ...item, method: "generic_html", methodVersion: "generic-html-v1" }));

  const statusPatterns = [
    /\b(abgesagt|fällt aus|faellt aus|cancelled|canceled)\b/gi,
    /\b(verschoben|postponed|rescheduled)\b/gi,
    /\b(date to be announced|termin noch nicht bestätigt|termin noch nicht bestaetigt|tba)\b/gi,
    /\b(beendet|completed|finished)\b/gi,
    /\b(geplant|scheduled|findet statt)\b/gi
  ];
  for (const pattern of statusPatterns) {
    for (const match of visible.matchAll(pattern)) {
      const normalized = normalizeEventStatus(match[0]);
      if (normalized) candidates.push(genericCandidate("edition_status", match[0], normalized, visible.slice(Math.max(0, match.index - 80), match.index + 160), /cancel|abgesagt|verschoben|postponed/i.test(match[0]) ? 0.9 : 0.76, ["explicit_status_phrase"]));
    }
  }

  const registrationTerms = [
    [/(registration open|anmeldung (?:ist )?(?:geöffnet|geoeffnet)|jetzt anmelden)/gi, "registration_open"],
    [/(sold out|ausverkauft)/gi, "sold_out"],
    [/(registration closed|anmeldung (?:ist )?geschlossen|coming soon|anmeldung öffnet|anmeldung oeffnet)/gi, "registration_not_open"]
  ];
  for (const [pattern, status] of registrationTerms) {
    for (const match of visible.matchAll(pattern)) {
      candidates.push(genericCandidate("registration_status", match[0], normalizeRegistrationStatus(status), visible.slice(Math.max(0, match.index - 70), match.index + 150), 0.83, ["explicit_registration_status"]));
    }
  }

  for (const match of raw.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const label = cleanText(match[2].replace(/<[^>]+>/g, " "));
    if (!/(anmeld|registr|register|startplatz|entry)/i.test(`${label} ${match[1]}`)) continue;
    const url = normalizeUrl(match[1], options.sourceUrl);
    if (url) candidates.push(genericCandidate("registration_url", match[1], url, label, 0.78, ["registration_link_context"]));
  }

  for (const match of visible.matchAll(/(?:preis|startgeld|entry fee|ab)\s*:?[ ]*(\d+(?:[.,]\d{1,2})?)\s*(€|eur|euro|usd|chf|gbp|£|\$)/gi)) {
    candidates.push(genericCandidate("price_min", match[0], normalizePrice(match[1]), match[0], 0.72, ["price_label"]));
    candidates.push(genericCandidate("currency", match[2], normalizeCurrency(match[2]), match[0], 0.75, ["price_label"]));
  }

  const distances = [];
  for (const match of visible.matchAll(/\b(?:halbmarathon|half marathon|ultramarathon|sprinttriathlon|olympische distanz|mitteldistanz|langdistanz|\d+(?:[.,]\d+)?\s*(?:km|kilometer|meter|miles?|meilen))\b/gi)) {
    const distance = normalizeDistance(match[0]);
    if (distance) distances.push(distance);
  }
  if (distances.length) candidates.push(genericCandidate("race_formats", distances.map(item => item.original).join(", "), [...new Map(distances.map(item => [JSON.stringify(item), item])).values()], "Distanzangaben im sichtbaren Eventinhalt", 0.7, ["distance_terms"]));

  for (const match of visible.matchAll(/(?:teilnehmerlimit|maximum participants|limited to|max\.)\s*:?[ ]*(\d{2,7})/gi)) {
    candidates.push(genericCandidate("participant_limit", match[0], Number(match[1]), match[0], 0.75, ["participant_limit_label"]));
  }
  return { candidates, diagnostics: [] };
}
