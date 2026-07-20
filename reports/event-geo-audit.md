# Event Geo Audit

Generated: 2026-07-08T13:12:58.252Z
Input: data/events.csv
Events checked: 994

## Summary

- Critical: 0
- Warning: 87
- Info: 57
- Clean: 850
- Proposed automatic fixes: 0

## Issue Breakdown

- shared_coordinates_multiple_places: 47
- city_level_pin_with_precise_address: 45
- coordinates_far_from_city: 41
- no_cached_city_reference: 17

## Review Queue

### Finkenwerder Insellauf

- Severity: warning
- Event ID: finkenwerder-insellauf-hamburg-06-06-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### saarBRÜCKENlauf

- Severity: warning
- Event ID: saarbruckenlauf-saarbrucken-14-06-2026
- Location: Saarbrücken, Germany
- Current coordinate: 49.234362, 6.996379
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Sparkassen Metropolmarathon

- Severity: warning
- Event ID: sparkassen-metropolmarathon-furth-14-06-2026
- Location: Fürth, Germany
- Current coordinate: 49.4885711, 10.9587203
- Issues: coordinates_far_from_city
- Distance to city: 158.2 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Gletschermarathon Pitztal

- Severity: info
- Event ID: gletschermarathon-pitztal-sankt-leonhard-im-pitztal-05-07-2026
- Location: Sankt Leonhard im Pitztal, Austria
- Current coordinate: 46.9686284, 10.8709246
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Eilenriederennen Hannover

- Severity: warning
- Event ID: eilenriederennen-hannover-hannover-30-08-2026
- Location: Hannover, Germany
- Current coordinate: 52.3744779, 9.7385532
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Rosengartenlauf

- Severity: warning
- Event ID: rosengartenlauf-rosengarten-vahrendorf-23-08-2026
- Location: Rosengarten-Vahrendorf, Germany
- Current coordinate: 53.3983771, 9.9048979
- Issues: coordinates_far_from_city
- Distance to city: 163.4 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### BORSIG Halbmarathon

- Severity: warning
- Event ID: borsig-halbmarathon-berlin-06-09-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### 33. Mußbach Triathlon

- Severity: warning
- Event ID: 33-mu-bach-triathlon-neustadt-14-06-2026
- Location: Neustadt, Germany
- Current coordinate: 49.388, 8.13
- Issues: coordinates_far_from_city
- Distance to city: 555.9 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### 12. Ockstädter Cross Triathlon im Kirschenberg

- Severity: warning
- Event ID: 12-ockstadter-cross-triathlon-im-kirschenberg-friedberg-ockstadt-20-06-2026
- Location: Friedberg-Ockstadt, Germany
- Current coordinate: 50.339, 8.806
- Issues: coordinates_far_from_city
- Distance to city: 273.0 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### 41. Edersee-Triathlon

- Severity: warning
- Event ID: 41-edersee-triathlon-waldeck-27-06-2026
- Location: Waldeck, Germany
- Current coordinate: 51.208, 9.065
- Issues: coordinates_far_from_city
- Distance to city: 192.7 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### adidas Runners City Night Berlin

- Severity: warning
- Event ID: adidas-runners-city-night-berlin-berlin-01-08-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Franklin Meilenlauf Mannheim

- Severity: warning
- Event ID: franklin-meilenlauf-mannheim-mannheim-11-10-2026
- Location: Mannheim, Germany
- Current coordinate: 49.4892913, 8.4673098
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Haspa Halbmarathon Hamburg

- Severity: warning
- Event ID: haspa-halbmarathon-hamburg-hamburg-25-04-2027
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### REWE Women's Run Hamburg

- Severity: warning
- Event ID: rewe-women-s-run-hamburg-hamburg-14-06-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Sandhofer Straßenlauf

- Severity: warning
- Event ID: sandhofer-stra-enlauf-mannheim-19-06-2026
- Location: Mannheim, Germany
- Current coordinate: 49.4892913, 8.4673098
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### 1. Volkslauf Seelze

- Severity: info
- Event ID: 1-volkslauf-seelze-seelze-15-11-2026
- Location: Seelze, Germany
- Current coordinate: 52.3964639, 9.594287
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### 1. Hannover Backyard Ultra

- Severity: warning
- Event ID: 1-hannover-backyard-ultra-hannover-08-08-2026
- Location: Hannover, Germany
- Current coordinate: 52.3744779, 9.7385532
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### 1. Laufchallenge Mellendorfer TV

- Severity: warning
- Event ID: 1-laufchallenge-mellendorfer-tv-hanover-23-08-2026
- Location: Hanover, Germany
- Current coordinate: 52.3744779, 9.7385532
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### 1. Westerwälder Backyard Ultra

