# P0: Source Monitor und FSV-Review am 21.09.2026

Dieser Bericht setzt den [vorherigen Reviewstand](P0_REVIEW_RECOVERY_20260921.md)
fort. P0 bleibt in Arbeit; ein funktionierender Quellenmonitor und einzelne
Feldreviews ersetzen die Bestands- und Frischegrenzen nicht.

## Source Monitor produktiv repariert

`event-source-check` wurde am 21.09.2026 um 08:35 UTC von Plattformversion 23
auf **Version 24** aktualisiert. Workerstand:
`source-monitor-4.1.9-phase-a-shadow-browser-cors`. Die Funktion ist `ACTIVE`,
`verify_jwt=true`; alle 13 zurückgelesenen Dateien stimmen bytegenau mit dem
geprüften Paket überein. Die vollständigen bisherigen zwölf Dateien liegen
lokal für einen möglichen Rollback bereit.

Der neue CORS-Vertrag behandelt OPTIONS vor Authentifizierung und Datenbankarbeit,
erlaubt ausschließlich die festgelegten App-, Release- und lokalen Prüf-Origins
und die vier benötigten Browserheader. Fremde Origins werden abgelehnt.
POST verwendet weiterhin die bestehende Admin-/Cron-/Service-Prüfung.
Vom Worker erzeugte Fehlerantworten erhalten für erlaubte Origins ebenfalls
die passenden CORS-Header; vorgelagerte Gatewayfehler liegen außerhalb dieses
Wrappers. Cron-Aufrufe ohne Origin bleiben möglich. Cookies oder zusätzliche Geheimnisheader werden nicht
für den Browser freigegeben.

Sechs echte Netzprüfungen bestanden: vier erlaubte Preflights mit HTTP 204,
eine fremde Origin mit HTTP 403 und ein POST ohne Authentifizierung mit HTTP 401.
Zusätzlich ruft die echte Adminoberfläche die Funktion erfolgreich auf.

Der Rollout enthält auch die bereits eingecheckten, zuvor noch nicht produktiven
Änderungen aus 4.1.8. Diese wurden separat gegen Version 23 geprüft: editionsgenaue
Quellen-/Vorschlagsbindung, kontextabhängige Datumserkennung, Ausschluss von
Fristen und Straßennamen als Eventdatum sowie Schutz gegen Vorschläge aus einer
anderen Jahresedition oder mehrdeutige Anmeldelinks. Konservative Erkennung kann
weiterhin manuelle Nacharbeit verlangen. Beide automatischen Publisher bleiben
deaktiviert; eine zusätzliche Migration war nicht erforderlich.

Der echte Adminlauf **6437** verarbeitete exakt FSV-Lauf-Quelle
`05bdc58e-3c99-4436-8447-a59de2d3ada8`: ein beanspruchter und verarbeiteter Job,
null Fehler, null zusätzlich geplante Quellen. Ergebnis 3932 lieferte HTTP 200
mit tatsächlichem Inhalt; Extraktion und Lifecycle liefen ohne Fehler.
Die öffentlichen Fakten, ihre Auditzeilen und aggregierten Nutzerreferenzen
blieben unverändert. Es entstanden eine private Inhaltsaufgabe und ein bereits
ersetzter Informationsvorschlag, keine offenen Feldvorschläge oder neue Edition.

Der Inhalt war gegenüber dem 14.09. geändert. Content- und Semantichash stimmen
jedoch exakt mit dem heute bereits fachlich geprüften Original von 08:19 UTC
überein. Deshalb wurde die neue Inhaltsaufgabe regulär in der Adminoberfläche
geprüft und abgeschlossen. Der anschließende Stabilitätslauf **6438** über den
bestehenden serverseitigen Cron-/Vault-Transport verarbeitete ebenfalls exakt
eine Quelle mit HTTP 200, null Fehlern und ohne weitere Aufgaben oder Vorschläge.
Sein unveränderter Inhalt setzte die Quelle regulär auf `not_modified/unchanged`.
Gesundheitsmerkmale wurden nicht direkt gesetzt; der erste Adminlauf bleibt
der getrennte Nachweis für den Browseraufruf.

