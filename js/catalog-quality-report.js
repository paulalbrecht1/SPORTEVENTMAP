(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CatalogQualityReport = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const text = value => String(value ?? "").trim();
  const time = value => Date.parse(text(value));
  const percent = (count, total) => total ? Number((100 * count / total).toFixed(2)) : null;
  const isGermany = row => ["de", "deutschland", "germany"].includes(text(row.country).toLowerCase());
  const dateLoader = () => typeof module === "object" && module.exports
    ? require("./event-catalog-loader.js") : globalThis.EventCatalogLoader;
  const catalogDate = value => dateLoader().parseCatalogDate(value);

  function hasUsableCoordinates(row) {
    if (!text(row.latitude) || !text(row.longitude)) return false;
    const lat = Number(row.latitude), lon = Number(row.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  function isCompleteDiscoveryRow(row) {
    return [row.event_name, row.sport, row.city, row.country, row.date,
      row.description, row.event_url, row.source_url].every(value => Boolean(text(value))) &&
      hasUsableCoordinates(row) && Boolean(text(row.distance)) && text(row.description).length >= 80;
  }

  function isFreshDiscoveryRow(row, measuredAt, authoritativeDecision = false) {
    return text(row.verification_status).toLowerCase() === "verified" &&
      Boolean(text(row.last_checked || row.edition_last_verified_at)) &&
      Number.isFinite(time(row.next_check)) && time(row.next_check) > time(measuredAt) &&
      authoritativeDecision === true;
  }

  function assertFreshnessGuardCoverage(rows, payload, now = Date.now()) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Freshness guard returned no valid JSON object.");
    }
    if (payload.schema_version !== 1) throw new Error("Unsupported freshness guard schema version.");
    const evaluatedAt = time(payload.evaluated_at);
    if (!Number.isFinite(evaluatedAt) || Math.abs(evaluatedAt - Number(now)) > 300000) {
      throw new Error("Freshness guard evaluation is missing or older than five minutes.");
    }
    const ids = rows.map(row => text(row.edition_id));
    if (ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      throw new Error("Discovery export contains a missing or invalid edition id.");
    }
    const expected = new Set(ids);
    if (expected.size !== ids.length) throw new Error("Discovery export contains duplicate edition ids.");
    if (Number(payload.requested_count) !== expected.size) {
      throw new Error("Freshness guard requested_count does not match the Discovery snapshot.");
    }
    const decisions = payload.decisions;
    if (!decisions || typeof decisions !== "object" || Array.isArray(decisions)) {
      throw new Error("Freshness guard decisions are missing or malformed.");
    }
    const actual = Object.keys(decisions);
    if (actual.length !== expected.size || actual.some(id => !expected.has(id)) ||
        ids.some(id => !Object.prototype.hasOwnProperty.call(decisions, id))) {
      throw new Error("Freshness guard decisions do not exactly match the Discovery snapshot.");
    }
    if (actual.some(id => typeof decisions[id] !== "boolean")) {
      throw new Error("Freshness guard returned a non-boolean decision.");
    }
    return { decisions: new Map(actual.map(id => [id, decisions[id]])), evaluatedAt: new Date(evaluatedAt).toISOString() };
  }

  function buildExportMetrics(rows, archiveRows, measuredAt, payload, now = Date.now()) {
    const guard = assertFreshnessGuardCoverage(rows, payload, now);
    const fresh = rows.filter(row => isFreshDiscoveryRow(row, measuredAt, guard.decisions.get(text(row.edition_id))));
    const complete = rows.filter(isCompleteDiscoveryRow);
    return {
      discovery_rows: rows.length, archive_rows: archiveRows.length,
      fresh_rows: fresh.length, freshness_rate: percent(fresh.length, rows.length) ?? 0,
      complete_rows: complete.length, completeness_rate: percent(complete.length, rows.length) ?? 0,
      review_required_rows: rows.length - fresh.length, freshness_guard_evaluated_at: guard.evaluatedAt
    };
  }

  function buildCatalogQualityReport({ snapshot = null, policy = null, now = new Date(), operations = null } = {}) {
    const nowTime = new Date(now).getTime();
    if (!Number.isFinite(nowTime)) throw new TypeError("A valid measurement time is required.");
    const unavailable = reason => ({ schema_version: 1, measured_at: new Date(nowTime).toISOString(),
      available: false, definition: "public_event_discovery: eine nächste aktive veröffentlichte Edition je Eventidentität; Archiv und Entwürfe separat",
      metrics: null, future: null, operations, blockers: [reason] });
    if (typeof dateLoader()?.parseCatalogDate !== "function") return unavailable("Datumsparser nicht verfügbar; Zukunftsbestand nicht ermittelt.");
    if (!snapshot || snapshot.schema_version !== 1 || snapshot.consistency !== "single_statement" ||
        !Array.isArray(snapshot.discovery) || !Array.isArray(snapshot.archive) ||
        snapshot.discovery_count !== snapshot.discovery.length || snapshot.archive_count !== snapshot.archive.length ||
        [...snapshot.discovery, ...snapshot.archive].some(row => !row || typeof row !== "object" || Array.isArray(row))) {
      return unavailable("Katalog-Snapshot nicht ermittelt.");
    }
    const measuredAt = snapshot.measured_at;
    if (!Number.isFinite(time(measuredAt)) || Math.abs(time(measuredAt) - nowTime) > 300000) {
      return unavailable("Katalog-Snapshot fehlt oder ist älter als fünf Minuten.");
    }
    if (snapshot.freshness_guard?.evaluated_at !== measuredAt) {
      return unavailable("Frischenachweise und Katalog stammen nicht aus derselben Messung.");
    }
    let metrics, guard;
    try {
      metrics = buildExportMetrics(snapshot.discovery, snapshot.archive, measuredAt, snapshot.freshness_guard, nowTime);
      guard = assertFreshnessGuardCoverage(snapshot.discovery, snapshot.freshness_guard, nowTime);
    } catch (error) { return unavailable(error.message); }
    const rows = snapshot.discovery;
    if (new Set(rows.map(row => row.event_id)).size !== rows.length) return unavailable("Discovery enthält doppelte Eventidentitäten.");
    const today = measuredAt.slice(0, 10);
    const future = rows.filter(row => catalogDate(row.date) !== null &&
      catalogDate(row.end_date || row.date) !== null && catalogDate(row.end_date || row.date) >= Date.parse(today));
    const de = future.filter(isGermany);
    const fresh = list => list.filter(row => isFreshDiscoveryRow(row, measuredAt, guard.decisions.get(text(row.edition_id))));
    const blockers = [];
    if (!rows.length || !snapshot.archive.length) blockers.push("Leerer Katalog ist nicht freigabefähig.");
    if (!policy) blockers.push("Releasebedingungen nicht ermittelt.");
    else {
      const minimumDiscovery = Math.max(Number(policy.minimum_discovery_rows),
        Math.floor(Number(policy.reference_discovery_rows) * (1 - Number(policy.maximum_discovery_drop_percent) / 100)));
      const minimumArchive = Math.max(Number(policy.minimum_archive_rows),
        Math.floor(Number(policy.reference_archive_rows) * (1 - Number(policy.maximum_archive_drop_percent) / 100)));
      if (![minimumDiscovery, minimumArchive, Number(policy.minimum_freshness_rate), Number(policy.minimum_completeness_rate)].every(Number.isFinite)) {
        blockers.push("Releasebedingungen sind unvollständig.");
      } else {
        if (rows.length < minimumDiscovery) blockers.push(`Discovery ${rows.length} / mindestens ${minimumDiscovery}.`);
        if (snapshot.archive.length < minimumArchive) blockers.push(`Archiv ${snapshot.archive.length} / mindestens ${minimumArchive}.`);
        if (metrics.freshness_rate < Number(policy.minimum_freshness_rate)) blockers.push(`Vollnachweise ${metrics.freshness_rate} % / mindestens ${policy.minimum_freshness_rate} %.`);
        if (metrics.completeness_rate < Number(policy.minimum_completeness_rate)) blockers.push(`Vollständigkeit ${metrics.completeness_rate} % / mindestens ${policy.minimum_completeness_rate} %.`);
      }
    }
    return {
      schema_version: 1, available: true, measured_at: measuredAt,
      definition: "public_event_discovery: eine nächste aktive veröffentlichte Edition je Eventidentität; Archiv und Entwürfe separat",
      verification_definition: "Unveränderter get_public_event_freshness_guard: editions- und feldwertgebundener 14-Feld-Nachweis, aktuelle Quelle und keine blockierenden Reviews; zusätzlich Export-Frischebedingungen",
      metrics, population: {
        discovery_event_identities: new Set(rows.map(row => row.event_id)).size,
        published_editions: snapshot.archive.length,
        future_dated_published_editions: snapshot.archive.filter(row => catalogDate(row.date) !== null &&
          catalogDate(row.end_date || row.date) !== null && catalogDate(row.end_date || row.date) >= Date.parse(today)).length,
        historical_published_editions: snapshot.archive.filter(row => catalogDate(row.date) !== null &&
          catalogDate(row.end_date || row.date) < Date.parse(today)).length,
        undated_published_editions: snapshot.archive.filter(row => catalogDate(row.date) === null).length
      }, future: {
        definition: "Discovery-Editionen mit bekanntem Datum und Enddatum/Datum ab Messtag (laufende Ausgaben eingeschlossen)",
        total: future.length, germany: de.length,
        fresh: fresh(future).length, freshness_rate: percent(fresh(future).length, future.length),
        germany_fresh: fresh(de).length, germany_freshness_rate: percent(fresh(de).length, de.length),
        unknown_date: rows.filter(row => catalogDate(row.date) === null).length,
        past_dated: rows.filter(row => catalogDate(row.date) !== null && catalogDate(row.end_date || row.date) < Date.parse(today)).length,
        missing_or_invalid_attestation: rows.filter(row => !guard.decisions.get(text(row.edition_id))).length,
        overdue: rows.filter(row => Number.isFinite(time(row.next_check)) && time(row.next_check) <= time(measuredAt)).length,
        unscheduled: rows.filter(row => !Number.isFinite(time(row.next_check))).length
      },
      operations, blockers,
      release_state: "Prüfkandidat; gebundene Datums-, Geo- und Dublettenprüfungen, Export und Freigabe zusätzlich erforderlich"
    };
  }

  return { hasUsableCoordinates, isCompleteDiscoveryRow, isFreshDiscoveryRow, assertFreshnessGuardCoverage,
    buildExportMetrics, buildCatalogQualityReport };
});
