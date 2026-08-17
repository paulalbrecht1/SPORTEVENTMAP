# Production migration review and deployment plan

- Review date: 2026-08-17
- Production baseline: 36 migrations, including the separately deployed
  `20260817121601_data_quality_stabilization.sql`
- Exact pending set: ten migrations from
  `20260814120000_beta_security_definer_hardening.sql` through
  `20260822_stage_four_observation_queue_lint.sql`
- Held Stage-4 series: `20260815` through `20260822` (eight migrations)
- Production deployment during this review: **none**
- Stage-4 state to preserve: `dry_run=true`, `automation_enabled=false`,
  `observation_enabled=false`, `observation_scheduler_enabled=false`

The new closed-beta security fix
`20260814120000_beta_security_definer_hardening.sql` is intentionally ordered
between the production baseline and this held series. It can be reviewed and
deployed separately; it must not be used as a reason to roll out Stage 4.

## Migration-by-migration review

### `20260817121601_data_quality_stabilization.sql` (already deployed)

- Purpose: fix Source-Recovery semantics, enforce disabled Edition-Lifecycle
  publication, expose reproducible quality/source-failure metrics, add stale
  current editions to the existing deduplicated P0–P3 inbox and require
  field-level evidence for content confirmation.
- Data changes at deployment: sets `auto_publish_enabled=false` and
  `auto_result_publish_enabled=false`; it does not alter public event facts.
- Safety: a reachable URL can only move an edition to `needs_review`. Content
  confirmation accepts only exact equality for all required fields and records
  `automatic_fact_changes=false`.
- RLS/grants: both new views use `security_invoker`; inbox output is additionally
  guarded by `private.is_admin()`. The audit helper is in the non-exposed
  `private` schema and checks the authenticated admin internally.
- Dependencies: the 35 production baseline migrations through `20260814`.
- Stage-4 risk: none; this migration precedes but does not activate the held
  Stage-4 series. It should be deployed and observed separately.

### `20260815_source_monitor_extraction_review.sql`

- Purpose: Stage-3 field extraction proposals and transactional manual review;
  no proposal is published automatically.
- Tables/columns: adds 17 proposal fields to `event_change_proposals`, including
  `crawl_id`, field/raw/normalized/applied values, method/version/evidence,
  confidence reasons, warnings, priority, rejection/defer metadata and lock
  state. Creates `event_field_controls` for per-event/edition overrides, locks,
  source priority, expiry and admin attribution.
- Functions/triggers: proposal ingestion, field-control management, proposal
  review/apply; parent guard and `updated_at` triggers.
- RLS/grants: RLS enabled on `event_field_controls`; authenticated table grants
  are constrained by admin policies; worker ingestion is service-role-only;
  review/apply RPCs are authenticated but perform internal admin checks.
- Indexes: three proposal review/crawl/domain indexes and three field-control
  unique/active indexes.
- Dependencies: existing proposal/source/crawl/event/edition/audit/validation
  objects through `20260814`.
- Locks/runtime: `ALTER TABLE event_change_proposals`, one legacy-row backfill,
  constraint replacement and non-concurrent index builds can block proposal
  writes. On the current small operations dataset this should be seconds, but
  runtime must be measured on a production-sized clone; abort if lock wait or
  statement time exceeds the deployment limit.
- Data migration: classifies/backfills concrete legacy proposal rows; does not
  change public event facts.
- Compatibility: additive for the deployed worker v12 (`source-monitor-3.1.0`).
  The repository worker `4.1.0-phase-a-shadow` requires this migration.
- Rollback: prefer forward fix. Before worker v4 writes the new fields, the new
  table/indexes/functions can be dropped and old proposal constraints restored;
  afterward, preserve proposal evidence and restore from logical backup if
  necessary.
- Event-data risk/Stage 4: medium operational risk due to the manual apply RPC,
  low automatic-publication risk. Foundation for Stage 4, but still human review.

### `20260816_stage_four_preparation.sql`

- Purpose: create the inert Stage-4 control plane, shadow policy engine,
  reliability, controlled discovery, duplicate/geocoding queues, quality
  snapshots and bulk previews.
- Tables: creates 16 internal tables: settings, country/scope/policy controls,
  reliability/decisions, discovery sources/candidates, duplicates,
  geocoding cache/jobs, daily usage, quality snapshots, bulk operations/items
  and append-only audit log. Key columns cover kill switches, phase, budgets,
  confidence/reliability, decision reasons, idempotency fingerprints, audit
  actors and timestamps.
- Functions/triggers/view: 11 helper/RPC functions, seven `updated_at` triggers
  and `stage_four_country_dashboard`.
- RLS/grants: RLS on all 16 tables; admin policies for authenticated users;
  worker grants only where required. Audit-log update/delete/truncate is revoked
  from service role. Public/anon function execution is revoked.
