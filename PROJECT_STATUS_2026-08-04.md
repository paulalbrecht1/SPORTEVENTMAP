# Projektstatus und empfohlenes weiteres Vorgehen

- Stand: 4. August 2026
- Branch: `agent/release-hardening-20260724`
- Commit vor diesem Protokoll: `d2d3b81`
- Release-Kennung: `20260804-review-inbox-v79`

## Kurzfazit

SportEventMap besitzt inzwischen eine umfangreiche und gut getestete technische
Basis für Eventsuche, Nutzerkonten, Favoriten, Saisonplanung und redaktionelle
Eventpflege. Der Engpass ist nicht mehr das Fehlen weiterer Funktionen. Der
Engpass ist der nachweisbar sichere und redaktionell belastbare Betrieb:

1. Die letzten geschlossenen-Beta-Gates sind noch offen (Rechtstexte,
   Produktions-Auth, echte Geräte und reale Nutzerabläufe).
2. Die aktive Discovery-Datenmenge und deren Verifizierungsstatus liegen noch
   unter dem Produktziel von mindestens 1.000 verifizierten Events.
3. Der lokale Backend-Stand ist der Produktion um acht Migrationen voraus.
4. Die vorbereitete Stage-4-Automatisierung ist absichtlich deaktiviert und
   darf nicht als produktiv laufende Automatisierung verstanden werden.

Die sinnvollste nächste Phase ist deshalb: geschlossene Beta wirklich
startklar machen, deutsche Eventdaten messbar verbessern und erst danach die
vorbereitete Shadow-Beobachtung kontrolliert aktivieren. Neue große Funktionen
oder weitere Länderexpansion sollten bis dahin warten.

## Statusübersicht

| Bereich | Status | Einordnung |
| --- | --- | --- |
| Discovery, Suche, Filter und Karte | Grün | Implementiert; statische und Browser-Tests bestehen. |
| Mobile und Responsive Design | Grün/gelb | Automatisierte Layoutmatrix besteht; reale iOS-/Android-Prüfung fehlt. |
| Event-Detailseiten | Grün | 994 Detail-/Archivseiten vorhanden; Interaktionen sind getestet. |
| Favoriten und Saisonplaner | Grün/gelb | Technisch implementiert und getestet; Persistenz mit realen Produktionskonten noch nicht abschließend belegt. |
| Eventdaten-Workflow | Grün | 993 Eventmarken und 994 Editionen werden strukturell geprüft; Review Inbox, Quellenmonitor und Editions-Lifecycle sind vorhanden. |
| Aktiver Discovery-Katalog | Gelb/rot | 520 kommende Editionen, davon 457 in Deutschland; Ziel sind mindestens 1.000 verifizierte Events. |
| Datenqualität | Gelb/rot | Alle 520 Exportzeilen tragen aktuell `verification_status=unclear`; 132 Prüfungen sind überfällig. |
| Closed-Beta-Betrieb | Gelb/rot | Technisch weitgehend bereit, aber mehrere Betreiber- und Echttests fehlen. |
| Supabase-Produktion | Gelb/rot | Projekt ist gesund, aber nur 27 von 35 lokalen Migrationen sind produktiv registriert und Advisor-Warnungen sind offen. |
| Stage 4 / Shadow Automation | Gelb | Lokal vorbereitet und sicher deaktiviert; die acht Stage-4-/Extraktionsmigrationen sind nicht produktiv ausgerollt. |
| Öffentlicher Launch | Rot | Rechtliche Angaben, Auth-/Gerätetests und Produktions-Sicherheitsprüfung sind noch nicht abgeschlossen. |

## Was aktuell umgesetzt ist

### Produkt

- Interaktive Karte mit Suche, Datums-, Sport- und Länderfiltern
- Eventliste, Eventkarten und 994 indexierbare Event-Detail-/Archivseiten
- Favoriten mit lokalem Fallback und Kontosynchronisation
- Registrierung, Login, Profil und Passwort-Reset-Oberflächen
- Saisonplaner mit A-/B-/C-Prioritäten, Zielzeiten, Notizen, Kalenderansichten
  und Ergebnissen vergangener Wettkämpfe
- Deutsch/Englisch, Dark/Light Mode sowie responsive Ansichten
- Feedback-, Eventeinreichungs- und Adminoberflächen

