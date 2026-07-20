const fs = require("fs");
const path = require("path");
const { parseCsvFile } = require("./event-table-utils.js");
const {
  AUDIT_JSON_PATH,
  EVENTS_PATH,
  FIELD_GROUPS,
  KNOWLEDGE_FIELDS,
  REVIEW_JSON_PATH,
  ROOT,
  buildAuditRows,
  cleanValue,
  readJson,
  writeAuditFiles
} = require("./event-knowledge-workflow.js");

function parseArgs(argv) {
  return argv.reduce((options, arg, index) => {
    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] || 0);
    }

    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=")[1] || 0);
    }

    if (arg === "--priority") {
      options.priority = cleanValue(argv[index + 1]).toLowerCase();
    }

    if (arg.startsWith("--priority=")) {
      options.priority = cleanValue(arg.split("=")[1]).toLowerCase();
    }

    return options;
  }, {
    limit: 25,
    priority: "high"
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getSourceUrl(event, auditRow) {
  return cleanValue(
    event.source_url ||
    event.event_url ||
    auditRow.source_url ||
    auditRow.official_url
  );
}

function fieldCandidateFromCsv(field, event, auditRow) {
  const sourceUrl =
    getSourceUrl(event, auditRow);

  if (!sourceUrl) {
    return null;
  }

  if (field === "registration_status" && cleanValue(event.verification_status)) {
    return {
      value: cleanValue(event.verification_status),
      source_url: sourceUrl,
      confidence: sourceUrl === cleanValue(event.event_url) ? 0.65 : 0.7,
      verification_status: "needs_review",
      last_checked: cleanValue(event.last_checked) || todayIso(),
      note: "Imported from data/events.csv registration status. Requires manual confirmation before publishing."
    };
  }

  if (field === "sources") {
    return {
      value: sourceUrl,
      source_url: sourceUrl,
      confidence: 0.7,
      verification_status: "needs_review",
      last_checked: cleanValue(event.last_checked) || todayIso(),
      note: "Seed source from data/events.csv. Use this as the first research source."
    };
  }

  return null;
}

function emptyField(field) {
  return {
    value: "",
    source_url: "",
    confidence: 0,
    verification_status: "needs_research",
    last_checked: "",
    note: `Research required for ${field}. Do not publish without an official or trusted source.`
  };
}

function createFieldReview(field, event, auditRow) {
  return fieldCandidateFromCsv(field, event, auditRow) ||
    emptyField(field);
}

function setNestedValue(target, pathExpression, value) {
  const parts =
    pathExpression.split(".");
  const leaf =
    parts.pop();
  const parent =
    parts.reduce((object, key) => {
      object[key] =
        object[key] || {};
      return object[key];
    }, target);

  parent[leaf] =
    value;
}

function buildSupabasePayload(event, auditRow, fields) {
  const payload = {
    details: {
      event_slug: auditRow.event_slug,
      event_name: auditRow.event_name,
      sport_type: auditRow.sport,
      date: auditRow.date,
      city: auditRow.city,
      country: auditRow.country,
      official_website: cleanValue(event.event_url),
      registration_url: cleanValue(event.event_url),
      verification_status: "needs_review",
      is_public: false,
      last_checked: todayIso()
    },
    registration: {},
    course: {},
    race_day: {},
    travel: {},
    weather: {},
    statistics: {},
    editorial: {},
    sources: [],
    faq: []
  };

  Object.entries(fields)
    .forEach(([field, review]) => {
      if (
        !cleanValue(review.value) ||
        !cleanValue(review.source_url) ||
        review.verification_status === "needs_research"
      ) {
        return;
      }

      if (field === "sources") {
        payload.sources.push({
          source_label: "Research seed source",
          source_url: review.source_url,
          source_type: "official",
          last_verified: review.last_checked || todayIso(),
          confidence_score: review.confidence,
          verification_note: review.note
        });
        return;
      }

      const target =
        FIELD_GROUPS[field]?.target;

      if (target && target !== "faq") {
        setNestedValue(payload, target, review.value);
      }
    });

  if (!payload.sources.length) {
    const sourceUrl =
      getSourceUrl(event, auditRow);

    if (sourceUrl) {
      payload.sources.push({
        source_label: "Official event source",
        source_url: sourceUrl,
        source_type: "official",
        last_verified: cleanValue(event.last_checked) || todayIso(),
        confidence_score: 0.65,
        verification_note: "Seed source only. Manual review required before publishing."
      });
    }
  }

  return payload;
}

function createResearchTask(event, auditRow) {
  const fields =
    auditRow.missing_fields.reduce((map, field) => {
      map[field] =
        createFieldReview(field, event, auditRow);
      return map;
    }, {});

  return {
    event_slug: auditRow.event_slug,
    event_name: auditRow.event_name,
    date: auditRow.date,
    city: auditRow.city,
    country: auditRow.country,
    sport: auditRow.sport,
    distance: auditRow.distance,
    priority: auditRow.priority,
    completion_score: auditRow.completion_score,
    missing_fields: auditRow.missing_fields,
    research_sources: [
      cleanValue(event.event_url),
      cleanValue(event.source_url)
    ].filter(Boolean),
    instructions: [
      "Use official organizer pages first.",
      "Add values only when a source_url is available.",
      "Mark uncertain values as needs_review.",
      "Keep is_public=false until manual approval in the Admin Knowledge workflow."
    ],
    fields,
    supabase_payload: buildSupabasePayload(event, auditRow, fields),
    created_at: new Date().toISOString()
  };
}

function loadAuditRows(events) {
  const audit =
    readJson(AUDIT_JSON_PATH, null);

  if (audit && Array.isArray(audit.events)) {
    return audit.events;
  }

  const rows =
    buildAuditRows(events);

  writeAuditFiles(rows);
  return rows;
}

function main() {
  const options =
    parseArgs(process.argv.slice(2));
  const events =
    parseCsvFile(EVENTS_PATH);
  const auditRows =
    loadAuditRows(events);
  const eventsBySlug =
    new Map(
      auditRows.map((row, index) => [
        row.event_slug,
        events[index] || {}
      ])
    );
  const priority =
    options.priority || "high";
  const selected =
    auditRows
      .filter(row =>
        row.priority === priority &&
        Number(row.missing_count || 0) > 0
      )
      .sort((first, second) =>
        first.completion_score - second.completion_score ||
        first.event_name.localeCompare(second.event_name)
      )
      .slice(0, options.limit > 0 ? options.limit : auditRows.length);

  const tasks =
    selected.map(row =>
      createResearchTask(
        eventsBySlug.get(row.event_slug) || {},
        row
      )
    );

  const review = {
    generated_at: new Date().toISOString(),
    priority,
    limit: options.limit,
    total_tasks: tasks.length,
    policy: {
      publish_directly: false,
      required_manual_review: true,
      public_rule: "Only manually verified or approved records may be saved with is_public=true."
    },
    tasks
  };

  fs.writeFileSync(
    REVIEW_JSON_PATH,
    `${JSON.stringify(review, null, 2)}\n`,
    "utf8"
  );

  console.log(`Created ${tasks.length} ${priority}-priority Event Knowledge review task(s).`);
  console.log(`Wrote ${path.relative(ROOT, REVIEW_JSON_PATH)}.`);
}

main();
