-- Event Data Operations foundation.
--
-- This additive migration separates durable event brands (public.events) from
-- yearly occurrences (public.event_editions) while preserving every legacy
-- event id and the text keys used by Favorites and the Season Planner.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

-- A database-local safety net for the two tables whose shape changes here.
-- The rollback runbook can restore every pre-migration row from this snapshot.
create table if not exists private.event_data_workflow_backup (
  migration_key text not null,
  entity_table text not null,
  entity_pk text not null,
  row_data jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (migration_key, entity_table, entity_pk)
);

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260728_event_data_operations_foundation',
  'events',
  id::text,
  to_jsonb(events)
from public.events
on conflict do nothing;

insert into private.event_data_workflow_backup (
  migration_key,
  entity_table,
  entity_pk,
  row_data
)
select
  '20260728_event_data_operations_foundation',
  'event_sources',
  id::text,
  to_jsonb(event_sources)
from public.event_sources
on conflict do nothing;

revoke all on private.event_data_workflow_backup from public, anon, authenticated;

create or replace function private.slugify_event(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(value),
      chr(228) || chr(246) || chr(252) || chr(223) ||
      chr(224) || chr(225) || chr(226) ||
      chr(232) || chr(233) || chr(234) ||
      chr(236) || chr(237) || chr(238) ||
      chr(242) || chr(243) || chr(244) ||
      chr(249) || chr(250) || chr(251),
      'aousaaaeeeiiiooouuu'
    ),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

create or replace function private.try_parse_event_date(value text)
returns date
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  parsed date;
begin
  if btrim(value) ~ '^\d{2}\.\d{2}\.\d{4}$' then
    parsed := make_date(
      substring(value from 7 for 4)::integer,
      substring(value from 4 for 2)::integer,
      substring(value from 1 for 2)::integer
    );
  elsif btrim(value) ~ '^\d{4}-\d{2}-\d{2}$' then
    parsed := make_date(
      substring(value from 1 for 4)::integer,
      substring(value from 6 for 2)::integer,
      substring(value from 9 for 2)::integer
    );
  else
    return null;
  end if;

  return parsed;
exception when others then
  return null;
end;
$$;

create or replace function private.try_parse_coordinate(value text)
returns double precision
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
begin
  return replace(btrim(value), ',', '.')::double precision;
exception when others then
  return null;
end;
$$;

revoke all on function private.slugify_event(text) from public, anon, authenticated;
revoke all on function private.try_parse_event_date(text) from public, anon, authenticated;
revoke all on function private.try_parse_coordinate(text) from public, anon, authenticated;

-- public.events remains the stable event-brand table. Legacy occurrence fields
-- stay in place until every client reads public_event_discovery.
alter table public.events
  add column if not exists canonical_name text,
  add column if not exists canonical_key text,
  add column if not exists slug text,
  add column if not exists subcategory text,
  add column if not exists region text,
  add column if not exists organizer_id uuid,
  add column if not exists organizer_name text,
  add column if not exists official_url text,
  add column if not exists publication_status text not null default 'draft',
  add column if not exists event_status text not null default 'active',
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists data_confidence numeric(4,3) not null default 0.300,
  add column if not exists last_verified_at timestamptz,
  add column if not exists next_check_at timestamptz;

update public.events
set
  canonical_name = coalesce(nullif(btrim(canonical_name), ''), nullif(btrim(event_name), ''), 'Event ' || id),
  canonical_key = coalesce(
    nullif(btrim(canonical_key), ''),
    private.slugify_event(
      coalesce(nullif(btrim(event_name), ''), 'event-' || id) || '-' ||
      coalesce(nullif(btrim(city), ''), 'unknown') || '-' ||
      coalesce(nullif(btrim(country), ''), 'unknown')
    )
  ),
  slug = coalesce(
    nullif(btrim(slug), ''),
    private.slugify_event(coalesce(nullif(btrim(event_name), ''), 'event-' || id))
  ),
  official_url = coalesce(nullif(btrim(official_url), ''), nullif(btrim(event_url), ''), nullif(btrim(source_url), '')),
  publication_status = case
    when status = 'approved' then 'published'
    when status = 'archived' then 'archived'
    else 'draft'
  end,
  event_status = case when status in ('archived', 'rejected', 'duplicate') then 'inactive' else 'active' end,
  last_verified_at = coalesce(last_verified_at, last_checked),
  verification_status = case
    when coalesce(nullif(btrim(source_url), ''), nullif(btrim(event_url), '')) is null then 'source_unreachable'
    when private.try_parse_event_date(date) < current_date then 'stale'
    when last_checked is not null then 'verified'
    else 'unverified'
  end,
  data_confidence = case
    when coalesce(nullif(btrim(source_url), ''), nullif(btrim(event_url), '')) is null then 0.100
    when private.try_parse_event_date(date) < current_date then 0.300
    when last_checked is not null then 0.750
    else 0.450
  end,
  needs_review = case
    when status in ('rejected', 'duplicate', 'archived') then needs_review
    when coalesce(nullif(btrim(source_url), ''), nullif(btrim(event_url), '')) is null then true
    when private.try_parse_event_date(date) < current_date then true
    else needs_review
  end,
  next_check_at = coalesce(
    next_check_at,
    case
      when review_priority = 'high' then now() + interval '7 days'
      when review_priority = 'low' then now() + interval '90 days'
      else now() + interval '30 days'
    end
  );

