-- P1 data-quality batch 02, verified against official sources on 2026-08-26.
--
-- This is an idempotent, production-maintenance script rather than a schema
-- migration. It resolves records by canonical name and edition year, asserts
-- both cardinality and the reviewed stale state, and lets the existing event
-- audit triggers record every factual change. No generated database ID is
-- hard-coded.

begin;

select set_config('app.change_source', 'manual_admin', true);
select set_config(
  'app.change_reason',
  'P1 event-quality batch 02: official-source verification on 2026-08-26',
  true
);

create temporary table p1_event_quality_batch_02 (
  canonical_name text primary key,
  start_date date not null,
  end_date date not null,
  city text not null,
  region text not null,
  address text,
  distance text not null,
  official_url text not null,
  registration_url text not null,
  registration_status text not null,
  edition_status text not null,
  description text not null,
  race_formats jsonb not null
) on commit drop;

insert into p1_event_quality_batch_02 (
  canonical_name,
  start_date,
  end_date,
  city,
  region,
  address,
  distance,
  official_url,
  registration_url,
  registration_status,
  edition_status,
  description,
  race_formats
)
values
  (
    '15. Brunsberglauf',
    date '2026-09-06',
    date '2026-09-06',
    'Buchholz in der Nordheide',
    'Niedersachsen',
    'Jungfernstieg, Sportplatz Mühlenschule, 21244 Buchholz/Holm-Seppensen',
    '0.3 km, 1 km, 1.5 km, 2.5 km, 5 km, 11.7 km, Half Marathon',
    'https://www.brunsberglauf.de/',
    'https://my.raceresult.com/377289/registration',
    'registration_open',
    'scheduled',
    'Der 15. Brunsberglauf findet am 6. September 2026 am Sportplatz der Mühlenschule in Buchholz/Holm-Seppensen statt. Neben 5 km, 11,7 km und Halbmarathon gibt es vier Kinderläufe über 0,3 km, 1 km, 1,5 km und 2,5 km; für 5 km und 11,7 km sind auch Walking und Nordic Walking vorgesehen.',
    '[{"label":"0.3 km Bambini"},{"label":"1 km Kids"},{"label":"1.5 km Kids"},{"label":"2.5 km Kids"},{"label":"5 km Run/Walk"},{"label":"11.7 km Run/Walk"},{"label":"Half Marathon"}]'::jsonb
  ),
  (
    'Bahndammlauf',
    date '2026-09-06',
    date '2026-09-06',
    'Buchholz',
    'Rheinland-Pfalz',
    'Auf dem Otenbruch 7, 53567 Buchholz',
    '0.4 km, 5 km, 10 km, 10 km Walking, 10.8 km Hike, 21.2 km',
    'https://bahndammlauf.de/alles-zum-lauf/',
    'https://my.raceresult.com/385372/registration',
    'registration_open',
    'scheduled',
    'Der 26. Buchholzer Bahndammlauf startet am 6. September 2026 am Sportplatz des SV Buchholz 05. Angeboten werden Bambinilauf über 400 m, 5 km, 10 km, 10 km Walking/Nordic Walking, eine 10,8-km-Genusswanderung und ein 21,2-km-Halbmarathon.',
    '[{"label":"0.4 km Bambini"},{"label":"5 km"},{"label":"10 km"},{"label":"10 km Walking/Nordic Walking"},{"label":"10.8 km Genusswanderung"},{"label":"21.2 km Half Marathon"}]'::jsonb
  ),
  (
    'BORSIG Halbmarathon',
    date '2026-09-06',
    date '2026-09-06',
    'Berlin',
    'Berlin',
    'Berlin-Reinickendorf, 13437 Berlin',
    'Kids, 4.7 km, 10 km, Half Marathon, 4 x 5.274 km Relay',
    'https://borsighalbmarathon.de/',
    'https://my.raceresult.com/359915/registration',
    'registration_open',
    'scheduled',
    'Der 27. BORSIG Halbmarathon findet am 6. September 2026 in Berlin-Reinickendorf statt. Das Programm umfasst Kinderläufe, eine 4,7-km-Fun-Strecke, 10 km, den Halbmarathon über 21,1 km und eine Staffel über 4 × 5,274 km. Die Online-Anmeldung ist laut Veranstalter bis zum 2. September möglich.',
    '[{"label":"Kids"},{"label":"4.7 km Fun Run"},{"label":"10 km"},{"label":"Half Marathon"},{"label":"4 x 5.274 km Relay"}]'::jsonb
  ),
  (
    'Canyon Run Mühlheim',
    date '2026-09-06',
    date '2026-09-06',
    'Mühlheim am Main',
    'Hessen',
    'Sportanlage Dietesheim, Am Wingertsweg 5, 63165 Mühlheim am Main',
    '0.4 km, 0.8 km, 5 km, 10 km, Half Marathon',
    'https://canyon-run.de/',
    'https://canyon-run.de/pages/registration-form',
    'registration_open',
    'scheduled',
    'Der Canyon Run findet am 6. September 2026 an der Sportanlage Dietesheim in Mühlheim am Main statt. Zur Auswahl stehen 400 m Mini-Lauf, 800 m Schülerlauf, 5 km, 10 km und Halbmarathon. Die Online-Anmeldung bleibt bis zum 5. September um 16 Uhr geöffnet; Nachmeldungen sind am Veranstaltungstag vorgesehen.',
    '[{"label":"0.4 km Mini Run"},{"label":"0.8 km Kids Run"},{"label":"5 km"},{"label":"10 km"},{"label":"Half Marathon"}]'::jsonb
  ),
  (
    'City Marathon Bremerhaven',
    date '2026-09-06',
    date '2026-09-06',
    'Bremerhaven',
    'Bremen',
    null,
    '0.4 km, 0.8 km, 5 km, 6 km, 10 km, Half Marathon, 3/4 Marathon, Marathon, Relays',
    'https://www.bremerhaven-marathon.de/',
    'https://my.raceresult.com/360287/registration',
    'registration_open',
    'scheduled',
    'Der 22. GLOMB City Marathon Bremerhaven findet am 6. September 2026 mit Start und Ziel in den Havenwelten statt. Das Programm umfasst Kinderläufe über 400 m und 800 m, 5 km, Firmenläufe über 6 km und 10 km, den 10-km-Lauf, Halbmarathon, Dreiviertelmarathon, Marathon und Marathonstaffeln.',
    '[{"label":"0.4 km Kids"},{"label":"0.8 km Kids"},{"label":"5 km"},{"label":"6 km Corporate Run"},{"label":"10 km"},{"label":"Half Marathon"},{"label":"3/4 Marathon"},{"label":"Marathon"},{"label":"Marathon Relay"}]'::jsonb
  ),
  (
    'DresdenHALF',
    date '2026-09-06',
    date '2026-09-06',
    'Dresden',
    'Sachsen',
    null,
    'Half Marathon',
    'https://dresden-half.com/',
    'https://dresden-half.com/anmeldung',
    'registration_open',
    'scheduled',
    'Der erste DresdenHALF startet am 6. September 2026 um 9 Uhr. Die 21,1-km-Strecke führt durch das Herz Dresdens, entlang der historischen Altstadt, des Großen Gartens und des Elbufers. Der Veranstalter weist auf Anmeldemöglichkeiten bis zum 31. August hin.',
    '[{"label":"Half Marathon"}]'::jsonb
  ),
  (
    'Flensburg liebt dich Marathon',
    date '2026-09-06',
    date '2026-09-06',
    'Flensburg',
    'Schleswig-Holstein',
    null,
    '0.195 km, 1.07 km, 5 km, 10 km, Half Marathon, Marathon, Marathon Relay',
    'https://flensburg-marathon.de/',
    'https://www.davengo.com/event/overview/8-flensburg-liebt-dich-marathon-2026',
    'registration_open',
    'scheduled',
    'Der 8. Flensburg liebt dich Marathon findet am 6. September 2026 statt. Angeboten werden Bambinilauf über 195 m, Kinderlauf über 1,07 km, 5 km, 10 km, Halbmarathon, Marathon und Marathonstaffel. Die Anmeldung ist ausschließlich online bis zum 30. August um 24 Uhr möglich.',
    '[{"label":"0.195 km Bambini"},{"label":"1.07 km Kids"},{"label":"5 km"},{"label":"10 km"},{"label":"Half Marathon"},{"label":"Marathon"},{"label":"Marathon Relay"}]'::jsonb
  ),
  (
    'Fränkische Schweiz Marathon',
    date '2026-09-05',
    date '2026-09-06',
    'Ebermannstadt',
    'Bayern',
    null,
    'Kids, 1/10 Marathon, 10 km, Half Marathon, Marathon, Marathon Relay, Run & Bike, Handbike',
    'https://www.fs-marathon.de/',
    'https://baer-service.de/anmeldung/FSM',
    'registration_open',
    'scheduled',
    'Die Jubiläumsausgabe des Fränkische Schweiz-Marathons findet am 5. und 6. September 2026 statt. Samstags werden Kinderläufe und der 1/10-Marathon angeboten; sonntags folgen 10 km, Halbmarathon, Marathon, Marathonstaffel, Run & Bike und Handbike-Marathon. Die Online-Anmeldung schließt am 30. August.',
    '[{"label":"Kids"},{"label":"1/10 Marathon"},{"label":"10 km"},{"label":"Half Marathon"},{"label":"Marathon"},{"label":"Marathon Relay"},{"label":"Run & Bike"},{"label":"Handbike Marathon"}]'::jsonb
  ),
  (
    'Köln Triathlon',
    date '2026-09-06',
    date '2026-09-06',
    'Köln',
    'Nordrhein-Westfalen',
    null,
    'Sprint, Olympic, Middle, Olympic Relay, Middle Relay',
    'https://www.koeln-triathlon.com/',
    'https://www.koeln-triathlon.com/anmeldung/',
    'sold_out',
    'scheduled',
    'Der Köln Triathlon findet am 6. September 2026 mit Schwimmen im Rhein, Radfahren am Rheinufer und dem Lauf in Richtung Kölner Dom statt. Angeboten werden Sprint-, olympische und Mitteldistanz sowie Staffeln über die olympische und die Mitteldistanz. Der Veranstalter meldet die Ausgabe 2026 als ausverkauft.',
    '[{"label":"Sprint"},{"label":"Olympic"},{"label":"Middle"},{"label":"Olympic Relay"},{"label":"Middle Relay"}]'::jsonb
  );

