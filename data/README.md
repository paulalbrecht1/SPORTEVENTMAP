# Event catalog files

`events.csv` is a versioned, read-only browser fallback and deployment export.
`event-editions-public.json` is the matching public archive. Supabase `events`
plus `event_editions` are the source of truth after catalog import
`ba56e423-f4c2-4e6b-8c41-b3ca98641652`.

Do not edit the CSV and Supabase independently. Normal changes go through the
admin review workflow in Supabase. Refresh the fallback explicitly with:

```bash
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... npm run data:refresh-public
```

The exporter evaluates the fetched row counts, baseline deltas, freshness and
completeness against `catalog-release-policy.json` before writing any file. An
unhealthy Supabase snapshot therefore cannot partially replace the fallback,
event pages or sitemap. `--allow-unhealthy` exists only for an explicitly
reviewed diagnostic snapshot and is not part of the normal release workflow.

The refresh regenerates the fallback, archive, event pages and sitemap. Always
review the complete diff and run the full test gate before publishing. A failed
gate must be fixed in Supabase; do not weaken the policy or edit generated CSV
rows independently.

`reference/natural-earth-50m-admin-0-countries.geojson` is the public-domain
Natural Earth 1:50m Admin 0 source used by
`tools/build-country-boundaries-migration.js`.
