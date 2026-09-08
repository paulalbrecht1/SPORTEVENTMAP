# P0: Paketvorbereitung und sichere Editionsfreigabe

Stand: 8. September 2026. Umsetzung der ersten beiden Technikschritte aus
[dem Durchsatzplan](P0_THROUGHPUT_PLAN_20260908.md). Die unveränderte
Datenqualitätsgrenze und der fachliche 20-Event-Pilot sind damit noch nicht erreicht.

## Wiederverwendbare Faktenpakete

`tools/p0-fact-batch/index.mjs` erzeugt aus einem expliziten Manifest Pakete
für 1–25 bestehende veröffentlichte Editionen. Vorherstände, Quellenoriginale,
Feldbelege und Ausgaben sind über SHA-256 gebunden. Gleiche Eingaben und
Templates erzeugen gleiche Ausgaben. Private Originale und erzeugte SQL-Pakete
bleiben unter dem ignorierten `exports/`-Verzeichnis.

Der Generator verwendet feste Apply-/Verify-/Rollback-Templates und eine enge
Feldliste. Identitäten, Termine, Quellenzustand, Veröffentlichung und Frische
sind keine frei änderbaren Patchfelder. Er berücksichtigt echte Trigger und
bewahrt Struktur und Präzision des Wettbewerbsprogramms. Unveränderte Events
bleiben im Adminimport, erzeugen aber keine unnötigen Faktenupdates.

Der Generator führt keine SQL-Abfrage aus. Ein Faktenpaket braucht weiterhin
fachlichen Gegenreview, Backup, isolierte Probe, aktuellen Vorabgleich und
anschließend die echte Adminattestierung. Faktenkorrektur und Attestierung sind
zwei getrennte Transaktionen; ein fehlgeschlagener zweiter Schritt hinterlässt
ausdrücklich Prüfbedarf. Bedienung und Eingabeformat stehen in der
[Werkzeuganleitung](../tools/p0-fact-batch/README.md).

## Veröffentlichung vorbereiteter Editionen

Der neue Vierargument-Aufruf `approve_edition_succession_candidates` verlangt
1–25 eindeutige Kandidaten-IDs, genau dieselbe Anzahl als Limit, Prüfnotizen und
vollständige Evidenz je konkreter Entwurfsedition. Er veröffentlicht ausschließlich
bereits vorbereitete private Entwürfe mit passender Kandidaten-, Editions- und
Quellenbindung. Die alte Zweier-API lehnt Veröffentlichungen ab.

Quelle, Event, Editionen und Kandidaten werden in fester Reihenfolge gesperrt;
Identitäten werden anschließend erneut verglichen. Fremde oder kranke Quellen,
laufende Quellenjobs, Publikationssperren, widersprüchliche Nachfolger und
offene fachliche Konflikte verhindern die Freigabe. Der Publisher kopiert weder
das Vorjahresprogramm noch dessen Anmeldestatus und ändert keine Eventfakten.

Veröffentlichung und Aufruf des unveränderten 14-Felder-Frischeprüfers erfolgen
in **einer Transaktion**. Scheitert ein Mitglied, werden sämtliche
Veröffentlichungen, Kandidatenentscheidungen, Aufgabenabschlüsse und Audits
dieses Pakets zurückgerollt. Automatische Veröffentlichung bleibt durch die
vorhandene Datenbankbedingung deaktiviert.

Die Adminoberfläche verwendet den bestehenden Belegdialog mit individueller
Bestätigung. Vor dem Schreiben lädt sie alle relevanten Tabellen neu und
verwirft bei Änderungen die Bestätigungen. Entfernte Editionen werden auch aus
Kandidatenliste und Evidenz entfernt. Gemischte Ergebnis-/Editionspakete werden
abgelehnt. Eine fehlende oder widersprüchliche Antwort erlaubt keine automatische
Wiederholung; zuerst ist der tatsächliche Zustand nachzulesen.

Dieser Weg legt selbst keine Entwürfe an. Quellenfunde bleiben Kandidaten.
Ein konkreter Entwurf mit vollständigen aktuellen Fakten und eine korrekt
gebundene, tatsächlich abgerufene offizielle Quelle sind eigene Voraussetzungen.

## Quellenarbeit und verbleibender Pilot

Zehn derzeit unsichtbare Kandidaten wurden gezielt vorgeprüft. Die Recherche
hat zunächst 53 erfolgreiche Quellenoriginale und drei fehlgeschlagene Abrufe
mit Zeitpunkt und Prüfsumme dokumentiert. Zwei zusätzliche Originale ergänzen
die gezielte Historienprüfung. Acht Kandidaten bleiben wegen Angaben
aus verschiedenen Jahren, fehlender Programme, falscher Anmeldeziele oder
ungeklärter Identität gesperrt. Ein weiterer hat einen offenen Distanzwiderspruch.

MidSummerRun Hamburg besitzt ein vollständiges Quellenpaket für 2027.
Die Gegenprüfung unterscheidet den ungefähren Torhausmarker von einer
vermessenen Startlinie und das neue Kinderprogramm von historischen Angaben.
Die gemeinsame Eventbeschreibung darf keine neue Distanz auf alte Editionen
übertragen. Eine vorbereitete Recherche zählt weiterhin als **null** neue
veröffentlichte Events, solange Entwurf, Quellenbindung und echte Freigabe fehlen.

Aus diesem bewusst schwierigen Zehnerset lässt sich keine allgemeine
Erfolgsquote oder beschleunigte Fertigstellungsdauer ableiten. Der nächste
fachliche Nachweis bleibt: zwei abgeschlossene Zehnerpakete mit insgesamt
mindestens fünf zuvor unsichtbaren Identitäten. Erst deren tatsächlicher Aufwand
und Ausschuss begründen eine Durchsatzprognose.

