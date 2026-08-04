# Stufe 4 – deutsche Beobachtungsphase (Phase A)

## Zweck und Sicherheitszustand

Phase A sammelt 200–500 reale deutsche Beobachtungen, simuliert Policy-Entscheidungen und erzeugt manuell bewertbare Kalibrierungsdaten. Sie veröffentlicht keine automatisch erkannten Änderung.

Der ausgelieferte Zustand ist absichtlich gestoppt:

```text
dry_run=true
automation_enabled=false
observation_enabled=false
observation_scheduler_enabled=false
observation_country_code=DE
```

Die Datenbank-Constraints erzwingen in dieser Ausbaustufe `dry_run=true`, `automation_enabled=false`, `actually_executed=false` und Deutschland als einziges Beobachtungsland. Der externe Geocoding-Provider bleibt deaktiviert. Österreich und Schweiz stehen auf `pilot_disabled` und besitzen zusätzliche Country-Kill-Switches.

Die Phase-B-Readiness-Anzeige ist keine automatische Freigabe. Phase B darf nur durch eine bewusste separate Änderung aktiviert werden.

## Verwendete Architektur

Phase A erweitert die vorhandenen Komponenten, statt eine zweite Pipeline einzuführen:

- `event_sources`, `source_crawl_jobs`, `source_crawl_results` und der Worker `event-source-check` übernehmen Abruf, Queue, Content Hash und technische Fehlerisolation.
- `event_change_proposals` bleibt die Quelle strukturierter Feldänderungen.
- `evaluate_change_proposal_automation`, `automation_policies`, `automation_decisions` und `automation_scope_controls` liefern nachvollziehbare Shadow-Entscheidungen und Kill-Switches.
- `source_reliability_metrics` speichert feld-, source-, parser- und landbezogene Kalibrierung.
- `data_workflow_alerts` und `stage_four_audit_log` speichern interne Warnungen und Auditdaten.
- Das bestehende Data Operations Center zeigt Piloten, Beobachtungen, Reviews, Policy-Simulationen, Readiness, Läufe und Golden Cases.

Neue Phase-A-Tabellen sind `stage_four_pilot_sources`, `stage_four_observation_runs`, `stage_four_observations`, `stage_four_observation_reviews`, `stage_four_golden_cases`, `stage_four_readiness_criteria` und `stage_four_readiness_snapshots`. Alle sind per RLS nur für Admins beziehungsweise serverseitige Worker erreichbar.

## Pilotquellen

Die Migration liefert zwölf reale deutsche Quellprofile als nicht aktive, ungebundene `candidate`-Einträge:

1. BMW Berlin Marathon
2. Haspa Marathon Hamburg
3. Mainova Frankfurt Marathon
4. ADAC Marathon Hannover
5. Generali Köln Marathon
6. Generali München Marathon
7. GutsMuths-Rennsteiglauf
8. DATEV Challenge Roth
9. B2Run Deutschland
10. Deutsche Triathlon Union – Veranstaltungskalender
11. Race Result
12. Datasport Deutschland

Die Profile decken offizielle Eventseiten, Serien, Verband, Registrierungs-/Zeitnahmeplattformen und strukturierte Kalender ab. Ein Profil alleine kann keinen Crawl starten. Es muss zuerst an eine bereits geprüfte deutsche `event_sources`-Zeile mit kanonisch passender Domain gebunden werden.

### Pilotquelle sicher hinzufügen oder binden

1. Offizielle URL, Robots-Regeln, Impressum/Verantwortlichkeit und Eventzuordnung manuell prüfen.
2. Eine bestehende deutsche Eventquelle in `event_sources` verwenden; keine Quelle für AT/CH binden.
3. Im Data Operations Center unter „Pilotübersicht & Quellen“ die passende Eventquelle wählen und „Sicher binden“ ausführen. Serverseitig werden Domain und Eventland erneut geprüft.
4. Das gebundene Profil erhält zunächst `ready_for_binding`.
5. Erst nach zweiter Prüfung mit `set_stage_four_pilot_source_status(..., 'pilot_observation', ...)` aktivieren.

Neue Profile dürfen über eine geprüfte Seed-Migration oder als Admin über Supabase angelegt werden. Erforderlich sind Source-Key, Quellentyp, Domain, HTTPS-URL, DE, Start-Reliability, erlaubte Beobachtungsfelder, blockierte Mutationsfelder, Intervall, Rate Limits, Parserkonfiguration/-version, Aktivierungsgrund und Rollout-Phase. Start-Reliability ist auf höchstens `0.750` begrenzt; der Seed verwendet neutral `0.500`.

### Pilotquelle pausieren

