# Sport Event Map - Known Closed-Beta Issues

Last updated: 2026-07-25 (`20260725-closed-beta-gate-v77`)

## Must be completed before inviting testers

- Enable Supabase leaked-password protection in the signed-in Auth dashboard when the project plan supports it.
- Configure and verify the final HTTPS Site URL and exact Auth redirect URLs.
- Test registration, confirmation, login, logout and password reset on the production domain.
- Run the production credential-based RLS suite with two normal users and one admin.
- Complete event submission and admin approval/rejection with real production accounts.
- Complete the core flows on one real iOS and one real Android device.
- Replace legal placeholders and obtain review for the actual beta operator.

## Data quality

- The automated publish check passes for 994 unique events.
- All rows have the expected schema, required fields, valid dates and coordinate ranges,
  valid HTTP(S) event URLs and supported registration statuses.
- 357 events still use city-level or broad-venue coordinates. They remain visible because
  their coordinates are valid, but their exact start entrance should be improved progressively.
- Possible duplicates are flagged for review rather than deleted automatically.
- CSV remains the curated baseline; approved user submissions are loaded from Supabase and
  are not written back into the static CSV automatically.

## Closed-beta scope

- Community is intentionally absent from the primary navigation. The beta is focused on
  finding, comparing, saving and planning endurance events.
- Analytics and feedback are minimal and must never block Discovery if Supabase is unavailable.
- Exact production email delivery, real-device behavior and legal operator information cannot
  be proven by the automated release suite and remain explicit manual gates.
