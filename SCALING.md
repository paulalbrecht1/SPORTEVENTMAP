# Scaling Plan

## Current State

The app is currently prepared for local development and later static hosting:

- Leaflet map and event list load from `data/events.csv`
- Supabase handles Auth, profiles, submitted events and admin approval
- local import tools prepare, validate, deduplicate and geocode new event data
- `dist/` is the safe public package for later drag-and-drop hosting

## Phase 1: Prepare Locally

Goal: keep the project ready for a future public launch without exposing
private tools or keys.

- Keep Supabase RLS enabled.
- Keep `data/events.csv` curated and Germany/Europe focused.
- Use `LOCAL_PUBLISH.md` when creating a clean local public package.
- Add the final public URL to Supabase Auth URL settings only after hosting is
  actually chosen.
- Add legal pages before running ads or collecting traffic at scale.
- Track errors manually first through browser console and Supabase logs.

## Phase 2: More Data

Goal: grow from hundreds to thousands of high-quality events.

- Keep `data/events.csv` as the curated public table for now.
- Import in batches into `data/imports/normalized/`.
- Run validation, dedupe and coordinate checks before publishing.
- Prefer Germany and Europe first.
- Use official event URLs where possible, not aggregator URLs.
- Keep source notes in `description` or `data_source`.

Recommended quality gates:

- valid sport: `Running`, `Triathlon`, `Ultramarathon`
- valid `DD.MM.YYYY` date
- direct or official event URL
- city/country match coordinates
- duplicate check by name, date, city, sport and overlapping distance
- exclude clubs, kids-only races, walks, training, donations and side events

For a no-code workflow, use `NO_CODE_DATA_IMPORT.md`.

## Phase 3: Move Events To Database

CSV is good for launch, but a large global app should eventually move public
events into Supabase.

Benefits:

- faster filtering and pagination for large datasets
- admin edits without rebuilding CSV
- user-specific saved events across devices
- analytics on popular events
- easier moderation workflow

Suggested tables:

- `events`: public approved event catalogue
- `event_sources`: provider/source metadata
- `event_import_batches`: import logs and validation status
- `favorites`: user saved events
- `profiles`: user role and account metadata

## Phase 4: More Users

For more users, the key work is reliability and trust:

- email confirmation in Supabase Auth
- password reset flow
- clear privacy policy and imprint/contact page
- rate limiting or CAPTCHA for event submissions if spam appears
- error monitoring
- analytics with cookie/privacy handling
- stronger admin moderation views

## Phase 5: Advertising

Before ads:

- add privacy policy, cookie/consent handling and imprint/contact information
- add analytics only with compliant consent where required
- create enough useful public pages/content for search engines
- keep the map useful without login

Possible monetization later:

- Google AdSense or direct sponsorships
- sponsored event listings
- affiliate links for registrations only where allowed
- premium organizer dashboard
- featured placement for verified organizers

Do not start with aggressive ads. First grow traffic and data quality, then add
light monetization that does not damage trust.

## Phase 6: Technical Scale

When `events.csv` becomes too large:

- move event reads to Supabase queries
- add server-side pagination/filtering
- cache common queries
- load map markers by viewport/bounds
- cluster on the backend or by region
- generate static regional CSV/JSON chunks if staying static

Good intermediate option:

- `data/events-de.json`
- `data/events-europe.json`
- `data/events-world.json`

The frontend can load only the selected region instead of the whole world.
