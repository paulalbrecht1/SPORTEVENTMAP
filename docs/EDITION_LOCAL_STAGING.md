# Kostenfreies lokales Editions-Staging

Stand: 17. August 2026

## Entscheidung

Supabase-Preview-Branches erzeugen Compute-Kosten und sind im Free-Tarif nicht
enthalten. Der Editions-Rollout wird deshalb vorerst in einem vollständig lokalen,
wegwerfbaren Supabase-Staging geprüft. Die aktive Hauptdatenbank wird dabei weder
verbunden noch verändert.

## Ausführung

```powershell
npm run staging:edition:local
```

Der Runner:

1. erstellt `.tmp-supabase-edition-staging` ausschließlich innerhalb des Repositories;
2. kopiert nur `supabase/config.toml` und die versionierten Migrationen;
3. verwendet `sport-event-map-edition-staging` sowie die getrennten Ports
   `55320` bis `55329`;
4. prüft direkt nach dem Start die tatsächlichen Windows-Listener für API und
   Postgres; jede Bindung außerhalb von `127.0.0.1` oder `::1` bricht den Lauf ab;
5. entfernt Cloud-URL, Project-Ref, Access-Token, Datenbankpasswort und Server-Keys
   aus der Prozessumgebung;
6. akzeptiert nur lokale Supabase-Kommandos (`start`, `stop`, `db reset`,
   `db query`, `db lint`) und verlangt bei jedem Datenbankkommando `--local`;
7. führt Reset, exakten Migrationsabgleich, Schema-Lint, Editions-Postflight sowie
   ein begrenztes Auth-Readiness-Gate, Candidate-E2E- und RLS-Tests aus;
8. löscht abschließend ausschließlich das Volume mit der exakten Staging-Projekt-
   kennzeichnung und das zuvor geprüfte temporäre Verzeichnis.

Der Postflight behält unabhängig vom Testergebnis folgende Sperren bei:

- `deployment_authorized=false`
- `backfill_authorized=false`
- `target_confirmation_required=true`

## Verifizierter Lauf

Der vollständige Lauf wurde am 17. August 2026 mit der im Projekt fest
gepinnten Supabase CLI `2.109.1` erfolgreich ausgeführt:

- API und Postgres waren auf Windows ausschließlich an Loopback gebunden;
- alle 46 versionierten Migrationen stimmten exakt mit der lokalen
  Migrationshistorie überein;
- `db lint` meldete für `public` und `private` keine Fehler;
- `foundation_gates_pass=true` und
  `ready_for_manual_candidate_smoke=true`;
- Candidate-First-, Lifecycle-, Auth- und RLS-Integrationstests bestanden mit
  21 von 21 Rollen-/API-Prüfungen;
- Auto-Publication, Deployment und Backfill blieben gesperrt;
- Container, das exakt gelabelte Datenbank-Volume und das temporäre Workdir
  wurden nach dem Test entfernt.

## Sicherheitsgrenze

Das lokale Staging enthält keine produktiven Datensätze und ist kein Ersatz für
einen späteren kontrollierten Produktiv-Rollout. Ein produktiver Backfill, eine
Cloud-Migration oder automatische Veröffentlichung benötigt weiterhin eine
gesonderte Freigabe.