-- Existing duplicate submissions remain distinct and keep their ids. Only the
-- first canonical identity receives the unsuffixed key/slug used by imports.
with ranked as (
  select id, canonical_key, row_number() over (partition by canonical_key order by id) as position
  from public.events
)
update public.events e
set canonical_key = e.canonical_key || '-legacy-' || e.id
from ranked r
where r.id = e.id and r.position > 1;

with ranked as (
  select id, slug, row_number() over (partition by slug order by id) as position
  from public.events
)
update public.events e
set slug = e.slug || '-legacy-' || e.id
from ranked r
where r.id = e.id and r.position > 1;

alter table public.events
  drop constraint if exists events_publication_status_check,
  drop constraint if exists events_event_status_check,
  drop constraint if exists events_verification_status_check,
  drop constraint if exists events_data_confidence_check;

alter table public.events
  add constraint events_publication_status_check
    check (publication_status in ('draft', 'published', 'archived')),
  add constraint events_event_status_check
    check (event_status in ('active', 'inactive')),
  add constraint events_verification_status_check
    check (verification_status in ('unverified', 'verified', 'stale', 'needs_review', 'source_unreachable')),
  add constraint events_data_confidence_check
    check (data_confidence >= 0 and data_confidence <= 1);

create unique index if not exists events_canonical_key_uidx on public.events(canonical_key);
create unique index if not exists events_slug_uidx on public.events(slug);
create index if not exists events_data_operations_idx
  on public.events(verification_status, needs_review, review_priority, next_check_at);
create index if not exists events_discovery_idx
  on public.events(publication_status, sport, country, city);

create table if not exists public.event_editions (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  edition_year smallint not null check (edition_year between 1900 and 2200),
  edition_slug text not null,
  legacy_event_key text not null,
  start_date date,
  end_date date,
  start_time time,
  registration_url text,
  registration_status text not null default 'registration_not_open',
  edition_status text not null default 'date_unconfirmed',
  publication_status text not null default 'draft',
  price_min numeric(10,2),
  price_max numeric(10,2),
  currency char(3),
  price_details jsonb not null default '{}'::jsonb,
  participant_limit integer,
  race_formats jsonb not null default '[]'::jsonb,
  legacy_distance text,
  source_url text,
  verification_status text not null default 'unverified',
  data_confidence numeric(4,3) not null default 0.300,
  needs_review boolean not null default true,
  review_priority text not null default 'medium',
  last_verified_at timestamptz,
  next_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_editions_event_year_unique unique(event_id, edition_year),
  constraint event_editions_slug_unique unique(edition_slug),
  constraint event_editions_dates_check check (end_date is null or start_date is null or start_date <= end_date),
  constraint event_editions_registration_status_check check (
    registration_status in ('registration_not_open', 'registration_open', 'sold_out', 'cancelled', 'unknown')
  ),
  constraint event_editions_status_check check (
    edition_status in ('date_unconfirmed', 'scheduled', 'postponed', 'cancelled', 'completed', 'inactive')
  ),
  constraint event_editions_publication_status_check check (
    publication_status in ('draft', 'published', 'archived')
  ),
  constraint event_editions_verification_status_check check (
    verification_status in ('unverified', 'verified', 'stale', 'needs_review', 'source_unreachable')
  ),
  constraint event_editions_confidence_check check (data_confidence >= 0 and data_confidence <= 1),
  constraint event_editions_review_priority_check check (review_priority in ('high', 'medium', 'low')),
  constraint event_editions_prices_check check (
    (price_min is null or price_min >= 0)
    and (price_max is null or price_max >= 0)
    and (price_min is null or price_max is null or price_min <= price_max)
  ),
  constraint event_editions_participant_limit_check check (participant_limit is null or participant_limit > 0)
);

create index if not exists event_editions_legacy_key_idx
  on public.event_editions (legacy_event_key);

