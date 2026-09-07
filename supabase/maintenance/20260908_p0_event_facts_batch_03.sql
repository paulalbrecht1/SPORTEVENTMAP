-- P0 event facts batch 03: current official review, 2026-09-08. Maintenance, not a migration.
-- Exact scope: 236/246/249/332/360/377/385 and their existing 2026 editions.
-- Private before/after snapshots, field audits, drift rejection, unchanged user references.
-- No source/crawl writes, new editions, identity changes or freshness attestation.
-- Rehearse apply, verification, repeat/drift rejection and rollback before production.

begin isolation level serializable;
set local time zone 'UTC';
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('sporteventmap:20260908_p0_event_facts_batch_03', 0));
-- No request.jwt.claims, auth.uid override or app.freshness_verification override.
select set_config('app.change_source', 'manual_admin', true);
select set_config('app.change_reason', $reason$P0 facts batch 03 (2026-09-08): reviewed current official sources; factual corrections only, no freshness attestation. Evidence: https://www.muelheimer-firmenlauf.de/ ; https://hanauer-stadtlauf.de/ ; https://firmenlauf-bamberg.de/ ; https://bedburger-citylauf.de/ ; https://deistercrossing.de/ausschreibung ; https://www.braunenberg-lauf.de/ ; https://events.ihk-elbeweser.de/futurerunausbildunginbewegung$reason$, true);
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
    "event_id": 236,
    "edition_id": "c5b4f709-a712-48cf-97b3-8daf5fb0dc7f",
    "source_id": "cca4d3d7-5b8b-452f-a2ce-d95358b3396e",
    "source_url": "https://www.muelheimer-firmenlauf.de/",
    "before_event": {
      "id": 236,
      "city": "Mülheim an der Ruhr",
      "date": "17.09.2026",
      "slug": "mulheimer-firmenlauf",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Mülheim an der Ruhr, Germany",
      "country": "Germany",
      "distance": "5.6 km",
      "latitude": "51.4272925",
      "event_url": "https://www.muelheimer-firmenlauf.de/",
      "longitude": "6.8829192",
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "created_by": null,
      "event_name": "Mülheimer Firmenlauf",
      "source_url": "https://www.muelheimer-firmenlauf.de/",
      "updated_at": "2026-09-07T20:10:43.126567+00:00",
      "data_source": null,
      "description": "Official local running event in Mülheim an der Ruhr. Distances: 5.6 km. Discovered via Kilometerliebe and linked to the official event website.",
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
      "official_url": "https://www.muelheimer-firmenlauf.de/",
      "organizer_id": null,
      "canonical_key": "mulheimer-firmenlauf-mulheim-an-der-ruhr-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Mülheimer Firmenlauf",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "high",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "unclear",
      "verification_status": "needs_review"
    },
    "before_edition": {
      "id": "c5b4f709-a712-48cf-97b3-8daf5fb0dc7f",
      "currency": null,
      "end_date": "2026-09-17",
      "event_id": 236,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:06.415654+00:00",
      "source_url": "https://www.muelheimer-firmenlauf.de/",
      "start_date": "2026-09-17",
      "start_time": null,
      "updated_at": "2026-09-07T20:10:43.126567+00:00",
      "edition_slug": "mulheimer-firmenlauf-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "5.6 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "5.6 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "mülheimer firmenlauf|17.09.2026|mülheim an der ruhr|germany",
      "registration_url": "https://www.muelheimer-firmenlauf.de/",
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
      "address": "Hochschule Ruhr West, Duisburger Straße 100, 45479 Mülheim an der Ruhr, Deutschland",
      "latitude": "51.42782",
      "longitude": "6.85883",
      "distance": "5.6 km Firmenlauf; ca. 7.9 km Firmen-Wanderung",
      "description": "Der Mülheimer Firmenlauf findet am 17. September 2026 zum zehnten Mal statt. Der Lauf über 5,6 Kilometer beginnt ab 18:30 Uhr in drei Startwellen auf dem Campus der Hochschule Ruhr West an der Duisburger Straße 100. Die Strecke führt über Asphalt- und Schotterwege durch Mülheim an der Ruhr. Zusätzlich gibt es eine Firmen-Wanderung über rund 7,9 Kilometer mit Wellenstarts ab 16:30 Uhr am Ringlokschuppen. Beide Wettbewerbe enden im Darlington Park beim Ringlokschuppen, wo anschließend die After-Run-Party stattfindet. Die Anmeldung für Firmenteams läuft über einen Teamcaptain.",
      "event_url": "https://www.muelheimer-firmenlauf.de/anmeldung/",
      "registration_status": "registration_open"
    },
    "edition_patch": {
      "race_formats": [
        {
          "label": "5.6 km Firmenlauf",
          "distance_km": 5.6,
          "sport": "Running"
        },
        {
          "label": "ca. 7.9 km Firmen-Wanderung",
          "distance_km": 7.9,
          "sport": "Walking",
          "approximate": true
        }
      ],
      "legacy_distance": "5.6 km Firmenlauf; ca. 7.9 km Firmen-Wanderung",
      "registration_url": "https://www.muelheimer-firmenlauf.de/anmeldung/",
      "registration_status": "registration_open"
    }
  },
  {
    "event_id": 246,
    "edition_id": "67356880-3ca8-4f72-836c-c48a92370ae0",
    "source_id": "bd1248e9-76f5-4544-a281-09b0dc9627d0",
    "source_url": "https://hanauer-stadtlauf.de/",
    "before_event": {
      "id": 246,
      "city": "Hanau",
      "date": "18.09.2026",
      "slug": "stadtlauf-hanau",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Hanau, Germany",
      "country": "Germany",
      "distance": "5 km",
      "latitude": "50.132881",
      "event_url": "https://hanauer-stadtlauf.de/",
      "longitude": "8.9169797",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "Stadtlauf Hanau",
      "source_url": "https://hanauer-stadtlauf.de/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Official local running event in Hanau. Distances: 5 km. Discovered via Kilometerliebe and linked to the official event website.",
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
      "official_url": "https://hanauer-stadtlauf.de/",
      "organizer_id": null,
      "canonical_key": "stadtlauf-hanau-hanau-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Stadtlauf Hanau",
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
      "id": "67356880-3ca8-4f72-836c-c48a92370ae0",
      "currency": null,
      "end_date": "2026-09-18",
      "event_id": 246,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://hanauer-stadtlauf.de/",
      "start_date": "2026-09-18",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "stadtlauf-hanau-2026",
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
      "legacy_event_key": "stadtlauf hanau|18.09.2026|hanau|germany",
      "registration_url": "https://hanauer-stadtlauf.de/",
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
      "address": "Marktplatz, 63450 Hanau, Deutschland",
      "latitude": "50.13242",
      "longitude": "8.91696",
      "description": "Der Stadtlauf Hanau findet am 18. September 2026 unter dem Motto Stärke zeigen – Gemeinsam gegen Gewalt an Frauen statt. Die sechs Kilometer lange Runde führt durch die Hanauer Kernstadt und über Schloss Philippsruhe; Start und Ziel befinden sich auf dem Marktplatz. Der Lauf beginnt um 17:00 Uhr. Teilnehmen können Menschen ab dem Geburtsjahrgang 2014; Einzel- und Teamanmeldungen sind möglich. Die Einnahmen unterstützen die Frauenhäuser in Hanau und Wächtersbach. Die reguläre Onlineanmeldung läuft bis zum 14. September um 9:00 Uhr. Am Veranstaltungstag sind Nachmeldungen online ab 6:00 Uhr sowie von 14:00 bis 16:30 Uhr im Wettkampfbüro im Rathaus möglich.",
      "distance": "6 km Stadtlauf",
      "event_url": "https://www.hanauer-stadtlauf.de/content/184851/index.html",
      "registration_status": "registration_open",
      "region": "Hessen"
    },
    "edition_patch": {
      "race_formats": [
        {
          "label": "6 km Stadtlauf",
          "distance_km": 6,
          "sport": "Running"
        }
      ],
      "legacy_distance": "6 km Stadtlauf",
      "registration_status": "registration_open",
      "registration_url": "https://www.hanauer-stadtlauf.de/content/184851/index.html"
    }
  },
  {
    "event_id": 249,
    "edition_id": "dfb09974-1570-4dfc-8ace-aa103560eabd",
    "source_id": "f6befb54-55b7-49bf-9cb1-8992fb46fb3e",
    "source_url": "https://firmenlauf-bamberg.de/",
    "before_event": {
      "id": 249,
      "city": "Bamberg",
      "date": "18.09.2026",
      "slug": "vr-bank-firmenlauf-bamberg",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Bamberg, Germany",
      "country": "Germany",
      "distance": "5 km",
      "latitude": "49.8916044",
      "event_url": "https://firmenlauf-bamberg.de/",
      "longitude": "10.8868478",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "VR Bank Firmenlauf Bamberg",
      "source_url": "https://firmenlauf-bamberg.de/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Official local running event in Bamberg. Distances: 5 km. Discovered via Kilometerliebe and linked to the official event website.",
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
      "official_url": "https://firmenlauf-bamberg.de/",
      "organizer_id": null,
      "canonical_key": "vr-bank-firmenlauf-bamberg-bamberg-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "VR Bank Firmenlauf Bamberg",
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
      "id": "dfb09974-1570-4dfc-8ace-aa103560eabd",
      "currency": null,
      "end_date": "2026-09-18",
      "event_id": 249,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://firmenlauf-bamberg.de/",
      "start_date": "2026-09-18",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "vr-bank-firmenlauf-bamberg-2026",
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
      "legacy_event_key": "vr bank firmenlauf bamberg|18.09.2026|bamberg|germany",
      "registration_url": "https://firmenlauf-bamberg.de/",
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
      "city": "Litzendorf",
      "address": "Tanzwiesen, Am Wehr, 96123 Litzendorf, Deutschland",
      "latitude": "49.91119",
      "longitude": "11.00955",
      "description": "Der VR Bank Firmenlauf findet am 18. September 2026 im Rahmen des Brauereienlaufs in Litzendorf statt. Start und Ziel der fünf Kilometer langen Strecke liegen an den Tanzwiesen bei Am Wehr. Die Teilnahme ist auch als Walking möglich. Angesprochen sind Firmenteams aus der Region Bamberg und Forchheim. Unterwegs gibt es einen Verpflegungspunkt bei der Brauerei Knoblach in Schammelsdorf; im Veranstaltungsbereich kommen die Teams zum gemeinsamen Essen und Austausch zusammen. Unternehmen können sich über die verlinkte Firmenanmeldung anmelden.",
      "distance": "5 km Firmenlauf",
      "event_url": "https://my.raceresult.com/415011/registration?regname=Firmenanmeldung",
      "registration_status": "registration_open",
      "region": "Bayern"
    },
    "edition_patch": {
      "race_formats": [
        {
          "label": "5 km Firmenlauf",
          "distance_km": 5,
          "sport": "Running",
          "walking_possible": true
        }
      ],
      "legacy_distance": "5 km Firmenlauf",
      "registration_status": "registration_open",
      "registration_url": "https://my.raceresult.com/415011/registration?regname=Firmenanmeldung"
    }
  },
  {
    "event_id": 332,
    "edition_id": "eeb533bf-d8da-461e-b09b-d479ff8a30ab",
    "source_id": "bad3bee3-b0b6-4294-b32b-d80869bc3b91",
    "source_url": "https://bedburger-citylauf.de/",
    "before_event": {
      "id": 332,
      "city": "Bedburg",
      "date": "13.09.2026",
      "slug": "bedburger-citylauf",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Marktplatz, Bedburg, North Rhine-Westphalia, Germany, Germany",
      "country": "Germany",
      "distance": "10 km, 5 km",
      "latitude": "50.9972161",
      "event_url": "https://bedburger-citylauf.de/",
      "longitude": "6.5767648",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "Bedburger Citylauf",
      "source_url": "https://bedburger-citylauf.de/",
      "updated_at": "2026-07-29T09:03:19.256451+00:00",
      "data_source": null,
      "description": "Der GVG Citylauf Bedburg findet am 13. September 2026 in der Innenstadt von Bedburg statt. Die Läufe führen durch die verkehrsfreie Innenstadt mit Start und Ziel auf dem Marktplatz vor dem Rathaus. Angeboten werden verschiedene Distanzen von 300 Meter Bambinilauf bis zum 10 km Hauptlauf sowie Staffelwettbewerbe. Der Lauf ist für alle Altersgruppen geeignet und bietet eine tolle Gelegenheit, Bedburg in Bewegung zu erl",
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
      "official_url": "https://bedburger-citylauf.de/",
      "organizer_id": null,
      "canonical_key": "bedburger-citylauf-bedburg-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Bedburger Citylauf",
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
      "id": "eeb533bf-d8da-461e-b09b-d479ff8a30ab",
      "currency": null,
      "end_date": "2026-09-13",
      "event_id": 332,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://bedburger-citylauf.de/",
      "start_date": "2026-09-13",
      "start_time": null,
      "updated_at": "2026-09-04T07:42:58.510058+00:00",
      "edition_slug": "bedburger-citylauf-2026-2026",
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
      "legacy_event_key": "bedburger citylauf 2026|13.09.2026|bedburg|germany",
      "registration_url": "https://bedburger-citylauf.de/",
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
      "address": "Marktplatz vor dem Rathaus, Bedburg, Deutschland",
      "latitude": "50.99727",
      "longitude": "6.57674",
      "description": "Der GVG Citylauf Bedburg findet am 13. September 2026 zum 22. Mal statt. Start und Ziel liegen auf dem Marktplatz vor dem Rathaus. Das Programm umfasst einen kostenlosen Bambinilauf über 300 Meter, Schülerläufe über 500 Meter und zwei Kilometer, den Jedermannlauf über vier Kilometer sowie den Hauptlauf über zehn Kilometer. Zusätzlich gibt es eine Schülerstaffel mit fünf Abschnitten zu je zwei Kilometern. Der Hauptlauf führt über fünf Runden durch die verkehrsfreie Innenstadt und ist laut Veranstalter DLV-vermessen. Die reguläre Onlineanmeldung endete am 5. September. Nachmeldungen sind bis eine Stunde vor dem jeweiligen Start mit drei Euro Zusatzgebühr möglich; der Bambinilauf bleibt kostenlos.",
      "distance": "300 m Bambinilauf, 500 m Schülerlauf, 2 km Schülerlauf, 4 km GVG Jedermannlauf, 10 km GVG Hauptlauf, 5 x 2 km Schülerstaffel",
      "event_url": "https://bedburger-citylauf.de/anmelden/",
      "registration_status": "registration_not_open",
      "region": "Nordrhein-Westfalen"
    },
    "edition_patch": {
      "race_formats": [
        {
          "label": "300 m Bambinilauf",
          "distance_km": 0.3,
          "sport": "Running"
        },
        {
          "label": "500 m Schülerlauf",
          "distance_km": 0.5,
          "sport": "Running"
        },
        {
          "label": "2 km Schülerlauf",
          "distance_km": 2,
          "sport": "Running"
        },
        {
          "label": "4 km GVG Jedermannlauf",
          "distance_km": 4,
          "sport": "Running"
        },
        {
          "label": "10 km GVG Hauptlauf",
          "distance_km": 10,
          "sport": "Running"
        },
        {
          "label": "5 x 2 km Schülerstaffel",
          "distance_km": 10,
          "sport": "Running",
          "is_relay": true,
          "relay_legs": 5,
          "leg_distance_km": 2
        }
      ],
      "legacy_distance": "300 m Bambinilauf, 500 m Schülerlauf, 2 km Schülerlauf, 4 km GVG Jedermannlauf, 10 km GVG Hauptlauf, 5 x 2 km Schülerstaffel",
      "registration_status": "registration_not_open",
      "registration_url": "https://bedburger-citylauf.de/anmelden/"
    }
  },
  {
    "event_id": 360,
    "edition_id": "02dfa931-395b-466e-8a04-720f29af0963",
    "source_id": "94d49c82-967b-4cce-9bee-e60f47606243",
    "source_url": "https://deistercrossing.de/ausschreibung",
    "before_event": {
      "id": 360,
      "city": "Hesse",
      "date": "13.09.2026",
      "slug": "deistercrossing-springe",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Hilders, Fulda, Hesse, Germany, Germany",
      "country": "Germany",
      "distance": "Marathon, Halbmarathon, 8 km",
      "latitude": "50.5554204",
      "event_url": "https://deistercrossing.de/ausschreibung",
      "longitude": "9.9754786",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "DeisterCrossing Springe",
      "source_url": "https://deistercrossing.de/ausschreibung",
      "updated_at": "2026-07-29T09:17:00.244453+00:00",
      "data_source": null,
      "description": "Das DeisterCrossing ist ein naturnahes Ausdauer-Event, das Laufen und Marschieren in der herausragenden Natur des waldigen Deistergebirgszugs verbindet. Die Veranstaltung bietet Strecken über 10 km, 21,1 km und 42,2 km für Läufer und Marschierer. Die anspruchsvollen Strecken führen unter anderem durch die Deisterhölle mit 200 Höhenmetern am Stück und bieten ein einzigartiges Natur- und Bergerlebnis nahe Hannover. Die",
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
      "official_url": "https://deistercrossing.de/ausschreibung",
      "organizer_id": null,
      "canonical_key": "deistercrossing-springe-hesse-germany",
      "next_check_at": "2026-07-02T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "DeisterCrossing Springe",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "medium",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "unclear",
      "verification_status": "stale"
    },
    "before_edition": {
      "id": "02dfa931-395b-466e-8a04-720f29af0963",
      "currency": null,
      "end_date": "2026-09-13",
      "event_id": 360,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://deistercrossing.de/ausschreibung",
      "start_date": "2026-09-13",
      "start_time": null,
      "updated_at": "2026-08-04T08:45:29.395038+00:00",
      "edition_slug": "deistercrossing-springe-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:17:00.244453+00:00",
      "race_formats": [
        {
          "label": "Marathon, Halbmarathon, 8 km"
        }
      ],
      "next_check_at": "2026-07-02T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "Marathon, Halbmarathon, 8 km",
      "review_priority": "medium",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "deistercrossing springe|13.09.2026|hesse|germany",
      "registration_url": "https://deistercrossing.de/ausschreibung",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "participant_limit": null,
      "publication_status": "published",
      "registration_status": "unknown",
      "verification_status": "stale",
      "auto_publish_eligible": false,
      "discovery_archived_at": null,
      "predecessor_edition_id": null,
      "last_verified_source_id": null,
      "generated_from_source_id": null,
      "generated_from_candidate_id": null
    },
    "event_patch": {
      "city": "Springe",
      "address": "IGS Springe, Adolf-Reichwein-Straße 2, 31832 Springe, Deutschland",
      "latitude": "52.21734",
      "longitude": "9.54640",
      "description": "Das DeisterCrossing findet am 13. September 2026 in Springe statt. Ausgangspunkt ist die IGS Springe an der Adolf-Reichwein-Straße 2; die Strecken führen durch den bewaldeten Deister. Zur Wahl stehen Läufe über 10, 21,1 und 42,2 Kilometer sowie Walking beziehungsweise Märsche über dieselben Distanzen. Der Marathonmarsch beginnt um 8:00 Uhr, die weiteren Wettbewerbe starten gestaffelt ab 10:00 Uhr. Die Startnummernausgabe öffnet um 7:15 Uhr an der IGS. Ausgeschilderte Strecken, Verpflegungspunkte und Zeitmessung gehören zum Angebot. Die Onlineanmeldung erfolgt über den vom Veranstalter verlinkten RaceResult-Dienst.",
      "distance": "42.2 km Marathonlauf, 21.1 km Halbmarathonlauf, 10 km Lauf, 42.2 km Marathonmarsch, 21.1 km Halbmarathonmarsch, 10 km Walking",
      "event_url": "https://my.raceresult.com/375096/registration",
      "registration_status": "registration_open",
      "region": "Niedersachsen"
    },
    "edition_patch": {
      "race_formats": [
        {
          "label": "42.2 km Marathonlauf",
          "distance_km": 42.2,
          "sport": "Running"
        },
        {
          "label": "21.1 km Halbmarathonlauf",
          "distance_km": 21.1,
          "sport": "Running"
        },
        {
          "label": "10 km Lauf",
          "distance_km": 10,
          "sport": "Running"
        },
        {
          "label": "42.2 km Marathonmarsch",
          "distance_km": 42.2,
          "sport": "Walking"
        },
        {
          "label": "21.1 km Halbmarathonmarsch",
          "distance_km": 21.1,
          "sport": "Walking"
        },
        {
          "label": "10 km Walking",
          "distance_km": 10,
          "sport": "Walking"
        }
      ],
      "legacy_distance": "42.2 km Marathonlauf, 21.1 km Halbmarathonlauf, 10 km Lauf, 42.2 km Marathonmarsch, 21.1 km Halbmarathonmarsch, 10 km Walking",
      "registration_status": "registration_open",
      "registration_url": "https://my.raceresult.com/375096/registration"
    }
  },
  {
    "event_id": 377,
    "edition_id": "3800430f-3737-45bd-828d-dfa8cffd8716",
    "source_id": "25d2ace8-5e5d-41df-ae12-892d842f40bb",
    "source_url": "https://www.braunenberg-lauf.de/",
    "before_event": {
      "id": 377,
      "city": "Ostalbkreis",
      "date": "19.09.2026",
      "slug": "braunenberg-lauf",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "Aalen, Ostalbkreis, Baden-Württemberg, Germany, Germany",
      "country": "Germany",
      "distance": "30 km, 8.2 km",
      "latitude": "48.8375607",
      "event_url": "https://www.braunenberg-lauf.de/",
      "longitude": "10.0929593",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "BraunenBerg-Lauf",
      "source_url": "https://www.braunenberg-lauf.de/",
      "updated_at": "2026-09-07T22:48:59.551135+00:00",
      "data_source": null,
      "description": "Der BraunenBerg-Lauf am 19. September 2026 bietet abwechslungsreiche Berglaufstrecken auf der Ostalb, die sowohl Einsteigerinnen als auch erfahrene Läuferinnen ansprechen. Die Veranstaltung umfasst verschiedene Distanzen, darunter den technisch einfachen VR Bank-BraunenBerg-Lauf über 14,6 km mit 446 Höhenmetern sowie den anspruchsvollen Rolladen Kaiser-BraunenBerg-Trail mit 32 km und 1100 Höhenmetern, der unter Tage",
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
      "official_url": "https://www.braunenberg-lauf.de/",
      "organizer_id": null,
      "canonical_key": "braunenberg-lauf-ostalbkreis-germany",
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "BraunenBerg-Lauf",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "high",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "unclear",
      "verification_status": "needs_review"
    },
    "before_edition": {
      "id": "3800430f-3737-45bd-828d-dfa8cffd8716",
      "currency": null,
      "end_date": "2026-09-19",
      "event_id": 377,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://www.braunenberg-lauf.de/",
      "start_date": "2026-09-19",
      "start_time": null,
      "updated_at": "2026-09-07T22:48:59.551135+00:00",
      "edition_slug": "braunenberg-lauf-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "30 km, 8.2 km"
        }
      ],
      "next_check_at": "2026-08-31T00:00:00+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "30 km, 8.2 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-02T00:00:00+00:00",
      "legacy_event_key": "braunenberg-lauf|19.09.2026|ostalbkreis|germany",
      "registration_url": "https://www.braunenberg-lauf.de/",
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
      "city": "Aalen-Oberalfingen",
      "address": "Hubertuskapelle St. Hubertus, Ahelfingerstraße 29, 73433 Aalen-Oberalfingen, Deutschland",
      "latitude": "48.88083",
      "longitude": "10.13650",
      "description": "Der BraunenBerg-Lauf findet am 19. September 2026 in Aalen-Oberalfingen statt. Zum Programm gehören der Berglauf über 14,6 Kilometer, der BergBau-Lauf über 8,2 Kilometer sowie Bambini-, Kinder- und Jugendläufe über 500, 800 und 1800 Meter. Diese Läufe starten bei der Hubertuskapelle in Oberalfingen. Der zusätzliche BraunenBerg-Trail hat einen separaten Start am Besucherbergwerk Tiefer Stollen in Wasseralfingen; die Zeitmessung beginnt auf dem Vorplatz, der symbolische Start unter Tage ist freiwillig. Das gemeinsame Ziel befindet sich bei Getränke Keller an der Ährenstraße 8 in Oberalfingen. Die Anmeldung läuft über RaceResult.",
      "event_url": "https://my.raceresult.com/376226/registration",
      "registration_status": "registration_open"
    },
    "edition_patch": {
      "registration_url": "https://my.raceresult.com/376226/registration",
      "registration_status": "registration_open",
      "currency": "EUR"
    }
  },
  {
    "event_id": 385,
    "edition_id": "549ea3d0-a669-416a-8766-10b446a8ff26",
    "source_id": "3aa2079d-ee37-4a5c-9853-481eae88f819",
    "source_url": "https://events.ihk-elbeweser.de/futurerunausbildunginbewegung",
    "before_event": {
      "id": 385,
      "city": "Buxtehude",
      "date": "18.09.2026",
      "slug": "future-run-ausbildung-in-bewegung",
      "image": null,
      "sport": "Running",
      "region": null,
      "status": "approved",
      "address": "VSV Hedendorf-Neukloster, Feldstraße 50, 21614 Buxtehude, Germany",
      "country": "Germany",
      "distance": "5 km, 7 km",
      "latitude": "53.4719383",
      "event_url": "https://events.ihk-elbeweser.de/futurerunausbildunginbewegung",
      "longitude": "9.615386",
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "created_by": null,
      "event_name": "Future Run - Ausbildung in Bewegung",
      "source_url": "https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run",
      "updated_at": "2026-09-04T09:43:27.034275+00:00",
      "data_source": null,
      "description": "Der FUTURE RUN der IHK Elbe-Weser findet am 18. September 2026 auf der Sportanlage des VSV Hedendorf-Neukloster statt. Teilnehmende wählen zwischen 5 km und 7 km; Veranstaltungsbeginn ist um 14:30 Uhr.",
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
      "official_url": "https://www.ihk.de/elbeweser/aus-und-weiterbildung/future-run",
      "organizer_id": null,
      "canonical_key": "future-run-ausbildung-in-bewegung-buxtehude-hedendorf-germany",
      "next_check_at": "2026-09-08T00:00:00+00:00",
      "quality_flags": {},
      "review_reason": null,
      "review_status": "pending",
      "canonical_name": "Future Run - Ausbildung in Bewegung",
      "organizer_name": null,
      "data_confidence": 0.8,
      "review_priority": "low",
      "last_verified_at": "2026-06-08T00:00:00+00:00",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "publication_status": "published",
      "registration_status": "registration_not_open",
      "verification_status": "verified"
    },
    "before_edition": {
      "id": "549ea3d0-a669-416a-8766-10b446a8ff26",
      "currency": null,
      "end_date": "2026-09-18",
      "event_id": 385,
      "price_max": null,
      "price_min": null,
      "created_at": "2026-07-29T08:53:29.004036+00:00",
      "source_url": "https://events.ihk-elbeweser.de/futurerunausbildunginbewegung",
      "start_date": "2026-09-18",
      "start_time": "14:30:00",
      "updated_at": "2026-09-04T09:43:27.034275+00:00",
      "edition_slug": "future-run-ausbildung-in-bewegung-2026",
      "edition_year": 2026,
      "needs_review": true,
      "published_at": "2026-07-29T09:03:19.256451+00:00",
      "race_formats": [
        {
          "label": "5 km"
        },
        {
          "label": "7 km"
        }
      ],
      "next_check_at": "2026-09-04T09:43:27.034275+00:00",
      "price_details": {},
      "archive_reason": null,
      "edition_status": "scheduled",
      "results_status": "not_expected",
      "data_confidence": 0.8,
      "legacy_distance": "5 km, 7 km",
      "review_priority": "high",
      "discovery_status": "active",
      "last_verified_at": "2026-06-08T00:00:00+00:00",
      "legacy_event_key": "future run - ausbildung in bewegung|18.09.2026|buxtehude-hedendorf|germany",
      "registration_url": "https://events.ihk-elbeweser.de/futurerunausbildunginbewegung",
      "catalog_import_id": "ba56e423-f4c2-4e6b-8c41-b3ca98641652",
      "participant_limit": null,
      "publication_status": "published",
      "registration_status": "registration_not_open",
      "verification_status": "needs_review",
      "auto_publish_eligible": false,
      "discovery_archived_at": null,
      "predecessor_edition_id": null,
      "last_verified_source_id": null,
      "generated_from_source_id": null,
      "generated_from_candidate_id": null
    },
    "event_patch": {},
    "edition_patch": {
      "race_formats": [
        {
          "label": "5 km",
          "distance_km": 5,
          "sport": "Running"
        },
        {
          "label": "7 km",
          "distance_km": 7,
          "sport": "Running"
        }
      ]
    }
  }
]
$reviewed_batch$::jsonb) as t(event_id bigint, edition_id uuid, source_id uuid, source_url text, before_event jsonb, before_edition jsonb, event_patch jsonb, edition_patch jsonb);