- Indexes: reliability lookup, decision queue, discovery review, duplicate and
  geocoding idempotency, country-quality history.
- Dependencies: migration `20260815`, existing operations schema and
  `private.is_admin()`.
- Locks/runtime: almost entirely new-object DDL plus seed inserts. Expected
  seconds; existing public event tables are not rewritten.
- Data migration: inserts singleton settings, DE/AT/CH rollouts and policy seeds.
  Defaults force `automation_enabled=false`, `dry_run=true`, zero AI budget,
  geocoding disabled and AT/CH disabled.
- Compatibility: deployed worker v12 ignores the additive schema. Latest worker
  uses these RPCs only after its later deployment.
- Rollback: forward-fix preferred; before use, drop Stage-4 objects in reverse
  dependency order. After observations exist, export internal tables first.
- Event-data risk/Stage 4: low while flags/constraints remain inert; live bulk
  execution is deliberately unavailable.

### `20260817_stage_four_monitoring_guards.sql`

- Purpose: count crawler usage, tighten audit-log service grants and produce
  compact internal anomaly monitoring.
- Tables/columns/indexes/RLS: no new tables, columns, indexes or policies.
- Functions/grants: replaces `record_stage_four_crawl_automation` and
  `refresh_stage_four_monitoring`; worker-only recording and admin/service
  refresh. Audit log remains append-only for service role.
- Dependencies: all `20260816` Stage-4 tables plus Source Monitor results/alerts.
- Locks/runtime: short function replacement/ACL locks; no table rewrite.
- Data migration: none at deployment; metrics/alerts change only when invoked.
- Compatibility: additive and safe for worker v12; used by worker v4.
- Rollback: restore prior function definitions and ACLs from `20260816`.
- Event-data risk/Stage 4: very low; monitoring-only.

### `20260818_stage_four_germany_observation.sql`

- Purpose: Phase-A German shadow observations with manual review, golden cases
  and theoretical Phase-B readiness; explicitly cannot publish mutations.
- Existing columns: adds observation flags/country/version/targets/heartbeat to
  `stage_four_settings`; error/conflict/volume guards to scope controls; and
  shadow/effect/prerequisite/block/parser/policy fields to decisions.
- New tables: seven internal tables for pilot sources, observation runs,
  observations, reviews, golden cases, readiness criteria and snapshots.
- Functions/view: country/block helpers; state/bind/status/enqueue/stop/resume;
  shadow recording, review, golden promotion, metrics/reliability/readiness and
  monitoring; `stage_four_phase_a_dashboard`.
- RLS/grants: RLS on all seven tables; authenticated grants remain bounded by
  admin policies/internal checks; worker recording is service-role-only; anon
  execution revoked.
- Indexes: 11 queue, idempotency, review, evaluation, blocked, regression and
  latest-snapshot indexes.
- Dependencies: `20260816`/`17`, Source Monitor queue/results, proposal engine,
  workflow alerts and audit log.
- Locks/runtime: alters only newly introduced Stage-4 tables if deployed in the
  documented sequence, then creates empty tables/indexes. Expected seconds.
- Data migration: reasserts safe global/country state, inserts readiness criteria
  and 12 inert, unbound German pilot profiles. No crawl is scheduled.
- Compatibility: database must precede worker v4. Deployed v12 remains valid.
- Rollback: export observations/reviews/golden cases, then drop Phase-A objects
  and restore Stage-4 definitions; no public event rollback should be needed.
- Event-data risk/Stage 4: low only if all four flags remain false. Constraints
  enforce `dry_run=true`, `automation_enabled=false` and
  `actually_executed=false`.

### `20260819_stage_four_observation_calibration_guards.sql`

- Purpose: add explicit DE/AT/CH country kill switches and calculate quality
  only from manually reviewed proposal observations.
- Objects: one scope-control seed/upsert; replaces observation metrics and
  Phase-B readiness functions; no tables, columns, triggers, policies or indexes.
- Grants: authenticated/service access only with internal authorization.
- Dependencies: Phase-A tables/criteria from `20260818`.
- Locks/runtime: short upsert and function/ACL locks; expected sub-second to a
  few seconds.
- Compatibility/rollback: worker-neutral; restore `20260818` function versions
  and remove only the added seed rows if unused.
- Event-data risk/Stage 4: very low; stricter calibration and kill switches.

### `20260820_stage_four_observation_operational_alerts.sql`

- Purpose: enforce canonical source binding and expand internal anomaly signals.
- Objects: replaces pilot-binding and observation-monitoring functions; no new
  schema objects.
- Grants: bind is authenticated/admin-checked; monitoring is
  authenticated/service with internal actor check.
