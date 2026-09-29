# Einheitliche Eventdetails und Zusatzpflege

## Umfang

Die regulären und dynamischen Eventseiten verwenden denselben Berlin-Race-Guide-
Aufbau. Uhrzeiten werden ohne Sekunden, Zahlen mit lokalen Einheiten und
Wettbewerbe nach Distanz dargestellt. Unterschiedliche Wettbewerbe derselben
Distanz bleiben erhalten; identische Anzeigen werden zusammengefasst. Unter
Anreise und Standort steht die Standortkarte mit Marker; Rohkoordinaten erscheinen
nicht als Besucherinformation. Historische Ergebnisse und Editionsidentitäten
bleiben erhalten.

Vorhandenes belegtes Detail- und Wiki-Wissen wird live aus den bestehenden
Knowledge-Tabellen geladen. Fehlende Inhalte werden ausgelassen. Der Admin
ergänzt einklappbare Eingaben für Gebührenstaffeln, Startwellen, Strecke, Renntag,
Anreise, Wetter, Statistiken, redaktionelle Hinweise und FAQ. Alle 95 erlaubten
Feldpfade besitzen eine öffentliche Darstellung. Allgemeines Eventwissen und
jährliche Angaben bleiben getrennt. Es gibt keine neue Parallel-Datenhaltung,
keine LLM-Aufrufe und keinen privilegierten Schlüssel im Browser.

Speichern, gezielte Bestätigung, Schutz vor Importüberschreibungen und
Veröffentlichungskontrolle verwenden den bestehenden atomaren Adminweg.
Die Kontrolle vergleicht auch tatsächlich gerenderte Zusatzfelder mit dem
gespeicherten Stand. Unbestätigte Änderungen oder ausdrücklich entfernte Werte
dürfen nicht durch altes Brand-Wissen ersetzt werden. Nie gesetzte leere
Kindtabellenfelder erlauben hingegen den bestätigten Brand-Fallback.

## Technische Abnahme vor Rollout

- 23 Tests für Admin-Datenaufbereitung, Wiederholungen, Fehler und öffentliche
  Vergleiche bestanden; 6 neue Formular-Browsertests und 17 bestehende Pflegefälle
  bestanden.
- 97 bestehende und 34 zusätzliche SQL-Prüfungen bestanden. Der isolierte Stack
  verwendete alle 60 lokalen Migrationen; die Produktionshistorie wird separat
  und gezielt behandelt.
- 13 echte lokale Browsergruppen bestanden, einschließlich Auth, PostgREST,
  Formularspeicherung, erneutem Datenbanklesen und separater anonymer Detailseite.
  Ergebnis: `exports/manual-workflow-acceptance/run-AFdH2U/acceptance-report.json`.
  Die ausschließlich lokalen Testcontainer wurden anschließend beendet.
- Release-Einstiegspunkte und Paketintegrität bestanden; 45 Routentests und
  28 Paketbauprüfungen sichern die kontrollierten Änderungen an bestehenden
  statischen Seiten ab. Der Paketbau verändert nur die zwei vorhandenen
  Versionsparameter für Detail-Skript und Stylesheet.
- 37 Detail-Browsertests auf dem abschließenden gemeinsamen Stand bestanden,
  einschließlich beider Seitentypen, Deutsch/Englisch, Mobil/Desktop, Kontrast,
  Quellenpflicht, Gebühren, FAQ und gezieltem Brand-/Editionsfallback. Der
  Kartenmarker ist im automatisierten Test instrumentiert; der echte Kartenabruf
  wird zusätzlich im Produktionsbrowser geprüft.

Die Tests deckten echte Fehler bei Audit-Reihenfolge, Nullwert-Fallback und
CSS-Spezifität auf. Diese wurden im produktiven Code korrigiert und gezielt erneut
getestet. Alte Layoutannahmen wurden durch Prüfungen des neuen gemeinsamen
Aufbaus ersetzt; Daten-, Quellen- und Sicherheitsgrenzen bleiben bestehen.

## Rollout und Browsernachweis

Vor der Datenbankänderung wurde das verschlüsselte Backup
`sporteventmap-production-20260929T192313930Z.sembackup` erfolgreich erstellt und
geprüft. Ausgangspunkt ist die unabhängig geprüfte v94-Produktion mit 49
Migrationseinträgen. Die einzige neue Migration ist
`20260929190137_manual_event_knowledge_fields.sql`; kein pauschales `db push`.

Der UI-Paketbau verwendet v94 als unveränderliche Basis. Exportdaten, statische
Eventfakten und Sitemap behalten ihren bisherigen Stand. Das Paket selbst
führt keine Datenpflege oder automatische Kandidatenfreigabe aus.

Die Migration ist produktiv angewendet. Eine unabhängige Abfrage nach dem Commit
bestätigt 50 Migrationen, exakt dieselben alten 49 Einträge, das exakte neue
Originalstatement, unveränderte 37 Tabellen-/View-Fingerprints, vorgesehene
Funktionsrechte und unveränderte Freshness. Nachweis:
`exports/detail-layout-audit-20260929/rollout/postcommit-summary.json`.

Die erste v95-Vorschau zeigte die neue Darstellung mit echtem Kartenmarker.
Dabei wurde zusätzlich die doppelte Distanz bei Bindestrichnamen wie
„10-km-Lauf“ korrigiert. Die finale Oberfläche erhält deshalb v96.

