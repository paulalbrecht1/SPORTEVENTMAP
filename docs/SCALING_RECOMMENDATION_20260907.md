# Skalierungsempfehlung für SportEventMap

Stand: 7. September 2026. Grundlage sind der aktuelle Projektcode, die vorhandene Roadmap und der lesende Abgleich der öffentlichen Website und des Production-Katalogs. Git-, Release- und Synchronisierungsdetails werden separat dokumentiert.

## 1. Empfehlung und Abgleich mit dem Plan

SportEventMap sollte zuerst einen verlässlich gepflegten Deutschland-Katalog und eine durchgängige mobile Suche skalieren. Die vorhandene Architektur und die bereits entwickelten Konten-, Favoriten- und Planerfunktionen reichen als Grundlage. Der nächste Wachstumsschritt braucht vor allem überprüfte Veranstaltungsdaten, einen planbaren Reviewbetrieb und messbar bessere Discovery.

Die Reihenfolge aus [NEXT_IMPLEMENTATION_STAGES.md](NEXT_IMPLEMENTATION_STAGES.md) bleibt richtig: P0-Daten- und Releasefähigkeit, P1-Katalog, P2-mobile Suche, danach P3-SEO. Kleine P4-Arbeiten an CI und Modulgrenzen können unterstützen. Das ursprüngliche Ziel von **1.000 verifizierten deutschen Event-Editionen innerhalb von 6–12 Monaten** bleibt bestehen. Die folgenden 90 Tage schaffen dafür die Grundlage; sie versprechen keinen vollständigen 1.000er-Katalog.

Die allgemeine [Produktvision](PRODUCT_VISION.md) beschreibt Konten und Saisonplanung als spätere Phasen. Im Code sind diese Bereiche bereits umfangreich vorhanden. Weitere Planer-, Ernährungs-, Ausrüstungs- oder Personalisierungsfunktionen sollten deshalb vorerst keine Entwicklungspriorität erhalten.

## 2. Belastbare Ausgangslage

| Kennzahl | Live am 07.09.2026 | Bedeutung |
| --- | ---: | --- |
| Aktive Discovery-Editionen | 332 | Der aktuell öffentlich suchbare Gesamtbestand |
| Davon Deutschland | 277 | Relevante Ausgangsgröße für die Deutschland-Abdeckung |
| Archiv-Editionen | 989 | Historischer Bestand; nicht zum Discovery-Wachstum addieren |
| Frische nach strengem Quellen-Guard | 0 | Aktuelle, ausreichende Verifikationsnachweise fehlen |
| Vollständige Discovery-Editionen | 164 / 49,4 % | Etwa die Hälfte erfüllt die bestehende Vollständigkeitsmetrik |
| Anmeldestatus unbekannt | 330 / 332 | Die Anmeldesuche hat derzeit kaum belastbare Eingangsdaten |

**Null frische Editionen bedeutet nicht, dass sämtliche Eventdaten falsch sind.** Es bedeutet, dass aktuell keine Edition die strenge Nachweisprüfung erfüllt. Die 64,04 % im versionierten Export vom 27. August beruhen auf einem anderen Zeitpunkt und einer älteren Bewertung; daraus darf kein gleichwertiger Qualitätsvergleich abgeleitet werden. Der [Exportmanifest](../data/catalog-export-manifest.json) mit 431 Discovery-Einträgen ist ein historischer Fallback, keine aktuelle Live-Metrik.

Die [Release-Policy](../data/catalog-release-policy.json) verlangt unter anderem mindestens 400 Discovery-Einträge, 55 % Frische und einen höchstens 24 Stunden alten Export. Der aktuelle Katalog erfüllt diese Anforderungen nicht. Grenzwerte abzusenken würde die fehlende Datenarbeit verdecken.

Für das Deutschland-Ziel fehlen gegenüber 277 vorhandenen Editionen **723 netto**. Nachverifizierung, das saisonale Auslaufen bestehender Events und fehlende Folgeeditionen kommen hinzu. Das Dashboard sollte Eventmarken, aktive Editionen, verifizierte aktive DE-Editionen und Archiv getrennt ausweisen.

## 3. Produktstand und wichtigste Brüche

