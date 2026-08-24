# Edition Lifecycle – Staging Readiness

Stand: 17. August 2026

## Ergebnis

Es existiert aktuell keine Supabase-Development-Branch und kein getrenntes
Staging-Projekt. Das einzige verbundene Projekt ist die aktive Hauptdatenbank.
Deshalb wurde keine Migration ausgerollt und kein schreibender Candidate-Smoke-
Test gegen das verbundene Projekt gestartet.

## Read-only Migrationsvergleich

Die exakte Tabelle `supabase_migrations.schema_migrations` wurde lokal und im
verbundenen Projekt ausschließlich gelesen. Lokal sind nach dem vollständigen
Reset zehn Migrationen vorhanden, die im verbundenen Projekt noch fehlen:

1. `20260814120000_beta_security_definer_hardening`
2. `20260815_source_monitor_extraction_review`
3. `20260816_stage_four_preparation`
4. `20260817_stage_four_monitoring_guards`
5. `20260817124600_edition_candidate_first_lifecycle`
6. `20260818_stage_four_germany_observation`
7. `20260819_stage_four_observation_calibration_guards`
8. `20260820_stage_four_observation_operational_alerts`
9. `20260821_stage_four_observation_lint_fixes`
10. `20260822_stage_four_observation_queue_lint`
11. `20260824_event_detail_verification_foundation`

Der Candidate-First-Rollout darf nicht isoliert aus dieser Reihenfolge
herausgelöst werden: Er benötigt unter anderem `event_field_controls` aus der
Source-Extraction-Migration. Die aktive Hauptdatenbank ist kein Ersatz für ein
Staging-Ziel.

## Ausführbares Postflight-Gate

`tools/edition-staging-postflight.sql` ist ein einzelnes, statisch auf
Read-only-Operationen geprüftes `WITH … SELECT`. Lokal wird es so ausgeführt:

```powershell
npm run audit:edition-staging:local
```

Es prüft nach einem isolierten Staging-Rollout:

- Candidate-Validation-Spalten und Manual-Lock-Infrastruktur;
- abgeleiteten Lifecycle-State und Candidate-First Review-View;
- `ON DELETE RESTRICT` für Season-Planner-Editionen;
- Service-Role-only Detection und Admin-only Approval;
- dass Detection keine Edition materialisiert;
- dass Approval nur validierte, explizit ausgewählte Candidates materialisiert;
- dass `postponed` nicht automatisch abgeschlossen wird;
- die hart deaktivierten Auto-Publish-Flags;
- doppelte Editionen, Legacy-Candidates, versteckte Drafts und offene
  Datumswidersprüche.

Selbst bei vollständig grünen Gates bleiben `deployment_authorized=false`,
`backfill_authorized=false` und `target_confirmation_required=true`.

### Ergebnis im aktiven Projekt

Der unveränderte Postflight wurde am 17. August 2026 um 14:07 UTC read-only im
aktiven Projekt ausgeführt und blockiert erwartungsgemäß:

- `foundation_gates_pass=false` und
  `ready_for_manual_candidate_smoke=false`;
- Candidate-Validation-Spalten, Manual-Lock-Tabelle, Lifecycle-State-View und
  Candidate-First Review-Basis fehlen noch;
- die bestehende Detection kann noch einen Draft materialisieren;
- die bestehende Approval-Funktion erzwingt noch nicht die neuen expliziten
  Candidate-First-Gates;
- `postponed` ist im aktiven Lifecycle noch nicht geschützt;
- der Season-Planner-FK verwendet noch kein `ON DELETE RESTRICT`;
- 16 Candidates sind noch Legacy-unvalidiert, davon bildet eine Event-/Jahr-
  Gruppe einen Datumswiderspruch;
- beide Auto-Publish-Flags sind trotzdem `false` und der Disable-Constraint ist
  vorhanden.

Das korrekte nächste Gate lautet daher
`apply_and_verify_pending_migrations_on_isolated_staging`, nicht Produktion.

## Manueller Candidate-End-to-End-Test

Der lokale RLS-Integrationstest bildet bereits den vollständigen Ablauf mit
echten Datenbankrollen ab:

`completed → watching → detect → validate → candidate → explicit admin approval → edition`

Er beweist zusätzlich:

- vor der Adminfreigabe existiert keine Edition und kein versteckter Draft;
- die neue Edition kopiert keine Distanz-/Race-Format-Fakten des Vorgängers;
- die Source wird editionsgebunden als `pending` neu registriert;
- die historische Vorgängeredition bleibt unverändert;
- normale Nutzer können weder Candidate- noch Operationsdaten lesen oder
  verändern.

Dieser Smoke darf gegen eine entfernte Umgebung erst nach Bestätigung einer
isolierten Staging-ID laufen. Gegen die aktive Hauptdatenbank bleibt er gesperrt.

## Kostenfreier nächster Gate

Eine Supabase-Development-Branch erzeugt Compute-Kosten und wird für diesen
Schritt ausdrücklich nicht verwendet. Stattdessen stellt
`npm run staging:edition:local` ein getrenntes, wegwerfbares lokales Staging mit
eigener Projekt-ID und eigenen Ports bereit. Der Ablauf ist in
`docs/EDITION_LOCAL_STAGING.md` dokumentiert.

Dort folgen in derselben sicheren Reihenfolge:

1. vollständige Migration in Reihenfolge;
2. exakter Abgleich der angewendeten Migrationshistorie;
3. Schema-Lint und Postflight mit `foundation_gates_pass=true`;
4. Candidate-E2E- und RLS-Smoke;
5. Entfernung des ausschließlich lokalen Staging-Volumes;
6. kein Backfill und keine Produktivmigration ohne separate Freigabe.

Dieser kostenfreie lokale Gate wurde am 17. August 2026 vollständig bestanden:
46 Migrationen waren exakt vorhanden, der Schema-Lint war leer, der Postflight
war grün und alle 21 Candidate-/RLS-Integrationsprüfungen bestanden. Das
temporäre Volume wurde anschließend entfernt. Die Aussage für das aktive Projekt
oben bleibt unverändert: Dort wurde weiterhin keine Migration angewendet.

Der anschließende read-only Produktions-Preflight und seine weiterhin
gesperrten Rollout-Gates sind in `docs/EDITION_PRODUCTION_PREFLIGHT.md`
dokumentiert.
