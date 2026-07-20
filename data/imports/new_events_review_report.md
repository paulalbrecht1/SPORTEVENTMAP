# New Events Review Report

Date: 05.06.2026  
Scope: Europe-first quality review for high-value running, trail/ultra and triathlon events.

## Summary

- Checked candidate events: 30
- Written to `new_events_review.csv`: 18
- Import-ready events: 12
- Needs-review events: 6
- Existing duplicates found and not re-added: 12
- Events with missing date: 0
- Events with date expected / date needs confirmation: 2
- Events with unclear status: 3
- Events with missing official website: 0

## Quality Rules Applied

- Final event URL must point to the official organizer or official race website.
- Aggregators such as marathon.de, Ahotu, World's Marathons, Racecheck and Finishers were not used as final URLs.
- Events already present in `data/events.csv` were not duplicated.
- If current status or date could not be confirmed clearly enough, `needs_review=true` and `import_ready=false`.
- Coordinates are set to the best available public start/venue/city location found during review. Exact street-level precision should still be improved when official start/finish addresses are available.

## Import-Ready Events

1. Estra Firenze Marathon
2. Wizz Air Milano Marathon
3. adidas Stockholm Marathon
4. EDP Porto Marathon
5. EDP Lisbon Marathon
6. Valencia Half Marathon Trinidad Alfonso Zurich
7. Generali Berlin Half Marathon
8. HOKA UTMB Mont-Blanc
9. IRONMAN Copenhagen
10. Challenge Almere-Amsterdam
11. Challenge Peguera Mallorca
12. Challenge Kaiserwinkl-Walchsee

## Needs Review Before Final Import

1. Copenhagen Half Marathon
   - Reason: official/host information confirms date, but current entry status was not clearly confirmed.

2. Goteborgsvarvet
   - Reason: 2027 date found on official FAQ, but registration status needs direct manual confirmation.

3. Eiger Ultra Trail by UTMB
   - Reason: registration status confirmed as sold out, but final event date should be checked against the official event schedule before import.

4. La Sportiva Lavaredo Ultra Trail by UTMB
   - Reason: official event week found, but current entry status needs manual confirmation.

5. IRONMAN Kalmar Sweden
   - Reason: registration status confirmed as sold out, but final race date should be checked against the official race page before import.

6. IRONMAN Calella-Barcelona
   - Reason: official deadline PDF confirms race day, but current public registration status needs direct manual confirmation.

## Existing Duplicates / Update Instead Of Add

These events already exist in `data/events.csv` and were not added again:

- BMW Berlin Marathon
- Generali Köln Marathon
- Mainova Frankfurt Marathon
- TCS Amsterdam Marathon
- Valencia Marathon Trinidad Alfonso Zurich
- ADAC Marathon Hannover
- uniper Marathon Düsseldorf
- Marathon München by Brooks
- Vienna City Marathon
- IRONMAN Hamburg European Championship
- IRONMAN Frankfurt
- Challenge Roth
- IRONMAN Kaernten-Klagenfurt Austria

If these are updated later, update the existing row instead of adding a second event.

## Source Notes

The review used official race websites wherever possible:

- Firenze Marathon official marathon and regulation pages
- Milano Marathon official website and official rules
- Stockholm Marathon official website
- Porto Marathon official marathon and registration pages
- Lisbon Marathon official website and official rules PDF
- Valencia Ciudad del Running official half marathon pages
- SCC Events / Generali Berlin Half Marathon official website
- UTMB official event websites
- IRONMAN official race pages
- Challenge Family / official Challenge event websites

## Recommended Next Step

Do not import all rows blindly.

Recommended workflow:

1. Import only `import_ready=true` rows.
2. For `needs_review=true` rows, manually open the official `source_url`.
3. Confirm exact date, entry status and best start/venue address.
4. Improve coordinates if a street-level start/finish address is published.
5. Then merge into `data/events.csv` using duplicate key:
   `event_name + date + city`

## Import Completed

Date: 05.06.2026

Imported into `data/events.csv`: 12 events

Imported rows:

1. Estra Firenze Marathon
2. Wizz Air Milano Marathon
3. adidas Stockholm Marathon
4. EDP Porto Marathon
5. EDP Lisbon Marathon
6. Valencia Half Marathon Trinidad Alfonso Zurich
7. Generali Berlin Half Marathon
8. HOKA UTMB Mont-Blanc
9. IRONMAN Copenhagen
10. Challenge Almere-Amsterdam
11. Challenge Peguera Mallorca
12. Challenge Kaiserwinkl-Walchsee

Kept in review, not imported yet:

1. Copenhagen Half Marathon
2. Goteborgsvarvet
3. Eiger Ultra Trail by UTMB
4. La Sportiva Lavaredo Ultra Trail by UTMB
5. IRONMAN Kalmar Sweden
6. IRONMAN Calella-Barcelona

Final `events.csv` row count after import: 428

Validation after import:

- Missing event names in imported rows: 0
- Missing dates in imported rows: 0
- Missing official URLs in imported rows: 0
- Missing coordinates in imported rows: 0
- Broken encoding markers in `events.csv`: 0
- Exact duplicates among imported rows: 0
