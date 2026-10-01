const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { parseCatalogDate } = require("../js/event-catalog-loader.js");

// Matches the existing public views, not the editable event/edition tables.
const PUBLIC_VIEW_COLUMNS = [
  "id", "event_id", "edition_id", "event_key", "event_name", "sport", "date",
  "city", "country", "address", "latitude", "longitude", "distance", "description",
  "image", "event_url", "source_url", "verification_status", "priority", "last_checked",
  "next_check", "event_status", "edition_slug", "slug", "edition_year", "discovery_status",
  "results_status", "registration_status", "organizer_name", "organizer_url", "official_url",
  "registration_url", "brand_verification_status", "brand_last_verified_at",
  "edition_verification_status", "edition_last_verified_at", "race_formats", "end_date",
  "start_time", "price_min", "price_max", "currency", "participant_limit"
];
const PUBLIC_RACE_COLUMNS = [
  "label", "distance_km", "swim_km", "bike_km", "run_km", "elevation_gain_m",
  "sport", "name", "format", "start_time", "price", "currency", "terrain", "surface",
  "relay", "legs", "leg_distance_km", "distance_mode"
];
const PUBLIC_RESULT_COLUMNS = ["type", "title", "url", "published_at"];

function pick(row, columns) {
  return Object.fromEntries(columns.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
}

function publicRow(row, archive = false) {
  const result = pick(row, PUBLIC_VIEW_COLUMNS);
  if (Array.isArray(row.race_formats)) result.race_formats = row.race_formats.map(race => pick(race, PUBLIC_RACE_COLUMNS));
  if (archive && Array.isArray(row.results)) result.results = row.results.map(item => pick(item, PUBLIC_RESULT_COLUMNS));
  return result;
}

function assertPublicCatalogSnapshot(snapshot, now = Date.now()) {
  if (!snapshot || snapshot.schema_version !== 1 || snapshot.consistency !== "single_statement") {
    throw new Error("Catalog snapshot must come from the consistent read-only snapshot RPC (schema 1).");
  }
  const measuredAt = Date.parse(snapshot.measured_at);
  if (!Number.isFinite(measuredAt) || Math.abs(now - measuredAt) > 300000) {
    throw new Error("Catalog snapshot measurement is missing or older than five minutes.");
  }
  const byEdition = new Map();
  for (const [kind, maximum] of [["archive", 20000], ["discovery", 5000]]) {
    const rows = snapshot[kind];
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > maximum || rows.length !== snapshot[`${kind}_count`]) {
      throw new Error(`Catalog ${kind} is empty, incomplete or exceeds the safety limit.`);
    }
    const editions = new Set();
    const slugs = new Set();
    const events = new Set();
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.edition_id || "") ||
          !Number.isSafeInteger(Number(row.event_id)) || Number(row.event_id) < 1 ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.edition_slug || "") ||
          !Number.isInteger(row.edition_year) || row.edition_year < 1900 || row.edition_year > 2200) {
        throw new Error(`Catalog ${kind} has an invalid event/edition identity, slug or year.`);
      }
      if (row.publication_status && row.publication_status !== "published") {
        throw new Error(`Catalog ${kind} contains an unpublished edition.`);
      }
      if (editions.has(row.edition_id) || slugs.has(row.edition_slug) || (kind === "discovery" && events.has(String(row.event_id)))) {
        throw new Error(`Catalog ${kind} contains duplicate edition ids, slugs or Discovery event identities.`);
      }
      editions.add(row.edition_id); slugs.add(row.edition_slug); events.add(String(row.event_id));
      if (row.date) {
        const date = parseCatalogDate(row.date);
        // An edition can be postponed across New Year without changing its
        // identity or edition label. Date validity and identity are independent.
        if (date === null) {
          throw new Error(`Catalog ${kind} has an impossible date.`);
        }
      }
      for (const [coordinate, minimum, maximumValue] of [["latitude", -90, 90], ["longitude", -180, 180]]) {
        const value = row[coordinate];
        if (value !== null && value !== undefined && String(value).trim() !== "" &&
            (!Number.isFinite(Number(value)) || Number(value) < minimum || Number(value) > maximumValue)) {
          throw new Error(`Catalog ${kind} has an implausible ${coordinate}.`);
        }
      }
      if (row.race_formats !== undefined && !Array.isArray(row.race_formats)) {
        throw new Error(`Catalog ${kind} has malformed structured distances.`);
      }
      for (const race of row.race_formats || []) {
        if (!race || typeof race !== "object" || Array.isArray(race) || !String(race.label || "").trim()) {
          throw new Error(`Catalog ${kind} has a competition without a label.`);
        }
        for (const key of ["distance_km", "swim_km", "bike_km", "run_km", "elevation_gain_m", "price"]) {
          if (Object.hasOwn(race, key) && (typeof race[key] !== "number" || !Number.isFinite(race[key]) || race[key] < 0 || race[key] > 100000)) {
            throw new Error(`Catalog ${kind} has an implausible competition ${key}.`);
          }
        }
      }
      if (kind === "archive") byEdition.set(row.edition_id, publicRow(row));
      else {
        const archive = byEdition.get(row.edition_id);
        if (!archive || PUBLIC_VIEW_COLUMNS.some(key => JSON.stringify(archive[key]) !== JSON.stringify(publicRow(row)[key]))) {
          throw new Error("Discovery and archive do not describe the same edition snapshot.");
        }
      }
    }
  }
  if (snapshot.freshness_guard?.evaluated_at !== snapshot.measured_at) {
    throw new Error("Freshness decisions and public data were not measured in the same database statement.");
  }
  return snapshot;
}

