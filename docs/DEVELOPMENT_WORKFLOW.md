# Entwicklungsworkflow

Dieser Ablauf gilt für jede abgeschlossene Entwicklungsaufgabe. GitHub hält die
nachvollziehbare Entwicklungshistorie; Production wird davon getrennt behandelt.

## Vor einer Aufgabe

1. `git status --short --branch` und den aktuellen Branch prüfen.
2. Mit `git fetch origin` sicherstellen, dass `main` und `origin/main`
   übereinstimmen.
3. Möglichst nur mit sauberem Working Tree beginnen. Vorhandene Änderungen
   zuerst zuordnen und abschließen; niemals still mit einer neuen Aufgabe
   vermischen oder blind verwerfen.

## Während einer Aufgabe

- Eine Aufgabe entspricht einem klar abgegrenzten Änderungssatz.
- Thematisch unabhängige Features erhalten eigene Aufgaben und Commits.
- Neue Dateien nur in den vorgesehenen Ordnern anlegen; die Regeln dazu stehen
  in `docs/REPOSITORY_STRUCTURE.md`.
- Temporäre oder generierte Dateien in definierte Verzeichnisse schreiben und,
  sofern sie keine Source of Truth sind, über `.gitignore` ausschließen.
- Keine improvisierten Root-Ordner wie `temp`, `backup-old` oder
  `test-results-final-2` anlegen.

## Eine Aufgabe abschließen

1. Alle für die Änderung relevanten Tests ausführen; vor dem Push müssen sie
   grün sein.
2. `git status` prüfen und neue temporäre, generierte oder private Dateien
   kontrollieren.
3. Den Änderungssatz und den Staging-Bereich auf Secrets, Tokens,
   Zugangsdaten, Backups und private Importdaten prüfen.
4. Nur zugehörige Dateien gezielt stagen und `git diff --cached` prüfen.
5. Einen nachvollziehbaren Commit mit klarer Nachricht erstellen.
6. Ohne Force Push oder History Rewrite auf GitHub pushen.
7. Erneut fetchen und den Endzustand prüfen:

```text
main = origin/main
working tree clean
```

Schlägt ein Test oder eine Sicherheitsprüfung fehl, wird nicht gepusht, bis
die Ursache behoben ist oder die Aufgabe ausdrücklich gestoppt wurde.

## GitHub und Production

Jede vollständig getestete Entwicklungsänderung wird committed und auf GitHub
gepusht. Ein Git-Push ist kein Production-Deployment und löst keinen normalen
Wrangler-/Cloudflare-Schritt aus. Production wird ausschließlich in einem
ausdrücklich angeforderten Release-Schritt aktualisiert.

`RELEASE_VERSION.txt` wird nur bei einem bewussten Production-Release erhöht.
Für die laufende Entwicklung ist die Git-Commit-SHA die Versionskennung.