insert into public.event_editions (
  event_id,
  edition_year,
  edition_slug,
  legacy_event_key,
  start_date,
  end_date,
  registration_url,
  registration_status,
  edition_status,
  publication_status,
  race_formats,
  legacy_distance,
  source_url,
  verification_status,
  data_confidence,
  needs_review,
  review_priority,
  last_verified_at,
  next_check_at,
  created_at,
  updated_at
)
select
  e.id,
  coalesce(
    extract(year from private.try_parse_event_date(e.date))::smallint,
    nullif(substring(e.date from '(20\d{2})'), '')::smallint,
    extract(year from e.created_at)::smallint
  ),
  e.slug || '-' || coalesce(
    extract(year from private.try_parse_event_date(e.date))::text,
    nullif(substring(e.date from '(20\d{2})'), ''),
    extract(year from e.created_at)::text
  ),
  lower(
    btrim(coalesce(e.event_name, '')) || '|' ||
    btrim(coalesce(e.date, '')) || '|' ||
    btrim(coalesce(e.city, '')) || '|' ||
    btrim(coalesce(e.country, ''))
  ),
  private.try_parse_event_date(e.date),
  private.try_parse_event_date(e.date),
  nullif(btrim(e.event_url), ''),
  case e.registration_status
    when 'registration_open' then 'registration_open'
    when 'sold_out' then 'sold_out'
    when 'cancelled' then 'cancelled'
    when 'registration_not_open' then 'registration_not_open'
    else 'unknown'
  end,
  case
    when e.status in ('rejected', 'duplicate', 'archived') then 'inactive'
    when private.try_parse_event_date(e.date) is null then 'date_unconfirmed'
    when private.try_parse_event_date(e.date) < current_date then 'completed'
    else 'scheduled'
  end,
  case when e.status = 'approved' then 'published' when e.status = 'archived' then 'archived' else 'draft' end,
  case
    when nullif(btrim(e.distance), '') is null then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object('label', btrim(e.distance)))
  end,
  nullif(btrim(e.distance), ''),
  coalesce(nullif(btrim(e.source_url), ''), nullif(btrim(e.event_url), '')),
  e.verification_status,
  e.data_confidence,
  e.needs_review,
  e.review_priority,
  e.last_verified_at,
  e.next_check_at,
  e.created_at,
  e.updated_at
from public.events e
on conflict (event_id, edition_year) do nothing;

create index if not exists event_editions_event_date_idx
  on public.event_editions(event_id, start_date desc);
create index if not exists event_editions_public_discovery_idx
  on public.event_editions(publication_status, edition_status, start_date);
create index if not exists event_editions_operations_idx
  on public.event_editions(verification_status, needs_review, review_priority, next_check_at);

-- The previous event_sources table stores public, field-level citations. Rename
-- it so those citations remain available while the required operational source
-- registry can use the canonical event_sources name without exposing crawl data.
do $rename_legacy_event_sources$
begin
  if to_regclass('public.event_detail_sources') is null
     and to_regclass('public.event_sources') is not null then
    alter table public.event_sources rename to event_detail_sources;
  end if;
end
$rename_legacy_event_sources$;

alter index if exists public.event_sources_detail_idx
  rename to event_detail_sources_detail_idx;

create table if not exists public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  source_type text not null,
  source_url text not null,
  source_priority smallint not null default 100 check (source_priority between 1 and 999),
  parser_type text not null default 'manual',
  is_active boolean not null default true,
  last_fetched_at timestamptz,
  next_fetch_at timestamptz,
  last_http_status smallint check (last_http_status is null or last_http_status between 100 and 599),
  last_content_hash text,
  crawl_status text not null default 'pending',
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sources_type_check check (
    source_type in (
      'official_event_website',
      'official_registration_platform',
      'organizer_calendar',
      'federation_calendar',
      'third_party_platform',
      'manual'
    )
  ),
  constraint event_sources_parser_type_check check (
    parser_type in ('manual', 'html', 'json_ld', 'api', 'ical', 'csv')
  ),
  constraint event_sources_crawl_status_check check (
    crawl_status in ('pending', 'success', 'not_modified', 'unreachable', 'blocked', 'parse_error', 'http_error', 'inactive')
  ),
  constraint event_sources_url_check check (source_url ~* '^https?://[^[:space:]]+$')
);

-- PostgreSQL does not permit a subquery in a validated CHECK constraint. The
-- NOT VALID declaration above documents intent; this trigger enforces it for
-- every new or changed operational source.
create or replace function private.enforce_event_source_parent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.edition_id is not null and not exists (
    select 1 from public.event_editions ee
    where ee.id = new.edition_id and ee.event_id = new.event_id
  ) then
    raise exception 'event source edition must belong to event %', new.event_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists event_sources_parent_check on public.event_sources;
create trigger event_sources_parent_check
before insert or update of event_id, edition_id on public.event_sources
for each row execute function private.enforce_event_source_parent();

insert into public.event_sources (
  event_id,
  edition_id,
  source_type,
  source_url,
  source_priority,
  parser_type,
  is_active,
  next_fetch_at,
  crawl_status,
  created_at,
  updated_at
)
select
  e.id,
  ee.id,
  case
    when e.source_type = 'official' then 'official_event_website'
    when e.source_type = 'aggregator' then 'third_party_platform'
    else 'manual'
  end,
  coalesce(nullif(btrim(e.source_url), ''), nullif(btrim(e.event_url), '')),
  case when e.source_type = 'official' then 10 else 100 end,
  'manual',
  true,
  coalesce(e.next_check_at, now() + interval '30 days'),
  'pending',
  e.created_at,
  e.updated_at
