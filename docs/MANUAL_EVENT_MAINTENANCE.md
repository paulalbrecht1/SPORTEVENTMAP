# Events manuell pflegen

Stand: **produktiv ausgerollt am 01.10.2026 mit UI v141** und den vier
vorbereiteten Backendmigrationen. Produktionsdomain und sämtliche 1.049 Dateien
des unveränderlichen Deployments sind geprüft. Echte anonyme Suche/Details
bestehen bei 1440/390 px. Speicher-, Ergebnis- und Badge-Schreibtests wurden mit
echter Auth/DB ausschließlich lokal ausgeführt; keine produktiven Testeinträge.
Rollout-/Rückwegnachweis: [P0-Abschlussplan](P0_FINISH_PLAN_20260929.md).
Die neue Produktregel ersetzt die früheren Pflichtprüfhäkchen im normalen
Pflegeweg. Historische Abnahmen vom September bleiben weiter unten dokumentiert;
sie weisen die heute vorbereitete Änderung nicht nach.

## Normaler Pflegeweg: eine Bestätigung

1. Mit dem SportEventMap-Administratorkonto **Events pflegen** öffnen, Veranstaltung
   suchen und die konkrete Edition auswählen.
2. Gewünschte Angaben bearbeiten. Eingeklappte und unberührte Felder bleiben
   erhalten. Ein absichtlich geleertes optionales Feld wird entfernt; ebenso
   funktionieren die vorhandenen Schalter **Bewusst entfernen**.
3. **Änderungen speichern** anklicken. Ein Dialog zeigt die betroffene Edition
   und tatsächlich geänderte alte/neue Werte, einschließlich Zusatzdetails.
4. **Übernehmen und speichern** bestätigt einmal. **Abbrechen** und Escape
   schreiben nichts. Es gibt keine zusätzlichen Pflichtprüfhäkchen oder einen
   weiteren normalen Veröffentlichungsbutton.

Nach einer Suche oder Eventauswahl führt **Schließen und anderes Event suchen**
zur leeren Suche zurück. Treffer, Formular und Veröffentlichungsmeldung werden
geschlossen; das Suchfeld bekommt den Fokus. Bei ungespeicherten Eingaben fragt
die Anwendung vor dem Verwerfen nach. Abbrechen erhält das Formular. Beim
Öffnen eines Events verschwinden die Suchtreffer automatisch. Verspätete Such-
oder Ladeantworten können eine geschlossene Auswahl nicht wieder öffnen.
Während des Speicherns oder bei noch unklarem Speicherstand bleibt dieser
Wechsel gesperrt, bis die bestehende sichere Speicherprüfung beendet ist.

Die serverseitige Adminprüfung, Transaktion, Versionsprüfung und Requestkennung
bleiben bestehen. Wiederholung desselben Auftrags erzeugt keine zweite Edition.
Nach dem Speichern werden die konkreten Werte erneut gelesen und verglichen;
eine formal erfolgreiche Antwort mit unveränderten Werten gilt nicht als Erfolg.
Fehler erhalten die Eingaben. Bei Versionskonflikt **Aktuellen Stand laden**,
vergleichen und erneut bestätigen. Bei unklarer Antwort denselben Auftrag im
offenen Dialog erneut speichern. Ein späterer öffentlicher Prüfretry führt keine
zweite Datenänderung aus.

## Manuelle Freigabe und Quellenprüfung bleiben getrennt

Die gemeinsame Bestätigung dokumentiert Admin, Serverzeit, vorherigen und neuen
Wert sowie manuelle Freigabe nur der tatsächlich geänderten Angaben. Diese
Angaben werden gegen automatisches Überschreiben geschützt. Bestehende Quellen
bleiben erhalten; die offizielle Editionsquelle und Veranstalterlinks können
im bestehenden Formular bearbeitet und geöffnet werden. Eine Notiz ist optional.