- Severity: warning
- Event ID: 1-westerwalder-backyard-ultra-westerwald-05-06-2026
- Location: Westerwald, Germany
- Current coordinate: 50.6319191, 7.7428015
- Issues: coordinates_far_from_city
- Distance to city: 207.6 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### 13. Heilwald Marathon

- Severity: info
- Event ID: 13-heilwald-marathon-bad-lippspringe-24-07-2026
- Location: Bad Lippspringe, Germany
- Current coordinate: 51.7833, 8.81667
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### 15. Fullestrand-Ultramarathon

- Severity: warning
- Event ID: 15-fullestrand-ultramarathon-hesse-13-06-2026
- Location: Hesse, Germany
- Current coordinate: 51.3027675, 9.5000115
- Issues: coordinates_far_from_city
- Distance to city: 84.0 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### 17. VSB Dresdner Nachtlauf

- Severity: info
- Event ID: 17-vsb-dresdner-nachtlauf-dresden-14-08-2026
- Location: Dresden, Germany
- Current coordinate: 51.059798, 13.7268658
- Issues: city_level_pin_with_precise_address
- Distance to city: 1.4 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### 20. Müggelsee-Halbmarathon

- Severity: info
- Event ID: 20-muggelsee-halbmarathon-muggelsee-gebiet-18-10-2026
- Location: Müggelsee-Gebiet, Germany
- Current coordinate: 52.429805, 13.67664
- Issues: city_level_pin_with_precise_address
- Distance to city: 2.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### 14. Garbsener Citylauf

- Severity: info
- Event ID: 14-garbsener-citylauf-garbsen-12-06-2026
- Location: Garbsen, Germany
- Current coordinate: 52.426678, 9.592613
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.5 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### 30. Lauf um den Arendsee

- Severity: warning
- Event ID: 30-lauf-um-den-arendsee-saxony-anhalt-30-08-2026
- Location: Saxony-Anhalt, Germany
- Current coordinate: 52.8906009, 11.4768454
- Issues: coordinates_far_from_city
- Distance to city: 107.9 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### 38. Volkslauf des TSV Breuna

- Severity: warning
- Event ID: 38-volkslauf-des-tsv-breuna-hesse-06-09-2026
- Location: Hesse, Germany
- Current coordinate: 51.0448, 7.405929
- Issues: coordinates_far_from_city
- Distance to city: 123.9 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### 37. Heideblütenlauf

- Severity: info
- Event ID: 37-heideblutenlauf-schneverdingen-29-08-2026
- Location: Schneverdingen, Germany
- Current coordinate: 53.1187799, 9.7873454
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### 49. Warburger Oktoberwochen Volkslauf

- Severity: info
- Event ID: 49-warburger-oktoberwochen-volkslauf-warburg-03-10-2026
- Location: Warburg, Germany
- Current coordinate: 51.4886533, 9.1488385
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### 43. Internationalen Airport Race

- Severity: warning
- Event ID: 43-internationalen-airport-race-hamburg-airport-13-09-2026
- Location: Hamburg Airport, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 9.2 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Aalener Stadtlauf

- Severity: info
- Event ID: aalener-stadtlauf-aalen-19-07-2026
- Location: Aalen, Germany
- Current coordinate: 48.838115, 10.095077
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.2 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### 32. Zeitzer Stadtlauf

- Severity: warning
- Event ID: 32-zeitzer-stadtlauf-saxony-anhalt-29-08-2026
- Location: Saxony-Anhalt, Germany
- Current coordinate: 51.0491637, 12.1349991
- Issues: coordinates_far_from_city
- Distance to city: 102.7 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Alb-Run Heroldstatt

- Severity: info
- Event ID: alb-run-heroldstatt-heroldstatt-11-07-2026
- Location: Heroldstatt, Germany
- Current coordinate: 48.4524395, 9.6788239
- Issues: city_level_pin_with_precise_address
- Distance to city: 1.8 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### AOK Firmenlauf Feuerbach

- Severity: warning
- Event ID: aok-firmenlauf-feuerbach-stuttgart-17-09-2026
- Location: Stuttgart, Germany
- Current coordinate: 48.7784485, 9.1800132
- Issues: city_level_pin_with_precise_address, shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Alpener Stadtlauf

- Severity: info
- Event ID: alpener-stadtlauf-alpen-03-06-2026
- Location: Alpen, Germany
- Current coordinate: 51.5767474, 6.5128805
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### AOK Firmenlauf Göppingen

