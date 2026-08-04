# Arbeitsregeln für Coding-Agenten

Diese Regeln ergänzen die Produktvision in `PRODUCT_VISION.md`.

## Versionsverwaltung

- Rufe vor jeder dateiveraendernden Aufgabe `git fetch origin --prune` auf und
  vergleiche den aktuellen Branch mit seinem Upstream. Beginne erst danach mit
  der Umsetzung. Ueberschreibe bei einem Rueckstand oder einer Abweichung keine
  Remote-Aenderungen, sondern gleiche sie konfliktfrei ab oder dokumentiere den
  Blocker.
- Ergaenze bei nicht-trivialen Aenderungen einen kurzen Commit-Body: Was wurde
  geaendert, warum wurde es geaendert und mit welchen Checks wurde es geprueft.
- Pruefe nach jedem Push mit `git status -sb`, dass der Branch nicht mehr vor
  seinem Upstream liegt, und nenne Branch, Commit-ID und Kurzbeschreibung in
  der Abschlussmeldung.
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
