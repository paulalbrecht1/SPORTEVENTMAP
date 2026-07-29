# Event source check

Server-only source monitor for the Event Data Operations workflow.

- Requires a verified Admin access token or the server-side service-role JWT.
- Claims at most 20 due sources and at most one URL per host per invocation.
- Applies per-domain timeout, response-size, pacing and retry policies.
- Reads and respects `robots.txt`; a denied path is not fetched.
- Stores hashes and fetch metadata, but never changes event facts directly.
- A changed content hash creates a pending `event_change_proposals` row for review.

Example server-side invocation:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/event-source-check" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batch_size":5}'
```

Do not put the service-role key in browser code.
