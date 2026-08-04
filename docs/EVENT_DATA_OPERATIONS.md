# Event Data Operations – Fundament (Stufe 1)

Stand: 28. Juli 2026

## 1. Bestandsaufnahme vor der Änderung

Die öffentliche Discovery-Anwendung ist eine Vanilla-JavaScript-Anwendung. Ihr primärer Eventbestand liegt nach dem kontrollierten Vollimport in Supabase. `js/events.js` lädt `public_event_discovery`; `data/events.csv` (994 Zeilen) bleibt ausschließlich ein explizit erzeugter Export- und Ausfall-Fallback.

Die bisherige Supabase-Tabelle `events` enthielt Eventmarke und Austragung gemeinsam: Name, Datum, Ort, Distanz und URL lagen in derselben Zeile. In der verbundenen Produktionsdatenbank waren vor dieser Migration sechs Einreichungen vorhanden; eine war veröffentlicht, fünf waren abgelehnt. Die numerische `events.id` wurde nicht von Favoriten oder Season Planner verwendet.

Favoriten und Season Planner speichern stattdessen den historischen Textschlüssel:

```text
event_name|date|city|country
```

Der Schlüssel wird kleingeschrieben. Diese Referenz ist die wichtigste Kompatibilitätsgrenze der Migration.

Weitere bestehende Datenbereiche:

- `profiles`: Nutzerprofil und Rolle `user`/`admin`
- `favorites`: nutzereigene Favoriten mit Text-`event_id`
- `season_planner_events`: nutzereigene Saisonplanung mit demselben Textschlüssel
- `analytics_events`: schreibgeschützte Produktanalytik für Clients, lesbar für Admins
- `user_feedback`: öffentliche Einreichung, Adminbearbeitung
- `event_details` mit Kindtabellen: optionale Event-Knowledge-Base für statische Detailseiten
- bisheriges `event_sources`: öffentliche Feldquellen der Knowledge-Base

Die statischen Detailseiten werden aus `data/events.csv`, `data/event-pages.json` und `data/event-detail-database.json` generiert. Ihre Slugs und URLs werden durch die Migration nicht geändert. Auth, Karte, Suche, Filter, Cluster, Detailseiten, Favoriten, Season Planner, Profile, Feedback, Theme und Sprachumschaltung bleiben über die bestehende Clientlogik angebunden.

## 2. Zielmodell

### `events` – dauerhaftes Event

`events.id` bleibt die stabile numerische Event-ID. Die vorhandenen IDs werden nicht ersetzt.

Neue Kernfelder:

- `canonical_name`, `canonical_key`, `slug`
- `sport`, `subcategory`
- `country`, `region`, `city`
- `organizer_id`, `organizer_name`
- `official_url`, `latitude`, `longitude`
- `publication_status`, `event_status`
- `verification_status`, `data_confidence`
- `last_verified_at`, `next_check_at`
- `needs_review`, `review_priority`
- `created_at`, `updated_at`

Die bisherigen Austragungsfelder (`date`, `distance`, `event_url` usw.) bleiben vorübergehend als schreibkompatibler Snapshot erhalten. Sie werden erst in einer späteren, separat geplanten Migration entfernt, wenn alle Clients ausschließlich Editionen lesen.

### `event_editions` – jährliche Austragung

Eine Edition referenziert genau ein Event über `event_id`. `(event_id, edition_year)` ist eindeutig.

Wichtige Felder:

- `id`, `event_id`, `edition_year`, `edition_slug`
- `legacy_event_key` für Favoriten- und Planner-Kompatibilität
- `start_date`, `end_date`, `start_time`
- `registration_url`, `registration_status`
- `edition_status`, `publication_status`
- `price_min`, `price_max`, `currency`, `price_details`
- `participant_limit`, `race_formats`, `legacy_distance`
- `source_url`
- vollständige Prüf- und Reviewfelder

Ein Update des Legacy-Datums erzeugt bei einem neuen Jahr eine neue Edition. Eine vergangene Edition wird dadurch nicht überschrieben. Bei einer Korrektur innerhalb desselben Jahres wird die vorhandene Edition aktualisiert; ihr `legacy_event_key` bleibt stabil.

### `event_sources` – operative Quellen

