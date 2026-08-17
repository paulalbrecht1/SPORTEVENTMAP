# Edition Lifecycle – Bestandsanalyse und Minimalplan

Stand: 17. August 2026

## Fachliche Grenze

`events` ist die dauerhafte Identitaet einer Veranstaltung. `event_editions` ist
eine konkrete Austragung. Die naechste Ausbaustufe bleibt bewusst bei
`detect -> validate -> candidate -> review/approval -> edition`. Weder ein Crawl
noch ein technisch wieder erreichbarer Source darf eine Edition publizieren oder
eine historische Edition mit dem inzwischen sichtbaren Folgedatum ueberschreiben.

## Bestandsaufnahme

### Event-Identitaet und Editionen

- `events.canonical_key` und `events.slug` bilden die dauerhafte Serie ab.
- `event_editions.event_id` ist obligatorisch; `(event_id, edition_year)` und der
  Editions-Slug sind eindeutig.
- Die oeffentliche Discovery liest die naechste aktive, veroeffentlichte Edition;
  das Archiv behaelt alle veroeffentlichten Editionen.
- `season_planner_events.edition_id` kann eine konkrete Edition referenzieren.
- Die Legacy-Synchronisation und mehrere Admin-/Importpfade schreiben weiterhin
  Datum, Registrierung und Distanz ueber `events`. Diese Kompatibilitaetsschicht
  darf erst nach einer getrennten Abhaengigkeitsmigration entfernt werden.

### Editionsabhaengige Legacy-Daten

Noch auf Event-Ebene oder in eventbezogenen Detailtabellen liegen insbesondere:

- `events.date`, `registration_status`, `event_url`/`source_url`, `distance` und
  Teile der Status-/Prueffelder;
- Registrierungstermine, Gebuehren und -status in `event_registration`;
- angebotene Distanzen, Strecken, Cutoffs sowie Start-/Zielangaben in den
  Knowledge-Base-Tabellen;
- Ergebnis-/Statistikdaten mit Event- bzw. Detail-Slug statt Edition-FK.

Discovery, statischer Export, Detailseitengenerator, Admin-Oberflaeche und
Importwerkzeuge verwenden Teile dieser Felder noch. In dieser Stufe werden sie
weder verschoben noch zurueckgefellt.

### Lifecycle und Nachfolgeerkennung

- `edition_status` kennt bereits `scheduled`, `completed`, `cancelled`,
  `postponed`, `date_unconfirmed` und `inactive`. Fachlich entspricht `scheduled`
  dem gewuenschten `upcoming`; ein weiterer redundanter DB-Status ist unnoetig.
- Der taegliche Lifecycle-Job archiviert abgelaufene Editionen als `detail_only`
  und plant Quellen fuer eine Nachfolgepruefung ein.
- Bisher wird auch `postponed` nach dem alten Datum automatisch `completed`.
- Ein privater, automatisch erzeugter Draft wird bisher als bekannte Folgeedition
  behandelt und beendet die gezielte Beobachtung zu frueh.
- Es gibt keinen driftfreien Eventzustand fuer "next edition unknown / watching".

### Quellen, Freshness und Evidence

- `event_sources`, Crawl-Jobs/-Resultate, Leases, Retry/Dead-Letter und Cron sind
  vorhanden. Ein Source kann eventweit oder an eine Edition gebunden sein.
- Freshness bewertet veroeffentlichte aktuelle Editionen. Technische Erreichbarkeit
  und Content-Verifikation sind getrennt.
- Source Recovery setzt nach der Stabilisierung nur `needs_review`; ein HTTP-Erfolg
  stellt keine fachliche Verifikation her.
- Content-Verifikation verlangt aktuelle strukturierte Evidence, explizite
  Bestaetigung zentraler Felder und exakte Uebereinstimmung mit dem Datenbestand.
- Feldsperren und manuelle Overrides liegen in `event_field_controls`.

### Review, Policies und Publication-Sperren

- `admin_review_inbox` priorisiert deterministisch P0 bis P3. Neue Editionen und
  andere High-Risk-Aenderungen sind P0/review-only.
- Stage 4 laeuft standardmaessig deaktiviert und im Dry-Run; High-Risk-Faelle sind
  dort ebenfalls nicht automatisch anwendbar.
- `edition_lifecycle_settings.auto_publish_enabled` und
  `auto_result_publish_enabled` sind nicht nur `false`, sondern durch einen
  Check-Constraint gegen versehentliches Einschalten gesperrt.

## Gefundene Integritaets- und Prozessluecken

1. `register_edition_successor_candidate` erzeugt ab einem Score sofort einen
   versteckten Editions-Draft. Das ist zu frueh fuer den geforderten Candidate-
   First-Prozess.
2. Der Draft kopiert `race_formats` und `legacy_distance` der Vorgaengeredition.
   Diese Daten koennen sich je Austragung aendern.
3. Der Worker waehlt die neueste Edition einschliesslich generierter Drafts. Nach
   der ersten Erkennung kann er denselben Candidate daher nicht mehr bestaetigen
   und abweichende Folgedaten nicht verlaesslich als Konflikt registrieren.
