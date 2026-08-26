-- P1 data-quality batch 01, verified against official sources on 2026-08-26.
--
-- This is an idempotent, production-maintenance script rather than a schema
-- migration. It resolves records by canonical name and edition year, asserts
-- the expected cardinality, and lets the existing event audit triggers record
-- every factual change. No generated database ID is hard-coded.

begin;

select set_config('app.change_source', 'manual_admin', true);
select set_config(
  'app.change_reason',
  'P1 event-quality batch 01: official-source verification on 2026-08-26',
  true
);

do $$
declare
  event_count integer;
  edition_count integer;
begin
  select count(*) into event_count
  from public.events
  where canonical_name in (
    'Birklauf',
    'Edersee-Lauf',
    '30. Lauf um den Arendsee',
    'Altra Sunset Wattenmeer',
    'Blankeneser Heldenlauf',
    'Koberstädter Waldmarathon',
    'Kölner Halbmarathon',
    'Fehmarn Marathon',
    'Usedom Marathon'
  );

  select count(*) into edition_count
  from public.events event
  join public.event_editions edition on edition.event_id = event.id
  where event.canonical_name in (
    'Birklauf',
    'Edersee-Lauf',
    '30. Lauf um den Arendsee',
    'Altra Sunset Wattenmeer',
    'Blankeneser Heldenlauf',
    'Koberstädter Waldmarathon',
    'Kölner Halbmarathon',
    'Fehmarn Marathon',
    'Usedom Marathon'
  )
    and edition.edition_year = 2026;

  if event_count <> 9
     or edition_count <> 9
     or (
       select count(distinct canonical_name)
       from public.events
       where canonical_name in (
         'Birklauf',
         'Edersee-Lauf',
         '30. Lauf um den Arendsee',
         'Altra Sunset Wattenmeer',
         'Blankeneser Heldenlauf',
         'Koberstädter Waldmarathon',
         'Kölner Halbmarathon',
         'Fehmarn Marathon',
         'Usedom Marathon'
       )
     ) <> 9 then
    raise exception
      'P1 batch precondition failed: expected 9 events and 9 editions, found % and %',
      event_count,
      edition_count;
  end if;
end;
$$;

