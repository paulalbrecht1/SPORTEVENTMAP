# Events manuell pflegen

Stand: 29. September 2026, 12:39 UTC. Beide Backend-Migrationen und die
Pflegeoberfläche v90 sind produktiv ausgerollt und geprüft. Ein Cacheproblem
bei bereits geöffneten Adminsitzungen wird mit v91 korrigiert; diese Korrektur
und die fachlichen Pilot-Schreibnachweise stehen noch aus.
Der tägliche Ablauf benötigt keine KI und keinen LLM-Aufruf.

## Vor dem Bearbeiten

Als Administrator anmelden und im Adminbereich **Events pflegen** öffnen.
Das Event suchen und die gewünschte Ausgabe auswählen. Jahr und Datum prüfen:
Eine Änderung gilt für die gewählte Ausgabe, eine neue Ausgabe bekommt eine
eigene Identität. Bereits vorhandene Entwürfe zuerst weiterbearbeiten.

Die offizielle Quelle öffnen und die Angaben selbst nachlesen. Nur tatsächlich
geprüfte Angaben markieren. Ein Häkchen bedeutet eine bewusste Quellenprüfung;
Speichern allein bestätigt keine Angaben. Unbekanntes bleibt unbekannt.

## Wie bestätige ich ein Datum?

1. Event und Ausgabe auswählen und die offizielle Quelle öffnen.
2. Das eingetragene Datum mit der Quelle vergleichen.
3. Bei **Was möchtest du tun?** „Angaben als weiterhin korrekt bestätigen“
   wählen. Beim Datum **An Quelle geprüft** markieren, die **Persönlich
   geprüfte Quellen-URL** und eine verständliche **Prüfnotiz** eintragen.
4. **Änderungen prüfen** wählen, die Übersicht lesen und anschließend
   **Verbindlich speichern** drücken.

Das Datum kann unverändert bestätigt werden. Andere Felder bekommen dadurch
keinen neuen Prüfnachweis. Ein einzelnes bestätigtes Datum macht auch nicht
automatisch die ganze Ausgabe frisch.

## Wie korrigiere ich eine Ausgabe?

Die betreffende Ausgabe auswählen, **Bestehende Ausgabe korrigieren** wählen,
die falschen Angaben berichtigen und die Quelle der Korrektur angeben.
Veranstaltungsstatus (zum Beispiel verschoben)
und Anmeldestatus (zum Beispiel ausgebucht) unabhängig einstellen.
Wettbewerbe einzeln pflegen; Kilometer- und Meterangaben beachten. Bei einem
Triathlon lassen sich Schwimmen, Radfahren und Laufen getrennt eintragen.
Weitere Angaben stehen im einklappbaren Bereich.

Name, Ort, Adresse, Geodaten, Sport und Beschreibung gehören zum gemeinsamen
Event. Änderungen daran gelten für alle Ausgaben; die Oberfläche weist darauf
hin. Termin, Wettbewerbe und Anmeldung gehören zur ausgewählten Edition.

Ein leeres Eingabefeld löscht keinen bisherigen Wert. Für eine beabsichtigte
Löschung die dafür vorgesehene Löschoption verwenden. Vor dem Speichern zeigt
die Übersicht Änderungen, Löschungen und ausgewählte Prüfungen.

Bei einem Fehler bleiben die Eingaben erhalten. Bei einer zwischenzeitlichen
Änderung zuerst den aktuellen Stand laden und die Änderungen abgleichen.
Nach einer unklaren Netzwerkantwort denselben Speicherversuch wiederholen;
die Wiederholung verwendet dieselbe Vorgangskennung.

Im einklappbaren **Prüfverlauf** stehen Quelle, Zeitpunkt und Notiz der letzten
manuellen Prüfung. Er zeigt außerdem, wenn sich der geprüfte Wert danach
geändert hat. Dann ist eine erneute Quellenprüfung notwendig.

