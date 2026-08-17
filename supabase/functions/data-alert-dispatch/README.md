# Data alert dispatch

Server-only dispatcher for SportEventMap data-freshness alerts.

- Captures a privacy-safe aggregate snapshot every 15 minutes.
- Sends one bundled critical alert instead of one message per source.
- Repeats a persistent critical state no more than every 12 hours.
- Sends one recovery message after a previously delivered critical state clears.
- Stores webhook secrets only as Edge Function secrets.

Required secret:

```text
DATA_ALERT_WEBHOOK_URL=https://...
```

Optional secrets:

```text
DATA_ALERT_WEBHOOK_FORMAT=generic # or slack
DATA_ALERT_WEBHOOK_BEARER_TOKEN=
DATA_ALERT_DASHBOARD_URL=https://...
```

The function stays operational but intentionally does not acknowledge a
notification claim until `DATA_ALERT_WEBHOOK_URL` is configured.
