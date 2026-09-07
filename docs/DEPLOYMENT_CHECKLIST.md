# Deployment Checklist

Use this checklist for controlled SportEventMap releases. Cloudflare Pages uses
Direct Upload; GitHub pushes do not change the public website.

## 1. Source State

- Work on a dedicated branch and review the complete diff.
- Confirm the branch contains no local credentials or private import files.
- Merge only a tested, reviewable commit into `main`.
- Use `npm.cmd run test:code` for complete technical validation of development
  changes. A green code suite does not grant a production data release.

## 2. Reproducible Build

From the project directory run:

```powershell
npm.cmd ci
npm.cmd run test:all
npm.cmd run prepare-package
npm.cmd run verify-package
```

Confirm `dist/` contains the homepage, event pages, `data/events.csv`,
`sitemap.xml`, `robots.txt` and legal pages. Browser configuration may contain
only the public Supabase URL and publishable key.

`test:all` requires the unchanged publish, data-quality and current-catalog
release gates plus every technical test group. Both package commands repeat
those release gates themselves. A blocked build stops before changing generated
pages, sitemap or an existing `dist/`; there is no release-gate override.
Verification covers all critical files (including mobile discovery), the full
artifact inventory and the event-page inventory/count from the packaged catalog.

## 3. Backend Compatibility

- Review pending Supabase migrations and Edge Function changes separately.
- Follow `stage4/production-migration-plan.md` when Stage-4 changes are included.
- Preserve RLS, admin checks and server-side secret verification.
- Run the local RLS suite and the read-only live anonymous audit.
- Do not publish a frontend that depends on an undeployed backend change.

## 4. Cloudflare Preview

Create a preview deployment with Wrangler:

```powershell
npx wrangler pages deploy dist --project-name=sporteventmap --branch=<preview-branch>
```

Verify Home, Discovery, map, filters, event details, authentication, profile,
favorites, Season Planner, admin surfaces, feedback and public event pages.

## 5. Production Release

After the preview succeeds, deploy the exact tested `main` build:

```powershell
npm.cmd run verify-package
npx wrangler pages deploy dist --project-name=sporteventmap --branch=main
```

Reverify immediately before uploading so the catalog still satisfies its
24-hour age limit. Record the Git commit and Cloudflare deployment URL. Verify
the release metadata and hashes on the immutable deployment URL, then re-run
the main-domain HTTP smoke checks and confirm Supabase requests, authentication
and RLS behavior. Main-domain HTML may include Cloudflare-injected content.

## 6. Manual Dashboard Checks

- Keep Supabase Auth redirect URLs aligned with the production domain.
- Keep leaked-password protection enabled.
- Review Supabase Security Advisor findings after backend changes.
- Retain the previous known-good deployment for rollback.