## Wie lege ich die nächste Edition an?

Zuerst prüfen, ob die Ausgabe bereits als Edition oder Kandidat vorhanden ist.
Andernfalls **Neue Ausgabe als Entwurf anlegen** wählen und das Jahr angeben.
Das **Ausgabekürzel bei mehreren Ausgaben pro Jahr** bleibt für die reguläre
Ausgabe bei „main“. Für eine weitere Ausgabe im selben Jahr ein anderes
Kürzel wie „herbst“ verwenden. Ein Datum wird nicht aus dem Vorjahr berechnet.

Nur belegte Angaben eintragen. Ein Entwurf darf unvollständig bleiben und ist
nicht öffentlich. Wettbewerbe, Anmeldung, Preise, Termine und Prüfnachweise
werden nicht ungeprüft aus dem Vorjahr übernommen. Vorhandene Saisonpläne und
Ergebnisse behalten ihre bisherige Editionszuordnung.

Zum Veröffentlichen den gespeicherten Entwurf auswählen, die 14 im Formular
genannten Kernangaben anhand offizieller Quellen prüfen und einzeln markieren.
Adresse, Koordinaten und Beschreibung stehen unter **Optionale Details und
Veranstalterangaben**; für einen vollständigen Frischenachweis werden sie
ebenfalls benötigt.
**Nach vollständiger Prüfung zur Veröffentlichung freigeben** wählen und die
Änderungsübersicht bestätigen. Offene Konflikte oder fehlende Belege werden
angezeigt; der Entwurf bleibt bei gescheiterter Freigabe gespeichert. Eine
Folgeedition kann an der bestehenden Regel scheitern, dass die Frischeprüfung
die aktuell nächste Discovery-Ausgabe verlangt. Die frühere Edition wird
deshalb nicht automatisch verändert oder archiviert.

Für eine bereits veröffentlichte Ausgabe können dieselben 14 Prüfungen einen
vollständigen Frischenachweis erneuern. Nur vollständige, konfliktfreie
Nachweise zählen für die unveränderte P0-Frischegrenze.

## Woran erkenne ich, dass die Änderung öffentlich angekommen ist?

**Gespeichert** bestätigt den erneut gelesenen Datenbankstand.
Die zusätzliche Prüfung des **Live-Katalogs** liest die öffentlichen Ansichten
ohne Administratoranmeldung und vergleicht die Werte. Ein veröffentlichter
Archiveintrag muss nicht auf der Karte erscheinen: Die Karte zeigt weiterhin
nur die nächste geeignete veröffentlichte Edition eines Events.

**Statische Seiten und Ausfalldaten: hier nicht geprüft** bedeutet, dass die
gespeicherten Ausfalldaten und vorab erzeugten Eventseiten separat geprüft
werden müssen und noch einen älteren Stand haben können. Ein Datenbankerfolg
ist kein Website-Release. Bei einem fehlgeschlagenen
öffentlichen Abruf die öffentliche Prüfung erneut ausführen. Sie speichert
keine zweite Ausgabe.

Solange das bestehende Datenqualitäts-Gate den Export sperrt, bleibt die
statische Veröffentlichung offen. Die Pflegeansicht hebt diese Sperre nicht auf.

Unter **Prüfergebnis** lassen sich auch „Noch keine neue Ausgabe angekündigt“
und „Quelle nicht erreichbar“ dokumentieren. In beiden Fällen keine
Feldbestätigungen markieren. Eine nicht erreichbare Quelle erzeugt keinen
Frischenachweis.

## Bestehende Datenwege