Eine URL-Übernahme oder Wertefreigabe beweist keine frische externe Prüfung.
Sie erneuert keine Quellenprüfzeiten und setzt keine ganze Edition auf vollständig
aktuell verifiziert. Die bestehende feldwert-/editionsgebundene Definition für
diesen Qualitätsnachweis bleibt erhalten. Tatsächliche externe Prüfungen werden
über die vorhandenen gesonderten Verifikationswerkzeuge dokumentiert; sie sind
keine Voraussetzung für eine zulässige normale manuelle Korrektur.
Der tägliche Pflegeweg benötigt keine KI-Credits oder LLM-Aufrufe.

Zusatzdetails behalten die Auswahl **Nur diese Ausgabe** beziehungsweise
**Allgemeines Event-Wiki – alle Ausgaben**. Preise, Startwellen und jährliche
Streckenangaben gehören zur Edition. Freigegebene Zusatzwerte sind öffentlich
sichtbar, ohne sich als Quellenprüfung auszugeben. Unbearbeitete Werte und
Quellen bleiben erhalten; eine spätere abweichende ungeprüfte Änderung kann
die frühere Freigabe nicht für ihren neuen Wert verwenden.

## Bestehende Edition oder ausdrücklich neue Edition

Eine Terminverschiebung korrigiert grundsätzlich die ausgewählte Edition,
auch über einen Jahreswechsel. UUID, Ausgabejahr, Slug, historische Verweise
und persönliche Ergebnisse bleiben erhalten. Bei einem anderen Kalenderjahr
bietet derselbe Bestätigungsdialog die Wahl **Bestehende Edition korrigieren**
(Vorgabe) oder **Neue Edition anlegen**. Das Datum allein erzeugt keine Edition.
Der bestehende direkte Einstieg **Neue Edition anlegen** bleibt verfügbar.

Für eine neue Edition entstehen eine neue UUID und ein eigenes Jahr/Kürzel.
Eine bereits vorhandene Zielausgabe muss weiterbearbeitet werden; die Prüfung
im Dialog und die Datenbank verhindern Duplikate. Gemeinsame Stammdaten werden
wiederverwendet. Unbearbeitete Jahresangaben, Gebühren, Anmeldung und alte
Quellenprüfnachweise werden nicht übernommen. Im Dialog ausdrücklich bearbeitete
Zusatzwerte gehören bei dieser Wahl zur neuen Edition; FAQ bekommen eigene IDs.
Alte Edition und persönliche Teilnahmen bleiben erhalten.

Die manuelle Freigabe verknüpft zulässige Veröffentlichung automatisch mit dem
Speichern. Fehlende strukturelle Pflichtangaben lassen eine neue Edition als
privaten Entwurf gespeichert; der konkrete Grund wird angezeigt. Echte
Editions-/Dublettenkonflikte und Veröffentlichungssperren bleiben wirksam.
Importe, Crawler und Vorschläge behalten ihren gesonderten Reviewprozess.

## Öffentlicher Stand

**In der Datenbank gespeichert und neu geladen** bestätigt Persistenz.
Anschließend prüft die Anwendung anonymen Archiv-/Discoverystand, lädt Karte
und Liste neu und kontrolliert die normale Detailseite. Erst danach lautet
die Meldung **Öffentlich aktualisiert: Normale Detailseite geprüft**.
Historische und weitere spätere veröffentlichte Editionen können öffentlich
im Archiv/Detail verfügbar sein, während Discovery nur die nächste geeignete
Edition derselben Veranstaltung zeigt.

Bei Abruffehlern **Öffentlichen Stand erneut prüfen** verwenden. Das wiederholt
nur die Kontrolle. Veröffentlichte Einzelkorrekturen benötigen keinen weiteren
normalen Admin-Klick und keine Freigabe des gesamten ungeprüften Katalogs.
Supabase bleibt die maßgebliche Datenquelle. Cacheadressen der betroffenen
Oberflächenmodule sind erneuert; bestehende statische Seiten laden denselben
Live-Renderer über den vorhandenen kontrollierten UI-Releaseweg.

Ein Datenbankausfall kann den klar gekennzeichneten älteren Export anzeigen.
Manuelles Speichern erneuert diesen Fallback nicht. **Ausfallexport:
Veröffentlichung erforderlich** bezeichnet diesen getrennten Zustand. Der
bestehende geprüfte Datenrelease bleibt dafür erforderlich; fehlgeschlagene
Exportchecks erhalten den letzten Export. Keine Exportzeit ersetzt Quellenzeit.