function assertDiagnosticPaths(args, root) {
  if (!args.allowUnhealthy) return;
  for (const target of [args.out, args.archiveOut, args.manifestOut]) {
    for (const protectedRoot of [path.join(root, "data"), path.join(root, "dist")]) {
      const relative = path.relative(protectedRoot, path.resolve(target));
      if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
        throw new Error("Unhealthy diagnostic snapshots must use separate output paths outside data/ and dist/ for all three artifacts.");
      }
    }
  }
}

function prepareBoundQualityAudits({ args, root, output, exportedAt }) {
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sem-catalog-preflight-"));
  const stagingData = path.join(stagingRoot, "data");
  const stagingReports = path.join(stagingRoot, "reports");
  const input = path.join(stagingData, "events.csv");
  const reports = [
    ["date", path.join(stagingReports, "event-date-audit.json")],
    ["geo", path.join(stagingReports, "event-geo-audit.json")],
    ["duplicate", path.join(stagingData, "review", "duplicate-candidates.json")]
  ];
  const canonical = path.resolve(args.out) === path.join(root, "data", "events.csv") &&
    path.resolve(args.archiveOut) === path.join(root, "data", "event-editions-public.json") &&
    path.resolve(args.manifestOut) === path.join(root, "data", "catalog-export-manifest.json");
  const destination = canonical ? path.join(root, "reports") : path.join(path.dirname(args.manifestOut), "audit-reports");
  const duplicateDestination = canonical ? path.join(root, "data", "review", "duplicate-candidates.json") : path.join(destination, "duplicate-candidates.json");
  try {
    fs.mkdirSync(stagingReports, { recursive: true });
    fs.mkdirSync(path.dirname(reports[2][1]), { recursive: true });
    fs.writeFileSync(input, output, "utf8");
    fs.writeFileSync(path.join(stagingData, "catalog-export-manifest.json"), JSON.stringify({ exported_at: exportedAt }));
    // Existing reviewed resolutions survive only when the duplicate tool finds
    // the same candidate/evidence fingerprint in this new snapshot.
    const previousDuplicateReport = path.join(root, "data", "review", "duplicate-candidates.json");
    if (fs.existsSync(previousDuplicateReport)) fs.copyFileSync(previousDuplicateReport, reports[2][1]);
    const commands = [
      ["audit-event-dates.js", "--input", input, "--json", reports[0][1], "--csv", path.join(stagingReports, "dates.csv"), "--md", path.join(stagingReports, "dates.md")],
      ["audit-event-geo.js", "--input", input, "--json", reports[1][1], "--csv", path.join(stagingReports, "geo.csv"), "--md", path.join(stagingReports, "geo.md"), "--fixes", path.join(stagingReports, "geo-fixes.json")],
      ["find-duplicate-candidates.js", "--input", input, "--output", reports[2][1]]
    ];
    for (const [script, ...argv] of commands) {
      const run = spawnSync(process.execPath, [path.join(root, "tools", script), ...argv], { cwd: root, encoding: "utf8", timeout: 120000 });
      if (run.error || run.status !== 0) throw new Error(`Catalog preflight ${script} failed; previous export retained: ${run.error?.message || run.stderr || "nonzero exit"}`);
    }
    const quality = require("./check-data-quality-release.js").evaluateDataQualityRelease({ root: stagingRoot });
    if (!quality.passed && !args.allowUnhealthy) {
      throw new Error(`Catalog data quality preflight failed; previous export retained: ${quality.checks.filter(check => !check.passed).map(check => check.name).join("; ")}`);
    }
    return {
      quality,
      checkedAt: new Date().toISOString(),
      artifacts: reports.map(([kind, file]) => ({
        target: kind === "duplicate" ? duplicateDestination : path.join(destination, `event-${kind}-audit.json`),
        content: fs.readFileSync(file, "utf8")
      }))
    };
  } finally { fs.rmSync(stagingRoot, { recursive: true, force: true }); }
}

