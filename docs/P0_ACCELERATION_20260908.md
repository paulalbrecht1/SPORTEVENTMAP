# P0: Durchsatz und öffentlicher Distanzvertrag

Stand: 8. September 2026. Ausgangspunkt ist der abgeschlossene
[Faktenbatch 04](P0_BATCH_04_20260908.md).

## Engpass und Arbeitsweise

Die bisherige Einzelprüfung hat echte Fehler beseitigt. Für das Erreichen der
Releasegrenze reicht ihr bisheriger Durchsatz nicht aus. Der aktuelle lesende
Abgleich um 06:50 UTC bestätigt 330 Discovery- und 989 Archiv-Editionen sowie
13 gültige Frischenachweise. Mindestens 70 Nettozugänge fehlen. Bei genau
400 Discovery-Einträgen sind 220 gültige Nachweise erforderlich, also aktuell
207 zusätzliche. Auslaufende Events und ablaufende Nachweise erhöhen den Bedarf.

Die Arbeit wird deshalb in zwei parallelen fachlichen Warteschlangen geführt:
vollständige Reviews bestehender Events und tatsächlich neue sichtbare
Folgeeditionen. Eine neue Edition für ein bereits sichtbares Event ist kein
automatischer Nettozugang. Gezählt wird erst der nachgeprüfte Discovery-Bestand.

Vor dem aufwendigen Feldreview werden aktuelle Edition, vollständiges Programm,
Anmeldung und Veranstaltungsort kurz anhand der offiziellen Quelle geprüft.
Ein erkennbarer Widerspruch wird mit seinem konkreten Belegbedarf zurückgestellt.
Belegbare Fälle werden zu einem gemeinsamen Faktenpaket mit gesonderter
14-Felder-Adminprüfung zusammengefasst. Ein gemeinsames Backup und eine
Wartungsprobe pro abgeschlossenem Paket senken den wiederholten Aufwand.
Schematische Bestätigung alter Angaben, pauschale Frischeupdates und
abgesenkte Releasegrenzen bleiben ausgeschlossen.

Gemessen werden vollständige, tatsächlich akzeptierte Nachweise und
Nettozugänge je Paket; die Anzahl recherchierter Links oder vorbereiteter
Kandidaten ist keine Qualitätskennzahl. Es gibt keinen Nachweis eines global
optimalen Verfahrens. Die folgenden Befunde begründen diese konkrete
Priorisierung für den vorhandenen Bestand.

## Öffentliche Distanzen

Die tatsächlichen Production-Ansichten lieferten am 8. September um 06:46 UTC
28 Discovery- bzw. 29 Archivspalten ohne `race_formats`. Die historische lokale
Migration vom 24. August, die unter anderem dieses Feld ergänzt, fehlt in der
Live-Migrationshistorie. Ein vollständiges Replay dieser breiteren Migration
ist für den eng begrenzten Fehler nicht erforderlich.

Exporter und Datenlader verwenden `select=*`. Eine fehlende Spalte führt deshalb
zu keinem Abruffehler: strukturierte Formate fehlen still im REST-Ergebnis und
im CSV-Export. Schon elf sichtbare Editionen enthalten mehrere gespeicherte
Formate. Zusätzlich muss der CSV-Ersatzweg den JSON-Inhalt wieder als Array
normalisieren, damit der Saisonplaner dieselben Wettkämpfe wie bei REST erhält.

Die begrenzte Korrektur ergänzt ausschließlich `race_formats` in beiden Views
und normalisiert das CSV-Feld. Bestehende Spalten, Filter und View-Identitäten,
`security_invoker=true`, Berechtigungen und die abhängige Admin-Inbox müssen
erhalten bleiben. Das Feld ist bereits unter den bestehenden RLS-Regeln auf
der Edition öffentlich lesbar. Es werden keine Eventfakten oder
Verifikationszeitpunkte geändert.

