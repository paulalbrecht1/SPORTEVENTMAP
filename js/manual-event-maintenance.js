(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./event-description.js") : root.SportEventMapDescriptions);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SemManualEventMaintenance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (descriptions) {
  "use strict";

  // Only application-owned copy is registered. Event names, notes and editable
  // values remain untouched when changing language.
  const MAINTENANCE_TRANSLATIONS = {
    "Manuelle Datenpflege": "Manual event maintenance", "Events pflegen": "Maintain events",
    "Event suchen": "Find an event", "Name der Veranstaltung": "Event name", "Suchen": "Search",
    "Schließen und anderes Event suchen": "Close and find another event",
    "Veranstaltungsname": "Event name", "Datum": "Date", "Ort": "Location", "Land": "Country", "Sportart": "Sport",
    "Veranstaltungsstatus": "Event status", "Anmeldestatus": "Registration status", "Offizielle Seite dieser Ausgabe": "Official page for this edition",
    "Anmeldelink": "Registration link", "Startadresse": "Start address", "Breitengrad (°)": "Latitude (°)", "Längengrad (°)": "Longitude (°)",
    "Beschreibung": "Description", "Offizielle Veranstaltungsseite": "Official event website", "Veranstalter": "Organizer", "Veranstalter-Website": "Organizer website",
    "Enddatum bei mehreren Tagen": "End date for multi-day events", "Startzeit": "Start time", "Startgebühr ab": "Entry fee from", "Startgebühr bis": "Entry fee up to",
    "Währung (z. B. EUR)": "Currency (e.g. EUR)", "Teilnehmerlimit (Personen)": "Participant limit", "Wettbewerbe / Distanzen": "Races / distances",
    "Ausgabejahr": "Edition year", "Ausgabekürzel": "Edition identifier", "Schwimmen": "Swimming", "Radfahren": "Cycling", "Laufen": "Running", "Höhenmeter": "Elevation gain",
    "Termin noch offen": "Date not confirmed", "Geplant": "Scheduled", "Verschoben": "Postponed", "Abgesagt": "Cancelled", "Beendet": "Completed", "Inaktiv": "Inactive",
    "Unbekannt": "Unknown", "unbekannt": "unknown", "Noch nicht geöffnet": "Not open yet", "Anmeldung geöffnet": "Registration open", "Anmeldung abgesagt": "Registration cancelled", "Ausgebucht": "Sold out",
    "Allgemeines zur Veranstaltung": "Event overview", "Veranstaltungsserie": "Event series", "Erste Austragung": "First edition", "Region": "Region",
    "Anmeldung und Gebühren": "Registration and fees", "Anmeldung ab": "Registration opens", "Anmeldeschluss": "Registration deadline", "Gebührenstaffeln": "Price tiers",
    "Startplatzverlosung": "Entry lottery", "Qualifikation": "Qualification", "Charity-Startplätze": "Charity entries", "Warteliste": "Waiting list",
    "Startplatzübertragung": "Entry transfer", "Rücktritt und Erstattung": "Withdrawal and refunds", "Hinweise zur Verfügbarkeit": "Availability information",
    "Strecke": "Course", "Streckenart": "Course type", "Streckenbeschreibung": "Course description", "Untergrund": "Surface", "Startbereich": "Start area", "Zielbereich": "Finish area",
    "Start und Ziel am selben Ort": "Start and finish at the same location", "Rundkurs": "Loop course", "Punkt-zu-Punkt-Strecke": "Point-to-point course",
    "Offizieller Streckenplan": "Official course map", "GPX-Datei": "GPX file", "Höhenprofil": "Elevation profile", "Schwierigkeit": "Difficulty",
    "Eignung für Einsteiger": "Suitability for beginners", "Bestzeiten-Potenzial": "Personal best potential", "Landschaft": "Scenery", "Zuschauerunterstützung": "Spectator support",
    "Schwimmort": "Swim location", "Gewässerart": "Water type", "Radrunden": "Bike laps", "Radstrecke": "Bike course", "Laufrunden": "Run laps", "Laufstrecke": "Run course", "Wechselzone": "Transition area",
    "Renntag und Startzeiten": "Race day and start times", "Startzeiten je Wettbewerb / Startwellen": "Race start times / waves", "Gesamt-Zeitlimit (z. B. 6:15 h)": "Overall cutoff (e.g. 6:15 h)",
    "Zwischenzeitlimits": "Intermediate cutoffs", "Schwimm-Zeitlimit": "Swim cutoff", "Rad-Zeitlimit": "Bike cutoff", "Lauf-Zeitlimit": "Run cutoff", "Verpflegung": "Aid stations",
    "Tempomacher": "Pacers", "Zeitmessung": "Timing", "Gepäckabgabe": "Bag drop", "Duschen": "Showers", "Umkleiden": "Changing rooms", "Toiletten": "Toilets", "Medizinische Betreuung": "Medical support",
    "Live-Tracking": "Live tracking", "Livestream": "Live stream", "Messe / Expo": "Race expo", "Startnummernausgabe": "Bib pickup",
    "Anreise und Aufenthalt": "Travel and accommodation", "Flughafen": "Airport", "Bahnhof": "Train station", "Öffentliche Verkehrsmittel": "Public transport", "Parken / Park & Ride": "Parking / Park & Ride",
    "Unterkunft": "Accommodation", "Camping": "Camping", "Empfohlene Anreise": "Recommended arrival", "Buchungshinweise": "Booking information", "Zeitzone": "Time zone",
    "Wetter und Planung": "Weather and planning", "Durchschnittstemperatur (mit °C)": "Average temperature (°C)", "Durchschnittliche Höchsttemperatur (mit °C)": "Average high temperature (°C)",
    "Durchschnittliche Tiefsttemperatur (mit °C)": "Average low temperature (°C)", "Niederschlag (mit Einheit)": "Rainfall (include unit)", "Typisches Wetter": "Typical weather", "Hitze": "Heat", "Wind": "Wind",
    "Bedingungen": "Conditions", "Jahreszeit": "Season", "Planungshinweise": "Planning advice", "Ergebnisse und Hintergrundzahlen": "Results and statistics", "Teilnehmerzahl": "Participants", "Finisher": "Finishers",
    "Frauenanteil (mit %)": "Women (%)", "Durchschnittliche Zielzeit": "Average finish time", "Sieger": "Men's winner", "Siegerin": "Women's winner", "Siegerzeit": "Men's winning time", "Siegerinnenzeit": "Women's winning time",
    "Historische Bedeutung": "Historical significance", "Weitere belegte Fakten": "Other verified facts", "World Marathon Major": "World Marathon Major", "UTMB-Index": "UTMB index", "Boston-Qualifikation": "Boston qualifier", "Meisterschaft": "Championship",
    "Event-Wiki und Hintergrund": "Event wiki and background", "Besonderheiten": "Highlights", "Allgemeiner Streckencharakter": "General course character", "Atmosphäre": "Atmosphere", "Für wen geeignet": "Who it suits",
    "Einschränkungen": "Limitations", "Praktische Hinweise": "Practical advice", "Planung und Hintergrund": "Planning and background", "Kurze Zusammenfassung": "Short summary", "Häufige Frage": "Frequently asked question", "Zusatzangabe": "Additional detail",
    "Nicht angegeben": "Not specified", "Ja": "Yes", "Nein": "No", "Keine Einträge": "No entries", "Wettbewerb": "Race", "Keine Wettbewerbe": "No races",
    "Gebührenstufe hinzufügen": "Add price tier", "Zwischenzeitlimit hinzufügen": "Add intermediate cutoff", "Zusatzangabe bewusst entfernen": "Remove this additional detail",
    "Wettbewerb / Gebührenstufe": "Race / price tier", "Betrag": "Amount", "Gültig bis / Kontingent": "Valid until / allocation", "Bedingung / Hinweis": "Condition / note",
    "Streckenpunkt / Abschnitt": "Course point / section", "Zeitlimit (z. B. 2:30 h)": "Cutoff (e.g. 2:30 h)", "Zeile bewusst entfernen": "Remove this row", "Frage": "Question", "Antwort": "Answer", "Frage bewusst entfernen": "Remove this question",
    "Zusatzdetails für Detailseite und Event-Wiki": "Additional details for the event page and wiki", "Geltungsbereich der Zusatzdetails": "Scope of additional details", "Nur diese Ausgabe (": "This edition only (", "Allgemeines Event-Wiki – alle Ausgaben": "General event wiki – all editions",
    "Häufige Fragen": "Frequently asked questions", "Frage hinzufügen": "Add question", "Trailrunning": "Trail running", "Ultralauf": "Ultra running", "Bewusst entfernen": "Remove this value",
    "Distanz (km)": "Distance (km)", "Teilabschnitte und Höhenmeter": "Disciplines and elevation", "Wettbewerb bewusst entfernen": "Remove this race", "bewusst entfernen": "remove this value", "Distanz bewusst entfernen": "Remove this distance",
    "Letzte manuelle Prüfungen und Quellenhinweise": "Recent manual checks and source notes", "Angabe": "Detail", "Wert entspricht der letzten Prüfung": "Value matches the last check", "Wert seit der Prüfung geändert": "Value changed since the last check",
    "Keine neue Ausgabe angekündigt": "No new edition announced", "Quelle nicht erreichbar – keine Bestätigung": "Source unavailable – not confirmed", "Quellenprüfung protokolliert": "Source check recorded", "Zeitpunkt nicht verfügbar": "Time unavailable",
    "Adminprüfung ·": "Admin check ·", "Geprüfte Quelle öffnen ↗": "Open verified source ↗", "Weitere Veranstaltungsangabe": "Additional event detail", "Gemeldete fehlerhafte Eventangaben": "Reported event data errors",
    "Geprüft und behoben": "Checked and resolved", "Geprüft: Hinweis trifft nicht zu": "Checked: report does not apply", "Datenprüfung offen": "Data review pending", "Geprüft: Hinweis behoben oder nicht zutreffend": "Checked: resolved or does not apply",
    "Offener Datenhinweis": "Pending data report", "Geprüft: Ursache behoben": "Checked: cause resolved", "Automatischer Änderungsvorschlag:": "Automated change proposal:", "Bisher:": "Current:", "· Vorschlag:": "· Proposed:",
    "Vorschlag ablehnen; gespeicherten Wert behalten": "Reject proposal; keep saved value", "Vorgeschlagenen Wert übernehmen": "Apply proposed value", "Offene Quellenprüfung": "Pending source check", "Quelle geprüft; Problem behoben": "Source checked; issue resolved", "Hinweis nach Prüfung nicht zutreffend": "Checked: report does not apply",
    "Abweichender Termin der erkannten Ausgabe": "Conflicting date for the detected edition", "Automatisch beobachtet:": "Automatically observed:", ". Gespeicherte Ausgabe:": ". Saved edition:", "Termin offen": "Date unconfirmed", "bis": "to",
    "Beobachteter Tag gehört zum bestätigten Zeitraum": "Observed date belongs to the confirmed date range", "Offizielle Termine der gespeicherten Ausgabe sind maßgeblich": "Use the official dates of the saved edition",
    "Offene Hinweise hier bearbeiten (": "Review pending reports here (", "Entscheidung": "Decision", "Begründung der Entscheidung": "Reason for the decision", "Entscheidung prüfen": "Review decision", "Zugehörige Quelle öffnen ↗": "Open related source ↗", "Geprüfte offizielle Quellen-URL": "Verified official source URL",
    "Entscheidung vor dem Speichern prüfen": "Review the decision before saving", "Verbindlich speichern": "Confirm and save", "Weiter bearbeiten": "Continue editing", "Ausgabe auswählen": "Select edition", "Was möchtest du tun?": "What would you like to do?",
    "Bestehende Ausgabe korrigieren": "Correct existing edition", "Neue Edition anlegen": "Create new edition", "Wettbewerb hinzufügen": "Add race", "Optionale Details und Veranstalterangaben": "Optional details and organizer information",
    "Änderungsnotiz (optional)": "Change note (optional)", "Vorhandene offizielle Quelle öffnen ↗": "Open existing official source ↗", "Notiz": "Note", "Änderungen speichern": "Save changes", "Aktuellen Stand laden": "Load latest data", "Entwurf": "Draft", "Veröffentlicht": "Published",
    "Ausgabejahr (erforderlich)": "Edition year (required)", "Ausgabekürzel bei mehreren Ausgaben pro Jahr": "Identifier for multiple editions in one year", "Bereits erkannte Ausgabe weiterbearbeiten": "Continue editing a detected edition", "Neue, noch nicht erkannte Ausgabe": "New edition not detected yet", "Ausgabejahr:": "Edition year:",
    "Neue Edition": "New edition", "Bestehende Edition": "Existing edition", "bleibt erhalten": "is preserved", "Änderungen übernehmen?": "Apply changes?", "Der Termin liegt in einem anderen Kalenderjahr.": "The date is in a different calendar year.",
    "Bestehende Edition korrigieren": "Correct existing edition", "Übernehmen und speichern": "Apply and save", "Abbrechen": "Cancel", "Veröffentlichungsstand wird geprüft …": "Checking publication status …",
    "Entwurf gespeichert; öffentliche Übernahme fehlgeschlagen:": "Draft saved; publishing failed:", "Die Änderungen bleiben erhalten.": "Your changes are preserved.", "Privater Entwurf gespeichert; öffentliche Übernahme ausstehend.": "Private draft saved; publication pending.",
    "Öffentlich aktualisiert: Normale Detailseite geprüft.": "Publicly updated: event page verified.", "Datenbank gespeichert; die öffentliche Übernahme ist noch nicht bestätigt.": "Database saved; publication has not been confirmed yet.",
    "Öffentlichen Stand erneut prüfen": "Check public version again", "Öffentlicher Katalog: geprüft. Detailseite:": "Public catalog: verified. Event page:", ". Karte und Liste:": ". Map and list:", ". Erneut prüfen; die Speicherung bleibt erhalten.": ". Check again; saved changes are preserved.",
    "geprüft": "verified", "noch nicht bestätigt": "not confirmed yet", "neu geladen": "reloaded", "Öffentliche Detailseite öffnen ↗": "Open public event page ↗", "Veröffentlichung erneut prüfen": "Check publication again",
    "In der Datenbank gespeichert und neu geladen.": "Saved in the database and reloaded.", "Entscheidung protokolliert.": "Decision recorded.", "Ort unbekannt": "Location unknown", "Treffer": "results", ". Event auswählen.": ". Select an event.", "(Suche bei Bedarf eingrenzen)": "(narrow your search if needed)",
    "Datenbankstand übernehmen und Formulareingaben verwerfen": "Use database values and discard form changes", "ist jetzt:": "is now:", "(alle Ausgaben)": "(all editions)",
    "z. B. Halbmarathon / Staffel": "e.g. half marathon / relay", "JJJJ-MM-TT; vorhandene Quellenangabe erhalten": "YYYY-MM-DD; preserve existing source information", "Optional: Warum wird die Angabe korrigiert?": "Optional: Why is this value being corrected?",
    "Was hast du geprüft und warum ist diese Entscheidung richtig?": "What did you check and why is this decision correct?",
    "Angaben bearbeiten, Änderungen speichern und einmal bestätigen. Bestehende Ausgaben und persönliche Verknüpfungen bleiben erhalten.": "Edit details, save changes and confirm once. Existing editions and personal links are preserved.",
    "Ungespeicherte Änderungen verwerfen und ein anderes Event suchen?": "Discard unsaved changes and find another event?",
    "Suche geschlossen. Du kannst jetzt ein anderes Event suchen.": "Search closed. You can now find another event.",
    "Der vorhandene Text bleibt erhalten, solange keine neuen Zeilen gespeichert werden.": "The existing text is preserved until new rows are saved.",
    "Zusatzdetails nach dem Anlegen an der neuen Ausgabe ergänzen. Jahresangaben und Prüfungen werden nicht aus der vorherigen Ausgabe übernommen.": "Add additional details after creating the new edition. Annual information and checks are not copied from the previous edition.",
    "Deine geänderten Zusatzangaben werden gemeinsam manuell freigegeben. Unbearbeitete Felder bleiben erhalten. Eine leere bearbeitete Angabe wird entfernt. Datum, Startzeit, Distanzen und Gebührenrahmen stehen weiterhin im Kernformular.": "Your changes to additional details are approved together. Untouched fields are preserved. An edited field left empty is removed. Date, start time, distances and fee range remain in the main form.",
    "Gebührenstaffeln, Startwellen und konkrete Streckenangaben gelten ausschließlich für die gewählte Ausgabe. Allgemeine Wiki-Angaben enthalten keine jahresabhängigen Termine oder Preise. Die Freigabe und alte/neue Werte werden protokolliert. Vorhandene Quellen bleiben erhalten; eine manuelle Freigabe ist keine neue externe Quellenprüfung.": "Price tiers, start waves and specific course details apply only to the selected edition. General wiki details contain no annual dates or prices. Approval and previous/new values are recorded. Existing sources are preserved; manual approval is not a new external source check.",
    "Noch keine manuellen Einzelprüfungen über diesen Pflegeweg protokolliert.": "No individual manual checks have been recorded through this form yet.",
    "Nutzerhinweis prüfen und die betroffenen Angaben gegebenenfalls korrigieren. Dieser Hinweis betrifft die gemeinsame Veranstaltung.": "Review the user report and correct the affected details if needed. This report applies to the shared event.",
    "Die betroffenen Angaben im Formular korrigieren. Einen unzutreffenden oder bereits behobenen Hinweis erst nach Prüfung begründet schließen.": "Correct the affected details in the form. Review an incorrect or resolved report before closing it with a reason.",
    "Ursache prüfen und gegebenenfalls Angaben korrigieren, bevor der Hinweis geschlossen wird.": "Check the cause and correct details if needed before closing the report.",
    "Quelle erneut prüfen und das Ergebnis begründen.": "Check the source again and explain the result.",
    ". Erst Datum und Enddatum im Formular anhand der offiziellen Quelle bestätigen und speichern. Danach die Abweichung hier mit Begründung klären. Die ursprüngliche Beobachtung bleibt im Verlauf erhalten.": ". First confirm and save the start and end dates using the official source. Then resolve the discrepancy here with a reason. The original observation remains in the history.",
    "Keine offenen Änderungsvorschläge oder Quellenaufgaben für diese Ausgabe.": "No pending change proposals or source tasks for this edition.",
    "Jede Entscheidung wird einzeln mit deinem Admin-Konto protokolliert. Sie ersetzt keine gezielte Feldprüfung. Zum Korrigieren eines falschen Vorschlags zuerst die richtigen Angaben im Formular speichern und anschließend den Vorschlag begründet ablehnen.": "Each decision is recorded with your admin account. It does not replace a field check. To correct an incorrect proposal, first save the correct details in the form, then reject the proposal with a reason.",
    "Diese Entscheidung erzeugt keine neue Feldbestätigung und veröffentlicht keinen Entwurf.": "This decision does not confirm any fields or publish a draft.",
    "Entscheidung bereit. Noch nichts gespeichert.": "Decision ready. Nothing has been saved yet.",
    "Diese Ausgabe ist ein privater Entwurf. Nach deiner Bestätigung wird die zulässige Veröffentlichung automatisch geprüft.": "This edition is a private draft. After confirmation, publication eligibility is checked automatically.",
    "Für diese Ausgabe ist eine Prüfung offen.": "A review is pending for this edition.", "Die nächste Quellenprüfung ist fällig.": "The next source check is due.",
    "Der Termin ist unbekannt. Ein Entwurf darf ohne Datum gespeichert werden.": "The date is unknown. A draft can be saved without a date.",
    "Neue Ausgabe: Stammdaten der Veranstaltung bleiben als ungeprüfte Vorlage sichtbar. Termin, Anmeldung, Wettbewerbe und Prüfungen werden nicht aus der alten Ausgabe übernommen.": "New edition: shared event details remain visible as an unverified template. Dates, registration, races and checks are not copied from the old edition.",
    "bereits erkannte Ausgabe(n). Vorhandene Entwürfe oben auswählen; weitere erkannte Ausgaben lassen sich über „Neue Edition anlegen“ weiterbearbeiten. So bleibt die vorhandene Editionsidentität erhalten.": "edition(s) already detected. Select existing drafts above; continue editing other detected editions with “Create new edition” to preserve their identity.",
    "Für eine weitere Ausgabe z. B. „herbst“ statt „main“. Jahr und Kürzel identifizieren diese Ausgabe.": "For another edition, use an identifier such as “autumn” instead of “main”. The year and identifier identify this edition.",
    "Bei Auswahl werden nur die bereits beobachteten Kandidatenangaben als ungeprüfte Vorlage eingesetzt.": "Selecting a candidate uses only previously observed details as an unverified template.",
    ". Eine Korrektur erhält die bestehende Ausgabe und ihre Saisonplaner- und Ergebnisverknüpfungen.": ". A correction preserves the existing edition and its season planner and result links.",
    "Name, Ort, Sport und die optionalen Veranstalterangaben gehören zur gemeinsamen Veranstaltung und gelten für alle Ausgaben. Die gemeinsame Bestätigung gibt nur deine tatsächlichen Änderungen frei; sie bestätigt keine neue externe Quellenprüfung.": "Name, location, sport and optional organizer details belong to the shared event and apply to all editions. Confirmation approves only your actual changes; it does not confirm a new external source check.",
    "Je Wettbewerb eine Zeile: Bezeichnung und Kilometer getrennt eintragen. Die öffentliche Seite sortiert nach Distanz; verschiedene Wettbewerbe mit derselben Distanz bleiben getrennt. Weitere vorhandene Wettbewerbsdetails bleiben erhalten. Unbekannte Distanzen dürfen leer bleiben.": "Use one row per race, with separate name and distance fields. The public page sorts by distance; different races with the same distance remain separate. Other existing race details are preserved. Unknown distances may be left empty.",
    "Die Änderung wird mit deinem Admin-Konto, Zeitpunkt sowie alten und neuen Werten protokolliert. Quellenprüfzeitpunkte werden dadurch nicht erneuert.": "The change is recorded with your admin account, timestamp, and previous and new values. Source check timestamps are not renewed.",
    "Eine Verschiebung kann dieselbe Edition betreffen. Die Auswahl bestimmt, welche Edition gespeichert wird.": "A postponement may apply to the same edition. Your selection determines which edition is saved.",
    "Die Bestätigung gibt nur diese Änderungen manuell frei. Sie bestätigt keine frische Prüfung externer Quellen. Die Anwendung übernimmt zulässige Änderungen automatisch in die öffentlichen Ansichten.": "Confirmation manually approves only these changes. It does not confirm a fresh external source check. Eligible changes are applied to the public views automatically.",
    "Eine neue Editionsidentität entsteht. Die alte Edition und persönliche Ergebnisse bleiben unverändert. Unbearbeitete Jahresangaben und alte Prüfnachweise werden nicht übernommen.": "A new edition is created. The old edition and personal results stay unchanged. Untouched annual information and old verification records are not copied.",
    "Die Editionsidentität sowie persönliche Planner- und Ergebnisverknüpfungen bleiben unverändert.": "The edition identity and personal planner and result links remain unchanged.",
    "Nach der Korrektur erneut „Änderungen speichern“ wählen; die Übernahme erfolgt automatisch.": "After correcting the details, select “Save changes” again; publication is automatic.",
    "Für die öffentliche Anzeige fehlen noch zulässige Pflichtangaben oder eine Konfliktklärung.": "Required information or conflict resolution is still needed for public display.",
    "Im öffentlichen Live-Archiv geprüft. Normale Detailseite, Karte und Liste werden geprüft …": "Verified in the public archive. Checking the event page, map and list …",
    "Die Online-Ansichten laden aktuelle Daten direkt. Bei einem Datenbankausfall kann ein älterer, entsprechend gekennzeichneter Export erscheinen; dessen Stand wird durch diese Prüfung nicht erneuert.": "The online views load current data directly. During a database outage, an older labeled export may appear; this check does not update that export.",
    "Die Speicherung ist erhalten; Veröffentlichung konnte nicht geprüft werden.": "Saved changes are preserved; publication could not be verified.",
    "Die bestätigten Änderungen wurden manuell freigegeben; Quellenprüfzeitpunkte bleiben getrennt.": "The confirmed changes were manually approved; source check timestamps remain separate.",
    "Aktueller Datenbankstand geladen; deine bearbeiteten Eingaben bleiben im Formular.": "Latest database values loaded; your edited inputs remain in the form.",
    "Keine zwischenzeitlichen Faktenänderungen.": "No intervening changes to the data.",
    "Die Wettbewerbe haben sich überlagert. Bitte den aktuellen Formularstand übernehmen und erneut bearbeiten.": "Race edits conflict with newer changes. Load the latest form values and edit again.",
    "Bitte deine Änderungen mit dem aktuellen Datenbankstand vergleichen und danach „Änderungen speichern“ wählen.": "Compare your changes with the latest database values, then select “Save changes”.",
    "Auch die Zusatzdetails wurden zwischenzeitlich geändert. Deine Eingaben bleiben erhalten; bitte vor dem Speichern den aktuellen Formularstand übernehmen und erneut bearbeiten.": "Additional details have also changed. Your inputs are preserved; load the latest form values and edit again before saving.",
    "Die öffentliche Beschreibungsprüfung konnte nicht geladen werden. Bitte die Seite erneut laden.": "The public description validator could not be loaded. Please reload the page.",
    "Mehrere Wissensdatensätze sind dieser Ausgabe zugeordnet. Bitte die Zuordnung vor der Pflege klären.": "Multiple knowledge records are linked to this edition. Resolve the assignment before editing.",
    "Die Ausgabe ist noch nicht die nächste sichtbare Ausgabe. Bitte vorhandene aktuelle Ausgaben und deren Termine hier unter den offenen Hinweisen prüfen.": "This edition is not yet the next visible edition. Check current editions and their dates in the pending reports below.",
    "Die vorhandenen Quellenbedingungen sind noch nicht erfüllt. Bitte die offizielle editionsgenaue Quelle und offene Quellenprobleme hier unter den offenen Hinweisen prüfen.": "Source requirements are not met yet. Check the official edition-specific source and pending source issues below.",
    "Es gibt noch offene Prüfungen oder widersprüchliche Angaben. Bitte die Hinweise hier unter den offenen Hinweisen klären.": "Reviews or conflicting details remain unresolved. Resolve the pending reports below.",
    "Für die öffentliche Anzeige fehlen erforderliche Angaben. Bitte die konkreten Pflichtangaben und offenen Hinweise ergänzen.": "Required information is missing for public display. Complete the required fields and resolve pending reports.",
    "Die bestehenden Freigaberegeln sind noch nicht erfüllt. Bitte die offenen Hinweise hier unter den offenen Hinweisen prüfen.": "Publication requirements are not met yet. Check the pending reports below.",
    "Bitte eine gültige Zahl eingeben.": "Please enter a valid number.", "Distanzen müssen gültige Kilometerangaben sein.": "Distances must be valid values in kilometers.",
    "braucht eine gültige nicht negative Zahl.": "requires a valid non-negative number.", "Jeder Wettbewerb benötigt eine Bezeichnung, z. B. 10-km-Lauf oder Staffel.": "Each race needs a name, such as 10 km run or relay.",
    "Der Server hat das Speichern nicht eindeutig bestätigt. Bitte denselben Speichervorgang erneut prüfen.": "The server did not clearly confirm the save. Please check the same save request again.",
    "Der aktuelle Datenbankstand konnte nicht vollständig geladen werden.": "The latest database values could not be loaded completely.",
    "Die Änderung „": "The change “", "“ wurde nicht gespeichert. Bitte denselben Speichervorgang erneut prüfen.": "” was not saved. Please check the same save request again.",
    "Das Entfernen von „": "Removing “", "“ wurde nicht gespeichert.": "” was not saved.", "Die Zusatzangabe „": "The additional detail “", "Die Zusatzangabe wurde nicht entfernt.": "The additional detail was not removed.",
    "Die Frage und Antwort wurden nicht gespeichert.": "The question and answer were not saved.", "Die Frage wurde nicht entfernt.": "The question was not removed.", "Die Antwort dauert zu lange.": "The response is taking too long.",
    "Gespeicherte Ausgabe konnte nicht aus der Datenbank zurückgelesen werden. Bitte denselben Vorgang erneut prüfen.": "The saved edition could not be read back from the database. Please check the same request again.",
    "Öffentlichen Detailstand prüfen": "Check public event details", "Die öffentliche Verbindung ist nicht konfiguriert.": "The public connection is not configured.",
    "Der öffentliche Katalog ist aktuell nicht erreichbar. Die Datenbankspeicherung bleibt erhalten.": "The public catalog is currently unavailable. Database changes are preserved.", "Der öffentliche Katalog liefert kein eindeutiges Ergebnis.": "The public catalog did not return a unique result.",
    "Die Zusatzdetails wurden zwischenzeitlich geändert. Bitte den aktuellen Formularstand übernehmen und die Zusatzdetails erneut bearbeiten.": "Additional details have changed. Load the latest form values and edit those details again.",
    "Jede Gebührenstufe braucht eine Bezeichnung und einen Betrag. Unbekannte Gebühren bitte noch nicht als Stufe hinzufügen.": "Each price tier needs a name and amount. Do not add unknown fees as a tier yet.",
    "Jedes Zwischenzeitlimit braucht einen Streckenpunkt und ein Zeitlimit.": "Each intermediate cutoff needs a course point and time limit.", "Bitte Frage und Antwort ergänzen oder die unvollständige Frage bewusst entfernen.": "Complete both question and answer, or remove the incomplete question.",
    "Eine bewusst entfernte Zusatzangabe kann nicht zugleich bestätigt werden.": "A removed additional detail cannot also be confirmed.", "Bitte deine Formularänderungen und Feldprüfungen zuerst speichern. Danach die offene Entscheidung bearbeiten.": "Save your form changes and field checks first, then review the pending decision.",
    "Bitte die Entscheidung mit mindestens 20 Zeichen nachvollziehbar begründen.": "Please explain the decision using at least 20 characters.", "Bitte die offizielle Quelle der bestätigten Termine angeben.": "Please provide the official source for the confirmed dates.",
    "Event und Ausgaben werden geladen …": "Loading event and editions …", "Datenbankstand geladen. Angaben bearbeiten und Änderungen speichern.": "Database values loaded. Edit details and save changes.", "Event konnte nicht geladen werden.": "The event could not be loaded.",
    "Die Wettbewerbe wurden zwischenzeitlich geändert. Bitte zuerst den aktuellen Formularstand übernehmen und erneut bearbeiten.": "The races have changed. Load the latest form values before editing again.", "Bitte eine gültige http://- oder https://-Adresse eingeben.": "Please enter a valid http:// or https:// URL.", "darf nicht leer sein.": "must not be empty.",
    "Das Enddatum liegt vor dem neuen Termin. Bitte das Enddatum ebenfalls korrigieren.": "The end date is before the new start date. Please correct the end date as well.", "Bitte das Ausgabejahr oder ein gültiges Datum eingeben.": "Please enter the edition year or a valid date.",
    "Die neue Edition verwendet die gemeinsamen Stammdaten. Gemeinsame Angaben bitte an der bestehenden Edition korrigieren.": "The new edition uses shared event details. Correct shared details on the existing edition.", "Es gibt noch keine geänderten Angaben.": "No details have been changed yet.",
    "Diese Zielausgabe existiert bereits. Abbrechen und die vorhandene Ausgabe auswählen; für eine tatsächlich andere Austragung ein eigenes Kürzel verwenden.": "This target edition already exists. Cancel and select it, or use a different identifier for a genuinely separate edition.",
    "Änderungsübersicht bereit. Noch nichts gespeichert.": "Change summary ready. Nothing has been saved yet.", "Wird atomar gespeichert und erneut aus der Datenbank geladen …": "Saving and reloading database values …",
    "Antwort unklar. Derselbe Speichervorgang wird ohne Duplikat erneut abgefragt …": "Response unclear. Checking the same save request again without creating a duplicate …", "Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten.": "Saving failed. Your inputs are preserved.",
    "Der Speicherstand ist noch unklar. Deine Eingaben bleiben erhalten. Bitte „Übernehmen und speichern“ erneut wählen: Derselbe Auftrag wird sicher wiederholt, bevor du weiterbearbeitest.": "The save outcome is still unclear. Your inputs are preserved. Select “Apply and save” again to safely retry the same request before continuing.",
    "Zwischenzeitlich wurden diese Daten geändert. Deine Eingaben bleiben erhalten. Lade den aktuellen Stand zum Vergleich und prüfe deine Änderungen erneut.": "These values have changed. Your inputs are preserved. Load the latest values to compare and review your changes again.", "Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Derselbe Speichervorgang kann erneut geprüft werden.": "Saving failed. Your inputs are preserved. You can check the same save request again.",
    "Bitte mindestens zwei Buchstaben des Eventnamens eingeben.": "Please enter at least two letters of the event name.", "Events werden gesucht …": "Searching for events …", "Keine passenden Events gefunden.": "No matching events found.", "Suche fehlgeschlagen.": "Search failed.",
    "Bitte die bearbeiteten Zusatzdetails vor dem Wechsel des Geltungsbereichs speichern oder den Datenbankstand neu übernehmen.": "Save your edited additional details or reload the database values before changing their scope.", "Formular mit dem aktuellen Datenbankstand vorausgefüllt. Bitte erneut prüfen.": "The form now contains the latest database values. Please review again.",
    "Aktueller Stand geladen. Bitte Änderungen vergleichen und erneut gemeinsam bestätigen.": "Latest values loaded. Compare your changes and confirm them together again.",
    "Neu:": "New:", "Zusatzdetails:": "Additional details:", "alle Ausgaben": "all editions", "diese Edition": "this edition",
    "Karte und Liste sind mit den gespeicherten Angaben neu geladen.": "The map and list have reloaded the saved values.",
    "Diese Ausgabe ist im Archiv sichtbar; sie ist nicht die nächste Ausgabe in Karte und Liste.": "This edition is visible in the archive; it is not the next edition shown on the map and list.",
    "Ausfallexport: Veröffentlichung erforderlich.": "Fallback export: publication required.",
    "Der gespeicherte Stand muss nach bestandenen Qualitätsprüfungen über den regulären Datenrelease in die Ausfalldaten übernommen werden. Eine erfolgreiche Onlineprüfung bestätigt diesen Schritt nicht.": "After passing quality checks, the saved version must be included in the fallback data through the regular data release. A successful online check does not confirm this step."
  };

  function maintenanceText(source) {
    const text = String(source ?? "");
    const core = text.trim();
    const language = typeof globalThis.getAppLanguage === "function" ? globalThis.getAppLanguage() : "de";
    const german = Object.hasOwn(MAINTENANCE_TRANSLATIONS, core) ? core
      : Object.keys(MAINTENANCE_TRANSLATIONS).find(key => MAINTENANCE_TRANSLATIONS[key] === core);
    const translated = german ? language === "en" ? MAINTENANCE_TRANSLATIONS[german] : german
      : typeof globalThis.uiText === "function" ? globalThis.uiText(core) : core;
    return core ? text.replace(core, translated) : text;
  }
  function maintenanceLabel(source) {
    return `<span data-i18n-text="${escape(source)}">${escape(maintenanceText(source))}</span>`;
  }

  function publicDescription(value) {
    if (typeof descriptions?.cleanPublicEventDescription !== "function") throw new Error(maintenanceText("Die öffentliche Beschreibungsprüfung konnte nicht geladen werden. Bitte die Seite erneut laden."));
    return descriptions.cleanPublicEventDescription(value);
  }

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
  // Existing Knowledge Base fields, presented as ordinary inputs rather than JSON.
  // Core edition facts remain in the core form and are never duplicated here.
  const KNOWLEDGE_GROUPS = {
    basis: ["Allgemeines zur Veranstaltung", [["event_series", "Veranstaltungsserie"], ["first_edition", "Erste Austragung"], ["region", "Region"]]],
    registration: ["Anmeldung und Gebühren", [["registration_open_date", "Anmeldung ab", "date"], ["registration_close_date", "Anmeldeschluss", "date"], ["price_tiers", "Gebührenstaffeln", "tiers"], ["lottery_available", "Startplatzverlosung", "boolean"], ["qualification_required", "Qualifikation"], ["charity_entries", "Charity-Startplätze", "boolean"], ["waiting_list", "Warteliste"], ["transfer_possible", "Startplatzübertragung"], ["refund_policy", "Rücktritt und Erstattung"], ["sold_out_status", "Hinweise zur Verfügbarkeit"]]],
    course: ["Strecke", [["course_type", "Streckenart"], ["course_character", "Streckenbeschreibung"], ["surface", "Untergrund"], ["start_location", "Startbereich"], ["finish_location", "Zielbereich"], ["start_finish_same_place", "Start und Ziel am selben Ort", "boolean"], ["loop_course", "Rundkurs", "boolean"], ["point_to_point", "Punkt-zu-Punkt-Strecke", "boolean"], ["course_map_url", "Offizieller Streckenplan", "url"], ["gpx_url", "GPX-Datei", "url"], ["elevation_profile_url", "Höhenprofil", "url"], ["difficulty_rating", "Schwierigkeit"], ["beginner_friendly", "Eignung für Einsteiger"], ["personal_best_potential", "Bestzeiten-Potenzial"], ["scenic_rating", "Landschaft"], ["crowd_support_rating", "Zuschauerunterstützung"], ["swim_location", "Schwimmort"], ["swim_type", "Gewässerart"], ["bike_laps", "Radrunden"], ["bike_character", "Radstrecke"], ["run_laps", "Laufrunden"], ["run_character", "Laufstrecke"], ["transition_area", "Wechselzone"]]],
    race_day: ["Renntag und Startzeiten", [["wave_start", "Startzeiten je Wettbewerb / Startwellen"], ["total_cutoff", "Gesamt-Zeitlimit (z. B. 6:15 h)"], ["intermediate_cutoffs", "Zwischenzeitlimits", "cutoffs"], ["swim_cutoff", "Schwimm-Zeitlimit"], ["bike_cutoff", "Rad-Zeitlimit"], ["run_cutoff", "Lauf-Zeitlimit"], ["aid_stations", "Verpflegung"], ["pacers_available", "Tempomacher"], ["timing_system", "Zeitmessung"], ["bag_drop", "Gepäckabgabe"], ["showers", "Duschen"], ["changing_rooms", "Umkleiden"], ["toilets", "Toiletten"], ["medical_support", "Medizinische Betreuung"], ["live_tracking", "Live-Tracking"], ["livestream", "Livestream"], ["expo_available", "Messe / Expo"], ["bib_pickup_info", "Startnummernausgabe"]]],
    travel: ["Anreise und Aufenthalt", [["nearest_airport", "Flughafen"], ["nearest_train_station", "Bahnhof"], ["public_transport_info", "Öffentliche Verkehrsmittel"], ["parking_info", "Parken / Park & Ride"], ["accommodation_info", "Unterkunft"], ["camping_available", "Camping"], ["recommended_arrival", "Empfohlene Anreise"], ["recommended_booking_time", "Buchungshinweise"], ["timezone", "Zeitzone"]]],
    weather: ["Wetter und Planung", [["average_temperature", "Durchschnittstemperatur (mit °C)"], ["average_high_temperature", "Durchschnittliche Höchsttemperatur (mit °C)"], ["average_low_temperature", "Durchschnittliche Tiefsttemperatur (mit °C)"], ["average_rainfall", "Niederschlag (mit Einheit)"], ["typical_weather", "Typisches Wetter"], ["heat_risk", "Hitze"], ["wind_risk", "Wind"], ["best_conditions_note", "Bedingungen"], ["seasonal_context", "Jahreszeit"], ["planning_tips", "Planungshinweise"]]],
    statistics: ["Ergebnisse und Hintergrundzahlen", [["participant_count", "Teilnehmerzahl"], ["finisher_count", "Finisher"], ["women_percentage", "Frauenanteil (mit %)"], ["average_finish_time", "Durchschnittliche Zielzeit"], ["last_winner_male", "Sieger"], ["last_winner_female", "Siegerin"], ["last_winning_time_male", "Siegerzeit"], ["last_winning_time_female", "Siegerinnenzeit"], ["historic_significance", "Historische Bedeutung"], ["notable_facts", "Weitere belegte Fakten"], ["world_major", "World Marathon Major", "boolean"], ["utmb_index", "UTMB-Index"], ["boston_qualifier", "Boston-Qualifikation", "boolean"], ["championship_status", "Meisterschaft"]]],
    editorial: ["Event-Wiki und Hintergrund", [["why_this_event_stands_out", "Besonderheiten"], ["course_character", "Allgemeiner Streckencharakter"], ["atmosphere", "Atmosphäre"], ["good_fit_for", "Für wen geeignet"], ["not_ideal_for", "Einschränkungen"], ["insider_tips", "Praktische Hinweise"], ["planning_context", "Planung und Hintergrund"], ["seo_summary", "Kurze Zusammenfassung"]]]
  };
  const BRAND_KNOWLEDGE_GROUPS = ["basis", "editorial", "travel", "weather"];
  const KNOWLEDGE_LABELS = Object.fromEntries(Object.entries(KNOWLEDGE_GROUPS).flatMap(([section, [, fields]]) => fields.map(([key, label]) => [`${section}.${key}`, label])));
  const knowledgeLabel = path => path.startsWith("faq.") ? maintenanceText("Häufige Frage") : KNOWLEDGE_LABELS[path] || maintenanceText("Zusatzangabe");
  function knowledgeRecord(context, scope, editionId) {
    const records = (context?.knowledge || []).filter(row => row.knowledge_scope === scope && (scope === "brand" || row.edition_id === editionId));
    if (records.length > 1) throw new Error(maintenanceText("Mehrere Wissensdatensätze sind dieser Ausgabe zugeordnet. Bitte die Zuordnung vor der Pflege klären."));
    return records[0] || {};
  }
  function knowledgeValue(record, path) {
    const [section, key] = path.split(".");
    return section === "faq" ? (record.faq || []).find(row => row.id === key) : record?.[section]?.[key];
  }
  function buildKnowledgePatch(record, fields, touched, clear, scope) {
    const patch = {};
    for (const path of touched) {
      const [section, key] = path.split(".");
      if (!Object.hasOwn(KNOWLEDGE_LABELS, path) || clear.includes(path) || (scope === "brand" && !BRAND_KNOWLEDGE_GROUPS.includes(section))) continue;
      const value = fields[path];
      if (Array.isArray(value) && !value.length && (!Array.isArray(knowledgeValue(record, path)) || !knowledgeValue(record, path).length)) continue;
      if (value === "" || value === undefined || value === null || equal(knowledgeValue(record, path), value)) continue;
      (patch[section] ||= {})[key] = clone(value);
    }
    return patch;
  }
  function displayKnowledge(value) {
    if (value === null || value === undefined || value === "") return maintenanceText("Nicht angegeben");
    if (typeof value === "boolean") return value ? maintenanceText("Ja") : maintenanceText("Nein");
    if (Array.isArray(value)) return value.map(displayKnowledge).join("; ") || maintenanceText("Keine Einträge");
    if (typeof value === "object") {
      if (value.question) return `${value.question} – ${value.answer || ""}`;
      if (value.point) return `${value.point}: ${value.time || ""}`;
      return [value.tier || value.name, [value.price ?? value.fee, value.currency].filter(item => item !== undefined && item !== "").join(" "), value.until, value.note].filter(Boolean).join(" · ");
    }
    return String(value);
  }
  function knowledgeExpectation(context, request, editionId) {
    if (!request) return null;
    const record = knowledgeRecord(context, request.scope || "edition", editionId);
    const confirmed = new Set((request.confirmations || []).map(row => row.field));
    const removed = new Set([...(request.clear_fields || []), ...(request.faq_remove || []).map(id => `faq.${id}`)]);
    const changed = Object.entries(request.patch || {}).flatMap(([section, fields]) => Object.keys(fields).map(key => `${section}.${key}`));
    if (request.manual_approval) for (const path of [...changed, ...(request.faq_upserts || []).map(row => `faq.${row.id}`)]) confirmed.add(path);
    const paths = [...new Set([...changed, ...removed, ...confirmed, ...(request.faq_upserts || []).map(row => `faq.${row.id}`)])];
    return { scope: request.scope || "edition", event_id: context.event.id, edition_id: editionId, fields: paths.map(path => ({ path, visible: confirmed.has(path) && !removed.has(path), value: knowledgeValue(record, path) })) };
  }
  function compareRenderedKnowledge(records, expected) {
    if (!expected) return true;
    if (!Array.isArray(records)) return false;
    const matching = records.filter(row => row.knowledge_scope === expected.scope && String(row.event_brand_id) === String(expected.event_id) && (expected.scope === "brand" || row.edition_id === expected.edition_id));
    if (matching.length > 1) return false;
    const record = matching[0];
    return expected.fields.every(({ path, visible, value }) => {
      const rendered = Boolean(record?.rendered_fields?.includes(path));
      if (!visible) return !rendered && knowledgeValue(record, path) == null;
      if (!rendered || value === undefined || value === null) return false;
      const actual = knowledgeValue(record, path);
      if (path.startsWith("faq.")) return actual?.id === value.id && actual?.question === value.question && actual?.answer === value.answer;
      return equal(actual, value);
    });
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const safeUrl = value => { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; } };
  function friendlyReviewReason(reason) {
    const message = String(reason || "");
    if (/active|discovery|current.*edition|latest.*edition/i.test(message)) return maintenanceText("Die Ausgabe ist noch nicht die nächste sichtbare Ausgabe. Bitte vorhandene aktuelle Ausgaben und deren Termine hier unter den offenen Hinweisen prüfen.");
    if (/source|crawl|health|fetch/i.test(message)) return maintenanceText("Die vorhandenen Quellenbedingungen sind noch nicht erfüllt. Bitte die offizielle editionsgenaue Quelle und offene Quellenprobleme hier unter den offenen Hinweisen prüfen.");
    if (/conflict|pending|review task|proposal|issue/i.test(message)) return maintenanceText("Es gibt noch offene Prüfungen oder widersprüchliche Angaben. Bitte die Hinweise hier unter den offenen Hinweisen klären.");
    if (/required|missing|evidence|field|complete/i.test(message)) return maintenanceText("Für die öffentliche Anzeige fehlen erforderliche Angaben. Bitte die konkreten Pflichtangaben und offenen Hinweise ergänzen.");
    if (/[äöüÄÖÜß]|\b(Bitte|Die|Der|Für|Vor|Ein|Eine)\b/.test(message)) return message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[Ausgabe]");
    return maintenanceText("Die bestehenden Freigaberegeln sind noch nicht erfüllt. Bitte die offenen Hinweise hier unter den offenen Hinweisen prüfen.");
  }

  // Empty inputs are omissions. Only the separate deletion checkboxes delete data.
  function buildPatch(before, values, touchedFields, clearFields, allowedFields) {
    const patch = {};
    const clear = new Set(clearFields || []);
    for (const field of touchedFields || []) {
      if (!allowedFields.includes(field) || clear.has(field)) continue;
      const value = values[field];
      if (value === "" || value === undefined || value === null) continue;
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error(maintenanceText("Bitte eine gültige Zahl eingeben."));
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
        if (!Number.isFinite(distance) || distance < 0) throw new Error(maintenanceText("Distanzen müssen gültige Kilometerangaben sein."));
        prior.distance_km = distance;
      }
      if (row.clear_distance === true) delete prior.distance_km;
      for (const [key, label] of FORMAT_DETAILS) {
        if (row[key] !== "" && row[key] !== undefined && row[key] !== null) {
          const value = Number(row[key]);
          if (!Number.isFinite(value) || value < 0) throw new Error(`${label}${maintenanceText(" braucht eine gültige nicht negative Zahl.")}`);
          prior[key] = value;
        }
        if (row[`clear_${key}`] === true) delete prior[key];
      }
      if (!prior.label) throw new Error(maintenanceText("Jeder Wettbewerb benötigt eine Bezeichnung, z. B. 10-km-Lauf oder Staffel."));
      return prior;
    });
  }

  function assertSaveOutcome(data, request) {
    if (!data || data.saved !== true || data.request_id !== request.request_id || String(data.event_id) !== String(request.event_id) || !data.edition_id || (request.action !== "create" && data.edition_id !== request.edition_id)) {
      throw new Error(maintenanceText("Der Server hat das Speichern nicht eindeutig bestätigt. Bitte denselben Speichervorgang erneut prüfen."));
    }
    return data;
  }

  function assertContext(context, eventId) {
    if (!context?.event || String(context.event.id) !== String(eventId) || !Array.isArray(context.editions) || typeof context.version !== "string" || !context.version) throw new Error(maintenanceText("Der aktuelle Datenbankstand konnte nicht vollständig geladen werden."));
    return context;
  }

  function assertPersistedChanges(context, request, editionId) {
    const edition = context.editions.find(row => row.id === editionId);
    const matches = (field, actual, expected) => {
      if (expected === null) return actual === null;
      if (["latitude", "longitude", "edition_year", "price_min", "price_max", "participant_limit"].includes(field)) {
        return actual !== null && actual !== undefined && Number(actual) === Number(expected);
      }
      if (field === "start_time" && actual && expected) {
        const clock = value => String(value).split(":").concat("00").slice(0, 3).join(":");
        return clock(actual) === clock(expected);
      }
      return equal(actual, expected);
    };
    for (const scope of ["event", "edition"]) {
      const record = scope === "event" ? context.event : edition;
      for (const [field, expected] of Object.entries(request[`${scope}_patch`] || {})) {
        if (!record || !Object.hasOwn(record, field) || !matches(field, record[field], expected)) {
          throw new Error(`${maintenanceText("Die Änderung „")}${LABELS[`${scope}.${field}`] || field}${maintenanceText("“ wurde nicht gespeichert. Bitte denselben Speichervorgang erneut prüfen.")}`);
        }
      }
    }
    for (const path of request.clear_fields || []) {
      const [scope, field] = path.split(".");
      const record = scope === "event" ? context.event : edition;
      if (!record || !Object.hasOwn(record, field) || record[field] !== null) {
        throw new Error(`${maintenanceText("Das Entfernen von „")}${LABELS[path] || field}${maintenanceText("“ wurde nicht gespeichert.")}`);
      }
    }
    if (request.knowledge) {
      const record = knowledgeRecord(context, request.knowledge.scope || "edition", editionId);
      for (const [section, fields] of Object.entries(request.knowledge.patch || {})) {
        for (const [field, expected] of Object.entries(fields)) if (!equal(record[section]?.[field], expected)) {
          throw new Error(`${maintenanceText("Die Zusatzangabe „")}${knowledgeLabel(`${section}.${field}`)}${maintenanceText("“ wurde nicht gespeichert.")}`);
        }
      }
      for (const path of request.knowledge.clear_fields || []) {
        const value = knowledgeValue(record, path);
        if (value != null && !(Array.isArray(value) && value.length === 0)) throw new Error(maintenanceText("Die Zusatzangabe wurde nicht entfernt."));
      }
      for (const row of request.knowledge.faq_upserts || []) {
        const actual = knowledgeValue(record, `faq.${row.id}`);
        // The database adds audit/source metadata to FAQs. Check the submitted
        // values and their parent binding, not equality with the entire row.
        if (!actual || ["id", "question", "answer", "sort_order"].some(field =>
          Object.hasOwn(row, field) && !equal(actual[field], row[field])) ||
          (actual.event_detail_id != null && actual.event_detail_id !== record.id)) {
          throw new Error(maintenanceText("Die Frage und Antwort wurden nicht gespeichert."));
        }
      }
      for (const id of request.knowledge.faq_remove || []) if (knowledgeValue(record, `faq.${id}`) != null) throw new Error(maintenanceText("Die Frage wurde nicht entfernt."));
    }
    return context;
  }

  async function rpc(client, name, args, timeoutMs = 20000) {
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve(client.rpc(name, args)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(maintenanceText("Die Antwort dauert zu lange.")), { uncertain: true })), timeoutMs); })
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
    if (!context.editions.some(edition => edition.id === receipt.edition_id)) throw new Error(maintenanceText("Gespeicherte Ausgabe konnte nicht aus der Datenbank zurückgelesen werden. Bitte denselben Vorgang erneut prüfen."));
    try { assertPersistedChanges(context, request, receipt.edition_id); }
    catch (error) { error.uncertain = true; throw error; }
    return { ...receipt, context };
  }

  function publicProjection(event, edition) {
    const date = edition.start_date ? edition.start_date.slice(0, 10).split("-").reverse().join(".") : null;
    return { event_id: event.id, edition_id: edition.id, event_name: event.canonical_name, sport: event.sport, city: event.city, country: event.country, address: event.address, latitude: event.latitude, longitude: event.longitude, description: publicDescription(event.description), official_url: event.official_url, organizer_name: event.organizer_name, organizer_url: event.organizer_url, date, edition_year: edition.edition_year, registration_status: edition.registration_status, registration_url: edition.registration_url, source_url: edition.source_url, event_url: edition.registration_url ?? event.official_url ?? edition.source_url ?? null, distance: edition.legacy_distance ?? edition.race_formats?.[0]?.label ?? null, event_status: edition.edition_status, race_formats: edition.race_formats,
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
  async function verifyRenderedDetail({ event, edition, knowledge = null, documentRef = globalThis.document, timeoutMs = 25000 }) {
    const slug = edition.edition_slug || edition.slug;
    if (!documentRef || !slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return { detailVerified: false };
    const detailUrl = new URL(`/event/${slug}/`, documentRef.location.href);
    detailUrl.searchParams.set("maintenance_check", globalThis.crypto.randomUUID());
    const frame = documentRef.createElement("iframe");
    frame.title = maintenanceText("Öffentlichen Detailstand prüfen"); frame.hidden = true;
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
          if (knowledge && doc.documentElement.dataset.semPublicDetailKnowledgeState === "unavailable") return finish(false);
          if (knowledge && doc.documentElement.dataset.semPublicDetailKnowledgeState !== "verified") return;
          const data = JSON.parse(doc.getElementById("sem-public-detail-data")?.textContent || "null");
          const details = knowledge ? JSON.parse(doc.getElementById("sem-public-detail-knowledge-data")?.textContent || "null") : null;
          finish(comparePublicRow(data, expected) && compareRenderedKnowledge(details, knowledge));
        } catch { finish(false); }
      };
      timer = setTimeout(() => finish(false), timeoutMs); poll = setInterval(inspect, 150);
      frame.addEventListener("load", inspect); documentRef.body.appendChild(frame);
    });
  }

  async function verifyPublicEdition({ supabaseUrl, publishableKey, event, edition, fetchImpl = globalThis.fetch }) {
    if (edition.publication_status !== "published") return { status: "draft", archiveVerified: false, discoveryVerified: false, staticVerified: false };
    if (!supabaseUrl || !publishableKey) throw new Error(maintenanceText("Die öffentliche Verbindung ist nicht konfiguriert."));
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
      if (!response.ok) throw new Error(maintenanceText("Der öffentliche Katalog ist aktuell nicht erreichbar. Die Datenbankspeicherung bleibt erhalten."));
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 1) throw new Error(maintenanceText("Der öffentliche Katalog liefert kein eindeutiges Ergebnis."));
      const row = rows[0] || null;
      // The transport retains canonical raw text; the rendered page must expose
      // the clean projection exactly. Never clean an iframe's claimed readback.
      return row && Object.hasOwn(row, "description") ? { ...row, description: publicDescription(row.description) } : row;
    };
    const [archive, discovery] = await Promise.all([read("public_event_archive"), read("public_event_discovery")]);
    const archiveVerified = comparePublicRow(archive, expected);
    const discoveryVerified = comparePublicRow(discovery, expected);
    return { status: archiveVerified ? "live_verified" : "pending", archiveVerified, discoveryVerified, discoveryPresent: Boolean(discovery), staticVerified: false };
  }

  function display(value) {
    if (value === null || value === undefined || value === "") return maintenanceText("Nicht angegeben");
    if (Array.isArray(value)) return value.map(row => {
      if (!row || typeof row !== "object") return String(row ?? maintenanceText("Wettbewerb"));
      const legacyValue = typeof row.value === "number" || typeof row.value === "string" ? String(row.value).trim() : "";
      const amount = legacyValue && Number.isFinite(Number(legacyValue)) ? new Intl.NumberFormat(typeof globalThis.getAppLanguage === "function" && globalThis.getAppLanguage() === "en" ? "en-GB" : "de-DE", { maximumFractionDigits: 20, useGrouping: false }).format(Number(legacyValue)) : legacyValue;
      const measurement = amount ? [amount, typeof row.unit === "string" ? row.unit.trim() : ""].filter(Boolean).join(" ") : "";
      const label = row.label || row.original || measurement || maintenanceText("Wettbewerb");
      return `${label}${row.distance_km != null ? ` (${row.distance_km} km)` : ""}${FORMAT_DETAILS.filter(([key]) => row[key] != null).map(([key, label, unit]) => ` · ${maintenanceText(label)}: ${row[key]} ${unit}`).join("")}`;
    }).join("; ") || maintenanceText("Keine Wettbewerbe");
    return STATUS[value] ? maintenanceText(STATUS[value]) : String(value);
  }

  function mount({ root, client, verifyPublication, refreshCatalog, verifyDetail = verifyRenderedDetail }) {
    root.__maintenanceLanguageCleanup?.();
    if (typeof globalThis.registerUiTranslations === "function") {
      // Register separately so synonymous English labels retain every German alias.
      Object.entries(MAINTENANCE_TRANSLATIONS).forEach(([de, en]) => globalThis.registerUiTranslations({ [en]: de }));
    }
    let context = null, selectedId = null, action = "correct", busy = false, pending = null, lastReceipt = null, unresolved = false;
    let touched = new Set(), formatsDirty = false, formatConflict = false, searchSequence = 0, selectionSequence = 0, initialSourceUrl = "";
    let knowledgeScope = "edition", knowledgeTouched = new Set(), knowledgeConflict = false, lastKnowledgeRequest = null, editorBaseline = "";
    root.innerHTML = `<section class="admin-table-section event-maintenance" aria-labelledby="maintenanceTitle">
      <span class="admin-eyebrow"><span data-i18n-text="Manuelle Datenpflege">Manuelle Datenpflege</span></span><h3 id="maintenanceTitle"><span data-i18n-text="Events pflegen">Events pflegen</span></h3>
      <p><span data-i18n-text="Angaben bearbeiten, Änderungen speichern und einmal bestätigen. Bestehende Ausgaben und persönliche Verknüpfungen bleiben erhalten.">Angaben bearbeiten, Änderungen speichern und einmal bestätigen. Bestehende Ausgaben und persönliche Verknüpfungen bleiben erhalten.</span></p>
      <form data-maintenance-search-form class="maintenance-search"><label><span data-i18n-text="Event suchen">Event suchen</span><input data-maintenance-search type="search" placeholder="Name der Veranstaltung" data-i18n-placeholder-text="Name der Veranstaltung" autocomplete="off" maxlength="120"></label><button type="submit"><span data-i18n-text="Suchen">Suchen</span></button><button type="button" data-maintenance-close hidden><span data-i18n-text="Schließen und anderes Event suchen">Schließen und anderes Event suchen</span></button></form>
      <div data-maintenance-results class="maintenance-results" aria-live="polite"></div>
      <p data-maintenance-status class="admin-section-status" role="status" aria-live="polite"></p>
      <div data-maintenance-editor></div><div data-maintenance-publication aria-live="polite"></div>
    </section>`;
    const $ = selector => root.querySelector(selector);
    const editor = $("[data-maintenance-editor]");
    const status = (message, error = false) => { const label = $("[data-maintenance-status]"); label.dataset.i18nText = message; label.textContent = maintenanceText(message); label.classList.toggle("is-error", error); };
    const selected = () => context?.editions.find(edition => edition.id === selectedId);
    const values = () => ({ event: context?.event || {}, edition: action === "create" ? seedNextEdition() : selected() || {} });
    const setBusy = value => { busy = value; root.setAttribute("aria-busy", String(value)); root.querySelectorAll("input,select,textarea,button").forEach(input => { input.disabled = value || input.dataset.maintenanceReadonly === "true" || (unresolved && !input.matches("[data-maintenance-save]")); }); };
    const invalidate = () => { pending = null; const dialog = $("[data-maintenance-preview-box]"); if (dialog?.open) dialog.close(); dialog?.remove(); };

    const editorFingerprint = () => JSON.stringify([...editor.querySelectorAll("input,select,textarea")].map(input => [input.value, input.type === "checkbox" ? input.checked : null]));
    const canLeaveSelection = () => !context || editorFingerprint() === editorBaseline || globalThis.confirm(maintenanceText("Ungespeicherte Änderungen verwerfen und ein anderes Event suchen?"));
    function resetEditor() {
      ++selectionSequence;
      invalidate(); context = null; selectedId = null; action = "correct";
      lastReceipt = null; lastKnowledgeRequest = null; initialSourceUrl = "";
      touched = new Set(); formatsDirty = false; formatConflict = false;
      knowledgeScope = "edition"; knowledgeTouched = new Set(); knowledgeConflict = false;
      editor.innerHTML = ""; editorBaseline = "";
      $("[data-maintenance-publication]").innerHTML = "";
    }
    function closeSearch() {
      if (busy || unresolved || !canLeaveSelection()) return;
      ++searchSequence; resetEditor();
      $("[data-maintenance-results]").innerHTML = "";
      $("[data-maintenance-search]").value = "";
      $("[data-maintenance-close]").hidden = true;
      status(maintenanceText("Suche geschlossen. Du kannst jetzt ein anderes Event suchen."));
      $("[data-maintenance-search]").focus();
    }

    const currentKnowledge = () => action === "create" ? {} : knowledgeRecord(context, knowledgeScope, selectedId);
    const knowledgeDirty = () => knowledgeTouched.size || $("[data-knowledge-confirm]:checked,[data-knowledge-clear]:checked,[data-knowledge-remove]:checked");
    function knowledgeControl(section, [key, label, type = "textarea"]) {
      const path = `${section}.${key}`, value = knowledgeValue(currentKnowledge(), path) ?? "";
      const id = `maintenance-knowledge-${section}-${key}`, common = `id="${id}" data-knowledge-field="${path}"`;
      let control;
      if (type === "tiers" || type === "cutoffs") {
        const rows = Array.isArray(value) ? value : [];
        control = `${value && !Array.isArray(value) ? "<p><span data-i18n-text=\"Der vorhandene Text bleibt erhalten, solange keine neuen Zeilen gespeichert werden.\">Der vorhandene Text bleibt erhalten, solange keine neuen Zeilen gespeichert werden.</span></p><p>" + escape(String(value)) + '</p>' : ''}<div data-knowledge-rows="${path}">${rows.map((row, index) => knowledgeArrayRow(path, row, index)).join("")}</div><button type="button" data-knowledge-add="${path}">${type === "tiers" ? maintenanceText("Gebührenstufe hinzufügen") : maintenanceText("Zwischenzeitlimit hinzufügen")}</button>`;
      } else if (type === "boolean") control = `<select ${common}><option value="" data-i18n-text="Nicht angegeben">Nicht angegeben</option><option value="true" ${value === true ? "selected" : ""} data-i18n-text="Ja">Ja</option><option value="false" ${value === false ? "selected" : ""} data-i18n-text="Nein">Nein</option></select>`;
      else if (type === "date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) control = `<input ${common} type="text" value="${escape(value)}" placeholder="JJJJ-MM-TT; vorhandene Quellenangabe erhalten" data-i18n-placeholder-text="JJJJ-MM-TT; vorhandene Quellenangabe erhalten">`;
      else if (type === "date" || type === "url") control = `<input ${common} type="${type}" value="${escape(value)}">`;
      else control = `<textarea ${common} rows="2" maxlength="4000">${escape(value)}</textarea>`;
      return `<div class="maintenance-field"><label for="${id}">${maintenanceLabel(label)}</label>${control}<div class="maintenance-field-actions">${value !== "" ? `<label><input type="checkbox" data-knowledge-clear="${path}"> <span data-i18n-text="Zusatzangabe bewusst entfernen">Zusatzangabe bewusst entfernen</span></label>` : ""}</div></div>`;
    }
    function knowledgeArrayRow(path, row, index) {
      const specs = path.endsWith("price_tiers") ? [["tier", maintenanceText("Wettbewerb / Gebührenstufe")], ["price", maintenanceText("Betrag")], ["currency", maintenanceText("Währung (z. B. EUR)")], ["until", maintenanceText("Gültig bis / Kontingent")], ["note", maintenanceText("Bedingung / Hinweis")]] : [["point", maintenanceText("Streckenpunkt / Abschnitt")], ["time", maintenanceText("Zeitlimit (z. B. 2:30 h)")]];
      return `<div class="maintenance-format" data-knowledge-row="${index}" data-knowledge-array="${path}">${specs.map(([key, label]) => `<label>${maintenanceLabel(label)}<input data-knowledge-cell="${key}" type="text" ${key === "price" ? 'inputmode="decimal"' : ''} value="${escape(row?.[key] ?? (key === "tier" ? row?.name : key === "price" ? row?.fee : "") ?? "")}" maxlength="${key === "note" ? "1000" : "500"}"></label>`).join("")}<label><input type="checkbox" data-knowledge-remove> <span data-i18n-text="Zeile bewusst entfernen">Zeile bewusst entfernen</span></label></div>`;
    }
    function faqRow(row) {
      const id = row.id || globalThis.crypto.randomUUID();
      return `<div class="maintenance-format" data-knowledge-faq="${escape(id)}"><label><span data-i18n-text="Frage">Frage</span><input data-knowledge-question value="${escape(row.question || "")}" maxlength="500"></label><label><span data-i18n-text="Antwort">Antwort</span><textarea data-knowledge-answer rows="3" maxlength="4000">${escape(row.answer || "")}</textarea></label><label><input type="checkbox" data-knowledge-remove> <span data-i18n-text="Frage bewusst entfernen">Frage bewusst entfernen</span></label></div>`;
    }
    function renderKnowledge() {
      const holder = $("[data-maintenance-knowledge]");
      if (!holder) return;
      if (action === "create") { holder.innerHTML = "<p class=\"maintenance-help\"><span data-i18n-text=\"Zusatzdetails nach dem Anlegen an der neuen Ausgabe ergänzen. Jahresangaben und Prüfungen werden nicht aus der vorherigen Ausgabe übernommen.\">Zusatzdetails nach dem Anlegen an der neuen Ausgabe ergänzen. Jahresangaben und Prüfungen werden nicht aus der vorherigen Ausgabe übernommen.</span></p>"; return; }
      const record = currentKnowledge();
      holder.innerHTML = `<details class="admin-secondary-details"><summary><span data-i18n-text="Zusatzdetails für Detailseite und Event-Wiki">Zusatzdetails für Detailseite und Event-Wiki</span></summary><p><span data-i18n-text="Deine geänderten Zusatzangaben werden gemeinsam manuell freigegeben. Unbearbeitete Felder bleiben erhalten. Eine leere bearbeitete Angabe wird entfernt. Datum, Startzeit, Distanzen und Gebührenrahmen stehen weiterhin im Kernformular.">Deine geänderten Zusatzangaben werden gemeinsam manuell freigegeben. Unbearbeitete Felder bleiben erhalten. Eine leere bearbeitete Angabe wird entfernt. Datum, Startzeit, Distanzen und Gebührenrahmen stehen weiterhin im Kernformular.</span></p><label><span data-i18n-text="Geltungsbereich der Zusatzdetails">Geltungsbereich der Zusatzdetails</span><select data-knowledge-scope><option value="edition" data-maintenance-scope-edition ${knowledgeScope === "edition" ? "selected" : ""}>${escape(maintenanceText("Nur diese Ausgabe ("))}${escape(selected()?.edition_year)})</option><option value="brand" ${knowledgeScope === "brand" ? "selected" : ""} data-i18n-text="Allgemeines Event-Wiki – alle Ausgaben">Allgemeines Event-Wiki – alle Ausgaben</option></select></label><p class="maintenance-help"><span data-i18n-text="Gebührenstaffeln, Startwellen und konkrete Streckenangaben gelten ausschließlich für die gewählte Ausgabe. Allgemeine Wiki-Angaben enthalten keine jahresabhängigen Termine oder Preise. Die Freigabe und alte/neue Werte werden protokolliert. Vorhandene Quellen bleiben erhalten; eine manuelle Freigabe ist keine neue externe Quellenprüfung.">Gebührenstaffeln, Startwellen und konkrete Streckenangaben gelten ausschließlich für die gewählte Ausgabe. Allgemeine Wiki-Angaben enthalten keine jahresabhängigen Termine oder Preise. Die Freigabe und alte/neue Werte werden protokolliert. Vorhandene Quellen bleiben erhalten; eine manuelle Freigabe ist keine neue externe Quellenprüfung.</span></p>${Object.entries(KNOWLEDGE_GROUPS).filter(([section]) => knowledgeScope !== "brand" || BRAND_KNOWLEDGE_GROUPS.includes(section)).map(([section, [label, fields]]) => `<details class="admin-secondary-details" data-knowledge-section="${section}"><summary>${maintenanceLabel(label)}</summary><div class="maintenance-grid">${fields.map(spec => knowledgeControl(section, spec)).join("")}</div></details>`).join("")}<details class="admin-secondary-details" data-knowledge-section="faq"><summary><span data-i18n-text="Häufige Fragen">Häufige Fragen</span></summary><div data-knowledge-faq-rows>${(record.faq || []).map(faqRow).join("")}</div><button type="button" data-knowledge-add-faq><span data-i18n-text="Frage hinzufügen">Frage hinzufügen</span></button></details></details>`;
    }
    function collectKnowledge(sourceUrl) {
      if (!knowledgeDirty()) return null;
      if (knowledgeConflict) throw new Error(maintenanceText("Die Zusatzdetails wurden zwischenzeitlich geändert. Bitte den aktuellen Formularstand übernehmen und die Zusatzdetails erneut bearbeiten."));
      const record = currentKnowledge(), values = {};
      root.querySelectorAll("[data-knowledge-field]").forEach(input => {
        const value = input.value.trim();
        values[input.dataset.knowledgeField] = input.tagName === "SELECT" && value !== "" ? value === "true" : value;
      });
      root.querySelectorAll("[data-knowledge-rows]").forEach(holder => {
        const path = holder.dataset.knowledgeRows;
        if (!knowledgeTouched.has(path)) return;
        const original = knowledgeValue(record, path);
        values[path] = [...holder.querySelectorAll("[data-knowledge-row]")].filter(row => !row.querySelector("[data-knowledge-remove]").checked).flatMap(row => {
          const before = Array.isArray(original) ? original[Number(row.dataset.knowledgeRow)] : null;
          const next = before && typeof before === "object" ? clone(before) : {};
          row.querySelectorAll("[data-knowledge-cell]").forEach(input => {
            const key = input.dataset.knowledgeCell;
            if (input.value.trim()) next[key] = input.value.trim();
            else delete next[key];
          });
          if (!Object.keys(next).length) return [];
          if (path.endsWith("price_tiers") && (!next.tier || next.price === undefined || next.price === "")) throw new Error(maintenanceText("Jede Gebührenstufe braucht eine Bezeichnung und einen Betrag. Unbekannte Gebühren bitte noch nicht als Stufe hinzufügen."));
          if (path.endsWith("intermediate_cutoffs") && (!next.point || !next.time)) throw new Error(maintenanceText("Jedes Zwischenzeitlimit braucht einen Streckenpunkt und ein Zeitlimit."));
          return [next];
        });
      });
      let clear = [...root.querySelectorAll("[data-knowledge-clear]:checked")].map(input => input.dataset.knowledgeClear);
      for (const path of knowledgeTouched) if (values[path] === "" && knowledgeValue(record, path) != null && knowledgeValue(record, path) !== "") clear.push(path);
      for (const [path, value] of Object.entries(values)) if (Array.isArray(value) && !value.length && Array.isArray(knowledgeValue(record, path)) && knowledgeValue(record, path).length) clear.push(path);
      clear = [...new Set(clear)];
      const patch = buildKnowledgePatch(record, values, knowledgeTouched, clear, knowledgeScope);
      const faqUpserts = [], faqRemove = [];
      root.querySelectorAll("[data-knowledge-faq]").forEach((row, index) => {
        const id = row.dataset.knowledgeFaq, prior = (record.faq || []).find(item => item.id === id);
        if (row.querySelector("[data-knowledge-remove]").checked) { if (prior) faqRemove.push(id); return; }
        const next = { id, question: row.querySelector("[data-knowledge-question]").value.trim(), answer: row.querySelector("[data-knowledge-answer]").value.trim(), sort_order: prior?.sort_order ?? (index + 1) * 10 };
        if (!next.question && !next.answer) return;
        if (!next.question || !next.answer) throw new Error(maintenanceText("Bitte Frage und Antwort ergänzen oder die unvollständige Frage bewusst entfernen."));
        if (!prior || next.question !== prior.question || next.answer !== prior.answer) faqUpserts.push(next);
      });
      const confirmations = [...root.querySelectorAll("[data-knowledge-confirm]:checked")].filter(input => !input.closest('[data-knowledge-faq]')?.querySelector('[data-knowledge-remove]')?.checked).map(input => ({ field: input.dataset.knowledgeConfirm, source_url: sourceUrl }));
      for (const { field } of confirmations) if (clear.includes(field) || (field.startsWith("faq.") && faqRemove.includes(field.slice(4)))) throw new Error(maintenanceText("Eine bewusst entfernte Zusatzangabe kann nicht zugleich bestätigt werden."));
      if (!Object.keys(patch).length && !clear.length && !confirmations.length && !faqUpserts.length && !faqRemove.length) return null;
      return { scope: knowledgeScope, patch, clear_fields: clear, confirmations, faq_upserts: faqUpserts, faq_remove: faqRemove };
    }

    function field([path, label, type]) {
      const [scope, name] = path.split(".");
      const value = values()[scope][name] ?? "";
      let control;
      const lists = { sport: [["Running", maintenanceText("Laufen")], ["Trail Running", maintenanceText("Trailrunning")], ["Ultra Running", maintenanceText("Ultralauf")], ["Triathlon", "Triathlon"]], editionStatus: ["date_unconfirmed", "scheduled", "postponed", "cancelled", "completed", "inactive"].map(key => [key, STATUS[key]]), registrationStatus: ["unknown", "registration_not_open", "registration_open", "sold_out", "cancelled"].map(key => [key, key === "cancelled" ? maintenanceText("Anmeldung abgesagt") : STATUS[key]]) };
      const common = `data-maintenance-field="${path}" id="maintenance-${scope}-${name}"${action === "create" && scope === "event" ? ' disabled data-maintenance-readonly="true"' : ""}`;
      if (lists[type]) {
        const options = lists[type];
        if (value && !options.some(([key]) => key === value)) options.push([value, value, true]);
        control = `<select ${common}><option value="" data-i18n-text="Nicht angegeben">Nicht angegeben</option>${options.map(([key, text, custom]) => `<option value="${escape(key)}" ${key === value ? "selected" : ""} ${custom ? "" : `data-i18n-text="${escape(text)}"`}>${escape(custom ? text : maintenanceText(text))}</option>`).join("")}</select>`;
      } else if (type === "textarea") control = `<textarea ${common} rows="3">${escape(value)}</textarea>`;
      else control = `<input ${common} type="${type}" value="${escape(value)}" ${type === "number" ? `step="${name === "participant_limit" ? "1" : "any"}"` : ""}>`;
      const clearAllowed = !["canonical_name", "sport", "city", "country", "registration_status", "edition_status"].includes(name) && !(action === "create" && scope === "event");
      return `<div class="maintenance-field"><label for="maintenance-${scope}-${name}">${maintenanceLabel(label)}${scope === "event" ? " <small><span data-i18n-text=\"(alle Ausgaben)\">(alle Ausgaben)</span></small>" : ""}</label>${control}<div class="maintenance-field-actions">${value !== "" && clearAllowed ? `<label><input type="checkbox" data-maintenance-clear="${path}"> <span data-i18n-text="Bewusst entfernen">Bewusst entfernen</span></label>` : ""}</div></div>`;
    }

    function renderFormats() {
      const original = values().edition.race_formats || [];
      $("[data-maintenance-formats]").innerHTML = original.map((row, index) => formatRow(row, index)).join("");
    }

    function formatRow(row, index) {
      const summary = FORMAT_DETAILS.filter(([key]) => row[key] != null).map(([key, label, unit]) => `${maintenanceLabel(label)}: ${escape(row[key])} ${unit}`).join(" · ");
      return `<div class="maintenance-format" data-maintenance-format="${index}"><label><span data-i18n-text="Wettbewerb">Wettbewerb</span><input data-format-label value="${escape(row.label || "")}" placeholder="z. B. Halbmarathon / Staffel" data-i18n-placeholder-text="z. B. Halbmarathon / Staffel"></label><label><span data-i18n-text="Distanz (km)">Distanz (km)</span><input data-format-distance type="number" step="any" min="0" value="${escape(row.distance_km ?? "")}" placeholder="unbekannt" data-i18n-placeholder-text="unbekannt"></label><details class="maintenance-format-details"><summary><span data-i18n-text="Teilabschnitte und Höhenmeter">Teilabschnitte und Höhenmeter</span>${summary ? `<small>${summary}</small>` : ""}</summary><div class="maintenance-grid">${FORMAT_DETAILS.map(([key, label, unit]) => `<div class="maintenance-field"><label>${maintenanceLabel(label)} (${unit})<input data-format-detail="${key}" type="number" min="0" step="any" value="${escape(row[key] ?? "")}" placeholder="unbekannt" data-i18n-placeholder-text="unbekannt"></label>${row[key] != null ? `<label><input type="checkbox" data-format-clear="${key}"> ${maintenanceLabel(label)} <span data-i18n-text="bewusst entfernen">bewusst entfernen</span></label>` : ""}</div>`).join("")}</div></details><div class="maintenance-format-options"><label><input data-format-remove type="checkbox"> <span data-i18n-text="Wettbewerb bewusst entfernen">Wettbewerb bewusst entfernen</span></label>${row.distance_km != null ? `<label><input data-format-clear-distance type="checkbox"> <span data-i18n-text="Distanz bewusst entfernen">Distanz bewusst entfernen</span></label>` : ""}</div></div>`;
    }

    function verificationHistory() {
      if (action === "create") return "";
      const entries = (context.verifications || []).filter(entry => String(entry.entity_id) === String(selectedId));
      if (!entries.length) return "<p class=\"maintenance-help\"><span data-i18n-text=\"Noch keine manuellen Einzelprüfungen über diesen Pflegeweg protokolliert.\">Noch keine manuellen Einzelprüfungen über diesen Pflegeweg protokolliert.</span></p>";
      return `<details class="admin-secondary-details maintenance-history"><summary><span data-i18n-text="Letzte manuelle Prüfungen und Quellenhinweise">Letzte manuelle Prüfungen und Quellenhinweise</span></summary><ul>${entries.map(entry => {
        const evidence = entry.new_value || {};
        const [scope, key] = (evidence.field || "").split(".");
        const currentValue = scope ? values()[scope]?.[key] : undefined;
        const title = evidence.field ? `${LABELS[evidence.field] || maintenanceText("Angabe")}: ${equal(evidence.value, currentValue) ? maintenanceText("Wert entspricht der letzten Prüfung") : maintenanceText("Wert seit der Prüfung geändert")}` : evidence.result === "no_new_edition" ? maintenanceText("Keine neue Ausgabe angekündigt") : evidence.result === "unreachable" ? maintenanceText("Quelle nicht erreichbar – keine Bestätigung") : maintenanceText("Quellenprüfung protokolliert");
        const time = new Date(evidence.checked_at || entry.created_at);
        const date = Number.isNaN(time.getTime()) ? maintenanceText("Zeitpunkt nicht verfügbar") : time.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
        const source = safeUrl(evidence.source_url || entry.source_url);
        return `<li><strong>${escape(title)}</strong><p><span data-i18n-text="Adminprüfung ·">Adminprüfung ·</span> ${escape(date)}</p>${entry.reason ? `<p>${escape(entry.reason)}</p>` : ""}${source ? `<a href="${escape(source)}" target="_blank" rel="noopener noreferrer"><span data-i18n-text="Geprüfte Quelle öffnen ↗">Geprüfte Quelle öffnen ↗</span></a>` : ""}</li>`;
      }).join("")}</ul></details>`;
    }

    function reviewItems() {
      if (action === "create") return "";
      const edition = selected();
      const inScope = row => !row.review_edition_id && !row.edition_id || (row.review_edition_id || row.edition_id) === selectedId;
      const proposalLabel = row => LABELS[`${row.entity_type === "event" ? "event" : "edition"}.${row.field_name}`] || LABELS[`event.${row.field_name}`] || LABELS[`edition.${row.field_name}`] || maintenanceText("Weitere Veranstaltungsangabe");
      const rows = [];
      for (const feedback of (context.feedback || []).filter(inScope)) rows.push({ kind: "feedback", id: feedback.id, title: maintenanceText("Gemeldete fehlerhafte Eventangaben"), description: feedback.message || feedback.description || maintenanceText("Nutzerhinweis prüfen und die betroffenen Angaben gegebenenfalls korrigieren. Dieser Hinweis betrifft die gemeinsame Veranstaltung."), options: [["resolved", maintenanceText("Geprüft und behoben")], ["rejected", maintenanceText("Geprüft: Hinweis trifft nicht zu")]] });
      for (const issue of (context.validation_issues || []).filter(inScope)) rows.push({ kind: "validation_issue", id: issue.id, title: issue.message || issue.title || maintenanceText("Datenprüfung offen"), description: issue.description || maintenanceText("Die betroffenen Angaben im Formular korrigieren. Einen unzutreffenden oder bereits behobenen Hinweis erst nach Prüfung begründet schließen."), options: [["resolved", maintenanceText("Geprüft: Hinweis behoben oder nicht zutreffend")]] });
      for (const alert of (context.data_alerts || []).filter(inScope)) rows.push({ kind: "data_alert", id: alert.id, title: alert.title || maintenanceText("Offener Datenhinweis"), description: alert.message || alert.description || maintenanceText("Ursache prüfen und gegebenenfalls Angaben korrigieren, bevor der Hinweis geschlossen wird."), options: [["resolved", maintenanceText("Geprüft: Ursache behoben")]] });
      for (const proposal of (context.proposals || []).filter(inScope)) rows.push({ kind: "proposal", id: proposal.id, title: `${maintenanceText("Automatischer Änderungsvorschlag: ")}${proposalLabel(proposal)}`, description: `${maintenanceText("Bisher: ")}${display(proposal.old_value)}${maintenanceText(" · Vorschlag: ")}${display(proposal.normalized_value ?? proposal.proposed_value)}`, source: proposal.source_url, options: [["rejected", maintenanceText("Vorschlag ablehnen; gespeicherten Wert behalten")], ["accepted", maintenanceText("Vorgeschlagenen Wert übernehmen")]] });
      for (const task of (context.review_tasks || []).filter(inScope).filter(row => row.task_type !== "new_edition_candidate")) rows.push({ kind: "source_task", id: task.id, title: task.title || maintenanceText("Offene Quellenprüfung"), description: task.description || maintenanceText("Quelle erneut prüfen und das Ergebnis begründen."), source: (context.sources || []).find(row => row.id === task.source_id)?.source_url, options: [["resolved", maintenanceText("Quelle geprüft; Problem behoben")], ["ignored", maintenanceText("Hinweis nach Prüfung nicht zutreffend")]] });
      for (const candidate of (context.candidates || []).filter(row => row.draft_edition_id === selectedId && (row.candidate_status === "conflict" || row.validation_status === "conflict"))) {
        const range = candidate.candidate_start_date >= edition.start_date && candidate.candidate_start_date <= (edition.end_date || edition.start_date);
        rows.push({ kind: range ? "candidate_range" : "candidate_dates", id: candidate.id, title: maintenanceText("Abweichender Termin der erkannten Ausgabe"), description: `${maintenanceText("Automatisch beobachtet: ")}${candidate.candidate_start_date || maintenanceText("Termin offen")}${candidate.candidate_end_date ? `${maintenanceText(" bis ")}${candidate.candidate_end_date}` : ""}${maintenanceText(". Gespeicherte Ausgabe: ")}${edition.start_date || maintenanceText("Termin offen")}${edition.end_date ? `${maintenanceText(" bis ")}${edition.end_date}` : ""}${maintenanceText(". Erst Datum und Enddatum im Formular anhand der offiziellen Quelle bestätigen und speichern. Danach die Abweichung hier mit Begründung klären. Die ursprüngliche Beobachtung bleibt im Verlauf erhalten.")}`, source: edition.source_url, options: [["confirmed", range ? maintenanceText("Beobachteter Tag gehört zum bestätigten Zeitraum") : maintenanceText("Offizielle Termine der gespeicherten Ausgabe sind maßgeblich")]] });
      }
      if (!rows.length) return "<p class=\"maintenance-help\"><span data-i18n-text=\"Keine offenen Änderungsvorschläge oder Quellenaufgaben für diese Ausgabe.\">Keine offenen Änderungsvorschläge oder Quellenaufgaben für diese Ausgabe.</span></p>";
      return `<details class="admin-secondary-details" open><summary><span data-i18n-text="Offene Hinweise hier bearbeiten (">Offene Hinweise hier bearbeiten (</span>${rows.length})</summary><p><span data-i18n-text="Jede Entscheidung wird einzeln mit deinem Admin-Konto protokolliert. Sie ersetzt keine gezielte Feldprüfung. Zum Korrigieren eines falschen Vorschlags zuerst die richtigen Angaben im Formular speichern und anschließend den Vorschlag begründet ablehnen.">Jede Entscheidung wird einzeln mit deinem Admin-Konto protokolliert. Sie ersetzt keine gezielte Feldprüfung. Zum Korrigieren eines falschen Vorschlags zuerst die richtigen Angaben im Formular speichern und anschließend den Vorschlag begründet ablehnen.</span></p>${rows.map(row => `<section class="maintenance-notice" data-maintenance-review-row="${escape(row.id)}" data-maintenance-review-kind="${row.kind}"><h4>${escape(row.title)}</h4><p>${escape(row.description)}</p>${safeUrl(row.source) ? `<a href="${escape(safeUrl(row.source))}" target="_blank" rel="noopener noreferrer"><span data-i18n-text="Zugehörige Quelle öffnen ↗">Zugehörige Quelle öffnen ↗</span></a>` : ""}<label><span data-i18n-text="Entscheidung">Entscheidung</span><select data-maintenance-review-decision>${row.options.map(([key, label]) => `<option value="${key}" data-i18n-text="${escape(label)}">${escape(maintenanceText(label))}</option>`).join("")}</select></label>${row.kind.startsWith("candidate_") ? `<label><span data-i18n-text="Geprüfte offizielle Quellen-URL">Geprüfte offizielle Quellen-URL</span><input data-maintenance-review-source type="url" value="${escape(row.source || "")}"></label>` : ""}<label><span data-i18n-text="Begründung der Entscheidung">Begründung der Entscheidung</span><textarea data-maintenance-review-notes rows="2" minlength="20" placeholder="Was hast du geprüft und warum ist diese Entscheidung richtig?" data-i18n-placeholder-text="Was hast du geprüft und warum ist diese Entscheidung richtig?"></textarea></label><button type="button" data-maintenance-review-preview><span data-i18n-text="Entscheidung prüfen">Entscheidung prüfen</span></button></section>`).join("")}</details>`;
    }

    function previewReview(row) {
      try {
        if (touched.size || formatsDirty || knowledgeDirty() || root.querySelector("[data-maintenance-confirm]:checked,[data-maintenance-clear]:checked") || $("[data-maintenance-notes]")?.value.trim() || $("[data-maintenance-publish]")?.checked) throw new Error(maintenanceText("Bitte deine Formularänderungen und Feldprüfungen zuerst speichern. Danach die offene Entscheidung bearbeiten."));
        const notes = row.querySelector("[data-maintenance-review-notes]").value.trim();
        if (notes.length < 20) throw new Error(maintenanceText("Bitte die Entscheidung mit mindestens 20 Zeichen nachvollziehbar begründen."));
        const kind = row.dataset.maintenanceReviewKind;
        const review = { kind, id: row.dataset.maintenanceReviewRow };
        const decision = row.querySelector("[data-maintenance-review-decision]");
        if (kind.startsWith("candidate_")) Object.assign(review, { confirmed_start_date: selected().start_date, confirmed_end_date: selected().end_date });
        else review.decision = decision.value;
        const sourceUrl = row.querySelector("[data-maintenance-review-source]")?.value.trim() || selected().source_url;
        if (kind.startsWith("candidate_") && !safeUrl(sourceUrl)) throw new Error(maintenanceText("Bitte die offizielle Quelle der bestätigten Termine angeben."));
        invalidate();
        pending = { request_id: globalThis.crypto.randomUUID(), action: "review", event_id: context.event.id, edition_id: selectedId, expected_version: context.version, event_patch: {}, edition_patch: {}, clear_fields: [], confirmations: [], source_url: sourceUrl, source_result: "confirmed", notes, publish: false, review };
        const box = document.createElement("section"); box.dataset.maintenancePreviewBox = ""; box.className = "maintenance-preview"; box.tabIndex = -1;
        box.innerHTML = `<h4><span data-i18n-text="Entscheidung vor dem Speichern prüfen">Entscheidung vor dem Speichern prüfen</span></h4><p>${escape(row.querySelector("h4").textContent)}</p><p>${escape(row.querySelector("p").textContent)}</p><p><strong>${escape(decision.selectedOptions[0].textContent)}</strong></p><p>${escape(notes)}</p><p><span data-i18n-text="Diese Entscheidung erzeugt keine neue Feldbestätigung und veröffentlicht keinen Entwurf.">Diese Entscheidung erzeugt keine neue Feldbestätigung und veröffentlicht keinen Entwurf.</span></p><button type="button" data-maintenance-save><span data-i18n-text="Verbindlich speichern">Verbindlich speichern</span></button><button type="button" data-maintenance-back><span data-i18n-text="Weiter bearbeiten">Weiter bearbeiten</span></button>`;
        row.appendChild(box); box.focus(); status(maintenanceText("Entscheidung bereit. Noch nichts gespeichert."));
      } catch (error) { status(error.message, true); }
    }

    function renderEditor() {
      const edition = selected() || {};
      if (!selected()) action = "create";
      touched = new Set(); formatsDirty = false; formatConflict = false; pending = null;
      knowledgeTouched = new Set(); knowledgeConflict = false;
      const officialSources = (context.sources || []).filter(item => ["official_event_website", "official_registration_platform"].includes(item.source_type) && item.is_active);
      const source = officialSources.find(item => item.edition_id === edition.id && item.source_url === edition.source_url)
        || officialSources.find(item => item.edition_id === edition.id && item.source_type === "official_event_website")
        || officialSources.find(item => !item.edition_id && item.source_type === "official_event_website");
      const sourceUrl = action === "create" ? "" : edition.source_url || source?.source_url || context.event.official_url || "";
      initialSourceUrl = sourceUrl;
      const warnings = [];
      if (edition.publication_status === "draft") warnings.push(maintenanceText("Diese Ausgabe ist ein privater Entwurf. Nach deiner Bestätigung wird die zulässige Veröffentlichung automatisch geprüft."));
      if (edition.needs_review) warnings.push(maintenanceText("Für diese Ausgabe ist eine Prüfung offen."));
      if (edition.next_check_at && Date.parse(edition.next_check_at) <= Date.now()) warnings.push(maintenanceText("Die nächste Quellenprüfung ist fällig."));
      if (!edition.start_date) warnings.push(maintenanceText("Der Termin ist unbekannt. Ein Entwurf darf ohne Datum gespeichert werden."));
      if (action === "create") warnings.push(maintenanceText("Neue Ausgabe: Stammdaten der Veranstaltung bleiben als ungeprüfte Vorlage sichtbar. Termin, Anmeldung, Wettbewerbe und Prüfungen werden nicht aus der alten Ausgabe übernommen."));
      const candidates = (context.candidates || []).filter(candidate => !["rejected", "superseded", "approved"].includes(candidate.candidate_status));
      editor.innerHTML = `<div class="maintenance-selection"><label><span data-i18n-text="Ausgabe auswählen">Ausgabe auswählen</span><select data-maintenance-edition>${context.editions.map(row => `<option data-maintenance-edition-label="${escape(row.id)}" value="${escape(row.id)}" ${row.id === selectedId ? "selected" : ""}>${escape(`${row.edition_year} · ${row.start_date || maintenanceText("Termin offen")}${row.edition_key && row.edition_key !== "main" ? ` · ${row.edition_key}` : ""} · ${row.publication_status === "draft" ? maintenanceText("Entwurf") : maintenanceText("Veröffentlicht")}`)}</option>`).join("")}</select></label><label><span data-i18n-text="Was möchtest du tun?">Was möchtest du tun?</span><select data-maintenance-action><option value="correct" ${action === "correct" ? "selected" : ""} data-i18n-text="Bestehende Ausgabe korrigieren">Bestehende Ausgabe korrigieren</option><option value="create" ${action === "create" ? "selected" : ""} data-i18n-text="Neue Edition anlegen">Neue Edition anlegen</option></select></label></div>
        <h4>${escape(context.event.canonical_name || context.event.event_name)}</h4>
        ${verificationHistory()}
        ${warnings.length ? `<ul class="maintenance-notice">${warnings.map(item => `<li>${escape(item)}</li>`).join("")}</ul>` : ""}
        ${candidates.length ? `<div class="maintenance-notice">${candidates.length} <span data-i18n-text="bereits erkannte Ausgabe(n). Vorhandene Entwürfe oben auswählen; weitere erkannte Ausgaben lassen sich über „Neue Edition anlegen“ weiterbearbeiten. So bleibt die vorhandene Editionsidentität erhalten.">bereits erkannte Ausgabe(n). Vorhandene Entwürfe oben auswählen; weitere erkannte Ausgaben lassen sich über „Neue Edition anlegen“ weiterbearbeiten. So bleibt die vorhandene Editionsidentität erhalten.</span></div>` : ""}
        <form data-maintenance-form novalidate>
          ${action === "create" ? `<div class="maintenance-grid"><div class="maintenance-field"><label for="maintenance-edition-edition_year"><span data-i18n-text="Ausgabejahr (erforderlich)">Ausgabejahr (erforderlich)</span></label><input id="maintenance-edition-edition_year" data-maintenance-field="edition.edition_year" type="number" min="2000" max="2200" step="1"></div><div class="maintenance-field"><label for="maintenance-edition-edition_key"><span data-i18n-text="Ausgabekürzel bei mehreren Ausgaben pro Jahr">Ausgabekürzel bei mehreren Ausgaben pro Jahr</span></label><input id="maintenance-edition-edition_key" data-maintenance-field="edition.edition_key" value="main" maxlength="48"><small><span data-i18n-text="Für eine weitere Ausgabe z. B. „herbst“ statt „main“. Jahr und Kürzel identifizieren diese Ausgabe.">Für eine weitere Ausgabe z. B. „herbst“ statt „main“. Jahr und Kürzel identifizieren diese Ausgabe.</span></small></div></div>${candidates.some(row => !row.draft_edition_id) ? `<label><span data-i18n-text="Bereits erkannte Ausgabe weiterbearbeiten">Bereits erkannte Ausgabe weiterbearbeiten</span><select data-maintenance-candidate><option value="" data-i18n-text="Neue, noch nicht erkannte Ausgabe">Neue, noch nicht erkannte Ausgabe</option>${candidates.filter(row => !row.draft_edition_id).map(row => `<option value="${escape(row.id)}">${escape(`${row.candidate_year} · ${row.candidate_start_date || maintenanceText("Termin offen")}`)}</option>`).join("")}</select></label><p class="maintenance-help"><span data-i18n-text="Bei Auswahl werden nur die bereits beobachteten Kandidatenangaben als ungeprüfte Vorlage eingesetzt.">Bei Auswahl werden nur die bereits beobachteten Kandidatenangaben als ungeprüfte Vorlage eingesetzt.</span></p>` : ""}` : `<p class="maintenance-help"><span data-i18n-text="Ausgabejahr:">Ausgabejahr:</span> ${escape(edition.edition_year)}<span data-i18n-text=". Eine Korrektur erhält die bestehende Ausgabe und ihre Saisonplaner- und Ergebnisverknüpfungen.">. Eine Korrektur erhält die bestehende Ausgabe und ihre Saisonplaner- und Ergebnisverknüpfungen.</span></p>`}
          <p class="maintenance-help"><span data-i18n-text="Name, Ort, Sport und die optionalen Veranstalterangaben gehören zur gemeinsamen Veranstaltung und gelten für alle Ausgaben. Die gemeinsame Bestätigung gibt nur deine tatsächlichen Änderungen frei; sie bestätigt keine neue externe Quellenprüfung.">Name, Ort, Sport und die optionalen Veranstalterangaben gehören zur gemeinsamen Veranstaltung und gelten für alle Ausgaben. Die gemeinsame Bestätigung gibt nur deine tatsächlichen Änderungen frei; sie bestätigt keine neue externe Quellenprüfung.</span></p>
          <div class="maintenance-grid">${FIELDS.filter(row => !row[3]).map(field).join("")}</div>
          <fieldset class="maintenance-formats"><legend><span data-i18n-text="Wettbewerbe / Distanzen">Wettbewerbe / Distanzen</span></legend><p class="maintenance-help"><span data-i18n-text="Je Wettbewerb eine Zeile: Bezeichnung und Kilometer getrennt eintragen. Die öffentliche Seite sortiert nach Distanz; verschiedene Wettbewerbe mit derselben Distanz bleiben getrennt. Weitere vorhandene Wettbewerbsdetails bleiben erhalten. Unbekannte Distanzen dürfen leer bleiben.">Je Wettbewerb eine Zeile: Bezeichnung und Kilometer getrennt eintragen. Die öffentliche Seite sortiert nach Distanz; verschiedene Wettbewerbe mit derselben Distanz bleiben getrennt. Weitere vorhandene Wettbewerbsdetails bleiben erhalten. Unbekannte Distanzen dürfen leer bleiben.</span></p><div data-maintenance-formats></div><button type="button" data-maintenance-add-format><span data-i18n-text="Wettbewerb hinzufügen">Wettbewerb hinzufügen</span></button></fieldset>
          <details class="admin-secondary-details"><summary><span data-i18n-text="Optionale Details und Veranstalterangaben">Optionale Details und Veranstalterangaben</span></summary><div class="maintenance-grid">${FIELDS.filter(row => row[3]).map(field).join("")}</div></details>
          <div data-maintenance-knowledge></div>
          <fieldset class="maintenance-evidence"><legend><span data-i18n-text="Änderungsnotiz (optional)">Änderungsnotiz (optional)</span></legend><a data-maintenance-open-source class="maintenance-source" target="_blank" rel="noopener noreferrer" ${safeUrl(sourceUrl) ? `href="${escape(safeUrl(sourceUrl))}"` : "hidden"}><span data-i18n-text="Vorhandene offizielle Quelle öffnen ↗">Vorhandene offizielle Quelle öffnen ↗</span></a><label><span data-i18n-text="Notiz">Notiz</span><textarea data-maintenance-notes rows="2" maxlength="1000" placeholder="Optional: Warum wird die Angabe korrigiert?" data-i18n-placeholder-text="Optional: Warum wird die Angabe korrigiert?"></textarea></label><p class="maintenance-help"><span data-i18n-text="Die Änderung wird mit deinem Admin-Konto, Zeitpunkt sowie alten und neuen Werten protokolliert. Quellenprüfzeitpunkte werden dadurch nicht erneuert.">Die Änderung wird mit deinem Admin-Konto, Zeitpunkt sowie alten und neuen Werten protokolliert. Quellenprüfzeitpunkte werden dadurch nicht erneuert.</span></p></fieldset>
          <div class="maintenance-actions"><button type="submit" data-maintenance-preview><span data-i18n-text="Änderungen speichern">Änderungen speichern</span></button><button type="button" data-maintenance-reload><span data-i18n-text="Aktuellen Stand laden">Aktuellen Stand laden</span></button></div>
        </form><div data-maintenance-reviews>${reviewItems()}</div>`;
      renderFormats();
      renderKnowledge();
      editorBaseline = editorFingerprint();
    }

    async function loadEvent(eventId, editionId) {
      if (busy || unresolved) return;
      resetEditor(); const sequence = selectionSequence;
      ++searchSequence;
      $("[data-maintenance-results]").innerHTML = "";
      $("[data-maintenance-close]").hidden = false;
      status(maintenanceText("Event und Ausgaben werden geladen …"));
      try {
        const loaded = assertContext(await rpc(client, "admin_manual_event_context", { p_event_id: eventId }), eventId);
        if (sequence !== selectionSequence) return;
        context = loaded;
        selectedId = loaded.editions.some(row => row.id === editionId) ? editionId : loaded.editions[0]?.id;
        action = loaded.editions.length ? "correct" : "create"; knowledgeScope = "edition"; lastReceipt = null; lastKnowledgeRequest = null; $("[data-maintenance-publication]").innerHTML = "";
        renderEditor(); status(maintenanceText("Datenbankstand geladen. Angaben bearbeiten und Änderungen speichern."));
      } catch (error) { if (sequence === selectionSequence) status(error.message || maintenanceText("Event konnte nicht geladen werden."), true); }
    }

    function collectRequest() {
      if (formatConflict) throw new Error(maintenanceText("Die Wettbewerbe wurden zwischenzeitlich geändert. Bitte zuerst den aktuellen Formularstand übernehmen und erneut bearbeiten."));
      const before = values(), edited = { event: {}, edition: {} };
      root.querySelectorAll("[data-maintenance-field]").forEach(input => {
        const [scope, key] = input.dataset.maintenanceField.split(".");
        edited[scope][key] = input.value === "" ? "" : input.type === "number" ? Number(input.value) : input.value.trim();
        if (input.type === "url" && input.value && !safeUrl(input.value)) throw new Error(maintenanceText("Bitte eine gültige http://- oder https://-Adresse eingeben."));
      });
      const clear = [...root.querySelectorAll("[data-maintenance-clear]:checked")].map(input => input.dataset.maintenanceClear);
      const required = new Set(["canonical_name", "sport", "city", "country", "registration_status", "edition_status"]);
      for (const path of touched) {
        const [scope, key] = path.split(".");
        if (edited[scope]?.[key] !== "") continue;
        if (required.has(key)) throw new Error((LABELS[path] || key) + maintenanceText(" darf nicht leer sein."));
        if (before[scope]?.[key] != null && before[scope][key] !== "" && !clear.includes(path)) clear.push(path);
      }
      const cleared = scope => clear.filter(path => path.startsWith(scope + ".")).map(path => path.split(".")[1]);
      const touchedFor = scope => [...touched].filter(path => path.startsWith(scope + ".")).map(path => path.split(".")[1]);
      const eventPatch = buildPatch(before.event, edited.event, touchedFor("event"), cleared("event"), EVENT_FIELDS);
      const editionPatch = buildPatch(before.edition, edited.edition, touchedFor("edition"), cleared("edition"), EDITION_FIELDS);
      if (editionPatch.start_date && before.edition.end_date === before.edition.start_date && !touched.has("edition.end_date") && !clear.includes("edition.end_date")) editionPatch.end_date = editionPatch.start_date;
      const nextStart = editionPatch.start_date || before.edition.start_date;
      const nextEnd = clear.includes("edition.end_date") ? null : editionPatch.end_date || before.edition.end_date;
      if (nextStart && nextEnd && nextEnd < nextStart) {
        root.querySelector("[data-maintenance-field='edition.end_date']").closest("details").open = true;
        throw new Error(maintenanceText("Das Enddatum liegt vor dem neuen Termin. Bitte das Enddatum ebenfalls korrigieren."));
      }
      if (action === "create") {
        const year = edited.edition.edition_year || Number(nextStart?.slice(0, 4));
        if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error(maintenanceText("Bitte das Ausgabejahr oder ein gültiges Datum eingeben."));
        Object.assign(editionPatch, { edition_year: year, edition_key: edited.edition.edition_key || "main" });
        if (Object.keys(eventPatch).length || clear.some(path => path.startsWith("event."))) throw new Error(maintenanceText("Die neue Edition verwendet die gemeinsamen Stammdaten. Gemeinsame Angaben bitte an der bestehenden Edition korrigieren."));
      }
      if (formatsDirty) {
        const rows = [...root.querySelectorAll("[data-maintenance-format]")].map(row => ({ index: Number(row.dataset.maintenanceFormat), label: row.querySelector("[data-format-label]").value, distance_km: row.querySelector("[data-format-distance]").value, clear_distance: row.querySelector("[data-format-clear-distance]")?.checked, removed: row.querySelector("[data-format-remove]").checked, ...Object.fromEntries(FORMAT_DETAILS.flatMap(([key]) => [[key, row.querySelector('[data-format-detail="' + key + '"]').value], ["clear_" + key, Boolean(row.querySelector('[data-format-clear="' + key + '"]')?.checked)]])) }));
        editionPatch.race_formats = mergeRaceFormats(before.edition.race_formats || [], rows, rows.filter(row => row.removed).map(row => row.index));
      }
      const knowledge = collectKnowledge("");
      if (!knowledge && !Object.keys(eventPatch).length && !Object.keys(editionPatch).length && !clear.length) throw new Error(maintenanceText("Es gibt noch keine geänderten Angaben."));
      const request = { request_id: globalThis.crypto.randomUUID(), action, manual_approval: true, event_id: context.event.id, edition_id: selectedId, expected_version: context.version, event_patch: eventPatch, edition_patch: editionPatch, clear_fields: clear, confirmations: [], notes: $("[data-maintenance-notes]")?.value.trim() || "", publish: true };
      if (knowledge) request.knowledge = knowledge;
      if ($("[data-maintenance-candidate]")?.value) request.candidate_id = $("[data-maintenance-candidate]").value;
      return request;
    }

    function preview() {
      try {
        if (!$("[data-maintenance-form]").reportValidity()) return;
        const originalRequest = collectRequest(), before = values();
        const newFaqIds = new Map((originalRequest.knowledge?.faq_upserts || []).map(row => [row.id, globalThis.crypto.randomUUID()]));
        invalidate(); pending = originalRequest;
        const dialog = document.createElement("dialog");
        dialog.dataset.maintenancePreviewBox = "";
        dialog.className = "content-verification-dialog maintenance-preview";
        dialog.setAttribute("aria-labelledby", "maintenanceConfirmTitle");
        const year = Number((originalRequest.edition_patch.start_date || "").slice(0, 4));
        const yearChange = action !== "create" && year && year !== selected()?.edition_year;
        dialog.innerHTML = "<h4 id=\"maintenanceConfirmTitle\"><span data-i18n-text=\"Änderungen übernehmen?\">Änderungen übernehmen?</span></h4><p><strong>" + escape(context.event.canonical_name || context.event.event_name) + '</strong> · <span data-maintenance-dialog-edition></span></p>' + (yearChange ? "<fieldset><legend><span data-i18n-text=\"Der Termin liegt in einem anderen Kalenderjahr.\">Der Termin liegt in einem anderen Kalenderjahr.</span></legend><label><input type=\"radio\" name=\"maintenanceYearChoice\" data-maintenance-year-choice value=\"current\" checked> <span data-i18n-text=\"Bestehende Edition korrigieren\">Bestehende Edition korrigieren</span></label><label><input type=\"radio\" name=\"maintenanceYearChoice\" data-maintenance-year-choice value=\"create\"> <span data-i18n-text=\"Neue Edition anlegen\">Neue Edition anlegen</span></label><label data-maintenance-key-label hidden><span data-i18n-text=\"Ausgabekürzel\">Ausgabekürzel</span><input data-maintenance-new-key value=\"main\" maxlength=\"48\"></label><p><span data-i18n-text=\"Eine Verschiebung kann dieselbe Edition betreffen. Die Auswahl bestimmt, welche Edition gespeichert wird.\">Eine Verschiebung kann dieselbe Edition betreffen. Die Auswahl bestimmt, welche Edition gespeichert wird.</span></p></fieldset>" : '') + "<div data-maintenance-dialog-changes></div><p><span data-i18n-text=\"Die Bestätigung gibt nur diese Änderungen manuell frei. Sie bestätigt keine frische Prüfung externer Quellen. Die Anwendung übernimmt zulässige Änderungen automatisch in die öffentlichen Ansichten.\">Die Bestätigung gibt nur diese Änderungen manuell frei. Sie bestätigt keine frische Prüfung externer Quellen. Die Anwendung übernimmt zulässige Änderungen automatisch in die öffentlichen Ansichten.</span></p><p data-maintenance-dialog-error role=\"alert\"></p><div class=\"maintenance-actions\"><button type=\"button\" data-maintenance-save><span data-i18n-text=\"Übernehmen und speichern\">Übernehmen und speichern</span></button><button type=\"button\" data-maintenance-back><span data-i18n-text=\"Abbrechen\">Abbrechen</span></button></div>";
        const update = () => {
          const create = action === "create" || dialog.querySelector('[data-maintenance-year-choice]:checked')?.value === "create";
          pending = clone(originalRequest);
          if (create && action !== "create") {
            Object.assign(pending, { action: "create", clear_fields: originalRequest.clear_fields.filter(path => path.startsWith("event.")), edition_patch: { ...seedNextEdition(), ...originalRequest.edition_patch, edition_year: year, edition_key: dialog.querySelector("[data-maintenance-new-key]").value.trim() || "main" } });
            if (pending.knowledge?.scope === "edition") {
              // Only explicit edits enter the new edition. Old FAQ identities,
              // deletions and unedited annual knowledge belong to the old one.
              pending.knowledge.clear_fields = [];
              pending.knowledge.faq_remove = [];
              pending.knowledge.faq_upserts = pending.knowledge.faq_upserts.map(row => ({ ...row, id: newFaqIds.get(row.id) }));
              if (!Object.keys(pending.knowledge.patch).length && !pending.knowledge.faq_upserts.length) delete pending.knowledge;
            }
          }
          dialog.querySelector("[data-maintenance-key-label]")?.toggleAttribute("hidden", !create);
          dialog.querySelector("[data-maintenance-dialog-edition]").textContent = create ? maintenanceText("Neue Edition ") + pending.edition_patch.edition_year : maintenanceText("Bestehende Edition ") + selected().edition_year + maintenanceText(" bleibt erhalten");
          const target = create && context.editions.find(row => row.edition_year === pending.edition_patch.edition_year && (row.edition_key || "main") === (pending.edition_patch.edition_key || "main"));
          dialog.querySelector("[data-maintenance-save]").disabled = Boolean(target);
          dialog.querySelector("[data-maintenance-dialog-error]").textContent = target ? maintenanceText("Diese Zielausgabe existiert bereits. Abbrechen und die vorhandene Ausgabe auswählen; für eine tatsächlich andere Austragung ein eigenes Kürzel verwenden.") : "";
          const changes = [];
          for (const scope of ["event", "edition"]) for (const [key, value] of Object.entries(pending[scope + "_patch"])) changes.push([scope + "." + key, create && scope === "edition" ? null : before[scope][key], value]);
          for (const field of pending.clear_fields) { const [scope, key] = field.split("."); changes.push([field, before[scope][key], null]); }
          let html = '<p>' + (create ? maintenanceText("Eine neue Editionsidentität entsteht. Die alte Edition und persönliche Ergebnisse bleiben unverändert. Unbearbeitete Jahresangaben und alte Prüfnachweise werden nicht übernommen.") : maintenanceText("Die Editionsidentität sowie persönliche Planner- und Ergebnisverknüpfungen bleiben unverändert.")) + '</p><ul>' + changes.map(([field, old, value]) => '<li><strong>' + maintenanceLabel(LABELS[field] || field) + "</strong><div><span data-i18n-text=\"Bisher:\">Bisher:</span> " + escape(display(old)) + "</div><div><span data-i18n-text=\"Neu:\">Neu:</span> " + escape(display(value)) + '</div></li>').join("") + '</ul>';
          if (pending.knowledge) {
            const record = currentKnowledge(), knowledge = pending.knowledge, entries = [];
            for (const [section, fields] of Object.entries(knowledge.patch || {})) for (const [key, value] of Object.entries(fields)) entries.push([section + "." + key, value]);
            for (const field of knowledge.clear_fields || []) entries.push([field, null]);
            for (const row of knowledge.faq_upserts || []) entries.push(["faq." + row.id, row]);
            for (const id of knowledge.faq_remove || []) entries.push(["faq." + id, null]);
            html += "<h4><span data-i18n-text=\"Zusatzdetails:\">Zusatzdetails:</span> " + (knowledge.scope === "brand" ? maintenanceText("alle Ausgaben") : maintenanceText("diese Edition")) + '</h4><ul>' + entries.map(([field, value]) => '<li><strong>' + maintenanceLabel(knowledgeLabel(field)) + "</strong><div><span data-i18n-text=\"Bisher:\">Bisher:</span> " + escape(displayKnowledge(create && knowledge.scope === "edition" ? null : knowledgeValue(record, field))) + "</div><div><span data-i18n-text=\"Neu:\">Neu:</span> " + escape(displayKnowledge(value)) + '</div></li>').join("") + '</ul>';
          }
          dialog.querySelector("[data-maintenance-dialog-changes]").innerHTML = html;
        };
        dialog.addEventListener("change", () => { try { update(); } catch (error) { dialog.querySelector("[data-maintenance-dialog-error]").textContent = error.message; dialog.querySelector("[data-maintenance-save]").disabled = true; } });
        dialog.querySelector("[data-maintenance-new-key]")?.addEventListener("input", update);
        dialog.addEventListener("cancel", event => { if (busy) { event.preventDefault(); return; } invalidate(); });
        root.appendChild(dialog); update(); dialog.showModal(); dialog.querySelector("[data-maintenance-back]").focus();
        status(maintenanceText("Änderungsübersicht bereit. Noch nichts gespeichert."));
      } catch (error) { status(error.message, true); }
    }

    async function checkPublication() {
      if (!lastReceipt || !context) return;
      const output = $("[data-maintenance-publication]");
      const edition = selected();
      const receipt = lastReceipt;
      const expectedId = selectedId, expectedVersion = context.version;
      const current = () => selectedId === expectedId && context?.version === expectedVersion && lastReceipt === receipt;
      // Online readback and the separately gated fallback release are different
      // outcomes. Only a server-confirmed requirement may label the latter.
      const fallbackNotice = edition.publication_status === "published" && receipt.publication?.static_refresh_required === true
        ? "<p><strong><span data-i18n-text=\"Ausfallexport: Veröffentlichung erforderlich.\">Ausfallexport: Veröffentlichung erforderlich.</span></strong> <span data-i18n-text=\"Der gespeicherte Stand muss nach bestandenen Qualitätsprüfungen über den regulären Datenrelease in die Ausfalldaten übernommen werden. Eine erfolgreiche Onlineprüfung bestätigt diesen Schritt nicht.\">Der gespeicherte Stand muss nach bestandenen Qualitätsprüfungen über den regulären Datenrelease in die Ausfalldaten übernommen werden. Eine erfolgreiche Onlineprüfung bestätigt diesen Schritt nicht.</span></p>"
        : "";
      output.innerHTML = `<p><span data-i18n-text="Veröffentlichungsstand wird geprüft …">Veröffentlichungsstand wird geprüft …</span></p>`;
      try {
        const result = verifyPublication ? await verifyPublication({ event: context.event, edition }) : { status: edition.publication_status === "draft" ? "draft" : "pending" };
        if (!current()) return;
        const failed = receipt.publication?.status === "failed";
        let detail = { detailVerified: false }, catalog = { refreshed: false };
        if (!failed && result.archiveVerified) {
          output.innerHTML = "<p><span data-i18n-text=\"Im öffentlichen Live-Archiv geprüft. Normale Detailseite, Karte und Liste werden geprüft …\">Im öffentlichen Live-Archiv geprüft. Normale Detailseite, Karte und Liste werden geprüft …</span></p>";
          [detail, catalog] = await Promise.all([
            verifyDetail({ event: context.event, edition, knowledge: knowledgeExpectation(context, lastKnowledgeRequest, edition.id) }).catch(() => ({ detailVerified: false })),
            refreshCatalog ? Promise.resolve(refreshCatalog({ event: context.event, edition, discoveryPresent: result.discoveryPresent ?? result.discoveryVerified })).catch(() => ({ refreshed: false })) : Promise.resolve({ refreshed: false })
          ]);
        }
        if (!current()) return;
        const websiteVerified = result.archiveVerified && detail.detailVerified && (!result.discoveryPresent && !result.discoveryVerified || result.discoveryVerified && catalog.refreshed);
        const liveText = failed ? `${maintenanceText("Entwurf gespeichert; öffentliche Übernahme fehlgeschlagen: ")}${friendlyReviewReason(receipt.publication.error)}${maintenanceText(" Die Änderungen bleiben erhalten.")}` : result.status === "draft" ? `${maintenanceText("Privater Entwurf gespeichert; öffentliche Übernahme ausstehend. ")}${receipt.publication?.error ? friendlyReviewReason(receipt.publication.error) : maintenanceText("Für die öffentliche Anzeige fehlen noch zulässige Pflichtangaben oder eine Konfliktklärung.")}${maintenanceText(" Nach der Korrektur erneut „Änderungen speichern“ wählen; die Übernahme erfolgt automatisch.")}` : websiteVerified ? `${maintenanceText("Öffentlich aktualisiert: Normale Detailseite geprüft.")}${result.discoveryVerified ? maintenanceText(" Karte und Liste sind mit den gespeicherten Angaben neu geladen.") : maintenanceText(" Diese Ausgabe ist im Archiv sichtbar; sie ist nicht die nächste Ausgabe in Karte und Liste.")}` : maintenanceText("Datenbank gespeichert; die öffentliche Übernahme ist noch nicht bestätigt.");
        output.innerHTML = `<div class="maintenance-notice${failed ? " is-error" : ""}"><strong>${escape(liveText)}</strong>${result.archiveVerified && !websiteVerified ? `<p><span data-i18n-text="Öffentlicher Katalog: geprüft. Detailseite:">Öffentlicher Katalog: geprüft. Detailseite:</span> ${detail.detailVerified ? maintenanceText("geprüft") : maintenanceText("noch nicht bestätigt")}<span data-i18n-text=". Karte und Liste:">. Karte und Liste:</span> ${catalog.refreshed ? maintenanceText("neu geladen") : maintenanceText("noch nicht bestätigt")}<span data-i18n-text=". Erneut prüfen; die Speicherung bleibt erhalten.">. Erneut prüfen; die Speicherung bleibt erhalten.</span></p>` : ""}${fallbackNotice}<p><span data-i18n-text="Die Online-Ansichten laden aktuelle Daten direkt. Bei einem Datenbankausfall kann ein älterer, entsprechend gekennzeichneter Export erscheinen; dessen Stand wird durch diese Prüfung nicht erneuert.">Die Online-Ansichten laden aktuelle Daten direkt. Bei einem Datenbankausfall kann ein älterer, entsprechend gekennzeichneter Export erscheinen; dessen Stand wird durch diese Prüfung nicht erneuert.</span></p>${detail.detailUrl ? `<a href="${escape(detail.detailUrl)}" target="_blank" rel="noopener noreferrer"><span data-i18n-text="Öffentliche Detailseite öffnen ↗">Öffentliche Detailseite öffnen ↗</span></a>` : ""}<button type="button" data-maintenance-check-publication><span data-i18n-text="Öffentlichen Stand erneut prüfen">Öffentlichen Stand erneut prüfen</span></button></div>`;
      } catch (error) {
        if (!current()) return;
        output.innerHTML = `<div class="maintenance-notice is-error"><strong>${escape(error.message)}</strong><p><span data-i18n-text="Die Speicherung ist erhalten; Veröffentlichung konnte nicht geprüft werden.">Die Speicherung ist erhalten; Veröffentlichung konnte nicht geprüft werden.</span></p>${fallbackNotice}<button type="button" data-maintenance-check-publication><span data-i18n-text="Veröffentlichung erneut prüfen">Veröffentlichung erneut prüfen</span></button></div>`;
      }
    }

    async function save() {
      if (busy || !pending) return;
      const request = pending; setBusy(true); status(maintenanceText("Wird atomar gespeichert und erneut aus der Datenbank geladen …"));
      lastReceipt = null; lastKnowledgeRequest = null;
      $("[data-maintenance-publication]").textContent = "";
      try {
        const result = await saveWithRecovery(client, request, { onRecovery: () => status(maintenanceText("Antwort unklar. Derselbe Speichervorgang wird ohne Duplikat erneut abgefragt …")) });
        unresolved = false; context = result.context; selectedId = result.edition_id; action = "correct"; lastReceipt = result; lastKnowledgeRequest = request.knowledge ? { ...request.knowledge, manual_approval: request.manual_approval === true } : null;
        invalidate(); renderEditor(); setBusy(true); status(`${maintenanceText("In der Datenbank gespeichert und neu geladen. ")}${request.action === "review" ? maintenanceText("Entscheidung protokolliert.") : maintenanceText("Die bestätigten Änderungen wurden manuell freigegeben; Quellenprüfzeitpunkte bleiben getrennt.")}`);
        await checkPublication();
      } catch (error) {
        unresolved = Boolean(error.uncertain);
        const dialogError = $("[data-maintenance-dialog-error]"); if (dialogError) dialogError.textContent = error.message || maintenanceText("Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten.");
        const conflict = ["40001", "PT409"].includes(error.code) || /version|conflict|concurrent|zwischenzeit|verändert/i.test(error.message || "");
        if (!unresolved) invalidate();
        status(unresolved ? maintenanceText("Der Speicherstand ist noch unklar. Deine Eingaben bleiben erhalten. Bitte „Übernehmen und speichern“ erneut wählen: Derselbe Auftrag wird sicher wiederholt, bevor du weiterbearbeitest.") : conflict ? maintenanceText("Zwischenzeitlich wurden diese Daten geändert. Deine Eingaben bleiben erhalten. Lade den aktuellen Stand zum Vergleich und prüfe deine Änderungen erneut.") : (error.message || maintenanceText("Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Derselbe Speichervorgang kann erneut geprüft werden.")), true);
      } finally { setBusy(false); }
    }

    root.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      if (event.target.matches("[data-maintenance-form]")) { preview(); return; }
      if (!event.target.matches("[data-maintenance-search-form]")) return;
      const query = $("[data-maintenance-search]").value.trim();
      if (query.length < 2) { status(maintenanceText("Bitte mindestens zwei Buchstaben des Eventnamens eingeben."), true); return; }
      const sequence = ++searchSequence; status(maintenanceText("Events werden gesucht …"));
      $("[data-maintenance-close]").hidden = false;
      try {
        const { data, error } = await client.from("events").select("id,canonical_name,event_name,city").ilike("canonical_name", `%${query.replace(/[%_\\]/g, "\\$&")}%`).order("canonical_name").limit(30);
        if (error) throw error; if (sequence !== searchSequence) return;
        $("[data-maintenance-results]").innerHTML = (data || []).map(row => `<button type="button" data-maintenance-event="${escape(row.id)}">${escape(row.canonical_name || row.event_name)} <small>${escape(row.city || maintenanceText("Ort unbekannt"))}</small></button>`).join("");
        status(data?.length ? `${data.length}${maintenanceText(" Treffer")}${data.length === 30 ? maintenanceText(" (Suche bei Bedarf eingrenzen)") : ""}${maintenanceText(". Event auswählen.")}` : maintenanceText("Keine passenden Events gefunden."));
      } catch (error) { if (sequence === searchSequence) status(error.message || maintenanceText("Suche fehlgeschlagen."), true); }
    });

    root.addEventListener("input", event => {
      if (busy) return;
      if (event.target.dataset.maintenanceField) touched.add(event.target.dataset.maintenanceField);
      if (event.target.closest("[data-maintenance-format]")) formatsDirty = true;
      if (event.target.dataset.knowledgeField) knowledgeTouched.add(event.target.dataset.knowledgeField);
      if (event.target.closest("[data-knowledge-array]")) knowledgeTouched.add(event.target.closest("[data-knowledge-array]").dataset.knowledgeArray);
      if (event.target.closest("[data-knowledge-faq]")) knowledgeTouched.add(`faq.${event.target.closest("[data-knowledge-faq]").dataset.knowledgeFaq}`);
      if (event.target.closest("[data-maintenance-form],[data-maintenance-review-row]")) invalidate();
      if (event.target.matches("[data-maintenance-source]")) {
        const url = safeUrl(event.target.value); const link = $("[data-maintenance-open-source]"); link.hidden = !url; if (url) link.href = url; else link.removeAttribute("href");
      }
    });
    root.addEventListener("change", event => {
      if (busy) return;
      if (event.target.dataset.maintenanceField) touched.add(event.target.dataset.maintenanceField);
      if (event.target.dataset.knowledgeField) knowledgeTouched.add(event.target.dataset.knowledgeField);
      if (event.target.closest("[data-knowledge-array]")) knowledgeTouched.add(event.target.closest("[data-knowledge-array]").dataset.knowledgeArray);
      if (event.target.closest("[data-knowledge-faq]")) knowledgeTouched.add(`faq.${event.target.closest("[data-knowledge-faq]").dataset.knowledgeFaq}`);
      if (event.target.matches("[data-knowledge-scope]")) {
        if (knowledgeDirty()) { event.target.value = knowledgeScope; status(maintenanceText("Bitte die bearbeiteten Zusatzdetails vor dem Wechsel des Geltungsbereichs speichern oder den Datenbankstand neu übernehmen."), true); return; }
        knowledgeScope = event.target.value; renderKnowledge(); $("[data-maintenance-knowledge] > details").open = true;
      }
      if (event.target.matches("[data-maintenance-edition]")) { selectedId = event.target.value; knowledgeScope = "edition"; lastReceipt = null; lastKnowledgeRequest = null; $("[data-maintenance-publication]").innerHTML = ""; renderEditor(); }
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
      if (button.matches("[data-maintenance-close]")) { closeSearch(); return; }
      if (button.dataset.maintenanceEvent && !unresolved && canLeaveSelection()) await loadEvent(button.dataset.maintenanceEvent);
      if (button.matches("[data-maintenance-review-preview]")) previewReview(button.closest("[data-maintenance-review-row]"));
      if (button.matches("[data-maintenance-save]")) await save();
      if (button.matches("[data-maintenance-back]")) invalidate();
      if (button.matches("[data-maintenance-check-publication]")) await checkPublication();
      if (button.matches("[data-maintenance-reset-form]")) { renderEditor(); status(maintenanceText("Formular mit dem aktuellen Datenbankstand vorausgefüllt. Bitte erneut prüfen.")); }
      if (button.matches("[data-maintenance-add-format]")) { const holder = $("[data-maintenance-formats]"); holder.insertAdjacentHTML("beforeend", formatRow({}, holder.children.length)); formatsDirty = true; invalidate(); }
      if (button.dataset.knowledgeAdd) { const path = button.dataset.knowledgeAdd, holder = root.querySelector(`[data-knowledge-rows="${path}"]`); holder.insertAdjacentHTML("beforeend", knowledgeArrayRow(path, {}, holder.children.length)); knowledgeTouched.add(path); invalidate(); }
      if (button.matches("[data-knowledge-add-faq]")) { $("[data-knowledge-faq-rows]").insertAdjacentHTML("beforeend", faqRow({})); invalidate(); }
      if (button.matches("[data-maintenance-reload]")) {
        // A conflict refresh never silently replaces the user's work. Show the new
        // snapshot, then require a new preview against that exact revision.
        setBusy(true);
        try {
          const latest = assertContext(await rpc(client, "admin_manual_event_context", { p_event_id: context.event.id }), context.event.id);
          const old = selected(); const next = latest.editions.find(row => row.id === selectedId);
          const changed = [...EVENT_FIELDS.map(key => [`event.${key}`, context.event[key], latest.event[key]]), ...EDITION_FIELDS.map(key => [`edition.${key}`, old?.[key], next?.[key]])].filter(([, a, b]) => !equal(a, b));
          formatConflict = formatsDirty && !equal(old?.race_formats, next?.race_formats);
          const beforeKnowledge = currentKnowledge(), nextKnowledge = knowledgeRecord(latest, knowledgeScope, selectedId);
          knowledgeConflict = Boolean(knowledgeDirty() && !equal(beforeKnowledge, nextKnowledge));
          context = latest; invalidate();
          root.querySelectorAll("[data-maintenance-field]").forEach(input => {
            const path = input.dataset.maintenanceField;
            if (touched.has(path) || action === "create") return;
            const [scope, key] = path.split("."); input.value = (scope === "event" ? latest.event : next)?.[key] ?? "";
          });
          if (!formatsDirty && action !== "create") renderFormats();
          if (!knowledgeDirty()) renderKnowledge();
          const notice = document.createElement("div"); notice.className = "maintenance-notice";
          notice.innerHTML = `<strong><span data-i18n-text="Aktueller Datenbankstand geladen; deine bearbeiteten Eingaben bleiben im Formular.">Aktueller Datenbankstand geladen; deine bearbeiteten Eingaben bleiben im Formular.</span></strong>${changed.length ? `<ul>${changed.map(([path, , value]) => `<li>${maintenanceLabel(LABELS[path] || path)} <span data-i18n-text="ist jetzt:">ist jetzt:</span> ${escape(display(value))}</li>`).join("")}</ul>` : "<p><span data-i18n-text=\"Keine zwischenzeitlichen Faktenänderungen.\">Keine zwischenzeitlichen Faktenänderungen.</span></p>"}<p>${formatConflict ? maintenanceText("Die Wettbewerbe haben sich überlagert. Bitte den aktuellen Formularstand übernehmen und erneut bearbeiten.") : maintenanceText("Bitte deine Änderungen mit dem aktuellen Datenbankstand vergleichen und danach „Änderungen speichern“ wählen.")}</p><button type="button" data-maintenance-reset-form><span data-i18n-text="Datenbankstand übernehmen und Formulareingaben verwerfen">Datenbankstand übernehmen und Formulareingaben verwerfen</span></button>`;
          editor.prepend(notice); root.querySelectorAll("[data-maintenance-confirm]").forEach(input => { input.checked = false; });
          root.querySelectorAll("[data-knowledge-confirm]").forEach(input => { input.checked = false; });
          if (knowledgeConflict) notice.insertAdjacentHTML("beforeend", "<p><span data-i18n-text=\"Auch die Zusatzdetails wurden zwischenzeitlich geändert. Deine Eingaben bleiben erhalten; bitte vor dem Speichern den aktuellen Formularstand übernehmen und erneut bearbeiten.\">Auch die Zusatzdetails wurden zwischenzeitlich geändert. Deine Eingaben bleiben erhalten; bitte vor dem Speichern den aktuellen Formularstand übernehmen und erneut bearbeiten.</span></p>");
          status(maintenanceText("Aktueller Stand geladen. Bitte Änderungen vergleichen und erneut gemeinsam bestätigen."));
        } catch (error) { status(error.message, true); }
        finally { setBusy(false); }
      }
    });
    // Translate explicitly marked UI nodes in place. Re-rendering the editor on
    // language changes would discard unsaved values, checked deletions and focus.
    const languageDocument = root.ownerDocument || globalThis.document;
    let languageObserver;
    const refreshLanguage = () => {
      languageObserver?.disconnect();
      const bindings = [["data-i18n-text", null], ["data-i18n-placeholder-text", "placeholder"],
        ["data-i18n-title-text", "title"], ["data-i18n-aria-label-text", "aria-label"]];
      for (const [binding, attribute] of bindings) {
        root.querySelectorAll(`[${binding}]`).forEach(node => {
          const text = maintenanceText(node.getAttribute(binding));
          if (attribute) { if (node.getAttribute(attribute) !== text) node.setAttribute(attribute, text); }
          else if (node.textContent !== text) node.textContent = text;
        });
      }
      root.querySelectorAll("[data-maintenance-edition-label]").forEach(option => {
        const row = context?.editions.find(edition => String(edition.id) === option.dataset.maintenanceEditionLabel);
        if (row) option.textContent = `${row.edition_year} · ${row.start_date || maintenanceText("Termin offen")}${row.edition_key && row.edition_key !== "main" ? ` · ${row.edition_key}` : ""} · ${maintenanceText(row.publication_status === "draft" ? "Entwurf" : "Veröffentlicht")}`;
      });
      root.querySelectorAll("[data-maintenance-scope-edition]").forEach(option => {
        option.textContent = `${maintenanceText("Nur diese Ausgabe (")}${selected()?.edition_year ?? ""})`;
      });
      languageObserver?.observe(root, { childList: true, subtree: true });
    };
    if (typeof globalThis.MutationObserver === "function") languageObserver = new globalThis.MutationObserver(refreshLanguage);
    languageDocument?.addEventListener("app-language-changed", refreshLanguage);
    root.__maintenanceLanguageCleanup = () => {
      languageObserver?.disconnect();
      languageDocument?.removeEventListener("app-language-changed", refreshLanguage);
    };
    refreshLanguage();
    return { loadEvent, getContext: () => context };
  }

  return { EVENT_FIELDS, EDITION_FIELDS, REQUIRED_CHECKS, KNOWLEDGE_GROUPS, BRAND_KNOWLEDGE_GROUPS, buildKnowledgePatch, knowledgeRecord, knowledgeExpectation, compareRenderedKnowledge, displayKnowledge, buildPatch, seedNextEdition, mergeRaceFormats, assertSaveOutcome, assertContext, assertPersistedChanges, saveWithRecovery, publicProjection, comparePublicRow, verifyPublicEdition, verifyRenderedDetail, friendlyReviewReason, mount };
});