- Severity: info
- Event ID: aok-firmenlauf-goppingen-goppingen-08-07-2026
- Location: Göppingen, Germany
- Current coordinate: 48.7031377, 9.6541116
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### AOK Firmenlauf Sulz am Neckar

- Severity: info
- Event ID: aok-firmenlauf-sulz-am-neckar-sulz-am-neckar-29-07-2026
- Location: Sulz am Neckar, Germany
- Current coordinate: 48.3617509, 8.6314329
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### AOK Firmenlauf Ludwigsburg

- Severity: warning
- Event ID: aok-firmenlauf-ludwigsburg-ludwigsburg-30-09-2026
- Location: Ludwigsburg, Germany
- Current coordinate: 48.8953937, 9.1895147
- Issues: city_level_pin_with_precise_address, shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Ansmann Cup 2026

- Severity: info
- Event ID: ansmann-cup-2026-assamstadt-27-06-2026
- Location: Assamstadt, Germany
- Current coordinate: 49.4271724, 9.6872392
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### AOK Firmenlauf Schwäbisch Hall

- Severity: info
- Event ID: aok-firmenlauf-schwabisch-hall-schwabisch-hall-22-07-2026
- Location: Schwäbisch Hall, Germany
- Current coordinate: 49.1124305, 9.7371246
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### AOK Firmenlauf Stuttgart

- Severity: warning
- Event ID: aok-firmenlauf-stuttgart-stuttgart-01-07-2026
- Location: Stuttgart, Germany
- Current coordinate: 48.7784485, 9.1800132
- Issues: city_level_pin_with_precise_address, shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### AOK Firmenlauf Waiblingen

- Severity: info
- Event ID: aok-firmenlauf-waiblingen-waiblingen-16-09-2026
- Location: Waiblingen, Germany
- Current coordinate: 48.848514, 9.3226283
- Issues: city_level_pin_with_precise_address
- Distance to city: 1.8 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### B2Run Hamburg

- Severity: warning
- Event ID: b2run-hamburg-volksparkstadion-25-08-2026
- Location: Volksparkstadion, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 7.9 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Auenwaldlauf

- Severity: info
- Event ID: auenwaldlauf-auenwald-04-07-2026
- Location: Auenwald, Germany
- Current coordinate: 48.940383, 9.5115851
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Aspacher Volkslauf

- Severity: info
- Event ID: aspacher-volkslauf-gro-aspach-19-09-2026
- Location: Großaspach, Germany
- Current coordinate: 48.9653254, 9.3997185
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Bad Buchauer Stadtlauf mit Federseehalbmarathon

- Severity: warning
- Event ID: bad-buchauer-stadtlauf-mit-federseehalbmarathon-biberach-11-07-2026
- Location: Biberach, Germany
- Current coordinate: 48.0655836, 9.6097541
- Issues: coordinates_far_from_city
- Distance to city: 121.1 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### B2Run Berlin

- Severity: warning
- Event ID: b2run-berlin-olympiastadion-berlin-16-09-2026
- Location: Olympiastadion Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 10.3 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Babenberger Volkslauf

- Severity: warning
- Event ID: babenberger-volkslauf-bamberg-20-06-2026
- Location: Bamberg, Germany
- Current coordinate: 48.979251, 9.777512
- Issues: coordinates_far_from_city
- Distance to city: 129.3 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Bausch+Ströbel Stadtlauf Ilshofen

- Severity: info
- Event ID: bausch-strobel-stadtlauf-ilshofen-ilshofen-26-09-2026
- Location: Ilshofen, Germany
- Current coordinate: 49.170072, 9.9186069
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### BarockLauf Ludwigsburg

- Severity: warning
- Event ID: barocklauf-ludwigsburg-ludwigsburg-10-07-2026
- Location: Ludwigsburg, Germany
- Current coordinate: 48.8953937, 9.1895147
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### BÄRENFELS SOMMERTRAIL 63-KM mit MARATHON, HALBMARATHON und 11-KM

- Severity: info
- Event ID: barenfels-sommertrail-63-km-mit-marathon-halbmarathon-und-11-km-neubrucke-12-07-
- Location: Neubrücke, Germany
- Current coordinate: 49.6059296, 7.1715988
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Bahndammlauf

- Severity: info
- Event ID: bahndammlauf-53567-buchholz-06-09-2026
- Location: 53567 Buchholz, Germany
- Current coordinate: 50.67175626570943, 7.422621352579696
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Bedburger Citylauf 2026

- Severity: info
- Event ID: bedburger-citylauf-2026-bedburg-13-09-2026
- Location: Bedburg, Germany
- Current coordinate: 50.9972161, 6.5767648
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Black Forest ULTRA Trail Run

