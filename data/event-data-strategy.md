# Event Data Strategy

## Goal

Add more running, triathlon, and ultramarathon events without breaking the existing map, list, filter, marker cluster, and favorites logic.

## Current Sources

- `data/events.csv`: manually curated baseline events.
- Supabase `events` table: user-submitted and admin-approved events.

Both sources are merged in `js/events.js` and passed through `normalizeEvent()`.

## Recommended Next Step

Keep every external source behind an import step:

1. Fetch or export events from the provider.
2. Convert provider-specific fields into the app event format.
3. Review imported events before approval.
4. Save approved events into Supabase or append them to CSV.

Do not render third-party data directly on the map before normalization and review.

## App Event Format

Every imported event should become:

```json
{
  "event_name": "Berlin Marathon",
  "sport": "Running",
  "date": "27.09.2026",
  "city": "Berlin",
  "country": "Deutschland",
  "latitude": 52.514427,
  "longitude": 13.347967,
  "distance": "Marathon",
  "description": "BMW Berlin Marathon",
  "event_url": "https://example.com",
  "image": "https://example.com/image.jpg",
  "data_source": "Manual"
}
```

## Candidate Sources

### Ahotu

Good fit for broad endurance discovery. Ahotu lists running, triathlon, cycling, and other endurance events across many countries.

Best use:

- Manual/partner export first.
- Later API or partnership if available.
- Strong candidate for large global coverage.

### World Triathlon API

Good fit for official triathlon events.

Best use:

- Import official race calendar data.
- Normalize into `sport: "Triathlon"`.
- Use as a trusted source for higher-profile triathlon events.

Implementation status:

- Prepared as Supabase Edge Function:
  `supabase/functions/import-world-triathlon/index.ts`
- API key is kept server-side as `WORLD_TRIATHLON_API_KEY`.
- Preview mode returns normalized events without saving.
- Save mode inserts non-duplicate events as `pending`.

### RunSignup API

Good fit for running and triathlon events, especially in the United States.

Best use:

- API import for regions where RunSignup is strong.
- Store imported events as pending Supabase rows.
- Admin reviews before events become visible.

### Manual CSV / Google Sheets

Best short-term option.

Best use:

- Keep a curated spreadsheet.
- Export as semicolon CSV matching `data/events.csv`.
- Import only after basic validation.

## Implementation Plan

### Phase 1

Improve the current CSV and Supabase import with validation and duplicate detection.

### Phase 2

Add an admin-only import screen where pasted CSV/JSON can be previewed before saving.

### Phase 3

Add one external provider at a time, starting with either World Triathlon or RunSignup because both are API-oriented.

### Phase 4

Add duplicate detection using event name, date, city, country, and sport.

## Validation Rules

- Event name is required.
- Sport must be `Running`, `Triathlon`, or `Ultramarathon`.
- Date must be `DD.MM.YYYY`.
- Latitude and longitude must be valid numbers.
- Event URL must start with `http://` or `https://`.
- Imported events should default to `status: "pending"` when saved to Supabase.
