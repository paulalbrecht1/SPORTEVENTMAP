# Event catalog files

`events.csv` is a versioned, read-only browser fallback and deployment export.
Supabase `events` plus `event_editions` are the source of truth after catalog
import `ba56e423-f4c2-4e6b-8c41-b3ca98641652`.

Do not edit the CSV and Supabase independently. Normal changes go through the
admin review workflow in Supabase. Refresh the fallback explicitly with:

```bash
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... npm run data:export-fallback
```

The export refuses to overwrite the file when fewer than 900 published rows are
returned. Always review the diff and run the full test gate before publishing.

`reference/natural-earth-50m-admin-0-countries.geojson` is the public-domain
Natural Earth 1:50m Admin 0 source used by
`tools/build-country-boundaries-migration.js`.
