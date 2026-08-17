# Source Monitor

Die automatische Feldextraktion, Normalisierung, Confidence-Bewertung und Admin-Review aus Stufe 3 ist in [SOURCE_MONITOR_EXTRACTION.md](SOURCE_MONITOR_EXTRACTION.md) dokumentiert.

Die sichere Phase-A-Vorbereitung für Policy-Simulation, Reliability, Discovery,
Geocoding und DACH-Piloten ist in [STAGE_FOUR_PREPARATION.md](STAGE_FOUR_PREPARATION.md) dokumentiert.

## Zweck und Sicherheitsgrenze

Der Source Monitor prueft bestehende offizielle Event- und Registrierungsseiten serverseitig. Er speichert technische Abrufdaten, vergleicht normalisierte Content-Hashes und erzeugt Review-Aufgaben. Er überschreibt keine bestehenden öffentlichen Event-Fakten wie Name, Datum, Ort, Distanz, Beschreibung oder Anmeldelink. Als eng begrenzte Ausnahme darf die Lifecycle-Schicht einen neuen Jahrgang oder offiziellen Ergebnislink nach mehrfacher sicherer Bestätigung veröffentlichen.

Zulässige automatische Änderungen umfassen technische Quellenfelder, Queue-Status, `needs_review`, technische Verifizierungsstatus, Validierungsprobleme, Review-Aufgaben, Workflow-Alerts, Audit-Einträge sowie die in `EDITION_LIFECYCLE.md` definierten bestätigten neuen Editionen und Ergebnislinks. Ein einzelner `404` oder ein anderer Abruffehler löscht oder archiviert niemals ein Event.

## Architektur

```text
pg_cron (alle 15 Minuten)
  -> JWT- und Secret-geschuetzte Edge Function event-source-check
     -> schedule_due_source_crawls (maximal 25 neue Jobs)
        -> source_crawl_jobs (ein Job je Quelle, Partial-Unique-Index)
     -> claim_source_crawl_jobs (Lease + FOR UPDATE SKIP LOCKED)
        -> maximal 5 Jobs, maximal 1 Job je Domain standardmaessig
     -> HTTP Worker (DNS/Redirect-SSRF-Pruefung, Robots, Limits)
        -> record_source_crawl_result (eine Datenbanktransaktion)
           -> source_crawl_results
           -> event_sources Technikstatus und naechster Termin
           -> Retry oder Dead Letter
           -> Review, Alert, Audit und Validierungsproblem bei Bedarf
```

Der Browser und das Admin-Frontend crawlen nicht selbst. Die Aktion "Jetzt pruefen" ruft die authentifizierte Edge Function auf; der externe HTTP-Abruf findet ausschliesslich im Worker statt.

## Tabellen und Migration

Migration: `supabase/migrations/20260808_source_monitor_queue_worker.sql`

### `source_monitor_settings`

Singleton-Konfiguration fuer Scheduler-Batch, Worker-Batch, globale Parallelitaet, Lease, Versuche, Event-relative Intervalle, Validierungsschwelle und Excerpt-Retention. Nur Admins duerfen lesen oder aendern; der Service Role hat Serverzugriff.

### `source_crawl_jobs`

Durable Queue mit:

- `source_id`, `event_id`, optionale `edition_id`
- niedriger numerischer Wert = hoehere Prioritaet
- `scheduled_at`, `attempt_count`, `max_attempts`
- `queued`, `processing`, `completed`, `failed`, `retry_scheduled`, `dead_letter`
- `lease_expires_at`, `lease_owner`, `last_processed_at`
- Fehlerart, Fehlermeldung, Trigger-Quelle und Idempotency-Key

Ein partieller Unique-Index verhindert mehr als einen aktiven Job pro Quelle. Claims verwenden `FOR UPDATE SKIP LOCKED`. Abgelaufene Leases werden vor einem neuen Claim als Retry oder Dead Letter wiederhergestellt.

