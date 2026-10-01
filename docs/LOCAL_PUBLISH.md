# Local Build and Cloudflare Release

The public website is generated into `dist/`. GitHub and Cloudflare are not
connected, so commits and merges never publish the website automatically.

For explicitly requested UI-only releases that preserve every deployed data
artifact, use the separate [UI release workflow](UI_ONLY_RELEASE.md). Its fixed
allowlist and base-package integrity checks do not change the full-release
requirements below and do not approve a new catalog export.

## Local preparation on 1 October 2026

The exporter now requires the reviewed read-only
`20261001095043_public_catalog_consistent_snapshot.sql` migration. It was installed
in production with explicit approval on 1 October 2026, together with the separate
housekeeping route, manual approval and owned Planner archive migrations. The
exact four-file rollout was rehearsed against an encrypted production restore,
including code rollback/reapply, before independent production verification.
Without the RPC the exporter still stops and preserves the previous files.
All four also passed isolated SQL/RLS acceptance with the full 64-migration schema.
The housekeeper
resumes existing automatic validation/aging behavior, unlike the read-only snapshot.
Do not apply the historical pending migration list blindly.

`npm run data:refresh-public` reads one consistent database statement, validates
IDs/edition relationships and public fields, then runs the existing bound date,
geo and duplicate audits in staging **before** replacing the fallback. The CSV,
archive, three audit reports and manifest are one recoverable group; the
manifest is written last. A normal write failure restores every previous file.
An interrupted write retains `<manifest>.transaction/recovery.json` and backups;
all release entry points refuse that state. Compare its target list against the
intended workspace paths, restore every original artifact together, and verify
the manifest hashes before retrying. Never remove the marker just to pass a gate.

The package builder explicitly runs the guarded detail-page generator and checks
the saved and copied HTML against its concrete catalog edition values. CSV and
archive rows merge by edition UUID; two distinct editions with the same name,
date and place remain separate. A conflicting UUID or explicitly unpublished row
stops generation before existing pages are removed. The existing clean-source
check still runs after generation and before replacing `dist/`: reviewed generated
pages must be included in the approved source state before packaging. The isolated
`tests/catalog-page-release.test.mjs` exercises the actual candidate, generator
and package path; it does not authorize publishing production data.

Diagnostic output is marked `diagnostic_only` and must keep all outputs outside
`data/` and `dist/`. It cannot pass a release check. An export timestamp is a
technical creation time; `measured_at` identifies the database snapshot;
`last_checked` remains the actual stored edition verification time. Neither
export nor HTTP success renews verification.

Local evidence for this run is in `exports/p0-20261001`: a real read-only
snapshot, `quality-report.json`, a blocked diagnostic candidate and its bound
audits. No data publication or package deployment follows from those files.
`npm run audit:catalog-snapshot -- --snapshot <local-file> --out
exports/<report>.json` uses the same evaluator as the Admin. For a deliberate
historical replay add `--at-snapshot-time`; that preserves the original
measurement and explicitly labels the report as a replay.

## Install, Test and Build

Run all commands from the project directory:

```powershell
npm.cmd ci
npm.cmd run test:all
npm.cmd run prepare-package
npm.cmd run verify-package
```

Only publish when every command succeeds. The build may contain a Supabase URL
and publishable browser key. Never place secret, service-role or database
credentials in browser files or build variables.

For development, `npm.cmd run test:code` runs all technical script groups,
fixture-based data-gate tests, layout checks and browser scenarios independently
of the production catalog's export age. This is not release approval.
`test:all` still requires `check` and then the complete technical suite. Run the
required local/credential-based RLS tests and read-only production access audits
separately; neither test command substitutes for them.

`check`, `prepare-package` and `verify-package` share the same mandatory publish,
data-quality and catalog checks. They use the actual clock and unchanged release
policy. The build stops before regenerating pages or sitemap or replacing
`dist/` if any check fails. Refresh the source data and bound audits through the
approved data workflow before retrying; `test:code` cannot authorize a package.

Package verification checks the mobile discovery assets, all other critical
files and the complete artifact and event-page hash inventories. The required
event-page count follows the packaged catalog archive and export manifest.

## Local Smoke Test

Serve the generated package locally:

```powershell
Set-Location dist
python -m http.server 4174
```

Open `http://localhost:4174`, complete the main user flows, then return to the
project directory before running Wrangler.

## Cloudflare Preview

Deploy a preview before every production release:

```powershell
npx wrangler pages deploy dist --project-name=sporteventmap --branch=<preview-branch>
```

Test the returned preview URL. A preview deployment does not replace the public
production deployment.

## Production Release

After a successful preview and smoke test, deploy the tested `main` build:

```powershell
npm.cmd run verify-package
npx wrangler pages deploy dist --project-name=sporteventmap --branch=main
```

Reverification immediately before upload ensures the source catalog still
passes its 24-hour export limit. Deploy the exact preview-tested package and
verify hashes on its immutable Cloudflare deployment URL, then smoke-test
`sporteventmap.com` (Cloudflare may inject its own HTML on the main domain).

If a release contains Supabase migrations or Edge Function changes, coordinate
and verify those backend changes before publishing the dependent frontend.
