# Stufe 4 – sichere Vorbereitung und Phase-A-Simulation

Die konkrete Betriebsanleitung für reale deutsche Shadow-Beobachtungen, Pilotquellen, Review, Golden Dataset und Phase-B-Readiness steht in [STAGE_FOUR_GERMANY_OBSERVATION.md](STAGE_FOUR_GERMANY_OBSERVATION.md).

## Status und Sicherheitsgrenze

Stufe 4 ist technisch vorbereitet, aber nicht produktiv aktiviert. Die Migration
`20260816_stage_four_preparation.sql` setzt absichtlich:

- `automation_enabled = false`
- `dry_run = true`
- `rollout_phase = observation`
- Österreich und Schweiz auf `pilot_disabled`
- Geocoding für alle Länder auf deaktiviert
- KI-Tagesbudget auf 0

Die Phase-A-Ausführung protokolliert, was eine spätere Automatik entschieden
hätte. Sie veröffentlicht keine Discovery-Kandidaten, legt keine neue Edition an,
ändert keine Renndaten und führt keine Sammeländerungen an öffentlichen Daten aus.

Stand 17. August 2026 sind die Stage-4-Migrationen `20260816` bis `20260822`
weiterhin nur im Repository vorhanden. Sie wurden bei der
Datenqualitätsstabilisierung weder produktiv migriert noch aktiviert. Die davor
einsortierte Migration `20260817121601_data_quality_stabilization.sql` ist ein
separat ausrollbarer Sicherheits-Hotfix und keine Freigabe für Stage 4. Sie
erzwingt zusätzlich
`edition_lifecycle_settings.auto_publish_enabled=false` und
`auto_result_publish_enabled=false`.

Die produktive read-only Prüfung fand beide älteren Edition-Lifecycle-Flags noch
auf `true`. Bis zum separat genehmigten Hotfix-Deployment dürfen deshalb weder
der alte Bestätigungs-RPC für Content-Änderungen noch automatische Editions- oder
Ergebnisfreigaben für Produktionsbereinigungen verwendet werden. Es wurden in
dieser Arbeit keine Produktionsdaten verändert.

## Policy Engine

`automation_policies` enthält alle zentralen Regeln. Worker verteilen keine
unabhängigen Auto-Approval-Schwellen im Code. Jede Entscheidung speichert Policy
und Version, empfohlene und durch Dry-Run wirksame Entscheidung, Confidence,
Reliability, Gründe, Policy-Snapshot, Eingaben, Zeitpunkt und Fingerprint.

`evaluate_change_proposal_automation()` prüft globale Einstellungen, Not-Aus,
Länder-/Quellenpausen, Feldsperren, manuelle Overrides, Konflikte, Feldrisiko,
Quelle, Land, Confidence, Review-Stichprobe und Fehlerrate. Das Ergebnis steht in
`automation_decisions` und `stage_four_audit_log`.

### Vorbereitete risikoarme Aktionen

Frühestens in Phase B:

- technische Erreichbarkeit protokollieren
- Crawl- und Verifikationszeitpunkte bestätigen
- unveränderte offizielle Quellen bestätigen
- nächste Prüfung planen
- technische Fehlerzähler zurücksetzen
- vergangene Austragung als abgeschlossen vorschlagen

Der Registrierungsstatus ist für Phase C vorbereitet. Er benötigt Deutschland,
eine offizielle Quelle, mindestens 0,985 Confidence, mindestens 50 manuell
geprüfte Vorschläge, mindestens 0,95 Reliability und höchstens 0,02 Fehlerrate.
Der konservative Reliability-Prior verlangt in der Praxis deutlich mehr als 50
nahezu fehlerfreie Reviews.

### Dauerhaft vom Auto-Approval ausgeschlossen

- Event löschen oder archivieren
- Absage oder Verschiebung
- Ort, Koordinaten oder Land ändern
- Sportart oder offizielle Domain ändern
- neue Edition veröffentlichen
- Start- oder Enddatum ändern
- Werte mit Konflikten oder Validierungswarnungen
- gesperrte oder manuell bestätigte Felder
- unsichere Zusammenführung von Dubletten

Diese Vorgänge bleiben sichtbar, aber immer im Review beziehungsweise blockiert.

Die feldgenaue Content-Verifikation der Stabilisierungsmigration ist ebenfalls
kein Änderungsweg: Sie darf ausschließlich bestätigen, dass alle zehn zentralen
gespeicherten Werte mit aktueller strukturierter Evidenz unverändert
übereinstimmen. Bei Abweichung oder Unsicherheit bleibt die Aufgabe offen.

