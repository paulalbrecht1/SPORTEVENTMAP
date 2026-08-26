# Release v83 – Abnahme von Schritt 1

Stand: 26. August 2026
Ausgangsrevision: `fcbeb85` (`Update sitemap for detail layout release`)

## Ziel und Abgrenzung

Schritt 1 sichert den aktuellen v83-Stand der öffentlichen Eventsuche und der
Eventdetailseiten ab. Er umfasst den aktuellen Produktionsdaten-Export, die
Neugenerierung aller öffentlichen Detailseiten, die visuelle Abnahme sowie die
vollständige lokale Release-Prüfung.

Nicht Bestandteil dieses Schritts sind ein Push, ein Preview- oder
Produktions-Deployment, Datenbankmigrationen und die Aktivierung von Stage 4.

## Datenstand

Der öffentliche Katalog wurde am `2026-08-26T09:52:03.338Z` aus dem aktuellen
Produktionsbestand exportiert.

| Kennzahl | Ergebnis |
| --- | ---: |
| Aktive Discovery-Editionen | 433 |
| Archivierte/öffentliche Editionen | 994 |
| Frische Datensätze | 262 (60,51 %) |
| Vollständige Datensätze | 205 (47,34 %) |
| Datensätze mit Review-Bedarf | 171 |
| Discovery-Prüfsumme | `7d7f5edf70ded6828f72f38215e91b7ebe28f3e9bfdc83c2d03395e4c15025f4` |
| Archiv-Prüfsumme | `55fdf9e40ba1ab2aeeee4a8502886ca77106d1a22a4ff11716d49157775530c0` |

Erwartete Lifecycle-Änderungen gegenüber dem vorherigen Export:

- `B2Run Hamburg` vom 25. August 2026 ist nach Ablauf nicht mehr in der
  Discovery-Auswahl, bleibt aber über das Edition-Archiv erhalten.
- 18 am 23. August 2026 beendete Editionen erhalten nun den öffentlichen
  Archivhinweis.
- `Hermannslauf Bielefeld 2027` bleibt sichtbar; die aktuell nicht erreichbare
  Quelle wird transparent im Quellenbereich ausgewiesen.

Der Release-Gate akzeptiert die Bestandsänderung: alle Mindestmengen,
Prüfsummen, Frische- und Vollständigkeitsgrenzen werden eingehalten.

## Während der Abnahme korrigierte Befunde

1. **Anmeldestatus und Quellenprüfung getrennt**
   Der Generator hat bisher ersatzweise den Verifikationsstatus einer Edition
   als Anmeldestatus angezeigt. Dadurch konnten Angaben wie `Verified` oder
   `Source Unreachable` fälschlich im Anmeldebereich erscheinen. Der
   Anmeldestatus wird jetzt ausschließlich aus `registration_status` abgeleitet.
   Ein unbekannter Status wird neutral als unbekannt beziehungsweise bei
   zukünftigen Events als noch nicht offiziell bestätigt dargestellt. Der
   Quellenstatus bleibt im Quellenbereich sichtbar.

2. **Lange Eventtitel auf sehr kleinen Smartphones lesbar**
   Für Viewports unter 360 px wurde die mobile Titelstufe angepasst. Lange
   deutsche Titel brechen damit nicht mehr in eine isolierte
   Einzelbuchstaben-Zeile um.

Beide Befunde sind durch gezielte Unit-/Markup- und Browser-Regressionstests
abgedeckt.

## Visuelle Abnahme

Die folgenden repräsentativen Fälle wurden als vollständige Seiten geprüft:

| Fall | Viewport/Theme | Ergebnis |
| --- | --- | --- |
| Inhaltsreiche Marathon-Detailseite (Berlin) | Smartphone, hell | bestanden |
| Zukünftige Edition ohne bestätigte Anmeldung (Hannover) | Smartphone, dunkel | bestanden |
| Abgelaufene Edition mit langem deutschen Titel | 320 px, hell | bestanden |
| Zukünftige Edition mit nicht erreichbarer Quelle (Hermannslauf) | Desktop, dunkel | bestanden |

Geprüft wurden insbesondere Hierarchie, Lesbarkeit, horizontales Overflow,
Statussemantik, CTAs, Archivhinweis und Quellenbereich.

## Automatisierte Abnahme

Ausgeführt wurden:

```text
npm.cmd ci
npm.cmd run data:refresh-public
npm.cmd run test:event-detail-foundation
npx.cmd playwright test event-detail-readability.spec.mjs --project=chromium
npm.cmd run test:all
```

Ergebnis:

- vollständiger Daten-, Sicherheits-, Lifecycle- und Layout-Test: bestanden
- Responsive-Layout-Audit: 0 Warnungen
- vollständige Browser-Matrix: 61/61 bestanden
- isolierter Performance-Kontrolllauf: 3/3 bestanden
- finaler Scroll-p95 im Gesamtlauf: 50,1 ms bei einem Budget von unter 90 ms

Ein erster Gesamtlauf enthielt einen einzelnen, nicht reproduzierbaren
Scheduling-Ausreißer im zeitabhängigen Scroll-Test (116,7 ms). Der Test bestand
anschließend dreimal isoliert und im erneut vollständig ausgeführten Gesamtlauf.
Grenzwert und Produktcode wurden dafür nicht aufgeweicht.

## Release-Paket und Freigabegrenze

Das Paket wurde erst nach dem lokalen Abschluss-Commit aus einem sauberen
Working Tree erzeugt; diese Schutzprüfung ist Teil des Release-Prozesses.

```text
npm.cmd run prepare-package
npm.cmd run verify-package
```

Beide Prüfungen sind bestanden. Das verifizierte Paket trägt die Release-Version
`20260826-detail-layout-v83` und enthält eine Sitemap mit 1.000 URLs.

Eine Veröffentlichung bleibt eine separate, ausdrücklich freizugebende Aktion.
