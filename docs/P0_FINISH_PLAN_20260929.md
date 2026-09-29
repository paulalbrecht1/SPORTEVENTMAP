# P0-Abschlussplan – 29. September 2026

Stand der lesenden Produktionsmessung: **29.09.2026, 11:33 UTC**.
P0 bleibt offen. Beide Migrationen und das Frontend **v90 sind produktiv
ausgerollt und geprüft**. Betriebsstand: 29.09.2026, 12:39 UTC. Ein Cacheproblem
bei bereits geöffneten Adminsitzungen wird mit v91 korrigiert; diese Korrektur
ist noch in Arbeit. Fachliche Pilotänderungen wurden bislang nicht gespeichert.
Die folgende Reihenfolge konzentriert den Aufwand auf echte Katalogzugänge und
gezielte Quellenprüfungen. Der tägliche Pflegeweg benötigt keine LLM-Aufrufe.

## Ausgangspunkt und unveränderte Grenzen

| Kennzahl | Gemessener Stand | Releasegrenze |
| --- | ---: | ---: |
| Aktive Discovery-Einträge | 210, davon 160 in Deutschland | mindestens 400 |
| Veröffentlichte Archiv-Editionen | 990 | effektiv mindestens 974 |
| Gültige vollständige Frischenachweise | 4 von 210 = 1,90 % | mindestens 55 % |
| Vollständige Discovery-Einträge | 110 von 210 = 52,38 % | mindestens 45 % |
| Export und daran gebundene Audits | noch kein neuer freigegebener Datenrelease | Export höchstens 24 Stunden alt; gültige gebundene Audits |

Für genau 400 sichtbare Einträge wären 220 gültige Vollnachweise erforderlich.
Gegenüber dieser Momentaufnahme fehlen damit **mindestens 190 Nettozugänge und
216 zusätzliche Vollnachweise**. Falls alle 190 Zugänge vollständig frisch
veröffentlicht werden und die vier bisherigen Nachweise gültig bleiben, fehlen
noch 26 Bestandsreviews. Das ist eine Rechenuntergrenze, keine Arbeitszusage:
Abgänge, auslaufende Nachweise und neue Quellenkonflikte erhöhen den Bedarf.

Die vier momentan frischen Fälle sind Ratzeburger Adventslauf 446 und FSV-Lauf
383 mit nächster Prüfung am 05.10. sowie MidSummerRun 695 und GVG-Winterstaffel
Pulheim 153 am 08.10. Eine frühere Quellenänderung kann zusätzliche Prüfung
auslösen. Vollständigkeit ersetzt keinen Frischenachweis.

Eine Projektion nach den tatsächlichen Discovery-Viewregeln ergibt **ohne neue
Änderungen**:

| Abstand zur Messung | Weiter sichtbare Einträge | Lücke bis 400 |
| --- | ---: | ---: |
| 7 Tage | 191 | 209 |
| 14 Tage | 166 | 234 |
| 30 Tage | 134 | 266 |

Das sind datumsbasierte Szenarien, keine sicheren Zukunftsbestände. Vor jedem
Paket und vor dem Release werden tatsächlicher Bestand und Frische neu gemessen.

## 1. Manuellen Pflegeweg abnehmen und ausrollen

Die vorhandene [Admin-Pflege](MANUAL_EVENT_MAINTENANCE.md) bietet Einzelprüfungen,
Korrekturen, neue Editionsentwürfe und ausdrückliche vollständige Freigaben.
Unbekannte Werte bleiben unbekannt. Ein normales Speichern bestätigt nur die
ausgewählten Felder; Entwürfe, Datenbankspeicherung und Veröffentlichung bleiben
getrennt. Alte Editionen und Nutzerverknüpfungen werden erhalten.

- Vorhandenen Produktionsstand und die beiden Migrationen gegen eine aktuelle
  Wiederherstellung prüfen, einschließlich der tatsächlich fehlenden optionalen
  Stage-4-Funktion. Keine künstliche Vollständigkeit der Produktionsschema-Basis
  annehmen.
