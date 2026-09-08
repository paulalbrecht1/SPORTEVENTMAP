-- P0 event facts batch 05: exactly two fully reviewed existing events 159/342.
-- No new identities, source-health changes, publication changes or freshness attestation.
-- Maintenance, not a migration; rehearse application, drift guards and rollback before production.

begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('sporteventmap:20260908_p0_event_facts_batch_05', 0));
-- No request.jwt.claims, auth.uid override or app.freshness_verification override.
select set_config('app.change_source', 'manual_admin', true);
select set_config('app.change_reason', $reason$P0 facts batch 05 (2026-09-08): complete independently reviewed official facts for existing events 159 and 342. No freshness attestation. Evidence: https://ringrunningseries.com/ ; https://www.braunschweiger-laufclub.com/speed5$reason$, true);
create temporary table p0_fact_targets (
  event_id bigint primary key,
  edition_id uuid not null unique,
  source_id uuid not null unique,
  source_url text not null,
  before_event jsonb not null,
  before_edition jsonb not null,
  event_patch jsonb not null,
  edition_patch jsonb not null
) on commit drop;
insert into p0_fact_targets
select * from jsonb_to_recordset($reviewed_batch$
[
  {
    "event_id": 159,
    "edition_id": "835704af-8956-474b-8d3c-0fd44415c8b0",
    "source_id": "a1a8dc9e-6921-4e33-8a37-1abc660422e0",
    "source_url": "https://ringrunningseries.com/",
    "before_event": {
      "id": 159,
      "city": "Hockenheim",
      "date": "21.11.2026",
      "slug": "ring-running-series",
      "image": "https://www.marathon.de/kategorien/9df6b59342.jpg",
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Hockenheim, Germany",
      "country": "Germany",
      "distance": "21 km / 42 km",
      "latitude": "49.3188892",
      "event_url": "https://ringrunningseries.com/",
      "longitude": "8.5475467",
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "created_by": null,
      "event_name": "Ring Running Series",
      "source_url": "https://ringrunningseries.com/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Imported from marathon.de running calendar. Source listing: https://www.marathon.de/laufevent/ring-running-series/",
      "review_note": null,
      "reviewed_at": null,
      "reviewed_by": null,
      "source_type": "unknown",
      "status_note": null,
      "subcategory": null,
      "event_status": "active",
      "import_batch": null,
      "last_checked": null,
      "needs_review": false,
      "official_url": "https://ringrunningseries.com/",
      "organizer_id": null,
      "canonical_key": "ring-running-series-hockenheim-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Ring Running Series",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "low",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "unclear",
      "verification_status": "verified"
    },
    "before_edition": {
      "id": "835704af-8956-474b-8d3c-0fd44415c8b0",
      "currency": null,
      "end_date": "2026-11-21",
      "event_id": 159,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "source_url": "https://ringrunningseries.com/",
      "start_date": "2026-11-21",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "ring-running-series-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "21 km / 42 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "21 km / 42 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "ring running series|21.11.2026|hockenheim|germany",
      "registration_url": "https://ringrunningseries.com/",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "participant_limit": null,
      "publication_status": "published",
      "registration_status": "unknown",
      "verification_status": "needs_review",
      "auto_publish_eligible": false,
      "discovery_archived_at": null,
      "predecessor_edition_id": null,
      "last_verified_source_id": null,
      "generated_from_source_id": null,
      "generated_from_candidate_id": null
    },
    "event_patch": {
      "address": "Hockenheimring, Am Motodrom 1, 68766 Hockenheim",
      "description": "Die Ring Running Series findet am 21. November 2026 auf dem Hockenheimring statt. Zur Wahl stehen Halbmarathon und Marathon auf der asphaltierten Motorsportstrecke. Die Wettbewerbe führen über mehrere Runden mit unterschiedlichen Startzuführungen; das Ziel liegt auf der originalen Formel-1-Ziellinie. Der Marathon startet um 10 Uhr, der Halbmarathon um 11 Uhr.",
      "registration_status": "registration_open",
      "event_url": "https://onreg.datasport.com/de/ring-running-series-2026",
      "latitude": "49.32990",
      "longitude": "8.57092",
      "distance": "Halbmarathon – 21.097 km / Marathon – 42.195 km"
    },
    "edition_patch": {
      "registration_status": "registration_open",
      "registration_url": "https://onreg.datasport.com/de/ring-running-series-2026",
      "race_formats": [
        {
          "label": "Halbmarathon – 21.097 km",
          "distance_km": 21.097
        },
        {
          "label": "Marathon – 42.195 km",
          "distance_km": 42.195
        }
      ],
      "legacy_distance": "Halbmarathon – 21.097 km / Marathon – 42.195 km"
    }
  },
  {
    "event_id": 342,
    "edition_id": "15924c4f-c20d-4419-8550-2ca397c5abb7",
    "source_id": "3855fb02-0125-4322-81cb-9fe2879b5444",
    "source_url": "https://www.braunschweiger-laufclub.com/speed5",
    "before_event": {
      "id": 342,
      "city": "Braunschweig",
      "date": "08.11.2026",
      "slug": "braunschweiger-speed5",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Braunschweig, Lower Saxony, Germany, Germany",
      "country": "Germany",
      "distance": "5 km",
      "latitude": "52.2156124",
      "event_url": "https://www.braunschweiger-laufclub.com/speed5",
      "longitude": "10.5227434",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "Braunschweiger Speed5",
      "source_url": "https://www.braunschweiger-laufclub.com/speed5",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Der Braunschweiger Speed5 ist der schnellste Volkslauf der Stadt Braunschweig, veranstaltet vom Polizeisportverein Braunschweig und dem Braunschweiger Laufclub. Das Laufevent am 8. November 2026 bietet mit einem 800 m Kinderlauf, einem 1 Meile Schülerlauf und einem vermessenen 5 km Lauf für Freizeit- und ambitionierte Läufer aller Altersklassen spannende Wettkämpfe. Die Veranstaltung zeichnet sich durch professionell",
      "review_note": null,
      "reviewed_at": null,
      "reviewed_by": null,
      "source_type": "unknown",
      "status_note": null,
      "subcategory": null,
      "event_status": "active",
      "import_batch": null,
      "last_checked": null,
      "needs_review": false,
      "official_url": "https://www.braunschweiger-laufclub.com/speed5",
      "organizer_id": null,
      "canonical_key": "braunschweiger-speed5-braunschweig-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Braunschweiger Speed5",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "low",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "unclear",
      "verification_status": "verified"
    },
    "before_edition": {
      "id": "15924c4f-c20d-4419-8550-2ca397c5abb7",
      "currency": null,
      "end_date": "2026-11-08",
      "event_id": 342,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://www.braunschweiger-laufclub.com/speed5",
      "start_date": "2026-11-08",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "braunschweiger-speed5-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "5 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "5 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "braunschweiger speed5|08.11.2026|braunschweig|germany",
      "registration_url": "https://www.braunschweiger-laufclub.com/speed5",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "participant_limit": null,
      "publication_status": "published",
      "registration_status": "unknown",
      "verification_status": "needs_review",
      "auto_publish_eligible": false,
      "discovery_archived_at": null,
      "predecessor_edition_id": null,
      "last_verified_source_id": null,
      "generated_from_source_id": null,
      "generated_from_candidate_id": null
    },
    "event_patch": {
      "address": "Polizeisportverein Braunschweig, Georg-Westermann-Allee 36, 38104 Braunschweig",
      "description": "Der Speed5 des Polizeisportvereins und des Braunschweiger Laufclubs findet am 8. November 2026 am PSV-Gelände in Braunschweig statt. Das Programm umfasst eine Parkmeile, zwei getrennte Starts über 5 km und einen Kinderlauf über 800 m. Die 5-km-Läufe führen durch den Prinzenpark und werden gemeinsam gewertet. Im Ziel stehen Getränke und Obst für die Teilnehmenden bereit.",
      "registration_status": "registration_open",
      "event_url": "https://my.raceresult.com/389800/registration",
      "latitude": "52.26441",
      "longitude": "10.56175",
      "distance": "Parkmeile – 1 Meile / Speed5 – 5 km (langsamer Lauf) / Speed5 – 5 km (Ziel unter 20 Minuten) / Kinderlauf – 800 m"
    },
    "edition_patch": {
      "registration_status": "registration_open",
      "registration_url": "https://my.raceresult.com/389800/registration",
      "race_formats": [
        {
          "label": "Parkmeile – 1 Meile",
          "distance_km": 1.609344
        },
        {
          "label": "Speed5 – 5 km (langsamer Lauf)",
          "distance_km": 5
        },
        {
          "label": "Speed5 – 5 km (Ziel unter 20 Minuten)",
          "distance_km": 5
        },
        {
          "label": "Kinderlauf – 800 m",
          "distance_km": 0.8
        }
      ],
      "legacy_distance": "Parkmeile – 1 Meile / Speed5 – 5 km (langsamer Lauf) / Speed5 – 5 km (Ziel unter 20 Minuten) / Kinderlauf – 800 m"
    }
  }
]
$reviewed_batch$::jsonb) as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb);

