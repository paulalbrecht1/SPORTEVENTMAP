# P0-Weiterarbeit: echte Nettozugänge und Admin-Ladefehler

## Produktiv gespeicherte Daten

Am 06.10.2026 wurden drei bisher nicht in Discovery sichtbare deutsche
Veranstaltungsidentitäten über die angemeldete reguläre Adminpflege ergänzt.
Alle beschriebenen Werte wurden anhand aktueller Originalquellen geprüft.
Die Nachfolger erhalten eigene Editionsidentitäten; die historischen
2026-Ausgaben, ihre Termine und ihre Wettbewerbswerte bleiben erhalten.

| Veranstaltung | Gespeicherte 2027-Ausgabe | Fachliche Grenzen |
| --- | --- | --- |
| Audi Triathlon Ingolstadt powered by BÜCHL | 06.06.2027; drei Einzel- und drei Staffelwettbewerbe mit getrennten Schwimm-, Rad- und Laufdistanzen; genauerer Schwimmstart am Baggersee | Meldestart laut neuerer offizieller Nachricht erst am 31.10.2026; keine Übernahme widersprüchlicher Gebühren oder alter Metadaten |
| Klingenthal Salzkotten Marathon | 05.–06.06.2027; vier Hauptläufe und vier Kindergruppen; Stadt Salzkotten statt Paderborn, Hauptstart am Bürgerturm | Kinderkilometer für 2027 unbekannt; historische 500/1000 m werden nicht bestätigt. Special Olympics ist eine Wertung über 5/10 km, keine zusätzliche Staffel |
| GaPa Everesting-Festival | 14.–15.05.2027; sechs Wettbewerbe: Everesting Solo und drei Staffelgrößen mit je 18 Runden gesamt/59,4 km, Zugspitzing Solo mit 6 Runden/19,8 km, GaPa500 mit 1 Runde/3,3 km; Talstation Eckbauer als Veranstaltungsort | Die vorhandene 2027-Identität wurde weiterverwendet. Der optionale Community Run am 13.05. ist kein zusätzlicher Wettbewerb. Widersprüchliche Höhenmeter und Altersgrenzen wurden nicht übernommen |

Die gemeinsame Salzkotten-Identität trägt den Seriennamen ohne die alte
Ausgabennummer 17. Bestehende IDs und Slugs bleiben erhalten. Die allgemeinen
Beschreibungen enthalten keine ausgabengebundenen Jahres- oder Meldestartdaten.

Für jede neue Edition wurde eine eigene offizielle Quelle mit regulären
Defaults angelegt: aktiv, zunächst `pending`, ohne Abrufzeiten oder Contenthash.
Die aktuelle Oberfläche enthält dafür keinen Anlegen-Schritt; verwendet wurde
ein gewöhnliches, auf vier Spalten begrenztes Source-INSERT über den
Supabase-Connector. Es wurde keine Adminidentität, JWT-Rolle, Quellenprüfung
oder Freshness hergestellt. Historische Quellen wurden nicht umgebunden.

Die echten Workerabrufe erfolgten anschließend regulär:

- Ingolstadt: Adminaktion „Jetzt pruefen“, HTTP 200, abgeschlossen
  06.10.2026 um 14:55:05 UTC, `success/first_seen`, Robots erlaubt, null Fehler.
- Salzkotten: Scheduler, HTTP 200, abgeschlossen um 15:00:11 UTC,
  `success/first_seen`, Robots erlaubt, null Fehler.
- GaPa: Scheduler, HTTP 200, abgeschlossen um 15:30:09 UTC,
  `success/first_seen`, Robots erlaubt, null Fehler.

Ingolstadts generischer Seitentitel und veraltete 2026-Socialbeschreibung
wurden über die echte Adminoberfläche abgelehnt. Das aktuelle neutrale
Veranstaltungsfoto wurde nach unabhängiger Sichtprüfung angenommen.
GaPas generischer Homepage-Titel und der auf eine einzige Rundenlänge
verkürzte Programmvorschlag wurden ebenfalls begründet über die echte
Adminoberfläche abgelehnt. Die beiden Warnungen für fehlendes Bild und
Veranstalter bleiben offen; sie sind keine Vollnachweise.
Quellen: [Ingolstadt 2027](https://triathlon-ingolstadt.de/ausschreibung-triathlon-2027/),
[neuer Meldestart](https://triathlon-ingolstadt.de/meldestart-%E2%8F%B3-new-date-same-goal-%F0%9F%94%A5/),
[Salzkotten](https://salzkotten-marathon.de/),
[2027-Kinderinformationen](https://salzkotten-marathon.de/infos/),
[GaPa-Veranstalter](https://www.everesting-festival.com/),
[GaPa-Anmeldung 2027](https://www.planb-registration.de/everesting2027).

## Autoritativer öffentlicher Snapshot

Gemeinsame Messung des Katalogs und des autoritativen Frische-Guards über
`get_public_event_catalog_snapshot`, **06.10.2026 15:34:54 UTC / 17:34:54 MESZ**.

| Kennzahl | Vorher, 14:16:58 UTC | Nachher, 15:34:54 UTC |
| --- | ---: | ---: |
| Discovery-Identitäten | 193 | 196 |
| Davon Deutschland | 143 | 146 |
| Veröffentlichte Archiv-Editionen | 992 | 995 |
| Strukturell vollständige Discovery-Zeilen | 99 | 102 |
| Gültige vollständige Nachweise | 5 | 5 |

Alle drei neuen öffentlichen Detailseiten wurden zusätzlich tatsächlich im
Browser gelesen. Ein unabhängiger Readback bestätigt für Ingolstadt die
vollständige Unverändertheit der alten Editions- und Sourcezeile. Bei
Salzkotten wurden alle 38 geschützten öffentlichen 2026-Felder und die
verfügbaren privaten Vorherwerte verglichen; mangels vollständiger privater
Baseline wird keine vollständige Bytegleichheit behauptet.
Für GaPa wurden die vollständigen historischen Editions- und Sourcezeilen
gegen die gespeicherte Baseline verglichen: beide unverändert. Nur die
gemeinsamen Venueangaben und die allgemeine Beschreibung wurden korrigiert.

Es fehlen damit noch mindestens 204 Nettozugänge bis 400. Bei genau 400
Discovery-Identitäten sind 220 gültige Vollnachweise erforderlich, derzeit
also 215 zusätzliche. Die normale Datenfreigabe bleibt gesperrt.

## Frischenachweise und konkreter Engpass

Ein erfolgreicher Quellenabruf ersetzt keinen Vollnachweis.
Ingolstadts und GaPas 14 Kernfelder sind fachlich vorbereitet, der gebundene Adminreview
steht noch aus. Bei Salzkotten bleibt `distances` ausdrücklich unsicher:
ein vollständiges Programm mit unbekannten Kinderkilometern bestätigt die
fehlenden Kilometerwerte nicht. Der Vollbestätigungsdialog wurde abgebrochen;
`needs_review` bleibt erhalten. Die konkrete Lücke steht im gespeicherten
Adminvermerk. Der vorhandene Dialog unterstützt keine Teilattestierung.

Die reguläre Datenqualitätsansicht scheiterte beim Laden mehrfach. Tatsächliche
PostgREST- und PostgreSQL-Logs belegen HTTP 500, SQLSTATE `57014` und
„canceling statement due to statement timeout“. Die Rolle `authenticated`
hat ein Statementlimit von acht Sekunden. Das ist kein belegter Schema- oder
Kinderlauf-Castfehler. Ein zwischenzeitlich erfolgreicher Refresh behebt das
wiederholte Problem nicht.

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
