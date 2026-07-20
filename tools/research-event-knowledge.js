const fs = require("fs");
const path = require("path");
const { parseCsvFile } = require("./event-table-utils.js");
const {
  AUDIT_JSON_PATH,
  EVENTS_PATH,
  FIELD_GROUPS,
  RESEARCH_STATUS_JSON_PATH,
  REVIEW_JSON_PATH,
  ROOT,
  buildAuditRows,
  cleanValue,
  readJson,
  writeAuditFiles
} = require("./event-knowledge-workflow.js");

const RESEARCHABLE_FIELDS = [
  "entry_fee",
  "cutoff",
  "start_time",
  "elevation",
  "sources"
];

const SCOPE_FIELD_MAP = {
  "missing-entry-fee": "entry_fee",
  "missing_entry_fee": "entry_fee",
  "entry_fee": "entry_fee",
  "missing-cutoff": "cutoff",
  "missing_cutoff": "cutoff",
  "cutoff": "cutoff",
  "missing-start-time": "start_time",
  "missing_start_time": "start_time",
  "start_time": "start_time",
  "missing-elevation": "elevation",
  "missing_elevation": "elevation",
  "elevation": "elevation",
  "missing-sources": "sources",
  "missing_sources": "sources",
  "sources": "sources"
};

function parseArgs(argv) {
  return argv.reduce((options, arg, index) => {
    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] || 0);
    }

    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=")[1] || 0);
    }

    if (arg === "--scope") {
      options.scope = cleanValue(argv[index + 1]).toLowerCase();
    }

    if (arg.startsWith("--scope=")) {
      options.scope = cleanValue(arg.split("=")[1]).toLowerCase();
    }

    if (arg === "--priority") {
      options.priority = cleanValue(argv[index + 1]).toLowerCase();
    }

    if (arg.startsWith("--priority=")) {
      options.priority = cleanValue(arg.split("=")[1]).toLowerCase();
    }

    if (arg === "--event-slug") {
      options.eventSlug = cleanValue(argv[index + 1]);
    }

    if (arg.startsWith("--event-slug=")) {
      options.eventSlug = cleanValue(arg.split("=")[1]);
    }

    return options;
  }, {
    limit: 10,
    scope: "high",
    priority: "high",
    eventSlug: ""
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function writeStatus(status) {
  fs.writeFileSync(
    RESEARCH_STATUS_JSON_PATH,
    `${JSON.stringify(status, null, 2)}\n`,
    "utf8"
  );
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

function getSourceUrl(event, auditRow) {
  return cleanValue(
    event.source_url ||
    event.event_url ||
    auditRow.source_url ||
    auditRow.official_url
  );
}

function selectRows(auditRows, options) {
  const scope =
    options.scope || "high";
  const field =
    SCOPE_FIELD_MAP[scope] || "";

  let rows =
    auditRows.filter(row =>
      Number(row.missing_count || 0) > 0
    );

  if (scope === "current") {
    if (!options.eventSlug) {
      throw new Error("Scope current requires --event-slug.");
    }

    rows =
      rows.filter(row => row.event_slug === options.eventSlug);
  } else if (scope === "all") {
    rows = rows;
  } else if (field) {
    rows =
      rows.filter(row =>
        (row.missing_fields || []).includes(field)
      );
  } else {
    rows =
      rows.filter(row =>
        row.priority === (options.priority || "high")
      );
  }

  return rows
    .sort((first, second) =>
      Number(first.completion_score || 0) - Number(second.completion_score || 0) ||
      String(first.event_name || "").localeCompare(String(second.event_name || ""))
    )
    .slice(0, options.limit > 0 ? options.limit : rows.length);
}

function decodeEntities(value) {
  return cleanValue(value)
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "EUR")
    .replace(/&#8364;/g, "EUR")
    .replace(/&uuml;/g, "ue")
    .replace(/&Uuml;/g, "Ue")
    .replace(/&ouml;/g, "oe")
    .replace(/&Ouml;/g, "Oe")
    .replace(/&auml;/g, "ae")
    .replace(/&Auml;/g, "Ae")
    .replace(/&szlig;/g, "ss");
}

function extractTitle(html, sourceUrl) {
  const match =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  if (match) {
    return decodeEntities(
      match[1].replace(/\s+/g, " ")
    ).slice(0, 140);
  }

  try {
    return new URL(sourceUrl).hostname;
  } catch (_error) {
    return sourceUrl;
  }
}

function htmlToSegments(html) {
  const text =
    decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|li|h[1-6]|tr|div|section)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    );

  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map(segment => segment.replace(/\s+/g, " ").trim())
    .filter(segment => segment.length >= 8 && segment.length <= 280);
}

