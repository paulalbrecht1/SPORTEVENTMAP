# P0-Plan: höhere Prüfleistung bei unveränderten Qualitätsanforderungen

Stand: 8. September 2026, nach Commit `477439f` und Faktenbatch 05.
Dieses Dokument bewahrt den ursprünglichen Umsetzungsplan. Inzwischen sind die
ersten beiden Technikschritte implementiert und geprüft; die Backendabsicherung
ist produktiv. Stand, Prüfungen und verbleibende Grenzen stehen im
[Umsetzungsnachweis](P0_THROUGHPUT_IMPLEMENTATION_20260908.md).
Der fachliche Pilot, die Qualitätsgrenze und der Website-Release bleiben offen.

## Ziel und belastbarer Ausgangspunkt

Die Releasegrenze wird mit vollständig belegten Daten und demselben
Zugriffsschutz erreicht. Zeitgewinn entsteht durch gemeinsame Vorbereitung,
parallele Quellenarbeit und weniger wiederholte Handarbeit je Event.
Die individuelle Quellenprüfung wird nicht durch Stichproben ersetzt.

Live um 08:03 UTC: 330 sichtbare Eventidentitäten, 15 gültige Frischenachweise,
989 Archiv-Editionen. Der letzte reguläre Exportversuch bestätigt 50 %
Vollständigkeit. Verbindlich bleiben `catalog-release-policy.json` und die
vorhandenen Releaseprüfungen: mindestens 400 Discovery-Einträge, 55 % Frische,
45 % Vollständigkeit, ein höchstens 24 Stunden alter Export sowie gültige,
daran gebundene Daten-Audits. Die bestehende Archiv-Bestandsgrenze ergibt
effektiv mindestens 974 Einträge. Keine Änderung dieser Regeln ist vorgesehen.

Die bisherige Hochrechnung von 70 fehlenden Events und 205 zusätzlichen
Frischenachweisen ist eine Momentaufnahme. Für einen späteren Release reicht
sie nicht: Editionen verlassen Discovery und Prüfungen werden fällig.
Eine lesende Projektion verwendet die tatsächlichen Live-Viewregeln und
berücksichtigt bereits veröffentlichte Nachfolger:

| Releasehorizont ab 08.09. | Sichtbar ohne weitere Änderungen | Fehlend bis 400 |
| --- | ---: | ---: |
| Heute | 330 | 70 |
| In 3 Tagen | 327 | 73 |
| In 7 Tagen | 281 | 119 |
| In 14 Tagen | 230 | 170 |
| In 21 Tagen | 210 | 190 |

13 der aktuell 15 gültigen Nachweise werden binnen sieben Tagen zur
Wiederprüfung fällig, alle 15 binnen 14 Tagen. Ohne erneute Prüfung erfüllen
sie anschließend `next_check_at > now()` nicht mehr. Zusätzliche
Quellenänderungen oder neue Konflikte können früheren Prüfbedarf erzeugen.
Die Projektion ist kein behaupteter zukünftiger Iststand; neue Freigaben und
weitere Änderungen sind darin nicht enthalten.

Wir rechnen vor jedem Paket mit dem tatsächlichen Releasehorizont:
`fehlende Sichtbarkeit = Zielbestand − dort verbleibender Bestand` und
`fehlende Frische = ceil(0,55 × Zielbestand) − dann noch gültige Nachweise`.
Jede vollständig attestierte neue sichtbare Identität hilft beiden Größen.
Eine zweite Edition eines bereits sichtbaren Events ist kein Nettozugang.

Als Arbeitsreserve werden zunächst **420 sichtbare Events und 60 % Frische
(252 gültige Nachweise)** angestrebt; dies ist keine neue Freigaberegel.
Bei sieben Tagen Horizont wären dafür 139 Zugänge und ungefähr 250 neue bzw.
erneuerte Nachweise nötig, sofern zwei bisherige gültig bleiben. Bei 14 Tagen
wären es 190 Zugänge und 252 Nachweise. Diese Mengen werden laufend neu berechnet.
Die Reserve wird zusätzlich auf absehbare Abgänge nach dem Release geprüft.