### `source_crawl_results`

Dauerhafte Metadatenhistorie je Job und Versuch:

- Crawl-ID, Quelle, Event, Austragung und Zeitpunkt
- HTTP-Status, finale URL und Redirect-Anzahl
- Antwortzeit, Content-Type und Content-Length
- vorheriger und neuer Hash
- `unchanged`, `changed`, `first_seen`, `unreachable`, `content_invalid`
- Fehler, Worker-Version und Verarbeitungsstatus
- optionales normalisiertes Excerpt nur fuer Aenderungen oder Fehler

Vollstaendiges HTML wird nie gespeichert.

### `source_review_tasks`

Admin-Review-Queue fuer `content_changed`, `source_unreachable`, `content_invalid` und `dead_letter`. Fingerprints verhindern doppelte offene Aufgaben fuer dasselbe technische Ereignis.

### Erweiterte Tabellen

`event_sources` enthaelt zusaetzlich finale URL, Redirect-Anzahl, Response-Zeit, Content-Type, Content-Length, ETag, Last-Modified, Fehlerart, Hash-Status und Zeitpunkt einer Fehlererholung.

`crawler_domain_policies` enthaelt maximale Redirects, Robots-Cache, erlaubte Content-Types und die HTTP-Freigabe je Domain.

## Scheduler und Priorisierung

`public.schedule_due_source_crawls()` waehlt ausschliesslich aktive Quellen mit `next_fetch_at <= now()`. Pro Lauf werden standardmaessig maximal 25 Jobs erzeugt. Die Prioritaet beruecksichtigt:

- manuelle Quellenprioritaet
- Event-Review-Prioritaet und `needs_review`
- unbestaetigten oder veralteten Verifizierungsstatus
- fehlenden naechsten Termin
- kuerzlich geaenderte Quelle
- kuerzlich behobenen Quellenfehler
- vorherige Fehlerzahl
- vergangene oder fehlende Austragungsdaten
- offene Nutzerhinweise der Kategorie `incorrect_event_data`

Der Scheduler und der Worker sind logisch getrennt. Ein Cron-Aufruf plant zuerst Jobs und verarbeitet danach nur einen kontrollierten Batch. Weitere Worker-Aufrufe koennen die durable Queue unabhaengig abarbeiten.

## Pruefintervalle

Die Funktion `private.source_monitor_next_at()` liest ausschliesslich `source_monitor_settings`:

| Abstand zum Event | Standardintervall |
| --- | --- |
| mehr als 12 Monate | deterministisch 60 bis 90 Tage |
| 6 bis 12 Monate | 30 Tage |
| 1 bis 6 Monate | 14 Tage |
| unter 30 Tage | deterministisch 3 bis 7 Tage |
| direkt nach dem Event | Ziel: Tag 2 nach dem Event |
| weitere Nachpruefung | Ziel: Tag 14 nach dem Event |
| zweite Nachpruefung | Ziel: Tag 60 nach dem Event |
| danach ohne neues Datum | alle 30 Tage |
| kein Datum vorhanden | 30 Tage |

Die deterministische Streuung verteilt Last, ohne bei jedem Lauf neue Zufallswerte zu erzeugen.

## Retry, Lease und Idempotenz

Standardmaessig sind maximal 5 automatische Versuche erlaubt. Die Domain-Policy liefert die Backoff-Minuten, standardmaessig `15, 60, 360, 1440, 10080`. `Retry-After` bei `429` hat Vorrang und wird auf maximal 7 Tage begrenzt.

Nicht automatisch behebbaren Sicherheits- oder Inhaltsfehlern wie private
Zieladresse, nicht erlaubtes Protokoll, eingebettete Zugangsdaten, nicht
erlaubter Port, zu viele Redirects, zu grosse Antwort und nicht erlaubter
Content-Type wird direkt der Dead-Letter-/Review-Pfad zugeordnet. Das gilt auch
für `404`/`410`, `401`/`403` und sonstige nicht ausdrücklich temporäre
4xx-Antworten. `408`, `425`, `429`, `5xx`, Timeout, DNS-, TLS- und
allgemeine Netzwerkfehler können entsprechend der Policy erneut versucht
werden. Kein permanenter Fehler entfernt das Event.