### Datenbetrieb

- Supabase als Quelle der Wahrheit für Events und Editionen
- versionierter CSV-Fallback für die öffentliche Discovery
- Import-, Geocoding-, Dubletten-, Datums-, Koordinaten- und
  Qualitätswerkzeuge
- exception-first Review Inbox für konkrete Datenprobleme
- Source Monitor mit Queue, Retry, SSRF-Schutz, DNS-Pinning,
  Robots-Beachtung, Doppel-Hashes und Dead-Letter-Verarbeitung
- Editions-Lifecycle für Folgeeditionen, Ergebnisse und Archivansichten
- vorbereitete Stage-4-Komponenten für Shadow-Entscheidungen,
  Quellen-Reliability, Golden Dataset, kontrollierte Discovery,
  Duplikaterkennung und DACH-Rollout

### Sicherheitsgrenze von Stage 4

Der lokale Stage-4-Stand ist bewusst kein autonomer Produktionsbetrieb. Die
Konfiguration erzwingt beziehungsweise erwartet:

```text
dry_run=true
automation_enabled=false
observation_enabled=false
observation_scheduler_enabled=false
```

Damit werden keine erkannten Änderungen automatisch veröffentlicht. Österreich
und die Schweiz bleiben deaktivierte Piloten. Geocoding und Bulk-Aktionen sind
ebenfalls nicht automatisch freigegeben.

## Messbarer Datenstand

Quelle: `data/events.csv` und die lokale Workflow-Prüfung vom 4. August 2026.

- 520 aktive kommende Discovery-Editionen
- 457 deutsche, 18 österreichische und 10 Schweizer Editionen
- 35 weitere Editionen aus 17 europäischen Ländern
- Sportarten: 412 Running, 66 Triathlon, 41 Ultramarathon, 1 Trail Running
- 994 Eventeditionen aus 993 Eventmarken im Gesamt-/Archivbestand
- 994 generierte Detail-/Archivseiten
- 0 exakte Dubletten im Publish-Check
- 520 von 520 Zeilen mit Pflichtfeldern und formal gültigen Koordinaten
- 520 von 520 Zeilen mit `verification_status=unclear`
- 132 überfällige `next_check`-Termine
- 433 Events ohne Bild
- alle 520 aktiven Exportzeilen besitzen einen `last_checked`-Wert

### Einordnung

Die formale Datenqualität ist gut, die redaktionelle Verlässlichkeit ist aber
noch nicht ausreichend sichtbar. Besonders problematisch für die Produktvision
sind der durchgehend unklare Verifizierungsstatus, der überfällige
Prüfrückstand und die sehr geringe Trail-Abdeckung. Fehlende Bilder sind
sekundär: Offizielle Quelle, korrektes Datum, Ort, Distanzen, Anmeldelink und
Verifizierungszeitpunkt haben Vorrang.

Die 520 aktiven Editionen und die 994 Archiv-/Gesamteditionen dürfen in der
Kommunikation nicht vermischt werden. Das Ziel „1.000+ verifizierte Events“ ist
aktuell noch nicht erreicht.

## Technischer Prüfstand

Am 4. August 2026 wurde `npm.cmd run test:all` ausgeführt.

Bestanden haben:

- Publish-Readiness für 520 aktive Events
- statische Beta-Smoke-Tests
- Event-Quality-Audit und Review-Queue
- Eventdaten- und Automationsworkflow
- Source Monitor einschließlich SSRF, DNS-Pinning, Retry, Extraktion und Review
- Stage-4-Vorbereitung und deutsche Shadow-Beobachtung
- Editions-Lifecycle und Event-Detail-Integration
- Responsive-Layout-Audit ohne Warnung
- 52 von 53 Browser-End-to-End-Tests im Gesamtlauf

Ein Performance-Test überschritt im Gesamtlauf den p95-Grenzwert knapp
(83,3 ms statt kleiner 80 ms). Der gezielte Wiederholungslauf derselben beiden
Scrolltests bestand anschließend vollständig. Das spricht für eine
messbedingte Schwankung, trotzdem ist die komplette Suite damit nicht in einem
einzigen Lauf vollständig grün gewesen. Der Performance-Test sollte weiter
beobachtet und vor einem Release nochmals im Gesamtlauf ausgeführt werden.

