# SportEventMap

SportEventMap hilft Läuferinnen und Läufern, Triathletinnen und Triathleten
sowie Ultralaufenden dabei, Ausdauersportveranstaltungen in Deutschland zu
finden, zu vergleichen, zu speichern und ihre Saison zu planen.

## Funktionen

- interaktive Eventkarte
- Suche und Filter
- Eventdatenbank und Event-Detailseiten
- Favoriten
- Nutzerkonten mit Supabase
- persönlicher Saisonplaner
- Werkzeuge zur Datenprüfung und Eventpflege

## Lokal starten

Voraussetzungen: Node.js, pnpm und Python.

```powershell
pnpm install
Copy-Item js/config.example.js js/config.js
pnpm run serve
```

Danach ist die Anwendung unter `http://localhost:4173` erreichbar. Für
Funktionen mit Supabase müssen in der ausschließlich lokalen Datei
`js/config.js` die öffentliche Projekt-URL und der öffentliche Client-Key
eingetragen werden. Diese Datei wird absichtlich nicht von Git erfasst.

## Qualität prüfen

```powershell
pnpm run check
pnpm run test:static
```

Weitere Prüfungen und End-to-End-Tests sind in `package.json` sowie unter
`tests/` dokumentiert.

## Sicherheit

Zugangsdaten, private Importdateien und lokale Konfigurationen dürfen nie in
Git eingecheckt werden. Das Repository enthält eine Beispielkonfiguration,
umfassende Ausschlussregeln und einen Pre-Commit-Check. Weitere Hinweise
stehen in [SECURITY.md](SECURITY.md).

## Änderungen und Commits

Jede umgesetzte Änderungsanfrage erhält nach erfolgreicher Prüfung einen
eigenen, nachvollziehbaren Commit. Details stehen in
[CONTRIBUTING.md](CONTRIBUTING.md) und [AGENTS.md](AGENTS.md).

## Produktfokus

Die aktuelle Priorität liegt auf Eventsuche, Datenqualität, mobiler Nutzung
und Saisonplanung. Die vollständige Strategie steht in
[PRODUCT_VISION.md](PRODUCT_VISION.md).
