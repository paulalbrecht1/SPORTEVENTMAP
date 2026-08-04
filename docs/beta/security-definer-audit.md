# SECURITY DEFINER audit for the closed beta

- Audit date: 2026-08-04
- Production project: `fztupxyxvhvhtihhmtnk` (`ACTIVE_HEALTHY`, PostgreSQL 17.6.1)
- Production writes during audit: none
- Evidence: read-only `pg_proc`/ACL query and Supabase Security Advisor
- Scope: six Advisor findings reachable by `anon` or `authenticated`

## Production state before hardening

The following table records the state before any RLS, grant or function change.
No secret value and no application row data was queried.

| Schema | Function and signature | Owner | Mode | `search_path` | Effective `EXECUTE` | Internal authorization | Objects accessed | Required privilege | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `public` | `verify_event_source_cron_secret(p_secret text)` | `postgres` | `SECURITY DEFINER` | `pg_catalog, extensions, private` | `anon`, `service_role` | Possession check: SHA-256 comparison with one stored secret; no user/admin role check | `private.event_source_cron_credentials`, `extensions.digest` | Public Edge Function secret verification currently requires access before a user session exists | Keep only while the Edge Function depends on it; retain explicit `anon`/`service_role` grants, high-entropy rotated secret and rate limiting. Prefer moving verification fully into the Edge Function or a non-exposed service-only path later. Invalid-secret negative test required. |
| `public` | `enqueue_source_crawl(p_source_id uuid, p_priority integer, p_scheduled_at timestamptz, p_trigger_source text)` | `postgres` | `SECURITY DEFINER` | `pg_catalog, public, private` | `authenticated`, `service_role` | Requires JWT role `service_role` or `private.is_admin()` before parameter use | `event_sources`, `source_monitor_settings`, `source_crawl_jobs`, `private.is_admin`, `gen_random_uuid` | Admin UI and worker enqueue operations | Definer is justified by the multi-table queue write. Keep the authenticated grant only because Supabase admins also use the `authenticated` database role; retain the internal check and add a normal-user negative RPC test. |
| `public` | `reset_source_crawl_failures(p_source_id uuid)` | `postgres` | `SECURITY DEFINER` | `pg_catalog, public, private` | `authenticated`, `service_role` | Requires `private.is_admin()` before parameter use | `event_sources`, `validation_issues`, `private.is_admin`, `auth.uid` | Admin recovery workflow | Definer is justified by coordinated admin-only updates. Retain fixed path and internal check; add a normal-user negative RPC test. |
| `public` | `resolve_source_review_task(p_task_id uuid, p_status text, p_notes text)` | `postgres` | `SECURITY DEFINER` | `pg_catalog, public, private` | `authenticated`, `service_role` | Requires `private.is_admin()` before parameter/status use | `source_review_tasks`, `private.is_admin`, `auth.uid` | Admin review workflow | Definer is justified for the admin-only review update. Retain fixed path and internal check; add parameter and normal-user negative tests. |
| `public` | `retry_source_crawl_job(p_job_id uuid)` | `postgres` | `SECURITY DEFINER` | `pg_catalog, public, private` | `authenticated`, `service_role` | Requires `private.is_admin()` before parameter use | `source_crawl_jobs`, `private.is_admin` | Admin queue recovery | Definer is justified for guarded queue mutation. Retain fixed path and internal check; add a normal-user negative RPC test. |
| `public` | `run_event_validation(p_event_id bigint, p_edition_id uuid)` | `postgres` | `SECURITY DEFINER` | `pg_catalog, public, private` | `authenticated`, `service_role` | **None in production before hardening** | `run_event_validation_rules_v1`, `validation_issues`, `auth.uid` | Admin and service validation runs only | **Critical:** add an admin-or-service-role check before any function call or update, retain explicit fixed path, and prove denial for a normal user. |

All six functions use schema-qualified relations and fixed function-level
`search_path` values. No dynamic SQL was found. Five functions accept record
identifiers; four of those validate admin status before looking up or changing a
record. `run_event_validation` did not, and its nullable parameters allowed a
normal signed-in user to target all matching validation rows.

## Advisor result

The production Security Advisor reported seven warnings:

1. one anonymous `SECURITY DEFINER` warning for
   `verify_event_source_cron_secret(text)`;
2. five authenticated `SECURITY DEFINER` warnings for the remaining functions;
3. leaked-password protection disabled.

Advisor warnings for authenticated admin RPCs cannot be removed merely by
revoking `authenticated`, because application admins authenticate through that
same PostgreSQL role. The safe boundary is therefore an explicit grant plus a
mandatory server-side `private.is_admin()` check before parameter processing.
Where the service worker also calls the function, the JWT `service_role` claim
is accepted explicitly.

## Hardening decision

- Critical local fix: new migration `20260814120000` immediately after the
  current production baseline and before the held Stage-4 series adds the missing
  admin-or-service check to `run_event_validation`.
- Grant changes in production: none in this work item; production rollout needs
  a separate explicit deployment approval.
- Existing five warnings: accepted only when the negative tests pass and the
  internal authorization remains present.
- Stage 4 remains disabled and is not affected by this audit.