from public.events e
join public.event_editions ee on ee.event_id = e.id
where coalesce(nullif(btrim(e.source_url), ''), nullif(btrim(e.event_url), '')) is not null
on conflict do nothing;

create unique index if not exists event_sources_identity_uidx
  on public.event_sources(event_id, coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid), source_url);
create index if not exists event_sources_schedule_idx
  on public.event_sources(is_active, next_fetch_at, source_priority);
create index if not exists event_sources_failure_idx
  on public.event_sources(crawl_status, consecutive_failures desc);

create table if not exists public.validation_issues (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  edition_id uuid references public.event_editions(id) on delete cascade,
  entity_scope text generated always as (
    event_id::text || ':' || coalesce(edition_id::text, 'event')
  ) stored,
  severity text not null,
  rule_code text not null,
  description text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint validation_issues_identity_unique unique(entity_scope, rule_code),
  constraint validation_issues_severity_check check (severity in ('info', 'warning', 'error', 'critical')),
  constraint validation_issues_status_check check (status in ('open', 'resolved', 'ignored'))
);

create index if not exists validation_issues_open_queue_idx
  on public.validation_issues(status, severity, created_at desc);
create index if not exists validation_issues_event_idx
  on public.validation_issues(event_id, edition_id);

create table if not exists public.event_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  change_source text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_process text,
  reason text,
  source_url text,
  created_at timestamptz not null default now(),
  constraint event_audit_log_entity_type_check check (
    entity_type in ('event', 'edition', 'source', 'validation_issue')
  ),
  constraint event_audit_log_change_source_check check (
    change_source in ('manual_admin', 'import', 'crawler', 'user_report', 'organizer', 'system')
  )
);

create index if not exists event_audit_log_entity_idx
  on public.event_audit_log(entity_type, entity_id, created_at desc);

create table if not exists private.country_coordinate_bounds (
  country_key text primary key,
  min_lat double precision not null,
  max_lat double precision not null,
  min_lon double precision not null,
  max_lon double precision not null
);

insert into private.country_coordinate_bounds values
  ('germany', 47.20, 55.20, 5.70, 15.10),
  ('deutschland', 47.20, 55.20, 5.70, 15.10),
  ('austria', 46.30, 49.10, 9.40, 17.20),
  ('Ã¶sterreich', 46.30, 49.10, 9.40, 17.20),
  ('switzerland', 45.70, 47.90, 5.80, 10.60),
  ('schweiz', 45.70, 47.90, 5.80, 10.60),
  ('france', 41.20, 51.20, -5.30, 9.70),
  ('italy', 35.40, 47.20, 6.50, 18.60),
  ('spain', 27.50, 43.90, -18.30, 4.40),
  ('netherlands', 50.70, 53.70, 3.20, 7.30),
  ('belgium', 49.40, 51.60, 2.40, 6.50),
  ('denmark', 54.40, 57.90, 7.90, 15.30),
  ('sweden', 55.20, 69.20, 10.50, 24.30),
  ('norway', 57.50, 71.40, 4.00, 31.20),
  ('portugal', 36.80, 42.20, -9.60, -6.10),
  ('canada', 41.60, 83.20, -141.10, -52.50)
on conflict (country_key) do update set
  min_lat = excluded.min_lat,
  max_lat = excluded.max_lat,
  min_lon = excluded.min_lon,
  max_lon = excluded.max_lon;

revoke all on private.country_coordinate_bounds from public, anon, authenticated;

create or replace function private.audit_event_entity_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  changed_field record;
  configured_source text := nullif(current_setting('app.change_source', true), '');
  effective_source text;
  affected_id text := coalesce(new_row ->> 'id', old_row ->> 'id');
  affected_type text := case when tg_table_name = 'event_editions' then 'edition' else 'event' end;
  effective_url text := coalesce(new_row ->> 'source_url', new_row ->> 'official_url', old_row ->> 'source_url', old_row ->> 'official_url');