## Reihenfolge der Umsetzung

| Schritt | Konkretes Ergebnis | Voraussetzung für Abschluss |
| --- | --- | --- |
| 1. Paketablauf vereinheitlichen | Versionierter Generator aus einem freigegebenen Manifest; feste Templates für Fakten-Apply, Verify und Rollback; unveränderter Adminimport und gemeinsamer Nachweisbericht | Identische eingefrorene Eingaben ergeben identische Ausgaben; echte lokale 10er-/25er-Proben bestehen einschließlich Fehler beim letzten Eintrag |
| 2. Neue Editionen sicher freigeben | Eng begrenzter, mit 14 aktuellen Feldbelegen abgesicherter Veröffentlichungsweg; saubere Trennung von Kandidat, Entwurf und Freigabe | Keine ungeprüfte öffentliche Zwischenphase, keine Übernahme alter Formate oder Anmeldestatus allein wegen einer URL; Identitäts-, Quellen-, Rechte- und Konkurrenzprüfungen bestanden |
| Parallel zu 1/2: Quellenliste erweitern | Ausreichende Auswahl zukünftiger deutscher Lauf-, Trail-, Ultra- und Triathlonevents mit offizieller aktueller Quelle | Zuerst Identität, Ausgabe, Termin und tatsächlichen Nettoeffekt prüfen; Kandidaten bleiben bis zum Vollreview unfreigegeben |
| 3. Zwei Pilotpakete abschließen | Erst 10 vollständige Reviews, anschließend weitere 10; insgesamt mindestens fünf vorher unsichtbare Identitäten | Jedes Event fachlich unabhängig gegengeprüft, produktiv separat nachgewiesen; Aufwand und Ausschuss erfasst |
| 4. Regelbetrieb mit 10–25 | Belegbare Fälle kontinuierlich recherchieren, prüfen, anwenden und attestieren | Kein Warten auf ein volles 25er-Paket bei alternden Belegen; alle Schutzprüfungen bleiben verbindlich |
| 5. Release vollständig abnehmen | Frischer regulärer Export, gebundene Audits, Code-/Sicherheitstests, geprüftes Paket, Preview und identischer Wrangler-Production-Upload | Sämtliche bestehenden Gates bestehen; produktive Version, Datei-Hashes und Kernabläufe nachgeprüft; GitHub abgeglichen |

Schritte 1 und 2 werden parallel bearbeitet. Der bestehende Adminimport und
`verify_freshness_review_editions` unterstützen bereits 1–25 Editionen und
bewusste Einzelbestätigung. Eine neue Sammelprüfungsoberfläche ist nicht nötig.
Der lokale Batch-05-Generator enthält dagegen feste IDs, Termine, Formatzahlen
und Textersetzungen in älteren SQL-Dateien. Genau diesen wiederkehrenden
Sonderaufwand beseitigt Schritt 1.

Das anfängliche Planungsbudget für beide Technikschritte zusammen beträgt
8–12 Stunden verstrichener Arbeitszeit bei paralleler Bearbeitung. Nach vier
Stunden wird der Restumfang geprüft. Das Budget ist ungemessen und erzwingt
keine unvollständige Abnahme; bei Problemen wird der Scope enger gehalten und
die Restdauer korrigiert. Keine neue Importplattform, kein generisches
Workflowframework und kein automatisches Freigabesystem werden gebaut.

## Vier Arbeitsrollen und kurze Pakete

Während der Technikvorbereitung übernimmt die Hauptinstanz den Freigabepfad,
eine zweite Instanz den Paketgenerator, eine dritte die Quellenliste und eine
vierte den unabhängigen Review. Danach recherchieren zwei Instanzen parallel;
eine dritte prüft jedes fertige Feldpaket gegen die Originale. Die Hauptinstanz
übernimmt Paketabnahme, Produktionsanwendung, echte Adminbestätigung und Messung.
Nur eine Instanz schreibt Produktionsdaten; parallele Recherche verwendet
getrennte, eindeutig einer Eventidentität zugeordnete Arbeitsmappen.