Die Migration `20260908070046_public_race_formats_contract.sql` wurde um
07:00:46 UTC über den vorgesehenen Supabase-Migrationspfad angewendet. Ihre
ursprünglich per CLI erzeugte Datei trug die Version `20260908065025`; nach
Anwendung wurde ausschließlich der Dateiname an die vom Server vergebene
History-Version angepasst. Inhalt und SHA-256 blieben identisch:
`8fd43aa05c0c3e0f5d52bdfc0e44c74992f0fc8301e747eb76cd308482d6a925`.
Das lokale Preflight-Manifest enthält dieselbe neue Migration.

Der Live-Nachweis um 07:01:14 UTC bestätigt 330/989 unveränderte öffentliche
Zeilen und identische Werte sämtlicher bisherigen öffentlicher Spalten.
`race_formats` stimmt in beiden Views mit der jeweiligen Edition überein;
elf Discovery-Editionen liefern mehrere strukturierte Formate. OIDs, alte
Spalten, Berechtigungen, View-Optionen, RLS und Frischeguard sind unverändert.
Events, Editionen, Quellen, Profile, Favoriten und Saisonpläne besitzen
identische vollständige Prüfsummen. Bei `auth.users` änderte sich ausschließlich
`updated_at` eines Nutzers bereits um 06:55:57 UTC, vor der Migration; die
Prüfsumme ohne dieses Feld stimmt mit dem Backup überein.

Die CSV-Korrektur ist technisch abgenommen und wird auf GitHub geführt. Sie
ist Teil des nächsten zulässigen Frontend-Releases. Die angewendete
Datenbankmigration ist davon getrennt; es gab keinen Wrangler-Upload.

## Technische Abnahme und Wiederherstellung

- Frisches verschlüsseltes Backup: `backups/production/p0-public-contract/`
  mit Snapshot `20260908T064329512Z`; SHA-256
  `0106932955318db30fb544e95b941e60e80a9db622eed8e1ab12442f909e54f9`.
- Isolierter Restore in `sport-event-map-recovery-drill-ee6ec898` in
  39,394 Sekunden; Integrität, Schema, RLS und Nutzerisolation bestanden.
- Tatsächliche Anwendung, unveränderte alte öffentliche Werte/Identitäten/
  Berechtigungen/Fakten, anonyme und normale authentifizierte Lesbarkeit,
  exakte Formatzuordnung und idempotente Wiederholung bestanden.
- Dauerhaftes Rücknahme-/Wiederherstellungspaar unter
  `supabase/maintenance/20260908_public_race_formats_contract_{rollback,restore}.sql`
  praktisch getestet. Die Rücknahme erhält die neue Spalte typ- und
  positionsgleich als NULL. Kein `DROP` oder `CASCADE`; die abhängige Admin-Inbox
  bleibt erhalten. Vorzeitiger Restore, wiederholte Rücknahme/Wiederherstellung
  und Migration auf einer NULL-Projektion werden korrekt abgewiesen.
- `tests/public-race-formats-contract.sql` prüft den echten anonymen Zugriff
  auf dem Klon. `npm run audit:anon` umfasst jetzt zwei dauerhafte explizite
  REST-Feldprüfungen und besteht produktiv 9/9 Fälle; der Frische-Zugriffsaudit
  besteht 5/5 ohne Schreibzugriff.
- Der neue Codefall prüft Export-Mapping, CSV-Parser, Normalisierung und Planer
  mit mehreren benannten Rennen, Staffel, variabler Distanz und ungültigem JSON.
  Ein unabhängiger zusätzlicher CSV-Roundtrip bestätigt 14 Optionen aus zwei
  realen Batch-04-Paketen.
- `npm run test:code` vollständig grün, einschließlich 117/117 Browserfällen.
  Der erste Lauf erkannte den fehlenden neuen Eintrag im Migrationsmanifest;
  nach dessen sachlicher Ergänzung besteht die Suite. Der reine spätere
  Versionsabgleich wurde separat mit dem Preflight-Test geprüft.