-- Freeze scheduler writes before checking active jobs. Row locks then follow
-- the worker/verifier order: every source of these events -> events -> editions.
lock table public.source_crawl_jobs in share mode;
select 1 from public.event_sources s where s.event_id in (159, 342)
order by s.id for update;
select 1 from public.events e where e.id in (159, 342)
order by e.id for update;
select 1 from public.event_editions e where e.event_id in (159, 342)
order by e.event_id, e.id for update;

do $preflight$
begin
  -- Fixed field whitelist and exact reviewed per-event programme.
  if exists (
    select 1 from p0_fact_targets t
    where jsonb_typeof(t.event_patch) is distinct from 'object'
      or jsonb_typeof(t.edition_patch) is distinct from 'object'
      or (t.event_patch = '{}'::jsonb and t.edition_patch = '{}'::jsonb)
      or exists (select 1 from jsonb_object_keys(t.event_patch) field where field not in ('address','description','distance','event_url','latitude','longitude','registration_status'))
      or exists (select 1 from jsonb_object_keys(t.edition_patch) field where field not in ('legacy_distance','race_formats','registration_status','registration_url'))
      or (t.before_event || t.event_patch) -> 'distance' is distinct from (t.before_edition || t.edition_patch) -> 'legacy_distance'
      or jsonb_typeof((t.before_edition || t.edition_patch) -> 'race_formats') is distinct from 'array'
      or jsonb_array_length((t.before_edition || t.edition_patch) -> 'race_formats') <> case t.event_id when 159 then 2 when 342 then 4 else -1 end
      or exists (select 1 from jsonb_array_elements((t.before_edition || t.edition_patch) -> 'race_formats') f where jsonb_typeof(f) is distinct from 'object' or nullif(btrim(f ->> 'label'),'') is null)
  ) then
    raise exception 'P0 facts guard: patch keys, reviewed formats or distance mirrors differ';
  end if;

  if now() < timestamptz '2026-09-08T07:28:45.176Z'
     or now() >= timestamptz '2026-09-09T06:42:39.770Z' then
    raise exception 'P0 facts evidence window expired or not yet valid; refresh official source review';
  end if;
  if exists (select 1 from private.event_data_workflow_backup where migration_key in ('20260908_p0_event_facts_batch_05', '20260908_p0_event_facts_batch_05_rollback')) then
    raise exception 'P0 facts batch key already exists; no repeat application or overwrite';
  end if;
  if (select count(*) from p0_fact_targets) <> 2
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[159, 342]::bigint[]
     or exists (
       select 1 from p0_fact_targets t
       left join public.event_sources s on s.id = t.source_id
       where s.id is null or s.event_id is distinct from t.event_id
         or s.edition_id is distinct from t.edition_id
         or s.source_url is distinct from t.source_url
         or s.source_type is distinct from 'official_event_website'
         or not s.is_active
     ) then
    raise exception 'P0 facts guard: reviewed source/event/edition identity drifted';
  end if;
  if exists (
    select 1 from public.source_crawl_jobs j
    join public.event_sources s on s.id = j.source_id
    where s.event_id in (159, 342)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (159, 342)
      and (s.claimed_at is not null or s.claimed_by is not null)
  ) then
    raise exception 'P0 facts guard: a target source has an active or queued crawl';
  end if;

  if exists (
    select 1 from p0_fact_targets t
    left join public.events e on e.id = t.event_id
    left join public.event_editions d on d.id = t.edition_id and d.event_id = t.event_id
    where e.id is null or d.id is null
      or (to_jsonb(e) - 'updated_at') is distinct from (t.before_event - 'updated_at')
      or (to_jsonb(d) - 'updated_at') is distinct from (t.before_edition - 'updated_at')
  ) then
    raise exception 'P0 facts reviewed before-state drifted; do not overwrite a newer edit';
  end if;
  if exists (
    select 1 from public.event_editions e
    where e.event_id in (159, 342) and e.publication_status = 'published'
      and e.discovery_status = 'active'
      and e.edition_status not in ('cancelled','inactive','completed')
      and (coalesce(e.end_date,e.start_date) is null or coalesce(e.end_date,e.start_date) >= current_date)
      and e.id not in (select edition_id from p0_fact_targets)
  ) then
    raise exception 'P0 facts guard: another active edition would receive trigger side effects';
  end if;
