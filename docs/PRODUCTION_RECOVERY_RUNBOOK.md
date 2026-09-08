# Production Recovery Runbook

Stand: 8. September 2026

## Schutzstandard

- Supabase-Projekt: `fztupxyxvhvhtihhmtnk` (Free, PostgreSQL 17)
- Managed Backups: nicht verwendet
- PITR: nicht verwendet
- Zusatzkosten: 0 EUR
- Frequenz: täglich 00:30, 06:30, 12:30 und 18:30 Uhr (Europe/Berlin)
- Retention: 7 Tage
- RPO: im Normalbetrieb 6 Stunden, operativ höchstens 24 Stunden bei
  ausgeschaltetem oder offline befindlichem Rechner
- Ziel-RTO: höchstens 4 Stunden

Die logischen Dumps enthalten Rollen, Schema, Tabellen- und Auth-Daten, Views,
Funktionen/RPCs, RLS, Policies, Constraints, Fremdschlüssel,
Migration-Historie sowie Storage-Metadaten. Die eigentlichen Storage-Dateien
werden von `pg_dump` nicht gesichert. Aktuell existieren in Production keine
Storage-Buckets oder -Objekte. Sobald sich das ändert, ist ein separater
Storage-Datei-Export Pflicht.

## Backup-Betrieb

Manueller Ein-Befehl-Lauf:

```powershell
npm run backup:production
```

Der Windows-Task `SportEventMap Production Backup` verwendet denselben Prozess.
Installation oder Aktualisierung:

```powershell
npm run backup:schedule
```

Voraussetzungen sind ein angemeldeter Windows-Benutzer, Internetzugang, die
vorhandene Supabase-CLI-Anmeldung, eine laufende Docker-kompatible Container-
Laufzeit und der korrekte Link auf das oben genannte Production-Projekt.
`StartWhenAvailable` holt einen verpassten Lauf nach. Ein
ausgeschalteter Rechner kann dennoch das RPO verschlechtern; das Task-Ergebnis
und `backups/production/logs/production-backup.log` täglich kontrollieren.

Die Backups liegen unter `backups/production/` im OneDrive-synchronisierten
Projektpfad und sind durch `.gitignore` vollständig vom Repository getrennt.
Jedes `.sembackup` ist AES-256-GCM-verschlüsselt. Der Schlüssel liegt
DPAPI-geschützt nur unter:

`%LOCALAPPDATA%\SportEventMap\BackupKeys\production-backup-key.dpapi`

Die Manifestdatei enthält keine Credentials. Sie enthält Hashes, Größe,
Dump-Zeitfenster und Counts. Der Prozess prüft Dump-Marker, COPY-Counts,
Archivinhalt, SHA-256 sowie eine echte Entschlüsselungsprobe. Erst danach wird
das Backup atomar veröffentlicht und die 7-Tage-Rotation ausgeführt. Ein
fehlgeschlagener Lauf löscht niemals ein zuvor erfolgreiches Backup.

Wichtig: Die DPAPI-Schlüsseldatei ist ein Single-Device-Risiko. Sie muss mit der
Windows-Profil-/Gerätesicherung geschützt werden. Nach einem Windows-Neuaufbau
ist sofort ein neuer Backup- und Restore-Drill erforderlich.

## Regelmäßiger Restore-Drill

Auf dem aktuellen Rechner ist Podman 5.8.3 unter
`C:\Program Files\RedHat\Podman\podman.exe` mit der bestehenden WSL2-Maschine
`sporteventmap` installiert. Die Maschine bei Bedarf starten:

```powershell
podman machine list
podman machine start sporteventmap
```

Der Start stellt die Docker-kompatible API unter
`npipe:////./pipe/docker_engine` bereit; `DOCKER_HOST` muss für die vorhandenen
Skripte nicht gesetzt werden. Ein fehlendes `docker` im `PATH` bedeutet daher
nicht, dass die lokale Laufzeit neu installiert werden muss. Es ist kein
Maschinen-Reset und keine Neuinstallation erforderlich. Bestehende Container
und das Volume `supabase_db_sport-event-map` nicht löschen oder zurücksetzen.

Der Restore-Befehl wählt den neuesten Dump, entschlüsselt
ihn nur in `%LOCALAPPDATA%\SportEventMap\RestoreDrill`, startet eine zufällig
benannte lokale PostgreSQL-17/Supabase-Umgebung ausschließlich auf Loopback,
restauriert und prüft sie und entfernt danach Container, Volumes und Klartext:

```powershell
npm run backup:restore-drill
```