begin
  effective_source := case
    when configured_source in ('manual_admin', 'import', 'crawler', 'user_report', 'organizer', 'system') then configured_source
    when (select auth.uid()) is not null then 'manual_admin'
    else 'system'
  end;

  if tg_op = 'INSERT' then
    insert into public.event_audit_log (
      entity_type, entity_id, field_name, new_value, change_source,
      changed_by, changed_by_process, reason, source_url
    ) values (
      affected_type, affected_id, '__created__', new_row, effective_source,
      (select auth.uid()), current_user, nullif(current_setting('app.change_reason', true), ''), effective_url
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.event_audit_log (
      entity_type, entity_id, field_name, old_value, change_source,
      changed_by, changed_by_process, reason, source_url
    ) values (
      affected_type, affected_id, '__deleted__', old_row, effective_source,
      (select auth.uid()), current_user, nullif(current_setting('app.change_reason', true), ''), effective_url
    );
    return old;
  end if;

  for changed_field in
    select n.key, o.value as old_value, n.value as new_value
    from jsonb_each(new_row) n
    left join jsonb_each(old_row) o on o.key = n.key
    where n.value is distinct from o.value
      and n.key <> 'updated_at'
  loop
    insert into public.event_audit_log (
      entity_type, entity_id, field_name, old_value, new_value, change_source,
      changed_by, changed_by_process, reason, source_url
    ) values (
      affected_type, affected_id, changed_field.key,
      changed_field.old_value, changed_field.new_value, effective_source,
      (select auth.uid()), current_user, nullif(current_setting('app.change_reason', true), ''), effective_url
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.audit_event_entity_changes() from public, anon, authenticated;

create or replace function private.normalize_event_master()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  base_key text;
  base_slug text;
begin
  new.canonical_name := coalesce(nullif(btrim(new.canonical_name), ''), nullif(btrim(new.event_name), ''), 'Event ' || new.id);
  new.event_name := coalesce(nullif(btrim(new.event_name), ''), new.canonical_name);
  base_key := private.slugify_event(
    new.canonical_name || '-' || coalesce(nullif(btrim(new.city), ''), 'unknown') || '-' || coalesce(nullif(btrim(new.country), ''), 'unknown')
  );
  base_slug := private.slugify_event(new.canonical_name);

  if new.canonical_key is null or btrim(new.canonical_key) = '' then
    new.canonical_key := base_key;
    if exists (select 1 from public.events e where e.canonical_key = new.canonical_key and e.id <> new.id) then
      new.canonical_key := base_key || '-event-' || new.id;
    end if;
  end if;

  if new.slug is null or btrim(new.slug) = '' then
    new.slug := base_slug;
    if exists (select 1 from public.events e where e.slug = new.slug and e.id <> new.id) then
      new.slug := base_slug || '-event-' || new.id;
    end if;
  end if;

  new.official_url := coalesce(nullif(btrim(new.official_url), ''), nullif(btrim(new.event_url), ''), nullif(btrim(new.source_url), ''));
  new.publication_status := case when new.status = 'approved' then 'published' when new.status = 'archived' then 'archived' else 'draft' end;
  new.event_status := case when new.status in ('archived', 'rejected', 'duplicate') then 'inactive' else 'active' end;
  return new;
end;
$$;

create or replace function private.sync_legacy_event_edition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  parsed_date date := private.try_parse_event_date(new.date);
  target_year smallint := coalesce(
    extract(year from parsed_date)::smallint,
    nullif(substring(new.date from '(20\d{2})'), '')::smallint,
    extract(year from new.created_at)::smallint
  );
  stable_key text := lower(
    btrim(coalesce(new.event_name, '')) || '|' || btrim(coalesce(new.date, '')) || '|' ||
    btrim(coalesce(new.city, '')) || '|' || btrim(coalesce(new.country, ''))
  );
begin
  insert into public.event_editions (
    event_id, edition_year, edition_slug, legacy_event_key, start_date, end_date,
    registration_url, registration_status, edition_status, publication_status,
    race_formats, legacy_distance, source_url, verification_status, data_confidence,
    needs_review, review_priority, last_verified_at, next_check_at, created_at, updated_at
  ) values (
    new.id, target_year, new.slug || '-' || target_year, stable_key, parsed_date, parsed_date,
    nullif(btrim(new.event_url), ''),
    case new.registration_status when 'registration_open' then 'registration_open' when 'sold_out' then 'sold_out' when 'cancelled' then 'cancelled' when 'registration_not_open' then 'registration_not_open' else 'unknown' end,
    case when new.status in ('rejected', 'duplicate', 'archived') then 'inactive' when parsed_date is null then 'date_unconfirmed' when parsed_date < current_date then 'completed' else 'scheduled' end,
    new.publication_status,
    case when nullif(btrim(new.distance), '') is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('label', btrim(new.distance))) end,
    nullif(btrim(new.distance), ''),
    coalesce(nullif(btrim(new.source_url), ''), nullif(btrim(new.event_url), '')),
    new.verification_status, new.data_confidence, new.needs_review, new.review_priority,
    new.last_verified_at, new.next_check_at, new.created_at, new.updated_at
  )
  on conflict (event_id, edition_year) do update set
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    registration_url = excluded.registration_url,
    registration_status = excluded.registration_status,
    edition_status = excluded.edition_status,
    publication_status = excluded.publication_status,
    race_formats = excluded.race_formats,
    legacy_distance = excluded.legacy_distance,
    source_url = excluded.source_url,
    verification_status = excluded.verification_status,
    data_confidence = excluded.data_confidence,
    needs_review = excluded.needs_review,
    review_priority = excluded.review_priority,
    last_verified_at = excluded.last_verified_at,
    next_check_at = excluded.next_check_at,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.normalize_event_master() from public, anon, authenticated;
revoke all on function private.sync_legacy_event_edition() from public, anon, authenticated;

drop trigger if exists events_normalize_master on public.events;
create trigger events_normalize_master
before insert or update on public.events
for each row execute function private.normalize_event_master();

drop trigger if exists events_sync_legacy_edition on public.events;
create trigger events_sync_legacy_edition
after insert or update of date, distance, event_url, source_url, status, registration_status,
  verification_status, data_confidence, needs_review, review_priority, last_verified_at, next_check_at
on public.events
for each row execute function private.sync_legacy_event_edition();

drop trigger if exists events_audit_changes on public.events;
create trigger events_audit_changes
after insert or update or delete on public.events
for each row execute function private.audit_event_entity_changes();

drop trigger if exists event_editions_audit_changes on public.event_editions;
create trigger event_editions_audit_changes
after insert or update or delete on public.event_editions
for each row execute function private.audit_event_entity_changes();

drop trigger if exists event_editions_set_updated_at on public.event_editions;
create trigger event_editions_set_updated_at
before update on public.event_editions
for each row execute function private.set_updated_at();

drop trigger if exists event_sources_set_updated_at on public.event_sources;
create trigger event_sources_set_updated_at
before update on public.event_sources
for each row execute function private.set_updated_at();

drop trigger if exists validation_issues_set_updated_at on public.validation_issues;
create trigger validation_issues_set_updated_at
before update on public.validation_issues
for each row execute function private.set_updated_at();

create table if not exists private.validation_issue_detections (
  run_id uuid not null,
  event_id bigint not null,
  edition_id uuid,
  severity text not null,
  rule_code text not null,
  description text not null
);

create index if not exists validation_issue_detections_run_idx
  on private.validation_issue_detections (run_id);

revoke all on private.validation_issue_detections from public, anon, authenticated;
create or replace function public.run_event_validation(
  p_event_id bigint default null,
  p_edition_id uuid default null
)
returns table(severity text, issue_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  validation_run_id uuid := gen_random_uuid();
begin
  if (select auth.uid()) is not null and not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;


  insert into private.validation_issue_detections
  select validation_run_id, e.id, null, 'critical', 'missing_event_name', 'Event name is missing.'
  from public.events e
  where (p_event_id is null or e.id = p_event_id)
    and nullif(btrim(coalesce(e.canonical_name, e.event_name)), '') is null;

  insert into private.validation_issue_detections
  select validation_run_id, e.id, null, 'error', 'missing_country', 'Country is missing.'
  from public.events e
  where (p_event_id is null or e.id = p_event_id)
    and nullif(btrim(e.country), '') is null;

  insert into private.validation_issue_detections
  select validation_run_id, e.id, null, 'error', 'missing_source', 'No official or operational source is available.'
  from public.events e
  where (p_event_id is null or e.id = p_event_id)
    and nullif(btrim(coalesce(e.official_url, e.source_url, e.event_url)), '') is null
    and not exists (select 1 from public.event_sources s where s.event_id = e.id and s.is_active);

  insert into private.validation_issue_detections
  select validation_run_id, e.id, null, 'error', 'invalid_official_url', 'Official URL is invalid.'
  from public.events e
  where (p_event_id is null or e.id = p_event_id)
    and nullif(btrim(e.official_url), '') is not null
    and e.official_url !~* '^https?://[^[:space:]]+$';

  insert into private.validation_issue_detections
  select validation_run_id, e.id, null, 'error', 'invalid_coordinates', 'Latitude or longitude is missing or outside valid world bounds.'
  from public.events e
  where (p_event_id is null or e.id = p_event_id)
    and (
      private.try_parse_coordinate(e.latitude) is null
      or private.try_parse_coordinate(e.longitude) is null
      or private.try_parse_coordinate(e.latitude) not between -90 and 90
      or private.try_parse_coordinate(e.longitude) not between -180 and 180
    );

  insert into private.validation_issue_detections
  select validation_run_id, e.id, null, 'error', 'coordinates_outside_country', 'Coordinates are outside the configured country bounds.'
  from public.events e
  join private.country_coordinate_bounds b on b.country_key = lower(btrim(e.country))
  where (p_event_id is null or e.id = p_event_id)
    and private.try_parse_coordinate(e.latitude) is not null
    and private.try_parse_coordinate(e.longitude) is not null
    and (
      private.try_parse_coordinate(e.latitude) not between b.min_lat and b.max_lat
      or private.try_parse_coordinate(e.longitude) not between b.min_lon and b.max_lon
    );

  insert into private.validation_issue_detections
  select validation_run_id, e.id, null, 'warning', 'missing_image', 'Event image is missing.'
  from public.events e
  where (p_event_id is null or e.id = p_event_id)
    and nullif(btrim(e.image), '') is null;

  insert into private.validation_issue_detections
  select validation_run_id, e.id, null, 'warning', 'missing_organizer', 'Organizer is missing.'
  from public.events e
  where (p_event_id is null or e.id = p_event_id)
    and e.organizer_id is null and nullif(btrim(e.organizer_name), '') is null;

  insert into private.validation_issue_detections
  select validation_run_id, e.id, null, 'warning', 'verification_stale', 'Event has not been verified for more than 180 days.'
  from public.events e
  where (p_event_id is null or e.id = p_event_id)
    and (e.last_verified_at is null or e.last_verified_at < now() - interval '180 days');

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'error', 'invalid_date', 'Edition start date is missing.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and ee.start_date is null;

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'error', 'start_after_end', 'Edition start date is after its end date.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and ee.start_date is not null and ee.end_date is not null and ee.start_date > ee.end_date;

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'error', 'missing_edition_source', 'Edition source URL is missing.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and nullif(btrim(ee.source_url), '') is null
    and not exists (select 1 from public.event_sources s where s.edition_id = ee.id and s.is_active);

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'error', 'invalid_edition_url', 'Edition source or registration URL is invalid.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and (
      (nullif(btrim(ee.source_url), '') is not null and ee.source_url !~* '^https?://[^[:space:]]+$')
      or (nullif(btrim(ee.registration_url), '') is not null and ee.registration_url !~* '^https?://[^[:space:]]+$')
    );

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'warning', 'missing_start_time', 'Edition start time is missing.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and ee.start_time is null;

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'warning', 'missing_registration_url', 'Registration URL is missing.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and nullif(btrim(ee.registration_url), '') is null;

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'warning', 'missing_distance', 'Distance or race format is missing.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and (ee.race_formats is null or ee.race_formats = '[]'::jsonb);

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'warning', 'missing_price', 'Price information is missing.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and ee.price_min is null and ee.price_max is null and ee.price_details = '{}'::jsonb;

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'warning', 'past_event_scheduled', 'Past edition is still marked as scheduled.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and ee.start_date < current_date and ee.edition_status = 'scheduled';

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'warning', 'future_date_unverified', 'Future edition date is not verified.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and ee.start_date >= current_date and ee.verification_status <> 'verified';

  insert into private.validation_issue_detections
  select validation_run_id, ee.event_id, ee.id, 'warning', 'edition_verification_stale', 'Edition has not been verified for more than 180 days.'
  from public.event_editions ee
  where (p_event_id is null or ee.event_id = p_event_id)
    and (p_edition_id is null or ee.id = p_edition_id)
    and (ee.last_verified_at is null or ee.last_verified_at < now() - interval '180 days');

  insert into private.validation_issue_detections
  select validation_run_id, grouped.event_id, null, 'error', 'duplicate_edition_year', 'Multiple editions exist for the same event and year.'
  from (
    select event_id, edition_year from public.event_editions
    where p_event_id is null or event_id = p_event_id
    group by event_id, edition_year having count(*) > 1
  ) grouped;

  insert into public.validation_issues (
    event_id, edition_id, severity, rule_code, description, status, resolved_at, resolved_by
  )
  select detected.event_id, detected.edition_id, detected.severity, detected.rule_code, detected.description, 'open', null, null
  from private.validation_issue_detections detected
  where detected.run_id = validation_run_id
  on conflict (entity_scope, rule_code) do update set
    severity = excluded.severity,
    description = excluded.description,
    status = 'open',
    resolved_at = null,
    resolved_by = null,
    updated_at = now();

  update public.validation_issues existing
  set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid()), updated_at = now()
  where existing.status = 'open'
    and (p_event_id is null or existing.event_id = p_event_id)
    and (p_edition_id is null or existing.edition_id = p_edition_id)
    and not exists (
      select 1 from private.validation_issue_detections detected
      where detected.run_id = validation_run_id
        and detected.event_id = existing.event_id
        and detected.edition_id is not distinct from existing.edition_id
        and detected.rule_code = existing.rule_code
    );

  delete from private.validation_issue_detections detected
  where detected.run_id = validation_run_id;

  return query
  select vi.severity, count(*)
  from public.validation_issues vi
  where vi.status = 'open'
    and (p_event_id is null or vi.event_id = p_event_id)
    and (p_edition_id is null or vi.edition_id = p_edition_id)
  group by vi.severity
  order by case vi.severity when 'critical' then 1 when 'error' then 2 when 'warning' then 3 else 4 end;
