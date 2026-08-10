import { normalizeCountry, normalizeCurrency, normalizeDistance, normalizeEventStatus, normalizePrice, normalizeRegistrationStatus, normalizeSport, normalizeUrl, nameSimilarity, cleanText } from "./normalization.mjs";
import { normalizeDate, splitDateTime } from "./date-extractor.mjs";

function entries(value) {
  if (Array.isArray(value)) return value.flatMap(entries);
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value["@graph"])) return value["@graph"].flatMap(entries);
  return [value];
}

function typeList(value) {
  return (Array.isArray(value) ? value : [value]).map(item => String(item || "").toLowerCase());
}

function context(value) {
  const serialized = JSON.stringify(value);
  return serialized.length > 600 ? `${serialized.slice(0, 597)}...` : serialized;
}

function candidate(field, rawValue, normalizedValue, entry, confidence = 0.92, warnings = []) {
  if (rawValue == null || normalizedValue == null || normalizedValue === "") return null;
  return {
    field, rawValue, normalizedValue, method: "json_ld", methodVersion: "json-ld-v1",
    confidence, context: context(entry), warnings,
    reasons: ["schema_org_event", "structured_value"]
  };
}

function first(value) { return Array.isArray(value) ? value[0] : value; }

function eventCandidates(entry, baseUrl) {
  const result = [];
  const location = first(entry.location) || {};
  const address = typeof location.address === "string" ? { streetAddress: location.address } : (location.address || {});
  const geo = location.geo || entry.geo || {};
  const offer = first(entry.offers) || {};
  const organizer = first(entry.organizer) || {};
  const start = splitDateTime(entry.startDate);
  const end = splitDateTime(entry.endDate);
  const eventStatus = normalizeEventStatus(entry.eventStatus);
  const availability = String(offer.availability || "").split("/").pop();
  const registration = /^(instock|onlineonly|limitedavailability)$/i.test(availability) ? "registration_open"
    : /^(soldout|outofstock)$/i.test(availability) ? "sold_out"
    : /^(preorder|presale)$/i.test(availability) ? "registration_not_open"
    : normalizeRegistrationStatus(availability);
  const sport = normalizeSport(entry.sport || entry.sports || entry.category);
  const country = normalizeCountry(address.addressCountry?.name || address.addressCountry);
  const values = [
    candidate("canonical_name", entry.name, cleanText(entry.name), entry, 0.94),
    candidate("start_date", entry.startDate, start.date, entry, 0.97),
    candidate("end_date", entry.endDate, end.date, entry, 0.95),
    candidate("start_time", entry.startDate, start.time, entry, start.timezone ? 0.96 : 0.9, start.time && !start.timezone ? ["timezone_missing"] : []),
    candidate("venue", location.name, cleanText(location.name), entry, 0.92),
    candidate("address", address.streetAddress, cleanText(address.streetAddress), entry, 0.92),
    candidate("city", address.addressLocality, cleanText(address.addressLocality), entry, 0.94),
    candidate("region", address.addressRegion, cleanText(address.addressRegion), entry, 0.9),
    candidate("country", address.addressCountry, country, entry, 0.94),
    candidate("latitude", geo.latitude, Number(geo.latitude), entry, 0.94),
    candidate("longitude", geo.longitude, Number(geo.longitude), entry, 0.94),
    candidate("organizer_name", organizer.name || entry.organizer, cleanText(organizer.name || entry.organizer), entry, 0.92),
    candidate("registration_status", offer.availability, registration, entry, 0.9),
    candidate("price_min", offer.price ?? offer.lowPrice, normalizePrice(offer.price ?? offer.lowPrice), entry, 0.9),
    candidate("price_max", offer.highPrice, normalizePrice(offer.highPrice), entry, 0.88),
    candidate("currency", offer.priceCurrency, normalizeCurrency(offer.priceCurrency), entry, 0.93),
    candidate("registration_url", offer.url, normalizeUrl(offer.url, baseUrl), entry, 0.95),
    candidate("edition_status", entry.eventStatus, eventStatus, entry, 0.94),
    candidate("description", entry.description, cleanText(String(entry.description || "").replace(/<[^>]+>/g, " ")), entry, 0.82),
    candidate("image", first(entry.image)?.url || first(entry.image), normalizeUrl(first(entry.image)?.url || first(entry.image), baseUrl), entry, 0.88),
    candidate("sport", entry.sport || entry.sports || entry.category, sport, entry, 0.86)
  ].filter(Boolean);
  result.push(...values);

  const distanceValues = [entry.distance, entry.distances, entry.course?.distance].flat().filter(Boolean);
  for (const distance of distanceValues) {
    const normalized = normalizeDistance(typeof distance === "object" ? `${distance.value} ${distance.unitText || distance.unitCode || ""}` : distance);
    const item = candidate("race_formats", distance, normalized ? [normalized] : null, entry, 0.86);
    if (item) result.push(item);
  }
  return result.filter(item => {
    if (item.field === "latitude") return Number.isFinite(item.normalizedValue) && Math.abs(item.normalizedValue) <= 90;
    if (item.field === "longitude") return Number.isFinite(item.normalizedValue) && Math.abs(item.normalizedValue) <= 180;
    return true;
  });
}

export function extractJsonLd(content, options = {}) {
  const raw = String(content || "");
  const blocks = options.contentType?.includes("json") ? [raw] :
    [...raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => match[1]);
  const parsedEvents = [];
  const errors = [];
  for (const block of blocks) {
    try {
      for (const entry of entries(JSON.parse(block))) {
        if (typeList(entry?.["@type"]).some(type => type === "event" || type === "sportsevent" || type.endsWith("event"))) parsedEvents.push(entry);
      }
    } catch (error) { errors.push(`invalid_json_ld:${error?.message || "parse_error"}`); }
  }
  if (!parsedEvents.length) return { candidates: [], diagnostics: errors };

  let selected = parsedEvents;
  if (options.event?.canonical_name || options.event?.event_name) {
    const expectedName = options.event.canonical_name || options.event.event_name;
    const ranked = parsedEvents.map(entry => ({ entry, similarity: nameSimilarity(entry.name, expectedName) }))
      .sort((left, right) => right.similarity - left.similarity);
    if (ranked[0]?.similarity >= 0.25) selected = [ranked[0].entry];
    else if (parsedEvents.length > 1) return { candidates: [], diagnostics: [...errors, "multiple_events_no_safe_match"] };
  } else if (parsedEvents.length > 1) {
    return { candidates: [], diagnostics: [...errors, "multiple_events_without_baseline"] };
  }

  return {
    candidates: selected.flatMap(entry => eventCandidates(entry, options.sourceUrl)),
    diagnostics: errors,
    matchedEventCount: selected.length,
    pageEventCount: parsedEvents.length
  };
}