with batch (
  canonical_name,
  start_date,
  end_date,
  city,
  region,
  distance,
  official_url,
  registration_url,
  registration_status,
  edition_status,
  description,
  race_formats
) as (
  values
    (
      'Birklauf',
      date '2026-08-29',
      date '2026-08-29',
      'Gelting',
      'Schleswig-Holstein',
      '0.75 km, 2.5 km, 5 km, 16.04 km',
      'https://www.mtv-gelting-08.de/?catid=50&id=169&view=article',
      'https://www.davengo.com/v3/event/register/26-birklauf-des-mtv-gelting-08-2026/overview',
      'registration_open',
      'scheduled',
      'Der 26. Birklauf des MTV Gelting 08 findet am 29. August 2026 an der Birkhalle Gelting statt. Angeboten werden 750 m, 2,5 km, 5 km und 16,04 km. Nachmeldungen sind am Veranstaltungstag vor Ort möglich.',
      '[{"label":"0.75 km"},{"label":"2.5 km"},{"label":"5 km"},{"label":"16.04 km"}]'::jsonb
    ),
    (
      'Edersee-Lauf',
      date '2026-08-29',
      date '2026-08-29',
      'Vöhl-Herzhausen',
      'Hessen',
      '0.5 km, 1 km, 1.2 km, 2 km, 3.2 km, 10 km',
      'https://svherzhausen.de/laufcup/',
      'https://svherzhausen.de/laufcup/',
      'cancelled',
      'cancelled',
      'Der für den 29. August 2026 geplante 15. Edersee-Lauf wurde vom SV 1921 Herzhausen wegen des Neubaus der Grillhütte abgesagt.',
      '[{"label":"0.5 km"},{"label":"1 km"},{"label":"1.2 km"},{"label":"2 km"},{"label":"3.2 km"},{"label":"10 km"}]'::jsonb
    ),
    (
      '30. Lauf um den Arendsee',
      date '2026-08-30',
      date '2026-08-30',
      'Arendsee',
      'Sachsen-Anhalt',
      '31.65 km, Half Marathon, 9.2 km, 5 km, 1.5 km, Bambini',
      'https://kersten-friedrich-events.com/lauf-um-den-arendsee/',
      'https://kersten-friedrich-events.com/lauf-um-den-arendsee/',
      'registration_open',
      'scheduled',
      'Der 30. Lauf um den Arendsee findet am 30. August 2026 im Strandbad Arendsee statt. Zur Auswahl stehen Dreiviertelmarathon, Halbmarathon, 9,2 km, 5 km, 1,5 km und ein Bambinilauf.',
      '[{"label":"31.65 km (3/4 Marathon)"},{"label":"Half Marathon"},{"label":"9.2 km"},{"label":"5 km"},{"label":"1.5 km"},{"label":"Bambini"}]'::jsonb
    ),
    (
      'Altra Sunset Wattenmeer',
      date '2026-08-29',
      date '2026-08-30',
      'Hamburg',
      'Hamburg',
      'ca. 250 km team relay: 10-person, Ultra 5-person, 5 Pack',
      'https://www.sunset-series.de/infos-wattenmeer/',
      'https://www.sunset-series.de/anmeldung-wattenmeer/',
      'registration_not_open',
      'scheduled',
      'Die Altra Sunset Wattenmeer ist eine rund 250 km lange Teamstaffel von Hamburg nach St. Peter-Ording am 29. und 30. August 2026. Startplätze gab es für 10er-Teams, Ultra-5er-Teams und 5-Pack-Teams; der Anmeldeschluss ist verstrichen.',
      '[{"label":"ca. 250 km - 10-person team"},{"label":"ca. 250 km - Ultra 5-person team"},{"label":"ca. 250 km - 5 Pack team"}]'::jsonb
    ),
    (
      'Blankeneser Heldenlauf',
      date '2026-08-30',
      date '2026-08-30',
      'Hamburg',
      'Hamburg',
      '6.5 km, 11 km, 21 km Derbe, 21 km Sutsche, 6.8 km Bergziege',
      'https://www.heldenlauf.de/',
      'https://my.raceresult.com/358418/registration',
      'registration_open',
      'scheduled',
      'Der Blankeneser Heldenlauf findet am 30. August 2026 in Hamburg statt. Angeboten werden 6,5 km, 11 km, zwei 21-km-Varianten (Derbe und Sutsche) sowie die 6,8-km-Bergziege.',
      '[{"label":"6.5 km"},{"label":"11 km"},{"label":"21 km - Derbe"},{"label":"21 km - Sutsche"},{"label":"6.8 km - Bergziege"}]'::jsonb
    ),
    (
      'Koberstädter Waldmarathon',
      date '2026-08-30',
      date '2026-08-30',
      'Egelsbach',
      'Hessen',
      'Bambini, 5 km, 10 km, Half Marathon',
      'https://www.koberstaedter-marathon.de/',
      'https://my.raceresult.com/388413/registration',
      'registration_open',
      'scheduled',
      'Der 46. Koberstädter Waldmarathon findet am 30. August 2026 in Egelsbach statt. Das Programm umfasst Bambinilauf, 5 km, 10 km und Halbmarathon.',
      '[{"label":"Bambini"},{"label":"5 km"},{"label":"10 km"},{"label":"Half Marathon"}]'::jsonb
    ),
    (
      'Kölner Halbmarathon',
      date '2026-08-30',
      date '2026-08-30',
      'Köln',
      'Nordrhein-Westfalen',
      '7 km, 14 km, 21 km, 28 km',
      'https://koelner-halbmarathon.de/',
      'https://koelner-halbmarathon.de/',
      'registration_open',
      'scheduled',
      'Der 27. Kölner Halbmarathon startet am 30. August 2026 an der Deutschen Sporthochschule Köln. Je nach Rundenzahl sind 7 km, 14 km, 21 km oder 28 km möglich. Für Nachmeldungen wurde ein begrenztes Restkontingent angekündigt.',
      '[{"label":"7 km"},{"label":"14 km"},{"label":"21 km"},{"label":"28 km"}]'::jsonb
    ),
    (
      'Fehmarn Marathon',
      date '2026-09-05',
      date '2026-09-05',
      'Fehmarn',
      'Schleswig-Holstein',
      '1.4 km, 5 km, 12 km, Half Marathon, Marathon',
      'https://fehmarn-marathon.de/',
      'https://www.stgk.de/0/36.htm',
      'registration_open',
      'scheduled',
      'Der Fehmarn-Marathon findet am 5. September 2026 am Sportplatz an der Inselschule in Fehmarn statt. Angeboten werden 1,4 km, 5 km, 12 km, Halbmarathon und Marathon; Online- und Vor-Ort-Nachmeldungen sind vorgesehen.',
      '[{"label":"1.4 km"},{"label":"5 km"},{"label":"12 km"},{"label":"Half Marathon"},{"label":"Marathon"}]'::jsonb
    ),
    (
      'Usedom Marathon',
      date '2026-09-05',
      date '2026-09-05',
      'Wolgast',
      'Mecklenburg-Vorpommern',
      'Half Marathon, Marathon, 5-person Marathon Relay',
      'https://usedom-marathon.com/marathon-overview/',
      'https://my.raceresult.com/381740/',
      'registration_open',
      'scheduled',
      'Der Usedom-Marathon findet am 5. September 2026 statt. Marathon und Fünferstaffel führen von Świnoujście nach Wolgast; der Halbmarathon startet und endet im Peene-Stadion Wolgast.',
      '[{"label":"Half Marathon"},{"label":"Marathon"},{"label":"5-person Marathon Relay"}]'::jsonb
    )
), updated_events as (
  update public.events event
  set date = to_char(batch.start_date, 'DD.MM.YYYY'),
      city = batch.city,
      region = batch.region,
      distance = batch.distance,
      description = batch.description,
      event_url = batch.registration_url,
      source_url = batch.official_url,
      official_url = batch.official_url,
      registration_status = batch.registration_status,
      source_type = 'official',
      verification_status = 'verified',
      data_confidence = 0.98,
      needs_review = false,
      review_priority = 'low',
      last_checked = now(),
      last_verified_at = now(),
      next_check_at = now() + case
        when batch.edition_status = 'cancelled' then interval '30 days'
        else interval '7 days'
      end,
      review_status = 'approved',
      reviewed_at = now(),
      review_reason = null,
      review_note = 'Official-source verification completed on 2026-08-26.',
      status_note = case
        when batch.edition_status = 'cancelled'
          then 'Vom Veranstalter für 2026 abgesagt.'
        else null
      end,
      updated_at = now()
  from batch
  where event.canonical_name = batch.canonical_name
  returning event.id
)
select count(*) as updated_event_count
from updated_events;

