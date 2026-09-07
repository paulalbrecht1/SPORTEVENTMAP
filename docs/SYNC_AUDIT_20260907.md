# Abgleich von lokalem Stand, GitHub und Production

Stand: 7. September 2026. Alle Production-Abfragen in diesem Audit waren lesend.

Dieser Ausgangsaudit hält den früheren Stand dieses Tages fest. Der spätere
technische Abschluss mit 83 erfolgreichen Browserfällen, GitHub-Integration
und weiterhin gesperrtem Production-Release steht im
[Release-Folgeprotokoll](RELEASE_FOLLOWUP_20260907.md).

## Ergebnis

GitHub `main`, lokales `main` und der bestehende Cloudflare-Release gehören zum
gleichen Commit `8f6ae0e1e3cbccf3978ee859231f2b5ad5d6bf75`. Der lokale
Entwicklungsstand enthält zusätzlich den Commit `1d32107` und bislang
unversionierte P0-, Freshness-, Datenprüfungs- und Oberflächenänderungen.

Der Entwicklungsstand wird für den vom Nutzer beauftragten Abgleich auf dem
Integrationsbranch `sync/p0-review-20260907` gesichert. Er ist ausdrücklich ein
unfertiger, nicht zur Veröffentlichung freigegebener Arbeitsstand. Dies ist
keine abgeschlossene P0-Aufgabe und kein Ersatz für die grünen Abschluss- und
Releaseprüfungen aus [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md).
`main` und Production bleiben beim vorhandenen Release, solange die unten
beschriebenen Sperren bestehen. Keine Qualitätsgrenze wurde abgesenkt und kein
Prüfdatum künstlich erneuert.

## Vergleich der Stände

