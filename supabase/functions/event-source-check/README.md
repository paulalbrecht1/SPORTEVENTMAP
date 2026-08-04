# Event source check

Queue-backed, server-only Source Monitor worker.

Worker `source-monitor-3.2.0` führt nach einem neuen oder geänderten Crawl die
deterministische Stufe-3-Extraktion aus. Feldwerte werden normalisiert und als
`event_change_proposals` gespeichert; der Worker schreibt keine extrahierten
öffentlichen Eventfakten. Details: `docs/SOURCE_MONITOR_EXTRACTION.md`.

- Authenticates Supabase Cron with an anon JWT plus one-way verified Cron secret, or accepts a verified Admin/service-role token.
- Calls the bounded scheduler, then atomically leases at most 20 jobs (default 5).
- Resolves and validates DNS for every URL and redirect, then connects directly to the approved IP while retaining hostname-based TLS verification.
- Blocks localhost, private/link-local IPv4 and IPv6, metadata endpoints, internal Supabase hosts, embedded credentials, unsupported protocols and non-standard ports.
- Applies per-domain Robots including crawl-delay, adaptive 429 backoff, pacing, timeout, response-size, redirect, content-type and HTTPS policies.
- Uses ETag/Last-Modified, handles Retry-After and creates versioned broad plus semantic hashes.
- Records only technical per-domain aggregates used for respectful rate tuning.
- Commits result, source state, retry/dead-letter state and review metadata in the existing database transaction.
- Enriches that result idempotently with semantic hash, pinned IP evidence and domain telemetry.
- Passes only successor dates and official result links to review-gated RPCs. Existing public event facts are never overwritten; a new edition or result link can publish only after the database confirmation gate succeeds.

Runtime variables are documented in `docs/SOURCE_MONITOR.md`.

Server-side batch invocation:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/event-source-check" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batch_size":5}'
```

Targeted invocation (Admin or server only):

```json
{"source_id":"00000000-0000-0000-0000-000000000000","batch_size":1}
```

Do not expose secret/service-role keys in browser code.
Read-only production smoke test:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... SOURCE_MONITOR_SMOKE_SECRET=... \
  npm run smoke:source-monitor:production
```

Keep `SOURCE_MONITOR_REQUIRE_PINNED_TRANSPORT=true` in production.
