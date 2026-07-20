# Sport Event Map - Performance Report

Date: 2026-06-08

Scope: closed beta readiness review. No refactoring was performed in this report.

## Summary

The current app is suitable for a small closed beta with 20-50 testers. The biggest performance risks are repeated rendering, repeated Supabase reads during refresh/admin flows, and large DOM lists once the event database grows beyond the current CSV size.

## Findings

### 1. Duplicate initial event-list rendering

Location: `js/map.js`

Status: resolved for the closed beta.

`refreshEvents()` now renders through `applyFilters()` when filters are
available and otherwise renders the list once. A refresh token also prevents
an older asynchronous load from overwriting a newer one.

Impact after fix: low.

### 2. Supabase approved events are loaded on every map refresh

Location: `js/events.js`

Current flow:

- `loadEvents()` parses `data/events.csv`.
- It then queries Supabase for `events` with `status = approved`.
- Admin approve/reject and manual refreshes can trigger this again.

Impact: low to medium.

The query is small now. If many approved user-submitted events exist, repeated refreshes can add latency.

Recommendation:

- Keep current behavior for beta because it guarantees approved events appear.
- Later add a short in-memory cache or a refresh reason parameter.

### 3. Admin dashboard uses several separate count requests

Location: `js/supabase.js`

Current flow:

- Pending, approved, rejected, last-30-days and analytics counts are loaded through multiple separate Supabase count calls.

Impact: medium inside Admin only.

This does not affect normal users, but admins may see slower dashboard opening.

Recommendation:

- Accept for beta.
- Later create a Supabase view or RPC for admin dashboard summary if the admin area becomes slow.

### 4. Event list DOM can become heavy with 1,000+ events

Location: `js/events.js`

Current flow:

- Pagination limits visible items, which helps.
- Fullscreen list still creates full page controls and rerenders cards on filter changes.

Impact: low now, medium later.

Recommendation:

- Keep pagination.
- Avoid increasing page size beyond 48 cards.
- Later consider rendering only the current visible page after filtering.

### 5. MarkerCluster is the right choice, but marker refresh is full reset

Location: `js/map.js`, `js/search.js`

Current flow:

- Filtering clears marker layer.
- Filtered markers are added back.

Impact: low to medium.

MarkerCluster can handle this for the current dataset. With several thousand events, repeated full layer resets may become noticeable.

Recommendation:

- Good enough for beta.
- Later benchmark with 1,000, 2,500 and 5,000 events.

### 6. CSV parsing is client-side

Location: `js/events.js`, `data/events.csv`

Current flow:

- CSV is parsed in the browser with Papa Parse.

Impact: low now, medium once the database grows.

Recommendation:

- Keep CSV for the closed beta.
- For 1,000+ verified events, consider generating a normalized JSON file at build/import time.
- Do not migrate architecture before beta feedback confirms product value.

## Recommended Beta Monitoring

Track during beta:

- Time until first map markers appear.
- Whether mobile testers mention slow loading.
- Whether filtering feels instant enough.
- Whether users understand that favorites feed Season Planner.
- Whether admins can read Analytics and Feedback without confusion.

## Next Optimizations After Beta

1. Generate `data/events.json` from CSV during import workflow.
2. Add a lightweight data cache for approved Supabase events.
3. Group admin analytics counts into one backend view or RPC.
4. Benchmark marker filtering with 1,000+ events.
