# P1 Event-Qualitätsbatch 02 – 26. August 2026

## Ziel

Der zweite Batch korrigiert unmittelbar bevorstehende deutsche Veranstaltungen
aus der P1-Review-Queue. Fakten wurden nur übernommen, wenn sie am 26. August
2026 auf einer offiziellen Veranstalter- oder Anmeldeseite nachvollziehbar
waren.

Die ausführbare und wiederholbare Wartungsdatei liegt unter
`supabase/maintenance/20260826_p1_event_quality_batch_02.sql`. Sie löst die neun
Events über `canonical_name` und `edition_year` auf, prüft transaktionale Vor-
und Nachbedingungen und nutzt die vorhandenen Audit-Trigger mit
`change_source=manual_admin`.

## Verifizierte Änderungen

| Event | Kernaussage der offiziellen Quelle | Übernommene Änderung |
| --- | --- | --- |
| 15. Brunsberglauf | 06.09.2026; Kinderläufe sowie 5 km, 11,7 km und Halbmarathon | Ort, Distanzen, Beschreibung und direkter RaceResult-Link korrigiert |
| Bahndammlauf | 06.09.2026; 400 m, 5 km, 10 km, Walking, Wandern und 21,2 km | Ort, Formate, Beschreibung und direkter RaceResult-Link korrigiert |
| BORSIG Halbmarathon | 06.09.2026; Kinderlauf, 4,7 km, 10 km, Halbmarathon und Staffel | Distanzen, Beschreibung und direkter RaceResult-Link korrigiert |
| Canyon Run Mühlheim | 06.09.2026; 400 m, 800 m, 5 km, 10 km und Halbmarathon | Veranstaltungsort, Distanzen und direkter Anmeldelink korrigiert |
| City Marathon Bremerhaven | 06.09.2026; Kinder-, Firmen-, 5-km-, 10-km-, Halbmarathon-, Marathon- und Staffelangebote | Formate, Beschreibung und direkter RaceResult-Link korrigiert |
| DresdenHALF | 06.09.2026; Halbmarathon, Online-Anmeldung bis 31.08.2026 | Distanz, Beschreibung, Anmeldestatus und Anmeldelink korrigiert |
| Flensburg liebt dich Marathon | 06.09.2026; Kinderlauf, 5 km, 10 km, Halbmarathon, Marathon und Staffel | Formate, Beschreibung und direkter Davengo-Anmeldelink korrigiert |
| Fränkische Schweiz Marathon | 05.–06.09.2026; Lauf-, Staffel-, Kinder-, Run-and-Bike- und Handbike-Angebote | Datumsbereich, Formate, Beschreibung und Bär-Service-Anmeldelink korrigiert |
| Köln Triathlon | 06.09.2026; Sprint-, olympische und Mitteldistanz sowie zwei Staffeln; 2026 ausverkauft | Formate und Beschreibung korrigiert; Anmeldung auf `sold_out` gesetzt |

Offizielle Evidenzseiten:

- Brunsberglauf: <https://www.brunsberglauf.de/>,
  <https://www.brunsberglauf.de/ausschreibung.html> und
  <https://my.raceresult.com/377289/registration>
- Bahndammlauf: <https://bahndammlauf.de/alles-zum-lauf/> und
  <https://my.raceresult.com/385372/registration>
- BORSIG Halbmarathon: <https://borsighalbmarathon.de/> und
  <https://my.raceresult.com/359915/registration>
- Canyon Run: <https://canyon-run.de/> und
  <https://canyon-run.de/pages/registration-form>
- City Marathon Bremerhaven: <https://www.bremerhaven-marathon.de/> und
  <https://my.raceresult.com/360287/registration>
- DresdenHALF: <https://dresden-half.com/> und
  <https://dresden-half.com/anmeldung>
- Flensburg liebt dich Marathon: <https://flensburg-marathon.de/>,
  <https://flensburg-marathon.de/anmeldung> und
  <https://www.davengo.com/event/overview/8-flensburg-liebt-dich-marathon-2026>
- Fränkische Schweiz Marathon: <https://www.fs-marathon.de/>,
  <https://www.fs-marathon.de/anmeldung.html> und
  <https://baer-service.de/anmeldung/FSM>
- Köln Triathlon: <https://www.koeln-triathlon.com/> und
  <https://www.koeln-triathlon.com/ausverkauft-koeln-triathlon-knackt-naechsten-melderekord/>

## Queue- und Monitoring-Bereinigung

- 15 offene `content_changed`-Aufgaben der neun Editionen wurden nach der
  faktischen Abstimmung auf `resolved` gesetzt.
