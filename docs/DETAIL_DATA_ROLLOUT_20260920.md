# Detaildaten und Editionsschutz – Umsetzungsnachweis 20.09.2026

Die nächste Stufe bleibt P0: vorhandene Editionen mit offiziellen Quellen prüfen,
konkrete Detaildaten durch den bestehenden Review führen und erst anschließend
skalieren. Dies ergänzt den bestehenden Durchsatzplan; es ersetzt ihn nicht.
Die Arbeit baut auf Commit `1de8027` auf. Production wurde ausschließlich gelesen.

## Implementiert

- Zwei additive Migrationen schließen die tatsächlich vorhandene Schema-Lücke
  und schützen unabhängig gepflegte Editionen vor dem alten Master-Sync.
  `20260920174425_event_detail_foundation_schema_alignment.sql` ergänzt fehlende
  Detail-/Elternfelder und View-Aliase, ohne bestehende Spalten umzuordnen,
  öffentliche Fakten, Filter, View-Identität oder Rechte zu verändern.
  Die historische Migration vom 24.08. wird nicht blind wiederholt oder als
  angewendet eingetragen.
- `20260920174737_preserve_edition_facts_from_legacy_sync.sql` verhindert, dass
  ein Quellenmonitor- oder Metadatenupdate strukturierte Distanzen,
  mehrtägige Termine, Anmeldelinks und echte Prüfzeitpunkte mit alten Masterwerten
  überschreibt. Änderungen des Editionsjahrs verlangen den Kandidatenweg;
  veröffentlichte Termine den editionsgenauen Review. Die erste, unveränderte
  Entwurfseinreichung kann weiterhin bearbeitet und erstmals freigegeben werden.
  Ein historischer Entwurf darf nur unverändert erstmals freigegeben werden;
  gleichzeitige Änderungen historischer Fakten bleiben ausgeschlossen.
  Neue Seeds übernehmen keinen angeblichen Prüfnachweis vom Master.
- Bestehende Master-Faktenänderungen markieren aktuelle Editionen weiterhin
  als prüfbedürftig; historische Fakten und ihre Prüfzeitpunkte bleiben erhalten.
  Die Migration repariert keine bereits beschädigten Inhalte ohne Quellenreview.
- Der vorhandene Knowledge-Editor verarbeitet editionsgenaue Feldpfade,
  strukturierte Preisstaffeln/Zwischenlimits und echte boolesche Werte. 16 bereits
  vorhandene Datenbankfelder sind nun editierbar. Die Formulardefinition bleibt
  die Feldliste; keine zweite Importarchitektur wurde eingeführt.
  Identitäts-, Freigabe- und Frischefelder lassen sich nicht als Faktenvorschlag
  übernehmen. Offensichtlich verwechselte Rücktritts-/Anmeldefristen werden bei
  Rennzeiten abgelehnt. Leere Angaben und unbekannte Konfidenz bleiben leer.
  Explizites Leeren entfernt bestehende Detailwerte; ausgelassene Felder eines
  einzelnen Vorschlags überschreiben andere Angaben nicht.
- Die End-to-End-Probe deckte eine falsche Kurzfassung auf: Aus „6 hours
  15 minutes“ wurde im Überblick „6 hours“. Zeitlimits behalten nun den
  vollständigen belegten Wert einschließlich Minuten und Kategorienbezug.
  Mobile Tabellen umbrechen vollständig und verwenden lesbare Theme-Farben.
  Ganz leere Tabellenspalten sowie doppelte Cutoff-/Regelangaben entfallen.
  Einzigartige Regeln und Hinweise bleiben erhalten. Der vorhandene Generator
  erzeugt weiterhin 994 Seiten; neun vorhandene Seiten ändern sich durch diese
  Korrekturen, darunter sieben mit vollständigeren Cutoffs. Quelldaten und deren
  Prüfzeitpunkte werden dabei nicht geändert.
- Der bestehende verschlüsselte Backup-/Restoreweg sichert zusätzlich das
  tatsächliche Auth-Schema. Dadurch ist eine vollständige isolierte Probe auch
  bei neuerem Production-Auth möglich. Der Import ersetzt ausschließlich das
  leere Auth-Schema eines zufällig benannten lokalen Containers. Auth startet
  nicht mit restaurierten Nutzersessions; bestehende Sicherheitsprüfungen bleiben
  unverändert verbindlich.

