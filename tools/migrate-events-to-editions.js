const fs = require("fs");
const path = require("path");
const {
  cleanValue,
  parseCsvFile
} = require("./event-table-utils.js");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_EVENTS_PATH = path.join(ROOT, "data", "events.csv");
const DEFAULT_MANIFEST_PATH = path.join(ROOT, "data", "event-pages.json");

function slugPart(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function parseDate(value) {
  const text = cleanValue(value);
  const german = text.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (german) {
    return `${german[3]}-${german[2]}-${german[1]}`;
  }

  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  return "";
}

function getEditionYear(row) {
  const parsed = parseDate(row.date);
  if (parsed) return Number(parsed.slice(0, 4));

  const match = cleanValue(row.date).match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function canonicalName(value) {
  return cleanValue(value)
    .replace(/\s+20\d{2}\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalKey(row) {
  return slugPart([
    canonicalName(row.event_name),
    row.city || "unknown",
    row.country || "unknown"
  ].join("-"));
}

function legacyEventKey(row) {
  return [row.event_name, row.date, row.city, row.country]
    .map(cleanValue)
    .join("|")
    .toLowerCase();
}

function getManifestKey(row) {
  return legacyEventKey(row);
}

function loadManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  if (!fs.existsSync(manifestPath)) return new Map();

  const rows = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return new Map(rows.map(row => [getManifestKey(row), row.slug]));
}

function inferVerification(row, today = new Date()) {
  const date = parseDate(row.date);
  const source = cleanValue(row.source_url || row.event_url);
  const explicit = cleanValue(row.verification_status).toLowerCase();
  const lastVerified = cleanValue(row.last_checked);
  const eventTime = date ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;

  if (!source) return "source_unreachable";
  if (explicit === "needs_review") return "needs_review";
  if (Number.isFinite(eventTime) && eventTime < today.getTime()) return "stale";
  if (lastVerified || explicit === "verified" || explicit === "confirmed") return "verified";
  return "unverified";
}

function confidenceFor(status) {
  return ({
    verified: 0.8,
    unverified: 0.45,
    stale: 0.3,
    needs_review: 0.2,
    source_unreachable: 0.1
  })[status] || 0.3;
}

function nextCheckFor(row, today = new Date()) {
  const explicit = cleanValue(row.next_check);
  if (parseDate(explicit)) return parseDate(explicit);

  const days = cleanValue(row.priority).toLowerCase() === "high"
    ? 7
    : cleanValue(row.priority).toLowerCase() === "low"
      ? 90
      : 30;
  const next = new Date(today);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function prepareMigration(rows, options = {}) {
  const today = options.today || new Date();
  const manifest = options.manifest || loadManifest(options.manifestPath);
  const eventMap = new Map();
  const editionMap = new Map();
  const rejected = [];

  rows.forEach(row => {
    const year = getEditionYear(row);
    const name = canonicalName(row.event_name);
    const key = canonicalKey(row);
    const parsedDate = parseDate(row.date);

    if (!name || !key || !year) {
      rejected.push({
        event_name: cleanValue(row.event_name),
        date: cleanValue(row.date),
        reason: !name ? "missing_event_name" : !year ? "invalid_date" : "missing_canonical_key"
      });
      return;
    }

    const verificationStatus = inferVerification(row, today);
    const existing = eventMap.get(key);
    const eventPayload = {
      canonical_name: name,
      canonical_key: key,
      slug: slugPart(name),
      event_name: name,
      sport: cleanValue(row.sport),
      country: cleanValue(row.country),
      city: cleanValue(row.city),
      address: cleanValue(row.address) || null,
      latitude: cleanValue(row.latitude) || null,
      longitude: cleanValue(row.longitude) || null,
      description: cleanValue(row.description) || null,
      image: cleanValue(row.image) || null,
      official_url: cleanValue(row.event_url || row.source_url) || null,
      event_url: cleanValue(row.event_url) || null,
      source_url: cleanValue(row.source_url || row.event_url) || null,
      status: "approved",
      publication_status: "published",
      event_status: "active",
      verification_status: verificationStatus,
      data_confidence: confidenceFor(verificationStatus),
      needs_review: verificationStatus !== "verified",
      review_priority: ["high", "medium", "low"].includes(cleanValue(row.priority).toLowerCase())
        ? cleanValue(row.priority).toLowerCase()
        : "medium",
      last_verified_at: parseDate(row.last_checked)
        ? `${parseDate(row.last_checked)}T00:00:00.000Z`
        : null,
      next_check_at: nextCheckFor(row, today),
      date: cleanValue(row.date),
      distance: cleanValue(row.distance),
      registration_status: "unclear"
    };

    if (!existing || year >= existing.latestYear) {
      eventMap.set(key, { latestYear: year, payload: eventPayload });
    }

    const editionIdentity = `${key}:${year}`;
    if (editionMap.has(editionIdentity)) {
      rejected.push({
        event_name: cleanValue(row.event_name),
        date: cleanValue(row.date),
        reason: "duplicate_edition_year"
      });
      return;
    }

    const dateTime = parsedDate ? Date.parse(`${parsedDate}T00:00:00Z`) : Number.NaN;
    const editionStatus = !parsedDate
      ? "date_unconfirmed"
      : dateTime < today.getTime()
        ? "completed"
        : "scheduled";
    const publicKey = legacyEventKey(row);

    editionMap.set(editionIdentity, {
      canonical_key: key,
      edition_year: year,
      edition_slug: manifest.get(publicKey) || `${slugPart(row.event_name)}-${year}`,
      legacy_event_key: publicKey,
      start_date: parsedDate || null,
      end_date: parsedDate || null,
      registration_url: cleanValue(row.event_url) || null,
      registration_status: "unknown",
      edition_status: editionStatus,
      publication_status: "published",
      race_formats: cleanValue(row.distance)
        ? [{ label: cleanValue(row.distance) }]
        : [],
      legacy_distance: cleanValue(row.distance) || null,
      source_url: cleanValue(row.source_url || row.event_url) || null,
      verification_status: verificationStatus,
      data_confidence: confidenceFor(verificationStatus),
      needs_review: verificationStatus !== "verified",
      review_priority: eventPayload.review_priority,
      last_verified_at: eventPayload.last_verified_at,
      next_check_at: eventPayload.next_check_at
    });
  });

  const events = [...eventMap.values()].map(entry => entry.payload);
  const slugCounts = events.reduce((counts, event) => {
    counts.set(event.slug, (counts.get(event.slug) || 0) + 1);
    return counts;
  }, new Map());

  events.forEach(event => {
    if (slugCounts.get(event.slug) > 1) {
      event.slug = `${event.slug}-${slugPart(event.city || event.canonical_key)}`;
    }
  });

  return {
    events,
    editions: [...editionMap.values()],
    rejected
  };
}

function getConfig() {
  const url = cleanValue(process.env.SUPABASE_URL);
  const serviceKey = cleanValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !serviceKey) {
    throw new Error("--apply requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.");
  }

  if (serviceKey.startsWith("sb_publishable_")) {
    throw new Error("A publishable key cannot run the server-side migration.");
  }

  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function restRequest(config, table, options = {}) {
  const query = options.query ? `?${options.query}` : "";
  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${table} request failed (${response.status}): ${text.slice(0, 500)}`);
  }

  return text ? JSON.parse(text) : [];
}

async function upsertBatches(config, table, rows, conflict, size = 100) {
  const results = [];
  for (let index = 0; index < rows.length; index += size) {
    const batch = rows.slice(index, index + size);
    const result = await restRequest(config, table, {
      method: "POST",
      query: `on_conflict=${encodeURIComponent(conflict)}`,
      prefer: "resolution=merge-duplicates,return=representation",
      body: batch
    });
    results.push(...result);
  }
  return results;
}

async function applyMigration(prepared) {
  const config = getConfig();
  const eventRows = await upsertBatches(config, "events", prepared.events, "canonical_key");
  const eventIds = new Map(eventRows.map(row => [row.canonical_key, row.id]));
  const missingKeys = prepared.events
    .map(row => row.canonical_key)
    .filter(key => !eventIds.has(key));

  if (missingKeys.length) {
    const existing = await restRequest(config, "events", {
      query: "select=id,canonical_key&limit=5000"
    });
    existing.forEach(row => eventIds.set(row.canonical_key, row.id));
  }

  const editions = prepared.editions.map(row => ({
    ...row,
    event_id: eventIds.get(row.canonical_key)
  })).map(row => {
    const payload = { ...row };
    delete payload.canonical_key;
    return payload;
  });

  if (editions.some(row => !row.event_id)) {
    throw new Error("At least one edition could not be mapped to a stable event id.");
  }

  await upsertBatches(config, "event_editions", editions, "event_id,edition_year");
  await restRequest(config, "rpc/run_event_validation", {
    method: "POST",
    body: {}
  });

  return { events: eventRows.length, editions: editions.length };
}

function parseArgs(argv) {
  const args = {
    apply: false,
    input: DEFAULT_EVENTS_PATH,
    manifest: DEFAULT_MANIFEST_PATH
  };

  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--apply") args.apply = true;
    if (argv[index] === "--input") args.input = path.resolve(argv[++index]);
    if (argv[index] === "--manifest") args.manifest = path.resolve(argv[++index]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const rows = parseCsvFile(args.input);
  const prepared = prepareMigration(rows, { manifestPath: args.manifest });
  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    sourceRows: rows.length,
    eventBrands: prepared.events.length,
    editions: prepared.editions.length,
    rejected: prepared.rejected.length,
    rejectionReasons: prepared.rejected.reduce((counts, row) => {
      counts[row.reason] = (counts[row.reason] || 0) + 1;
      return counts;
    }, {})
  };

  if (args.apply) {
    summary.applied = await applyMigration(prepared);
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  canonicalKey,
  canonicalName,
  getEditionYear,
  inferVerification,
  legacyEventKey,
  parseDate,
  prepareMigration,
  slugPart
};