## Persönliche Historie, Ergebnisse und Profil

Persönliche Einträge werden zuerst aus den eigenen `season_planner_events`
geladen. Anschließend werden ausschließlich deren konkrete erlaubte Editionen
im öffentlichen Archiv aufgelöst. Tatsächlich `archived` gespeicherte Editionen
liefert ergänzend `get_own_planner_archived_editions` nur bei eigenem UUID-Bezug,
nachgewiesener früherer Veröffentlichung und weiterhin freigegebener Eventmarke.
Entwürfe werden damit nicht geöffnet. Das gesamte Archiv kommt nicht zurück in
die öffentliche Suche. UUID ist maßgeblich; ältere Textreferenzen werden nur bei
eindeutigem vollständigem Editionsschlüssel aufgelöst, niemals auf die neueste
Ausgabe geraten. Alte dreiteilige Name-/Datum-/Ort-Schlüssel werden gezielt
gegen vierteilige öffentliche Archivschlüssel geprüft; mehrere Treffer bleiben
mehrdeutig. Ein fehlender Bezug bleibt als persönlicher Eintrag sichtbar und
beweist keine Löschung. Bei einem fehlgeschlagenen zusätzlichen Archivabruf
bleibt eine bereits eindeutig geladene öffentliche Edition mit Abrufhinweis
nutzbar. Ein erfolgreich festgestellter fehlender Bezug wird damit nicht
überschrieben. Fremde persönliche Daten bleiben geschützt.

Vergangene geplante Teilnahmen bleiben zum Nachtragen erreichbar. Der vorhandene
Ergebniseditor speichert in `season_planner_events.planner_details.result`;
Archivierung oder eine neue Edition verändern diesen Bezug nicht. Cloudspeicherung
wird durch erneutes Lesen bestätigt. Bei Fehlern bleibt das Ergebnis lokal mit
sichtbarem Syncstatus und sicherem Retry erhalten; es wird nicht stillschweigend
aus einem Request entfernt oder beim Laden durch leere Standardwerte ersetzt.

Gesamtzahl zählt eigene Einträge im gewählten Saisonumfang einschließlich
Historie. Anstehend verlangt einen bekannten noch bevorstehenden Termin,
geplante Teilnahme und passenden Veranstaltungsstatus. Vergangen ohne persönliche
Abschlussangabe bleibt offen; Datum und Archivierung erzeugen keinen Finish.
Ausdrücklich **Finished** bzw. das ältere **Finisher** zählt für Abschluss und
die vorhandenen lebenszeitbezogenen Badges (5/10/20/50/100). DNF/DNS/DSQ bleiben
in der Historie, zählen jedoch nicht als Finish. Abgesagte persönliche Teilnahmen,
sonstige Abschlussangaben und unbekannte Termine zählen nicht als anstehend.
Wiederholte Berechnung vergibt
keine doppelten Leistungen. Profil und Planner verwenden denselben persönlichen
Bestand und dieselbe Status-/Datumslogik; Ergebnisprivatsphäre bleibt erhalten.

## Abnahme und Rolloutgrenze

Nachtrag zum Schließen-/Eventwechsel vom 01.10.2026: **14 neue Browserfälle**
prüfen A → schließen → B, die Speicherung ausschließlich an B, Verwerfen/
Abbrechen, Zusatzdetails und Wettbewerbe, verspätete Antworten sowie die
Speichersperren bei Busy/unklarem Ergebnis. Der anschließende gemeinsame Admin-,
Knowledge-, Theme- und Kontrastlauf bestand **61/61**, einschließlich 390 px
und 1280 px; der mobile Schließen-Button wurde visuell geprüft. Pflege-Unitgruppe
**26/26**, Releaseentrypoints **73/73**, Static-Smoke und `git diff --check`
bestanden. Cacheadressen von Adminloader und Pflege-Modul wurden auf v140
erneuert. Belege: `exports/acute-20261001/event-switch-browser-green.log`,
`event-switch-unit.log`, `event-switch-release.log`, `event-switch-static.log`.
Auch diese Ergänzung ist lokal und noch nicht produktiv ausgerollt.