- Regulärer Refresh nach dem Livefix: 330 Discovery, 989 Archiv, 3,94 % Frische,
  50 % Vollständigkeit. Er stoppt vor dem Schreiben. `npm run check` blockiert
  weiterhin am alten zurückgehaltenen Datenpaket, darunter fünf ungeklärte
  Dubletten in dessen Bericht. Releaseversion und Frontend-Artefakte bleiben
  unverändert. Es wurden keine Gates umgangen.

Ein unabhängiger Review des SQL-/CSV-Fixes und beider Recovery-Skripte fand
keine blockierenden Befunde. Detailnachweise: `contract-rehearsal.json`,
`production-postflight.json`, `test-code-final.log`, `regular-refresh.log` und
`release-check.log` im ignorierten Arbeitsordner.
Der Testklon wurde um 07:05:04 UTC vollständig entfernt: exakt drei Container,
zwei Volumes und sein geprüftes Klartextverzeichnis. Andere lokale Umgebungen
und der SHA-256 des verschlüsselten Backups blieben unverändert.

## Vorbereiteter Bestandsbatch

Die begrenzte Quellen-Vorprüfung vom 8. September liefert zwei vollständige
Belegmappen und zwei Teilpakete. Dies sind vorbereitete Faktenpatches, keine
bereits angewendeten Korrekturen oder neuen Frischenachweise:

| Event | Termin | Belegte Felder | Konkreter Stand |
| --- | --- | --- | --- |
| Braunschweiger Speed5, 342 | 08.11.2026 | 14/14 | Vier aktuelle Wettbewerbe, offene Anmeldung, offiziell verlinkter Sportplatzmarker |
| Ring Running Series, 159 | 21.11.2026 | 14/14 | Marathon und Halbmarathon, offene Anmeldung, aktuelle Ausschreibung und belegte Veranstaltungsstätte |
| Rostock 10, 513 | 03.10.2026 | 11/14 | Vier Wettbewerbe belegt; unterschiedliche Hausnummern und widersprüchlicher Kartenpunkt verhindern Adresse-/Geo-Freigabe |
| Köhlbrandbrückenlauf, 262 | 03.10.2026 | 11/14 | Drei Starts und Ausverkauf belegt; gespeicherte Ordnungszahl und exakter Veranstaltungsort-Pin bleiben offen |

Die vollständigen Pakete 342/159 gehen als Nächstes in Faktenanwendung und
gesonderte echte Adminprüfung; zuvor sind ihr Vorherstand und die weiterhin
aktuellen Quellenbelege erneut abzugleichen. Die höchstens 24 Stunden alten
Feldnachweise dürfen nicht durch ein neues Datum auf einer alten Recherche
ersetzt werden. Die anderen beiden Fälle werden durch ihre konkreten
Beleglücken zurückgehalten. Veranstaltungsstätten werden nicht als vermessene
Startlinien ausgegeben. Status und sämtliche Originalbelege stehen unter
`review-pilot/triage-summary.{json,md}`; kein Formular wurde abgeschickt.
Ein zweiter Fachreview der vorhandenen Originale bestätigt beide vollständigen
Pakete als vorbereitungsseitig konsistent, ohne konkrete Befunde. Alle 14 Werte,
fünf bzw. neun Originaldateien und ihre Prüfsummen wurden abgeglichen.
Das ersetzt weder die Datenanwendung noch die gesonderte Adminattestierung.

## Vorprüfung zukünftiger Nettozugänge

66 Nachfolgekandidaten verteilen sich auf 22 `draft_created`, 39 `detected` und
fünf `rejected`. 52 unterschiedliche derzeit unsichtbare Events haben offene
zukünftige Kandidaten, davon 50 deutsche. Das ist eine Arbeitsliste und keine
Liste veröffentlichbarer Events. 21 von 22 terminierten zukünftigen Entwürfen
stammen aus einem fremden Kalender; dessen Konfidenz ersetzt keinen
Veranstalternachweis.

Bei diesen vier derzeit unsichtbaren Events sind offizielle Termine aktuell
bestätigt. Noch keines ist vollständig freigegeben:

