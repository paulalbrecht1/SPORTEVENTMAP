const {
  cleanValue,
  normalizeEvent,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out: argv[3] || "data/events.with-quality-fields.csv",
    report:
      argv[4] ||
      "data/imports/review/event-quality-fields-report.json"
  };
}

function parseGermanDate(value) {
  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
      cleanValue(value)
    );

  if (!match) {
    return null;
  }

  const date =
    new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );

  if (
    date.getFullYear() !== Number(match[3]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[1])
  ) {
    return null;
  }

  date.setHours(0, 0, 0, 0);

  return date;
}

function formatDate(date) {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear())
  ].join(".");
}

function addDays(date, days) {
  const result =
    new Date(date);

  result.setDate(
    result.getDate() + days
  );

  return result;
}

function getPriority(event) {
  const text =
    `${event.event_name} ${event.sport} ${event.distance}`
      .toLowerCase();

  const highSignals = [
    "berlin marathon",
    "hamburg marathon",
    "köln marathon",
    "koln marathon",
    "frankfurt marathon",
    "münchen marathon",
    "munich marathon",
    "ironman",
    "challenge roth",
    "berliner halbmarathon",
    "köln triathlon",
    "koeln triathlon"
  ];

  if (
    highSignals.some(signal =>
      text.includes(signal)
    )
  ) {
    return "high";
  }

  if (
    event.sport === "Triathlon" ||
    event.sport === "Ultramarathon" ||
    /marathon|half marathon|halbmarathon|70\.3|full|middle/i.test(text)
  ) {
    return "medium";
  }

  return "low";
}

function getCheckFrequency(priority) {
  if (priority === "high") {
    return "weekly";
  }

  if (priority === "medium") {
    return "monthly";
  }

  return "quarterly";
}

function getNextCheckDate(today, frequency) {
  if (frequency === "weekly") {
    return addDays(today, 7);
  }

  if (frequency === "monthly") {
    return addDays(today, 30);
  }

  return addDays(today, 90);
}

function getVerificationStatus(event, today) {
  const date =
    parseGermanDate(event.date);

  if (!date) {
    return "unclear";
  }

  if (date < today) {
    return "date_expected";
  }

  if (/anmeldung|registration|register|raceresult/i.test(event.event_url)) {
    return "registration_open";
  }

  return "confirmed";
}

function getSourceNote(event) {
  if (/ironman\.com/i.test(event.event_url)) {
    return "Official IRONMAN event page.";
  }

  if (/laufrennen discovery/i.test(event.data_source)) {
    return "Official organizer URL discovered from Laufrennen detail page.";
  }

  if (/kilometerliebe/i.test(event.data_source)) {
    return "Official organizer URL discovered from Kilometerliebe listing.";
  }

  if (/marathon\.de/i.test(event.data_source)) {
    return "Official organizer URL reviewed from marathon.de discovery data.";
  }

  if (/official|google/i.test(event.data_source)) {
    return "Official event website reviewed during data import.";
  }

  return "Event source prepared for future verification.";
}

function enrichEvent(rawEvent, today) {
  const event =
    normalizeEvent(rawEvent);

  const priority =
    cleanValue(event.priority) ||
    getPriority(event);

  const checkFrequency =
    cleanValue(event.check_frequency) ||
    getCheckFrequency(priority);

  const status =
    cleanValue(event.verification_status) ||
    getVerificationStatus(event, today);

  return normalizeEvent({
    ...event,
    source_url:
      cleanValue(event.source_url) ||
      cleanValue(event.event_url),
    verification_status: status,
    priority,
    check_frequency: checkFrequency,
    last_checked:
      cleanValue(event.last_checked) ||
      formatDate(today),
    next_check:
      cleanValue(event.next_check) ||
      formatDate(
        getNextCheckDate(
          today,
          checkFrequency
        )
      ),
    source_note:
      cleanValue(event.source_note) ||
      getSourceNote(event)
  });
}

function main() {
  const args =
    parseArgs(process.argv);

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  const events =
    parseCsvFile(args.input)
      .map(event =>
        enrichEvent(event, today)
      );

  const statusCounts =
    {};

  const priorityCounts =
    {};

  events.forEach(event => {
    statusCounts[event.verification_status] =
      (statusCounts[event.verification_status] || 0) + 1;

    priorityCounts[event.priority] =
      (priorityCounts[event.priority] || 0) + 1;
  });

  writeCsvFile(
    args.out,
    events
  );

  writeJsonFile(
    args.report,
    {
      generated_at: new Date().toISOString(),
      input: args.input,
      output: args.out,
      rows: events.length,
      status_counts: statusCounts,
      priority_counts: priorityCounts
    }
  );

  console.log(`Rows enriched: ${events.length}`);
  console.log("Status counts:", statusCounts);
  console.log("Priority counts:", priorityCounts);
  console.log(`Output: ${args.out}`);
}

main();
