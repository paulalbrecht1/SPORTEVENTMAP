import { cleanText, normalizeComparableText } from "./normalization.mjs";

const MONTHS = new Map(Object.entries({
  januar: 1, january: 1, jan: 1, februar: 2, february: 2, feb: 2,
  marz: 3, maerz: 3, märz: 3, march: 3, mar: 3, april: 4, apr: 4,
  mai: 5, may: 5, juni: 6, june: 6, jun: 6, juli: 7, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, october: 10, oct: 10,
  november: 11, nov: 11, dezember: 12, december: 12, dec: 12
}));

const NEGATIVE_CONTEXT = /(?:meldeschluss|anmeldeschluss|registration deadline|registration opens?|anmeldestart|abholung|pickup|ergebnis|result|veroffentlich|published|copyright|training(?:scamp)?|camp|news|artikel|article)/i;
const POSITIVE_CONTEXT = /(?:renntag|race day|event date|veranstaltungstag|wettkampf|start(?:datum| date)?|termin|findet statt|takes place|scheduled)/i;

function validDate(year, month, day) {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

function monthNumber(value) {
  return MONTHS.get(normalizeComparableText(value).replace(/\.$/, "")) || null;
}

export function normalizeDate(value, options = {}) {
  const text = cleanText(value);
  let match = text.match(/\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})(?=\b|T)/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./]((?:19|20)?\d{2}))?\b/);
  if (match) {
    let year = match[3] ? Number(match[3]) : Number(options.defaultYear);
    if (year > 0 && year < 100) year += 2000;
    return year ? validDate(year, Number(match[2]), Number(match[1])) : null;
  }
  match = text.match(/\b(\d{1,2})(?:st|nd|rd|th|\.)?\s+([A-Za-zÄÖÜäöüß]+)\s*,?\s*((?:19|20)\d{2})?\b/);
  if (match) return validDate(Number(match[3] || options.defaultYear), monthNumber(match[2]), Number(match[1]));
  match = text.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,\s*((?:19|20)\d{2})\b/);
  if (match) return validDate(Number(match[3]), monthNumber(match[1]), Number(match[2]));
  return null;
}

function contextAround(text, index, length, radius = 90) {
  const windowStart = Math.max(0, index - radius);
  const windowEnd = Math.min(text.length, index + length + radius);
  const before = text.slice(windowStart, index);
  const after = text.slice(index + length, windowEnd);
  const leftBoundary = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf(". "));
  const rightMatches = [after.indexOf("\n"), after.indexOf("!"), after.indexOf("?"), after.indexOf(". ")].filter(value => value >= 0);
  const rightBoundary = rightMatches.length ? Math.min(...rightMatches) + 1 : after.length;
  return cleanText(before.slice(leftBoundary < 0 ? 0 : leftBoundary + 1) + text.slice(index, index + length) + after.slice(0, rightBoundary));
}

export function extractDateCandidates(textValue, options = {}) {
  const text = cleanText(textValue);
  const pageYears = [...text.matchAll(/\b(20\d{2})\b/g)].map(match => Number(match[1]));
  const uniqueYears = [...new Set(pageYears)];
  const defaultYear = options.defaultYear || (uniqueYears.length === 1 ? uniqueYears[0] : null);
  const patterns = [
    /\b(?:19|20)\d{2}-\d{1,2}-\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
    /\b\d{1,2}[./]\d{1,2}(?:[./](?:19|20)?\d{2})?\b/g,
    /\b\d{1,2}(?:st|nd|rd|th|\.)?\s+[A-Za-zÄÖÜäöüß]+(?:\s*,?\s*(?:19|20)\d{2})?\b/g,
    /\b[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s*,\s*(?:19|20)\d{2}\b/g
  ];
  const results = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const context = contextAround(text, match.index, match[0].length);
      const negative = NEGATIVE_CONTEXT.test(context);
      const positive = POSITIVE_CONTEXT.test(context);
      const date = normalizeDate(match[0], { defaultYear });
      if (!date || negative) continue;
      results.push({
        field: "start_date", rawValue: match[0], normalizedValue: date,
        context, confidence: positive ? 0.78 : 0.58,
        warnings: positive ? [] : ["date_context_not_explicit"],
        reasons: positive ? ["explicit_event_date_context"] : ["generic_visible_date"]
      });
    }
  }

  const rangePattern = /\b(\d{1,2})\s*[–—-]\s*(\d{1,2})\s+([A-Za-zÄÖÜäöüß]+)\s*,?\s*((?:19|20)\d{2})\b/g;
  for (const match of text.matchAll(rangePattern)) {
    const month = monthNumber(match[3]);
    const start = validDate(Number(match[4]), month, Number(match[1]));
    const end = validDate(Number(match[4]), month, Number(match[2]));
    const context = contextAround(text, match.index, match[0].length);
    if (!start || !end || end < start || NEGATIVE_CONTEXT.test(context)) continue;
    const confidence = POSITIVE_CONTEXT.test(context) ? 0.82 : 0.64;
    results.push({ field: "start_date", rawValue: match[0], normalizedValue: start, context, confidence, warnings: [], reasons: ["date_range_start"] });
    results.push({ field: "end_date", rawValue: match[0], normalizedValue: end, context, confidence, warnings: [], reasons: ["date_range_end"] });
  }
  return results;
}

export function splitDateTime(value) {
  const text = cleanText(value);
  const date = normalizeDate(text);
  const time = text.match(/[T\s](\d{1,2}):(\d{2})(?::\d{2})?(?:Z|([+-]\d{2}:?\d{2}))?\b/);
  return { date, time: time ? `${time[1].padStart(2, "0")}:${time[2]}:00` : null, timezone: time?.[3] || (text.endsWith("Z") ? "UTC" : null) };
}