end
$preflight$;

create temporary table p0_fact_invariants on commit drop as select jsonb_build_object(
    'events_count', (select count(*) from public.events),
    'editions_count', (select count(*) from public.event_editions),
    'sources_count', (select count(*) from public.event_sources),
    'favorites_count', (select count(*) from public.favorites),
    'planner_count', (select count(*) from public.season_planner_events),
    'favorites_digest', (select md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id)::text, '[]')) from public.favorites f),
    'planner_digest', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text, '[]')) from public.season_planner_events p),
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (159, 342)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('835704af-8956-474b-8d3c-0fd44415c8b0'::uuid, '15924c4f-c20d-4419-8550-2ca397c5abb7'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (159, 342))
  ) as value;

insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_05', 'events', e.id::text, to_jsonb(e)
from public.events e join p0_fact_targets t on t.event_id = e.id
union all
select '20260908_p0_event_facts_batch_05', 'event_editions', e.id::text, to_jsonb(e)
from public.event_editions e join p0_fact_targets t on t.edition_id = e.id;
insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_05', 'batch_manifest', 'batch',
  jsonb_build_object('targets',(select jsonb_agg(to_jsonb(t) order by event_id) from p0_fact_targets t),
    'invariants',value,'actor',current_user,'auth_uid',auth.uid(),'reason',$reason$P0 facts batch 05 (2026-09-08): complete independently reviewed official facts for existing events 159 and 342. No freshness attestation. Evidence: https://ringrunningseries.com/ ; https://www.braunschweiger-laufclub.com/speed5$reason$,
    'factual_changes_only',true,'freshness_attested',false)
