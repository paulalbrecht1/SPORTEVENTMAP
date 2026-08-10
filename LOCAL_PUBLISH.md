# Local Build and Cloudflare Release

The public website is generated into `dist/`. GitHub and Cloudflare are not
connected, so commits and merges never publish the website automatically.

## Install, Test and Build

Run all commands from the project directory:

```powershell
npm.cmd ci
npm.cmd run test:all
npm.cmd run prepare-package
```

Only publish when every command succeeds. The build may contain a Supabase URL
and publishable browser key. Never place secret, service-role or database
credentials in browser files or build variables.

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
npx wrangler pages deploy dist --project-name=sporteventmap --branch=main
```

If a release contains Supabase migrations or Edge Function changes, coordinate
and verify those backend changes before publishing the dependent frontend.
