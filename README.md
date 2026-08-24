# SportEventMap

SportEventMap ist eine mobile-first Plattform zum Finden, Vergleichen und
Planen von Lauf-, Triathlon- und Ultramarathon-Veranstaltungen. Im Mittelpunkt
stehen vollständige, verlässliche Eventdaten, eine schnelle Suche und gut
nutzbare Event-Detailseiten.

Die Webanwendung besteht aus statischem HTML, CSS und JavaScript. Supabase
liefert Datenbank, Authentifizierung, RLS und Backend-Automatisierung; Node.js-
Werkzeuge erzeugen die öffentlichen Daten-Fallbacks, Eventseiten und das
Deployment-Paket.

## Architektur

```text
Eventquellen
    ↓
Import / Prüfung / Normalisierung
    ↓
Supabase
    ↓
Web-App + Eventseiten
```

Supabase `events` und `event_editions` sind der operative Datenbestand. Die
Dateien `data/events.csv` und `data/event-editions-public.json` sind
versionierte, reproduzierbare Exporte für Browser-Fallback, statische Seiten
und Releases.

## Repository

- `js/`, `css/` und `assets/`: eigentliche Webanwendung und Gestaltung
- `data/`: veröffentlichte Datenexporte, Generator-Eingaben und Datenpipeline
- `supabase/`: Migrationen, RLS, Edge Functions und Backend-Konfiguration
- `event/`: generierte und versionierte statische Event-Detailseiten
- `tests/`: automatische Funktions-, Daten-, Sicherheits- und Browserprüfungen
- `tools/`: Import, Audit, Export, Build, Backup und Restore
- `docs/`: Produkt-, Entwicklungs- und Betriebsdokumentation

Das vollständige mentale Modell, alle Top-Level-Ordner und die jeweiligen
Source-of-Truth-Regeln stehen in
[`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md).
Der verbindliche Ablauf für neue Aufgaben steht in
[`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).

## Lokal prüfen

```powershell
npm.cmd ci
npm.cmd run test:all
npm.cmd run prepare-package
```

`dist/` ist das daraus erzeugte, nicht versionierte Publish-Paket. Deployment
und Production-Backups sind bewusst manuelle, getrennte Betriebsabläufe; ein
Git-Push veröffentlicht nichts automatisch.
