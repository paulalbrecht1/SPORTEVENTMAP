# Sport Event Map - Launch Checklist

Use this before inviting closed-beta testers. Automated checks marked complete were
last verified for `20260725-closed-beta-gate-v77` on 2026-07-25.

## Automated release and database gate

- [x] Run `npm run test:gate`.
- [x] Run `npm run test:event-detail`.
- [x] Generate the public package with `npm run prepare-package`.
- [x] Apply and align all nine Supabase migrations.
- [x] Confirm RLS on every public table.
- [x] Confirm the database security and performance advisors have no findings.
- [x] Confirm anonymous production access cannot read private user or pending-event data.
- [x] Confirm no `service_role` or secret key appears in frontend code or `dist`.
- [ ] Enable leaked-password protection in the signed-in Supabase Auth dashboard.

## Production Auth and admin security

- [ ] Configure the final HTTPS Site URL and exact Auth redirect URLs.
- [ ] Test registration and email confirmation on the production domain.
- [ ] Test login, logout, session restore and password reset on the production domain.
- [ ] Test Auth emails with two providers.
- [ ] Run `npm run test:rls` with two normal production users and one admin.
- [ ] Confirm admin assignment is performed by Auth UUID, never by frontend email logic.
- [ ] Complete event submission, approval and rejection end to end.
- [ ] Confirm normal users cannot read admin feedback or analytics lists.

## Mobile and browsers

- [x] Run automated viewport/layout checks at 360, 375, 390, 412, 768 and 1280 px.
- [ ] Test the core flow on one real iOS device.
- [ ] Test the core flow on one real Android device.
- [ ] Test virtual keyboards in login, registration, feedback and event submission forms.
- [ ] Smoke-test Chrome, Edge, Safari/iOS and a private/incognito session on production.
- [ ] Confirm external organizer links open safely in a new tab.

## Data quality and backups

- [x] Validate 994 public events and confirm no exact duplicates.
- [x] Back up `data/events.csv`.
- [x] Generate the closed-beta review queue.
- [ ] Improve the 357 city-level or broad-venue coordinates progressively.
- [ ] Verify official websites for all high-priority events.
- [ ] Confirm newly reviewed public events include `last_checked`.
- [ ] Export or back up the production Supabase schema and relevant tables.
- [ ] Keep the previous known-good `dist` release.

## Legal and privacy

- [ ] Replace every placeholder in `impressum.html`, `privacy.html`, `contact.html` and `terms.html`.
- [ ] Add the actual hosting provider, operator address and working contact email.
- [ ] Confirm Supabase Auth, first-party analytics, storage and OpenStreetMap/Leaflet use are documented.
- [ ] Confirm the organizer-data disclaimer is visible.
- [ ] Obtain legal review for the actual operator and jurisdiction.
- [ ] Add consent handling before any optional marketing or advertising tracker is introduced.

## Closed-beta operations

- [ ] Select 20-50 invited testers.
- [ ] Share `KNOWN_ISSUES.md` and the supported feedback channel.
- [ ] Ask each tester to search, compare, favorite and plan a real event.
- [ ] Ask testers to report one missing or incorrect event.
- [ ] Assign a feedback owner and a fixed review cadence.
- [ ] Fix gate-blocking defects before adding broader product scope.