- Severity: info
- Event ID: black-forest-ultra-trail-run-kirchzarten-19-09-2026
- Location: Kirchzarten, Germany
- Current coordinate: 47.9651461, 7.9573306
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Birklauf

- Severity: info
- Event ID: birklauf-gelting-29-08-2026
- Location: Gelting, Germany
- Current coordinate: 54.7468969, 9.8969663
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Bredstedt-Cross

- Severity: info
- Event ID: bredstedt-cross-bredstedt-31-10-2026
- Location: Bredstedt, Germany
- Current coordinate: 54.6236326, 8.9640834
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### BWM Sommerlochlauf

- Severity: info
- Event ID: bwm-sommerlochlauf-steinheim-an-der-murr-04-08-2026
- Location: Steinheim an der Murr, Germany
- Current coordinate: 48.9802924, 9.2890186
- Issues: city_level_pin_with_precise_address
- Distance to city: 1.8 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Die 10 Kilometer von Dürwiß

- Severity: warning
- Event ID: die-10-kilometer-von-durwi-eschweiler-01-08-2026
- Location: Eschweiler, Germany
- Current coordinate: 49.1359574, 7.3651094
- Issues: coordinates_far_from_city
- Distance to city: 202.9 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Burgentrail Unterfränkische Traillaufmeisterschaften

- Severity: warning
- Event ID: burgentrail-unterfrankische-traillaufmeisterschaften-lower-franconia-03-10-2026
- Location: Lower Franconia, Germany
- Current coordinate: 50.1238327, 10.5336427
- Issues: coordinates_far_from_city
- Distance to city: 225.8 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Christmas Run To Tree

- Severity: warning
- Event ID: christmas-run-to-tree-forst-klovensteen-29-11-2026
- Location: Forst Klövensteen, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: coordinates_far_from_city, shared_coordinates_multiple_places
- Distance to city: 498.8 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Ditzinger Keltenlauf

- Severity: info
- Event ID: ditzinger-keltenlauf-ditzingen-18-10-2026
- Location: Ditzingen, Germany
- Current coordinate: 48.823918, 9.07533
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.7 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### dm Firmenlauf Saarbrücken

- Severity: warning
- Event ID: dm-firmenlauf-saarbrucken-saarbrucken-02-06-2026
- Location: Saarbrücken, Germany
- Current coordinate: 49.234362, 6.996379
- Issues: city_level_pin_with_precise_address, shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### DresdenHALF

- Severity: info
- Event ID: dresdenhalf-dresden-06-09-2026
- Location: Dresden, Germany
- Current coordinate: 51.048184, 13.742725
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.3 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Dieburger Stadtlauf

- Severity: warning
- Event ID: dieburger-stadtlauf-hesse-20-06-2026
- Location: Hesse, Germany
- Current coordinate: 49.8981797, 8.8396216
- Issues: coordinates_far_from_city
- Distance to city: 80.1 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Dünenlauf

- Severity: info
- Event ID: dunenlauf-sandhausen-13-06-2026
- Location: Sandhausen, Germany
- Current coordinate: 49.3424055, 8.6595053
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Bönnigheimer Stromberglauf

- Severity: info
- Event ID: bonnigheimer-stromberglauf-bonnigheim-21-11-2026
- Location: Bönnigheim, Germany
- Current coordinate: 49.0417185, 9.0933985
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Edersee-Lauf

- Severity: warning
- Event ID: edersee-lauf-hesse-29-08-2026
- Location: Hesse, Germany
- Current coordinate: 49.679564, 11.961774
- Issues: coordinates_far_from_city
- Distance to city: 233.1 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### ENSINGER Laufcup

- Severity: info
- Event ID: ensinger-laufcup-vaihingen-an-der-enz-17-10-2026
- Location: Vaihingen an der Enz, Germany
- Current coordinate: 48.9321398, 8.9568316
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Eschweiler Citylauf 2026

- Severity: warning
- Event ID: eschweiler-citylauf-2026-eschweiler-23-08-2026
- Location: Eschweiler, Germany
- Current coordinate: 49.1359574, 7.3651094
- Issues: coordinates_far_from_city
- Distance to city: 202.9 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Eltviller Familienlauf 2026

- Severity: warning
- Event ID: eltviller-familienlauf-2026-hesse-20-09-2026
- Location: Hesse, Germany
- Current coordinate: 50.0274688, 8.1189627
- Issues: coordinates_far_from_city
- Distance to city: 91.3 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Firmenlauf Renningen

- Severity: info
- Event ID: firmenlauf-renningen-renningen-24-06-2026
- Location: Renningen, Germany
- Current coordinate: 48.7648163, 8.9347008
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Friedrichshaller Runde

