# P0-Weiterarbeit: echte Nettozugänge und Admin-Ladefehler

## Produktiv gespeicherte Daten

Am 06.10.2026 wurden fünf bisher nicht in Discovery sichtbare deutsche
Veranstaltungsidentitäten über die angemeldete reguläre Adminpflege ergänzt.
Alle beschriebenen Werte wurden anhand aktueller Originalquellen geprüft.
Die Nachfolger erhalten eigene Editionsidentitäten; die historischen
2026-Ausgaben, ihre Termine und ihre Wettbewerbswerte bleiben erhalten.

| Veranstaltung | Gespeicherte 2027-Ausgabe | Fachliche Grenzen |
| --- | --- | --- |
| Audi Triathlon Ingolstadt powered by BÜCHL | 06.06.2027; drei Einzel- und drei Staffelwettbewerbe mit getrennten Schwimm-, Rad- und Laufdistanzen; genauerer Schwimmstart am Baggersee | Meldestart laut neuerer offizieller Nachricht erst am 31.10.2026; keine Übernahme widersprüchlicher Gebühren oder alter Metadaten |
| Klingenthal Salzkotten Marathon | 05.–06.06.2027; vier Hauptläufe und vier Kindergruppen; Stadt Salzkotten statt Paderborn, Hauptstart am Bürgerturm | Kinderkilometer für 2027 unbekannt; historische 500/1000 m werden nicht bestätigt. Special Olympics ist eine Wertung über 5/10 km, keine zusätzliche Staffel |
| GaPa Everesting-Festival | 14.–15.05.2027; sechs Wettbewerbe: Everesting Solo und drei Staffelgrößen mit je 18 Runden gesamt/59,4 km, Zugspitzing Solo mit 6 Runden/19,8 km, GaPa500 mit 1 Runde/3,3 km; Talstation Eckbauer als Veranstaltungsort | Die vorhandene 2027-Identität wurde weiterverwendet. Der optionale Community Run am 13.05. ist kein zusätzlicher Wettbewerb. Widersprüchliche Höhenmeter und Altersgrenzen wurden nicht übernommen |
| Taubertal Trail | 10.07.2027; fünf Trails über ausgeschriebene 60/33/23/11/5 km, zwei Hike-/Walkingangebote über 11/5 km und Kids Trail; Start/Ziel Haardtstadion in Adelshofen statt Rothenburg-Stadtmitte | Die vorhandene 2027-Identität wurde weiterverwendet. Kids 0,5 km bezeichnet den 500-m-Parcours mit optionalen weiteren Runden, ausdrücklich im Label erhalten. Ältere GPX-Routentitel sind kein exakter 2027-Vermessungsnachweis |
| Weidatalcross – Weißendorf | 04.09.2027; offenes Runtix-2027-Portal, Veranstaltungsort Ortsstraße 8 mit offiziellem Venue-Marker, drei Kinder-/Jugendformate mit 0,6/2/4 km und zwei Erwachsenenformate | Classic 8 km+ und Extrem 17 km+ bleiben ohne numerischen `distance_km`; die Pluszeichen sind auch öffentlich erhalten. Keine Übernahme alter 2026-Zeitpläne oder Altersregeln; `distances` bleibt unsicher, kein Vollnachweis |

Die gemeinsame Salzkotten-Identität trägt den Seriennamen ohne die alte
Ausgabennummer 17. Bestehende IDs und Slugs bleiben erhalten. Die allgemeinen
Beschreibungen enthalten keine ausgabengebundenen Jahres- oder Meldestartdaten.

Für jede neue Edition wurde eine eigene offizielle Quelle mit regulären
Defaults angelegt: aktiv, zunächst `pending`, ohne Abrufzeiten oder Contenthash.
Die aktuelle Oberfläche enthält dafür keinen Anlegen-Schritt; verwendet wurde
ein gewöhnliches, auf vier Spalten begrenztes Source-INSERT über den
Supabase-Connector. Durch dieses Source-INSERT wurde keine Adminidentität,
JWT-Rolle, Quellenprüfung oder Freshness hergestellt. Historische Quellen
wurden nicht umgebunden. Die späteren Vollprüfungen erfolgten getrennt über
die echte angemeldete Adminoberfläche.

