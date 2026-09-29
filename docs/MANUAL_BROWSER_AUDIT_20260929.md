# Erneuter echter Browserdurchlauf: Paderborner Osterlauf

Am 29.09.2026 wurde der produktive Pflegeweg ausschließlich über die angemeldete
Website-Oberfläche **Admin → Events pflegen** bedient. Quellenrecherche und
ergänzende Datenbankabfragen waren lesend. Kein Eventwrite per SQL, Skript oder
LLM-Endpunkt; keine erfundenen Testveranstaltungen. Der tägliche Pflegeweg benötigt
das Website-Administratorkonto, kein Codex-Konto.

## Echtes Beispiel und Quellen

Der vorhandene Kandidat für den **Paderborner Osterlauf am 27.03.2027** wurde als
Entwurf angelegt, gezielt geprüft, ergänzt und ausdrücklich veröffentlicht.
Die Ausgabe 2026 wurde nicht umdatiert. Vorhandene Editionsidentitäten und
Verknüpfungen bleiben erhalten. Gemeinsame Stammdaten wie Adresse, Koordinaten,
Veranstalter und Beschreibung gelten modellgemäß für alle Ausgaben.

- [Offizielle Veranstaltung](https://www.paderborner-osterlauf.de/)
- [Ankündigung vom 25.09.2026](https://www.paderborner-osterlauf.de/neuigkeiten/1310-start-frei-fuer-den-79-paderborner-osterlauf.html)
- [Ausschreibung 2027](https://www.paderborner-osterlauf.de/images/files/Ausschreibung%20DIN%20lang%202027.pdf)
- [Offiziell verlinkte Anmeldung 2027](https://reg.mikatiming.com/paderborner-osterlauf/2027)
- [Offiziell verlinkter Veranstaltungsort](https://goo.gl/maps/PdnVuNPgyXv)

Gespeichert sind sechs Wettbewerbe, geplante Veranstaltung, geöffnete Anmeldung,
Start-/Enddatum 27.03.2027, Beginn 09:30, Gebührenrahmen 0–55 EUR und der belegte
Venue-Pin. 09:30 ist der erste Bambinistart; weitere Rennen starten später. Der
Gebührenrahmen umfasst kostenlose Kinderläufe bis zur Halbmarathon-Nachmeldung,
ohne Zusatzleistungen. Das Gesamt-Teilnehmerlimit bleibt unbekannt. Die
Kindergartenstrecke ist in der aktuellen Mitteilung 1,25 km, im PDF gerundet
ca. 1,2 km. Diese Einschränkungen sind in der Prüfnotiz dokumentiert.

## Tatsächlich im Produktionsbrowser geprüft

| Prüfung | Ergebnis |
| --- | --- |
| Eventsuche und Editionsauswahl | Paderborn gefunden; alte und neue Ausgabe getrennt auswählbar. |
| Offizielle Quelle öffnen | Öffnet Veranstalterseite in eigenem Tab; Anmeldung führt zum echten Portal 2027. |
| Neue Ausgabe ohne erfundene Werte | Jahrespflicht validiert; Kandidat übernommen; Termin, Wettbewerbe, Gebühren und Verifikationen nicht blind geerbt. |
| Privater Entwurf | Gespeichert, neu geladen und zunächst nicht veröffentlicht. |
| Nur unverändertes Datum bestätigen | Genau eine Feldverifikation, kein vollständiger Frischenachweis. |
| Ausgabe korrigieren | Status, Anmeldung, sechs Wettbewerbe und optionale Angaben gespeichert. Normales Speichern erhöhte die Zahl der Feldverifikationen nicht. |
| Vollständiger Browser-Reload | Alle Korrekturen wurden erneut aus der Datenbank geladen. |
| Unerreichbare Quelle plus Bestätigung | Vor dem Speichern abgewiesen; keine falsche Quellenbeobachtung erzeugt. |
| Freigabe mit nur einem geprüften Feld | Mit verständlicher Anforderung aller 14 Kernprüfungen abgewiesen. |
| Leeres Formularfeld ohne Löschhäkchen | Anmeldelink leer gelassen; Änderungsübersicht zeigte keine Löschung; vorhandener Link nach erfolgreichem Speichern erhalten. |
| Ausgeblendete optionale Felder | Gebühren, Zeit, Enddatum und Veranstalter blieben beim erneuten Bestätigen erhalten. |
| Tatsächlicher Versionskonflikt | Speichern abgewiesen, Eingaben erhalten; aktueller Stand geladen, Häkchen bewusst erneut gesetzt und anschließend erfolgreich gespeichert. Ein Erstcrawl der neuen Quelle lief während der Bearbeitung. |
| Veralteten Vorschlag ablehnen | Beschreibungsvorschlag mit überholter Teilnehmerzahl direkt im Admin begründet abgelehnt. |
| Behobenen Hinweis schließen | Fehlender Veranstalter nach tatsächlicher Ergänzung im Admin als behoben dokumentiert. |
| Speicherfehler | Zu lange Prüfnotiz serverseitig abgewiesen; kein Erfolg behauptet, Eingaben/Häkchen erhalten; nach Kürzung erfolgreich. |
| Wiederholung derselben Editionsanlage | Server meldet „Diese Ausgabe existiert bereits“; keine zweite Ausgabe 2027 angelegt. |
| Mehrfachbedienung während Speichern | Verbindlicher Speicherbutton während laufendem Request deaktiviert. Ein früher CUA-Doppelklick löste keinen Request aus und zählt nicht als erfolgreicher Doppelklicktest. |
| Vollständige Freigabe | 14 Kernfelder und neun belegte Zusatzfelder ausdrücklich bestätigt; Teilnehmerlimit nicht bestätigt. |
| Öffentliche Erfolgskontrolle | Admin meldet normalen Detailseitenvergleich sowie erneutes Laden von Karte/Liste. |
| Neue öffentliche Detailseite und Reload | Datum, Status, Anmeldung, sechs Wettbewerbe, Koordinaten, Startzeit, 0–55 EUR und Prüfdatum sichtbar; Renderer zeigt die richtige Editionsidentität. |
| Alte statische Detailseite 2026 | Weiterhin 04.04.2026, alte Wettbewerbe und alter Prüfzeitpunkt; keine Übernahme der neuen jahresspezifischen Angaben. |

Die echte Quelle war erreichbar und kündigt bereits 2027 an. Deshalb wurden
„Quelle nicht erreichbar“ und „keine neue Ausgabe angekündigt“ nicht als
unwahre Produktionsbeobachtungen gespeichert. Ein vorhandener Hinweis zum
fehlenden Eventbild bleibt offen: Das Bild wurde nicht ergänzt und der Hinweis
nicht fälschlich als behoben markiert.

## Zusätzlicher im Browser entdeckter Anzeigefehler

Die öffentliche Detailseite zeigte „Geplant“ und „Geöffnet“ korrekt. Karte und
Liste zeigten trotz dieser richtigen Daten **„Unclear“**. Ursache ist die alte
Badge-Zuordnung aus `verification_status`: Der tatsächliche Wert `verified`
ist kein Anmeldestatus und wurde als unklar dargestellt. Der Browserbefund ist
gesichert. Die Korrektur verwendet die getrennten kanonischen Angaben, erhält
die Legacy-Kompatibilität und verhindert, dass ein alter Anmeldewert einen
explizit unbekannten aktuellen Wert überschreibt. Release- und Nachteststand
werden nach der tatsächlichen Durchführung unten ergänzt.

Die neue Regression prüft 32 kanonische und ältere Statuskombinationen sowie
CSV-Kompatibilität und getrennte Normalisierung. Ein Browsertest lädt die
Katalogdatei wirklich neu und kontrolliert die sichtbare Liste auf Deutsch und
Englisch. Die vollständige technische Suite `npm run test:code` ist am Quellstand
`648f5da` bestanden, einschließlich **172 Browsertests**, Layout- und
Paketprüfungen. In der echten Vorschau fiel anschließend ein gecachter englischer
Popup nach Sprachwechsel auf. Die zusätzliche Korrektur beschränkt sich auf eine
Zeile: Leaflet erhält eine Inhaltsfunktion und rendert den Popup beim Öffnen in
der aktuellen Sprache. Der neue Regressionstest war mit dem alten Aufruf rot
und nach der Korrektur grün. Das lokale Leaflet-Testdouble speichert die echte
Popupbindung, rendert aber keinen echten Popup; diesen prüft der anschließende
Live-Nachtest. Für die reine Anzeigekorrektur ist keine Migration erforderlich.
Nach dem Einzeilenfix sind alle **13 gezielten Browserprüfungen** für Discovery,
Marker und Sprachsteuerung erneut bestanden. Der gesamte 172er-Lauf wurde
anschließend nicht nochmals ausgeführt; die abschließende Prüfung konzentriert
sich auf die tatsächlich veränderten Pfade.

## Grenzen der aktuellen Liveprüfung

Die lesende Nachkontrolle um 18:07 UTC bestätigt genau eine Edition 2027, einen
zugeordneten Kandidaten und eine neue Quelle. Es gibt 25 Prüfzeilen für 23
verschiedene Felder: zwei frühere einzelne Datumsbestätigungen und die spätere
vollständige Prüfung. Das Teilnehmerlimit ist weiterhin `null` und ungeprüft.
Der kanonische Frische-Guard bestätigt die neue veröffentlichte Ausgabe.
Historische Edition und Quellen sowie das eine vorhandene Ergebnis sind im
Hashvergleich unverändert. Zusätzlich stimmen alle 40 Felder der alten Edition
mit ihrem vollständigen Snapshot vor der Entwurfsanlage überein. Für dieses
Event existieren vor und nach dem Test keine Saisonplaner-Verknüpfungen;
dieser Fall allein beweist deshalb nicht den
Erhalt einer vorhandenen Plannerverknüpfung. Dafür gilt der isolierte Testlauf.

Bestandsfortschritt: **212 Discovery-Einträge, davon 162 in Deutschland;
992 Archiv-Editionen; acht gültige Vollnachweise = 3,77 %**. P0 bleibt offen.

Produktive Ausfälle, verlorene Commitantworten, Nichtadmin-Schreibversuche und
absichtlich widersprechende Crawlerwerte wurden nicht künstlich ausgelöst.
Bewusste Löschungen korrekter Produktionsdaten wurden nicht vorgenommen.
Diese Fälle sind durch den vorangegangenen isolierten Akzeptanzlauf mit
**97 SQL-Prüfungen und zwölf Browsergruppen** abgedeckt; dieser Bericht behauptet
keine erneute Liveausführung dieser Fälle. Ein neuer persönlicher Saisonplaner-
Eintrag wurde nicht allein zum Testen in Produktion angelegt.

Private Originalquellen, Snapshots, Datenvergleiche und Screenshots liegen unter
`exports/manual-browser-audit-20260929/` und werden nicht ins öffentliche
Repository übernommen. Der historische Vollhash-Snapshot wurde nach der
Entwurfsanlage, aber vor den weiteren Korrekturen gesichert; zusätzlich liegt
die vollständige alte Edition aus einem Abruf vor der Entwurfsanlage vor.
