# Nächste Umsetzungsstufen

Stand: 7. September 2026

Dieses Dokument ist die verbindliche Reihenfolge für die nächsten
Produkt- und Entwicklungsarbeiten an SportEventMap. Es übersetzt die
Produktvision in abnehmbare Arbeitsstufen. Bei einem Zielkonflikt haben
Datenqualität, Eventsuche und mobile Nutzung Vorrang vor zusätzlicher
Produktkomplexität.

## Statusübersicht

| Stufe | Schwerpunkt | Status | Abschlussbedingung |
| --- | --- | --- | --- |
| P0 | Verlässlicher Release- und Datenstand | **IN ARBEIT** | Aktueller Export, belastbare Daten-Gates und vollständig grüne Tests |
| P1 | Vollständiger, verifizierter Deutschland-Katalog | **GEPLANT** | 1.000+ verifizierte deutsche Event-Editionen bei nachweisbarer Datenqualität |
| P2 | Skalierbare mobile Eventsuche | **GEPLANT** | Relevante Orts-, Status- und Distanzsuche mit teilbaren Filtern und begrenztem Initial-Rendering |
| P3 | SEO-Discovery-Flächen | **GEPLANT** | Qualitätsgesicherte Sport-, Distanz-, Regionen- und Terminseiten sind indexierbar |
| P4 | Modulare Auslieferung und CI | **GEPLANT** | Öffentlicher Runtime-Code ist getrennt; Release-Prüfungen laufen automatisiert |
| Später | Bindung und Personalisierung | **GEPLANT** | Erst nach belegter Discovery- und Datenbasis priorisieren |

Statusdefinitionen:

- **IN ARBEIT:** Die Stufe ist der aktuelle Fokus. Neue Arbeiten sollen direkt
  auf ihre Abnahmekriterien einzahlen.
- **GEPLANT:** Scope und Abnahmekriterien sind festgelegt; die Umsetzung beginnt
  erst, wenn ihre Abhängigkeiten erfüllt sind.

## Ausgangslage vor P0

Der Audit vom 3./4. September 2026 liefert die aktuelle Baseline:

- 431 Discovery-Einträge und 994 archivierte Editionen
- Export vom 27. August 2026 und damit außerhalb des 24-Stunden-Release-Limits
- 64,04 % frische und 48,49 % vollständige Discovery-Einträge
- 155 Einträge mit `review_required`
- 414 von 431 Einträgen mit unbekanntem Anmeldestatus
- veralteter Dublettenbericht sowie ungeklärte Geo-, Länder- und
  Dublettenkandidaten
- 64 von 65 Ende-zu-Ende-Tests erfolgreich; ein Theme-Test scheitert an einer
  absichtlich abgebrochenen Browser-Anfrage
- große, eng gekoppelte Laufzeitdateien und zu viele initial gerenderte
  Eventkarten in der normalen Listenansicht

Die bestehenden Grenzwerte in `data/catalog-release-policy.json` bleiben die
technische Release-Untergrenze. Die Ziele dieser Roadmap sind bewusst höher und
bilden den Produktfortschritt ab.

## P0 – Verlässlicher Release- und Datenstand

**Status:** IN ARBEIT

### Ziel

Jeder freigegebene Stand basiert auf einem aktuellen, eindeutig geprüften
Datenexport. Bekannte kritische Datenfehler und echte technische Regressionen
können nicht unbemerkt veröffentlicht werden.

### Deliverables

- Öffentlichen Katalog neu aus Supabase exportieren und alle davon abhängigen
  Eventseiten, Sitemap- und Manifest-Artefakte reproduzierbar aktualisieren.
- Datums-Audit an das kanonische ISO-Format der Audit-Zeitstempel anpassen, damit
  korrekte Werte nicht mehr als nicht standardisiert gemeldet werden.
- Dubletten- und Geo-Audits an den aktuellen Export binden und im Release-Gate
  die Aktualität der Berichte prüfen.