- Severity: info
- Event ID: friedrichshaller-runde-bad-friedrichshall-26-09-2026
- Location: Bad Friedrichshall, Germany
- Current coordinate: 49.2280136, 9.2101479
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Friedrichstaler Waldlauf

- Severity: info
- Event ID: friedrichstaler-waldlauf-stutensee-25-10-2026
- Location: Stutensee, Germany
- Current coordinate: 49.1051892, 8.477052
- Issues: city_level_pin_with_precise_address
- Distance to city: 1.9 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Gänseliesellauf

- Severity: info
- Event ID: ganseliesellauf-monheim-am-rhein-12-06-2026
- Location: Monheim am Rhein, Germany
- Current coordinate: 51.0909476, 6.8812387
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Gäulauf

- Severity: warning
- Event ID: gaulauf-rhineland-palatinate-03-06-2026
- Location: Rhineland-Palatinate, Germany
- Current coordinate: 49.2892155, 8.2672665
- Issues: coordinates_far_from_city
- Distance to city: 101.0 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Gosheimer Lemberglauf

- Severity: info
- Event ID: gosheimer-lemberglauf-gosheim-18-10-2026
- Location: Gosheim, Germany
- Current coordinate: 48.1363107, 8.7527322
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Gettorfer Staffelmarathon

- Severity: info
- Event ID: gettorfer-staffelmarathon-gettorf-23-08-2026
- Location: Gettorf, Germany
- Current coordinate: 54.4052957, 9.9785888
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Grafschaftslauf

- Severity: warning
- Event ID: grafschaftslauf-rietberg-30-08-2026
- Location: Rietberg, Germany
- Current coordinate: 51.97549, 11.177138
- Issues: coordinates_far_from_city
- Distance to city: 189.5 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Gölitztallauf

- Severity: warning
- Event ID: golitztallauf-landkreis-zwickau-06-09-2026
- Location: Landkreis Zwickau, Germany
- Current coordinate: 50.5559611, 11.3363424
- Issues: coordinates_far_from_city
- Distance to city: 86.6 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### H/21 Halbmarathon

- Severity: warning
- Event ID: h-21-halbmarathon-hannover-11-10-2026
- Location: Hannover, Germany
- Current coordinate: 52.3744779, 9.7385532
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Hardtwaldlauf 2026

- Severity: warning
- Event ID: hardtwaldlauf-2026-karlsruhe-28-06-2026
- Location: Karlsruhe, Germany
- Current coordinate: 48.302571, 9.234713
- Issues: coordinates_far_from_city
- Distance to city: 99.3 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Herbstlauf Ready4Run Niederwangen

- Severity: info
- Event ID: herbstlauf-ready4run-niederwangen-wangen-im-allgau-04-10-2026
- Location: Wangen im Allgäu, Germany
- Current coordinate: 47.6856552, 9.8342247
- Issues: city_level_pin_with_precise_address
- Distance to city: 1.8 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Herbstlauf der DJK Feudenheim

- Severity: warning
- Event ID: herbstlauf-der-djk-feudenheim-mannheim-17-10-2026
- Location: Mannheim, Germany
- Current coordinate: 49.4892913, 8.4673098
- Issues: city_level_pin_with_precise_address, shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Herbstlauf

- Severity: info
- Event ID: herbstlauf-otigheim-26-09-2026
- Location: Ötigheim, Germany
- Current coordinate: 48.8874936, 8.2405486
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.3 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Hofheimer Volkslauf

- Severity: warning
- Event ID: hofheimer-volkslauf-hesse-26-09-2026
- Location: Hesse, Germany
- Current coordinate: 50.983985, 10.308904
- Issues: coordinates_far_from_city
- Distance to city: 99.2 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Hohenneuffen-Berglauf mit BW Trail

- Severity: warning
- Event ID: hohenneuffen-berglauf-mit-bw-trail-beuren-14-06-2026
- Location: Beuren, Germany
- Current coordinate: 48.57857, 9.37108
- Issues: coordinates_far_from_city
- Distance to city: 236.6 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Challenge Peguera Mallorca

- Severity: warning
- Event ID: challenge-peguera-mallorca-peguera-17-10-2026
- Location: Peguera, Spain
- Current coordinate: 39.538, 2.448
- Issues: coordinates_far_from_city
- Distance to city: 297.1 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### 32. Advent-Lauf Saarbrücken

- Severity: warning
- Event ID: 32-advent-lauf-saarbrucken-saarbrucken-29-11-2026
- Location: Saarbrücken, Germany
- Current coordinate: 49.234362, 6.996379
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### 52. Internationaler Silvesterlauf Saarbrücken

