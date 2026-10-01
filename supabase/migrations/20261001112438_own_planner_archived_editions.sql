-- Resolve only a caller's exact saved, formerly public edition. No catalog,
-- table policy, public detail route or Planner reference is changed.
begin;
set local lock_timeout='5s';
do $$ begin
 if current_user<>'postgres' then raise exception 'Apply own Planner archive migration as postgres'; end if;
end $$;

create function public.get_own_planner_archived_editions(p_edition_ids uuid[])
returns table(
 event_id bigint,edition_id uuid,event_key text,edition_slug text,edition_year smallint,
 event_name text,sport text,date text,end_date date,start_time time without time zone,
 city text,country text,address text,latitude text,longitude text,distance text,
 race_formats jsonb,event_status text,registration_status text,event_url text,source_url text,
 description text,official_url text,registration_url text,publication_status text,catalog_visibility text
)
language plpgsql stable security definer set search_path=pg_catalog
as $owned$
begin
 if (select auth.uid()) is null then raise exception 'Anmeldung erforderlich.' using errcode='42501'; end if;
 if coalesce(cardinality(p_edition_ids),0)>500 then
   raise exception 'Höchstens 500 eigene Editionskennungen pro Anfrage.' using errcode='22023'; end if;
 if coalesce(cardinality(p_edition_ids),0)=0 then return; end if;
 return query
 select distinct e.id,d.id,d.legacy_event_key,d.edition_slug,d.edition_year,
   e.canonical_name,e.sport,to_char(d.start_date::timestamp,'DD.MM.YYYY'),d.end_date,d.start_time,
   e.city,e.country,e.address,e.latitude::text,e.longitude::text,
   coalesce(d.legacy_distance,d.race_formats->0->>'label'),d.race_formats,d.edition_status,d.registration_status,
   coalesce(d.registration_url,e.official_url,d.source_url),d.source_url,e.description,e.official_url,d.registration_url,
   d.publication_status,'owned_archived'::text
 from public.season_planner_events own_entry
 join public.event_editions d on d.id=own_entry.edition_id
 join public.events e on e.id=d.event_id
 where own_entry.user_id=(select auth.uid()) and d.id=any(p_edition_ids)
   and d.publication_status='archived' and d.published_at is not null
   and e.status='approved' and e.publication_status='published';
end;
$owned$;
revoke all on function public.get_own_planner_archived_editions(uuid[]) from public,anon,authenticated;
grant execute on function public.get_own_planner_archived_editions(uuid[]) to authenticated;
comment on function public.get_own_planner_archived_editions(uuid[]) is
 'Read-only whitelisted facts of exact archived editions saved by auth.uid; formerly published proof and still-public approved brand required. No drafts, other users, internal sources or Discovery access.';
commit;
