export const COUNTRY_CONFIG = Object.freeze({
  DE: Object.freeze({
    code: "DE", name: "Deutschland", rollout: "observation", enabled: true,
    languages: ["de"], locales: ["de-DE"], currency: "EUR", timezone: "Europe/Berlin",
    postalCodePattern: /^\d{5}$/,
    bounds: { minLat: 47.2, maxLat: 55.2, minLon: 5.7, maxLon: 15.1 },
    dateExamples: ["6. Mai 2027", "06.05.2027", "2027-05-06"]
  }),
  AT: Object.freeze({
    code: "AT", name: "Österreich", rollout: "pilot_disabled", enabled: false,
    languages: ["de"], locales: ["de-AT"], currency: "EUR", timezone: "Europe/Vienna",
    postalCodePattern: /^\d{4}$/,
    bounds: { minLat: 46.3, maxLat: 49.1, minLon: 9.4, maxLon: 17.2 },
    dateExamples: ["6. Mai 2027", "06.05.2027"]
  }),
  CH: Object.freeze({
    code: "CH", name: "Schweiz", rollout: "pilot_disabled", enabled: false,
    languages: ["de", "fr", "it"], locales: ["de-CH", "fr-CH", "it-CH"], currency: "CHF", timezone: "Europe/Zurich",
    postalCodePattern: /^\d{4}$/,
    bounds: { minLat: 45.7, maxLat: 47.9, minLon: 5.8, maxLon: 10.6 },
    dateExamples: ["6. Mai 2027", "6 mai 2027", "6 maggio 2027", "06.05.2027"]
  })
});

const COUNTRY_ALIASES = new Map([
  ["de", "DE"], ["deutschland", "DE"], ["germany", "DE"],
  ["at", "AT"], ["österreich", "AT"], ["oesterreich", "AT"], ["austria", "AT"],
  ["ch", "CH"], ["schweiz", "CH"], ["suisse", "CH"], ["svizzera", "CH"], ["switzerland", "CH"]
]);

export function normalizeCountryCode(value) {
  return COUNTRY_ALIASES.get(String(value || "").trim().toLocaleLowerCase("de")) || null;
}

export function getCountryConfig(value) {
  const code = normalizeCountryCode(value) || String(value || "").trim().toUpperCase();
  return COUNTRY_CONFIG[code] || null;
}

export function isCoordinateInsideCountry(country, latitude, longitude) {
  const config = getCountryConfig(country);
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!config || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= config.bounds.minLat && lat <= config.bounds.maxLat
    && lon >= config.bounds.minLon && lon <= config.bounds.maxLon;
}

export function validateCountryPilot(candidate, rollouts = COUNTRY_CONFIG) {
  const code = normalizeCountryCode(candidate?.country);
  const config = code ? rollouts[code] : null;
  if (!config) return { allowed: false, code, reason: "country_not_supported" };
  if (!config.enabled) return { allowed: false, code, reason: "country_pilot_disabled" };
  return { allowed: true, code, reason: "country_enabled" };
}
