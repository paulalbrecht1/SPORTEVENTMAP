# P0: private Detailreviews und Wiederherstellung geprüfter Eventdaten

Stand: 21. September 2026. P0 bleibt offen. Ausgangspunkt ist `72cee57`.

## Tatsächlicher Produktionsstand

Der aktuelle Live-Abgleich bestätigt bereits 44 Migrationen einschließlich
`20260920174425_event_detail_foundation_schema_alignment` und
`20260920174737_preserve_edition_facts_from_legacy_sync`. Die alte Dokumentation
beschrieb noch deren Vorbereitung; die Anwendung erfolgte am 20.09. um 18:49 UTC.
Es wurde keine Migration erneut ausgeführt und keine historische Version repariert.

Der erneute reine Lesevergleich prüfte alle drei Funktionskörper exakt gegen
die lokalen Migrationen, aktive Trigger, View-Elternzuordnung, RLS, Constraints,
Indizes und Funktionsrechte. Alle Zielverträge stimmen; keine falschen Eltern-Aliase
oder doppelten Event-Jahr-Gruppen wurden gefunden.

## Fünf Detailpakete privat übernommen

Die unveränderten fünf editionsgebundenen Pakete aus
`data/event-knowledge-review.json` sind jetzt in Production gespeichert:

| Edition | Event-ID | Feldvorschläge |
| --- | ---: | ---: |
| Berlin-Marathon 2026 | 39 | 15 |
| Berliner Halbmarathon 2027 | 429 | 15 |
| Köhlbrandbrückenlauf 2026 | 262 | 17 |
| Challenge Roth 2027 | 46 | 20 |
| Rennsteiglauf 2027 | 43 | 20 |

Das sind fünf Knowledge-Eltern, 18 Abschnittszeilen und 87 Feldquellen.
Alle Eltern bleiben `needs_review` und `is_public=false`; `last_checked`,
Quellen-Verifikationszeitpunkte und nicht belegte Konfidenz bleiben leer.
Die vorhandenen fachlichen Widersprüche wurden nicht durch diesen Import entschieden.
Die Übernahme erzeugt weder neue Discovery-Events noch vollständige Frischenachweise.

Der einmalige, unabhängig geprüfte Import verwendet die bestehende Tabellenstruktur
und die tatsächliche Datenbankrolle, keine erfundene Adminidentität oder JWT-Claims.
Er verlangt den leeren Knowledge-Vorzustand, exakte Editions-/Slug-/Datumsbindung
und unveränderte Eingabeprüfsummen. Kurze Sperren verhindern konkurrierende Inserts;
eine Wiederholung wird abgelehnt. Es entstehen keine neuen permanenten SQL-Funktionen.

Vorher wurde ein frisches verschlüsseltes Backup erstellt und in eine isolierte
Datenbank zurückgespielt. Der Restore bestand in **41,556 Sekunden**, einschließlich
Schema, RLS, Nutzerisolation und öffentlicher Views. Die konkrete Importprobe prüfte
**132 Bedingungen**, vollständigen Rollback aller 15 Tabellen, einen absichtlichen
Fehler nach allen Inserts sowie die Ablehnung einer Wiederholung nach echtem Commit
auf der Kopie. Derselbe SQL-Inhalt wurde anschließend einmal produktiv ausgeführt.

Alle 110 gespeicherten Zeilen stimmen im unabhängigen lokalen Vergleich exakt mit
den Eingaben überein, einschließlich JSON-Arrayreihenfolge und Booleschen Werten.
Die Produktions-Transaktion bestätigt unveränderte vollständige Event-, Editions-,
Quellen-, Favoriten- und Saisonplanzeilen. Ein weiterer Livevergleich bestätigt
Privatstatus, Eltern- und Quellenanzahl. Alle zehn Knowledge-Tabellen liefern anonym
null Zeilen; öffentliche Discovery bleibt erreichbar.

Backup: `sporteventmap-production-20260921T073210569Z.sembackup`.
SHA-256: `ec7fe8bf47747773787af305175a8d9427f4df359ad8c523b0b1115a1a2f7c94`.
Private Belege: `exports/p0-implementation-20260921/private-knowledge/`.

## Editionsgenaue Adminliste

