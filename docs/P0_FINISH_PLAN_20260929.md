# P0-Abschlussplan – 29. September 2026

## Aktueller Stand – 6. Oktober 2026

**P0 bleibt offen; P1 bleibt zurückgestellt.** Der technische Rollout ist
abgeschlossen. Der neue gemeinsame lesende Snapshot vom 06.10., 13:41:34 UTC,
misst **193 Discovery / 143 Deutschland / fünf gültige Vollnachweise / 992
veröffentlichte Archiv-Editionen**. Vollständigkeit 99 / 193 = 51,30 %.
Bis genau 400 fehlen heute mindestens 207 Nettozugänge und 215 Vollnachweise;
bei ausschließlich frischen Zugängen und fünf weiter gültigen Bestandsnachweisen
zusätzlich acht Bestandsreviews. Zeitbedingte Abgänge erhöhen den Bedarf.

Der [aktuelle Status und direkte Arbeitsweg](P0_STATUS_20261006.md) enthält
Kandidatenlücke, Quellenbefunde, neue Reviewpriorisierung, Kohortenprojektionen
und den geprüften Diagnoseplan. Die vorhandene Technik wird weiterverwendet;
Qualitätsgates bleiben unverändert. Die folgenden Abschnitte dokumentieren die
älteren Messungen und Rollouts und gelten nicht als heutiger Bestandsnachweis.

## Produktiver Backend-/UI-Rollout – 1. Oktober 2026

**Ausdrücklich freigegeben und abgeschlossen:** Die vier unten genannten
Migrationen sind produktiv angewendet. Unabhängiger Nachweis um **13:26 UTC**:
54 Historyeinträge, alle 50 alten Zeilen unverändert, genau vier neue
Originalmigrationen. Innerhalb der Anwendung blieben 37 Tabellen und beide
öffentlichen Views vollständig unverändert, ebenso RLS/ACL, Trigger,
Prüfnachweise und Zeitpläne. Keine produktiven Testdaten angelegt.
Der vorhandene Housekeeping-Cron verwendet den reparierten Validatorpfad;
sein nächster planmäßiger Lauf wurde nicht manuell ausgelöst.

