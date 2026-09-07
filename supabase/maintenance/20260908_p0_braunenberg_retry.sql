-- Run only after the reviewed worker rollout and Braunenberg timeout postflight.
-- Advance the single existing retry; retain all counters, errors and history.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
do $retry$
declare
  before_row jsonb;
  after_row jsonb;
begin
  if not exists (
    select 1 from public.crawler_domain_policies
    where id = 675 and source_host = 'www.braunenberg-lauf.de'
      and request_timeout_ms = 20000 and is_active and respect_robots_txt
      and not allow_http
  ) then
    raise exception 'Reviewed Braunenberg policy is not active';
  end if;
  select to_jsonb(j) into before_row
  from public.source_crawl_jobs j
  where id = '239ebff4-ba20-401d-aaa8-46b39c3d99ca'::uuid
    and source_id = '25d2ace8-5e5d-41df-ae12-892d842f40bb'::uuid
    and event_id = 377
  for update;
  if before_row is null
     or before_row ->> 'status' is distinct from 'retry_scheduled'
     or before_row ->> 'attempt_count' is distinct from '3'
     or before_row ->> 'lease_owner' is not null
     or before_row ->> 'lease_expires_at' is not null
     or (before_row ->> 'scheduled_at')::timestamptz is distinct from
        '2026-09-08T03:45:16.115116+00:00'::timestamptz then
    raise exception 'Braunenberg retry baseline changed; inspect the current queue';
  end if;
  update public.source_crawl_jobs j
  set scheduled_at = now()
  where id = '239ebff4-ba20-401d-aaa8-46b39c3d99ca'::uuid
  returning to_jsonb(j) into after_row;
  if (after_row - array['scheduled_at','updated_at']) is distinct from
     (before_row - array['scheduled_at','updated_at']) then
    raise exception 'Unexpected retry change';
  end if;
end;
$retry$;
select id, source_id, event_id, status, attempt_count, scheduled_at
from public.source_crawl_jobs where id = '239ebff4-ba20-401d-aaa8-46b39c3d99ca'::uuid;
commit;
