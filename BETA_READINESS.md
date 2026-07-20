# Sport Event Map - Closed Beta Readiness

Target: 20-50 invited runners, trail runners and triathletes.

## Security

- [x] Closed-beta RLS migration exists.
- [x] Policies cover events, profiles, favorites, Season Planner, feedback and analytics.
- [x] Event submissions are restricted to `pending`.
- [x] Admin checks are backed by database policies.
- [x] No `service_role` key is used by browser code.
- [x] Legacy hard-coded admin email promotion was removed.
- [ ] Run `20260608_closed_beta_security.sql` in the Supabase SQL editor.
- [ ] Run `20260609_admin_workflow.sql` in the Supabase SQL editor.
- [ ] Verify RLS is enabled in Supabase Table Editor for every relevant table.
- [ ] Run all automated RLS tests successfully.
- [ ] Review SQL functions and policies once in the Supabase dashboard.

## Auth

- [x] Registration uses a configured confirmation redirect.
- [x] Password reset uses a configured redirect.
- [x] Invalid or expired auth links show a friendly message.
- [x] Logout errors are handled.
- [ ] Registration tested on the production domain.
- [ ] Login tested on the production domain.
- [ ] Logout tested on the production domain.
- [ ] Password reset tested on the production domain.
- [ ] Email confirmation tested with two email providers.
- [ ] Supabase Site URL and Redirect URLs configured.

## Core functions

- [x] CSV and approved Supabase events merge in the browser.
- [x] Invalid marker coordinates are skipped safely.
- [x] Search and filters update map and event list together.
- [x] A complete custom date range is always applied.
- [x] Favorites keep a local fallback.
- [x] Favorites and Season Planner can sync per user after migration.
- [x] Event submission validates required fields, date, URL and coordinates.
- [x] Duplicate event submissions are blocked while a request is running.
- [x] Feedback can be reviewed and assigned a status by admins.
- [x] Calendar export is tracked without blocking export.
- [ ] Complete event discovery click flow tested manually.
- [ ] Favorite survives reload with a migrated Supabase account.
- [ ] Season priority and distance survive reload.
- [ ] Admin approve/reject flow tested against migrated policies.
- [x] Admin review blocks approval when required event data is invalid.
- [x] Admin can edit registration status, review priority and status notes.
- [ ] Calendar import tested in Apple Calendar.
- [ ] Calendar import tested in Google Calendar.

## Mobile

- [x] Modal height is limited to the visible viewport.
- [x] Feedback and admin forms collapse to one column.
- [x] Core mobile controls use at least 44 px touch height.
- [x] New beta UI avoids fixed mobile widths.
- [ ] 360 px browser test completed.
- [ ] 375 px browser test completed.
- [ ] 390 px browser test completed.
- [ ] 412 px browser test completed.
- [ ] 768 px tablet test completed.
- [ ] 1280 px desktop test completed.
- [ ] Real iOS device tested.
- [ ] Real Android device tested.
- [ ] Mobile keyboard behavior tested for all forms.

## Data

- [x] Automated quality review queue is available with `npm run review:beta`.
- [x] Review priority is date, website, stale check, coordinates, duplicate, status.
- [x] Possible duplicates are flagged instead of automatically deleted.
- [x] URL, date and coordinate checks exist in the import tools.
- [ ] Review the 357 events whose coordinates currently identify a city or broad venue rather than an exact entrance/start location.
- [x] No exact duplicates in the final publish report.
- [ ] Official websites checked for all high-priority events.
- [ ] `last_checked` present for public beta events.
- [x] Backup of `data/events.csv` created before the final beta build.

## Closed beta

- [x] Beta banner is available in the map view.
- [x] Three-step first-time onboarding is available.
- [x] Onboarding can be skipped and reopened.
- [x] Structured feedback captures category, area and optional event context.
- [x] Admins can filter feedback and update review status.
- [x] Privacy-safe MVP analytics fail without blocking the app.
- [ ] Privacy and legal text reviewed for the actual beta operator.
- [ ] Known issues shared with testers.
- [ ] 20-50 invited testers selected.
- [ ] Feedback review owner and response cadence defined.

## Release gate

Do not invite testers until:

- [x] The publish-readiness check passes.
- [ ] `npm run test:rls` passes.
- [ ] all production Auth redirects work.
- [ ] one real iOS and one real Android device complete the core flows.
- [ ] event submission and admin approval work end to end.
- [ ] a CSV backup exists.
