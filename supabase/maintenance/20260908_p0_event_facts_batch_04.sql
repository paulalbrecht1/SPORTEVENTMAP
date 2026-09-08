-- P0 event facts batch 04: reviewed official sources, 2026-09-08. Maintenance, not a migration.
-- Exact existing event scope: 117/119/291/295/329/418/472/488/510. No new identities, source-health writes or freshness attestation.
-- Private snapshots and atomic audits; rehearse application and rollback before production.

begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('sporteventmap:20260908_p0_event_facts_batch_04', 0));
-- No request.jwt.claims, auth.uid override or app.freshness_verification override.
select set_config('app.change_source', 'manual_admin', true);
select set_config('app.change_reason', $reason$P0 facts batch 04 (2026-09-08): independently reviewed official event facts and dates. No freshness attestation. Evidence: https://brauereienlauf.de/ ; https://www.altstadtlauf-salzwedel.de/ ; https://www.twinfit.de/twinfitlauf ; https://balingen.bw-running.de/home ; https://www.stadtteillauf.de/ ; https://www.pellkartoffellauf.de/ ; https://www.firmenlauf-cottbus.de/ ; https://holzlandlauf.info/ ; https://ot-bremen-run.bremenracing.online/$reason$, true);
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
    "event_id": 117,
    "edition_id": "9ed18697-8648-463f-8a6d-68786010fbf4",
    "source_id": "ecf7b3fb-94fd-43c4-b38a-70cbf71569d0",
    "source_url": "https://brauereienlauf.de/",
    "before_event": {
      "id": 117,
      "city": "Litzendorf",
      "date": "19.09.2026",
      "slug": "brauereienlauf",
      "image": "https://www.marathon.de/kategorien/2232d51c55.jpg",
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Litzendorf, Germany",
      "country": "Germany",
      "distance": "10 km / 21 km",
      "latitude": "49.9123064",
      "event_url": "https://brauereienlauf.de/",
      "longitude": "11.0096505",
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "created_by": null,
      "event_name": "Brauereienlauf",
      "source_url": "https://brauereienlauf.de/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Imported from marathon.de running calendar. Source listing: https://www.marathon.de/laufevent/brauereienlauf/",
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
      "official_url": "https://brauereienlauf.de/",
      "organizer_id": null,
      "canonical_key": "brauereienlauf-litzendorf-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Brauereienlauf",
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
      "id": "9ed18697-8648-463f-8a6d-68786010fbf4",
      "currency": null,
      "end_date": "2026-09-19",
      "event_id": 117,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "source_url": "https://brauereienlauf.de/",
      "start_date": "2026-09-19",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "brauereienlauf-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "10 km / 21 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "10 km / 21 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "brauereienlauf|19.09.2026|litzendorf|germany",
      "registration_url": "https://brauereienlauf.de/",
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
      "address": "Tanzwiesen (Start-/Zielbereich), Am Wehr, 96123 Litzendorf",
      "description": "Der Brauereienlauf startet und endet auf den Tanzwiesen in Litzendorf. 2026 führen die Strecken auf der Südschleife durch die Fränkische Toskana. Zum Programm gehören 5 km für Schüler, 10 km, Halbmarathon, Marathon und Bambiniläufe. Regionale Verpflegung begleitet die Läufe. Nachmeldungen sind am Veranstaltungstag nach Verfügbarkeit möglich.",
      "registration_status": "registration_not_open",
      "event_url": "https://my.raceresult.com/373318/",
      "latitude": "49.91119",
      "longitude": "11.00955"
    },
    "edition_patch": {
      "registration_status": "registration_not_open",
      "registration_url": "https://my.raceresult.com/373318/"
    }
  },
  {
    "event_id": 119,
    "edition_id": "6cbdeebe-6ead-47c0-a610-8442dafff6e9",
    "source_id": "3198947e-50a5-47ce-95ca-46e31306af25",
    "source_url": "https://www.altstadtlauf-salzwedel.de/",
    "before_event": {
      "id": 119,
      "city": "Salzwedel",
      "date": "20.09.2026",
      "slug": "altstadtlauf-salzwedel",
      "image": "https://www.marathon.de/kategorien/2232d51c55.jpg",
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Salzwedel, Germany",
      "country": "Germany",
      "distance": "5 km / 10 km / 21 km",
      "latitude": "52.8528456",
      "event_url": "https://www.altstadtlauf-salzwedel.de/",
      "longitude": "11.1539699",
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "created_by": null,
      "event_name": "Altstadtlauf Salzwedel",
      "source_url": "https://www.altstadtlauf-salzwedel.de/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Imported from marathon.de running calendar. Source listing: https://www.marathon.de/laufevent/altstadtlauf-salzwedel/",
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
      "official_url": "https://www.altstadtlauf-salzwedel.de/",
      "organizer_id": null,
      "canonical_key": "altstadtlauf-salzwedel-salzwedel-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Altstadtlauf Salzwedel",
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
      "id": "6cbdeebe-6ead-47c0-a610-8442dafff6e9",
      "currency": null,
      "end_date": "2026-09-20",
      "event_id": 119,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "source_url": "https://www.altstadtlauf-salzwedel.de/",
      "start_date": "2026-09-20",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "altstadtlauf-salzwedel-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "5 km / 10 km / 21 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "5 km / 10 km / 21 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "altstadtlauf salzwedel|20.09.2026|salzwedel|germany",
      "registration_url": "https://www.altstadtlauf-salzwedel.de/",
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
      "address": "Marktplatz am Bürgercenter, Am Schulwall 1, 29410 Salzwedel",
      "description": "Der Altstadtlauf Salzwedel führt auf Rundkursen durch Straßen, Gassen und Parkwege der Stadt. Start und Ziel liegen am Bürgercenter am Schulwall. Angeboten werden 5 km, 10 km und 21,1 km sowie ein 500-m-Bambinilauf und ein Kinder- und Jugendlauf über 1 km.",
      "registration_status": "registration_open",
      "event_url": "https://www.altstadtlauf-salzwedel.de/anmeldung/",
      "latitude": "52.85150",
      "longitude": "11.15474",
      "distance": "Bambini-Lauf – 500 m / Kinder- und Jugendlauf – 1 km / Kleiner Altstadtlauf – 5 km / Großer Altstadtlauf – 10 km / Halber Altstadtmarathon – 21.1 km"
    },
    "edition_patch": {
      "registration_status": "registration_open",
      "registration_url": "https://www.altstadtlauf-salzwedel.de/anmeldung/",
      "race_formats": [
        {
          "label": "Bambini-Lauf – 500 m",
          "distance_km": 0.5
        },
        {
          "label": "Kinder- und Jugendlauf – 1 km",
          "distance_km": 1
        },
        {
          "label": "Kleiner Altstadtlauf – 5 km",
          "distance_km": 5
        },
        {
          "label": "Großer Altstadtlauf – 10 km",
          "distance_km": 10
        },
        {
          "label": "Halber Altstadtmarathon – 21.1 km",
          "distance_km": 21.1
        }
      ],
      "legacy_distance": "Bambini-Lauf – 500 m / Kinder- und Jugendlauf – 1 km / Kleiner Altstadtlauf – 5 km / Großer Altstadtlauf – 10 km / Halber Altstadtmarathon – 21.1 km"
    }
  },
  {
    "event_id": 291,
    "edition_id": "ec808969-ea0a-482d-838e-68d213848a6e",
    "source_id": "cd31545b-6fb2-47c2-b369-d4bc6526530d",
    "source_url": "https://www.twinfit.de/twinfitlauf",
    "before_event": {
      "id": 291,
      "city": "Aerzen",
      "date": "20.09.2026",
      "slug": "aerzener-twinfit-volkslauf",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Aerzen, Lower Saxony, Germany, Germany",
      "country": "Germany",
      "distance": "10 km",
      "latitude": "52.035157",
      "event_url": "https://www.twinfit.de/twinfitlauf",
      "longitude": "9.25543",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "Aerzener twinfit-Volkslauf",
      "source_url": "https://www.twinfit.de/twinfitlauf",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Der Aerzener twinfit-Volkslauf ist eine familienfreundliche Laufveranstaltung mit verschiedenen Distanzen, die in Aerzen startet und endet. Angeboten werden ein 5 km und 10 km Volkslauf, ein Firmen- und Teamlauf über 5 km sowie ein Schülerlauf über 1,8 km und ein kostenfreier Kinderlauf. Die Veranstaltung findet am 20. September 2026 statt und bietet eine angenehme Atmosphäre mit Verpflegung und Siegerehrung. Die Läu",
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
      "official_url": "https://www.twinfit.de/twinfitlauf",
      "organizer_id": null,
      "canonical_key": "aerzener-twinfit-volkslauf-aerzen-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Aerzener twinfit-Volkslauf",
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
      "id": "ec808969-ea0a-482d-838e-68d213848a6e",
      "currency": null,
      "end_date": "2026-09-20",
      "event_id": 291,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://www.twinfit.de/twinfitlauf",
      "start_date": "2026-09-20",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "aerzener-twinfit-volkslauf-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "10 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "10 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "aerzener twinfit-volkslauf|20.09.2026|aerzen|germany",
      "registration_url": "https://www.twinfit.de/twinfitlauf",
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
      "address": "twinfit, Königsförder Straße 19, 31855 Aerzen",
      "description": "Beim Aerzener twinfit-Volkslauf liegen Start und Ziel am twinfit in der Königsförder Straße. Angeboten werden Läufe über 5 km und 10 km, 5 km Walking sowie ein Schülerlauf über 1,8 km. Zum Programm gehören außerdem der Kinder-twinnilauf und ein Firmen- und Teamlauf über 5 km, bei dem die Zeiten der drei schnellsten Teammitglieder addiert werden.",
      "registration_status": "registration_open",
      "latitude": "52.05078",
      "longitude": "9.26018"
    },
    "edition_patch": {
      "registration_status": "registration_open"
    }
  },
  {
    "event_id": 295,
    "edition_id": "62267e72-a4af-43d6-9ed8-53935ef9ef9a",
    "source_id": "f718b0d9-ceba-452a-a216-5742064941db",
    "source_url": "https://balingen.bw-running.de/home",
    "before_event": {
      "id": 295,
      "city": "Balingen",
      "date": "24.09.2026",
      "slug": "aok-firmenlauf-balingen",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Marktplatz, Balingen, Baden-Württemberg, Germany, Germany",
      "country": "Germany",
      "distance": "5 km",
      "latitude": "48.3313",
      "event_url": "https://balingen.bw-running.de/home",
      "longitude": "8.886042",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "AOK Firmenlauf Balingen",
      "source_url": "https://balingen.bw-running.de/home",
      "updated_at": "2026-09-04T04:30:05.609814+00:00",
      "data_source": null,
      "description": "Der AOK Firmenlauf Balingen ist ein beliebtes Team-Event, das am 24. September 2026 auf dem Marktplatz in Balingen stattfindet. Die Strecke umfasst ca. 5,9 Kilometer, die in zwei Runden à etwa 2,9 km gelaufen werden. Der Lauf steht für Bewegung für alle und fördert Inklusion, sodass Menschen mit und ohne Behinderung gemeinsam teilnehmen können. Nach dem Lauf erwartet die Teilnehmer eine kostenfreie Zielverpflegung un",
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
      "official_url": "https://balingen.bw-running.de/home",
      "organizer_id": null,
      "canonical_key": "aok-firmenlauf-balingen-balingen-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "AOK Firmenlauf Balingen",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "high",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "unclear",
      "verification_status": "verified"
    },
    "before_edition": {
      "id": "62267e72-a4af-43d6-9ed8-53935ef9ef9a",
      "currency": null,
      "end_date": "2026-09-24",
      "event_id": 295,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://balingen.bw-running.de/home",
      "start_date": "2026-09-24",
      "start_time": null,
      "updated_at": "2026-09-04T04:30:05.609814+00:00",
      "edition_slug": "aok-firmenlauf-balingen-2026",
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
      "legacy_event_key": "aok firmenlauf balingen|24.09.2026|balingen|germany",
      "registration_url": "https://balingen.bw-running.de/home",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "participant_limit": null,
      "publication_status": "published",
      "registration_status": "unknown",
      "verification_status": "verified",
      "auto_publish_eligible": false,
      "discovery_archived_at": null,
      "predecessor_edition_id": null,
      "last_verified_source_id": null,
      "generated_from_source_id": null,
      "generated_from_candidate_id": null
    },
    "event_patch": {
      "address": "Marktplatz, Friedrichstraße, 72336 Balingen, Deutschland",
      "latitude": "48.27332",
      "longitude": "8.85086",
      "description": "Der AOK Firmenlauf Balingen findet am 24. September 2026 statt. Start und Ziel liegen auf dem Marktplatz an der Friedrichstraße. Der Firmenlauf beginnt um 18:00 Uhr; bereits um 17:00 Uhr startet der inklusive Lauf für ALLE ohne Zeitmessung. Unternehmen können ihre Teams anmelden, außerdem sind Einzelanmeldungen möglich. Nach dem Lauf gehören Zielverpflegung, Siegerehrungen und eine After-Run-Party zum Programm. Die reguläre Anmeldung ist derzeit geöffnet; die Teilnahmeplätze sind begrenzt.",
      "registration_status": "registration_open"
    },
    "edition_patch": {
      "registration_url": "https://balingen.bw-running.de/anmeldung",
      "registration_status": "registration_open"
    }
  },
  {
    "event_id": 329,
    "edition_id": "9c851591-1924-4de0-82dd-5c37a9ef945b",
    "source_id": "089f0007-bab4-4c6d-af61-8c7cc3b22c80",
    "source_url": "https://www.stadtteillauf.de/",
    "before_event": {
      "id": 329,
      "city": "Darmstadt",
      "date": "19.09.2026",
      "slug": "bessunger-merck-lauf",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Bessunger, Darmstadt, Hessen, Germany, Germany",
      "country": "Germany",
      "distance": "10 km",
      "latitude": "49.847729",
      "event_url": "https://www.stadtteillauf.de/",
      "longitude": "8.648787",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "Bessunger Merck-Lauf",
      "source_url": "https://www.stadtteillauf.de/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Der Bessunger Merck-Lauf ist ein traditionsreicher Stadtteillauf in Darmstadt, der Läuferinnen und Läufer aller Altersklassen willkommen heißt. Die Veranstaltung bietet verschiedene Streckenlängen und zeichnet sich durch eine abwechslungsreiche Strecke durch den Bessunger Stadtteil aus. Die Voranmeldung ist ab sofort möglich, wobei die Voranmeldefrist aus organisatorischen Gründen bereits am 13. September endet. Der",
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
      "official_url": "https://www.stadtteillauf.de/",
      "organizer_id": null,
      "canonical_key": "bessunger-merck-lauf-darmstadt-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Bessunger Merck-Lauf",
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
      "id": "9c851591-1924-4de0-82dd-5c37a9ef945b",
      "currency": null,
      "end_date": "2026-09-19",
      "event_id": 329,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://www.stadtteillauf.de/",
      "start_date": "2026-09-19",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "bessunger-merck-lauf-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "10 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "10 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "bessunger merck-lauf|19.09.2026|darmstadt|germany",
      "registration_url": "https://www.stadtteillauf.de/",
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
      "address": "Orangerie Darmstadt, Bessunger Straße 44, 64285 Darmstadt, Deutschland",
      "latitude": "49.85785",
      "longitude": "8.65414",
      "description": "Der Bessunger Merck-Lauf findet am 19. September 2026 an der Orangerie in Darmstadt statt. Zum Programm gehören ein Purzellauf über 750 Meter, sechs nach Alter und Geschlecht getrennte Schülerläufe über 1,1 bis 1,8 Kilometer, der Bessunger Lauf für Alle über 5,3 Kilometer und der 10-Kilometer-Hauptlauf. Die Starts beginnen um 13:00 Uhr; die beiden Erwachsenenläufe folgen um 16:00 und 16:45 Uhr. Die Voranmeldung läuft bis 13. September um 22:00 Uhr. Nachmeldungen sind am Veranstaltungstag bis 30 Minuten vor dem jeweiligen Start gegen Aufpreis möglich.",
      "registration_status": "registration_open",
      "distance": "0.75 km Purzellauf (4–6 Jahre), 1.1 km Schülerinnen (7–8 Jahre), 1.1 km Schüler (7–8 Jahre), 1.4 km Schülerinnen (9–10 Jahre), 1.4 km Schüler (9–10 Jahre), 1.8 km Schülerinnen (11–15 Jahre), 1.8 km Schüler (11–15 Jahre), 5.3 km Bessunger Lauf für Alle, 10 km Hauptlauf"
    },
    "edition_patch": {
      "registration_url": "https://www.stadtteillauf.de/index.php?id=anmeldung",
      "registration_status": "registration_open",
      "legacy_distance": "0.75 km Purzellauf (4–6 Jahre), 1.1 km Schülerinnen (7–8 Jahre), 1.1 km Schüler (7–8 Jahre), 1.4 km Schülerinnen (9–10 Jahre), 1.4 km Schüler (9–10 Jahre), 1.8 km Schülerinnen (11–15 Jahre), 1.8 km Schüler (11–15 Jahre), 5.3 km Bessunger Lauf für Alle, 10 km Hauptlauf",
      "race_formats": [
        {
          "label": "0.75 km Purzellauf (4–6 Jahre)",
          "distance_km": 0.75,
          "sport": "Running"
        },
        {
          "label": "1.1 km Schülerinnen (7–8 Jahre)",
          "distance_km": 1.1,
          "sport": "Running"
        },
        {
          "label": "1.1 km Schüler (7–8 Jahre)",
          "distance_km": 1.1,
          "sport": "Running"
        },
        {
          "label": "1.4 km Schülerinnen (9–10 Jahre)",
          "distance_km": 1.4,
          "sport": "Running"
        },
        {
          "label": "1.4 km Schüler (9–10 Jahre)",
          "distance_km": 1.4,
          "sport": "Running"
        },
        {
          "label": "1.8 km Schülerinnen (11–15 Jahre)",
          "distance_km": 1.8,
          "sport": "Running"
        },
        {
          "label": "1.8 km Schüler (11–15 Jahre)",
          "distance_km": 1.8,
          "sport": "Running"
        },
        {
          "label": "5.3 km Bessunger Lauf für Alle",
          "distance_km": 5.3,
          "sport": "Running"
        },
        {
          "label": "10 km Hauptlauf",
          "distance_km": 10,
          "sport": "Running"
        }
      ]
    }
  },
  {
    "event_id": 418,
    "edition_id": "6bd198c8-0dde-4527-aa9a-88066d158177",
    "source_id": "c57dab06-9ecf-4091-8689-2607bc536e36",
    "source_url": "https://www.pellkartoffellauf.de/",
    "before_event": {
      "id": 418,
      "city": "Hohenlockstedt",
      "date": "26.09.2026",
      "slug": "hohenlockstedter-pellkartoffellauf",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Pohl-Boskamp Gelände, Hohenlockstedt, Schleswig-Holstein, Germany, Germany",
      "country": "Germany",
      "distance": "10 km, 5 km",
      "latitude": "53.9667",
      "event_url": "https://www.pellkartoffellauf.de/",
      "longitude": "9.61667",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "Hohenlockstedter Pellkartoffellauf",
      "source_url": "https://www.pellkartoffellauf.de/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Der Hohenlockstedter Pellkartoffellauf ist ein traditionsreiches Laufevent, das seit 2002 jährlich auf dem Pohl-Boskamp Gelände stattfindet. Mit Streckenlängen von 2,8 km, 5 km und 10 km bietet der Lauf sowohl Anfängern als auch erfahrenen Läufern eine passende Herausforderung. Besonders familienfreundlich gestaltet sich das Event durch spezielle Bambini-Läufe für Kinder und ein abwechslungsreiches Rahmenprogramm mit",
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
      "official_url": "https://www.pellkartoffellauf.de/",
      "organizer_id": null,
      "canonical_key": "hohenlockstedter-pellkartoffellauf-hohenlockstedt-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Hohenlockstedter Pellkartoffellauf",
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
      "id": "6bd198c8-0dde-4527-aa9a-88066d158177",
      "currency": null,
      "end_date": "2026-09-26",
      "event_id": 418,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://www.pellkartoffellauf.de/",
      "start_date": "2026-09-26",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "hohenlockstedter-pellkartoffellauf-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "10 km, 5 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "10 km, 5 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "hohenlockstedter pellkartoffellauf|26.09.2026|hohenlockstedt|germany",
      "registration_url": "https://www.pellkartoffellauf.de/",
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
      "address": "Pohl-Boskamp Außengelände an der Kartoffelhalle, Schäferweg 25, 25551 Hohenlockstedt, Deutschland",
      "latitude": "53.96026",
      "longitude": "9.61332",
      "description": "Der Hohenlockstedter Pellkartoffellauf findet am 26. September 2026 auf dem Pohl-Boskamp-Gelände an der Kartoffelhalle im Schäferweg statt. Angeboten werden Läufe über 2,8, 5 und 10 Kilometer sowie Walking und Nordic Walking über 5 Kilometer. Für Vorschulkinder und Erstklässler gibt es zwei Bambiniläufe über jeweils etwa 500 Meter ohne vorherige Onlineanmeldung. Das Laufprogramm beginnt um 12:00 Uhr mit den Bambini; die übrigen Starts folgen um 13:00, 14:00 und 15:30 Uhr. Die reguläre Anmeldung erfolgt über RaceResult. Nachmeldungen sind bei verfügbaren Startnummern bis 45 Minuten vor dem jeweiligen Start möglich.",
      "registration_status": "registration_open",
      "distance": "0.5 km Bambiniläufe (ca.), 2.8 km Lauf, 5 km Lauf, 5 km Walking und Nordic Walking, 10 km Lauf"
    },
    "edition_patch": {
      "registration_url": "https://my.raceresult.com/397370/registration",
      "registration_status": "registration_open",
      "legacy_distance": "0.5 km Bambiniläufe (ca.), 2.8 km Lauf, 5 km Lauf, 5 km Walking und Nordic Walking, 10 km Lauf",
      "race_formats": [
        {
          "label": "0.5 km Bambiniläufe (ca.)",
          "distance_km": 0.5,
          "sport": "Running"
        },
        {
          "label": "2.8 km Lauf",
          "distance_km": 2.8,
          "sport": "Running"
        },
        {
          "label": "5 km Lauf",
          "distance_km": 5,
          "sport": "Running"
        },
        {
          "label": "5 km Walking und Nordic Walking",
          "distance_km": 5,
          "sport": "Walking"
        },
        {
          "label": "10 km Lauf",
          "distance_km": 10,
          "sport": "Running"
        }
      ]
    }
  },
  {
    "event_id": 472,
    "edition_id": "79d8165e-9cc5-4350-a3a9-0c467972f885",
    "source_id": "bdb063fa-8de3-4609-9c1b-481bc625ae1a",
    "source_url": "https://www.firmenlauf-cottbus.de/",
    "before_event": {
      "id": 472,
      "city": "Cottbus",
      "date": "10.09.2026",
      "slug": "dak-firmenlauf-cottbus",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Cottbus, Germany",
      "country": "Germany",
      "distance": "5 km",
      "latitude": "51.7567447",
      "event_url": "https://www.firmenlauf-cottbus.de/",
      "longitude": "14.3357307",
      "created_at": "2026-07-29T08:53:47.307283+00:00",
      "created_by": null,
      "event_name": "DAK Firmenlauf Cottbus",
      "source_url": "https://www.firmenlauf-cottbus.de/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Official endurance event in Cottbus. Imported from verified staging batch.",
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
      "official_url": "https://www.firmenlauf-cottbus.de/",
      "organizer_id": null,
      "canonical_key": "dak-firmenlauf-cottbus-cottbus-germany",
      "next_check_at": "2026-08-28T08:53:36.325+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "DAK Firmenlauf Cottbus",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "medium",
      "last_verified_at": "2026-06-17T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "unclear",
      "verification_status": "verified"
    },
    "before_edition": {
      "id": "79d8165e-9cc5-4350-a3a9-0c467972f885",
      "currency": null,
      "end_date": "2026-09-10",
      "event_id": 472,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:47.307283+00:00",
      "source_url": "https://www.firmenlauf-cottbus.de/",
      "start_date": "2026-09-10",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "dak-firmenlauf-cottbus-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "5 km"
        }
      ],
      "next_check_at": "2026-08-28T08:53:36.325+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "5 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-17T00:00:00+00:00",
      "legacy_event_key": "dak firmenlauf cottbus|10.09.2026|cottbus|germany",
      "registration_url": "https://www.firmenlauf-cottbus.de/",
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
      "address": "Puschkinpark, Puschkinpromenade, Cottbus, Deutschland",
      "latitude": "51.76233",
      "longitude": "14.33318",
      "description": "Der 14. DAK Firmenlauf Cottbus fand am 3. September 2026 statt. Start und Ziel lagen im Puschkinpark; der Startschuss fiel um 18 Uhr. Die 4,5 Kilometer lange Runde führte entlang der Spree bis zur Spreewehrmühle und am anderen Ufer zurück. Neben Laufenden waren Walking und Nordic Walking zugelassen. Firmen, Behörden und Vereine konnten mit ihren Teams teilnehmen; auch Familienangehörige waren startberechtigt. Neben Einzelzeiten wurden unter anderem die schnellsten und größten Teams sowie kreative Firmenoutfits gewertet. Die Anmeldung ist beendet. Nachmeldungen vor Ort waren laut Ausschreibung ausgeschlossen; Ergebnisse der Ausgabe sind beim offiziellen Zeitnehmer verlinkt.",
      "registration_status": "registration_not_open",
      "date": "03.09.2026",
      "distance": "4.5 km Firmenlauf und Walking"
    },
    "edition_patch": {
      "start_date": "2026-09-03",
      "end_date": "2026-09-03",
      "race_formats": [
        {
          "label": "4.5 km Firmenlauf und Walking",
          "distance_km": 4.5,
          "sport": "Running"
        }
      ],
      "legacy_distance": "4.5 km Firmenlauf und Walking",
      "registration_status": "registration_not_open",
      "registration_url": "https://baer-service.de/veranstaltung/CFL",
      "edition_status": "completed",
      "discovery_status": "detail_only",
      "discovery_archived_at": "2026-09-08T06:11:22+00:00",
      "archive_reason": "event_completed",
      "results_status": "expected"
    }
  },
  {
    "event_id": 488,
    "edition_id": "c2bbd4ee-a3be-45d1-86fb-3161976da21c",
    "source_id": "f9db2c84-aab6-4fb6-bf22-518639a65d95",
    "source_url": "https://holzlandlauf.info/",
    "before_event": {
      "id": 488,
      "city": "Hermsdorf",
      "date": "12.09.2026",
      "slug": "holzlandlauf",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Hermsdorf, Germany",
      "country": "Germany",
      "distance": "5 km, 10 km, Half Marathon",
      "latitude": "50.8984548",
      "event_url": "https://holzlandlauf.info/",
      "longitude": "11.8550627",
      "created_at": "2026-07-29T08:53:47.307283+00:00",
      "created_by": null,
      "event_name": "Holzlandlauf",
      "source_url": "https://holzlandlauf.info/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Official endurance event in Hermsdorf. Imported from verified staging batch.",
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
      "official_url": "https://holzlandlauf.info/",
      "organizer_id": null,
      "canonical_key": "holzlandlauf-hermsdorf-germany",
      "next_check_at": "2026-08-28T08:53:36.325+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Holzlandlauf",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "medium",
      "last_verified_at": "2026-06-17T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "unclear",
      "verification_status": "verified"
    },
    "before_edition": {
      "id": "c2bbd4ee-a3be-45d1-86fb-3161976da21c",
      "currency": null,
      "end_date": "2026-09-12",
      "event_id": 488,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:47.307283+00:00",
      "source_url": "https://holzlandlauf.info/",
      "start_date": "2026-09-12",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "holzlandlauf-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "5 km, 10 km, Half Marathon"
        }
      ],
      "next_check_at": "2026-08-28T08:53:36.325+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "5 km, 10 km, Half Marathon",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-17T00:00:00+00:00",
      "legacy_event_key": "holzlandlauf|12.09.2026|hermsdorf|germany",
      "registration_url": "https://holzlandlauf.info/",
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
      "address": "Werner-Seelenbinder-Sporthalle, An der Sporthalle, 07629 Hermsdorf, Deutschland",
      "latitude": "50.90594",
      "longitude": "11.85193",
      "description": "Der 50. Holzlandlauf findet am 12. September 2026 in Hermsdorf in Thüringen statt. Start und Ziel liegen an der Werner-Seelenbinder-Sporthalle. Angeboten werden ein Halbmarathon über 21,1 Kilometer sowie Läufe über 11 und 5 Kilometer. Für Walking und Nordic Walking steht die 11-Kilometer-Strecke zur Verfügung. Kinder laufen im Stadiongelände: Schulanfänger starten beim 400-Meter-Zuckertütenlauf, weitere Schülerwettbewerbe führen über 800 und 1600 Meter. Die Firmenwertung addiert die absolvierten Kilometer der angebotenen Erwachsenenwettbewerbe. Im Ziel gibt es Verpflegung; Umkleiden, Duschen und Gepäckaufbewahrung stehen bereit. Nachmeldungen am Veranstaltungstag sind bis 30 Minuten vor dem jeweiligen Start vorgesehen.",
      "registration_status": "registration_open",
      "distance": "21.1 km Halbmarathon, 11 km Hauptlauf, 5 km Einsteigerlauf, 11 km Walking und Nordic Walking, 400 m Zuckertütenlauf, 800 m Schülerlauf, 1600 m Schülerlauf"
    },
    "edition_patch": {
      "race_formats": [
        {
          "label": "21.1 km Halbmarathon",
          "distance_km": 21.1,
          "sport": "Running"
        },
        {
          "label": "11 km Hauptlauf",
          "distance_km": 11,
          "sport": "Running"
        },
        {
          "label": "5 km Einsteigerlauf",
          "distance_km": 5,
          "sport": "Running"
        },
        {
          "label": "11 km Walking und Nordic Walking",
          "distance_km": 11,
          "sport": "Walking"
        },
        {
          "label": "400 m Zuckertütenlauf",
          "distance_km": 0.4,
          "sport": "Running"
        },
        {
          "label": "800 m Schülerlauf",
          "distance_km": 0.8,
          "sport": "Running"
        },
        {
          "label": "1600 m Schülerlauf",
          "distance_km": 1.6,
          "sport": "Running"
        }
      ],
      "legacy_distance": "21.1 km Halbmarathon, 11 km Hauptlauf, 5 km Einsteigerlauf, 11 km Walking und Nordic Walking, 400 m Zuckertütenlauf, 800 m Schülerlauf, 1600 m Schülerlauf",
      "registration_status": "registration_open",
      "registration_url": "https://my.raceresult.com/393561/registration"
    }
  },
  {
    "event_id": 510,
    "edition_id": "f2bd3c70-5781-4084-adc4-3a49772e4423",
    "source_id": "dff010e8-f807-4114-b25a-d4f2da6d5516",
    "source_url": "https://ot-bremen-run.bremenracing.online/",
    "before_event": {
      "id": 510,
      "city": "Bremen",
      "date": "13.09.2026",
      "slug": "ot-bremen-run",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Bremen, Germany",
      "country": "Germany",
      "distance": "5 km, 10 km",
      "latitude": "53.0758196",
      "event_url": "https://ot-bremen-run.bremenracing.online/",
      "longitude": "8.8071646",
      "created_at": "2026-07-29T08:53:47.307283+00:00",
      "created_by": null,
      "event_name": "OT Bremen Run",
      "source_url": "https://ot-bremen-run.bremenracing.online/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Official endurance event in Bremen. Imported from verified staging batch.",
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
      "official_url": "https://ot-bremen-run.bremenracing.online/",
      "organizer_id": null,
      "canonical_key": "ot-bremen-run-bremen-germany",
      "next_check_at": "2026-08-28T08:53:36.325+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "OT Bremen Run",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "medium",
      "last_verified_at": "2026-06-17T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "unclear",
      "verification_status": "verified"
    },
    "before_edition": {
      "id": "f2bd3c70-5781-4084-adc4-3a49772e4423",
      "currency": null,
      "end_date": "2026-09-13",
      "event_id": 510,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:47.307283+00:00",
      "source_url": "https://ot-bremen-run.bremenracing.online/",
      "start_date": "2026-09-13",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "ot-bremen-run-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "5 km, 10 km"
        }
      ],
      "next_check_at": "2026-08-28T08:53:36.325+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "5 km, 10 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-17T00:00:00+00:00",
      "legacy_event_key": "ot bremen run|13.09.2026|bremen|germany",
      "registration_url": "https://ot-bremen-run.bremenracing.online/",
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
      "address": "Bezirkssportanlage Schevemoor, Walliser Straße 119, 28325 Bremen, Deutschland",
      "latitude": "53.07034",
      "longitude": "8.95649",
      "description": "Der OT Bremen Run fand am 23. August 2026 auf der Bezirkssportanlage Schevemoor in Bremen statt. Start und Ziel lagen im Stadion an der Walliser Straße 119. Die Läufe über 5 und 10 Kilometer führten über einen 2,5-Kilometer-Rundkurs, der zwei- beziehungsweise viermal absolviert wurde. Zusätzlich gab es 2,5 Kilometer Walking und Nordic Walking, einen 1000-Meter-Kidsrun und einen 400-Meter-Bambinilauf. Das 150-Meter-Laufradrennen richtete sich an Kinder von zwei bis vier Jahren. Neben den Einzelwettbewerben wurden Firmen-, Familien- und Vereinsmannschaften gewertet. Die Anmeldung für die Ausgabe 2026 ist geschlossen; die offizielle Seite verlinkt Ergebnisse und Urkunden.",
      "registration_status": "registration_not_open",
      "date": "23.08.2026",
      "distance": "10 km Lauf, 5 km Lauf, 2.5 km Walking und Nordic Walking, 1000 m Kidsrun, 400 m Bambinilauf, 150 m H.-P. Jakst Laufradrennen"
    },
    "edition_patch": {
      "start_date": "2026-08-23",
      "end_date": "2026-08-23",
      "race_formats": [
        {
          "label": "10 km Lauf",
          "distance_km": 10,
          "sport": "Running"
        },
        {
          "label": "5 km Lauf",
          "distance_km": 5,
          "sport": "Running"
        },
        {
          "label": "2.5 km Walking und Nordic Walking",
          "distance_km": 2.5,
          "sport": "Walking"
        },
        {
          "label": "1000 m Kidsrun",
          "distance_km": 1,
          "sport": "Running"
        },
        {
          "label": "400 m Bambinilauf",
          "distance_km": 0.4,
          "sport": "Running"
        },
        {
          "label": "150 m H.-P. Jakst Laufradrennen",
          "distance_km": 0.15,
          "sport": "Cycling"
        }
      ],
      "legacy_distance": "10 km Lauf, 5 km Lauf, 2.5 km Walking und Nordic Walking, 1000 m Kidsrun, 400 m Bambinilauf, 150 m H.-P. Jakst Laufradrennen",
      "registration_status": "registration_not_open",
      "registration_url": "https://ot-bremen-run.bremenracing.online/anmeldung/",
      "edition_status": "completed",
      "discovery_status": "detail_only",
      "discovery_archived_at": "2026-09-08T06:11:22+00:00",
      "archive_reason": "event_completed",
      "results_status": "expected"
    }
  }
]
$reviewed_batch$::jsonb) as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb);