Die fachliche Kapazität richtet sich nach beiden Restlücken. Anfangs gehen
voraussichtlich 60–75 % in neue oder künftig weiter sichtbare Editionen,
der Rest in Bestandsreviews und notwendige Nachprüfungen. Akute belegte Fehler
bei bevorstehenden Events bleiben priorisiert, auch wenn sie wenig zur
langfristigen Quote beitragen. Gültige Events werden nicht zur Verbesserung
der Quote ausgeblendet und Termine nicht künstlich verlängert.

Vor vollständiger Recherche erfolgt eine kurze Vorprüfung: richtige Ausgabe,
offizielle Quelle, Termin, Identität/Dublette, vollständiges Programm,
Anmeldeseite und Veranstaltungsort. Bleibt nach etwa fünf Minuten ein
Grundkonflikt offen, wird er mit konkretem fehlendem Beleg zurückgestellt.
Das ist eine Suchzeitgrenze, kein verkürzter Qualitätsnachweis. Vorhandene
Teilpakete wie Rostock, Köhlbrand, Braunenberg, twinfit und Balingen werden
nicht pauschal bestätigt. Sie werden erneut bearbeitet, wenn ihr fehlender
Beleg vorliegt oder ein akuter Nutzerfehler es verlangt.

Die vorhandene Liste umfasst lediglich 52 derzeit unsichtbare Eventidentitäten
mit offenen zukünftigen Kandidaten, davon 50 deutsche. Selbst wenn alle 50
geeignet wären, fehlen bei sieben Tagen Horizont mindestens weitere 69 bis
zum Mindestbestand. Deshalb werden zusätzliche offizielle Veranstalter- und
Anmeldeseiten bereits parallel zur Technik gesucht. Kalender liefern Hinweise,
aber keine fachliche Freigabe. Beispiel für die Kapazitätsplanung: Bei einem
angenommenen Anteil von 70 % vollständig belegbarer Fälle benötigen 139
Zugänge rund 199 Kandidaten. Dieser Anteil muss im Pilot gemessen werden.

Die 70 vorgefilterten Bestandsevents besitzen 70 unterschiedliche Quellenhosts.
Ein großer Gewinn durch gemeinsame Veranstalterabrufe ist hier nicht belegt.
Wiederverwendung konzentriert sich daher auf Anmeldeanbieter und Belegaufbereitung:
Drei der vier bisherigen Pilotfälle nutzen RaceResult, einer Datasport.
Ein passender Abruf kann mehrere ausdrücklich genannte Rennen desselben Events
belegen. Parser und Einheitenumrechnung sind wiederverwendbar; Eventidentität,
Ausgabe und einzelne Fakten müssen dennoch jedes Mal zur Quelle passen.
Ein Veranstaltungsstättenbeleg darf nur bei bestätigter gleicher Zuordnung
wiederverwendet werden. Ein Geocoderergebnis allein bestätigt keinen Startort.
Anfragen bleiben begrenzt; Quellenfehler werden nicht durch manipulierte
Crawlerzustände oder abgeschaltete Prüfungen verdeckt.

## Unveränderte Qualitätsanforderungen

Jede vollständige Freigabe verlangt sämtliche 14 bestehenden Felder:
Eventname, Ausgabejahr, Datum, Stadt, Land, Adresse, Breitengrad, Längengrad,
Sport, vollständige Distanzen/Wettbewerbe, Beschreibung, Anmeldestatus,
offizielle Eventseite und Anmeldelink. Zu jedem Feld gehören beobachteter
Wert, konkrete Quelle, Quellenzeit und der originale Beleg mit Prüfsumme.
Ein abgeleiteter Beschreibungs- oder Umrechnungswert muss vollständig aus den
belegten Tatsachen nachvollziehbar sein. Konfidenz ersetzt keinen Beleg.