| Bereich | Festgestellter Stand | Nachweis |
| --- | --- | --- |
| GitHub und lokales `main` | `8f6ae0e`, nach aktuellem Fetch identisch | `git fetch origin --prune`, Git-Referenzen |
| Lokaler Entwicklungsbranch beim Start | `fix/catalog-release-line-endings`, `1d32107`, ein Commit vor `origin/main`, 41 geänderte/neue Pfade | Git-Status und Commitvergleich |
| Öffentliche Website | `20260901-mobile-stability-v84`, Commit `8f6ae0e`, Build vom 01.09.2026 11:25:56 UTC | [release.json](https://sporteventmap.com/release.json) |
| Cloudflare Production | Deployment `1547ae47-5d6e-41a9-8e2b-97aa0108ccf7`, Branch `main`, Source `8f6ae0e` | Lesende Wrangler-Deploymentliste |
| Lokales `dist/` | Metadaten identisch mit diesem Production-Release | Vergleich der vollständigen Release-Metadaten |
| Supabase-Migrationen | 48 lokale Dateien, 38 Remote-History-Einträge; zehn lokale Versionen dort nicht eingetragen | Lokales Inventar und `list_migrations` |
| Freshness-Backend | Migration `20260904080319` remote eingetragen; öffentlicher Guard und private Admin-Schnittstellen geprüft | Migration-History und Live-Zugriffstests |
| Source-Monitor | `event-source-check` v19 aktiv; alle elf zurückgelieferten Quelldateien stimmen textgenau mit den lokalen Dateien überein | `get_edge_function` und Dateivergleich |

Alle acht kritischen Dateien auf der unveränderlichen
[Cloudflare-Deployment-URL](https://1547ae47.sporteventmap.pages.dev/) stimmen
mit den SHA-256-Werten des Release-Manifests überein. Auf der Hauptdomain
stimmen sieben direkt überein; Cloudflare ergänzt das HTML um eigene
`cdn-cgi`-Inhalte. Die dortige rohe HTML-Prüfsumme ist deshalb anders. Das ist
kein Nachweis eines anderen Quellcode-Releases. Für künftige Releases zuerst
die unveränderliche Deployment-URL auf Bytegleichheit und danach die
Hauptdomain auf Funktion prüfen; die Hashprüfung nicht pauschal aufweichen.

Die zehn nicht in der Remote-History eingetragenen Versionen sind:
`20260815`, `20260816`, `20260817`, `20260817124600`, `20260818`, `20260819`,
`20260820`, `20260821`, `20260822`, `20260824`. Das beweist eine
Historienabweichung, nicht automatisch das Fehlen aller zugehörigen
Schemaobjekte. Ein vollständiger Schemavergleich wurde hier nicht vorgenommen.
Kein pauschales `db push`, kein nachträgliches Markieren dieser Versionen und
kein Backend-Rollout wurden ausgeführt.

## Datenstand und konkrete Veröffentlichungssperren

| Kennzahl | Versionierter/veröffentlichter Fallback | Production am 07.09.2026 |
| --- | ---: | ---: |
| Exportzeitpunkt | 27.08.2026 07:41 UTC | Aktuelle lesende Abfrage |
| Aktive Discovery-Editionen | 431 | 332 |
| Davon Deutschland | 373 | 277 |
| Öffentliche Archiv-Editionen | 994 | 989 |
| Frische laut jeweiligem Prüfverfahren | 276 / 64,04 % beim alten Export | 0 / 0 % mit dem aktuellen strengen Quellen-Guard |
| Vollständigkeit | 209 / 48,49 % | 164 / 49,40 % |
| Unbekannter Anmeldestatus | 414 | 330 |

Die beiden Frischewerte benutzen unterschiedliche Zeitpunkte und
Nachweisanforderungen. Null frische Einträge bedeutet fehlende aktuelle
Attestierungen; daraus folgt nicht, dass sämtliche Veranstaltungsfakten falsch
sind. Die Zahl von 332 wurde sowohl über den öffentlichen Exportweg als auch
durch eine SQL-Aggregation bestätigt. Die statische Website und ihr
Supabase-Livekatalog sind unterschiedliche Ebenen.

Die bestehenden Sperren greifen korrekt:

- `npm run check` stoppt bei fünf ungeklärten, release-blockierenden
  Dublettenkandidaten im alten Fallback. Die bereits dokumentierte
  Produktionsbereinigung ist dort noch nicht angekommen.
- Der separat ausgeführte Katalogcheck verweigert den mehr als elf Tage alten
  Export; erlaubt sind höchstens 24 Stunden.
- Ein aktueller Export in einen separaten Diagnose-Zielpfad scheitert vor dem
  Schreiben bei 332 statt mindestens 400 Discovery-Einträgen, zu großem
  Bestandsrückgang und 0 statt mindestens 55 Prozent Frische.

Der operative Datenbestand muss fachlich geprüft und um gültige zukünftige
Editionen ergänzt werden. Bei genau 400 Einträgen wären mindestens 220 frische
Einträge nötig. Das ist eine rechnerische Mindestgröße, keine Erlaubnis zu
pauschaler Verifizierung. Quellenkonflikte und erforderliche Feldnachweise
bleiben maßgeblich.

## Durchgeführte Korrekturen und Prüfungen

Zusätzlich zu den vorhandenen Arbeiten wurden im Audit das lokale
Migrations-Prüfinventar und dessen Test um die bereits vorhandene
Freshness-Migration ergänzt. Die dazugehörige Lifecycle-Suite besteht nun
vollständig. Die generierte Altra-Sunset-Seite wurde an die bereits geänderte
Formulierung `Registration not open` ihres Generators angeglichen.

| Prüfung | Ergebnis |
| --- | --- |
| Technische Teilprüfungen aus `test:all` | Alle einzeln ausgeführten technischen Scriptgruppen erfolgreich; Daten-Release-Gate separat rot |
| `test:edition-lifecycle` | Nach Inventarkorrektur alle zehn Skripte erfolgreich |
| `test:e2e` | 68 von 68 Szenarien erfolgreich, einschließlich mobiler und rechtlicher Ansichten |
| `audit:layout` | Erfolgreich, keine Warnungen |
| `audit:anon` | Öffentliche Events lesbar; Pending-Events und private Nutzertabellen anonym nicht sichtbar |
| `audit:freshness:production` | Boolean-Guard öffentlich, unbekannte Edition fail-closed, Verifier und Admin-Inbox anonym verweigert; keine Writes |
| `test:rls:local` | Nicht ausführbar: lokale Docker-/Supabase-Laufzeit nicht erreichbar |
| Credential-basierte `test:rls` | Nicht ausgeführt: keine bereitgestellten Testkonten; wird durch `test:all` nicht mitgeprüft |
| `npm run check` / Produktionsfreigabe | BLOCKIERT durch die beschriebenen Datenbefunde |

Damit ist ausdrücklich **nicht** die vollständige Release- oder
Berechtigungs-Suite als grün bestätigt. Browserprüfungen verwenden kontrollierte
Fixtures; sie bestätigen nicht die fachliche Richtigkeit des Live-Katalogs.

Ein Probelauf des Seitengenerators zeigte zusätzlich zeitabhängige Änderungen
an 76 inzwischen vergangenen Eventseiten. Diese neu erzeugten Dateien wurden
vollständig in einem ignorierten lokalen ZIP gesichert, alle 995 Einträge
(994 Seiten und Seitenindex) per SHA-256 auf Wiederherstellbarkeit geprüft
und anschließend auf den vorherigen Stand zurückgesetzt. Die gezielte
Textkorrektur bleibt enthalten. Vor einem künftigen Release müssen alle
Seiten mit dem dann freigegebenen Datenexport neu erzeugt und geprüft werden.

## Nächster vollständiger Synchronisierungsschritt

1. P0-Reviews und gültige zukünftige Editionen in der operativen Quelle
   bearbeiten; Durchsatz und Kapazität nach dem
   [Skalierungsvorschlag](SCALING_RECOMMENDATION_20260907.md) steuern.
2. Die zehn abweichenden Migration-History-Einträge anhand der tatsächlichen
   Schemaobjekte separat abgleichen und fehlende lokale RLS-Prüfumgebung
   wiederherstellen.
3. `data:refresh-public` ausführen, aktuelle gebundene Audits, Eventseiten und
   Sitemap prüfen; sämtliche Release- und erforderlichen Sicherheitstests
   müssen bestehen.
4. Den geprüften Integrationsstand in `main` übernehmen, Releaseversion
   erhöhen, aus sauberem Commit bauen, Cloudflare-Preview und dann den
   identischen Build auf Production veröffentlichen.
5. Release-Metadaten und Datei-Hashes der unveränderlichen Deployment-URL
   prüfen; anschließend Hauptdomain und anonyme Datenzugriffe erneut testen.

Die Infrastruktur-Zugänge sind vorhanden. Die fehlende Vollsynchronisierung
ist in erster Linie eine fachliche Daten- und Freigabesperre, kein fehlender
Cloudflare- oder GitHub-Zugang.
