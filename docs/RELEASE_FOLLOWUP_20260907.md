# Release-Folgeprotokoll vom 7. September 2026

Dieses Protokoll beschreibt den ersten Release-/GitHub-Abgleich. Die danach
beauftragte Fortsetzung hat drei Faktenkorrekturen produktiv angewendet, die
RLS-Testumgebung wiederhergestellt und den Crawlerfix gezielt veröffentlicht.
Der aktuelle Nachweis steht im
[P0-Faktenbatch-Protokoll](P0_EVENT_FACTS_BATCH_20260907.md); historische Aussagen
unten zu noch fehlender Laufzeit oder nicht erfolgten Datenbankwrites beziehen
sich ausschließlich auf den ersten Folgeschritt. Die Website-Datensperre bleibt.

## Ergebnis

Der Nutzer hat die Veröffentlichung fertiger Änderungen über Wrangler,
GitHub-Synchronisierung und anschließende Weiterarbeit nach Protokoll beauftragt.
Die geprüften Entwicklungsänderungen werden in `main` zusammengeführt. Die
fachliche Datenfreigabe ist weiterhin rot; es wurde kein Preview- oder
Production-Deployment erzeugt und die Releaseversion nicht erhöht.

Der technische Abschluss und die Produktionsfreigabe sind gemäß
[Entwicklungsworkflow](DEVELOPMENT_WORKFLOW.md) getrennte Nachweise. P0 bleibt
in Arbeit. Die im [Ausgangsaudit](SYNC_AUDIT_20260907.md) beschriebene Sperre des
damals ungeprüften Integrationsstands wird für die technisch geprüfte
GitHub-Integration durch dieses Protokoll ersetzt; die Datensperren bleiben.

## Abgeschlossene Änderungen

- `19dc4f4`: Mobile Discovery mit sichtbarer Karte/Liste, bedienbaren
  Filteraktionen, stabiler Navigation und Touch-Scrolling der Informationsseiten.
  Vorhandene Änderungen unabhängig geprüft und als eigenen Commit gesichert.
- `1d1b356`: Gemeinsame verpflichtende Releaseprüfung vor Build und
  Paketverifikation; vollständige technische Prüfkette `test:code`, weiterhin
  zwingende Datengates in `test:all`; Prüfung aller Paketdateien und Eventseiten
  einschließlich der mobilen Assets. Die Eventseitenzahl folgt dem geprüften
  Katalog statt dem historischen Festwert 994.
- Roadmap und Betriebsprotokoll aktualisiert; die bereits vorhandene kurze
  README-Fassung beibehalten.

Keine operative Datenbankänderung, Migration oder Source-Monitor-Aktion wurde
in diesem Folgeschritt ausgeführt. Der bestehende Freshness-/Backend-Diff wurde
zusätzlich geprüft; dabei wurden keine neuen konkreten Codeblocker gefunden.
Das ersetzt keine dynamische Sicherheitsabnahme des privilegierten Pfads.

## Validierung

| Prüfung | Ergebnis |
| --- | --- |
| `npm run test:code` | Vollständig grün; alle technischen Gruppen und 83 von 83 Browserfällen |
| Gezielte mobile Erstabnahme | 23 von 23 Browserfällen grün |
| `test:release-entrypoints` | Grün; sieben Fehlerarten über check/build/verify, Dateierhalt und Paketmanipulationen geprüft |
| `audit:layout` | Grün, 0 Warnungen |
| `audit:anon` | Grün; freigegebene Events öffentlich, Pending-Events und private Tabellen nicht anonym lesbar |
| `audit:freshness:production` | Grün; öffentlicher Boolean-Guard, unbekannte Edition fail-closed, Admin-RPCs anonym verweigert |
| `test:rls:local` | Nicht ausführbar: lokale Docker-Engine/Supabase-Laufzeit fehlt |
| Credential-basierte `test:rls` | Nicht ausgeführt; keine bereitgestellten Testkonten |
| `test:all` / `check` | Gesperrt: fünf release-blockierende Dublettenkandidaten im alten Fallback |
| Separater Katalogcheck | Gesperrt: Export vom 27.08.2026 überschreitet 24 Stunden |
| `data:refresh-public` | Vor dem Schreiben abgelehnt: 332 statt mindestens 400 Discovery, 0 statt mindestens 55 % Frische |
| Echte Negativprobe Build/Paketverifikation | Beide stoppen bei der Datenfreigabe; gesamter Inhalt von `dist/`, `data/`, `event/` und Sitemap davor/danach bytegleich |

Browserprüfungen verwenden Chromium und mobile Emulation mit kontrollierten
Fixtures. Sie bestätigen weder Safari-Kompatibilität noch die fachliche
Richtigkeit des Production-Katalogs. Die privilegierten Admin-Erfolgsfälle und
angemeldete Benutzerisolation müssen in der wiederhergestellten RLS-Umgebung
noch dynamisch geprüft werden.