Karte, Cluster, intelligente Textsuche, Sport-, Distanz-, Länder- und Datumsfilter, Favoriten und statische Detailseiten sind implementiert. Konten, Countdown, Kalender und A/B/C-Wettkampfprioritäten existieren ebenfalls; siehe [Suchlogik](../js/search.js), [Event- und Planerlogik](../js/events.js) und [Planer-E2E](../tests/e2e/planner-core.spec.mjs). Das operative Fundament mit Editionen, Quellen, Reviews und Auditnachweisen ist in [EVENT_DATA_OPERATIONS.md](EVENT_DATA_OPERATIONS.md) beschrieben.

Der Live-Test auf 390 × 844 Pixeln zeigte grundsätzlich bedienbare Oberflächen, aber Unterbrechungen im zentralen Suchablauf:

| Beobachtung | Konsequenz und nächste Abnahme |
| --- | --- |
| Nach einer Suche war keine sichtbare Trefferliste erreichbar; „Back to map“ verlor den Suchzustand. | Suche, Liste, Karte und Detailrückkehr als zusammenhängenden Ablauf testen; Suchbegriff und Filter müssen erhalten bleiben. |
| Home zeigte 337 Events, Discovery 332. | Zähler aus derselben Katalogversion und derselben Definition ableiten; Abweichungen automatisiert prüfen. |
| Trail- und Registrierungsfilter werden beworben, fehlen aber als entsprechende Auswahl. | Produkttexte und verfügbare Filter abgleichen; Trail fachlich sauber klassifizieren, Registrierungsfilter mit belastbaren Daten liefern. |
| Event Wiki ist bisher eine Konzeptfläche. | Einstieg klar kennzeichnen oder auf vorhandene, hilfreiche Detailinformationen führen. |
| Berlin zeigte „Unclear“, die Detailseite „Lottery closed“; außerdem „Course Profile: Very high“ und den verkürzten Startort „Straße des 17“. | Status aus einer editionsgebundenen Quelle beziehen; widersprüchliche oder unvollständige Details vor Veröffentlichung prüfen. |

Diese Stichproben sind konkrete Fehlerhinweise, keine Aussage über jede Veranstaltung. Sie zeigen, dass Konsistenz zwischen Suche, Detailseite und Datenquelle zum Releasekriterium gehören muss.

## 4. Arbeitsplan für die nächsten 90 Tage

Die Zeitfenster sind Arbeitsziele. Eine nachfolgende Veröffentlichung setzt erfüllte Qualitätskriterien voraus.

| Zeitraum | Arbeitsschwerpunkt | Abnahmekriterien |
| --- | --- | --- |
| Tage 1–30 | P0 abschließen und Datenbetrieb organisieren | Unveränderte Release-Gates grün; aktueller Export und zugehörige Audits; keine kritischen Dubletten-, Geo- oder Datumsfehler; vollständige relevante Tests und anonymer Zugriffstest erfolgreich. Reviewaufgaben besitzen Verantwortliche, Priorität und Frist. Zwei Wochen tatsächlichen Durchsatz erfassen. |
| Tage 31–60 | DE-Abdeckung gezielt erweitern und mobile Discovery verbessern | Quellenmatrix nach Bundesland und Sportart; freigegebene Import-Batches. Reproduzierbare Filter-URLs, funktionierende Rücknavigation und sichtbare mobile Treffer. Höchstens 50 initial gerenderte Karten in jeder Listenansicht. Produktversprechen entsprechen verfügbaren Funktionen. |
| Tage 61–90 | Datenbetrieb stabilisieren, Sucherfolg messen, erste SEO-Piloten | Mehrwöchiger Nachweis für Review-SLAs und Qualitätsentwicklung. Indexierbare Einstiegsseiten nur für ausreichend dichte, aktuelle Bestände. Canonicals, Links und Event-Status geprüft. CI und Größenbudgets schützen den Discovery-Pfad. |

Der bestehende [Quellenbeobachtungs-Pilot](STAGE_FOUR_GERMANY_OBSERVATION.md) sollte zunächst mit zwei bis drei offiziellen Quellen arbeiten. Die ersten 30 Änderungsvorschläge vollständig bewerten; erst danach kontrolliert auf 10–15 Quellen und 200–500 Beobachtungen erweitern. Beobachtung und technische Erreichbarkeit ersetzen keine fachliche Freigabe. Automatische Veröffentlichung bleibt ausgeschaltet.