Zwei bestehende Bedienungs-/Diagnosegrenzen wurden sichtbar: Der Source Monitor
zeigt nur die ersten 500 Quellen nach Prüfplan; eine gerade geprüfte Quelle kann
dadurch aus der Tabelle fallen. Außerdem überschreibt die abschließende
Run-Metadatenaktualisierung schon seit Version 23 `requested_source_id`.
Die konkrete Quellenbindung wurde deshalb zusätzlich über die vollständige
Run-/Job-/Ergebniskette verifiziert. Diese Grenzen bleiben Folgearbeit.

Private Nachweise liegen unter `exports/p0-next-20260921/worker-baseline/`
und `worker-release/`, insbesondere Deployment-/Dateivergleich,
`network-postflight.json` und `fsv-first-crawl-verified-report.json`.

## FSV-Lauf: geprüfte Kernfakten

Für FSV-Lauf 2026 (Event 383) wurde der Rennformatvorschlag nach Bearbeitung
über die echte Adminoberfläche angenommen. Sechs getrennte Formate ersetzen
die zuvor zusammengefasste Angabe: 400 m Bambini, zweimal 1,7 km für die beiden
Schülergruppen, 5 km einschließlich Nordic Walking, 10 km und die 2 × 5 km Staffel.
Die reguläre Inhaltsprüfung vor dem Crawl und die anschließend ausgelöste neue
Inhaltsaufgabe wurden anhand derselben frisch geprüften Originale abgeschlossen.

Das vollständige Paket enthält 14 einzeln belegte Werte und vier Originalabrufe
von Homepage, Ausschreibung, Anmeldeformular und offizieller Anfahrt.
Der Anmeldeweg gehört tatsächlich zu 2026. Der offiziell verlinkte Kartenpunkt
belegt die Startzufahrt in der Brucker Lache; die Schule zur Startnummernausgabe
wird nicht als Startort verwendet. Der Punkt ist keine vermessene Startlinie.
Die ursprüngliche Quellenzeit ist `2026-09-21T08:19:54.858Z`.

Die vollständige Frischebestätigung erfolgte um 08:45:47 UTC über das reguläre
Adminpaket. Der unabhängige Nachvergleich bestätigt genau eine neue Attestation,
einen tatsächlichen Admin-Akteur, unveränderte Quellenzeit und Confidence 0,96.
Alle 14 Auditwerte stimmen mit Produktionsdaten und geprüftem Paket überein;
die strenge Frischeprüfung liefert `true`. Es bleiben null offene Aufgaben,
null offene Vorschläge und null aktive Jobs für diese Quelle.
Nach erfolgreicher Speicherung schlug einmal das Neuladen der Adminansicht fehl;
ein normaler Refresh stellte die Ansicht wieder her. Die unabhängige Prüfung
bestätigte die bereits gespeicherte Entscheidung, ohne sie erneut auszuführen.

Nachweise: `worker-baseline/fsv-stability-verified-report.json` und
`worker-baseline/fsv-final-independent-postflight.json` unter dem privaten
Arbeitsordner `exports/p0-next-20260921/`.

## Mobiles Menü

Der Gesamttest deckte einen bestehenden Fokusfehler auf: Nach zwei Animationsframes
konnte die Schließen-Schaltfläche noch unsichtbar sein, sodass der Browser den
Fokusaufruf ignorierte. Der gemeinsame Helper für Startseite und Discovery wartet
jetzt begrenzt auf tatsächliche Sichtbarkeit. Schließt das Menü vorher oder
wechselt der Nutzer den Fokus, bricht der ausstehende Versuch ab.

Neue Regressionstests halten die Schaltfläche gezielt länger unsichtbar und
prüfen anschließend Fokus, bewussten Fokuswechsel und vorzeitiges Schließen.
Die Sichtbarkeitsfälle schlugen mit dem bisherigen Code auf beiden Routen fehl.
Diese Frontendkorrektur ist vom produktiven Backendrollout getrennt; sie erzeugt
keinen Website-Release.

