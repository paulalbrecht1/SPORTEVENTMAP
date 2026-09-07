-- Read-only postflight; no facts or freshness metadata are modified.
do $verify$
declare
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
  actual_config jsonb;
begin
  select to_jsonb(p) - array['updated_at','next_allowed_at','last_requested_at','robots_crawl_delay_seconds','robots_checked_at','robots_status','adaptive_interval_seconds','successful_requests_since_rate_limit','rate_limit_events','last_rate_limited_at','last_user_agent'] into actual_config
  from public.crawler_domain_policies p
  where id = 675 and source_host = 'www.braunenberg-lauf.de';
  if actual_config is distinct from expected_config then
    raise exception 'Braunenberg policy postflight failed';
  end if;
end;
$verify$;
select id, source_host, request_timeout_ms from public.crawler_domain_policies where id = 675;
