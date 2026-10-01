const fs = require("node:fs");
const path = require("node:path");
const { buildCatalogQualityReport } = require("../js/catalog-quality-report.js");
const { evaluateCatalogRelease } = require("./check-catalog-release.js");
const { evaluateDataQualityRelease } = require("./check-data-quality-release.js");

function main(args = process.argv.slice(2)) {
  const arg = name => args[args.indexOf(name) + 1];
  const root = path.resolve(__dirname, "..");
  const snapshotFile = args.includes("--snapshot") ? arg("--snapshot") : null;
  const snapshot = snapshotFile ? JSON.parse(fs.readFileSync(snapshotFile, "utf8")) : null;
  const replay = args.includes("--at-snapshot-time");
  if (replay && !snapshot?.measured_at) throw new Error("Snapshot replay requires its original measurement timestamp.");
  const now = replay ? new Date(snapshot.measured_at) : new Date();
  const policy = JSON.parse(fs.readFileSync(path.join(root, "data/catalog-release-policy.json"), "utf8"));
  const report = buildCatalogQualityReport({ snapshot, policy, now, operations: snapshot?.operations || null });
  report.generated_at = new Date().toISOString();
  report.measurement_mode = replay ? "replay_of_original_read_only_snapshot" : "current_read_only_snapshot";
  report.local_fallback_release = evaluateCatalogRelease({ root });
  report.local_fallback_quality = evaluateDataQualityRelease({ root });
  report.blockers.push(...report.local_fallback_release.checks.filter(check => !check.passed).map(check => `${check.name}: ${check.actual} (erforderlich ${check.expected})`));
  report.blockers.push(...report.local_fallback_quality.checks.filter(check => !check.passed).map(check => `${check.name}: ${check.actual} (erforderlich ${check.expected})`));
  report.release_state = "Lokaler Prüfbericht; keine Datenfreigabe oder Veröffentlichung";
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.includes("--out")) {
    const target = path.resolve(arg("--out"));
    const allowed = path.join(root, "exports") + path.sep;
    if (!target.startsWith(allowed)) throw new Error("Quality reports must stay in the local exports directory.");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output);
  } else console.log(output);
  console.log(`Quality snapshot: ${report.available ? `${report.metrics.discovery_rows} Discovery; ${report.future.germany} Germany; ${report.metrics.fresh_rows} valid attestations` : "not measured"}. Release blocked: ${report.blockers.length > 0}.`);
}

if (require.main === module) main();
module.exports = { main };
