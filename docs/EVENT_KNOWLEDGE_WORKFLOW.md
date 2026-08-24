# Event Knowledge Base Workflow

Sport Event Map now supports a richer event-detail data layer for SEO event guide pages.

## Current Data Flow

1. `data/events.csv`
   - Versioned public fallback exported from Supabase and used as a generator
     input for map, search, filters and basic detail pages.

2. `data/event-category-details.json`
   - Category-level data such as fees, registration status, start time, cutoff and elevation.
   - Only verified race cutoff values should be stored in cutoff fields.
   - Registration or withdrawal deadlines must stay in deadline fields.

3. `data/event-knowledge.json`
   - Legacy rich detail blocks used as a fallback.

4. `data/event-detail-database.json`
   - New structured knowledge base for richer event guide pages.
   - Preferred source for detailed sections when an event slug exists in this file.

5. `tools/generate-event-pages.js`
   - Generates all `/event/<slug>/` pages.
   - Uses the new structured data first, then falls back to legacy knowledge and CSV data.

## How To Add Rich Data For An Event

1. Find the event slug in `data/event-pages.json`.
2. Add an entry to `data/event-detail-database.json`.
3. Fill only fields that are known or clearly documented.
4. Add at least one source object with:
   - `source_url`
   - `source_type`
   - `source_label`
   - `last_verified`
   - `confidence_score`
   - `verification_note`
5. Run:
   `node tools/generate-event-pages.js`
6. Open the generated page:
   `/event/<slug>/`

## Verification Rules

- Do not guess entry fees, cutoffs, start times or participant limits.
- Race cutoffs must be race cutoffs, not withdrawal or refund deadlines.
- If data is not verified, omit the field or mark the whole event as `demo_seed`.
- Use `partially_verified` only when at least one official source supports the shown data.
- Use `official` source type only for organizer or official registration/race-guide sources.

## Supabase Migration

The database structure is prepared in:

`supabase/migrations/20260630_event_detail_knowledge_base.sql`

It creates normalized tables for:

- `event_details`
- `event_registration`
- `event_course`
- `event_race_day`
- `event_travel`
- `event_weather`
- `event_statistics`
- `event_editorial`
- `event_sources`
- `event_faq`

Run it only after the existing closed-beta security migration is present, because it uses `private.is_admin()` for admin-only write policies.

## Admin UI Next Step

The next practical admin feature should be a focused “Event Knowledge” editor:

- Pick event by slug/name.
- Edit sections one at a time.
- Add source per section or field.
- Show verification status.
- Preview generated detail page before publishing.
- Set `is_public = true` only after review.
