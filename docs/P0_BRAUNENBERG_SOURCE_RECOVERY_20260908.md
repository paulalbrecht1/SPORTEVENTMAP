# P0: Quellenabruf des BraunenBerg-Laufs wiederherstellen

Ausgangspunkt ist GitHub `main` auf `836c0ca`. Das
[P0-Protokoll](NEXT_IMPLEMENTATION_STAGES.md) priorisiert den wiederholt
fehlgeschlagenen Abruf von `https://www.braunenberg-lauf.de/`, Event 377,
Quelle `25d2ace8-5e5d-41df-ae12-892d842f40bb`.
Dieser Schritt repariert den technischen Zugang zur offiziellen Quelle.
Die fachliche Vollprüfung und Attestierung bleiben eigene Arbeitsschritte.

## Belegte Ursache

Production dokumentierte acht aufeinanderfolgende Fehler. Der letzte Abruf
am 7. September 2026 um 21:45:16 UTC endete nach 12.003 ms als
`pinned_connect_error: operation canceled`. Der aktive Wiederholungsjob war
für den 8. September um 03:45:16 UTC vorgesehen.

Der lokale Abruf gegen die frisch aufgelöste öffentliche IP `109.91.152.205`
belegt eine erfolgreiche TCP-/TLS-Verbindung und HTTP 200. Die Homepage wurde
jedoch beim Ablauf der zwölf Sekunden noch übertragen: 517.094 Rohbytes,
noch kein abschließender Nullchunk. Es handelt sich bei dieser Messung um
einen zu knapp begrenzten langsamen Download. Warten auf ein Verbindungsende
nach bereits vollständiger Übertragung ist hier nicht als Ursache belegt.

Mit einem Budget von 20 Sekunden liefert derselbe Repository-Pfad
`fetchSource`/`createPinnedHttpFetch` die Seite vollständig:

| Messgröße | Ergebnis am 7. September 2026, UTC |
| --- | --- |
| Beginn / Ende | 22:39:43,763 / 22:39:56,551 |
| Antwortdauer | 12.769 ms |
| Vollständiger Inhalt | 551.543 Bodybytes, 552.633 Rohbytes |
| Abschluss | Nullchunk bei 12.761 ms, sauberes EOF bei 12.766 ms |
| Verbindung | geprüfte Ziel-IP, gültiges TLS 1.3, Hostname/SNI, HTTP/1.1 |
| Normalisierung | `sem-v3`, 12.114 Zeichen |

SHA-256 des vollständigen UTF-8-Inhalts:
`4a8e1bde580a691e25768ace24aad8c573d63c9cea795d999fdb212ecdfaa89a`.
Eine zweite, unabhängige TLS-geprüfte `curl --resolve`-Messung lieferte
551.542 Bytes in 12.118 ms. Kleine dynamische Seitenunterschiede erklären
nicht den wiederkehrenden Abbruch während der Übertragung.

Die Repository-Probe verwendet einen lokalen Node-24-TCP-/TLS-Adapter.
Sie ersetzt den abschließenden echten Abruf aus der Deno-Edge-Runtime nicht.
Die datierten Einzelbelege liegen unter `exports/p0-review-20260908/` und
bleiben außerhalb von GitHub und Websitepaketen.

## Begrenzte Reparatur

Ein eigener Deadline-Abbruch wird nach asynchronem Verbindungsaufbau,
TLS-Handshake, Schreiben und Lesen sowie im Fehlerpfad als `AbortError`
erhalten. Der übergeordnete Source-Monitor ordnet ihn dadurch korrekt als
`timeout` ein. Er kontaktiert nach dem Abbruch keine weitere Ziel-IP und
wertet ein durch das Schließen ausgelöstes EOF nicht als erfolgreichen Abruf.
Der vorhandene reguläre Wiederholungsmechanismus bleibt erhalten.