4. Candidate-Pruefungen binden Crawl-Resultat, Quelle und Event noch nicht hart
   zusammen und beruecksichtigen Source-Gesundheit, Feldsperren sowie
   Absage-/Verschiebungssignale nicht vollstaendig.
5. Die allgemeine Extraktionspipeline und die Succession-Engine koennen fuer
   dasselbe Folgedatum parallele Review-Objekte erzeugen.
6. Legacy-Sync kann eine bestehende Edition desselben Jahres aktualisieren. Er
   bleibt ein kontrolliert abzubauendes historisches Mutationsrisiko.

## Kleinste additive Erweiterung

### Datenmodell

`edition_succession_candidates` erhaelt nur drei operative Felder:

- `validation_status`: `pending`, `validated`, `blocked` oder `conflict`;
- `validation_reasons text[]`: maschinenlesbare Gate-Ergebnisse;
- `validated_at`: Zeitpunkt der letzten deterministischen Pruefung.

Eine neue `event_edition_lifecycle_state`-View leitet pro Event ohne gespeicherten
Drift ab:

- `upcoming` bei einer veroeffentlichten zukuenftigen `scheduled`-Edition;
- `candidate_under_review` bei einem offenen Folgekandidaten;
- `next_edition_unknown_watching` nach einer abgeschlossenen Edition ohne
  veroeffentlichte Folgeedition;
- `no_edition` fuer noch nicht etablierte Serien.

### Candidate-Gates

Die Registrierung speichert immer zuerst nur einen Candidate. `validated` ist er
nur, wenn mindestens gilt:

- Crawl-Resultat gehoert zur Source und zum Event, ist erfolgreich verarbeitet
  und hat einen 2xx-Status;
- Source ist aktiv, technisch gesund, HTTPS und offiziell beziehungsweise
  ausreichend priorisiert;
- Datum liegt in der Zukunft, nach der letzten etablierten Edition, Jahr und Datum
  passen zusammen und liegen im begrenzten Horizont;
- keine Edition desselben Jahres, kein abweichender offener Candidate und keine
  identische bestehende Edition;
- keine aktive manuelle Sperre fuer Editionsjahr/Startdatum;
- keine offene kritische Validation-Issue;
- keine Cancellation-/Postponement-Evidence und keine widerspruechlichen
  Alternativdaten.

Fehlende Zuverlaessigkeit wird als `blocked`, echte Datumswidersprueche als
`conflict` gespeichert. Beides bleibt sichtbar und wird nie automatisch
materialisiert.

### Freigabe

Erst `approve_edition_succession_candidates` darf als Admin in derselben
Transaktion eine Edition anlegen und den Candidate abschliessen. Es werden nur
belegte Candidate-Daten uebernommen. Distanz, Race Formats, Preise, Cutoffs oder
andere Daten der Vorgaengeredition werden nicht kopiert. War die Evidence-Quelle
an die Vorgaengeredition gebunden, wird dieselbe URL als neue, technisch noch
ungepruefte Source-Registry-Zuordnung fuer die neue Edition eingetragen und
sofort neu eingeplant. Die neue Edition beginnt als veroeffentlichte, aber
fachlich weiter pruefpflichtige `scheduled`-Edition; die Adminfreigabe ist die
Publication-Entscheidung. Eine spaetere Automatisierung kann exakt denselben
Materialisierungspfad hinter strengeren Gates aufrufen, ist in dieser Stufe aber
gesperrt.

## Harte Invarianten

- Jede Edition besitzt genau ein `event_id`.
- Pro Event existiert hoechstens eine Edition je Editionsjahr; Candidate-
  Fingerprints verhindern identische Folgekandidaten.
- `season_planner_events.edition_id` verwendet `ON DELETE RESTRICT`; eine
  referenzierte Edition kann nicht unter einem User-Finish entfernt werden.
- Discovery und Candidate-Freigabe aktualisieren keine Vorgaengeredition.
- Ein neuer Candidate wird immer der bestehenden Event-Identitaet der Source
  zugeordnet; er kann nicht als unverbundener neuer Event publiziert werden.
- Versteckte Drafts gelten nicht als etablierte Folgeedition und stoppen das
  Watching nicht.
- `cancelled` und `postponed` werden nicht zeitgesteuert in `completed`
  umgewandelt.
- Widerspruch, Lock oder High-Risk-Evidence blockieren Materialisierung.
- Auto-Publication bleibt durch den bestehenden Datenbank-Constraint deaktiviert.

## Migration und Backfill

1. additive Candidate-Spalten, Constraints, Index und Lifecycle-State-View;
2. Candidate-Registrierung und Adminfreigabe ersetzen;
3. Lifecycle-Job auf regulaere `scheduled`-Editionen und veroeffentlichte
   Nachfolger begrenzen;
4. Worker auf die letzte etablierte Edition umstellen und mehrere abweichende
   Folgedaten als Evidence registrieren;
5. Unit-, SQL-Integrations-, Reset- und Gesamttests;
6. erst danach ein eigener, idempotenter Backfill-Plan fuer bestehende Candidates,
   alte Drafts, Legacy-Felder und editionlose Detaildaten.

Diese Stufe fuehrt keinen Backfill und keine produktive Freigabeautomation aus.
