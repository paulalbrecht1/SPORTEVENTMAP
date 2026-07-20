# Closed-Beta Implementation Report

Date: 2026-06-08

## Analysed Starting Point

- Static HTML/CSS/Vanilla JavaScript application.
- Leaflet, MarkerCluster and Papa Parse load from CDN.
- Curated CSV events are merged with approved Supabase submissions.
- Auth, event submissions, feedback, analytics and admin review already use
  Supabase.
- Favorites and Season Planner had a localStorage fallback but no complete
  per-user database schema in the connected project.
- Existing admin visibility was based on the profile role in the UI, while the
  database policies needed a single authoritative security baseline.

## Implemented

- Additive Supabase migration with RLS for profiles, events, favorites,
  Season Planner, analytics and feedback.
- Database-backed admin authorization through `private.is_admin()`.
- Column privileges prevent browser clients from assigning admin roles.
- Pending-only event submissions for normal authenticated users.
- Ten live RLS/role tests plus a read-only anonymous access audit.
- Environment-driven production runtime configuration and Auth redirects.
- Friendly Auth, network, submission and persistence errors.
- Loading states that prevent duplicate form submissions.
- Per-user Supabase synchronization for favorites and Season Planner, with the
  existing local fallback retained.
- Structured beta feedback with category, product area, status and internal
  admin notes.
- Admin feedback filters and a prioritized event-quality review queue.
- Custom date range correction, stale refresh protection and duplicate initial
  list-render prevention.
- Mobile modal constraints, viewport-safe scrolling and 44 px touch targets.
- Three-step onboarding that can be skipped and reopened.
- Stronger CSV checks for physical column count, URLs, dates, coordinates,
  statuses and duplicates.

## Changed Files

- `index.html`
- `css/style.css`
- `js/app.js`
- `js/config.js`
- `js/events.js`
- `js/map.js`
- `js/search.js`
- `js/supabase.js`
- `data/events.csv`
- `package.json`
- `tools/check-publish-readiness.js`
- `tools/create-beta-review-queue.js`
- `tools/create-publish-package.js`
- `tools/event-table-utils.js`
- `supabase/admin-roles.sql`
- `supabase/security-audit.sql`
- `supabase/migrations/20260608_closed_beta_security.sql`
- `tests/README.md`
- `tests/rls-security.test.mjs`
- `tests/static-beta-smoke.test.mjs`
- `tests/live-anon-access-audit.mjs`
- `DEPLOYMENT_CHECKLIST.md`
- `BETA_READINESS.md`
- `KNOWN_ISSUES.md`
- `PERFORMANCE_REPORT.md`
- `SECURITY.md`
- `TESTER_FEEDBACK.md`

Generated or refreshed:

- `dist/`
- `data/imports/review/events.before-closed-beta.csv`
- `data/imports/review/closed-beta-review-queue.csv`
- `data/imports/review/closed-beta-review-report.json`

## Test Results

Passed:

- JavaScript syntax checks for every changed script.
- Static beta smoke test.
- Publish-readiness and secret scan.
- 427-event CSV validation.
- No likely duplicate events.
- Exactly 20 CSV columns per physical row.
- Local HTTP responses for app, CSS, CSV and legal pages.
- Anonymous approved-event read.
- Anonymous isolation for pending events, profiles, feedback and analytics.

Not yet passed:

- Live favorites and Season Planner checks return HTTP 404 because the new
  tables are not present in the connected Supabase project.
- Authenticated cross-user and admin RLS tests require two normal test users,
  one admin test user and the applied migration.
- Real mobile and production-domain Auth flows still require manual testing.

## Data Corrections

- Fixed malformed CSV fields for Böckstiegellauf, Crosslauf Fichtenau, Future
  Run and Taubertal 100.
- Corrected Fichtenau coordinates to the Storchenweiher venue.
- Corrected Future Run coordinates to the Buxtehude venue.
- Improved the Böckstiegellauf location to Peter auf'm Berge.
- Removed the duplicate older Generali Berliner Halbmarathon record and kept
  the more complete official organizer record.

## Manual Release Gates

1. Apply `supabase/migrations/20260608_closed_beta_security.sql`.
2. Promote the intended admin by Auth user UUID.
3. Run `supabase/security-audit.sql`.
4. Run `npm run audit:anon` until all checks pass.
5. Create two normal test users and one admin test user.
6. Run `npm run test:rls` and require 10/10 passing.
7. Configure the final Site URL and exact Auth redirect URLs.
8. Test registration, confirmation, login, logout and password reset on the
   final HTTPS origin.
9. Complete the core flows on a real iOS and Android device.
10. Review the outstanding coordinate-precision queue progressively.
