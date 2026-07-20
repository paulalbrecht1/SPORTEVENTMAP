# Security Notes

## Public Browser Keys

`js/config.js` contains the local Supabase URL and public client key. The file
is intentionally ignored by Git and must be created from
`js/config.example.js` after cloning. A publishable key is preferred for the
production build. Database safety must still come from Row Level Security
policies because browser clients cannot keep runtime credentials secret.

Never put these values into browser-loaded files:

- Supabase service role key
- Geoapify key
- RunSignup secret
- World Triathlon API key
- private import exports with credentials

## Supabase Access Rules

Run `supabase/launch_security_rls.sql` in the Supabase SQL editor before a
public beta launch. The older `supabase/migrations/20260608_closed_beta_security.sql`
contains the closed-beta baseline and is retained for history; `launch_security_rls.sql`
is the current reviewable launch hardening file. `supabase/admin-roles.sql` is
retained only as a legacy baseline.

Expected rules:

- visitors can read only `status = 'approved'` events
- logged-in users can insert only their own `status = 'pending'` events
- logged-in users can read their own submissions
- admins can approve, reject, update and delete events
- visitors cannot read `profiles`
- logged-in users can read only their own profile unless they are admins
- normal users cannot change `profiles.role`
- favorites and Season Planner rows are restricted by `user_id = auth.uid()`
- feedback and analytics are not readable by normal users
- only database-confirmed admins can read admin datasets

Profile security is enforced by Supabase Row Level Security, not just by hidden
frontend buttons. The Profile button only reveals data that the current
Supabase session is already allowed to read.

Admin promotion is a manual database operation by immutable Auth user UUID.
The browser has no permission to update the `role` column.

## Automated RLS Tests

After applying the migration, create two normal test accounts and one admin
test account. Follow `tests/README.md`, then run:

```powershell
npm run test:rls
```

The tests verify anonymous access, cross-user isolation, pending submissions,
admin review and role-escalation protection.

The read-only anonymous audit needs no user credentials:

```powershell
npm run audit:anon
```

It must show approved events as public and zero visible rows (or HTTP 401/403)
for pending events, profiles, favorites, Season Planner rows, feedback and
analytics. An HTTP 404 means the security migration has not created the
required table yet.

## Local Import Secrets

Put the Geoapify key into:

```text
data/imports/private/geoapify-key.txt
```

That file is ignored by Git and is only used by local Node import tools.

## Before Sharing Or Deploying

Run:

```powershell
node tools/check-publish-readiness.js
```

Fix any failed checks before sending the project or deploying it.

Before committing, also enable the repository's versioned hook once:

```powershell
git config core.hooksPath .githooks
```

The hook blocks common token formats, private key markers and known local
secret paths. Always review the staged diff as well; automated scanning is an
additional safeguard, not a guarantee.
