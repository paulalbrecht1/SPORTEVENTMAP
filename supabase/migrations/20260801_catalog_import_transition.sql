-- Controlled transition from the curated CSV catalog to Supabase as source of truth.
-- Imports are staged, counted and finalized explicitly. Existing public rows stay
-- public during staging and all touched rows are snapshotted for rollback.

begin;

alter table public.events
  add column if not exists catalog_import_id uuid;
alter table public.event_editions
  add column if not exists catalog_import_id uuid;
alter table public.event_sources
  add column if not exists catalog_import_id uuid;

create index if not exists events_catalog_import_idx
  on public.events (catalog_import_id) where catalog_import_id is not null;
create index if not exists event_editions_catalog_import_idx
  on public.event_editions (catalog_import_id) where catalog_import_id is not null;
create index if not exists event_sources_catalog_import_idx
  on public.event_sources (catalog_import_id) where catalog_import_id is not null;

create table if not exists private.catalog_import_backups (
  import_id uuid primary key,
  source_name text not null,
  expected_events integer not null check (expected_events > 0),
  expected_editions integer not null check (expected_editions > 0),
  import_status text not null default 'staging'
    check (import_status in ('staging', 'validated', 'completed', 'failed', 'rolled_back')),
  events_snapshot jsonb not null,
  editions_snapshot jsonb not null,
  sources_snapshot jsonb not null,
  existing_event_ids bigint[] not null,
  existing_edition_ids uuid[] not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz
);

revoke all on private.catalog_import_backups from public, anon, authenticated;

create table if not exists private.event_catalog_identity_aliases (
  catalog_key text primary key,
  event_id bigint not null unique references public.events(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Reconcile the one reviewed live spelling variant without hardcoding its id.
insert into private.event_catalog_identity_aliases (catalog_key, event_id, reason)
select
  'inschildesche-lauf-bielefeld-deutschland',
  min(id),
  'Reviewed CSV spelling replaces the legacy live spelling while preserving the event id.'
from public.events
where canonical_key = 'inschildische-lauf-bielefeld-deutschland'
  and publication_status = 'published'
having count(*) = 1
on conflict (catalog_key) do nothing;

revoke all on private.event_catalog_identity_aliases from public, anon, authenticated;

create or replace function private.begin_catalog_import(
  p_import_id uuid,
  p_source_name text,
  p_expected_events integer,
  p_expected_editions integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'service role required' using errcode = '42501';
  end if;

  insert into private.catalog_import_backups (
    import_id, source_name, expected_events, expected_editions,
    events_snapshot, editions_snapshot, sources_snapshot,
    existing_event_ids, existing_edition_ids
  )
  select
    p_import_id,
    p_source_name,
    p_expected_events,
    p_expected_editions,
    coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.events e), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(ee) order by ee.id) from public.event_editions ee), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(es) order by es.id) from public.event_sources es), '[]'::jsonb),
    coalesce((select array_agg(e.id order by e.id) from public.events e), '{}'::bigint[]),
    coalesce((select array_agg(ee.id order by ee.id) from public.event_editions ee), '{}'::uuid[])
  on conflict (import_id) do nothing;

  insert into public.data_workflow_runs (
    job_type, run_status, trigger_source, metadata
  ) values (
    'catalog_import', 'running', 'manual_admin',
    jsonb_build_object(
      'import_id', p_import_id,
      'source_name', p_source_name,
      'expected_events', p_expected_events,
      'expected_editions', p_expected_editions
    )
  );
end;
$$;

