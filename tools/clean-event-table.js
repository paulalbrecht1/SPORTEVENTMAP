const {
  cleanValue,
  normalizeEvent,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

function parseArgs(argv) {
  const args = {
    input: "data/events.csv",
    out: "data/events.cleaned.csv",
    report: "data/imports/review/events-cleanup-report.json"
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--input") {
      args.input = argv[index + 1] || args.input;
      index += 1;
      continue;
    }

    if (value === "--out") {
      args.out = argv[index + 1] || args.out;
      index += 1;
      continue;
    }

    if (value === "--report") {
      args.report = argv[index + 1] || args.report;
      index += 1;
    }
  }

  return args;
}

function text(value) {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateLocationKey(event) {
  return [
    text(event.date),
    text(event.city),
    text(event.country)
  ].join("|");
}

function duplicateName(event) {
  const city = text(event.city);

  return text(event.event_name)
    .replace(/\b(generali|mainova|adidas|bmw|sparkasse|volksbank|wvv|swb|haspa|aok|lowa|gutsmuths)\b/g, " ")
    .replace(/\bhalbmarathon\b/g, "marathon")
    .replace(/\bhalf marathon\b/g, "marathon")
    .replace(/\bnacht marathon\b/g, "nachtmarathon")
    .replace(/\bnacht marathonlauf\b/g, "nachtmarathon")
    .replace(new RegExp(`\\b${city}er\\b`, "g"), city)
    .replace(/\s+/g, " ")
    .trim();
}

function formatKm(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "";
  }

  return Number.isInteger(number)
    ? `${number} km`
    : `${number.toFixed(1).replace(/\.0$/, "")} km`;
}

function distanceParts(value) {
  const source = cleanValue(value);
  const normalized = source
    .toLowerCase()
    .replace(/,/g, ".");

  const parts = [];

  if (/backyard/.test(normalized)) {
    parts.push("Backyard Ultra");
  }

  const hourMatches = normalized.matchAll(/\b(\d{1,2})\s?h\b/g);
  for (const match of hourMatches) {
    parts.push(`${match[1]}h Ultramarathon`);
  }

  const mileMatches = normalized.matchAll(/\b(\d{2,3}(?:\.\d+)?)\s?miles?\b/g);
  for (const match of mileMatches) {
    const miles = Number(match[1]);

    if (Number.isFinite(miles)) {
      parts.push(`${miles} Miles / ${Math.round(miles * 1.60934)} km`);
    }
  }

  if (/\bhalf marathon\b|\bhalbmarathon\b/i.test(source)) {
    parts.push("Half Marathon");
  }

  const withoutHalf = normalized
    .replace(/\bhalf marathon\b/g, " ")
    .replace(/\bhalbmarathon\b/g, " ");

  if (/\bmarathon\b/.test(withoutHalf)) {
    parts.push("Marathon");
  }

  const kmMatches = normalized.matchAll(/\b(\d+(?:\.\d+)?)\s?(?:km|kilometer|k)\b/g);
  for (const match of kmMatches) {
    const km = Number(match[1]);

    if (!Number.isFinite(km)) {
      continue;
    }

    if (km >= 4.8 && km <= 5.2) {
      parts.push("5 km");
      continue;
    }

    if (km >= 9.5 && km <= 10.5) {
      parts.push("10 km");
      continue;
    }

    if (km >= 20 && km <= 22.5) {
      parts.push("Half Marathon");
      continue;
    }

    if (km >= 40 && km <= 45) {
      parts.push("Marathon");
      continue;
    }

    parts.push(formatKm(km));
  }

  return parts.filter(Boolean);
}

function distanceSortValue(part) {
  const fixedOrder = {
    "5 km": 5,
    "10 km": 10,
    "Half Marathon": 21,
    Marathon: 42,
    "Backyard Ultra": 10000
  };

  if (fixedOrder[part] !== undefined) {
    return fixedOrder[part];
  }

  const kmMatch = /(\d+(?:\.\d+)?)\s?km/i.exec(part);
  if (kmMatch) {
    return Number(kmMatch[1]);
  }

  const hourMatch = /(\d{1,2})h/i.exec(part);
  if (hourMatch) {
    return 9000 + Number(hourMatch[1]);
  }

  return 9999;
}

function mergeDistances(first, second) {
  const merged = [
    ...distanceParts(first),
    ...distanceParts(second)
  ];

  return [...new Set(merged)]
    .sort((a, b) => distanceSortValue(a) - distanceSortValue(b))
    .join(", ");
}

function score(event) {
  let value = 0;

  Object.values(event).forEach(field => {
    if (cleanValue(field)) {
      value += 1;
    }
  });

  if (!/marathon\.de\/laufevent/i.test(event.event_url)) {
    value += 4;
  }

  if (/official|kilometerliebe|google/i.test(event.data_source)) {
    value += 1;
  }

  if (/generali|nachtmarathon|koeln-marathon/i.test(event.event_url)) {
    value += 2;
  }

  return value;
}

function normalizeCategory(event) {
  const combined = text(
    `${event.event_name} ${event.distance} ${event.sport}`
  );

  if (
    /backyard|ultra|trail|\b\d{1,2}h\b|miles|\b5[0-9] km\b|\b[6-9][0-9] km\b|\b1[0-9]{2} km\b/.test(combined)
  ) {
    event.sport = "Ultramarathon";
  }

  return event;
}

function isDuplicate(first, second) {
  if (dateLocationKey(first) !== dateLocationKey(second)) {
    return false;
  }

  const firstName = duplicateName(first);
  const secondName = duplicateName(second);

  if (!firstName || !secondName) {
    return false;
  }

  return (
    firstName === secondName ||
    firstName.includes(secondName) ||
    secondName.includes(firstName)
  );
}

function mergeEvents(first, second) {
  const primary = score(second) > score(first)
    ? second
    : first;

  const secondary = primary === second
    ? first
    : second;

  return normalizeCategory(
    normalizeEvent({
      ...secondary,
      ...primary,
      distance: mergeDistances(first.distance, second.distance) ||
        primary.distance ||
        secondary.distance,
      description: primary.description || secondary.description,
      data_source: [
        primary.data_source,
        secondary.data_source
      ]
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
        .join(" + ")
    })
  );
}

function main() {
  const args = parseArgs(process.argv);

  const rows = parseCsvFile(args.input)
    .map(row => normalizeCategory(normalizeEvent(row)));

  const cleaned = [];
  const merged = [];

  rows.forEach(row => {
    const index = cleaned.findIndex(existing =>
      isDuplicate(existing, row)
    );

    if (index === -1) {
      cleaned.push(row);
      return;
    }

    const before = cleaned[index];
    const after = mergeEvents(before, row);

    cleaned[index] = after;

    merged.push({
      kept: after.event_name,
      merged: row.event_name,
      date: after.date,
      city: after.city,
      distance: after.distance
    });
  });

  writeCsvFile(args.out, cleaned);
  writeJsonFile(args.report, {
    generated_at: new Date().toISOString(),
    input_rows: rows.length,
    output_rows: cleaned.length,
    merged_rows: merged.length,
    merged
  });

  console.log(`Input rows: ${rows.length}`);
  console.log(`Output rows: ${cleaned.length}`);
  console.log(`Merged rows: ${merged.length}`);
}

main();
