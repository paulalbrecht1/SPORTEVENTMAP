# Sport Event Map - Known Closed-Beta Issues

Last updated: 2026-06-09

## Must Be Completed Before Inviting Testers

- Apply `supabase/migrations/20260608_closed_beta_security.sql` in the target
  Supabase project.
- Apply `supabase/migrations/20260609_admin_workflow.sql` after the baseline.
- Promote the intended admin by Auth user UUID in the SQL editor.
- Run all ten live RLS tests with two normal test users and one admin test
  user.
- Configure the final Supabase Site URL and exact redirect URLs.
- Complete the core flows on one real iOS and one real Android device.

The live anonymous audit on 9 June 2026 confirmed that approved events,
pending-event privacy, profiles, feedback and analytics are protected.
`favorites` and `season_planner_events` currently return HTTP 404 and therefore
still need the complete baseline migration.

## Data Quality

- The automated publish check passes for 427 unique events.
- Every CSV row has the expected 20 columns, required fields, a valid date,
  valid coordinate ranges, a valid HTTP(S) event URL and a supported
  registration status.
- 357 events use a city-level or broad venue address. Their coordinates are
  valid, but the exact start entrance has not yet been confirmed.
- These records remain in
  `data/imports/review/closed-beta-review-queue.csv` and must be improved
  progressively. They are not automatically deleted or merged.

## Beta Scope

- CSV remains the primary curated event source.
- Approved user submissions are loaded from Supabase and are not written back
  into the static CSV automatically.
- Analytics and feedback are intentionally minimal and must never block the
  main application when Supabase is unavailable.
- Analytics uses several Supabase count requests. It loads only when the
  Analytics tab is opened, which is acceptable for 20-50 testers. It can be
  consolidated later if admin loading becomes noticeably slow.