- Release bei exakten oder hochwahrscheinlichen ungeklärten Dubletten sowie bei
  kritischen Länder-, Koordinaten- oder Datumsfehlern blockieren.
- Bereits bekannte hochwahrscheinliche Dubletten und offensichtlich falsche
  Länder/Koordinaten an der operativen Datenquelle korrigieren oder mit
  nachvollziehbarer Review-Entscheidung auflösen; generierte Exporte werden
  nicht als Source of Truth manuell repariert.
- Den Theme-E2E-Test so korrigieren, dass nur navigationsbedingt abgebrochene
  Requests ignoriert werden und echte Seiten-, Konsolen- und Netzwerkfehler
  weiterhin fehlschlagen.
- Den finalen Stand mit Release-, Daten-, Sicherheits- und Browserprüfungen
  verifizieren.

### Akzeptanzkriterien und KPIs

- `npm run check` ist grün; der Export ist zum Prüfzeitpunkt höchstens
  24 Stunden alt.
- Datenberichte referenzieren den geprüften Export und sind nicht älter als
  ihre Eingabedaten.
- 0 ungeklärte exakte oder hochwahrscheinliche Dubletten im Release-Gate.
- 0 kritische Geo-, Länder- oder Datumsfehler im Release-Gate.
- ISO-Zeitstempel erzeugen im Datums-Audit keine Format-Fehlmeldungen.
- Die vollständige Testsuite inklusive aller 65 E2E-Szenarien ist grün.
- Der anonyme Production-Zugriffstest bestätigt weiterhin: freigegebene Events
  sind lesbar, nicht freigegebene und private Daten nicht.

### Abhängigkeiten

- Lesender Zugriff auf den Production-Katalog für den Export
- Offizielle Quellen für die fachliche Auflösung einzelner Datenkonflikte
- Schreibzugriff auf Production nur in einem ausdrücklich freigegebenen,
  protokollierten Datenkorrektur-Schritt

### Umsetzungsstand vom 4. September 2026

- [x] Roadmap im Repository verankert und aus dem README verlinkt.
- [x] Öffentlichen Production-Katalog ausschließlich lesend diagnostiziert.
  Nach der P0-Dublettenbereinigung enthält der aktuelle Stand 374 aktive
  Discovery-Editionen und 989 Archiv-Editionen; 7 von 374 Discovery-Einträgen
  gelten als frisch (1,87 %), 187 als vollständig (50,00 %).
- [x] Exporter mit einem Pre-Write-Gate abgesichert. Der ungesunde Live-Stand
  verletzt Mindestbestand, maximales Bestandsdelta und Frischegrenze und wird
  deshalb vor jeder Dateiänderung abgelehnt. Der versionierte Fallback wurde
  nicht durch diesen Stand ersetzt.
- [x] Öffentlichen Refresh nach der Dublettenbereinigung erneut angestoßen. Das
  Pre-Write-Gate stoppte erwartungsgemäß bei 374 statt mindestens 400
  Discovery-Einträgen und 1,87 % statt mindestens 55 % Frische; keine
  versionierte Fallback-, Seiten- oder Sitemap-Datei wurde überschrieben. Ein
  separater, nicht veröffentlichbarer Diagnosesnapshot liegt nur im ignorierten
  `exports/`-Bereich.
- [x] ISO-8601-Timestamps im Datums-Audit korrigiert; sie erzeugen keine
  Format-Fehlmeldungen mehr.
- [x] Navigationsbedingt abgebrochene, lokale GET-Subrequests im Theme-E2E-Test
  eng begrenzt behandelt; andere Netzwerk- und Seitenfehler bleiben sichtbar.
- [x] Dubletten-, Geo- und Datumsreports vollständig per Prüfsumme an den
  geprüften Export binden und das gemeinsame Release-Gate aktivieren.
