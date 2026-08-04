# Mobile-Geräte-Testprotokoll – geschlossene Beta

Stand: 4. August 2026
Release: `20260804-review-inbox-v79`

Dieses Protokoll ist für **reale Geräte** vorgesehen. Browser-Emulation und automatisierte Responsive-Tests sind zusätzliche Nachweise, ersetzen die beiden physischen Läufe aber nicht. Zum Zeitpunkt dieses Reviews wurden keine physischen Geräte durch Codex bedient; deshalb sind alle Realgeräte-Zeilen ausdrücklich `MANUELL OFFEN`.

## Testgeräte

| Lauf | Gerät | Betriebssystem | Browser | Bildschirmgröße | Orientierung | Status |
|---|---|---|---|---|---|---|
| IOS-REAL-01 | noch einzutragen (reales iPhone) | Version eintragen | Safari, Version eintragen | CSS-/Gerätegröße eintragen | Hoch- und Querformat | MANUELL OFFEN |
| AND-REAL-01 | noch einzutragen (reales Android-Gerät) | Version eintragen | Chrome, Version eintragen | CSS-/Gerätegröße eintragen | Hoch- und Querformat | MANUELL OFFEN |

Für jeden Lauf zusätzlich erfassen: Tester-ID, Datum/Uhrzeit, Netztyp (WLAN/Mobilfunk), Dark-/Light-Mode, Produktions-URL und Release-Kennung. Keine Zugangsdaten oder Reset-Links in Screenshots aufnehmen.

## Prüffälle je Gerät

Jede Zeile ist auf **beiden** oben genannten Realgeräten auszuführen. `Ergebnis` darf nur `BESTANDEN`, `FEHLGESCHLAGEN` oder `BLOCKIERT` enthalten. Schweregrad: `kritisch`, `hoch`, `mittel`, `niedrig` oder `entfällt`.

