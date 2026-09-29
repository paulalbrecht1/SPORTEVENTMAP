# Erneute Abnahme: ausschließlich über den Website-Admin

Dieser Bericht dokumentiert die frühere v91-Prüfung. Die anschließenden
Korrekturen und ihren aktuellen Freigabestand beschreibt der
[v92-Korrekturbericht](MANUAL_WORKFLOW_FIX_20260929.md).

Stand: 29.09.2026, Prüfung der produktiven v91 und des Quellstands `582906c`.
**Gesamtergebnis: Anforderung noch nicht erfüllt.** Diese Prüfung ändert keine
Produktionsdaten und erhöht keine Prüfzeitstempel. Ein funktionierender
Datenbankspeicherweg ist noch keine vollständige Veröffentlichung auf der Website.

## Was ohne Codex funktioniert

Der normale SportEventMap-Login mit bestehender Adminrolle reicht aus. Der
Browser verwendet den vorhandenen öffentlichen Supabase-Schlüssel und die
Website-Benutzersitzung. Es gibt im manuellen Modul und dessen Speicherweg keine
Codex-/OpenAI-Anmeldung, keine LLM-Abfrage und keinen erforderlichen CLI-Schritt.
Die serverseitige Adminprüfung muss bestehen bleiben. Der Benutzer benötigt
auch keine Anmeldung im Supabase-Dashboard oder bei Cloudflare.

Die vorhandenen Events sind über die Namenssuche erreichbar: Die lesende
Produktionsprüfung um 13:36 UTC fand keine Events ohne Edition und keine Events
ohne suchbaren kanonischen Namen. Eine Suche liefert höchstens 30 Treffer und
muss bei Bedarf eingegrenzt werden. Das ist keine Pflegequeue für den Gesamtbestand.

Gezieltes Bestätigen einzelner Angaben, Korrigieren und Anlegen eines Entwurfs
funktionieren. Vollständige Bestätigungen der 14 Kernangaben können bei einer
geeigneten veröffentlichten Discovery-Ausgabe die Frische erhöhen. Ring und
Christmas besitzen im erneut anonym abgefragten Guard weiterhin gültige
Nachweise. Eine einzelne Feldprüfung, historische Ausgabe, unbekannte Angabe
oder ungelöster Konflikt darf nicht automatisch vollständige Frische erhalten.

## Offene Abnahmefehler

### 1. Reguläre Detaillinks können alte Daten zeigen

`js/events.js:getEventDetailUrl` verlinkt auf `/event/<slug>/`. Bereits vorhandene
Seiten dort sind statische Dateien. Sie lesen die gepflegten Kernwerte nicht
erneut aus dem öffentlichen Archiv. Der Admin prüft dagegen ausschließlich die
öffentlichen API-Ansichten, nicht die tatsächliche Zielseite.

Erneut im Browser und durch anonyme HTTP-Abfragen belegt:

- `/event/ring-running-series-2026/`: Anmeldung „Not yet officially confirmed“,
  Distanzen „21 km / 42 km“, zuletzt geprüft „2 June 2026“.
- `/event-detail.html?event=ring-running-series-2026`: Anmeldung „Geöffnet“,
  Halbmarathon 21.097 km, Marathon 42.195 km, aktuelle Adresse und Beschreibung.
- Das öffentliche Archiv liefert die aktuellen Werte; die Datenbankspeicherung
  ist nicht verloren gegangen.

Die statischen Ausfalldaten bleiben bis zum regulären Datenrelease alt. Der
tägliche Pflegeweg braucht deshalb einen konsistenten öffentlichen Live-Lesepfad
auch für vorhandene Detaillinks. Er darf nicht je Änderung einen lokalen Build
oder Codex voraussetzen. Gespeicherte Ausfalldaten müssen als solche erkennbar
bleiben; Datenqualitätsgates werden dafür nicht abgesenkt.

### 2. Sechs bearbeitbare Angaben fehlen im öffentlichen Prüfvertrag

`end_date`, `start_time`, `price_min`, `price_max`, `currency` und
`participant_limit` sind im Formular und kanonischen Speicherweg vorhanden.
Sie fehlen jedoch in beiden produktiven öffentlichen Katalogansichten und in
`publicProjection`/`verifyPublicEdition` des manuellen Moduls. Die dynamische
Detailseite ergänzt einzelne Angaben aus einem separaten statischen Detaildaten-
Export; das ist kein Nachladen der gerade gepflegten Editionswerte.

Eine isolierte Reproduktion mit dem unveränderten Produktmodul zeigt:
Selbst wenn diese sechs bearbeiteten Werte vollständig in der öffentlichen
Antwort fehlen, liefert `verifyPublicEdition` weiterhin `live_verified`.
Das widerspricht der umfassenden öffentlichen Erfolgsaussage. Die Reproduktion
verwendet einen künstlichen Transport außerhalb der Produktion, keine Testevents
in der echten Datenbank.

