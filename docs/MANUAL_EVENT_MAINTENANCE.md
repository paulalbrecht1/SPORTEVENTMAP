# Events manuell pflegen

Stand: Workflowkorrektur v92 vom 29. September 2026. Rollout- und Prüfnachweise
stehen im [Korrekturbericht](MANUAL_WORKFLOW_FIX_20260929.md). Die frühere
[Abnahme von v91](MANUAL_WORKFLOW_ACCEPTANCE_20260929.md) bleibt als Fehlernachweis erhalten.

Für die tägliche Pflege genügt dein **SportEventMap-Administratorkonto**.
Du brauchst weder Codex, KI-Tokens noch ein Supabase- oder Cloudflare-Konto.
Offizielle Seiten selbst lesen, dann im Website-Admin **Events pflegen** öffnen.
Normale Webseitenbesucher dürfen diese Schreibfunktion nicht verwenden.

## Wie bestätige ich ein Datum?

1. Event suchen und die richtige **Ausgabe auswählen**.
2. **Offizielle Quelle öffnen** und das Datum selbst vergleichen.
3. Unter **Was möchtest du tun?** die Bestätigung wählen. Beim Datum
   **An Quelle geprüft** markieren. Quellen-URL und **Prüfnotiz** ergänzen.
4. **Änderungen prüfen**, Übersicht lesen und **Verbindlich speichern**.

Die Prüfnotiz sollte knapp erklären, was die Quelle belegt (12 bis 1.000 Zeichen).
Bei einer zu langen Notiz bleiben deine Eingaben erhalten; kürzen und erneut prüfen.

Ein unverändertes Datum lässt sich erneut bestätigen. Nur angehakte Angaben
bekommen einen Nachweis. Für die vollständige Aktualität einer veröffentlichten
nächsten Ausgabe müssen alle 14 genannten Kernangaben geprüft und blockierende
Hinweise geklärt sein. Vollständigkeit und Aktualität bleiben getrennt.

## Wie korrigiere ich eine Ausgabe?

**Bestehende Ausgabe korrigieren** wählen, falsche Werte ändern und die Quelle
angeben. Veranstaltungsstatus und Anmeldestatus sind getrennt. Wettbewerbe
stehen in eigenen Zeilen; Kilometer und Höhenmeter beachten.
**Optionale Details und Veranstalterangaben** enthalten unter anderem Enddatum,
Startzeit, Gebühren, Währung und Teilnehmerlimit.

Leere oder eingeklappte Felder löschen nichts. Bestehende Werte nur mit
**Bewusst entfernen** löschen. Name, Ort, Adresse, Geodaten, Sport und
Beschreibung gelten gemeinsam für alle Ausgaben; die übrigen Angaben gehören
zur ausgewählten Ausgabe. Ihre Identität und Ergebnis-/Planerverknüpfungen bleiben erhalten.

Bei Fehlern bleiben Eingaben erhalten. Bei **zwischenzeitlich geänderten Daten**
auf **Aktuellen Stand laden** klicken, vergleichen und erneut prüfen.
Bearbeitete Werte und Notizen bleiben erhalten; Prüfhäkchen müssen neu gesetzt
werden. Ist die Antwort unklar, denselben **Verbindlich speichern**-Vorgang
wiederholen. Er erzeugt keine zweite Ausgabe.

## Wie kläre ich einen offenen Hinweis?

Unter **Offene Hinweise hier bearbeiten** stehen die Hinweise zur gewählten
Ausgabe. Zuerst etwaige Formularänderungen speichern. Dann je Hinweis eine
Entscheidung wählen, nachvollziehbar begründen, **Entscheidung prüfen** und
**Verbindlich speichern**. Jede Entscheidung wird mit Admin, Serverzeit und
vorherigem Stand protokolliert; sie bestätigt keine ungeprüften Felder.

Falsche Crawler-Vorschläge begründet ablehnen oder richtige übernehmen.
Falls der Vorschlag selbst korrigiert werden muss, zuerst die richtigen Werte
im Formular speichern und danach den falschen Vorschlag ablehnen.
Quellenaufgaben, Datenhinweise und gemeldete Fehler erst nach tatsächlicher
Klärung schließen. Eine Entscheidung ersetzt weder Quellenbeleg noch Freigabe.
Nicht behobene optionale Hinweise, etwa ein fehlendes Bild, dürfen offen bleiben;
sie dürfen nicht allein für einen grünen Status als erledigt markiert werden.

