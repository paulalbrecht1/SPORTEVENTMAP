# Datenmodell der Event-Detailseiten

Stand: 24. August 2026

## Zielbild

Eine statische Detailseite beschreibt immer eine konkrete Ausgabe eines
wiederkehrenden Events. Sie kombiniert dabei drei logisch getrennte Ebenen:

1. `events`: dauerhaftes Event-Brand-Wissen,
2. `event_editions`: Fakten zu genau einer Ausgabe,
3. Verifikations- und Quellenfelder: Nachweis, wann ein Mensch oder ein
   fachlicher Review-Prozess Fakten gegen eine echte öffentliche Quelle geprüft
   hat.

`event_sources.last_fetched_at`, `updated_at`, Exportzeit und Buildzeit sind
keine fachlichen Verifikationszeitpunkte und dürfen deshalb nie als
`Zuletzt geprüft` erscheinen.

## Datenfluss zur statischen Detailseite

| Dargestelltes Feld | Primäre Datenquelle | Transformation / Export | Generator / Darstellung |
| --- | --- | --- | --- |
| Eventname | `events.canonical_name` | `public_event_discovery` oder `public_event_archive` → `events.csv` / `event-editions-public.json` | `buildRaceGuideHero` |
| Datum / Editionsjahr | `event_editions.start_date`, `edition_year` | View formatiert Datum; Export behält IDs und Jahr | Ausgabe-Block in `buildRaceGuideKeyFacts` |
| Ort / Land / Adresse / Geodaten | aktuell `events.city`, `country`, `address`, `latitude`, `longitude` | öffentliche Views → Exportartefakte | Key Facts und Karte; ein künftig abweichender Editions-Startort gehört in Editionswissen |
| Race Formats / Distanzen | `event_editions.race_formats`, Legacy-Fallback `legacy_distance` | Views exportieren `race_formats` und die bestehende `distance`-Kurzform | Ausgabe-Block und `event-category-details.*`; kein automatisches Vorjahres-Fallback |
| Veranstalter | `events.organizer_name`, optional `events.organizer_url` | öffentliche Views → explizite CSV-/JSON-Felder | Veranstaltungs-Block; fehlender Wert wird ausgeblendet |
| Offizielle Event-Website | `events.official_url` | öffentliche Views → `official_url` | Veranstaltungs-Block und Hero-CTA |
| Anmelde-URL | `event_editions.registration_url` | öffentliche Views → `registration_url` | Anmelde-Block; nicht aus einer früheren Ausgabe ableiten |
| Anmeldestatus | `event_editions.registration_status` | öffentliche Views → separates `registration_status` | Hero, Key Facts und Anmeldung; nicht mit Verifikationsstatus vermischen |
| Beschreibung | `events.description` | öffentliche Views → Exportartefakte | Hero-/SEO-Text; Rich-Editorial kann ergänzen |
| Zuletzt geprüft | `event_editions.last_verified_at` | als `edition_last_verified_at`; `last_checked` bleibt nur kompatibler Alias desselben Werts | Key Facts und Quellen; lokalisierte Langform, z. B. `18. August 2026` |
| Brand-Verifikation | `events.last_verified_at`, `events.verification_status` | `brand_last_verified_at`, `brand_verification_status` | nur getrennt in der Quellen-/Verifikationsdarstellung, wenn relevant |
| Quellenmonitoring | `event_sources` | kein Produktfakt-Export; `last_fetched_at` bleibt operativ | nie als Event- oder Editionsprüfung anzeigen |
| Feldzitate der Knowledge Base | `event_detail_sources` (`field_path`, `last_verified`) | `event-detail-database.json` | Quellenliste; der Zeitstempel belegt nur die zugeordnete Quelle bzw. Felder |
| Rich-/Wiki-Felder | `event_details` mit Kindtabellen | `export-event-detail-database.js` → `event-detail-database.json` | Registration, Course, Race Day, Travel, Weather, Statistics, Editorial und FAQ |
| Kategorien / Gebühren / Cutoffs | `event-category-details.json` bzw. CSV-Fallback | direkt geladen | Ausgabe-spezifische Tabellen und Karten |
| Editionsergebnisse | `edition_results` | `public_event_archive` → `event-editions-public.json` | Editionsarchiv |
| Slug / URL | `event_editions.edition_slug`; Generator-Fallback aus Name + Jahr | Export behält `edition_slug` | `createSlug`, Canonical URL und `event-pages.json` |

Der Generator lädt keine zweite Organizer- oder Verifikationsquelle. Der
bestehende `basis.organizer`-Wert der zehn alten Rich-Detail-Piloten ist nur ein
explizit markierter Kompatibilitätsfallback. Neue Exporte entfernen diese
Organizer-Kopie; nach dem kleinen Content-Pilot kann der Fallback entfallen.

## Brand-, Editions- und Verifikationsregeln

### Event-Brand (`events`)

Wiederverwendbar, solange weiterhin plausibel und bei Änderungen erneut zu
prüfen:

- offizieller Brandname und Series,
- verantwortlicher Veranstalter und Veranstalter-Website,
- allgemeine offizielle Event-Website,
- allgemeine Beschreibung, Geschichte, Charakter und Atmosphäre,
- grundsätzlich dauerhafter Ort,
- typische, ausdrücklich nicht editionsgebundene Streckenmerkmale,
- allgemeine Anreise- und Wiki-Grundinformationen.

