# Go-/No-Go – geschlossene Beta

Stand: 4. August 2026
Release: `20260804-review-inbox-v79`
Branch: `agent/release-hardening-20260724`
Review-Ausgangspunkt: `486c50b` (bekannter Commit `d2d3b81` ist direkter Vorgänger)

## Entscheidung

**NO-GO**

Die Anwendung ist lokal technisch weitgehend beta-tauglich, aber die Produktionsfreigabe ist noch nicht vertretbar. In Produktion kann die für `authenticated` freigegebene `SECURITY DEFINER`-Funktion `public.run_event_validation(bigint,uuid)` ohne interne Adminprüfung aufgerufen werden. Die sichere Korrektur ist lokal vorhanden und getestet, wurde gemäß Auftrag aber nicht produktiv angewendet. Zusätzlich fehlen Produktionsnachweise für Auth/Redirects, Zwei-Nutzer-Persistenz und Adminablauf sowie echte iOS-/Android-Smoke-Tests. Die Rechtstexte sind als Entwurf gekennzeichnet und noch nicht juristisch geprüft.

## Gate-Bewertung

| Bereich | Status | Nachweis und Restpunkt |
|---|---|---|
| Produktions-Auth | NOT TESTED | Registrierung, Bestätigung, Login, Logout, Session-Restore und Reset wurden mangels freigegebener Produktions-Testkonten/Postfächer nicht ausgeführt. |
| Redirect-Konfiguration | NOT TESTED | App erzeugt konkrete Callback-Pfade auf dem aktuellen Origin; Dashboard Site URL und vollständige Allowlist konnten nicht read-only exportiert werden. Exakte URLs manuell prüfen, keine Produktions-Wildcards. |
| Nutzertrennung | NOT TESTED | Lokal 20/20 Auth-/RLS-Tests grün; direkter Produktionsnachweis mit Nutzer A/B fehlt. |
| RLS | GO | Produktionskatalog wurde read-only dokumentiert; lokale Neuinstallation und Cross-User-Negativtests sind grün. Der offene Admin-RPC ist separat unter Security bewertet. |
| Favoriten-Persistenz | NOT TESTED | Lokale Ownership- und E2E-Persistenz grün; Logout/Login und Browserneustart gegen Produktion fehlen. |
| Saisonplaner-Persistenz | NOT TESTED | Lokal bleiben Priorität, Zielzeit, Notizen, Status und Ergebnisse erhalten; Produktionslauf A/B fehlt. |
| Eventeinreichung | NOT TESTED | Lokaler Nutzer kann pending einreichen und nicht selbst freigeben; kontrollierter Produktions-Fixturetest fehlt. |
| Adminfreigabe | NOT TESTED | Lokaler Admin kann gezielt freigeben/ablehnen; produktiver Adminlauf mit Rollback-/Cleanup-Weg fehlt. |
| Security-Advisor-Warnungen | NO-GO | Sechs erreichbare `SECURITY DEFINER`-Funktionen auditiert. Fünf besitzen wirksame interne Prüfungen; `run_event_validation` ist produktiv kritisch offen. Lokale Migration `20260814120000` behebt dies; nicht deployed. |
| Passwortschutz | GO WITH ACCEPTED RISK | Leaked-password protection ist deaktiviert und im aktuellen Free-Tarif nicht verfügbar. Übergang: Mindestlänge 8, starke Testpasswörter, erneute Prüfung vor größerer Öffnung bzw. Tarifwechsel. |
| Browser-E2E | GO | Finaler `test:all`: 53/53 Playwright-Tests grün, Chromium Desktop plus emuliertes Pixel 5. Kein Ersatz für Realgeräte oder Safari/Firefox-Produktionsläufe. |
| Performance | GO | Zwei Gesamtläufe meldeten p95 jeweils 33,40 ms bei unveränderter Grenze `<80 ms`. Der erste Gesamtlauf hatte einen einmaligen Navigations-`ERR_ABORTED` im Theme-Test; 3 kontrollierte Wiederholungen (6 Tests) und der zweite Gesamtlauf waren grün. |
| iOS-Test | NOT TESTED | Reales iOS-Gerät wurde nicht verwendet; Protokoll ist vorbereitet. |
| Android-Test | NOT TESTED | Reales Android-Gerät wurde nicht verwendet; Protokoll ist vorbereitet. |
| Rechtstexte | NO-GO | Impressum, Datenschutz und Nutzungsbedingungen sind vorhanden, aber die Nutzungsbedingungen sind ausdrücklich Entwurf; externe juristische Prüfung fehlt. |
| Betreiberangaben | GO WITH ACCEPTED RISK | Name, ladungsfähige Anschrift und `kontakt@sporteventmap.com` sind im Quellstand vorhanden; Platzhalter wurden entfernt. Betreiber muss Richtigkeit bestätigen. |
| Bekannte Einschränkungen | GO | Dieses Dokument, Testmatrix, Mobile-Protokoll, Passwort-Risiko und Stage-4-Plan benennen offene Punkte ohne sie als bestanden darzustellen. |