- [x] Die fünf release-blockierenden Dublettenpaare gegen offizielle Quellen
  geprüft und am 4. September 2026 im Supabase-Quellsystem protokolliert
  bereinigt: 10-Teiche-Marathon, Einstein-Marathon,
  Montafon-Arlberg-Marathon, Schwarzwald-Marathon und wepLAUF. Physische Zeilen
  und Nutzerreferenzen blieben erhalten; die fünf Dubletten sind als
  Audit-Tombstones aus Discovery und Archiv entfernt. Ein verschlüsseltes
  Produktionsbackup, ein vollständiger Restore-Drill und ein gezielter
  Rollback-Dry-Run wurden erfolgreich verifiziert.
- [x] Der diagnostische Nachlauf bestätigt 0 exakte, wahrscheinliche oder
  anderweitig release-blockierende Dublettenkandidaten sowie 0 kritische
  Datums- und Geo-Fehler. Ein nicht blockierender gemeinsamer Serien-Link der
  SportScheck-RUN-Events bleibt als normaler Review-Kandidat sichtbar.
- [x] Einen sicheren editionsgebundenen Freshness-Review-Pfad implementiert.
  Die Admin-RPC verlangt eine höchstens 24 Stunden alte Feldprüfung der
  offiziellen Quelle, exakte Bestätigung aller 14 zentralen Werte einschließlich
  Adresse, Beschreibung und Geodaten, mindestens 0,80 Confidence und keine
  Unsicherheit oder konkurrierende Aufgabe. Sie
  aktualisiert ausschließlich Verifikationsmetadaten der gesperrten Edition und
  schreibt strukturierte Audit-Evidenz samt exakter Quellen-Provenienz. Neue
  Konflikte, direkte Faktenänderungen sowie instabile oder gelöschte offizielle
  Quellen invalidieren die Freshness transaktionssicher; ein öffentlicher
  boolescher Guard bindet dieselbe Attestierung fail-closed an den Export.
  Die Admin-Oberfläche lädt aktive Crawls, Review-Konflikte und moderierte
  Datenfehler-Meldungen vollständig paginiert und zeigt die Bestätigung nur für
  dieselbe aktive Discovery-Edition und exakt passende Quellen-Provenienz. Auch
  der optionale Proposal-Review-Pfad folgt nun der Event-vor-Edition-
  Sperrreihenfolge. Filter, KPIs und Aktionen zielen auf dieselbe aktive
  Discovery-Edition. Der bisherige direkte Event-Master-
  Verify-Pfad sowie das freie Verschieben des Prüftermins wurden entfernt, weil
  sie über den Legacy-Sync Editionsfakten überschreiben beziehungsweise
  Freshness ohne Fachprüfung vortäuschen konnten.
- [x] Den Freshness-Review-Pfad als Migration `20260904080319` kontrolliert auf
  Production ausgerollt. Vorher wurden das aktuelle verschlüsselte Backup samt
  erfolgreichem Restore-Drill und die Remote-Historie geprüft. Wegen bereits
  bestehender Migration-History-Drift wurde kein pauschales `db push`
  ausgeführt, sondern ausschließlich diese transaktionale Migration angewendet
  und danach genau ihre Versionsnummer als ausgeführt markiert. Der Postflight
  bestätigt Spalte, beide Indizes, beide RPCs, die Admin-Inbox sowie alle neun
  aktiven Invalidierungs-Trigger. Datenbank-Error-Lint und Performance-Advisor
  sind ohne Befund; der rein lesende Live-Smoke bestätigt den öffentlichen
  Boolean-Guard und verweigert anonymen Zugriff auf Verifier und Admin-Inbox.
- [ ] Die nun streng fail-closed bewerteten 374 Discovery-Einträge in
  kontrollierten Review-Batches neu verifizieren und fehlende künftige
  Editionen ergänzen, bis Bestands- und Frische-Gates wieder erfüllt sind. Die
  erste produktive Queue-Auswertung enthält 298 direkt bearbeitbare
  Freshness-Aufgaben (2 P0, 253 P1, 43 P2); die zwei P0-Quellen wurden mit hoher
  Priorität in den Source-Monitor eingereiht. Noch nicht queue-fähige Einträge
  bleiben über ihre konkreten Source-, Proposal-, Validation-, Workflow- oder
  Feedback-Blocker sichtbar.
