# Erneute Abnahme der Adminpflege – 01.10.2026

Der echte Pflegeweg funktioniert für die geprüfte Korrektur, gezielte
Neubestätigung und begründete Konfliktentscheidung. Die produktive Oberfläche
speicherte die Daten, lud den Datenbankstand erneut und kontrollierte die
öffentliche Detailseite. Die Pflege benötigt ein Website-Admin-Konto; ihr
Laufzeitcode hat keine Codex- oder LLM-Abhängigkeit. Dies ist keine vollständige
P0-Abnahme oder pauschale Erklärung der Gesamtfrische.

## Echtes Beispiel: Paderborner Osterlauf 2027

Event `1013`, Ausgabe `0aff21f3-678a-44c7-8c1b-b27b734a7ddf`.
Alle Produktionsänderungen erfolgten über „Admin → Events pflegen“ mit der
vorhandenen Website-Sitzung. SQL-Abfragen waren ausschließlich lesend. Keine
Testevents, zusätzlichen Editionen oder automatischen Kandidatenfreigaben.

| Vorgang | Tatsächlich geprüftes Ergebnis |
| --- | --- |
| Suche und Auswahl | 2027 und 2026 getrennt auswählbar; sechs vorhandene Wettbewerbe vorausgefüllt. |
| Korrektur bestehender Ausgabe | Kindergartenlauf `1.25 → 1.2 km`, Zusatzfeld `course.surface → Asphalt`; nur Ausgabe 2027. |
| Quelle und Vorschau | Offizielle Ausschreibung 2027, Seite 2; Vorschau zeigte genau Distanzkorrektur und neuen Untergrund. |
| Verbindliches Speichern | Commit `08:12:02.301398Z`, tatsächlicher Datenbankstand danach neu geladen. |
| Persistenz | Nach vollständigem Admin-Neuladen weiterhin Distanz `1.2` und Untergrund `Asphalt` vorausgefüllt. |
| Datum erneut bestätigen | Nur Datum angehakt; Vorschau „Keine Faktenänderungen“; Commit `08:14:33.506786Z`. |
| Gezielte Freshness | Genau drei neue Prüfungen: `edition.race_formats`, `course.surface`, `edition.start_date`, jeweils mit Quelle, Serverzeit und Bearbeiter. |
| Bestehende Zusatzdaten | 20 Gebührenphasen und Registrierungstabellen-Hash unverändert; allgemeines Wiki unverändert. |
| Veröffentlichung | Datenbankerfolg und danach „Öffentlich aktualisiert: Normale Detailseite geprüft“; Wiederholungsprüfung erfolgreich. |
| Öffentliche Anzeige | Nach normalem Neuladen `1,2 km`, `Asphalt`, `09:30`, 20 Gebührenphasen und echter Standortmarker sichtbar. |
| Karte und Liste | Ausgabe 2027 in Suche, Liste und Karteninformation erreichbar; beide öffentlichen kanonischen Views enthalten die korrigierten Wettbewerbe. |
| Konfliktentscheidung | Historischen Vorschlag mit `3,35 km / 25 km` anhand der Ausschreibung begründet abgelehnt; Commit `08:46:43.176551Z`; aus offenen Hinweisen verschwunden. |
| Keine pauschale Bestätigung durch Review | Nach der Entscheidung weiterhin genau drei neue Feldprüfungen, keine zusätzliche Edition. |
| Google Maps | „Karte öffnen“ tatsächlich angeklickt; derselbe Standort `51.7246197,8.752854` mit Routenplaner geöffnet. |