Das frühere `event_sources` wurde verlustfrei in `event_detail_sources` umbenannt. Es bleibt die öffentliche Zitattabelle der Knowledge-Base.

Das neue `event_sources` ist ausschließlich für Datenbetrieb und spätere Crawler bestimmt:

- Zuordnung zu Event und optional Edition
- Quellentyp und URL
- Priorität, Parsertyp, Aktivitätsstatus
- letzter/nächster Abruf
- HTTP-Status und Content-Hash
- Crawlstatus, Fehlerzähler und letzter Fehler

Event und Edition einer Quelle müssen zusammenpassen; ein Trigger erzwingt diese Beziehung.

### `validation_issues`

Validierungsprobleme sind über `entity_scope + rule_code` eindeutig. Ein erneuter Lauf aktualisiert ein vorhandenes Problem oder löst es auf, statt identische offene Zeilen anzulegen.

Felder: Event, optionale Edition, Schweregrad, Regelcode, Beschreibung, Status, Erstellungs-/Änderungszeit, Lösungszeit und lösender Nutzer.

### `event_audit_log`

Trigger protokollieren Inserts, Updates und Deletes an Events und Editionen. Bei Updates entsteht pro geändertem Fachfeld ein Datensatz mit altem/neuem JSON-Wert, Quelle, Nutzer/Systemprozess, Begründung, Quellen-URL und Zeitpunkt. `updated_at` wird nicht als eigenständige Fachänderung protokolliert.

## 3. Zentrale Statuswerte

### Veröffentlichung

- `draft`
- `published`
- `archived`

### Eventstatus

- `active`
- `inactive`

### Editionstatus

- `date_unconfirmed`
- `scheduled`
- `postponed`
- `cancelled`
- `completed`
- `inactive`

### Registrierung

- `registration_not_open`
- `registration_open`
- `sold_out`
- `cancelled`
- `unknown`

### Verifizierung

- `unverified`
- `verified`
- `stale`
- `needs_review`
- `source_unreachable`

### Quellen

Quellentypen:

- `official_event_website`
- `official_registration_platform`
- `organizer_calendar`
- `federation_calendar`
- `third_party_platform`
- `manual`

Crawlstatus:

- `pending`, `success`, `not_modified`
- `unreachable`, `blocked`, `parse_error`, `http_error`
- `inactive`

### Auditquellen

- `manual_admin`
- `import`
- `crawler`
- `user_report`
- `organizer`
- `system`

## 4. Initiale Einstufung

Bei der Datenmigration gelten reproduzierbare Regeln:

- keine Quelle: `source_unreachable`, Confidence `0.10`
- vergangenes Datum: `stale`, Confidence `0.30`
- vorhandene Quelle und dokumentierte letzte Prüfung: `verified`, Confidence mindestens `0.75`
- vorhandene Quelle ohne dokumentierte Prüfung: `unverified`, Confidence `0.45`
- expliziter Widerspruch: `needs_review`, Confidence `0.20`

Die nächste Prüfung liegt je nach Priorität standardmäßig 7, 30 oder 90 Tage in der Zukunft.

## 5. Validierung

Ausführung:

```sql
select * from public.run_event_validation();
select * from public.run_event_validation(123, null);
```

Der RPC ist nur für Admins und `service_role` ausführbar.

Harte Regeln:

- `missing_event_name`
- `missing_country`
- `invalid_date`
- `start_after_end`
- `missing_source` / `missing_edition_source`
- `invalid_official_url` / `invalid_edition_url`
- `invalid_coordinates`
- `coordinates_outside_country`
- `duplicate_edition_year`

Eine verwaiste Edition wird bereits durch den nicht-nullbaren Fremdschlüssel verhindert. Eine doppelte Edition wird durch den Unique Constraint verhindert; der Regelcode bleibt zusätzlich in der Validierung enthalten, damit vorbestehende Drift sichtbar wäre.

Warnungen:

- `missing_image`
- `missing_start_time`
- `missing_registration_url`
- `missing_distance`
- `missing_price`
- `missing_organizer`
- `past_event_scheduled`
- `future_date_unverified`
- `verification_stale` / `edition_verification_stale`

Die Länderprüfung verwendet bewusst grobe Bounding Boxes. Sie erkennt klare Länderfehler, ersetzt aber keine Polygonprüfung. PostGIS-Polygone sind ein Kandidat für Stufe 2.

