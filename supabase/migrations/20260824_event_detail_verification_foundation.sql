-- Event detail foundation for stable event-brand facts, edition facts and
-- explicit source-backed verification. This migration changes no publication
-- state and performs no content backfill.

begin;

alter table public.events
  add column if not exists organizer_url text;

alter table public.events
  drop constraint if exists events_organizer_url_check;

alter table public.events
  add constraint events_organizer_url_check
  check (organizer_url is null or organizer_url ~* '^https?://[^[:space:]]+$')
  not valid;

alter table public.events validate constraint events_organizer_url_check;

-- The legacy Event Knowledge tables predate the stable event/edition model.
-- New knowledge records can now declare their scope and link to the canonical
-- parent while existing unlinked records remain readable for a small follow-up
-- content migration.
alter table public.event_details
  add column if not exists event_brand_id bigint references public.events(id) on delete cascade,
  add column if not exists edition_id uuid references public.event_editions(id) on delete cascade,
  add column if not exists knowledge_scope text;

update public.event_details
set knowledge_scope = 'legacy_mixed'
where knowledge_scope is null;

alter table public.event_details
  alter column knowledge_scope set default 'edition',
  alter column knowledge_scope set not null;

alter table public.event_details
  drop constraint if exists event_details_knowledge_scope_check,
  drop constraint if exists event_details_scope_reference_check;

alter table public.event_details
  add constraint event_details_knowledge_scope_check
    check (knowledge_scope in ('brand', 'edition', 'legacy_mixed')),
  add constraint event_details_scope_reference_check
    check (
      (knowledge_scope = 'brand' and edition_id is null)
      or (
        knowledge_scope = 'edition'
        and (
          (event_brand_id is null and edition_id is null)
          or (event_brand_id is not null and edition_id is not null)
        )
      )
      or (
        knowledge_scope = 'legacy_mixed'
        and event_brand_id is null
        and edition_id is null
      )
    );

create index if not exists event_details_brand_scope_idx
  on public.event_details(event_brand_id, knowledge_scope);

create index if not exists event_details_edition_idx
  on public.event_details(edition_id)
  where edition_id is not null;

create or replace function private.enforce_event_detail_scope_parent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.edition_id is not null and not exists (
    select 1
    from public.event_editions edition
    where edition.id = new.edition_id
      and edition.event_id = new.event_brand_id
  ) then
    raise exception 'event detail edition must belong to event brand %', new.event_brand_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_event_detail_scope_parent()
from public, anon, authenticated;

drop trigger if exists event_details_scope_parent_check on public.event_details;
create trigger event_details_scope_parent_check
before insert or update of event_brand_id, edition_id, knowledge_scope
on public.event_details
for each row execute function private.enforce_event_detail_scope_parent();

comment on column public.events.organizer_name is
  'Stable event-brand organizer: the organization officially responsible for staging the event; never a data source or calendar aggregator.';
comment on column public.events.organizer_url is
  'Verified official website of the organizer organization, distinct from the event and registration URLs.';
comment on column public.events.last_verified_at is
  'Time stable event-brand facts were last checked against a real public source; never a build, export or row-update timestamp.';
comment on column public.event_editions.last_verified_at is
  'Time facts for this exact edition were last checked against a real public source; preferred Last checked value on an edition detail page.';
comment on column public.event_sources.last_fetched_at is
  'Technical source-monitor fetch time. It does not mean the event, edition or every displayed field was verified.';
comment on column public.event_details.knowledge_scope is
  'Whether the entire knowledge record describes the reusable event brand or one exact edition. legacy_mixed marks only pre-foundation rows awaiting reviewed separation.';
comment on column public.event_details.event_brand_id is
  'Canonical event-brand parent for new knowledge records. Null is retained only for legacy records awaiting a small reviewed backfill.';
comment on column public.event_details.edition_id is
  'Exact edition parent for edition-scoped knowledge. Brand-scoped knowledge must leave this null.';