Berichte liegen unter `backups/production/restore-reports/` und werden nicht
committed. Den Drill mindestens monatlich und nach relevanten Schemaänderungen
ausführen.

Der Drill schlägt fehl, wenn zentrale Tabellen, Views, Funktionen, RLS,
Policies, Constraints oder Fremdschlüssel fehlen, Counts abweichen, Editionen
verwaist sind, Auto-Publish aktiv ist oder Security-Grenzen regressieren. Ein
normaler authentifizierter Benutzer wird transaktional getestet: keine fremden
Favoriten-, Planner- oder Profildaten, keine Admin-Selbsterhöhung und kein
Aufruf von `run_event_validation(bigint, uuid)`.

## Isolierter Migrations- und RLS-Test

Nach dem Start der Container-Laufzeit prüft dieser Befehl den gesamten lokalen
Repository-Stand mit synthetischen Testdaten:

```powershell
npm run staging:edition:local
```

Der Runner verwendet ausschließlich `.tmp-supabase-edition-staging` und das
Projekt `sport-event-map-edition-staging` auf den Loopback-Ports 55321/55322.
Vor dem Start entfernt er nur Volumes mit genau diesem Projektlabel und prüft,
dass keines übrig ist. Der anschließende Start spielt alle Migrationen in eine
leere Datenbank ein; ein zweiter `db reset` ist nicht erforderlich. Dieser hing
am 7. September mit der installierten CLI unter Podman trotz erfolgreich
beendeter Auth-Migration. Migration-History, SQL-Lint, Edition-Prüfungen und
die vollständige Auth-/RLS-Suite werden anschließend ausgeführt. Der Runner
prüft außerdem die Source-Monitor-Schemaausrichtung mit synthetischen,
zurückgerollten SQL-Fixtures und tatsächlichen lokalen REST-Aufrufen. Er
erwartet den vollständigen lokalen Fähigkeitenvertrag; die vorhandenen
Stage-Four-Einstellungen dürfen dadurch nicht verändert werden. Der Runner
entfernt seine Testcontainer, Volumes und das temporäre Verzeichnis danach.

Nachweis vom 7. September 2026: 48 Migrationen exakt angewandt; SQL-Lint ohne
Fehler; Loopback, Edition- und Candidate-Workflow bestanden; **22/22 RLS-Tests
bestanden**. Der Test prüft insbesondere, dass die Prüfung geänderter Inhalte
keinen vollständigen Frischenachweis ersetzt und dass die Frischeverifikation
bei neuen Datenkonflikten oder moderierten Fehlermeldungen ungültig wird.
Die historische Production-Kopie für die folgende Schema-Reparaturprobe
enthielt 38 Migrationen, vor dem anschließenden Schemaabgleich. Der aktuelle
Restore unter „Letzter Nachweis“ enthält dagegen 40 Migrationen.

Der anschließende vollständige P0-Neuaufbau mit zwei neuen Migrationen bestand:
**50 Migrationen**, SQL-Lint ohne Fehler, **22/22 RLS-/Auth-Tests**, **61 SQL- und
vier echte REST-Prüfungen**. Sämtliche synthetischen Fixtures sowie die
temporären Staging-Container, Volumes und das Arbeitsverzeichnis wurden
entfernt. Die REST-Prüfungen bestätigten insbesondere den ausführbaren
Service-Fähigkeitenvertrag ohne zusätzliche Rechte auf das private Schema.

### Begrenzte Regression auf einer Production-Kopie

Für eine unmittelbar folgende lokale Reparaturprobe kann der Restore einmalig
mit `-KeepLocalEnvironment` behalten werden. Danach nur das vom Report benannte
isolierte Projekt verwenden; keine bestehende Datenbank zurücksetzen.

Die am 7. September vorübergehend behaltene Umgebung hieß
`sport-event-map-recovery-drill-0e154138`. Ihr damaliger Workdir lag unter
`%LOCALAPPDATA%\SportEventMap\RestoreDrill\sport-event-map-recovery-drill-0e154138-157dedf734e24804b96cba6d43d68c4c`.
Sie enthielt private Produktionsdaten und wurde ausschließlich zur lokalen
Abnahme verwendet. Die Abschlussbereinigung ist erledigt: exakt dieses
Testprojekt, seine Datenbank-/Storage-Volumes und die entschlüsselte Kopie
wurden entfernt; die verschlüsselten Sicherungen blieben erhalten. Die separate
Umgebung des vollständigen Staging-Neuaufbaus ist ebenfalls bereinigt.

Nach lokaler Anwendung der zwei begrenzten Schemaabgleich-Migrationen bestand
vor der Bereinigung folgender Lauf; das damalige Verzeichnis existiert nicht mehr:

```powershell
$restoreWorkdir = Join-Path $env:LOCALAPPDATA 'SportEventMap\RestoreDrill\sport-event-map-recovery-drill-0e154138-157dedf734e24804b96cba6d43d68c4c'
node tools/run-source-monitor-schema-alignment.mjs $restoreWorkdir absent --sql-only
```

Ergebnis: **60 SQL-Prüfungen bestanden**, anschließender Nachweis des kompletten
Fixture-Rollbacks erfolgreich. Der Test legt ausschließlich eigene synthetische
Nutzer und Profile an. Er prüft reale Service-/Admin-/Nutzer-/Anon-Rollen,
Quellenbelege, Baselinekonflikte, Reviewgrenzen und den Erhalt von Editionsfakten,
Referenzschlüsseln sowie alten Verifikationswerten. `extraction_review=true`,
alle drei Stage-Four-Fähigkeiten `false`; kein Freshness-Bypass aktiv.

Dieser Restore betreibt nur die Datenbank; **REST-Prüfungen wurden dort nicht
ausgeführt**. Der explizite Modus `--sql-only` weist daher null REST-Prüfungen
aus. Die vier tatsächlichen REST-Prüfungen bestanden im vollständigen lokalen
Staging-Lauf. Anschließend wurden die beiden begrenzten Migrationen
`20260907205727` und `20260907205741` produktiv angewendet und Worker v21
veröffentlicht. Der produktive Postflight bestätigte unveränderte Fakten,
elf geschützte Funktionen, zehn Trigger und 507 historische Vorschläge.
Production enthält jetzt 40 Migration-History-Einträge; die zehn älteren
lokalen Abweichungen wurden nicht pauschal nachgezogen. Details stehen im
[Schemaabgleich-Protokoll](P0_SOURCE_SCHEMA_ALIGNMENT_20260907.md).

## Incident: Production ist beschädigt

1. **Schaden bestätigen und Zeitgrenze notieren.** Import-/Workflow-Logs,
   Migrationen und Counts nur lesend prüfen. Beginn und letzte sicher gute
   Transaktion in UTC festhalten.
2. **Weitere Writes stoppen.** Deployment in Maintenance-Modus setzen,
   Importer/Worker anhalten und alle aktiven Cron-Jobs samt Definitionen
   dokumentieren, dann mit `cron.alter_job(jobid, active := false)` deaktivieren.
   Keine Migration und keinen Restore starten, solange Writer aktiv sind.
3. **Beweise erhalten.** Vor jeder Reparatur einen neuen Quarantäne-Dump der
   beschädigten Production-Datenbank erstellen. Bestehende gute Dumps nicht
   verändern.
4. **Letzten guten Dump wählen.** Manifest-Zeitfenster, Hash und Counts prüfen.
   Den letzten Stand vor dem Incident verwenden; bei Unsicherheit den früheren
   Stand wählen.