- [ ] Die bereits ältere lokale/remote Supabase-Migration-History-Drift separat
  per Schemavergleich auflösen. Insbesondere dürfen die lokalen Alt-Migrationen
  nicht nachträglich blind auf Production gepusht oder nur formal als
  ausgeführt markiert werden.
- [x] Vollständige Browser-Suite mit 65 von 65 Szenarien erfolgreich
  ausgeführt.
- [x] Anonymen Production-Zugriff erneut geprüft: freigegebene Events sind
  lesbar; Pending-Events und private Tabellen liefern keine sichtbaren Zeilen.
- [ ] Abschließende Release-, Daten- und credential-basierte Sicherheits-Suite
  nach Bereinigung der operativen Daten vollständig grün ausführen.

Der Live-Export ist damit bewusst **blockiert**. Die Grenzwerte werden nicht an
den schlechteren Ist-Zustand angepasst; P0 wird erst nach der fachlichen
Datenbereinigung abgeschlossen.

### Fortsetzung vom 7. September 2026

- [x] Vorhandene mobile Discovery-, Navigations- und Scrollkorrekturen unabhängig
  geprüft: 23 gezielte Browserfälle, statischer Smoke und Layout-Audit grün.
  Der Änderungssatz ist als `19dc4f4` auf GitHub gesichert.
- [x] Den vorhandenen Cloudflare-Release über Wrangler lesend abgeglichen;
  Release-Metadaten und kritische Datei-Hashes der unveränderlichen
  Deployment-URL sowie anonyme Production-Zugriffe erfolgreich geprüft.
- [x] Technische Codeprüfungen über `test:code` vom aktuellen Datenzustand
  getrennt. `test:all` verlangt weiterhin zuerst sämtliche Release-Gates.
  Eine bestandene Codeprüfung ersetzt keine Daten- oder Sicherheitsfreigabe.
- [x] `test:code` vollständig erfolgreich ausgeführt, einschließlich aller
  83 Browserfälle. Die zusätzliche isolierte Prüfung der Release-Einstiegspunkte
  und Paketintegrität ist ebenfalls grün.
- [x] Build und Paketverifikation an denselben verpflichtenden Releasecheck
  gebunden. Die echte Negativprobe bestätigt: Bei roten Datengates bleiben
  `dist/`, Eventseiten, Daten und Sitemap bytegleich erhalten.
- [x] Den aktuellen Live-Katalog und Reviewblocker ausschließlich lesend
  erhoben: 332 Discovery-Editionen, davon 277 Deutschland, 989 Archiv-Editionen,
  0 gültige Frischenachweise, 164 vollständige Einträge (49,40 %).
- [x] Den regulären `data:refresh-public` erneut ausgeführt: Der Exporter
  verweigert diesen Bestand vor dem Schreiben wegen 332 statt mindestens 400
  Discovery-Editionen und 0 statt mindestens 55 % Frische.
- [x] Einen ersten fachlichen Korrekturbatch identifiziert: wepLAUF
  (Distanz/Startort), Friedberger Halbmarathon (Anmeldestatus) und Airport Race
  (Startadresse/Geodaten). Veranstalterangaben widersprechen bestehenden Feldern;
  technische Queue-Bereitschaft darf deshalb keine Verifizierung auslösen.
- [ ] Quellenbelege des ersten Batches vollständig prüfen, erforderliche
  Geonachweise ergänzen und die Faktenkorrektur am Quellsystem mit Vorherstand,
  Änderungsprotokoll und Nachprüfung durchführen. Erst danach neu attestieren.
- [ ] Die übrigen Quellen-, Feld- und Reviewkonflikte in priorisierten Batches
  auflösen und gültige künftige Editionen ergänzen, bis die unveränderten
  Kataloggates erfüllt sind.
