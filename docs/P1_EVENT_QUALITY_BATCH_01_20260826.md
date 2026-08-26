# P1 Event-Qualitätsbatch 01 – 26. August 2026

## Ziel

Der Batch korrigiert unmittelbar bevorstehende deutsche Veranstaltungen aus der
P1-Review-Queue. Fakten werden nur übernommen, wenn sie am 26. August 2026 auf
einer offiziellen Veranstalter- oder Anmeldeseite nachvollziehbar waren.

Die ausführbare und wiederholbare Wartungsdatei liegt unter
`supabase/maintenance/20260826_p1_event_quality_batch_01.sql`. Sie löst Events
über `canonical_name` und `edition_year` auf, prüft Vor- und Nachbedingungen und
nutzt die vorhandenen Audit-Trigger mit `change_source=manual_admin`.

## Verifizierte Änderungen

| Event | Kernaussage der offiziellen Quelle | Übernommene Änderung |
| --- | --- | --- |
| Birklauf | 29.08.2026; 750 m, 2,5 km, 5 km, 16,04 km; Nachmeldung vor Ort | Distanzen, Anmeldestatus/-link, Region und kanonische URL korrigiert |
| Edersee-Lauf | Der Lauf am 29.08.2026 fällt wegen des Grillhütten-Neubaus aus | Edition und Anmeldung auf `cancelled`; aus Discovery entfernt |
| 30. Lauf um den Arendsee | 30.08.2026; sechs Formate; Anmeldung geöffnet | Ort, Distanzen und Anmeldestatus korrigiert |
| Altra Sunset Wattenmeer | 29./30.08.2026; drei Teamgrößen; Meldeschluss verstrichen | Datumsbereich, Formate und Anmeldestatus korrigiert |
| Blankeneser Heldenlauf | 30.08.2026; 6,5/11/21/21/6,8 km; RaceResult verfügbar | Ort, fünf Formate und direkter Anmeldelink korrigiert |
| Koberstädter Waldmarathon | 30.08.2026; Bambini, 5 km, 10 km, Halbmarathon | Distanzen, Beschreibung und direkter Anmeldelink korrigiert |
| Kölner Halbmarathon | 30.08.2026; 7/14/21/28 km; begrenzte Nachmeldung | Distanzen, Beschreibung und Anmeldestatus korrigiert |
| Fehmarn Marathon | 05.09.2026; 1,4/5/12/21,1/42,2 km; Anmeldung bis 02.09. bzw. vor Ort | Distanzen, Beschreibung und STGK-Anmeldelink korrigiert |
| Usedom Marathon | 05.09.2026; Marathon, Halbmarathon, Fünferstaffel | Formate, Beschreibung und RaceResult-Anmeldelink korrigiert |

Offizielle Evidenzseiten:

- <https://www.mtv-gelting-08.de/?catid=50&id=169&view=article>
- <https://svherzhausen.de/laufcup/>
- <https://kersten-friedrich-events.com/lauf-um-den-arendsee/>
- <https://www.sunset-series.de/infos-wattenmeer/>
- <https://www.heldenlauf.de/>
- <https://www.koberstaedter-marathon.de/>
- <https://koelner-halbmarathon.de/>
- <https://fehmarn-marathon.de/>
- <https://usedom-marathon.com/marathon-overview/>

## Queue- und Monitoring-Bereinigung

- 9 offene `content_changed`-Aufgaben wurden nach der faktischen Abstimmung
  auf `resolved` gesetzt.
- 5 Fehmarn-2027-Kandidaten wurden als Fehlalarme abgelehnt und ihre Aufgaben
  ignoriert. Die Tourismusseite rotierte nicht zum Marathon gehörende Termine.
- 5 direkte Anmeldeplattformen wurden als eigenständige operative Quellen mit
  Priorität 20 ergänzt.
- Der Source Monitor akzeptiert seit Edge-Function-Version 18 auf
  `third_party_platform` keine einzelne sichtbare Datumsangabe mehr als neue
  Austragung. Dafür ist nun benannte JSON-LD-Eventevidenz erforderlich.

## Kennzahlen

| Kennzahl | Vorher | Nachher | Veränderung |
| --- | ---: | ---: | ---: |
| Aktuelle Discovery-Events | 433 | 432 | −1 abgesagte Edition |
| Frische Events | 262 | 270 | +8 |
| Stale/Review erforderlich | 171 | 162 | −9 |
| Freshness | 60,51 % | 62,50 % | +1,99 Prozentpunkte |
| Vollständige Events | 205 | 206 | +1 |
| Completeness | 47,34 % | 47,69 % | +0,35 Prozentpunkte |
| Source Health | 39,26 % | 38,66 % | vorübergehend −0,60 Prozentpunkte |

Der kurzfristige Source-Health-Rückgang entsteht durch die fünf neu angelegten
Anmeldequellen. Der erste reguläre Lauf von Edge-Function-Version 18 hat drei
davon verarbeitet: Koberstadt erfolgreich, Birklauf mit leerem Inhalt und
Fehmarn wegen nicht erreichbarer `robots.txt` im kontrollierten Retry-Pfad.
Heldenlauf und Usedom waren zum Messzeitpunkt noch fällig eingereiht. Die
Quellen werden erst nach erfolgreichem Crawl als gesund gezählt.

## Verifikation

- Transaktionale Vor- und Nachbedingungen: bestanden
- Öffentliche Discovery: 8 korrigierte aktive Events vorhanden, Edersee-Lauf
  nicht mehr enthalten
- Audit-Log: alle Event-/Editionsänderungen mit einheitlichem Änderungsgrund
  und `manual_admin` vorhanden
- Source-Monitor- und Lifecycle-Regressionstests: bestanden
- Edge-Function-Version 18: erster regulärer 15-Minuten-Lauf erfolgreich
- Öffentlicher Export: 432 Discovery- und 994 Archiv-Editionen
- Katalog-Release-Gate: bestanden

## Bewusst zurückgestellt

Der Burgwald Märchen Marathon bleibt in der Review-Queue. Die offizielle Seite
war während der Prüfung nicht zuverlässig erreichbar; ohne belastbare Evidenz
wurde keine Änderung vorgenommen.
