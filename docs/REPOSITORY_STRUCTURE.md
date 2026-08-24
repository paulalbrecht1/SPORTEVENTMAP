# Repository-Struktur

Dieses Dokument erklärt, was im Repository dauerhaft gepflegt wird, was
automatisch entsteht und was nur auf dem lokalen Rechner bleiben darf.

## Das einfache mentale Modell

### Website

`index.html`, `js/`, `css/` und `assets/` bilden die eigentliche
Webanwendung. Diese Dateien werden manuell gepflegt, gehören auf GitHub und
sind die Source of Truth für die Oberfläche.

### Daten

`data/` enthält die versionierten öffentlichen Exporte sowie Eingaben und
Hilfsdaten der Datenpipeline. Der operative Production-Datenbestand liegt in
Supabase; `data/events.csv` und `data/event-editions-public.json` werden daraus
als kontrollierte Fallbacks exportiert.

### Backend

`supabase/` enthält Datenbankschema, Migrationen, RLS-Regeln, Edge Functions
und Automatisierung. Diese Dateien werden manuell geprüft und versioniert;
lokaler Supabase-Laufzeitstatus wird ignoriert.

### Eventseiten

`event/` enthält statische Detailseiten. Sie werden durch
`tools/generate-event-pages.js` aus den versionierten Daten erzeugt, aber für
nachvollziehbare Releases auf GitHub mitgeführt.

### Tests

`tests/` enthält automatische Qualitäts-, Sicherheits- und Browserprüfungen.
Die Tests gehören auf GitHub; Screenshots, Browserdownloads und Resultatordner
sind lokale, löschbare Artefakte.

### Tools

`tools/` enthält Import, Export, Build, Backup, Restore, Audits und Wartung.
Die Skripte sind Source of Truth und gehören auf GitHub; ihre lokalen Ausgaben
meist nicht.

### Dokumentation

`docs/` enthält Produkt-, Entwicklungs-, Deployment-, Recovery- und
Betriebsdokumentation. Sie wird manuell gepflegt und gehört auf GitHub.

## Source of Truth

| Bereich | Verbindliche Quelle | Abgeleitete oder lokale Kopie |
| --- | --- | --- |
| Website | `index.html`, weitere Root-HTML-Dateien, `js/`, `css/`, `assets/` | `dist/` |
| Eventdaten | Production-Supabase: `events` und zugehörige veröffentlichte Views | `data/events.csv` als versionierter Discovery-Fallback |
| Event-Editionen | Production-Supabase: `event_editions` | `data/event-editions-public.json` als versioniertes Archiv |
| Supabase-Struktur | `supabase/migrations/`, `supabase/functions/`, `supabase/config.toml` | lokaler CLI-/Docker-Status |
| Eventseiten | Generator in `tools/` plus versionierte Dateien in `data/` | `event/` und die Kopie in `dist/event/` |
| Deployment | `tools/create-publish-package.js`, `RELEASE_VERSION.txt` und `docs/LOCAL_PUBLISH.md` | `dist/`; Cloudflare Direct Upload bleibt ein manueller Schritt |
| Tests | `tests/`, `playwright.config.mjs` und die Scripts in `package.json` | `test-results-*`, `playwright-report/`, Screenshots und Browsercache |
| Backups | Ablauf: Skripte in `tools/` und `docs/PRODUCTION_RECOVERY_RUNBOOK.md`; Restore-Punkt: jeweilige geprüfte `.sembackup`-Datei mit Manifest | `backups/production/` bleibt ausschließlich lokal; ein Restore-Punkt ist nicht aus Git reproduzierbar |

Supabase und die Exportdateien dürfen nicht unabhängig voneinander bearbeitet
werden. Nach freigegebenen Datenänderungen erzeugt
`npm run data:export-fallback` die öffentlichen Fallbacks neu;
`npm run data:refresh-public` aktualisiert zusätzlich Eventseiten und Sitemap.

## Top-Level-Ordner

Die Kategorien bedeuten: **A** dauerhaftes Original, **B** generiert,
**C** lokaler Cache, **D** lokal/privat und **E** historisch oder redundant.

