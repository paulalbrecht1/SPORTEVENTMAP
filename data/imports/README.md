# Event Data Import Workflow

The app stays CSV-first. `data/events.csv` is the final source that Leaflet loads.
New data should not be copied into `data/events.csv` directly. Use the controlled
batch workflow first, then approve events through Admin review.

## Folder Layout

- `data/imports/raw/`: untouched provider exports or downloaded CSV files.
- `data/imports/staging/`: validated batch files that are not public yet.
- `data/imports/normalized/`: provider data converted into the app CSV format.
- `data/imports/review/`: rows that need manual cleanup before publishing.
- `data/events.csv`: final published event table used by the map.

## Controlled Batch Workflow

1. Copy `data/imports/raw/event-batch-template.csv`.
2. Rename it with a batch name, e.g. `germany-road-running-batch-01.csv`.
3. Fill only official, reviewable event data.
4. Validate it:

```powershell
node tools/validate-event-batch.js data/imports/raw/germany-road-running-batch-01.csv --batch germany-road-running-batch-01
```

Output:

- `data/imports/staging/germany-road-running-batch-01.staging.csv`
- `data/imports/review/germany-road-running-batch-01.review-report.json`

The staging output uses these columns:

```csv
event_name;sport;distance;distance_category;date;city;country;latitude;longitude;official_website;registration_status;source_url;source_type;review_status;review_reason;review_note;last_checked;import_batch
```

Only admin-approved events should be copied or synced into the public event
database. Keep `pending`, `staging` and `needs_review` rows out of the public map.

See `EVENT_IMPORT_WORKFLOW.md` for the step-by-step launch workflow.

## App CSV Format

```csv
event_name;sport;date;city;country;address;latitude;longitude;distance;description;event_url;data_source;source_url;verification_status;priority;check_frequency;last_checked;next_check;source_note;image
```

Allowed sport values for the current app filters:

- `Running`
- `Triathlon`
- `Ultramarathon`

Dates should use `DD.MM.YYYY`.

## Import A Provider CSV

Put an export file into `data/imports/raw/`, then normalize it:

```powershell
node tools/import-ahotu-csv.js data/imports/raw/ahotu.csv --out data/imports/normalized/ahotu.normalized.csv
```

This importer is intentionally generic and maps common column names into the app format.

## Import RunSignup

RunSignup can return upcoming public races through its official races endpoint. API credentials can be set, but public listings may also work without them depending on access.

```powershell
$env:RUNSIGNUP_API_KEY="your-runsignup-api-key"
node tools/import-runsignup.js --start-date 2026-01-01 --end-date 2027-12-31 --country US --max-pages 5
```

If your RunSignup account requires a secret, set `RUNSIGNUP_API_SECRET` in your
local terminal or deployment secrets. Do not write the real value into project
files.

Output:

```text
data/imports/normalized/runsignup.normalized.csv
```

## Import World Triathlon

World Triathlon needs an API key.

```powershell
$env:WORLD_TRIATHLON_API_KEY="your-key"
node tools/import-world-triathlon.js --start-date 2026-01-01 --end-date 2027-12-31
```

Output:

```text
data/imports/normalized/world-triathlon.normalized.csv
```

## Import Europe / Germany Running Events

`marathon.de` lists European and German running events with title, date,
distance and location. The importer reads the public listing pages in small
batches and writes the app CSV format.

```powershell
node tools/import-marathon-de.js --region europe --limit 100 --start-date 2026-05-26 --resolve-official-urls
```

Output:

```text
data/imports/normalized/marathon-de.normalized.csv
```

## Import Local German Running Events

`Kilometerliebe` is used as a discovery source for German local running
events. The importer keeps only real running, marathon, trail and ultra events
with an official external event website. It excludes clubs, walking entries,
training groups, kids-only side events, virtual-only events and entries without
an official URL.

```powershell
node tools/import-kilometerliebe.js --limit 180
node tools/geocode-geoapify-batch.js --input data/imports/normalized/kilometerliebe-2026.normalized.csv --out data/imports/normalized/kilometerliebe-2026.geoapify.csv --limit 180
node tools/build-event-table.js --no-default-imports data/events.csv data/imports/normalized/kilometerliebe-2026.geoapify.csv --out data/events.local-running.generated.csv --review-out data/imports/review/events.local-running.review.csv --excluded-out data/imports/review/events.local-running.excluded.csv --report data/imports/review/events-local-running-report.json
node tools/review-official-urls.js data/events.local-running.generated.csv --out data/imports/review/events-local-running-url-review.csv
```

Only copy `data/events.local-running.generated.csv` to `data/events.csv` when
the report has `review_events: 0`, `missing_coordinates: 0` and the URL review
has no rows.

## Build The Final Event Table

Dry run into a generated file:

```powershell
node tools/build-event-table.js
```

This reads `data/events.csv` plus all CSV files in `data/imports/normalized/`, deduplicates rows, validates them, and writes:

- `data/events.generated.csv`
- `data/imports/review/events.review.csv`
- `data/imports/review/events-report.json`

The JSON report includes:

- `total_rows`
- `valid_rows`
- `duplicate_rows`
- `missing_coordinates`
- `invalid_dates`
- `review_events`
- `excluded_events`

You can also turn the latest JSON report into a small local HTML dashboard:

```powershell
node tools/create-import-report-html.js data/imports/review/events-report.json --out data/imports/review/events-report.html
```

Publish directly to the app CSV:

```powershell
node tools/build-event-table.js --publish
```

Optional geocoding for missing coordinates:

```powershell
node tools/build-event-table.js --geocode --geocode-limit 50 --geocode-cache data/imports/geocoding-cache.json
```

The public Nominatim service should only be used for small, one-time imports:
single thread, at most one request per second, a clear User-Agent and local
caching. The import pipeline stores geocoding results in
`data/imports/geocoding-cache.json` so repeated builds do not ask for the same
location again.

For larger imports, use a batch geocoding provider or a self-hosted geocoder
instead of bulk-loading the public Nominatim service. A Geoapify batch helper is
available for up to 1000 addresses per batch:

```powershell
node tools/geocode-geoapify-batch.js --input data/events.csv --out data/events.geoapify.csv --limit 1000
```

The Geoapify helper also reads `data/imports/private/geoapify-key.txt`, which
is ignored by Git. Put only the raw key into that file when working locally.

Review the generated file first, then copy it to `data/events.csv` if the
coordinates look correct.
