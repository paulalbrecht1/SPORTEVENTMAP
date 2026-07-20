# Arbeitsregeln für Coding-Agenten

Diese Regeln ergänzen die Produktvision in `PRODUCT_VISION.md`.

## Versionsverwaltung

- Behandle jede Nutzeranfrage, die Dateien verändert, als eigenen
  nachvollziehbaren Commit.
- Committe erst, wenn die passenden Prüfungen erfolgreich waren oder ein
  nicht behebbarer Prüfungsfehler transparent dokumentiert wurde.
- Nimm ausschließlich Änderungen der aktuellen Anfrage in den Commit auf.
- Erstelle keinen leeren Commit für Fragen oder Aufgaben ohne Dateiänderung.
- Verwende kurze, konkrete Commit-Nachrichten im Imperativ.
- Prüfe vor jedem Commit `git diff --cached` und den Secret-Check.
- Pushe jeden erfolgreichen Commit anschließend auf den gleichnamigen Branch
  von `origin`, damit der Zwischenstand auch auf GitHub wiederherstellbar ist.
- Verwende dabei niemals einen Force-Push. Falls ein Push nicht möglich ist,
  bewahre den lokalen Commit und dokumentiere den Fehler transparent.
- Committe niemals API-Schlüssel, Passwörter, Tokens, private Schlüssel,
  `.env`-Dateien, `js/config.js` oder Daten aus `data/imports/private/`.

## Produktpriorität

Bevorzuge Verbesserungen an Eventsuche, Datenqualität, mobiler Nutzung und
Saisonplanung. Entwickle keine Social-, Chat-, Messenger- oder
KI-Coaching-Funktionen, solange sie nicht ausdrücklich neu priorisiert wurden.