- Lokale Funktions-, Sicherheits- und Browsernachweise vollständig abnehmen;
  anschließend die Migrationen und das Frontend im bestehenden abgesicherten
  Ablauf ausrollen. Das ist keine Freigabe des bisher gesperrten Datenkatalogs.
- Nach dem Rollout echte Adminberechtigung, erneutes Laden gespeicherter Daten,
  gezielte Prüfungen sowie anonym sichtbare veröffentlichte Daten prüfen.
  Keine produktiven Testeinträge oder pauschalen Kandidatenfreigaben erzeugen.

Bereits erfolgt:

- Aktueller öffentlicher Katalog und dessen echter Freshness-Guard ausschließlich
  lesend gemessen. Anonymer Zugriff und Freshness-Zugriffsschutz bestehen.
- Frisches verschlüsseltes Backup und erfolgreicher Restore: Datenintegrität,
  Schema, RLS und Benutzertrennung geprüft; Produktion unverändert.
- Die neue Migration an die tatsächlich fehlende optionale Stage-4-Funktion
  angepasst. Notwendige Funktionen bleiben streng geprüft; unerwartete
  Definitionen führen weiter zum Abbruch. Es wird kein Stage-4-Subsystem installiert.
- Frischer lokaler Aufbau mit allen 56 Migrationen und 66 SQL-Prüfungen grün;
  zusätzlich die vorhandene, fehlende und unerwartet geänderte optionale
  Funktion gegen den echten Migrationsblock getestet.
- Beide Migrationen erfolgreich auf die aktuelle Produktionskopie mit 44
  historischen Migrationen angewendet. Dort bestehen 64 SQL-Prüfungen; zwei
  ausschließlich Stage 4 betreffende Prüfungen sind ausdrücklich nicht
  anwendbar. Sämtliche direkten Crawler-/Importschutzprüfungen laufen weiterhin.
  Inhalts-Hashes von 14 bestehenden Tabellen/Ansichten einschließlich Nutzer-
  und Editionsverknüpfungen sowie alle bisherigen Frischeentscheidungen bleiben
  unverändert. Synthetische Testdaten wurden zurückgerollt.
- Websitebasis v89 an Produktionsdomain und unveränderlicher Deployment-URL
  abgeglichen: komplettes lokales Paket und alle 34 kritischen Remote-Dateien
  stimmen. Das alte `dist/` wird nicht als Basis verwendet. Der Paketumfang
  schließt den bereits committed kleinen Detail-Navigationsfix ausdrücklich ein.
- Erneuter vollständiger Lauf `npm run test:code` nach der Korrektur erfolgreich:
  sämtliche technischen Scriptgruppen, Layoutprüfungen und 159 Browserfälle.
  Die produktiven anonymen Zugriffs- und Freshness-Sicherheitsaudits bestehen
  ebenfalls; diese lesenden/abgewiesenen Aufrufe verändern keine Eventdaten.

Das separate v90-Paket wurde unter
`exports/ui-release-20260929-v90/package` aus Quellcommit
`75fef423a146266e65bb73914d3cf0c18a6b6ed5` gebaut. Als nachgewiesene v89-Basis dienten
`exports/ui-release-20260920-v89/package` und
`https://9cd74f1c.sporteventmap.pages.dev`; die SHA-256 der Basis-`release.json`
ist `209adb7b35fd51ece8379e5707a72ae1c6cabc337b4575cae5e0c59f85eea389`.
Quellcommit, Dateiinventar und tatsächliche Paketprüfung stehen in den erzeugten
Release-Metadaten und Prüfprotokollen. Der konkrete Release umfasst genau die
beiden in der Pflegeanleitung genannten Migrationen und dieses UI-Paket.
Preview, erneuter Basisabgleich und produktiver Upload sind erfolgt. v90 ist
unter `https://86811745.sporteventmap.pages.dev` und der Produktionsdomain
geprüft: sechs Browserprüfungen und 14 Dateivergleiche der Produktionsdomain
bestanden. Statische Eventseiten und Ausfalldaten bleiben aus dem belegten
bisherigen Datenpaket; die UI-Veröffentlichung ist keine neue Datenfreigabe.

