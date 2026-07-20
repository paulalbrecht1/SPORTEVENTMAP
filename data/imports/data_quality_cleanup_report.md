# Data Quality Cleanup Report

Date: 03.06.2026

## Actions

- Repaired mojibake/encoding artifacts in `data/events.csv` so German umlauts and `?` render correctly.
- Removed only clear duplicate rows with the same official URL and same event date.
- Kept legitimate multi-event/shared-portal cases, for example different Nordseelauf stages and different Sportscheck city events.

Removed duplicate rows: 16

## Removed Rows

- line 25: Ulm Marathon|27.09.2026|Ulm (https://einsteinmarathon.de/)
- line 46: Salzkotten Marathon|07.06.2026|Salzkotten (https://salzkotten-marathon.de/)
- line 51: Buchholzer Stadtlauf|21.06.2026|Buchholz (https://buchholzerstadtlauf.de/)
- line 69: Heumadener Volkslauf|19.07.2026|Stuttgart (https://www.tsv-heumaden.de/veranstaltungen/heumadener-volkslauf)
- line 136: Dresdner Marathon|25.10.2026|Dresden (https://www.dresden-marathon.com/)
- line 169: Havelberg Triathlon Swim & Bike|06.06.2026|Havelberg (https://www.havelbergtriathlon.de/)
- line 226: Rheingauer Halbmarathon|26.07.2026|Oestrich (https://www.rieslinglauf.de/)
- line 257: 21. swb-Marathon Bremen|13.09.2026|Bremer Marktplatz (https://swb-marathon.com/)
- line 276: 55. Volkslauf Rund um Wellen|02.08.2026|Cuxhaven (https://www.wellen-marathon.de/)
- line 289: 55. Melibokus Lauf|14.06.2026|Hesse (https://tv-alsbach.de/melibokuslauf/)
- line 339: Breunaer Volkslauf mit 21,1km Malsburglauf|06.09.2026|Hesse (http://www.tsv-breuna.de/leichtathletik)
- line 348: Ahrathon Erlebnislauf|13.06.2026|Rhineland-Palatinate (https://ahrathon.de/)
- line 369: Draisinenlauf Altenglan|21.06.2026|Rhineland-Palatinate (https://lsc-kusel.de/draisinenlauf/)
- line 384: Fichtelgebirgsmarathon mit Halbmarathon und 10km-Lauf|04.07.2026|Fichtelgebirge (https://fichtelgebirgsmarathon.de/)
- line 386: EWE Nordseelauf - Etappe 4|24.06.2026|Nordsee (https://nordseelauf.com/)
- line 388: EWE Nordseelauf - Etappe 7|27.06.2026|Wittmund (https://nordseelauf.com/)

## Rule

No event was removed only because of a missing field. Rows were removed only when they were clear duplicates of another event already kept in the CSV.
## Second Duplicate Pass

Removed additional duplicate rows: 3

- line 277: 21. ProPotsdam Schlösserlauf|07.06.2026|UNESCO-Welterbe (https://potsdam-schloesserlauf.de/)
- line 340: Burgwald Märchen Marathon|30.08.2026|Hesse (https://bmm-rauschenberg.de/)
- line 398: Hachenburger Löwenlauf|17.10.2026|Rhineland-Palatinate (https://www.loewenlauf-hachenburg.de/)

## Final Duplicate Pass

Removed additional duplicate rows: 3

- line 113: 3-Länder Marathon|11.10.2026|Bregenz (https://www.sparkasse-3-laender-marathon.at/de/home/)
- line 150: WVV Würzburg Marathon|23.05.2027|Würzburg (https://www.wuerzburg-marathon.de/)
- line 241: Westerwälder Backyard-Ultra|05.06.2026|Höchstenbach (https://katjas-laufzeit.de/westerwaelder-backyard-ultra-2026-ausschreibung/)