do $$
declare
  event_count integer;
  edition_count integer;
  reviewed_stale_count integer;
begin
  select count(*) into event_count
  from public.events event
  join p1_event_quality_batch_02 batch
    on batch.canonical_name = event.canonical_name;

  select count(*) into edition_count
  from public.events event
  join p1_event_quality_batch_02 batch
    on batch.canonical_name = event.canonical_name
  join public.event_editions edition
    on edition.event_id = event.id
   and edition.edition_year = 2026;

  select count(*) into reviewed_stale_count
  from public.events event
  join p1_event_quality_batch_02 batch
    on batch.canonical_name = event.canonical_name
  join public.event_editions edition
    on edition.event_id = event.id
   and edition.edition_year = 2026
  where edition.verification_status = 'stale'
    and edition.needs_review is true
    and edition.start_date = date '2026-09-06';

  if event_count <> 9
     or edition_count <> 9
     or reviewed_stale_count <> 9 then
    raise exception
      'P1 batch 02 precondition failed: expected 9 events, 9 editions and 9 reviewed stale editions; found %, % and %',
      event_count,
      edition_count,
      reviewed_stale_count;
  end if;
end;
$$;

with updated_events as (
  update public.events event
  set date = to_char(batch.start_date, 'DD.MM.YYYY'),
      city = batch.city,
      region = batch.region,
      address = coalesce(batch.address, event.address),
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
      next_check_at = now() + interval '7 days',
      review_status = 'approved',
      reviewed_at = now(),
      review_reason = null,
      review_note = 'Official-source verification completed in P1 event-quality batch 02 on 2026-08-26.',
      status_note = case
        when batch.registration_status = 'sold_out'
          then 'Die Ausgabe 2026 ist laut Veranstalter ausverkauft.'
        else null
      end,
      updated_at = now()
  from p1_event_quality_batch_02 batch
  where event.canonical_name = batch.canonical_name
  returning event.id
)
select count(*) as updated_event_count
from updated_events;

