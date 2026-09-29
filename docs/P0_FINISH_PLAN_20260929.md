# P0-Abschlussplan – 29. September 2026

## Weiterer echter Browserpilot – 18:07 UTC

Paderborner Osterlauf 2027 wurde über den vorhandenen Kandidaten im Admin als
Entwurf angelegt, korrigiert, gezielt geprüft und veröffentlicht. Ergebnis:
**212 Discovery-Einträge (162 Deutschland), 992 Archiv-Editionen und acht
gültige vollständige Frischenachweise (3,77 %)**. Die alte Edition 2026 und ihr
Ergebnis blieben unverändert. Der Browserlauf entdeckte zusätzlich eine falsche
Statusanzeige in Karte/Liste, deren eng begrenzte Korrektur dokumentiert ist:
[Browserbericht](MANUAL_BROWSER_AUDIT_20260929.md).

P0 bleibt offen. Bei unverändertem Ziel von 400 Discovery-Einträgen fehlen
mindestens 188 Nettozugänge und 212 zusätzliche Vollnachweise. Wenn alle 188
Zugänge frisch veröffentlicht werden und die acht Nachweise gültig bleiben,
sind zusätzlich mindestens 24 Bestandsreviews nötig. Die folgenden Messungen
sind frühere Momentaufnahmen; Paderborn darf nicht erneut als Zugang zählen.

## Aktueller Stand nach der Workflowkorrektur – 16:02 UTC

Der eigenständige Pflegeweg ist mit **v92 und zwei Backendergänzungen produktiv
repariert und vollständig geprüft**. Alle vier früheren Befunde sind behoben;
zusätzlich wurde die historische HTTP-/WWW-Quellenvariante berücksichtigt.
Allgäu 2027 wurde ausschließlich über „Events pflegen“ am vorhandenen Entwurf
geklärt, gezielt bestätigt und veröffentlicht. Die normale öffentliche Seite,
Karte und Liste zeigen die Änderung. Alte Edition, Quellen, Ergebnisse und
Saisonplanerverknüpfungen sind nachweislich unverändert.
[Korrekturbericht und Nachweise](MANUAL_WORKFLOW_FIX_20260929.md).

| Kennzahl | Gemessener Stand 16:01 UTC | Unveränderte Releasegrenze |
| --- | ---: | ---: |
| Discovery | 211, davon 161 in Deutschland | mindestens 400 |
| Archiv | 991 | effektiv mindestens 974 |
| Gültige vollständige Frischenachweise | 7 von 211 = 3,32 % | mindestens 55 % |
| Vollständige Discovery-Einträge | 111 von 211 = 52,61 % | mindestens 45 % |
| Reviewbedarf | 204 | gezielt abarbeiten |

**P0 bleibt offen.** Bis genau 400 Einträgen fehlen rechnerisch mindestens
189 Nettozugänge und 213 zusätzliche Vollnachweise. Wenn alle 189 Zugänge frisch
veröffentlicht werden und die sieben bisherigen Nachweise gültig bleiben,
braucht es zusätzlich mindestens 24 Bestandsreviews. Abgänge und ablaufende
Nachweise können diese Untergrenze erhöhen.

Die nächsten Schritte:

1. Vorhandene künftige deutsche Kandidaten in kleinen, belegbaren Gruppen über
   den reparierten Admin bearbeiten; vorhandene Editionen weiterverwenden.
   Allgäu ist abgeschlossen und darf nicht noch einmal als Zugang gezählt werden.
2. Quellenprüfungen im bestehenden Bestand nach Fälligkeit und kurzfristigem
   Veranstaltungsdatum priorisieren. Nur ausdrücklich geprüfte Angaben
   bestätigen; keine pauschale Frischeerhöhung durch Speichern.
3. Fehlende Bestandszugänge gezielt recherchieren. Erst sobald Bestand und
   Frische tragen, den regulären Export mit gebundenen Dubletten-, Datums-
   und Geo-Audits sowie den bestehenden Releaseprüfungen veröffentlichen.
4. P1 erst nach bestandenem regulärem Datenrelease beginnen. Der alte
   Ausfallexport bleibt bis dahin ausdrücklich als alter Datenstand gekennzeichnet.

Die folgende Momentaufnahme von 13:26 UTC ist **historisch**. Ihre Aussagen
„Allgäu privat“ und „Konfliktschritt fehlt“ sind durch den obigen Abschluss
überholt; Bestandsanalysen und Kriterien bleiben als Ausgangsnachweis erhalten.

## Historischer Ausgangspunkt vor v92

Stand der folgenden Bestandsmessung: **29.09.2026, 13:26 UTC, nach dem Pilot**.
P0 bleibt offen. Pflege-Migrationen, Konflikt-Hotfix und Frontend **v91 sind produktiv
ausgerollt und geprüft**. Die echte angemeldete Adminoberfläche funktioniert;
Ring Running Series und Christmas Run To Tree sind vollständig manuell bestätigt
und im öffentlichen Live-Katalog nachgeprüft. Allgäu 2027 besteht als privater,
an den vorhandenen Kandidaten gebundener Entwurf; der Datums-Konflikt sperrt die
Veröffentlichung. Der Pilot erhöht gültige Vollnachweise von vier auf sechs;
der öffentliche Bestand bleibt unverändert.
Die folgende Reihenfolge konzentriert den Aufwand auf echte Katalogzugänge und
gezielte Quellenprüfungen. Der tägliche Pflegeweg benötigt keine LLM-Aufrufe.

