# Sport Event Map - Deployment Checklist

This checklist prepares the static HTML/CSS/JavaScript app for a real domain.
Replace placeholders only after a hosting URL is known.

## 1. Build the public package

Use Node.js in the project folder:

```powershell
npm run check
npm run prepare-package
```

Only upload the generated `dist` folder. Do not upload `tools`, `tests`,
`supabase`, private import files, or local API keys.

For a production build with environment-based public runtime configuration:

```powershell
$env:SPORT_EVENT_MAP_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SPORT_EVENT_MAP_SUPABASE_PUBLIC_KEY="YOUR_PUBLISHABLE_KEY"
$env:SPORT_EVENT_MAP_SITE_URL="<PRODUCTION_SITE_URL>"
npm run prepare-package
```

`SPORT_EVENT_MAP_SITE_URL` must be the final HTTPS origin without a trailing
slash, for example `https://example.com`. Do not enter a guessed domain.

The Supabase publishable key is public by design. The build still accepts the
legacy `SPORT_EVENT_MAP_SUPABASE_ANON_KEY` variable for the current project,
but a new publishable key is preferred before production. Never use a secret
or `service_role` key in these variables or in browser files.

## 2. Apply the database migration

1. Open Supabase.
2. Select the project.
3. Open **SQL Editor**.
4. Click **New query**.
5. Open
   `supabase/migrations/20260608_closed_beta_security.sql`.
6. Paste the complete file into the editor.
7. Click **Run**.
8. Confirm that the query finishes without an error.

The migration is additive. It enables RLS and creates/updates:

- `profiles`
- `events`
- `favorites`
- `season_planner_events`
- `analytics_events`
- `user_feedback`

Then run the complete additive admin workflow upgrade:

`supabase/migrations/20260609_admin_workflow.sql`

For exact click-by-click instructions and verification queries, see
`SUPABASE_ADMIN_SETUP.md`.

## 3. Assign the admin role

Do not promote an admin by frontend email checks.

1. Open **Authentication > Users**.
2. Copy the intended admin user's UUID.
3. Run:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where id = 'REPLACE_WITH_AUTH_USER_UUID';
```

4. Verify:

```sql
select id, email, role
from public.profiles
where id = 'REPLACE_WITH_AUTH_USER_UUID';
```

## 4. Configure Supabase Auth URLs

Open **Authentication > URL Configuration**.

Set:

- **Site URL**: `<PRODUCTION_SITE_URL>`

Add exact redirect URLs used by the app:

- `<PRODUCTION_SITE_URL>/index.html`
- `http://127.0.0.1:5500/index.html`
- `http://localhost:4173/index.html`

Remove obsolete deployment URLs before release. Keep only URLs that are
actually used for local development or production.

The app uses the configured site URL for:

- registration email confirmation
- login return flow
- password reset
- expired/invalid auth-link fallback

## 5. Configure email authentication

In **Authentication > Providers > Email**:

- enable email signups
- enable email confirmation for the beta
- review password minimum requirements
- customize confirmation and password-reset email templates
- test delivery to at least two different email providers

## 6. Run RLS tests

Create two normal test accounts and one admin test account. Follow
`tests/README.md`, then run:

```powershell
npm run test:rls
```

All 10 tests must pass before inviting beta users.

## 7. Hosting checks

- Upload only `dist`.
- Force HTTPS.
- Confirm `index.html` opens at the production origin.
- Confirm `data/events.csv` returns HTTP 200.
- Confirm Leaflet, MarkerCluster, Papa Parse and Supabase CDN scripts load.
- Confirm `privacy.html`, `impressum.html` and `contact.html` open.
- Confirm no directory listing is enabled.
- Confirm no private key files are present in the deployed files.

## 8. Auth click test on production

1. Register a new beta account.
2. Confirm the email.
3. Verify the redirect returns to the production app.
4. Log out.
5. Log in again.
6. Request a password reset.
7. Open the reset link.
8. Set a new password in Profile.
9. Open an old reset link and confirm a friendly expiry message appears.

## 9. Final release command

Run immediately before uploading:

```powershell
npm run check
npm run review:beta
npm run prepare-package
```

Keep a local backup of `data/events.csv` before every data import.