Bei der anschließenden echten Supabase-Abnahme wurde ein weiterer Speicherfehler
gefunden: FAQ-Readback verglich auch vom Server ergänzte Metadaten mit dem
Formularauftrag und meldete dadurch korrekt gespeicherte Fragen fälschlich als
unklar. Geprüft werden jetzt die beantragten Werte (ID, Frage, Antwort, Sortierung)
und die Detailzuordnung; echte Abweichungen bleiben Fehler. Eine neue Speicherung
entfernt außerdem die Veröffentlichungserfolgsmeldung des vorherigen Auftrags.
Adminruntime und Pflege-Modul verwenden dafür Cacheversion **v141**. Keine
Migration ist für diese beiden Korrekturen nötig. Anschließend bestanden
**27/27 Unitprüfungen und 50/50 Admin-/Knowledge-Browserfälle**, einschließlich
mobiler Bedienung und Suche schließen/anderes Event öffnen. Belege:
`exports/p0-20261001/manual-faq-unit.log`, `faq-browser.log`.

Lokaler Lauf vor Wiederaufnahme von P0 am 01.10.2026: `npm run test:code` bestand mit allen
technischen Testgruppen und **225/225 Browsertests**. Die gezielten Gruppen
`test:manual-maintenance` und `test:personal-history` bestanden jeweils
**26/26**; die Browserabnahme umfasst **35** Admin-/Knowledgefälle sowie die
bestehenden und neuen Planner-, Profil-, Detail-, Kontrast- und Mobilfälle.
Der mobile Bestätigungsdialog wurde außerdem anhand des Screenshots geprüft.
`git diff --check` bestand. Belege: `exports/acute-20261001/test-code-green.log`,
`admin-browser-final.log`, `personal-unit-final.log`, `manual-unit-final.log`.
Die Browsertransporte sind kontrollierte lokale Testantworten; diese Ergebnisse
ersetzen keine reale SQL-/RLS-Laufzeitprüfung und keinen produktiven Schreibtest.

`test:all`, `prepare-package` und `verify-package` wurden ebenfalls ausgeführt
und blockierten am unveränderten 36-Spalten-Fallback gegenüber dem aktuellen
42-Spaltenschema. Es entstand kein freigegebenes Releasepaket. Die tatsächlichen
ersten Aufrufe von `test:manual-maintenance:local` und `test:rls:local` scheiterten
vor der SQL-Abnahme an der gestoppten lokalen Engine. Die vorhandene Podman-
Maschine `sporteventmap` wurde bei Wiederaufnahme von P0 gestartet; eine
Neuinstallation war nicht nötig. Im isolierten Workflowstack bestanden danach
**64 Migrationen, 247 SQL-Assertions und die vorhandene RLS-Suite (23/23)**.
Zusätzlich bestanden deren bestehenden Knowledge-/Legacy-SQLtests (14/18
Assertions). Die vorausgegangenen SQL-Fehler waren falsche Fixtureannahmen zu
Triggerfolgen, privaten Schema-ACLs und uneindeutige Variablen-/Spaltenbezüge;
Berechtigungen und Qualitätsregeln wurden dafür nicht gelockert.

Der erneute vollständige technische Lauf bestand anschließend mit **239/239
Browsertests**, sämtlichen Scriptgruppen und Layoutprüfungen
(`exports/p0-20261001/test-code-resumed.log`). Nach dem FAQ-Fix folgten die oben
genannten 27 Unit- und 50 gezielten Browserprüfungen sowie erneut bestandene
Releaseentrypoint- und Static-Smoke-Prüfungen.

Die echte lokale Browserabnahme bestand zusätzlich **19/19 Abläufe** mit
tatsächlicher Authentifizierung, PostgREST, SQL-Speicherung und unabhängigem
anonymem Detailaufruf; erfolgreiche Speicherantworten sind hier nicht simuliert.
Abgedeckt sind Konflikt/Retry, Zusatzdetails, neue Edition, Zugriffsschutz und
zehn konkrete persönliche Teilnahmen, darunter acht eigene archivierte
Editionen. Die mobilen Ergebnisfelder speichern Finished → DNF → Finished,
persönliche Archivierung und die Rücknahme eines Abschlussstatus dauerhaft;
Cloud-Readback/Neuladen und Badgewechsel zwischen fünf und vier Finishes bestehen
ohne neue persönliche Zeilen. Beleg für diese Browserabläufe:
`exports/manual-workflow-acceptance/run-k7ZfiZ/acceptance-report.json`.
Alle Beteiligten und Events sind synthetische lokale Testdaten; Produktion
wurde nicht verändert.