`organizer_name` meint ausschließlich die Organisation, die das Event offiziell
verantwortet. Datenlieferanten, Kalender, Website-Betreiber ohne
Veranstalterrolle und Kontaktpersonen sind keine Organizer.

### Edition (`event_editions`)

Für jede neue Ausgabe erneut zu belegen:

- Datum, Jahr, Ausgabe-Status und konkreter Startort,
- aktuelle Distanzen und Race Formats,
- Anmeldestatus und konkrete Anmelde-URL,
- Startzeiten, Startwellen, Cutoffs und Teilnehmergrenzen,
- Preise, Absage, Verschiebung und Streckenänderungen,
- Ergebnislinks und konkrete Teilnehmerinformationen.

Fehlende zukünftige Editionswerte werden als `Noch nicht offiziell bestätigt`
dargestellt. `Unbekannt` ist nur für einen tatsächlich unbekannten Sachverhalt
gedacht; `nicht vorhanden` muss fachlich ausdrücklich erfasst werden und wird
nicht aus einem leeren Feld abgeleitet.

### Verifikation

- `events.last_verified_at`: letzte Quellenprüfung der stabilen Brand-Fakten.
- `event_editions.last_verified_at`: letzte Quellenprüfung der konkreten
  Ausgabe; dies ist der bevorzugte Detailseitenwert für `Zuletzt geprüft`.
- `event_detail_sources.last_verified` mit `field_path`: Prüfung der
  zugeordneten Wiki-Felder.
- `event_sources.last_fetched_at`: technischer Abruf, keine fachliche Prüfung.

Eine erfolgreiche Source-Abfrage bestätigt nicht automatisch alle Felder.
Edition- und Brand-Zeitpunkte dürfen nur gesetzt werden, wenn der jeweilige
Review diese Ebene tatsächlich geprüft hat.

## Neue Ausgabe anlegen

Beim Übergang von 2026 zu 2027 wird dieselbe `events`-Zeile verwendet und eine
neue `event_editions`-Zeile angelegt. Der neue Datensatz startet ohne geerbtes
Datum, Registration URL, Registration Status, Race Formats, Startzeiten,
Cutoffs oder Resultate. Erst eine echte Editionsquelle darf diese Werte und
`event_editions.last_verified_at` setzen.

Brand-Wissen wird nicht kopiert: Die neue Ausgabe liest Organizer,
Brand-Website, Beschreibung und allgemeines Wiki-Wissen direkt über dieselbe
Brand-ID. Damit bleiben spätere Korrekturen konsistent über alle Ausgaben.

## Wiki-/Knowledge-Zuordnung

Neue `event_details`-Datensätze erhalten `knowledge_scope`:

- `brand`: wiederverwendbare Geschichte, allgemeiner Streckencharakter,
  Atmosphäre, Anreise-Grundlagen und dauerhafte Besonderheiten; Verknüpfung über
  `event_brand_id`, ohne `edition_id`.
- `edition`: Cutoffs, Expo-Zeiten, Startwellen, konkrete Streckenänderungen und
  andere jahresbezogene Inhalte; Verknüpfung über `event_brand_id` und
  `edition_id`.
- `legacy_mixed`: ausschließlich bestehende, noch nicht fachlich getrennte
  Altzeilen. Neue Inhalte dürfen diesen Scope nicht verwenden.

Die bisherigen Gruppen werden wie folgt behandelt:

| Gruppe | Standardscope | Hinweis |
| --- | --- | --- |
| Editorial, Weather, allgemeine Travel-Hinweise | Brand | nur dauerhafte Aussagen |
| Registration, Race Day | Edition | niemals in eine Folgeausgabe übernehmen |
| Course | Brand oder Edition | allgemeiner Charakter auf Brand; Distanz, Start/Ziel und Änderungen auf Edition |
| Statistics | Brand oder Edition | Geschichte/Serienrekorde auf Brand; konkrete Ergebnisse/Teilnehmerzahlen auf Edition |
| FAQ | wie beantwortetes Feld | `field_path`/Quelle muss den Scope nachvollziehbar machen |

## Technischer und redaktioneller Pilot

Die Darstellung wurde zunächst an den zehn vorhandenen Rich-Detail-Datensätzen
technisch verifiziert:

1. BMW Berlin Marathon 2026
2. Mainova Frankfurt Marathon 2026
3. Generali Köln Marathon 2026
4. Haspa Marathon Hamburg 2027
5. Marathon München by Brooks 2026
6. ADAC Marathon Hannover 2027
7. Uniper Düsseldorf Marathon 2027
8. IRONMAN Hamburg European Championship 2026
9. IRONMAN Frankfurt 2026
10. DATEV Challenge Roth 2027

Sechs dieser Datensätze sind seit dem 24. August 2026 redaktionell anhand
offizieller Quellen in je einen Brand- und Editionsdatensatz mit echten
`event_brand_id`-/`edition_id`-Verknüpfungen getrennt: Berlin, Frankfurt, Köln,
Hamburg, Hannover und Challenge Roth. Auswahl, Quellenbefunde und
Feldempfehlungen stehen in `docs/EVENT_DETAIL_CONTENT_PILOT.md`.

Die vier übrigen Datensätze München, Düsseldorf, IRONMAN Hamburg und IRONMAN
Frankfurt bleiben vorerst `legacy_mixed`. Eine Massenmigration ist ausdrücklich
nicht Teil dieses Piloten.