async function fetchSource(sourceUrl) {
  const controller =
    new AbortController();
  const timeout =
    setTimeout(() => controller.abort(), 15000);

  try {
    const response =
      await fetch(sourceUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "SportEventMapResearchBot/0.1 (+https://sporteventmap.com)"
        }
      });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html =
      await response.text();

    return {
      html,
      title: extractTitle(html, sourceUrl),
      segments: htmlToSegments(html)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function findSegment(segments, keywordPattern, valuePattern) {
  return segments.find(segment =>
    keywordPattern.test(segment) &&
    valuePattern.test(segment)
  ) || "";
}

function compactValue(segment, pattern) {
  const match =
    pattern.exec(segment);

  if (!match) {
    return segment;
  }

  return cleanValue(match[0]);
}

function createProposal(auditRow, field, suggestedValue, sourceUrl, sourceTitle, confidence, excerpt) {
  return {
    event_id: auditRow.event_slug,
    event_slug: auditRow.event_slug,
    field_name: field,
    suggested_value: suggestedValue,
    value: suggestedValue,
    source_url: sourceUrl,
    source_title: sourceTitle,
    confidence,
    verification_status: "needs_review",
    last_checked: todayIso(),
    source_excerpt: excerpt,
    note: `Auto-researched candidate for ${field}. Manual review required before publishing.`
  };
}

function researchField(field, auditRow, sourceUrl, sourceTitle, segments) {
  if (!sourceUrl) {
    return null;
  }

  if (field === "sources") {
    return createProposal(
      auditRow,
      field,
      sourceUrl,
      sourceUrl,
      sourceTitle,
      0.72,
      "Official/source URL from event database."
    );
  }

  if (field === "entry_fee") {
    const segment =
      findSegment(
        segments,
        /startgeld|entry fee|registration fee|teilnahmebeitrag|gebuehr|gebühr|preis|kosten|cost/i,
        /(?:\d{1,4}(?:[,.]\d{2})?\s?(?:eur|€)|(?:eur|€)\s?\d{1,4})/i
      );

    if (!segment) {
      return null;
    }

    return createProposal(
      auditRow,
      field,
      compactValue(segment, /(?:\d{1,4}(?:[,.]\d{2})?\s?(?:eur|€)|(?:eur|€)\s?\d{1,4})/i),
      sourceUrl,
      sourceTitle,
      0.62,
      segment
    );
  }

  if (field === "cutoff") {
    const segment =
      findSegment(
        segments,
        /cut[\s-]?off|time limit|zielschluss|zeitlimit|schlusszeit|kontrollschluss/i,
        /\b(?:\d{1,2}[:.]\d{2}|\d{1,2}\s?(?:h|std|stunden|hours))\b/i
      );

    if (!segment) {
      return null;
    }

    return createProposal(
      auditRow,
      field,
      segment,
      sourceUrl,
      sourceTitle,
      0.66,
      segment
    );
  }

  if (field === "start_time") {
    const segment =
      findSegment(
        segments,
        /startzeit|start time|startschuss|\bstart\b/i,
        /\b(?:[01]?\d|2[0-3])[:.]\d{2}\b/
      );

    if (!segment) {
      return null;
    }

    return createProposal(
      auditRow,
      field,
      compactValue(segment, /\b(?:[01]?\d|2[0-3])[:.]\d{2}\b/),
      sourceUrl,
      sourceTitle,
      0.6,
      segment
    );
  }

  if (field === "elevation") {
    const segment =
      findSegment(
        segments,
        /elevation|hoehenmeter|höhenmeter|altitude|vertical|anstieg|\bhm\b/i,
        /\b\d{2,5}\s?(?:hm|m|meter|metres|feet|ft)\b/i
      );

    if (!segment) {
      return null;
    }

    return createProposal(
      auditRow,
      field,
      compactValue(segment, /\b\d{2,5}\s?(?:hm|m|meter|metres|feet|ft)\b/i),
      sourceUrl,
      sourceTitle,
      0.58,
      segment
    );
  }

  return null;
}

function fieldsForRow(row, options) {
  const scopeField =
    SCOPE_FIELD_MAP[options.scope || ""];

  if (scopeField) {
    return (row.missing_fields || []).includes(scopeField)
      ? [scopeField]
      : [];
  }

  return (row.missing_fields || [])
    .filter(field => RESEARCHABLE_FIELDS.includes(field));
}

function proposalToField(proposal) {
  return {
    value: proposal.suggested_value,
    suggested_value: proposal.suggested_value,
    source_url: proposal.source_url,
    source_title: proposal.source_title,
    confidence: proposal.confidence,
    verification_status: "needs_review",
    last_checked: proposal.last_checked,
    source_excerpt: proposal.source_excerpt,
    note: proposal.note
  };
}

function buildTask(row, event, proposals, sourceUrl) {
  const fields =
    proposals.reduce((map, proposal) => {
      map[proposal.field_name] =
        proposalToField(proposal);
      return map;
    }, {});

  return {
    event_slug: row.event_slug,
    event_id: row.event_slug,
    event_name: row.event_name,
    date: row.date,
    city: row.city,
    country: row.country,
    sport: row.sport,
    distance: row.distance,
    priority: row.priority,
    completion_score: row.completion_score,
    missing_fields: row.missing_fields,
    research_sources: [sourceUrl].filter(Boolean),
    proposals,
    fields,
    supabase_payload: {
      details: {
        event_slug: row.event_slug,
        event_name: row.event_name,
        sport_type: row.sport,
        date: row.date,
        city: row.city,
        country: row.country,
        official_website: cleanValue(event.event_url || sourceUrl),
        registration_url: cleanValue(event.event_url || sourceUrl),
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
    },
    created_at: new Date().toISOString()
  };
}

function mergeReviewTasks(existingReview, newTasks, status) {
  function hasReviewValue(proposal = {}) {
    return Boolean(
      cleanValue(proposal.source_url) &&
      cleanValue(proposal.suggested_value || proposal.value) &&
      proposal.verification_status !== "needs_research"
    );
  }

  function cleanTask(task = {}) {
    const fields =
      Object.fromEntries(
        Object.entries(task.fields || {})
          .filter(([_field, proposal]) => hasReviewValue(proposal))
          .map(([field, proposal]) => [
            field,
            {
              ...proposal,
              suggested_value: proposal.suggested_value || proposal.value || "",
              source_title: proposal.source_title || "Existing review source"
            }
          ])
      );
    const proposals =
      Array.isArray(task.proposals)
        ? task.proposals.filter(hasReviewValue).map(proposal => ({
          ...proposal,
          suggested_value: proposal.suggested_value || proposal.value || "",
          source_title: proposal.source_title || "Existing review source"
        }))
        : Object.entries(fields).map(([field, proposal]) => ({
          ...proposal,
          field_name: field,
          event_id: task.event_slug,
          event_slug: task.event_slug,
          suggested_value: proposal.suggested_value || proposal.value || ""
        }));

    return {
      ...task,
      fields,
      proposals
    };
  }

  const existingTasks =
    Array.isArray(existingReview?.tasks)
      ? existingReview.tasks.map(cleanTask)
      : [];
  const taskMap =
    new Map(existingTasks.map(task => [task.event_slug, task]));

  newTasks.forEach(task => {
    const existing =
      cleanTask(taskMap.get(task.event_slug) || {});
    const existingProposals =
      Array.isArray(existing.proposals)
        ? existing.proposals
        : Object.entries(existing.fields || {}).map(([field, proposal]) => ({
          ...proposal,
          field_name: field,
          event_id: existing.event_slug,
          event_slug: existing.event_slug,
          suggested_value: proposal.suggested_value || proposal.value || ""
        }));
    const proposalMap =
      new Map(existingProposals.map(proposal => [proposal.field_name, proposal]));

    task.proposals.filter(hasReviewValue).forEach(proposal => {
      proposalMap.set(proposal.field_name, proposal);
    });

    const fields = {
      ...(existing.fields || {}),
      ...Object.fromEntries(
        Object.entries(task.fields || {})
          .filter(([_field, proposal]) => hasReviewValue(proposal))
      )
    };

    taskMap.set(task.event_slug, {
      ...existing,
      ...task,
      fields,
      proposals: Array.from(proposalMap.values())
    });
  });

  return {
    generated_at: new Date().toISOString(),
    source: "research:event-knowledge",
    total_tasks: taskMap.size,
    policy: {
      publish_directly: false,
      required_manual_review: true,
      public_rule: "Only accepted and verified records may later be exported with is_public=true."
    },
    research_status: status,
    tasks: Array.from(taskMap.values())
  };
}

async function main() {
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
  const selected =
    selectRows(auditRows, options);
  const jobId =
    `research-${Date.now()}`;
  const status = {
    job_id: jobId,
    status: "queued",
    scope: options.scope,
    limit: options.limit,
    current_event: "",
    processed_events: 0,
    total_events: selected.length,
    found_fields: 0,
    errors: [],
    started_at: new Date().toISOString(),
    completed_at: ""
  };

  writeStatus(status);
  status.status = "running";
  writeStatus(status);

  const tasks = [];

  for (const row of selected) {
    const event =
      eventsBySlug.get(row.event_slug) || {};
    const sourceUrl =
      getSourceUrl(event, row);
    const fields =
      fieldsForRow(row, options);

    status.current_event =
      row.event_name;

    try {
      if (!sourceUrl) {
        throw new Error("Missing source URL.");
      }

      const source =
        await fetchSource(sourceUrl);
      const proposals =
        fields
          .map(field =>
            researchField(field, row, sourceUrl, source.title, source.segments)
          )
          .filter(Boolean);

      if (proposals.length) {
        status.found_fields += proposals.length;
        tasks.push(
          buildTask(row, event, proposals, sourceUrl)
        );
      }
    } catch (error) {
      status.errors.push({
        event_slug: row.event_slug,
        event_name: row.event_name,
        source_url: sourceUrl,
        message: error.message
      });
    }

    status.processed_events += 1;
    writeStatus(status);
  }

  status.status = "completed";
  status.current_event = "";
  status.completed_at = new Date().toISOString();
  writeStatus(status);

  const existingReview =
    readJson(REVIEW_JSON_PATH, {});
  const review =
    mergeReviewTasks(existingReview, tasks, status);

  fs.writeFileSync(
    REVIEW_JSON_PATH,
    `${JSON.stringify(review, null, 2)}\n`,
    "utf8"
  );

  console.log(`Research completed: ${status.processed_events}/${status.total_events} event(s), ${status.found_fields} field(s), ${status.errors.length} error(s).`);
  console.log(`Wrote ${path.relative(ROOT, REVIEW_JSON_PATH)} and ${path.relative(ROOT, RESEARCH_STATUS_JSON_PATH)}.`);
}

main().catch(error => {
  const failedStatus = {
    job_id: `research-${Date.now()}`,
    status: "failed",
    scope: "",
    limit: 0,
    current_event: "",
    processed_events: 0,
    total_events: 0,
    found_fields: 0,
    errors: [{
      message: error.message
    }],
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString()
  };

  try {
    writeStatus(failedStatus);
  } catch (_writeError) {
    // Keep the original failure visible in stderr.
  }

  console.error(error);
  process.exit(1);
});
