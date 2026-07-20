# Closed-beta RLS tests

## Static smoke test

This test needs no Supabase credentials and checks the publishable frontend,
required UI ids, script order, CSV schema, mobile safety rules and migration
coverage:

```powershell
npm run test:static
```

## Anonymous live-access audit

This read-only check uses the public URL and anon key from `js/config.js`. It
verifies that approved events remain public while pending events, profiles,
favorites, Season Planner rows, feedback and analytics are not visible to an
anonymous browser:

```powershell
npm run audit:anon
```

These tests call the Supabase Auth and REST APIs with three real test accounts:

- a normal test user A
- a normal test user B
- an admin test user

Run them against a staging or beta Supabase project after applying
`supabase/migrations/20260608_closed_beta_security.sql`.

## Required setup

1. Create two normal users in Supabase Authentication.
2. Create one admin user.
3. Copy the admin user's UUID from Authentication > Users.
4. Promote only that UUID in the SQL editor:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where id = 'REPLACE_WITH_ADMIN_AUTH_USER_UUID';
```

5. Set the environment variables in PowerShell:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_ANON_KEY="YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY"
$env:TEST_USER_A_EMAIL="beta-a@example.com"
$env:TEST_USER_A_PASSWORD="TEST_PASSWORD"
$env:TEST_USER_B_EMAIL="beta-b@example.com"
$env:TEST_USER_B_PASSWORD="TEST_PASSWORD"
$env:TEST_ADMIN_EMAIL="admin@example.com"
$env:TEST_ADMIN_PASSWORD="TEST_PASSWORD"
npm run test:rls
```

The script creates temporary rows prefixed with `[RLS TEST]` and removes them
when the run completes. Do not use production user passwords.