- 5 direkte Anmeldeplattformen wurden als eigenständige operative Quellen mit
  Priorität 20 ergänzt: vier RaceResult-Seiten und Bär-Service.
- Alle fünf neuen Quellen wurden anschließend von Edge-Function-Version 18
  erfolgreich verarbeitet. Sie stehen auf `success`, haben null aufeinander-
  folgende Fehler und verwenden Worker-Version
  `source-monitor-4.1.3-phase-a-shadow-third-party-successor-gate`.
- Davengo wurde für Flensburg als öffentlicher Anmeldelink übernommen, aber
  bewusst nicht als Crawler-Quelle angelegt: Die Plattform liefert dem
  vorhandenen Monitor regelmäßig nur eine skriptbasierte leere Inhaltsfläche.

## Kennzahlen unmittelbar nach dem Batch

| Kennzahl | Vorher | Nachher | Veränderung |
| --- | ---: | ---: | ---: |
| Aktuelle Discovery-Events | 432 | 432 | 0 |
| Frische Events | 270 | 279 | +9 |
| Stale/Review erforderlich | 162 | 153 | −9 |
| Freshness | 62,50 % | 64,58 % | +2,08 Prozentpunkte |
| Vollständige Events | 206 | 210 | +4 |
| Completeness | 47,69 % | 48,61 % | +0,92 Prozentpunkte |
| Review-Rate | 37,50 % | 35,42 % | −2,08 Prozentpunkte |
| Deutsche P1-Events in den nächsten 8 Wochen | 55 | 46 | −9 |

Der Source-Health-Wert lag direkt nach dem Einspielen bei 38,43 %, weil die fünf
neuen Quellen zu diesem Zeitpunkt noch keinen ersten Crawl hatten. Nach ihrer
erfolgreichen Verarbeitung lag er am 27. August 2026 bei 38,52 %.

## Aktueller Produktionsstand am 27. August 2026

Der nächtliche Lifecycle-Lauf hat unabhängig vom Batch eine weitere Edition aus
der aktuellen Discovery genommen und das rollierende Acht-Wochen-Fenster
verschoben. Der danach neu erzeugte öffentliche Katalog enthält:

- 431 aktuelle Discovery-Editionen
- 994 öffentliche Archiv-Editionen und 994 statische Detailseiten
- 64,04 % Freshness
- 48,49 % Completeness
- 35,96 % Review-Rate
- 48 deutsche P1-Events innerhalb der nächsten acht Wochen

Diese Momentaufnahme ersetzt den Export vom Vorabend; sie ist kein Rücklauf der
neun verifizierten Batch-Änderungen.

## Verifikation

- Transaktionale Vor- und Nachbedingungen: bestanden
- Produktions-Audit: 103 Editions- und 155 Event-Feldänderungen mit
  einheitlichem Änderungsgrund und `manual_admin`
- Source-Monitor: alle fünf neu angelegten Quellen erfolgreich verarbeitet
- Öffentlicher Export: 431 Discovery- und 994 Archiv-Editionen
- Katalog-Release-Gate und Publish-Readiness: bestanden
- Daten-, Workflow-, Lifecycle-, Source-Monitor-, Responsive- und
  Qualitätsprüfungen: bestanden
- Live-Audit für anonyme Rechte: bestanden
- Playwright: vollständiger Neulauf mit 61 von 61 Tests bestanden; ein zuvor
  gemessener einzelner Scroll-Ausreißer war in drei direkten Wiederholungen
  nicht reproduzierbar
- Daten-Audit: 0 kritische und 0 datumsbezogene Warnungen; die bestehenden 25
  Geo-Warnungen erzeugen keine automatischen Korrekturen
- Supabase Advisor unverändert zum Ausgangsstand: 6 Sicherheitswarnungen
  (5 bewusst geschützte `SECURITY DEFINER`-Funktionen und deaktivierter
  Leaked-Password-Schutz) sowie 55 Performance-Hinweise

Referenz zur späteren Advisor-Bereinigung:

- <https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable>
- <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>
- <https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys>
- <https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index>

## Bewusst zurückgestellt

Der Burgwald Märchen Marathon, der Volkslauf des TSV Breuna und der Fulda
Marathon bleiben unverändert in der Review-Queue. Ihre offiziellen Seiten waren
während der Prüfung nicht zuverlässig erreichbar oder lieferten keine
ausreichend belastbare aktuelle Evidenz. Ohne offizielle Bestätigung wurden
keine Daten angepasst.
