# Edition Backfill Readiness

Stand: 17. August 2026

## Zweck und Sicherheitsgrenze

`tools/edition-backfill-readiness.sql` inventarisiert den bestehenden Event-/
Editionsbestand und klassifiziert Altfälle. Der Audit ist keine Migration und
enthält keinen Apply-Modus. Er besteht aus genau einem vorbereiteten
`WITH … SELECT`-Statement. Ein statischer Allowlist-Test lehnt zusätzliche oder
mutierende SQL-Statements ab. Session-Limits begrenzen Lauf- und Sperrzeit.

Jede ausgegebene Candidate- oder Draft-Empfehlung enthält
`safe_to_auto_backfill=false`. Der Report darf daher weder als Freigabe noch als
automatische Backfill-Anweisung interpretiert werden.

## Lokale Ausführung

Nach einem vollständigen lokalen Supabase-Reset:

```powershell
npm run audit:edition-backfill:local
```

Der JSON-Report enthält:

- Event-/Editions-Invarianten und mögliche Dubletten;
- Season-Planner-Referenzen und den `ON DELETE RESTRICT`-Schutz;
- Source-/Crawl-Zuordnungsfehler;
- den Umfang weiterhin editionsabhängiger Legacy-Felder auf `events`;
- Knowledge-Base-Tabellen ohne `edition_id`;
- eine vollständige Aktionszählung und bis zu 250 deterministisch sortierte
  Candidate-/Legacy-Draft-Fälle;
- den Zustand der Auto-Publish-Sperren.

## Read-only Bestandsaufnahme des verknüpften Projekts

Der lokal verifizierte Single-SELECT-Audit lief am 17. August 2026 um
13:55 UTC unverändert gegen das verknüpfte Projekt. Es wurden keine Daten
geschrieben.

- 999 Events besitzen 1.000 Editionen; genau ein Event besitzt mehrere
  Editionen. Es gibt keine doppelten Event-/Jahr- oder Event-/Datum-Gruppen und
  keine verwaisten Editionen.
- 498 Events befinden sich fachlich in `next edition unknown / watching`; alle
  besitzen mindestens eine aktive Source.
- 16 bestehende Succession-Candidates stammen noch aus der Legacy-Validierung:
  13 müssen durch die Candidate-First-Gates neu validiert werden, einer benötigt
  einen frischen Source-Crawl und zwei widersprüchliche Candidates für den
  Fehmarn Marathon 2027 bleiben im manuellen Konflikt-Review.
- Es existiert kein automatisch erzeugter Legacy-Draft mehr im Bestand.
- Von 46 Season-Planner-Zeilen besitzen 34 noch keine `edition_id`. Keine
  Referenz zeigt auf eine fehlende Edition; der produktive FK verwendet vor der
  neuen Migration aber noch nicht `ON DELETE RESTRICT`.
- Alle 1.003 Sources sind editionsgebunden; 1.000 sind aktiv, keine aktive Source
  ist technisch ungesund und es gibt keine Event-/Edition-/Crawl-Zuordnungsfehler.
- Alle 999 Events führen die Legacy-Felder Datum, Distanz, URL und
  Registrierungsstatus weiter. Datum, Distanz und URL stimmen mit der jeweils
  neuesten Edition überein. 993 Registrierungsstatus unterscheiden sich und
  benötigen vor jeder Feldmigration eine eigene Vokabular-/Consumer-Prüfung.
- Die betrachteten Knowledge-Base-Tabellen sind im verknüpften Projekt leer,
  besitzen aber weiterhin keine `edition_id`.
- Beide Auto-Publish-Flags sind `false`; der produktive Disable-Constraint ist
  vorhanden. `automatic_backfill_allowed` bleibt im Report immer `false`.

## Klassifikationen

- `eligible_for_explicit_admin_review`: Candidate ist bereits validiert, wird
  aber nicht automatisch materialisiert.
- `revalidate_from_fresh_source_crawl`: Source-/Crawl-Bindung reicht nicht mehr
  aus; neue Evidence ist erforderlich.
- `revalidate_after_blocker_resolution`: ein bekanntes Gate blockiert den Fall.
- `reconcile_legacy_draft_manually`: ein früher erzeugter versteckter Draft muss
  einzeln mit Candidate und Quelle abgeglichen werden.
- `conflict_manual_review`: Datum oder bestehende Edition widersprechen sich.
  Dazu zählen auch mehrere offene Legacy-Candidates mit verschiedenen Daten im
  selben Editionsjahr sowie Absage-/Verschiebungssignale.
- `retain_*_history`: abgeschlossene Reviewentscheidungen bleiben erhalten.

## Ausführung gegen Staging oder Produktion

Der gleiche SQL-Audit ist vor und nach der Candidate-First-Migration lesbar; neue
Candidate-Spalten werden über `to_jsonb` abgefragt. Gegen ein verknüpftes Projekt
darf er erst nach lokaler Verifikation und bewusster Zielprüfung ausgeführt
werden. Vorher muss derselbe unveränderte SQL-Hash lokal erfolgreich gelaufen
sein.

Vor Einführung von `event_field_controls` zeigt `manual_lock_gate_available=false`.
Legacy-Candidates werden dann grundsätzlich neu durch die Candidate-First-Gates
validiert. Eine spätere Adminfreigabe prüft aktive Locks nochmals transaktional.

Ein produktiver Backfill bleibt ausdrücklich außerhalb dieses Audits. Vor einem
späteren Apply-Schritt müssen jeder vorgeschlagene Fall, die Frontend-/Backend-
Abhängigkeiten der Legacy-Felder und die unveränderten Vorher-/Nachher-Zählungen
separat bestätigt werden.
