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
   grün sein. `npm run test:code` führt alle technischen Scriptgruppen,
   Daten-Gate-Tests mit kontrollierten Fixtures, Layout- und Browserprüfungen
   aus. Der Befehl benötigt keinen aktuell freigegebenen Production-Export.
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

## Technische Prüfung und Datenfreigabe

`npm run test:code` prüft den Entwicklungsstand unabhängig vom Alter des
versionierten Katalogexports. Die Regeln der Daten-Gates werden dabei weiterhin
mit Testdaten geprüft, einschließlich der Ablehnung veralteter Exporte,
ungeklärter Dubletten und fehlender Auditnachweise. Ein grüner technischer Lauf
bestätigt keine aktuelle fachliche Freigabe des Production-Katalogs.

`npm run check` bleibt die verbindliche Prüfung der Veröffentlichbarkeit:
Publish- und Secret-Prüfung, gebundene Datenqualitäts-Audits sowie Katalogalter,
Bestand, Frische und Vollständigkeit. `npm run test:all` verlangt zuerst diese
Freigabe und anschließend die vollständige technische Suite. Bekannte
Datenfreigabesperren werden mit Befund dokumentiert und verhindern den
Production-Release; sie verhindern nicht den Push einer unabhängig vollständig
getesteten Codeänderung. Technische Fehler oder fehlende für die Änderung
erforderliche Sicherheitsprüfungen bleiben Stoppsignale.

Lokale/credential-basierte RLS-Prüfungen und lesende Production-Zugriffsaudits
werden separat ausgeführt. Sie sind weder durch `test:code` noch `test:all`
ersetzt. Vor einer Veröffentlichung müssen die aktuelle Datenfreigabe und alle
erforderlichen technischen und Sicherheitsprüfungen bestehen.

`prepare-package` und `verify-package` führen dieselbe Releaseprüfung selbst
aus. Der Build prüft vor dem Generieren von Eventseiten, Sitemap und `dist/`;
ein gesperrter Katalog verändert daher keine vorhandenen Ausgabedateien. Es
gibt für diese Prüfung keinen Skip- oder Zeit-Override.

## GitHub und Production

Für den ausdrücklich beauftragten Fall einer reinen Oberflächenveröffentlichung
gilt seit 08.09.2026 zusätzlich der enge [UI-Releaseweg](UI_ONLY_RELEASE.md).
Er behält das exakt nachgewiesene bisherige Produktionsdatenpaket bei und prüft
ein separates Artefakt mit fester Dateiliste. Die oben beschriebenen normalen
Build-/Datenfreigaben bleiben unverändert; der UI-Weg erteilt keine Katalogfreigabe.

Jede vollständig getestete Entwicklungsänderung wird committed und auf GitHub
gepusht. Ein Git-Push ist kein Production-Deployment und löst keinen normalen
Wrangler-/Cloudflare-Schritt aus. Production wird ausschließlich in einem
ausdrücklich angeforderten Release-Schritt aktualisiert.

`RELEASE_VERSION.txt` wird nur bei einem bewussten Production-Release erhöht.
Für die laufende Entwicklung ist die Git-Commit-SHA die Versionskennung.
