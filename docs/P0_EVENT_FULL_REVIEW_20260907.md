# P0: vollständiger Quellenreview für drei Editionen

Dieser Schritt schließt die fachlichen Lücken des
[ersten Faktenbatches](P0_EVENT_FACTS_BATCH_20260907.md) für die vorhandenen
Editionen 108, 109 und 284 vom 13. September 2026. Die Quellen wurden am
7. September 2026 direkt erneut abgerufen. Rohbelege mit Abrufzeiten und
Prüfsummen liegen im ignorierten `exports/p0-review-20260907/`.

## Quellenentscheidungen

| Veranstaltung | Änderung | Genauigkeitsgrenze |
| --- | --- | --- |
| wepLAUF, 108 | Vollständige Lauf-, Walking-, Kinder- und Staffelangebote; Adresse und Kartenpunkt am Start-/Zielbereich | Kartenpunkt aus offiziellem Plan abgeleitet, ungefähr 10 m Genauigkeit |
| Friedberger Halbmarathon, 109 | Halbmarathon und die drei offiziellen Teilwertungen; Beschreibung ergänzt | Veröffentlichte Rundendistanzen, keine zusätzliche Messgenauigkeit behauptet |
| Airport Race, 284 | Kanonischer Anzeigename und vier Distanzen einschließlich Kinderläufe | Kartenpunkt bezeichnet die Sportanlage; Kindermeile bleibt ohne erfundene metrische Streckenmessung |

### wepLAUF