end;
$$;

revoke all on function public.run_event_validation(bigint, uuid) from public, anon;
grant execute on function public.run_event_validation(bigint, uuid) to authenticated, service_role;

-- Public discovery compatibility view: one row per published edition and a
-- stable event_key that no longer changes when an edition date is corrected.
create or replace view public.public_event_discovery
with (security_invoker = true)
as
select
  e.id,
  e.id as event_id,
  ee.id as edition_id,
  ee.legacy_event_key as event_key,
  e.canonical_name as event_name,
  e.sport,
  to_char(ee.start_date, 'DD.MM.YYYY') as date,
  e.city,
  e.country,
  e.address,
  e.latitude,
  e.longitude,
  coalesce(ee.legacy_distance, ee.race_formats -> 0 ->> 'label') as distance,
  e.description,
  e.image,
  coalesce(ee.registration_url, e.official_url, ee.source_url) as event_url,
  ee.source_url,
  ee.verification_status,
  ee.review_priority as priority,
  ee.last_verified_at as last_checked,
  ee.next_check_at as next_check,
  ee.edition_status as event_status,
  ee.edition_slug,
  e.slug
from public.events e
join public.event_editions ee on ee.event_id = e.id
where e.publication_status = 'published'
  and ee.publication_status = 'published';

-- RLS and grants are intentionally explicit for the 2026 Data API defaults.
alter table public.event_editions enable row level security;
alter table public.event_sources enable row level security;
alter table public.validation_issues enable row level security;
alter table public.event_audit_log enable row level security;

