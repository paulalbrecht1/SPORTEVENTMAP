(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SemManualEventMaintenance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EVENT_FIELDS = Object.freeze(["canonical_name", "sport", "city", "country", "address", "latitude", "longitude", "description", "official_url", "organizer_name", "organizer_url"]);
  const EDITION_FIELDS = Object.freeze(["edition_year", "edition_key", "start_date", "end_date", "start_time", "registration_url", "registration_status", "edition_status", "price_min", "price_max", "currency", "participant_limit", "race_formats", "source_url"]);
  const STATUS = {
    date_unconfirmed: "Termin noch offen", scheduled: "Geplant", postponed: "Verschoben", cancelled: "Abgesagt", completed: "Beendet", inactive: "Inaktiv",
    unknown: "Unbekannt", registration_not_open: "Noch nicht geöffnet", registration_open: "Anmeldung geöffnet", sold_out: "Ausgebucht"
  };
  const FIELDS = [
    ["event.canonical_name", "Veranstaltungsname", "text"],
    ["edition.start_date", "Datum", "date"],
    ["event.city", "Ort", "text"],
    ["event.country", "Land", "text"],
    ["event.sport", "Sportart", "sport"],
    ["edition.edition_status", "Veranstaltungsstatus", "editionStatus"],
    ["edition.registration_status", "Anmeldestatus", "registrationStatus"],
    ["edition.source_url", "Offizielle Seite dieser Ausgabe", "url"],
    ["edition.registration_url", "Anmeldelink", "url"],
    ["event.address", "Startadresse", "text", true],
    ["event.latitude", "Breitengrad (°)", "number", true],
    ["event.longitude", "Längengrad (°)", "number", true],
    ["event.description", "Beschreibung", "textarea", true],
    ["event.official_url", "Offizielle Veranstaltungsseite", "url", true],
    ["event.organizer_name", "Veranstalter", "text", true],
    ["event.organizer_url", "Veranstalter-Website", "url", true],
    ["edition.end_date", "Enddatum bei mehreren Tagen", "date", true],
    ["edition.start_time", "Startzeit", "time", true],
    ["edition.price_min", "Startgebühr ab", "number", true],
    ["edition.price_max", "Startgebühr bis", "number", true],
    ["edition.currency", "Währung (z. B. EUR)", "text", true],
    ["edition.participant_limit", "Teilnehmerlimit (Personen)", "number", true]
  ];
  const LABELS = Object.fromEntries([...FIELDS.map(([key, label]) => [key, label]), ["edition.race_formats", "Wettbewerbe / Distanzen"], ["edition.edition_year", "Ausgabejahr"], ["edition.edition_key", "Ausgabekürzel"]]);
  const REQUIRED_CHECKS = ["event.canonical_name", "edition.edition_year", "edition.start_date", "event.city", "event.country", "event.address", "event.latitude", "event.longitude", "event.sport", "edition.race_formats", "event.description", "edition.registration_status", "edition.source_url", "edition.registration_url"];
  const FORMAT_DETAILS = [["swim_km", "Schwimmen", "km"], ["bike_km", "Radfahren", "km"], ["run_km", "Laufen", "km"], ["elevation_gain_m", "Höhenmeter", "m"]];
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const safeUrl = value => { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; } };
  function friendlyReviewReason(reason) {
    const message = String(reason || "");
    if (/active|discovery|current.*edition|latest.*edition/i.test(message)) return "Die Ausgabe ist noch nicht die nächste sichtbare Ausgabe. Bitte vorhandene aktuelle Ausgaben und deren Termine hier unter den offenen Hinweisen prüfen.";
    if (/source|crawl|health|fetch/i.test(message)) return "Die vorhandenen Quellenbedingungen sind noch nicht erfüllt. Bitte die offizielle editionsgenaue Quelle und offene Quellenprobleme hier unter den offenen Hinweisen prüfen.";
    if (/conflict|pending|review task|proposal|issue/i.test(message)) return "Es gibt noch offene Prüfungen oder widersprüchliche Angaben. Bitte die Hinweise hier unter den offenen Hinweisen klären.";
    if (/required|missing|evidence|field|complete/i.test(message)) return "Der vollständige Freigabenachweis ist noch unvollständig. Bitte alle 14 Kernangaben mit belegbaren Werten ausdrücklich prüfen.";
    if (/[äöüÄÖÜß]|\b(Bitte|Die|Der|Für|Vor|Ein|Eine)\b/.test(message)) return message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[Ausgabe]");
    return "Die bestehenden Freigaberegeln sind noch nicht erfüllt. Bitte die offenen Hinweise hier unter den offenen Hinweisen prüfen.";
  }

  // Empty inputs are omissions. Only the separate deletion checkboxes delete data.
  function buildPatch(before, values, touchedFields, clearFields, allowedFields) {
    const patch = {};
    const clear = new Set(clearFields || []);
    for (const field of touchedFields || []) {
      if (!allowedFields.includes(field) || clear.has(field)) continue;
      const value = values[field];
      if (value === "" || value === undefined || value === null) continue;
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Bitte eine gültige Zahl eingeben.");
      if (!equal(before?.[field], value)) patch[field] = clone(value);
    }
    return patch;
  }

  function seedNextEdition() {
    return { edition_key: "main", edition_status: "date_unconfirmed", registration_status: "unknown", race_formats: [] };
  }

  // Keep unexposed properties on existing formats; removal is an explicit action.
  function mergeRaceFormats(original, rows, removedIndexes = []) {
    const removed = new Set(removedIndexes);
    return rows.filter(row => !removed.has(row.index)).map(row => {
      const prior = Number.isInteger(row.index) && original[row.index] ? clone(original[row.index]) : {};
      if (typeof row.label === "string" && row.label.trim()) prior.label = row.label.trim();
      if (row.distance_km !== "" && row.distance_km !== undefined && row.distance_km !== null) {
        const distance = Number(row.distance_km);
        if (!Number.isFinite(distance) || distance < 0) throw new Error("Distanzen müssen gültige Kilometerangaben sein.");
        prior.distance_km = distance;
      }
      if (row.clear_distance === true) delete prior.distance_km;
      for (const [key, label] of FORMAT_DETAILS) {
        if (row[key] !== "" && row[key] !== undefined && row[key] !== null) {
          const value = Number(row[key]);
          if (!Number.isFinite(value) || value < 0) throw new Error(`${label} braucht eine gültige nicht negative Zahl.`);
          prior[key] = value;
        }
        if (row[`clear_${key}`] === true) delete prior[key];
      }
      if (!prior.label) throw new Error("Jeder Wettbewerb benötigt eine Bezeichnung, z. B. 10-km-Lauf oder Staffel.");
      return prior;
    });
  }

  function assertSaveOutcome(data, request) {
    if (!data || data.saved !== true || data.request_id !== request.request_id || String(data.event_id) !== String(request.event_id) || !data.edition_id || (request.action !== "create" && data.edition_id !== request.edition_id)) {
      throw new Error("Der Server hat das Speichern nicht eindeutig bestätigt. Bitte denselben Speichervorgang erneut prüfen.");
    }
    return data;
  }

  function assertContext(context, eventId) {
    if (!context?.event || String(context.event.id) !== String(eventId) || !Array.isArray(context.editions) || typeof context.version !== "string" || !context.version) throw new Error("Der aktuelle Datenbankstand konnte nicht vollständig geladen werden.");
    return context;
  }

  async function rpc(client, name, args, timeoutMs = 20000) {
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve(client.rpc(name, args)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Die Antwort dauert zu lange."), { uncertain: true })), timeoutMs); })
      ]);
      if (result.error) throw result.error;
      return result.data;
    } finally { clearTimeout(timer); }
  }

  async function saveWithRecovery(client, request, options = {}) {
    let receipt;
    try {
      receipt = assertSaveOutcome(await rpc(client, "save_manual_event_maintenance", { p_request: request }, options.timeoutMs), request);
    } catch (error) {
      // The same immutable operation key makes a lost response safe to resolve.
      if (error.code && !["57014", "08000", "08006"].includes(error.code) && !error.uncertain) throw error;
      options.onRecovery?.();
      try { receipt = assertSaveOutcome(await rpc(client, "save_manual_event_maintenance", { p_request: request }, options.timeoutMs), request); }
      catch (retryError) { if (!retryError.code || ["57014", "08000", "08006"].includes(retryError.code)) retryError.uncertain = true; throw retryError; }
    }
    let context;
    try { context = assertContext(await rpc(client, "admin_manual_event_context", { p_event_id: request.event_id }, options.timeoutMs), request.event_id); }
    catch (error) { error.uncertain = true; throw error; }
    if (!context.editions.some(edition => edition.id === receipt.edition_id)) throw new Error("Gespeicherte Ausgabe konnte nicht aus der Datenbank zurückgelesen werden. Bitte denselben Vorgang erneut prüfen.");
    return { ...receipt, context };
  }

  function publicProjection(event, edition) {
    const date = edition.start_date ? edition.start_date.slice(0, 10).split("-").reverse().join(".") : null;
    return { event_id: event.id, edition_id: edition.id, event_name: event.canonical_name, sport: event.sport, city: event.city, country: event.country, address: event.address, latitude: event.latitude, longitude: event.longitude, description: event.description, official_url: event.official_url, organizer_name: event.organizer_name, organizer_url: event.organizer_url, date, edition_year: edition.edition_year, registration_status: edition.registration_status, registration_url: edition.registration_url, source_url: edition.source_url, event_url: edition.registration_url ?? event.official_url ?? edition.source_url ?? null, distance: edition.legacy_distance ?? edition.race_formats?.[0]?.label ?? null, event_status: edition.edition_status, race_formats: edition.race_formats,
      ...Object.fromEntries(["end_date", "start_time", "price_min", "price_max", "currency", "participant_limit"].map(key => [key, edition[key] ?? null])) };
  }

  function comparePublicRow(row, expected) {
    if (!row) return false;
    return Object.entries(expected).every(([key, value]) => {
      if (value === undefined) return true;
      // Even an explicitly cleared field must exist in the public contract.
      if (!Object.hasOwn(row, key)) return false;
      if (["event_id", "edition_year", "latitude", "longitude", "price_min", "price_max", "participant_limit"].includes(key) && value !== null) return row[key] !== null && row[key] !== undefined && Number(row[key]) === Number(value);
      if (key === "start_time" && value != null) {
        const time = input => String(input).split(":").concat(["00"]).slice(0, 3).join(":");
        return time(row[key]) === time(value);
      }
      return equal(row[key] ?? null, value ?? null);
    });
  }

  // Load the same regular detail URL a visitor sees. A successful API read alone
  // cannot prove that deployed HTML/JS actually renders the saved values.
  async function verifyRenderedDetail({ event, edition, documentRef = globalThis.document, timeoutMs = 25000 }) {
    const slug = edition.edition_slug || edition.slug;
    if (!documentRef || !slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return { detailVerified: false };
    const detailUrl = new URL(`/event/${slug}/`, documentRef.location.href);
    detailUrl.searchParams.set("maintenance_check", globalThis.crypto.randomUUID());
    const frame = documentRef.createElement("iframe");
    frame.title = "Öffentlichen Detailstand prüfen"; frame.hidden = true;
    frame.setAttribute("aria-hidden", "true"); frame.src = detailUrl.href;
    const expected = publicProjection(event, edition);
    return new Promise(resolve => {
      let timer, poll;
      const finish = detailVerified => { clearTimeout(timer); clearInterval(poll); frame.remove(); resolve({ detailVerified, detailUrl: detailUrl.pathname }); };
      const inspect = () => {
        try {
          const doc = frame.contentDocument;
          if (doc?.documentElement.dataset.semPublicDetailState === "unavailable") return finish(false);
          if (doc?.documentElement.dataset.semPublicDetailState !== "verified" || doc.documentElement.dataset.semPublicEditionId !== edition.id) return;
          const data = JSON.parse(doc.getElementById("sem-public-detail-data")?.textContent || "null");
          finish(comparePublicRow(data, expected));
        } catch { finish(false); }
      };
      timer = setTimeout(() => finish(false), timeoutMs); poll = setInterval(inspect, 150);
      frame.addEventListener("load", inspect); documentRef.body.appendChild(frame);
    });
  }

  async function verifyPublicEdition({ supabaseUrl, publishableKey, event, edition, fetchImpl = globalThis.fetch }) {
    if (edition.publication_status !== "published") return { status: "draft", archiveVerified: false, discoveryVerified: false, staticVerified: false };
    if (!supabaseUrl || !publishableKey) throw new Error("Die öffentliche Verbindung ist nicht konfiguriert.");
    const expected = publicProjection(event, edition);
    // This request intentionally has no session bearer token or cookies. Admin RLS
    // must never be mistaken for anonymous visibility.
    const read = async view => {
      const url = new URL(`/rest/v1/${view}`, supabaseUrl);
      url.searchParams.set("select", "*");
      url.searchParams.set("edition_id", `eq.${edition.id}`);
      const headers = { apikey: publishableKey };
      if (publishableKey.startsWith("eyJ")) headers.Authorization = `Bearer ${publishableKey}`;
      const response = await fetchImpl(url.href, { headers, credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Der öffentliche Katalog ist aktuell nicht erreichbar. Die Datenbankspeicherung bleibt erhalten.");
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 1) throw new Error("Der öffentliche Katalog liefert kein eindeutiges Ergebnis.");
      return rows[0] || null;
    };
    const [archive, discovery] = await Promise.all([read("public_event_archive"), read("public_event_discovery")]);
    const archiveVerified = comparePublicRow(archive, expected);
    const discoveryVerified = comparePublicRow(discovery, expected);
    return { status: archiveVerified ? "live_verified" : "pending", archiveVerified, discoveryVerified, discoveryPresent: Boolean(discovery), staticVerified: false };
  }

  function display(value) {
    if (value === null || value === undefined || value === "") return "Nicht angegeben";
    if (Array.isArray(value)) return value.map(row => `${row.label || "Wettbewerb"}${row.distance_km != null ? ` (${row.distance_km} km)` : ""}${FORMAT_DETAILS.filter(([key]) => row[key] != null).map(([key, label, unit]) => ` · ${label}: ${row[key]} ${unit}`).join("")}`).join("; ") || "Keine Wettbewerbe";
    return STATUS[value] || String(value);
  }

  function mount({ root, client, verifyPublication, refreshCatalog, verifyDetail = verifyRenderedDetail }) {
    let context = null, selectedId = null, action = "correct", busy = false, pending = null, lastReceipt = null, unresolved = false;
    let touched = new Set(), formatsDirty = false, formatConflict = false, searchSequence = 0, selectionSequence = 0, initialSourceUrl = "";
    root.innerHTML = `<section class="admin-table-section event-maintenance" aria-labelledby="maintenanceTitle">
      <span class="admin-eyebrow">Manuelle Datenpflege</span><h3 id="maintenanceTitle">Events pflegen</h3>
      <p>Offizielle Seiten selbst prüfen, einzelne Angaben bestätigen oder korrigieren und neue Ausgaben als Entwurf anlegen.</p>
      <form data-maintenance-search-form class="maintenance-search"><label>Event suchen<input data-maintenance-search type="search" placeholder="Name der Veranstaltung" autocomplete="off" maxlength="120"></label><button type="submit">Suchen</button></form>
      <div data-maintenance-results class="maintenance-results" aria-live="polite"></div>
      <p data-maintenance-status class="admin-section-status" role="status" aria-live="polite"></p>
      <div data-maintenance-editor></div><div data-maintenance-publication aria-live="polite"></div>
    </section>`;
    const $ = selector => root.querySelector(selector);
    const editor = $("[data-maintenance-editor]");
    const status = (message, error = false) => { $("[data-maintenance-status]").textContent = message; $("[data-maintenance-status]").classList.toggle("is-error", error); };
    const selected = () => context?.editions.find(edition => edition.id === selectedId);
    const values = () => ({ event: context?.event || {}, edition: action === "create" ? seedNextEdition() : selected() || {} });
    const setBusy = value => { busy = value; root.setAttribute("aria-busy", String(value)); root.querySelectorAll("input,select,textarea,button").forEach(input => { input.disabled = value || input.dataset.maintenanceReadonly === "true" || (unresolved && !input.matches("[data-maintenance-save]")); }); };
    const invalidate = () => { pending = null; $("[data-maintenance-preview-box]")?.remove(); };

    function field([path, label, type]) {
      const [scope, name] = path.split(".");
      const value = values()[scope][name] ?? "";
      let control;
      const lists = { sport: [["Running", "Laufen"], ["Trail Running", "Trailrunning"], ["Ultra Running", "Ultralauf"], ["Triathlon", "Triathlon"]], editionStatus: ["date_unconfirmed", "scheduled", "postponed", "cancelled", "completed", "inactive"].map(key => [key, STATUS[key]]), registrationStatus: ["unknown", "registration_not_open", "registration_open", "sold_out", "cancelled"].map(key => [key, key === "cancelled" ? "Anmeldung abgesagt" : STATUS[key]]) };
      const common = `data-maintenance-field="${path}" id="maintenance-${scope}-${name}"${action === "create" && scope === "event" ? ' disabled data-maintenance-readonly="true"' : ""}`;
      if (lists[type]) {
        const options = lists[type];
        if (value && !options.some(([key]) => key === value)) options.push([value, value]);
        control = `<select ${common}><option value="">Nicht angegeben</option>${options.map(([key, text]) => `<option value="${escape(key)}" ${key === value ? "selected" : ""}>${escape(text)}</option>`).join("")}</select>`;
      } else if (type === "textarea") control = `<textarea ${common} rows="3">${escape(value)}</textarea>`;
      else control = `<input ${common} type="${type}" value="${escape(value)}" ${type === "number" ? `step="${name === "participant_limit" ? "1" : "any"}"` : ""}>`;
      const clearAllowed = !["canonical_name", "sport", "city", "country", "registration_status", "edition_status"].includes(name) && !(action === "create" && scope === "event");
      return `<div class="maintenance-field"><label for="maintenance-${scope}-${name}">${escape(label)}${scope === "event" ? ' <small>(alle Ausgaben)</small>' : ""}</label>${control}<div class="maintenance-field-actions"><label><input type="checkbox" data-maintenance-confirm="${path}"> An Quelle geprüft</label>${value !== "" && clearAllowed ? `<label><input type="checkbox" data-maintenance-clear="${path}"> Bewusst entfernen</label>` : ""}</div></div>`;
    }

    function renderFormats() {
      const original = values().edition.race_formats || [];
      $("[data-maintenance-formats]").innerHTML = original.map((row, index) => formatRow(row, index)).join("");
    }

    function formatRow(row, index) {
      const summary = FORMAT_DETAILS.filter(([key]) => row[key] != null).map(([key, label, unit]) => `${label}: ${row[key]} ${unit}`).join(" · ");
      return `<div class="maintenance-format" data-maintenance-format="${index}"><label>Wettbewerb<input data-format-label value="${escape(row.label || "")}" placeholder="z. B. Halbmarathon / Staffel"></label><label>Distanz (km)<input data-format-distance type="number" step="any" min="0" value="${escape(row.distance_km ?? "")}" placeholder="unbekannt"></label><details class="maintenance-format-details"><summary>Teilabschnitte und Höhenmeter${summary ? `<small>${escape(summary)}</small>` : ""}</summary><div class="maintenance-grid">${FORMAT_DETAILS.map(([key, label, unit]) => `<div class="maintenance-field"><label>${escape(label)} (${unit})<input data-format-detail="${key}" type="number" min="0" step="any" value="${escape(row[key] ?? "")}" placeholder="unbekannt"></label>${row[key] != null ? `<label><input type="checkbox" data-format-clear="${key}"> ${escape(label)} bewusst entfernen</label>` : ""}</div>`).join("")}</div></details><div class="maintenance-format-options"><label><input data-format-remove type="checkbox"> Wettbewerb bewusst entfernen</label>${row.distance_km != null ? `<label><input data-format-clear-distance type="checkbox"> Distanz bewusst entfernen</label>` : ""}</div></div>`;
    }

    function verificationHistory() {
      if (action === "create") return "";
      const entries = (context.verifications || []).filter(entry => String(entry.entity_id) === String(selectedId));
      if (!entries.length) return '<p class="maintenance-help">Noch keine manuellen Einzelprüfungen über diesen Pflegeweg protokolliert.</p>';
      return `<details class="admin-secondary-details maintenance-history"><summary>Letzte manuelle Prüfungen und Quellenhinweise</summary><ul>${entries.map(entry => {
        const evidence = entry.new_value || {};
        const [scope, key] = (evidence.field || "").split(".");
        const currentValue = scope ? values()[scope]?.[key] : undefined;
        const title = evidence.field ? `${LABELS[evidence.field] || "Angabe"}: ${equal(evidence.value, currentValue) ? "Wert entspricht der letzten Prüfung" : "Wert seit der Prüfung geändert"}` : evidence.result === "no_new_edition" ? "Keine neue Ausgabe angekündigt" : evidence.result === "unreachable" ? "Quelle nicht erreichbar – keine Bestätigung" : "Quellenprüfung protokolliert";
        const time = new Date(evidence.checked_at || entry.created_at);
        const date = Number.isNaN(time.getTime()) ? "Zeitpunkt nicht verfügbar" : time.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
        const source = safeUrl(evidence.source_url || entry.source_url);
        return `<li><strong>${escape(title)}</strong><p>Adminprüfung · ${escape(date)}</p>${entry.reason ? `<p>${escape(entry.reason)}</p>` : ""}${source ? `<a href="${escape(source)}" target="_blank" rel="noopener noreferrer">Geprüfte Quelle öffnen ↗</a>` : ""}</li>`;
      }).join("")}</ul></details>`;
    }

    function reviewItems() {
      if (action === "create") return "";
      const edition = selected();
      const inScope = row => !row.review_edition_id && !row.edition_id || (row.review_edition_id || row.edition_id) === selectedId;
      const proposalLabel = row => LABELS[`${row.entity_type === "event" ? "event" : "edition"}.${row.field_name}`] || LABELS[`event.${row.field_name}`] || LABELS[`edition.${row.field_name}`] || "Weitere Veranstaltungsangabe";
      const rows = [];
      for (const feedback of (context.feedback || []).filter(inScope)) rows.push({ kind: "feedback", id: feedback.id, title: "Gemeldete fehlerhafte Eventangaben", description: feedback.message || feedback.description || "Nutzerhinweis prüfen und die betroffenen Angaben gegebenenfalls korrigieren. Dieser Hinweis betrifft die gemeinsame Veranstaltung.", options: [["resolved", "Geprüft und behoben"], ["rejected", "Geprüft: Hinweis trifft nicht zu"]] });
      for (const issue of (context.validation_issues || []).filter(inScope)) rows.push({ kind: "validation_issue", id: issue.id, title: issue.message || issue.title || "Datenprüfung offen", description: issue.description || "Die betroffenen Angaben im Formular korrigieren. Einen unzutreffenden oder bereits behobenen Hinweis erst nach Prüfung begründet schließen.", options: [["resolved", "Geprüft: Hinweis behoben oder nicht zutreffend"]] });
      for (const alert of (context.data_alerts || []).filter(inScope)) rows.push({ kind: "data_alert", id: alert.id, title: alert.title || "Offener Datenhinweis", description: alert.message || alert.description || "Ursache prüfen und gegebenenfalls Angaben korrigieren, bevor der Hinweis geschlossen wird.", options: [["resolved", "Geprüft: Ursache behoben"]] });
      for (const proposal of (context.proposals || []).filter(inScope)) rows.push({ kind: "proposal", id: proposal.id, title: `Automatischer Änderungsvorschlag: ${proposalLabel(proposal)}`, description: `Bisher: ${display(proposal.old_value)} · Vorschlag: ${display(proposal.normalized_value ?? proposal.proposed_value)}`, source: proposal.source_url, options: [["rejected", "Vorschlag ablehnen; gespeicherten Wert behalten"], ["accepted", "Vorgeschlagenen Wert übernehmen"]] });
      for (const task of (context.review_tasks || []).filter(inScope).filter(row => row.task_type !== "new_edition_candidate")) rows.push({ kind: "source_task", id: task.id, title: task.title || "Offene Quellenprüfung", description: task.description || "Quelle erneut prüfen und das Ergebnis begründen.", source: (context.sources || []).find(row => row.id === task.source_id)?.source_url, options: [["resolved", "Quelle geprüft; Problem behoben"], ["ignored", "Hinweis nach Prüfung nicht zutreffend"]] });
      for (const candidate of (context.candidates || []).filter(row => row.draft_edition_id === selectedId && (row.candidate_status === "conflict" || row.validation_status === "conflict"))) {
        const range = candidate.candidate_start_date >= edition.start_date && candidate.candidate_start_date <= (edition.end_date || edition.start_date);
        rows.push({ kind: range ? "candidate_range" : "candidate_dates", id: candidate.id, title: "Abweichender Termin der erkannten Ausgabe", description: `Automatisch beobachtet: ${candidate.candidate_start_date || "Termin offen"}${candidate.candidate_end_date ? ` bis ${candidate.candidate_end_date}` : ""}. Gespeicherte Ausgabe: ${edition.start_date || "Termin offen"}${edition.end_date ? ` bis ${edition.end_date}` : ""}. Erst Datum und Enddatum im Formular anhand der offiziellen Quelle bestätigen und speichern. Danach die Abweichung hier mit Begründung klären. Die ursprüngliche Beobachtung bleibt im Verlauf erhalten.`, source: edition.source_url, options: [["confirmed", range ? "Beobachteter Tag gehört zum bestätigten Zeitraum" : "Offizielle Termine der gespeicherten Ausgabe sind maßgeblich"]] });
      }
      if (!rows.length) return '<p class="maintenance-help">Keine offenen Änderungsvorschläge oder Quellenaufgaben für diese Ausgabe.</p>';
      return `<details class="admin-secondary-details" open><summary>Offene Hinweise hier bearbeiten (${rows.length})</summary><p>Jede Entscheidung wird einzeln mit deinem Admin-Konto protokolliert. Sie ersetzt keine gezielte Feldprüfung. Zum Korrigieren eines falschen Vorschlags zuerst die richtigen Angaben im Formular speichern und anschließend den Vorschlag begründet ablehnen.</p>${rows.map(row => `<section class="maintenance-notice" data-maintenance-review-row="${escape(row.id)}" data-maintenance-review-kind="${row.kind}"><h4>${escape(row.title)}</h4><p>${escape(row.description)}</p>${safeUrl(row.source) ? `<a href="${escape(safeUrl(row.source))}" target="_blank" rel="noopener noreferrer">Zugehörige Quelle öffnen ↗</a>` : ""}<label>Entscheidung<select data-maintenance-review-decision>${row.options.map(([key, label]) => `<option value="${key}">${escape(label)}</option>`).join("")}</select></label>${row.kind.startsWith("candidate_") ? `<label>Geprüfte offizielle Quellen-URL<input data-maintenance-review-source type="url" value="${escape(row.source || "")}"></label>` : ""}<label>Begründung der Entscheidung<textarea data-maintenance-review-notes rows="2" minlength="20" placeholder="Was hast du geprüft und warum ist diese Entscheidung richtig?"></textarea></label><button type="button" data-maintenance-review-preview>Entscheidung prüfen</button></section>`).join("")}</details>`;
    }

    function previewReview(row) {
      try {
        if (touched.size || formatsDirty || root.querySelector("[data-maintenance-confirm]:checked,[data-maintenance-clear]:checked") || $("[data-maintenance-notes]").value.trim() || $("[data-maintenance-source]").value.trim() !== initialSourceUrl || $("[data-maintenance-source-result]").value !== "confirmed" || $("[data-maintenance-publish]")?.checked) throw new Error("Bitte deine Formularänderungen und Feldprüfungen zuerst speichern. Danach die offene Entscheidung bearbeiten.");
        const notes = row.querySelector("[data-maintenance-review-notes]").value.trim();
        if (notes.length < 20) throw new Error("Bitte die Entscheidung mit mindestens 20 Zeichen nachvollziehbar begründen.");
        const kind = row.dataset.maintenanceReviewKind;
        const review = { kind, id: row.dataset.maintenanceReviewRow };
        const decision = row.querySelector("[data-maintenance-review-decision]");
        if (kind.startsWith("candidate_")) Object.assign(review, { confirmed_start_date: selected().start_date, confirmed_end_date: selected().end_date });
        else review.decision = decision.value;
        const sourceUrl = row.querySelector("[data-maintenance-review-source]")?.value.trim() || selected().source_url;
        if (kind.startsWith("candidate_") && !safeUrl(sourceUrl)) throw new Error("Bitte die offizielle Quelle der bestätigten Termine angeben.");
        invalidate();
        pending = { request_id: globalThis.crypto.randomUUID(), action: "review", event_id: context.event.id, edition_id: selectedId, expected_version: context.version, event_patch: {}, edition_patch: {}, clear_fields: [], confirmations: [], source_url: sourceUrl, source_result: "confirmed", notes, publish: false, review };
        const box = document.createElement("section"); box.dataset.maintenancePreviewBox = ""; box.className = "maintenance-preview"; box.tabIndex = -1;
        box.innerHTML = `<h4>Entscheidung vor dem Speichern prüfen</h4><p>${escape(row.querySelector("h4").textContent)}</p><p>${escape(row.querySelector("p").textContent)}</p><p><strong>${escape(decision.selectedOptions[0].textContent)}</strong></p><p>${escape(notes)}</p><p>Diese Entscheidung erzeugt keine neue Feldbestätigung und veröffentlicht keinen Entwurf.</p><button type="button" data-maintenance-save>Verbindlich speichern</button><button type="button" data-maintenance-back>Weiter bearbeiten</button>`;
        row.appendChild(box); box.focus(); status("Entscheidung bereit. Noch nichts gespeichert.");
      } catch (error) { status(error.message, true); }
    }

    function renderEditor() {
      const edition = selected() || {};
      if (!selected()) action = "create";
      touched = new Set(); formatsDirty = false; formatConflict = false; pending = null;
      const officialSources = (context.sources || []).filter(item => ["official_event_website", "official_registration_platform"].includes(item.source_type) && item.is_active);
      const source = officialSources.find(item => item.edition_id === edition.id && item.source_url === edition.source_url)
        || officialSources.find(item => item.edition_id === edition.id && item.source_type === "official_event_website")
        || officialSources.find(item => !item.edition_id && item.source_type === "official_event_website");
      const sourceUrl = action === "create" ? "" : edition.source_url || source?.source_url || context.event.official_url || "";
      initialSourceUrl = sourceUrl;
      const warnings = [];
      if (edition.publication_status === "draft") warnings.push("Diese Ausgabe ist ein privater Entwurf. Speichern veröffentlicht sie nicht.");
      if (edition.needs_review) warnings.push("Für diese Ausgabe ist eine Prüfung offen.");
      if (edition.next_check_at && Date.parse(edition.next_check_at) <= Date.now()) warnings.push("Die nächste Quellenprüfung ist fällig.");
      if (!edition.start_date) warnings.push("Der Termin ist unbekannt. Ein Entwurf darf ohne Datum gespeichert werden.");
      if (action === "create") warnings.push("Neue Ausgabe: Stammdaten der Veranstaltung bleiben als ungeprüfte Vorlage sichtbar. Termin, Anmeldung, Wettbewerbe und Prüfungen werden nicht aus der alten Ausgabe übernommen.");
      const candidates = (context.candidates || []).filter(candidate => !["rejected", "superseded", "approved"].includes(candidate.candidate_status));
      editor.innerHTML = `<div class="maintenance-selection"><label>Ausgabe auswählen<select data-maintenance-edition>${context.editions.map(row => `<option value="${escape(row.id)}" ${row.id === selectedId ? "selected" : ""}>${escape(`${row.edition_year} · ${row.start_date || "Termin offen"}${row.edition_key && row.edition_key !== "main" ? ` · ${row.edition_key}` : ""} · ${row.publication_status === "draft" ? "Entwurf" : "Veröffentlicht"}`)}</option>`).join("")}</select></label><label>Was möchtest du tun?<select data-maintenance-action><option value="confirm" ${action === "confirm" ? "selected" : ""}>Angaben als weiterhin korrekt bestätigen</option><option value="correct" ${action === "correct" ? "selected" : ""}>Bestehende Ausgabe korrigieren</option><option value="create" ${action === "create" ? "selected" : ""}>Neue Ausgabe als Entwurf anlegen</option></select></label></div>
        <h4>${escape(context.event.canonical_name || context.event.event_name)}</h4>
        ${verificationHistory()}
        ${warnings.length ? `<ul class="maintenance-notice">${warnings.map(item => `<li>${escape(item)}</li>`).join("")}</ul>` : ""}
        ${candidates.length ? `<div class="maintenance-notice">${candidates.length} bereits erkannte Ausgabe(n). Vorhandene Entwürfe oben auswählen; weitere erkannte Ausgaben lassen sich über „Neue Ausgabe als Entwurf anlegen“ weiterbearbeiten. So bleibt die vorhandene Editionsidentität erhalten.</div>` : ""}
        <form data-maintenance-form novalidate>
          ${action === "create" ? `<div class="maintenance-grid"><div class="maintenance-field"><label for="maintenance-edition-edition_year">Ausgabejahr (erforderlich)</label><input id="maintenance-edition-edition_year" data-maintenance-field="edition.edition_year" type="number" min="2000" max="2200" step="1"><label><input type="checkbox" data-maintenance-confirm="edition.edition_year"> An Quelle geprüft</label></div><div class="maintenance-field"><label for="maintenance-edition-edition_key">Ausgabekürzel bei mehreren Ausgaben pro Jahr</label><input id="maintenance-edition-edition_key" data-maintenance-field="edition.edition_key" value="main" maxlength="48"><small>Für eine weitere Ausgabe z. B. „herbst“ statt „main“. Jahr und Kürzel identifizieren diese Ausgabe.</small></div></div>${candidates.some(row => !row.draft_edition_id) ? `<label>Bereits erkannte Ausgabe weiterbearbeiten<select data-maintenance-candidate><option value="">Neue, noch nicht erkannte Ausgabe</option>${candidates.filter(row => !row.draft_edition_id).map(row => `<option value="${escape(row.id)}">${escape(`${row.candidate_year} · ${row.candidate_start_date || "Termin offen"}`)}</option>`).join("")}</select></label><p class="maintenance-help">Bei Auswahl werden nur die bereits beobachteten Kandidatenangaben als ungeprüfte Vorlage eingesetzt.</p>` : ""}` : `<p class="maintenance-help">Ausgabejahr: ${escape(edition.edition_year)}. Eine Korrektur erhält die bestehende Ausgabe und ihre Saisonplaner- und Ergebnisverknüpfungen.</p><label class="maintenance-check"><input type="checkbox" data-maintenance-confirm="edition.edition_year"> Ausgabejahr ${escape(edition.edition_year)} an Quelle geprüft</label>`}
          <p class="maintenance-help">Name, Ort, Sport und die optionalen Veranstalterangaben gehören zur gemeinsamen Veranstaltung und gelten für alle Ausgaben. Ein Häkchen bestätigt nur das jeweilige Feld anhand deiner Quelle.</p>
          <div class="maintenance-grid">${FIELDS.filter(row => !row[3]).map(field).join("")}</div>
          <fieldset class="maintenance-formats"><legend>Wettbewerbe / Distanzen</legend><p class="maintenance-help">Je Wettbewerb eine Zeile. Weitere vorhandene Wettbewerbsdetails bleiben erhalten. Unbekannte Distanzen dürfen leer bleiben.</p><div data-maintenance-formats></div><button type="button" data-maintenance-add-format>Wettbewerb hinzufügen</button><label class="maintenance-check"><input type="checkbox" data-maintenance-confirm="edition.race_formats"> Alle aufgeführten Wettbewerbe an Quelle geprüft</label></fieldset>
          <details class="admin-secondary-details"><summary>Optionale Details und Veranstalterangaben</summary><div class="maintenance-grid">${FIELDS.filter(row => row[3]).map(field).join("")}</div></details>
          <fieldset class="maintenance-evidence"><legend>Quelle und Prüfnotiz</legend><label>Persönlich geprüfte Quellen-URL<input data-maintenance-source type="url" value="${escape(sourceUrl)}" placeholder="https://…"></label><a data-maintenance-open-source class="maintenance-source" target="_blank" rel="noopener noreferrer" ${safeUrl(sourceUrl) ? `href="${escape(safeUrl(sourceUrl))}"` : "hidden"}>Offizielle Quelle öffnen ↗</a><label>Prüfergebnis<select data-maintenance-source-result><option value="confirmed">Angaben auf der Quelle geprüft</option><option value="no_new_edition">Noch keine neue Ausgabe angekündigt</option><option value="unreachable">Quelle nicht erreichbar</option></select></label><label>Prüfnotiz<textarea data-maintenance-notes rows="3" placeholder="Was steht auf der offiziellen Seite? Bei Bestätigung den relevanten Beleg notieren." minlength="12"></textarea></label><p class="maintenance-help">Nur markierte Felder werden verifiziert und vor automatischem Überschreiben geschützt. Eine nicht erreichbare Quelle bestätigt keine Angaben. Normales Speichern erneuert nicht die Frische des gesamten Datensatzes.</p></fieldset>
          ${action !== "create" && edition.publication_status === "draft" ? `<div class="maintenance-notice"><label class="maintenance-check"><input type="checkbox" data-maintenance-publish> Nach vollständiger Prüfung zur Veröffentlichung freigeben</label><p>Erfordert die bewusste Quellenprüfung aller 14 Kernangaben: Name, Ausgabejahr, Datum, Ort, Land, Adresse, beide Koordinaten, Sport, Wettbewerbe, Beschreibung, Anmeldestatus, offizielle Ausgabeseite und Anmeldelink. Fehlende Belege blockieren die Freigabe; der Entwurf bleibt gespeichert.</p></div>` : ""}
          <div class="maintenance-actions"><button type="submit" data-maintenance-preview>Änderungen prüfen</button><button type="button" data-maintenance-reload>Aktuellen Stand laden</button></div>
        </form><div data-maintenance-reviews>${reviewItems()}</div>`;
      renderFormats();
    }

    async function loadEvent(eventId, editionId) {
      const sequence = ++selectionSequence;
      status("Event und Ausgaben werden geladen …");
      try {
        const loaded = assertContext(await rpc(client, "admin_manual_event_context", { p_event_id: eventId }), eventId);
        if (sequence !== selectionSequence) return;
        context = loaded;
        selectedId = loaded.editions.some(row => row.id === editionId) ? editionId : loaded.editions[0]?.id;
        action = loaded.editions.length ? "correct" : "create"; lastReceipt = null; $("[data-maintenance-publication]").innerHTML = "";
        renderEditor(); status("Datenbankstand geladen. Nur ausdrücklich geprüfte Angaben markieren.");
      } catch (error) { status(error.message || "Event konnte nicht geladen werden.", true); }
    }

    function collectRequest() {
      if (formatConflict) throw new Error("Die Wettbewerbe wurden zwischenzeitlich geändert. Bitte zuerst den aktuellen Formularstand übernehmen und die Wettbewerbe erneut bearbeiten.");
      const before = values();
      const edited = { event: {}, edition: {} };
      root.querySelectorAll("[data-maintenance-field]").forEach(input => {
        const [scope, key] = input.dataset.maintenanceField.split(".");
        edited[scope][key] = input.value === "" ? "" : input.type === "number" ? Number(input.value) : input.value.trim();
      });
      const clear = [...root.querySelectorAll("[data-maintenance-clear]:checked")].map(input => input.dataset.maintenanceClear);
      const cleared = scope => clear.filter(path => path.startsWith(`${scope}.`)).map(path => path.split(".")[1]);
      const touchedFor = scope => [...touched].filter(path => path.startsWith(`${scope}.`)).map(path => path.split(".")[1]);
      const eventPatch = buildPatch(before.event, edited.event, touchedFor("event"), cleared("event"), EVENT_FIELDS);
      const editionPatch = buildPatch(before.edition, edited.edition, touchedFor("edition"), cleared("edition"), EDITION_FIELDS);
      if (editionPatch.start_date && before.edition.end_date && before.edition.end_date === before.edition.start_date && !touched.has("edition.end_date") && !clear.includes("edition.end_date")) editionPatch.end_date = editionPatch.start_date;
      const nextStart = editionPatch.start_date || before.edition.start_date;
      const nextEnd = clear.includes("edition.end_date") ? null : editionPatch.end_date || before.edition.end_date;
      if (nextStart && nextEnd && nextEnd < nextStart) {
        root.querySelector("[data-maintenance-field='edition.end_date']").closest("details").open = true;
        throw new Error("Das Enddatum liegt vor dem neuen Termin. Bitte das Enddatum in den optionalen Details ebenfalls prüfen und korrigieren.");
      }
      if (action === "create") {
        const year = edited.edition.edition_year;
        if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error("Bitte das belegte Ausgabejahr eingeben. Das Datum darf für einen Entwurf unbekannt bleiben.");
        Object.assign(editionPatch, { edition_year: year, edition_key: edited.edition.edition_key || "main" });
        if (Object.keys(eventPatch).length || clear.some(path => path.startsWith("event."))) throw new Error("Neue Ausgaben übernehmen nur die Stammdaten. Bitte gemeinsame Angaben separat an einer bestehenden Ausgabe korrigieren.");
      }
      if (formatsDirty) {
        const rows = [...root.querySelectorAll("[data-maintenance-format]")].map(row => ({ index: Number(row.dataset.maintenanceFormat), label: row.querySelector("[data-format-label]").value, distance_km: row.querySelector("[data-format-distance]").value, clear_distance: row.querySelector("[data-format-clear-distance]")?.checked, removed: row.querySelector("[data-format-remove]").checked, ...Object.fromEntries(FORMAT_DETAILS.flatMap(([key]) => [[key, row.querySelector(`[data-format-detail="${key}"]`).value], [`clear_${key}`, Boolean(row.querySelector(`[data-format-clear="${key}"]`)?.checked)]])) }));
        editionPatch.race_formats = mergeRaceFormats(before.edition.race_formats || [], rows, rows.filter(row => row.removed).map(row => row.index));
      }
      if (action === "confirm" && (Object.keys(eventPatch).length || Object.keys(editionPatch).length || clear.length)) throw new Error("Für geänderte Angaben bitte „Bestehende Ausgabe korrigieren“ wählen. Deine Eingaben bleiben erhalten.");
      const confirmations = [...root.querySelectorAll("[data-maintenance-confirm]:checked")].map(input => input.dataset.maintenanceConfirm);
      const sourceResult = $("[data-maintenance-source-result]").value;
      if (sourceResult !== "confirmed" && confirmations.length) throw new Error("Bei einer unerreichbaren Quelle oder noch nicht angekündigten Ausgabe dürfen keine Felder bestätigt werden. Bitte die Häkchen entfernen.");
      if (sourceResult === "confirmed" && !confirmations.length && !Object.keys(eventPatch).length && !Object.keys(editionPatch).length && !clear.length) throw new Error("Bitte mindestens ein geprüftes Feld markieren oder eine Angabe ändern.");
      const sourceUrl = $("[data-maintenance-source]").value.trim();
      if (!safeUrl(sourceUrl)) throw new Error("Bitte eine vollständige offizielle Quellen-URL mit https:// oder http:// eingeben.");
      const notes = $("[data-maintenance-notes]").value.trim();
      if (notes.length < 12) throw new Error("Bitte eine verständliche Prüfnotiz mit mindestens 12 Zeichen ergänzen.");
      const publish = Boolean($("[data-maintenance-publish]")?.checked);
      if (publish && REQUIRED_CHECKS.some(path => !confirmations.includes(path))) throw new Error("Vor der Veröffentlichung bitte alle 14 Kernangaben ausdrücklich an der Quelle prüfen. Ohne vollständige Prüfung kannst du den Entwurf speichern, indem du die Freigabe abwählst.");
      const request = { request_id: globalThis.crypto.randomUUID(), action, event_id: context.event.id, edition_id: selectedId, expected_version: context.version, event_patch: eventPatch, edition_patch: editionPatch, clear_fields: clear, confirmations, source_url: sourceUrl, source_result: sourceResult, notes, publish };
      if ($("[data-maintenance-candidate]")?.value) request.candidate_id = $("[data-maintenance-candidate]").value;
      return request;
    }

    function preview() {
      try {
        if (!$("[data-maintenance-form]").reportValidity()) return;
        pending = collectRequest();
        $("[data-maintenance-preview-box]")?.remove();
        const before = values();
        const changes = [];
        for (const scope of ["event", "edition"]) for (const [key, value] of Object.entries(pending[`${scope}_patch`])) changes.push([`${scope}.${key}`, before[scope][key], value]);
        for (const path of pending.clear_fields) { const [scope, key] = path.split("."); changes.push([path, before[scope][key], null]); }
        const box = document.createElement("section"); box.dataset.maintenancePreviewBox = ""; box.className = "maintenance-preview"; box.tabIndex = -1;
        box.innerHTML = `<h4>Vor dem Speichern prüfen</h4><p>${action === "create" ? "Es entsteht eine neue private Ausgabe. Die alte Ausgabe bleibt unverändert." : "Die ausgewählte bestehende Ausgabe wird bearbeitet."}</p>${changes.length ? `<ul>${changes.map(([path, oldValue, next]) => `<li><strong>${escape(LABELS[path] || path)}</strong><div>Bisher: ${escape(display(oldValue))}</div><div>${next === null ? "Bewusst entfernen" : `Neu: ${escape(display(next))}`}</div></li>`).join("")}</ul>` : "<p>Keine Faktenänderungen.</p>"}<p><strong>Gezielt bestätigen:</strong> ${escape(pending.confirmations.map(path => LABELS[path] || path).join(", ") || "Keine Felder")}</p><p><strong>Quelle:</strong> ${escape(pending.source_url)}</p><p><strong>Prüfergebnis:</strong> ${escape($("[data-maintenance-source-result]").selectedOptions[0].textContent)}</p><p>${escape(pending.notes)}</p><p>${pending.publish ? "Ausdrücklich gewünscht: nach erfolgreicher vollständiger Prüfung veröffentlichen." : "Keine neue Veröffentlichung angefordert."} Speichern und öffentliche Veröffentlichung werden getrennt geprüft.</p><button type="button" data-maintenance-save>Verbindlich speichern</button><button type="button" data-maintenance-back>Weiter bearbeiten</button>`;
        $("[data-maintenance-form]").appendChild(box); box.focus(); status("Änderungsübersicht bereit. Noch nichts gespeichert.");
      } catch (error) { status(error.message, true); }
    }

    async function checkPublication() {
      if (!lastReceipt || !context) return;
      const output = $("[data-maintenance-publication]");
      const edition = selected();
      const receipt = lastReceipt;
      const expectedId = selectedId, expectedVersion = context.version;
      const current = () => selectedId === expectedId && context?.version === expectedVersion && lastReceipt === receipt;
      output.innerHTML = `<p>Veröffentlichungsstand wird geprüft …</p>`;
      try {
        const result = verifyPublication ? await verifyPublication({ event: context.event, edition }) : { status: edition.publication_status === "draft" ? "draft" : "pending" };
        if (!current()) return;
        const failed = receipt.publication?.status === "failed";
        let detail = { detailVerified: false }, catalog = { refreshed: false };
        if (!failed && result.archiveVerified) {
          output.innerHTML = "<p>Im öffentlichen Live-Archiv geprüft. Normale Detailseite, Karte und Liste werden geprüft …</p>";
          [detail, catalog] = await Promise.all([
            verifyDetail({ event: context.event, edition }).catch(() => ({ detailVerified: false })),
            refreshCatalog ? Promise.resolve(refreshCatalog({ event: context.event, edition, discoveryPresent: result.discoveryPresent ?? result.discoveryVerified })).catch(() => ({ refreshed: false })) : Promise.resolve({ refreshed: false })
          ]);
        }
        if (!current()) return;
        const websiteVerified = result.archiveVerified && detail.detailVerified && (!result.discoveryPresent && !result.discoveryVerified || result.discoveryVerified && catalog.refreshed);
        const liveText = failed ? `Entwurf gespeichert; Veröffentlichung fehlgeschlagen: ${friendlyReviewReason(receipt.publication.error)} Bitte die fehlenden Belege ergänzen und erneut bewusst freigeben.` : result.status === "draft" ? "Privater Entwurf gespeichert. Für die Veröffentlichung alle 14 Kernangaben prüfen und die Freigabe im Formular ausdrücklich auswählen." : websiteVerified ? `Öffentlich aktualisiert: Normale Detailseite geprüft.${result.discoveryVerified ? " Karte und Liste sind mit den gespeicherten Angaben neu geladen." : " Diese Ausgabe ist im Archiv sichtbar; sie ist nicht die nächste Ausgabe in Karte und Liste."}` : "Datenbank gespeichert; die öffentliche Änderung ist noch nicht vollständig verifiziert.";
        output.innerHTML = `<div class="maintenance-notice${failed ? " is-error" : ""}"><strong>${escape(liveText)}</strong>${result.archiveVerified && !websiteVerified ? `<p>Öffentlicher Katalog: geprüft. Detailseite: ${detail.detailVerified ? "geprüft" : "noch nicht bestätigt"}. Karte und Liste: ${catalog.refreshed ? "neu geladen" : "noch nicht bestätigt"}. Erneut prüfen; die Speicherung bleibt erhalten.</p>` : ""}<p>Die Online-Ansichten laden aktuelle Daten direkt. Bei einem Datenbankausfall kann ein älterer, entsprechend gekennzeichneter Export erscheinen; dessen Stand wird durch diese Prüfung nicht erneuert.</p>${detail.detailUrl ? `<a href="${escape(detail.detailUrl)}" target="_blank" rel="noopener noreferrer">Öffentliche Detailseite öffnen ↗</a>` : ""}<button type="button" data-maintenance-check-publication>Öffentlichen Stand erneut prüfen</button></div>`;
      } catch (error) {
        if (!current()) return;
        output.innerHTML = `<div class="maintenance-notice is-error"><strong>${escape(error.message)}</strong><p>Die Speicherung ist erhalten; Veröffentlichung konnte nicht geprüft werden.</p><button type="button" data-maintenance-check-publication>Veröffentlichung erneut prüfen</button></div>`;
      }
    }

    async function save() {
      if (busy || !pending) return;
      const request = pending; setBusy(true); status("Wird atomar gespeichert und erneut aus der Datenbank geladen …");
      try {
        const result = await saveWithRecovery(client, request, { onRecovery: () => status("Antwort unklar. Derselbe Speichervorgang wird ohne Duplikat erneut abgefragt …") });
        unresolved = false; context = result.context; selectedId = result.edition_id; action = "correct"; lastReceipt = result;
        renderEditor(); setBusy(true); status(`In der Datenbank gespeichert und neu geladen. ${request.action === "review" ? "Entscheidung protokolliert. Für einen vollständigen Frischenachweis die Kernangaben gezielt prüfen und speichern." : result.freshness?.verified ? "Vollständige Frischeprüfung bestätigt." : `Nur ausdrücklich ausgewählte Felder wurden geprüft; keine pauschale Frischebestätigung.${result.freshness?.reason ? ` ${friendlyReviewReason(result.freshness.reason)}` : ""}`}`);
        await checkPublication();
      } catch (error) {
        unresolved = Boolean(error.uncertain);
        const conflict = ["40001", "PT409"].includes(error.code) || /version|conflict|concurrent|zwischenzeit|verändert/i.test(error.message || "");
        status(unresolved ? "Der Speicherstand ist noch unklar. Deine Eingaben bleiben erhalten. Bitte „Verbindlich speichern“ erneut wählen: Derselbe Auftrag wird sicher wiederholt, bevor du weiterbearbeitest." : conflict ? "Zwischenzeitlich wurden diese Daten geändert. Deine Eingaben bleiben erhalten. Lade den aktuellen Stand zum Vergleich und prüfe deine Änderungen erneut." : (error.message || "Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Derselbe Speichervorgang kann erneut geprüft werden."), true);
      } finally { setBusy(false); }
    }

    root.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      if (event.target.matches("[data-maintenance-form]")) { preview(); return; }
      if (!event.target.matches("[data-maintenance-search-form]")) return;
      const query = $("[data-maintenance-search]").value.trim();
      if (query.length < 2) { status("Bitte mindestens zwei Buchstaben des Eventnamens eingeben.", true); return; }
      const sequence = ++searchSequence; status("Events werden gesucht …");
      try {
        const { data, error } = await client.from("events").select("id,canonical_name,event_name,city").ilike("canonical_name", `%${query.replace(/[%_\\]/g, "\\$&")}%`).order("canonical_name").limit(30);
        if (error) throw error; if (sequence !== searchSequence) return;
        $("[data-maintenance-results]").innerHTML = (data || []).map(row => `<button type="button" data-maintenance-event="${escape(row.id)}">${escape(row.canonical_name || row.event_name)} <small>${escape(row.city || "Ort unbekannt")}</small></button>`).join("");
        status(data?.length ? `${data.length} Treffer${data.length === 30 ? " (Suche bei Bedarf eingrenzen)" : ""}. Event auswählen.` : "Keine passenden Events gefunden.");
      } catch (error) { status(error.message || "Suche fehlgeschlagen.", true); }
    });

    root.addEventListener("input", event => {
      if (busy) return;
      if (event.target.dataset.maintenanceField) touched.add(event.target.dataset.maintenanceField);
      if (event.target.closest("[data-maintenance-format]")) formatsDirty = true;
      if (event.target.closest("[data-maintenance-form],[data-maintenance-review-row]")) invalidate();
      if (event.target.matches("[data-maintenance-source]")) {
        const url = safeUrl(event.target.value); const link = $("[data-maintenance-open-source]"); link.hidden = !url; if (url) link.href = url; else link.removeAttribute("href");
      }
    });
    root.addEventListener("change", event => {
      if (busy) return;
      if (event.target.dataset.maintenanceField) touched.add(event.target.dataset.maintenanceField);
      if (event.target.matches("[data-maintenance-edition]")) { selectedId = event.target.value; lastReceipt = null; $("[data-maintenance-publication]").innerHTML = ""; renderEditor(); }
      if (event.target.matches("[data-maintenance-action]")) {
        const next = event.target.value;
        lastReceipt = null; $("[data-maintenance-publication]").innerHTML = "";
        // Confirm/correct share the current form; keep values when switching.
        if (action !== "create" && next !== "create") { action = next; invalidate(); }
        else { action = next; renderEditor(); }
      }
      if (event.target.closest("[data-maintenance-format]")) formatsDirty = true;
      if (event.target.matches("[data-maintenance-candidate]")) {
        const candidate = context.candidates.find(row => row.id === event.target.value);
        if (candidate) {
          for (const [path, value] of [["edition.edition_year", candidate.candidate_year], ["edition.start_date", candidate.candidate_start_date], ["edition.source_url", candidate.evidence_url || candidate.source_url]]) {
            if (!value) continue;
            const control = root.querySelector(`[data-maintenance-field="${path}"]`); if (control) { control.value = value; touched.add(path); }
          }
        }
        root.querySelectorAll("[data-maintenance-confirm]").forEach(input => { input.checked = false; });
      }
      if (event.target.closest("[data-maintenance-form],[data-maintenance-review-row]")) invalidate();
    });
    root.addEventListener("click", async event => {
      const button = event.target.closest("button"); if (!button || busy) return;
      if (button.dataset.maintenanceEvent) await loadEvent(button.dataset.maintenanceEvent);
      if (button.matches("[data-maintenance-review-preview]")) previewReview(button.closest("[data-maintenance-review-row]"));
      if (button.matches("[data-maintenance-save]")) await save();
      if (button.matches("[data-maintenance-back]")) invalidate();
      if (button.matches("[data-maintenance-check-publication]")) await checkPublication();
      if (button.matches("[data-maintenance-reset-form]")) { renderEditor(); status("Formular mit dem aktuellen Datenbankstand vorausgefüllt. Bitte erneut prüfen."); }
      if (button.matches("[data-maintenance-add-format]")) { const holder = $("[data-maintenance-formats]"); holder.insertAdjacentHTML("beforeend", formatRow({}, holder.children.length)); formatsDirty = true; invalidate(); }
      if (button.matches("[data-maintenance-reload]")) {
        // A conflict refresh never silently replaces the user's work. Show the new
        // snapshot, then require a new preview against that exact revision.
        setBusy(true);
        try {
          const latest = assertContext(await rpc(client, "admin_manual_event_context", { p_event_id: context.event.id }), context.event.id);
          const old = selected(); const next = latest.editions.find(row => row.id === selectedId);
          const changed = [...EVENT_FIELDS.map(key => [`event.${key}`, context.event[key], latest.event[key]]), ...EDITION_FIELDS.map(key => [`edition.${key}`, old?.[key], next?.[key]])].filter(([, a, b]) => !equal(a, b));
          formatConflict = formatsDirty && !equal(old?.race_formats, next?.race_formats);
          context = latest; invalidate();
          root.querySelectorAll("[data-maintenance-field]").forEach(input => {
            const path = input.dataset.maintenanceField;
            if (touched.has(path) || action === "create") return;
            const [scope, key] = path.split("."); input.value = (scope === "event" ? latest.event : next)?.[key] ?? "";
          });
          if (!formatsDirty && action !== "create") renderFormats();
          const notice = document.createElement("div"); notice.className = "maintenance-notice";
          notice.innerHTML = `<strong>Aktueller Datenbankstand geladen; deine bearbeiteten Eingaben bleiben im Formular.</strong>${changed.length ? `<ul>${changed.map(([path, , value]) => `<li>${escape(LABELS[path] || path)} ist jetzt: ${escape(display(value))}</li>`).join("")}</ul>` : "<p>Keine zwischenzeitlichen Faktenänderungen.</p>"}<p>${formatConflict ? "Die Wettbewerbe haben sich überlagert. Bitte den aktuellen Formularstand übernehmen und erneut bearbeiten." : "Bitte insbesondere bestätigte Felder erneut mit der Quelle vergleichen und danach „Änderungen prüfen“ wählen."}</p><button type="button" data-maintenance-reset-form>Datenbankstand übernehmen und Formulareingaben verwerfen</button>`;
          editor.prepend(notice); root.querySelectorAll("[data-maintenance-confirm]").forEach(input => { input.checked = false; });
          status("Aktueller Stand geladen. Bitte Änderungen und Bestätigungen erneut prüfen.");
        } catch (error) { status(error.message, true); }
        finally { setBusy(false); }
      }
    });
    return { loadEvent, getContext: () => context };
  }

  return { EVENT_FIELDS, EDITION_FIELDS, REQUIRED_CHECKS, buildPatch, seedNextEdition, mergeRaceFormats, assertSaveOutcome, assertContext, saveWithRecovery, publicProjection, comparePublicRow, verifyPublicEdition, verifyRenderedDetail, friendlyReviewReason, mount };
});
