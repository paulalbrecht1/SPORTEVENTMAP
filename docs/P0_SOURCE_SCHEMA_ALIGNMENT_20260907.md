# P0: Source-Monitor-Schemaabgleich, 7. September 2026

## Auftrag und Ausgangslage

Der Nutzer hat nach dem [Faktenbatch](P0_EVENT_FACTS_BATCH_20260907.md) den
nächsten P0-Schritt beauftragt. Ausgangspunkt ist GitHub `main` auf `e110cae`.
Vor dem Abgleich hatte die Production-Datenbank 38 Migrationen und der lokale
Stand 48. Worker v20 erwartete teilweise Objekte, die in Production fehlten.

**Status:** Lokal vollständig abgenommen und produktiv ausgerollt. Beide
Migrationen, Worker v21 und die begrenzten Live-Prüfungen sind erfolgreich.
Der zusätzliche Mülheim-Nachlauf und die Bereinigung des behaltenen
Restore-Clones sind ebenfalls abgeschlossen. Offen ist der abschließende
GitHub-Abgleich. Der Website-Release bleibt wegen der Kataloggates gesperrt.

Der lesende Ausgangsabgleich bestätigte fehlende Extraktionsspalten in
`event_change_proposals`, die fehlende Tabelle `event_field_controls` und die
fehlende RPC `record_extraction_proposals`. Die 507 damals bestehenden Proposals
sind `superseded`; ihre historische Evidenz blieb beim Abgleich erhalten.

Zusätzlich fehlt das gesamte spätere Stage-Four-Subsystem. Seine Simulation,
technische Automation und Shadow-Beobachtung sind daher nicht verfügbar.
Die bestehenden Editions-/Ergebnis-Autopublishflags bleiben ausgeschaltet.

## Abgegrenzte Korrektur

Die neue Extraktionsmigration stellt die notwendigen Spalten, Indizes,
Feldkontrollen und RPCs mit expliziten Rechten und RLS bereit. Neue Vorschläge
sind ausschließlich Reviewdaten. Sie dürfen weder Events veröffentlichen noch
einen Frischenachweis erzeugen.

Das Paket besteht aus zwei neuen, begrenzten Migrationen:

- [`20260907205727_source_monitor_extraction_schema_alignment.sql`](../supabase/migrations/20260907205727_source_monitor_extraction_schema_alignment.sql):
  Extraktionsschema, Feldkontrollen und transaktionaler Faktenreview.
- [`20260907205741_source_monitor_runtime_capabilities.sql`](../supabase/migrations/20260907205741_source_monitor_runtime_capabilities.sql):
  lesender Service-Vertrag über Tabellen, Spalten, Ausführungsrechte und die
  notwendigen Abhängigkeiten optionaler Stage-Four-Funktionen.

Der Abgleich ersetzt kein pauschales `db push` und löst die ältere Abweichung
der gesamten Migration-Historie nicht automatisch auf. Genau die beiden neuen
Versionen wurden angewendet und als ausgeführt erfasst. Production enthält
damit 40 History-Einträge; zehn ältere lokale Migrationen wurden bewusst weder
nachgezogen noch lediglich als ausgeführt markiert.

Die historische Migration vom 15. August wird nicht unverändert nachgezogen:
Ihre Reviewfunktion erlaubt unter anderem direkte neue Editionen und erneuert
bei Feldannahmen Verifikationsmetadaten. Auch der spätere Wrapper behebt diese
Semantik nicht vollständig. Eine neue, begrenzte Reviewfunktion erlaubt nur
Faktenkorrekturen durch einen Admin. Metadaten der Verifikation und Publikation
sowie neue Editionen bleiben ausgeschlossen. Eltern werden vor Proposals
gesperrt; die Identität wird nach dem Sperren erneut geprüft. Der Legacy-Sync
darf die vorhandene Editionsstruktur nicht verändern.

Ein gesonderter lesender Service-RPC meldet die tatsächlich installierten
Worker-Fähigkeiten. Fehlende Pflicht-Extraktion stoppt den Worker vor einem
Quellenlauf. Nicht installierte Stage-Four-Funktionen werden ausdrücklich mit
`schema_capability_unavailable` ausgewiesen. Netzwerk-, Rechte- oder RPC-Fehler
werden nicht als harmlose Abwesenheit behandelt. Ein positiver Präsenzcheck ist
keine Freigabe von Automation oder Veröffentlichung.

Die Stage-Four-Migrationen bleiben separat: Sie würden zahlreiche zusätzliche
Tabellen, Pilotkonfigurationen und noch ungeprüfte Erfolgswege installieren.
Beispielsweise schreibt die Shadow-Funktion den Auditstatus `recorded`, den
der bisherige Stage-Four-Auditconstraint nicht zulässt. Dieses Subsystem wird
nicht zur Behebung des Basisfehlers pauschal aktiviert.