Nur die vorhandene Domainregel 675 für `www.braunenberg-lauf.de` erhält ein
Budget von 20.000 statt 12.000 ms. Die globale Vorgabe bleibt 12.000 ms;
die bestehende Datenbankgrenze von höchstens 30.000 ms wird eingehalten.
HTTPS, IP-Bindung, Zertifikatsprüfung, Robots-Regeln, mindestens 30 Sekunden
Abstand, höchstens ein Request pro Lauf und 1,5 MB Antwortlimit bleiben erhalten.
Die [Supabase-Laufzeitgrenzen](https://supabase.com/docs/guides/functions/limits)
lassen diesen begrenzten I/O-Zeitrahmen zu.

Die [Anwendung](../supabase/maintenance/20260908_p0_braunenberg_timeout.sql),
[Nachprüfung](../supabase/maintenance/20260908_p0_braunenberg_timeout_verify.sql)
und [Rücknahme](../supabase/maintenance/20260908_p0_braunenberg_timeout_rollback.sql)
vergleichen die vollständige Konfiguration ohne laufende Telemetrie mit dem
geprüften Ausgangsstand. Jede unerwartete Konfigurationsänderung stoppt die
Transaktion. Neben Timeout und technischem Änderungszeitstempel darf kein
anderes Feld verändert werden.

Die separate [Wiederholungsvorbereitung](../supabase/maintenance/20260908_p0_braunenberg_retry.sql)
zieht ausschließlich den vorhandenen Wiederholungsjob vor. Sie prüft
Jobidentität, Quelle, Status, drei bisherige Versuche, freie Lease und den
ursprünglichen Termin. Versuchszähler, Fehlerhistorie und übrige Jobs bleiben
erhalten. Anschließend kann der bestehende authentifizierte Schedulerpfad
genau diese Quelle abrufen.

## Absicherung und Abnahme

Das reguläre automatische Backup von 22:30–22:31 UTC enthält bereits die
drei zuvor attestierten Editionen sowie 999 Events, 1.022 Editionen,
1.016 Quellen und 40 Migrationen. Die 8.707.121 Byte große verschlüsselte Datei
`sporteventmap-production-20260907T223002394Z.sembackup` hat SHA-256
`cf3b71577278e0d944502cc3b2abf8a18622bb3390e3fff2f6e3273ff4cec0e8`.
Der frische isolierte Restore endete um 22:38:53 UTC in 37,726 Sekunden.
Schema, Datenintegrität, RLS, Nutzerisolation und öffentliche Views bestanden.

Der unveränderte bisherige Worker wurde vollständig als lokale Rücknahmebasis
gesichert: Plattformversion 21, zwölf Quelldateien, `verify_jwt=true`.
Die neue Kennung lautet `source-monitor-4.1.6-phase-a-shadow-pinned-timeout`.
Die lokale Probe bestand Anwendung, Nachprüfung, Wiederholungssperren,
Rücknahme und Ablehnung einer Rücknahme nach zwischenzeitlicher Änderung des
Timeouts. Auch das einmalige Vorziehen des vorhandenen Jobs und dessen
Wiederholungssperre bestanden. Die Probe verglich vollständige Zeilenfingerprints:
689 andere Domainregeln sowie Events, Editionen, Quellen und Nutzerstrukturen
blieben unverändert. Der Clone `sport-event-map-recovery-drill-b8dbc423`, seine
beiden Volumes und das geprüfte Klartextverzeichnis wurden um 22:46:17 UTC
entfernt. Das verschlüsselte Backup bleibt erhalten.

`npm run test:code` bestand vollständig, einschließlich **87/87 Browserfällen
in 4,7 Minuten** und der zusätzlichen Deadline-Regressionen. Die unabhängige
Prüfung des Codes und der vier Wartungsdateien fand keine Blocker.
Nach dem Rollout bestanden erneut 7/7 anonyme Zugriffs-, 5/5 Frische-Zugriffs-
und 6/6 Source-Monitor-Schema-Zugriffsprüfungen. Der dedizierte
`action:smoke` wurde in diesem Schritt nicht ausgeführt; der tatsächliche
Quellenlauf und die getrennten Zugriffsaudits sind die Produktionsnachweise.

## Produktiver Abschluss

Der Worker ist als **Plattformversion 22** mit `verify_jwt=true` veröffentlicht.
Alle zwölf zurückgelesenen Dateien entsprechen dem geprüften Paket. Nur
Transport-Abbruchbehandlung und Workerkennung unterscheiden sich von Version 21.
Der SHA-256 des Pakets aus normalisierten Dateinamen und Inhalten ist
`d23a1779d5de6b7242640c9ad7a935818a16eb21072dea5604e02e10741461ba`.

Die Domainregel wurde am 7. September um 22:47:20 UTC auf 20.000 ms geändert
und separat nachgeprüft. Der einzelne Wiederholungsjob wurde um 22:48:37 UTC
vorgezogen. Request **6519**, Workflow **4958**, Crawlresultat **2657**
bestätigen den erfolgreichen echten Edge-Abruf:

| Nachweis | Ergebnis |
| --- | --- |
| Abruf abgeschlossen, UTC | 2026-09-07 22:48:59 |
| HTTP / Dauer / Inhalt | 200 / 14.453 ms / 551.553 Bytes |
| Geprüfte IP | 109.91.152.205 |
| Worker / Normalisierung | 4.1.6 / sem-v3 |
| Quellenstatus | `success`, Fehlerzähler von 8 auf 0 |
| Jobstatus | `completed`, vierter Versuch, keine aktive Lease |
| Regulärer Folgeabruf | 2026-09-14 22:48:59 UTC |

Content- und semantischer Hash stimmen mit der erfolgreichen lokalen
Repository-Probe überein. Der Worker verarbeitete genau die angeforderte Quelle;
der bestehende begrenzte Scheduler reihte zusätzlich einen regulär fälligen
Job ein, ohne ihn in diesem gezielten Lauf zu verarbeiten.

Vier extrahierte Änderungsvorschläge bleiben `pending`, der erkannte Termin
18. September 2027 bleibt ein `detected`-Nachfolgekandidat ohne Entwurf oder
Veröffentlichung. Die Distanzvorschläge enthalten gemischte Seitenangaben und
müssen vor einer Übernahme fachlich aufgelöst werden. Beide Autopublishflags
bleiben aus. Die separate Nachprüfung bestätigt unveränderte Event- und
Editionsfakten, 999 Events, 1.022 Editionen, 1.016 Quellen sowie weiterhin
5 Profile, 36 Favoriten und 48 Planeinträge. Nur technische Review- und
Quellenmetadaten wurden regulär aktualisiert.

Die drei vorherigen Frischenachweise bleiben gültig; Braunenberg bleibt ohne
Attestierung. Der reguläre öffentliche Refresh bestätigt weiterhin
**332 Discovery-Editionen, 989 Archiv-Editionen, 0,90 % Frische und 49,40 %
Vollständigkeit**. Er stoppt vor Dateiänderungen an den unveränderten Grenzen
von mindestens 400 Discovery-Editionen und 55 % Frische. Fallback,
Eventseiten, Sitemap, Website-Releaseversion und Wrangler-Deployment bleiben
unverändert.

## Getrennte verbleibende Arbeiten

Der unabhängige Transportreview hat zusätzliche ältere HTTP-Framing-Lücken
synthetisch reproduziert: vollständige Antworten warten unnötig auf EOF;
bestimmte unvollständige Chunkabschlüsse und ungeframtes fehlerhaftes TLS-EOF
werden zu großzügig behandelt. Diese Befunde sind nicht die oben belegte
Braunenberg-Ursache und wurden nicht in diesen begrenzten Timeout-Fix gemischt.
Eine eigene Reparatur muss die vollständigen Abschlussbedingungen gemäß
[RFC 9112, Abschnitte 6.3, 7.1 und 8](https://www.rfc-editor.org/rfc/rfc9112.html#section-6.3)
prüfen und unvollständige Inhalte ablehnen. TLS-Prüfung und IP-Bindung bleiben
dabei verpflichtend.

Der parallele Mülheim-Review ist mit 14 vorgeschlagenen Feldwerten,
neun gehashten aktuellen Quellen und unabhängigem Gegencheck vorbereitet.
Die [Veranstalterinformationen](https://www.muelheimer-firmenlauf.de/infos-lauf/)
belegen den Laufstart am Campus der Hochschule Ruhr West, Duisburger Straße
100, sowie 5,6 km Lauf und ungefähr 7,9 km Firmenwanderung mit anderem Start.
Der auf der Veranstalterseite eingebundene offizielle Kartenmarker liegt bei
51.427818, 6.8588299; der bisherige Stadtpunkt liegt rund 1,67 km entfernt.
Der Vorschlag verwendet gerundete Koordinaten ohne behauptete Vermessungsgenauigkeit.
Die öffentliche Teamanmeldung ist geöffnet; eine spätere Frist für bereits
eingeloggte Teams wird nicht als allgemeine Anmeldefrist dargestellt.
Vorherstand, Minimalpatch und Evidenz liegen ausschließlich unter
`exports/p0-review-20260908/muelheim/`. Es wurden noch keine dieser Fakten
produktiv angewendet und kein Frischenachweis erteilt.

Danach stehen die kontrollierte Mülheim-Faktenkorrektur mit Attestierung,
der vollständige Braunenberg-Feldreview sowie weitere verifizierte künftige
Editionen an. Ein erfolgreicher Quellenabruf
ersetzt weder eine Faktenkorrektur noch einen 14-Felder-Frischenachweis.
Der Website-Upload bleibt an die unveränderten Katalog- und Release-Gates
gebunden.