## 5. Kapazität und Steuerungsgrößen

Für 723 zusätzliche deutsche Editionen in 6–12 Monaten wären rechnerisch etwa **14–28 Nettozugänge pro Woche** nötig. Das berücksichtigt weder ausscheidende Editionen noch den Review des vorhandenen Bestands. Eine konkrete Zusage sollte erst aus den gemessenen Bearbeitungszeiten der ersten beiden Wochen entstehen.

Als ausdrückliche Planungsannahme: Bei 10–15 Minuten für einen einfachen vollständigen Review benötigen 30–50 Reviews rund 5–12,5 Stunden pro Woche. Recherche, Konflikte und Datenkorrekturen kommen hinzu. Würden später alle 1.000 Editionen alle 90 Tage manuell geprüft, wären bereits etwa 78 Reviews beziehungsweise 13–20 Stunden wöchentlich nötig. Das ist ein Kapazitätsszenario, keine vorgeschriebene Prüffrequenz. Prüfintervalle müssen nach Nähe des Events, Änderungsrisiko und Quellenqualität priorisiert werden.

| Bereich | Ziel beziehungsweise Messpunkt |
| --- | --- |
| Katalogziel, 6–12 Monate | 1.000 verifizierte deutsche Editionen; festgelegter Discovery-Zeitraum und keine Archivzählung |
| Datenqualität | Mindestens 85 % Frische, 80 % Vollständigkeit; Pflichtfelder und valide Geodaten bei allen veröffentlichten Einträgen |
| Anmeldung | Status bei mindestens 75 % der zukünftigen Events innerhalb von 180 Tagen bekannt |
| Reviewbetrieb | Weniger als 10 % Reviewbedarf; keine kritische Aufgabe länger als sieben Tage offen; Durchsatz und Minuten pro Fall messen |
| Sucherfolg | Nulltrefferquote, Filterverwendung, Detailöffnungen und offizielle Anmeldeklicks als Baseline; Verbesserungsziele danach festlegen |
| Mobile Nutzung | LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1 am 75. Perzentil, sobald ausreichend Felddaten vorliegen |

Die Performanceziele entsprechen den [offiziellen Web-Vitals-Schwellen](https://web.dev/articles/vitals). Lokale Browsertests ersetzen dabei keine Felddaten.

## 6. Technik und organisches Wachstum

Die vorhandene 48er-Paginierung gilt nur für die Vollbildliste; [getVisibleEventListPage](../js/events.js) liefert sonst sämtliche Treffer zurück. Außerdem umfassen die lokalen Dateien unkomprimiert etwa 312 KB Event-/Planer-JavaScript, 461 KB Supabase-/Admin-JavaScript und 1,15 MB Haupt-CSS. Der [Loader](../js/supabase-loader.js) lädt das große Supabase-Modul auch im Leerlauf. Das begründet begrenztes Rendering und schrittweise Modultrennung im bestehenden Stack; eine vollständige Neuentwicklung ist daraus nicht abzuleiten.

CI sollte zwei Prüfbereiche unterscheiden: reproduzierbare Code-, Schema-, Sicherheits- und Browsertests pro Commit sowie separate aktuelle Produktionsdatenprüfungen. Vor einem Release müssen beide bestehen. Ein alter Fallback darf weder eine ungesunde Veröffentlichung erlauben noch jede unabhängige Codeprüfung unbrauchbar machen. Der [Entwicklungsworkflow](DEVELOPMENT_WORKFLOW.md) bleibt die Grundlage.

SEO folgt auf stabile Daten und Filter-URLs: zuerst wenige hilfreiche Sport-, Distanz- und Regionenseiten, anschließend anhand tatsächlicher Suchnachfrage erweitern. Der [Seitengenerator](../tools/generate-event-pages.js) muss den Veranstaltungsstatus aus Editionsfakten statt aus dem Verifikationsstatus erzeugen. Maßgeblich sind die [Event-Strukturdatenregeln](https://developers.google.com/search/docs/appearance/structured-data/event) und [hilfreiche Inhalte](https://developers.google.com/search/docs/fundamentals/creating-helpful-content). Reichweite wird an organischen Einstiegen und erfolgreichen Evententdeckungen gemessen, nicht an der Anzahl erzeugter Seiten.
