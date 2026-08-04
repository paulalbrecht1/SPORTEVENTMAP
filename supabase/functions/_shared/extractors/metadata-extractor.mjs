import { cleanText, normalizeUrl } from "./normalization.mjs";
import { splitDateTime } from "./date-extractor.mjs";

function metaMap(content) {
  const result = new Map();
  for (const tag of String(content || "").match(/<meta\b[^>]*>/gi) || []) {
    const key = tag.match(/(?:property|name|itemprop)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const value = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (key && value && !result.has(key)) result.set(key, value);
  }
  return result;
}

export function extractMetadata(content, options = {}) {
  const meta = metaMap(content);
  const candidates = [];
  const push = (field, key, normalized, confidence = 0.72) => {
    const rawValue = meta.get(key);
    if (rawValue && normalized != null) candidates.push({
      field, rawValue, normalizedValue: normalized, method: "metadata", methodVersion: "metadata-v1",
      confidence, context: `<meta ${key}="${cleanText(rawValue)}">`, warnings: [], reasons: ["structured_metadata"]
    });
  };
  const startRaw = meta.get("event:start_time") || meta.get("event:start_date") || meta.get("startdate");
  const endRaw = meta.get("event:end_time") || meta.get("event:end_date") || meta.get("enddate");
  if (startRaw) {
    const start = splitDateTime(startRaw);
    candidates.push({ field: "start_date", rawValue: startRaw, normalizedValue: start.date, method: "metadata", methodVersion: "metadata-v1", confidence: 0.84, context: startRaw, warnings: [], reasons: ["event_metadata"] });
    if (start.time) candidates.push({ field: "start_time", rawValue: startRaw, normalizedValue: start.time, method: "metadata", methodVersion: "metadata-v1", confidence: 0.8, context: startRaw, warnings: start.timezone ? [] : ["timezone_missing"], reasons: ["event_metadata"] });
  }
  if (endRaw) push("end_date", meta.has("event:end_time") ? "event:end_time" : meta.has("event:end_date") ? "event:end_date" : "enddate", splitDateTime(endRaw).date, 0.82);
  push("canonical_name", meta.has("og:title") ? "og:title" : "twitter:title", cleanText(meta.get("og:title") || meta.get("twitter:title")), 0.7);
  push("description", meta.has("og:description") ? "og:description" : "description", cleanText(meta.get("og:description") || meta.get("description")), 0.68);
  push("image", meta.has("og:image") ? "og:image" : "twitter:image", normalizeUrl(meta.get("og:image") || meta.get("twitter:image"), options.sourceUrl), 0.76);
  return { candidates: candidates.filter(item => item.normalizedValue != null), diagnostics: [] };
}
