# Europe Major Marathons Recovery Review

Last checked: 03.06.2026

This review file restores the major European marathon candidates into a controlled import workflow. It does **not** automatically publish all events into `data/events.csv`.

## Summary

- Checked events: 37
- Import-ready/update-ready after this pass: 9
- Rows with missing confirmed date: 16
- Rows with unclear registration/status: 13
- Possible duplicates in `data/events.csv`: 7
- Rows requiring manual review before publication: 28

## Import Status

Imported/updated in `data/events.csv` on 03.06.2026:

- BMW Berlin Marathon
- Valencia Marathon Trinidad Alfonso Zurich
- TCS Amsterdam Marathon
- Vienna City Marathon
- DNB Oslo Marathon
- Haspa Marathon Hamburg
- Mainova Frankfurt Marathon
- Generali Koeln Marathon
- ADAC Marathon Hannover

Hannover was deduplicated into one official-name row: `ADAC Marathon Hannover`.

## Files

- Review CSV: `data/imports/europe_major_marathons_recovery.csv`
- Main event CSV: `data/events.csv`

## Import Rules

Only import or update an event in `data/events.csv` when these fields are present:

- official event name
- date or `verification_status=date_expected`
- official event URL, not marathon.de/Ahotu/WorldsMarathons as `event_url`
- city and country
- coordinates
- marathon distance / 42.195 km
- one UI-compatible status:
  - `registration_open`
  - `registration_not_open`
  - `sold_out`
  - `cancelled`
  - `date_expected`
  - `unclear`

If a row is marked as `duplicate_candidate=yes`, update the existing row instead of appending a second event.

## Update-Ready Duplicate Candidates

These should be treated as update-only records:

- BMW Berlin Marathon
- Vienna City Marathon
- Haspa Marathon Hamburg
- Mainova Frankfurt Marathon
- Generali Köln Marathon
- ADAC Marathon Hannover / Hannover Marathon

## Manual Review Needed

Rows with `needs_review=true` must be checked on the official website before import:

- TCS London Marathon
- Schneider Electric Marathon de Paris
- Zurich Marató Barcelona
- NN Marathon Rotterdam
- Acea Run Rome The Marathon
- Firenze Marathon
- Wizz Air Milano Marathon
- Zurich Marathon
- Copenhagen Marathon
- adidas Stockholm Marathon
- Helsinki City Marathon
- Irish Life Dublin Marathon
- Edinburgh Marathon Festival
- adidas Manchester Marathon
- Generali Munich Marathon
- Düsseldorf Marathon
- Prague International Marathon
- SPAR Budapest Marathon
- Warsaw Marathon
- Cracovia Marathon
- EDP Lisbon Marathon
- Porto Marathon
- Zurich Rock 'n' Roll Running Series Madrid
- Zurich Maratón de Sevilla
- Zurich Maratón Málaga
- Athens Authentic Marathon
- Türkiye İş Bankası Istanbul Marathon
- Volkswagen Ljubljana Marathon

## Notes From Official Checks

- BMW Berlin Marathon: official page confirms 27.09.2026; lottery registration for the marathon was already closed.
- Valencia Marathon: official registration page shows a 2026 ballot process and sold-out signal.
- TCS Amsterdam Marathon: official FAQ says 2026 registration opens on 20.12.2025 and closes on 05.10.2026 unless sold out.
- DNB Oslo Marathon: official distances page confirms 12.09.2026 and shows Marathon sold out.
- Irish Life Dublin Marathon: official FAQ confirms 25.10.2026 and start line, but registration status still needs direct confirmation.
- Haspa Marathon Hamburg: official race info confirms 25.04.2027 and start/finish at Karolinenstraße / Hamburg Messe.

## Next Step

Run a manual review pass over the `needs_review=true` rows. For each row:

1. Open the official `event_url`.
2. Confirm next date and registration status.
3. Update `verification_status`, boolean status flags, `status_label`, and `status_note`.
4. If the event already exists, update the existing `data/events.csv` row.
5. If the event is new and all minimum criteria are met, append it to `data/events.csv`.