Die Datenbankmigrationen `20260929104600` und `20260929104628` wurden gemeinsam
atomar angewendet. Die History enthält jetzt 46 Einträge; sämtliche 44 alten
Einträge bleiben unverändert. Vor dem Commit und durch unabhängige Nachabfrage
wurden unveränderte Inhalte von 15 bestehenden Tabellen/Ansichten,
Nutzerverknüpfungen und allen bisherigen Frischeentscheidungen nachgewiesen.
Zeitpläne wurden exakt wiederhergestellt; sechs für den Folgetag vorgesehene
Wiederholungsaufträge blieben unverändert. Anonyme und bestehende Nicht-Admin-
Zugriffe auf die neuen RPCs werden abgewiesen. Die bestehenden anonymen und
Freshness-Live-Audits bestanden erneut; beide neuen RPCs lieferten ohne Sitzung
HTTP 401 / SQLSTATE 42501. Private Nachweise: `exports/p0-rollout-20260929`.

**Noch offen:** Die bestätigte Adminsitzung lädt wegen vorhandener Browsercaches
teilweise ältere JavaScript-Dateien. Die begrenzte Korrektur v91 ist in Arbeit;
sie ist noch nicht als produktiv bestätigt. Erst danach werden die echten
Pilotfälle gespeichert und unabhängig nachgeprüft. Bis 12:39 UTC gab es keine
fachlichen Writes durch diesen Pflegeweg.

## 2. Kurzen manuellen Pilot messen

Mit zwei bis drei vorhandenen Bestandsfällen beginnen. Je Fall werden aktive
Pflegezeit, tatsächlich geprüfte Quellen, vollständiger Abschluss oder konkreter
Blocker und der anschließend gemessene Frischegewinn festgehalten. Der Pilot
belegt Bedienbarkeit und Durchsatz; er ersetzt keine Einzelprüfung der Quellen.

Die erste vorbereitete Queue verwendet vorhandene vollständige Belegpakete:

| Reihenfolge | Fall | Offene Feldvorschläge zum Messstand | Nächster Aufwand |
| --- | --- | ---: | --- |
| 1 | Ring Running Series 159 | 0 | Aktuelles Programm und Anmeldung erneut prüfen |
| 2 | Christmas Run To Tree 355 | 0 | Aktuelle Ausgabe und Anmeldung erneut prüfen |
| 3 | Halloween-Run Bremen 482 | 0 | Vollständiges Lauf-, Walking-, Staffel- und Kinderprogramm prüfen |
| 4 | Speed5 342 | 5 | Neue Vorschläge gegen Programm und editionsgenaue Anmeldung entscheiden |
| 5 | Stromberglauf 367 | 1 | Vorschlag und aktuelle Ausgabezuordnung des Anmeldelinks prüfen |
| 6 | Bietigheimer Silvesterlauf 235 | 4 | Anmeldung, Termin, Beschreibung und Wettbewerbe aktuell abgleichen |

Null Vorschläge bedeutet keine Freigabe: Aufgaben, Quellenzustand und sonstige
Blocker müssen ebenfalls geprüft werden. Die bisherigen Quellenpakete sind
älter als 24 Stunden. Sie dienen als Recherchevorlage, ihre Zeitstempel werden
nicht umdatiert. Bietigheims angekündigte Anmeldeöffnung Anfang Oktober verlangt
besonders einen aktuellen editionsgenauen Abgleich.

## 3. Nettozugänge mit längerem Planungshorizont bearbeiten

Neue sichtbare Veranstaltungsidentitäten verbessern Bestand und können zugleich
Frische beitragen. Bevorzugt werden zukünftig nutzbare Ausgaben mit vollständigem
offiziellem Programm und eindeutigem Anmeldeweg. Eine weitere Ausgabe einer
bereits sichtbaren Serie ist kein zusätzlicher Discovery-Eintrag.

