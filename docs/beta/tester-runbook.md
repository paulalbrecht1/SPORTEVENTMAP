# Tester-Runbook – geschlossene Beta mit 10–20 Personen

Stand: 4. August 2026
Release: `20260804-review-inbox-v79`

## Vor dem Start (Betreiber)

- 10–20 Personen mit unterschiedlichen Ausdauersport-Interessen auswählen; Tester-IDs statt Klarnamen in der Auswertung verwenden.
- Produktionsfreigabe erst nach Auflösung der `NO-GO`-Punkte im Go-/No-Go-Bericht erteilen.
- Je mindestens einen echten iOS-/Safari- und Android-/Chrome-Lauf einplanen.
- Zwei reale E-Mail-Anbieter für Registrierung, Bestätigung und Reset vorsehen.
- Testevents, Testeinreichungen und zuständigen Admin benennen; keine produktiven Eventdaten unkontrolliert ändern.
- Supportkontakt `kontakt@sporteventmap.com`, Testfenster, Release-Kennung und Rückmeldefrist mitteilen.
- Stage 4 unverändert lassen: `dry_run=true`, `automation_enabled=false`, `observation_enabled=false`, `observation_scheduler_enabled=false`.

## Ablauf für jede Testperson

1. Produktionsseite öffnen und eine Veranstaltung suchen.
2. Datum, Sportart und Land filtern; zusätzlich bewusst einen Nulltreffer erzeugen.
3. Mehrere passende Events anhand Liste/Karte und Eckdaten vergleichen.
4. Eine Eventdetailseite öffnen und den offiziellen Veranstalterlink prüfen.
5. Registrieren oder einloggen und ein Event favorisieren.
6. Das Event in die Saisonplanung aufnehmen; Priorität, Zielzeit, Notiz und Status setzen.
7. Ausloggen, Browser neu laden oder schließen und erneut einloggen.
8. Prüfen, ob Favorit und Saisonplaneintrag samt Feldern unverändert vorhanden sind.
9. Einen fehlenden oder möglicherweise falschen Eintrag über Einreichung/Feedback melden. Nur eindeutig als Test markierte Daten verwenden.
10. Den Feedbackbogen unten ausfüllen; keine Passwörter, Tokens oder vollständigen Reset-Links eintragen.

Ein Admin prüft danach die zugehörige Testeinreichung, dokumentiert Status und Entscheidung und stellt sicher, dass keine unbeteiligten Datensätze verändert wurden.

## Beta-Feedbackbogen

| Feld | Eintrag |
|---|---|
| Tester-ID | |
| Datum / Release | `20260804-review-inbox-v79` |
| Gerät | |
| Betriebssystem | |
| Browser und Version | |
| Mobile oder Desktop | |
| Sportart | |
| gesuchtes Event | |
| erfolgreiche Suche (ja/nein; kurzer Hinweis) | |
| Nulltreffer (ja/nein; verständlich?) | |
| Favorit gespeichert und nach erneutem Login vorhanden | |
| Saisonplan gespeichert und nach erneutem Login vollständig | |
| Datenfehler gemeldet (Referenz, keine sensiblen Daten) | |
| größtes Problem | |
| Gesamteindruck (1–5 plus kurzer Kommentar) | |
| erneute Nutzung wahrscheinlich (ja/vielleicht/nein; warum?) | |

## Triage und Betrieb

- `kritisch`: Fremddatenzugriff, Rechteausweitung, Auth-Umgehung, Datenverlust oder unkontrollierte Veröffentlichung. Beta stoppen, Nachweise sichern, keine weiteren Schreibtests.
- `hoch`: Registrierung/Login/Reset, Favoriten-, Planner- oder Admin-Kernablauf für mehrere Personen unbrauchbar. Keine neuen Tester einladen, bis behoben.
- `mittel`: reproduzierbarer Funktions- oder Mobilefehler mit Workaround. Erfassen, priorisieren und Releaseentscheidung aktualisieren.
- `niedrig`: Text-, Layout- oder Komfortproblem ohne Daten-/Kernablaufrisiko. Für Folgeiteration sammeln.

Täglich prüfen: neue Auth-Probleme, fehlgeschlagene Persistenz, Einreichungsstau, Security-Advisor-Warnungen und Supportmeldungen. Nur die vorhandenen Feedback-/Adminwerkzeuge nutzen; für diese kleine Beta wird keine zusätzliche Analytics-Infrastruktur eingeführt.

## Abschluss

Nach dem Testfenster die Feedbackbögen nach Tester-ID zusammenführen, kritische und hohe Probleme gegen die Testmatrix prüfen und den Go-/No-Go-Bericht aktualisieren. Testkonten und Testdaten nur über einen dokumentierten, nutzerspezifischen Bereinigungsweg entfernen. Die acht Stage-4-Migrationen bleiben bis zu einem separaten ausdrücklichen Auftrag unangetastet.
