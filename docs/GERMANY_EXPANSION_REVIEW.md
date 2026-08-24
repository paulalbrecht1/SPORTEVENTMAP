# Germany Expansion Review

This workflow turns the existing normalized import material into a small,
prioritized German review queue. It does not write to Supabase, does not change
`data/events.csv` and never authorizes publication.

## Run the workflow

From the repository root:

```powershell
npm run data:prepare-germany-review
```

The first step builds the ignored technical candidate table
`data/events.generated.csv`. The second step compares it with the versioned
Supabase discovery and edition exports.

Local outputs:

- `data/imports/review/germany-expansion-review.csv`
- `data/imports/review/germany-expansion-report.json`

Both outputs are ignored by Git because they are operational review material,
not Source of Truth.

## Safety and routing

Every queued row has `review_status=needs_review`. An official-looking URL is
only an automated precondition; a human must still verify organizer ownership,
date, location, distance and event identity against the official page.

Candidates are routed without publishing:

- `new_event` → `supabase_admin_event_review`
- `new_edition` → `edition_succession_candidate_review`

Existing editions, past dates, missing required fields, invalid coordinates,
non-German rows and known aggregator URLs are excluded. The queue is limited to
100 rows by default so the batch remains realistically reviewable.

To create a smaller or type-specific queue:

```powershell
npm run build-events
npm run review:germany-expansion -- --limit 25 --type new-event
```

Allowed types are `all`, `new-event` and `new-edition`. After manual review,
use the existing Admin and candidate-first edition workflows. Do not copy the
queue directly into a public table or fallback export.