- Severity: warning
- Event ID: 52-internationaler-silvesterlauf-saarbrucken-saarbrucken-27-12-2026
- Location: Saarbrücken, Germany
- Current coordinate: 49.234362, 6.996379
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### BARMER CURREX Alsterlauf Hamburg

- Severity: warning
- Event ID: barmer-currex-alsterlauf-hamburg-hamburg-06-09-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Alstertallauf Hamburg

- Severity: warning
- Event ID: alstertallauf-hamburg-hamburg-25-10-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### fem.RUN Hannover

- Severity: warning
- Event ID: fem-run-hannover-hannover-25-09-2026
- Location: Hannover, Germany
- Current coordinate: 52.3744779, 9.7385532
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### hella hamburg halbmarathon

- Severity: warning
- Event ID: hella-hamburg-halbmarathon-hamburg-28-06-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### 100 Meilen Berlin — Mauerweglauf

- Severity: warning
- Event ID: 100-meilen-berlin-mauerweglauf-berlin-15-08-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Mittsommernachtslauf Hannover

- Severity: warning
- Event ID: mittsommernachtslauf-hannover-hannover-26-06-2026
- Location: Hannover, Germany
- Current coordinate: 52.3744779, 9.7385532
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### PSD Bank Halbmarathon Hamburg

- Severity: warning
- Event ID: psd-bank-halbmarathon-hamburg-hamburg-20-09-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Sparkassen-SAARathon

- Severity: warning
- Event ID: sparkassen-saarathon-saarbrucken-11-10-2026
- Location: Saarbrücken, Germany
- Current coordinate: 49.234362, 6.996379
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Stuttgart-Lauf

- Severity: warning
- Event ID: stuttgart-lauf-stuttgart-21-06-2026
- Location: Stuttgart, Germany
- Current coordinate: 48.7784485, 9.1800132
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### LA-Hamburg TogetHHer Silvesterlauf

- Severity: warning
- Event ID: la-hamburg-togethher-silvesterlauf-hamburg-31-12-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### UNO Urban Cross Lauf

- Severity: warning
- Event ID: uno-urban-cross-lauf-saarbrucken-04-10-2026
- Location: Saarbrücken, Germany
- Current coordinate: 49.234362, 6.996379
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### LKZ Firmenlauf

- Severity: warning
- Event ID: lkz-firmenlauf-ludwigsburg-17-06-2026
- Location: Ludwigsburg, Germany
- Current coordinate: 48.8953937, 9.1895147
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### 18. Mitteldeutscher Firmenteam Triathlon

- Severity: warning
- Event ID: 18-mitteldeutscher-firmenteam-triathlon-ro-bach-27-06-2026
- Location: Roßbach, Germany
- Current coordinate: 51.26, 11.91
- Issues: coordinates_far_from_city
- Distance to city: 305.2 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Erbacher Triathlon

- Severity: warning
- Event ID: erbacher-triathlon-erbach-28-06-2026
- Location: Erbach, Germany
- Current coordinate: 48.323, 9.897
- Issues: coordinates_far_from_city
- Distance to city: 159.8 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### 2. Zarrentin Triathlon

- Severity: warning
- Event ID: 2-zarrentin-triathlon-zarrentin-28-06-2026
- Location: Zarrentin, Germany
- Current coordinate: 53.546, 10.925
- Issues: coordinates_far_from_city
- Distance to city: 141.5 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Piratentriathlon Amberg

- Severity: warning
- Event ID: piratentriathlon-amberg-amberg-11-07-2026
- Location: Amberg, Germany
- Current coordinate: 49.442, 11.858
- Issues: coordinates_far_from_city
- Distance to city: 176.1 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### 35. Kratschmayer Triathlon

- Severity: warning
- Event ID: 35-kratschmayer-triathlon-waldenburg-19-07-2026
- Location: Waldenburg, Germany
- Current coordinate: 49.185, 9.624
- Issues: coordinates_far_from_city
- Distance to city: 283.7 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Fürther Schultriathlon

- Severity: warning
- Event ID: further-schultriathlon-furth-22-07-2026
- Location: Fürth, Germany
- Current coordinate: 49.478, 10.987
- Issues: coordinates_far_from_city
- Distance to city: 160.4 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Ratschings Mountain Trails

- Severity: info
- Event ID: ratschings-mountain-trails-ratschings-21-06-2026
- Location: Ratschings, Germany
- Current coordinate: 51.267923, 6.532901
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Kaiserkrone Trail Scheffau

