// Application-owned administration labels only; stored event data stays unchanged.
(function (root) {
  "use strict";
  const pairs = [
["Stage 4 is not migrated yet or is unavailable to this admin. Stages 1–3 remain fully available.", "Stage 4 ist noch nicht migriert oder für diesen Admin nicht verfügbar. Stufen 1–3 bleiben uneingeschränkt nutzbar."],
["DRY RUN ACTIVE", "DRY-RUN AKTIV"], ["LIVE MODE", "LIVE-MODUS"], ["Automation", "Automatik"], ["Enabled", "aktiviert"], ["Disabled", "deaktiviert"], ["Observation", "Beobachtung"], ["Stopped", "gestoppt"], ["Scheduler", "Zeitplanung"], ["THEORETICALLY READY", "THEORETISCH BEREIT"],
["Official", "Offiziell"], ["Trusted", "Vertrauenswürdig"], ["Community", "Gemeinschaft"], ["Estimated", "Geschätzt"],
["Pending", "Ausstehend"], ["Queued", "Eingereiht"], ["Processing", "In Bearbeitung"], ["In progress", "Läuft"], ["Retry scheduled", "Wiederholung geplant"],
["Completed", "Abgeschlossen"], ["Inactive", "Inaktiv"], ["Paused", "Pausiert"], ["Active", "Aktiv"], ["Open", "Offen"], ["Closed", "Geschlossen"], ["Resolved", "Erledigt"],
["Scheduled", "Geplant"], ["Cancelled", "Abgesagt"], ["Postponed", "Verschoben"], ["Date unconfirmed", "Termin unbestätigt"],
["Published", "Veröffentlicht"], ["Needs review", "Prüfung erforderlich"], ["Confirmed", "Bestätigt"], ["Rejected", "Abgelehnt"], ["Approved", "Freigegeben"],
["Apply automatically", "Automatisch übernehmen"], ["Block", "Blockieren"], ["Observe", "Beobachten"], ["Outdated", "Veraltet"], ["Rate limited", "Abruflimit erreicht"],
["High", "Hoch"], ["Medium", "Mittel"], ["Low", "Niedrig"], ["Passed", "Bestanden"], ["Pilot observation", "Pilotbeobachtung"],
["Pause", "Pausieren"], ["Reactivate", "Reaktivieren"], ["Event source", "Eventquelle"], ["No pending review", "Keine offene Prüfung"],
["Resume observation", "Beobachtung fortsetzen"], ["Pause source", "Quelle pausieren"],
["Admin sign-in is required to maintain events.","Für die Eventpflege ist eine Adminanmeldung erforderlich."],
["Quality metadata unavailable.","Qualitätsmetadaten nicht verfügbar."],
["Invalid export manifest.","Ungültiges Exportmanifest."],
["Export file missing.","Exportdatei fehlt."],
["Export integrity not confirmed.","Exportintegrität nicht bestätigt."],
["Catalog access unavailable.","Katalogzugriff nicht verfügbar."],
["This proposal is no longer pending. Please reload the overview.","Der Vorschlag ist nicht mehr offen. Bitte die Übersicht neu laden."],
["This completion action is not supported.","Diese Abschlussaktion wird nicht unterstützt."],
["Please enter a clear reason with at least 12 characters.","Bitte eine nachvollziehbare Begründung mit mindestens 12 Zeichen eintragen."],
["Please enter the actual value to apply.","Bitte den tatsächlich zu übernehmenden Wert eintragen."],
["The edited value is not valid JSON. Please correct the input.","Der bearbeitete Wert ist kein gültiges JSON. Bitte die Eingabe korrigieren."],
["Please enter a concrete value; null cannot be applied here.","Bitte einen konkreten Wert eintragen; null kann hier nicht übernommen werden."],
["JSON numbers must be finite.","JSON-Zahlen müssen endlich sein."],
["Please select text or JSON as the value format.","Bitte Text oder JSON als Wertformat auswählen."],
["The server response does not confirm a unique proposal status. Please reload the overview.","Die Serverantwort bestätigt keinen eindeutigen Vorschlagsstatus. Bitte die Übersicht neu laden."],
["The server did not confirm completion of the proposal.","Der Server hat keinen Abschluss des Vorschlags bestätigt."],
["A proposal decision is already open.","Eine Vorschlagsentscheidung ist bereits geöffnet."],
["Unknown proposal decision.","Unbekannte Vorschlagsentscheidung."],
["The proposal has changed. Please cancel and open it again.","Der Vorschlag wurde inzwischen geändert. Bitte abbrechen und erneut öffnen."],
["Please confirm that you opened the official source and compared each field individually.","Bitte bestätigen, dass die offizielle Quelle geöffnet und jedes Feld einzeln verglichen wurde."],
["The externally observed values are not valid JSON.","Die extern beobachteten Werte sind kein gültiges JSON."],
["The externally observed values must be a JSON object.","Die extern beobachteten Werte müssen ein JSON-Objekt sein."],
["The externally observed values must contain every field being checked.","Die extern beobachteten Werte müssen alle zu prüfenden Felder enthalten."],
["Confidence must be between 0.80 and 1.00.","Confidence muss zwischen 0,80 und 1,00 liegen."],
["The review note is too short.","Die Prüfnotiz ist zu kurz."],
["A field review is already open.","Eine Feldprüfung ist bereits geöffnet."],
["Core event data is missing or below the minimum quality. This case remains under review.","Zentrale Eventdaten fehlen oder erfüllen die Mindestqualität nicht. Dieser Fall bleibt im Review."],
["Structured field evidence is incomplete. This case remains under review.","Die strukturierte Feld-Evidenz ist unvollständig. Dieser Fall bleibt im Review."],
["The selected official source is unstable or currently being checked. This case remains under review.","Die ausgewählte offizielle Quelle ist nicht stabil oder wird gerade geprüft. Dieser Fall bleibt im Review."],
["The data or source is no longer eligible for confirmation. This case remains under review.","Der Datenstand oder die Quelle ist nicht mehr zur Bestätigung freigegeben. Dieser Fall bleibt im Review."],
["New editions require their own complete field review and publication package.","Neue Editionen benötigen das eigene vollständige Feldprüfungs- und Veröffentlichungspaket."],
["Source checks must be confirmed individually because they require field evidence.","Quellenpruefungen müssen wegen der Feld-Evidenz einzeln bestaetigt werden."],
["Please select at least one exception.","Bitte mindestens eine Ausnahme auswaehlen."],
["Select new editions in their own package. Results and other checks are completed separately.","Neue Editionen bitte in einem eigenen Paket auswählen. Ergebnisse und andere Prüfungen werden separat abgeschlossen."],
["Source checks must be processed individually with their own field evidence.","Quellenpruefungen müssen mit eigener Feld-Evidenz einzeln bearbeitet werden."],
["Exception marked as resolved.","Ausnahme wurde als erledigt markiert."],
["Exception closed.","Ausnahme wurde geschlossen."],
["The specific data change was applied and recorded.","Die konkrete Datenaenderung wurde uebernommen und protokolliert."],
["Please select 1 to 25 different events for freshness verification.","Bitte 1 bis 25 verschiedene Events für die Frischeprüfung auswählen."],
["At least one event is no longer eligible for freshness verification. Reload the data.","Mindestens ein Event ist nicht mehr für die Frischeprüfung freigegeben. Datenstand neu laden."],
["Please select 1 to 25 different prepared editions.","Bitte 1 bis 25 verschiedene vorbereitete Editionen auswählen."],
["At least one edition or its official source is not fully prepared. Publication is not possible.","Mindestens eine Edition oder ihre offizielle Quelle ist noch nicht vollständig vorbereitet. Keine Veröffentlichung möglich."],
["Too many active source monitor jobs; freshness actions remain locked.","Zu viele aktive Source-Monitor-Jobs; Freshness-Aktionen bleiben gesperrt."],
["Too many open incorrect-data reports; freshness actions remain locked.","Zu viele offene Datenfehler-Meldungen; Freshness-Aktionen bleiben gesperrt."],
["Loading crawl history ...","Crawl-Historie wird geladen ..."],
["Performing action ...","Aktion wird ausgefuehrt ..."],
["Please choose the next scheduled check.","Bitte einen naechsten Prueftermin waehlen."],
["Action completed successfully.","Aktion erfolgreich abgeschlossen."],
["No pending proposals to simulate.","Keine offenen Vorschläge für die Simulation."],
["Select an already verified German event source with a matching domain.","Eine bereits geprüfte deutsche Eventquelle mit passender Domain auswählen."],
["Observation or assessment missing.","Beobachtung oder Bewertung fehlt."],
["An action and at least one ID are required.","Aktion und mindestens eine ID sind erforderlich."],
["A bulk action can contain at most 100 records.","Maximal 100 Datensätze pro Sammelaktion."],
["Data Operations is unavailable. Please reload.","Data Operations ist nicht verfügbar. Bitte neu laden."],
["Current data could not be loaded completely. Approval is not possible.","Aktueller Datenstand konnte nicht vollständig geladen werden. Keine Freigabe möglich."],
["The freshness case is no longer pending. Reloading the data.","Der Freshness-Fall ist nicht mehr offen. Die Daten werden neu geladen."],
["A freshness package can contain at most 25 events.","Ein Frischepaket darf höchstens 25 Events enthalten."],
["Current selected event requires an event selection.","Bitte wähle ein Event für die Option „Aktuell ausgewähltes Event“."],
["Research job queued...","Rechercheauftrag eingereiht …"],
["Research backend accepted the job. Refresh status after it completes.","Das Recherchesystem hat den Auftrag angenommen. Aktualisiere den Status nach Abschluss."],
["Knowledge slug does not match the selected record.","Das URL-Kürzel des Detailwissens passt nicht zum ausgewählten Datensatz."],
["Knowledge scope cannot be reassigned during review.","Der Geltungsbereich des Detailwissens kann während der Prüfung nicht geändert werden."],
["New Knowledge records require an explicit brand or edition scope.","Neue Wissensdatensätze benötigen einen ausdrücklichen Bezug zur Eventserie oder Austragung."],
["Canonical Knowledge identity is missing. Refresh the catalog before reviewing.","Die eindeutige Identität des Detailwissens fehlt. Aktualisiere den Katalog vor der Prüfung."],
["Loading Event Knowledge Base...","Event-Wissensdatenbank wird geladen …"],
["Choose an event first.","Waehle zuerst ein Event."],
["Loading selected event...","Ausgewähltes Event wird geladen …"],
["URL slug missing. Choose an event or enter a slug.","Slug fehlt. Waehle ein Event oder gib einen Slug ein."],
["Saving Knowledge entry...","Wissenseintrag wird gespeichert …"],
["Event name is required.","Ein Eventname ist erforderlich."],
["Load the selected Knowledge record before saving a different slug.","Lade den ausgewählten Wissensdatensatz, bevor du ein anderes URL-Kürzel speicherst."],
["Knowledge identity changed. Reload the record before saving.","Die Identität des Wissenseintrags hat sich geändert. Lade den Datensatz vor dem Speichern neu."],
["Public Knowledge requires reviewed status and a dated source for a specific field.","Öffentliches Detailwissen benötigt einen geprüften Status und eine datierte Quelle für ein konkretes Feld."],
["Knowledge entry saved. Run the Supabase export/build step before the static detail page changes go live.","Wissenseintrag gespeichert. Führe den Supabase-Export und Build aus, um die Änderungen an der statischen Detailseite zu veröffentlichen."],
["Structured Knowledge values must be valid JSON arrays.","Strukturierte Wissenswerte müssen gültige JSON-Listen sein."],
["Structured Knowledge values must be non-empty JSON arrays of text or objects.","Strukturierte Wissenswerte müssen nicht leere JSON-Listen mit Texten oder Objekten sein."],
["Boolean Knowledge values must be true or false.","Boolesche Wissenswerte müssen true oder false sein."],
["Accepted Knowledge values need a text value.","Angenommene Wissenswerte benötigen einen Textwert."],
["Task and payload Knowledge slugs do not match.","Die URL-Kürzel von Prüfauftrag und Wissensdaten stimmen nicht überein."],
["FAQ proposal needs a question and answer before it can be accepted.","Ein FAQ-Vorschlag benötigt vor der Annahme eine Frage und eine Antwort."],
["FAQ proposal needs a separate answer before it can be accepted.","Ein FAQ-Vorschlag benötigt vor der Annahme eine separate Antwort."],
["Accepted Knowledge values need a source URL.","Angenommene Wissenswerte benötigen eine Quellen-URL."],
["Knowledge confidence must be empty or a number from 0 to 1.","Die Wissenskonfidenz muss leer oder eine Zahl zwischen 0 und 1 sein."],
["Withdrawal conditions cannot be stored as a race cutoff, start time or registration deadline.","Rücktrittsbedingungen dürfen nicht als Zeitlimit, Startzeit oder Anmeldeschluss gespeichert werden."],
["Registration dates cannot be stored as race timing.","Anmeldetermine dürfen nicht als Wettkampfzeiten gespeichert werden."],
["Loading Knowledge audit files...","Dateien zur Wissensprüfung werden geladen …"],
["No audit file found yet. Run npm run audit:event-knowledge.","Noch keine Prüfdatei gefunden. Führe npm run audit:event-knowledge aus."],
["No review payload available for this event.","Für dieses Event liegen keine Prüfdaten vor."],
["Review enrichment loaded. Check fields and sources before saving or publishing.","Ergänzungsvorschläge geladen. Prüfe Felder und Quellen vor dem Speichern oder Veröffentlichen."],
["Review enrichment saved to Supabase as needs_review with Public disabled.","Ergänzungsvorschläge wurden in Supabase als needs_review gespeichert; die Veröffentlichung ist deaktiviert."],
["Review proposal could not be found.","Prüfvorschlag wurde nicht gefunden."],

  [
    "Review inbox",
    "Prüfeingang"
  ],
  [
    "Review now",
    "Jetzt zu pruefen"
  ],
  [
    "Review official sources and detected changes here with visible evidence before confirming them.",
    "Offizielle Quellen und erkannte Aenderungen lassen sich hier mit sichtbarer Evidenz kontrolliert bestaetigen."
  ],
  [
    "Decide now",
    "Jetzt entscheiden"
  ],
  [
    "Waiting for automation",
    "Wartet automatisch"
  ],
  [
    "Batch approval",
    "Sammelfreigabe"
  ],
  [
    "Blocked / critical",
    "Blockiert / kritisch"
  ],
  [
    "View",
    "Ansicht"
  ],
  [
    "Waiting for automation",
    "Wartet auf Automatik"
  ],
  [
    "All exceptions",
    "Alle Ausnahmen"
  ],
  [
    "Select reviewable entries",
    "Pruefbare waehlen"
  ],
  [
    "Confirm selection",
    "Auswahl bestaetigen"
  ],
  [
    "Select up to 25 freshness checks",
    "Bis zu 25 Frischeprüfungen wählen"
  ],
  [
    "Review freshness selection",
    "Frischeauswahl prüfen"
  ],
  [
    "All events & manual search",
    "Alle Events & manuelle Suche"
  ],
  [
    "Full inventory, filters and individual case management",
    "Gesamtbestand, Filter und Einzelfallverwaltung"
  ],
  [
    "Load inventory",
    "Bestand laden"
  ],
  [
    "Freshness overview",
    "Aktualitätslage"
  ],
  [
    "What users currently see",
    "Was Nutzer gerade sehen"
  ],
  [
    "Combining catalog, verification records and source operations.",
    "Katalog, Prüfstände und Quellenbetrieb werden zusammengeführt."
  ],
  [
    "Checking",
    "Wird geprüft"
  ],
  [
    "Public catalog",
    "Öffentlicher Katalog"
  ],
  [
    "Identifying source",
    "Quelle wird ermittelt"
  ],
  [
    "Current editions",
    "Aktuelle Austragungen"
  ],
  [
    "Calculating verification",
    "Verifizierung wird berechnet"
  ],
  [
    "Check schedule",
    "Prüfplan"
  ],
  [
    "Calculating due dates",
    "Fälligkeit wird berechnet"
  ],
  [
    "Operational issues",
    "Betriebsprobleme"
  ],
  [
    "Checking sources and alerts",
    "Quellen und Alarme werden geprüft"
  ],
  [
    "Data quality and publication",
    "Datenqualität und Freigabe"
  ],
  [
    "Catalog measurement unavailable.",
    "Katalogmessung nicht ermittelt."
  ],
  [
    "Publication blockers not determined.",
    "Freigabeblocker nicht ermittelt."
  ],
  [
    "Download audit report",
    "Prüfbericht herunterladen"
  ],
  [
    "Next priorities",
    "Nächste Prioritäten"
  ],
  [
    "Loading data.",
    "Daten werden geladen."
  ],
  [
    "Review event inventory",
    "Eventbestand prüfen"
  ],
  [
    "Open source operations",
    "Quellenbetrieb öffnen"
  ],
  [
    "Alerts & proposals",
    "Alarme & Vorschläge"
  ],
  [
    "Recalculate",
    "Neu berechnen"
  ],
  [
    "Source monitor & system status",
    "Source Monitor & Systemstatus"
  ],
  [
    "Crawls, availability, retries and technical details",
    "Crawls, Erreichbarkeit, Retries und technische Details"
  ],
  [
    "Technical status",
    "Technik"
  ],
  [
    "Source Monitor",
    "Quellenmonitor"
  ],
  [
    "Technical source checks",
    "Technische Quellenpruefung"
  ],
  [
    "Availability, content hashes, queue, retries and manual review.",
    "Erreichbarkeit, Content-Hashes, Queue, Retries und manuelle Pruefung."
  ],
  [
    "Checked today",
    "Heute geprueft"
  ],
  [
    "Unchanged",
    "Unveraendert"
  ],
  [
    "Changed",
    "Veraendert"
  ],
  [
    "Unreachable",
    "Nicht erreichbar"
  ],
  [
    "Failed",
    "Fehlgeschlagen"
  ],
  [
    "Retries",
    "Wiederholungen"
  ],
  [
    "Dead Letter",
    "Dauerhaft fehlgeschlagen"
  ],
  [
    "Average",
    "Durchschnitt"
  ],
  [
    "Overdue",
    "Ueberfaellig"
  ],
  [
    "No scheduled check",
    "Ohne Prueftermin"
  ],
  [
    "Event / edition",
    "Event / Austragung"
  ],
  [
    "Latest status",
    "Letzter Status"
  ],
  [
    "Check schedule",
    "Pruefplan"
  ],
  [
    "Review",
    "Prüfung"
  ],
  [
    "Actions",
    "Aktionen"
  ],
  [
    "Crawl history",
    "Crawl-Historie"
  ],
  [
    "Close",
    "Schliessen"
  ],
  [
    "Stage 4 · Phase A",
    "Stufe 4 · Phase A"
  ],
  [
    "Data Operations Center",
    "Datenbetriebszentrale"
  ],
  [
    "Policy simulation, source reliability, discovery, duplicates, geocoding and country quality — without automatic publication.",
    "Policy-Simulation, Quellenzuverlässigkeit, Discovery, Dubletten, Geocoding und Länderqualität – ohne automatische Veröffentlichung."
  ],
  [
    "Recalculate metrics",
    "Kennzahlen neu berechnen"
  ],
  [
    "Simulate pending proposals",
    "Offene Vorschläge simulieren"
  ],
  [
    "Simulations",
    "Simulationen"
  ],
  [
    "Would apply automatically",
    "Würde automatisch"
  ],
  [
    "New candidates",
    "Neue Kandidaten"
  ],
  [
    "Possible duplicates",
    "Mögliche Dubletten"
  ],
  [
    "Pending geocoding",
    "Geocoding offen"
  ],
  [
    "Average data quality",
    "Ø Datenqualität"
  ],
  [
    "Policies & reliability",
    "Policies & Zuverlässigkeit"
  ],
  [
    "0 metrics",
    "0 Metriken"
  ],
  [
    "Discovery & duplicates",
    "Discovery & Dubletten"
  ],
  [
    "0 pending",
    "0 offen"
  ],
  [
    "Countries & data quality",
    "Länder & Datenqualität"
  ],
  [
    "Geocoding & limits",
    "Geocoding & Limits"
  ],
  [
    "Cache + rate limits",
    "Zwischenspeicher + Abruflimits"
  ],
  [
    "German observation phase",
    "Deutsche Beobachtungsphase"
  ],
  [
    "Real sources, shadow decisions and manual calibration. No public changes.",
    "Echte Quellen, Shadow-Entscheidungen und manuelle Kalibrierung. Keine öffentliche Mutation."
  ],
  [
    "Schedule due pilot sources",
    "Fällige Piloten einplanen"
  ],
  [
    "Update evaluation",
    "Evaluation aktualisieren"
  ],
  [
    "Pilot profiles",
    "Pilotprofile"
  ],
  [
    "Observations",
    "Beobachtungen"
  ],
  [
    "Review backlog",
    "Review-Rückstand"
  ],
  [
    "Precision",
    "Präzision"
  ],
  [
    "Reviewed sample size",
    "Review-Fallzahl"
  ],
  [
    "Phase B readiness",
    "Bereitschaft für Phase B"
  ],
  [
    "NOT READY",
    "NICHT BEREIT"
  ],
  [
    "Pilot overview & sources",
    "Pilotübersicht & Quellen"
  ],
  [
    "0 active",
    "0 aktiv"
  ],
  [
    "Loading pilot profiles.",
    "Pilotprofile werden geladen."
  ],
  [
    "Observations & review",
    "Beobachtungen & Review"
  ],
  [
    "Training / calibration",
    "Training/Kalibrierung"
  ],
  [
    "Loading observations.",
    "Beobachtungen werden geladen."
  ],
  [
    "Evaluation & readiness",
    "Evaluation & Readiness"
  ],
  [
    "Theoretical only",
    "nur theoretisch"
  ],
  [
    "Loading evaluation.",
    "Evaluation wird geladen."
  ],
  [
    "Policy shadow mode",
    "Policy Shadow-Modus"
  ],
  [
    "What would happen?",
    "was würde passieren?"
  ],
  [
    "Loading shadow decisions.",
    "Shadow-Entscheidungen werden geladen."
  ],
  [
    "Golden Dataset",
    "Geprüfter Referenzdatensatz"
  ],
  [
    "0 cases",
    "0 Fälle"
  ],
  [
    "Loading reference dataset.",
    "Golden Dataset wird geladen."
  ],
  [
    "Runs & monitoring",
    "Läufe & Monitoring"
  ],
  [
    "Can be stopped and resumed",
    "abbruch- und fortsetzbar"
  ],
  [
    "Loading runs.",
    "Läufe werden geladen."
  ],
  [
    "Safe bulk action",
    "Sichere Sammelaktion"
  ],
  [
    "Preview first, then explicit confirmation; phase A only simulates.",
    "Erst Vorschau, dann explizite Bestätigung; Phase A simuliert ausschließlich."
  ],
  [
    "Action",
    "Aktion"
  ],
  [
    "Please select",
    "Bitte wählen"
  ],
  [
    "Confirm unchanged sources",
    "Unveränderte Quellen bestätigen"
  ],
  [
    "Safe registration changes",
    "Sichere Registrierungsänderungen"
  ],
  [
    "Close past editions",
    "Vergangene Austragungen schließen"
  ],
  [
    "Check sources again",
    "Quellen erneut prüfen"
  ],
  [
    "Reject candidates",
    "Kandidaten ablehnen"
  ],
  [
    "Assign candidates",
    "Kandidaten zuordnen"
  ],
  [
    "Reschedule next check",
    "Nächste Prüfung verschieben"
  ],
  [
    "Record type",
    "Datensatztyp"
  ],
  [
    "Proposal",
    "Vorschlag"
  ],
  [
    "Edition",
    "Austragung"
  ],
  [
    "Event candidate",
    "Eventkandidat"
  ],
  [
    "IDs, one per line",
    "IDs, eine pro Zeile"
  ],
  [
    "Show impact",
    "Auswirkungen anzeigen"
  ],
  [
    "All",
    "Alle"
  ],
  [
    "No events match these filters.",
    "Keine Events für diese Filter."
  ],
  [
    "No edition available.",
    "Keine Austragung vorhanden."
  ],
  [
    "No unresolved validation issues.",
    "Keine offenen Validierungsprobleme."
  ],
  [
    "No pending change proposals.",
    "Keine offenen Änderungsvorschläge."
  ],
  [
    "Previous",
    "Alt"
  ],
  [
    "Method",
    "Methode"
  ],
  [
    "Detected",
    "Erkannt"
  ],
  [
    "Show evidence",
    "Evidenz anzeigen"
  ],
  [
    "Validation warnings",
    "Validierungswarnungen"
  ],
  [
    "No change proposals match these filters.",
    "Keine Änderungsvorschläge für diese Filter."
  ],
  [
    "No unresolved workflow alerts.",
    "Keine offenen Workflow-Alarme."
  ],
  [
    "Last source fetch",
    "Letzter Quellenabruf"
  ],
  [
    "Selected source stable",
    "Ausgewaehlte Quelle stabil"
  ],
  [
    "Last verified",
    "Zuletzt verifiziert"
  ],
  [
    "Check due",
    "Pruefung faellig"
  ],
  [
    "To confirm",
    "Zu bestaetigen"
  ],
  [
    "Fetch",
    "Abruf"
  ],
  [
    "Change",
    "Aenderung"
  ],
  [
    "Signal",
    "Signal"
  ],
  [
    "To confirm",
    "Zu bestätigen"
  ],
  [
    "Field:",
    "Feld:"
  ],
  [
    "Proposal:",
    "Vorschlag:"
  ],
  [
    "Reason (at least 12 characters)",
    "Begründung (mindestens 12 Zeichen)"
  ],
  [
    "Cancel",
    "Abbrechen"
  ],
  [
    "Edit and apply source proposal",
    "Quellenvorschlag bearbeiten und übernehmen"
  ],
  [
    "Previous value:",
    "Bisheriger Wert:"
  ],
  [
    "Source:",
    "Quelle:"
  ],
  [
    "Compare the edited value with the source and explain the correction. Submitting reviews and applies this exact proposal.",
    "Vergleiche den bearbeiteten Wert mit der Quelle und begründe die Korrektur. Mit dem Absenden wird genau dieser Vorschlag geprüft und übernommen."
  ],
  [
    "Value format",
    "Wertformat"
  ],
  [
    "Value to apply",
    "Zu übernehmender Wert"
  ],
  [
    "Apply edited value",
    "Bearbeiteten Wert übernehmen"
  ],
  [
    "Confirm field verification",
    "Feldprüfung bestätigen"
  ],
  [
    "Official source:",
    "Offizielle Quelle:"
  ],
  [
    "Externally observed values (JSON)",
    "Extern beobachtete Werte (JSON)"
  ],
  [
    "Uncertain fields (comma-separated)",
    "Unsichere Felder (kommagetrennt)"
  ],
  [
    "Leave empty only if every field has clear evidence. Uncertainty keeps the review open.",
    "Nur leer lassen, wenn jedes Feld eindeutig belegt ist. Mit Unsicherheiten bleibt die Prüfung offen."
  ],
  [
    "Confidence (0.80 to 1.00)",
    "Confidence (0,80 bis 1,00)"
  ],
  [
    "Traceable review note (at least 12 characters)",
    "Nachvollziehbare Prüfnotiz (mindestens 12 Zeichen)"
  ],
  [
    "Confirm field verification definitively",
    "Feldprüfung verbindlich bestätigen"
  ],
  [
    "No pending decision",
    "Keine Entscheidung offen"
  ],
  [
    "Archiving, source checks and safe lifecycle updates run automatically.",
    "Archivierung, Quellenpruefung und sichere Lifecycle-Aktualisierungen laufen automatisch."
  ],
  [
    "Nothing to review now",
    "Jetzt ist nichts zu pruefen"
  ],
  [
    "Routine cases are waiting for automatic source confirmation.",
    "Offene Routinefaelle warten auf ihre automatische Quellenbestaetigung."
  ],
  [
    "No entries in this view.",
    "Keine Eintraege in dieser Ansicht."
  ],
  [
    "Automation waiting",
    "Automatik wartet"
  ],
  [
    "Confidence",
    "Konfidenz"
  ],
  [
    "Confirmations",
    "Bestaetigungen"
  ],
  [
    "Next crawl",
    "Naechster Crawl"
  ],
  [
    "No sources available.",
    "Keine Quellen vorhanden."
  ],
  [
    "No crawl results yet.",
    "Noch keine Crawl-Ergebnisse."
  ],
  [
    "No policy or reliability data yet.",
    "Noch keine Policy- oder Zuverlässigkeitsdaten."
  ],
  [
    "No pending discovery candidates.",
    "Keine offenen Discovery-Kandidaten."
  ],
  [
    "Discovery",
    "Eventsuche"
  ],
  [
    "Geodata issues",
    "Geo-Probleme"
  ],
  [
    "Critical",
    "Kritisch"
  ],
  [
    "Country status not calculated yet.",
    "Länderstatus noch nicht berechnet."
  ],
  [
    "Daily budget",
    "Tagesbudget"
  ],
  [
    "Provider requests are cached; disabled countries and exceeded limits are recorded as rate_limited.",
    "Provider-Aufrufe werden gecacht; deaktivierte Länder und überschrittene Limits werden als rate_limited gespeichert."
  ],
  [
    "Existing event source",
    "Bestehende Eventquelle"
  ],
  [
    "Not linked",
    "nicht gebunden"
  ],
  [
    "No German pilot profiles configured.",
    "Keine deutschen Pilotprofile konfiguriert."
  ],
  [
    "Correct",
    "korrekt"
  ],
  [
    "Partially correct",
    "teilweise korrekt"
  ],
  [
    "Incorrect",
    "falsch"
  ],
  [
    "Duplicate",
    "Dublette"
  ],
  [
    "Unsuitable source",
    "Quelle ungeeignet"
  ],
  [
    "Unclear",
    "unklar"
  ],
  [
    "Manual review required",
    "manuelle Prüfung notwendig"
  ],
  [
    "No real observations yet.",
    "Noch keine realen Beobachtungen vorhanden."
  ],
  [
    "Manually reviewed proposals",
    "Manuell bewertete Vorschläge"
  ],
  [
    "No shadow decisions yet.",
    "Noch keine Shadow-Entscheidungen."
  ],
  [
    "The reference dataset is waiting for manually reviewed real cases.",
    "Golden Dataset wartet auf manuell geprüfte reale Fälle."
  ],
  [
    "No observation runs yet.",
    "Noch keine Beobachtungsläufe."
  ],
  [
    "Transactional",
    "Transaktional"
  ],
  [
    "Explicit confirmation required",
    "Explizite Bestätigung erforderlich"
  ],
  [
    "Errors cause a rollback",
    "Fehler führen zum Rollback"
  ],
  [
    "No recorded changes yet.",
    "Noch keine protokollierten Änderungen."
  ],
  [
    "Label",
    "Bezeichnung"
  ],
  [
    "Type",
    "Typ"
  ],
  [
    "Verified",
    "Geprüft"
  ],
  [
    "Confidence",
    "Konfidenz"
  ],
  [
    "Note",
    "Hinweis"
  ],
  [
    "Remove",
    "Entfernen"
  ],
  [
    "Question",
    "Frage"
  ],
  [
    "Answer",
    "Antwort"
  ],
  [
    "Sort",
    "Reihenfolge"
  ],
  [
    "Source URL",
    "Quellen-URL"
  ],
  [
    "No Knowledge audit rows match the current filter.",
    "Keine Wissensprüfungen passen zum aktuellen Filter."
  ],
  [
    "Value",
    "Wert"
  ],
  [
    "Source title",
    "Quellentitel"
  ],
  [
    "No enrichment task yet. Run npm run enrich:event-knowledge for this priority.",
    "Noch kein Ergänzungsauftrag. Führe npm run enrich:event-knowledge für diese Priorität aus."
  ],
  [
    "Private review task; completeness not audited",
    "Private Prüfaufgabe; Vollständigkeit nicht geprüft"
  ],
  [
    "Complete",
    "Vollständig"
  ],
  [
    "Review inbox metrics",
    "Review Inbox Kennzahlen"
  ],
  [
    "Freshness metrics",
    "Aktualitätskennzahlen"
  ],
  [
    "Source monitor metrics",
    "Source Monitor Kennzahlen"
  ],
  [
    "Stage 4 metrics",
    "Stage-4-Kennzahlen"
  ],
  [
    "Detected changes",
    "Erkannte Aenderungen"
  ],
  [
    "Freshness evidence",
    "Freshness-Evidenz"
  ],
  [
    "Source evidence",
    "Quellen-Evidenz"
  ],
  [
    "Review prioritization",
    "Review-Priorisierung"
  ],
  [
    "Review in inbox",
    "In Review Inbox pruefen"
  ],
  [
    "Review & apply",
    "Prüfen & übernehmen"
  ],
  [
    "Apply",
    "Übernehmen"
  ],
  [
    "Edit & apply",
    "Bearbeiten & übernehmen"
  ],
  [
    "Already implemented",
    "Bereits umgesetzt"
  ],
  [
    "Reject",
    "Ablehnen"
  ],
  [
    "Review later",
    "Später prüfen"
  ],
  [
    "Lock field",
    "Feld sperren"
  ],
  [
    "Apply similar proposals",
    "Ähnliche übernehmen"
  ],
  [
    "Open source",
    "Quelle öffnen"
  ],
  [
    "Open event",
    "Event öffnen"
  ],
  [
    "Close alert",
    "Alarm schließen"
  ],
  [
    "Approve",
    "Freigeben"
  ],
  [
    "Confirm each field",
    "Feldweise bestaetigen"
  ],
  [
    "Confirm edition field by field",
    "Edition feldweise bestaetigen"
  ],
  [
    "Apply change",
    "Aenderung uebernehmen"
  ],
  [
    "Mark resolved",
    "Als erledigt markieren"
  ],
  [
    "Open source",
    "Quelle oeffnen"
  ],
  [
    "Open edition",
    "Austragung oeffnen"
  ],
  [
    "Check now",
    "Jetzt pruefen"
  ],
  [
    "Set schedule",
    "Termin setzen"
  ],
  [
    "History",
    "Historie"
  ],
  [
    "Open event",
    "Event oeffnen"
  ],
  [
    "Mark reviewed",
    "Als geprueft markieren"
  ],
  [
    "Reset errors",
    "Fehler zuruecksetzen"
  ],
  [
    "Retry crawl",
    "Crawl erneut"
  ],
  [
    "Link safely",
    "Sicher binden"
  ],
  [
    "Save assessment",
    "Bewertung speichern"
  ],
  [
    "Mark as reference case",
    "Als Golden Case markieren"
  ],
  [
    "Stop run",
    "Lauf stoppen"
  ],
  [
    "Resume run",
    "Lauf fortsetzen"
  ],
  [
    "Confirm simulation",
    "Simulation bestätigen"
  ],
  [
    "Accept",
    "Annehmen"
  ],
  [
    "Reject",
    "Ablehnen"
  ],
  [
    "Edit",
    "Bearbeiten"
  ],
  [
    "Official source",
    "Offizielle Quelle"
  ],
  [
    "Review enrichment",
    "Ergänzungen prüfen"
  ]
];
  Object.assign(root.SEM_UI_TRANSLATIONS ||= {}, Object.fromEntries(pairs));
  function register() { pairs.forEach(([en, de]) => root.registerUiTranslations?.({ [en]: de })); }
  register();
  document.addEventListener("DOMContentLoaded", register);
  const bindings = [["data-i18n-text", null], ["data-i18n-placeholder-text", "placeholder"],
    ["data-i18n-title-text", "title"], ["data-i18n-aria-label-text", "aria-label"], ["data-i18n-label-text", "data-label"]];
  const observed = new WeakSet();
  function apply(container) {
    for (const [binding, attribute] of bindings) {
      const elements = [...container.querySelectorAll(`[${binding}]`)];
      if (container.matches?.(`[${binding}]`)) elements.unshift(container);
      for (const element of elements) {
        const source = element.getAttribute(binding), translated = root.uiText?.(source) ?? source;
        if (attribute) { if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated); }
        else if (element.textContent !== translated) element.textContent = translated;
      }
    }
  }
  root.observeAdminUiTranslations = function (container) {
    if (!container || observed.has(container)) return;
    observed.add(container);
    register();
    apply(container);
    if (typeof root.MutationObserver === "function") {
      const observer = new root.MutationObserver(() => apply(container));
      observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: bindings.map(([binding]) => binding) });
    }
    document.addEventListener("app-language-changed", () => apply(container));
  };
  function initialize() { root.observeAdminUiTranslations(document.getElementById("adminModal")); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})(typeof globalThis !== "undefined" ? globalThis : this);