## Produktionsstand von Supabase

Read-only geprüft am 4. August 2026:

- Projektstatus: `ACTIVE_HEALTHY`
- PostgreSQL: 17.6.1, Region `eu-west-1`
- produktiv registrierte Migrationen: 27, bis
  `20260814_review_inbox_deduplication`
- lokale Migrationen: 35
- Differenz: acht lokale Migrationen (`20260815` bis `20260822`) sind noch
  nicht in der Produktionshistorie registriert
- Edge Function `event-source-check`: aktiv, Version 12, JWT-Prüfung aktiviert
- Security Advisor: sieben Warnungen
  - eine anonym ausführbare `SECURITY DEFINER`-Funktion
  - fünf für angemeldete Nutzer ausführbare `SECURITY DEFINER`-Funktionen
  - Schutz gegen geleakte Passwörter ist deaktiviert
- Performance Advisor: 63 Hinweise
  - 20 nicht indexierte Fremdschlüssel
  - 43 bislang ungenutzte Indizes

Die Security-Advisor-Hinweise sind vor einer breiteren Beta einzeln zu prüfen.
Bei legitimen Admin-RPCs kann die Funktion intern bereits eine Adminprüfung
enthalten; trotzdem sollte `EXECUTE` nur den tatsächlich benötigten Rollen
erteilt sein. Die ungenutzten Indizes sind kein pauschaler Löschauftrag: Das
Projekt ist jung, daher ist die Nutzungsstatistik noch wenig aussagekräftig.
Die fehlenden Fremdschlüsselindizes sollten dagegen anhand realer Abfragen und
Lösch-/Updatepfade priorisiert geprüft werden.

## Offene Launch- und Beta-Gates

Die älteren Checklisten vom 25. Juli bleiben als historische Nachweise erhalten.
Folgende Punkte sind weiterhin nicht als abgeschlossen belegt:

- echte Betreiber-, Hosting- und Kontaktangaben in den Rechtstexten
- rechtliche Prüfung von Impressum, Datenschutz und Bedingungen
- finale HTTPS-Site-URL und exakte Auth-Redirects
- Registrierung, Bestätigung, Login, Logout, Session Restore und Passwort-Reset
  auf der Produktionsdomain mit mindestens zwei E-Mail-Anbietern
- produktiver RLS-Test mit zwei normalen Nutzern und einem Admin
- vollständiger Einreichungs-, Freigabe- und Ablehnungsablauf in Produktion
- Favoriten- und Saisonplaner-Persistenz mit realen Produktionskonten
- reale iOS- und Android-Tests einschließlich virtueller Tastatur
- abschließender Browser-Smoke-Test auf der Produktionsdomain
- Auswahl von 20–50 Testern, Feedbackverantwortung und feste Auswertungsroutine

## Empfohlenes weiteres Vorgehen

### Priorität 0: Beta sicher freigabefähig machen (nächste 3–7 Tage)

1. Betreiber-, Hosting- und Kontaktangaben finalisieren und Rechtstexte prüfen
   lassen.
2. Produktionsdomain und Supabase-Auth-Redirects festziehen.
3. Auth-, Favoriten-, Saisonplaner-, Einreichungs- und Adminablauf mit echten
   Konten vollständig testen.
4. Die sechs gemeldeten `SECURITY DEFINER`-RPCs auf interne Rollenprüfung und
   notwendige Grants auditieren; unnötige Ausführungsrechte entziehen.
5. Schutz gegen geleakte Passwörter aktivieren, sofern der Supabase-Tarif dies
   unterstützt; andernfalls als akzeptiertes Beta-Risiko dokumentieren.
6. Einen vollständigen E2E-Gesamtlauf wiederholen und reale iOS-/Android-Tests
   protokollieren.

Ergebnis dieser Phase: eine belastbare Go/No-Go-Entscheidung für 20–50
eingeladene Tester.

### Priorität 1: Deutsche Eventdaten verbessern (Woche 1–4)

1. Die 132 überfälligen Prüfungen priorisiert abarbeiten: kommende und
   stark gesuchte deutsche Events zuerst.
