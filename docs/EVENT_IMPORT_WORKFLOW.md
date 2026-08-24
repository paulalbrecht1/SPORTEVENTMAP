# Controlled Event Import Workflow

Goal: grow Sport Event Map toward 1,000+ high-quality events without publishing unverified data.

## 1. Create a New Batch

Copy this template:

```text
data/imports/raw/event-batch-template.csv
```

Save the copy with a clear batch name, for example:

```text
data/imports/raw/germany-road-running-batch-01.csv
```

Recommended batch names:

- `germany-road-running-batch-01`
- `germany-trail-batch-01`
- `dach-triathlon-batch-01`
- `france-running-batch-01`
- `benelux-running-batch-01`

## 2. Required Columns

Use these columns:

```text
event_name;sport;distance;distance_category;date;city;country;latitude;longitude;official_website;registration_status;source_url;source_type;review_status;review_reason;review_note;last_checked;import_batch
```

Rules:

- `source_type` should be `official` only when the official organizer website was checked.
- `review_status` should start as `pending` or be left empty.
- `import_batch` should match the batch filename or campaign name.
- Dates use `DD.MM.YYYY`.
- No event is public until an admin approves it.

## 3. Validate a Batch

Run:

```powershell
node tools/validate-event-batch.js data/imports/raw/germany-road-running-batch-01.csv --batch germany-road-running-batch-01
```

Output:

```text
data/imports/staging/germany-road-running-batch-01.staging.csv
data/imports/review/germany-road-running-batch-01.review-report.json
```

The validator checks:

- missing event name
- missing date
- missing city/country
- missing official website
- invalid website
- missing sport
- missing distance/category
- missing coordinates
- date in the past
- source type not official
- possible duplicate against `data/events.csv` and within the batch

Events with issues are marked `needs_review`.
Clean events remain `pending`.

## 4. Admin Review

Use the Admin Dashboard:

1. Open `Submissions`.
2. Filter by `Batch`.
3. Open the official website.
4. Fix date, coordinates, registration status and notes.
5. Approve, reject, archive or mark as duplicate.

Approved events become public.
Pending, staging and needs-review events remain admin-only.

## 5. Publishing Rule

Do not copy staging rows directly into `data/events.csv` or into public
Supabase tables.

Only after review:

1. Update existing event series instead of duplicating annual races.
2. Import only approved rows into Supabase `events` and `event_editions`.
3. Keep the official organizer and registration URLs separate and current.
4. Keep `last_checked`, source and review notes up to date.
5. Refresh the versioned CSV/JSON fallbacks with
   `npm run data:export-fallback`; never edit Supabase and the exports
   independently.

## 6. Launch Target

The Admin Dashboard tracks:

- approved events
- missing events to 1,000
- pending events
- needs-review events
- possible duplicates
- missing websites
- missing coordinates
- events by sport/country/batch

Quality wins over volume.