## Abschließende technische Prüfung

`npm run test:code` besteht vollständig, einschließlich **145/145 Browserfällen**
und aller vorgeschalteten Vertrags-, Sicherheits-, Daten- und Layoutprüfungen.
Die neun neuen CORS-Fälle laufen gegen den tatsächlich registrierten Workerhandler
mit lokalen Client-Stubs: Preflight ohne Datenbankarbeit, abgelehnte normale
Nutzer, unveränderte Admin-/Cron-Prüfung, Fehlerantworten und parallele Origins.
Zusätzlich bestanden die sechs Menüszenarien dreimal (18 Fälle) und die beiden
neuen Regressionen in einer unabhängigen Prüfung jeweils fünfmal (zehn Fälle).
Browsernachweise beziehen sich auf Chromium einschließlich mobiler Projekte.

Der erste Gesamtlauf hatte einen der damaligen 143 Browserfälle am Menüfokus
verloren; ein gezielter Wiederholungslauf zeigte denselben Fehler auf der anderen
Route. Der oben beschriebene Fix behebt die gemessene Sichtbarkeitsursache;
Assertions wurden nicht abgeschwächt. Maßgeblich ist das abschließende Protokoll
`exports/p0-next-20260921/test-code-final.log`.

## Nächster Katalogzugang vorbereitet

Für Allgäu Panorama Marathon 2027 liegt ein privates Paket mit 14 Pflichtfeldern,
acht Formaten und zwölf gehashten Originaldateien vor. Die Distanz-, Geo- und
Historienentscheidungen wurden unabhängig geprüft; die Abnahme des finalen
ausführbaren Änderungspakets steht noch aus.
Die Ultraangabe bleibt eine ausgeschriebene Nennstrecke von rund 69 km; abweichende
Routenberechnungen werden nicht als exakte Vermessung dargestellt. Hauptstartmarker
und gemeinsame Ortsdaten sind auch mit dem offiziellen Programm von 2026 vereinbar.

Vor einer Übernahme müssen der bestehende Sonntagskandidat mit dem belegten
Wochenende 07.–08.08.2027 abgeglichen, eine neue HTTPS-Quelle eindeutig an 2027
gebunden und das konkrete Änderungspaket im Klon geprüft werden. Danach folgen
echter Crawl und authentifizierte Editionsfreigabe. Die Vorbereitung verändert
keine Produktionsdaten und zählt nicht als neue Discovery-Edition.
Privates Paket: `exports/p0-next-20260921/research/ALLGAEU_README.md`.

## Unveränderte Freigabegrenzen

Der reguläre, ausschließlich lesende Produktionsabruf um 08:47 UTC zählt
**230 Discovery-Editionen, 990 Archiveinträge und zehn gültige vollständige
Frischenachweise (4,35 %)**. Vor diesem Block waren es neun (3,91 %).
Die Vollständigkeit liegt weiterhin bei 54,78 %. Der Export ohne Ausnahmeoption
scheitert vor dem Schreiben an mindestens 400 Discovery-Editionen und 55 %
Frische. Kein versionierter Fallback, keine Eventseite und keine Sitemap wurde
durch den unzureichenden Stand ersetzt.

`npm run check` bleibt am alten, an den Export vom 27.08. gebundenen Bericht mit
fünf historischen Dublettenkandidaten gesperrt. Das ist kein Nachweis neuer
produktiver Dubletten. Der aktuelle anonyme Zugriffstest besteht: freigegebene
Daten sind lesbar, nicht freigegebene Events und private Tabellen bleiben
geschützt. Quellenoriginale, Produktionsreadbacks und Backups bleiben lokal.

Der temporäre Admin-Prüftab ist geschlossen, der lokale Prüfserver auf Port 4187
beendet. Für diesen Block wurde keine neue Wiederherstellungsumgebung angelegt.