## 6. Migrationsablauf

1. Remote-Branch und lokaler Branch müssen synchron sein.
2. Frischen Supabase-Backup/PITR-Stand sicherstellen.
3. Dry-Run der statischen Daten ausführen:

   ```bash
   npm run data:migrate:dry
   ```

4. Migration `20260728_event_data_operations_foundation.sql` anwenden.
5. RLS- und Security-Advisors prüfen.
6. Mit einer kleinen Stichprobe Events, Editionen, Quellen, Probleme und Audit kontrollieren.
7. Erst danach optional den vollständigen CSV-Bestand serverseitig importieren:

   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run data:migrate
   ```

Der Importer läuft ohne `--apply` immer nur als Dry-Run. Er akzeptiert keinen Publishable Key und liest den Service-Key ausschließlich aus der Serverumgebung. Der aktuelle Dry-Run bildet 994 CSV-Zeilen ohne Verlust auf 993 Eventmarken und 994 Editionen ab.

Supabase ist das Zielsystem. Bis der vollständige Import in Produktion freigegeben wurde, bleibt `data/events.csv` Fallback und Export. `public_event_discovery` ist die neue kompatible öffentliche Leseschicht; der Client fällt bei einer noch nicht migrierten Datenbank auf `events` zurück.

## 7. Backup und Rollback

Die Migration schreibt vor der Schemaänderung JSON-Snapshots von `events` und dem bisherigen `event_sources` nach `private.event_data_workflow_backup`. Diese Tabelle ist für `anon` und `authenticated` gesperrt.

Vor Produktion zusätzlich zwingend:

- Supabase PITR/Backup oder `pg_dump` erstellen
- Rowcounts und Prüfsummen dokumentieren
- Favoriten- und Planner-Textschlüssel exportieren

Der Compatibility-Rollback liegt unter:

```text
supabase/rollback/20260728_event_data_operations_compatibility_rollback.sql
```

Er stellt alte Eventfelder und alte Public-Policies wieder her und benennt die Zitattabelle zurück. Neue Editions-, Audit- und Validierungsdaten werden nicht gelöscht, sondern bleiben für eine erneute Einführung erhalten. Ein Rollback muss mit dem vorherigen Frontend-Release koordiniert werden.

## 8. Admin-Workflow

Der neue Tab „Datenqualität“ ist nur nach erfolgreicher Adminrollenprüfung sichtbar. Er bietet:

- verlangte Gesamt- und Qualitätskennzahlen
- Filter nach Land, Sport, Eventstatus, Verifizierung, Schweregrad, Priorität sowie Prüfdatum
- Event- und Editionslinks
- manuelle Verifizierung
- Markierung „muss geprüft werden“
- Festlegung der nächsten Prüfung
- Auflösung eines Validierungsproblems
- erneute idempotente Validierung
- Ansicht des unveränderlichen Änderungsverlaufs

Alle Schreibaktionen laufen über RLS-geschützte Tabellen. Der Browser enthält keinen Service-Role-Schlüssel.

## 9. RLS-Konzept

- `anon`: liest nur veröffentlichte Eventmarken/Editionen und die Discovery-View
- normaler Nutzer: wie `anon`, zusätzlich eigene Einreichungen, Favoriten, Planner und Profil
- Admin: verwaltet Events, Editionen, Quellen und Probleme; Audit ist nur lesbar
- `service_role`: serverseitiger Import/Crawler/Validator; nie im Frontend
- `event_sources`, `validation_issues`, `event_audit_log`: keine Anon-Grants und keine öffentlichen Policies
- `public_event_discovery`: `security_invoker = true`, deshalb gelten die RLS-Regeln der Basistabellen
- Autorisierung verwendet `profiles.role` über `private.is_admin()`, nicht nutzeränderbare `user_metadata`

## 10. Event und Edition manuell anlegen

Zuerst die Eventmarke anlegen:

```sql
insert into public.events (
  event_name, canonical_name, sport, country, region, city,
  official_url, status, publication_status, event_status,
  verification_status, data_confidence, needs_review, review_priority
) values (
  'Köln Marathon', 'Köln Marathon', 'Running', 'Germany',
  'Nordrhein-Westfalen', 'Köln', 'https://example.org',
  'approved', 'published', 'active', 'verified', 0.90, false, 'medium'
)
returning id;
```

Danach eine Edition mit der zurückgegebenen ID anlegen:

```sql
insert into public.event_editions (
  event_id, edition_year, edition_slug, legacy_event_key,
  start_date, end_date, registration_url, registration_status,
  edition_status, publication_status, race_formats, source_url,
  verification_status, data_confidence, needs_review, review_priority
) values (
  123, 2027, 'koln-marathon-2027',
  'köln marathon|03.10.2027|köln|germany',
  '2027-10-03', '2027-10-03', 'https://example.org/register',
  'registration_open', 'scheduled', 'published',
  '[{"label":"Marathon"},{"label":"Half Marathon"}]',
  'https://example.org', 'verified', 0.90, false, 'medium'
);
```

Zum Schluss mindestens eine operative Quelle hinzufügen und die Validierung ausführen.

## 11. Offene Punkte für Stufe 2

- vollständigen CSV-Bestand nach Freigabe in Produktion importieren und CSV danach nur noch exportieren
- PostGIS-Länderpolygone statt Bounding Boxes
- serverseitiger Scheduler für `next_check_at`/`next_fetch_at`
- HTTP-Fetcher mit robots.txt-, Rate-Limit- und Retry-Regeln
- Content-Hashing und feldgenaue Änderungsvorschläge
- kontrollierte Parser je Quellentyp
- Admin-UI für neue Eventmarken/Editionen und Quellenanlage
- Review-/Freigabeschritt für automatische Änderungen
- Monitoring, Alerting und Dead-Letter-Queue

## 12. Produktionsnachweis (28. Juli 2026)

Die Migrationen `event_data_operations_foundation`, `event_slugify_encoding_fix` und `event_data_operations_indexes` wurden auf Projekt `fztupxyxvhvhtihhmtnk` angewendet.

Verifizierter Zustand unmittelbar danach:

- 6 bestehende Eventzeilen und dieselben IDs `3, 16, 17, 18, 19, 20`
- 6 daraus erzeugte Editionen, jeweils dem ursprünglichen Event zugeordnet
- 6 interne Backupzeilen für `events`
- 35 Favoriten und 46 Season-Planner-Zuordnungen unverändert
- 0 doppelte `(event_id, edition_year)`-Paare
- 1 veröffentlichte Zeile in `public_event_discovery`, entsprechend dem vorherigen Bestand
- zwei aufeinanderfolgende Validierungsläufe mit unverändert 39 offenen Warnungen und ohne Problemdubletten
- Umlaut-Stichprobe `Köln Marathon` ergibt `koln-marathon`

Der Security Advisor meldet den Validator als absichtlich für `authenticated` ausführbare `SECURITY DEFINER`-Funktion. Die Funktion bricht für alle Nicht-Admins vor Datenzugriff mit `42501` ab; dies ist im Vier-Rollen-RLS-Test abgedeckt. Ein weiterer projektweiter Hinweis betrifft die in Supabase Auth noch deaktivierte Leaked-Password-Protection und ist keine Schemaänderung dieses Arbeitspakets.

Der Performance Advisor meldet für die neuen operativen Fremdschlüssel keine fehlenden Indizes mehr. `unused_index`-Hinweise direkt nach Erstellung sind erwartbar und müssen erst nach realer Nutzung bewertet werden.
## 13. Produktionsupdate Stufe 2 (29. Juli 2026)

Dieser Abschnitt ersetzt die früheren offenen Punkte zum Vollimport, zu PostGIS,
Scheduler, Review und Monitoring.

### Produktiver Katalogimport

Der separat freigegebene Import `ba56e423-f4c2-4e6b-8c41-b3ca98641652`
wurde mit einem 20/20-Canary, fünf Event-Batches und fünf Editions-Batches
durchgeführt. `private.catalog_import_backups` enthält den vollständigen
Vorher-Snapshot sowie erwartete Zählwerte. Die Finalisierung verweigert die
Freigabe bei abweichenden Counts oder doppelten `(event_id, edition_year)`.

Produktiver Abschlusszustand:

- 993 veröffentlichte Eventmarken
- 994 veröffentlichte Austragungen
- 994 operative Quellen aus dem Import
- 0 verwaiste oder doppelte Editionen
- 0 offene kritische/hart fehlerhafte Importprobleme
- 35 Favoriten und 46 Season-Planner-Zuordnungen unverändert
- historische Schreibdublette bleibt mit ihrer ID inaktiv und auditierbar

Der Client liest Supabase zuerst. Nur bei weniger als 900 öffentlichen Zeilen
(Rollout-Schutz) oder einem Supabase-Ausfall wird `data/events.csv` geladen.
Die CSV wird nicht mehr parallel gepflegt. Sie wird mit
`npm run data:export-fallback` explizit aus `public_event_discovery` erzeugt;
der Export verweigert kleine/unvollständige Ergebnisse.

### Scheduler und Quellen-Worker

- `sem-event-operations-hourly` läuft stündlich um Minute 17.
- `sem-country-polygon-validation-hourly` läuft stündlich um Minute 23.
- `event-source-check` ist als JWT-geschützte Edge Function aktiv (Version 2).
- `sem-event-source-check` ist aktiv und ruft den Worker alle 15 Minuten mit
  einem Fünfer-Batch auf. Funktions-URL, öffentlicher JWT und ein rotierbares
  256-Bit-Cron-Secret liegen ausschließlich in Supabase Vault; außerhalb von
  Vault wird nur der SHA-256-Digest des Cron-Secrets gespeichert.
- Ein produktiver Ein-Quellen-Canary endete mit HTTP 200, `not_modified` und
  ohne Workerfehler. Der `pg_net`-Timeout beträgt 120 Sekunden, damit auch der
  sequenzielle Fünfer-Batch innerhalb der definierten Request-Limits abschließt.

Quellen werden atomar mit `FOR UPDATE SKIP LOCKED` beansprucht, pro Lauf höchstens
eine URL je Host. Domainrichtlinien steuern Timeout, Antwortgröße, Mindestpause,
Retry-Backoff und `robots.txt`. HTTP 429 berücksichtigt `Retry-After`. Hashänderungen
ändern niemals Eventdaten direkt, sondern erzeugen einen eindeutigen offenen
`event_change_proposals`-Datensatz.

### Review und Monitoring

Der geschützte Admin-Tab zeigt zusätzlich fällige Quellen, offene
Änderungsvorschläge und Workflow-Alarme. Nur Vorschläge mit erlaubten Fachfeldern
können über `apply_event_change_proposal` übernommen werden. Ablehnung/Schließen
sowie Alarmauflösung speichern Admin und Zeitpunkt. Crawlerdaten, Vorschläge,
Runs und Alarme haben keine öffentlichen Leserechte.

### PostGIS

PostGIS prüft Koordinaten gegen 22 Natural-Earth-1:50m-Länderpolygone. Der GiST-
Index unterstützt räumliche Prüfungen. Kleine Inseln und Territorien, die der
Kartierungsmaßstab auslässt, sind eng und begründet ergänzt: deutsche Nord-/
Ostseeinseln, Kanaren und Svalbard. Die globale Toleranz bleibt bei 3 km.
Fehlende Länderpolygone erzeugen Workflow-Alarme.

### Auth-Status

Supabase meldet Leaked-Password-Protection weiterhin als deaktiviert. Das Projekt
liegt im Free-Plan; die Funktion ist laut Supabase nur in Pro und höher verfügbar.
Sie wurde gemäß Produktentscheidung nicht kostenpflichtig aktiviert. Falls diese
Entscheidung später geändert wird, ist sie nach dem Plan-Upgrade im Auth-Dashboard
einzuschalten und mit bestehendem Login, Registrierung und Passwortänderung zu testen.

### Noch offen vor einem umfangreichen Parser (Stufe 2+)

- feldgenaue Parser je Quellentyp entwickeln; leere Hash-Vorschläge bleiben reine
  Prüfhinweise
- Benachrichtigungskanal für kritische `data_workflow_alerts` anbinden
- Leaked-Password-Protection bleibt ohne Pro-Upgrade bewusst deaktiviert
- Nutzungsdaten der neuen Indizes nach realem Betrieb prüfen, nicht unmittelbar
  nach Erstellung wegen erwartbarer `unused_index`-Hinweise