with batch (
  canonical_name,
  start_date,
  end_date,
  distance,
  official_url,
  registration_url,
  registration_status,
  edition_status,
  race_formats
) as (
  values
    ('Birklauf', date '2026-08-29', date '2026-08-29', '0.75 km, 2.5 km, 5 km, 16.04 km', 'https://www.mtv-gelting-08.de/?catid=50&id=169&view=article', 'https://www.davengo.com/v3/event/register/26-birklauf-des-mtv-gelting-08-2026/overview', 'registration_open', 'scheduled', '[{"label":"0.75 km"},{"label":"2.5 km"},{"label":"5 km"},{"label":"16.04 km"}]'::jsonb),
    ('Edersee-Lauf', date '2026-08-29', date '2026-08-29', '0.5 km, 1 km, 1.2 km, 2 km, 3.2 km, 10 km', 'https://svherzhausen.de/laufcup/', 'https://svherzhausen.de/laufcup/', 'cancelled', 'cancelled', '[{"label":"0.5 km"},{"label":"1 km"},{"label":"1.2 km"},{"label":"2 km"},{"label":"3.2 km"},{"label":"10 km"}]'::jsonb),
    ('30. Lauf um den Arendsee', date '2026-08-30', date '2026-08-30', '31.65 km, Half Marathon, 9.2 km, 5 km, 1.5 km, Bambini', 'https://kersten-friedrich-events.com/lauf-um-den-arendsee/', 'https://kersten-friedrich-events.com/lauf-um-den-arendsee/', 'registration_open', 'scheduled', '[{"label":"31.65 km (3/4 Marathon)"},{"label":"Half Marathon"},{"label":"9.2 km"},{"label":"5 km"},{"label":"1.5 km"},{"label":"Bambini"}]'::jsonb),
    ('Altra Sunset Wattenmeer', date '2026-08-29', date '2026-08-30', 'ca. 250 km team relay: 10-person, Ultra 5-person, 5 Pack', 'https://www.sunset-series.de/infos-wattenmeer/', 'https://www.sunset-series.de/anmeldung-wattenmeer/', 'registration_not_open', 'scheduled', '[{"label":"ca. 250 km - 10-person team"},{"label":"ca. 250 km - Ultra 5-person team"},{"label":"ca. 250 km - 5 Pack team"}]'::jsonb),
    ('Blankeneser Heldenlauf', date '2026-08-30', date '2026-08-30', '6.5 km, 11 km, 21 km Derbe, 21 km Sutsche, 6.8 km Bergziege', 'https://www.heldenlauf.de/', 'https://my.raceresult.com/358418/registration', 'registration_open', 'scheduled', '[{"label":"6.5 km"},{"label":"11 km"},{"label":"21 km - Derbe"},{"label":"21 km - Sutsche"},{"label":"6.8 km - Bergziege"}]'::jsonb),
    ('Koberstädter Waldmarathon', date '2026-08-30', date '2026-08-30', 'Bambini, 5 km, 10 km, Half Marathon', 'https://www.koberstaedter-marathon.de/', 'https://my.raceresult.com/388413/registration', 'registration_open', 'scheduled', '[{"label":"Bambini"},{"label":"5 km"},{"label":"10 km"},{"label":"Half Marathon"}]'::jsonb),
    ('Kölner Halbmarathon', date '2026-08-30', date '2026-08-30', '7 km, 14 km, 21 km, 28 km', 'https://koelner-halbmarathon.de/', 'https://koelner-halbmarathon.de/', 'registration_open', 'scheduled', '[{"label":"7 km"},{"label":"14 km"},{"label":"21 km"},{"label":"28 km"}]'::jsonb),
    ('Fehmarn Marathon', date '2026-09-05', date '2026-09-05', '1.4 km, 5 km, 12 km, Half Marathon, Marathon', 'https://fehmarn-marathon.de/', 'https://www.stgk.de/0/36.htm', 'registration_open', 'scheduled', '[{"label":"1.4 km"},{"label":"5 km"},{"label":"12 km"},{"label":"Half Marathon"},{"label":"Marathon"}]'::jsonb),
    ('Usedom Marathon', date '2026-09-05', date '2026-09-05', 'Half Marathon, Marathon, 5-person Marathon Relay', 'https://usedom-marathon.com/marathon-overview/', 'https://my.raceresult.com/381740/', 'registration_open', 'scheduled', '[{"label":"Half Marathon"},{"label":"Marathon"},{"label":"5-person Marathon Relay"}]'::jsonb)
), updated_editions as (
  update public.event_editions edition
  set start_date = batch.start_date,
      end_date = batch.end_date,
      registration_url = batch.registration_url,
      registration_status = batch.registration_status,
      edition_status = batch.edition_status,
      race_formats = batch.race_formats,
      legacy_distance = batch.distance,
      source_url = batch.official_url,
      verification_status = 'verified',
      data_confidence = 0.98,
      needs_review = false,
      review_priority = 'low',
      last_verified_at = now(),
      next_check_at = now() + case
        when batch.edition_status = 'cancelled' then interval '30 days'
        else interval '7 days'
      end,
      updated_at = now()
  from public.events event, batch
  where edition.event_id = event.id
    and edition.edition_year = 2026
    and event.canonical_name = batch.canonical_name
  returning edition.id
)
select count(*) as updated_edition_count
from updated_editions;