-- Freeze scheduler writes before checking active jobs. Row locks then follow
-- the worker/verifier order: every source of these events -> events -> editions.
lock table public.source_crawl_jobs in share mode;
select 1 from public.event_sources s where s.event_id in (236, 246, 249, 332, 360, 377, 385)
order by s.id for update;
select 1 from public.events e where e.id in (236, 246, 249, 332, 360, 377, 385)
order by e.id for update;
select 1 from public.event_editions e where e.event_id in (236, 246, 249, 332, 360, 377, 385)
order by e.event_id, e.id for update;

do $preflight$
begin
  -- Fixed field whitelist and exact reviewed per-event programme.
  if exists (
    select 1 from p0_fact_targets t
    where jsonb_typeof(t.event_patch) is distinct from 'object'
      or jsonb_typeof(t.edition_patch) is distinct from 'object'
      or (t.event_patch = '{}'::jsonb and t.edition_patch = '{}'::jsonb)
      or exists (select 1 from jsonb_object_keys(t.event_patch) field
                 where field not in ('address','city','description','distance','event_url','latitude','longitude','region','registration_status'))
      or exists (select 1 from jsonb_object_keys(t.edition_patch) field
                 where field not in ('currency','legacy_distance','race_formats','registration_status','registration_url'))
      or (t.before_event || t.event_patch) -> 'distance' is distinct from (t.before_edition || t.edition_patch) -> 'legacy_distance'
      or jsonb_typeof((t.before_edition || t.edition_patch) -> 'race_formats') is distinct from 'array'
      or jsonb_array_length((t.before_edition || t.edition_patch) -> 'race_formats') <> case t.event_id when 236 then 2 when 246 then 1 when 249 then 1 when 332 then 6 when 360 then 6 when 377 then 1 when 385 then 2 else -1 end
      or exists (select 1 from jsonb_array_elements((t.before_edition || t.edition_patch) -> 'race_formats') f
                 where jsonb_typeof(f) is distinct from 'object' or nullif(btrim(f ->> 'label'),'') is null)
  ) then
    raise exception 'P0 facts guard: patch keys, reviewed formats or distance mirrors differ';
  end if;

  if now() < timestamptz '2026-09-07T23:19:49.906Z'
     or now() >= timestamptz '2026-09-08T22:37:25.490Z' then
    raise exception 'P0 facts evidence window expired or not yet valid; refresh official source review';
  end if;
  if exists (select 1 from private.event_data_workflow_backup where migration_key in ('20260908_p0_event_facts_batch_03', '20260908_p0_event_facts_batch_03_rollback')) then
    raise exception 'P0 facts batch key already exists; no repeat application or overwrite';
  end if;
  if (select count(*) from p0_fact_targets) <> 7
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[236, 246, 249, 332, 360, 377, 385]::bigint[]
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
    where s.event_id in (236, 246, 249, 332, 360, 377, 385)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (236, 246, 249, 332, 360, 377, 385)
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
    where e.event_id in (236, 246, 249, 332, 360, 377, 385) and e.publication_status = 'published'
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
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (236, 246, 249, 332, 360, 377, 385)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('c5b4f709-a712-48cf-97b3-8daf5fb0dc7f'::uuid, '67356880-3ca8-4f72-836c-c48a92370ae0'::uuid, 'dfb09974-1570-4dfc-8ace-aa103560eabd'::uuid, 'eeb533bf-d8da-461e-b09b-d479ff8a30ab'::uuid, '02dfa931-395b-466e-8a04-720f29af0963'::uuid, '3800430f-3737-45bd-828d-dfa8cffd8716'::uuid, '549ea3d0-a669-416a-8766-10b446a8ff26'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (236, 246, 249, 332, 360, 377, 385))
  ) as value;

insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_03', 'events', e.id::text, to_jsonb(e)
from public.events e join p0_fact_targets t on t.event_id = e.id
union all
select '20260908_p0_event_facts_batch_03', 'event_editions', e.id::text, to_jsonb(e)
from public.event_editions e join p0_fact_targets t on t.edition_id = e.id;
insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_03', 'batch_manifest', 'batch',
  jsonb_build_object('targets',(select jsonb_agg(to_jsonb(t) order by event_id) from p0_fact_targets t),
    'invariants',value,'actor',current_user,'auth_uid',auth.uid(),'reason',$reason$P0 facts batch 03 (2026-09-08): reviewed current official sources; factual corrections only, no freshness attestation. Evidence: https://www.muelheimer-firmenlauf.de/ ; https://hanauer-stadtlauf.de/ ; https://firmenlauf-bamberg.de/ ; https://bedburger-citylauf.de/ ; https://deistercrossing.de/ausschreibung ; https://www.braunenberg-lauf.de/ ; https://events.ihk-elbeweser.de/futurerunausbildunginbewegung$reason$,
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
  if (select count(*) from public.events where id in (236, 246, 249, 332, 360, 377, 385)) <> 7
     or (select count(*) from public.event_editions e join p0_fact_targets t on e.id = t.edition_id) <> 7
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
    'other_events_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.events e where e.id not in (236, 246, 249, 332, 360, 377, 385)),
    'other_editions_digest', (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]')) from public.event_editions e where e.id not in ('c5b4f709-a712-48cf-97b3-8daf5fb0dc7f'::uuid, '67356880-3ca8-4f72-836c-c48a92370ae0'::uuid, 'dfb09974-1570-4dfc-8ace-aa103560eabd'::uuid, 'eeb533bf-d8da-461e-b09b-d479ff8a30ab'::uuid, '02dfa931-395b-466e-8a04-720f29af0963'::uuid, '3800430f-3737-45bd-828d-dfa8cffd8716'::uuid, '549ea3d0-a669-416a-8766-10b446a8ff26'::uuid)),
    'target_sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.event_sources s where s.event_id in (236, 246, 249, 332, 360, 377, 385))
  ) then
    raise exception 'P0 facts postcondition: counts, user references, other records or sources changed';
  end if;
  if (select count(*) from p0_fact_targets) <> 7
     or (select array_agg(event_id order by event_id) from p0_fact_targets) <> array[236, 246, 249, 332, 360, 377, 385]::bigint[]
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
    where s.event_id in (236, 246, 249, 332, 360, 377, 385)
      and j.status in ('queued', 'processing', 'retry_scheduled')
  ) or exists (
    select 1 from public.event_sources s
    where s.event_id in (236, 246, 249, 332, 360, 377, 385)
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
          and a.change_source = 'manual_admin' and a.reason = $reason$P0 facts batch 03 (2026-09-08): reviewed current official sources; factual corrections only, no freshness attestation. Evidence: https://www.muelheimer-firmenlauf.de/ ; https://hanauer-stadtlauf.de/ ; https://firmenlauf-bamberg.de/ ; https://bedburger-citylauf.de/ ; https://deistercrossing.de/ausschreibung ; https://www.braunenberg-lauf.de/ ; https://events.ihk-elbeweser.de/futurerunausbildunginbewegung$reason$
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
          and a.change_source = 'manual_admin' and a.reason = $reason$P0 facts batch 03 (2026-09-08): reviewed current official sources; factual corrections only, no freshness attestation. Evidence: https://www.muelheimer-firmenlauf.de/ ; https://hanauer-stadtlauf.de/ ; https://firmenlauf-bamberg.de/ ; https://bedburger-citylauf.de/ ; https://deistercrossing.de/ausschreibung ; https://www.braunenberg-lauf.de/ ; https://events.ihk-elbeweser.de/futurerunausbildunginbewegung$reason$
      )
  ) then
    raise exception 'P0 facts postcondition: a factual change lacks its automatic field audit';
  end if;
end
$audit_guard$;

insert into private.event_data_workflow_backup (migration_key,entity_table,entity_pk,row_data)
select '20260908_p0_event_facts_batch_03', 'events_post_state', e.id::text, to_jsonb(e)
from public.events e join p0_fact_targets t on t.event_id = e.id
union all
select '20260908_p0_event_facts_batch_03', 'event_editions_post_state', e.id::text, to_jsonb(e)
from public.event_editions e join p0_fact_targets t on t.edition_id = e.id;

do $backup_guard$
begin
  if (select count(*) from private.event_data_workflow_backup where migration_key = '20260908_p0_event_facts_batch_03') <> 29 then
    raise exception 'P0 facts snapshots incomplete: expected 14 before, 14 after and 1 manifest';
  end if;
end
$backup_guard$;
commit;
