# Sport Event Map - Deployment Checklist

This checklist prepares the static HTML/CSS/JavaScript app for a real HTTPS domain.
Do not invent production URLs, operator details or credentials.

## 1. Build and verify the public package

From the project folder:

```powershell
npm run test:gate
npm run test:event-detail
npm run prepare-package
```

Upload only the generated `dist` folder. Do not upload `tools`, `tests`,
`supabase`, private imports or local credentials.

For a production build with environment-based public runtime configuration:

```powershell
$env:SPORT_EVENT_MAP_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SPORT_EVENT_MAP_SUPABASE_PUBLISHABLE_KEY="YOUR_PUBLISHABLE_KEY"
$env:SPORT_EVENT_MAP_SITE_URL="<PRODUCTION_SITE_URL>"
npm run prepare-package
```

`SPORT_EVENT_MAP_SITE_URL` must be the final HTTPS origin without a trailing slash.
The publishable key is public by design. Never use a secret or `service_role` key
in build variables or browser files.

## 2. Apply the complete database migration chain

Prefer the linked CLI workflow so production migration history stays reproducible:

```powershell
supabase migration list --linked
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
```

Review every pending migration before pushing. The v77 baseline contains nine
ordered migrations through:

`supabase/migrations/20260725_closed_beta_gate_hardening.sql`

Do not paste only the two old June migrations into a newer project. For a new
environment, apply the complete ordered chain. Then verify:

```powershell
supabase db lint --linked --level warning
npm run audit:anon
```

See `SUPABASE_ADMIN_SETUP.md` for admin assignment and verification queries.

## 3. Assign the admin role

Do not promote an admin through frontend email checks. Copy the intended user's UUID
from **Authentication > Users**, then run:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where id = 'REPLACE_WITH_AUTH_USER_UUID';
```

Verify the UUID, email and role before continuing.

## 4. Configure Supabase Auth

In **Authentication > URL Configuration**:

- Set Site URL to the final `<PRODUCTION_SITE_URL>`.
- Add the exact production `/index.html` redirect used by the app.
- Keep only local development redirects that are still used.
- Remove obsolete preview and deployment URLs.

In Auth email/password settings:

- Enable email signups and confirmation for the beta.
- Review minimum password requirements.
- Enable leaked-password protection when the project plan supports it.
- Customize confirmation and password-reset templates.
- Test delivery through two different email providers.

## 5. Run credential-based production tests

Create two normal test accounts and one admin test account as described in
`tests/README.md`, then run:

```powershell
npm run test:rls
```

All 10 tests must pass before inviting testers. Afterward, manually test registration,
email confirmation, login, logout, session restore and password reset on the final domain.

## 6. Hosting and device checks

- Force HTTPS and disable directory listing.
- Confirm `index.html`, `data/events.csv`, `sitemap.xml`, `robots.txt` and legal pages return HTTP 200.
- Confirm no private key files or source-only directories are deployed.
- Complete Discovery, favorite, Season Planner, feedback and event-detail flows.
- Complete event submission and admin approval/rejection end to end.
- Test one real iOS and one real Android device, including virtual keyboards.

## 7. Legal and operations gate

- Replace all legal placeholders with actual operator, contact and hosting details.
- Obtain legal review for the actual beta operator.
- Back up `data/events.csv`, the production schema/data and the last known-good `dist`.
- Select 20-50 invited testers and assign a feedback owner and review cadence.

Do not invite testers until every unchecked item in `BETA_READINESS.md` is either
completed or explicitly accepted by the responsible operator.
