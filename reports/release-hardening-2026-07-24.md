# Release hardening audit — 2026-07-24

## Scope

- Responsive landing page, Discovery and Season Planner
- Playwright E2E runner and all 21 browser tests
- Deterministic static release package
- Live Supabase migration, anonymous-access and RLS review

## Responsive implementation

The application uses fluid `clamp()` sizing and switches the major two-column layouts to a single column below the tablet/laptop boundary. The main breakpoints exercised by the E2E and layout checks are:

- Mobile: 320, 360, 375, 390, 412 and 430 px
- Tablet: 768, 820 and 1024 px
- Laptop: 1280, 1366, 1440 and 1536 px
- Desktop: 1920 and 2560 px

## Test results

- `npm run test:e2e`: 21/21 passed
- `npm run check`: passed
- `npm run prepare-package`: passed
- Static smoke test: passed
- Event detail interaction test: passed
- Anonymous live Supabase audit: passed
- Generated event detail pages: exactly 994
- Generated sitemap URLs: 1,000

Playwright artifacts are written to a unique directory below the operating-system temporary directory. This avoids OneDrive file-locking during result cleanup and keeps generated browser artifacts out of the repository.

## Supabase live audit

Project `fztupxyxvhvhtihhmtnk` was inspected through the connected Supabase project without exposing credentials.

### Confirmed

- All 16 exposed `public` tables have RLS enabled.
- Anonymous access can read approved events.
- Anonymous access cannot read pending events, profiles, favorites, season planner entries, feedback or analytics rows.
- The latest schema markers exist: `planner_details`, all ten event knowledge tables and all seven admin review workflow columns.
- An isolation test used two existing real profile identities inside a rolled-back database transaction.
- Each identity could read its own temporary favorite and season entry.
- Cross-user read, delete, update and forged-owner insert attempts were blocked.
- The transaction was rolled back, leaving no test rows behind.

### Migration drift

The connected project's migration history is empty even though the live schema contains the structures from all local migrations. The schema was therefore most likely applied manually or outside the tracked Supabase migration workflow. Before running a future automated `supabase db push`, the existing production schema must be baselined/reconciled so old migrations are not replayed against it.

### Advisor findings

The live Security Advisor reports four warnings:

1. `public.set_updated_at()` has no fixed `search_path`.
2. `public.handle_new_user()` is a `SECURITY DEFINER` function executable by `anon`.
3. The same function is executable by `authenticated`.
4. Supabase Auth leaked-password protection is disabled.

The Performance Advisor additionally reports duplicated legacy/canonical policies, two unindexed foreign keys, one duplicated analytics index and an older analytics policy that does not wrap `auth.uid()` in a scalar subquery. The duplicate policies currently preserve the intended access rules, but they should be consolidated after migration history has been baselined.

## Release contents

- Release version: `20260724-release-hardening-v75`
- Source event database: 994 events
- Generated event pages: 994
- `dist` is generated from the checked source tree and is intentionally ignored by Git.

## Remaining operator actions

- Baseline the existing live schema in Supabase migration history.
- Apply a reviewed hardening migration for the advisor findings above.
- Enable leaked-password protection in Supabase Auth settings.
- Supply dedicated test-account credentials when the full REST login test (`npm run test:rls`) should also exercise password authentication.