Ein Ergebnis ist pro `job_id + attempt_number` eindeutig. Der Abschluss, das Ergebnis, der Quellenstatus, Retry und Review werden in `record_source_crawl_result()` transaktional gespeichert. Ein wiederholter Abschluss desselben Versuchs liefert das bestehende Resultat statt Duplikate zu erzeugen.

Die gemeinsame Worker-Funktion `classifySourceFailure()` und die Admin-View
`admin_source_failure_history` ordnen Fehler reproduzierbar ein:

| Kategorie | Beispiele | Behandlung |
| --- | --- | --- |
| Seite entfernt/geändert | 404, 410 | Review; niemals Event automatisch absagen oder löschen |
| Redirect | ungültiges Ziel, Redirect-Limit | Ziel und Domain manuell prüfen |
| Temporäre Verbindung | Timeout, Netzwerk, DNS, TLS | begrenzter Retry nach bestehender Domain-Policy |
| Rate Limit / Upstream | 429, 5xx | `Retry-After` beziehungsweise Backoff, danach Review |
| Zugriff/Bot-Schutz | 401, 403, `robots_denied` | Review; Schutz nicht umgehen |
| Robots temporär | `robots_unavailable` | begrenzter Retry |
| Inhalt/Parser | leer, Typ/Encoding, zu groß | nur geeignete Fälle retryen, sonst Review |
| Quelle ungültig/ersetzt | URL/Protokoll/Port/Credentials, `source_replaced` | manuelle Quellenentscheidung |

Der Worker liefert bei einem Fehler zusätzlich `error_category`,
`error_temporality` und `retryable`. Diese Metadaten ändern die bestehende
Queue nicht und erzeugen keinen zweiten Retry-Mechanismus. Nach `max_attempts`
endet ein Job nachvollziehbar im Dead-Letter-Status; ein manueller Retry erzeugt
einen neuen, auditierbaren Versuch statt einer Endlosschleife.

## HTTP- und SSRF-Schutz

Der Worker erlaubt HTTPS und, sofern Domain-Policy oder `SOURCE_MONITOR_ALLOW_HTTP` dies explizit zulassen, HTTP. Er blockiert:

- `file://` und alle anderen Protokolle
- URLs mit Benutzername oder Passwort
- nicht standardmaessige Ports
- localhost und interne Hostnamen
- private, Loopback-, Link-Local-, Carrier-NAT-, Dokumentations- und Multicast-IPv4-Netze
- private, Loopback-, Link-Local-, IPv4-mapped-private-, Dokumentations- und Multicast-IPv6-Netze
- Cloud-Metadata-Ziele
- die eigene Supabase-API und bekannte interne Supabase-/Container-Hosts

Vor jedem Abruf werden A- und AAAA-Adressen aufgeloest und vollstaendig geprueft. Redirects werden manuell verfolgt; jedes Ziel wird erneut nach denselben Regeln geprueft. Falls DNS nicht sicher geprueft werden kann, schlaegt der Abruf geschlossen fehl. Es werden keine Scripts ausgefuehrt und kein Browser-JavaScript gestartet.

## Hash-Normalisierung

Vor SHA-256 werden entfernt oder normalisiert:

- HTML-Kommentare
- Script-, Style- und Noscript-Bloecke
- Navigation, Header und Footer
- klar benannte Cookie-/Consent-/Tracking-Bloecke
- UTM-, GCLID-, FBCLID- und bekannte Marketingparameter
- generierte ISO-Zeitstempel und lange Millisekunden-IDs
- Tags, HTML-Basisentities und ueberfluessiger Whitespace
- JSON-Objektschluessel werden stabil sortiert

