-- Natural Earth 1:50m intentionally omits some small islands and remote
-- territories. Add reviewed territorial polygons instead of weakening the
-- global distance tolerance used by coordinate validation.

begin;

create table if not exists private.country_boundary_exceptions (
  exception_key text primary key,
  country_aliases text[] not null,
  territory_name text not null,
  geom extensions.geometry(Polygon, 4326) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

insert into private.country_boundary_exceptions (
  exception_key, country_aliases, territory_name, geom, reason
) values
  ('de_north_sea_islands', array['germany', 'deutschland'], 'German North Sea islands',
   extensions.ST_MakeEnvelope(5.75, 53.25, 9.25, 55.20, 4326),
   'Natural Earth 1:50m omits small German North Sea islands including Borkum, Norderney and Helgoland.'),
  ('de_baltic_islands', array['germany', 'deutschland'], 'German Baltic islands',
   extensions.ST_MakeEnvelope(10.60, 53.65, 14.55, 55.10, 4326),
   'Natural Earth 1:50m omits or generalizes small German Baltic islands including Poel.'),
  ('es_canary_islands', array['spain'], 'Canary Islands',
   extensions.ST_MakeEnvelope(-18.50, 27.45, -13.15, 29.55, 4326),
   'The catalog includes Spanish events on the Canary Islands.'),
  ('no_svalbard', array['norway'], 'Svalbard',
   extensions.ST_MakeEnvelope(9.00, 74.00, 36.00, 81.20, 4326),
   'Svalbard is under Norwegian sovereignty and is absent from the selected Natural Earth country feature.')
on conflict (exception_key) do update set
  country_aliases = excluded.country_aliases,
  territory_name = excluded.territory_name,
  geom = excluded.geom,
  reason = excluded.reason;

create index if not exists country_boundary_exceptions_geom_gix
  on private.country_boundary_exceptions using gist (geom);
revoke all on private.country_boundary_exceptions from public, anon, authenticated;

create or replace function private.coordinates_within_country(
  p_country text,
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, extensions, private
as $$
  with point as (
    select extensions.ST_SetSRID(extensions.ST_Point(p_longitude, p_latitude), 4326) as geom
  )
  select coalesce(
    bool_or(
      extensions.ST_Covers(area.geom, point.geom)
      or extensions.ST_DWithin(area.geom::extensions.geography, point.geom::extensions.geography, 3000)
    ),
    true
  )
  from point
  cross join lateral (
    select b.geom from private.country_boundaries b
    where lower(p_country) = any(b.country_aliases)
    union all
    select x.geom from private.country_boundary_exceptions x
    where lower(p_country) = any(x.country_aliases)
  ) area;
$$;

-- Keep the coarse legacy rule accurate for Svalbard as well.
update private.country_coordinate_bounds
set max_lat = 81.20, max_lon = 36.00
where country_key = 'norway';

revoke all on function private.coordinates_within_country(text, double precision, double precision)
  from public, anon, authenticated;

comment on table private.country_boundary_exceptions is
  'Reviewed territorial polygons omitted or generalized by Natural Earth 1:50m; never exposed through the Data API.';

commit;