Der separate Lauf `npm run test:manual-maintenance:local` bestand ebenfalls:
**213 SQL-Assertions**, tatsächliche Commit-/Readback-/Retry-Sitzungen und zwei
gleichzeitig schreibende Datenbanksitzungen mit genau einem Commit und einem
Versionskonflikt (`exports/p0-20261001/sql-resumed-green.log`). Beide Teststacks
wurden durch ihre Runner bereinigt. Die anschließende Podman-Containerliste war
leer; die eigens gestartete Maschine wurde wieder gestoppt.

Geänderte akute Anwendungspfade: `js/manual-event-maintenance.js`, die
persönlichen Lade-/Sync- und Profilfunktionen in `js/supabase.js`, Planner in
`js/events.js`, öffentlicher Renderer `js/event-detail-live.js` sowie seine
Cacheadressen in `js/event-detail.js`/`event-detail.html`. `index.html`,
`js/i18n.js` und die bestehenden Releaseprüfungen führen die passenden
Beschriftungen, Runtimeadressen und Regressionen nach. Der schmale UI-Paketweg
nimmt die bereits vorbereiteten P0-Oberflächenabhängigkeiten mit; Datenartefakte
und Katalogfreigaben bleiben gesondert geschützt.

Die E2E-Regressionssuite verwendet kontrollierte Antworten; die gesonderte
Workflowabnahme verwendet den echten isolierten lokalen Supabase-Stack. Die neue Migration
`20261001104403_manual_approved_save.sql` ist lokal getestet und inzwischen produktiv installiert.
Ihr SQL-/RLS-Rollbacktest ist in `npm run test:manual-maintenance:local`
eingebunden. Der ausdrücklich genehmigte Backend-/UI-Rollout ist abgeschlossen. Für tatsächlich
archivierte Editionen benötigt der Planner außerdem
`20261001112438_own_planner_archived_editions.sql` (ebenfalls lokal getestet und
inzwischen produktiv installiert).
Die Migration ergänzt ausschließlich den begrenzten Lese-RPC; persönliche
Datensätze, Referenzen und Tabellen-RLS werden nicht verändert.
Siehe [UI-Release](UI_ONLY_RELEASE.md) und [Local Publish](LOCAL_PUBLISH.md).

Zum Nachtesten die vorhandene lokale Podman-Maschine bei Bedarf starten und
`npm run test:manual-maintenance:local`, anschließend
`npm run test:manual-workflow:local` ausführen. Beide verwenden eigene temporäre
Stacks. Der zweite Befehl enthält die vollständige bestehende RLS-Suite und die
Browserabnahme mit echter lokaler Authentifizierung. Deren Workdir-Freigabe
prüft exakten Pfad, Ownership-Metadaten, Projekt-ID, lokalen API-Endpunkt und
Containerlabel; verbundene Cloudprojekte sind ausgeschlossen.
Im Admin ein optionales Feld ändern oder leeren, speichern, einmal bestätigen
und anschließend erneut öffnen sowie in einer unabhängigen Besuchersitzung
Suche und Details prüfen. Abbrechen darf nichts schreiben. Eine Verschiebung
über den Jahreswechsel muss dieselbe Edition behalten; die ausdrückliche neue
Edition muss ihre alte Ausgabe erhalten. Mit einem ausschließlich lokalen
Testkonto eine Edition planen, archivieren, Ergebnis nachtragen, ab-/anmelden
und ursprüngliche UUID, Ergebnis, Zähler und Badgefortschritt vergleichen.
Vergangen ohne Finish und DNF/DNS/DSQ dürfen keinen Finish-Badge erzeugen.
Die vorbereiteten SQL-Tests kapseln Testdaten und rollen alle Schreibvorgänge
zurück; produktive Konten und Events sind dafür nicht freigegeben.