- [ ] Lokale Docker-/Supabase-Testumgebung wiederherstellen und die vollständige
  RLS-Suite einschließlich erfolgreicher Admin-Verifikation ausführen.
- [ ] Anschließend frischen Export, vollständige Release-Abnahme, Preview und
  Production-Upload desselben geprüften Pakets ausführen.

Der technische GitHub-Stand kann nach bestandenen Codeprüfungen weitergeführt
werden; die Produktionsveröffentlichung bleibt an die vollständige Abnahme
gebunden. Der letzte veröffentlichte Stand ist weiterhin
`20260901-mobile-stability-v84` (`8f6ae0e`). P0 ist nicht abgeschlossen.
Prüfnachweise, Abgrenzung und nächste Datenarbeiten stehen im
[Release-Folgeprotokoll](RELEASE_FOLLOWUP_20260907.md).

## P1 – Vollständiger, verifizierter Deutschland-Katalog

**Status:** GEPLANT

### Ziel

Die umfassendste verlässliche Datenbasis für Lauf-, Triathlon-, Trail- und
Ultraveranstaltungen in Deutschland schaffen. Wachstum wird nur gezählt, wenn
die Einträge aktuell, auffindbar und fachlich nutzbar sind.

### Deliverables

- Priorisierte Quellenliste nach Sportart, Bundesland und Reichweite erstellen;
  Abdeckungslücken als messbare Import-Batches bearbeiten.
- Stage 4 zunächst mit zwei bis drei offiziellen Quellen im reinen
  Beobachtungsmodus validieren, danach kontrolliert auf 10–15 Quellen und
  200–500 Beobachtungen erweitern; keine automatische Veröffentlichung.
- Review-Queue für neue, geänderte, stale und widersprüchliche Editionen mit
  klarer Zuständigkeit und Bearbeitungsfrist etablieren.
- Pflichtfelder, strukturierte Distanzen/Race-Formate, offizielle Links,
  Anmeldestatus und präzise Geodaten gezielt vervollständigen.
- Wiederkehrende Editionen über den bestehenden Lifecycle fortschreiben,
  anstatt historische und neue Veranstaltungen zu vermischen.

### Akzeptanzkriterien und KPIs

- Mindestens 1.000 verifizierte deutsche Event-Editionen im operativen Katalog.
- 100 % der veröffentlichten Einträge besitzen Name, Datum, Ort, Land,
  Sportart, offizielle Quelle und valide Geodaten.
- Mindestens 85 % Katalogfrische und 80 % Vollständigkeit nach den definierten
  Audit-Metriken.
- Bei künftigen Events innerhalb der nächsten 180 Tage ist der Anmeldestatus
  für mindestens 75 % bekannt.
- Weniger als 10 % des Discovery-Katalogs stehen auf `review_required`; keine
  kritische Review-Aufgabe ist länger als sieben Tage offen.
- Jede automatisch erkannte Änderung bleibt bis zur menschlichen Freigabe
  unveröffentlicht.

### Abhängigkeiten

- P0 abgeschlossen
- Verantwortliche Review-Kapazität und dokumentierte Quellenpriorisierung
- Beobachtungsdaten zeigen ausreichende Extraktionsqualität, bevor die
  Quellenzahl erhöht wird

## P2 – Skalierbare mobile Eventsuche

**Status:** GEPLANT

### Ziel

Athleten finden auf dem Smartphone mit wenigen Interaktionen relevante Events
und können eine Suche verlässlich teilen oder später wiederholen.

### Deliverables

- Standort- und Radiusfilter auf Basis valider Eventkoordinaten einführen.
- Den bereits kommunizierten Filter für den Anmeldestatus bereitstellen.
- Suchbegriff, Sortierung und aktive Filter in der URL abbilden; Zurück/Vor,
  Reload und geteilte Links stellen denselben Zustand wieder her.