drop policy if exists "Public can read approved events" on public.events;
drop policy if exists "Authenticated can read accessible events" on public.events;

create policy "Public can read published event brands"
on public.events for select to anon
using (status = 'approved' and publication_status = 'published');

create policy "Authenticated can read accessible event brands"
on public.events for select to authenticated
using (
  (status = 'approved' and publication_status = 'published')
  or created_by = (select auth.uid())
  or (select private.is_admin())
);

create policy event_editions_public_read
on public.event_editions for select to anon
using (
  publication_status = 'published'
  and exists (
    select 1 from public.events e
    where e.id = event_id and e.status = 'approved' and e.publication_status = 'published'
  )
);

create policy event_editions_authenticated_read
on public.event_editions for select to authenticated
using (
  (
    publication_status = 'published'
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'approved' and e.publication_status = 'published'
    )
  )
  or (select private.is_admin())
);

create policy event_editions_admin_insert
on public.event_editions for insert to authenticated
with check ((select private.is_admin()));

create policy event_editions_admin_update
on public.event_editions for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy event_editions_admin_delete
on public.event_editions for delete to authenticated
using ((select private.is_admin()));

create policy event_sources_admin_select
on public.event_sources for select to authenticated
using ((select private.is_admin()));
create policy event_sources_admin_insert
on public.event_sources for insert to authenticated
with check ((select private.is_admin()));
create policy event_sources_admin_update
on public.event_sources for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy event_sources_admin_delete
on public.event_sources for delete to authenticated
using ((select private.is_admin()));

