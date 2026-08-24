# Production Recovery Runbook

Stand: 24. August 2026

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
vorhandene Supabase-CLI-Anmeldung und der korrekte Link auf das oben genannte
Production-Projekt. `StartWhenAvailable` holt einen verpassten Lauf nach. Ein
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

Docker Desktop muss laufen. Der Befehl wählt den neuesten Dump, entschlüsselt
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
| Automatischer Dump | `sporteventmap-production-20260824T124437147Z.sembackup` |
| Backup-Zeitfenster (UTC) | 2026-08-24 12:44:37 bis 12:46:02 |
| Lokaler Restore abgeschlossen (UTC) | 2026-08-24 12:47:28 |
| Restore-Dauer | 35,453 Sekunden |
| Kern-Counts | 999 Events; 1.013 Editionen; 1.003 Sources |
| Nutzerstrukturen | 5 Auth-Nutzer; 5 Profile; 36 Favoriten; 46 Planner-Einträge |
| Schema/Datenintegrität | bestanden |
| RLS/Nutzerisolation | bestanden |
| `run_event_validation(...)` für normalen Nutzer | verweigert |
| Production während des Drills verändert | nein |

Damit ist die Wiederherstellung eines aktuellen Production-Dumps praktisch
belegt. Nicht abgedeckt sind PITR zwischen zwei Dumps, ein gleichzeitiger Verlust
des Windows-Profils samt DPAPI-Schlüssel sowie künftige Storage-Dateien.
