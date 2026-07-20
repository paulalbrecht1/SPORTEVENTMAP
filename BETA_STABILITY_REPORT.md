# Beta Stability Report

Date: 2026-06-25  
Build: `20260625-submit-status-v38`  
Local URL checked: `http://127.0.0.1:5500/dist/index.html`

## Automated Checks

- [x] Live server returns `20260625-submit-status-v38`
- [x] Static beta smoke test passed
- [x] Publish readiness check passed
- [x] Core dist assets return HTTP 200
- [x] `sitemap.xml` returns HTTP 200
- [x] `robots.txt` returns HTTP 200
- [x] `privacy.html` and `imprint.html` return HTTP 200
- [x] `data/events.csv` is reachable
- [x] `data/events.csv` contains 994 event rows
- [x] Current `dist` copies are synchronized:
  - `C:\Users\paulj\OneDrive\Desktop\project\dist`
  - `C:\sporteventmap\github_repository\sporteventmap-live2\dist`
  - `C:\Users\paulj\OneDrive\Desktop\SportEventMap_Zwischenspeicher\project\dist`

## Performance Checks

- [x] Supabase CDN is no longer loaded directly in the initial HTML
- [x] Supabase app code is loaded through `js/supabase-loader.js`
- [x] Old `document.write` fallbacks are removed from `index.html`
- [x] Main scripts use `defer`
- [x] `events.csv` is cached in memory after the first successful load
- [x] Offscreen sections and closed modals use `content-visibility` where supported

## Flow Checks Covered By Static/Code Review

- [x] Add Event validation has an in-form status box: `#eventSubmitStatus`
- [x] Add Event validation routes through `showEventSubmitError(...)`
- [x] Feedback submit code path exists
- [x] Favorite cloud sync hook exists
- [x] Season Planner open hook exists
- [x] Admin pending review hook exists
- [x] Analytics/event tracking is buffered by the Supabase lazy loader

## Manual Click Tests Still Required

These need visual browser interaction and should be checked manually:

- [ ] Login modal opens
- [ ] Login failure message is readable
- [ ] Register success message is readable
- [ ] Add Event validation message appears inside the Add Event modal
- [ ] Feedback modal opens and validates correctly
- [ ] Favorite heart toggles without layout jump
- [ ] Season Planner opens and countdown/timeline render
- [ ] Admin dashboard opens for admin user
- [ ] Event detail drawer opens from list and map popup
- [ ] Mobile 390px/430px: no horizontal overflow
- [ ] iPad/tablet: Season Planner calendar is not cut off

## Current Status

The build is technically ready for manual beta-flow testing. The main remaining risk is visual behavior across real devices and authenticated Supabase flows, which should be verified manually with a real admin/user session.