- Severity: info
- Event ID: kaiserkrone-trail-scheffau-scheffau-am-wilden-kaiser-26-06-2026
- Location: Scheffau am Wilden Kaiser, Germany
- Current coordinate: 50.121784, 8.680719
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Xletix Challenge Tirol

- Severity: info
- Event ID: xletix-challenge-tirol-kuhtai-27-06-2026
- Location: Kühtai, Germany
- Current coordinate: 53.2497728, 10.4197721
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### SachsenTrail Breitenbrunn

- Severity: warning
- Event ID: sachsentrail-breitenbrunn-breitenbrunn-27-06-2026
- Location: Breitenbrunn, Germany
- Current coordinate: 50.456404, 12.743606
- Issues: coordinates_far_from_city
- Distance to city: 308.9 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Lungauer Tauern Krone Challenge Tamsweg

- Severity: info
- Event ID: lungauer-tauern-krone-challenge-tamsweg-tamsweg-27-06-2026
- Location: Tamsweg, Germany
- Current coordinate: 49.554866, 9.494958
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Aletsch Halbmarathon Bettmeralp

- Severity: info
- Event ID: aletsch-halbmarathon-bettmeralp-bettmeralp-28-06-2026
- Location: Bettmeralp, Germany
- Current coordinate: 48.751635, 9.145575
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Schwalbacher Volkslauf Lauf gegen Armut

- Severity: warning
- Event ID: schwalbacher-volkslauf-lauf-gegen-armut-schwalbach-28-06-2026
- Location: Schwalbach, Germany
- Current coordinate: 50.1497186, 8.5315695
- Issues: coordinates_far_from_city
- Distance to city: 154.8 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Eßlinger Zeitung-Lauf

- Severity: warning
- Event ID: e-linger-zeitung-lauf-esslingen-05-07-2026
- Location: Esslingen, Germany
- Current coordinate: 48.7416225, 9.3042312
- Issues: coordinates_far_from_city
- Distance to city: 239.8 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Gran Trail Courmayeur

- Severity: info
- Event ID: gran-trail-courmayeur-courmayeur-10-07-2026
- Location: Courmayeur, Germany
- Current coordinate: 52.5190043, 13.409291
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Trail Verbier St-Bernard

- Severity: info
- Event ID: trail-verbier-st-bernard-verbier-10-07-2026
- Location: Verbier, Germany
- Current coordinate: 50.5995659, 8.8793986
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Engadin Ultra Trail

- Severity: info
- Event ID: engadin-ultra-trail-samedan-17-07-2026
- Location: Samedan, Germany
- Current coordinate: 48.083493, 9.865326
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Forster Rosen-Pokal-Lauf

- Severity: warning
- Event ID: forster-rosen-pokal-lauf-forst-03-07-2026
- Location: Forst, Germany
- Current coordinate: 51.68256, 14.637928
- Issues: coordinates_far_from_city
- Distance to city: 512.5 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Stubai Ultratrail Neustift

- Severity: warning
- Event ID: stubai-ultratrail-neustift-neustift-03-07-2026
- Location: Neustift, Germany
- Current coordinate: 48.5791354, 13.1948733
- Issues: coordinates_far_from_city
- Distance to city: 107.5 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Wielemer Viertele Salem-Mittelstenweiler

- Severity: warning
- Event ID: wielemer-viertele-salem-mittelstenweiler-salem-mittelstenweiler-03-07-2026
- Location: Salem-Mittelstenweiler, Germany
- Current coordinate: 47.7502685, 9.3359655
- Issues: coordinates_far_from_city
- Distance to city: 665.1 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Drevenacker Abendlauf

- Severity: warning
- Event ID: drevenacker-abendlauf-hunxe-drevenack-03-07-2026
- Location: Hünxe-Drevenack, Germany
- Current coordinate: 51.735159, 11.587628
- Issues: coordinates_far_from_city
- Distance to city: 333.8 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Montafon Totale Trail Silvretta

- Severity: info
- Event ID: montafon-totale-trail-silvretta-schruns-04-07-2026
- Location: Schruns, Germany
- Current coordinate: 51.459378, 7.0386
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Traunsee Bergmarathon Gmunden

- Severity: info
- Event ID: traunsee-bergmarathon-gmunden-gmunden-04-07-2026
- Location: Gmunden, Germany
- Current coordinate: 48.237136, 9.934623
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Panoramalauf Rothenberg

- Severity: warning
- Event ID: panoramalauf-rothenberg-oberzent-rothenberg-05-07-2026
- Location: Oberzent-Rothenberg, Germany
- Current coordinate: 48.1364668, 11.5574673
- Issues: coordinates_far_from_city
- Distance to city: 464.4 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Stilfserjoch Stelvio Trail Run

