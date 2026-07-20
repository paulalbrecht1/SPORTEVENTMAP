const {
  cleanValue,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

function parseArgs(argv) {
  return {
    input: argv[2] || "data/events.csv",
    out:
      argv[3] ||
      "data/imports/review/event-review-queue.csv",
    report:
      argv[4] ||
      "data/imports/review/event-review-queue-report.json"
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

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);

  return date;
}

function priorityWeight(value) {
  const priority =
    cleanValue(value);

  if (priority === "high") {
    return 1;
  }

  if (priority === "medium") {
    return 2;
  }

  return 3;
}

function statusWeight(value) {
  const status =
    cleanValue(value);

  if (
    status === "date_expected" ||
    status === "unclear"
  ) {
    return 1;
  }

  if (status === "registration_open") {
    return 2;
  }

  return 3;
}

function isDue(event, today) {
  const nextCheck =
    parseGermanDate(event.next_check);

  if (!nextCheck) {
    return true;
  }

  return nextCheck <= today;
}

function main() {
  const args =
    parseArgs(process.argv);

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  const events =
    parseCsvFile(args.input);

  const queue =
    events
      .filter(event =>
        isDue(event, today) ||
        cleanValue(event.verification_status) === "date_expected" ||
        cleanValue(event.verification_status) === "unclear"
      )
      .sort((first, second) => {
        const priorityDiff =
          priorityWeight(first.priority) -
          priorityWeight(second.priority);

        if (priorityDiff) {
          return priorityDiff;
        }

        const statusDiff =
          statusWeight(first.verification_status) -
          statusWeight(second.verification_status);

        if (statusDiff) {
          return statusDiff;
        }

        const firstDate =
          parseGermanDate(first.next_check) ||
          new Date(0);

        const secondDate =
          parseGermanDate(second.next_check) ||
          new Date(0);

        return firstDate - secondDate;
      });

  writeCsvFile(
    args.out,
    queue
  );

  writeJsonFile(
    args.report,
    {
      generated_at: new Date().toISOString(),
      input: args.input,
      output: args.out,
      total_events: events.length,
      review_queue_events: queue.length,
      high_priority_due:
        queue.filter(event =>
          cleanValue(event.priority) === "high"
        ).length,
      date_expected:
        queue.filter(event =>
          cleanValue(event.verification_status) === "date_expected"
        ).length,
      unclear:
        queue.filter(event =>
          cleanValue(event.verification_status) === "unclear"
        ).length
    }
  );

  console.log(`Review queue events: ${queue.length}`);
  console.log(`Output: ${args.out}`);
}

main();
