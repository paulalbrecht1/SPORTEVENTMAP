# Korrektur des vollständigen manuellen Pflegewegs

Stand: 29. September 2026. Implementierung und echte lokale Akzeptanz abgeschlossen;
Produktionsrollout wird vorbereitet. Diese Fassung behauptet noch keine
Produktionsfreigabe.

## Korrigierte Fehler

- Bestehende reguläre `/event/<slug>/`-Seiten laden die kanonischen öffentlichen
  Daten. Alte widersprechende Kernangaben werden ersetzt; ergänzende geprüfte
  Strecken-/Anreiseinformationen bleiben erhalten. Saisonplaner-Identitäten
  bleiben gebunden.
- Enddatum, Startzeit, Mindest-/Höchstgebühr, Währung und Teilnehmerlimit
  sind Teil beider öffentlichen Views, der Anzeige und des Speichervergleichs.
  Fehlende Spalten gelten auch bei einer bewussten Löschung als Fehler.
- Der Freshness-Guard liest die tatsächliche `decisions`-Antwort. Fehlende,
  falsche oder nicht erreichbare Entscheidungen erzeugen keinen Frischenachweis.
- „Events pflegen“ enthält versionierte, idempotente und auditierte
  Einzelentscheidungen für Vorschläge, Quellenaufgaben, Hinweise und
  editionsgebundene Datumskonflikte. Originalbeobachtungen bleiben erhalten.
- Die Erfolgskontrolle lädt eine echte normale Detailseite in einem
  gleichartigen Browserrahmen, vergleicht deren nach Rendern bereitgestellten
  Datenstand und lädt die offene Karte/Liste neu. Ein API-Erfolg allein reicht
  nicht mehr für „Öffentlich aktualisiert“.

## Grenzen

Der Website-Admin benötigt keine Codex-/LLM-Anmeldung. Nur ausdrücklich geprüfte
Felder erhalten neue Verifikationen. Alle bisherigen 14 Kernprüfungen und
Publikationsregeln bleiben bestehen. Unbekannte, historische oder anderweitig
gesperrte Ausgaben werden nicht pauschal als aktuell gezählt.

Die UI-Veröffentlichung ersetzt keine fachliche Freigabe des alten Exports.
Bei bestehenden statischen HTML-Dateien wird allein die URL des gemeinsamen
Detailskripts versioniert. Alle anderen Bytes und Katalogzeitstempel sind an die
bisherige Produktionsbasis gebunden und werden erneut geprüft.

## Nachweise

`npm run test:manual-workflow:local` ist erfolgreich beendet: alle 58 Migrationen
in einer isolierten leeren Datenbank, **90 SQL-Prüfungen** und **12 echte
Browser-Prüfgruppen** mit lokaler GoTrue-Anmeldung über das Websiteformular.
Erfolgreiche RPC-/Datenantworten wurden dabei nicht gemockt.

Geprüft: sechs optionale Angaben und 14 Feldprüfungen bis zur anonymen normalen
Detailseite; offenes Karten-/Listen-Refresh; erneutes Laden; echter HTTP-409-Konflikt
mit Eingabeerhalt; verlorene Antwort nach tatsächlichem Commit mit genau einem
Receipt; Publikationsausfall und Wiederholung; asynchroner Ladefehler ohne falsche
Erfolgsmeldung; neue Edition und Datumswiderspruch, bewusste Klärung im Formular,
separate Freigabe und anonymer regulärer Detaillink; unveränderte Historie,
Ergebnis- und Plannerverknüpfungen; tatsächlicher Nichtadmin-403.

Der Lauf `exports/manual-workflow-acceptance/run-rkY21P/` enthält die Berichte.
Keine Produktionsanfragen, keine Browserfehler; Testcontainer, Volumes und
Browser wurden bereinigt. Vorherige Läufe deckten einen reservierten Windowsport,
Testfixturefehler und einen echten Bedienungsfehler nach dem Commit auf. Der
Runner prüft die Ports; das erneuerte Formular bleibt bis zum Abschluss der
Publikationskontrolle korrekt gesperrt.

Zusätzlich: **27 Paketprüfungen** einschließlich Manipulationsablehnung und
strikter Ableitung der statischen Skriptreferenzen aus der alten Produktionsbasis.
Die finale vollständige technische Suite `npm run test:code` ist erfolgreich,
einschließlich aller **171 Browsertests**. Migrations-/Deployment-Ergebnisse
werden nach Abschluss ergänzt. Private Logs und Belege bleiben unter `exports/`
und werden nicht im öffentlichen Git-Repository veröffentlicht.

## Bereitstellung

Vorbereitet ist ausschließlich
`20260929150626_manual_workflow_publication_and_review.sql`.
Sie ergänzt die öffentlichen Views und vorhandenen Speicher-/Reviewweg; sie
ändert keine Eventfakten und gibt keine Kandidaten frei. Die abweichende ältere
Produktionshistorie erlaubt weiterhin kein pauschales `db push`.

Vor dem Rollout wurde das verschlüsselte Backup
`sporteventmap-production-20260929T151438208Z.sembackup` erfolgreich erstellt und
geprüft. Der UI-Release basiert auf der nachgewiesenen v91
`https://01a6b663.sporteventmap.pages.dev`, Release-SHA-256
`f71f7cadfcc565e87ea7fdacd5b2098974fb3933bc8391dcb702757aa2b2cfff`.

Die [Bedienungsanleitung](MANUAL_EVENT_MAINTENANCE.md) beschreibt die tatsächlichen
Formularaktionen. Der [frühere v91-Prüfbericht](MANUAL_WORKFLOW_ACCEPTANCE_20260929.md)
bleibt als historischer Fehlernachweis erhalten.
