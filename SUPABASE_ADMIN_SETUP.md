# Supabase Admin Setup

This project currently needs the complete closed-beta database migration.
The live anonymous audit on 9 June 2026 found that `favorites` and
`season_planner_events` do not yet exist.

## 1. Run the closed-beta migration

1. Open your Supabase project.
2. Select **SQL Editor** in the left navigation.
3. Click **New query**.
4. Open this local project file:
   `supabase/migrations/20260608_closed_beta_security.sql`
5. Copy the complete file, from the first comment through the final admin
   example.
6. Paste it into the Supabase query.
7. Click **Run**.
8. Wait for **Success. No rows returned**.

This migration is additive. It does not delete event data. It creates or
updates:

- `profiles`
- `events`
- `favorites`
- `season_planner_events`
- `analytics_events`
- `user_feedback`
- the database-backed admin role check
- all required RLS policies

Do not run the migration only partially. The `begin;` and `commit;` lines must
both be included.

## 2. Run the admin workflow upgrade

Run the complete file:

`supabase/migrations/20260609_admin_workflow.sql`

This adds the review fields used by the Admin Dashboard:

- `registration_status`
- `status_note`
- `last_checked`
- `review_priority`
- `needs_review`
- `reviewed_at`
- `reviewed_by`

The file is safe to rerun because every column and index uses
`if not exists`.

## 3. Assign your admin role

1. Open **Authentication > Users** in Supabase.
2. Find your admin account.
3. Copy its UUID from the user row.
4. Open a new SQL query.
5. Replace the placeholder below with that UUID and run it:

```sql
update public.profiles
set role = 'admin',
    updated_at = now()
where id = 'REPLACE_WITH_ADMIN_AUTH_USER_UUID';
```

Verify the result:

```sql
select id, email, role
from public.profiles
where id = 'REPLACE_WITH_ADMIN_AUTH_USER_UUID';
```

The result must show `role = admin`.

## 4. Verify tables and RLS

Run the complete file:

`supabase/security-audit.sql`

In the first result table, these six tables must exist and show
`rls_enabled = true`:

- `analytics_events`
- `events`
- `favorites`
- `profiles`
- `season_planner_events`
- `user_feedback`

The final result table must include the Admin Dashboard review columns for the
`events` table.

## 5. Refresh the web app

1. Log out of Sport Event Map.
2. Reload the page.
3. Log in again with the admin account.
4. Open **Admin**.
5. Press **Refresh dashboard**.

The database status row should show every module as **Ready**. The Submissions,
Feedback and Analytics tabs should load without access errors.

## 6. Optional automated checks

The read-only anonymous audit requires no test passwords:

```powershell
npm run audit:anon
```

For the full role test, create two normal test users and one admin test user,
then follow `tests/README.md` and run:

```powershell
npm run test:rls
```

All ten RLS tests should pass before a closed beta.
