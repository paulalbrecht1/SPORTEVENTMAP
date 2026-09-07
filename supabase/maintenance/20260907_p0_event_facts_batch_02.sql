-- P0 event facts batch 02, source review 2026-09-07. Maintenance, not a migration.
-- Exact scope: events 108/109/284 and their three existing 2026 editions.
-- 108: complete 12-format programme, approximate start-area coordinates/address.
-- 109: half-marathon plus three officially ranked partial-lap finishes and description.
-- 284: four official formats and canonical display name; raw event_name is retained.
-- No source/crawl writes, no new editions, no user-reference/key/slug changes.
-- Full old/new row snapshots and strict rollback guards are stored in the existing
-- private.event_data_workflow_backup. All facts retain needs_review; no attestation.
-- The committed package is intended for rehearsal first, then the same reviewed SQL.
-- The script rejects repeat application and evidence older than the bounded review window.

begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('sporteventmap:20260907_p0_event_facts_batch_02', 0));
-- No request.jwt.claims, auth.uid override or app.freshness_verification override.
select set_config('app.change_source', 'manual_admin', true);
select set_config('app.change_reason', $reason$P0 facts batch 02 (2026-09-07): current official source review; factual corrections only, no freshness attestation. Evidence: https://my.raceresult.com/363978/info ; https://www.halbmarathon-friedberg.de/starterinfos/ ; https://www.airportrace.de/infos/$reason$, true);
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
    "event_id": 108,
    "edition_id": "50b5b657-fd77-48e0-9c50-3ab91550e0ca",
    "source_id": "c03533fb-50c4-4dd6-96cb-26718da80517",
    "source_url": "https://www.wep-lauf.de/",
    "before_event": {
      "id": 108,
      "city": "Hückelhoven",
      "date": "13.09.2026",
      "slug": "wep-strom-lauf",
      "image": "https://www.marathon.de/kategorien/9df6b59342.jpg",
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Breteuilplatz, 41836 Hückelhoven, Deutschland",
      "country": "Germany",
      "distance": "5 km / 10 km / 21 km / 42 km",
      "latitude": "51.0552368",
      "event_url": "https://my.raceresult.com/363978/registration",
      "longitude": "6.2247322",
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "created_by": null,
      "event_name": "wepLAUF",
      "source_url": "https://www.wep-lauf.de/",
      "updated_at": "2026-09-07T20:15:33.128182+00:00",
      "data_source": null,
      "description": "Der wepLAUF findet am 13. September 2026 in Hückelhoven statt. Der Start- und Zielbereich liegt am Breteuilplatz. Neben den Laufangeboten gibt es einen Flexi-Marathon, bei dem Teilnehmende nach einer Runde aussteigen und eine Urkunde für die zurückgelegte Strecke erhalten können. Die Online-Anmeldung ist laut Veranstalter bis 9. September um 23:59 Uhr möglich; am Wettkampftag werden Nachmeldungen gegen eine zusätzliche Gebühr angeboten.",
      "review_note": "Official-source verification completed; retained as the canonical record during P0 duplicate reconciliation on 2026-09-04.",
      "reviewed_at": "2026-09-04T05:40:09.352369+00:00",
      "reviewed_by": null,
      "source_type": "official",
      "status_note": null,
      "subcategory": null,
      "event_status": "active",
      "import_batch": null,
      "last_checked": "2026-09-04T05:40:09.352369+00:00",
      "needs_review": true,
      "official_url": "https://www.wep-lauf.de/",
      "organizer_id": null,
      "canonical_key": "weplauf-huckelhoven-germany",
      "next_check_at": "2026-09-07T20:15:33.128182+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "approved",
      "canonical_name": "wepLAUF",
      "organizer_name": null,
      "data_confidence": 0.98,
      "review_priority": "high",
      "last_verified_at": "2026-09-04T05:40:09.352369+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "registration_open",
      "verification_status": "needs_review"
    },
    "before_edition": {
      "id": "50b5b657-fd77-48e0-9c50-3ab91550e0ca",
      "currency": null,
      "end_date": "2026-09-13",
      "event_id": 108,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "source_url": "https://www.wep-lauf.de/",
      "start_date": "2026-09-13",
      "start_time": null,
      "updated_at": "2026-09-07T20:15:33.128182+00:00",
      "edition_slug": "wep-strom-lauf-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "5 km / 10 km / 21 km / 42 km"
        }
      ],
      "next_check_at": "2026-09-04T07:42:58.510058+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.98,
      "legacy_distance": "5 km / 10 km / 21 km / 42 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-09-04T05:40:09.352369+00:00",
      "legacy_event_key": "wep-strom lauf|13.09.2026|hückelhoven|germany",
      "registration_url": "https://my.raceresult.com/363978/registration",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "participant_limit": null,
      "publication_status": "published",
      "registration_status": "registration_open",
      "verification_status": "needs_review",
      "auto_publish_eligible": false,
      "discovery_archived_at": null,
      "predecessor_edition_id": null,
      "last_verified_source_id": null,
      "generated_from_source_id": null,
      "generated_from_candidate_id": null
    },
    "event_patch": {
      "address": "Parkhofstraße am Breteuilplatz, 41836 Hückelhoven, Deutschland",
      "latitude": "51.05510",
      "longitude": "6.22331",
      "distance": "wep Marathon (42.195 km); Flexi-Marathon (variable Distanz nach vollständigen Runden); Decathlon Halbmarathon (21.098 km); 10 km Walk und Nordic Walk (ungefähre Veranstalterangabe); Provinzial Run (ca. 5 km); Jugendläufe U14 und U16 (ca. 1300 m); Kinderläufe U12 (ca. 1000 m); Firmenstaffel (4 × 1470 m); Eltern-Kind-Lauf und Kinderläufe U8 (ca. 340 m); Kinderläufe U10 (ca. 680 m); Intersport 10 km Run; Spaßstaffel (4 × 340 m)"
    },
    "edition_patch": {
      "race_formats": [
        {
          "label": "wep Marathon (42.195 km)",
          "distance_km": 42.195
        },
        {
          "label": "Flexi-Marathon (variable Distanz nach vollständigen Runden)",
          "distance_mode": "variable"
        },
        {
          "label": "Decathlon Halbmarathon (21.098 km)",
          "distance_km": 21.098
        },
        {
          "label": "10 km Walk und Nordic Walk (ungefähre Veranstalterangabe)",
          "distance_km": 10,
          "approximate": true,
          "sport": "Walking"
        },
        {
          "label": "Provinzial Run (ca. 5 km)",
          "distance_km": 5,
          "approximate": true
        },
        {
          "label": "Jugendläufe U14 und U16 (ca. 1300 m)",
          "distance_km": 1.3,
          "approximate": true
        },
        {
          "label": "Kinderläufe U12 (ca. 1000 m)",
          "distance_km": 1,
          "approximate": true
        },
        {
          "label": "Firmenstaffel (4 × 1470 m)",
          "distance_km": 5.88,
          "relay": true,
          "legs": 4,
          "leg_distance_km": 1.47
        },
        {
          "label": "Eltern-Kind-Lauf und Kinderläufe U8 (ca. 340 m)",
          "distance_km": 0.34,
          "approximate": true
        },
        {
          "label": "Kinderläufe U10 (ca. 680 m)",
          "distance_km": 0.68,
          "approximate": true
        },
        {
          "label": "Intersport 10 km Run",
          "distance_km": 10
        },
        {
          "label": "Spaßstaffel (4 × 340 m)",
          "distance_km": 1.36,
          "relay": true,
          "legs": 4,
          "leg_distance_km": 0.34
        }
      ],
      "legacy_distance": "wep Marathon (42.195 km); Flexi-Marathon (variable Distanz nach vollständigen Runden); Decathlon Halbmarathon (21.098 km); 10 km Walk und Nordic Walk (ungefähre Veranstalterangabe); Provinzial Run (ca. 5 km); Jugendläufe U14 und U16 (ca. 1300 m); Kinderläufe U12 (ca. 1000 m); Firmenstaffel (4 × 1470 m); Eltern-Kind-Lauf und Kinderläufe U8 (ca. 340 m); Kinderläufe U10 (ca. 680 m); Intersport 10 km Run; Spaßstaffel (4 × 340 m)"
    }
  },
  {
    "event_id": 109,
    "edition_id": "42c43b74-cc37-4bcf-9198-e64ff32c9aa4",
    "source_id": "c43e21a3-af8b-4c40-b595-373fcb5e6609",
    "source_url": "https://www.halbmarathon-friedberg.de/",
    "before_event": {
      "id": 109,
      "city": "Friedberg i.Bayern",
      "date": "13.09.2026",
      "slug": "friedberger-halbmarathon",
      "image": "https://www.marathon.de/logos/friedberger-halbmarathon.jpg",
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Marienplatz (am Marienbrunnen), 86316 Friedberg, Deutschland",
      "country": "Germany",
      "distance": "21.1 km",
      "latitude": "48.355188",
      "event_url": "https://my.raceresult.com/360310/registration",
      "longitude": "10.978578",
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "created_by": null,
      "event_name": "Friedberger Halbmarathon",
      "source_url": "https://www.halbmarathon-friedberg.de/",
      "updated_at": "2026-09-07T20:15:33.128182+00:00",
      "data_source": null,
      "description": "Der Friedberger Halbmarathon findet am 13. September 2026 in Friedberg in Bayern statt. Um 10 Uhr beginnt der Lauf am Marienplatz in der Nähe des Marienbrunnens. Die 21,1 Kilometer verteilen sich auf vier Runden durch die Stadt. Ein Ausstieg ist nach jeder vollständigen Runde möglich. Verpflegungsstellen begleiten die Strecke. Die Veranstaltung ist ausgebucht; eine zentrale Warteliste bietet der Veranstalter nicht an.",
      "review_note": null,
      "reviewed_at": null,
      "reviewed_by": null,
      "source_type": "unknown",
      "status_note": null,
      "subcategory": null,
      "event_status": "active",
      "import_batch": null,
      "last_checked": null,
      "needs_review": true,
      "official_url": "https://www.halbmarathon-friedberg.de/",
      "organizer_id": null,
      "canonical_key": "friedberger-halbmarathon-friedberg-i-bayern-germany",
      "next_check_at": "2026-07-02T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Friedberger Halbmarathon",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "high",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "sold_out",
      "verification_status": "needs_review"
    },
    "before_edition": {
      "id": "42c43b74-cc37-4bcf-9198-e64ff32c9aa4",
      "currency": null,
      "end_date": "2026-09-13",
      "event_id": 109,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "source_url": "https://www.halbmarathon-friedberg.de/",
      "start_date": "2026-09-13",
      "start_time": null,
      "updated_at": "2026-09-07T20:15:33.128182+00:00",
      "edition_slug": "friedberger-halbmarathon-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:17:00.244453+00:00",
      "race_formats": [
        {
          "label": "21.1 km"
        }
      ],
      "next_check_at": "2026-07-02T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "21.1 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "friedberger halbmarathon|13.09.2026|friedberg i.bayern|germany",
      "registration_url": "https://my.raceresult.com/360310/registration",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "participant_limit": null,
      "publication_status": "published",
      "registration_status": "sold_out",
      "verification_status": "needs_review",
      "auto_publish_eligible": false,
      "discovery_archived_at": null,
      "predecessor_edition_id": null,
      "last_verified_source_id": null,
      "generated_from_source_id": null,
      "generated_from_candidate_id": null
    },
    "event_patch": {
      "distance": "21.1 km (Halbmarathon über 4 Runden); 5.3 km (Teilwertung nach 1 Runde); 10.6 km (Teilwertung nach 2 Runden); 15.9 km (Teilwertung nach 3 Runden)",
      "description": "Der Friedberger Halbmarathon findet am 13. September 2026 in Friedberg in Bayern statt. Um 10 Uhr beginnt der Lauf am Marienplatz in der Nähe des Marienbrunnens. Die 21,1 Kilometer verteilen sich auf vier Runden durch die Stadt. Ein Abschluss nach einer, zwei oder drei vollständigen Runden ist möglich; dafür nennt der Veranstalter 5,3, 10,6 und 15,9 Kilometer mit eigenen Gesamtwertungen. Verpflegungsstellen begleiten die Strecke. Die Veranstaltung ist ausgebucht; eine zentrale Warteliste bietet der Veranstalter nicht an."
    },
    "edition_patch": {
      "race_formats": [
        {
          "label": "21.1 km (Halbmarathon über 4 Runden)",
          "distance_km": 21.1
        },
        {
          "label": "5.3 km (Teilwertung nach 1 Runde)",
          "distance_km": 5.3
        },
        {
          "label": "10.6 km (Teilwertung nach 2 Runden)",
          "distance_km": 10.6
        },
        {
          "label": "15.9 km (Teilwertung nach 3 Runden)",
          "distance_km": 15.9
        }
      ],
      "legacy_distance": "21.1 km (Halbmarathon über 4 Runden); 5.3 km (Teilwertung nach 1 Runde); 10.6 km (Teilwertung nach 2 Runden); 15.9 km (Teilwertung nach 3 Runden)"
    }
  },
  {
    "event_id": 284,
    "edition_id": "f287ae68-59ab-4cff-8398-3e3c70522e3b",
    "source_id": "e5e4665c-cf46-4bcc-a5c3-f8bd10934ca1",
    "source_url": "https://www.airportrace.de/",
    "before_event": {
      "id": 284,
      "city": "Hamburg",
      "date": "13.09.2026",
      "slug": "43-internationalen-airport-race",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "LSV-Sportanlage, Borsteler Chaussee 330, Hamburg, Germany",
      "country": "Germany",
      "distance": "16.1 km, 5 km",
      "latitude": "53.61692",
      "event_url": "https://www.airportrace.de/anmeldung/",
      "longitude": "9.9756601",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "43. Internationalen Airport Race",
      "source_url": "https://www.airportrace.de/",
      "updated_at": "2026-09-07T20:15:33.128182+00:00",
      "data_source": null,
      "description": "Das 43. Internationale Airport Race findet am 13. September 2026 in Hamburg statt. Start und Ziel liegen auf der LSV-Sportanlage an der Borsteler Chaussee 330. Der Hauptlauf über 10 Meilen (16,1 km) beginnt um 11:00 Uhr und führt über Straßen, Fußwege und feste Wanderwege rund um den Flughafen. Der 5-km-Lauf startet um 10:00 Uhr und führt durch die Umgebung der Sportanlage sowie den Borsteler Jäger. Für Kinder gibt es das Mini Airport Race über 400 Meter und eine Meile. Online-Nachmeldungen sind seit dem 2. September möglich, solange das Teilnahmelimit nicht erreicht ist. Das Meldegeld wird bei der Abholung der Startunterlagen bar bezahlt.",
      "review_note": null,
      "reviewed_at": null,
      "reviewed_by": null,
      "source_type": "unknown",
      "status_note": null,
      "subcategory": null,
      "event_status": "active",
      "import_batch": null,
      "last_checked": null,
      "needs_review": true,
      "official_url": "https://www.airportrace.de/",
      "organizer_id": null,
      "canonical_key": "43-internationalen-airport-race-hamburg-airport-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "43. Internationalen Airport Race",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "high",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "registration_open",
      "verification_status": "needs_review"
    },
    "before_edition": {
      "id": "f287ae68-59ab-4cff-8398-3e3c70522e3b",
      "currency": null,
      "end_date": "2026-09-13",
      "event_id": 284,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://www.airportrace.de/",
      "start_date": "2026-09-13",
      "start_time": null,
      "updated_at": "2026-09-07T20:15:33.128182+00:00",
      "edition_slug": "43-internationalen-airport-race-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "16.1 km, 5 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "16.1 km, 5 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "43. internationalen airport race|13.09.2026|hamburg airport|germany",
      "registration_url": "https://www.airportrace.de/anmeldung/",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "participant_limit": null,
      "publication_status": "published",
      "registration_status": "registration_open",
      "verification_status": "needs_review",
      "auto_publish_eligible": false,
      "discovery_archived_at": null,
      "predecessor_edition_id": null,
      "last_verified_source_id": null,
      "generated_from_source_id": null,
      "generated_from_candidate_id": null
    },
    "event_patch": {
      "canonical_name": "43. Int. Airport Race",
      "distance": "10 Meilen (16.1 km); 5 km; Mini Airport Race 400 m; Mini Airport Race 1 Meile"
    },
    "edition_patch": {
      "race_formats": [
        {
          "label": "10 Meilen (16.1 km)",
          "distance_km": 16.1
        },
        {
          "label": "5 km",
          "distance_km": 5
        },
        {
          "label": "Mini Airport Race 400 m",
          "distance_km": 0.4
        },
        {
          "label": "Mini Airport Race 1 Meile"
        }
      ],
      "legacy_distance": "10 Meilen (16.1 km); 5 km; Mini Airport Race 400 m; Mini Airport Race 1 Meile"
    }
  }
]
$reviewed_batch$::jsonb) as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb);