| Event | Offizieller Termin | Vor vollständiger Freigabe zu lösen |
| --- | --- | --- |
| Zugspitz Ultratrail, 45 | 17.–19.06.2027 | Sieben aktuelle Rennen statt fünf alter Formate; Anmeldung noch nicht geöffnet; neue editionsgebundene Quelle und aktuelle Beschreibung; Doppelmarke 691 abgleichen |
| Paderborner Osterlauf, 1013 | 27.03.2027 | Neue Edition, aktuelles vollständiges Programm, Anmeldelink/-status und Startort belegen; Unterseiten enthalten noch 2026 |
| Triathlon Ingolstadt, 186 | 06.06.2027 | Alle Triathlon-/Kinderformate und genaue Veranstaltungsfläche prüfen; Anmeldung beginnt laut Veranstalter am 01.10.2026 |
| Allgäu-Panorama-Marathon, 207 | 07.–08.08.2027 | Gesamtes Wochenende statt nur Sonntag; neues Samstagsformat und aktuelles Anmeldeziel prüfen |

Primärquellen: [Zugspitz](https://zugspitz.utmb.world/),
[Paderborn](https://www.paderborner-osterlauf.de/),
[Ingolstadt](https://triathlon-ingolstadt.de/),
[Allgäu](https://allgaeu-panorama-marathon.de/).
Die Abrufe vom 8. September gegen 06:44 UTC sind mit UTC-Zeit und SHA-256 im
ignorierten Quellenarchiv belegt. Potenzial nach vollständiger Freigabe: vier
unterschiedliche Eventidentitäten, heute daraus hinzugekommen: null.

Bei Jena ist der Kandidat 04.06.2027 falsch zugeordnet: Die
[offizielle Seite](https://jenaerbackyardultra.de/) nennt diesen Tag für die
Anreise und 05.06. für den Start, den Termin weiterhin als vorläufig. Dieser
Fall bleibt gesperrt. Weitere elf priorisierte Kandidaten sind vorbereitet,
ihre Termine sind in diesem Schritt nicht unabhängig bestätigt.

Die Live-Funktion `approve_edition_succession_candidates` ist ebenfalls kein
sicherer Mengen-Shortcut: Sie setzt `verified` und einen Prüfzeitpunkt anhand
von Datum und URL ohne vollständigen Feldnachweis. Der öffentliche
Frischeguard zählt das korrekt nicht als frisch, weil der gebundene
14-Felder-Audit fehlt. Vor einer Nutzung für neue Veröffentlichungen muss
dieser Veröffentlichungspfad gesondert gehärtet und geprüft werden.
Die Funktion wurde in diesem Schritt weder aufgerufen noch verändert.

## Nachweise und nächstes Paket

Private Vorherstände, Quellenabrufe, Feldbelege und Diagnoseabfragen liegen in
`exports/p0-acceleration-20260908/`. Sie werden nicht mit der Website oder auf
GitHub veröffentlicht. `candidates.json` enthält 70 technisch vorgefilterte
Bestandsevents; die Bezeichnung `eligible` bedeutet ausschließlich diesen
Vorfilter, keine fachliche Freigabe. Die Top-15-Liste möglicher Nettozugänge
liegt unter `future-editions/net-additions-review.json`.

Die Reihenfolge bleibt: Distanzvertrag absichern, belegbare Bestandsreviews
gebündelt anwenden und attestieren, Veröffentlichungspfad für neue Editionen
absichern und vollständig belegte Nettozugänge ergänzen. Danach folgen ein
regulärer Export, daran gebundene Audits und die vollständige Releaseabnahme.
Die fünf blockierenden Dubletten im alten versionierten Bericht stammen aus
dem zurückgehaltenen Fallback; ihre fachliche Bereinigung wurde bereits am
4. September protokolliert. Sie werden beim nächsten zulässigen Export erneut
an dessen Daten gebunden. Kein Bericht wird zur Freigabe manuell entwertet.
