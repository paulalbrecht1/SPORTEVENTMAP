# Local Publish Package

The app is currently developed and tested locally. Hosting is intentionally
postponed until the event database, mobile experience and product flow are more
complete.

The project still keeps a clean `dist/` package because it is useful for later
drag-and-drop hosting.

## What `dist/` Is

`dist/` is the public website folder. It contains only the app files that a
static host needs:

- `index.html`
- legal/contact pages
- `css/style.css`
- browser JavaScript files
- `data/events.csv`

It does not contain import tools, Supabase SQL setup files, review CSVs or
private API key files.

## Create The Local Public Package

Run:

```powershell
node tools/check-publish-readiness.js
node tools/create-publish-package.js
```

Then test locally:

```powershell
cd dist
python -m http.server 4174
```

Open:

```text
http://localhost:4174
```

## Later Drag-And-Drop Hosting

When the app is ready to publish, create a fresh `dist/` folder with:

```powershell
node tools/create-publish-package.js
```

Then upload the contents of the `dist/` folder to a static hosting provider.

After the site has a real URL, update Supabase Authentication URL settings:

- Site URL
- Redirect URLs
- Password reset redirect URL

## Supabase Checklist Before Sharing A Public URL

1. Run `supabase/admin-roles.sql` in Supabase SQL Editor.
2. Confirm your profile role is `admin`.
3. Confirm logged-out users can read only approved events.
4. Confirm pending/rejected events do not appear on the public map.
5. Confirm normal users do not see the Admin button.
6. Enable email confirmation if you want only verified emails.
7. Configure password reset redirects after the live URL exists.

## Data Publishing Flow

For more event data:

1. Put raw imports into `data/imports/raw/`.
2. Normalize them into `data/imports/normalized/`.
3. Run the build pipeline.
4. Review `data/imports/review/`.
5. Publish only the cleaned final `data/events.csv`.

The product focus stays Germany first, then Europe.
