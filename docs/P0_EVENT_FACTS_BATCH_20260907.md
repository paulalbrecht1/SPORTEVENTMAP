# P0-Faktenbatch vom 7. September 2026

## Auftrag und Umfang

Der Nutzer hat nach dem Release-Folgeprotokoll die nächsten Arbeitsschritte
beauftragt. Dieser Schritt korrigiert drei konkret belegte Veranstaltungen im
Supabase-Quellsystem. Er ersetzt keinen vollständigen Frischenachweis und gibt
keinen neuen Website-Release frei.

Status: **Produktiv angewendet und nachgeprüft**, 7. September 2026,
20:15:33 UTC. P0 und der Website-Release bleiben wegen der Kataloggates offen.

## Quellenentscheidungen

Die offiziellen Seiten und öffentlich zugänglichen Anmeldeinformationen wurden
am 7. September 2026 erneut abgerufen. Rohbelege, Zeitstempel und Prüfsummen
liegen privat im ignorierten Ordner `exports/p0-batch-20260907/`.
Es wurden keine Teilnehmerdaten eingegeben oder Anmeldungen abgeschickt.

| Event | Belegte Korrektur | Bewusst offene Prüfung |
| --- | --- | --- |
| wepLAUF, 108 | Breteuilplatz, eigene Beschreibung, editionsbezogener Anmeldelink, Anmeldung offen | Exakte Distanzstruktur und Startkoordinaten |
| Friedberger Halbmarathon, 109 | Ausgebucht, Marienplatz/Marienbrunnen, 21,1 km, Startpunkt aus offiziellem GPX, Beschreibung und Anmeldelink | Vollständige administrative Frischeattestierung |
| Airport Race, 284 | Hamburg, LSV-Sportanlage/Borsteler Chaussee 330, offizieller Veranstaltungsort auf der Karte, Beschreibung und Nachmeldung | Vollständige administrative Frischeattestierung; Kartenpunkt ist ein Veranstaltungsort, kein vermessener Startstrich |

### wepLAUF