## Bestehende Datenwege

### Kompakte Qualitätsübersicht – lokal ergänzt am 01.10.2026

Unter **Datenqualität & Prüfungen → Was Nutzer gerade sehen** stehen nun
Messzeitpunkt, zukünftige Sucheinstiege insgesamt/Deutschland, deren vollständige
aktuelle Nachweise im selben Bestand, fehlende Nachweise und überfällige Prüfungen.
Eventidentitäten, alle veröffentlichten Editionen, Archiv und Entwürfe werden
separat benannt. Offene Reviews zählen Quellenaufgaben, ausstehende Vorschläge
und offene Nachfolgekandidaten im gesamten Pflegebestand; sie sind keine Zahl
fehlerhafter öffentlicher Events. Der JSON-Prüfbericht nutzt denselben Evaluator
wie der Export und unverändert `get_public_event_freshness_guard`.

Ohne Zugriff oder gültigen Snapshot steht **nicht ermittelt**. Status `verified`
oder ein erfolgreicher Quellenabruf reichen nicht. Ein angezeigter Exportstand
hat geprüfte Dateihashes; fehlende ursprüngliche Snapshotzeit bleibt
**nicht dokumentiert**. Ein Qualitätscheck braucht einen protokollierten
erfolgreichen Validierungs- oder gebundenen Exportcheck, keinen Crawlzeitpunkt.

Diese Ergänzung und die zwei im P0-Plan genannten Migrationen sind **nur lokal**.
Bis zur geprüften Installation des Snapshot-RPC kann die neue Anzeige keinen
aktuellen Bestand ermitteln. Der vorhandene Pflegeweg bleibt unabhängig davon.
Kein neuer KI-Aufruf, Crawler oder Geocoder ist erforderlich.

| Zweck | Verwendeter Projektbestand |
| --- | --- |
| Dauerhafte Veranstaltung | `events` |
| Konkrete Austragung und Wettbewerbe | `event_editions`, `race_formats` |
| Offizielle Quellen und technische Abrufe | `event_sources`, `source_crawl_results` |
| Änderungsverlauf und Feldschutz | `event_audit_log`, `event_field_controls` |
| Konflikte und Nachfolgekandidaten | `event_change_proposals`, `edition_succession_candidates`, Review-Inbox |
| Karte und Liste | `public_event_discovery` über `js/event-catalog-loader.js` |
| Öffentliche Ausgabe | `public_event_archive`, gemeinsamer Live-Renderer für reguläre und dynamische Detailseiten |
| Persönlicher Saisonplaner und Ergebniseditor | `season_planner_events.edition_id`, `planner_details.result`; `edition_results` bleibt der gesonderte Ergebnisbestand |
| Ausfalldaten und statische Seiten | `data/events.csv`, `data/event-editions-public.json`, `event/` |

Die Umsetzung ergänzt den vorhandenen Vanilla-JavaScript-Admin und die
Supabase-RPCs. Es gibt keine zweite Eventdatenhaltung. Der vorhandene Source
Monitor und die Importwege bleiben angebunden.

## Historische Migrationen und Pilotnachweise (v90/v91)

1. Datenbanksicherung und Schemaabgleich nach
   [Production-Recovery-Runbook](PRODUCTION_RECOVERY_RUNBOOK.md) durchführen.
   Die dokumentierte ältere Migration-History-Drift verbietet ein blindes
   Anwenden sämtlicher ausstehender Migrationen.
2. Die beiden neuen Migrationen in dieser Reihenfolge prüfen und anwenden:
   `20260929104600_manual_event_maintenance.sql`,
   `20260929104628_manual_edition_import_compatibility.sql`.
   Sie ändern keine fachlichen Produktionswerte und geben keine Kandidaten frei.
   Beide sind bereits produktiv. Auch der zusätzliche Hotfix
   `20260929130903_manual_maintenance_conflict_http_status.sql` ist produktiv
   angewendet und unabhängig nachgeprüft. Er meldet
   zwischenzeitliche Änderungen als HTTP 409, damit PostgREST den fachlichen
   Versionskonflikt nicht bis zum Timeout wiederholt. Die Versionsprüfung bleibt
   unverändert; dafür ist kein weiterer UI-Release nötig.
