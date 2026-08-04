# Edition Lifecycle & Succession Engine

## Ziel und Sicherheitsgrenze

`events` beschreibt die dauerhafte Veranstaltung, `event_editions` eine konkrete Austragung. Vergangene Austragungen verschwinden automatisch aus Discovery und Karte, bleiben aber als veröffentlichte historische Jahresseite erhalten. Ergebnisse werden editionsbezogen gespeichert. Der Source Monitor darf neue Jahrgänge und Ergebnislinks erkennen, erzeugt daraus jedoch ausschließlich nicht öffentliche Entwürfe.

Eine automatische Veröffentlichung ist vorbereitet, aber standardmäßig deaktiviert. `edition_lifecycle_settings.auto_publish_enabled` bleibt `false`, bis ausreichende Produktionsdaten, Parser-Precision und ein expliziter Freigabeprozess vorliegen.

## Zustände

- `discovery_status=active`: in Karte und Suche sichtbar.
- `discovery_status=detail_only`: nicht mehr in Discovery, aber weiterhin öffentlich historisch erreichbar.
- `discovery_status=suppressed`: Entwurf oder manuell unterdrückt.
- `publication_status=draft`: niemals anonym lesbar.
- `publication_status=published`: über die öffentliche Archivschicht lesbar.
- `results_status=not_expected|expected|candidate|available|unavailable`: Ergebnis-Lifecycle der Austragung.

`public_event_discovery` liefert je Event-Serie nur die nächste aktive veröffentlichte Austragung. `public_event_archive` liefert alle veröffentlichten Jahrgänge samt freigegebenen Ergebnislinks.

## Automatischer Tageslauf

Der pg_cron-Job `sem-edition-lifecycle-daily` ruft täglich um 02:17 UTC `private.run_edition_lifecycle(current_date)` auf:

1. Nach Ablauf der konfigurierten Karenz wird die Austragung `completed` und `detail_only`.
2. Die historischen Daten bleiben unverändert erhalten; nur der Discovery-Status wechselt.
3. Ergebnisstatus wird auf `expected` gesetzt.
4. Quellen von Event-Serien ohne bekannte Folgeedition werden früher erneut geprüft.
5. Künftige veröffentlichte Editionen werden wieder `active`.
6. Routinemeldungen ohne unmittelbaren Handlungswert werden automatisch geschlossen.

Die zentralen Werte liegen in `edition_lifecycle_settings`: Karenz, Nachfolgeprüfung, Draft-/Batch-Schwellen, Batchlimit und spätere Auto-Publish-Schwelle.

## Erkennung neuer Jahrgänge

Der Worker extrahiert ausschließlich beobachtbare Signale:

- Schema.org/JSON-LD `SportsEvent` oder `Event` mit Datum und optionaler Registrierung.
- sichtbare ISO- und deutsche Datumsformate als schwächeres Signal.
- offizielle Ergebnis-, Timing- und Urkundenlinks.

Ein Kandidat muss ein späteres Jahr und ein späteres Datum als die letzte bekannte Edition besitzen. Ab `auto_draft_threshold` entsteht idempotent eine Edition mit `publication_status=draft` und `discovery_status=suppressed`. Ein erneuter Crawl aktualisiert denselben Fingerprint statt Duplikate anzulegen.

## Exception-only Admin-Workflow

`admin_exception_inbox` ist eine `security_invoker`-View und enthält nur:

- neue Jahrgänge und Konflikte,
- Ergebnislinks im Entwurf,
- kritische Quellenfehler,
- Validation- und Workflowfehler mit Schweregrad `error` oder `critical`.

Admins können sichere Entwürfe einzeln oder gesammelt über `approve_edition_succession_candidates` beziehungsweise `approve_edition_result_candidates` veröffentlichen. Ablehnungen bleiben nachvollziehbar gespeichert. Die Freigabe prüft erneut Mindestkonfidenz, Datum, Quelle und Draftstatus.

## Favoriten und Saisonplaner

- `favorites.event_ref` referenziert die dauerhafte Event-Serie. Ein Event-Favorit überlebt den Jahreswechsel.
- `season_planner_events.edition_id` referenziert die konkrete Austragung. Resultat, Priorität und Notizen bleiben dem richtigen Jahr zugeordnet.
- Die historischen Textschlüssel bleiben vorerst als Kompatibilitätsschicht erhalten und wurden auf die neuen Fremdschlüssel zurückgefüllt.

Die Detailseitenaktion „Zur Saison hinzufügen“ schreibt ausschließlich in `season_planner_events`, nicht zusätzlich in `favorites`.

## Öffentliche historische Seiten und Export

`npm run data:export-fallback` exportiert:

- aktive Discovery-Daten nach `data/events.csv`,
- alle veröffentlichten Editionen nach `data/event-editions-public.json`.

Der Seitengenerator kombiniert beide Datenquellen, nutzt stabile `edition_slug`-Werte und rendert historische Hinweise sowie veröffentlichte Ergebnislinks. Vollständige Rohseiten des Crawlers werden nicht gespeichert.

## Sicherheit und RLS

- Anonyme Nutzer sehen nur veröffentlichte Editionen und freigegebene Ergebnisse.
- Normale Nutzer sehen keine Kandidaten, Entwürfe, Settings oder Exception-Inbox-Einträge.
- Kandidaten-RPCs sind ausschließlich für `service_role` freigegeben.
- Sammelfreigaben verlangen `private.is_admin()`.
- Views laufen mit den Rechten des Aufrufers (`security_invoker`).
- Kein Source-Monitor-Pfad überschreibt Event-Fakten direkt.

## Tests und Deployment

```powershell
npm run supabase:reset
npm run test:source-monitor
npm run test:edition-lifecycle
npm run test:event-automation
npm run test:rls:local
```

Deployment-Reihenfolge:

1. Migration `20260810_edition_lifecycle_succession_engine.sql` anwenden.
2. Database Advisors prüfen.
3. Edge Function `event-source-check` deployen.
4. Produktions-Smoke-Test ausführen.
5. Cron-Job, erste Archivierungszahlen und Exception-Inbox kontrollieren.
6. Erst danach den öffentlichen Archivexport und statische Seiten veröffentlichen.

Neue Secrets sind nicht erforderlich. Der Worker nutzt weiterhin die in `SOURCE_MONITOR.md` dokumentierten Source-Monitor-Secrets; der User-Agent lautet ab Worker 3.0 `SportEventMapSourceMonitor/3.0 (+mailto:kontakt@sporteventmap.com)`.

## Vorbereitung für die nächste Stufe

Vor einer kontrollierten Auto-Veröffentlichung müssen mindestens Precision/Recall pro Signalquelle, Fehlfreigaben, Zeitabstand zwischen Detection und Bestätigung sowie Domain-spezifische Parserqualität gemessen werden. Auto-Publish darf anschließend nur für mehrfach bestätigte, konfliktfreie Kandidaten mit gültiger offizieller Quelle und sehr hoher Konfidenz aktiviert werden. Fachliche Änderungen bestehender Editionen bleiben weiterhin proposal- oder review-gesteuert.