from p0_fact_invariants;

-- Apply only the explicitly reviewed master fields using typed bound records.
-- No application-role impersonation, identity override or freshness bypass is used.
do $apply_reviewed_facts$
declare
  target record;
  event_value public.events;
  edition_value public.event_editions;
  assignments text;
begin
  for target in select * from p0_fact_targets order by event_id loop
    event_value := jsonb_populate_record(null::public.events, target.before_event || target.event_patch);
    select string_agg(format('%I=($1).%I', field, field), ', ' order by field)
      into assignments from jsonb_object_keys(target.event_patch) field;
    execute 'update public.events set ' || coalesce(assignments || ', ', '') ||
      'verification_status=''needs_review'', needs_review=true, review_priority=''high'',
         next_check_at=least(coalesce(($1).next_check_at,now()),now()) where id=$2'
      using event_value, target.event_id;
  end loop;

  -- Legacy master sync temporarily rewrites race_formats from the flat distance
  -- label and copies verification values. Restore the exact edition baseline
  -- with normal triggers enabled before applying the real structured patch.
  -- This also produces an actual baseline -> final field audit for race_formats.
  for target in select * from p0_fact_targets order by event_id, edition_id loop
    edition_value := jsonb_populate_record(null::public.event_editions, target.before_edition);
    update public.event_editions e
    set start_date=edition_value.start_date, end_date=edition_value.end_date,
        source_url=edition_value.source_url, edition_status=edition_value.edition_status,
        publication_status=edition_value.publication_status,
        race_formats=edition_value.race_formats, legacy_distance=edition_value.legacy_distance,
        registration_url=edition_value.registration_url, registration_status=edition_value.registration_status,
        last_verified_at=edition_value.last_verified_at, data_confidence=edition_value.data_confidence,
        verification_status='needs_review', needs_review=true,
        last_verified_source_id=null, review_priority='high',
        next_check_at=least(coalesce(edition_value.next_check_at,now()),now())
    where e.id=target.edition_id and e.event_id=target.event_id;

    edition_value := jsonb_populate_record(null::public.event_editions, target.before_edition || target.edition_patch);
    select string_agg(format('%I=($1).%I', field, field), ', ' order by field)
      into assignments from jsonb_object_keys(target.edition_patch) field;
    execute 'update public.event_editions set ' || coalesce(assignments || ', ', '') ||
      'verification_status=''needs_review'', needs_review=true, review_priority=''high'',
         last_verified_source_id=null,
         next_check_at=least(coalesce(($1).next_check_at,now()),now())
         where id=$2 and event_id=$3'
      using edition_value, target.edition_id, target.event_id;
  end loop;
end
$apply_reviewed_facts$;