create policy validation_issues_admin_select
on public.validation_issues for select to authenticated
using ((select private.is_admin()));
create policy validation_issues_admin_insert
on public.validation_issues for insert to authenticated
with check ((select private.is_admin()));
create policy validation_issues_admin_update
on public.validation_issues for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy event_audit_log_admin_select
on public.event_audit_log for select to authenticated
using ((select private.is_admin()));

revoke all on public.event_editions from anon, authenticated;
grant select on public.event_editions to anon, authenticated;
grant insert, update, delete on public.event_editions to authenticated;

revoke all on public.event_sources from anon, authenticated;
grant select, insert, update, delete on public.event_sources to authenticated;

revoke all on public.validation_issues from anon, authenticated;
grant select, insert, update on public.validation_issues to authenticated;

revoke all on public.event_audit_log from anon, authenticated;
grant select on public.event_audit_log to authenticated;

revoke all on public.public_event_discovery from public, anon, authenticated;
grant select on public.public_event_discovery to anon, authenticated;

grant select, insert, update, delete on public.event_editions to service_role;
grant select, insert, update, delete on public.event_sources to service_role;
grant select, insert, update, delete on public.validation_issues to service_role;
grant select, insert on public.event_audit_log to service_role;

-- Initialize the idempotent issue queue for all migrated rows.
select * from public.run_event_validation();

comment on table public.events is
  'Durable event brands. Legacy occurrence columns remain temporarily for client compatibility.';
comment on table public.event_editions is
  'Year-specific event occurrences. Never overwrite a past edition with a later year.';
comment on table public.event_sources is
  'Private operational source registry for verification and future crawlers.';
comment on table public.event_detail_sources is
  'Public field-level citations used by published event knowledge pages.';
comment on table public.validation_issues is
  'Idempotent event and edition validation queue, visible only to admins and server processes.';
comment on table public.event_audit_log is
  'Append-only audit trail generated by event and edition triggers.';

commit;