- Eventliste progressiv rendern beziehungsweise paginieren; normale Ansichten
  dürfen nicht mehr den gesamten Trefferbestand sofort in den DOM schreiben.
- Karten- und Listeninteraktion, leere Zustände, Filterrücksetzung und
  mobile Bedienflächen gemeinsam optimieren.
- Datenschutzschonende Messpunkte für Suche, Filter, Ergebnisöffnung und
  Nulltreffer etablieren.

### Akzeptanzkriterien und KPIs

- Orts-/Radius-, Sport-, Datum-, Distanz- und Anmeldestatusfilter funktionieren
  kombinierbar auf den unterstützten mobilen Viewports.
- Jeder Filterzustand besitzt eine reproduzierbare URL und bleibt bei Navigation
  sowie Reload erhalten.
- Initial werden höchstens 50 Eventkarten gerendert; weitere Treffer erscheinen
  ohne Verlust des Karten- oder Scrollzustands.
- Keine Regression in bestehenden Such-, Favoriten-, Detail- und
  Barrierefreiheits-Tests.
- Mobile Feldziele, sobald genügend Messdaten vorliegen: LCP unter 2,5 Sekunden
  und INP unter 200 Millisekunden am 75. Perzentil.
- Nulltrefferquote, Filter-Nutzung und Klickrate auf Eventdetails sind als
  Baseline messbar; nachfolgende Optimierungen werden daran bewertet.

### Abhängigkeiten

- P0 abgeschlossen
- Ausreichend vollständige Geo- und Anmeldestatusdaten aus P1; technische
  Arbeiten ohne diese Datenabhängigkeit können parallel vorbereitet werden

## P3 – SEO-Discovery-Flächen

**Status:** GEPLANT

### Ziel

Relevante Suchintentionen außerhalb der Karte mit schnellen, hilfreichen und
indexierbaren Einstiegsseiten bedienen und von dort in die gefilterte Suche
oder zu einem Event führen.

### Deliverables

- Datengetriebene Landingpages für Sportarten, populäre Distanzen,
  Bundesländer/Regionen und sinnvolle Zeiträume generieren.
- Jede Landingpage mit eindeutigem Titel, Einleitung, aktuellem Ergebnisbestand,
  kanonischer URL, strukturierten Daten und passender interner Verlinkung
  ausliefern.
- Sitemaps nach Seitentyp aufteilen und Aktualisierung/Entfernung aus dem
  Katalog reproduzierbar handhaben.
- Qualitätsregeln gegen leere, veraltete, nahezu identische oder fachlich dünne
  Seiten in den Generator und das Release-Gate integrieren.
- Event-Structured-Data semantisch prüfen; Verifizierungsstatus darf nicht als
  Schema.org-Veranstaltungsstatus missverstanden werden.

### Akzeptanzkriterien und KPIs

- Nur Seiten mit ausreichendem aktuellem Eventbestand sind indexierbar; leere
  oder dünne Kombinationen erhalten kein Indexierungssignal.
- 100 % der generierten Seiten besitzen eindeutige Canonicals, Titles und
  Descriptions und bestehen die automatischen Schema-/Link-Prüfungen.
- Kein Event und keine Landingpage erscheint mehrfach unter unterschiedlichen
  indexierbaren URLs.
- Indexierung, organische Einstiege, Klicks in die Suche und Klicks auf
  Eventdetails werden je Seitentyp messbar.
- Organischer Erfolg wird erst nach einer Search-Console-Baseline als
  Wachstumsziel quantifiziert, nicht durch die bloße Anzahl erzeugter Seiten.

### Abhängigkeiten

- P1 liefert ausreichend dichte und aktuelle regionale Bestände
- P2 liefert stabile, URL-basierte Filterziele

## P4 – Modulare Auslieferung und CI

**Status:** GEPLANT

### Ziel

Die Anwendung bleibt trotz wachsendem Katalog schnell änderbar und sicher
auslieferbar. Öffentliche Nutzer laden nur den Code, den sie für die aktuelle
Ansicht benötigen.