## Verifizierter bestehender Production-Stand

Wrangler bestätigt Deployment `1547ae47-5d6e-41a9-8e2b-97aa0108ccf7`, Branch
`main`, Quellcommit `8f6ae0e1e3cbccf3978ee859231f2b5ad5d6bf75`.
Die unveränderliche [Deployment-URL](https://1547ae47.sporteventmap.pages.dev/)
besteht die vorhandene Release-Metadaten- und kritische Datei-Hashprüfung.
[sporteventmap.com/release.json](https://sporteventmap.com/release.json) meldet
weiterhin `20260901-mobile-stability-v84`, gebaut am 01.09.2026 um 11:25:56 UTC.
GitHub-Pushes veröffentlichen bei diesem Direct-Upload-Projekt keine Website.

## Nächste fachliche Datenarbeit

**Fortschreibung vom 8. September, 00:07 MESZ:** Der
[vollständige Folge-Review](P0_EVENT_FULL_REVIEW_20260907.md) ist für wepLAUF,
Friedberg und Airport Race abgeschlossen. Alle drei Editionen sind faktisch
korrigiert und über eine echte Admin-Sitzung mit 14 quellengebundenen Feldern
attestiert. Der reguläre Refresh bestätigt jetzt 3 von 332 frischen Editionen
(0,90 %); Bestand und Frische bleiben unter den bestehenden Releasegrenzen.
Die ursprüngliche Diagnose unten bleibt als Ausgangsstand dokumentiert.

Die heutige Diagnose bestätigt 332 Discovery-Editionen (277 Deutschland),
989 Archiv-Editionen, 0 gültige Frischenachweise und 164 vollständige Einträge
(49,40 %). 330 Editionen haben einen unbekannten Anmeldestatus.
113 Editionen besitzen mindestens einen Reviewkonflikt; 169 haben fehlende
Zentralfelder. Diese Mengen überlappen.

98 Editionen sind formal für einen Feldreview vorbereitet. Das ist keine
fachliche Freigabe: Darunter befinden sich 26 Import-Platzhaltertexte und acht
Kalender-URLs, deren Zuordnung als offizielle Veranstalterquelle erst zu prüfen
ist. Frische darf nicht durch pauschale Bestätigung hergestellt werden.

Der erste begrenzte Faktenbatch betrifft drei deutsche Events am 13.09.2026:

| Event | Vor der Attestierung zu klären |
| --- | --- |
| wepLAUF, Event 108 | Exakte Distanzen, Startort, eigene Beschreibung und editionsbezogener Anmeldelink |
| Friedberger Halbmarathon, Event 109 | Vom Veranstalter gemeldetes „ausgebucht“, Startort, Geodaten und Beschreibung |
| Airport Race, Event 284 | Startadresse Borsteler Chaussee 330, präzise Startkoordinaten, vollständige Beschreibung und Anmeldebedingungen |

Die lokalen Vorherwerte, Quellenlinks, lesenden Diagnoseabfragen und offenen
Evidenzlücken liegen im ignorierten Ordner `exports/p0-readiness-20260907/`.
Die Quellenerkundung ist ausdrücklich keine aktuelle vollständige Prüfung aller
14 Felder. Insbesondere fehlen präzise belegte Startkoordinaten. Diese
Diagnosedateien sind kein veröffentlichbarer Katalog und gehören nicht in `dist/`.

Als nächster Quellenbatch sind Mülheimer Firmenlauf (236, 17.09.,
`empty_content`) und BraunenBerg-Lauf (377, 19.09., `pinned_connect_error`)
priorisiert. Insgesamt betreffen harte Quellen-/Workflowblocker sieben deutsche
Editionen innerhalb der nächsten 30 Tage.

Das bestehende Gate benötigt mindestens 400 Discovery-Einträge und 55 %
Frische, also bei genau 400 mindestens 220 tatsächlich verifizierte Editionen.
Gegenüber 332 fehlen 68 Nettozugänge; auslaufende Veranstaltungen erhöhen den
Arbeitsumfang. Die bisherige Abrundung der 15-%-Bestandsgrenze wurde nicht
geändert; die mathematisch exakte Grenze läge bei 401/221.

Die nächsten Schritte sind vollständige Quellen-/Geoprüfung des kleinen
Korrekturbatches, protokollierte Faktenkorrekturen mit Vorherstand und Nachprüfung,
anschließende Attestierung, weitere priorisierte Reviews und gültige zukünftige
Editionen. Erst danach folgen aktueller Export, gebundene Audits, vollständige
Sicherheits- und Releaseabnahme sowie Preview und identischer Production-Upload.