with updated_editions as (
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
      next_check_at = now() + interval '7 days',
      updated_at = now()
  from public.events event,
       p1_event_quality_batch_02 batch
  where edition.event_id = event.id
    and edition.edition_year = 2026
    and event.canonical_name = batch.canonical_name
  returning edition.id
)
select count(*) as updated_edition_count
from updated_editions;

-- Add authoritative external registration platforms as separate monitored
-- sources. The Davengo page remains the public Flensburg registration URL, but
-- is deliberately not added as a crawler source because the worker has already
-- observed empty scripted responses from Davengo.
with registration_sources (canonical_name, source_url) as (
  values
    ('15. Brunsberglauf', 'https://my.raceresult.com/377289/registration'),
    ('Bahndammlauf', 'https://my.raceresult.com/385372/registration'),
    ('BORSIG Halbmarathon', 'https://my.raceresult.com/359915/registration'),
    ('City Marathon Bremerhaven', 'https://my.raceresult.com/360287/registration'),
    ('Fränkische Schweiz Marathon', 'https://baer-service.de/anmeldung/FSM')
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
  on edition.event_id = event.id
 and edition.edition_year = 2026
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
    review_notes = 'Official-source facts reconciled in P1 event-quality batch 02 on 2026-08-26.',
    updated_at = now()
from public.events event
join p1_event_quality_batch_02 batch
  on batch.canonical_name = event.canonical_name
where task.event_id = event.id
  and task.status = 'open'
  and task.task_type = 'content_changed';

do $$
declare
  verified_count integer;
  registration_open_count integer;
  sold_out_count integer;
  required_registration_sources integer;
  remaining_open_tasks integer;
begin
  select
    count(*) filter (
      where edition.verification_status = 'verified'
        and edition.needs_review is false
        and edition.edition_status = 'scheduled'
    ),
    count(*) filter (where edition.registration_status = 'registration_open'),
    count(*) filter (where edition.registration_status = 'sold_out')
  into verified_count, registration_open_count, sold_out_count
  from public.events event
  join p1_event_quality_batch_02 batch
    on batch.canonical_name = event.canonical_name
  join public.event_editions edition
    on edition.event_id = event.id
   and edition.edition_year = 2026;

  select count(*) into required_registration_sources
  from public.events event
  join public.event_sources source
    on source.event_id = event.id
   and source.edition_id in (
     select edition.id
     from public.event_editions edition
     where edition.event_id = event.id
       and edition.edition_year = 2026
   )
  where (event.canonical_name, source.source_url) in (
    ('15. Brunsberglauf', 'https://my.raceresult.com/377289/registration'),
    ('Bahndammlauf', 'https://my.raceresult.com/385372/registration'),
    ('BORSIG Halbmarathon', 'https://my.raceresult.com/359915/registration'),
    ('City Marathon Bremerhaven', 'https://my.raceresult.com/360287/registration'),
    ('Fränkische Schweiz Marathon', 'https://baer-service.de/anmeldung/FSM')
  );

  select count(*) into remaining_open_tasks
  from public.source_review_tasks task
  join public.events event on event.id = task.event_id
  join p1_event_quality_batch_02 batch
    on batch.canonical_name = event.canonical_name
  where task.status = 'open'
    and task.task_type = 'content_changed';

  if verified_count <> 9
     or registration_open_count <> 8
     or sold_out_count <> 1
     or required_registration_sources <> 5
     or remaining_open_tasks <> 0 then
    raise exception
      'P1 batch 02 postcondition failed: verified %, registration open %, sold out %, registration sources %, open tasks %',
      verified_count,
      registration_open_count,
      sold_out_count,
      required_registration_sources,
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
  '15. Brunsberglauf',
  'Bahndammlauf',
  'BORSIG Halbmarathon',
  'Canyon Run Mühlheim',
  'City Marathon Bremerhaven',
  'DresdenHALF',
  'Flensburg liebt dich Marathon',
  'Fränkische Schweiz Marathon',
  'Köln Triathlon'
)
  and edition.edition_year = 2026
order by edition.start_date, event.canonical_name;