Der Sync-Fehler wurde anhand bestehender Datenänderungen nachgewiesen:
Ratzeburg (Event 446, 11.09.) verlor strukturierte Formate und den Prüfzeitpunkt
vom 08.09.; Köhlbrand (262, 14.09.) verlor die numerische Distanz und denselben
Prüfstand. Die auslösenden Monitoränderungen waren keine Faktenfreigaben.
Der lokale Nachweis liegt unter
`exports/p0-next-20260920/representative-research/legacy-sync-live-audit.json`.

## Quellenpaket und fachliche Grenzen

`data/event-knowledge-review.json` enthält fünf neue private Editionsaufgaben
mit 87 Feldvorschlägen. Alle 25 bisherigen Aufgaben bleiben erhalten. 36 aktuelle
Originalartefakte wurden mit Abrufzeit und SHA-256 gebunden und unabhängig
gegengeprüft. Original-HTML/PDFs und Arbeitsnachweise bleiben unter dem ignorierten
`exports/p0-next-20260920/`; sie gehören nicht in Website oder Git.

| Edition | Event-ID | Feldvorschläge | Bewusst offen gelassen |
| --- | ---: | ---: | --- |
| Berlin-Marathon 2026 | 39 | 15 | Widersprüchlicher Expo-Ort, exakte Wellenzahl, nicht eindeutig auf 2026 bezogener GPX |
| Berliner Halbmarathon 2027 | 429 | 15 | Exakte Wellenzahl; bedingter Sozialtarif ist kein allgemeiner Mindestpreis |
| Köhlbrandbrückenlauf 2026 | 262 | 17 | Widersprüchliches Anmeldeöffnungsjahr; regulärer Ausverkauf und Startplatzbörse bleiben getrennt |
| Challenge Roth 2027 | 46 | 20 | Keine geerbten Startzeiten; kombinierte Schwimm-/Radlimits sind keine isolierten Radlimits |
| Rennsteiglauf 2027 | 43 | 20 | Widersprüchliche Halbmarathondistanz und Zielschluss; keine Übernahme des Raceguides 2026 |

Die Vorschläge enthalten unter anderem Gebühren, Distanzen, Triathlon-Teilstrecken,
Start-/Zielangaben, Zeitlimits, Startnummernausgabe und offizielle Logistik.
Sie sind `needs_review`, nicht öffentlich und haben keine künstlichen
`last_checked`-/`last_verified`-Werte. Technischer Abruf, fachliche Feldprüfung und
vollständige Event-Attestierung bleiben verschiedene Zustände. Keiner der fünf
Fälle erfüllt bereits den vollständigen 14-Felder-Nachweis für einen neuen
Frische-Badge. Ein Teilreview wird nicht als vollständige Eventprüfung gezählt.

## Messstand und Veröffentlichung

Lesender Live-Stand 20.09.2026, 17:53 UTC; keine Produktionsänderungen durch diese
Arbeit:

| Metrik | Vorher | Nach dieser Umsetzung |
| --- | ---: | ---: |
| Discovery / Archiv | 245 / 990 | unverändert |
| Gültige vollständige Frischenachweise | 7 (2,86 %) | unverändert |
| Ohne gültigen vollständigen Frischenachweis | 238 | unverändert |
| Aktive Quellen mit Fehlerzustand | 46 | unverändert |
| Doppelte Event-/Jahr-Gruppen | 0 | unverändert |
| Knowledge-Datensätze in Production | 0 | unverändert |
| Lokale Detail-Reviewaufgaben | 25 | 30 |
| Neue belegte Detailfeldvorschläge | 0 | 87 |

`npm run check` bleibt gesperrt: Der eingefrorene Export vom 27.08. enthält noch
fünf im zugehörigen alten Audit ungeklärte Dublettenpaare. Diese Paare wurden in
Production bereits am 04.09. aufgelöst; das alte Audit ist kein aktueller
Production-Dublettenbefund. Ein regulärer neuer Export scheitert weiterhin an
den unveränderten Bestands-/Frischegrenzen (mindestens 400 Discovery-Einträge und
55 % Frische; aktuell 245 und 7 Nachweise). Keine Grenze wurde gelockert.

## Verifikation und nächster produktiver Schritt

Bestandene Prüfungen:

- Verschlüsseltes vollständiges Backup und echter Restore der 42-Migrationen-
  Production-Baseline: Daten, Schema, RLS, Nutzerisolation und gesperrter Validator
  geprüft. Restore 41,101 Sekunden. Ein erneuter Restore auf die nicht leere
  Kopie wird vor jeder Änderung abgelehnt. Beide Migrationen zweimal angewendet;
  bestehende Event-, Editions-, Quellen-, Auth-Nutzer-, Favoriten- und Planner-
  Fakten bleiben im Hashvergleich aller bestehenden Felder identisch. Nur die
  neu hinzugefügte leere Organizer-URL wird dabei aus der Event-Projektion entfernt.