## Worker und Fehlernachweise

Workerkennung: `source-monitor-4.1.5-phase-a-shadow-rpc-outcomes`.
`event-source-check` wurde als Plattformversion **21** veröffentlicht.
Alle zwölf zurückgelesenen Dateien stimmen bytegleich mit dem geprüften Stand
überein. `verify_jwt=true` bleibt aktiv. Bundle-SHA256:
`985b47bf484187bbd2632c0096a90c5fa8305e1bd2722a1009f7d23c4c040327`.

- Nur `accepted: true` mit einer Ergebnis-ID zählt als akzeptierte
  Ergebnisbeobachtung. Ein idempotenter Upsert kann eine vorhandene Zeile
  aktualisieren; die Kennzahl behauptet keine neu angelegte Zeile.
- PostgREST-Fehler zeigen Code und Nachricht statt `[object Object]`.
  Zusatzobjekte und erkennbare Zugangsdaten werden nicht protokolliert.
- Die Fähigkeiten werden einmal vor dem Lauf geprüft und im Workflow
  protokolliert. Erfolgs- und Fehlerpfad verwenden dieselben Regeln.
- Der dedizierte Smoke behält seine neun bisherigen Prüfungen und verlangt
  zusätzlich einen gültigen Fähigkeitenvertrag sowie verfügbare Extraktion.

## Sicherung und Prüfweg

Das frische verschlüsselte Backup
`sporteventmap-production-20260907T202202971Z.sembackup` enthält die bereits
angewendeten drei Faktenkorrekturen. SHA256:
`ad56c9de09245f41198326308e3c8d8cc96604db1cfce7ec6ca0f9d0bf3c617e`.

Die Wiederherstellung dauerte 38,066 Sekunden und bestätigte Datenintegrität,
RLS und Nutzerisolation: 999 Events, 1.022 Editionen, 1.016 Quellen und
38 Migrationen. Der zusätzliche Nachlauf bestätigte 13 Snapshots des vorherigen
Faktenbatches und dessen drei korrigierte, weiter prüfbedürftige Editionen.

Das Dump-Zeitfenster reicht von **20:22:03 bis 20:23:34 UTC**; der Restore war
am 7. September um **20:24:51 UTC** abgeschlossen. Die Faktenkorrekturen von
20:15:33 UTC sind damit bereits enthalten. Die gesicherte Produktionskopie
enthält die anschließend ausgerollten Schemaänderungen noch nicht.

Private Nachweise im ignorierten Backup-Verzeichnis:

- `backups/production/restore-reports/sporteventmap-production-20260907T202202971Z-restore-report.json`
- `backups/production/restore-reports/sporteventmap-production-20260907T202202971Z-p0-facts-report.json`

Der ergänzende lokale Rolloutnachweis liegt unter
`exports/p0-schema-20260907/rollout-proof.json`. Er enthält Migrationsnamen,
Dateiliste und Hashes, Faktenprüfsummen vor/nach der Anwendung sowie die drei
Quellenlaufantworten und bleibt ebenfalls außerhalb des Repositorys.

Der lokale Clone `sport-event-map-recovery-drill-0e154138` wurde für die
begrenzte Schemaabnahme vorübergehend behalten und anschließend gezielt
entfernt. Datenbank- und Storage-Volumes sowie die entschlüsselte Kopie sind
gelöscht; das verschlüsselte Backup blieb erhalten. Runtime und
Schlüsselhandhabung richten sich nach dem
[Recovery-Runbook](PRODUCTION_RECOVERY_RUNBOOK.md).

Die Migrationen wurden zuerst auf dieser tatsächlichen Produktionskopie
geprüft, einschließlich synthetischer, zurückgerollter Funktions- und
Rechteszenarien. Zusätzlich wurde der vollständige lokale Migrationsstand frisch
aufgebaut und mit der gesamten RLS-Suite geprüft. Der neue lesende
Produktionsaudit bestätigte die anonymen Zugriffssperren für Feldkontrollen,
Proposals und neue RPCs.

### Bereits bestandene lokale Abnahme

Beide Migrationen wurden auf dem Clone angewendet. Der Schutzvergleich
bestätigt elf unveränderte bestehende Funktionen und zehn unveränderte Trigger.
Definitionen werden dabei unter identischem `search_path` verglichen, damit
unterschiedliche Qualifizierung von Objektnamen keine Scheindifferenz erzeugt.

[`tests/source-monitor-schema-alignment.sql`](../tests/source-monitor-schema-alignment.sql)
bestand dort **60 dynamische SQL-Prüfungen**. Alle Nutzer, Profile, Quellen,
Crawls und Events dieses Tests wurden eigens synthetisch angelegt. Die gesamte
Transaktion wurde zurückgerollt; eine neue Verbindung bestätigte anschließend,
dass keine Testnutzer oder Testevents zurückblieben.

