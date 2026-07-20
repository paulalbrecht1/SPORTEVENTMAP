const fs = require("fs");
const path = require("path");

const {
  COLUMNS,
  cleanValue,
  getEventKey,
  parseCoordinate,
  parseCsvFile,
  parseGermanDate,
  writeJsonFile
} = require("./event-table-utils");

const INPUT =
  process.argv[2] || "data/events.csv";

const OUTPUT =
  process.argv[3] ||
  "data/imports/review/closed-beta-review-queue.csv";

const REPORT =
  process.argv[4] ||
  "data/imports/review/closed-beta-review-report.json";

const REVIEW_COLUMNS = [
  "review_rank",
  "review_reason",
  "review_detail",
  ...COLUMNS
];

const NON_OFFICIAL_HOSTS = [
  "ahotu.com",
  "marathon.de",
  "worldsmarathons.com",
  "racecheck.com",
  "finishers.com",
  "laufrennen.de",
  "kilometerliebe.de"
];

function escapeCsv(value) {
  const text =
    cleanValue(value);

  if (
    text.includes(";") ||
    text.includes("\"") ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function writeReviewCsv(rows) {
  fs.mkdirSync(
    path.dirname(OUTPUT),
    { recursive: true }
  );

  const lines = [
    REVIEW_COLUMNS.join(";"),
    ...rows.map(row =>
      REVIEW_COLUMNS
        .map(column => escapeCsv(row[column]))
        .join(";")
    )
  ];

  fs.writeFileSync(
    OUTPUT,
    `${lines.join("\n")}\n`,
    "utf8"
  );
}

function parseCheckedDate(value) {
  const cleaned =
    cleanValue(value);

  if (!cleaned) {
    return null;
  }

  const german =
    parseGermanDate(cleaned);

  if (german) {
    return german;
  }

  const parsed =
    new Date(cleaned);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}

function getUrlHost(value) {
  try {
    return new URL(cleanValue(value))
      .hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch (_error) {
    return "";
  }
}

function isOfficialUrl(value) {
  const host =
    getUrlHost(value);

  if (!host) {
    return false;
  }

  return !NON_OFFICIAL_HOSTS.some(domain =>
    host === domain ||
    host.endsWith(`.${domain}`)
  );
}

function hasQuestionableCoordinates(event) {
  const latitude =
    parseCoordinate(event.latitude);

  const longitude =
    parseCoordinate(event.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return true;
  }

  const address =
    cleanValue(event.address);

  return (
    !address ||
    !/\d|straße|strasse|weg|allee|platz|park|stadion|arena|zentrum|ufer|see|sportanlage|festzelt|waldbad/i
      .test(address)
  );
}

function getDistanceCategories(value) {
  const distance =
    cleanValue(value)
      .toLowerCase()
      .replace(",", ".");

  const categories =
    new Set();

  if (/half|halbmarathon|21\.?1/.test(distance)) {
    categories.add("half-marathon");
  } else if (/marathon|42\.?195/.test(distance)) {
    categories.add("marathon");
  }

  if (/(^|\D)5\s*(k|km)(\D|$)/.test(distance)) {
    categories.add("5k");
  }

  if (/(^|\D)10\s*(k|km)(\D|$)/.test(distance)) {
    categories.add("10k");
  }

  if (/ultra|50\s*km|70\s*km|100\s*(km|mile)|backyard/.test(distance)) {
    categories.add("ultra");
  }

  if (/sprint/.test(distance)) {
    categories.add("tri-sprint");
  }

  if (/olympic|olympisch|standard distance/.test(distance)) {
    categories.add("tri-olympic");
  }

  if (/70\.3|middle|mitteldistanz/.test(distance)) {
    categories.add("tri-middle");
  }

  if (
    /ironman|full distance|langdistanz/.test(distance) &&
    !/70\.3/.test(distance)
  ) {
    categories.add("tri-full");
  }

  return categories;
}

function hasClearlyDifferentDistances(first, second) {
  const firstCategories =
    getDistanceCategories(first.distance);

  const secondCategories =
    getDistanceCategories(second.distance);

  if (!firstCategories.size || !secondCategories.size) {
    return false;
  }

  return ![...firstCategories].some(category =>
    secondCategories.has(category)
  );
}

function normalizeDuplicateName(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /\b(generali|bmw|datev|mainova|tcs|adac|sparkasse|volksbank)\b/g,
      " "
    )
    .replace(
      /\b(5k|10k|half|halbmarathon|marathon|kilometer|km)\b/g,
      " "
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findDuplicateKeys(events) {
  const grouped =
    events.reduce((map, event) => {
      const key = [
        cleanValue(event.date).toLowerCase(),
        cleanValue(event.city).toLowerCase(),
        cleanValue(event.country).toLowerCase()
      ].join("|");

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key).push(event);
      return map;
    }, new Map());

  const duplicateKeys =
    new Set();

  grouped.forEach(group => {
    for (
      let firstIndex = 0;
      firstIndex < group.length;
      firstIndex += 1
    ) {
      const firstName =
        normalizeDuplicateName(
          group[firstIndex].event_name
        );

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < group.length;
        secondIndex += 1
      ) {
        const secondName =
          normalizeDuplicateName(
            group[secondIndex].event_name
          );

        if (
          firstName &&
          secondName &&
          !hasClearlyDifferentDistances(
            group[firstIndex],
            group[secondIndex]
          ) &&
          (
            firstName === secondName ||
            firstName.includes(secondName) ||
            secondName.includes(firstName)
          )
        ) {
          duplicateKeys.add(
            getEventKey(group[firstIndex])
          );
          duplicateKeys.add(
            getEventKey(group[secondIndex])
          );
        }
      }
    }
  });

  return duplicateKeys;
}

function getReviewIssues(event, duplicateKeys, today) {
  const issues = [];

  const date =
    parseGermanDate(event.date);

  const verificationStatus =
    cleanValue(event.verification_status)
      .toLowerCase();

  if (
    !date ||
    verificationStatus === "date_expected"
  ) {
    issues.push({
      rank: 1,
      reason: "date_confirmation",
      detail: "Event date is missing, invalid or expected."
    });
  }

  if (!isOfficialUrl(event.event_url)) {
    issues.push({
      rank: 2,
      reason: "official_website",
      detail: "Official organizer website is missing or an aggregator is used."
    });
  }

  const lastChecked =
    parseCheckedDate(event.last_checked);

  if (
    !lastChecked ||
    today - lastChecked >
      90 * 24 * 60 * 60 * 1000
  ) {
    issues.push({
      rank: 3,
      reason: "stale_review",
      detail: "Event has not been checked within 90 days."
    });
  }

  if (hasQuestionableCoordinates(event)) {
    issues.push({
      rank: 4,
      reason: "coordinate_precision",
      detail: "Coordinates or venue precision require review."
    });
  }

  if (
    duplicateKeys.has(
      getEventKey(event)
    )
  ) {
    issues.push({
      rank: 5,
      reason: "possible_duplicate",
      detail: "Similar event name, date and city found."
    });
  }

  if (
    !verificationStatus ||
    ["unclear", "confirmed"].includes(
      verificationStatus
    )
  ) {
    issues.push({
      rank: 6,
      reason: "registration_status",
      detail: "Registration status needs confirmation."
    });
  }

  return issues;
}

function main() {
  const events =
    parseCsvFile(INPUT);

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  const duplicateKeys =
    findDuplicateKeys(events);

  const queue =
    events
      .map(event => {
        const issues =
          getReviewIssues(
            event,
            duplicateKeys,
            today
          );

        return issues.length
          ? {
              review_rank: Math.min(
                ...issues.map(issue => issue.rank)
              ),
              review_reason: issues
                .map(issue => issue.reason)
                .join(" | "),
              review_detail: issues
                .map(issue => issue.detail)
                .join(" | "),
              ...event
            }
          : null;
      })
      .filter(Boolean)
      .sort((first, second) =>
        Number(first.review_rank) -
        Number(second.review_rank)
      );

  writeReviewCsv(queue);

  const reasonCounts =
    queue.reduce((counts, row) => {
      row.review_reason
        .split(" | ")
        .forEach(reason => {
          counts[reason] =
            (counts[reason] || 0) + 1;
        });

      return counts;
    }, {});

  writeJsonFile(
    REPORT,
    {
      generated_at:
        new Date().toISOString(),
      input: INPUT,
      output: OUTPUT,
      total_events: events.length,
      review_queue_events: queue.length,
      ready_without_review:
        events.length - queue.length,
      possible_duplicate_rows:
        duplicateKeys.size,
      by_reason: reasonCounts
    }
  );

  console.log(
    `Closed-beta review queue: ${queue.length}/${events.length} events`
  );
  console.log(`Output: ${OUTPUT}`);
  console.log(`Report: ${REPORT}`);
}

main();