-- Correct the HTML-escaped legacy URL so future checks request the canonical page.
update public.event_sources source
set source_url = 'https://www.mtv-gelting-08.de/?catid=50&id=169&view=article',
    next_fetch_at = least(coalesce(source.next_fetch_at, now()), now()),
    updated_at = now()
from public.events event
where source.event_id = event.id
  and event.canonical_name = 'Birklauf'
  and source.source_type = 'official_event_website'
  and source.source_url = 'https://www.mtv-gelting-08.de/?view=article&amp;id=169&amp;catid=50';

-- Add authoritative registration platforms as separate monitored sources.
with registration_sources (canonical_name, source_url) as (
  values
    ('Birklauf', 'https://www.davengo.com/v3/event/register/26-birklauf-des-mtv-gelting-08-2026/overview'),
    ('Blankeneser Heldenlauf', 'https://my.raceresult.com/358418/registration'),
    ('Koberstädter Waldmarathon', 'https://my.raceresult.com/388413/registration'),
    ('Fehmarn Marathon', 'https://www.stgk.de/0/36.htm'),
    ('Usedom Marathon', 'https://my.raceresult.com/381740/')
)
insert into public.event_sources (
  event_id,
  edition_id,
  source_type,
  source_url,
  source_priority,
  parser_type,
  is_active,
  crawl_status,
  next_fetch_at
)
select
  event.id,
  edition.id,
  'official_registration_platform',
  registration_sources.source_url,
  20,
  'html',
  true,
  'pending',
  now()
from registration_sources
join public.events event
  on event.canonical_name = registration_sources.canonical_name
join public.event_editions edition
  on edition.event_id = event.id and edition.edition_year = 2026
