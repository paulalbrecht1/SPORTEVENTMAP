# Sport Event Map - Closed Beta Readiness

Target: 20-50 invited runners, trail runners and triathletes.

Last verified: 2026-07-25 (`20260725-closed-beta-gate-v77`)

## Automated release gate

- [x] All nine Supabase migrations are applied locally and in the linked production project.
- [x] RLS is enabled for every public table and the local 10/10 RLS/Auth suite passes.
- [x] Legacy duplicate policies, duplicate indexes and public helper functions are removed.
- [x] Supabase database security and performance advisors report no findings.
- [x] The anonymous production audit protects pending events, profiles, favorites, Season Planner, feedback and analytics.
- [x] Static, layout, browser and event-detail checks pass for 994 validated events.
- [x] Community links are removed from the primary product navigation for the closed beta.
- [x] A CSV backup exists and the generated `dist` package contains only public release assets.
- [ ] Enable leaked-password protection in the signed-in Supabase Auth dashboard (Pro plan or higher).

## Production Auth and account flows

- [x] Registration and password-reset code uses configured confirmation redirects.
- [x] Invalid or expired auth links show a friendly message.
- [x] Logout failures are handled without silently leaving stale UI state.
- [ ] Confirm final Supabase Site URL and exact production redirect URLs.
- [ ] Test registration, email confirmation, login, logout and session restore on the final HTTPS domain.
- [ ] Test password reset on the final HTTPS domain.
- [ ] Test confirmation and reset emails with two email providers.
- [ ] Run `npm run test:rls` with two dedicated production users and one production admin.

## Core product flows

- [x] Discovery search, filters, map, event list and event detail are covered by browser tests.
- [x] CSV and approved Supabase events merge without exposing pending submissions.
- [x] Favorites retain a local fallback and can synchronize per authenticated user.
- [x] Season Planner data is scoped per authenticated user.
- [x] Event submissions validate required fields, date, URL and coordinates and are forced to `pending`.
- [x] Feedback and privacy-safe analytics fail without blocking Discovery.
- [x] Admin policies protect event review, feedback and analytics.
- [ ] Verify favorite persistence and Season Planner persistence with a real production account.
- [ ] Complete a production event submission and admin approve/reject flow end to end.
- [ ] Test calendar export/import in Apple Calendar and Google Calendar.

## Mobile and browsers

- [x] Automated viewport and layout audits cover 360, 375, 390, 412, 768 and 1280 px.
- [x] Core mobile controls use at least 44 px touch height.
- [x] Modal height is limited to the visible viewport and forms collapse to one column.
- [ ] Complete the core flows on one real iOS device.
- [ ] Complete the core flows on one real Android device.
- [ ] Test virtual-keyboard behavior for login, registration, feedback and event submission.
- [ ] Run a final production smoke test in Chrome, Edge and Safari/iOS.

## Data quality

- [x] The publish-readiness check passes for 994 unique events.
- [x] Required fields, dates, coordinate ranges, URLs and registration statuses are validated.
- [x] No exact duplicates remain in the publish report.
- [x] The review queue is generated with `npm run review:beta`.
- [ ] Improve the 357 city-level or broad-venue coordinates progressively.
- [ ] Verify official websites for all high-priority events.
- [ ] Add `last_checked` to every newly verified public-beta event.

## Closed-beta operations

- [x] First-time onboarding, a beta notice and structured feedback are available.
- [x] The release evidence is documented in `reports/closed-beta-gate-2026-07-25.md`.
- [ ] Replace legal placeholders with the actual operator, hosting and contact details.
- [ ] Have Impressum, privacy policy and terms reviewed for the actual operator.
- [ ] Share `KNOWN_ISSUES.md` with testers.
- [ ] Select 20-50 invited testers and define a feedback owner and review cadence.

## Invitation gate

Do not invite testers until every unchecked item in Production Auth, real-device testing,
the production submission/admin flow and legal operator details has been completed.
