# Redaktioneller Event-Detail-Pilot

Stand: 24. August 2026

## Auswahl

Die sechs Piloten wurden wegen ihrer aktuellen offiziellen Quellen, ihrer
vorhandenen Rich-Detaildaten und ihrer unterschiedlichen organisatorischen
Strukturen ausgewählt:

1. BMW BERLIN-MARATHON 2026 – internationaler Major, SCC EVENTS GmbH,
2. Mainova Frankfurt Marathon 2026 – Herbstmarathon, motion events GmbH,
3. Generali Köln Marathon 2026 – Verein plus beauftragte Ausrichter-GmbH,
4. Haspa Marathon Hamburg 2027 – bestätigte Folgeedition mit detaillierten
   Teilnehmerinformationen,
5. ADAC Marathon Hannover 2027 – breites Formatangebot, aber noch ohne finalen
   2027-Renntagplan,
6. DATEV Challenge Roth 2027 – Langdistanz-Triathlon und damit ein anderes
   Sport- und Datenprofil.

Die übrigen vier technischen Rich-Detail-Piloten bleiben unverändert als
`legacy_mixed` bestehen. Eine Massenbereinigung ist nicht Teil dieses Piloten.

## Redaktionelle Auflösung

Jedes ausgewählte Event besitzt in `data/event-detail-database.json` nun zwei
eigenständige Datensätze:

- `knowledge_scope: brand` mit `event_brand_id`, ohne `edition_id`,
- `knowledge_scope: edition` mit derselben `event_brand_id` und der konkreten
  `edition_id`.

Der Generator setzt diese beiden Ebenen erst für die Ausgabe zusammen. Damit
bleiben Organizer, Organizer-URL, offizielle Website, allgemeiner Charakter und
redaktionelle Kurzbeschreibung wiederverwendbar. Datum, Race Formats,
Anmeldestatus, Anmelde-URL, Startzeiten, Cutoffs und Expo-Angaben bleiben an die
konkrete Ausgabe gebunden.

Die Quellenobjekte enthalten `field_path`, `source_type`, `source_url` und den
tatsächlichen Prüfzeitpunkt `last_verified`. Brand- und Editionsprüfung wurden
am 24. August 2026 getrennt durchgeführt. Nicht veröffentlichte 2027-Angaben
werden nicht aus 2026 übernommen.

## Auffällige Quellen- und Datenfragen

- Köln: Die offiziellen Teilnahmebedingungen nennen den Kölner Verein für
  AusdauerSport e.V. als Veranstalter und die Kölner AusdauerSport GmbH als
  beauftragte Ausrichterin und organisatorische Vertragspartnerin. Der
  Brand-Datensatz bildet diese Beziehung ausdrücklich ab.
- Berlin: Die offizielle Registrierungsseite nennt den 6. November 2025 als
  Ende des Losverfahrens, die FAQ den 5. November. Der Editionsdatensatz folgt
  der Registrierungsseite und dokumentiert die Abweichung.
- Hannover 2027: Datum, Formate, Anmeldung und Gebührenstaffeln sind vorhanden;
  finale Startzeiten, Start-/Zielplan und Cutoffs waren noch nicht offiziell
  bestätigt.
- Challenge Roth 2027: Datum, Distanzen und Late Entry Draw sind bestätigt;
  der konkrete 2027-Athletenzeitplan und die Cutoffs waren noch nicht
  veröffentlicht.

## Felderkenntnisse für das lebende Verzeichnis

### Fast immer verfügbar

- offizieller Eventname, Datum und Ort,
- Organizer oder rechtlich verantwortliche Organisation,
- offizielle Event- und Organizer-Website,
- Race Formats und zentrale Anmeldeseite,
- grundlegender Streckencharakter.

### Besonders hilfreich

- formatgenauer Anmeldestatus statt eines globalen Offen/Ausgebucht-Werts,
- Start- und Zielbereich, Startwellen und Cutoff,
- Hinweis, ob die Anmelde-URL auf eine Veranstalterseite oder ein offizielles
  Registrierungsportal führt,
- explizite Organizer-Beziehung bei Verein, Tochtergesellschaft oder Agentur.

### Schwer zuverlässig zu beschaffen

- ein einzelner Anmeldestatus bei mehreren Formaten,
- finale Startzeiten und Expo-Abläufe weit vor dem Renntag,
- belastbare Höhenmeter und Teilnehmerlimits, wenn sie nur in dynamischen
  Karten oder Registrierungsstrecken stehen,
- rechtliche Organizerrolle, wenn Website-Betreiber, Veranstalter und
  Ausrichter voneinander abweichen.

### Gut editionsübergreifend wiederverwendbar

- Organizer, Organizer-URL und allgemeine Event-Website,
- Serienzugehörigkeit und sachliche Eventbeschreibung,
- grundlegender Sport-, Strecken- und Veranstaltungscharakter,
- dauerhafte markante Orte wie Brandenburg Gate, Festhalle, Hamburger Messe
  oder Solarer Berg – solange sie bei einer Brand-Prüfung weiterhin stimmen.

### Jährlich neu zu prüfen

- Datum und Veröffentlichungsstatus,
- angebotene Race Formats und Distanzen,
- Anmeldestatus, Anmelde-URL, Gebühren und Fristen,
- Startzeiten, Startwellen, Cutoffs und Teilnehmerlimits,
- Expo-, Startunterlagen- und Renntaglogistik,
- konkrete Streckenänderungen und Verpflegungsstationen.

## Priorität für den nächsten Schritt

Als nächstes sollte das Redaktionswerkzeug genau diese zwei Scopes und
feldbezogene Quellen sichtbar editierbar machen. Besonders wichtig ist ein
formatbezogener Anmeldestatus, weil ein Event gleichzeitig offene und
ausgebuchte Wettbewerbe haben kann.