where not exists (
  select 1
  from public.event_sources existing
  where existing.event_id = event.id
    and existing.edition_id = edition.id
    and existing.source_url = registration_sources.source_url
);

-- Close only content-change tasks whose facts were manually reconciled above.
update public.source_review_tasks task
set status = 'resolved',
    reviewed_at = now(),
    reviewed_by = null,
    review_notes = 'Official-source facts reconciled in P1 event-quality batch 01 on 2026-08-26.',
    updated_at = now()
from public.events event
where task.event_id = event.id
  and task.status = 'open'
  and task.task_type = 'content_changed'
  and event.canonical_name in (
    '30. Lauf um den Arendsee',
    'Altra Sunset Wattenmeer',
    'Kölner Halbmarathon',
    'Fehmarn Marathon'
  );

-- The tourism source rotates unrelated 2027 island events. Its five detected
-- dates are not Fehmarn-Marathon successor editions and are explicitly rejected.
update public.edition_succession_candidates candidate
set candidate_status = 'rejected',
    reviewed_at = now(),
    reviewed_by = null,
    review_notes = 'False positive: unrelated 2027 event date on the Fehmarn tourism page.',
    updated_at = now()
from public.events event
where candidate.event_id = event.id
  and event.canonical_name = 'Fehmarn Marathon'
  and candidate.candidate_year = 2027
  and candidate.candidate_status in ('detected', 'draft_created', 'conflict')
  and candidate.source_url = 'https://www.fehmarn.de/event/fehmarn-marathon-2?type=5200';

update public.source_review_tasks task
set status = 'ignored',
    reviewed_at = now(),
    reviewed_by = null,
    review_notes = 'False positive: unrelated 2027 event date on the Fehmarn tourism page.',
    updated_at = now()
from public.events event
where task.event_id = event.id
  and event.canonical_name = 'Fehmarn Marathon'
  and task.status = 'open'
  and task.task_type = 'new_edition_candidate'
  and task.source_id = (
    select source.id
    from public.event_sources source
    where source.event_id = event.id
      and source.source_url = 'https://www.fehmarn.de/event/fehmarn-marathon-2?type=5200'
    limit 1
  );

do $$
declare
  verified_scheduled integer;
  verified_cancelled integer;
  remaining_open_tasks integer;
begin
  select
    count(*) filter (
      where edition.verification_status = 'verified'
        and edition.edition_status = 'scheduled'
    ),
    count(*) filter (
      where edition.verification_status = 'verified'
        and edition.edition_status = 'cancelled'
    )
  into verified_scheduled, verified_cancelled
  from public.events event
  join public.event_editions edition on edition.event_id = event.id
  where event.canonical_name in (
    'Birklauf',
    'Edersee-Lauf',
    '30. Lauf um den Arendsee',
    'Altra Sunset Wattenmeer',
    'Blankeneser Heldenlauf',
    'Koberstädter Waldmarathon',
    'Kölner Halbmarathon',
    'Fehmarn Marathon',
    'Usedom Marathon'
  )
    and edition.edition_year = 2026;

  select count(*) into remaining_open_tasks
  from public.source_review_tasks task
  join public.events event on event.id = task.event_id
  where event.canonical_name in (
    '30. Lauf um den Arendsee',
    'Altra Sunset Wattenmeer',
    'Kölner Halbmarathon',
    'Fehmarn Marathon'
  )
    and task.status = 'open'
    and task.task_type in ('content_changed', 'new_edition_candidate');

  if verified_scheduled <> 8
     or verified_cancelled <> 1
     or remaining_open_tasks <> 0 then
    raise exception
      'P1 batch postcondition failed: scheduled %, cancelled %, open tasks %',
      verified_scheduled,
      verified_cancelled,
      remaining_open_tasks;
  end if;
end;
$$;

commit;

select
  event.canonical_name,
  edition.start_date,
  edition.end_date,
  event.city,
  edition.legacy_distance as distance,
  edition.registration_status,
  edition.edition_status,
  edition.verification_status,
  edition.last_verified_at,
  edition.source_url
from public.events event
join public.event_editions edition on edition.event_id = event.id
where event.canonical_name in (
  'Birklauf',
  'Edersee-Lauf',
  '30. Lauf um den Arendsee',
  'Altra Sunset Wattenmeer',
  'Blankeneser Heldenlauf',
  'Koberstädter Waldmarathon',
  'Kölner Halbmarathon',
  'Fehmarn Marathon',
  'Usedom Marathon'
)
  and edition.edition_year = 2026
order by edition.start_date, event.canonical_name;