comment on column public.event_details.organizer is
  'Legacy organizer copy. Public detail pages use events.organizer_name; retain only until linked legacy knowledge is reviewed.';
comment on column public.event_details.last_checked is
  'Legacy knowledge verification date. It is not a source fetch, build or export timestamp.';

-- Keep the legacy column order and append explicit brand/edition fields so
-- CREATE OR REPLACE remains compatible with existing Data API clients.
create or replace view public.public_event_discovery
with (security_invoker = true)
as
select
  event.id,
  event.id as event_id,
  edition.id as edition_id,
  edition.legacy_event_key as event_key,
  event.canonical_name as event_name,
  event.sport,
  to_char(edition.start_date, 'DD.MM.YYYY') as date,
  event.city,
  event.country,
  event.address,
  event.latitude,
  event.longitude,
  coalesce(edition.legacy_distance, edition.race_formats -> 0 ->> 'label') as distance,
  event.description,
  event.image,
  coalesce(edition.registration_url, event.official_url, edition.source_url) as event_url,
  edition.source_url,
  edition.verification_status,
  edition.review_priority as priority,
  edition.last_verified_at as last_checked,
  edition.next_check_at as next_check,
  edition.edition_status as event_status,
  edition.edition_slug,
  event.slug,
  edition.edition_year,
  edition.discovery_status,
  edition.results_status,
  edition.registration_status,
  event.organizer_name,
  event.organizer_url,
  event.official_url,
  edition.registration_url,
  event.verification_status as brand_verification_status,
  event.last_verified_at as brand_last_verified_at,
  edition.verification_status as edition_verification_status,
  edition.last_verified_at as edition_last_verified_at,
  edition.race_formats
from public.events event
join lateral (
  select candidate.*
  from public.event_editions candidate
  where candidate.event_id = event.id
    and candidate.publication_status = 'published'
    and candidate.discovery_status = 'active'
    and candidate.edition_status not in ('cancelled', 'inactive', 'completed')
    and (candidate.start_date is null or coalesce(candidate.end_date, candidate.start_date) >= current_date)
  order by candidate.start_date asc nulls last, candidate.edition_year asc
  limit 1
) edition on true
where event.status = 'approved'
  and event.publication_status = 'published';

create or replace view public.public_event_archive
with (security_invoker = true)
as
select
  event.id,
  event.id as event_id,
  edition.id as edition_id,
  edition.legacy_event_key as event_key,
  event.canonical_name as event_name,
  event.sport,
  to_char(edition.start_date, 'DD.MM.YYYY') as date,
  event.city,
  event.country,
  event.address,
  event.latitude,
  event.longitude,
  coalesce(edition.legacy_distance, edition.race_formats -> 0 ->> 'label') as distance,
  event.description,
  event.image,
  coalesce(edition.registration_url, event.official_url, edition.source_url) as event_url,
  edition.source_url,
  edition.verification_status,
  edition.review_priority as priority,
  edition.last_verified_at as last_checked,
  edition.next_check_at as next_check,
  edition.edition_status as event_status,
  edition.edition_slug,
  edition.edition_year,
  edition.discovery_status,
  edition.results_status,
  event.slug,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'type', result.result_type,
      'title', result.title,
      'url', result.official_url,
      'published_at', result.published_at
    ) order by result.published_at desc nulls last, result.created_at desc)
    from public.edition_results result
    where result.edition_id = edition.id
      and result.publication_status = 'published'
      and result.result_status = 'available'
  ), '[]'::jsonb) as results,
  edition.registration_status,
  event.organizer_name,
  event.organizer_url,
  event.official_url,
  edition.registration_url,
  event.verification_status as brand_verification_status,
  event.last_verified_at as brand_last_verified_at,
  edition.verification_status as edition_verification_status,
  edition.last_verified_at as edition_last_verified_at,
  edition.race_formats
from public.events event
join public.event_editions edition on edition.event_id = event.id
where event.status = 'approved'
  and event.publication_status = 'published'
  and edition.publication_status = 'published';

commit;