### Deliverables

- Discovery, Datenzugriff, Auth/Favoriten, Planer und Admin in klar abgegrenzte
  Module mit definierten Schnittstellen trennen.
- Admin- und Planer-Code aus dem initialen öffentlichen Discovery-Pfad entfernen
  und bei Bedarf nachladen.
- Das monolithische Stylesheet in geordnete Foundations-, Komponenten- und
  Seitenbereiche zerlegen; doppelte und ungenutzte Regeln abbauen.
- Größenbudgets für initiale JavaScript-, CSS- und DOM-Kosten einführen.
- CI für Pull Requests und den Hauptbranch einrichten: Release-Check,
  Daten-/Sicherheitstests, statische Tests und Chromium-E2E.
- Generierte Artefakte auf reproduzierbare Builds und unbeabsichtigte
  Abweichungen prüfen.

### Akzeptanzkriterien und KPIs

- Die Discovery-Startseite lädt keinen Admin- oder Planer-Code vor einer
  entsprechenden Navigation.
- Automatisierte Budgets verhindern ein unbemerktes Wachstum der initialen
  JavaScript-, CSS- und DOM-Kosten; die in P2 gesetzte Obergrenze von 50 initial
  gerenderten Eventkarten bleibt bestehen.
- Jeder Pull Request durchläuft die verbindlichen Release-, Daten-, Sicherheits-
  und Browserprüfungen; erforderliche Checks müssen vor dem Merge grün sein.
- Lokaler und CI-Build erzeugen aus demselben Commit identische veröffentlichte
  Daten- und Seitenartefakte, abgesehen von explizit dokumentierten Zeitfeldern.
- Bestehende Nutzerabläufe und Production-RLS bleiben ohne Regression.

### Abhängigkeiten

- P0 abgeschlossen und Tests als verlässliche Refactoring-Sicherheitsbasis
- P2 definiert die Performance- und Ladeziele des Discovery-Pfads
- P4 darf früher in kleinen, risikoarmen Schritten beginnen, wenn dadurch P1
  oder P2 nicht verzögert wird

## Später – Bindung und Personalisierung

**Status:** GEPLANT, bewusst nicht terminiert

Erst nach Abschluss der Discovery- und Datenbasis werden folgende Themen neu
priorisiert:

- gespeicherte Suchanfragen und freiwillige Benachrichtigungen bei neuen oder
  geänderten passenden Events
- belastbare Nutzerkonten mit synchronisierten Favoriten und persönlichen
  Eventlisten
- weiterer Saisonplaner mit Wettkampfkalender, Countdown und A-/B-/C-Priorität
- standort-, distanz- und saisonbezogene Empfehlungen
- Veranstalter-Dashboard, Analytics und Premium-Platzierungen erst bei einer
  relevanten Nutzer- und Katalogbasis
- Garmin-/Strava-Integrationen erst, wenn sie die Eventsuche oder Saisonplanung
  nachweisbar verbessern

Nicht Teil der aktuellen Roadmap sind soziales Netzwerk, Chat/Messenger,
Trainingsanalyse, KI-Coaching oder allgemeine Community-Funktionen.

## Steuerung und Reihenfolge

1. P0 wird abgeschlossen, bevor neue Wachstumsfunktionen veröffentlicht werden.
2. P1 erhöht zuerst Reichweite und Qualität des Katalogs.
3. P2 macht diesen Bestand schneller und relevanter nutzbar.
4. P3 skaliert erst danach organische Einstiege auf geprüften Daten und stabilen
   Filter-URLs.
5. P4 folgt den realen Produktgrenzen aus P1/P2; kleine entkoppelnde Arbeiten
   sind parallel zulässig, aber kein Selbstzweck.

Der Status einer Stufe wird nur geändert, wenn ihre Akzeptanzkriterien mit den
zugehörigen Tests, Reports oder Produktmetriken belegt sind.
