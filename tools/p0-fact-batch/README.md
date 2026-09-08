# Preparation of an existing-event factual batch

This local tool prepares 1–25 independently reviewed **existing published
editions**. It does not access a network, authenticate, execute SQL, attest
freshness, publish an edition or change the source reviews. Generated packages
remain under ignored `exports/`; templates and code belong in Git.

```powershell
node tools/p0-fact-batch/index.mjs --manifest exports/my-batch/manifest.json --out exports/my-batch/prepared
node --test tests/p0-fact-batch.test.mjs
```

The output directory must be new, and its parent must already exist. Input
references resolve relative to the manifest, within `exports/`. Each artifact
reference inside a review resolves within that review's own directory. Hashes
cover the exact original bytes, including timestamps and numeric/string types.
Symlink paths cannot escape these roots. Neither an existing package nor input
files are overwritten. A generation report is written last; a package without
that report and matching file hashes is incomplete.

## Manifest contract

```json
{
  "schema_version": 1,
  "batch_id": "20260908_p0_event_facts_batch_06",
  "prepared_at": "2026-09-08T12:00:00.000Z",
  "baseline": { "file": "baseline.json", "sha256": "<64 lowercase hex characters>" },
  "reviews": [
    {
      "event_id": 123,
      "edition_id": "<existing lowercase edition UUID>",
      "source_id": "<existing lowercase source UUID>",
      "source_url": "https://official.example/event",
      "file": "event-123/review.json",
      "sha256": "<SHA256 of the independently reviewed original file>"
    }
  ]
}
```

`prepared_at` is an explicit preparation clock, not a rewritten evidence time.
Identical manifest/input/template bytes produce identical package bytes. The
generator validates against this clock for reproducibility; the SQL separately
checks the **real database clock** against preparation/expiry, and the admin
dialog/RPC checks the real evidence age again. Replaying an old fixture clock
cannot make stale evidence usable in production.

Use the existing Batch05 baseline shape: `retrieved_at`, and exactly the selected
`rows`, each containing `event_id`, the full `event` and `edition`, all `sources`
and `sibling_editions`, plus explicit zero/empty `open_tasks`,
`pending_proposals`, `active_source_jobs`. All original row columns are retained.
The known production columns are required; a future extra column is retained and
covered by SQL's full-row comparison. Sources/siblings must belong to the same
event and the selected edition snapshot must agree with its sibling row.

Reviews use the existing 14-field contract plus explicit `event_patch` and
`edition_patch` objects (including `{}`), and all 14 `field_evidence` entries.
Each entry needs `status: "supported"`, the exact observed `value`, and at least
one artifact with `url`, `file`, `sha256`, `retrieved_at`. Each review and each
artifact must be within 24 hours of preparation, at most five minutes ahead.
The SQL expiry uses the oldest of those times. Full independent source review
and the operator's approval of the manifest are prerequisites; hashes establish
provenance, not truth or administrative authority.

## Scope and outputs

Fixed editable master fields: `address`, `canonical_name`, `city`, `country`,
`description`, `distance`, `event_url`, `latitude`, `longitude`,
`registration_status`, `sport`. Fixed edition fields: `legacy_distance`,
`race_formats`, `registration_status`, `registration_url`.

Dates, edition years, event names/identity keys/slugs, foreign keys, publication,
source identity/health and verification fields cannot be patched. Cancelled,
archived, new or competing current editions require their own reviewed path.
This first scope requires supported positive numeric distances for every format;
uncertain/variable programmes are returned for a separate review, never guessed.
All structured labels must be mirrored in both flat-distance fields with ` / `.
Coordinates retain database TEXT precision. Registration links/status are checked
across master and edition; allowed statuses are `registration_open`,
`registration_not_open`, `sold_out`.

For N reviews and M actually changed events:

- `targets.json` contains the M changes; redundant identical field assignments
  are removed without modifying the original review.
- `admin-import.json` contains all N original 14-field reviews, original source
  times and notes, with no checkbox confirmations or fabricated observed values.
- When M > 0, `apply.sql`, `verify.sql`, `rollback.sql` come from the three fixed
  reviewed templates in this directory. They never read or replace historical
  batch SQL at runtime. Apply/rollback use `4*M+1` private snapshots each.
- When M = 0, no SQL is emitted and `snapshot_count` is zero. The package can
  proceed to the existing real admin review after live eligibility checks.
- `generation-report.json` records counts, source/manifest/template/output hashes
  and expiry. All eligibility claims are explicitly **projection only**.

## Operational checks remain mandatory

Before any production factual apply: independent package review, fresh encrypted
backup, isolated restore, actual apply/read-only verify/repeat rejection/drift
rejection/rollback/repeat rejection rehearsal, and immediate live preflight.
The generator does not replace these checks. A changed hash or baseline requires
review and regeneration/rehearsal, never silent substitution.

The templates retain serializable transactions, 5-second lock/60-second statement
limits, source→event→edition locks, the scheduler table lock and active-job guard
(including `retry_scheduled`), full before/after comparisons, unchanged source and
user-reference/other-row checksums, trigger-safe edition restoration and factual
audits. Apply additionally compares all baseline sources and sibling editions.
After acquiring the locks, Apply rechecks live open review tasks, pending
proposals, relevant validation errors/alerts and reviewed/planned incorrect-data
feedback. Read-only Verify reports these blockers too. No task is auto-resolved.
No authority or freshness override is enabled by the maintenance package.

Factual apply and admin attestation are **two separate transactions**. After
apply, verify all M factual targets, reload the actual admin inbox and consciously
confirm every selected event. Let the existing RPC attest all N reviews atomically.
Its returned count/ID set and audit/public-freshness state must be read back. If
that phase fails, the facts remain with review required; the package is incomplete.
A lost response never authorizes an automatic retry. Rollback refuses any drift
from the stored post-state, including later admin attestation; it cannot erase
newer user work or restore a stale verified state.

The existing preview/restore cleanup procedures remain explicit operations.
Do not delete a development database or use the synthetic unit fixtures in
production. The unit suite is independent of private exports; real 1/10/25 SQL
and permission/atomicity tests on an isolated schema are additional release gates.
