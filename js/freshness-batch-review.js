(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SemFreshnessBatchReview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REQUIRED_FIELDS = Object.freeze([
    "event_name", "edition_year", "date", "city", "country", "address",
    "latitude", "longitude", "sport", "distances", "description",
    "registration_status", "official_event_page", "registration_link"
  ]);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const has = (value, key) => isObject(value) && Object.hasOwn(value, key);
  const clone = value => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  function uniqueIds(ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 25 || ids.some(id => typeof id !== "string" || !UUID.test(id))) {
      throw new Error("Ein Paket benötigt 1 bis 25 gültige Edition-IDs.");
    }
    const normalized = ids.map(id => id.toLowerCase());
    if (new Set(normalized).size !== ids.length) throw new Error("Editionen dürfen im Paket nicht doppelt vorkommen.");
    return normalized;
  }
  function parseImport(text) {
    if (typeof text !== "string" || text.length > 2 * 1024 * 1024) throw new Error("Belegdatei darf höchstens 2 MB umfassen.");
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("Belegdatei enthält kein gültiges JSON."); }
    if (!isObject(data) || data.schema_version !== 1 || !Array.isArray(data.reviews) || Object.keys(data).some(key => !["schema_version", "reviews"].includes(key))) {
      throw new Error("Belegformat erwartet schema_version: 1 und reviews: [...].");
    }
    const ids = uniqueIds(data.reviews.map(review => review?.edition_id));
    return data.reviews.map((review, index) => {
      if (!isObject(review) || !UUID.test(review.source_id || "") || !["string", "number"].includes(typeof review.event_id)) {
        throw new Error("Jeder Beleg benötigt eine gültige Event-, Edition- und Quellenzuordnung.");
      }
      return { ...review, edition_id: ids[index], source_id: review.source_id.toLowerCase() };
    });
  }
  function checkedTime(value) {
    if (typeof value !== "string") return NaN;
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!parts) return NaN;
    const [, year, month, day, hour, minute, second, zone] = parts;
    const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    if (+month < 1 || +month > 12 || +day < 1 || +day > days || +hour > 23 || +minute > 59 || +second > 59 || (zone !== "Z" && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) return NaN;
    return Date.parse(value);
  }
  function validateReview(review, context, now = Date.now()) {
    const errors = [];
    const evidence = isObject(review) ? review : {};
    if (!context || context.eligible !== true) errors.push("Event ist nicht mehr für die Frischeprüfung freigegeben.");
    if (!context || String(evidence.event_id) !== String(context.eventId) || evidence.edition_id !== context.editionId || evidence.source_id !== context.sourceId || evidence.source_url !== context.sourceUrl) {
      errors.push("Event, Edition oder offizielle Quelle stimmen nicht mit der Auswahl überein.");
    }
    if (typeof evidence.source_url !== "string" || !/^https:\/\/[^\s]+$/.test(evidence.source_url)) errors.push("Eine offizielle HTTPS-Quelle ist erforderlich.");
    const checked = checkedTime(evidence.source_checked_at);
    if (!Number.isFinite(checked) || !Number.isFinite(now) || checked < now - 86400000 || checked > now + 300000) errors.push("Quellenprüfung braucht einen gültigen Zeitstempel mit Zeitzone innerhalb der letzten 24 Stunden (höchstens 5 Minuten voraus).");
    if (typeof evidence.confidence !== "number" || !Number.isFinite(evidence.confidence) || evidence.confidence < 0.8 || evidence.confidence > 1) errors.push("Konfidenz muss eine Zahl zwischen 0,80 und 1 sein.");
    if (typeof evidence.notes !== "string" || evidence.notes.trim().length < 12) errors.push("Prüfnotiz benötigt mindestens 12 Zeichen.");
    if (!Array.isArray(evidence.confirmed_fields) || evidence.confirmed_fields.length !== 14 || new Set(evidence.confirmed_fields).size !== 14 || REQUIRED_FIELDS.some(field => !evidence.confirmed_fields.includes(field))) errors.push("Genau die 14 Pflichtfelder müssen im Beleg bestätigt sein.");
    if (!Array.isArray(evidence.uncertain_fields) || evidence.uncertain_fields.length) errors.push("Unsichere Felder müssen vor einer Freigabe geklärt werden.");
    const differences = REQUIRED_FIELDS.map(field => ({ field, stored: context?.storedValues?.[field], observed: evidence.observed_values?.[field], match: has(context?.storedValues, field) && has(evidence.observed_values, field) && equal(context.storedValues[field], evidence.observed_values[field]) }));
    if (!isObject(evidence.observed_values) || Object.keys(evidence.observed_values).length !== 14 || differences.some(item => !item.match)) errors.push("Alle 14 beobachteten Werte müssen dem aktuellen Datenstand exakt entsprechen. Abweichungen zuerst separat korrigieren.");
    return { errors, differences, valid: errors.length === 0 };
  }
  function preparePayload(reviews, contexts, confirmedEditionIds, now = Date.now()) {
    const ids = uniqueIds(reviews?.map(review => review?.edition_id));
    const contextIds = uniqueIds(contexts?.map(context => context?.editionId));
    if (contextIds.length !== ids.length || contextIds.some(id => !ids.includes(id))) throw new Error("Belege und ausgewählte Editionen müssen exakt übereinstimmen.");
    const confirmed = new Set(confirmedEditionIds || []);
    if (confirmed.size !== ids.length || ids.some(id => !confirmed.has(id))) throw new Error("Jedes Event benötigt seine eigene bewusste Bestätigung.");
    const evidence = {};
    reviews.forEach(review => {
      const validation = validateReview(review, contexts.find(context => context.editionId === review.edition_id), now);
      if (!validation.valid) throw new Error(`${review.edition_id}: ${validation.errors.join(" ")}`);
      evidence[review.edition_id] = clone({ source_id: review.source_id, source_url: review.source_url, source_checked_at: review.source_checked_at, confidence: review.confidence, confirmed_fields: review.confirmed_fields, uncertain_fields: review.uncertain_fields, observed_values: review.observed_values });
    });
    return { p_edition_ids: ids, p_notes: reviews.map(review => `${review.edition_id}: ${review.notes.trim()}`).join("\n"), p_evidence: evidence };
  }
  function assertOutcome(data, editionIds) {
    const ids = uniqueIds(editionIds);
    if (!isObject(data) || data.requested_count !== ids.length || data.verified_count !== ids.length || data.freshness_verified !== true || data.automatic_fact_changes !== false || !Array.isArray(data.verified_edition_ids) || data.verified_edition_ids.length !== ids.length || new Set(data.verified_edition_ids).size !== ids.length || data.verified_edition_ids.some(id => !ids.includes(id))) throw new Error("Der Server hat den Abschluss des gesamten Pakets nicht eindeutig bestätigt.");
    return data;
  }

  function assertPublicationOutcome(data, candidateIds, editionIds) {
    const candidates = uniqueIds(candidateIds);
    const editions = uniqueIds(editionIds);
    const exactIds = (actual, expected) => Array.isArray(actual) && actual.length === expected.length &&
      new Set(actual).size === expected.length && actual.every(id => expected.includes(id));
    if (!isObject(data) || candidates.length !== editions.length ||
        data.requested_count !== candidates.length || data.approved_count !== candidates.length ||
        data.publication_verified !== true ||
        !exactIds(data.approved_candidate_ids, candidates) || !exactIds(data.published_edition_ids, editions)) {
      throw new Error("Der Server hat die Veröffentlichung der ausgewählten Editionen nicht eindeutig bestätigt.");
    }
    // The outer transaction publishes editions. Only its nested freshness review
    // attests unchanged facts; never label the publication itself as read-only.
    return assertOutcome(data.freshness, editions);
  }

  function open({ contexts, refreshContexts, submit, operation = "freshness" }) {
    if (!["freshness", "publication"].includes(operation)) throw new Error("Unbekannte Freigabeaktion.");
    uniqueIds(contexts?.map(context => context.editionId));
    if (typeof refreshContexts !== "function" || typeof submit !== "function") throw new Error("Aktualisierung und Freigabe fehlen.");
    if (document.getElementById("freshnessBatchDialog")) throw new Error("Eine Sammelprüfung ist bereits geöffnet.");
    let currentContexts = clone(contexts);
    let busy = false;
    let uncertainOutcome = false;
    let selectionChanged = false;
    const opener = document.activeElement;
    const records = currentContexts.map(context => ({
      context, confirmed: false, parseError: "", review: {
        event_id: context.eventId, edition_id: context.editionId, source_id: context.sourceId, source_url: context.sourceUrl,
        source_checked_at: "", confidence: null, notes: "", confirmed_fields: [...REQUIRED_FIELDS], uncertain_fields: [],
        observed_values: Object.fromEntries(REQUIRED_FIELDS.map(field => [field, null]))
      }
    }));
    const dialog = document.createElement("dialog");
    dialog.id = "freshnessBatchDialog";
    dialog.className = "content-verification-dialog freshness-batch-dialog";
    dialog.setAttribute("aria-labelledby", "freshnessBatchTitle");
    dialog.innerHTML = `<form class="content-verification-form" novalidate>
      <h2 id="freshnessBatchTitle">${operation === "publication" ? "Editionen prüfen und veröffentlichen" : "Frische gemeinsam prüfen"}</h2>
      <p>Bis zu 25 Events. Quelle öffnen, alle 14 Felder vergleichen und jedes Event einzeln bestätigen. Prüfzeitpunkt und Belege werden unverändert übernommen.</p>
      <section class="freshness-batch-import" aria-label="Belegimport">
        <label>Belegdatei (JSON)<input type="file" accept="application/json,.json"></label>
        <label>Belege als JSON<textarea rows="4" spellcheck="false"></textarea></label>
        <div class="content-verification-actions"><button type="button" data-action="import">Belege importieren</button><button type="button" data-action="template">Vorlage herunterladen</button></div>
        <p>Formatversion 1. Die Vorlage enthält keine geprüften Werte. Importierte Belege ersetzen keine eigene Bestätigung. Unsichere Events können aus dem Paket genommen werden.</p>
      </section>
      <p class="freshness-batch-errors" role="alert"></p>
      <p class="freshness-batch-status" role="status" aria-live="polite"></p>
      <div class="freshness-batch-list"></div>
      <div class="content-verification-actions"><button type="button" data-action="cancel">Abbrechen</button><button type="submit">${operation === "publication" ? "Geprüfte Editionen veröffentlichen" : "Paket bestätigen"}</button></div>
    </form>`;
    const form = dialog.querySelector("form");
    const list = dialog.querySelector(".freshness-batch-list");
    const errorBox = dialog.querySelector(".freshness-batch-errors");
    const status = dialog.querySelector(".freshness-batch-status");
    const fileInput = dialog.querySelector('input[type="file"]');
    const importText = dialog.querySelector(".freshness-batch-import textarea");
    const confirmButton = dialog.querySelector('button[type="submit"]');
    const display = value => value === undefined ? "Fehlt" : JSON.stringify(value, null, 2);
    function updateStatus() {
      const validCount = records.filter(record => !record.parseError && validateReview(record.review, record.context).valid).length;
      const confirmedCount = records.filter(record => record.confirmed).length;
      status.textContent = `${records.length} Events im Paket · ${validCount} vollständige Belege · ${confirmedCount} persönlich bestätigt`;
      confirmButton.disabled = busy || uncertainOutcome || selectionChanged || !records.length || validCount !== records.length || confirmedCount !== records.length;
    }
    function updateCard(record) {
      const validation = validateReview(record.review, record.context);
      record.comparison.replaceChildren();
      validation.differences.forEach(difference => {
        const row = document.createElement("div");
        row.className = "freshness-batch-field";
        row.dataset.match = String(difference.match);
        const name = document.createElement("dt");
        name.textContent = `${difference.field} · ${difference.match ? "gleich" : "abweichend / fehlt"}`;
        row.append(name);
        [["Gespeichert", difference.stored], ["Beobachtet", difference.observed]].forEach(([label, value]) => {
          const cell = document.createElement("dd");
          const heading = document.createElement("span");
          heading.textContent = label;
          const pre = document.createElement("pre");
          pre.textContent = display(value);
          cell.append(heading, pre);
          row.append(cell);
        });
        record.comparison.append(row);
      });
      record.errors.textContent = record.parseError || validation.errors.join(" ");
      record.checkbox.disabled = busy || !validation.valid || Boolean(record.parseError) || uncertainOutcome || selectionChanged;
      if (!validation.valid || record.parseError) record.confirmed = false;
      record.checkbox.checked = record.confirmed;
      record.summary.textContent = `${record.context.storedValues.event_name || "Event"} · ${record.context.eventId} · ${record.confirmed ? "bestätigt" : validation.valid && !record.parseError ? "Beleg vollständig" : "zu prüfen"}`;
      updateStatus();
    }
    function renderCards() {
      list.replaceChildren();
      records.forEach((record, index) => {
        const card = document.createElement("details");
        card.className = "freshness-batch-card";
        card.dataset.freshnessEdition = record.review.edition_id;
        card.open = index === 0;
        const summary = document.createElement("summary");
        record.summary = summary;
        summary.textContent = `${record.context.storedValues.event_name || "Event"} · ${record.context.eventId}`;
        const source = document.createElement("p");
        const link = document.createElement("a");
        if (/^https:\/\/[^\s]+$/.test(record.context.sourceUrl)) link.href = record.context.sourceUrl;
        link.textContent = record.context.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        source.append("Offizielle Quelle: ", link);
        record.comparison = document.createElement("dl");
        record.comparison.className = "freshness-batch-comparison";
        card.append(summary, source, record.comparison);
        const editor = document.createElement("details");
        const editorSummary = document.createElement("summary");
        editorSummary.textContent = "Beobachtete Werte bearbeiten";
        editor.append(editorSummary);
        const valuesLabel = document.createElement("label");
        valuesLabel.textContent = "Beobachtete Werte (JSON)";
        const values = document.createElement("textarea");
        values.rows = 8;
        values.spellcheck = false;
        values.value = JSON.stringify(record.review.observed_values, null, 2);
        values.addEventListener("input", () => {
          record.confirmed = false;
          try { record.review.observed_values = JSON.parse(values.value); record.parseError = ""; }
          catch { record.parseError = "Beobachtete Werte enthalten kein gültiges JSON."; }
          updateCard(record);
        });
        valuesLabel.append(values);
        editor.append(valuesLabel);
        card.append(editor);
        [["Quellenprüfung (Zeitstempel mit Zeitzone)", "source_checked_at", "input"], ["Konfidenz", "confidence", "input"], ["Prüfnotiz", "notes", "textarea"]].forEach(([labelText, key, tag]) => {
          const label = document.createElement("label");
          label.textContent = labelText;
          const input = document.createElement(tag);
          if (key === "confidence") { input.type = "number"; input.min = "0.8"; input.max = "1"; input.step = "0.01"; }
          if (key === "source_checked_at") input.placeholder = "2026-09-08T10:30:00+02:00";
          input.value = record.review[key] ?? "";
          input.addEventListener("input", () => {
            record.review[key] = key === "confidence" ? (input.value === "" ? null : Number(input.value)) : input.value;
            record.confirmed = false;
            updateCard(record);
          });
          label.append(input);
          card.append(label);
        });
        record.errors = document.createElement("p");
        record.errors.className = "freshness-batch-errors";
        const attestation = document.createElement("label");
        attestation.className = "content-verification-attestation";
        record.checkbox = document.createElement("input");
        record.checkbox.type = "checkbox";
        record.checkbox.addEventListener("change", () => { record.confirmed = record.checkbox.checked; updateCard(record); });
        attestation.append(record.checkbox, "Alle 14 Felder dieses Events anhand der Quelle geprüft");
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Aus Paket nehmen";
        remove.addEventListener("click", () => {
          records.splice(records.indexOf(record), 1);
          currentContexts = currentContexts.filter(context => context.editionId !== record.review.edition_id);
          renderCards();
        });
        card.append(record.errors, attestation, remove);
        list.append(card);
        updateCard(record);
      });
      updateStatus();
    }
    function setBusy(value) {
      busy = value;
      dialog.querySelectorAll("input, textarea, button").forEach(control => { control.disabled = value; });
      records.forEach(updateCard);
      if (uncertainOutcome || selectionChanged) {
        dialog.querySelectorAll("input, textarea, button").forEach(control => { control.disabled = true; });
        dialog.querySelector('[data-action="cancel"]').disabled = false;
      }
    }
    dialog.querySelector('[data-action="import"]').addEventListener("click", async () => {
      if (busy || uncertainOutcome || selectionChanged) return;
      records.forEach(record => { record.confirmed = false; });
      setBusy(true);
      errorBox.textContent = "";
      try {
        const file = fileInput.files[0];
        if (file && importText.value.trim()) throw new Error("Bitte entweder eine Datei oder JSON-Text wählen.");
        if (file && file.size > 2 * 1024 * 1024) throw new Error("Belegdatei darf höchstens 2 MB umfassen.");
        const imported = parseImport(file ? await file.text() : importText.value);
        if (imported.length !== records.length || imported.some(review => !records.some(record => record.review.edition_id === review.edition_id))) throw new Error("Import muss genau die ausgewählten Editionen enthalten.");
        imported.forEach(review => {
          const record = records.find(item => item.review.edition_id === review.edition_id);
          record.review = review;
          record.confirmed = false;
          record.parseError = "";
        });
        renderCards();
      } catch (error) { errorBox.textContent = error.message; }
      finally { setBusy(false); }
    });
    dialog.querySelector('[data-action="template"]').addEventListener("click", () => {
      const template = { schema_version: 1, reviews: records.map(record => ({ event_id: record.context.eventId, edition_id: record.context.editionId, source_id: record.context.sourceId, source_url: record.context.sourceUrl, source_checked_at: "", confidence: null, notes: "", confirmed_fields: [...REQUIRED_FIELDS], uncertain_fields: [], observed_values: Object.fromEntries(REQUIRED_FIELDS.map(field => [field, null])) })) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(template, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "sporteventmap-frische-belege.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    return new Promise(resolve => {
      function finish(result) {
        if (busy) return;
        dialog.close();
        dialog.remove();
        if (opener?.isConnected) opener.focus();
        resolve(result);
      }
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      dialog.querySelector('[data-action="cancel"]').addEventListener("click", () => finish(null));
      form.addEventListener("submit", async event => {
        event.preventDefault();
        if (busy || uncertainOutcome || selectionChanged) return;
        let sending = false;
        errorBox.textContent = "";
        try {
          const reviews = records.map(record => record.review);
          const confirmed = records.filter(record => record.confirmed && !record.parseError).map(record => record.review.edition_id);
          preparePayload(reviews, currentContexts, confirmed);
          setBusy(true);
          const refreshed = await refreshContexts();
          uniqueIds(refreshed?.map(context => context.editionId));
          const fresh = refreshed.filter(context => currentContexts.some(selected => selected.editionId === context.editionId));
          const changed = fresh.length !== currentContexts.length || currentContexts.some(previous => {
            const next = fresh.find(context => context.editionId === previous.editionId);
            return !next || next.eligible !== true || !equal(previous, next);
          });
          if (changed) {
            records.forEach(record => { record.confirmed = false; });
            selectionChanged = true;
            throw new Error("Datenstand, Quelle oder Freigabestatus haben sich geändert. Dialog schließen und Auswahl neu öffnen; das Paket wurde nicht gesendet.");
          }
          const args = preparePayload(reviews, fresh, confirmed);
          sending = true;
          const result = assertOutcome(await submit(args), args.p_edition_ids);
          setBusy(false);
          finish(result);
        } catch (error) {
          // A lost response can follow a committed transaction. Never retry it implicitly.
          if (sending) uncertainOutcome = true;
          errorBox.textContent = sending
            ? `Abschluss nicht bestätigt. Datenstand neu laden, bevor erneut geprüft wird. ${error.message || "Serveranfrage fehlgeschlagen."}`
            : error.message || "Aktueller Datenstand konnte nicht geprüft werden.";
          records.forEach(record => { record.confirmed = false; });
          setBusy(false);
        }
      });
      document.body.append(dialog);
      renderCards();
      dialog.showModal();
      dialog.querySelector('[data-action="cancel"]').focus();
    });
  }
  return Object.freeze({ REQUIRED_FIELDS, parseImport, validateReview, preparePayload, assertOutcome, assertPublicationOutcome, open });
});