Die [Veranstalterseite](https://www.wep-lauf.de/) verweist auf die
[aktuelle Ausgabe](https://my.raceresult.com/363978/info) und die
[Anmeldung](https://my.raceresult.com/363978/registration). Die aktuelle
Anmeldeinformation nennt den 9. September, 23:59 Uhr; eine ältere Webcache-Angabe
mit dem 10. September wurde verworfen. Ebenso wird die veraltete Angabe von
4,6 km nicht übernommen. Die aktuelle Anmeldung nennt etwa 5 km, während die
vollständige Rundendistanzstruktur noch nicht eindeutig aufgelöst ist.

Der aktuell verlinkte GPX-Track enthält ältere Metadaten und keinen eindeutig
beschrifteten Startpunkt. Sein erster Trackpunkt wird deshalb nicht als neue
Startkoordinate übernommen. Bestehende Distanzen und Koordinaten bleiben in
diesem Batch unverändert und zur Prüfung markiert.

### Friedberger Halbmarathon

[Veranstalter](https://www.halbmarathon-friedberg.de/) und
[Starterinformationen](https://www.halbmarathon-friedberg.de/starterinfos/)
melden die Ausgabe vom 13. September als ausgebucht; eine zentrale Warteliste
wird nicht angeboten. Der Veranstalter nennt 21,1 km in vier Runden, ohne dass
ein Ausstieg nach einer Runde einen eigenständigen Wettkampf darstellt.

Die [Streckenseite](https://www.halbmarathon-friedberg.de/strecke/) verlinkt die
[GPX-Datei](https://www.halbmarathon-friedberg.de/strecke/strecke-hm-friedberg.gpx?cid=1mjs)
mit ausdrücklich beschriftetem Start-Wegpunkt. Übernommen werden gerundet
48.355188, 10.978578. Die veröffentlichte Distanz wird nicht ohne weiteren Beleg
auf 21,0975 km präzisiert.

### Airport Race

Die [Veranstaltungsinformationen](https://www.airportrace.de/infos/) nennen
Start und Ziel auf der LSV-Sportanlage, Borsteler Chaussee 330. Der dort
verlinkte [Kartenort](https://goo.gl/maps/pxNtSjZD57QDWHBk9) bezeichnet den
Lufthansa Sportverein mit 53.61692, 9.9756601. Verwendet wird der Ortsmarker,
nicht der Mittelpunkt des Kartenausschnitts.

Die [Anmeldeseite](https://www.airportrace.de/anmeldung/) bietet bei der Prüfung
weiterhin die Online-Nachmeldung an. Die Beschreibung nennt den
Kapazitätsvorbehalt und die Barzahlung bei Abholung. Der Anmeldestatus lautet
im Datenmodell `registration_open`. Die Laufangebote für Kinder werden im Text
genannt; der vorhandene Distanzdatensatz wird in diesem begrenzten Batch nicht
umgebaut. Eventname, kanonische Identität und gespeicherte Verweise bleiben
stabil.

## Schutz und Nachweis

Vor der Korrektur wurde das verschlüsselte Backup
`sporteventmap-production-20260907T195130002Z.sembackup` erstellt und in eine
isolierte lokale Datenbank wiederhergestellt. Datenintegrität, RLS und
Nutzerisolation bestanden; der Restore dauerte 37,479 Sekunden.
Details stehen im [Recovery-Runbook](PRODUCTION_RECOVERY_RUNBOOK.md).

Die Wartung muss Vorherwerte, drei Event-/Edition-/Quellenzuordnungen und
unveränderte Nutzerreferenzen prüfen. Ereignis- und Editionsfakten werden
gemeinsam transaktional geändert; der Legacy-Sync darf die erhaltene
Distanzstruktur nicht überschreiben. Verifikationszeitpunkte werden nicht auf
heute gesetzt. Alle drei Editionen bleiben `needs_review`, ohne attestierte
Quelle. Feldänderungen werden mit einem nachvollziehbaren Änderungsgrund
auditiert; es wird keine Benutzeridentität vorgetäuscht.

Die Frischeverifikation ist erst nach vollständiger Prüfung aller 14 Werte
über den vorgesehenen administrativen Pfad zulässig. Generierte CSV-Dateien,
Eventseiten, Sitemap und Releasegrenzen werden nicht von Hand angepasst.

## Begleitende technische Arbeiten

- Vorhandene Podman-/WSL2-Laufzeit wieder gestartet; keine Neuinstallation.
- Isolierter Neuaufbau aus allen 48 lokalen Migrationen, SQL-Lint und
  **22/22 RLS-/Auth-Tests erfolgreich**. Ein redundanter zweiter Datenbankreset
  entfällt; der Runner prüft ausdrücklich, dass keine Testvolumes fortbestehen.
- Veraltete Testannahmen korrigiert: Eine Inhaltsprüfung ersetzt nicht den
  vollständigen Frischenachweis. Admin-/Feedback-Tests verwenden tatsächlich
  erlaubte Rollen; Datenbankrechte wurden nicht erweitert.
- Source-Monitor schützt `html`/`body` mit Cookie-Zustandsklassen davor, als
  Consentbanner entfernt zu werden. Echte Banner werden weiterhin entfernt.
  Normalisierung `sem-v3`, Workerkennung
  `source-monitor-4.1.4-phase-a-shadow-root-consent-fix`.
- Regressionstests und unabhängiges Review bestanden. Lokale Gegenproben mit
  aktuellen offiziellen Seiten erhalten jetzt 5.535 Zeichen beim Mülheimer
  Firmenlauf und 12.114 beim BraunenBerg-Lauf, statt jeweils leerem Inhalt.
  Ein erfolgreicher gewöhnlicher HTTP-Abruf belegt noch nicht die Behebung des
  zuvor gemeldeten IP-gepinnten Verbindungsfehlers bei Braunenberg.

## Abschlussnachweise

Das [Apply-Paket](../supabase/maintenance/20260907_p0_event_facts_batch_01.sql),
der [Rollback](../supabase/maintenance/20260907_p0_event_facts_batch_01_rollback.sql)
und die [Nachprüfung](../supabase/maintenance/20260907_p0_event_facts_batch_01_verify.sql)
wurden unabhängig geprüft. Apply, Verify und Rollback bestanden als getrennte
Transaktionen auf der tatsächlichen lokalen Production-Wiederherstellung.
Die Wiederholungssperre lehnte eine erneute Anwendung erwartungsgemäß ab.

Die erste produktive Anwendung brach vor Änderungen ab, weil ein Quellenlauf
aktiv war. Nach dessen Abschluss wurde das **unveränderte** Paket erfolgreich
angewendet. 13 private Vorher-/Nachhersnapshots einschließlich Batchmanifest
und 37 automatische Feld-Auditeinträge bestätigen den Änderungssatz. Die
Nachprüfung bestand; alle drei öffentlichen Frischeentscheidungen bleiben
`false`. Die vorhandenen Verifikationsdaten vom 2. Juni beziehungsweise
4. September wurden nicht auf heute gesetzt. Events, Editionen, Quellen und
Nutzerreferenzen wurden weder angelegt noch gelöscht.

| Nachweis | Ergebnis |
| --- | --- |
| `staging:edition:local` | 48 Migrationen, SQL-Lint und 22/22 RLS-/Auth-Tests bestanden |
| `test:source-monitor` | Alle vier Gruppen bestanden; SSRF-, TLS- und Pinning-Regeln erhalten |
| `test:edition-lifecycle` | Alle Gruppen bestanden |
| `audit:anon` nach Faktenkorrektur | Bestanden |
| `audit:freshness:production` nach Faktenkorrektur | Bestanden, nur lesend |
| Apply/Verify/Rollback im Restore | Bestanden, Wiederholung abgelehnt |
| Produktiver Faktenpostflight | Bestanden; 3 Events/Editionen, 13 Snapshots, 37 Auditeinträge |
| Restore-Testumgebung | Exakte Testcontainer, Volumes und entschlüsseltes Verzeichnis entfernt |
| `data:refresh-public` | Vor Schreibzugriff blockiert: 332 Discovery, 989 Archiv, 0 % Frische, 49,40 % Vollständigkeit |
| Website-Upload | Kein neues Preview oder Production-Deployment; Release bleibt v84 |

Technische Änderungen sind mit `bec5856` auf GitHub `main` gesichert. Der
vorausgehende vollständige technische Lauf mit 83 Browserfällen bleibt für den
unveränderten Website-Code maßgeblich; die oben genannten Prüfungen decken den
jetzigen Backend-/Teständerungssatz zusätzlich ab.

## Gezielter Worker-Rollout

`event-source-check` wurde von Plattformversion 19 auf **20** aktualisiert.
Alle elf zurückgelesenen Quelldateien entsprechen dem geprüften lokalen Stand;
nur Core-Normalisierung und Workerkennung wurden geändert. `verify_jwt=true`
blieb erhalten. Bundle-SHA256:
`04c1c1562da650b8a00c13dcb9b8ae620b3965837708db078e788553007061d1`.
Die elf Dateien der Version 19 sind für einen gezielten erneuten Deploy im
ignorierten `exports/p0-batch-20260907/worker-v19-rollback.json` gesichert.

Zwei begrenzte Quellenläufe wurden über die bestehenden Scheduler-Credentials
angestoßen, ohne Secrets auszugeben oder zu rotieren:

- **Mülheimer Firmenlauf:** Request 6492, Lauf 4939, Resultat 2649. HTTP 200,
  IP-gepinnter Abruf und semantischer Hash erfolgreich, `sem-v3` und Worker
  `4.1.4` bestätigt. Der bisherige `empty_content`-Fehler ist behoben.
- **BraunenBerg-Lauf:** Request 6493, Lauf 4940, Resultat 2650. Weiterhin
  `pinned_connect_error: operation canceled`, regulärer Retry eingeplant.
  Der Transport wurde nicht umgangen.

Der dedizierte `action:smoke` wurde mangels vorhandener lokaler Admin-/Smoke-
Credentials nicht ausgeführt; die echten Quellenläufe ersetzen nicht alle
neun Einzelchecks dieses Smokes. Beide Lifecycle-Autopublishflags bleiben
`false`. In diesem Quellen-Testfenster entstanden keine fachlichen
Feldänderungen und keine veröffentlichten Ergebnisdatensätze. Die Editionen
blieben prüfbedürftig.

## Nächste P0-Arbeit: Produktionsschema gezielt abgleichen

Die Quellenläufe legen einen bereits vorhandenen Unterschied zwischen Worker
und Datenbankschema offen. Die in Production fehlenden Migrationen aus
`20260815` bis `20260818` passen zu den konkret fehlenden Objekten:

- Tabelle `event_field_controls` fehlt.
- In `event_change_proposals` fehlen `field_name` und `normalized_value`.
- RPCs `record_extraction_proposals`, `simulate_stage_four_for_crawl`,
  `record_stage_four_crawl_automation` und
  `record_stage_four_shadow_observations` fehlen.

Dadurch scheitern Extraktionskontext und nachgelagerte Automations-/Shadow-
Schritte. Die vorhandenen Kontexttabellen gewähren bereits die erforderlichen
Service-SELECT-Rechte; pauschale zusätzliche Grants lösen den Fehler nicht.
Die Differenz ist gegen das vollständige aktuelle Production-Schema und die
historisch abweichenden Migrationen zu prüfen, bevor ein gezieltes,
transaktionales Nachziehpaket mit Restoreprobe entsteht. Kein blindes `db push`
und kein bloß formales Nachtragen der Migration-History.

Zusätzlich zählt `lifecycle.results` derzeit auch eine ablehnende RPC-Antwort
als Ergebnis. Der gemeldete Wert 1 bedeutete beim Quellenlauf daher keine
Veröffentlichung; für beide Testresultate existieren tatsächlich null
Ergebniszeilen. Diese Zählung gehört in die nächste begrenzte Korrektur.

Parallel bleiben die vollständigen Fachreviews, wepLAUF-Distanz-/Geoklärung,
Braunenbergs Verbindungsproblem und mindestens 68 zusätzliche gültige künftige
Discovery-Editionen offen. Erst bei erfüllten Bestands- und Frischegrenzen folgen
Export, gebundene Audits, vollständige Releaseabnahme und Wrangler-Upload.