3. Datenbankprüfungen und Admin-/Nicht-Admin-Zugriffe prüfen, danach die Website
   mit dem zusätzlichen Modul `js/manual-event-maintenance.js` veröffentlichen.
4. Statische Daten weiterhin mit `npm run data:refresh-public` aktualisieren.
   Dieser vorhandene Ablauf exportiert Supabase, prüft Daten und erzeugt
   Eventseiten sowie Sitemap. Fehler müssen behoben und derselbe Ablauf erneut
   ausgeführt werden; keine Ersatzdaten von Hand in Exporte schreiben.
5. Veröffentlichung und Hashprüfung des erzeugten Pakets gemäß
   [Local Publish](LOCAL_PUBLISH.md) durchführen. Die vorhandenen Qualitätsgates
   und die Trennung zwischen Git-Push und Website-Deployment bleiben bestehen.

Kein zusätzlicher privilegierter Browserschlüssel und kein neues LLM-Secret
werden benötigt. Produktive Migration und Website-Release sind gesonderte
Betriebsschritte; lokale Tests weisen keinen produktiven Rollout nach.

## Ausgeführte Prüfungen und Grenzen

Die folgenden Entwicklungsergebnisse vom 29. September dokumentieren zunächst
den v90-Ausgangsstand; zusätzliche Nachweise für v91 und den Konflikt-Hotfix
stehen darunter:

Für den lokalen Datenbanktest werden die installierten Projektabhängigkeiten
und eine laufende lokale Docker-/Podman-Engine benötigt. Der Test erstellt
einen separaten Stack, verwendet keine Produktionsverbindung und räumt
seine eigenen Testressourcen anschließend auf.

- `npm run test:manual-maintenance`: 11 bestandene Unit-Tests, unter anderem
  für gezielte Feldänderungen, explizites Löschen, Wiederholungen nach unklarer
  Antwort und die Prüfung des öffentlichen Datenstands.
- `npm run test:manual-maintenance:local`: Alle 56 Migrationen wurden auf
  einer frischen, isolierten lokalen Supabase-Datenbank angewendet; 66
  SQL-Prüfungen bestanden. Geprüft wurden unter anderem Adminrechte,
  Feldschutz, Editionsidentität, historische Verknüpfungen, Quellenfehler,
  Kandidaten und Freigabefehler. Zusätzliche getrennte Datenbanksitzungen
  belegten Commit und erneutes Laden, anonymes öffentliches Lesen,
  serverseitige Prüfer/Zeitstempel und idempotente Wiederholung. Zwei wirklich
  parallele Schreibsitzungen ergaben genau einen Commit und einen
  Versionskonflikt.
- Die gezielte Browserprüfung `tests/e2e/manual-event-maintenance.spec.mjs`
  bestand mit 14 Fällen einschließlich mobiler und Desktopansicht. Diese
  UI-Prüfungen verwenden kontrollierte RPC-Antworten; die echte Speicherung
  und Datenbanksicherheit werden separat durch den lokalen Datenbanklauf
  geprüft.
- `npm run test:code`: Der abschließende vollständige Lauf bestand mit allen
  technischen Scriptgruppen, Layoutprüfungen und 159 Browserfällen. Darin
  sind die 14 neuen Pflegefälle enthalten. Bestehende Admin-Tests wurden um
  den vierten Tab ergänzt; auch die zugehörigen Kontrastprüfungen bestanden.
- `git diff --cached --check` und die Prüfung der 24 vorgesehenen Dateien auf
  private Schlüssel und Zugangsdaten waren unauffällig.
- `npm run check` bleibt am vorhandenen Datenfreigabe-Gate gesperrt: Der
  versionierte Datenqualitätsbericht enthält fünf ungeklärte, releasekritische
  Dublettenkandidaten. Die bestehenden Gates wurden nicht abgesenkt. Dieser
  Befund ist keine neue Abfrage des aktuellen produktiven Datenbestands.

