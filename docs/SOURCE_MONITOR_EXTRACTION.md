# Source Monitor – Extraktion und Änderungsvorschläge (Stufe 3)

## Sicherheitsgrenze

Stufe 3 analysiert ausschließlich erfolgreich abgerufene, neue oder semantisch veränderte Quellen im serverseitigen Worker. Die Pipeline schreibt keine extrahierten Fakten direkt in `events` oder `event_editions`. Sie speichert pro Feld einen Vorschlag in `event_change_proposals`. Erst `review_event_change_proposal()` darf nach einer Admin-Entscheidung öffentliche Daten transaktional ändern.

Absagen und Verschiebungen sind immer `critical`. Auch ein sehr hoher Confidence Score führt nie zu einer automatischen Veröffentlichung. Feldsperren und manuelle Overrides werden beim Vergleich berücksichtigt; ein abweichender Vorschlag bleibt sichtbar und erhält die Warnung `field_locked_or_manual_override`.

## Extraktionsreihenfolge

Die Pipeline unter `supabase/functions/_shared/extractors/` arbeitet deterministisch in dieser Reihenfolge:

1. `json-ld-extractor.mjs`: Schema.org `SportsEvent`/`Event` sowie eingebettete `Place`, `PostalAddress`, `Offer`, `Organization` und Geokoordinaten.
2. `metadata-extractor.mjs`: Event-, OpenGraph- und Item-Metadaten.
3. `platform-adapters.mjs`: versionierte Adapter für häufige Domains.
4. `known-selectors-extractor.mjs`: wiederkehrende `itemprop`- und `data-*`-Felder.
5. `generic-html-extractor.mjs`: sichtbarer Text, explizite Feldkontexte und Links.
6. KI-Extraktion: derzeit nicht implementiert und damit vollständig deaktiviert.

Jeder Kandidat enthält Feld, Rohwert, normalisierten Wert, Methode, Methodenversion, Kontext, Basis-Confidence, Gründe und Warnungen. Fehlerhaftes JSON-LD wird als Diagnose protokolliert und blockiert die nachfolgenden Ebenen nicht.

## Unterstützte Felder

Höchste Priorität:

- `start_date`, `end_date`, `edition_status`
- `registration_status`, `registration_url`
- `city`, `region`, `country`, `address`, `latitude`, `longitude`
- `edition_year` als `new_edition`

Mittlere Priorität:

- `start_time`, `race_formats`
- `price_min`, `price_max`, `currency`, `participant_limit`
- `organizer_name`, `image`, `description`, `sport`, `canonical_name`

Nicht eindeutige Venue-Texte werden extrahiert, aber ohne sichere Zuordnung zu einer bestehenden Spalte nicht als anwendbarer Vorschlag gespeichert.

## Datumslogik und Status

`date-extractor.mjs` unterstützt ISO-Daten und ISO-DateTime, deutsche und englische numerische sowie ausgeschriebene Formate, fehlende Jahre bei eindeutigem Seitenjahr und eintägige Monatsbereiche wie `6–7 May 2027`. Intern werden Daten als `YYYY-MM-DD` und Zeiten als `HH:MM:SS` gespeichert.

Kontexte mit Meldeschluss, Anmeldestart, Abholung, Ergebnis, Veröffentlichung, Trainingscamp, News oder Copyright werden verworfen. Allgemeine sichtbare Daten ohne expliziten Eventkontext erhalten einen Abschlag und `date_context_not_explicit`. Bei mehreren JSON-LD-Events wird nur ein ausreichend ähnlicher Eventname gewählt; ohne sichere Zuordnung wird die strukturierte Ebene verworfen.

Deutsch und Englisch werden für geplant, Anmeldung offen/geschlossen, ausverkauft, verschoben, abgesagt, beendet und unbestätigter Termin unterstützt. Absage und Verschiebung erzeugen stets kritische Vorschläge, nie automatische Veröffentlichungen.

## Normalisierung

`normalization.mjs` zentralisiert:

- Länder auf ISO-3166-1-Alpha-2, beispielsweise `Germany` → `DE`.
- Währungen auf ISO-Codes, beispielsweise `€` → `EUR`.
- Sportarten auf `running`, `trail_running`, `ultra_running`, `triathlon`.
- Registrierungsstatus auf `registration_not_open`, `registration_open`, `sold_out`, `cancelled`, `unknown`.
- Editionstatus auf `scheduled`, `postponed`, `cancelled`, `completed`, `date_unconfirmed`.
- Distanzen auf Kilometer beziehungsweise standardisierte Typen für Marathon, Halbmarathon, Ultramarathon sowie Sprint-, olympische, Mittel- und Langdistanz im Triathlon. Der Originaltext bleibt erhalten.
- URLs ohne Fragment und Trackingparameter.

Vergleiche sind formatrobust: Namen und Orte werden Unicode-/Whitespace-normalisiert, Preise und Koordinaten numerisch verglichen, URLs ignorieren Trackingparameter und einen rein abschließenden Slash.

## Confidence-Modell

Der Score liegt zwischen 0 und 1 und ist reproduzierbar. Ausgangspunkt ist die Basiszuverlässigkeit der Methode. Danach werden nachvollziehbare Faktoren addiert oder abgezogen:

- offizielle Eventwebsite `+0,08`
- offizielle Registrierungsplattform `+0,05`
- gleiche Bestätigung durch mehrere Extraktoren `+0,06`
- guter Eventnamensabgleich `+0,05`
- Drittanbieterquelle `−0,12`
- widersprüchliche Werte je Konflikt `−0,07` bis maximal `−0,20`
- mehrere Events auf einer Seite `−0,08`
- schwacher Namensabgleich `−0,15`
- unklares Datum `−0,12`

`confidence_reasons` speichert die angewendeten Faktoren. `evidence.alternatives` enthält bis zu vier widersprüchliche Kandidaten. Der Score entscheidet über Sortierung und Priorität, nie über eine automatische Übernahme.

## Quellenpriorität und Adapter

Die fachliche Priorität lautet: Adminbestätigung, offizielle Eventwebsite, offizielle Registrierung, Verband, Veranstalterkalender, Drittanbieter, Nutzerhinweis, generische Extraktion. `event_field_controls.source_priority` bildet diese Reihenfolge mit 1 bis 8 ab.

Die Analyse des aktuellen Fallback-Katalogs ergab 140 URLs für `marathon.de`, 123 für `running.life`, 12 für `ironman.com` und 11 für `triathlondeutschland.de`. Implementiert wurden deshalb:

| Adapter | Version | Domains |
| --- | --- | --- |
| `marathon_de` | `marathon-de-v1` | `marathon.de` |
| `running_life` | `running-life-v1` | `running.life` |
| `ironman` | `ironman-v1` | `ironman.com` |

`triathlondeutschland.de` bleibt zunächst im generischen Fallback, weil die gespeicherten Seiten keine ausreichend einheitliche, adapterwürdige Detailstruktur belegen. Jeder Adapter besitzt Domainerkennung, begrenzte Parser, Versionskennung, Fallback-Verhalten und lokale Fixture.

## Vorschlagsmodell und Duplikate

Migration `20260815_source_monitor_extraction_review.sql` ergänzt `event_change_proposals` um Crawl-ID, Feldwerte, normalisierten und tatsächlich angewendeten Wert, Änderungstyp, Methode/Version, Evidenz, Kontext, Confidence-Gründe, Warnungen, Priorität, Ablehnungsgrund, Zurückstellung und Sperrhinweis.

Ein Fingerprint aus Event, Edition, Feld und normalisiertem Wert verhindert identische Vorschläge. Offene und akzeptierte Vorschläge werden nicht erneut erzeugt. Identisch abgelehnte Vorschläge bleiben 30 Tage unterdrückt; danach darf neue Evidenz denselben Datensatz wieder auf `pending` setzen. Reine Formatunterschiede und bereits vorhandene Editionen werden verworfen.

Eine zukünftige Jahreszahl wird intern weiterhin als `new_edition` erkannt, wenn
sie nach der letzten Edition liegt, in der Zukunft liegt und noch keine Edition
dieses Jahres existiert. Der Worker speichert dafür jedoch kein paralleles
`event_change_proposal`: Die Succession-Engine ist der kanonische Pfad und legt
ausschließlich einen validierten oder blockierten Candidate an. Eine Edition
entsteht ausschließlich durch Adminfreigabe; Detection erzeugt keinen Draft.