- Dependencies: canonical `event_sources`, DE event context, Stage-4 alerts.
- Locks/runtime/data: function/ACL replacement only; data changes occur only
  when an authorized function is later called.
- Compatibility/rollback: worker-neutral; restore `20260818` definitions.
- Event-data risk/Stage 4: very low; tighter source association.

### `20260821_stage_four_observation_lint_fixes.sql`

- Purpose: Phase-A-owned lint/security cleanup without changing behaviour.
- Objects: replaces automation evaluation and observation monitoring functions;
  fully qualified access and existing fixed search paths are retained. No table,
  column, trigger, policy or index change.
- Grants: public/anon removed; authenticated/service retained because admins use
  the authenticated database role and internal actor checks run first.
- Dependencies: Stage-4 policy/decision/monitoring objects through `20260820`.
- Locks/runtime/data: short function/ACL locks; no deployment-time data change.
- Compatibility/rollback: latest worker expects equivalent signatures; restore
  prior definitions if needed.
- Event-data risk/Stage 4: very low; shadow decisions remain non-executing.

### `20260822_stage_four_observation_queue_lint.sql`

- Purpose: remove unused queue variables without changing Phase-A behaviour.
- Objects: replaces enqueue/resume observation-run functions only; no new
  tables, columns, triggers, policies or indexes.
- Grants: enqueue is authenticated/service with actor check; resume is
  authenticated/admin-only; public/anon revoked.
- Dependencies: Phase-A pilot/run tables and existing source queue.
- Locks/runtime/data: short function/ACL locks; rows change only on later admin
  calls.
- Compatibility/rollback: same RPC signatures; restore `20260818` definitions.
- Event-data risk/Stage 4: very low; scheduler remains disabled.

## Deployment plan

### 1. Prerequisites

1. Obtain a separate written deployment approval. This document is not approval.
2. Deploy and verify `20260814120000` independently first if the closed-beta
   security blocker is being removed.
3. Confirm production still lists exactly the 36 reviewed baseline migrations,
   including `20260817121601`; investigate any drift before continuing. In
   particular preserve the applied timestamped `20260812...` migration versions
   and the separately applied data-quality version rather than inventing
   replacement history.
4. Run a fresh local reset, RLS suite, Stage-4 tests and full `test:all` from the
   exact commit to deploy.
5. Freeze Source Monitor/admin proposal writes for the short deployment window;
   do not pause public Discovery reads.
6. Record counts/checksums for `events`, `event_editions`,
   `event_change_proposals`, open review items and Source Monitor queues.
7. Confirm no Stage-4 table already exists unexpectedly.
8. Keep Edge Function v12 deployed during database migration. Do not deploy
   worker v4 first.

### 2. Backup and recovery strategy

The project is on Supabase Free. Official documentation recommends Free projects
take their own logical exports; downloadable scheduled backups and PITR are not
a reliable prerequisite on this plan.

Before deployment:

- create a timestamped logical schema dump and data dump with `supabase db dump`
  or `pg_dump` over SSL;
- separately export the affected internal tables and critical public event IDs,
  statuses and timestamps;
- store dumps outside the repository with restricted access and verify they are
  non-empty/readable;
- record the deployed Edge Function v12 version/hash and retain its source;
- verify the last known-good static `dist` archive.

Do not proceed without a restorable logical backup. A backup whose restore has
never been rehearsed is evidence only, not a proven recovery path.

### 3. Deployment order

1. Preserve and verify the already deployed data-quality migration and its
   disabled publication flags, metrics, inbox, RLS and audit logging.
2. After separate written approval, deploy
   `20260814120000_beta_security_definer_hardening.sql` and rerun the Security
   Advisor before continuing.
3. Stop here unless the held Source-/Stage-4/Candidate-First series has its own
   explicit approval.
4. `20260815_source_monitor_extraction_review.sql`
5. Validate proposal columns/table/RLS/RPC denial.
6. `20260816_stage_four_preparation.sql`
7. Immediately assert safe flags and DE/AT/CH rollouts.
8. `20260817124600_edition_candidate_first_lifecycle.sql`
9. Run the Edition Candidate-First postflight; do not backfill Candidates.
10. `20260817_stage_four_monitoring_guards.sql` (the mixed legacy/timestamp
    prefixes make this the CLI-tested order)
11. `20260818_stage_four_germany_observation.sql`
12. Immediately assert all four flags false/true as required and no queued run.
13. `20260819_stage_four_observation_calibration_guards.sql`
14. `20260820_stage_four_observation_operational_alerts.sql`
15. `20260821_stage_four_observation_lint_fixes.sql`
16. `20260822_stage_four_observation_queue_lint.sql`
17. Re-run all database checks before considering Edge Function v4 deployment.
18. Deploy worker v4 only as a separately approved step; with observation
    disabled its Stage-4 call paths must be no-ops.

