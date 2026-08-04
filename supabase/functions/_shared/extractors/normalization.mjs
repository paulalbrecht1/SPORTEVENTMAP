const COUNTRY_CODES = new Map([
  ["de", "DE"], ["deutschland", "DE"], ["germany", "DE"],
  ["at", "AT"], ["oesterreich", "AT"], ["österreich", "AT"], ["austria", "AT"],
  ["ch", "CH"], ["schweiz", "CH"], ["switzerland", "CH"],
  ["fr", "FR"], ["frankreich", "FR"], ["france", "FR"],
  ["es", "ES"], ["spanien", "ES"], ["spain", "ES"],
  ["it", "IT"], ["italien", "IT"], ["italy", "IT"],
  ["nl", "NL"], ["niederlande", "NL"], ["netherlands", "NL"],
  ["be", "BE"], ["belgien", "BE"], ["belgium", "BE"],
  ["gb", "GB"], ["uk", "GB"], ["united kingdom", "GB"], ["grossbritannien", "GB"]
]);

const CURRENCY_CODES = new Map([
  ["€", "EUR"], ["eur", "EUR"], ["euro", "EUR"],
  ["$", "USD"], ["usd", "USD"], ["dollar", "USD"],
  ["chf", "CHF"], ["£", "GBP"], ["gbp", "GBP"]
]);

const REGISTRATION_STATUS = new Map([
  ["registration_open", "registration_open"], ["open", "registration_open"],
  ["anmeldung geöffnet", "registration_open"], ["anmeldung geoeffnet", "registration_open"],
  ["registration_not_open", "registration_not_open"], ["coming_soon", "registration_not_open"],
  ["closed", "registration_not_open"], ["registration_closed", "registration_not_open"],
  ["anmeldung geschlossen", "registration_not_open"], ["noch geschlossen", "registration_not_open"],
  ["sold_out", "sold_out"], ["sold out", "sold_out"], ["ausverkauft", "sold_out"],
  ["cancelled", "cancelled"], ["canceled", "cancelled"], ["abgesagt", "cancelled"],
  ["unknown", "unknown"]
]);

const SPORT_VALUES = [
  [/(trail|berg|mountain)/i, "trail_running"],
  [/(ultra|backyard|100\s*(?:km|meilen|miles))/i, "ultra_running"],
  [/(triathlon|ironman|duathlon)/i, "triathlon"],
  [/(lauf|running|marathon|halbmarathon|half marathon|road race)/i, "running"]
];

export function cleanText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeComparableText(value) {
  return cleanText(value).toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/œ/g, "oe")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeCountry(value) {
  const normalized = normalizeComparableText(value);
  return COUNTRY_CODES.get(normalized) || (normalized.length === 2 ? normalized.toUpperCase() : null);
}

export function normalizeCurrency(value) {
  const normalized = cleanText(value).toLocaleLowerCase("de-DE");
  return CURRENCY_CODES.get(normalized) || (/^[a-z]{3}$/i.test(normalized) ? normalized.toUpperCase() : null);
}

export function normalizeSport(value) {
  const text = cleanText(value);
  return SPORT_VALUES.find(([pattern]) => pattern.test(text))?.[1] || null;
}

export function normalizeRegistrationStatus(value) {
  const normalized = cleanText(value).toLocaleLowerCase("de-DE").replace(/-/g, "_");
  return REGISTRATION_STATUS.get(normalized) || null;
}

export function normalizeEventStatus(value) {
  const text = normalizeComparableText(value);
  if (/(?:\babgesagt\b|\bfallt aus\b|cancelled|canceled)/.test(text)) return "cancelled";
  if (/(?:\bverschoben\b|postponed|rescheduled)/.test(text)) return "postponed";
  if (/(?:\bbeendet\b|completed|finished)/.test(text)) return "completed";
  if (/\b(tba|date to be announced|termin noch nicht bestatigt|coming soon)\b/.test(text)) return "date_unconfirmed";
  if (/(?:\bgeplant\b|scheduled|\bfindet statt\b|confirmed)/.test(text)) return "scheduled";
  return null;
}

export function normalizeUrl(value, baseUrl = null) {
  try {
    const url = new URL(cleanText(value), baseUrl || undefined);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

export function normalizePrice(value) {
  const text = cleanText(value).replace(/\s/g, "");
  const match = text.match(/\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  const amount = Number(match[0].replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

export function normalizeDistance(value) {
  const original = cleanText(value);
  const lower = original.toLocaleLowerCase("de-DE");
  if (/halbmarathon|half marathon/.test(lower)) return { value: 21.0975, unit: "km", type: "half_marathon", original };
  if (/\bmarathon\b/.test(lower) && !/halb|half|ultra/.test(lower)) return { value: 42.195, unit: "km", type: "marathon", original };
  if (/ultramarathon|ultra marathon/.test(lower)) return { value: null, unit: "km", type: "ultramarathon", original };
  if (/sprinttriathlon|sprint triathlon/.test(lower)) return { value: null, unit: "mixed", type: "triathlon_sprint", original };
  if (/olympische distanz|olympic distance/.test(lower)) return { value: null, unit: "mixed", type: "triathlon_olympic", original };
  if (/mitteldistanz|middle distance|70\.3/.test(lower)) return { value: null, unit: "mixed", type: "triathlon_middle", original };
  if (/langdistanz|long distance|ironman/.test(lower)) return { value: null, unit: "mixed", type: "triathlon_long", original };
  const match = lower.match(/(\d+(?:[.,]\d+)?)\s*(km|kilometer|m|meter|mi|mile|miles|meilen)\b/);
  if (!match) return null;
  let amount = Number(match[1].replace(",", "."));
  let unit = "km";
  if (/^(m|meter)$/.test(match[2])) amount /= 1000;
  if (/^(mi|mile|miles|meilen)$/.test(match[2])) amount *= 1.609344;
  return { value: Math.round(amount * 10000) / 10000, unit, type: amount > 42.195 ? "ultramarathon" : "distance", original };
}

export function valuesEqual(fieldName, left, right) {
  if (left == null && right == null) return true;
  if (fieldName.endsWith("_url") || fieldName === "source_url") {
    const a = normalizeUrl(left);
    const b = normalizeUrl(right);
    return Boolean(a && b && a.replace(/\/$/, "") === b.replace(/\/$/, ""));
  }
  if (["canonical_name", "city", "region", "venue", "organizer"].includes(fieldName)) {
    return normalizeComparableText(left) === normalizeComparableText(right);
  }
  if (["price_min", "price_max", "latitude", "longitude"].includes(fieldName)) return Number(left) === Number(right);
  return JSON.stringify(left) === JSON.stringify(right);
}

export function nameSimilarity(left, right) {
  const a = new Set(normalizeComparableText(left).split(" ").filter(token => token.length > 2));
  const b = new Set(normalizeComparableText(right).split(" ").filter(token => token.length > 2));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(token => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}