-- Freeze scheduler writes before checking active jobs. Row locks then follow
-- the worker/verifier order: every source of these events -> events -> editions.
lock table public.source_crawl_jobs in share mode;
select 1 from public.event_sources s where s.event_id in (108, 109, 284)
order by s.id for update;
select 1 from public.events e where e.id in (108, 109, 284)
order by e.id for update;
select 1 from public.event_editions e where e.event_id in (108, 109, 284)
order by e.event_id, e.id for update;

do $preflight$
begin
  -- The only dynamic column names permitted by this fixed, reviewed package.
  if exists (
    select 1 from p0_fact_targets t
    where jsonb_typeof(t.event_patch) is distinct from 'object'
      or jsonb_typeof(t.edition_patch) is distinct from 'object'
      or t.event_patch = '{}'::jsonb or t.edition_patch = '{}'::jsonb
      or exists (select 1 from jsonb_object_keys(t.event_patch) field
                 where field not in ('address','latitude','longitude','distance','description','canonical_name'))
      or exists (select 1 from jsonb_object_keys(t.edition_patch) field
                 where field not in ('race_formats','legacy_distance'))
      or not (t.event_patch ? 'distance')
      or not (t.edition_patch ?& array['race_formats','legacy_distance'])
      or jsonb_typeof(t.edition_patch -> 'race_formats') is distinct from 'array'
      or t.event_patch -> 'distance' is distinct from t.edition_patch -> 'legacy_distance'
  ) then
    raise exception 'P0 facts guard: patch keys or distance mirrors differ from the reviewed factual scope';
  end if;
  if exists (
    select 1 from p0_fact_targets t
    where jsonb_array_length(t.edition_patch -> 'race_formats') <> case t.event_id when 108 then 12 else 4 end
      or t.event_patch ->> 'distance' is distinct from (
        select string_agg(f.value ->> 'label', '; ' order by f.ordinality)
        from jsonb_array_elements(t.edition_patch -> 'race_formats') with ordinality f(value,ordinality))
      or exists (
        select 1 from jsonb_array_elements(t.edition_patch -> 'race_formats') f
        where jsonb_typeof(f) is distinct from 'object'
          or nullif(btrim(f ->> 'label'),'') is null)
  ) then
    raise exception 'P0 facts guard: complete reviewed formats must match both public distance mirrors';
  end if;

  if now() < timestamptz '2026-09-07 21:27:03+00'
     or now() >= timestamptz '2026-09-08 21:22:41+00' then
    raise exception 'P0 facts evidence window expired or not yet valid; refresh official source review';
  end if;
  if exists (select 1 from private.event_data_workflow_backup where migration_key in ('20260907_p0_event_facts_batch_02', '20260907_p0_event_facts_batch_02_rollback')) then
    raise exception 'P0 facts batch key already exists; no repeat application or overwrite';
  end if;
  if (select count(*) from p0_fact_targets) <> 3
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[108,109,284]::bigint[]
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
    where s.event_id in (108, 109, 284)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (108, 109, 284)
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
    where e.event_id in (108,109,284) and e.publication_status = 'published'
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
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (108, 109, 284)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('50b5b657-fd77-48e0-9c50-3ab91550e0ca'::uuid, '42c43b74-cc37-4bcf-9198-e64ff32c9aa4'::uuid, 'f287ae68-59ab-4cff-8398-3e3c70522e3b'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (108, 109, 284))
  ) as value;

insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260907_p0_event_facts_batch_02', 'events', e.id::text, to_jsonb(e)
from public.events e join p0_fact_targets t on t.event_id = e.id
union all
select '20260907_p0_event_facts_batch_02', 'event_editions', e.id::text, to_jsonb(e)
from public.event_editions e join p0_fact_targets t on t.edition_id = e.id;
insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260907_p0_event_facts_batch_02', 'batch_manifest', 'batch',
  jsonb_build_object('targets',(select jsonb_agg(to_jsonb(t) order by event_id) from p0_fact_targets t),
    'invariants',value,'actor',current_user,'auth_uid',auth.uid(),'reason',$reason$P0 facts batch 02 (2026-09-07): current official source review; factual corrections only, no freshness attestation. Evidence: https://my.raceresult.com/363978/info ; https://www.halbmarathon-friedberg.de/starterinfos/ ; https://www.airportrace.de/infos/$reason$,
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
    execute 'update public.events set ' || assignments ||
      ', verification_status=''needs_review'', needs_review=true, review_priority=''high'',
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
    execute 'update public.event_editions set ' || assignments ||
      ', verification_status=''needs_review'', needs_review=true, review_priority=''high'',
         last_verified_source_id=null,
         next_check_at=least(coalesce(($1).next_check_at,now()),now())
         where id=$2 and event_id=$3'
      using edition_value, target.edition_id, target.event_id;
  end loop;
end
$apply_reviewed_facts$;

do $postflight$
begin
  if (select count(*) from public.events where id in (108,109,284)) <> 3
     or (select count(*) from public.event_editions e join p0_fact_targets t on e.id = t.edition_id) <> 3
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
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (108, 109, 284)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('50b5b657-fd77-48e0-9c50-3ab91550e0ca'::uuid, '42c43b74-cc37-4bcf-9198-e64ff32c9aa4'::uuid, 'f287ae68-59ab-4cff-8398-3e3c70522e3b'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (108, 109, 284))
  ) then
    raise exception 'P0 facts postcondition: counts, user references, other records or sources changed';
  end if;
  if (select count(*) from p0_fact_targets) <> 3
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[108,109,284]::bigint[]
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
    where s.event_id in (108, 109, 284)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (108, 109, 284)
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
          and a.change_source = 'manual_admin' and a.reason = $reason$P0 facts batch 02 (2026-09-07): current official source review; factual corrections only, no freshness attestation. Evidence: https://my.raceresult.com/363978/info ; https://www.halbmarathon-friedberg.de/starterinfos/ ; https://www.airportrace.de/infos/$reason$
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
          and a.change_source = 'manual_admin' and a.reason = $reason$P0 facts batch 02 (2026-09-07): current official source review; factual corrections only, no freshness attestation. Evidence: https://my.raceresult.com/363978/info ; https://www.halbmarathon-friedberg.de/starterinfos/ ; https://www.airportrace.de/infos/$reason$
      )
  ) then
    raise exception 'P0 facts postcondition: a factual change lacks its automatic field audit';
  end if;
end
$audit_guard$;

insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260907_p0_event_facts_batch_02', 'events_post_state', e.id::text, to_jsonb(e)
from public.events e join p0_fact_targets t on t.event_id = e.id
union all
select '20260907_p0_event_facts_batch_02', 'event_editions_post_state', e.id::text, to_jsonb(e)
from public.event_editions e join p0_fact_targets t on t.edition_id = e.id;

do $backup_guard$
begin
  if (select count(*) from private.event_data_workflow_backup where migration_key = '20260907_p0_event_facts_batch_02') <> 13 then
    raise exception 'P0 facts snapshots incomplete: expected 6 before, 6 after and 1 manifest';
  end if;
end
$backup_guard$;
commit;
