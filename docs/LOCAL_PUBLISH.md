# Local Build and Cloudflare Release

The public website is generated into `dist/`. GitHub and Cloudflare are not
connected, so commits and merges never publish the website automatically.

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
