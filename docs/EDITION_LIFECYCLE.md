# Edition Lifecycle & Succession Engine

## Ziel und Sicherheitsgrenze

`events` beschreibt die dauerhafte Veranstaltung, `event_editions` eine konkrete Austragung. Vergangene Austragungen verschwinden automatisch aus Discovery und Karte, bleiben aber als veröffentlichte historische Jahresseite erhalten. Ergebnisse werden editionsbezogen gespeichert. Der Source Monitor darf neue Jahrgänge und Ergebnislinks erkennen und erzeugt zunächst nicht öffentliche Entwürfe.

Migration `20260813_review_inbox_safe_automation.sql` hatte eine eng begrenzte
automatische Veröffentlichung für neue Editionsentwürfe und offizielle
Ergebnislinks vorbereitet. Im aktuellen Stabilisierungszustand ist auch diese
Automation deaktiviert. `20260817121601_data_quality_stabilization.sql` setzt
`auto_publish_enabled=false` und `auto_result_publish_enabled=false` und
verhindert ein Aktivieren per bloßem Konfigurationsupdate. Bestehende öffentliche
Eventfelder wie Name, Ort, Geodaten, Absage oder Datumsänderung werden weiterhin
niemals ungeprüft überschrieben.

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

Ein Kandidat muss ein späteres Jahr und ein späteres Datum als die letzte etablierte Edition besitzen. Ab `auto_draft_threshold` entsteht idempotent eine Edition mit `publication_status=draft` und `discovery_status=suppressed`. Ein erneuter Crawl bestätigt denselben Fingerprint statt Duplikate anzulegen; der automatisch erzeugte Entwurf wird dabei bewusst nicht als bereits etablierter Jahrgang gewertet. Abweichende Daten für dasselbe Jahr werden als Konflikt markiert.

## Vorbereitete, derzeit deaktivierte Auto-Freigabe

Die folgenden Regeln beschreiben den vorbereiteten Pfad. Solange die beiden
Publication-Flags deaktiviert sind, veröffentlicht er nichts; Kandidaten bleiben
im Review. Ein später separat genehmigter Jahrgang dürfte nur automatisch
veröffentlicht werden, wenn alle Bedingungen erfüllt wären:

- bekannte Quelle vom Typ `official_event_website` oder `official_registration_platform`
- ausschließlich HTTPS
- strukturiertes Schema.org-/JSON-LD-Datum
- mindestens zwei unterschiedliche Crawls
- standardmäßig mindestens 24 Stunden zwischen Bestätigungen
- bestätigte Konfidenz von mindestens `0.995`
- kein abweichender Kandidat für dasselbe Jahr
- keine offenen Validation-Issues der Stufe `error` oder `critical`
- aktive Quelle ohne aktuelle Fehlerfolge

Ergebnislinks benötigen ebenfalls zwei zeitversetzte Bestätigungen einer offiziellen HTTPS-Quelle und eine bestätigte Konfidenz von mindestens `0.980`. Ein späterer automatischer Pfad müsste `auto_published_at` setzen, einen maschinenlesbaren Grund speichern und durch das Audit-Log laufen. Aktuell bleibt jede Veröffentlichung eine Admin-Entscheidung.

## Exception-only Admin-Workflow

`admin_exception_inbox` sammelt die Roh-Ausnahmen. Die darauf aufbauende `admin_review_inbox` ist ebenfalls eine `security_invoker`-View und speist die oben platzierte „Jetzt zu prüfen“-Inbox. Sie bündelt technische Fehler zu genau einem Eintrag pro Quelle, priorisiert P0–P3 und ergänzt dedupliziert aktuelle stale Discovery-Editionen. Sie enthält:

- neue Jahrgänge und Konflikte,
- Ergebnislinks im Entwurf,
- konkrete Feldänderungsvorschläge,
- kritische Quellenfehler,
- Validation- und Workflowfehler mit Schweregrad `error` oder `critical`.

Routinefälle, die lediglich auf ihre zweite automatische Bestätigung warten, stehen in einer getrennten Ansicht und zählen nicht als aktuelle Entscheidung. Hash-only-Änderungen ohne erkannten Feldunterschied werden als technische Information protokolliert, aber nicht mehr als menschliche Aufgabe geführt. Mehrere Dead-Letter-, Unerreichbarkeits- und Workflow-Meldungen derselben Quelle erscheinen als ein Bündel und werden über `resolve_source_exception_bundle` gemeinsam geschlossen. Admins können verbleibende Entwürfe einzeln oder gesammelt über `approve_edition_succession_candidates` beziehungsweise `approve_edition_result_candidates` veröffentlichen. Ablehnungen bleiben nachvollziehbar gespeichert.

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
- Kein Source-Monitor-Pfad überschreibt bestehende Event-Fakten direkt. Auch neue
  Editionsentwürfe und Ergebnislinks werden im aktuellen Stabilisierungszustand
  nicht automatisch öffentlich.

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

Neue Secrets sind nicht erforderlich. Der Worker nutzt weiterhin die in `SOURCE_MONITOR.md` dokumentierten Source-Monitor-Secrets; der User-Agent lautet ab Worker 3.1 `SportEventMapSourceMonitor/3.1 (+mailto:kontakt@sporteventmap.com)`.

## Vorbereitung für die nächste Stufe

Für die nächste Stufe sollen Precision/Recall, Fehlfreigaben, Bestätigungsdauer und Domain-spezifische Parserqualität aus den gesetzten Automationsfeldern gemessen werden. Erst nach ausreichenden Produktionsdaten dürfen weitere Felder wie Anmeldestatus automatisch aktualisiert werden. Fachliche Änderungen bestehender Editionen bleiben bis dahin proposal- oder review-gesteuert.
