# Edition Lifecycle – Production Rollout Preflight

Stand: 17. August 2026, 14:54 UTC

## Ergebnis

Der produktionsnahe Preflight ist vorbereitet und wurde ausschließlich lesend
gegen das aktive Supabase-Projekt ausgeführt. Es wurde keine Migration, kein
Backfill, kein Candidate-Smoke, kein Worker und keine Einstellung ausgerollt.

Das Projekt verwendet den Free-Tarif und besitzt keine Development-Branch. Der
kostenfreie lokale Staging-Lauf bleibt daher die isolierte Testumgebung. Eine
Supabase-Branch ist weder Voraussetzung noch Bestandteil des Rollout-Plans.

## Aktueller Zustand

`tools/edition-production-preflight.sql` hat folgenden Vorzustand bestätigt:

- 36 exakt erwartete produktive Migrationen und kein unbekannter/umbenannter
  Eintrag;
- 46 lokale Migrationen und genau zehn erwartete ausstehende Versionen;
- 999 Events und 1.000 Editionen;
- keine verwaiste Edition, keine doppelte Event-/Jahr- oder
  Event-/Datum-Kombination und keine Source-/Edition-Zuordnungsabweichung;
- keine aktiven Crawl-Jobs, laufenden Daten-Workflows, langen Transaktionen oder
  auf Locks wartenden Sessions zum Messzeitpunkt;
- `auto_publish_enabled=false`, `auto_result_publish_enabled=false` und der
  harte Disable-Constraint ist vorhanden;
- eine offene Candidate-Datumswiderspruchsgruppe und 34 von 46
  Saisonplaner-Zeilen noch ohne konkrete `edition_id`.

Der Bericht setzt unabhängig vom Befund immer:

```text
deployment_authorized=false
backfill_authorized=false
worker_deployment_authorized=false
automatic_publication_authorized=false
ready_for_schema_deployment=false
```

## Gefundene Lücken

Die aktive Datenbank besitzt die Candidate-First-Erweiterung noch nicht. Damit
fehlen produktiv insbesondere strukturierte Candidate-Validierung, manuelle
Feldsperren, die abgeleitete Lifecycle-View, die Candidate-First-Review-Basis
und `ON DELETE RESTRICT` für referenzierte Saisonplaner-Editionen.

Die 16 vorhandenen Candidates bleiben Legacy-unvalidiert. Zwei davon bilden für
den Fehmarn Marathon 2027 einen Datumswiderspruch. Sie werden weder durch den
Schema-Rollout noch durch einen späteren Backfill automatisch freigegeben.

Der aktuelle Security Advisor meldet sieben Warnungen:

- eine anonym ausführbare `SECURITY DEFINER`-Funktion;
- fünf für angemeldete Nutzer ausführbare `SECURITY DEFINER`-Funktionen;
- deaktivierten Schutz vor geleakten Passwörtern.

Die ersten sechs Befunde müssen nach der ausstehenden Security-Härtung erneut
geprüft werden. Die Auth-Warnung wird in diesem Editionsschritt nicht durch eine
potenziell kostenpflichtige Funktion verändert. Der Performance Advisor meldet
58 Hinweise (20 nicht indexierte Fremdschlüssel, 38 bislang ungenutzte Indizes).
Diese Hinweise autorisieren keine pauschalen Indexänderungen.

## Additive Änderung dieses Schritts

Es wird keine neue Tabelle, Spalte, Constraint oder Policy ergänzt. Der neue
Preflight ist ein einzelnes statisch geprüftes `WITH … SELECT` und enthält ein
festes Migrationsmanifest für zwei erlaubte Zustände:

1. exakt 36 angewendete Versionen vor dem Rollout;
2. exakt alle 46 Versionen nach einem vollständigen Rollout.

Jeder Zwischenstand, jede umbenannte Version und jeder zusätzliche Eintrag wird
als `drift_or_partial_rollout` klassifiziert. Das lokale Wegwerf-Staging prüft
zusätzlich, dass der Preflight den vollständigen 46er-Stand erkennt, aber auch
dort keinerlei Deployment-Autorität erteilt.

## Daten- und Schema-Auswirkungen

Dieser Schritt hat keine Auswirkung auf bestehende Daten. Insbesondere werden
keine historischen Editionen, Event-Felder, Candidates, Saisonplaner-Zeilen,
Sources oder Einstellungen verändert.

Die bereits dokumentierte fachliche Zuordnung bleibt unverändert:

