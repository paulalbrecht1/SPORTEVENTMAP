const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  cleanValue,
  ensureDirectoryForFile,
  parseCsv,
  writeJsonFile
} = require("./event-table-utils");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_EVENTS_FILE = path.join(ROOT, "data", "events.csv");
const DEFAULT_REPORT_FILE = path.join(ROOT, "data", "review", "duplicate-candidates.json");

const GENERIC_NAME_TOKENS = new Set([
  "adac", "bmw", "datev", "electric", "event", "generali", "haspa",
  "lauf", "mainova", "marathon", "race", "run", "running", "schneider",
  "sparkasse", "tcs", "triathlon", "volksbank"
]);

const NON_BLOCKING_RESOLUTIONS = new Set(["accepted_risk", "not_duplicate"]);

function parseArgs(argv) {
  const args = { input: DEFAULT_EVENTS_FILE, output: DEFAULT_REPORT_FILE };

  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--input") {
      args.input = path.resolve(argv[index + 1] || args.input);
      index += 1;
      continue;
    }

    if (argv[index] === "--output") {
      args.output = path.resolve(argv[index + 1] || args.output);
      index += 1;
    }
  }

  return args;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeExactText(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalNameToken(value) {
  let token = normalizeExactText(value);

  for (const suffix of ["halbmarathon", "marathon", "triathlon", "running", "lauf", "run"]) {
    if (token.endsWith(suffix) && token.length >= suffix.length + 3) {
      token = token.slice(0, -suffix.length);
      break;
    }
  }

  return token;
}

function nameTokens(value) {
  return normalizeExactText(value)
    .split(" ")
    .map(canonicalNameToken)
    .filter(token => token && !GENERIC_NAME_TOKENS.has(token));
}

function normalizeUrl(value) {
  try {
    const url = new URL(cleanValue(value));
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${hostname}${pathname}`;
  } catch (_error) {
    return normalizeExactText(value);
  }
}

function eventUrl(event) {
  return [event.official_url, event.event_url, event.source_url]
    .map(cleanValue)
    .find(Boolean) || "";
}

function canonicalEventUrls(event) {
  const primaryUrls = [event.official_url, event.event_url]
    .map(normalizeUrl)
    .filter(Boolean);
  const urls = primaryUrls.length ? primaryUrls : [normalizeUrl(event.source_url)].filter(Boolean);
  return new Set(urls);
}

function parseDate(value) {
  const german = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(cleanValue(value));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(cleanValue(value));

  const utcDate = (year, month, day) => {
    const value = Date.UTC(year, month - 1, day);
    const parsed = new Date(value);
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
      ? value
      : null;
  };

  if (german) {
    return utcDate(Number(german[3]), Number(german[2]), Number(german[1]));
  }

  if (iso) {
    return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  return null;
}

function daysBetween(first, second) {
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  return Math.abs(Math.round((first - second) / 86400000));
}

function haversineKm(first, second) {
  const rawCoordinates = [
    first.latitude,
    first.longitude,
    second.latitude,
    second.longitude
  ].map(cleanValue);

  if (rawCoordinates.some(value => !value)) {
    return null;
  }

  const [firstLat, firstLng, secondLat, secondLng] = rawCoordinates.map(Number);

  if (![firstLat, firstLng, secondLat, secondLng].every(Number.isFinite)) {
    return null;
  }

  const radians = degrees => degrees * Math.PI / 180;
  const deltaLat = radians(secondLat - firstLat);
  const deltaLng = radians(secondLng - firstLng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(firstLat)) *
      Math.cos(radians(secondLat)) *
      Math.sin(deltaLng / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function diceCoefficient(first, second) {
  if (!first || !second) return 0;
  if (first === second) return 1;
  if (first.length < 2 || second.length < 2) return 0;

  const pairs = value => {
    const result = [];
    for (let index = 0; index < value.length - 1; index += 1) {
      result.push(value.slice(index, index + 2));
    }
    return result;
  };
  const firstPairs = pairs(first);
  const secondPairs = pairs(second);
  const remaining = [...secondPairs];
  let intersection = 0;

  firstPairs.forEach(pair => {
    const match = remaining.indexOf(pair);
    if (match >= 0) {
      intersection += 1;
      remaining.splice(match, 1);
    }
  });

  return (2 * intersection) / (firstPairs.length + secondPairs.length);
}

function nameSignal(first, second) {
  const placeTokens = [
    ...nameTokens(first.city), ...nameTokens(second.city),
    ...nameTokens(first.country), ...nameTokens(second.country)
  ];
  const isPlaceToken = token => placeTokens.some(placeToken =>
    token === placeToken ||
    (
      Math.min(token.length, placeToken.length) >= 4 &&
      token.slice(0, 4) === placeToken.slice(0, 4) &&
      diceCoefficient(token, placeToken) >= 0.6
    )
  );
  const firstTokens = nameTokens(first.event_name).filter(token => !isPlaceToken(token));
  const secondTokens = nameTokens(second.event_name).filter(token => !isPlaceToken(token));
  const firstSet = new Set(firstTokens);
  const secondSet = new Set(secondTokens);
  const commonTokens = [...firstSet].filter(token => secondSet.has(token));
  const union = new Set([...firstSet, ...secondSet]);
  const tokenScore = union.size ? commonTokens.length / union.size : 0;
  const firstCompact = firstTokens.join("");
  const secondCompact = secondTokens.join("");
  const compactMinLength = Math.min(firstCompact.length, secondCompact.length);
  const containment = compactMinLength >= 5 &&
    (firstCompact.includes(secondCompact) || secondCompact.includes(firstCompact));
  let commonPrefixLength = 0;

  while (
    commonPrefixLength < compactMinLength &&
    firstCompact[commonPrefixLength] === secondCompact[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  const characterScore = diceCoefficient(firstCompact, secondCompact);
  const score = Math.max(
    tokenScore,
    containment ? 0.94 : 0,
    commonPrefixLength >= 5 ? 0.8 : 0,
    characterScore * 0.85
  );

  return {
    score,
    token_score: tokenScore,
    character_score: characterScore,
    containment,
    common_prefix_length: commonPrefixLength,
    common_tokens: commonTokens,
    has_meaningful_token: commonTokens.some(token => token.length >= 3 && !/^\d+$/.test(token))
  };
}

function stableEventKey(event) {
  return cleanValue(event.edition_id || event.event_id || event.edition_slug) || [
    normalizeExactText(event.event_name), cleanValue(event.date),
    normalizeExactText(event.city), normalizeExactText(event.country)
  ].join("|");
}

function candidateId(first, second) {
  const pair = [stableEventKey(first), stableEventKey(second)].sort().join("\n");
  return `dup_${sha256(pair).slice(0, 20)}`;
}

function publicEvent(event) {
  return {
    event_id: cleanValue(event.event_id),
    edition_id: cleanValue(event.edition_id),
    edition_slug: cleanValue(event.edition_slug),
    event_name: cleanValue(event.event_name),
    date: cleanValue(event.date),
    city: cleanValue(event.city),
    country: cleanValue(event.country),
    event_url: eventUrl(event),
    latitude: cleanValue(event.latitude),
    longitude: cleanValue(event.longitude)
  };
}

function evidenceEvent(event) {
  return {
    key: stableEventKey(event),
    event_name: normalizeExactText(event.event_name),
    date: cleanValue(event.date),
    city: normalizeExactText(event.city),
    country: normalizeExactText(event.country),
    urls: [...canonicalEventUrls(event)].sort(),
    latitude: cleanValue(event.latitude),
    longitude: cleanValue(event.longitude)
  };
}

function evidenceSignature(first, second, reasons) {
  const events = [evidenceEvent(first), evidenceEvent(second)]
    .sort((left, right) => left.key.localeCompare(right.key));
  const reasonCodes = reasons
    .map(reason => reason.code)
    .filter(Boolean)
    .sort();

  return sha256(JSON.stringify({ events, reasons: reasonCodes }));
}

function emptyResolution() {
  return { status: "unresolved", reviewed_at: "", reviewed_by: "", note: "" };
}

function normalizeResolution(candidate) {
  const resolution = candidate && candidate.resolution;
  if (resolution && typeof resolution === "object") {
    return {
      ...emptyResolution(),
      ...resolution,
      status: cleanValue(resolution.status || "unresolved").toLowerCase()
    };
  }

  return emptyResolution();
}

function previousResolutions(report) {
  const candidates = Array.isArray(report?.candidates)
    ? report.candidates
    : Array.isArray(report?.priority_review_list)
      ? report.priority_review_list
      : [];

  return new Map(
    candidates
      .filter(candidate => cleanValue(candidate.candidate_id))
      .map(candidate => [
        candidate.candidate_id,
        {
          evidence_signature: cleanValue(candidate.evidence_signature) ||
            (Array.isArray(candidate.reasons)
              ? candidate.reasons.map(reason => reason?.code).filter(Boolean).sort().join("|")
              : ""),
          resolution: normalizeResolution(candidate)
        }
      ])
  );
}

function findDuplicateCandidates(events, options = {}) {
  const candidateMap = new Map();
  const preservedResolutions = options.previousResolutions instanceof Map
    ? options.previousResolutions
    : new Map();

  function addReason(first, second, reason) {
    const id = candidateId(first, second);
    const candidate = candidateMap.get(id) || {
      candidate_id: id,
      classification: "review_candidate",
      release_blocking: false,
      confidence: 0,
      reasons: [],
      first: publicEvent(first),
      second: publicEvent(second),
      evidence_events: [first, second]
    };

    if (!candidate.reasons.some(item => item.code === reason.code)) {
      candidate.reasons.push(reason);
    }

    candidate.release_blocking = candidate.release_blocking || reason.release_blocking;
    candidate.confidence = Math.max(candidate.confidence, reason.confidence);

    if (reason.classification === "exact_duplicate") {
      candidate.classification = reason.classification;
    } else if (candidate.classification !== "exact_duplicate" && reason.release_blocking) {
      candidate.classification = "high_confidence_duplicate";
    }

    candidateMap.set(id, candidate);
  }

  for (let firstIndex = 0; firstIndex < events.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < events.length; secondIndex += 1) {
      const first = events[firstIndex];
      const second = events[secondIndex];
      const sameCity = normalizeExactText(first.city) === normalizeExactText(second.city);
      const sameCountry = normalizeExactText(first.country) === normalizeExactText(second.country);
      const firstDate = parseDate(first.date);
      const secondDate = parseDate(second.date);
      const sameDate = Number.isFinite(firstDate) && Number.isFinite(secondDate)
        ? firstDate === secondDate
        : Boolean(cleanValue(first.date)) && cleanValue(first.date) === cleanValue(second.date);
      const dateGap = daysBetween(firstDate, secondDate);
      const distance = haversineKm(first, second);
      const signal = nameSignal(first, second);
      const firstUrls = canonicalEventUrls(first);
      const secondUrls = canonicalEventUrls(second);
      const sameUrl = [...firstUrls].some(url => secondUrls.has(url));
      const exactName = normalizeExactText(first.event_name) === normalizeExactText(second.event_name);

      if (exactName && sameCity && sameCountry && sameDate) {
        addReason(first, second, {
          code: "exact_name_date_city", confidence: 100, release_blocking: true,
          classification: "exact_duplicate",
          detail: "Name, date, city and country are identical after normalization."
        });
      }

      if (sameUrl) {
        addReason(first, second, {
          code: sameDate ? "same_url_same_date" : "shared_url_different_date",
          confidence: sameDate ? 99 : 70,
          release_blocking: sameDate,
          classification: sameDate ? "high_confidence_duplicate" : "review_candidate",
          detail: sameDate
            ? "The canonical event URL and event date are identical."
            : "The canonical URL is shared, but the dates differ; this may be a series landing page."
        });
      }

      if (
        sameDate && distance !== null && distance <= 30 &&
        (signal.score >= 0.6 || signal.containment)
      ) {
        addReason(first, second, {
          code: "similar_name_nearby_same_date",
          confidence: Math.max(92, Math.round(signal.score * 100)),
          release_blocking: true,
          classification: "high_confidence_duplicate",
          detail: `Names strongly overlap and coordinates are ${distance.toFixed(1)} km apart on the same date.`
        });
      }

      if (
        sameCity && sameCountry && dateGap !== null && dateGap <= 14 &&
        (signal.containment || signal.score >= 0.68 ||
          (signal.common_prefix_length >= 5 && signal.score >= 0.55))
      ) {
        addReason(first, second, {
          code: "similar_or_prefix_name_same_city_near_date",
          confidence: Math.max(91, Math.round(signal.score * 100)),
          release_blocking: true,
          classification: "high_confidence_duplicate",
          detail: `Names overlap in the same city and the dates are ${dateGap} day(s) apart.`
        });
      }

      if (
        distance !== null && distance <= 0.05 && dateGap !== null && dateGap <= 2 &&
        (signal.has_meaningful_token || signal.score >= 0.48)
      ) {
        addReason(first, second, {
          code: "same_coordinates_date_with_name_signal",
          confidence: Math.max(90, Math.round(signal.score * 100)),
          release_blocking: true,
          classification: "high_confidence_duplicate",
          detail: `Coordinates differ by at most 50 m, dates by ${dateGap} day(s), and the names share a meaningful signal.`
        });
      }
    }
  }

  return [...candidateMap.values()]
    .map(candidate => {
      const [firstEvidence, secondEvidence] = candidate.evidence_events;
      const currentEvidenceSignature = evidenceSignature(
        firstEvidence,
        secondEvidence,
        candidate.reasons
      );
      const previous = preservedResolutions.get(candidate.candidate_id);
      const resolution = previous?.evidence_signature === currentEvidenceSignature
        ? previous.resolution
        : emptyResolution();
      const { evidence_events: _evidenceEvents, ...publicCandidate } = candidate;

      return {
        ...publicCandidate,
        evidence_signature: currentEvidenceSignature,
        reason: candidate.reasons[0]?.code || "review_candidate",
        resolution,
        resolution_status: resolution.status
      };
    })
    .sort((first, second) =>
      Number(second.release_blocking) - Number(first.release_blocking) ||
      second.confidence - first.confidence ||
      first.candidate_id.localeCompare(second.candidate_id)
    );
}

function hasCompletedResolution(candidate) {
  const resolution = normalizeResolution(candidate);
  return NON_BLOCKING_RESOLUTIONS.has(resolution.status) &&
    Boolean(cleanValue(resolution.note)) &&
    Number.isFinite(Date.parse(resolution.reviewed_at || ""));
}

function createReport(inputPath, outputPath) {
  const inputBuffer = fs.readFileSync(inputPath);
  const events = parseCsv(inputBuffer.toString("utf8"))
    .filter(event => cleanValue(event.event_name));
  let previous = {};

  if (fs.existsSync(outputPath)) {
    try {
      previous = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    } catch (_error) {
      previous = {};
    }
  }

  const candidates = findDuplicateCandidates(events, {
    previousResolutions: previousResolutions(previous)
  });
  const exact = candidates.filter(candidate => candidate.classification === "exact_duplicate");
  const blocking = candidates.filter(candidate => candidate.release_blocking);
  const unresolvedBlocking = blocking.filter(candidate => !hasCompletedResolution(candidate));
  const output = {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    input: path.relative(ROOT, inputPath).replace(/\\/g, "/"),
    input_sha256: sha256(inputBuffer),
    events_checked: events.length,
    exact_duplicates: exact.length,
    likely_duplicates: blocking.length - exact.length,
    same_website_duplicates: candidates.filter(candidate =>
      candidate.reasons.some(reason => reason.code.startsWith("same_url") || reason.code.startsWith("shared_url"))
    ).length,
    same_coordinates_date_suspicious: candidates.filter(candidate =>
      candidate.reasons.some(reason => reason.code === "same_coordinates_date_with_name_signal")
    ).length,
    release_blocking_candidates: blocking.length,
    unresolved_release_blocking_candidates: unresolvedBlocking.length,
    candidates,
    priority_review_list: candidates.slice(0, 200)
  };

  ensureDirectoryForFile(outputPath);
  writeJsonFile(outputPath, output);
  return output;
}

function main() {
  const args = parseArgs(process.argv);
  const output = createReport(args.input, args.output);
  console.log(`Duplicate review written: ${path.relative(ROOT, args.output)}`);
  console.log(`Exact duplicates: ${output.exact_duplicates}`);
  console.log(`Release-blocking candidates: ${output.release_blocking_candidates}`);
  console.log(`Unresolved release-blocking candidates: ${output.unresolved_release_blocking_candidates}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  NON_BLOCKING_RESOLUTIONS,
  candidateId,
  createReport,
  evidenceSignature,
  findDuplicateCandidates,
  hasCompletedResolution,
  nameSignal,
  normalizeUrl,
  previousResolutions,
  sha256
};
