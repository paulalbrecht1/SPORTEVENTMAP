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

1. Resolve the canonical event and exact edition, including their IDs and slugs.
2. Use the existing admin Knowledge editor and review workflow. Do not patch
   generated exports to bypass database review. Brand knowledge uses the stable
   event slug; edition knowledge uses its edition slug. Both share `event_brand_id`;
   only edition knowledge has `edition_id`.
3. Fill only fields actually documented for that scope and edition.
4. Add field-specific source objects with:
   - `field_path` (for example `race_day.start_time`, or comma-separated paths)
   - `source_url`
   - `source_type`
   - `source_label`
   - `last_verified`
   - `confidence_score`
   - `verification_note`
5. After review, use `npm run export:event-details` and the normal gated
   catalog/build workflow. Export reads all pages of every child table and aborts
   on failed or overlapping API pages rather than replacing a complete snapshot.
6. Check `/event/<slug>/` and the standalone edition detail route at mobile and
   desktop widths. Discovery does not load this detail payload.

## Verification Rules

- Do not guess entry fees, cutoffs, start times or participant limits.
- Race cutoffs must be race cutoffs, not withdrawal or refund deadlines.
- If data is not verified, omit the field or mark the whole event as `demo_seed`.
- `partially_verified` does not verify the entire event. Such bundles display
  only the individual fields covered by a dated official/trusted source and
  never receive an event-wide verification badge. `field_path` and source scope
  must cover the actual owning field. Unsupported fields are omitted.
- Use `official` source type only for organizer or official registration/race-guide sources.
- Generated research tasks have empty `last_checked`/`last_verified`. A successful
  fetch is recorded separately as `source_fetched_at`; a review must explicitly
  supply the actual verification date. Seed URLs have source type `unknown`.
- Routine research selects current editions. An explicitly selected historical
  edition can still be reviewed. Matching uses edition identity, never CSV or
  manifest row position; contradictory IDs stop a task merge.

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
- `event_detail_sources` (the original Knowledge citation table was renamed;
  operational crawler sources use the separate existing `event_sources` table)
- `event_faq`

Run it only after the existing closed-beta security migration is present, because it uses `private.is_admin()` for admin-only write policies.

The existing editor keeps the parent private while writing its child records.
Only the final successful write can publish the bundle. A failed save remains
private and must be completed before publication.

The 20 September 2026 read-only production audit found zero Knowledge records
and the detail foundation migration absent. The six scoped editorial pilots and
four legacy records still live in the historical versioned snapshot. Their
presence in JSON is not evidence of database ingestion or a new verification.
Deploy the existing foundation through the established migration gates before
using linked Knowledge writes in that environment.