Use one reviewed transaction per migration where supported. Do not paste the
whole series as an unreviewed SQL batch and do not repair migration history to
claim unapplied schema as applied.

### 4. Pre-deployment checks

- `migration list` and dry-run show only the expected pending versions.
- Production project is healthy and no long transaction/lock is active.
- Exact table row counts and current RLS/policy/ACL snapshots are saved.
- Security Advisor findings are saved before change.
- Current Edge Function version is 12, JWT verification enabled.
- Auth Site URL/redirect verification is independent of this deployment.
- No source-monitor schedule or admin batch is running.
- Backup/export completion and restore command are recorded.

### 5. Post-deployment checks

- Migration history contains each version exactly once in order.
- Public approved-event read and the full anonymous audit still pass.
- Two-user/admin RLS suite passes against production fixtures.
- Normal users cannot call any admin/Stage-4 RPC successfully.
- Admin review/apply still works on a controlled non-public proposal fixture.
- No existing public event status/date/location/URL changed by migration.
- No observation run, discovery candidate, geocoding job or bulk operation was
  created unexpectedly.
- All Stage-4 settings match the safe-state assertions below.

### 6. RLS and grant tests

- Enumerate every new public table and prove RLS enabled.
- For anon and normal authenticated users, reads return denial/empty for every
  Stage-4 table/view.
- For each authenticated admin RPC, call once as normal user and require HTTP
  denial before record lookup; then call a harmless/read-only or rolled-back
  admin fixture.
- Verify service-only functions reject anon/authenticated.
- Verify audit-log service role can insert/select but not update/delete/truncate.
- Re-run `tests/rls-security.test.mjs` with User A, User B and Admin.

### 7. Advisor review

Run Security and Performance Advisors after database and again after Edge
Function deployment. Treat missing RLS, mutable search paths, anonymous
definer execution, or authenticated definer execution without internal role
checks as stop conditions. Do not delete “unused” indexes based only on a young
statistics window.

Read-only baseline on 17 August 2026: seven security warnings (one anonymous
and five authenticated SECURITY DEFINER exposure warnings plus disabled leaked
password protection) and 58 informational performance findings (20 unindexed
foreign keys, 38 unused indexes). The local RLS suite confirms the guarded admin
RPCs deny normal users, but the pending
`20260814120000_beta_security_definer_hardening.sql` and every remaining public
definer grant must be reviewed before deployment. Index findings are not an
authorization for bulk index creation/deletion during this data-quality change.

### 8. Edge Function compatibility

- Current production v12 is worker `source-monitor-3.1.0` and does not call the
  new extraction/Stage-4 RPCs; the migrations are additive for it.
- Repository worker `source-monitor-4.1.0-phase-a-shadow` calls
  `record_extraction_proposals`, Stage-4 simulation and shadow-observation RPCs.
  It must never be deployed before `20260815`–`20260822`.
- After deployment, run the dedicated smoke action and one controlled source
  test only if explicitly approved. Do not enable observation or scheduler.
- Verify function logs contain no secret, token, raw personal data or unbounded
  HTML payload.

### 9. Rollback or forward-fix strategy

- Before worker v4 or Stage-4 data exists: rollback can drop new Stage-4 objects
  in reverse dependency order and restore previous function definitions.
- After internal observations exist: export them first and prefer forward fixes;
  dropping columns/tables would destroy audit/calibration evidence.
- If `20260815` fails mid-deployment, rely on transaction rollback. If committed
  but incompatible, keep worker v12 and apply a reviewed forward fix.
- If any public event fact changes unexpectedly, stop workers/admin writes,
  compare audit/checksum evidence and restore only affected rows from the logical
  backup or perform a verified forward fix. Never bulk-overwrite event data.

### 10. Abort criteria

Abort immediately if any of the following occurs:

- pending migration list differs from the reviewed set;
- backup/export is missing or unreadable;
- unexpected production drift or existing Stage-4 objects are found;
- migration waits on locks beyond the agreed window or exceeds the measured
  staging runtime by more than 2×;
- any critical RLS/Advisor warning appears;
- anon/normal user can read internal rows or invoke an admin/service RPC;
- `dry_run` becomes false or any automation/observation/scheduler flag becomes
  true;
- an observation run, geocoding job, discovery candidate or bulk execution is
  created without explicit action;
- public event row counts/checksums change unexpectedly;
- deployed Edge Function cannot operate with the migrated schema.

## Mandatory safe-state query result

After `20260818` and after the entire series, the singleton must read exactly:

```text
dry_run=true
automation_enabled=false
observation_enabled=false
observation_scheduler_enabled=false
observation_country_code=DE
```

Additionally, every recorded Phase-A decision must have
`actually_executed=false`, AT/CH must remain disabled with country kill switches,
and there must be zero automatically published event changes.