Die echten Workerabrufe erfolgten anschließend regulär:

- Ingolstadt: Adminaktion „Jetzt pruefen“, HTTP 200, abgeschlossen
  06.10.2026 um 14:55:05 UTC, `success/first_seen`, Robots erlaubt, null Fehler.
- Salzkotten: Scheduler, HTTP 200, abgeschlossen um 15:00:11 UTC,
  `success/first_seen`, Robots erlaubt, null Fehler.
- GaPa: Scheduler, HTTP 200, abgeschlossen um 15:30:09 UTC,
  `success/first_seen`, Robots erlaubt, null Fehler.
- Taubertal: Scheduler, HTTP 200, abgeschlossen um 16:15:04 UTC,
  `success/first_seen`, Robots erlaubt, null Fehler.
- Weidatal: Adminaktion „Jetzt pruefen“, HTTP 200, abgeschlossen um
  16:23:41 UTC, `success/first_seen`, Robots erlaubt, null Fehler.

Ingolstadts generischer Seitentitel und veraltete 2026-Socialbeschreibung
wurden über die echte Adminoberfläche abgelehnt. Das aktuelle neutrale
Veranstaltungsfoto wurde nach unabhängiger Sichtprüfung angenommen.
GaPas generischer Homepage-Titel und der auf eine einzige Rundenlänge
verkürzte Programmvorschlag wurden ebenfalls begründet über die echte
Adminoberfläche abgelehnt. Die beiden Warnungen für fehlendes Bild und
Veranstalter bei GaPa bleiben offen; sie sind keine Vollnachweise.
Taubertals Jahres-/Countdown-Seitentitel und ausgabengebundene Werbebeschreibung
wurden ebenfalls begründet abgelehnt. Das tatsächlich geladene generische
Markenbild ohne Jahr/Datum/Anmelde- oder Distanztext wurde nach unabhängiger
Pixelprüfung angenommen. Weidatals Quellenlauf erzeugte keine offenen
Feldvorschläge. Diese einzelnen Entscheidungen ersetzen keine Vollprüfung.
Quellen: [Ingolstadt 2027](https://triathlon-ingolstadt.de/ausschreibung-triathlon-2027/),
[neuer Meldestart](https://triathlon-ingolstadt.de/meldestart-%E2%8F%B3-new-date-same-goal-%F0%9F%94%A5/),
[Salzkotten](https://salzkotten-marathon.de/),
[2027-Kinderinformationen](https://salzkotten-marathon.de/infos/),
[GaPa-Veranstalter](https://www.everesting-festival.com/),
[GaPa-Anmeldung 2027](https://www.planb-registration.de/everesting2027),
[Taubertal-Programm](https://www.taubertal-trail.de/informationen),
[Taubertal-Strecken 2027](https://www.taubertal-trail.de/strecken),
[Weidatal-Veranstalter](https://weidatalcross.de/),
[Weidatal-Programm 2027](https://runtix.com/sts/10021/3222).

## Autoritativer öffentlicher Snapshot

Gemeinsame Messung des Katalogs und des autoritativen Frische-Guards über
`get_public_event_catalog_snapshot`, **06.10.2026 16:30:35 UTC / 18:30:35 MESZ**.

| Kennzahl | Vorher, 14:16:58 UTC | Zwischenstand, 15:34:54 UTC | Abschlussmessung, 16:30:35 UTC |
| --- | ---: | ---: | ---: |
| Discovery-Identitäten | 193 | 196 | 198 |
| Davon Deutschland | 143 | 146 | 148 |
| Veröffentlichte Archiv-Editionen | 992 | 995 | 997 |
| Strukturell vollständige Discovery-Zeilen | 99 | 102 | 104 |
| Gültige vollständige Nachweise | 5 | 5 | 8 |

Alle fünf neuen öffentlichen Detailseiten wurden zusätzlich tatsächlich im
Browser gelesen. Ein unabhängiger Readback bestätigte für Ingolstadt vor der
Bildannahme um 15:03:44 UTC die vollständige Unverändertheit der alten
Editions- und Sourcezeile. Die Bildannahme änderte anschließend am historischen
2026-Editionsrecord ausschließlich `verification_status` von `stale` auf
`needs_review` und `updated_at`; ihre Geschäftsdaten und Source blieben erhalten. Bei
Salzkotten wurden alle 38 geschützten öffentlichen 2026-Felder und die
verfügbaren privaten Vorherwerte verglichen; mangels vollständiger privater
Baseline wird keine vollständige Bytegleichheit behauptet.
Für GaPa und Weidatal wurden die vollständigen historischen Editions- und
Sourcezeilen gegen die gespeicherten Baselines verglichen: jeweils unverändert.
Bei Taubertal waren beide vollständigen Zeilen nach der gemeinsamen Ortspflege
und 2027-Publikation unverändert; die Bildannahme um 16:20:23 UTC änderte danach
ebenfalls nur Prüfmetadaten: `verification_status` von `stale` auf `needs_review`,
`review_priority` von `medium` auf `high` und `updated_at`. Der 2026-Termin,
das historische Programm, IDs und alle Quellen
bleiben erhalten. Die gemeinsamen Venueangaben und allgemeinen Beschreibungen
wurden anhand jahresunabhängiger Belege korrigiert.

Es fehlen damit noch mindestens 202 Nettozugänge bis 400. Bei genau 400
Discovery-Identitäten sind 220 gültige Vollnachweise erforderlich, derzeit
also 212 zusätzliche. 8 / 198 = 4,04 % liegen unter der unveränderten
55-%-Grenze; 104 / 198 = 52,53 % erfüllen nur die strukturelle 45-%-Grenze.
Strukturelle Vollständigkeit bestätigt keine fachlich unbekannten Kilometer.
Wenn alle 202 erforderlichen Nettozugänge zum Zielzeitpunkt selbst frische
Vollnachweise haben und die heutigen acht gültig bleiben, braucht es außerdem
mindestens zehn Bestandsreviews. Das ist ein bedingtes Szenario, keine Zusage.
Die normale Datenfreigabe bleibt gesperrt.

## Frischenachweise und konkreter Engpass

Ein erfolgreicher Quellenabruf ersetzt keinen Vollnachweis. Die drei
gebundenen 14-Feld-Prüfungen wurden jetzt über die echte Adminsession gespeichert
und unabhängig mit den aktuellen Werten, der jeweiligen 2027-Source, dem
Admin-Audit und dem autoritativen Guard nachgelesen:

| Edition | Letzte Feldprüfung UTC (`last_verified_at`) | Source-ID | Autoritativer Guard |
| --- | --- | --- | --- |
| GaPa 2027 | 15:55:41 | `8e417a40-91a6-4ad8-bc5e-dfec93335e40` | `true` |
| Ingolstadt 2027 | 15:57:21 | `5375da76-80c2-4208-a32a-f81a8ba3cee6` | `true` |
| Taubertal 2027 | 16:22:41 | `21a6d845-e803-4982-80ea-32ae6fbce8bf` | `true` |

Jeweils alle 14 Pflichtfelder bestätigt, keine unsicheren Pflichtfelder,
`needs_review=false`, nächste Prüfung am 05.11.2026. GPS bestätigt den belegten
Veranstaltungsort; kein metergenauer Startliniennachweis wird behauptet.
Optionale widersprüchliche Höhenmeter, Gebühren oder Altersregeln wurden nicht
mitbestätigt. Die normalen öffentlichen Seiten zeigen den Prüfzeitpunkt.

Bei Salzkotten bleibt `distances` ausdrücklich unsicher:
ein vollständiges Programm mit unbekannten Kinderkilometern bestätigt die
fehlenden Kilometerwerte nicht. Der Vollbestätigungsdialog wurde abgebrochen;
`needs_review` bleibt erhalten. Die konkrete Lücke steht im gespeicherten
Adminvermerk. Auch Weidatal behält wegen der ungenauen Erwachsenenstrecken
`needs_review=true`, ohne `last_verified_at` oder gebundene Vollattestierung.
Der vorhandene Dialog unterstützt keine Teilattestierung.

Die reguläre Datenqualitätsansicht scheiterte beim Laden mehrfach. Tatsächliche
PostgREST- und PostgreSQL-Logs belegen HTTP 500, SQLSTATE `57014` und
„canceling statement due to statement timeout“. Die Rolle `authenticated`
hat ein Statementlimit von acht Sekunden. Das ist kein belegter Schema- oder
Kinderlauf-Castfehler. Ein zwischenzeitlich erfolgreicher Refresh behebt das
wiederholte Problem nicht. Die drei heute abgeschlossenen Vollreviews gelangen
nach erfolgreichen Ladungen der unveränderten produktiven Version
`20261006-ui-only-v142`; der vorbereitete Loaderfix ist dadurch nicht deployed.

Die bisherige Adminansicht startet 15 Kernladewege parallel; die paginierten
Ladewege fordern auf jeder Seite zusätzlich `count: exact` an. Der korrigierte
Loader liest diese Kernbereiche ohne Exact Count und mit höchstens drei
parallelen Ladewegen. Vollständige Aktualisierungsläufe werden nacheinander
ausgeführt; jeder Aufruf liest neu, auch nach einer Schreiboperation.
Die Pagination verwendet stabile IDs und eine leere Endprobe, unabhängig von
der tatsächlichen Backend-Seitengröße. Eine separate Probe trennt genau
100.000 vollständige Zeilen von einem abgeschnittenen Bestand. Fehler und
Abschneiden sperren weiterhin die Prüfaktionen; alte Inboxaktionen werden
bei einem fehlgeschlagenen Kernlauf entfernt. Zeitlimits, RLS und
Freshness-Gates werden nicht geändert.

Nachgelagerte optionale StageFour-Bereiche behalten ihre bisherigen parallelen
Ladewege und Exact Counts. Die hier belegten fehlenden StageFour-Tabellen
werden separat behandelt und sperren die erfolgreich geladene Kern-Inbox
nicht. Dafür stehen Code- und VM-Belege zur Verfügung; ein StageFour-
Statementtimeout ist in den ausgewerteten Produktionslogs nicht belegt.

Die unabhängige Codeprüfung fand keine neuen P0-/P1-Befunde. Alle 17 gezielten
Loader-Regressionsprüfungen bestanden. `npm run test:code` bestand vollständig,
einschließlich aller 258 Browserprüfungen auf Desktop und Mobilgeräten.
`audit:anon` und `audit:freshness:production` bestanden erneut lesend.
`npm run check` bleibt mit dem unveränderten alten 36-Spalten-Fallbackschema
gesperrt; der technische Testlauf ist keine fachliche Datenfreigabe.
Ein Produktionsnachweis der Wirkung steht vor dem separaten,
ausdrücklich zu beauftragenden UI-Release noch aus. Der normale Datenrelease
bleibt gesperrt; ein UI-Release erhält das nachgewiesene alte Datenpaket.

Private Originalbelege, Manifeste, Readbacks, Logdiagnosen und Browsernachweise
liegen ausschließlich unter dem ignorierten `exports/p0-weiter-20261006/`.
P1 bleibt hinter dem noch offenen P0-Datenabschluss zurückgestellt.