Bei einem abweichenden Kandidatentermin zuerst Datum und gegebenenfalls
Enddatum anhand der offiziellen editionsbezogenen Quelle bestätigen und
speichern. Dann die **Abweichung der erkannten Ausgabe** ausdrücklich klären.
Der Originalbefund bleibt erhalten. Die Entscheidung gilt nur für genau diese
Ausgabe, Termine und Quelle. Neue widersprüchliche Befunde müssen erneut
geprüft werden. Jahres-, Identitäts- und Dublettenkonflikte werden nicht damit
übersprungen.

## Wie lege ich die nächste Edition an?

Vorhandene Entwürfe zuerst auswählen und weiterbearbeiten. Andernfalls
**Neue Ausgabe als Entwurf anlegen** wählen, Ausgabejahr eintragen und einen
bereits erkannten passenden Kandidaten auswählen, sofern vorhanden.
Bei mehreren Ausgaben im selben Jahr ein anderes **Ausgabekürzel** verwenden,
zum Beispiel „herbst“. Es wird kein Vorjahresdatum automatisch fortgeschrieben.

Unbekannte Angaben dürfen im privaten Entwurf fehlen. Termine, Wettbewerbe,
Anmeldung und Verifikationen werden nicht aus dem Vorjahr übernommen.
Die historische Ausgabe bleibt erhalten.

Zum Veröffentlichen den gespeicherten Entwurf auswählen, alle 14 im Formular
genannten Kernangaben an offiziellen Quellen prüfen und markieren. Adresse,
Koordinaten und Beschreibung stehen bei den optionalen Details, gehören aber
zum vollständigen Freigabenachweis. Blockierende Hinweise klären. Dann
**Nach vollständiger Prüfung zur Veröffentlichung freigeben** auswählen,
Änderungsübersicht kontrollieren und speichern.

Fehlende Belege, Dubletten, Veröffentlichungssperren oder eine frühere noch
aktuelle Ausgabe können die Freigabe weiter verhindern. Dann bleibt der Entwurf
privat. Eine neue Ausgabe wird nicht durch Veränderung der alten erzwungen.

## Woran erkenne ich, dass die Änderung öffentlich angekommen ist?

**In der Datenbank gespeichert und neu geladen** bestätigt nur das Speichern.
Erst **Öffentlich aktualisiert: Normale Detailseite geprüft** bestätigt zusätzlich
den Vergleich mit dem anonymen Live-Katalog und die tatsächlich geladene
normale Detailseite. Bei einer nächsten Ausgabe werden auch Karte und Liste
mit den gespeicherten Werten neu geladen. **Öffentliche Detailseite öffnen**
führt zur überprüften Seite.

Bei **noch nicht vollständig verifiziert** oder einem Abruffehler:
**Öffentlichen Stand erneut prüfen**. Das prüft erneut, ohne einen weiteren
Datensatz zu speichern. Historische Ausgaben erscheinen im Archiv; Karte und
Liste zeigen jeweils die nächste geeignete Ausgabe.

Im normalen Onlinebetrieb ist pro Änderung kein Export oder Deployment nötig.
Bei einem Datenbankausfall kann ein klar gekennzeichneter älterer Export
erscheinen. Diese Ausfalldaten werden durch manuelles Speichern nicht erneuert;
dafür bleibt das bestehende vollständige Datenrelease mit seinen Qualitätsgates nötig.

Unter **Prüfergebnis** lassen sich auch **Noch keine neue Ausgabe angekündigt**
und **Quelle nicht erreichbar** dokumentieren. Dabei keine Feldbestätigungen
markieren. Beide Ergebnisse sind keine Bestätigung alter Werte.

## Bestehende Datenwege

| Zweck | Verwendeter Projektbestand |
| --- | --- |
| Dauerhafte Veranstaltung | `events` |
| Konkrete Austragung und Wettbewerbe | `event_editions`, `race_formats` |
| Offizielle Quellen und technische Abrufe | `event_sources`, `source_crawl_results` |
| Änderungsverlauf und Feldschutz | `event_audit_log`, `event_field_controls` |
| Konflikte und Nachfolgekandidaten | `event_change_proposals`, `edition_succession_candidates`, Review-Inbox |
| Karte und Liste | `public_event_discovery` über `js/event-catalog-loader.js` |
| Öffentliche Ausgabe | `public_event_archive`, gemeinsamer Live-Renderer für reguläre und dynamische Detailseiten |
| Saisonplaner und Ergebnisse | `season_planner_events.edition_id`, `edition_results` |
| Ausfalldaten und statische Seiten | `data/events.csv`, `data/event-editions-public.json`, `event/` |