## Betriebsnachweise

Vor der Backendänderung wurde ein verschlüsseltes Produktionsbackup erstellt
und in eine isolierte lokale Datenbank wiederhergestellt. Die Wiederherstellung
dauerte 38,886 Sekunden; Daten, RLS, Nutzerisolation und öffentliche Views
wurden geprüft. Der verschlüsselte Restorepunkt bleibt lokal erhalten.

Backup-SHA-256:
`dcc793d01ed3ece1c43d1e40f0cd1503397f44e39aea04094be5ee052f1b2792`.

Die vollständige technische Suite `npm run test:code` bestand einschließlich
**125/125 Browsertests** und Layoutprüfung ohne Warnungen. Anschließend geänderte
Prüfdateien und Templates wurden gezielt erneut getestet. Der Paketgenerator
bestand **54/54 Tests** und echte 1er-/10er-/25er-Proben auf dem Restore-Klon:
Apply, Verify, Fehler im letzten Update, neu entstandene Aufgaben/Vorschläge,
Drift, Rollback und Wiederholungsschutz. Pro Phase entstanden exakt 5/41/101
Snapshots. Ein Fehler beim 25. Event rollte auch die 24 vorherigen Updates zurück.
Die abschließende reine Korrektur eines Verify-Kommentars ist separat durch
Hash- und SQL-Äquivalenznachweis dokumentiert; die tatsächlich ausgeführten
Originaldateien wurden nicht überschrieben.

Auf einer zweiten, frisch aufgebauten lokalen Datenbank bestanden sämtliche
**52 Migrationen**, DB-Lint und die Abschlussprüfungen. **23/23 Auth-/REST-Tests**
prüften echte lokale Benutzeranmeldungen, einschließlich erfolgreicher
Adminveröffentlichung, öffentlichem Frischenachweis, Audit mit tatsächlicher
Admin-ID und Ablehnung der Wiederholung. Hinzu kamen **75 Publikationsprüfungen**
für 1/10/25 Editionen und **61 SQL-/4 REST-Prüfungen** des Quellenmonitors.
Die erste Produktionskopie bestand dieselben 75 Publikationsprüfungen.

Die Migration wurde um 09:01 UTC produktiv als
`20260908090111_safe_successor_edition_publication` registriert. Der lokale
Dateiname wurde an diese Serverversion angepasst; der Inhalt blieb unverändert:
SHA-256 `22f43b60354c8243c708e64873009c518d17b08788fb9629b371b188203d7ed1`.
Es wurden keine historischen Migrationen nachträglich in Production abgespielt.
Der Produktionsstand enthält damit 42 registrierte Migrationen; die vollständige
lokale Migrationshistorie enthält zusätzlich bereits früher zurückgestellte
historische Erweiterungen. Diese Differenz ist keine pauschale Rolloutfreigabe.

Der Nachvergleich um 09:02 UTC bestätigte unveränderte vollständige Event- und
Editionszeilen sowie unveränderte Favoriten und Saisonpläne über Prüfsummen.
999 Events, 1.022 Editionen, 1.016 Quellen, 330 Discovery-Einträge und 989
Archiv-Editionen blieben erhalten. Die Definition des Frischeprüfers ist exakt
unverändert; die neuen Funktionsrechte und das weiterhin deaktivierte
automatische Publizieren sind geprüft. Die öffentlichen Zugriffsaudits bestanden
vor und nach dem Rollout, einschließlich anonymer Ablehnung beider
Publikations-APIs mit HTTP 401 und PostgreSQL-Rechtefehler `42501`.

Beide temporären Testumgebungen wurden vollständig bereinigt. Beim Restore-Klon
wurden exakt drei Container, zwei Volumes und der zuvor aufgelöste Klartextordner
entfernt. Andere lokale Ressourcen und der verschlüsselte Restorepunkt blieben
nachweislich erhalten. Lokale Detailprotokolle liegen unter
`exports/p0-throughput-implementation-20260908/` und gehören nicht nach GitHub.

Ein grüner technischer Stand ersetzt weder den regulären Katalogexport noch
dessen Mindestbestand, Frischequote oder Auditbindung. Wrangler folgt erst auf
die vollständige Daten- und Releasefreigabe; die Policy bleibt unverändert.
Der reguläre Export hat erneut korrekt abgelehnt: **330 statt mindestens 400
sichtbare Einträge; 4,55 % statt mindestens 55 % Frische; 50 % Vollständigkeit**.
Es wurden kein Fallback überschrieben, keine Website-Dateien per Wrangler
veröffentlicht und keine zusätzlichen Events als fertig gezählt.

Der nächste fachliche Arbeitsschritt ist ein geschützter privater Entwurf für
das gegengeprüfte MidSummerRun-Paket mit eigener Quellenbindung und echtem
Crawl. Gleichzeitig muss eine breitere Auswahl vollständig belegbarer Fälle
für die beiden Zehnerpakete entstehen. Die neue Technik verkürzt wiederholte
Vorbereitung und Freigabe; eine höhere fachliche Stundenleistung ist erst nach
diesen abgeschlossenen Pilotpaketen nachgewiesen.

Die nachfolgenden Fach- und Produktionsschritte dokumentiert der
[P0-Datenpilot 06](P0_DATA_PILOT06_20260908.md). Dort sind die acht tatsächlichen
Adminattestierungen, die gesonderte Datumskorrektur und der abgeschlossene
MidSummerRun-Produktionsschritt zeitlich getrennt vom hier beschriebenen Stand festgehalten.
