import { cleanText, normalizeUrl } from "./normalization.mjs";
import { normalizeDate, splitDateTime } from "./date-extractor.mjs";

export function extractKnownSelectors(content, options = {}) {
  const raw = String(content || "");
  const candidates = [];
  for (const match of raw.matchAll(/<(?:time|meta)\b[^>]*(?:itemprop=["']startDate["']|data-event-date)[^>]*(?:datetime|content|data-event-date)=["']([^"']+)["'][^>]*>/gi)) {
    const dateTime = splitDateTime(match[1]);
    if (dateTime.date) candidates.push({ field: "start_date", rawValue: match[1], normalizedValue: dateTime.date, method: "css_selector", methodVersion: "known-selectors-v1", confidence: 0.84, context: cleanText(match[0]), warnings: [], reasons: ["known_event_date_selector"] });
    if (dateTime.time) candidates.push({ field: "start_time", rawValue: match[1], normalizedValue: dateTime.time, method: "css_selector", methodVersion: "known-selectors-v1", confidence: 0.8, context: cleanText(match[0]), warnings: dateTime.timezone ? [] : ["timezone_missing"], reasons: ["known_event_date_selector"] });
  }
  for (const match of raw.matchAll(/<[^>]+(?:itemprop=["']location["']|data-event-location)[^>]*>([\s\S]*?)<\/[^>]+>/gi)) {
    const value = cleanText(match[1].replace(/<[^>]+>/g, " "));
    if (value) candidates.push({ field: "venue", rawValue: value, normalizedValue: value, method: "css_selector", methodVersion: "known-selectors-v1", confidence: 0.74, context: value, warnings: [], reasons: ["known_location_selector"] });
  }
  for (const match of raw.matchAll(/<a\b[^>]*(?:data-registration-url|itemprop=["']url["'])[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const value = normalizeUrl(match[1], options.sourceUrl);
    if (value) candidates.push({ field: "registration_url", rawValue: match[1], normalizedValue: value, method: "css_selector", methodVersion: "known-selectors-v1", confidence: 0.76, context: cleanText(match[0]), warnings: [], reasons: ["known_registration_selector"] });
  }
  return { candidates, diagnostics: [] };
}