| Prüffeld | Ergebnis auf dem Production-Restore |
| --- | --- |
| Service-Extraktion | Vorschlag bleibt `pending`; Fakten und Verifikationswerte unverändert |
| Quellen-/Crawl-Zuordnung | Fremde, fehlende, inaktive und widersprüchliche Quellenbelege sowie HTTP 304 abgewiesen |
| Rollen und Feldkontrollen | Service-RPC tatsächlich ausführbar; normale Nutzer und Anonyme können weder Vorschläge prüfen noch Admin-Kontrollen lesen oder ändern |
| Deduplizierung | Wiederholung erzeugt keinen zweiten Vorschlag; jüngere Ablehnung und angenommener Stand bleiben erhalten |
| Erneute Prüfung nach Ablehnung | Nach 31 Tagen wieder `pending`, mit aktueller Baseline und geleerten alten Reviewmetadaten |
| Baselinekonflikt | Vorschlag wird `superseded`; der neuere Fakt bleibt erhalten |
| Admin-Faktenannahme | Eventfakt und bearbeitete typisierte Editionsgebühr erfolgreich angenommen |
| Editionsschutz | IDs, `edition_slug`, `legacy_event_key`, Jahr, strukturierte `race_formats`, übrige Fakten und alte Verifikationswerte erhalten |
| Verifikation und Publikation | Direkte Metadatenannahme, gemischter Legacy-Patch, neue Edition und jahresübergreifende Datumsänderung abgewiesen; `needs_review` bleibt aktiv |
| Fähigkeiten | `schema_version=1`, `extraction_review=true`, alle drei Stage-Four-Werte `false` |

Der Restore betreibt nur die Datenbank. Die 60 Prüfungen verwenden echte
PostgreSQL-Rollen und RPC-Aufrufe; REST wird dort ausdrücklich nicht als
bestanden gezählt. Der
[lokale Runner](../tools/run-source-monitor-schema-alignment.mjs) akzeptiert nur
isolierte Restore-/Staging-Verzeichnisse, prüft die Loopback-Adressen und das
exakte Datenbank-Containerlabel und protokolliert nur Aggregate.

### Vollständige lokale und produktive Abnahme

- [x] Frischer vollständiger Aufbau mit **50 Migrationen**, SQL-Lint und
  **22/22 RLS-/Auth-Tests** bestanden.
- [x] Auf diesem vollständigen Schema **61 SQL-Prüfungen und vier echte
  REST-Prüfungen** bestanden. Die dort vorhandenen Stage-Four-Fähigkeiten
  verändern keine Automationseinstellungen und erteilen keine automatische
  Publikationsfreigabe.
- [x] Sämtliche synthetischen Fixtures zurückgerollt beziehungsweise entfernt;
  temporäre Staging-Container, Volumes und Arbeitsverzeichnis entfernt.
- [x] Beide begrenzten Migrationen produktiv angewendet und ihre History-Einträge
  nachgeprüft; Worker v21 einschließlich Versions-/Dateiabgleich bestätigt.
- [x] Produktiver Postflight mit unveränderten elf geschützten Funktionen,
  zehn Triggern und den 507 historischen `superseded`-Vorschlägen bestanden.
- [x] Alle **sechs Schema-Zugriffstests**, **sieben allgemeinen anonymen
  Zugriffstests** und **fünf Freshness-Prüfungen** auf Production bestanden.

Die echten REST-Prüfungen fanden zwei Fehler, die vor dem Rollout behoben
wurden: Der Fähigkeitenvertrag löst private Funktionsnamen jetzt über
Katalogmetadaten auf, ohne zusätzliche Rechte auf den privaten Namensraum zu
verlangen. Der historische Neuaufbau benötigte außerdem das explizite
Service-SELECT-Recht für `events`; Production besaß dieses Recht bereits.