Die bisherige Knowledge-Liste zeigte ausschließlich Einträge aus dem eingefrorenen
Audit. Dadurch war das vorhandene Challenge-Roth-Paket 2027 nicht erreichbar,
weil der Audit nur 2026 kannte. Fehlende Reviewaufgaben werden jetzt über ihren
exakten Editionsslug ergänzt, auch wenn der Audit ganz fehlt. Eine neue Aufgabe
übernimmt weder die Vollständigkeit des Vorjahrs noch einen erfundenen Score;
die Oberfläche zeigt `Not audited`. Die Suche berücksichtigt den Editionsslug.
Bestehende Auditwerte und Prioritäten bleiben erhalten.

## Quellenvorschläge im validierten HTML-Dialog

Die versionierte Adminoberfläche ersetzt beim Bearbeiten eines Quellenvorschlags
den nativen `window.prompt` durch einen HTML-Dialog. Er zeigt Veranstaltung, Feld,
bisherigen Wert und sichere Quellenverknüpfung zusammen mit dem bearbeiteten Wert.
Text und JSON werden ausdrücklich unterschieden; strukturierte Wettbewerbe behalten
ihre Typen und Reihenfolge. Die bisher automatisch eingesetzte Freigabebegründung
wird durch eine tatsächliche Eingabe mit mindestens zwölf Zeichen ersetzt.

Leere Werte, fehlerhaftes JSON, `null` und nicht endliche JSON-Zahlen werden vor
dem RPC abgelehnt. Ein zwischenzeitlich geschlossener oder geänderter Vorschlag
kann nicht aus einem alten Dialog übernommen werden. Abbrechen und Escape schreiben
nichts und geben den Fokus zurück; mehrfaches Absenden erzeugt nur einen Aufruf.
Die Oberfläche meldet einen serverseitigen Konflikt als nicht übernommen.
Der bestehende `review_event_change_proposal`-RPC und seine Rechteprüfung bleiben
der Speicherweg; es entsteht kein zusätzlicher Freigabepfad.

## Kernfakten für Köhlbrand und Ratzeburg wiederhergestellt

Für Köhlbrandbrückenlauf 2026 (Event 262) und den 36. Ratzeburger Adventslauf 2026
(Event 446) wurden aktuelle Quellenpakete mit jeweils allen 14 erforderlichen
Feldbelegen vorbereitet und unabhängig geprüft. Die Faktenkorrekturen und
Vorschlagsentscheidungen wurden über die echte Adminoberfläche durchgeführt.
Abgeschlossen sind **acht Entscheidungen**: drei `edited_and_accepted`, vier
`rejected` und ein `accepted` für das visuell geprüfte offizielle Ratzeburg-Logo.

| Edition | Durchgeführte Faktenkorrektur |
| --- | --- |
| Köhlbrandbrückenlauf 2026 | Numerisches Rennformat mit 12,3 km wiederhergestellt; die drei Startwellen bleiben ein Wettbewerb mit derselben Distanz. |
| Ratzeburger Adventslauf 2026 | Numerische Formate mit 26, 7,5 und 1,5 km wiederhergestellt; Beschreibung um den Ausverkauf des 7,5-km-Laufs und die ausgeschlossene Nachmeldung ergänzt. |

Vier unpassende Vorschläge zu Namen, Beschreibung und Anmeldelink wurden mit
Begründung abgelehnt. Das Ratzeburg-Logo wurde nach Sichtprüfung als allgemeines
Veranstaltungslogo übernommen; die Jahreszahl im Dateinamen ist im Bild nicht
enthalten. Der produktive Faktennachvergleich bestätigt für beide Editionen
die exakte Übereinstimmung aller 14 Werte mit den geprüften Belegen.

Beide Zehn-Feld-Inhaltsprüfungen sind über die echte Adminoberfläche abgeschlossen.
Anschließend wurden beide Editionen einzeln mit allen 14 belegten Feldern attestiert.
Der unabhängige Produktionsnachvergleich bestätigt zweimal exakte Fakten,
je einen neuen vollständigen Frischenachweis, tatsächliche Admin-Akteure,
null offene Aufgaben und null offene Vorschläge für diese beiden Editionen.
Beide strengen Frischeprüfungen liefern `true`. Die ursprünglichen Quellenzeiten
`2026-09-21T07:32:39.053Z` und `2026-09-21T07:32:41.053Z` bleiben erhalten;
sie wurden nicht durch den späteren Bestätigungszeitpunkt ersetzt.