## Technische Nachweise

- `npm.cmd run supabase:reset`: erfolgreich; kompletter lokaler Migrationslauf einschließlich Härtung und der lokal vorhandenen, weiterhin nicht produktiv ausgerollten Stage-4-Reihe.
- `npm.cmd run test:rls:local`: 20/20 bestanden. Enthalten sind Nutzer A/B, Admin, Favoriten, Saisonplan, Einreichung, Rollen-Eskalation sowie direkte Negativaufrufe der Admin-RPCs.
- `supabase db advisors --local --type security --level error --fail-on error`: keine lokalen Security-Fehler.
- `npm.cmd run audit:anon`: Produktionsaudit read-only bestanden; öffentliche freigegebene Events lesbar, private Tabellen liefern `401` bzw. keine Daten.
- Erster `npm.cmd run test:all`: alle Nicht-Browsertests grün, 52/53 E2E; einmalig abgebrochener lokaler Script-Request beim Navigieren, Performance p95 33,40 ms.
- Kontrollierter Theme-Wiederholungslauf: 6/6 grün.
- Finaler `npm.cmd run test:all`: vollständig grün, 53/53 E2E, Performance p95 33,40 ms.
- `git diff --check`: keine Whitespace-Fehler. Statischer Test und Suche bestätigen: keine öffentlichen Kontakt-Platzhalter und keine Service-Role-Credentials im Browsercode.

## Produktions- und Migrationsstand

- Produktion ist gesund erreichbar und registriert 27 Migrationen bis `20260814_review_inbox_deduplication`.
- Acht lokale Migrationen `20260815` bis `20260822` sind nicht produktiv angewendet; der separate Deployment-Review bleibt verbindlich.
- Die neue Beta-Härtung `20260814120000_beta_security_definer_hardening.sql` ist ebenfalls nicht produktiv angewendet. Sie ist unabhängig von Stage 4 zu behandeln und vor einer Beta kontrolliert zu deployen und zu prüfen.
- Die produktive Edge Function `event-source-check` ist Version 12 mit `verify_jwt=true`; sie benötigt die Stage-4-RPCs noch nicht. Kein Edge-Function-Deployment erfolgte.
- Stage 4 blieb deaktiviert. Es wurden weder Automation noch Observation Scheduler aktiviert, keine automatischen Eventänderungen veröffentlicht und keine produktiven Eventdaten verändert.

## Bedingungen für einen neuen Entscheid

Ein erneutes Review ist erst sinnvoll, wenn alle folgenden Punkte belegt sind:

1. Härtungsmigration separat freigeben, Backup/Restore-Weg bestätigen, kontrolliert anwenden und Produktions-Advisor sowie normale Nutzer-RPC-Negativtests wiederholen.
2. Produktions-Dashboard Site URL und exakte Redirect-Allowlist dokumentieren.
3. Auth-Matrix mit zwei realen E-Mail-Anbietern vollständig durchführen, einschließlich Reset und ungültigem Link.
4. Nutzer A/B und Admin in Produktion mit klar markierten Fixtures testen; Cleanup und unveränderte Fremddaten belegen.
5. Je einen vollständigen realen iOS-/Safari- und Android-/Chrome-Lauf dokumentieren.
6. Betreiberangaben bestätigen und Rechtstexte juristisch prüfen lassen.

Bis dahin dürfen keine Tester eingeladen und die acht Stage-4-Migrationen nicht produktiv ausgerollt werden.