Quellen: [Ausschreibung 2027, PDF](https://www.paderborner-osterlauf.de/images/files/Ausschreibung%20DIN%20lang%202027.pdf)
und [Ausschreibung und Anmeldung](https://www.paderborner-osterlauf.de/anmeldung.html).
Die Ausschreibung nennt für den Kindergartenlauf ungefähr 1,2 km.
Abgelehnter Vorschlag: `134c3b23-c4b5-4c9c-a61a-ad83274085e7`.

Die [reguläre Eventadresse](https://sporteventmap.com/event/paderborner-osterlauf-2027/)
verwendet den vorhandenen Fallback auf die dynamische Detailroute, weil die neue
Ausgabe im alten statischen Export nicht enthalten ist. Dort werden aktuelle
Daten und bestätigte Zusatzdetails live geladen. Die vorhandenen statischen
Berlin- und Mainz-Seiten wurden nach ihrer Live-Aktualisierung ebenfalls geprüft.

## Editionsidentität und unveränderte Detailform

Vorher/nachher zwei Editionen. Historische Ausgabe 2026 unverändert:
`5f77edcfff00ed5a14c0b4521632e3df`. Ergebnisdaten unverändert:
`6c5c8c0640d9786c853fb7be18849389`. Saisonplanerdaten unverändert:
`d751713988987e9331980363e24189ce`. Paderborn hatte in dieser Produktionsabfrage
keine Saisonplanereinträge; erhaltene nicht leere Verknüpfungen wurden im echten
isolierten Abnahmestack getestet.

Stylesheetadressen, bestehende Abschnitts- und Leaflet-Klassen bleiben vor/nach
der Korrektur identisch. Der neue belegte Inhalt ergänzt den vorhandenen
Streckenabschnitt und dessen Navigationseintrag. Keine sichtbaren Rohkoordinaten
oder Importnotizen. Karte, Pin, Preisübersicht, Typografie und Akkordeons bleiben
erhalten. Gemeinsame Klassen entsprechen auch auf Berlin/Mainz dem aktuellen
Renderer. Screenshots wurden zusätzlich unabhängig visuell geprüft. Ein voller
Pixelgleichstand wäre wegen des neuen Abschnitts und der Quelle ungeeignet.

## Gefundener Fehler und kleiner Fix

Ältere Crawler-Vorschläge besitzen `original`, `value` und `unit`. Die Vorschau
zeigte diese bisher mehrfach als „Wettbewerb“. Der Fix stellt Originalbezeichnung
oder Zahl mit Einheit in Hinweis und Entscheidungsvorschau dar. Moderne Angaben,
Speicherobjekte und HTML-Escaping bleiben erhalten. Der neue Regressionstest war
vor dem Fix rot und danach grün. Die korrekte Anzeige wurde produktiv mit den
tatsächlichen alten Vorschlägen erneut geprüft.

Nur Admin-Anzeige, bestehender Vorschautest und Admin-Cacheadressen geändert.
Öffentliche Detailrenderer, CSS, Karten und Speicherpfade unverändert.

## Technische Prüfungen und ihre Aussagekraft

- Vor dem Vorschaufix 45 Browser-Fixtures: 17 Pflege-, 6 Knowledge- und 22
  Layoutfälle. Simulierte RPC-/Authantworten, kein Produktionsnachweis.
- Nach dem Fix 18/18 Admin-Browserfälle einschließlich Legacyvorschau und
  Injection-Abwehr; 23/23 Modultests bestanden.
- Echter isolierter Stack: alle 60 Migrationen, 97 Kern-SQL- und 34 Knowledge-
  SQL-Prüfungen sowie 13 Browser-Abnahmegruppen bestanden. Echte GoTrue-Anmeldung,
  PostgREST, Datenbank und anonyme reguläre Detailseite. Erfolgreiche RPCs nicht
  simuliert; keine Produktionsrequests oder Fehler.
- Dort tatsächlich geprüft: neue Editionsidentität ohne Änderung der alten
  Ausgabe; Ergebnis-/Plannerverknüpfungen; gezielte Bestätigungen; nicht geprüfte,
  leere und ausgeblendete Felder; Crawler-Feldschutz; echter HTTP409-Konflikt;
  verlorene Commitantwort/idempotente Wiederholung; Nichtadmin-Verbot; getrennte
  Speicher-/Publikationsfehler und deren Wiederholung.
- Release-Einstiegspunkte und Paketintegrität bestanden; 73 kombinierte Paket-
  und Routentests bestanden; Paketbau und Verify erfolgreich.
- Produktionsfunktionen und Feldschutz lesend mit dem geprüften Stand verglichen:
  Adminprüfung, Versionsgate und alle zwölf zugehörigen Trigger unverändert
  aktiv; heutige Feldsperren editionsbezogen mit Bearbeiter.

```powershell
$env:E2E_PORT='4191'
node tests/e2e/run-playwright.mjs tests/e2e/manual-event-maintenance.spec.mjs tests/e2e/manual-event-knowledge.spec.mjs tests/e2e/event-detail-layout-parity.spec.mjs --max-failures=2
npm.cmd run test:manual-maintenance
npm.cmd run test:manual-workflow:local
$env:E2E_PORT='4192'
node tests/e2e/run-playwright.mjs tests/e2e/manual-event-maintenance.spec.mjs --workers=1
npm.cmd run test:release-entrypoints
```

Isolierter Bericht: `exports/manual-workflow-acceptance/run-LlPWTV/acceptance-report.json`.
Testcontainer, Volumes und Webserver entfernt; die vorher gestoppte Podman-VM
wieder gestoppt. Keine neue Migration oder zusätzliche Crawlerfunktion.

## Veröffentlichter Stand v99

Quellstand `8cc927b771a5e7b30add800304fce738e83c46a8`, Fix `8d88834`.
Version `20261001-ui-only-v99`, Build `2026-10-01T08:31:49.767Z`.
Preview `https://ea80052f.sporteventmap.pages.dev`,
Produktion `https://e4a1000e.sporteventmap.pages.dev`.
Release-SHA256 `5cd86ed36f0ee081d2b05cf2068e9b5d6db70441fc319e80e98ea61e76ae1528`.

v98-Basis vor Bau und Production-Upload erneut nachgewiesen. Dasselbe geprüfte
Paket als Preview und Produktion hochgeladen. Alle 36 kritischen Dateien an der
unveränderlichen Produktions-URL stimmen exakt mit dem Paket überein.
sporteventmap.com liefert das exakte Release-Manifest und alle 28 kritischen
Nicht-HTML-Dateien mit korrektem Hash. Die aktualisierte Admin-Cacheadresse wurde
nach dem normalen Neuladen mit bestehender Website-Anmeldung sichtbar geprüft.

Die Domain fügt unsichtbare Cloudflare-Labyrinthlinks und ein Detection-Skript
ins HTML ein. Ein strikter Bytevergleich ihrer acht kritischen HTML-Dateien
konnte nicht vollständig bestätigt werden und wird nicht als bestanden
ausgegeben. Normale Browseranzeige separat kontrolliert. Kein Bot-Schutz geändert,
keine Labyrinthadresse geöffnet. Offizielle Dokumentation:
[AI Labyrinth](https://developers.cloudflare.com/bots/additional-configurations/ai-labyrinth/),
[JavaScript Detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/).

Detailrenderer, Loader, dynamische HTML-Seite, Stylesheet und Beschreibungs-
projektion sind bytegleich zu v98. 994 statische Eventseiten ändern ausschließlich
die zulässigen Versionsparameter ihrer bestehenden Skript-/Stylesheetadressen.
Datendateien, Sitemap, Runtimekonfiguration und ursprüngliche Exportzeit
`2026-08-27T07:41:01.290Z` unverändert. Heutige manuelle Änderungen liegen in der
kanonischen Datenbank, getrennt vom unveränderten Exportfallback.

## Grenzen und offener Pflegebedarf

Paderborn 2027 bleibt veröffentlicht, insgesamt aber `needs_review`.
Automatischer PDF-Abruf: `response_too_large`; MikaTiming: `robots_denied`.
Diese Fehler wurden nicht als behoben oder frisch bestätigt. Weitere offene
Hinweise bleiben sichtbar. Einzelverifikationen erhöhen gezielt die Feldfrische,
ohne die Gesamtfrische zu behaupten. P0 ist dadurch weiterhin nicht abgeschlossen.

Neue Edition, Fehlerfälle, konkurrierende Änderung und Nichtadmin-Schreibversuch
wurden ausschließlich isoliert geprüft. Kein produktiver Crawler-Schreibversuch
erzwungen; identischer Schutz lokal tatsächlich geprüft. Live-Layoutnachweise
stammen von der effektiven Desktopgröße. Die dokumentierte Viewportsteuerung
setzte eine mobile Größe in dieser Sitzung nicht wirksam um; 390/1280-Pixel-
Prüfungen stammen daher aus den Browser-Fixtures.

Nachweise: `exports/manual-browser-audit-20261001/`, insbesondere
`database-proof.json`, Layout-JSON vor/nach, Formular-/Reviewtexte,
`paderborn-before.png`, `paderborn-v99-final.png`,
`paderborn-competitions-live.png`, `paderborn-surface-live.png` und
`google-maps-paderborn.png`.

## Bedienung ohne Programmierkenntnisse

Datum bestätigen: Event und passende Ausgabe auswählen; „Angaben als weiterhin
korrekt bestätigen“ wählen. Nur am Datum „An Quelle geprüft“ markieren, Quelle
und Prüfnotiz eintragen. „Änderungen prüfen“ muss „Keine Faktenänderungen“ zeigen;
danach verbindlich speichern.

Ausgabe korrigieren: „Bestehende Ausgabe korrigieren“ wählen, falsche Angaben
ändern und geprüfte Felder markieren. Zusatzangaben stehen einklappbar unter
„Zusatzdetails für Detailseite und Event-Wiki“; Jahresangaben auf „Nur diese
Ausgabe“ beschränken. Vorschau prüfen, dann speichern. Leere Felder erhalten den
Bestand; Löschen verlangt „Bewusst entfernen“.

Nächste Edition: zunächst vorhandene Ausgaben/Kandidaten prüfen. Bei einer neuen
Ausgabe „Neue Ausgabe als Entwurf anlegen“ verwenden. Nur bekannte Daten und
angekündigte Termine eingeben. Der Entwurf erhält eine eigene Identität;
Veröffentlichen bleibt eine gesonderte geprüfte Aktion.

Öffentlichen Erfolg erkennen: auf „In der Datenbank gespeichert und neu geladen“
und anschließend „Öffentlich aktualisiert: Normale Detailseite geprüft“ achten.
„Öffentliche Detailseite öffnen“ und neu laden. Fehlt die Publikationsbestätigung,
„Öffentlichen Stand erneut prüfen“ nutzen. Datenbankerfolg allein reicht nicht.
