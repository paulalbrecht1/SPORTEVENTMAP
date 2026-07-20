const {
  collectCsvFiles,
  dedupeEvents,
  geocodeMissingCoordinates,
  getEventQualityIssue,
  getValidationErrors,
  normalizeEvent,
  parseCsvFile,
  writeCsvFile,
  writeJsonFile
} = require("./event-table-utils");

function parseArgs(argv) {
  const args = {
    inputs: [],
    out: "data/events.generated.csv",
    reviewOut: "data/imports/review/events.review.csv",
    excludedOut: "data/imports/review/events.excluded.csv",
    report: "data/imports/review/events-report.json",
    geocode: false,
    geocodeLimit: 100,
    geocodeCache: "data/imports/geocoding-cache.json",
    publish: false,
    includeDefaultImports: true
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--out") {
      args.out = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--review-out") {
      args.reviewOut = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--excluded-out") {
      args.excludedOut = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--report") {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--geocode") {
      args.geocode = true;
      continue;
    }

    if (value === "--geocode-limit") {
      args.geocodeLimit =
        Number(argv[index + 1] || 100);
      index += 1;
      continue;
    }

    if (value === "--geocode-cache") {
      args.geocodeCache =
        argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--publish") {
      args.publish = true;
      args.out = "data/events.csv";
      continue;
    }

    if (value === "--no-default-imports") {
      args.includeDefaultImports = false;
      continue;
    }

    args.inputs.push(value);
  }

  if (!args.inputs.length) {
    args.inputs.push("data/events.csv");
  }

  if (args.includeDefaultImports) {
    args.inputs.push("data/imports/normalized");
  }

  return args;
}

function partitionEvents(events) {
  const ready = [];
  const review = [];

  events.forEach(event => {
    const errors =
      getValidationErrors(
        event,
        {
          requireCoordinates: true
        }
      );

    if (errors.length) {
      review.push({
        ...event,
        description:
          event.description ||
          `Needs review: ${errors.join(", ")}`
      });

      return;
    }

    ready.push(event);
  });

  return {
    ready,
    review
  };
}

function splitQualityEvents(events) {
  const accepted = [];
  const excluded = [];

  events.forEach(event => {
    const qualityIssue =
      getEventQualityIssue(event);

    if (qualityIssue) {
      excluded.push({
        ...event,
        description:
          event.description ||
          `Excluded: ${qualityIssue}`
      });

      return;
    }

    accepted.push(event);
  });

  return {
    accepted,
    excluded
  };
}

async function main() {
  const args =
    parseArgs(process.argv);

  const files =
    collectCsvFiles(args.inputs);

  if (!files.length) {
    throw new Error(
      "No CSV input files found."
    );
  }

  const importedEvents =
    files.flatMap(file =>
      parseCsvFile(file).map(event =>
        normalizeEvent(event)
      )
    );

  const uniqueEvents =
    dedupeEvents(importedEvents);

  const {
    accepted,
    excluded
  } = splitQualityEvents(uniqueEvents);

  if (args.geocode) {
    await geocodeMissingCoordinates(
      accepted,
      {
        limit: args.geocodeLimit,
        cachePath: args.geocodeCache
      }
    );
  }

  const {
    ready,
    review
  } = partitionEvents(accepted);

  const duplicateRows =
    importedEvents.length - uniqueEvents.length;

  const missingCoordinates =
    accepted.filter(event =>
      getValidationErrors(event, {
        requireCoordinates: true
      }).includes("Missing coordinates")
    ).length;

  const invalidDates =
    accepted.filter(event =>
      getValidationErrors(event)
        .some(error =>
          error.includes("Date must be")
        )
    ).length;

  writeCsvFile(
    args.out,
    ready
  );

  writeCsvFile(
    args.reviewOut,
    review
  );

  writeCsvFile(
    args.excludedOut,
    excluded
  );

  writeJsonFile(
    args.report,
    {
      generated_at:
        new Date().toISOString(),
      inputs: files,
      total_input_events:
        importedEvents.length,
      total_rows:
        importedEvents.length,
      unique_events:
        uniqueEvents.length,
      duplicate_rows:
        duplicateRows,
      ready_events:
        ready.length,
      valid_rows:
        ready.length,
      review_events:
        review.length,
      excluded_events:
        excluded.length,
      missing_coordinates:
        missingCoordinates,
      invalid_dates:
        invalidDates,
      output:
        args.out,
      review_output:
        args.reviewOut,
      excluded_output:
        args.excludedOut,
      geocode_cache:
        args.geocodeCache,
      published:
        args.publish
    }
  );

  console.log(
    `Ready events: ${ready.length}`
  );

  console.log(
    `Review events: ${review.length}`
  );

  console.log(
    `Excluded non-events: ${excluded.length}`
  );

  console.log(
    `Wrote ready CSV: ${args.out}`
  );

  console.log(
    `Wrote review CSV: ${args.reviewOut}`
  );

  console.log(
    `Wrote excluded CSV: ${args.excludedOut}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
