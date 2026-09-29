# Einheitliche Eventdetails und Zusatzpflege

## Umfang

Die regulären und dynamischen Eventseiten verwenden denselben Berlin-Race-Guide-
Aufbau. Uhrzeiten werden ohne Sekunden, Zahlen mit lokalen Einheiten und
Wettbewerbe nach Distanz dargestellt. Unterschiedliche Wettbewerbe derselben
Distanz bleiben erhalten; identische Anzeigen werden zusammengefasst. Unter
Anreise und Standort steht die Standortkarte mit Marker; Rohkoordinaten erscheinen
nicht als Besucherinformation. Historische Ergebnisse und Editionsidentitäten
bleiben erhalten.

Vorhandenes belegtes Detail- und Wiki-Wissen wird live aus den bestehenden
Knowledge-Tabellen geladen. Fehlende Inhalte werden ausgelassen. Der Admin
ergänzt einklappbare Eingaben für Gebührenstaffeln, Startwellen, Strecke, Renntag,
Anreise, Wetter, Statistiken, redaktionelle Hinweise und FAQ. Alle 95 erlaubten
Feldpfade besitzen eine öffentliche Darstellung. Allgemeines Eventwissen und
jährliche Angaben bleiben getrennt. Es gibt keine neue Parallel-Datenhaltung,
keine LLM-Aufrufe und keinen privilegierten Schlüssel im Browser.

Speichern, gezielte Bestätigung, Schutz vor Importüberschreibungen und
Veröffentlichungskontrolle verwenden den bestehenden atomaren Adminweg.
Die Kontrolle vergleicht auch tatsächlich gerenderte Zusatzfelder mit dem
gespeicherten Stand. Unbestätigte Änderungen oder ausdrücklich entfernte Werte
dürfen nicht durch altes Brand-Wissen ersetzt werden. Nie gesetzte leere
Kindtabellenfelder erlauben hingegen den bestätigten Brand-Fallback.

## Technische Abnahme vor Rollout

- 23 Tests für Admin-Datenaufbereitung, Wiederholungen, Fehler und öffentliche
  Vergleiche bestanden; 6 neue Formular-Browsertests und 17 bestehende Pflegefälle
  bestanden.
- 97 bestehende und 34 zusätzliche SQL-Prüfungen bestanden. Der isolierte Stack
  verwendete alle 60 lokalen Migrationen; die Produktionshistorie wird separat
  und gezielt behandelt.
- 13 echte lokale Browsergruppen bestanden, einschließlich Auth, PostgREST,
  Formularspeicherung, erneutem Datenbanklesen und separater anonymer Detailseite.
  Ergebnis: `exports/manual-workflow-acceptance/run-AFdH2U/acceptance-report.json`.
  Die ausschließlich lokalen Testcontainer wurden anschließend beendet.
- Release-Einstiegspunkte und Paketintegrität bestanden; 45 Routentests und
  28 Paketbauprüfungen sichern die kontrollierten Änderungen an bestehenden
  statischen Seiten ab. Der Paketbau verändert nur die zwei vorhandenen
  Versionsparameter für Detail-Skript und Stylesheet.

Die Tests deckten echte Fehler bei Audit-Reihenfolge, Nullwert-Fallback und
CSS-Spezifität auf. Diese wurden im produktiven Code korrigiert und gezielt erneut
getestet. Alte Layoutannahmen wurden durch Prüfungen des neuen gemeinsamen
Aufbaus ersetzt; Daten-, Quellen- und Sicherheitsgrenzen bleiben bestehen.

## Rollout und Browsernachweis

Vor der Datenbankänderung wurde das verschlüsselte Backup
`sporteventmap-production-20260929T192313930Z.sembackup` erfolgreich erstellt und
geprüft. Ausgangspunkt ist die unabhängig geprüfte v94-Produktion mit 49
Migrationseinträgen. Die einzige neue Migration ist
`20260929190137_manual_event_knowledge_fields.sql`; kein pauschales `db push`.

Der UI-Paketbau verwendet v94 als unveränderliche Basis. Exportdaten, statische
Eventfakten und Sitemap behalten ihren bisherigen Stand. Das Paket selbst
führt keine Datenpflege oder automatische Kandidatenfreigabe aus.

Der abschließende Produktionsnachweis und die über das echte Adminformular
gepflegten Paderborn-Angaben werden nach erfolgreichem Rollout hier ergänzt.
Lokale Testergebnisse allein sind kein Nachweis einer veröffentlichten Änderung.

Bedienung: [Events manuell pflegen](MANUAL_EVENT_MAINTENANCE.md).