Die Umsetzung ergänzt den vorhandenen Vanilla-JavaScript-Admin und die
Supabase-RPCs. Es gibt keine zweite Eventdatenhaltung. Der vorhandene Source
Monitor und die Importwege bleiben angebunden.

## Historische Migrationen und Pilotnachweise (v90/v91)

1. Datenbanksicherung und Schemaabgleich nach
   [Production-Recovery-Runbook](PRODUCTION_RECOVERY_RUNBOOK.md) durchführen.
   Die dokumentierte ältere Migration-History-Drift verbietet ein blindes
   Anwenden sämtlicher ausstehender Migrationen.
2. Die beiden neuen Migrationen in dieser Reihenfolge prüfen und anwenden:
   `20260929104600_manual_event_maintenance.sql`,
   `20260929104628_manual_edition_import_compatibility.sql`.
   Sie ändern keine fachlichen Produktionswerte und geben keine Kandidaten frei.
   Beide sind bereits produktiv. Auch der zusätzliche Hotfix
   `20260929130903_manual_maintenance_conflict_http_status.sql` ist produktiv
   angewendet und unabhängig nachgeprüft. Er meldet
   zwischenzeitliche Änderungen als HTTP 409, damit PostgREST den fachlichen
   Versionskonflikt nicht bis zum Timeout wiederholt. Die Versionsprüfung bleibt
   unverändert; dafür ist kein weiterer UI-Release nötig.
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

Die folgenden Entwicklungsergebnisse vom 29. September dokumentieren zunächst
den v90-Ausgangsstand; zusätzliche Nachweise für v91 und den Konflikt-Hotfix
stehen darunter:

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

Die nachfolgende Oberfläche **v91** ist unter
`https://01a6b663.sporteventmap.pages.dev` und der Produktionsdomain anhand der
Dateihashes geprüft. Neue Asset-Kennungen beheben den nachgewiesenen Browsercache-
Fehler; bestehende Adminsitzungen laden nach einem Neuladen den aktuellen Code.
Die echte angemeldete Oberfläche wurde danach erfolgreich für die beiden
Bestandsreviews und den Allgäu-Entwurf genutzt. Datenbankstand und öffentliche
Live-Ansichten der beiden Bestandsfälle wurden unabhängig nachgeprüft.
Statische Eventseiten und Ausfalldaten bleiben aus dem eingefrorenen bisherigen
Datenpaket; v91 stellt dafür keine neue Datenfreigabe dar.

Der anschließende Konflikt-Hotfix besteht 66 lokale SQL-Prüfungen und eine echte
HTTP-Regressionsprüfung mit PostgREST 14.14. Seine produktive Anwendung mit
PostgREST 14.5 ist unabhängig um 13:20:21 UTC bestätigt: Migration
`20260929130903`, History 47, ausschließlich der vorgesehene SQLSTATE geändert.
Rechte, alte History und Inhalts-Hashes von 15 bestehenden Tabellen/Ansichten
blieben unverändert. Der zuvor hängende echte UI-Auftrag meldet sofort den
verständlichen Versionskonflikt; Neuladen erhielt die vier bearbeiteten Werte,
erneute Übersicht und Speichern waren erfolgreich. Zusätzlich bestehen 13
Unit-Tests und zwei gezielte Browser-Konfliktfälle: Der deutsche HTTP-409-Fehler
erzeugt genau einen Speicheraufruf; Eingaben bleiben erhalten und können nach
Neuladen und erneuter Prüfung gespeichert werden. Das produktive Allgäu-Problem
enthielt einen echten Source-Monitor-Schreibvorgang, keine verlorenen
Formulareingaben. Seine fachliche Datumssperre bleibt vom Timeout-Hotfix getrennt.

Private Nachweise liegen unter `exports/p0-rollout-20260929`,
`exports/ui-release-20260929-v91`, `exports/p0-manual-pilot-20260929` und
`exports/p0-manual-http-20260929`. Den aktuellen Stand und die nächste kleine
Ergänzung zur ausdrücklichen Konfliktauflösung führt der
[P0-Abschlussplan](P0_FINISH_PLAN_20260929.md). Die Entwicklungsprüfungen erzeugen
keine produktiven Testeinträge.
