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
| Verifizierter Dump | `sporteventmap-production-20260907T223002394Z.sembackup` |
| Backup-Zeitfenster (UTC) | 2026-09-07 22:30:02 bis 22:31:31 |
| Lokaler Restore abgeschlossen (UTC) | 2026-09-07 22:38:53 |
| Restore-Dauer | 37,726 Sekunden |
| Verschlüsselte Dateigröße | 8.707.121 Bytes |
| SHA-256 der verschlüsselten Datei | `cf3b71577278e0d944502cc3b2abf8a18622bb3390e3fff2f6e3273ff4cec0e8` |
| Kern-Counts | 999 Events; 1.022 Editionen; 1.016 Sources; 40 Migrationen |
| Nutzerstrukturen | 5 Auth-Nutzer; 5 Profile; 36 Favoriten; 48 Planner-Einträge |
| Schema/Datenintegrität | bestanden |
| RLS/Nutzerisolation | bestanden |
| `run_event_validation(...)` für normalen Nutzer | verweigert |
| Vollständiger Faktenreview vom 7. September | Beide Faktenbatches sowie die drei anschließend über echte Admin-Sitzung erteilten Frischenachweise enthalten |
| Schemaabgleich im aktuellen Dump | Migrationen `20260907205727` und `20260907205741` enthalten |
| Vollständiger lokaler Neuaufbau | 50 Migrationen, SQL-Lint, 22/22 RLS, 61 SQL- und vier REST-Prüfungen bestanden; Staging bereinigt |
| Braunenberg-Konfiguration und Wiederholung | Apply, Verify, Wiederholungssperren, Rollback-Driftsperre und vollständige Rücknahme bestanden; übrige Policies/Fakten/Nutzerdaten unverändert |
| Restoreumgebung nach Probe | Exaktes Projekt `sport-event-map-recovery-drill-b8dbc423`, beide Volumes und Klartextverzeichnis am 7. September um 22:46:17 UTC entfernt; Backup erhalten |
| Production während des Drills verändert | nein |

Der Nachweis liegt unter
`backups/production/restore-reports/sporteventmap-production-20260907T223002394Z-restore-report.json`.
Der ergänzende Konfigurationsnachweis liegt unter
`exports/p0-review-20260908/braunenberg-timeout-rehearsal.json`.
Der Dump dokumentiert den Stand nach Schemaabgleich, Faktenbatch 02 und den
drei Frischeattestierungen, vor der Braunenberg-Quellenreparatur. Die lokale
Probe verändert den gesicherten Produktionsstand nicht. Die historischen
Restore-/Faktenberichte des vorherigen Dumps `20260907T212209412Z` bleiben erhalten.

Damit ist die Wiederherstellung eines aktuellen Production-Dumps praktisch
belegt. Nicht abgedeckt sind PITR zwischen zwei Dumps, ein gleichzeitiger Verlust
des Windows-Profils samt DPAPI-Schlüssel sowie künftige Storage-Dateien.
