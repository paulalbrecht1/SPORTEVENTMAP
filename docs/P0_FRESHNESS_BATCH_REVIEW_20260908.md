# P0: Sammelprüfung der Eventfrische

Stand: 8. September 2026. Umfang ist ausschließlich der beauftragte Punkt 1:
bis zu 25 bestehende, geeignete Editionen mit eigenem Quellenbeleg und eigener
Bestätigung gemeinsam attestieren. Weitere Faktenpakete, neue Events und
Produktionsattestierungen gehören nicht zu diesem Änderungssatz.

## Bedienung

1. Im Adminbereich die Review-Inbox öffnen. Über „Für Frischepaket wählen“
   einzelne geeignete Events auswählen oder „Bis zu 25 Frischeprüfungen wählen“
   verwenden. „Frischeauswahl prüfen“ öffnet den Dialog.
2. „Vorlage herunterladen“ liefert das JSON-Gerüst für genau diese Auswahl.
   Es enthält die Zuordnung zu Event, Edition und offizieller Quelle; die
   beobachteten Fakten, Prüfzeit, Konfidenz und Notizen sind bewusst leer.
3. Die offiziellen Quellen tatsächlich prüfen und die Belege in der Vorlage
   ergänzen. Datei oder JSON-Text über „Belege importieren“ einlesen. Alternativ
   die Werte im Dialog eingeben. Der Import bestätigt keine Auswahl und jeder
   neue Importversuch setzt persönliche Bestätigungen zurück.
4. Je Event den Vergleich aller 14 Felder prüfen. Übereinstimmungen, fehlende
   Werte und Abweichungen werden ausdrücklich angezeigt. Eine eigene
   Prüfnotiz und die Checkbox „Alle 14 Felder dieses Events anhand der Quelle
   geprüft“ sind für jedes Event erforderlich. Änderungen an einem Beleg
   widerrufen dessen Bestätigung.
5. Unsichere oder abweichende Events mit „Aus Paket nehmen“ ausschließen und
   separat korrigieren. Der Dialog repariert keine Eventfakten. „Paket
   bestätigen“ wird erst mit vollständigen und einzeln bestätigten Belegen
   für die gesamte verbleibende Auswahl verfügbar.

Die Auswahl für Lifecycle-Veröffentlichungen bleibt unabhängig. Ein Frischepaket
enthält ausschließlich 1–25 eindeutige Editionen. Der Dialog wird erst bei
Bedarf geladen; die öffentliche Eventsuche erhält keinen zusätzlichen
initialen Skriptaufruf.

## Belegformat und Grenzen

JSON-Envelope: `{"schema_version":1,"reviews":[...]}`. Jede Review enthält:

| Schlüssel | Inhalt |
| --- | --- |
| `event_id` | Zugehörige Event-ID, Zahl oder Zeichenfolge |
| `edition_id` | Eindeutige UUID der ausgewählten Edition |
| `source_id` | UUID der gebundenen offiziellen Quelle |
| `source_url` | Exakt die ausgewählte offizielle HTTPS-Adresse |
| `source_checked_at` | Tatsächlicher Quellenprüfzeitpunkt mit expliziter Zeitzone |
| `confidence` | Explizite Zahl zwischen 0,80 und 1 |
| `notes` | Eigene Prüfnotiz, mindestens zwölf Zeichen ohne Rand-Leerzeichen |
| `confirmed_fields` | Alle 14 Pflichtfeldnamen, ohne Duplikate |
| `uncertain_fields` | Leeres Array; offene Unsicherheit verhindert die Freigabe |
| `observed_values` | Objekt mit genau den 14 selbst geprüften Fakten |

Pflichtfelder: `event_name`, `edition_year`, `date`, `city`, `country`,
`address`, `latitude`, `longitude`, `sport`, `distances`, `description`,
`registration_status`, `official_event_page`, `registration_link`.

Der Prüfzeitpunkt darf höchstens 24 Stunden zurückliegen und höchstens fünf
Minuten vorausliegen. Sekundenbruchteile mit bis zu sechs Stellen sind
zulässig; der Originalstring wird übertragen. Importieren oder Bestätigen
ersetzt ihn nicht durch die aktuelle Uhrzeit. Die Datenbank prüft die Grenzen
erneut mit ihrer eigenen Uhr.

Der Import begrenzt Dateien auf 2 MiB und Text auf 2.097.152 Zeichen. UUIDs
werden kleingeschrieben; Eventfakten bleiben unverändert. Objektschlüssel
dürfen anders sortiert sein, Arrayreihenfolge und Datentypen müssen dagegen
übereinstimmen. Es gibt keine automatische Rundung, URL-Korrektur oder
Übernahme gespeicherter Werte als vermeintliche Quellenbeobachtung.

Die Vorlage ist keine Evidenz. Bereits vorhandene Recherchedateien müssen
explizit auf dieses Format abgebildet und vervollständigt werden; fehlende
Prüfzeit, Konfidenz oder Notizen werden nicht erraten. Belege bleiben während
der Bearbeitung im Dialog; sie werden nicht im Browser dauerhaft gespeichert.