- Alle 14 Felder werden von einer zweiten Instanz geprüft, nicht nur eine
  Stichprobe. Konflikte, unbekannte Ausgaben und unsichere Felder verhindern
  die Vollfreigabe. Automatischer Soll-/Ist-Vergleich ersetzt kein Quellenlesen.
- Beobachtete Werte werden niemals aus dem gespeicherten Datenbestand ergänzt,
  um einen Vergleich passend zu machen. Mehrere Starts, Staffeln, Kinderläufe
  und vom Veranstalter angegebene Distanzpräzision bleiben erhalten.
- Bei der Adminattestierung müssen die tatsächlichen Quellenprüfungen weiterhin
  innerhalb von 24 Stunden liegen. Originalzeiten werden nicht aufgefrischt.
  Ziel ist ein Abschluss am selben Arbeitstag, möglichst binnen vier Stunden
  nach dem ersten Feldreview. Bei Alterung werden Quellen tatsächlich neu geprüft.
- Quelle und Edition müssen exakt zusammenpassen. Neue Quellen durchlaufen
  einen echten gesunden Abruf und die bestehenden Stabilitätsbedingungen.
  Offene Aufgaben, Vorschläge, relevante Fehler, Quellenjobs und Änderungen
  werden unmittelbar vor der Freigabe erneut berücksichtigt.
- Die echte Admin-Sitzung und bewusste Bestätigung jedes Events bleiben nötig.
  Keine künstlichen JWTs, Identitätswechsel oder vorgetäuschten RPC-Ergebnisse.

## Technische Absicherung ohne wiederholte Sonderlösungen

Das Manifest bindet Paket-ID, exakte Event-/Edition-/Source-Zuordnung,
Vorherzustand, Feldbelege und Dateihashes. Der erste allgemeine Faktenrunner
beschränkt sich auf bestehende Editionen und eine feste Feld-Whitelist.
Publikationsänderungen, neue Editionen, Absagen und Quellenwechsel besitzen
einen separat geprüften Weg. Ein bereits korrekter Datensatz benötigt keinen
künstlichen Faktenpatch und kann direkt vollständig attestiert werden.

Pro Faktenpaket bleiben frisches verschlüsseltes Backup, isolierter Restore
und tatsächliche Apply-/Verify-/Rollbackprobe vorgeschrieben. Der praktische
Wiederholungs-, Drift- und Referenzschutz bleibt bestehen. Paketgröße wird
zunächst 10, nach erfolgreicher Abnahme höchstens 25; bestehende Lock- und
Statement-Zeitgrenzen werden nicht vorsorglich erhöht. Ein Timeout wird
analysiert; nötigenfalls werden kleinere Pakete verwendet.

Faktenkorrektur und Frischeattestierung sind zwei getrennte atomare Transaktionen.
Scheitert die zweite, bleiben die korrekt geänderten Fakten mit Reviewbedarf
bestehen. Der Batch ist dann nicht vollständig abgeschlossen. Nach einer
verlorenen Antwort wird zuerst der tatsächliche Zustand gelesen; kein blindes
Wiederholen und keine automatische Rücknahme zwischenzeitlicher Änderungen.

Der neue Editionsweg muss zusätzlich einen wichtigen bestehenden Widerspruch
lösen: Der Frische-RPC verlangt derzeit eine bereits veröffentlichte,
öffentlich sichtbare Edition. Daher genügt es nicht, zunächst zu veröffentlichen
und später zu prüfen. Der minimale vorgesehene Weg bereitet belegte Fakten in
einem unterdrückten Entwurf vor und ergänzt die bestehende Kandidatenfreigabe
um Notizen und den vorhandenen Feldbelegvertrag. Innerhalb einer Transaktion
wird die ausgewählte Edition veröffentlicht und anschließend der vorhandene
Frische-RPC aufgerufen. Erst dessen Erfolg darf den Commit erlauben; ein Fehler
rollt Publikation und Attestierung gemeinsam zurück. Alte Aufrufe ohne Belege
dürfen nicht mehr veröffentlichen. Der vorhandene Sammeldialog wird um einen
Entwurfskontext und diesen gesonderten Submit ergänzt.

