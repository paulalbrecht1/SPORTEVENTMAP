# Sport Event Map E2E Tests

## Runtime

- Node.js 24 is currently used locally.
- Playwright browsers are stored in `.playwright-browsers/` so the project does not depend on a global browser cache.

## Install

```powershell
pnpm install
npm run test:e2e:install
```

## Run

```powershell
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:debug
```

The tests start a local HTTP server automatically. They never open `index.html` via `file://`.

Set a custom port when needed:

```powershell
$env:E2E_PORT="4180"
npm run test:e2e
```

## Artifacts

Failure screenshots, traces and videos are written below `test-results/`.
The HTML report is written to `test-results/playwright-report/`.
These folders are ignored by git.

## Fixtures

`fixtures/events.json` contains a small controlled event set:

- future running event
- future triathlon
- past event
- long-name/long-city edge case

During E2E tests, Playwright intercepts `data/events.csv` and serves a CSV generated from this fixture. Production CSV data is not modified.

## Auth And Supabase

The default E2E suite does not write to Supabase. It validates anonymous UI behavior and uses local storage for guest/fallback planner state.

Dedicated authenticated tests can be added later using environment variables from `.env.example`. Do not commit real passwords or production admin credentials.

## Adding Tests

- Prefer `data-testid` or existing semantic `data-season-*` attributes.
- Do not depend on exact event counts from production data.
- Reset `localStorage`, `sessionStorage` and cookies per test.
- Avoid fixed waits; wait for visible elements or specific DOM state.
