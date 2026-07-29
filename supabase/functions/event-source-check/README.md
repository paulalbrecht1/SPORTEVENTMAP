# Event source check

Queue-backed, server-only Source Monitor worker.

- Authenticates Supabase Cron with an anon JWT plus one-way verified Cron secret, or accepts a verified Admin/service-role token.
- Calls the bounded scheduler, then atomically leases at most 20 jobs (default 5).
- Resolves and validates DNS for every URL and redirect target before fetching.
- Blocks localhost, private/link-local IPv4 and IPv6, metadata endpoints, internal Supabase hosts, embedded credentials, unsupported protocols and non-standard ports.
- Applies per-domain Robots, pacing, timeout, response-size, redirect, content-type and HTTP policies.
- Uses ETag/Last-Modified, handles Retry-After and hashes normalized relevant content.
- Commits result, source state, retry/dead-letter state and review metadata transactionally.
- Never writes parsed values or public event facts.

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