- Event-Identität bleibt auf `events`;
- Datum, Registrierung, Distanzen, Strecke, Ergebnisse, Cutoffs und
  Start-/Zielinformationen sind editionsabhängig;
- Legacy-Eventfelder werden erst nach Consumer-Audit und explizitem Backfill
  angefasst;
- User-Finishes und Saisonplaner-Einträge sollen dauerhaft eine Edition
  referenzieren; vorhandene Lücken werden nicht blind befüllt.

## Exakter ausstehender Migrationssatz

1. `20260814120000_beta_security_definer_hardening`
2. `20260815_source_monitor_extraction_review`
3. `20260816_stage_four_preparation`
4. `20260817124600_edition_candidate_first_lifecycle`
5. `20260817_stage_four_monitoring_guards`
6. `20260818_stage_four_germany_observation`
7. `20260819_stage_four_observation_calibration_guards`
8. `20260820_stage_four_observation_operational_alerts`
9. `20260821_stage_four_observation_lint_fixes`
10. `20260822_stage_four_observation_queue_lint`
11. `20260824_event_detail_verification_foundation`

Die bereits aktive Migration
`20260817121601_data_quality_stabilization` bleibt in der Historie erhalten und
wird weder repariert noch erneut ausgeführt. Candidate-First darf wegen seiner
Abhängigkeit von `event_field_controls` nicht aus der Reihenfolge herausgelöst
werden. Die auf den ersten Blick ungewöhnliche Reihenfolge von Position 4 und 5
ist beabsichtigt: Der lokale Supabase-Reset hat bestätigt, dass die CLI den
langen Zeitstempelpräfix vor der älteren Datei mit Tagespräfix anwendet.

## Konkreter Migrationsplan

1. Aus demselben Git-Commit einen verschlüsselten bzw. zugriffsbeschränkten
   logischen Schema- und Datenexport außerhalb des Repositorys erstellen.
2. Export auf Vollständigkeit und Lesbarkeit prüfen und einen Restore-Befehl
   dokumentieren. Produktionsdaten oder Zugangsdaten dürfen nicht committed
   werden.
3. Separate schriftliche Ziel- und Deployment-Freigabe einholen.
4. Den Preflight unmittelbar vor dem Wartungsfenster erneut ausführen. Er muss
   exakt den 36er-Vorzustand ohne Drift erkennen.
5. Writer kurz anhalten und bei Jobs, langen Transaktionen oder Lock-Waitern
   abbrechen.
6. Die Security-Härtung kontrolliert ausrollen und den Security Advisor erneut
   prüfen.
7. Nur mit fortbestehender Freigabe die restlichen Migrationen in der
   festgelegten Reihenfolge ausrollen. Keine Migration-History-Reparatur.
8. Migrationshistorie, Schema-Lint, anonymen Zugriff, RLS und
   `edition-staging-postflight.sql` prüfen.
9. Candidate- und Backfill-Daten unverändert lassen. Ein kontrollierter
   Candidate-Smoke oder Backfill ist jeweils ein separater, späterer Schritt.

## Sicherheits-Gates und Abbruchkriterien

Der Rollout wird abgebrochen, wenn:

- der Migrationssatz nicht exakt 36 vor bzw. 46 nach dem Rollout enthält;
- der eingeschränkt gespeicherte logische Export fehlt oder unlesbar ist;
- Zielprojekt oder Freigabe nicht explizit bestätigt sind;
- Duplicate-/Orphan-/Source-Zuordnungsgates fehlschlagen;
- Auto-Publish-Flags aktiv sind oder ihr Disable-Constraint fehlt;
- Source-/Workflow-Writer, lange Transaktionen oder Lock-Waiter aktiv sind;
- ein neuer kritischer RLS-/Security-Advisor-Befund entsteht;
- öffentliche Eventfakten, vergangene Editionen oder Candidate-Zustände
  unerwartet verändert werden;
- Stage-4 `dry_run` deaktiviert oder Automation, Observation bzw. Scheduler
  aktiviert wird.

Auf dem Free-Tarif sind herunterladbare automatische Backups nicht verfügbar.
Supabase empfiehlt deshalb regelmäßige eigene Exporte über `supabase db dump`.
Der erforderliche Datenexport wurde hier bewusst nicht erzeugt: Speicherort,
Zugriffsschutz und Umgang mit Produktionsdaten müssen vor diesem externen,
sensitiven Schritt ausdrücklich bestätigt sein.
