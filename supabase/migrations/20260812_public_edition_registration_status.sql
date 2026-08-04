-- Expose the edition's registration state separately from technical verification.
-- The column is appended to preserve the existing CREATE OR REPLACE view layout.

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
  edition.registration_status
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
  edition.registration_status
from public.events event
join public.event_editions edition on edition.event_id = event.id
where event.status = 'approved'
  and event.publication_status = 'published'
  and edition.publication_status = 'published';