create or replace function private.import_catalog_events(
  p_import_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  item jsonb;
  target_id bigint;
  imported integer := 0;
begin
  if not exists (
    select 1 from private.catalog_import_backups
    where import_id = p_import_id and import_status = 'staging'
  ) then
    raise exception 'catalog import is not in staging state' using errcode = '55000';
  end if;

  perform set_config('app.change_source', 'import', true);
  perform set_config('app.change_reason', 'Controlled curated catalog import ' || p_import_id::text, true);

  for item in select value from jsonb_array_elements(p_rows)
  loop
    select e.id into target_id
    from public.events e
    where e.canonical_key = item ->> 'canonical_key';

    if target_id is null then
      select a.event_id into target_id
      from private.event_catalog_identity_aliases a
      where a.catalog_key = item ->> 'canonical_key';
    end if;

    if target_id is null then
      insert into public.events (
        canonical_name, canonical_key, slug, event_name, sport, country, city,
        address, latitude, longitude, description, image, official_url,
        event_url, source_url, status, publication_status, event_status,
        verification_status, data_confidence, needs_review, review_priority,
        last_verified_at, next_check_at, date, distance, registration_status,
        catalog_import_id
      ) values (
        item ->> 'canonical_name', item ->> 'canonical_key', item ->> 'slug',
        item ->> 'event_name', item ->> 'sport', item ->> 'country', item ->> 'city',
        nullif(item ->> 'address', ''), nullif(item ->> 'latitude', ''), nullif(item ->> 'longitude', ''),
        nullif(item ->> 'description', ''), nullif(item ->> 'image', ''), nullif(item ->> 'official_url', ''),
        nullif(item ->> 'event_url', ''), nullif(item ->> 'source_url', ''),
        'staging', 'draft', 'active', item ->> 'verification_status',
        (item ->> 'data_confidence')::numeric, (item ->> 'needs_review')::boolean,
        item ->> 'review_priority', nullif(item ->> 'last_verified_at', '')::timestamptz,
        nullif(item ->> 'next_check_at', '')::timestamptz, item ->> 'date', item ->> 'distance',
        coalesce(nullif(item ->> 'registration_status', ''), 'unclear'), p_import_id
      ) returning id into target_id;
    else
      update public.events set
        canonical_name = item ->> 'canonical_name',
        canonical_key = item ->> 'canonical_key',
        slug = item ->> 'slug',
        event_name = item ->> 'event_name',
        sport = item ->> 'sport',
        country = item ->> 'country',
        city = item ->> 'city',
        address = nullif(item ->> 'address', ''),
        latitude = nullif(item ->> 'latitude', ''),
        longitude = nullif(item ->> 'longitude', ''),
        description = nullif(item ->> 'description', ''),
        image = nullif(item ->> 'image', ''),
        official_url = nullif(item ->> 'official_url', ''),
        event_url = nullif(item ->> 'event_url', ''),
        source_url = nullif(item ->> 'source_url', ''),
        verification_status = item ->> 'verification_status',
        data_confidence = (item ->> 'data_confidence')::numeric,
        needs_review = (item ->> 'needs_review')::boolean,
        review_priority = item ->> 'review_priority',
        last_verified_at = nullif(item ->> 'last_verified_at', '')::timestamptz,
        next_check_at = nullif(item ->> 'next_check_at', '')::timestamptz,
        date = item ->> 'date',
        distance = item ->> 'distance',
        registration_status = coalesce(nullif(item ->> 'registration_status', ''), 'unclear'),
        catalog_import_id = p_import_id
      where id = target_id;
    end if;

    imported := imported + 1;
  end loop;

  return imported;
end;
$$;

create or replace function private.import_catalog_editions(
  p_import_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  item jsonb;
  target_event_id bigint;
  imported integer := 0;
begin
  if not exists (
    select 1 from private.catalog_import_backups
    where import_id = p_import_id and import_status = 'staging'
  ) then
    raise exception 'catalog import is not in staging state' using errcode = '55000';
  end if;

  perform set_config('app.change_source', 'import', true);
  perform set_config('app.change_reason', 'Controlled curated catalog import ' || p_import_id::text, true);

  for item in select value from jsonb_array_elements(p_rows)
  loop
    select id into target_event_id from public.events
    where canonical_key = item ->> 'canonical_key';
    if target_event_id is null then
      raise exception 'event not imported for canonical key %', item ->> 'canonical_key';
    end if;

    insert into public.event_editions (
      event_id, edition_year, edition_slug, legacy_event_key, start_date, end_date,
      registration_url, registration_status, edition_status, publication_status,
      race_formats, legacy_distance, source_url, verification_status, data_confidence,
      needs_review, review_priority, last_verified_at, next_check_at, catalog_import_id
    ) values (
      target_event_id, (item ->> 'edition_year')::smallint, item ->> 'edition_slug',
      item ->> 'legacy_event_key', nullif(item ->> 'start_date', '')::date,
      nullif(item ->> 'end_date', '')::date, nullif(item ->> 'registration_url', ''),
      item ->> 'registration_status', item ->> 'edition_status', 'draft',
      coalesce(item -> 'race_formats', '[]'::jsonb), nullif(item ->> 'legacy_distance', ''),
      nullif(item ->> 'source_url', ''), item ->> 'verification_status',
      (item ->> 'data_confidence')::numeric, (item ->> 'needs_review')::boolean,
      item ->> 'review_priority', nullif(item ->> 'last_verified_at', '')::timestamptz,
      nullif(item ->> 'next_check_at', '')::timestamptz, p_import_id
    )
    on conflict (event_id, edition_year) do update set
      edition_slug = excluded.edition_slug,
      legacy_event_key = excluded.legacy_event_key,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      registration_url = excluded.registration_url,
      registration_status = excluded.registration_status,
      edition_status = excluded.edition_status,
      race_formats = excluded.race_formats,
      legacy_distance = excluded.legacy_distance,
      source_url = excluded.source_url,
      verification_status = excluded.verification_status,
      data_confidence = excluded.data_confidence,
      needs_review = excluded.needs_review,
      review_priority = excluded.review_priority,
      last_verified_at = excluded.last_verified_at,
      next_check_at = excluded.next_check_at,
      catalog_import_id = excluded.catalog_import_id,
      updated_at = now();

    imported := imported + 1;
  end loop;

  return imported;
end;
$$;

create or replace function private.finalize_catalog_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  expected_event_count integer;
  expected_edition_count integer;
  actual_event_count integer;
  actual_edition_count integer;
  source_count integer;
begin
  select expected_events, expected_editions
  into expected_event_count, expected_edition_count
  from private.catalog_import_backups
  where import_id = p_import_id and import_status = 'staging'
  for update;

  if expected_event_count is null then
    raise exception 'catalog import is not in staging state' using errcode = '55000';
  end if;

  select count(*) into actual_event_count from public.events where catalog_import_id = p_import_id;
  select count(*) into actual_edition_count from public.event_editions where catalog_import_id = p_import_id;

  if actual_event_count <> expected_event_count or actual_edition_count <> expected_edition_count then
    raise exception 'catalog import count mismatch: events %/%, editions %/%',
      actual_event_count, expected_event_count, actual_edition_count, expected_edition_count;
  end if;

  if exists (
    select 1 from public.event_editions
    where catalog_import_id = p_import_id
    group by event_id, edition_year having count(*) > 1
  ) then
    raise exception 'duplicate event editions detected' using errcode = '23505';
  end if;

  perform set_config('app.change_source', 'import', true);
  perform set_config('app.change_reason', 'Approved full catalog import ' || p_import_id::text, true);

  update public.events
  set status = 'approved', publication_status = 'published', event_status = 'active'
  where catalog_import_id = p_import_id;

  update public.event_editions
  set publication_status = 'published'
  where catalog_import_id = p_import_id;

  insert into public.event_sources (
    event_id, edition_id, source_type, source_url, source_priority, parser_type,
    is_active, next_fetch_at, crawl_status, catalog_import_id
  )
  select
    ee.event_id, ee.id, 'official_event_website', ee.source_url, 10, 'html',
    true, coalesce(ee.next_check_at, now() + interval '30 days'), 'pending', p_import_id
  from public.event_editions ee
  where ee.catalog_import_id = p_import_id and ee.source_url is not null
  on conflict do nothing;

  get diagnostics source_count = row_count;

  update private.catalog_import_backups
  set import_status = 'completed', completed_at = now()
  where import_id = p_import_id;

  update public.data_workflow_runs
  set run_status = 'succeeded', finished_at = now(), processed_count = actual_edition_count,
      changed_count = actual_event_count,
      metadata = metadata || jsonb_build_object('created_sources', source_count)
  where job_type = 'catalog_import'
    and metadata ->> 'import_id' = p_import_id::text
    and run_status = 'running';

  return jsonb_build_object(
    'import_id', p_import_id,
    'events', actual_event_count,
    'editions', actual_edition_count,
    'sources_created', source_count,
    'status', 'completed'
  );
end;
$$;

revoke all on function private.begin_catalog_import(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function private.import_catalog_events(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.import_catalog_editions(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.finalize_catalog_import(uuid) from public, anon, authenticated;

comment on table private.catalog_import_backups is
  'Full pre-import snapshots and expected counts for the separately approved curated catalog import.';
comment on column public.events.catalog_import_id is
  'Identifies the controlled catalog import that last touched this event.';

commit;