Im Quellenbereich „Quelle pausieren“ wählen. Die Funktion `set_stage_four_pilot_source_status` schreibt Status, Grund und Auditmetadaten. Zusätzlich können `automation_scope_controls` nach Land, Domain, Quelle, Quellentyp, Feld, Policy, Aktion oder Parser-Version pausieren. Alle Gates werden serverseitig geprüft.

## Beobachtungslauf starten, stoppen und fortsetzen

Es wird kein produktiver Cron-Job installiert oder aktiviert. Nach Freigabe eines konkreten Betriebsfensters:

1. Sicherheitsflags und Country-Rollouts prüfen.
2. Nur die geprüften, gebundenen DE-Profile auf `pilot_observation` setzen.
3. Globalen Beobachtungsmodus bewusst mit `set_stage_four_observation_state(true, false, '<ausführlicher Grund>')` einschalten. Dadurch bleibt der Scheduler aus.
4. Über „Fällige Piloten einplanen“ oder `enqueue_stage_four_observation_runs(10, 'admin')` einen begrenzten manuellen Lauf erzeugen.
5. Worker wie beim bestehenden Source Monitor auf die bestehende Queue anwenden. Er zeichnet Phase-A-Beobachtungen nur für gebundene Piloten auf.
6. Nach dem Fenster `set_stage_four_observation_state(false, false, '<Grund>')` ausführen.

Ein geplanter Scheduler darf erst separat konfiguriert werden, wenn sichere Runtime-URLs/Secrets außerhalb des Repositorys vorhanden sind. Dann wird `observation_scheduler_enabled=true` ausschließlich über dieselbe Admin-RPC gesetzt. Der Scheduler ruft nur `enqueue_stage_four_observation_runs(..., 'scheduler')` auf. Er darf keine unbekannten Quellen erzeugen.

Läufe besitzen Run-ID, Crawl-Job, Idempotency-Key, Resume-Token, Parser-/Policy-Version und Status. „Lauf stoppen“ bricht nur den betroffenen Crawl ab und pausiert standardmäßig die Quelle. „Lauf fortsetzen“ plant einen isolierten Recovery-Lauf. Fehler einer Quelle werden pro Quelle abgefangen.

## Idempotenz und gespeicherte Beobachtungen

Die vorhandene Source-Monitor-Queue verhindert doppelte Crawl-Jobs. Phase A ergänzt:

- Zeitfenster-Idempotency-Key pro Pilot und Prüfintervall
- eindeutige Zuordnung von Crawl-Job und Crawl-Ergebnis zu einem Observation Run
- Request-Fingerprint aus Source, ETag, Last-Modified und Content Hash
- Observation-Fingerprint aus Run, Vorschlag/Feld, normalisiertem Wert und Content Hash
- Content-/Semantic-Hashes und HTTP-Cache-Header der bestehenden Pipeline

Identische Wiederholungen führen zu `idempotent=true` beziehungsweise `on conflict do nothing`; sie erzeugen keine unkontrollierten Beobachtungsduplikate. Auch `unchanged` wird als technischer, nachvollziehbarer Beobachtungsfall gespeichert.

## Shadow-Entscheidungen

`automation_decisions` und `stage_four_observations` trennen Empfehlung und Wirkung:

```text
decision_mode=shadow
would_execute=true|false
actually_executed=false
dry_run=true
```

Gespeichert werden Policy und Version, Parser und Version, erfüllte/nicht erfüllte Voraussetzungen, Confidence, feldbezogene Reliability, Konflikte, Blockierungsgrund und simulierte Aktion. Hochrisikoaktionen, Feldsperren und manuelle Overrides bleiben blockiert. Die Phase-A-Constraint verbietet tatsächliche Automationseinträge auf Datenbankebene.

## Manueller Review

Im Data Operations Center kann jede Beobachtung mit `korrekt`, `teilweise korrekt`, `falsch`, `veraltet`, `Dublette`, `Quelle ungeeignet`, `unklar` oder `manuelle Prüfung notwendig` bewertet werden. Zusätzlich erfasst der Workflow:

- geprüftes Feld und optionalen Sollwert
- Fehlerkategorie und Begründung
- Richtigkeit der Policy-Entscheidung
- Angemessenheit der Confidence
- Reliability-Anpassungsempfehlung
- Parserproblem
- Empfehlung, die Quelle zu pausieren
- Reviewer und Zeitpunkt

Diese Bewertung verändert niemals Event- oder Editionsdaten. Sie ist ausschließlich Trainings-, Kalibrierungs- und Auditinformation.

## Evaluation und Reliability

`get_stage_four_observation_metrics` unterstützt Filter nach Pilotquelle, Quellentyp, Feld, Policy, Parser-Version, Land, Zeitraum, Confidence, Reliability, Review-Ergebnis und Blockierungsgrund.