## Speichern und Fehlerbehandlung

Vor dem Schreiben lädt die Integration die Datenoperationen vollständig neu.
Fehlende Tabellen-/RLS-Daten werden im strikten Modus als Fehler behandelt.
Der Dialog vergleicht danach die ausgewählten Fakten, Quellen, Editionen und
ihre Eignung erneut. Eine Änderung sperrt das Paket und verlangt eine neue
Prüfung nach dem erneuten Öffnen. Entfernte Events gehören nicht mehr zum
Vergleich oder Schreibauftrag.

Der bestehende RPC `verify_freshness_review_editions` erhält genau einen
Aufruf mit allen verbleibenden Editionen und ihren separaten Feldbelegen.
Die Notizen werden mit der jeweiligen Edition-ID im gemeinsamen Auditgrund
zugeordnet. Der RPC sperrt und überprüft die Datensätze innerhalb einer
Transaktion; er ändert ausschließlich Verifikationsmetadaten und Auditdaten.
Schema, Adminanforderung und Berechtigungen bleiben unverändert.

Ein Erfolg erfordert die vollständige Antwort: passende angefragte und
bestätigte Anzahl, exakt derselbe Edition-ID-Satz, `freshness_verified: true`
und `automatic_fact_changes: false`. Während des Schreibens sind Doppelklick
und Abbruch gesperrt. Bei einem Fehler oder einer mehrdeutigen Antwort erfolgt
kein automatischer Wiederholungsversuch: Eine verlorene Antwort könnte auf
eine bereits abgeschlossene Transaktion folgen. Die Ansicht muss deshalb
zuerst neu geladen werden. Ein gescheiterter Ansichts-Reload nach bestätigtem
Erfolg wird ausdrücklich als solcher gemeldet.

## Abnahme

- 14 reine Testgruppen: Format, 1/25-Grenze, Duplikate, Zeit-/Konfidenzgrenzen,
  alle Feldabweichungen, Typen, Notizen, Einzelfreigaben und Antwortvertrag.
- 21 neue Dialog-Browserfälle: Datei-/Textimport, erneuter Import,
  Feldvergleich, Auswahlentfernung, Drift, Berechtigungs-/Serverfehler,
  Abbruchschutz und 25 Events bei echten 375/320 CSS-Pixeln.
- Drei zusätzliche Browserfälle mit den tatsächlichen Admin-Handlern und
  relativ geladenem Modul: Auswahlgrenze, ein gemeinsamer RPC und strikter
  Reloadfehler einschließlich Fokusrückgabe.
- Isolierte Datenbankabnahme: 50 Migrationen, **23/23 RLS-Fälle**, 61 SQL-
  und vier REST-Schemafälle bestanden. Neuer Test 19b beweist den vollständigen
  Rollback von Zeilen und Auditdaten nach einer Abweichung im zweiten Event;
  danach erfolgreiche gemeinsame Freigabe von zwei unveränderten Faktenpaketen.
- Fünf lesende Produktions-Zugriffsprüfungen bestanden; keine Schreiboperation.
- Das neue Modul ist in der Paketkopie und den kritischen Prüfsummen enthalten.
  Browser-Cachekennungen sind erhöht; `RELEASE_VERSION.txt` ist unverändert.

- Vollständiges `npm run test:code` erfolgreich: alle technischen Prüfgruppen
  und **117/117 Browserfälle in 5,2 Minuten** bestanden. Dies umfasst die
  bisherigen 93 Fälle sowie die 24 neuen Dialog-/Integrationsfälle.

Die geprüften Implementierungs-, Test- und Protokolldateien werden gemäß
Entwicklungsworkflow als ein Änderungssatz auf `main` synchronisiert.
Lokale Prüfprotokolle liegen unter
`exports/p0-batch-20260908/freshness-batch-*` und gehören nicht ins Repository.
Die isolierte Datenbank samt Arbeitsverzeichnis, Containern und Volume wurde
nachweislich entfernt.

## Veröffentlichungsstand

`npm run check` wurde unverändert ausgeführt und stoppt am vorhandenen
Datenqualitäts-Gate: fünf ungelöste hochwahrscheinliche Dublettenkandidaten
im versionierten Katalog. Der Katalogexport stammt weiterhin vom 27. August.
Der letzte reguläre Produktionsrefresh aus dem vorherigen Faktenbatch
scheiterte vor dem Schreiben an 332/400 Discovery-Editionen und 2,71/55 %
Frische. Diese produktiven Bestandszahlen wurden in diesem UI-Schritt nicht
neu erhoben.

Die Implementierung ist damit eine technische Vorbereitung für schnellere
Prüfungen. Dieser Schritt erzeugt selbst keine neuen Frischenachweise und
umgeht kein Release-Gate. Kein Website-Deployment über Wrangler und keine
Änderung produktiver Eventdaten wurden ausgeführt.
