# Oberfläche unabhängig vom Datenkatalog veröffentlichen

Seit dem ausdrücklichen Nutzerauftrag vom 08.09.2026 gibt es einen eigenen
Releaseweg für fertig geprüfte Oberflächenänderungen. Er verhindert, dass die
laufende Datenverifikation sämtliche sichtbaren Produktverbesserungen blockiert.
Er erteilt keine neue fachliche Katalogfreigabe.

## Unveränderte Grenzen

Der normale vollständige Release über `check`, `prepare-package` und
`verify-package` behält alle bisherigen Daten-, Alters- und Auditprüfungen.
Ein UI-Release verwendet ausschließlich ein nachgewiesenes bestehendes
Cloudflare-Produktionspaket als Basis. Seine Datendateien einschließlich
Exportzeit, sämtliche statischen Eventseiten, Sitemap, Runtimekonfiguration
und alle nicht ausdrücklich freigegebenen Dateien bleiben bytegleich.

Es gibt keinen Datenexport, keine Seitengenerierung, keine Migration, keinen
Admin-Datenwrite und kein Zurücksetzen von Prüfzeiten. Bereits produktive
P0-Korrekturen werden weiterhin aus der laufenden Datenbank geladen; der
beibehaltene Fallback erhält keinen neuen Frischenachweis. Seine bekannten
fachlichen Grenzen bestehen fort.

## Enger Paketbau

`tools/ui-release.js` baut in ein neues separates Exportverzeichnis und
verändert das bisherige `dist/` nicht. Die feste Dateiliste erlaubt nur die
geprüfte Oberfläche und Release-Metadaten. Ein sauberes committed Working Tree,
die exakte Quellcommit-SHA und ein verifiziertes unveränderliches
`https://<deployment>.sporteventmap.pages.dev`-Basispaket sind erforderlich.

Vor dem Bau müssen die öffentliche Produktionsversion und die unveränderliche
Basis identisch nachgewiesen werden. Das vollständige lokale Basisinventar wird
gegen die dort veröffentlichte `release.json` geprüft. Der Builder bindet das
neue Paket an deren SHA-256 und prüft die erlaubten Änderungen einzeln.
Die neue `release.json` bezeichnet den Umfang ausdrücklich als `ui_only` und
trennt die neue Buildzeit vom ursprünglichen Datenstand.

```powershell
node tools/ui-release.js build --base-dir dist --base-url https://<deployment>.sporteventmap.pages.dev --base-release-sha256 <SHA256> --source-commit <COMMIT> --version <VERSION> --out exports/<release>/package
node tools/ui-release.js verify --base-dir dist --base-url https://<deployment>.sporteventmap.pages.dev --base-release-sha256 <SHA256> --source-commit <COMMIT> --version <VERSION> --package exports/<release>/package
```

## Prüfung und Veröffentlichung

1. Relevante technische Suite und `node --test tests/ui-release.test.mjs`
   erfolgreich ausführen; für geänderte privilegierte Oberflächen zusätzlich
   die erforderlichen Backend-Zugriffsprüfungen nachweisen.
2. Das tatsächliche gemischte Paket prüfen: mobile und Desktop-Navigation,
   Discovery und Filter, Informationsseiten, alte statische Eventdetailseite,
   benötigte nachgeladene Module und Ausfall der Datenbank mit echtem Fallback.
3. Das verifizierte Paket mit Wrangler als Preview veröffentlichen und diese
   prüfen. Der Quellcommit muss vor dem Paketbau feststehen und sauber sein.
4. Dasselbe Paket unmittelbar vor dem Production-Upload erneut verifizieren.
   Die bisherige Produktionsbasis muss noch aktuell sein; andernfalls stoppen
   und gegen die inzwischen veröffentlichte Version neu prüfen.
5. Mit Wrangler auf Branch `main` veröffentlichen. Release-Metadaten und
   Datei-Hashes an der unveränderlichen neuen URL prüfen, anschließend die
   öffentliche Domain einschließlich der wesentlichen Nutzerwege kontrollieren.

```powershell
wrangler pages deploy exports/<release>/package --project-name=sporteventmap --branch=<preview-branch>
wrangler pages deploy exports/<release>/package --project-name=sporteventmap --branch=main
```

Cloudflare Direct Upload veröffentlicht das vollständig vorbereitete Paket;
Preview und Produktion verwenden dieselben Dateien. Die vorige erfolgreich
veröffentlichte Version bleibt als Cloudflare-Rollbackziel verfügbar.
Siehe [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
und [Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/).

Der P0-Datenworkflow läuft unabhängig weiter. Ein späterer vollständiger
Katalogrelease muss weiterhin alle ursprünglichen Qualitätsgrenzen bestehen.