Die Freigabe verlangt genau 1–25 explizite eindeutige Kandidaten, ohne
automatische Gesamtauswahl, stille Kürzung oder übersprungene gesperrte Ziele.
Der Registrierungsweg für neue Kandidaten wird zugleich so abgeglichen,
dass bloße Erkennung keine Entwürfe mit kopierten Vorjahresangaben mehr erzeugt.
Vorhandene Legacy-Entwürfe werden einzeln geprüft. Die offizielle Quelle wird
neu und editionsrichtig gebunden; ihr Gesundheitszustand entsteht durch echte
Abrufe. Notwendige Schemaergänzungen und der Folgeeditionszweig der Admin-Inbox
bleiben auf diese Änderung beschränkt.

Das ist ein Implementierungsentwurf, dessen sichere Funktionsaufrufe,
Rechteprüfung, Kandidaten-/Quellenzustände und Triggerreihenfolge noch am
isolierten Klon nachzuweisen sind. Diese gemeinsame Transaktion betrifft den
neuen Publikationsweg; sie ändert nicht die zwei getrennten Transaktionen für
Faktenkorrekturen bereits veröffentlichter Editionen. Der äußere
Publikationsvorgang erhält einen eigenen ehrlichen Audit; er darf nicht als
Vorgang ohne Faktenänderungen ausgegeben werden. `automatic_fact_changes=false`
beschreibt ausschließlich die innere unverändernde Frischeprüfung.
Neue Fakten dürfen
historische Editionen und deren Referenzen nicht unbemerkt überschreiben.
Unterschiedliche Ausgabenangaben in gemeinsam genutzten Eventstammdaten sind
vor einer Freigabe gesondert zu lösen oder als konkreter Blocker zurückzustellen.

Lesender Livebefund vom 08.09.: Die alte Kandidatenfreigabe versucht weiterhin,
anhand von Datum/URL `verified` und einen neuen Prüfzeitpunkt zu setzen. Ein
vorhandener Trigger setzt den Reviewbedarf bei Veröffentlichung zurück; der
öffentliche Guard zählt das nicht als Frische. Ungeprüfte Publikation und aus
Vorjahren kopierte Entwurfsdaten bleiben dennoch ein Blocker. Die vorhandene
Sperre automatischer Publikation bleibt bestehen. Historische Migrationen
werden nicht pauschal nachgespielt; nur die erforderlichen Funktionen,
Aufrufer und Verträge werden gezielt abgeglichen.

Bei Einführung bzw. Änderung von Runner, SQL-Template oder privilegiertem
Freigabepfad: relevante Regressionen, vollständige technische Suite und
erforderliche RLS-/Live-Zugriffstests. Echte 1/10/25-Fälle und ein Fehler beim
letzten Eintrag müssen vollständigen Rollback beweisen. Ungültige Batchgrößen,
falsche Quellen/Ausgaben, alte Belege, Typfehler, unbefugte Aufrufe, Dubletten,
Paralleländerungen und Wiederholungen müssen abgewiesen werden.
Bei unverändertem Code werden pro Datenpaket dessen vollständige Fakten-,
Quellen-, Zustands-, Restore- und Zugriffsprüfungen ausgeführt. Unabhängige
Frontend-Volltests werden nicht ohne Codeänderung neu gestartet. Vor dem
Website-Release bleibt die gesamte vorgeschriebene Releaseabnahme verpflichtend.

## Pilot, Messung und Zeitprognose

Gezählt werden nur unabhängig geprüfte und produktiv nachgewiesene Ergebnisse.
Der Pilot umfasst 20 vollständige Events in zwei Paketen, darunter mindestens
fünf tatsächlich neue sichtbare Identitäten. Bleibt dieses Mindestmaß an
Nettozugängen aus, ist der Prozess noch nicht als Wachstumspfad abgenommen.

