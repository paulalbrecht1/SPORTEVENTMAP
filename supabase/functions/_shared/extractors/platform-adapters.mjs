import { cleanText, normalizeRegistrationStatus, normalizeUrl } from "./normalization.mjs";
import { extractDateCandidates } from "./date-extractor.mjs";

function textFromFragment(fragment) {
  return cleanText(String(fragment || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&"));
}

function classFragment(content, classPattern) {
  const pattern = new RegExp(`<([a-z0-9]+)\\b[^>]*class=["'][^"']*(?:${classPattern})[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1\\s*>`, "gi");
  return [...String(content || "").matchAll(pattern)].map(match => textFromFragment(match[2]));
}

function adapt(domain, content, sourceUrl, config) {
  const candidates = [];
  const dateTexts = config.dateClasses.flatMap(pattern => classFragment(content, pattern));
  for (const dateText of dateTexts) {
    for (const item of extractDateCandidates(`Race day: ${dateText}`)) {
      candidates.push({ ...item, method: `platform:${config.id}`, methodVersion: config.version, confidence: Math.max(item.confidence, config.confidence), reasons: [...item.reasons, "known_platform_adapter"] });
    }
  }
  for (const locationText of config.locationClasses.flatMap(pattern => classFragment(content, pattern))) {
    candidates.push({ field: "venue", rawValue: locationText, normalizedValue: locationText, method: `platform:${config.id}`, methodVersion: config.version, confidence: config.confidence - 0.05, context: locationText, warnings: [], reasons: ["known_platform_adapter"] });
  }
  for (const match of String(content || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const label = textFromFragment(match[2]);
    if (!/(anmeld|registr|register|entry|melden|startplatz)/i.test(`${label} ${match[1]}`)) continue;
    const url = normalizeUrl(match[1], sourceUrl);
    if (url) candidates.push({ field: "registration_url", rawValue: match[1], normalizedValue: url, method: `platform:${config.id}`, methodVersion: config.version, confidence: config.confidence, context: label, warnings: [], reasons: ["known_platform_adapter", "registration_link_context"] });
  }
  const statusText = textFromFragment(content);
  const statusTerms = ["sold out", "ausverkauft", "registration open", "anmeldung geöffnet", "registration closed", "anmeldung geschlossen"];
  for (const term of statusTerms) {
    if (!statusText.toLocaleLowerCase("de-DE").includes(term)) continue;
    const normalized = normalizeRegistrationStatus(term);
    if (normalized) candidates.push({ field: "registration_status", rawValue: term, normalizedValue: normalized, method: `platform:${config.id}`, methodVersion: config.version, confidence: config.confidence, context: term, warnings: [], reasons: ["known_platform_adapter", "explicit_registration_status"] });
  }
  return { adapter: config.id, version: config.version, domain, candidates, diagnostics: [] };
}

const ADAPTERS = [
  { id: "marathon_de", version: "marathon-de-v1", hosts: ["marathon.de"], dateClasses: ["event-date", "veranstaltung-datum", "date"], locationClasses: ["event-location", "veranstaltungsort", "location"], confidence: 0.86 },
  { id: "running_life", version: "running-life-v1", hosts: ["running.life"], dateClasses: ["event-date", "race-date", "date"], locationClasses: ["event-location", "race-location", "location"], confidence: 0.86 },
  { id: "ironman", version: "ironman-v1", hosts: ["ironman.com"], dateClasses: ["race-date", "event-date", "eventDate"], locationClasses: ["race-location", "event-location", "eventLocation"], confidence: 0.9 }
];

export function extractPlatformAdapter(content, options = {}) {
  let hostname = "";
  try { hostname = new URL(options.sourceUrl).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* no adapter */ }
  const config = ADAPTERS.find(adapter => adapter.hosts.some(host => hostname === host || hostname.endsWith(`.${host}`)));
  return config ? adapt(hostname, content, options.sourceUrl, config) : { adapter: null, version: null, candidates: [], diagnostics: [] };
}

export const PLATFORM_ADAPTERS = ADAPTERS.map(({ id, version, hosts }) => ({ id, version, hosts }));
