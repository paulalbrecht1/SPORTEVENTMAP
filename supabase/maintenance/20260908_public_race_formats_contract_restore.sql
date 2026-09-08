-- Forward recovery after the matching NULL-column rollback.
-- Run explicitly in a reviewed deployment window; first rehearse on a fresh restore.
-- No DROP/CASCADE, grants, event facts or verification metadata are changed.
-- The migration deliberately rejects NULL drift; this guarded script restores it.
-- Afterward rerun tests/public-race-formats-contract.sql and anonymous REST probes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;

do $recovery$
declare
  target_name text;
  target_oid oid;
  before_owner oid;
  before_acl aclitem[];
  before_options text[];
  before_columns jsonb;
  before_rows jsonb;
  after_rows jsonb;
  definition text;
  projection text;
  mismatch boolean;
begin
  foreach target_name in array array['public_event_discovery', 'public_event_archive'] loop
    select c.oid, c.relowner, c.relacl, c.reloptions
      into target_oid, before_owner, before_acl, before_options
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = target_name and c.relkind = 'v';
    if target_oid is null or not coalesce('security_invoker=true' = any(before_options), false) then
      raise exception 'Recovery requires an existing security-invoker view: %', target_name;
    end if;
    if not exists (
      select 1 from pg_attribute where attrelid = target_oid and attname = 'race_formats'
        and atttypid = 'jsonb'::regtype and attnum > 0 and not attisdropped
    ) or not exists (
      select 1 from pg_attribute where attrelid = target_oid and attname = 'edition_id'
        and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped
    ) then raise exception 'Unexpected recovery column contract: %', target_name; end if;
    execute format('select not exists (select 1 from public.%I)', target_name) into mismatch;
    if mismatch then raise exception 'Cannot validate recovery against an empty view: %', target_name; end if;
    execute format('select exists (select 1 from public.%I where race_formats is not null)', target_name) into mismatch;
    if mismatch then raise exception 'Forward recovery requires the entirely NULL format projection: %', target_name; end if;

    select jsonb_agg(jsonb_build_array(attname, atttypid, atttypmod, attnum) order by attnum),
      string_agg(case when attname = 'race_formats' then 'edition_formats.race_formats'
        else format('unchanged_projection.%I', attname) end, ', ' order by attnum)
      into before_columns, projection
    from pg_attribute where attrelid = target_oid and attnum > 0 and not attisdropped;
    execute format('select jsonb_agg(to_jsonb(v) - ''race_formats'' order by v.edition_id) from public.%I v', target_name)
      into before_rows;
    definition := rtrim(pg_get_viewdef(target_oid, true), E';\n\r ');
    execute format(
      'create or replace view public.%I with (security_invoker = true) as
       select %s from (%s) unchanged_projection
       join public.event_editions edition_formats on edition_formats.id = unchanged_projection.edition_id',
      target_name, projection, definition
    );
    execute format('select jsonb_agg(to_jsonb(v) - ''race_formats'' order by v.edition_id) from public.%I v', target_name)
      into after_rows;
    if before_rows is distinct from after_rows then
      raise exception 'Recovery changed another public value: %', target_name;
    end if;
    if before_columns is distinct from (
      select jsonb_agg(jsonb_build_array(attname, atttypid, atttypmod, attnum) order by attnum)
      from pg_attribute where attrelid = target_oid and attnum > 0 and not attisdropped
    ) then raise exception 'Recovery changed column layout: %', target_name; end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.oid = target_oid and c.relname = target_name and n.nspname = 'public'
        and c.relowner = before_owner and c.relacl is not distinct from before_acl
        and c.reloptions is not distinct from before_options
    ) then raise exception 'Recovery changed view identity or access controls: %', target_name; end if;
    execute format('select exists (select 1 from public.%I v left join public.event_editions e on e.id = v.edition_id where e.id is null or v.race_formats is distinct from e.race_formats)', target_name) into mismatch;
    if mismatch then raise exception 'Recovery postcondition failed: %', target_name; end if;
  end loop;
end;
$recovery$;

notify pgrst, 'reload schema';
commit;