## Ausgangspunkt und unveränderte Grenzen

| Kennzahl | Gemessener Stand | Releasegrenze |
| --- | ---: | ---: |
| Aktive Discovery-Einträge | 210, davon 160 in Deutschland | mindestens 400 |
| Veröffentlichte Archiv-Editionen | 990 | effektiv mindestens 974 |
| Gültige vollständige Frischenachweise | 6 von 210 = 2,86 % | mindestens 55 % |
| Vollständige Discovery-Einträge | 110 von 210 = 52,38 % | mindestens 45 % |
| Einträge mit Reviewbedarf | 204 | gezielt abarbeiten |
| Export und daran gebundene Audits | noch kein neuer freigegebener Datenrelease | Export höchstens 24 Stunden alt; gültige gebundene Audits |

Für genau 400 sichtbare Einträge wären 220 gültige Vollnachweise erforderlich.
Gegenüber dieser Momentaufnahme fehlen damit **mindestens 190 Nettozugänge und
214 zusätzliche Vollnachweise**. Falls alle 190 Zugänge vollständig frisch
veröffentlicht werden und die sechs bisherigen Nachweise gültig bleiben, fehlen
noch 24 Bestandsreviews. Das ist eine Rechenuntergrenze, keine Arbeitszusage:
Abgänge, auslaufende Nachweise und neue Quellenkonflikte erhöhen den Bedarf.

Die vier vor dem Pilot frischen Fälle waren Ratzeburger Adventslauf 446 und FSV-Lauf
383 mit nächster Prüfung am 05.10. sowie MidSummerRun 695 und GVG-Winterstaffel
Pulheim 153 am 08.10. Eine frühere Quellenänderung kann zusätzliche Prüfung
auslösen. Dazu kommen die jetzt vollständig bestätigten Bestandsfälle Ring
Running Series 159 und Christmas Run To Tree 355. Vollständigkeit ersetzt keinen
Frischenachweis.

Die Projektion von 11:33 UTC nach den tatsächlichen Discovery-Viewregeln ergab
**ohne neue Änderungen**:

| Abstand zur Messung | Weiter sichtbare Einträge | Lücke bis 400 |
| --- | ---: | ---: |
| 7 Tage | 191 | 209 |
| 14 Tage | 166 | 234 |
| 30 Tage | 134 | 266 |

Das sind datumsbasierte Szenarien, keine sicheren Zukunftsbestände. Vor jedem
Paket und vor dem Release werden tatsächlicher Bestand und Frische neu gemessen.

## 1. Manueller Pflegeweg produktiv; begrenzte Restarbeiten

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

**Nachfolgender Live-Stand:** Der Cachefehler ist mit v91 behoben. Das Paket unter
`https://01a6b663.sporteventmap.pages.dev` und die Produktionsdomain sind anhand
der Dateihashes geprüft; der angemeldete Admin wurde anschließend erfolgreich
bedient. Die Bestandsfälle wurden gespeichert und öffentlich nachgeprüft. Die
privaten Releasebelege liegen unter `exports/ui-release-20260929-v91`.

Ein echter Source-Monitor-Schreibvorgang während der Allgäu-Bearbeitung löste
anschließend den vorgesehenen Versionskonflikt aus. PostgREST wiederholte dessen
bisherigen SQL-Fehlercode bis zum HTTP-Timeout. Der eng begrenzte Hotfix
`20260929130903_manual_maintenance_conflict_http_status.sql` meldet diesen
fachlichen Konflikt als HTTP 409 und erhält die vollständige Versionsprüfung.
Er besteht 66 lokale SQL-Prüfungen und eine echte HTTP-Prüfung mit PostgREST
14.14. Die produktive Anwendung mit PostgREST 14.5 ist unabhängig um 13:20:21 UTC
bestätigt: History 47, ausschließlich der vorgesehene SQLSTATE geändert;
Rechte, alte History und Hashes von 15 bestehenden Tabellen/Ansichten unverändert.
Der zuvor hängende echte UI-Auftrag meldet nun sofort den verständlichen
Versionskonflikt. Neuladen erhält alle vier bearbeiteten Werte; neue Übersicht
und Speichern waren erfolgreich. Die veröffentlichte UI bleibt v91.
Die bestehenden Eingabe-, Reload- und erneuten Prüfschritte sind durch 13
Unit-Tests und zwei gezielte Browser-Konfliktfälle abgesichert.

## 2. Kurzen manuellen Pilot messen