**UI v141 ist live:** Quellcommit `5ce4696e91d25f3ca68330640b4587b88982e694`,
Preview [c0622aa8](https://c0622aa8.sporteventmap.pages.dev), Produktion
[95f59bbe](https://95f59bbe.sporteventmap.pages.dev). Die Produktionsdomain
liefert dieselbe `release.json`. Um **13:36 UTC** bestanden **1.049/1.049
Dateihashes** und **8/8 echte anonyme Browserprüfungen** bei 1440/390 px:
primäre Discovery, Suche, editionsgleiche Details und keine JS-Fehler.
Die Preview bestand zusätzlich **14/14 Paket-/Ausfallprüfungen**. Deren erster
Fehlversuch war ein Test-Routingfehler: Die Helperroute überging die simulierte
503-Sperre. Der korrigierte Test belegt vier gesperrte Archivabrufe, null
durchgerutschte Backendantworten und den sichtbaren alten Fallbackstand.

Vorher: verschlüsseltes Produktionsbackup, isolierter Restore und tatsächlicher
Hin-/Rückweg **50 → 54 → 50 → 54**, jeweils separat nachgelesen und mit
unveränderten 39 Daten-/View-/Scheduler-Aggregaten. Zwei falsche Erwartungen
des zusätzlichen Rollout-Wrappers (CR-normalisierter statt raw Hash sowie
DEFINER statt INVOKER) wurden dort erkannt und korrigiert. Die Originalmigrationen
blieben unverändert. Eigene Klonressourcen und entschlüsselter Workdir sind
entfernt; Podman ist wieder gestoppt, das verschlüsselte Backup bleibt erhalten.

Belege: `exports/p0-rollout-20261001/production-backend-result.json`,
`clone-rehearsal-summary.json`, `public-postflight.json` sowie
`exports/ui-release-20261001-v141/production-domain-identity.json`,
`production-hashes.log` und `production-public-smoke.log`. Backend-Rückweg:
hashgebundenes `code-rollback.sql` im Rolloutordner, ohne alte Geschäftsdaten
zurückzuschreiben. UI-Rückweg ist das vorherige Cloudflare-Deployment
[e4a1000e / v99](https://e4a1000e.sporteventmap.pages.dev). Vor jeder Rücknahme
Driftguards und eventuell spätere Änderungen prüfen; nichts überschreiben.

Anonyme API-/Zugriffstests bestehen produktiv. Speicher-, Ergebnis- und
Badge-Schreibabnahmen fanden mit echter Auth/DB ausschließlich lokal statt.
Der öffentliche Snapshot bestätigt um **13:26:37 UTC** unverändert **211/161**
Sucheinstiege, **7/7** Vollnachweise in den jeweiligen Beständen und **992**
Archiv-Editionen. Fallback und Sitemap bleiben vom 27.08.2026. Kein Datenrelease,
Bestandsimport, Push oder neuer Quellenprüfnachweis; Quellstand lokal committed.
Security-Advisors erneut geprüft: der neue
[Definer-Hinweis](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
betrifft den bewusst auf eigene Editionen begrenzten Auth-RPC; übrige Hinweise
sind Bestandsbefunde.

**P0 teilweise abgeschlossen:** Der technische Rollout ist erledigt. Nächster
Arbeitsschritt bleiben editionsgenaue manuelle Nachweise, beginnend mit Paderborn,
und später ein regulärer Datenrelease bei erfüllten unveränderten Gates.
P1 bleibt pausiert. Die folgenden Abschnitte dokumentieren den Stand **vor**
diesem Rollout; ihre damaligen Angaben „nicht produktiv“ sind damit überholt.

## Aktuelle lokale Abnahme – 1. Oktober 2026

**Nachfolgende Freigabe am 01.10.2026:** Der Nutzer hat den vorgeschlagenen
Backend-/UI-Rollout ausdrücklich erlaubt. Vorgesehen sind die vier unten
genannten, lokal geprüften Migrationen und UI-Version **20261001-ui-only-v141**
über den bestehenden getrennten UI-Releaseweg. Vor der Anwendung werden
aktueller Produktionsstand, Wiederherstellungspunkt und Produktionsklon geprüft.
Die nachstehenden lokalen Nachweise sind der Stand vor diesem Rollout; sein
separater Ausführungsnachweis folgt erst nach tatsächlicher Anwendung. Keine
Absenkung der Datenreleasegates, kein Bestandsimport und keine neue Quellenfreigabe.

**P0 am 01.10.2026 wieder aufgenommen:** Die zwischenzeitlich priorisierten
Admin-/Planner-Reparaturen und sämtliche bisherigen Änderungen bleiben erhalten.
P1 und der weitere Bestandsausbau bleiben pausiert. Der normale manuelle Pflegeweg
kommt mit einer gemeinsamen Änderungsbestätigung aus; diese ist kein externer
Quellenprüfnachweis.
Archivierung darf persönliche Teilnahmen und Ergebnisse niemals entfernen.

**Akute Korrekturen lokal umgesetzt:** zentrale Änderungsbestätigung,
versions-/requestgebundene Speicherung mit tatsächlichem Werte-Readback,
automatische gezielte Onlineübernahme ohne erfundene Quellenprüfung;
explizite neue Edition versus identitätserhaltende Verschiebung. Persönliche
Historie, Ergebnisse, Zähler und bestehende Finish-Badges verwenden eigene
konkrete Teilnahmen unabhängig von Discovery. Vor der P0-Wiederaufnahme bestand
`npm run test:code` mit allen technischen Gruppen und **225/225 Browsertests**;
Admin-/Historiengruppen jeweils **26/26**. Belege und Testanleitung stehen in
[Events manuell pflegen](MANUAL_EVENT_MAINTENANCE.md) und
`exports/acute-20261001/test-code-green.log`.
Die akuten Migrationen `20261001104403_manual_approved_save.sql` und
`20261001112438_own_planner_archived_editions.sql` sind vorbereitet und nicht
produktiv installiert. Die vorhandene Podman-Maschine `sporteventmap` war nur
gestoppt; sie wurde für isolierte SQL-/RLS-Tests gestartet. Die frühere Angabe
„Docker fehlt“ war unzutreffend. Backend-/UI-Rollout bleibt separat freizugeben.
Keine produktive Wirksamkeit dieser Änderungen behauptet.

**P0 teilweise abgeschlossen:** belegte technische Lücken lokal korrigiert;
die neuen Migrationen bestehen inzwischen die lokale SQL-/RLS-Laufzeitabnahme.
Manuelle Datenprüfung und reguläre produktive Freigabe bleiben offen. Die folgenden Septemberabschnitte sind
historische Messungen und Rolloutnachweise. Heute wurde nichts produktiv
geschrieben, importiert, angewendet oder veröffentlicht; kein Commit/Push.

Lesende Einzelstatement-Messung über Production-Supabase:
**01.10.2026, 10:13:01 UTC / 12:13:01 MESZ**. Die neue Snapshot-SQL-Abfrage wurde
als SELECT ausgeführt; das RPC selbst wurde nicht installiert.

| Bezugsbestand | Tatsächliche Messung |
| --- | ---: |
| Eventidentitäten in der gesamten Datenbank | 999 |
| Öffentlich suchbare nächste aktive Editionen, mit Zukunftsdatum | 211 |
| Davon Deutschland | 161 |
| Gültige vollständige aktuelle Nachweise, gleiche 211 Editionen | 7 / 211 = 3,32 % |
| Deutschlandnachweise, gleiche 161 deutschen Editionen | 7 / 161 = 4,35 % |
| Strukturell vollständige Sucheinstiege | 111 / 211 = 52,61 % |
| Veröffentlichte Editionen insgesamt, einschließlich Historie | 992 |
| Davon zukünftiges Datum / historisches Datum | 211 / 781 |
| Private Editionsentwürfe | 33 |
| Fehlende/ungültige Vollnachweise; überfällige Prüfungen im Discoverybestand | jeweils 204 |
| Kritische offene Validierungsprobleme, gesamter Pflegebestand | 31 |
| Offene Quellenaufgaben + Vorschläge + Nachfolgekandidaten, gesamter Pflegebestand | 4.004 |
| Offene Kandidatenkonflikte | 4 |

Eine erneute ausschließlich lesende Einzelstatement-Zählung am **01.10.2026,
12:24:09 UTC / 14:24:09 MESZ** bestätigt 999 Eventidentitäten, 211/161
Discovery-Editionen, sieben/sieben aktuelle Vollnachweise im jeweils gleichen
Bestand, 992 veröffentlichte Editionen (781 vergangen) und 33 Entwürfe.
`publication_status='archived'` betrifft dabei null Editionen; öffentlich
erreichbare vergangene Editionen sind ein anderer Bezugsbestand. Beleg:
`exports/p0-20261001/resumed-read-only-counts.json`. Review-/Problemzahlen der
Tabelle wurden in dieser späteren Zählung nicht erneut erhoben.

Das sind verschiedene Bestände: 999 Identitäten und 992 veröffentlichte Editionen
belegen keine 999 aktuellen verifizierten deutschen Veranstaltungen. Die 4.004
Revieweinträge sind einzelne Aufgaben/Vorschläge, keine 4.004 fehlerhaften Events.
Kein erfolgreicher `validation`-Lauf ist in `data_workflow_runs` protokolliert;
sein letzter Zeitpunkt bleibt **nicht ermittelt**. Der vorhandene Quellenmonitor
ist davon getrennt.

Der Rückgang von 212/162 am 29.09. auf 211/161 ist durch den AOK Firmenlauf
Ludwigsburg (Event 303, Datum/Enddatum 30.09.2026) belegbar. Der achte Vollnachweis
am Paderborner Osterlauf 2027 (1013) wurde laut Audit um 29.09., 19:45:06 UTC
durch ein blockierendes Reviewsignal invalidiert: `needs_review`, sofortige
Prüffälligkeit und entfernter Quellenbindungsnachweis. Das belegt Prüfbedarf,
keinen falschen Termin. Die sieben übrigen früher bestätigten Fälle bestehen
den Guard weiterhin. Paderborn zuerst editionsgenau nachprüfen, nicht pauschal
frisch setzen.

Belegte lokale Änderungen: gemeinsame Admin-/Exportauswertung statt reiner
Statusfrische; klare Datenbank-/Online-/Fallbackmeldungen; single-statement
Snapshot; öffentliche Feld-Whitelist; vorhandene Datums-/Geo-/Dublettenprüfungen
vor Exportersetzung; rückrollbare Artefaktgruppe und Abbruchsperre; konsistente
CSV-Records bei mehrzeiligen Beschreibungen. Reguläre Gates bleiben unverändert.

Vorbereitete Migrationen:
`20261001095043_public_catalog_consistent_snapshot.sql` (nur lesender Snapshot)
und `20261001100704_housekeeping_validation_core_route.sql` (bestehender Validator
als einmaliger privater Core; öffentlicher Admin-/Service-Guard unverändert).
Der bestehende `postgres`-Cron ohne JWT scheitert derzeit an der öffentlichen
RPC-Prüfung. Seine produktive Reparatur aktiviert wieder die bereits vorgesehenen
Housekeeping-/Validierungsänderungen und braucht deshalb Integrationstest und
ausdrückliche Freigabe. Keine Automatisierungsschalter wurden eingeschaltet.

Realer lokaler Diagnosekandidat unter `exports/p0-20261001/candidate`:
gebundene Datums-/Geo-/Dublettenchecks bestanden, null kritische Datums-/Geobefunde,
null blockierende Dubletten; drei Geo-Warnungen und ein Dublettenhinweis bleiben
fachlich zu prüfen. Der reguläre Export wurde absichtlich abgewiesen:
**211 < 400**, **3,32 % < 55 %**. Kandidat `diagnostic_only`, keine Datenfreigabe.
Die sechs bisherigen Daten-/Auditdateien blieben laut Hashvergleich unverändert.
Fallbackdatenstand weiterhin **27.08.2026**; altes 36-Spaltenschema passt nicht
zum aktuellen 42-Spaltenexport. Die fünf eingefrorenen Dubletten aus dem alten
Bericht sind weiterhin kein Nachweis neuer Produktionsfälle.

Lokale Prüfbelege und Grenzen vor der Prioritätsänderung stehen in
`exports/p0-20261001`. `npm run test:code` bestand damals einschließlich
**209 Browsertests**; der zusätzliche
abschließende Katalogrelease-Regressionslauf bestand ebenfalls. Der erste
Gesamtlauf deckte eine fehlende lokale Detail-RPC-Testantwort auf; die Theme-
Fixture wurde korrigiert. Die neue CSV-Cacheversion wurde im exakten Cachetest
nachgeführt. `git diff --check` bestand.
`test:all`, `prepare-package` und `verify-package` blockierten vor Erzeugung
eines Releasepakets am unveränderten alten 36-Spalten-Fallback.
Der rein lesende produktive `audit:anon` bestand: öffentliche Discovery/Archiv-
Formate lesbar, ausstehende Events und persönliche Tabellen weiterhin geschützt.
Die ersten lokalen SQL-/RLS-Versuche konnten wegen der gestoppten Podman-Maschine
nicht starten; diese Grenze wurde bei Wiederaufnahme von P0 behoben. Die isolierte
Abnahme mit **64 Migrationen** bestand **247 SQL-Assertions** (97 Pflege, 34
Knowledge, 28 gemeinsame Freigabe, 14 eigenes Archiv, 52 Snapshot, 22 Housekeeping)
und die vorhandene **RLS-Suite 23/23** einschließlich ihrer bestehenden
Knowledge-/Legacy-Prüfungen. Kein produktiver Admin-Schreibpilot und keine
produktive Migration wurden ausgeführt.

Zusätzlich wurden zwei reale Releasefehler behoben: Der Paketbuilder führte
bisher den Detailseitengenerator nicht aus; CSV und Archiv wurden dabei über
Namen/Datum statt Editions-ID zusammengeführt. Der Builder ruft den Generator
jetzt auf und vergleicht gespeicherte sowie kopierte HTML-Editionswerte mit dem
Katalog. Unterschiedliche UUIDs bleiben getrennt, auch bei gleichem Namen/Datum.
Die echte Browser-/Datenbankabnahme deckte außerdem einen FAQ-Readbackfehler auf:
Zusätzliche Servermetadaten wurden als Abweichung gewertet. Der Vergleich prüft
nun nur beantragte FAQ-Werte und die Detailbindung; die Erfolgsmeldung eines
älteren Auftrags wird beim nächsten Speichern entfernt (Admincache v141).
Die gekoppelte Regression nutzt einen synthetischen Kandidaten und echte lokale
Dateierzeugung/-paketierung; Git-/Freigabegates sind nur in dieser Testfixture
isoliert. Bestehende echte Releasegates bleiben unverändert.

Aktueller vollständiger technischer Lauf: `npm run test:code` **EXIT 0**, alle
Scriptgruppen, Layoutprüfung und **239/239 Browsertests** einschließlich mobilem
Adminwechsel und simuliertem Primärausfall. Beleg:
`exports/p0-20261001/test-code-resumed.log`. Nach dem letzten FAQ-Fix bestanden
erneut **27/27 Unitprüfungen und 50/50 Admin-/Knowledge-Browserfälle**
(`manual-faq-unit.log`, `faq-browser.log`). `test:all`, `prepare-package` und
`verify-package` wurden erneut ausgeführt und blockierten weiterhin vor einem
Releasepaket am alten 36-Spalten-Fallback. Es wurde kein Datenrelease vorbereitet,
das die unveränderten Bedingungen bereits erfüllt.

Die anschließende echte lokale Browserabnahme bestand **19/19 Abläufe** mit
Supabase Auth, PostgREST und tatsächlichen Datenbankantworten (keine simulierten
erfolgreichen Speicherantworten). Geprüft sind unter anderem unabhängige anonyme
Detailaufrufe, FAQ-Speicherung, Versionskonflikt, verlorene Commitantwort,
Veröffentlichungsretry, neue Edition, unberechtigter Zugriff und acht eigene
archivierte Editionen. Mobile Ergebnisänderungen Finished → DNF → Finished,
persönliche Archivierung und Entfernen des Ergebnisstatus blieben nach erneutem
Cloudlesen/Neuladen erhalten; Finish-Badges wurden ohne doppelte Einträge
entsprechend neu berechnet. Der sichtbare Planner-Navigationseinstieg wird
benutzt und seine Route/Ansicht geprüft. Beleg:
`exports/manual-workflow-acceptance/run-k7ZfiZ/acceptance-report.json`
(`production_touched: false`, `passed: true`). Testdaten sind synthetisch und
der Stack war ausschließlich lokal; dies weist keinen produktiven Rollout nach.

Auch `npm run test:manual-maintenance:local` bestand abschließend separat:
**213 SQL-Assertions** und echte getrennte Commit-/Lesesitzungen einschließlich
idempotenter Wiederholung. Zwei tatsächlich gleichzeitig schreibende Sitzungen
ergaben genau einen Commit und einen Versionskonflikt. Beleg:
`exports/p0-20261001/sql-resumed-green.log`. Beide lokalen Runner beendeten ihre
eigenen Teststacks; eine anschließende Podman-Abfrage zeigte keine aktiven
Container. Die für diese Tests gestartete Maschine wurde wieder gestoppt.

Zusätzliche Änderungen bei Wiederaufnahme: `tools/create-publish-package.js`,
`tools/generate-event-pages.js`, FAQ-Readback in `js/manual-event-maintenance.js`
samt Cacheadressen in `index.html`/`js/supabase.js`; Regressionen in
`tests/catalog-page-release.test.mjs`, `tests/catalog-consistent-snapshot.sql`,
den bestehenden SQL-/Browser-/Release-Tests und lokalen Runnern. Die RLS-Suite
akzeptiert zusätzlich ausschließlich den exakt geprüften, runner-eigenen
lokalen Abnahmestack. Die vier vorbereiteten Migrationen wurden bei dieser
Wiederaufnahme inhaltlich nicht verändert; Produktionsmigrationen bleiben
ausstehend. Betriebsdokumente wurden an diesen tatsächlichen Stand angepasst.

Nächster Betriebsschritt: den eng abgegrenzten Backend-/UI-Rollout gesondert
freigeben, dabei den nur lesenden Snapshot und die bestehende Housekeepingroute
von den akuten Admin-/Planneränderungen ausdrücklich unterscheiden. Housekeeping
nimmt vorhandene automatische Prüf-/Alterungsänderungen wieder auf. Die größere
P1-Arbeit und der 15er-Ausbaubatch bleiben pausiert. P0 benötigt weiterhin
editionsgenaue manuelle Nachweise, darunter den blockierten Paderborn-Nachweis;
erst bei erfüllten unveränderten Datenbedingungen den normalen Export und
vollständigen Releaseweg ausführen. Anleitungen:
[manuelle Pflege](MANUAL_EVENT_MAINTENANCE.md), [Release/Rückweg](LOCAL_PUBLISH.md).

Anschließende Roadmap dieses Auftrags: zuerst kontrollierter Ausbau zu etwa
300–500 nutzbaren zukünftigen deutschen Editionen, weiterführend 500 mit über
90 % vollständigen aktuellen Nachweisen. Danach Umkreisfilter, belastbarer
Anmeldestatus, teilbare Suchfilter und bei gemessenem Bedarf weniger gleichzeitig
gerenderte Eventkarten. Anschließend datengetriebene regionale SEO-Seiten und
gezielte Wartbarkeit. Diese Funktionen wurden hier nicht implementiert; die
bestehenden Releasegrenzen werden durch die Ausbauziele nicht ersetzt.

## Weiterer echter Browserpilot – 18:07 UTC

Paderborner Osterlauf 2027 wurde über den vorhandenen Kandidaten im Admin als
Entwurf angelegt, korrigiert, gezielt geprüft und veröffentlicht. Ergebnis:
**212 Discovery-Einträge (162 Deutschland), 992 Archiv-Editionen und acht
gültige vollständige Frischenachweise (3,77 %)**. Die alte Edition 2026 und ihr
Ergebnis blieben unverändert. Der Browserlauf entdeckte zusätzlich eine falsche
Statusanzeige in Karte/Liste, deren eng begrenzte Korrektur dokumentiert ist:
[Browserbericht](MANUAL_BROWSER_AUDIT_20260929.md).
Die Status-, Sprachwechsel- und Cachekorrekturen sind mit v94 produktiv und in
derselben zuvor betroffenen Browsersitzung nach normalem Neuladen bestanden.

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

## Vorbereiteter Pflegebatch – 1. Oktober 2026

Der lokale Batch `data/imports/review/germany-edition-care-20261001.json`
(Quellenbefunde und offene Fragen) und die gleichnamige CSV (priorisierte
Pflegeliste) verwenden ausschließlich vorhandene Eventidentitäten und offene
Nachfolgekandidaten. Die Dateien bleiben gemäß Repository-Regel lokal und
privat. Der lesende Supabase-Snapshot stammt vom **01.10.2026, 09:49:08 UTC**;
die gezielte Quellenrecherche erfolgte am selben Tag. Bezugsbestand sind
**15 vorgeschlagene deutsche 2027 Editionen**, mit Kandidatenterminen zwischen
01.01. und 01.10.2027: fünf Laufen, sechs Triathlon, vier Ultra/Trail. Sie sind
keine 15 öffentlichen Sucheinstiege und keine Nettozugänge. Fünf vorhandene
2027 Entwürfe werden weiterverwendet, zehn Kandidaten brauchen zunächst einen
privaten Editionsentwurf an der vorhandenen Event-ID.

**Ergebnis dieses Batches:** 14 editionsbezogen recherchiert, ein Quellenzugriff
gesperrt, alle 15 lokal zur Pflege vorgeschlagen; null menschlich vollständig
geprüft, null freigegeben und null durch diesen Batch veröffentlicht. Keine
Datenbankänderung, kein Import, kein Geocoding und kein Deployment. Die
Kandidatenprüfung `validated` wird ausdrücklich nicht als vollständiger
Frischenachweis gezählt. Recherchezeit und Beobachtungen stehen getrennt von
den unveränderten produktiven Erkennungs- und Prüfzeiten.

| Rang | Bestehende Event-ID / Ausgabe | Datumsbefund aus offizieller Quelle | Konkrete verbleibende Pflege |
| --- | --- | --- | --- |
| 1 | 892 The Last Light, 2027 | 06.03., Winter Edition | Vorhandenen Entwurf zu Winter/Original zuordnen; Anmeldung noch nicht veröffentlicht; Standort bestätigen. |
| 2 | 894 GaPa Everesting, 2027 | 14.–15.05. | Entwurf weiterpflegen; Runden-/Höhenformate strukturieren, 2027 Anmeldung und Standort selbst prüfen. |
| 3 | 180 Havelberg Triathlon, 2027 | 05.06. | Anmeldung ab 01.12.2026; 2027 Disziplindistanzen und Standort fehlen als Vollbeleg. |
| 4 | 186 Triathlon Ingolstadt, 2027 | 06.06. | 2027 Registrierungsziel vorhanden; echte Formularverfügbarkeit, Disziplindistanzen und Wettkampfort prüfen. |
| 5 | 269 Salzkotten Marathon, 2027 | 06.06. | Stammdatenort Paderborn gegen Salzkotten prüfen; Anmeldung ab 11.11.2026; Geodaten/gesamtes Programm bestätigen. |
| 6 | 189 Stadttriathlon Erding, 2027 | 13.06. | Ausschreibung und Anmeldung folgen; keine 2026 Distanzen oder Prüfungen übernehmen. |
| 7 | 826 Heuchelberg Trail, 2027 | 03.07. | Entwurf behalten; verlinktes Raceresult-Ziel 409838 gehört zu 2027, Programm und Anmeldeverfügbarkeit prüfen. |
| 8 | 616 Leipziger Triathlon, 2027 | 25.07. | Anmeldung ab 01.12.2026; Hauptseite/Programmlinks teils noch 2026; Standort und 2027 Distanzen prüfen. |
| 9 | 44 OstseeMan, 2027 | Haupttriathlons 01.08.; Wochenende 31.07.–01.08. | Kandidat 07.03. stammt aus Trainingslagerkontext; ausdrücklicher Review nötig; Startplatzbörse prüfen. |
| 10 | 899 Hunsbuckeltrail, 2027 | 15.08. | Entwurf behalten; oberer Registrierungslink führt noch zu 2026; nominale/GPS-Distanzen, Standort klären. |
| 11 | 913 Neustrelitz Triathlon, 2027 | 21.08. | Entwurf behalten; Anmeldung ab 01.05.2027, verlinktes Raceresult-Ziel noch 2026; Geodaten prüfen. |
| 12 | 106 Fränkische Schweiz Marathon, 2027 | 05.09. | Datum angekündigt; 2027 Programm, Anmeldung und Standort noch konkret prüfen. |
| 13 | 42 Münster Marathon, 2027 | Nicht ermittelt | Webtool durch robots.txt gesperrt; Kandidat 12.09. manuell im normalen Browser prüfen, weder bestätigen noch verwerfen. |
| 14 | 122 Baden Marathon, 2027 | 19.09. | Explizite 2027 Ankündigung verwenden; 2026 Seitenkopf nicht übertragen; Programm/Anmeldung/Standort prüfen. |
| 15 | 39 Berlin Marathon, 2027 | 26.09. | Offizielle Weiterleitung auf GENERALI 2027 belegt dieselbe Identität; Sponsor-/Quellenwechsel reviewen; Verlosung statt garantierter Teilnahme dokumentieren. |

Die Quellenbefunde stehen jeweils mit konkreter URL und beobachtetem Wert im
JSON. Beispiele für die zuerst fachlich zu klärenden Fälle:
[OstseeMan-Zeitplan und 2027 Ausschreibung](https://www.ostseeman.de/wettkampf.html),
[Neustrelitz 2027 mit noch altem Registrierungsziel](https://jedermann-triathlon.de/)
und [offizielle Berlin-Weiterleitung](https://www.bmw-berlin-marathon.com/en/).
Die früheren lokalen August-Befunde zu Fränkischer Schweiz und Baden-Marathon
waren damalige Momentaufnahmen; die jetzt sichtbaren 2027 Ankündigungen sind
neue Recherchebelege, keine nachträgliche Änderung alter Prüfnachweise.

Nächster Schritt: zunächst die vorhandenen Entwürfe sowie die drei konkreten
Kontext-/Registrierungskonflikte im bestehenden **Events pflegen**-Workflow
bearbeiten. Vor jeder Speicherung aktuellen Datenstand laden, Quellen selbst
lesen, nur tatsächlich geprüfte Angaben bestätigen und offene Konflikte
ausdrücklich entscheiden. Alle 14 bestehenden Kernprüfungen und die regulären
Freigabegates gelten weiter; dieser vorbereitete Batch enthält keine Freigabe.
`npm run test:germany-expansion` und lokale JSON-/CSV-Prüfung auf 15 eindeutige
Identitäten, fünf Entwurfsbezüge, Status/Zeitraum und fehlende Freigabeclaims
bestanden am 01.10.2026. Kein produktiver Pflegeablauf wurde hierbei getestet.