do $postflight$
begin
  if (select count(*) from public.events where id in (159, 342)) <> 2
     or (select count(*) from public.event_editions e join p0_fact_targets t on e.id = t.edition_id) <> 2
     or exists (
       select 1 from p0_fact_targets t join public.events e on e.id = t.event_id
       where (to_jsonb(e) - 'updated_at') is distinct from (t.before_event || t.event_patch || jsonb_build_object(
       'verification_status', 'needs_review', 'needs_review', true,
       'review_priority', 'high',
       'next_check_at', least(coalesce((t.before_event ->> 'next_check_at')::timestamptz, now()), now())
     )) - 'updated_at'
     ) or exists (
       select 1 from p0_fact_targets t join public.event_editions e on e.id = t.edition_id
       where (to_jsonb(e) - 'updated_at') is distinct from (t.before_edition || t.edition_patch || jsonb_build_object(
       'verification_status', 'needs_review', 'needs_review', true,
       'last_verified_source_id', null, 'review_priority', 'high',
       'next_check_at', least(coalesce((t.before_edition ->> 'next_check_at')::timestamptz, now()), now())
     )) - 'updated_at'
     ) then
    raise exception 'P0 facts postcondition: unexpected facts, identity, trigger side effect or verification metadata';
  end if;
  if (select value from p0_fact_invariants) is distinct from jsonb_build_object(
    'events_count', (select count(*) from public.events),
    'editions_count', (select count(*) from public.event_editions),
    'sources_count', (select count(*) from public.event_sources),
    'favorites_count', (select count(*) from public.favorites),
    'planner_count', (select count(*) from public.season_planner_events),
    'favorites_digest', (select md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id)::text, '[]')) from public.favorites f),
    'planner_digest', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text, '[]')) from public.season_planner_events p),
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (159, 342)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('835704af-8956-474b-8d3c-0fd44415c8b0'::uuid, '15924c4f-c20d-4419-8550-2ca397c5abb7'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (159, 342))
  ) then
    raise exception 'P0 facts postcondition: counts, user references, other records or sources changed';
  end if;
  if (select count(*) from p0_fact_targets) <> 2
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[159, 342]::bigint[]
     or exists (
       select 1 from p0_fact_targets t
       left join public.event_sources s on s.id = t.source_id
       where s.id is null or s.event_id is distinct from t.event_id
         or s.edition_id is distinct from t.edition_id
         or s.source_url is distinct from t.source_url
         or s.source_type is distinct from 'official_event_website'
         or not s.is_active
     ) then
    raise exception 'P0 facts guard: reviewed source/event/edition identity drifted';
  end if;
  if exists (
    select 1 from public.source_crawl_jobs j
    join public.event_sources s on s.id = j.source_id
    where s.event_id in (159, 342)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (159, 342)
      and (s.claimed_at is not null or s.claimed_by is not null)
  ) then
    raise exception 'P0 facts guard: a target source has an active or queued crawl';
  end if;

end
$postflight$;

do $audit_guard$
begin
  if exists (
    select 1 from p0_fact_targets t
    cross join lateral jsonb_each(t.event_patch) p
    where t.before_event -> p.key is distinct from p.value
      and not exists (
        select 1 from public.event_audit_log a
        where a.entity_type = 'event' and a.entity_id = t.event_id::text
          and a.field_name = p.key and a.old_value is not distinct from t.before_event -> p.key
          and a.new_value is not distinct from p.value
          and a.change_source = 'manual_admin' and a.reason = $reason$P0 facts batch 05 (2026-09-08): complete independently reviewed official facts for existing events 159 and 342. No freshness attestation. Evidence: https://ringrunningseries.com/ ; https://www.braunschweiger-laufclub.com/speed5$reason$
      )
  ) or exists (
    select 1 from p0_fact_targets t
    cross join lateral jsonb_each(t.edition_patch) p
    where t.before_edition -> p.key is distinct from p.value
      and not exists (
        select 1 from public.event_audit_log a
        where a.entity_type = 'edition' and a.entity_id = t.edition_id::text
          and a.field_name = p.key and a.old_value is not distinct from t.before_edition -> p.key
          and a.new_value is not distinct from p.value
          and a.change_source = 'manual_admin' and a.reason = $reason$P0 facts batch 05 (2026-09-08): complete independently reviewed official facts for existing events 159 and 342. No freshness attestation. Evidence: https://ringrunningseries.com/ ; https://www.braunschweiger-laufclub.com/speed5$reason$
      )
  ) then
    raise exception 'P0 facts postcondition: a factual change lacks its automatic field audit';
  end if;
end
$audit_guard$;

insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_05', 'events_post_state', e.id::text, to_jsonb(e)
from public.events e join p0_fact_targets t on t.event_id = e.id
union all
select '20260908_p0_event_facts_batch_05', 'event_editions_post_state', e.id::text, to_jsonb(e)
from public.event_editions e join p0_fact_targets t on t.edition_id = e.id;

do $backup_guard$
begin
  if (select count(*) from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_05') <> 9 then
    raise exception 'P0 facts snapshots incomplete: expected 4 before, 4 after and 1 manifest';
  end if;
end
$backup_guard$;
commit;
