# No-Code Event Data Workflow

This workflow is for adding event data without coding.

## What Scaling Means

Scaling means the app can handle more of everything without becoming messy or
slow:

- more events
- more countries
- more users
- more submitted events
- more admin review work
- more traffic from search engines or ads

The safe workflow starts with a spreadsheet, validates it locally and publishes
only reviewed rows to Supabase. The repository CSV is then refreshed as a
versioned fallback; it is not edited as a second production database.

## The Table Format

Use this exact column order:

```csv
event_name;sport;date;city;country;address;latitude;longitude;distance;description;event_url;data_source;image
```

Required fields:

- `event_name`
- `sport`
- `date`
- `city`
- `country`
- `distance`
- `event_url`

Recommended sport values:

- `Running`
- `Triathlon`
- `Ultramarathon`

Date format:

- `DD.MM.YYYY`

## How To Do This Without Code

1. Open Excel, Google Sheets or Numbers.
2. Create columns with the exact names above.
3. Add one event per row.
4. Use only real race events, not clubs, training groups, walks, donations or
   kids-only side events.
5. Save/export as CSV with semicolon separator if possible.
6. Put the file into:

```text
data/imports/raw/
```

7. Ask Codex to import this file into the app format.

You do not need to run scripts yourself. Codex can run the validation,
deduplication and geocoding after you place the file there.

## If You Only Have A Website List

Use this manual approach:

1. Open the event website.
2. Copy event name, date, city, country, distance and official event URL into a
   spreadsheet.
3. Leave latitude/longitude empty.
4. Add the source website in `data_source`.
5. Export as CSV.

Then Codex can geocode and validate it.

## Current Production Workflow

For larger Germany/Europe imports, use this simple handoff:

1. Put every raw spreadsheet or downloaded CSV into `data/imports/raw/`.
2. Tell Codex which file should be imported.
3. Codex normalizes the file into `data/imports/normalized/`.
4. Codex geocodes missing coordinates with Geoapify in small cached batches.
5. Codex builds a generated table and writes a report into `data/imports/review/`.
6. Only rows that pass validation, deduplication and coordinate checks enter
   the Supabase admin review and approval flow.
7. After approval, Codex refreshes `data/events.csv` and
   `data/event-editions-public.json` from Supabase.

The live app reads the published Supabase catalog and falls back to
`data/events.csv` if necessary. Do not paste provider data directly into the
fallback file.

## What To Review Manually

Before publishing a bigger batch, check:

- `data/imports/review/events-local-running-expanded-report.html`
- `data/imports/review/events-local-running-expanded-url-review.csv`
- `data/imports/review/events.local-running-expanded.review.csv`

If the review CSV is empty and the publish check passes, the batch is ready for
Supabase Admin review.

## Quality Rules

Keep:

- 5K, 10K, half marathon, marathon
- trail/ultra races
- real triathlon, duathlon or aquathlon events
- official event pages

Exclude:

- run clubs
- membership pages
- training programs
- donation pages
- spectator tickets
- pacer-only signups
- kids-only races
- pure walks
- virtual-only events unless you intentionally want them

## Recurring Status Checks

Before a bigger public update, run the official-page status workflow:

```powershell
npm run status-check
```

This checks the official event URLs and writes:

- `data/events.status-checked.csv`
- `data/imports/review/events.status-review.csv`
- `data/imports/review/events.status-report.json`

Important: do not publish `events.status-checked.csv` automatically. Review the
report first, especially rows marked as:

- `sold_out`
- `date_needs_confirmation`
- `missing_registration_signal`
- `unreachable_url`

Only promote reviewed rows through Supabase; then refresh the fallback export.

## Best Next Data Goal

Start with Germany and Europe:

- city marathons
- half marathons
- official triathlon calendars
- ultra/trail race calendars
- regional race calendars with official URLs

Do not start worldwide until the Germany/Europe data quality is strong.

## Recommended Data Sources

Current priority order:

1. Official federation calendars, especially the Deutsche Triathlon Union
   calendar for German triathlon events.
2. Official organizer websites for major running events.
3. Regional running calendars, but only if each row can be resolved to the
   official event website.
4. Ultra/trail calendars for Europe, followed by manual URL verification.

The current local running workflow uses `tools/import-kilometerliebe.js` for a
controlled Germany-first batch. It imports only rows with official external
event URLs, then geocodes, deduplicates and validates them before anything is
submitted for approval.

Avoid importing US provider data into the main CSV. The product focus is
Germany first, then Europe.

Before publishing a source, run:

```powershell
node tools/review-official-urls.js data/events.csv
```

The review must report `Review URLs: 0` before the file is considered ready.