Die [Warnung zur authentifiziert ausführbaren `SECURITY DEFINER`-Funktion](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
ist für die Reviewfunktion erwartbar: Sie ist nur
für authentifizierte Aufrufe freigegeben und verlangt zusätzlich die geprüfte
Adminrolle. Normale Nutzer werden dynamisch abgewiesen. Als kleine
Wartungspunkte verbleiben ein
[nicht indizierter Fremdschlüssel](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
`confirmed_by` und vier neue, bislang
[ungenutzte Indizes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
Die Advisor-Hinweise sind keine festgestellten Zugriffs- oder Datenintegritätsfehler.

### Echte Quellenläufe nach dem Rollout

| Quelle | Workflow / Crawl | Ergebnis |
| --- | --- | --- |
| Hermannslauf | 4945 / 2653 | HTTP 200, `first_seen`, fünf neue `pending`-Vorschläge |
| Mainz | 4946 / 2654 | HTTP 200, `first_seen`, zwei neue `pending`-Vorschläge |
| Mülheimer Firmenlauf | 4948 / 2655, Request 6504 | HTTP 200, `unchanged`, null Fehler und keine neuen Vorschläge |

Die Läufe wurden über den bestehenden Scheduler ausgelöst. Hermannslauf und
Mainz meldeten jeweils null Fehler und keinen Extraktionsfehler. Die drei nicht installierten
Stage-Four-Pfade wurden ausdrücklich als nicht verfügbar übersprungen und
führten zu keinem Fehler. Alle sieben neuen Vorschläge sind weiterhin
unangewendet; es gab keine öffentlichen Faktenänderungen.

Der zusätzliche Mülheim-Nachlauf bestätigte den unveränderten Inhalt und null
Extraktionen ohne Fehler. Editions- und Ergebniszähler blieben null; technische
Automation und Shadow wurden ausdrücklich ohne Fehler übersprungen. Die
Produktionsflags `auto_publish_enabled=false` und
`auto_result_publish_enabled=false` wurden nochmals lesend bestätigt.

Die Prüfsummen der Event- und Editionsfakten blieben sowohl vor/nach den
Migrationen als auch nach den Quellenläufen gleich. Der Bestand blieb bei
999 Events, 1.022 Editionen und 1.016 Quellen. Vorhandene Verifikationswerte
und ausgeschaltete Autopublishflags wurden erhalten.

Der dedizierte `action:smoke` wurde mangels separat bereitgestellter
Admin-/Service-Authentifizierung **nicht ausgeführt**. Die erfolgreichen
Schedulerläufe liefern echte Betriebsnachweise, ersetzen aber nicht sämtliche
Einzelprüfungen dieses Smokes. Die Authentifizierung wurde dafür nicht geschwächt.

Die aktuelle [Supabase-Migrationsdokumentation](https://supabase.com/docs/guides/deployment/database-migrations)
und die [Änderung der expliziten API-Grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
wurden berücksichtigt. Bestehende Rechte werden nicht pauschal erweitert.

## Abschluss

Der gezielte Schema- und Worker-Rollout ist **erfolgreich abgeschlossen**.
Die Abschlussnachweise werden jeweils erst nach ihrer Durchführung abgehakt:

- [x] Zusätzlichen Mülheim-Nachlauf, Request 6504, ausgewertet; unverändert,
  keine Fehler oder angewendeten Änderungen.
- [x] Behaltenen Restore-Clone einschließlich exakter Container,
  Datenbank-/Storage-Volumes und entschlüsselter Kopie entfernt; Backup erhalten.
- [ ] Abschließenden Commit und Push auf GitHub bestätigen.

Der erneute reguläre Export bleibt vor dem Schreiben gesperrt: 332 Discovery,
989 Archiv-Editionen, 0 % Frische und 49,40 % Vollständigkeit. Frontend-Artefakte
wurden nicht aktualisiert; es gab keinen neuen Wrangler-Upload. Der
Website-Release bleibt an die unveränderten Kataloggates gebunden.

## Nächster datenorientierter P0

Nach dem technisch abgenommenen Schemafix folgt der im
[Faktenbatch-Protokoll](P0_EVENT_FACTS_BATCH_20260907.md) priorisierte vollständige
Quellen- und Feldreview der nahen deutschen Veranstaltungen. Zuerst Friedberg
und Airport Race gegen aktuelle offizielle Angaben vollständig prüfen; bei
wepLAUF die noch offenen Distanzen und Startkoordinaten anhand eindeutiger
Veranstalterbelege klären. Erst die tatsächliche Prüfung aller 14 zentralen
Werte und die Auflösung sämtlicher Blocker erlauben den vorgesehenen
administrativen Frischenachweis.

Danach folgt die aktualisierte Review-Queue der nahen deutschen Veranstaltungen.
Die Ausgangsdiagnose umfasste sieben Editionen mit harten Quellen-/Workflowblockern
innerhalb der nächsten 30 Tage. Beim Mülheimer Firmenlauf steht nach den
erfolgreichen technischen Nachläufen der vollständige Fachreview an; bei
Braunenberg bleibt die IP-gepinnte Verbindung offen. Die erfolgreiche Extraktion
allein ist keine fachliche Freigabe.

Parallel sind gültige künftige Editionen nach dem bestehenden Candidate-Review
zu ergänzen. Die letzte Diagnose mit 332 Discovery-Editionen und 0 % Frische
liegt unter den unveränderten Grenzen von mindestens 400 und 55 %. Es fehlen
mindestens 68 Nettozugänge; auslaufende Editionen erhöhen den Bedarf. Bei genau
400 sind mindestens 220 echte Frischenachweise erforderlich. Erst danach folgen
frischer Export, gebundene Audits, vollständige Releaseabnahme und Wrangler-Upload.