// The manifest is the commit marker. A process interruption retains original
// bytes in its transaction directory; release gates refuse an unfinished group.
function replaceCatalogArtifacts(entries, io = fs) {
  const targets = entries.map(entry => path.resolve(entry.target));
  if (new Set(targets.map(target => process.platform === "win32" ? target.toLowerCase() : target)).size !== targets.length) {
    throw new Error("Catalog artifact output paths must be distinct.");
  }
  const transactionDirectory = `${targets.at(-1)}.transaction`;
  targets.forEach(target => io.mkdirSync(path.dirname(target), { recursive: true }));
  io.mkdirSync(transactionDirectory); // exclusive lock: never overwrite an interrupted export
  let committed = false;
  const originals = [];
  const replaced = [];
  try {
    entries.forEach((entry, index) => {
      const original = { target: targets[index], backup: path.join(transactionDirectory, `${index}.previous`), existed: io.existsSync(targets[index]) };
      originals.push(original);
      if (original.existed) io.copyFileSync(original.target, original.backup);
      io.writeFileSync(path.join(transactionDirectory, `${index}.next`), entry.content, "utf8");
    });
    io.writeFileSync(path.join(transactionDirectory, "recovery.json"), JSON.stringify({ originals }, null, 2), "utf8");
    entries.forEach((entry, index) => {
      io.renameSync(path.join(transactionDirectory, `${index}.next`), targets[index]);
      replaced.push(originals[index]);
    });
    committed = true;
  } catch (error) {
    try {
      for (const original of replaced.reverse()) {
        if (original.existed) io.copyFileSync(original.backup, original.target);
        else io.unlinkSync(original.target);
      }
    } catch (rollbackError) {
      throw new Error(`Catalog write and rollback failed; original bytes remain in ${transactionDirectory}: ${rollbackError.message}`, { cause: error });
    }
    io.rmSync(transactionDirectory, { recursive: true });
    throw error;
  }
  if (committed) io.rmSync(transactionDirectory, { recursive: true });
}

module.exports = {
  PUBLIC_VIEW_COLUMNS, PUBLIC_RACE_COLUMNS, PUBLIC_RESULT_COLUMNS,
  publicRow, assertPublicCatalogSnapshot, assertDiagnosticPaths, prepareBoundQualityAudits, replaceCatalogArtifacts
};