Je Paket werden erhoben: recherchierte Kandidaten, vollständig akzeptierte
Belege, zurückgestellte Gründe, notwendige Nacharbeit, angewendete Fakten,
gültige öffentliche Frischenachweise und sichtbare Identitäten vorher/nachher.
Die Zeitmessung umfasst Recherche, unabhängigen Review, Anwendung,
Adminbestätigung und Nachprüfung. Parallele Zeiten werden nicht doppelt
addiert; Gesamtaufwand der Instanzen wird zusätzlich getrennt ausgewiesen.
Neuaufbau, Wiederprüfung und reine Vorbereitung erhalten getrennte Zähler.

Arbeitsziel im Serienbetrieb: **5–8 korrekt abgeschlossene Events je Stunde
verstrichener Teamarbeitszeit**, einschließlich Paketabnahme. Das ist ein
noch unbewiesener Zielwert. Fehler werden nicht zugunsten dieses Ziels
akzeptiert. Erst nach den zwei Pilotpaketen wird mit dem gemessenen Gesamt-
und Neuzugangsdurchsatz die Restdauer berechnet.

Ein Szenario von 250 benötigten Nachweisen bei 5–8 akzeptierten Abschlüssen
pro Stunde ergibt ungefähr 31–50 Stunden Serienarbeit, zusätzlich zur
einmaligen Technikvorbereitung. Zusammen mit dem vorläufigen Technikbudget
wären das rund 39–62 Stunden. Ein ambitioniertes Arbeitsziel sind damit
**5–8 volle Arbeitstage**. Es ist keine Terminzusage: erfolgreiche
Neuzugänge, Kandidatenausschuss, noch fehlende offizielle Ausschreibungen,
Adminverfügbarkeit und die kalenderabhängigen Abgänge begrenzen die Prognose.
Die frühere statische 2–5-Wochen-Schätzung wird durch diese bewegliche Rechnung
ersetzt, nicht durch ein ungemessenes Geschwindigkeitsversprechen.

Nach jedem Paket und mindestens zu Beginn jedes Arbeitstags werden
Releasehorizont, aktuelle Restlücken und fällige Nachprüfungen neu berechnet.
Bei weniger als fünf Abschlüssen pro Stunde in beiden Pilotpaketen wird vor
Skalierung der tatsächlich gemessene Engpass beseitigt. Bei Quellenmangel
wächst zuerst die Kandidatenliste; bei Reviewrückstau wechselt eine
Rechercheinstanz in den Review. Kritische Fehler stoppen das betroffene Paket
und lösen eine Ursachenprüfung vor dessen erneuter Freigabe aus. Bei einem
Fehler in gemeinsam genutzten Parsern, Regeln oder Templates werden alle davon
betroffenen Pakete gesperrt und bereits angewendete Ergebnisse nachgeprüft.

## Abschluss und Nachweise

Fertig ist dieser P0-Schritt erst, wenn der reguläre Export und sämtliche
Releaseprüfungen erfolgreich sind und das geprüfte Paket veröffentlicht sowie
produktiv nachgeprüft wurde. Ein vorbereiteter Kandidat, ein grüner Crawler,
ein Faktenpatch oder ein GitHub-Push allein zählen nicht als Datenfreigabe.
Die alten fünf Dublettenkandidaten werden mit einem zulässigen neuen Export
erneut an dessen Daten auditiert; kein Bericht wird manuell zur Freigabe geändert.

Planungsgrundlagen: [Batch 05](P0_BATCH_05_20260908.md),
[bestehende Vorprüfung](P0_ACCELERATION_20260908.md),
[Entwicklungsworkflow](DEVELOPMENT_WORKFLOW.md),
[Recovery-Ablauf](PRODUCTION_RECOVERY_RUNBOOK.md) und aktuelle Live-Funktionen.
Die lesenden Projektionen und ihre UTC-Zeiten sind lokal unter
`exports/p0-throughput-plan-20260908/` erhalten und bleiben außerhalb von Git.