| Ordner | Kategorie | Pflege, GitHub und Löschbarkeit |
| --- | --- | --- |
| `.git/` | C | Lokale Git-Metadaten. Nicht als Projektinhalt committen und nicht manuell löschen. |
| `.githooks/` | A | Versionierter Pre-Commit-Schutz gegen Secrets. Manuell gepflegt und auf GitHub erforderlich. |
| `.playwright-browsers/` | C | Lokaler Browserdownload für E2E-Tests. Ignoriert und neu installierbar. |
| `assets/` | A | Logos und Markenassets. Manuell gepflegt, versioniert und nicht ohne Ersatz löschbar. |
| `backups/` | D | Verschlüsselte Production-Backups und lokale Logs. Ignoriert, niemals auf GitHub und nicht durch Repository-Cleanup löschen. |
| `css/` | A | Styles der Website. Manuell gepflegt und versioniert. |
| `data/` | A/B/D | Mischung aus versionierten Exporten, Generator-Eingaben und Importbelegen; private/raw/review/staging-Unterordner bleiben lokal. Nicht pauschal löschen. |
| `dist/` | B | Vollständiges Publish-Paket. Ignoriert und jederzeit mit `npm run prepare-package` neu erzeugbar. |
| `docs/` | A | Verständliche Projekt- und Betriebsdokumentation. Manuell gepflegt und versioniert. |
| `event/` | B | Generierte statische Eventseiten. Reproduzierbar, aber für Releases bewusst versioniert. |
| `exports/` | B | Lokale Exporte von Wartungswerkzeugen. Ignoriert und löschbar. |
| `js/` | A | Anwendungslogik, Suche, Karte, Supabase-Client und Eventdarstellung. Manuell gepflegt und versioniert. |
| `node_modules/` | C | Installierte Abhängigkeiten. Ignoriert und mit `npm ci` neu erzeugbar. |
| `reports/` | A/B | Das versionierte Supabase-Baseline-Dokument bleibt erhalten; laufende Auditberichte sind ignoriert und reproduzierbar. |
| `supabase/` | A/C | Migrationen, Funktionen und Konfiguration sind Source of Truth; `.temp/` und `.branches/` sind lokale CLI-Daten. |
| `tests/` | A | Testcode und Fixtures. Manuell gepflegt und versioniert. |
| `tools/` | A | Betriebs- und Datenwerkzeuge. Manuell gepflegt und versioniert. |

Ordner wie `.wrangler/`, `test-results-*` oder
`SportEventMap_publicVersion/` können durch Tools beziehungsweise alte lokale
Stände auftauchen. Sie sind ignoriert und keine Source of Truth; die historische
Projektkopie soll nicht wieder angelegt werden.

## Wichtige Dateien im Root

- `README.md`, `SECURITY.md`, `.gitignore`, `.gitattributes` und
  `.env.example` bleiben wegen GitHub-/Tooling-Konventionen im Root.
- `package.json` definiert Werkzeuge und Tests. `package-lock.json` ist die
  verbindliche Sperrdatei des dokumentierten npm-Releasewegs; `pnpm-lock.yaml`
  bleibt für den vorhandenen pnpm-kompatiblen lokalen Testweg versioniert.
- `playwright.config.mjs` konfiguriert die Browsertests.
- `index.html`, die weiteren HTML-Seiten, Favicons und `site.webmanifest` sind
  öffentliche Website-Dateien. Redirect- und Kompatibilitätsseiten bleiben
  erhalten, solange ihr externer Gebrauch nicht sicher ausgeschlossen ist.
- `RELEASE_VERSION.txt` ist ein versionierter Build-Eingang.
  `sitemap.xml` und `robots.txt` werden vom Sitemap-Werkzeug erzeugt, bleiben
  aber versioniert, weil der Publish-Build sie direkt übernimmt.

## Was sicher gelöscht werden kann

`dist/`, `node_modules/`, `.playwright-browsers/`, `.wrangler/`, lokale
Testresultate, laufende Auditberichte und `exports/` sind reproduzierbar. Vor
dem Löschen von `data/`, `event/`, `supabase/`, `tools/`, `tests/` oder
`backups/production/` muss dagegen immer der konkrete Zweck geprüft werden.

## Bewusst behaltene Altbestände

Die nicht von der Laufzeit referenzierten Dateien `data/events.cleaned.csv`,
`data/events.coordinates-fixed.csv`, `data/events.distance-clean.csv` und
`data/events.final-fixed.csv` bleiben vorerst erhalten. Ihre frühere
Import-/Recovery-Rolle ist erkennbar, ihre vollständige Provenienz aber nicht;
sie sind **nicht** der aktuelle Production-Datenbestand.

Auch ältere Root-Seiten wie `impressum.html` und `terms.html` bleiben als
mögliche URL-Kompatibilität erhalten. Sie dürfen erst entfernt werden, wenn
externe Nutzung und Redirect-Bedarf sicher ausgeschlossen sind.
