# Korrektur des vollständigen manuellen Pflegewegs

Stand: 29. September 2026, 16:02 UTC. Die vier Fehler sind korrigiert und als
v92 mit beiden Backendergänzungen produktiv ausgerollt. Der vollständige echte
Allgäu-Pilot ist erfolgreich: Konfliktklärung, gezielte Bestätigung, getrennte
Veröffentlichung, Karte/Liste und normale öffentliche Detailseite einschließlich
Neuladen. Die tägliche Pflege benötigt nur das Website-Administratorkonto.

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
einschließlich aller **171 Browsertests**. Private Logs und Belege bleiben unter `exports/`
und werden nicht im öffentlichen Git-Repository veröffentlicht.

## Bereitstellung

Produktiv angewandt ist
`20260929150626_manual_workflow_publication_and_review.sql`.
Sie ergänzt die öffentlichen Views und vorhandenen Speicher-/Reviewweg; sie
ändert keine Eventfakten und gibt keine Kandidaten frei. Die abweichende ältere
Produktionshistorie erlaubt weiterhin kein pauschales `db push`.

Vor dem Rollout wurde das verschlüsselte Backup
`sporteventmap-production-20260929T151438208Z.sembackup` erfolgreich erstellt und
geprüft. Der UI-Release basiert auf der nachgewiesenen v91
`https://01a6b663.sporteventmap.pages.dev`, Release-SHA-256
`f71f7cadfcc565e87ea7fdacd5b2098974fb3933bc8391dcb702757aa2b2cfff`.

Der erste Migrationsversuch scheiterte vor jeder Änderung an einer unzulässigen
expliziten Sperre der Erweiterungstabelle `cron.job`. Zwei unabhängige lesende
Prüfungen bestätigten den vollständigen alten Zustand. Danach wurde ausschließlich
diese Sperre entfernt; der vollständige Cronvergleich blieb erhalten. Der gezielte
zweite Versuch wurde am 29.09. um 15:42:35 UTC committed. Die unabhängige
Commitkontrolle bestätigt 48 Migrationseinträge, unveränderte ursprüngliche
47 Einträge, das exakte neue Originalstatement und alle 37 unveränderten
Datenfingerprints (35 Tabellen und zwei öffentliche Altspaltenprojektionen).
Neue private Helfer sind weder anonym noch direkt durch normale angemeldete
Nutzer ausführbar. Beide öffentlichen Views lieferten anonym HTTP 200 mit allen
sechs ergänzten Feldern.

Frontend-Quellcommit: `dc8546f918ef00c551383416a8de341625fe5c3d`.
Vorschau: `https://fb33a369.sporteventmap.pages.dev`.
Produktion: `https://99c4d557.sporteventmap.pages.dev` und `https://sporteventmap.com`.
Release-SHA-256: `cf2c3318ba4bfc8e7dcd612cfd3664a4ab1118ea07f8f34f170d4a32226744df`.
56 Dateien wurden kontrolliert: auf der unveränderlichen Deployment-URL exakt
bytegleich; auf der Hauptdomain alle 45 Nicht-HTML-Dateien bytegleich und elf
HTML-Dateien nach ausschließlich genau erfassten Cloudflare-Ergänzungen
(Sicherheitscode, versteckter Link und E-Mail-Kodierung) ansonsten bytegleich.
Die Sicherheitskonfiguration wurde nicht verändert. Der Prüfer verwirft andere
Abweichungen; drei positive und 14 negative Selbstprüfungen bestanden.

Die reguläre öffentliche Ring-Running-Detailseite zeigt jetzt die Anmeldung als
offen, den Hockenheimring als Standort und den tatsächlichen Prüfstand vom
29. September. Ihr Renderer meldet erst nach dem echten Datenladen `verified`.
Vor der Migration zeigte dieselbe Vorschau bei fehlendem öffentlichen Vertrag
ausdrücklich den älteren Export als Fallback und keinen Frischenachweis.

## Zusätzlicher echter Pilotbefund: historische Quellenadresse

Der erste Allgäu-Review über das produktive neue Formular wurde korrekt ohne
Teilcommit abgewiesen: Der Kandidat enthält noch
`http://www.allgaeu-panorama-marathon.de/`, dieselbe gebundene Quelle und der
Entwurf inzwischen `https://allgaeu-panorama-marathon.de/`.
Die drei konkret geprüften HTTP-/HTTPS-/WWW-Varianten lieferten am 29.09.
HTTP 200 und bytegleiche Veranstalterinhalte. Es handelt sich im aktuellen
Abruf um identische Varianten, nicht um eine HTTP-Weiterleitung.

Die additive Migration `20260929155111_manual_candidate_source_url_alias.sql`
ergänzt ausschließlich diesen Vergleich. Abweichende Schreibweisen sind nur
bei identischer gebundener Quellenidentität, HTTPS als bestätigter Adresse
und exakt gleichem Pfad, Query und Fragment zulässig. Andere Hosts, Ports,
Benutzerinformationen, IP-Adressen, Jahresseiten oder eine Herabstufung zu HTTP
werden abgewiesen. Original-URL, Beobachtung und Kandidaten-Fingerprint bleiben
unverändert; beide Adressen und die Vergleichsregel stehen im Entscheidungs-Audit.
Die bereits produktive erste Migration wird nicht nachträglich geändert.