| Zweck | Verwendeter Projektbestand |
| --- | --- |
| Dauerhafte Veranstaltung | `events` |
| Konkrete Austragung und Wettbewerbe | `event_editions`, `race_formats` |
| Offizielle Quellen und technische Abrufe | `event_sources`, `source_crawl_results` |
| Änderungsverlauf und Feldschutz | `event_audit_log`, `event_field_controls` |
| Konflikte und Nachfolgekandidaten | `event_change_proposals`, `edition_succession_candidates`, Review-Inbox |
| Karte und Liste | `public_event_discovery` über `js/event-catalog-loader.js` |
| Öffentliche Ausgabe | `public_event_archive`, vorhandene dynamische Detailseite |
| Saisonplaner und Ergebnisse | `season_planner_events.edition_id`, `edition_results` |
| Ausfalldaten und statische Seiten | `data/events.csv`, `data/event-editions-public.json`, `event/` |

Die Umsetzung ergänzt den vorhandenen Vanilla-JavaScript-Admin und die
Supabase-RPCs. Es gibt keine zweite Eventdatenhaltung. Der vorhandene Source
Monitor und die Importwege bleiben angebunden.

## Deployment und Betrieb

1. Datenbanksicherung und Schemaabgleich nach
   [Production-Recovery-Runbook](PRODUCTION_RECOVERY_RUNBOOK.md) durchführen.
   Die dokumentierte ältere Migration-History-Drift verbietet ein blindes
   Anwenden sämtlicher ausstehender Migrationen.
2. Die beiden neuen Migrationen in dieser Reihenfolge prüfen und anwenden:
   `20260929104600_manual_event_maintenance.sql`,
   `20260929104628_manual_edition_import_compatibility.sql`.
   Sie ändern keine fachlichen Produktionswerte und geben keine Kandidaten frei.
3. Datenbankprüfungen und Admin-/Nicht-Admin-Zugriffe prüfen, danach die Website
   mit dem zusätzlichen Modul `js/manual-event-maintenance.js` veröffentlichen.
4. Statische Daten weiterhin mit `npm run data:refresh-public` aktualisieren.
   Dieser vorhandene Ablauf exportiert Supabase, prüft Daten und erzeugt
   Eventseiten sowie Sitemap. Fehler müssen behoben und derselbe Ablauf erneut
   ausgeführt werden; keine Ersatzdaten von Hand in Exporte schreiben.
5. Veröffentlichung und Hashprüfung des erzeugten Pakets gemäß
   [Local Publish](LOCAL_PUBLISH.md) durchführen. Die vorhandenen Qualitätsgates
   und die Trennung zwischen Git-Push und Website-Deployment bleiben bestehen.

Kein zusätzlicher privilegierter Browserschlüssel und kein neues LLM-Secret
werden benötigt. Produktive Migration und Website-Release sind gesonderte
Betriebsschritte; lokale Tests weisen keinen produktiven Rollout nach.

## Ausgeführte Prüfungen und Grenzen

Die folgenden Ergebnisse stammen aus der Entwicklung am 29. September 2026:

Für den lokalen Datenbanktest werden die installierten Projektabhängigkeiten
und eine laufende lokale Docker-/Podman-Engine benötigt. Der Test erstellt
einen separaten Stack, verwendet keine Produktionsverbindung und räumt
seine eigenen Testressourcen anschließend auf.

- `npm run test:manual-maintenance`: 11 bestandene Unit-Tests, unter anderem
  für gezielte Feldänderungen, explizites Löschen, Wiederholungen nach unklarer
  Antwort und die Prüfung des öffentlichen Datenstands.
- `npm run test:manual-maintenance:local`: Alle 56 Migrationen wurden auf
  einer frischen, isolierten lokalen Supabase-Datenbank angewendet; 66
  SQL-Prüfungen bestanden. Geprüft wurden unter anderem Adminrechte,
  Feldschutz, Editionsidentität, historische Verknüpfungen, Quellenfehler,
  Kandidaten und Freigabefehler. Zusätzliche getrennte Datenbanksitzungen
  belegten Commit und erneutes Laden, anonymes öffentliches Lesen,
  serverseitige Prüfer/Zeitstempel und idempotente Wiederholung. Zwei wirklich
  parallele Schreibsitzungen ergaben genau einen Commit und einen
  Versionskonflikt.