Der Berliner Knowledge-Datensatz war beim Live-Abgleich ausdrücklich privat,
`needs_review`, und ohne bestätigte Quellen. Seine Zusatzangaben werden deshalb
nicht als geprüfte Fakten veröffentlicht. Eine Rückkehr zum alten Export würde
diese Freigaberegel umgehen. Die neue Oberfläche stellt vorhandene geprüfte
Zusatzinformationen dar; ungeprüfte Inhalte benötigen weiterhin Quellenprüfung.

## Tatsächlicher Produktionsnachweis

Veröffentlicht: **v96**, Quelle `eae3a755304a82f2eaf333edc7188ea2d88510ad`,
Build `2026-09-29T19:39:23.806Z`. Vorschau:
`https://4338b235.sporteventmap.pages.dev`; Produktionsdeployment:
`https://64c2f0b1.sporteventmap.pages.dev` und `https://sporteventmap.com`.
Release-SHA-256: `7ce3564e10479063b69f9183305cf02b0380942ac7346e271d24f832da964cac`.
Jeweils 56 Dateien geprüft: alle 45 Nicht-HTML-Dateien und 11 HTML-Einstiegs-/
Stichprobenseiten. Auf der Hauptdomain wurden ausschließlich bekannte Cloudflare-
Ergänzungen berücksichtigt. Nicht jede der 994 statischen Seiten wurde einzeln
im Browser geöffnet; ihre erlaubten Paketänderungen werden vollständig gehasht.

Die zusätzliche Distanzkorrektur bestand vier gezielte Browserfälle für beide
Seitentypen: Bindestrichnamen ohne Doppelung, sichtbare tatsächlich abweichende
Distanz, DE/EN-Dezimalformat und unveränderte Jahreszahlen im Namen.

Am **Paderborner Osterlauf 2027** wurden ausschließlich über das echte
Adminformular vier erfolgreiche Vorgänge ausgeführt:

1. 20 Gebührenstaffeln samt Schülerpreis-Hinweisen und Startzeiten für 5 km,
   Walking/Nordic Walking, 10 km und Halbmarathon anhand des
   [offiziellen Anmeldeportals](https://reg.mikatiming.com/paderborner-osterlauf/2027).
2. Zeitmessung, Verpflegung, medizinische Betreuung und Park-and-Ride anhand der
   [Ausschreibung](https://www.paderborner-osterlauf.de/anmeldung.html).
3. Erste Austragung und allgemeiner Hintergrund getrennt als Event-Wiki anhand
   der [offiziellen Chronik](https://www.paderborner-osterlauf.de/erfolgsgeschichte.html).
4. Den unveränderten 27.03.2027 nochmals ausschließlich als Datum bestätigt.

Alle Vorgänge zeigten nach dem Datenbank-Neuladen auch die erfolgreich geprüfte
öffentliche Detailseite. Nach vollständigem Browser-Neuladen waren die 20
Staffeln im Admin weiterhin vorhanden. Öffentlich erschienen alle acht geprüften
Zusatzfelder, sechs Wettbewerbe geordnet, `09:30` ohne Sekunden und echte
OpenStreetMap-Kacheln mit einem Marker. Bei 390 Pixeln Breite bestand kein
Seitenüberlauf; Rohkoordinaten waren weder mobil noch am Desktop sichtbar.

Ein tatsächlicher Versionskonflikt wurde über **Aktuellen Stand laden** gelöst:
alle Eingaben blieben erhalten, Prüfhäkchen wurden zurückgesetzt, nach Vergleich
und erneuter Bestätigung wurde erfolgreich gespeichert. Ein gleichzeitig
entstandener Source-Monitor-Hinweis blieb nachvollziehbar offen.

Unabhängige Datenbankabfragen bestätigen genau zwei Editionen, unveränderte
historische Ausgabe 2026 sowie unveränderte Ergebnis- und Planerverknüpfungen.
Alle neun gezielten Feldbestätigungen haben Serverzeit und Auth-Bearbeiter;
weitere Kernfelder wurden nicht erneut bestätigt. Es wurden keine Testausgaben,
keine Dubletten und keine automatischen Kandidatenfreigaben erzeugt.

Belege: `exports/detail-layout-audit-20260929/` mit Vorher-/Nachherabfragen,
Release-Dateiprüfungen und echten Desktop-/Mobilbildern. Die Anleitung erklärt
die tatsächlichen neuen Steuerelemente; für die tägliche Pflege ist ausschließlich
das SportEventMap-Adminkonto erforderlich.

## Verbleibende fachliche Grenze

Der automatische Quellenmonitor meldete während der Pflege, dass die
Anmeldeportal-Quelle den Crawler per `robots.txt` sperrt. Der Review bleibt offen;
er wurde nicht wahrheitswidrig als behoben markiert. Die öffentliche Gesamtfrische
dieser Ausgabe ist deshalb aktuell **nicht freigegeben**, obwohl die neun
gezielten Bestätigungen und sichtbaren Änderungen erfolgreich gespeichert sind.
Das ist ein offener P0-Reviewpunkt für den Umgang mit manuell lesbaren, für
automatisierte Abrufe gesperrten Quellen. Diese Umsetzung verändert die
bestehende Freshness-Policy nicht und behauptet keinen P0-Abschluss.

Der unabhängige Hinweis auf ein fehlendes Eventbild bleibt ebenfalls offen.
Unbekannte Angaben wurden nicht erfunden. Die Berliner ungeprüften Inhalte
benötigen vor einer öffentlichen Anzeige weiterhin echte Quellenprüfung.

Bedienung: [Events manuell pflegen](MANUAL_EVENT_MAINTENANCE.md).