-- Freeze scheduler writes before checking active jobs. Row locks then follow
-- the worker/verifier order: every source of these events -> events -> editions.
lock table public.source_crawl_jobs in share mode;
select 1 from public.event_sources s where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
order by s.id for update;
select 1 from public.events e where e.id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
order by e.id for update;
select 1 from public.event_editions e where e.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
order by e.event_id, e.id for update;

do $preflight$
begin
  -- Fixed field whitelist and exact reviewed per-event programme.
  if exists (
    select 1 from p0_fact_targets t
    where jsonb_typeof(t.event_patch) is distinct from 'object'
      or jsonb_typeof(t.edition_patch) is distinct from 'object'
      or (t.event_patch = '{}'::jsonb and t.edition_patch = '{}'::jsonb)
      or exists (select 1 from jsonb_object_keys(t.event_patch) field where field not in ('address','date','description','distance','event_url','latitude','longitude','registration_status'))
      or exists (select 1 from jsonb_object_keys(t.edition_patch) field where field not in ('archive_reason','discovery_archived_at','discovery_status','edition_status','end_date','legacy_distance','race_formats','registration_status','registration_url','results_status','start_date'))
      or (t.before_event || t.event_patch) -> 'distance' is distinct from (t.before_edition || t.edition_patch) -> 'legacy_distance'
      or jsonb_typeof((t.before_edition || t.edition_patch) -> 'race_formats') is distinct from 'array'
      or jsonb_array_length((t.before_edition || t.edition_patch) -> 'race_formats') <> case t.event_id when 117 then 1 when 119 then 5 when 291 then 1 when 295 then 1 when 329 then 9 when 418 then 5 when 472 then 1 when 488 then 7 when 510 then 6 else -1 end
      or exists (select 1 from jsonb_array_elements((t.before_edition || t.edition_patch) -> 'race_formats') f where jsonb_typeof(f) is distinct from 'object' or nullif(btrim(f ->> 'label'),'') is null)
  ) then
    raise exception 'P0 facts guard: patch keys, reviewed formats or distance mirrors differ';
  end if;

  if now() < timestamptz '2026-09-08T06:12:46.086Z'
     or now() >= timestamptz '2026-09-09T05:52:25.594Z' then
    raise exception 'P0 facts evidence window expired or not yet valid; refresh official source review';
  end if;
  if exists (select 1 from private.event_data_workflow_backup where migration_key in ('20260908_p0_event_facts_batch_04', '20260908_p0_event_facts_batch_04_rollback')) then
    raise exception 'P0 facts batch key already exists; no repeat application or overwrite';
  end if;
  if (select count(*) from p0_fact_targets) <> 9
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[117, 119, 291, 295, 329, 418, 472, 488, 510]::bigint[]
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
    where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
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
    where e.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510) and e.publication_status = 'published'
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
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (117, 119, 291, 295, 329, 418, 472, 488, 510)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('9ed18697-8648-463f-8a6d-68786010fbf4'::uuid, '6cbdeebe-6ead-47c0-a610-8442dafff6e9'::uuid, 'ec808969-ea0a-482d-838e-68d213848a6e'::uuid, '62267e72-a4af-43d6-9ed8-53935ef9ef9a'::uuid, '9c851591-1924-4de0-82dd-5c37a9ef945b'::uuid, '6bd198c8-0dde-4527-aa9a-88066d158177'::uuid, '79d8165e-9cc5-4350-a3a9-0c467972f885'::uuid, 'c2bbd4ee-a3be-45d1-86fb-3161976da21c'::uuid, 'f2bd3c70-5781-4084-adc4-3a49772e4423'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510))
  ) as value;

insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_04', 'events', e.id::text, to_jsonb(e)
from public.events e join p0_fact_targets t on t.event_id = e.id
union all
select '20260908_p0_event_facts_batch_04', 'event_editions', e.id::text, to_jsonb(e)
from public.event_editions e join p0_fact_targets t on t.edition_id = e.id;
insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_04', 'batch_manifest', 'batch',
  jsonb_build_object('targets',(select jsonb_agg(to_jsonb(t) order by event_id) from p0_fact_targets t),
    'invariants',value,'actor',current_user,'auth_uid',auth.uid(),'reason',$reason$P0 facts batch 04 (2026-09-08): independently reviewed official event facts and dates. No freshness attestation. Evidence: https://brauereienlauf.de/ ; https://www.altstadtlauf-salzwedel.de/ ; https://www.twinfit.de/twinfitlauf ; https://balingen.bw-running.de/home ; https://www.stadtteillauf.de/ ; https://www.pellkartoffellauf.de/ ; https://www.firmenlauf-cottbus.de/ ; https://holzlandlauf.info/ ; https://ot-bremen-run.bremenracing.online/$reason$,
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
  if (select count(*) from public.events where id in (117, 119, 291, 295, 329, 418, 472, 488, 510)) <> 9
     or (select count(*) from public.event_editions e join p0_fact_targets t on e.id = t.edition_id) <> 9
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
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (117, 119, 291, 295, 329, 418, 472, 488, 510)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('9ed18697-8648-463f-8a6d-68786010fbf4'::uuid, '6cbdeebe-6ead-47c0-a610-8442dafff6e9'::uuid, 'ec808969-ea0a-482d-838e-68d213848a6e'::uuid, '62267e72-a4af-43d6-9ed8-53935ef9ef9a'::uuid, '9c851591-1924-4de0-82dd-5c37a9ef945b'::uuid, '6bd198c8-0dde-4527-aa9a-88066d158177'::uuid, '79d8165e-9cc5-4350-a3a9-0c467972f885'::uuid, 'c2bbd4ee-a3be-45d1-86fb-3161976da21c'::uuid, 'f2bd3c70-5781-4084-adc4-3a49772e4423'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510))
  ) then
    raise exception 'P0 facts postcondition: counts, user references, other records or sources changed';
  end if;
  if (select count(*) from p0_fact_targets) <> 9
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[117, 119, 291, 295, 329, 418, 472, 488, 510]::bigint[]
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
    where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (117, 119, 291, 295, 329, 418, 472, 488, 510)
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
          and a.change_source = 'manual_admin' and a.reason = $reason$P0 facts batch 04 (2026-09-08): independently reviewed official event facts and dates. No freshness attestation. Evidence: https://brauereienlauf.de/ ; https://www.altstadtlauf-salzwedel.de/ ; https://www.twinfit.de/twinfitlauf ; https://balingen.bw-running.de/home ; https://www.stadtteillauf.de/ ; https://www.pellkartoffellauf.de/ ; https://www.firmenlauf-cottbus.de/ ; https://holzlandlauf.info/ ; https://ot-bremen-run.bremenracing.online/$reason$
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
          and a.change_source = 'manual_admin' and a.reason = $reason$P0 facts batch 04 (2026-09-08): independently reviewed official event facts and dates. No freshness attestation. Evidence: https://brauereienlauf.de/ ; https://www.altstadtlauf-salzwedel.de/ ; https://www.twinfit.de/twinfitlauf ; https://balingen.bw-running.de/home ; https://www.stadtteillauf.de/ ; https://www.pellkartoffellauf.de/ ; https://www.firmenlauf-cottbus.de/ ; https://holzlandlauf.info/ ; https://ot-bremen-run.bremenracing.online/$reason$
      )
  ) then
    raise exception 'P0 facts postcondition: a factual change lacks its automatic field audit';
  end if;
end
$audit_guard$;

insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_04', 'events_post_state', e.id::text, to_jsonb(e)
from public.events e join p0_fact_targets t on t.event_id = e.id
union all
select '20260908_p0_event_facts_batch_04', 'event_editions_post_state', e.id::text, to_jsonb(e)
from public.event_editions e join p0_fact_targets t on t.edition_id = e.id;

do $backup_guard$
begin
  if (select count(*) from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_04') <> 37 then
    raise exception 'P0 facts snapshots incomplete: expected 18 before, 18 after and 1 manifest';
  end if;
end
$backup_guard$;
commit;
