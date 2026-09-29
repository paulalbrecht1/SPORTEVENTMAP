# Öffentliche Beschreibungen ohne Importnotizen

## Befund

Die Mainz-Seite zeigte nach dem Liveabruf `Official endurance event in Mainz.
Imported from verified staging batch.` als Beschreibung und als Meta-/OG-Text.
Die 994 statischen Seiten des v96-Pakets enthielten diesen Importtext nicht. Er
wurde erst durch die neue Liveanzeige wieder eingefügt. Historische Rohdaten in
CSV/Archiv-JSON und der Datenbank enthalten solche Texte weiterhin.

## Korrektur

Eine gemeinsame Textprojektion entfernt bekannte technische Import- und
Listingnotizen sowie den synthetischen Importplatzhalter. Nützliche
Veranstaltungsbeschreibungen bleiben erhalten; allgemeine Wörter wie „review“
oder „batch“ sind kein pauschaler Löschgrund. Eine leere Beschreibung erzeugt
keinen leeren Detailabschnitt. Liveabruf, Archiv-Fallback, Metadaten,
maschinenlesbare Seiteninformationen und Admin-Anzeigekontrolle verwenden
denselben bereinigten Text. Bei fehlendem Texthelfer wird kein Rohtext angezeigt.

Die beiden verursachenden Importer schreiben Prozess- und Quellenhinweise nur
noch in `source_note`/`source_url`. Fehlende Beschreibungen bleiben unbekannt;
es werden keine Beschreibungen erfunden. Bestehende Auditinformationen bleiben
erhalten.

## Umfang

Oberflächenrelease v97, ohne Datenbankmigration oder produktive Datenänderungen.
Die statischen Katalogdateien, öffentliche API-Rohwerte, IDs, Feldverifikationen,
Freshness und Sitemap bleiben unverändert. Dieser Fix entfernt Importnotizen aus
der Nutzeranzeige; er behauptet keine rückwirkende Bereinigung sämtlicher
historischer Rohdaten-Downloads. Interne Felder werden nicht als Beschreibung
gerendert. Der spätere reguläre Katalogrelease behält seine bestehenden Gates.

## Nachweise

- 22 Detail-Browsertests bestanden, darunter beide Seitenvarianten, DE/EN,
  unverfälschte echte Texte, reine Importtexte, Metadaten und ausgefallener
  Liveabruf/Texthelfer.
- 8 Textprojektions-, 15 Maintenance- und 8 Knowledge-Modultests bestanden.
  Ein alter iframe-Prüfmarker mit Roh-Importtext wird ausdrücklich abgelehnt;
  die anonyme API-Prüfung funktioniert weiterhin mit kanonischen Rohwerten.
- 4 Importertests bestanden, einschließlich echter lokaler CSV-Promotion und
  simulierter offizieller URL-Auflösung ohne Netz- oder Produktionsschreibzugriff.
- 28 UI-Pakettests, 31 Routenprüfungen sowie Release-Einstiegspunkte,
  vollständige Paketintegrität und bestehender Datenworkflow bestanden.
- Lesende Projektion des v96-Archivs: 994 Editionen, 721 Beschreibungen mit den
  bekannten Import-/Listinghinweisen, danach kein solcher Hinweis übrig.

- 23 Admin-/Knowledge-Browsertests bestanden. Die Rohwerte im Formular bleiben
  editierbar; Speichern und öffentliche Erfolgskontrolle bleiben getrennt.

Releasebelege liegen lokal unter `exports/public-description-audit-20260929/`.

## Ausgerollt und öffentlich nachgeprüft

- Release: `20260929-ui-only-v97`, Quellcommit
  `af0b8f2dc2554370cc4bc24bc56817c18c374247`, Buildzeit
  `2026-09-29T20:10:23.536Z`.
- Vorschau: <https://82d60378.sporteventmap.pages.dev>.
- Unveränderlicher produktiver Deploy: <https://eddf8212.sporteventmap.pages.dev>.
- Release-SHA-256:
  `2f98e8846b5fca02c3c1856e576a5ed7085b0dea4209c2462dfcd450da3c2ae2`.
- Je 58 Dateien gegen Vorschau, produktiven Deploy und Hauptdomain geprüft:
  alle 46 Nicht-HTML-Dateien, 8 kritische HTML-Einstiegsseiten und 4 statische
  Eventseiten. Cloudflare-Änderungen auf der Hauptdomain sind ausschließlich die
  bereits streng definierten Middleware-Einfügungen. Nicht alle 994 Seiten
  einzeln über das Netz abgerufen; ihr gesamtes Paketinventar ist geprüft.
- Reale Browsersteuerung nach dem Rollout, ohne Daten-Schreibvorgang:
  <https://sporteventmap.com/event/gutenberg-halbmarathon-mainz-2027/> nach normalem
  Neuladen der vorherigen v96-Sitzung und
  <https://sporteventmap.com/event-detail?event=gutenberg-halbmarathon-mainz-2027>.
  Beide: öffentliche Liveanzeige bestätigt, keine Import-/Listingnotiz im
  sichtbaren Text, keine solche Meta-/JSON-LD-Beschreibung, leerer
  Beschreibungsabschnitt ausgeblendet, genau ein Karten-Pin, keine sichtbaren
  Rohkoordinaten. DE/EN und gemischte echte Beschreibungstexte zusätzlich lokal
  mit kontrollierten Browserfixtures geprüft.
- `mainz-production-browser.json` und `mainz-public-v97.png` dokumentieren die
  öffentliche Nachprüfung. Datenexportdatum bleibt `2026-08-27T07:41:01.290Z`;
  keine zusätzliche Freshness, Migration oder produktive Eventdatenänderung.