- Severity: info
- Event ID: stilfserjoch-stelvio-trail-run-prad-am-stilfserjoch-18-07-2026
- Location: Prad am Stilfserjoch, Germany
- Current coordinate: 47.6833531, 11.7685827
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Muppberg-Trailrun Neustadt

- Severity: warning
- Event ID: muppberg-trailrun-neustadt-neustadt-19-07-2026
- Location: Neustadt, Germany
- Current coordinate: 50.3251848, 11.1273948
- Issues: coordinates_far_from_city
- Distance to city: 420.6 km
- Confidence: 0.50
- Recommended action: Review the city or pin; the current point is far from the cached city reference.

### Pitz Alpine Glacier Trail

- Severity: info
- Event ID: pitz-alpine-glacier-trail-mandarfen-31-07-2026
- Location: Mandarfen, Austria
- Current coordinate: 46.9686284, 10.8709246
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### BLN 10k - Berlin

- Severity: warning
- Event ID: bln-10k-berlin-berlin-20-06-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Hohenschönhausener Gartenlauf - Berlin

- Severity: warning
- Event ID: hohenschonhausener-gartenlauf-berlin-berlin-27-06-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Berlin Running Festival Half Marathon

- Severity: warning
- Event ID: berlin-running-festival-half-marathon-berlin-05-07-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Havellauf Berlin

- Severity: warning
- Event ID: havellauf-berlin-berlin-12-07-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Mittsommer-Lauf Berlin

- Severity: warning
- Event ID: mittsommer-lauf-berlin-berlin-19-07-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Nacht der Zehner - Hamburg

- Severity: warning
- Event ID: nacht-der-zehner-hamburg-hamburg-08-08-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Rag Hartfüssler Trail - Saarbrücken

- Severity: warning
- Event ID: rag-hartfussler-trail-saarbrucken-saarbrucken-23-08-2026
- Location: Saarbrücken, Germany
- Current coordinate: 49.234362, 6.996379
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Berliner Straßenlauf - Die Generalprobe

- Severity: warning
- Event ID: berliner-stra-enlauf-die-generalprobe-berlin-23-08-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Elbe-Triathlon Hamburg

- Severity: warning
- Event ID: elbe-triathlon-hamburg-hamburg-30-08-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### BSV Sommer-Cup - Hamburg

- Severity: warning
- Event ID: bsv-sommer-cup-hamburg-hamburg-09-09-2026
- Location: Hamburg, Germany
- Current coordinate: 53.5501721, 10.0013165
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### Kreuzberger Viertelmarathon - Berlin

- Severity: warning
- Event ID: kreuzberger-viertelmarathon-berlin-berlin-13-09-2026
- Location: Berlin, Germany
- Current coordinate: 52.5173885, 13.3951309
- Issues: shared_coordinates_multiple_places
- Distance to city: 0.0 km
- Confidence: 0.65
- Recommended action: No pin action required.

### NN Marathon Rotterdam

- Severity: info
- Event ID: nn-marathon-rotterdam-rotterdam-12-04-2026
- Location: Rotterdam, Netherlands
- Current coordinate: 51.92195, 4.47915
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Schneider Electric Marathon de Paris

- Severity: info
- Event ID: schneider-electric-marathon-de-paris-paris-12-04-2026
- Location: Paris, France
- Current coordinate: 48.8698, 2.3078
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Vodafone Prague Marathon

- Severity: info
- Event ID: vodafone-prague-marathon-prague-03-05-2026
- Location: Prague, Czech Republic
- Current coordinate: 50.0870, 14.4208
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Mozart 100 by UTMB

- Severity: info
- Event ID: mozart-100-by-utmb-salzburg-05-06-2027
- Location: Salzburg, Austria
- Current coordinate: 47.7973, 13.0478
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.1 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

### Transvulcania

- Severity: info
- Event ID: transvulcania-fuencaliente-de-la-palma-08-05-2027
- Location: Fuencaliente de La Palma, Spain
- Current coordinate: 28.4565, -17.8453
- Issues: no_cached_city_reference
- Distance to city: not available km
- Confidence: 0.82
- Recommended action: Add this city to the geocode cache during the next controlled geocoding run.

### Paderborner Osterlauf

- Severity: info
- Event ID: paderborner-osterlauf-paderborn-04-04-2026
- Location: Paderborn, Germany
- Current coordinate: 51.7209, 8.7536
- Issues: city_level_pin_with_precise_address
- Distance to city: 0.4 km
- Confidence: 0.72
- Recommended action: Geocode the precise venue/address and replace city-center pins after review.