Erforderlich: kanonischen öffentlichen Feldvertrag und Darstellung ergänzen,
alle tatsächlich zu veröffentlichenden geänderten Werte nachprüfen. Der Status
muss fehlende Veröffentlichung ausdrücklich benennen.

### 3. Konfliktfälle verlassen das neue Formular

Das Formular verweist bei Reviewblockern nach „Data Operations“. Vorschläge,
Quellenaufgaben und Kandidatenkonflikte lassen sich nicht vollständig direkt
unter „Events pflegen“ entscheiden. Bei fünf Kandidaten besteht zum Messstand
ein Konfliktstatus. Der vorhandene Allgäu-Entwurf ist weiterhin wegen
`edition_year_date_conflict` blockiert: erkannter Sonntag versus belegtes
Veranstaltungswochenende. Dafür gibt es noch keinen geeigneten auditierbaren
Admin-Auflösungsweg.

Erforderlich: bestehende Reviewentscheidungen im gewählten Event zugänglich
machen und eine ausdrückliche, versionierte, quellenbelegte Konfliktauflösung
ergänzen. Keine automatische Erledigung durch Speichern, kein Überschreiben der
ursprünglichen Kandidatenbeobachtung und keine Aufweichung der Freigaberegeln.

### 4. Dynamische Detailseite liest den Frische-Guard falsch

Der reale RPC liefert `{ decisions: { <edition_id>: true }, ... }`.
`js/event-detail-live.js:loadFreshnessGuard` liest jedoch
`decisions?.[event.edition_id]` statt den Inhalt der `decisions`-Eigenschaft.
Damit bleibt `coreVerified` falsch, obwohl die reale Guardentscheidung wahr ist.
Der aktuelle Prüfnachweis wird in der dynamischen Besucheransicht ausgeblendet.
Der Befund wurde mit der echten anonymen Ring-Antwort reproduziert.

Zusätzlich aktualisiert der neue Speicherhandler die bereits im Hauptfenster
geladenen Karten-/Listendaten nicht. Ein erneuter Seitenaufruf lädt diese Daten;
die unmittelbar sichtbare offene Karte ist durch den API-Abgleich nicht geprüft.

## Ausgeführte Prüfungen und Grenzen

- `npm run test:manual-maintenance`: erneut 13/13 bestanden.
- `node tests/e2e/run-playwright.mjs tests/e2e/manual-event-maintenance.spec.mjs`:
  erneut 15/15 bestanden, mobile und Desktopfälle. Diese Tests simulieren den
  RPC-Transport; sie beweisen allein keine produktive Veröffentlichung.
- Produktive Datenbank ausschließlich lesend: öffentliche Spalten, suchbare
  Events, Editionsbestand und Kandidatenkonflikte geprüft.
- Echte anonyme HTTP-Abfragen ohne Adminsitzung: öffentliche Pilotwerte,
  Frische-Guard und ausgelieferte Ring-Detailseite verglichen.
- Echte Browser-Sichtprüfung beider Ring-Detailwege und der normalen Adminansicht.
- Isolierte Reproduktion der unvollständigen Veröffentlichungskontrolle und
  Abgleich des tatsächlichen Guard-Antwortformats.

Private Belege: `exports/manual-workflow-audit-20260929/read-only-report.json`,
`verify.cjs`, `ring-static-old.png`, `ring-live-current.png`.
Browser-Testartefakte: temporärer Lauf `1790689098849-29028`.
Die früheren 66 SQL-Prüfungen wurden in dieser Abnahme nicht erneut ausgeführt;
es wurden weder Backendcode noch Datenbankschema verändert.

## Reihenfolge vor der vollständigen Freigabe

1. Besucher-Detailpfade und vollständigen öffentlichen Feldvertrag korrigieren;
   Guardformat, Anzeigeaktualisierung und Erfolgsmeldung richtig anbinden.
2. Offene Reviewentscheidungen im neuen Pflegebereich erreichbar machen;
   vorhandenen Allgäu-Konflikt mit auditierter Einzelentscheidung lösbar machen.
3. Auf isolierter Testdatenbank über echte Website-Anmeldung und ausschließlich
   das Formular speichern; anschließend in einem getrennten anonymen Browser
   Karte, Liste und regulären Detaillink prüfen. Keine simulierten erfolgreichen
   Veröffentlichungsantworten für diese Abnahme verwenden.
4. Erst nach diesem Nachweis als vollständig eigenständigen Admin-Pflegeweg
   freigeben. P0-Bestands- und Frischegrenzen bleiben zusätzlich bestehen.