Precision, False-Positive-Rate und Review-Rate werden ausschließlich aus manuell bewerteten Änderungsvorschlägen berechnet. Unveränderte technische Beobachtungen erhöhen die zugrunde liegende Vorschlagsstichprobe nicht. Jede Anzeige enthält `reviewed_sample`, `sample_sufficient` und bei weniger als 30 bewerteten Vorschlägen eine Stichprobenwarnung.

`refresh_stage_four_phase_a_reliability` berechnet Reliability getrennt nach Quelle, Feld, Parser-Version und Land mit einem konservativen Bayes-Prior. Eine Quelle kann deshalb für Registrierungsstatus zuverlässig und für Datum unzuverlässig sein. Reliability wird nie künstlich erhöht.

## Golden Dataset

Nur eine bereits manuell bewertete Beobachtung kann mit `promote_stage_four_golden_case` in das Golden Dataset aufgenommen werden. Unterstützt werden unverändert, Registrierungsöffnung/-schluss, ausverkauft, Warteliste, URL-Wechsel, Erreichbarkeits-/Serverfehler, Datum/Ort, Absage/Verschiebung, neue Edition, Dublette/ähnlicher Name/Sponsorwechsel, irreführend/veraltet, abweichende Registrierungsplattform und mehrere Events pro Domain.

Jeder Fall speichert erwartete Werte, erwartete Policy-Wirkung, Source Snapshot Hash, Parser-/Policy-Version und Regressionstatus. Reale HTML-Fixtures werden später erst nach rechtlicher und redaktioneller Prüfung unter einem nicht öffentlichen Testfixture-Pfad ergänzt; die Datenbankstruktur benötigt keine erfundenen Fälle.

## Monitoring und Kill-Switches

`refresh_stage_four_observation_monitoring` erzeugt ausschließlich interne Alerts für Proposal-/False-Positive-/Dubletten-Spikes, Queue-Wachstum, Erreichbarkeit, dauerhafte Quellenfehler, Parser-/HTML-Strukturänderungen, Konflikte, Länderfehler, Reliability-Abfall, hohes Quellvolumen, Policy-Versionswechsel, Feldsperren-, Hochrisiko- und Rate-Limit-Versuche, Cache-Anomalien sowie fehlenden Scheduler-Heartbeat.

Kill-Switch-Ebenen:

- global: `global_emergency_stop`, `observation_enabled`, `observation_scheduler_enabled`
- Land: nur DE zulässig; AT/CH pausiert und `emergency_stop=true`
- Quelle/Domain/Quellentyp/Feld/Policy/Aktion/Parser-Version: `automation_scope_controls`
- automatisch: Grenzwerte für Fehlerquote, Konfliktrate, Tagesvolumen und Source-Failure-Zähler
- Lauf: isoliertes Stoppen/Fortsetzen

Alle Gates liegen in Datenbankfunktionen. Das Frontend zeigt und bedient sie nur.

## Phase-B-Readiness interpretieren

Vorkonfiguriert sind getrennte Kriterien für technische interne Beobachtungen, Registrierungsstatus und Deutschland. Sie prüfen Fallzahl, bestätigte Änderungen, Precision, False-Positive-Rate, Auditnachweis, Idempotenz, Kill-Switch-Konfiguration und RLS-Freigabehinweise. Snapshots enthalten immer `phase_b_activated=false`.

Ein grüner theoretischer Wert bedeutet nur: Die gespeicherten Daten erfüllen die konfigurierten Schwellen. Vor Phase B sind weiterhin ein separater Sicherheitsreview, RLS-/Advisor-Prüfung, Parser-Regression gegen das Golden Dataset, Quellenfreigabe, Rollback-Probe und eine bewusste Code-/Migrationsänderung nötig.

## Streng verbotene Aktionen

Phase A darf keine öffentliche Eventmutation, Absage, Verschiebung, Datums-/Orts-/Domainänderung, Event-/Editionsanlage, Löschung, Dubletten-Zusammenführung, Override-Umgehung, Österreich-/Schweiz-Verarbeitung oder externes Provider-Geocoding ausführen. Keine produktiven Secrets gehören ins Repository.

## Empfohlener Pilotablauf

Mit zwei bis drei offiziellen deutschen Eventquellen beginnen, pro Quelle zunächst einen manuellen Lauf ausführen und die ersten 30 Änderungsvorschläge vollständig bewerten. Danach auf 10–15 geprüfte Quellen und 200–500 Beobachtungen ausweiten. Phase B frühestens nach Erreichen der kriterienspezifischen Stichproben, stabilen 98–99+ Prozent Precision, regressionsfesten Golden Cases, mehreren störungsfreien Beobachtungsfenstern und einem separaten Go/No-Go-Review erwägen.