Ein Hashwechsel bedeutet ausschliesslich "Quelle hat sich geaendert". Er bestaetigt keine fachliche Aenderung.

## Domainfreundliche Verarbeitung

Standardwerte pro Domain:

- mindestens 30 Sekunden zwischen Requests
- maximal 1 Quellenjob pro Worker-Lauf
- 12 Sekunden Timeout
- 1,5 MB maximale Antwort
- 5 Redirects
- `robots.txt` beachten und 24 Stunden cachen
- ETag und Last-Modified fuer Conditional Requests nutzen
- `Retry-After` beachten
- klarer User-Agent `SportEventMapSourceMonitor/3.2 (+mailto:kontakt@sporteventmap.com)`

Die globale Parallelitaet liegt standardmaessig bei 5. Claims enthalten nie zwei laufende Jobs derselben Domain. Robots-Abrufe verwenden ein separates Limit von 250 KB.

## Retention

- Crawl-Metadaten und Jobs bleiben dauerhaft erhalten.
- Vollstaendiges HTML wird nie gespeichert.
- Ein normalisiertes Excerpt bis 4.000 Zeichen wird nur bei Aenderungen oder Fehlern gespeichert.
- Excerpts werden standardmaessig nach 14 Tagen durch `private.source_monitor_housekeeping()` entfernt.
- `sem-source-monitor-housekeeping` laeuft taeglich um 03:17 UTC.

## Admin-Dashboard

Der Admin-Bereich beginnt mit der „Review Inbox / Jetzt zu prüfen“. Sie zeigt ausschließlich konkrete Entscheidungen, Konflikte und kritische Fehler. Routinefälle, die auf eine zweite Quellenbestätigung warten, besitzen eine getrennte Ansicht. Der vollständige Eventbestand und der technische Bereich „Source Monitor & Systemstatus“ sind standardmäßig eingeklappt.

Der technische Bereich liegt weiterhin in "Event Data Operations" und zeigt:

- heute gepruefte, unveraenderte, veraenderte und nicht erreichbare Quellen
- fehlgeschlagene Crawls, geplante Retries und Dead-Letter-Jobs
- durchschnittliche Antwortzeit
- ueberfaellige Quellen und Quellen ohne naechsten Termin
- Event, Austragung, Quelle, Domain, HTTP-/Hash-Status, Fehlerzahl, Prioritaet und Review
- historische Fehlerklasse, verbleibendes Retry-Budget und empfohlene Aktion

Aktionen: sofort pruefen, Termin setzen, pausieren, reaktivieren, Historie, Quelle, Event, Review abschliessen, Fehler zuruecksetzen und Dead-Letter-Crawl erneut starten. Alle Aktionen besitzen Lade-, Erfolgs- und Fehlerstatus. Unter 760 px wird die Tabelle in mobile Karten umgewandelt.

## Umgebungsvariablen und Secrets

Supabase stellt fuer Edge Functions `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` und `SUPABASE_SECRET_KEYS` bereit. Browser erhalten ausschliesslich einen Publishable Key; Secret-/Service-Keys duerfen nie im Browser oder Repository liegen.

Optionale Worker-Konfiguration:

```text
SOURCE_MONITOR_USER_AGENT=SportEventMapSourceMonitor/3.2 (+mailto:kontakt@sporteventmap.com)
SOURCE_MONITOR_ALLOW_HTTP=false
SOURCE_MONITOR_REQUIRE_PINNED_TRANSPORT=true
SOURCE_MONITOR_SMOKE_SECRET=<mindestens 256 Bit>
```

Cron benoetigt in Supabase Vault:

- `sem_function_url`: vollstaendige URL der Function `event-source-check`
- `sem_anon_jwt`: Publishable-/Anon-JWT fuer das Edge Gateway
- `sem_source_check_cron_secret`: zufaelliges Secret mit mindestens 256 Bit