**Allgäu Panorama Marathon 207** ist der am weitesten vorbereitete offene
Nettozugang: Das private Paket vom 21.09. umfasst alle 14 Kernfelder und acht
Wettbewerbe. Vor der Übernahme sind neue Quellenbelege und ein aktueller Abgleich
erforderlich. Der bisher erkannte Sonntag 08.08.2027 muss mit dem belegten
Wochenende 07.–08.08.2027, dem bestehenden Kandidaten und seiner Identität
konsistent behandelt werden. Eine eigene 2027-Quellenbindung ist nötig; die
historische Quelle bleibt erhalten. „Ultra rund 69 km“ bleibt eine Nennstrecke,
widersprüchliche Kinderstartzeiten bleiben leer. Kein ungeprüftes neues SQL-Paket
oder zusätzlicher Crawlerausbau ist dafür das Standardvorgehen.

Die Live-Auswahl enthält 122 zukünftige, noch nicht sichtbare Eventidentitäten
mit offenen Kandidaten, davon 115 deutsche. **Kandidaten sind keine verifizierten
Zugänge.** Selbst wenn alle 115 deutschen Fälle freigabefähig wären, ergäben
210 + 115 erst 325 Einträge: mindestens 75 weitere Zugänge wären bereits vor
zeitbedingten Abgängen nötig. Die Liste wird daher in kleinen, belegbaren Gruppen
bearbeitet und gezielt ergänzt; keine unkontrollierte Massenrecherche.

Vorhandene Vollpakete weiterverwenden, aber inzwischen bereits veröffentlichte
Fälle wie MidSummerRun nicht erneut als Zugang zählen. Offene Teilpakete mit
falschem Ausgabejahr, unvollständigem Programm oder ungeklärter Anmeldung werden
mit ihrem konkreten fehlenden Beleg zurückgestellt. Frische Bestandsfälle werden
erst bei tatsächlichem Prüfbedarf erneut bearbeitet.

## 4. Regulären Datenrelease bestehen, danach P1

Sobald Bestand und Frische den geplanten Releasehorizont tragen, den regulären
Export und die daran gebundenen Dubletten-, Datums- und Geo-Audits ausführen.
Danach folgen sämtliche bestehenden Release-, Sicherheits- und Browserprüfungen,
das geprüfte Paket, Deployment und öffentliche Nachprüfung. Es gibt keine
Absenkung von Gates, kein `allow-unhealthy` und keine künstliche Verlängerung
vergangener Ausgaben.

Die weiterhin gemeldeten **fünf Dubletten** stammen aus dem alten eingefrorenen
Fallbackbericht. Sie sind kein Nachweis fünf neuer ungelöster Produktionsfälle.
Die frühere fachliche Bereinigung ersetzt dennoch keinen aktuellen, an den neuen
Export gebundenen Audit. Erst ein vollständig bestandener regulärer Datenrelease
schließt P0 ab.

Zusätzliche lokale Diagnose der aktuellen 210 Discovery-Zeilen am 29.09.:
Die vorhandenen Audits finden null releasekritische Dublettenkandidaten,
null kritische Datumsbefunde und null kritische Geo-Befunde. Offen bleiben ein
nicht blockierender Dublettenhinweis und drei Geo-Warnungen. Diese Prüfungen
verwenden ausschließlich den lesenden Snapshot mit unveränderten fachlichen
Prüfzeiten; sie ersetzen weder offizielle Quellenprüfungen noch den späteren
regulären Releaseaudit. Die 990 Archiv-Editionen sind darin nicht erneut auditiert.

P1 verfolgt anschließend den vollständigen Deutschland-Katalog. Die bestehende
Roadmap verlangt **1.000+ verifizierte deutsche Event-Editionen im operativen
Katalog**, mindestens 85 % Frische und 80 % Vollständigkeit. Diese Kriterien
werden separat für tatsächlich nutzbare Ausgaben mit gültigen Nachweisen
gemessen. Die 990 Archiv-Editionen enthalten
historische Ausgaben und sind weder 990 aktuelle deutsche Events noch ein
Nachweis der P1-Zielerreichung.

Ältere Produktionsnachweise bleiben in
[P0 vom 21.09.](P0_SOURCE_REVIEW_OPERATIONS_20260921.md) und dem
[ursprünglichen Durchsatzplan](P0_THROUGHPUT_PLAN_20260908.md) erhalten. Für die
aktuelle Arbeitsplanung gilt die datierte Messung dieses Dokuments.
