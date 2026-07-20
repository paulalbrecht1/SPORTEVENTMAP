const path = require("path");
const { parseCsvFile } = require("./event-table-utils.js");
const {
  AUDIT_CSV_PATH,
  AUDIT_JSON_PATH,
  EVENTS_PATH,
  ROOT,
  buildAuditRows,
  writeAuditFiles
} = require("./event-knowledge-workflow.js");

function main() {
  const events =
    parseCsvFile(EVENTS_PATH);

  const rows =
    buildAuditRows(events);

  const summary =
    writeAuditFiles(rows);

  console.log(`Audited ${summary.total_events} event(s).`);
  console.log(`Average completion score: ${summary.average_completion_score}%`);
  console.log(`Priority: high ${summary.by_priority.high || 0}, medium ${summary.by_priority.medium || 0}, low ${summary.by_priority.low || 0}`);
  console.log(`Wrote ${path.relative(ROOT, AUDIT_JSON_PATH)} and ${path.relative(ROOT, AUDIT_CSV_PATH)}.`);
}

main();