Der Klartext des Cron-Secrets liegt nur in Vault. In `private.event_source_cron_credentials` liegt nur der SHA-256-Digest.

## Lokale Tests

```bash
npm run supabase:reset
npm run test:source-monitor
npm run test:rls:local
npm run test:static
npm run audit:layout
```

`tests/source-monitor-core.test.mjs` prueft lokale HTML-Fixtures, unveraenderten und veraenderten Inhalt, Redirect, unsicheren Redirect, 404, 429, Timeout, DNS-Fehler, ungueltigen Content-Type, Groessenlimit, Conditional Requests, Robots und SSRF-Netze.

Der lokale RLS-Test prueft zusaetzlich: keine doppelten aktiven Jobs, Service-Role-only Scheduler und Claims, Lease/Attempt, transaktionales Resultat, Admin-Lesezugriff, Sperre fuer normale Nutzer und unveraenderte oeffentliche Event-Fakten.

## Deployment

Vor dem Deployment CLI-Befehle immer mit `--help` gegen die installierte Version pruefen.

```bash
supabase db push
supabase functions deploy event-source-check --use-api
supabase secrets set SOURCE_MONITOR_USER_AGENT="SportEventMapSourceMonitor/3.2 (+mailto:kontakt@sporteventmap.com)"
supabase secrets set SOURCE_MONITOR_ALLOW_HTTP=false SOURCE_MONITOR_REQUIRE_PINNED_TRANSPORT=true
supabase secrets set SOURCE_MONITOR_SMOKE_SECRET="<zufaelliges Secret mit mindestens 256 Bit>"
```

Danach:

1. Vault-Secrets setzen oder rotieren.
2. `private.event_source_cron_credentials` mit dem SHA-256-Digest des Cron-Secrets aktualisieren.
3. `select private.install_event_source_check_cron();` ausfuehren.
4. Cron-Job `sem-event-source-check` und Housekeeping-Job pruefen.
5. Einen kontrollierten Admin-Sofortcrawl ausfuehren.
6. Queue, Resultat, Review, Audit und unveraenderte Event-Fakten pruefen.
7. Supabase Database Advisors ausfuehren.

## Manueller Aufruf

Serverseitig:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/event-source-check" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batch_size":5}'
```

Gezielte Admin-Pruefung erfolgt im Dashboard. Alternativ kann ein Admin `enqueue_source_crawl()` aufrufen und danach den Worker starten.

## Produktionshaertung

### DNS-Pinning und TLS

Der Worker verwendet fuer jeden Request und jedes Redirect-Ziel die von
`Deno.resolveDns` geprueften oeffentlichen A-/AAAA-Adressen. Der
`pinned-http`-Transport verbindet per `Deno.connect` direkt zu genau einer
dieser IPs. Bei HTTPS uebernimmt `Deno.startTls` weiterhin den urspruenglichen
Hostnamen fuer SNI und Zertifikatspruefung. Damit kann der normale Fetch-Resolver
das Ziel zwischen SSRF-Pruefung und Verbindung nicht austauschen.

`SOURCE_MONITOR_REQUIRE_PINNED_TRANSPORT=true` ist der Produktionsstandard.
Ist Raw TCP/TLS in der Runtime nicht verfuegbar, wird der Crawl fail-closed
abgebrochen. Der Transport sendet HTTP/1.1, `Accept-Encoding: identity` und nur
eine enge Header-Allowlist. Die verwendete IP wird in Crawl-Ergebnis und Quelle
gespeichert.

### Versionierte Doppel-Hashes

`content_hash` deckt den normalisierten sichtbaren Inhalt ab.
`semantic_hash` (aktuell `sem-v2`) wird unabhaengig aus Event-JSON-LD und
Eventsignalen wie Datum, Distanz, Ort, Anmeldung, Preis und Absage gebildet.
Jede Aenderung bleibt eine Review-Aufgabe, erhaelt aber eine Confidence:

- `high`: Eventsignale haben sich geaendert
- `low`: breiter Inhalt geaendert, Eventsignale gleich
- `medium`: Versionswechsel oder nur breiter Hash verfuegbar
- `exact`/`baseline`: unveraendert beziehungsweise erster Abruf

### Robots und adaptive Domain-Limits

Der Robots-Parser beachtet spezifische User-Agent-Gruppen, Longest-Match fuer
Allow/Disallow und dezimales `crawl-delay`. Ein temporaer nicht sicher
abrufbares robots.txt stoppt den Hauptabruf und plant einen Retry; 404/410 gilt
als fehlende Robots-Datei. Die effektive Domain-Pause ist immer das Maximum aus
Admin-Basislimit, Robots-`crawl-delay` und adaptivem Limit.

`source_domain_daily_metrics` sammelt nur technische Tagesaggregate.
Ein 429 verdoppelt die adaptive Pause (maximal 24 Stunden) und respektiert
`Retry-After`. Nach jeweils 20 erfolgreichen Requests sinkt die adaptive
Pause schrittweise wieder Richtung Admin-Basiswert.

### Produktions-Smoke-Test

Der Smoke-Modus schreibt weder Queue- noch Eventdaten. Er prueft Remote-Schema,
Loopback-SSRF-Sperre, DNS-Pinning, TLS, Kontakt-User-Agent sowie Content- und
Semantic-Hash gegen `https://example.com/`.