## Quellenzuverlässigkeit

`refresh_source_reliability_metrics()` berechnet ein 7–365 Tage umfassendes
Fenster je Quelle, Domain, Quellentyp, Extraktorversion, Adapter, Feld und Land.
Gespeichert werden Vorschläge, Reviews, Accept/Reject/Edit-Raten, Crawl-Fehler,
Erreichbarkeit, Confidence sowie falsche Absage- und Datumsindikatoren.

Der Score verwendet einen konservativen Bayes-Prior von 20 Beobachtungen. Kleine
Stichproben können dadurch keine automatische Freigabe erzwingen. Alle Beiträge
und Abzüge stehen in `score_reasons`.

## Kontrollierte Event-Discovery

Unterstützte Quellentypen sind offizielle Verbands- und Veranstalterkalender,
Registrierungs- und Zeitnahmeplattformen, Rennserien, strukturierte Eventlisten
und Sitemaps. Es gibt keine allgemeine Websuche.

Neue Quellen müssen als `discovery_sources` angelegt, einem Land zugeordnet, mit
Limits versehen und explizit aktiviert werden. In Phase A sind keine realen
Discovery-Quellen vorkonfiguriert. Damit ist kein Massenimport möglich.

`record_discovery_candidates()` akzeptiert nur Service-Role-Aufrufe, aktive
Quellen, unterstützte DACH-Länder und die vier Kernsportarten. Pro Quelle greift
ein Kandidatenlimit. Jeder Kandidat bleibt nicht öffentlich in
`discovery_candidates`.

## Duplikaterkennung

`duplicate-detector.mjs` normalisiert Jahreszahlen, Auflagen und
Sponsorbestandteile. Der Score berücksichtigt Namensähnlichkeit, Stadt, Land,
Datum, Koordinatenabstand, offizielle Domain und Registrierungsplattform.

Ergebnisse sind `no_match`, `possible_match`, `probable_match` oder
`confirmed_duplicate`. Selbst `confirmed_duplicate` führt nicht automatisch zu
einer Zusammenführung. `duplicate_candidates` speichert Faktoren und Reviewstatus;
das Data Operations Center zeigt den möglichen Bestandsdatensatz daneben.

## Geocoding

Geocoding darf nur für `new_event`, `new_location`, `missing_coordinates` oder
`manual_retry` eingereiht werden. `queue_geocoding_job()` prüft Ziel, Länderfreigabe,
Not-Aus, Tageslimit, Cache-Key und bereits offene identische Aufträge.

`geocoding_cache` vermeidet wiederholte Provider-Aufrufe. Ergebnisse werden gegen
Ländercode und DACH-Grenzen geprüft. Ein Provider-Ergebnis ist niemals eine direkte
Publikationsfreigabe. Abweichendes Land oder unplausible Koordinaten erzwingen
Review. Der vorbereitete Provider ist `geoapify`; sein Schlüssel gehört nur in ein
serverseitiges Function-Secret. Der Provider-Worker bleibt bis zur Pilotfreigabe
deaktiviert.

Die öffentliche Eventsuche besitzt einen ISO-normalisierten DACH-Länderfilter.
Ältere Werte wie `Germany`, `Österreich`, `Suisse` oder `Svizzera` bleiben filterbar.

## Länderstrategie

| Land | Startstatus | Sprachen | Währung | Zeitzone | Pilotlimit |
| --- | --- | --- | --- | --- | ---: |
| Deutschland | `observation` | Deutsch | EUR | Europe/Berlin | 1.000 |
| Österreich | `pilot_disabled` | Deutsch | EUR | Europe/Vienna | 50 |
| Schweiz | `pilot_disabled` | Deutsch, Französisch, Italienisch | CHF | Europe/Zurich | 50 |

Unterstützte Sportarten bleiben `running`, `trail_running`, `ultra_running` und
`triathlon`. Postleitzahlen, Währungen, Zeitzonen, Koordinatengrenzen, Umlaute sowie
französische und italienische Schweizer Ortsnamen sind vorbereitet.

Aktivierungsreihenfolge:

1. Deutschland beobachten und Review-Rückstand abbauen.
2. Deutschland Phase B für technische Aktionen.
3. Deutschland Phase C für einzelne bewährte Feld-/Quellenkombinationen.
4. Österreich mit höchstens 50 geprüften Events.
5. Schweiz mit höchstens 50 geprüften Events und mehrsprachigen Fixtures.
6. Quellen pro Land einzeln erweitern.