Für Ratzeburg war vorher ein echter erneuter Quellenabruf erforderlich. Der
Browseraufruf scheiterte am fehlenden CORS-/OPTIONS-Vertrag des produktiven
`event-source-check`-Workers (Preflight HTTP 405). Deshalb wurde genau diese
Quelle über den bereits eingerichteten serverseitigen Cron-/Vault-Transport
abgerufen. Run 6433 verarbeitete genau eine Quelle, ohne weitere Jobs oder Fehler.
Das tatsächliche Ergebnis war `not_modified` / `unchanged`, HTTP 200, um
08:06:55 UTC; es entstanden keine neuen Vorschläge oder Prüfaufgaben.
Quellenzustände wurden nicht direkt überschrieben und Secrets nicht ausgegeben.
Der CORS-Fehler bleibt als eigener technischer Folgepunkt offen; der normale
Scheduler funktioniert und der Worker wurde hier nicht verändert oder deployt.

Private Arbeitsnachweise: `exports/p0-continue-20260921/core-recovery/`,
insbesondere `final-independent-postflight.json`,
`targeted-crawl-production-report.json` und `normal-export-gate-report.json`.

## Verifikation des Code-Stands

Der abschließende Lauf von `npm run test:code` bestand vollständig,
einschließlich **143/143 End-to-End-Tests**. Die Dialogprüfungen umfassen mobile
Bedienbarkeit ohne horizontalen Überlauf, Text-/JSON-Erhalt, Eingabefehler,
Abbruch, Doppelklickschutz, zwischenzeitlich geänderte Vorschläge sowie
serverseitige Konflikte. Die Knowledge-Regressionen prüfen zusätzlich fehlende
und veraltete Audits mit weiterhin erreichbaren editionsgenauen Reviewaufgaben.
Testprotokoll: `exports/p0-implementation-20260921/test-code-final.log`.
Dieser Code-Nachweis ersetzt weder eine Frischeattestierung noch die Datenfreigabe.

`npm run check` bestätigt die Publish-/Secret-Prüfung, sperrt aber weiterhin am
alten, an den Export vom 27.08. gebundenen Dublettenbericht mit fünf ungeklärten
historischen Kandidaten. Das ist kein Nachweis neuer produktiver Dubletten.
Der aktuelle Live-Export scheitert unabhängig davon an Bestand und Frische.
Prüfprotokoll: `exports/p0-implementation-20260921/release-readiness-final.log`.

## Freigabegrenze

Der lesende Exportversuch vor den Faktenreviews ergibt 230 Discovery-Editionen,
990 Archiveinträge, sieben gültige vollständige Frischenachweise (3,04 %) und
54,78 % Vollständigkeit. Der Rückgang von 245 auf 230 gegenüber dem 20.09.
ist zeitbedingt und wurde bereits vor der privaten Übernahme gemessen.
Die unveränderten Grenzen von mindestens 400 Discovery-Editionen und 55 % Frische
sperren den regulären Export weiterhin vor jedem Schreiben.

Nach den beiden abgeschlossenen Frischeprüfungen bestätigt der reguläre Export
um 08:11 UTC weiterhin **230 Discovery-Editionen und 990 Archiveinträge**, jetzt
aber **neun vollständige Frischenachweise (3,91 %)**. Vollständigkeit bleibt
54,78 %. Der reguläre Gate-Aufruf wurde ohne Ausnahmeoption ausgeführt und
lehnte das Schreiben ab. P0 ist daher ausdrücklich noch nicht abgeschlossen:
Weitere aktuelle Editionen und belegte Feldreviews sind erforderlich, bevor
ein neuer Export samt gebundenen Audits die vollständige Freigabe bestehen kann.

Der temporäre Adminserver ist beendet und sein Browser-Tab geschlossen. Die
isolierte Wiederherstellungsumgebung ist entfernt: genau drei eigene Container,
zwei eigene Volumes und der zuvor aufgelöste entschlüsselte Drillordner.
Andere Container und Volumes bleiben unverändert. Das verschlüsselte Backup
ist per SHA-256 unverändert erhalten; Cleanup-Nachweis:
`exports/p0-implementation-20260921/restore-cleanup.json`.

Quellenoriginale, personenbezogene Daten, Produktionsreadbacks und Backups bleiben
lokal. Die Website erhält durch diesen Arbeitsschritt keinen vollständigen Datenrelease.
