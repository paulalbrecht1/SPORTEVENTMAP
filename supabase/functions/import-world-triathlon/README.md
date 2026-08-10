# Import World Triathlon Events

This Supabase Edge Function imports official World Triathlon events and converts them into the app event format.

It does not publish imported events directly. When `save: true` is used, events are inserted with `status: "pending"` so they can be reviewed in the existing admin flow.

## Required Secrets

Set these in Supabase before deployment:

```bash
supabase secrets set WORLD_TRIATHLON_API_KEY=your_world_triathlon_key
```

Supabase automatically provides:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` or the platform-provided `SUPABASE_PUBLISHABLE_KEYS`
- `SUPABASE_SECRET_KEY` or the platform-provided `SUPABASE_SECRET_KEYS`

## Deploy

```bash
supabase functions deploy import-world-triathlon
```

## Preview Import

Preview does not save anything:

```bash
curl -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/import-world-triathlon" \
  -H "Authorization: Bearer USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
    "save": false
  }'
```

## Save Import

Save inserts non-duplicate events as pending:

```bash
curl -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/import-world-triathlon" \
  -H "Authorization: Bearer USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
    "save": true
  }'
```

## Normalized Fields

World Triathlon fields are mapped to the app format:

- `event_title` -> `event_name`
- `event_venue` -> `city`
- `event_country` -> `country`
- `event_date` -> `date` as `DD.MM.YYYY`
- `event_latitude` -> `latitude`
- `event_longitude` -> `longitude`
- `event_listing` or `event_api_listing` -> `event_url`
- `sport` is always `Triathlon`
- `status` is always `pending`

## Duplicate Check

Before inserting, the function checks existing Supabase rows by:

- `event_name`
- `date`
- `city`
- `country`
- `sport`

## Notes

The function requires a logged-in user token. In a later step, the frontend admin modal can call this function from an "Import World Triathlon" button.
