# Admin Roles Setup

Use this after Supabase Auth is working and your `events` table exists.

## 1. Run The SQL

Open Supabase SQL Editor and run:

```sql
-- paste the full content of supabase/admin-roles.sql
```

The file creates:

- `public.profiles`
- `public.is_admin()`
- a trigger that creates a profile for new auth users
- RLS policies for profiles and events
- an admin promotion for `pauljosch@gmail.com`

## 2. Verify Your Admin User

Run this in Supabase SQL Editor:

```sql
select id, email, role
from public.profiles
where email = 'pauljosch@gmail.com';
```

Expected:

```text
role = admin
```

## 3. Verify Policies

```sql
select policyname, tablename
from pg_policies
where schemaname = 'public'
  and tablename in ('events', 'profiles')
order by tablename, policyname;
```

You should see policies for:

- public approved event reads
- user pending event inserts
- users reading their own submitted events
- admin event updates/deletes
- profile reads/updates

## 4. Verify Public Access Is Locked Down

Logged-out users should only be able to read approved events:

```sql
select id, status
from public.events
where status <> 'approved'
limit 5;
```

Then test from the app or REST as anon. Pending rows should not be returned.
If pending rows are still public, re-run `admin-roles.sql`; it now drops old
broad policies before recreating the locked-down policy set.

## 5. App Behavior

- Logged out users see approved CSV/Supabase events.
- Logged in users see `Add Event`.
- Admin users additionally see `Admin`.
- The Admin modal checks the role again before opening.

## 6. Geoapify Key

The key should not be committed into source files. The simplest local workflow
is to create:

```text
data/imports/private/geoapify-key.txt
```

Put only the raw key into that file. It is ignored by Git and is not loaded by
the browser app.

Then run the batch helper:

```powershell
node tools/geocode-geoapify-batch.js --input data/events.csv --out data/events.geoapify.csv --limit 1000
```