Nachtrag zur P0-Fortsetzung: Die tatsächliche Produktionsbasis besitzt das
optionale Stage-4-Subsystem nicht. Der entsprechende Migrationsabschnitt
prüft jetzt dessen Vorhandensein, ohne die übrigen Schema-Prüfungen zu lockern.
Ein frischer Produktions-Restore mit 44 historischen Migrationen besteht beide
neuen Migrationen und 64 anwendbare SQL-Prüfungen. Nur zwei Stage-4-Prüfungen
sind dort ausdrücklich nicht anwendbar. Die Hashes von 14 bestehenden
Tabellen/Ansichten und bisherige Frischeentscheidungen bleiben unverändert.
Der vollständige lokale Stand besteht zusätzlich alle 66 SQL-Prüfungen.

Produktionsnachtrag vom 29. September, 12:39 UTC: Beide Migrationen sind unter
den vorgesehenen Versionsnummern `20260929104600` und `20260929104628` atomar
angewendet; die History enthält 46 statt 44 Einträge. Alle alten History-Zeilen,
die Inhalte von 15 bestehenden Tabellen/Ansichten, Nutzerverknüpfungen und
bisherige Frischeentscheidungen blieben unverändert. Zeitpläne und wartende
Quellenaufträge wurden unverändert wiederhergestellt beziehungsweise erhalten.
Anonyme und Nicht-Admin-Aufrufe wurden in der echten Datenbank abgewiesen.
Beide neuen RPCs lieferten auch über HTTP ohne Sitzung 401 / 42501; die
bestehenden anonymen Live- und Freshness-Audits bestanden erneut.

Die nachfolgende Oberfläche **v91** ist unter
`https://01a6b663.sporteventmap.pages.dev` und der Produktionsdomain anhand der
Dateihashes geprüft. Neue Asset-Kennungen beheben den nachgewiesenen Browsercache-
Fehler; bestehende Adminsitzungen laden nach einem Neuladen den aktuellen Code.
Die echte angemeldete Oberfläche wurde danach erfolgreich für die beiden
Bestandsreviews und den Allgäu-Entwurf genutzt. Datenbankstand und öffentliche
Live-Ansichten der beiden Bestandsfälle wurden unabhängig nachgeprüft.
Statische Eventseiten und Ausfalldaten bleiben aus dem eingefrorenen bisherigen
Datenpaket; v91 stellt dafür keine neue Datenfreigabe dar.

Der anschließende Konflikt-Hotfix besteht 66 lokale SQL-Prüfungen und eine echte
HTTP-Regressionsprüfung mit PostgREST 14.14. Seine produktive Anwendung mit
PostgREST 14.5 ist unabhängig um 13:20:21 UTC bestätigt: Migration
`20260929130903`, History 47, ausschließlich der vorgesehene SQLSTATE geändert.
Rechte, alte History und Inhalts-Hashes von 15 bestehenden Tabellen/Ansichten
blieben unverändert. Der zuvor hängende echte UI-Auftrag meldet sofort den
verständlichen Versionskonflikt; Neuladen erhielt die vier bearbeiteten Werte,
erneute Übersicht und Speichern waren erfolgreich. Zusätzlich bestehen 13
Unit-Tests und zwei gezielte Browser-Konfliktfälle: Der deutsche HTTP-409-Fehler
erzeugt genau einen Speicheraufruf; Eingaben bleiben erhalten und können nach
Neuladen und erneuter Prüfung gespeichert werden. Das produktive Allgäu-Problem
enthielt einen echten Source-Monitor-Schreibvorgang, keine verlorenen
Formulareingaben. Seine fachliche Datumssperre bleibt vom Timeout-Hotfix getrennt.

Private Nachweise liegen unter `exports/p0-rollout-20260929`,
`exports/ui-release-20260929-v91`, `exports/p0-manual-pilot-20260929` und
`exports/p0-manual-http-20260929`. Den aktuellen Stand und die nächste kleine
Ergänzung zur ausdrücklichen Konfliktauflösung führt der
[P0-Abschlussplan](P0_FINISH_PLAN_20260929.md). Die Entwicklungsprüfungen erzeugen
keine produktiven Testeinträge.
