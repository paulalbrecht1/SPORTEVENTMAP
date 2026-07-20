const path = require("path");

const {
  cleanValue,
  ensureDirectoryForFile,
  parseCsvFile,
  writeJsonFile
} = require("./event-table-utils");

const ROOT =
  path.resolve(__dirname, "..");

const EVENTS_FILE =
  path.join(ROOT, "data", "events.csv");

const REPORT_FILE =
  path.join(ROOT, "data", "review", "duplicate-candidates.json");

function normalizeText(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(generali|bmw|nn|tcs|haspa|mainova|adac|sparkasse|volksbank|schneider|electric|datev)\b/g, " ")
    .replace(/\b(event|race|lauf|run|running|marathon|halbmarathon|half|triathlon)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeUrl(value) {
  try {
    const url =
      new URL(cleanValue(value));

    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`;
  } catch (_error) {
    return normalizeText(value);
  }
}

function parseDate(value) {
  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(cleanValue(value));

  if (!match) {
    return null;
  }

  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );
}

function daysBetween(first, second) {
  if (!first || !second) {
    return null;
  }

  return Math.abs(
    Math.round((first.getTime() - second.getTime()) / 86400000)
  );
}

function similarity(first, second) {
  const a =
    normalizeText(first);

  const b =
    normalizeText(second);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const aParts =
    new Set(a.split(" ").filter(Boolean));

  const bParts =
    new Set(b.split(" ").filter(Boolean));

  const intersection =
    [...aParts].filter(part => bParts.has(part)).length;

  const union =
    new Set([...aParts, ...bParts]).size;

  return union ? intersection / union : 0;
}

function buildCandidate(first, second, reason, confidence) {
  return {
    reason,
    confidence,
    first: {
      event_name: first.event_name,
      date: first.date,
      city: first.city,
      country: first.country,
      event_url: first.event_url,
      latitude: first.latitude,
      longitude: first.longitude
    },
    second: {
      event_name: second.event_name,
      date: second.date,
      city: second.city,
      country: second.country,
      event_url: second.event_url,
      latitude: second.latitude,
      longitude: second.longitude
    }
  };
}

function findDuplicateCandidates(events) {
  const exact = [];
  const likely = [];
  const sameWebsite = [];
  const coordinateSuspicious = [];

  for (let firstIndex = 0; firstIndex < events.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < events.length; secondIndex += 1) {
      const first =
        events[firstIndex];

      const second =
        events[secondIndex];

      const sameCity =
        normalizeText(first.city) === normalizeText(second.city);

      const sameCountry =
        normalizeText(first.country) === normalizeText(second.country);

      const dateGap =
        daysBetween(parseDate(first.date), parseDate(second.date));

      const nameSimilarity =
        similarity(first.event_name, second.event_name);

      const firstUrl =
        normalizeUrl(first.event_url);

      const secondUrl =
        normalizeUrl(second.event_url);

      const sameUrl =
        firstUrl &&
        secondUrl &&
        firstUrl === secondUrl;

      const sameCoordinates =
        cleanValue(first.latitude) &&
        cleanValue(second.latitude) &&
        cleanValue(first.longitude) &&
        cleanValue(second.longitude) &&
        cleanValue(first.latitude) === cleanValue(second.latitude) &&
        cleanValue(first.longitude) === cleanValue(second.longitude);

      if (
        normalizeExactText(first.event_name) === normalizeExactText(second.event_name) &&
        normalizeExactText(first.city) === normalizeExactText(second.city) &&
        normalizeExactText(first.country) === normalizeExactText(second.country) &&
        first.date === second.date
      ) {
        exact.push(
          buildCandidate(first, second, "exact_name_date_city", 100)
        );
        continue;
      }

      if (sameUrl) {
        sameWebsite.push(
          buildCandidate(first, second, "same_website", 92)
        );
      }

      if (
        sameCity &&
        sameCountry &&
        dateGap !== null &&
        dateGap <= 7 &&
        nameSimilarity >= 0.55
      ) {
        likely.push(
          buildCandidate(
            first,
            second,
            "similar_name_city_near_date",
            Math.round(nameSimilarity * 100)
          )
        );
      }

      if (
        sameCoordinates &&
        dateGap !== null &&
        dateGap <= 2 &&
        nameSimilarity >= 0.4
      ) {
        coordinateSuspicious.push(
          buildCandidate(
            first,
            second,
            "same_coordinates_near_date",
            Math.round(nameSimilarity * 100)
          )
        );
      }
    }
  }

  return {
    exact,
    likely,
    sameWebsite,
    coordinateSuspicious
  };
}

function main() {
  const events =
    parseCsvFile(EVENTS_FILE)
      .filter(event => cleanValue(event.event_name));

  const report =
    findDuplicateCandidates(events);

  const priorityReviewList = [
    ...report.exact,
    ...report.likely,
    ...report.sameWebsite,
    ...report.coordinateSuspicious
  ]
    .slice(0, 200);

  const output = {
    generated_at: new Date().toISOString(),
    events_checked: events.length,
    exact_duplicates: report.exact.length,
    likely_duplicates: report.likely.length,
    same_website_duplicates: report.sameWebsite.length,
    same_coordinates_date_suspicious: report.coordinateSuspicious.length,
    priority_review_list: priorityReviewList
  };

  ensureDirectoryForFile(REPORT_FILE);
  writeJsonFile(REPORT_FILE, output);

  console.log(`Duplicate review written: ${path.relative(ROOT, REPORT_FILE)}`);
  console.log(`Exact duplicates: ${output.exact_duplicates}`);
  console.log(`Likely duplicates: ${output.likely_duplicates}`);
  console.log(`Same website duplicates: ${output.same_website_duplicates}`);
  console.log(`Same coordinates/date suspicious: ${output.same_coordinates_date_suspicious}`);
}

main();
