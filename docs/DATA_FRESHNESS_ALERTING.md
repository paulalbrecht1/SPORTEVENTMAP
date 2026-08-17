# Datenaktualität, Verifikation und Alarmierung

Stand: 17. August 2026. Produktionsabfragen in diesem Dokument sind read-only.
Die Stabilisierungsmigration `20260817121601_data_quality_stabilization.sql`
ist lokal verifiziert, aber noch nicht in Produktion ausgerollt.

## Produktive Baselines

Die Baseline vom 12. August bleibt als historischer Vergleich erhalten. Die
aktuelle Menge sinkt automatisch, wenn Austragungen stattfinden; deshalb dürfen
die beiden Nenner nicht vermischt werden.

| Signal | 12. August 2026 | 17. August 2026 |
| --- | ---: | ---: |
| Aktuelle veröffentlichte Discovery-Events | 498 | 471 |
| Frisch verifiziert | 315 | 292 |
| Freshness Rate | 63,25 % | 62,00 % |
| Stale / erneute Prüfung erforderlich | 183 | 179 |
| Aktuelle deutsche Events | – | 410 |
| Streng vollständig | – | 223 / 471 (47,35 %) |
| Quellen gesund | – | 179 / 471 (38,00 %) |
| Aktuelle Events mit aktivem Quellenfehler | 40 | 0 |
| Aktive Dead-Letter-Endzustände aktiver Quellen | 40 | 0 |
| Historische Dead-Letter-Jobs | – | 43 |

`admin_current_event_quality_metrics` berechnet den aktuellen Snapshot nach
Ausrollen der Stabilisierungsmigration reproduzierbar. Genau eine aktive,
veröffentlichte, nicht abgeschlossene aktuelle Austragung je Event gehört in den
Nenner. Problematische Events werden nicht entfernt, um die Quote zu erhöhen.

Die 179 aktuellen Review-Fälle verteilen sich nach der neuen Priorisierung auf
0 P0, 142 P1 (Deutschland) und 37 P2 (international). Zusätzlich enthält die
derzeit produktive Inbox 87 bereits materialisierte Entscheidungen: 25
Content-Verifikationen, 16 neue Editionen und 46 Ergebnisfälle. Die neue View
ergänzt fällige aktuelle Editionen dedupliziert, statt eine zweite Queue zu bauen.

## Definitionen

- `source_checked`: Ein Abrufversuch wurde protokolliert.
- `source_reachable`: Eine aktive Quelle lieferte zuletzt technisch erfolgreich
  `success` oder `not_modified`, ohne laufende Fehlerfolge.
- `content_verified`: Alle zentralen Felder wurden anhand einer benannten Quelle
  und aktueller strukturierter Evidenz bestätigt.
- `event_verified`: Die aktuelle Edition ist `verified`, benötigt kein Review,
  besitzt `last_verified_at` und ihr `next_check_at` liegt in der Zukunft.
- `review_required`: Verifikation ist stale/unsicher, eine Prüfung ist fällig oder
  es existiert ein fachlicher beziehungsweise technischer Konflikt.

Ein HTTP-200, ein unveränderter Hash oder eine wieder erreichbare URL setzt
`content_verified` und `event_verified` niemals allein. Die korrigierte
`restore_recovered_source_events()`-Logik verschiebt wieder erreichbare Events
aus `source_unreachable` nach `needs_review`; sie setzt weder `verified` noch
`last_verified_at`.

## Reproduzierbare Kennzahlen

```text
freshness_rate = fresh_events / current_events
complete_rate = complete_events / current_events
source_health_rate = source_healthy_events / current_events
review_rate = review_required_events / current_events
```

`fresh` erfordert `verification_status = verified`, `needs_review = false`, ein
gesetztes `last_verified_at` und `next_check_at > now()`.

`complete` verlangt Name, Sportart, Land, Ort, Koordinaten, Datum, Distanz(en),
eine Beschreibung mit mindestens 80 Zeichen, Registrierungs- oder offizielle URL
und mindestens eine aktive Quelle. `source_healthy` verlangt eine aktive,
erreichbare Quelle ohne aktiven Fehlerstatus. Vollständigkeit und Freshness sind
absichtlich getrennte Signale.

## Review-Prioritäten

Die Inbox berechnet Priorität bei jedem Lesen aus vorhandenen Event-, Editions-,
Quellen-, Proposal- und Validierungsdaten. Es gibt keine Event-spezifischen
Hardcodings.

- P0: Hochrisikoänderung, neue Edition, kritischer Fall oder Event innerhalb von
  30 Tagen mit Quellenfehler, nicht erreichbarer Quelle oder kritischer Datenlücke.
