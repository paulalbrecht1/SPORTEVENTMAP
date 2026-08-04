# Supabase migration baseline audit

Date: 2026-07-25
Scope: production schema inventory, local migration chain, RLS readiness
Production changes during this audit: migration-history records only; no schema
or application data changes

## Outcome

The production application schema exists and the Sport Event Map can continue
to operate. At the beginning of the audit, the production migration history was
empty. The local migration chain also depended on a `public.events` table that
was never created by versioned SQL.

The repository now contains an initial historical migration for that table.
Static comparison against the production schema reports all eight migrations as
present and no longer reports an external application-schema prerequisite. The
eight verified versions are now registered in production migration history, and
the final linked dry-run reports the remote database as up to date.

## Captured production schema

The read-only schema inventory is stored in
`reports/supabase-schema-baseline-2026-07-24.json`. It contains no application
row data, passwords, access tokens, or API secrets.

Inventory totals:

- 16 application tables
- 253 columns
- 47 constraints
- 46 indexes
- 6 captured functions
- 14 application triggers plus the `auth.users` profile trigger
- 66 RLS policies
- 271 table grants
- 9 routine grants

Production currently runs PostgreSQL 17.6. The local configuration therefore
uses PostgreSQL major version 17.

## Migration comparison

| Version | Migration | Expected objects found in production |
| --- | --- | ---: |
| 20260607 | Initial events baseline | 18 / 18 |
| 20260608 | Closed beta security | 139 / 139 |
| 20260609 | Admin workflow | 10 / 10 |
| 20260616 | Admin review workflow | 11 / 11 |
| 20260617 | Import/source-type fix | 3 / 3 |
| 20260619 | Analytics dashboard v2 | 11 / 11 |
| 20260630 | Event detail knowledge base | 211 / 211 |
| 20260707 | Season planner details | 1 / 1 |

Result of `npm run audit:supabase-baseline`:

- 8 complete migrations
- 0 incomplete migrations
- 0 external application-schema prerequisites
- reproducible from an empty application schema: yes (static verification)

## Production-only drift

The live database contains 24 older snake-case policies in addition to the
human-readable policies in the migration files. This produces 20 groups with
multiple permissive policies. The duplicate policies are not copied into the
new baseline; they remain documented production drift and should be removed in
a separate, tested cleanup migration.

Current security advisor warnings:

1. `public.set_updated_at()` has a mutable `search_path`.
2. `public.handle_new_user()` is a `SECURITY DEFINER` function executable by
   `anon`.
3. The same function is executable by `authenticated`.
4. Supabase leaked-password protection is disabled.

The warnings were present before this work and were not changed as part of the
migration-history baseline.

## Local environment

Installed:

- Podman Desktop 1.28.3
- Podman Engine 5.8.3
- Supabase CLI 2.109.1, pinned in `package.json` and `package-lock.json`
- Windows Subsystem for Linux feature
- Windows Virtual Machine Platform feature

After the required Windows restart, the `sporteventmap` Podman machine was
created with 4 CPUs, 4 GB RAM and a 40 GB disk. The local Supabase services are
bound to `127.0.0.1` on Windows and are not exposed to the LAN.

Local Supabase configuration is stored in `supabase/config.toml`. It starts only
the services required for database, REST and Auth testing. Local test credentials
are read at runtime and are never committed.

## Local verification completed

- `node --check tests/local-rls-security.test.mjs`
- `node --check tools/audit-supabase-migration-baseline.mjs`
- `npm run supabase:start`
- `npm run supabase:reset`: all eight migrations applied from an empty database
- local schema check: 8 migrations, 16 public tables, 32 `events` columns and
  RLS enabled on every public table
- `npm run test:rls:local`: 10 / 10 Auth and RLS tests passed with temporary
  user A, user B and admin accounts; the accounts were deleted afterwards
- `npx supabase db advisors --local --type all --level info --fail-on error`:
  completed without errors; remaining warnings are documented non-blockers
- `npm run audit:supabase-baseline`
- `npm run test:static`
- `npm run check`: launch readiness passed
- `npm run test:e2e`: 21 / 21 Chromium and mobile Chromium tests passed
- `npm run audit:layout`: passed with 0 warnings
- `npm run audit:anon`: approved events remained public; pending events and
  every tested user-data table remained private
- production RLS transaction with two existing non-admin profiles: own read and
  delete passed, cross-user read and delete returned zero rows, and the entire
  transaction was rolled back
- `git diff --check`
- production migration list checked again: empty
- production security and performance advisors checked again

## Production-history synchronization completed

After every local gate passed, the history-only production synchronization was
completed:

1. The CLI was authenticated and linked to project `fztupxyxvhvhtihhmtnk`.
2. `migration list --linked` confirmed that the remote history was empty.
3. The pre-repair `db push --linked --dry-run` listed exactly the eight local
   migrations and did not execute them.
4. The eight verified versions were registered as already applied with
   `migration repair --status applied`; this updates migration tracking only
   and does not execute migration SQL.
5. The final migration list shows all eight local and remote versions aligned.
6. The final `db push --linked --dry-run` reports `Remote database is up to
   date.`
7. The post-repair anonymous-access audit passed.
8. The post-repair RLS transaction with two existing profiles passed and was
   rolled back.
9. Production advisors report 0 errors. The 4 security warnings and existing
   performance warnings remain unchanged and are documented above as separate
   cleanup work.

`supabase db reset --linked` must never be used against production.