Vor dieser Ergänzung wurde der 48er-Migrationsstand erneut verschlüsselt
gesichert: `sporteventmap-production-20260929T155124599Z.sembackup`,
am 29.09. um 15:54:21 UTC erfolgreich abgeschlossen und geprüft.

Die Ergänzung wurde um 15:57:35 UTC committed und um 15:58:07 UTC unabhängig
bestätigt: 49 History-Einträge, alle bisherigen 48 unverändert, Originalstatement
exakt, alle 37 Tabellen-/Viewfingerprints unverändert. Der Helper bleibt für
anonyme und normale angemeldete Nutzer nicht direkt ausführbar.

Die abschließende lokale Abnahme `run-Fv6Jt1` enthält **59 Migrationen,
97 erfolgreiche SQL-Prüfungen und 12 erfolgreiche echte Browser-Prüfgruppen**.
Der historische HTTP-/WWW-Fall wird jetzt ausdrücklich nachgestellt; fremde
Hosts, andere Editionspfade und abweichende Queryparameter werden abgewiesen.
Keine Produktionsanfragen, keine Browserfehler; alle eigenen Testressourcen
wurden entfernt. Der ergänzte Migrationsmanifesttest ist ebenfalls grün.
Die unveränderte Oberfläche bleibt durch die zuvor bestandenen 171 Browsertests
und den geprüften v92-Paketbau abgedeckt; kein unnötiger zweiter UI-Release.

## Tatsächlicher Produktionsabschluss

- 15:58:28 UTC: Datumskonflikt im bestehenden Website-Admin geklärt. Genau ein
  Review-Receipt und ein Resolution-Audit; keine Feldbestätigung und noch keine
  Veröffentlichung durch diese Entscheidung.
- 16:00:23 UTC: dieselbe bestehende 2027-Edition mit den 14 Kernangaben plus
  Enddatum ausdrücklich bestätigt und separat freigegeben. Unbekannte
  Startzeit, Gebühren, Währung und Gesamtkapazität wurden nicht bestätigt.
- Das Formular meldet **„Öffentlich aktualisiert: Normale Detailseite geprüft.
  Karte und Liste sind mit den gespeicherten Angaben neu geladen.“** Erst nach
  den tatsächlichen anonymen Daten-, Seiten- und Katalogkontrollen.
- [Allgäu-Panorama-Marathon 2027](https://sporteventmap.com/event/allgau-panorama-marathon-2027/)
  zeigt auch nach vollständigem Neuladen den 07.–08.08.2027, acht
  Wettbewerbsvarianten, die offene Anmeldung und den Prüfstand 29.09.2026.
  Der tatsächliche öffentliche Freshness-Guard liefert `true`.
- Es gibt weiterhin genau eine 2027-Edition. Ursprüngliche Kandidaten-URL,
  Fingerprint und beobachteter Sonntag bleiben erhalten. Die zugehörige
  Kandidatenaufgabe ist nach der Freigabe erledigt. Optionale Hinweise auf
  fehlendes Bild/Veranstalter wurden nicht fälschlich geschlossen.
- Die unabhängige Datenkontrolle um 16:01:52 UTC bestätigt bytegleiche
  Zeilenhashes der 2026-Edition und ihrer Quelle, aller **492 Ergebnisse** und
  aller **48 Saisonplanereinträge** gegenüber dem Vorzustand.

Private Belege: `production-pilot-audit.json`,
`post-pilot-invariants-response.json`, `post-pilot-public-summary.json`,
`admin-allgaeu-public-success.png` und `allgaeu-2027-public-full.png` unter
`exports/manual-workflow-fix-20260929/`. Keine künstlichen Produktiveinträge,
keine Massenänderung, keine automatische Kandidatenfreigabe.

## Verbleibender P0-Datenbedarf

Anonyme Messung vom 29.09., 16:01 UTC: **211 Discovery-Einträge** (161 deutsche),
**991 Archiv-Editionen**, **7 gültige Vollnachweise = 3,32 % Frische**,
**111 vollständige Einträge = 52,61 % Vollständigkeit**. Gegenüber dem früheren
Pilot sind Bestand, vollständige Einträge und gültige Vollnachweise jeweils um
eins gestiegen. 204 Einträge haben weiterhin Reviewbedarf.

Der reparierte Pflegeweg ist damit freigegeben; P0 als Datenziel bleibt offen.
Die bestehenden Grenzen von mindestens 400 Discovery-Einträgen und 55 % Frische
sind noch nicht erreicht. Der unveränderte alte Ausfallexport und seine Audits
benötigen später den regulären geprüften Datenrelease. Aktuelle Reihenfolge:
[P0-Abschlussplan](P0_FINISH_PLAN_20260929.md).

Die [Bedienungsanleitung](MANUAL_EVENT_MAINTENANCE.md) beschreibt die tatsächlichen
Formularaktionen. Der [frühere v91-Prüfbericht](MANUAL_WORKFLOW_ACCEPTANCE_20260929.md)
bleibt als historischer Fehlernachweis erhalten.