- Frische lokale Instanz mit allen **54 Migrationen**: **23/23 Auth-/RLS-Tests**,
  **14 Detaildaten- und 18 Legacy-Sync-Prüfungen**, **61 Quellenmonitor-SQL- und
  vier REST-Prüfungen**, **75 sichere Veröffentlichungsprüfungen**, einschließlich
  1er-/10er-/25er-Paketen und Rollback beim letzten fehlerhaften Eintrag.
  Lifecycle, Kandidaten und Postflight bestehen ebenfalls. Der alte Sync scheitert
  am neuen Regressionstest; der korrigierte Sync besteht unveränderte bestehende
  Freigabe-/RLS-Szenarien.
- Fünf echte Quellenpakete in die isolierte Kopie eingelesen und aus der Datenbank
  zurückgelesen: **134 Prüfungen**, 87 Feldquellen, genaue Elternzuordnung,
  JSON-/Boolesche-Werte und keine anonyme Sichtbarkeit. Nach Rollback bestätigen
  15 Tabellenzählungen und vollständige Hashes den Ausgangszustand.
- Die vorhandenen Export-/Seitengeneratoren verarbeiten diese DB-Rücklesedaten.
  Eine ausdrücklich markierte lokale Renderkopie prüft die teilgeprüften Felder;
  die privaten Originale bleiben verborgen. **70 Layoutprüfungen**: fünf Events,
  sieben Breiten (1440, 1280, 1024, 768, 480, 390, 360 Pixel), beide Themes;
  kein horizontaler Überlauf oder abgeschnittene Bedienelemente. Season-Toggle
  funktioniert für alle fünf. Keine Konsolen-/Seitenfehler.
- Der lesende anonyme Production-Audit besteht: öffentliche Editionen lesbar,
  private Datensätze und Benutzerbereiche gesperrt.
- `npm run test:code` bestand vollständig, einschließlich **133/133 Browsertests**
  für Discovery, Details, Reviews, Favoriten und Season Planner. Zusätzlich
  bestehen **14 Knowledge-Review-Regressionsprüfungen** und die Detail-Foundation-
  Suite. Nach den abschließenden Detailkorrekturen bestehen erneut **19/19
  Detail-Browsertests und 2/2 Knowledge-Browsertests**, die Foundation-Suite,
  Static-Smoke und Layout-Audit. Syntax- und Diff-Prüfung sind sauber.

`npm run check` und `npm run prepare-package` stoppen erwartungsgemäß am
unveränderten Daten-Gate; ein Website-Paket wurde deshalb nicht gebaut.
Ein grüner Code-Stand ist keine Katalogfreigabe.

Prüfartefakte: `exports/p0-next-20260920/`,
`exports/validation-20260920/local-staging-54-final.log`.
Backup: `sporteventmap-production-20260920T175806938Z.sembackup`,
SHA-256 `6b00b0b171f56024153c39796af6d748a64209fbfb8823364565454981749f75`.

Wichtige Codeänderungen: die beiden genannten Migrationen, `index.html`,
`js/supabase.js`, `data/event-knowledge-review.json`,
`tests/legacy-edition-sync.sql`, `tests/event-detail-database.sql`,
`tests/knowledge-review-safety.test.mjs`, `tests/e2e/knowledge-review.spec.mjs`,
`tools/generate-event-pages.js`, `css/style.css`, neun erzeugte Detailseiten
und die zugehörigen Integritäts-/Browsertests,
der lokale RLS-Runner, der vorhandene Preflight sowie die drei bestehenden
Backup-/Restorewerkzeuge und der Recovery-Runbook.

Nach bestandener isolierter Probe ist der nächste produktive Schritt die
gesondert freizugebende Anwendung genau der zwei genannten Migrationen auf
`fztupxyxvhvhtihhmtnk`, mit frischem Backup und Vor-/Nachprüfungen. Kein blindes
`db push` über die divergierende historische Migrationsliste. Anschließend
können die fünf privaten Pakete editionsgenau im bestehenden Admin-Review
übernommen werden; Veröffentlichung und vollständige Attestierung bleiben
separate bewusste Entscheidungen. Bereits verlorene Fakten brauchen einen
eigenen aktuellen Quellenvergleich.

Diese Arbeit liefert noch keinen freigabefähigen Website-/Datenrelease. Die
Produktionsgrenze folgt dem bestehenden
[Preflight](EDITION_PRODUCTION_PREFLIGHT.md) und
[Entwicklungsworkflow](DEVELOPMENT_WORKFLOW.md).