- P1: aktuelles deutsches Discovery-Event, das stale oder erneut zu prüfen ist.
- P2: aktuelles internationales Discovery-Event mit Prüfbedarf.
- P3: historischer oder nicht mehr aktueller, nicht kritischer Fall.

Der Score reserviert je Stufe einen getrennten Zahlenbereich; Dringlichkeit kann
die Reihenfolge innerhalb, aber nicht über eine Prioritätsstufe hinweg ändern.
Vorhandene Queue-Einträge sperren einen zusätzlichen Freshness-Eintrag auf
Event-/Editions-Ebene. Unveränderte Fingerprints erzeugen keine neue offene
Review-Aufgabe.

## Content-Verifikation

Die Admin-RPC bestätigt nur unveränderte Inhalte. Pro Aufgabe sind erforderlich:

- überprüfte Source URL und Prüfzeitpunkt (höchstens 24 Stunden alt),
- Confidence von mindestens 0,80,
- explizite Werte für Eventname, Jahr, Datum, Ort, Land, Sportart, Distanzen,
  Registrierungsstatus, offizielle Eventseite und Registrierungslink,
- keine unsicheren Felder und ein aussagekräftiger Review-Vermerk.

Jede Abweichung lässt die Aufgabe offen. Datum, Ort, Status, Domain, neue Edition,
Löschung und Zusammenführung werden niemals über diese Bestätigungs-RPC geändert.
Erfolgreiche Bestätigung schreibt einen unveränderlichen Audit-Eintrag mit Quelle,
beobachteten Werten, Confidence, Policy-Entscheidung und
`automatic_fact_changes=false`.

## Quellenfehler und Dead Letter

`admin_source_failure_history` klassifiziert die vollständige Historie, nicht nur
den letzten Zustand. Die 43 historischen Dead-Letter-Jobs bestehen aus 28
`robots_unavailable`, 5 `empty_content`, 3 `response_too_large`, 2
`source_replaced` sowie je einem `http_500`, `http_429`, `http_410`, `http_403`
und `robots_denied`. Drei letzte Dead-Letter-Zustände gehören zu deaktivierten
Quellen; aktive Quellen haben aktuell keinen Dead-Letter-Endzustand.

Temporäre Netzwerk-, DNS-/TLS-, 408/425/429-/5xx-,
`robots_unavailable`- und leere Inhaltsfehler nutzen den bestehenden begrenzten
Retry-Pfad. 404/410, Redirect-/Domainwechsel, Zugriffsschutz, ungültige URL,
`source_replaced` und ausgeschöpfte Versuche verlangen Review. Weder Event noch
Quelle werden wegen eines einzelnen Abruffehlers automatisch gelöscht, abgesagt
oder auf eine neue Domain umgestellt.

## Kalibrierte Alarme

| Signal | Aufmerksamkeit | Kritisch |
| --- | ---: | ---: |
| Öffentliche Katalogzeilen | unter 480 | unter 450 oder unvollständig |
| Freshness Rate | unter 80 % | unter 55 % |
| Mehr als 30 Minuten überfällige Quellen | ab 5 | ab 25 / unplanbare Quelle |
| Neue technische Fehler in 60 Minuten | ab 5 | ab 15 |
| Offene kritische Quellalarme | ab 1 | ab 10 |

Das Produktziel bleibt mindestens 90 %. Ein kritischer Zustand wird als Digest
zugestellt, unverändert frühestens nach 12 Stunden wiederholt und nach Erholung
einmalig entwarnt. Advisory Lock und zehnminütige Claim-Lease verhindern
parallelen Doppelversand. Zustellversuche werden ohne Secrets und mit gekürzter
Antwort protokolliert.

## Aktivierung des Alarmkanals

Die Datenbankmigration und Edge Function laufen ohne Webhook. Für Versand ist
serverseitig mindestens erforderlich:

```text
DATA_ALERT_WEBHOOK_URL=https://...
```

`DATA_ALERT_WEBHOOK_FORMAT=slack` aktiviert ein Slack-kompatibles Layout. Ohne
diese Angabe wird neutrales JSON verwendet. Secrets gelangen nie in Browser,
Review-Metadaten oder Audit-Logs.

## Sicherheitsstatus

Die Stabilisierungsmigration setzt `auto_publish_enabled=false` und
`auto_result_publish_enabled=false` und erzwingt dies per Check Constraint.
Die read-only Prüfung vom 17. August fand diese beiden Edition-Lifecycle-Flags in
Produktion noch auf `true`. Das ist eine verbleibende Produktionsabweichung; sie
wurde wegen der vorgeschriebenen separaten Deployment-Freigabe nicht stillschweigend
geändert. Stage 4 bleibt nicht ausgerollt, `dry_run=true` und
`automation_enabled=false` bleiben die verbindlichen Grenzen für einen späteren
kontrollierten Rollout.
