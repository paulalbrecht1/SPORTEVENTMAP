# Sport Event Map Launch Checklist

Use this before opening the public beta to real users.

## Legal

- [ ] Replace all placeholders in `impressum.html`.
- [ ] Replace all placeholders in `privacy.html`.
- [ ] Replace all placeholders in `contact.html`.
- [ ] Replace all placeholders in `terms.html`.
- [ ] Have Impressum, Privacy Policy and Terms reviewed for your jurisdiction.
- [ ] Confirm the final contact email is working.
- [ ] Confirm event data disclaimer is visible in legal pages and event details.

## Privacy / Cookies

- [ ] Confirm no third-party marketing or advertising tracking is loaded.
- [ ] Confirm first-party beta analytics are documented in `privacy.html`.
- [ ] Confirm LocalStorage / SessionStorage usage is documented.
- [ ] Add a consent banner before launch if optional third-party tracking is added later.
- [ ] Confirm Supabase Auth and database processing are documented.
- [ ] Confirm OpenStreetMap / Leaflet map loading is documented.

## Supabase RLS

- [ ] Review `supabase/launch_security_rls.sql`.
- [ ] Run the RLS SQL in the Supabase SQL Editor only after reviewing schema names.
- [ ] Confirm RLS is enabled on `profiles`.
- [ ] Confirm RLS is enabled on `events`.
- [ ] Confirm RLS is enabled on `favorites`.
- [ ] Confirm RLS is enabled on `season_planner_events`.
- [ ] Confirm RLS is enabled on `user_feedback`.
- [ ] Confirm RLS is enabled on `analytics_events`.
- [ ] Confirm normal users cannot read another user's profile.
- [ ] Confirm normal users cannot read another user's favorites.
- [ ] Confirm normal users cannot read another user's Season Planner.
- [ ] Confirm normal users cannot approve or reject events.

## Admin Security

- [ ] Confirm admin role is set manually in Supabase and not through the frontend.
- [ ] Confirm only admins can open admin data.
- [ ] Confirm admin event updates fail for a normal user.
- [ ] Confirm feedback and analytics lists are admin-only.
- [ ] Confirm no `service_role` key appears in frontend code or `dist`.

## Mobile Testing

- [ ] Test landing page at 360 px.
- [ ] Test landing page at 390 px.
- [ ] Test map/sidebar/drawer at 360 px.
- [ ] Test event detail drawer on mobile.
- [ ] Test filter panel on mobile.
- [ ] Test Season Planner on mobile.
- [ ] Test Profile and Feedback modals on mobile.
- [ ] Test Admin dashboard on tablet width.
- [ ] Confirm no horizontal scrolling.
- [ ] Confirm touch targets are comfortable.

## Browser Testing

- [ ] Test Chrome desktop.
- [ ] Test Edge desktop.
- [ ] Test Safari / iOS if available.
- [ ] Test Android Chrome if available.
- [ ] Test private/incognito session.
- [ ] Confirm login, logout and session restore work.
- [ ] Confirm external organizer links open in a new tab.

## Data Quality

- [ ] Confirm all public events have event name, sport, date, city, country and distance.
- [ ] Confirm all public events have valid latitude and longitude.
- [ ] Confirm official websites are prioritized over aggregators.
- [ ] Confirm no obvious duplicates in `data/events.csv`.
- [ ] Confirm outdated events are marked for review or date expected.
- [ ] Confirm `last_checked` exists for newly reviewed data where possible.
- [ ] Confirm users are told official organizer websites are authoritative.

## Backup

- [ ] Back up `data/events.csv`.
- [ ] Back up Supabase schema or export relevant tables.
- [ ] Back up current publishable `dist` package.
- [ ] Keep a copy of the last known working local version.

## Analytics

- [ ] Confirm analytics table exists and RLS is active.
- [ ] Confirm app works if analytics insert fails.
- [ ] Confirm searches are tracked without sensitive data.
- [ ] Confirm event opens are tracked.
- [ ] Confirm favorites and planner actions are tracked.
- [ ] Confirm feedback submissions are visible to admins.

## Closed Beta

- [ ] Prepare a list of 20-50 beta testers.
- [ ] Ask testers to search for a real event they would consider.
- [ ] Ask testers to save at least one favorite.
- [ ] Ask testers to add at least one event to the Season Planner.
- [ ] Ask testers to report one missing or incorrect event.
- [ ] Review feedback after the first week.
- [ ] Prioritize fixes before adding major new features.

## Domain / Hosting / HTTPS

- [ ] Choose final domain.
- [ ] Configure HTTPS.
- [ ] Configure Supabase Auth Site URL.
- [ ] Configure Supabase redirect URLs for login, signup, email confirmation and password reset.
- [ ] Replace `[HOSTING PROVIDER]` in Privacy Policy.
- [ ] Confirm `SPORT_EVENT_MAP_SITE_URL` uses HTTPS for production builds.