| ID | Bereich und Schritte | Erwartetes Ergebnis | Ergebnis | Fehlerbeschreibung / Reproduktionsschritte | Screenshot/Video vorhanden | Schweregrad |
|---|---|---|---|---|---|---|
| M-01 | Landingpage öffnen; primäre Navigation und CTA verwenden | Kein horizontaler Überlauf; CTA führt zur Discovery | MANUELL OFFEN | – | nein | entfällt |
| M-02 | Discovery-Karte laden, bewegen, zoomen und Marker öffnen | Karte reagiert flüssig; Marker und Event-Drawer bleiben bedienbar | MANUELL OFFEN | – | nein | entfällt |
| M-03 | Nach einem bekannten Event und einem nicht vorhandenen Begriff suchen | Treffer stimmen; Nulltrefferzustand ist verständlich | MANUELL OFFEN | – | nein | entfällt |
| M-04 | Datumsfilter setzen, ändern und zurücksetzen | Ergebnisliste und Karte entsprechen dem Zeitraum | MANUELL OFFEN | – | nein | entfällt |
| M-05 | Sportfilter einzeln und kombiniert verwenden | Nur passende Sportarten bleiben sichtbar | MANUELL OFFEN | – | nein | entfällt |
| M-06 | Länderfilter setzen und zurücksetzen | Nur Events des gewählten Landes erscheinen | MANUELL OFFEN | – | nein | entfällt |
| M-07 | Filter-Drawer mehrfach öffnen und schließen; außerhalb tippen | Drawer öffnet/schließt zuverlässig; Fokus bleibt nachvollziehbar | MANUELL OFFEN | – | nein | entfällt |
| M-08 | Eventdetail aus Liste und Karte öffnen; zurück navigieren | Detaildaten lesbar; Browser-Zurück kehrt ohne Zustandsverlust zurück | MANUELL OFFEN | – | nein | entfällt |
| M-09 | Eingeloggt Event favorisieren, neu laden, Favorit entfernen | Zustand bleibt nach Reload erhalten und aktualisiert sich eindeutig | MANUELL OFFEN | – | nein | entfällt |
| M-10 | Login mit gültigen und ungültigen Daten; Logout | Erfolg und Fehlermeldung korrekt; geschützte Daten nach Logout verborgen | MANUELL OFFEN | – | nein | entfällt |
| M-11 | Registrieren und Bestätigungslink im mobilen Browser öffnen | Registrierung versendet E-Mail; Rückleitung landet auf erlaubter Produktions-URL | MANUELL OFFEN | – | nein | entfällt |
| M-12 | Passwort-Reset anfordern; gültigen und ungültigen/abgelaufenen Link prüfen | Reset funktioniert; ungültiger Link wird sicher und verständlich abgelehnt | MANUELL OFFEN | – | nein | entfällt |
| M-13 | Event zum Saisonplaner hinzufügen; Priorität, Zielzeit, Notiz, Status ändern; neu anmelden | Alle Felder bleiben dauerhaft und nutzerbezogen gespeichert | MANUELL OFFEN | – | nein | entfällt |
| M-14 | Eventeinreichung vollständig ausfüllen und absenden | Validierung verständlich; genau eine eigene Einreichung mit Status entsteht | MANUELL OFFEN | – | nein | entfällt |
| M-15 | Adminansicht mit Admin-Konto öffnen und eine Testeinreichung prüfen | Nur Admin sieht Aktionen; Freigabe/Ablehnung ist mobil bedienbar | MANUELL OFFEN | – | nein | entfällt |
| M-16 | Alle Formulare mit virtueller Tastatur bedienen | Aktives Feld und primäre Aktion bleiben sichtbar; kein verdeckter Inhalt | MANUELL OFFEN | – | nein | entfällt |
| M-17 | Per Tab/Assistive Navigation bzw. externer Tastatur Fokus prüfen | Sichtbare Fokuszustände; logische Reihenfolge; kein Fokusverlust in Modals | MANUELL OFFEN | – | nein | entfällt |
| M-18 | Lange Listen, Seite und geöffnete Drawer/Modals scrollen | Kein Scroll-Lock-Fehler; Hintergrund scrollt bei Modal nicht ungewollt | MANUELL OFFEN | – | nein | entfällt |
| M-19 | Event-, Auth-, Feedback- und Planner-Modal/Drawer öffnen und schließen | Inhalt passt in Viewport; Schließen und Zurück funktionieren zuverlässig | MANUELL OFFEN | – | nein | entfällt |
| M-20 | System/App auf Dark Mode stellen und Kernablauf wiederholen | Kontrast, Karte, Felder, Zustände und Modals sind lesbar | MANUELL OFFEN | – | nein | entfällt |
| M-21 | System/App auf Light Mode stellen und Kernablauf wiederholen | Kontrast, Karte, Felder, Zustände und Modals sind lesbar | MANUELL OFFEN | – | nein | entfällt |
| M-22 | Landing, Discovery, Detail, Planner und Formulare in Hoch-/Querformat drehen | Layout passt sich ohne Daten- oder Eingabeverlust an | MANUELL OFFEN | – | nein | entfällt |
| M-23 | Browser-Zurück aus Detail, Modal, Auth-Rückleitung und Discovery verwenden | Navigation ist vorhersehbar; kein Abmelden oder doppeltes Absenden | MANUELL OFFEN | – | nein | entfällt |

## Fehlerprotokoll

Für jeden Fehler eine eigene Zeile anlegen.

| Fehler-ID | Lauf/Test-ID | Gerät/OS/Browser | Ergebnis | Fehlerbeschreibung | Exakte Reproduktionsschritte | Screenshot/Video | Schweregrad | Verantwortlich | Status |
|---|---|---|---|---|---|---|---|---|---|
| – | – | – | – | Noch keine realen Gerätetests durchgeführt | – | nein | – | – | MANUELL OFFEN |

## Abnahmeregel

Die Mobile-Gates bleiben `NOT TESTED`, bis je ein vollständiger Lauf auf einem realen iOS- und Android-Gerät dokumentiert ist. Kritische oder hohe Fehler in Registrierung, Login, Persistenz, Nutzertrennung, Einreichung oder Adminprüfung führen zum Beta-`NO-GO`. Emulationsnachweise sind mit `EMULATION` zu kennzeichnen und dürfen den Realgeräte-Status nicht überschreiben.
