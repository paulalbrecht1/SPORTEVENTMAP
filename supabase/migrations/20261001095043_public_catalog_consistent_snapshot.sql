-- Read-only export envelope: existing view visibility and freshness rules stay
-- unchanged. STABLE executes all SELECTs against the caller's statement snapshot.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function public.get_public_event_catalog_snapshot()
returns jsonb
language sql stable security invoker
set search_path = pg_catalog, public
set statement_timeout = '30s'
as $snapshot$
  with allowed as (
    select array[
      'id','event_id','edition_id','event_key','event_name','sport','date',
      'city','country','address','latitude','longitude','distance','description',
      'image','event_url','source_url','verification_status','priority','last_checked',
      'next_check','event_status','edition_slug','slug','edition_year','discovery_status',
      'results_status','registration_status','organizer_name','organizer_url','official_url',
      'registration_url','brand_verification_status','brand_last_verified_at',
      'edition_verification_status','edition_last_verified_at','race_formats','end_date',
      'start_time','price_min','price_max','currency','participant_limit'
    ]::text[] as fields,
    array['label','distance_km','swim_km','bike_km','run_km','elevation_gain_m',
      'sport','name','format','start_time','price','currency','terrain','surface',
      'relay','legs','leg_distance_km','distance_mode']::text[] as race_fields,
    array['type','title','url','published_at']::text[] as result_fields
  ), discovery as materialized (
    select d.edition_id, d.edition_slug, (
      select jsonb_object_agg(f.key, case when f.key = 'race_formats' then
        coalesce((select jsonb_agg((select jsonb_object_agg(rf.key,rf.value)
          from jsonb_each(race.value) rf where rf.key=any(a.race_fields)) order by race.position)
          from jsonb_array_elements(f.value) with ordinality race(value,position)), '[]'::jsonb)
        else f.value end)
      from jsonb_each(to_jsonb(d)) f where f.key=any(a.fields)
    ) as row
    from public.public_event_discovery d cross join allowed a
  ), archive as materialized (
    select d.edition_slug, (
      select jsonb_object_agg(f.key, case
        when f.key = 'race_formats' then coalesce((select jsonb_agg((select jsonb_object_agg(rf.key,rf.value)
          from jsonb_each(race.value) rf where rf.key=any(a.race_fields)) order by race.position)
          from jsonb_array_elements(f.value) with ordinality race(value,position)), '[]'::jsonb)
        when f.key = 'results' then coalesce((select jsonb_agg((select jsonb_object_agg(rf.key,rf.value)
          from jsonb_each(result.value) rf where rf.key=any(a.result_fields)) order by result.position)
          from jsonb_array_elements(f.value) with ordinality result(value,position)), '[]'::jsonb)
        else f.value end)
      from jsonb_each(to_jsonb(d)) f where f.key=any(a.fields||array['results'])
    ) as row
    from public.public_event_archive d cross join allowed a
  )
  select jsonb_build_object(
    'schema_version', 1,
    'consistency', 'single_statement',
    'measured_at', statement_timestamp(),
    'discovery_count', (select count(*) from discovery),
    'archive_count', (select count(*) from archive),
    'discovery', coalesce((select jsonb_agg(d.row order by d.edition_slug) from discovery d), '[]'::jsonb),
    'archive', coalesce((select jsonb_agg(a.row order by a.edition_slug) from archive a), '[]'::jsonb),
    'freshness_guard', case when exists(select 1 from discovery) then
      public.get_public_event_freshness_guard((select array_agg(d.edition_id order by d.edition_id) from discovery d))
      else jsonb_build_object('schema_version',1,'evaluated_at',statement_timestamp(),'requested_count',0,'decisions','{}'::jsonb)
      end
  );
$snapshot$;

revoke all on function public.get_public_event_catalog_snapshot() from public;
grant execute on function public.get_public_event_catalog_snapshot() to anon, authenticated;
comment on function public.get_public_event_catalog_snapshot() is
  'Read-only single-statement public Discovery/archive snapshot with existing authoritative edition freshness decisions. No internal review evidence or publication action.';
commit;