Die [Veranstalterseite](https://www.wep-lauf.de/) leitet auf die aktuelle
[RaceResult-Ausgabe](https://my.raceresult.com/363978/info) weiter.
Die aktuelle Anmeldung enthält 17 Angebote, die unter Erhalt ihrer Kategorien
in zwölf Formate zusammengefasst werden. Dazu gehören Marathon, Halbmarathon,
10-km-Lauf, etwa 5 km, Walking/Nordic Walking, vier Kinderlaufdistanzen,
Firmenstaffel über 4 × 1.470 m, Spaßstaffel über 4 × 340 m und Flexi-Marathon
mit variabler Distanz. Ungefähre Angaben bleiben ausdrücklich gekennzeichnet.

Der [offizielle LVN-Eintrag für 2026](https://lvnordrhein.de/wettkaempfe/veranstaltungskalender/event/26V10004004260001)
belegt 10.000, 21.098 und 42.195 Meter für die entsprechenden Hauptläufe.
Für die Kinder-, Walking- und Staffelangebote hat die aktuelle Anmeldung
Vorrang vor abweichenden älteren Angaben. Die Online-Anmeldefrist bleibt
9. September 2026, 23:59 Uhr.

Der aktuell verlinkte [offizielle 10-km-Plan](https://tus-jahn-hilfarth.de/media/pages/wettkampfportal/2026/wepLauf_10km.pdf)
markiert Start/Ziel an der Parkhofstraße beim Breteuilplatz. Fünf eindeutig
identifizierte Straßenknoten erlauben eine Georeferenzierung des markierten
Punkts auf ungefähr **51.05510, 6.22331**. Originalplan und markierte
Kontrollabbildung wurden unabhängig visuell geprüft. Die geschätzte
Genauigkeit beträgt etwa 10 m; dies ist keine vermessene Startkoordinate.
Der erste Punkt eines älteren GPX-Tracks wurde nicht als Startbeleg benutzt.

### Friedberger Halbmarathon

Die aktuellen [Starterinformationen](https://www.halbmarathon-friedberg.de/starterinfos/)
nennen neben 21,1 km in vier Runden ausdrücklich 5,3, 10,6 und 15,9 km mit
eigenen Gesamtwertungen nach einer, zwei oder drei Runden. Diese Optionen
werden an derselben Edition ergänzt; es entstehen keine zusätzlichen Events.
Die Beschreibung erklärt die Teilwertungen. Ausgebucht, keine zentrale
Warteliste, Start um 10 Uhr und die bereits aus dem ausdrücklich benannten
GPX-Startpunkt übernommenen Koordinaten sind erneut bestätigt.

### Airport Race

Die [offizielle Ausgabe](https://www.airportrace.de/) heißt
„43. Int. Airport Race“. Der kanonische Anzeigename wird entsprechend
korrigiert; bestehende Identitätsschlüssel und Links bleiben erhalten.
Die vier Distanzen sind 10 Meilen (offiziell 16,1 km), 5 km, Mini Airport Race
400 m und Mini Airport Race eine Meile. Die getrennten Jungen-/Mädchenstarts
der Kindermeile sind keine unterschiedlichen Distanzen.

Das [Teilnehmerupdate vom 4. September](https://www.airportrace.de/2026/09/04/ready-for-takeoff-alles-wichtige-zur-teilnahme/)
hat bei widersprüchlichen Abholzeiten Vorrang vor älteren allgemeinen Infos.
Die vorhandene Beschreibung und Nachmeldung unter Kapazitätsvorbehalt sind
bestätigt. Ein fehlgeleiteter älterer Kartenlink zum Bramfelder See wird nicht
als Streckenbeleg verwendet. Der Kartenpunkt bleibt die offiziell verlinkte
LSV-Sportanlage, kein behaupteter genauer Startstrich.

## Anwendung und Frischenachweis

Das Wartungspaket synchronisiert `events.distance`, `legacy_distance` und
`race_formats`. Dadurch zeigen öffentliche Discovery-Daten dieselben Angebote
wie die strukturierten Editionsdaten. Der bestehende Legacy-Sync und seine
Audit-Trigger bleiben aktiv. Faktenkorrektur und administrative
Frischeattestierung sind getrennte Schritte.

Eine Attestierung verlangt die tatsächliche Admin-Anmeldung, die offizielle
Quelle und die vollständige Bestätigung aller 14 zentralen Werte. Die
veröffentlichte Frontend-Version enthält diesen neuen Freigabeknopf noch
nicht. Deshalb wird eine isolierte Kopie des aktuellen öffentlichen
Frontend-Codes auf `127.0.0.1` verwendet, verbunden mit der bestehenden
Produktionsdatenbank und ihrer regulären Authentifizierung. Backups,
Repository-Metadaten und Zugangsdaten sind nicht Teil dieses lokalen Servers.

Der Faktenbatch wurde am **7. September 2026 um 21:46:45 UTC** produktiv
angewendet. Der separate Postflight bestand; alle 42 zentralen Feldwerte
entsprechen beim Zurücklesen exakt den geprüften Werten. 13 private
Vorher-/Nachhersnapshots einschließlich Manifest und 28 automatische
Feld-Auditeinträge dokumentieren die Korrekturen. Die Faktenkorrektur allein
setzt keinen gültigen Frischenachweis.

## Wiederherstellung und Rücknahme

Das verschlüsselte Backup `sporteventmap-production-20260907T212209412Z.sembackup`
enthält den Stand nach dem vorausgehenden Schemaabgleich: 999 Events,
1.022 Editionen, 1.016 Quellen, 40 Migrationen sowie die unveränderten
Nutzerstrukturen. Der letzte frische Restore war am 7. September um
21:44:34 UTC abgeschlossen und dauerte 73,730 Sekunden. Schema,
Datenintegrität, RLS und Nutzerisolation bestanden.

Das [Apply-Paket](../supabase/maintenance/20260907_p0_event_facts_batch_02.sql),
die [Nachprüfung](../supabase/maintenance/20260907_p0_event_facts_batch_02_verify.sql)
und der [Rollback](../supabase/maintenance/20260907_p0_event_facts_batch_02_rollback.sql)
wurden unabhängig geprüft. Auf der frischen Wiederherstellung bestanden
Apply, separate Verify, Ablehnung einer Wiederholung und Rücknahme.
Eine künstliche spätere Änderung der Verifikationsmetadaten ließ den Rollback
wie vorgesehen abbrechen. Die fehlgeschlagene Testtransaktion hinterließ
keine Änderungen. Nach dem echten Rollback entsprachen alle sechs
Master-/Editionszeilen wieder vollständig ihrem Ausgangsstand, abgesehen von
`updated_at`. Beide temporären Restore-Projekte einschließlich Volumes und
entschlüsselter Dateien sind entfernt; das verschlüsselte Backup bleibt erhalten.

SHA-256 der unverändert produktiv angewendeten SQL-Datei:
`1583b4d44013338e79b924b47962d946610a1b420ca18ee6f1f4934125b704c2`.

## Tatsächliche Admin-Attestierung

Alle drei Editionen wurden über die bestehende echte Admin-Sitzung und die
unveränderte Datenbankfunktion einzeln bestätigt. Der öffentliche Guard liefert
am **7. September 2026, 22:07:26 UTC** für alle drei `true` (lokal bereits
8. September, 00:07 MESZ). Je Nachweis sind 14 bestätigte Felder, die exakt
zugeordnete offizielle Quelle, ein tatsächlicher Admin-Akteur und
`automatic_fact_changes=false` auditiert. Masterzeilen und Editionsfakten
entsprechen weiterhin exakt dem Zustand nach dem Faktenbatch.

| Edition | Attestiert am 7. September, UTC | Review-Confidence |
| --- | --- | --- |
| wepLAUF, 108 | 22:04:02 | 0,90 |
| Friedberger Halbmarathon, 109 | 22:02:25 | 0,97 |
| Airport Race, 284 | 22:06:26 | 0,95 |

Die Prüfnotizen dokumentieren die direkten Quellenabrufe um 21:22–21:27 UTC
sowie den abschließenden Vergleich. wepLAUF bleibt ausdrücklich eine aus dem
Plan abgeleitete Start-/Zielnähe; Airport ein Veranstaltungsort. Die
Attestierung behauptet keine zusätzliche Vermessungsgenauigkeit.

## Im Ablauf behobene Oberflächenfehler

Der eingebettete Browser meldete bei der ursprünglichen Eingabefolge
`prompt() is not supported.`. Der abgebrochene Versuch führte zu keiner
Attestierung. Ein normales HTML-Dialogformular ersetzt jetzt die nativen
Eingabefenster in beiden 10-/14-Feld-Flows. Die explizite Feldbestätigung ist
zunächst ungecheckt, Confidence und Notiz sind leer; ungültige oder unsichere
Eingaben bleiben im Formular. Abbrechen und Escape senden keine RPC-Anfrage.
Der bestehende Quellen-, Vollständigkeits- und Autorisierungsvertrag bleibt
erhalten. Vier zusätzliche Browsertests prüfen auch 375 Pixel Breite.

Die vollständigen Distanzangebote deckten außerdem einen Fehler in
Saisonplaner und Profil auf: Die Wahl eines 5-km-Laufs konnte aus dem gesamten
Angebot die Halbmarathondistanz erhalten. Eine Kinderdistanz konnte auf den
Hauptlauf zurückfallen. Auswahl und strukturierte Formatwerte haben jetzt
Vorrang; Meter, mathematische Meilenumrechnung und gesamte Staffeldistanzen
werden berücksichtigt. Variable oder unbekannte Strecken bleiben ohne
Kilometer-/Pace-Ableitung. Alte abgeleitete Werte werden in der Anzeige
normalisiert; persönliche Ziele, Zeiten und bestehende Datenbankeinträge
werden dadurch nicht umgeschrieben. Beide Änderungen wurden unabhängig geprüft.

Die produktiven Distanzbezeichnungen verwenden zusätzlich kompatible
Dezimalpunkte und vermeiden trennende Binnenkommas/Slashes, damit die
ausgelieferte ältere Distanzwahl die Angebote weiterhin zusammenhält.

## Technische Abschlussprüfung

Alle Prüfgruppen vor dem Browserlauf in `npm run test:code` bestanden,
einschließlich der Distanzregressionen, Release-Einstiegspunkte, Katalog-,
Frische-, Sicherheits-, Workflow- und Layoutprüfungen. Der erste vollständige
Browserlauf bestand 86 von 87 Fällen. Ein unveränderter mobiler Menütest
scheiterte an der Fokusprüfung; der Einzeltest und danach drei Wiederholungen
der gesamten Menüdatei bestanden (1/1 und 12/12). Die Ursache des ersten
Fehlers ist nicht belegt; Menücode und Prüfbedingungen wurden nicht geändert.
Der abschließende unveränderte vollständige Browsernachlauf bestand danach
mit **87/87 Fällen in 4,5 Minuten**. Alle Codeprüfgruppen sind damit erfolgreich
abgenommen; der einmalige erste Fokusfehler bleibt transparent dokumentiert.

Die zusätzlichen Produktionsprüfungen bestanden mit 7/7 anonymen
Zugriffsprüfungen und 5/5 Frische-Zugriffsprüfungen. Der Verifier bleibt anonym
unzugänglich. Die SQL-Reparatur und ihre Rücknahme wurden auf einer echten
isolierten Wiederherstellung geprüft, wie oben beschrieben.

Nach Abschluss der echten Admin-Attestierungen wurde der temporäre Server auf
`127.0.0.1:4187` beendet, seine Nichterreichbarkeit geprüft und ausschließlich
das bekannte Vorschauverzeichnis entfernt. Der lokale Browsertab ist
geschlossen; die öffentliche Adminseite bleibt geöffnet.

## Releasegrenzen

Der reguläre `data:refresh-public` liest **332 Discovery-Editionen, 989
Archiv-Editionen, 0,90 % Frische und 49,40 % Vollständigkeit**. Die drei gültigen
Frischenachweise sind enthalten. Das Pre-Write-Gate lehnt den Export weiterhin
vor Dateiänderungen ab: mindestens 400 Discovery-Editionen und 55 % Frische
sind erforderlich. Fallback, generierte Seiten, Sitemap und Wrangler-Release
bleiben unverändert; keine Grenzen wurden gesenkt.

Die zusätzlichen Frontendkorrekturen müssen beim später freigegebenen
Websitepaket einschließlich Cacheversionierung ausgeliefert werden. Der lokale
Adminlauf hat die Datenbankkorrekturen und Attestierungen bereits wirksam
gemacht. P0 insgesamt bleibt offen.