2. Den Status `unclear` in einen nachvollziehbaren Verifizierungsworkflow
   überführen. Ziel ist nicht kosmetisches Umbenennen, sondern eine offizielle
   Quelle plus aktuellen Prüfzeitpunkt pro freigegebenem Event.
3. Trail Running gezielt aus offiziellen Veranstalter-, Verbands- und
   Zeitnahmequellen ergänzen; eine aktive Edition ist keine ausreichende
   Abdeckung.
4. Die deutschen 457 aktiven Editionen nach Sportart, Bundesland, Distanz und
   Monat auswerten und konkrete Abdeckungslücken schließen.
5. Bilder erst nach Pflichtdaten und offiziellen URLs ergänzen.
6. Wöchentlich diese Kennzahlen veröffentlichen:
   - aktive deutsche Editionen
   - Anteil verifizierter Editionen
   - überfällige Prüfungen
   - Events ohne offizielle URL oder Anmeldelink
   - mögliche Dubletten
   - Abdeckung nach Sportart/Bundesland/Monat

Ergebnis dieser Phase: messbarer Fortschritt zum Kernziel „1.000+ verifizierte
Events“, nicht nur mehr importierte Datensätze.

### Priorität 2: Geschlossene Beta betreiben (Woche 2–6)

1. 20–50 Läufer, Triathleten und Ultraläufer einladen.
2. Jede Testperson einen echten Ablauf durchführen lassen: suchen, vergleichen,
   favorisieren, Saison planen und einen fehlenden oder falschen Eintrag melden.
3. Feedback mindestens zweimal pro Woche triagieren.
4. Zuerst Fehler in Suche, Daten, Mobile und Saisonplanung beheben.
5. Kernmetriken erfassen: Nulltreffer-Suchen, Filterabbrüche, geöffnete
   Detailseiten, Favoriten, geplante Events, wiederkehrende Nutzer und gemeldete
   Datenfehler.

Ergebnis dieser Phase: reale Evidenz darüber, welche Discovery- und
Datenprobleme den größten Nutzerschaden verursachen.

### Priorität 3: Stage 4 kontrolliert in Produktion vorbereiten (frühestens nach Priorität 0)

1. Die acht lokalen Migrationen `20260815` bis `20260822` in einem eigenen
   Deployment-Fenster prüfen, sichern und ausrollen.
2. Danach Migration History, RLS, Grants, Security Advisor, Performance Advisor
   und Edge-Function-Kompatibilität erneut prüfen.
3. Stage 4 weiterhin mit `dry_run=true` und `automation_enabled=false` belassen.
4. Zunächst nur wenige geprüfte deutsche Pilotquellen binden.
5. 200–500 reale Shadow-Beobachtungen sammeln und manuell bewerten.
6. Phase B erst nach mindestens 14–30 Tagen stabiler Beobachtung und
   kontrolliertem Review-Rückstand separat entscheiden.

Ergebnis dieser Phase: belastbare Kalibrierungsdaten ohne automatisches Risiko
für öffentliche Eventdaten.

## Was vorerst bewusst nicht begonnen werden sollte

- Social Network, Chat, Messenger oder Community-Ausbau
- Trainingsanalyse oder KI-Coaching
- Garmin-/Strava-Integration
- breite Personalisierung
- automatische Live-Freigabe von Eventänderungen
- flächiger Österreich-/Schweiz- oder Europa-Rollout
- weitere große Admin- oder Automationskomplexität ohne nachgewiesenen Bedarf

Diese Themen zahlen derzeit weniger auf den Wettbewerbsvorteil ein als eine
vollständige, aktuelle und leicht durchsuchbare deutsche Eventdatenbank.

## Nächster Entscheidungszeitpunkt

Nach Abschluss von Priorität 0 sollte ein kurzes Go/No-Go-Protokoll erstellt
werden. Ein „Go“ für die geschlossene Beta setzt voraus:

- keine offenen kritischen Security- oder Datenschutzfragen
- vollständig getestete Produktions-Auth-Abläufe
- echte Mobile-Smoke-Tests
- korrekte Betreiberangaben
- klarer Feedbackverantwortlicher
- dokumentierte bekannte Einschränkungen

Danach sollte alle zwei Wochen dieses Statusdokument mit aktuellen Daten- und
Beta-Kennzahlen fortgeschrieben werden.
