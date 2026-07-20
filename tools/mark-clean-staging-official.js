const {
  cleanValue,
  ensureDirectoryForFile,
  parseCsvFile
} = require("./event-table-utils");

const fs = require("fs");

const AGGREGATOR_DOMAINS = [
  "ahotu.com",
  "finishers.com",
  "laufkalender24.de",
  "laufrennen.de",
  "marathon.de",
  "racecheck.com",
  "runsignup.com",
  "worldsmarathons.com"
];

function getHostname(value) {
  try {
    return new URL(cleanValue(value))
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
}

function isOfficialUrl(value) {
  const hostname =
    getHostname(value);

  return Boolean(hostname) &&
    !AGGREGATOR_DOMAINS.some(domain =>
      hostname === domain ||
      hostname.endsWith(`.${domain}`)
    );
}

function isAllowedReviewReason(value) {
  const reasons =
    cleanValue(value)
      .split(",")
      .map(reason => reason.trim())
      .filter(Boolean);

  return reasons.every(reason =>
    reason === "source_type_not_official"
  );
}

function isCleanOfficialCandidate(row) {
  return (
    cleanValue(row.event_name) &&
    cleanValue(row.date) &&
    cleanValue(row.city) &&
    cleanValue(row.country) &&
    cleanValue(row.distance) &&
    cleanValue(row.distance_category) &&
    cleanValue(row.latitude) &&
    cleanValue(row.longitude) &&
    isOfficialUrl(row.official_website || row.event_url || row.source_url) &&
    isAllowedReviewReason(row.review_reason)
  );
}

function escapeCsvValue(value) {
  const text =
    cleanValue(value);

  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function writeRowsWithColumns(filePath, rows) {
  const columns =
    Object.keys(rows[0] || {});

  ensureDirectoryForFile(filePath);

  fs.writeFileSync(
    filePath,
    [
      columns.join(";"),
      ...rows.map(row =>
        columns
          .map(column =>
            escapeCsvValue(row[column])
          )
          .join(";")
      )
    ].join("\n") + "\n",
    "utf8"
  );
}

function main() {
  const input =
    process.argv[2];

  const output =
    process.argv[3] || input;

  if (!input) {
    throw new Error("Usage: node tools/mark-clean-staging-official.js input.csv [output.csv]");
  }

  const rows =
    parseCsvFile(input);

  let marked = 0;

  const updated =
    rows.map(row => {
      if (!isCleanOfficialCandidate(row)) {
        return row;
      }

      marked += 1;

      return {
        ...row,
        source_type: "official",
        review_status: "pending",
        review_reason: "",
        review_note:
          row.review_note ||
          "Official-looking organizer URL, future date, distance and coordinates passed automated promotion checks.",
        last_checked:
          row.last_checked ||
          new Date().toISOString().slice(0, 10)
      };
    });

  writeRowsWithColumns(
    output,
    updated
  );

  console.log(`Marked ${marked} clean staging rows as official.`);
}

main();
