# Änderungen beitragen

## Grundregel

Eine umgesetzte Änderungsanfrage wird als eigener Commit gespeichert. So
bleiben Ursache, Umfang und Wirkung jeder Änderung nachvollziehbar und bei
Bedarf einzeln rückgängig zu machen.

## Ablauf

1. Nur Dateien ändern, die zur aktuellen Aufgabe gehören.
2. Keine Zugangsdaten, API-Schlüssel, `.env`-Dateien oder private Importdaten
   hinzufügen.
3. Die zur Änderung passenden Prüfungen ausführen.
4. Den Diff kontrollieren.
5. Einen kurzen Commit im Imperativ erstellen, zum Beispiel
   `Verbessere mobile Eventfilter`.

Reine Fragen oder Prompts ohne Dateiänderung benötigen keinen leeren Commit.
Unabhängige Änderungen werden nicht in denselben Commit gemischt.

## Lokalen Secret-Check aktivieren

Nach dem Klonen einmalig ausführen:

```powershell
git config core.hooksPath .githooks
```

Der Pre-Commit-Hook ist eine zusätzliche Schutzschicht. Vor jeder
Veröffentlichung müssen der staged Diff und `pnpm run check` trotzdem geprüft
werden.