## Manuelle Overrides und Feldsperren

`event_field_controls` speichert Event/Edition, Feld, optionalen manuellen Wert, Sperrstatus, Begründung, Ablaufdatum, Quellenpriorität und bestätigenden Admin. Die Tabelle ist per RLS nur für Admins sichtbar und änderbar. Der Worker liest sie mit Service Role. `set_event_field_control()` ist der Admin-RPC für Sperren und Overrides.

## Admin-Review

Die Vorschlagsansicht zeigt Event, Edition, Feld, Alt-/Neuwert, Confidence, Methode, Quelle/Domain, Kontext, Zeitpunkt und Warnungen. Filter stehen für Review-Status, Änderungstyp, Feld, Confidence, Quelle, Domain, Priorität und Alter zur Verfügung; Land und Sportart werden über die übergeordneten Data-Operations-Filter eingegrenzt.

Aktionen: übernehmen, bearbeiten und übernehmen, mit Pflichtgrund ablehnen, sieben Tage zurückstellen, Quelle/Event öffnen, Feld sperren und identische Feld-/Wert-Vorschläge gesammelt übernehmen. Absagen, Verschiebungen, Ortswechsel und neue Editionen erhalten auffällige Prioritätsmarkierungen.

## Übernahmeprozess

`review_event_change_proposal()` sperrt Vorschlag und Zielelement mit `FOR UPDATE`, liest den aktuellen Feldwert neu und vergleicht ihn mit `old_value`. Bei einer Race Condition wird der Vorschlag `superseded`; ein veralteter Wert wird nicht geschrieben. Akzeptierte Änderungen laufen in derselben Transaktion, lösen den bestehenden Audit-Trigger aus, speichern `applied_value`, aktualisieren `last_verified_at`, planen eine neue Prüfung und führen `run_event_validation()` erneut aus.

Bearbeitete Übernahmen erhalten `edited_and_accepted`; ursprünglicher Roh-, Normal- und Vorschlagswert bleiben erhalten. Ablehnungen benötigen einen Grund. Neue Editionen werden erst nach Adminentscheidung publiziert und gegen bestehende Event-/Jahreskombinationen geprüft.

## Tests und Fixtures

`tests/fixtures/source-extraction/` enthält reproduzierbare Seiten für JSON-LD, deutsche/englische Daten, Datumsbereiche und Meldeschlüsse, mehrere Events, Absage, Verschiebung, Sold-out sowie alle drei Adapter. `tests/source-monitor-extraction.test.mjs` prüft zusätzlich Formatgleichheit, neue Editionen, Konflikte, Sperren, Overrides, Pending-/Rejected-Deduplizierung und den SQL-Race-Guard.

Die lokale RLS-Suite baut alle Migrationen neu auf und prüft, dass normale Nutzer weder Operationsdaten lesen noch Vorschläge anwenden können.

## Bekannte Grenzen und Vorbereitung für Stufe 4

- Dynamisch ausschließlich per Client-JavaScript gerenderte Inhalte werden nicht ausgeführt; analysiert wird die sichere HTTP-Antwort.
- Freitext-Ortsbestandteile werden nur vorgeschlagen, wenn das Zielfeld eindeutig ist. Geocoding-/Adressauflösung bleibt Stufe 4 vorbehalten.
- Komplexe mehrmonatige oder sprachlich ungewöhnliche Datumsbereiche benötigen weitere Fixtures.
- Preise mit Gebührenstaffeln werden als Min-/Max-Kandidaten, nicht als vollständiges Tarifmodell behandelt.
- Eine KI-Ebene ist absichtlich nicht aktiv. Für Stufe 4 existiert ein Einschubpunkt nach dem generischen Fallback; vor Aktivierung sind serverseitiges Schema, Budget, Timeout, Rate Limit, reduzierte HTML-Nutzlast, Protokollierung und Feature Flag zwingend.
- Stufe 4 kann Domainmetriken aus bestätigten/abgelehnten Vorschlägen zur Adapterkalibrierung nutzen, ohne den deterministischen Basisscore zu ersetzen.