Ring Running Series 159 und Christmas Run To Tree 355 sind über die echte
angemeldete Oberfläche vollständig manuell bestätigt und öffentlich sichtbar
nachgeprüft, jeweils mit 14 vollständigen Quellen-, Admin- und Versionsnachweisen.
Der Pilot belegt den durchgängigen Pflegeweg und zwei zusätzliche gültige
Vollnachweise ohne zusätzlichen Discovery-Eintrag. Eine belastbare
aktive Pflegezeit oder ein daraus abgeleiteter Durchsatz wird noch nicht
behauptet. Bei weiteren Fällen Pflegezeit, Quellen und konkrete Blocker knapp
festhalten; Bestand und Frische vor jedem Paket erneut messen.

Die erste vorbereitete Queue verwendet vorhandene vollständige Belegpakete:

| Reihenfolge | Fall | Offene Feldvorschläge zum Messstand | Nächster Aufwand |
| --- | --- | ---: | --- |
| erledigt | Ring Running Series 159 | 0 | Vollständig bestätigt; Live-Sichtbarkeit geprüft |
| erledigt | Christmas Run To Tree 355 | 0 | Vollständig bestätigt; Live-Sichtbarkeit geprüft |
| 3 | Halloween-Run Bremen 482 | 0 | Vollständiges Lauf-, Walking-, Staffel- und Kinderprogramm prüfen |
| 4 | Speed5 342 | 5 | Neue Vorschläge gegen Programm und editionsgenaue Anmeldung entscheiden |
| 5 | Stromberglauf 367 | 1 | Vorschlag und aktuelle Ausgabezuordnung des Anmeldelinks prüfen |
| 6 | Bietigheimer Silvesterlauf 235 | 4 | Anmeldung, Termin, Beschreibung und Wettbewerbe aktuell abgleichen |

Null Vorschläge bedeutet keine Freigabe: Aufgaben, Quellenzustand und sonstige
Blocker müssen ebenfalls geprüft werden. Die älteren vorbereiteten Quellenpakete sind
älter als 24 Stunden. Sie dienen als Recherchevorlage, ihre Zeitstempel werden
nicht umdatiert. Bietigheims angekündigte Anmeldeöffnung Anfang Oktober verlangt
besonders einen aktuellen editionsgenauen Abgleich.

## 3. Nettozugänge mit längerem Planungshorizont bearbeiten

Neue sichtbare Veranstaltungsidentitäten verbessern Bestand und können zugleich
Frische beitragen. Bevorzugt werden zukünftig nutzbare Ausgaben mit vollständigem
offiziellem Programm und eindeutigem Anmeldeweg. Eine weitere Ausgabe einer
bereits sichtbaren Serie ist kein zusätzlicher Discovery-Eintrag.

**Allgäu Panorama Marathon 207** ist weiterhin ein offener möglicher Nettozugang.
Neue Originalbelege vom 29.09. liegen unter `exports/p0-allgaeu-20260929`; sie
stützen die 14 Kernfelder, das Enddatum und acht Wettbewerbe. Genau ein
2027-Entwurf wurde an den vorhandenen Kandidaten gebunden angelegt: zunächst
ohne Feldbestätigungen, danach vier Faktenkorrekturen ohne Bestätigungen,
anschließend 15 ausdrückliche Prüfungen (14 Kernfelder und Enddatum).
Die historische Edition 2026 samt Quelle, einem bestehenden Ergebnis und null
Saisonplaner-Verknüpfungen blieb laut Hashvergleich unverändert.
„Ultra rund 69 km“ bleibt eine Nennstrecke,
widersprüchliche Kinderstartzeiten bleiben leer.

Der Source Monitor erkennt den Sonntag **08.08.2027**, die offiziellen Quellen
belegen das Veranstaltungswochenende **07.–08.08.2027**. Der daraus entstandene
Kandidatenkonflikt blockiert die Veröffentlichung. Auch vollständig manuell
geprüfte Einzelfelder in diesem Entwurf ergeben deshalb noch keinen gültigen
veröffentlichten Frischenachweis und keinen P0-Zugang. Die zwei unvollständigen
Crawler-Vorschläge zum Anmeldelink und Wettbewerbsprogramm wurden um 13:25:03
und 13:25:53 UTC mit Adminnachweis und fachlicher Begründung abgelehnt; ihre
Werte wurden nicht angewandt. Der Kandidatenkonflikt bleibt bestehen.

**Nächste kleine Verbesserung:** einen ausdrücklich auditierbaren Adminschritt
für die Auflösung einer solchen Datumsabweichung am bereits gebundenen Entwurf
ergänzen. Derzeit existiert dafür kein passender Review-RPC; Kandidatenablehnung
oder das Schließen einer Aufgabe beseitigt die Validierungssperre nicht.
Originalbeobachtung und Kandidaten-Fingerprint müssen erhalten bleiben. Danach
bleiben die vollständige Quellenprüfung und die bestehenden Freigabegates
unverändert erforderlich. Diese Ergänzung gehört nicht mehr zum aktuellen
Rollout; bis dahin bleibt Allgäu privat. Kein Crawlerausbau und keine
Umgehung der Sperre.

Die Live-Auswahl zum Messstand 11:33 UTC enthielt 122 zukünftige, noch nicht sichtbare Eventidentitäten
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