```bash
npm run smoke:source-monitor:production
```

Erforderlich sind `SUPABASE_URL`, ein Publishable-/Anon-Key und das nur
serverseitig gesetzte `SOURCE_MONITOR_SMOKE_SECRET`.


## Stufe 4: deutsche Phase-A-Beobachtung

Worker-Version `source-monitor-4.1.0-phase-a-shadow` zeichnet nach jedem Crawl optional eine Shadow-Beobachtung auf. Die RPC akzeptiert ausschließlich Service-Role-Aufrufe, gebundene deutsche Pilotquellen und die sichere Konfiguration `dry_run=true`, `automation_enabled=false`, `observation_enabled=true`. Ist Beobachtung global gestoppt oder stammt der Crawl nicht von einem Pilotprofil, wird ohne Nebeneffekt übersprungen. Öffentliche Eventdaten werden durch diese Integration nicht geschrieben.

Pilotbetrieb, Stop/Resume, Review, Reliability, Monitoring, Golden Dataset und Readiness sind in [STAGE_FOUR_GERMANY_OBSERVATION.md](STAGE_FOUR_GERMANY_OBSERVATION.md) beschrieben. Der bestehende Produktions-Cron wird durch die Migration weder geändert noch für Phase A aktiviert.

## Edition Lifecycle

Stufe 3 ist in [EDITION_LIFECYCLE.md](EDITION_LIFECYCLE.md) dokumentiert. Der Monitor extrahiert Jahrgangs- und Ergebnis-Signale und erstellt zunächst nicht öffentliche Editionsentwürfe. Wiederholt bestätigte, konfliktfreie Signale aus offiziellen HTTPS-Quellen dürfen neue Editionen und Ergebnislinks kontrolliert veröffentlichen. Bestehende öffentliche Eventfelder werden weiterhin nicht automatisch überschrieben.

Für die aktuelle Stabilisierung sind auch diese kontrollierten Publikationspfade
gesperrt: `auto_publish_enabled=false` und
`auto_result_publish_enabled=false`. Die Migration
`20260815000000_data_quality_stabilization.sql` erzwingt beide Werte per
Constraint. Neue Editionen, Ergebnislinks und alle fachlichen Abweichungen bleiben
Review-Fälle; Source Recovery bestätigt ausschließlich technische Erreichbarkeit
und setzt keine Event-Verifikation.