## Data Quality Score

`refresh_data_quality_snapshots()` gewichtet je Land:

- verifizierte aktive Events: 20 %
- gültige offizielle URL: 12 %
- Koordinaten: 14 %
- zukünftiger Termin: 14 %
- nächste Prüfung: 8 %
- Bild: 6 %
- Registrierungslink: 8 %
- Distanzen: 8 %
- mindestens eine Quelle: 10 %

Der Snapshot enthält außerdem Alter der letzten Prüfung, kritische Fehler,
Warnungen, mögliche Dubletten und vergangene Events ohne Folgeedition. Die
Einzelfaktoren werden gespeichert und im Länder-Dashboard angezeigt.

## Data Operations Center

Der Adminbereich zeigt Dry-Run und Not-Aus, Simulationen und potenzielle
Auto-Approvals, Policies, Reliability, Discovery-Kandidaten, mögliche Dubletten,
Geocodingprobleme, DACH-Quality-Scores, Tagesbudgets und Bulk-Vorschauen.

Stufen 1–3 bleiben funktionsfähig, wenn die Stage-4-Migration noch nicht
ausgerollt ist. Der Stage-4-Bereich zeigt dann einen isolierten Hinweis.

## Sammelaktionen und Rollback

Sammelaktionen sind whitelisted und auf 100 Datensätze begrenzt.
`prepare_stage_four_bulk_operation()` speichert Anzahl, Auswirkungen, Itemliste und
Preview-Hash. Erst eine zweite bestätigte RPC darf ausführen. Ein veralteter Hash
erzeugt einen Race-Condition-Fehler.

In Phase A markiert die Bestätigung nur `simulated`; öffentliche Daten bleiben
unverändert. Die spätere Live-Implementierung muss Ziele sperren, vollständig
validieren und bei einem Fehler die Transaktion zurückrollen. Der aktuelle RPC
verweigert Live-Bulk ausdrücklich.

## Beobachtbarkeit, Kosten und Last

`stage_four_usage_daily` zählt Crawls, Kandidaten, Geocoding, KI-Kosten und
Workerfehler pro globalem, Länder-, Domain-, Quellen-, Worker- oder Provider-Scope.
`automation_scope_controls` bietet Pause, Not-Aus, Tageslimit und Parallelitätslimit
je Scope. Globale Limits stehen in `stage_four_settings`.

Bestehende `data_workflow_alerts` bleiben die Alarmqueue. Stage-4-Daten ermöglichen
Warnungen für Queue-Wachstum, Workerfehler, Crawl-/Extraktionsfehler, Absage-Spitzen,
ungewöhnlich viele Kandidaten und externe Nutzung, ohne Log-Flut oder HTML-Speicher.

## Export und Frontend

Discovery-, Reliability-, Geocoding-, Audit- und Reviewtabellen sind per RLS und
expliziten Grants ausschließlich Admins beziehungsweise Service Role zugänglich.
Öffentliche Karte, Länderfilter und Exporte lesen weiterhin nur veröffentlichte
`events` und `event_editions`. Interne Stage-4-Daten gelangen nicht in Fallback-
JSON oder CSV.

## Rollout-Gates

- Phase A → B: mindestens 14–30 Tage Beobachtung, kein kritischer Extraktorfehler,
  Review-Rückstand kontrolliert und Reliability nachvollziehbar.
- Phase B → C: technische Simulationen bestätigt und ausreichende Stichprobe je
  Feld-/Quellenkombination.
- Deutschland → Österreich: deutscher Betrieb stabil und Pilotquellen einzeln
  freigegeben.
- Österreich → Schweiz: Pilotmetriken akzeptiert; mehrsprachige Orts- und
  Datumsfixtures grün.

Jede Phase wird bewusst über `stage_four_settings` beziehungsweise
`country_rollouts` freigegeben und begründet. Kein Deployment aktiviert die
Automatik implizit.

## Spätere Europa-Erweiterung

Ein weiteres Land wird erst ergänzt, wenn Sprache, Datumsformate, Regionen,
Postleitzahlen, Währung, Zeitzone, Statusvokabular, Geocodinggrenzen, Verbände,
Plattformen, Pilotlimit und Quality-Ziel definiert sind. Empfohlen wird jeweils
ein einzelner Nachbarstaat mit höchstens 50–100 kuratierten Pilot-Events statt
eines Europa-Massenimports.
