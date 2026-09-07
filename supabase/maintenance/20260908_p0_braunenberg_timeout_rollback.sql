-- P0 Braunenberg: bounded per-host timeout rollback.
-- No source/event facts, global limits, scheduler rules or access grants are changed.
-- Current non-telemetry configuration must match the independently reviewed baseline.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
do $maintenance$
declare
  before_row jsonb;
  after_row jsonb;
  expected_config constant jsonb := $config${
  "id": 675,
  "notes": null,
  "is_active": true,
  "allow_http": false,
  "created_at": "2026-07-29T09:17:00.244453+00:00",
  "source_host": "www.braunenberg-lauf.de",
  "max_redirects": 5,
  "max_response_bytes": 1500000,
  "request_timeout_ms": 20000,
  "respect_robots_txt": true,
  "robots_cache_hours": 24,
  "max_requests_per_run": 1,
  "min_interval_seconds": 30,
  "allowed_content_types": [
    "text/html",
    "application/xhtml+xml",
    "application/json"
  ],
  "retry_backoff_minutes": [
    15,
    60,
    360,
    1440,
    10080
  ],
  "max_consecutive_failures": 5
}$config$::jsonb;
  telemetry_fields constant text[] := array['updated_at','next_allowed_at','last_requested_at','robots_crawl_delay_seconds','robots_checked_at','robots_status','adaptive_interval_seconds','successful_requests_since_rate_limit','rate_limit_events','last_rate_limited_at','last_user_agent'];
begin
  select to_jsonb(p) into before_row
  from public.crawler_domain_policies p
  where id = 675 and source_host = 'www.braunenberg-lauf.de'
  for update;
  if before_row is null or before_row - telemetry_fields is distinct from expected_config then
    raise exception 'Braunenberg policy baseline changed; stop for a new review';
  end if;
  update public.crawler_domain_policies p
  set request_timeout_ms = 12000
  where id = 675 and source_host = 'www.braunenberg-lauf.de'
  returning to_jsonb(p) into after_row;
  if after_row is null
     or after_row ->> 'request_timeout_ms' is distinct from '12000'
     or (after_row - array['request_timeout_ms','updated_at'])
        is distinct from (before_row - array['request_timeout_ms','updated_at']) then
    raise exception 'Unexpected Braunenberg policy change';
  end if;
end;
$maintenance$;
select id, source_host, request_timeout_ms, max_response_bytes, min_interval_seconds,
       max_requests_per_run, respect_robots_txt, allow_http, updated_at
from public.crawler_domain_policies where id = 675;
commit;