5. **Lokal restaurieren.** `npm run backup:restore-drill` gegen den gewählten
   Dump ausführen. Für einen älteren Dump:

   ```powershell
   pwsh -NoProfile -File tools/restore-production-backup-drill.ps1 `
     -BackupFile "C:\voller\Pfad\zum\backup.sembackup"
   ```

6. **Ursache beheben.** Nur in der isolierten Umgebung analysieren. Bei einem
   begrenzten Datenfehler eine minimal gezielte, reviewte Reparatur erzeugen.
   Bei Schema-/Massenschaden einen kontrollierten Ersatz der Datenbank planen.
7. **Production-Recovery manuell freigeben.** Niemals `restore.sql` blind in die
   laufende Production-Datenbank importieren: der vollständige Dump enthält
   auch Supabase-eigene Rollen und Schemas. Vorher Zielprojekt/-datenbank,
   Restore-Reihenfolge, Auth-/Secrets-Neukonfiguration, Storage-Status,
   Wartungsfenster und Rollback durch eine zweite Person prüfen. Bevorzugt in
   ein frisches, leeres Supabase-Ziel mit kompatibler PostgreSQL-Version
   restaurieren; nur bei belegter Teilreparatur direkt in Production schreiben.
8. **Recovery verifizieren.** Die gleichen SQL-Gates wie im lokalen Drill sowie
   `npm run check`, die RLS-/Security-Tests und read-only Discovery-/Edition-
   Queries gegen das Recovery-Ziel ausführen. Counts mit dem Dump-Manifest
   vergleichen. Keine unerklärliche Abnahme bei Events, Editionen oder Sources
   akzeptieren.
9. **App kontrolliert umschalten.** Erst nach grünen Daten-, Schema-, Security-
   und Anwendungsgates URL/Keys im Deployment ändern. Smoke-Test durchführen,
   danach Cron/Importer einzeln reaktivieren.
10. **Freigeben und beobachten.** Production erst freigeben, wenn Ursache,
    Restore-Punkt, RPO/RTO, Tests und Rollback dokumentiert sind. Das beschädigte
    System bis zur Beweissicherung unangetastet halten.

## Letzter Nachweis

| Feld | Wert |
| --- | --- |
| Verifizierter Dump | `sporteventmap-production-20260907T230817138Z.sembackup` |
| Backup-Zeitfenster laut Manifest (UTC) | 2026-09-07 23:09:31 bis 23:10:55 |
| Verschlüsseltes Backup veröffentlicht (UTC) | 2026-09-07 23:11:04 |
| Lokaler Restore (UTC) | 2026-09-07 23:12:21 bis 23:13:42 |
| Restore-Dauer | 80,685 Sekunden |
| Verschlüsselte Dateigröße | 8.711.859 Bytes |
| SHA-256 der verschlüsselten Datei | `b3e850601b6669ae4b1092337bdd9a8a013f03f93dc0d3ef32482b9511f4be41` |
| Kern-Counts | 999 Events; 1.022 Editionen; 1.016 Sources; 40 Migrationen |
| Nutzerstrukturen | 5 Auth-Nutzer; 5 Profile; 36 Favoriten; 48 Planner-Einträge |
| Schema/Datenintegrität | bestanden |
| RLS/Nutzerisolation | bestanden |
| `run_event_validation(...)` für normalen Nutzer | verweigert |
| Vorherige Faktenreviews vom 7. September | Faktenbatches 01/02 sowie die drei anschließend über echte Admin-Sitzung erteilten Frischenachweise enthalten |
| Schemaabgleich im aktuellen Dump | Migrationen `20260907205727` und `20260907205741` enthalten |
| Vollständiger lokaler Neuaufbau | 50 Migrationen, SQL-Lint, 22/22 RLS, 61 SQL- und vier REST-Prüfungen bestanden; Staging bereinigt |
| Faktenbatch 03 lokal geprobt (UTC) | 2026-09-07 23:19:52 bis 23:20:07; Apply, Read-only-Verify, Vorzustandsdrift, Wiederholungssperre, Rollback-Driftsperre, vollständige Rücknahme und erneute Rollbacksperre bestanden |
| Umfang der lokalen Faktenprobe | 7 Events, 7 bestehende Editionen, 19 Formatobjekte und 29 Apply-Snapshots; Quellen, Nutzerreferenzen und übrige Datensätze unverändert |
| Restoreumgebung nach Probe | Exaktes Projekt `sport-event-map-recovery-drill-e9b2a440`, 3 Container, 2 Volumes und Klartextverzeichnis am 7. September um 23:26:06 UTC entfernt |
| Negative Abschlussinventur | Keine Clone-Container, Clone-Volumes oder passenden Klartextverzeichnisse; die vier vorhandenen Entwicklungscontainer und ihr DB-Volume in identischem Zustand erhalten |
| Backup nach Bereinigung | SHA-256 vor/nachher identisch; verschlüsselte Sicherung und Berichte erhalten |
| Production während des Drills verändert | nein |

Der Nachweis liegt unter
`backups/production/restore-reports/sporteventmap-production-20260907T230817138Z-restore-report.json`.
Manifest und verschlüsselter Dump liegen unter `backups/production/`.
Die angegebenen Backup-Zeiten stammen aus den beiden Manifest-Snapshots;
die Uhrzeit im Dateinamen ist der frühere Start des Backup-Auftrags.

Der ergänzende Faktennachweis liegt unter
`exports/p0-batch-20260908/rehearsal-report.json`. Er enthält die SHA-256-Werte
der tatsächlich geprobten Apply-, Verify- und Rollback-Dateien. Die private
Backuptabelle enthält pro Apply sieben Event- und sieben Editionszeilen vor
der Änderung, dieselben 14 Zeilen danach und einen Batch-Manifestdatensatz.
Eine erneute Anwendung und eine Rücknahme nach einem zwischenzeitlichen
Fakten- oder Frischeverifikations-Edit werden abgewiesen. Der Rollback stellt
nur die berührten Fakten wieder her und belässt den Reviewbedarf.

Die Abschlussinventur ist unter
`exports/p0-batch-20260908/cleanup-report.json` gespeichert; das verwendete
Skript liegt unter `exports/p0-batch-20260908/cleanup-clone.ps1`. Vor dem Stop
wurden der Projektbezeichner in `supabase/config.toml`, die exakten
Container-/Volume-Labels, der absolute Pfad und das Fehlen von Reparse-Points
geprüft. Das ausschließlich hierfür verwendete Verzeichnis
`%LOCALAPPDATA%\SportEventMap\RestoreDrill\sport-event-map-recovery-drill-e9b2a440-e269f46d0d8741fd974fdcdb18266491`
existiert nicht mehr. IDs, Startzeiten und Zustand der übrigen Container sowie
der Erstellungszeitpunkt ihres Datenbank-Volumes blieben unverändert.

Der Dump dokumentiert den Stand nach Schemaabgleich, Faktenbatch 02, den
drei damaligen Frischeattestierungen und der Braunenberg-Timeoutkorrektur,
**vor Faktenbatch 03**. Nach erfolgreichem lokalem Rehearsal wurden die sieben
begrenzten Faktenpatches produktiv angewendet und separat lesend verifiziert.
Diese Anwendung erteilt keine Frischeattestierung; Braunenbergs ungeklärte
vollständige Distanzstruktur bleibt ausdrücklich offen. Details zur fachlichen
Abnahme stehen im [Protokoll zu Faktenbatch 03](P0_BATCH_03_20260908.md).
Der lokale Drill selbst hat Production nicht verändert. Die historischen
Berichte der Dumps `20260907T212209412Z` und `20260907T223002394Z` einschließlich
`exports/p0-review-20260908/braunenberg-timeout-rehearsal.json` bleiben erhalten.

Damit ist die Wiederherstellung eines aktuellen Production-Dumps praktisch
belegt. Nicht abgedeckt sind PITR zwischen zwei Dumps, ein gleichzeitiger Verlust
des Windows-Profils samt DPAPI-Schlüssel sowie künftige Storage-Dateien.

## Wiederherstellung und Rücknahme für Faktenbatch 04 am 8. September 2026

Vor dem [neun Events umfassenden Faktenbatch 04](P0_BATCH_04_20260908.md)
wurde die neue verschlüsselte Sicherung
`backups/production/p0-batch04/sporteventmap-production-20260908T055450921Z.sembackup`
erstellt. Sie enthält den Produktionsstand vor Batch 04 einschließlich der
neun bisherigen Frischenachweise. Der Backupzeitraum reicht von
05:54:50 bis 05:56:21 UTC. Storage ist weiterhin leer; der DB-Snapshot wurde
mit dem regulären Backupskript und `-DumpSnapshotOnly` erstellt.

Die isolierte Wiederherstellung in `sport-event-map-recovery-drill-ba04f2d5`
dauerte 39,648 Sekunden. Schema, 40 Migrationen, RLS, Nutzerisolation,
öffentliche Views und vollständige Bestandsintegrität bestanden. Enthalten:
999 Events, 1022 Editionen, 1016 Quellen, 36 Favoriten, 48 Saisonplaneinträge
und fünf Nutzerprofile. Der Wiederherstellungslauf veränderte Production nicht.

Die nachfolgende lokale Wartungsprobe um 06:13:37–06:13:50 UTC bestätigte
Anwendung, separate Nachprüfung, tatsächliche Rücknahme, wiederholte
Anwendungs-/Rücknahmeabwehr sowie die Ablehnung abweichender Vor-/Nachzustände.
Alle Quellen, Favoriten, Saisonpläne, Profile und Nutzer blieben unverändert.
Das Paket erzeugt 37 private Snapshots: neun Events und neun Editionen jeweils
vorher/nachher sowie ein Manifest. Eine Rücknahme nach späteren Adminprüfungen
wird durch den vollständigen Nachzustandsvergleich abgewiesen.

Um 06:17:29 UTC waren ausschließlich die drei Kloncontainer, zwei Klonvolumes
und das geprüfte Klartextverzeichnis entfernt. Andere lokale Container und
Volumes blieben unverändert. Der SHA-256 der verschlüsselten Sicherung ist
vor und nach der Bereinigung identisch:
`3addaaf903d259b71f4cab0c5afa1514a57b2fb6a91eaf1aaff6547c471b9072`.

Nachweise: Restore-Bericht unter `backups/production/p0-batch04/restore-reports/`,
`rehearsal-report.json` und `cleanup-report.json` unter
`exports/p0-batch04-20260908/`. Diese privaten Artefakte bleiben außerhalb von
Git und der Website. Die anschließende produktive Faktenanwendung und die
vier echten Admin-Frischeprüfungen sind im Batchprotokoll dokumentiert.