- Die gezielte Browserprüfung `tests/e2e/manual-event-maintenance.spec.mjs`
  bestand mit 14 Fällen einschließlich mobiler und Desktopansicht. Diese
  UI-Prüfungen verwenden kontrollierte RPC-Antworten; die echte Speicherung
  und Datenbanksicherheit werden separat durch den lokalen Datenbanklauf
  geprüft.
- `npm run test:code`: Der abschließende vollständige Lauf bestand mit allen
  technischen Scriptgruppen, Layoutprüfungen und 159 Browserfällen. Darin
  sind die 14 neuen Pflegefälle enthalten. Bestehende Admin-Tests wurden um
  den vierten Tab ergänzt; auch die zugehörigen Kontrastprüfungen bestanden.
- `git diff --cached --check` und die Prüfung der 24 vorgesehenen Dateien auf
  private Schlüssel und Zugangsdaten waren unauffällig.
- `npm run check` bleibt am vorhandenen Datenfreigabe-Gate gesperrt: Der
  versionierte Datenqualitätsbericht enthält fünf ungeklärte, releasekritische
  Dublettenkandidaten. Die bestehenden Gates wurden nicht abgesenkt. Dieser
  Befund ist keine neue Abfrage des aktuellen produktiven Datenbestands.

Nachtrag zur P0-Fortsetzung: Die tatsächliche Produktionsbasis besitzt das
optionale Stage-4-Subsystem nicht. Der entsprechende Migrationsabschnitt
prüft jetzt dessen Vorhandensein, ohne die übrigen Schema-Prüfungen zu lockern.
Ein frischer Produktions-Restore mit 44 historischen Migrationen besteht beide
neuen Migrationen und 64 anwendbare SQL-Prüfungen. Nur zwei Stage-4-Prüfungen
sind dort ausdrücklich nicht anwendbar. Die Hashes von 14 bestehenden
Tabellen/Ansichten und bisherige Frischeentscheidungen bleiben unverändert.
Der vollständige lokale Stand besteht zusätzlich alle 66 SQL-Prüfungen.

Produktionsnachtrag vom 29. September, 12:39 UTC: Beide Migrationen sind unter
den vorgesehenen Versionsnummern `20260929104600` und `20260929104628` atomar
angewendet; die History enthält 46 statt 44 Einträge. Alle alten History-Zeilen,
die Inhalte von 15 bestehenden Tabellen/Ansichten, Nutzerverknüpfungen und
bisherige Frischeentscheidungen blieben unverändert. Zeitpläne und wartende
Quellenaufträge wurden unverändert wiederhergestellt beziehungsweise erhalten.
Anonyme und Nicht-Admin-Aufrufe wurden in der echten Datenbank abgewiesen.
Beide neuen RPCs lieferten auch über HTTP ohne Sitzung 401 / 42501; die
bestehenden anonymen Live- und Freshness-Audits bestanden erneut.

Die Oberfläche v90 ist unter `https://86811745.sporteventmap.pages.dev` und
der Produktionsdomain geprüft. Dieser UI-Release aktualisiert keine statischen
Eventdaten. Bestehende Browsercaches können in bereits geöffneten Adminsitzungen
noch ältere JavaScript-Dateien liefern. Die dafür vorbereitete Korrektur v91
ist noch in Arbeit. Es wurden bislang keine fachlichen Pilotänderungen über
den neuen Pflegeweg gespeichert; eine positive produktive Speicherprüfung
wird deshalb noch nicht behauptet. Private Rolloutbelege liegen unter
`exports/p0-rollout-20260929`. Den aktuellen Stand führt der
[P0-Abschlussplan](P0_FINISH_PLAN_20260929.md).
Testdatensätze, lokale Testcontainer und deren Volumes wurden entfernt.
