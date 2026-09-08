-- Recover only the structured competition field missing from older public
-- projections. Preserve the existing query, column order, grants and filters;
-- do not replay the broader event-detail foundation or change any event facts.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;

do $contract$
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
  has_formats boolean;
  mismatch boolean;
begin
  foreach target_name in array array['public_event_discovery', 'public_event_archive'] loop
    select c.oid, c.relowner, c.relacl, c.reloptions
      into target_oid, before_owner, before_acl, before_options
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = target_name and c.relkind = 'v';
    if target_oid is null or not coalesce('security_invoker=true' = any(before_options), false) then
      raise exception 'Public format contract requires an existing security-invoker view: %', target_name;
    end if;
    if not exists (
      select 1 from pg_attribute
      where attrelid = target_oid and attname = 'edition_id'
        and atttypid = 'uuid'::regtype and attnum > 0 and not attisdropped
    ) then
      raise exception 'Public format contract requires a UUID edition identity: %', target_name;
    end if;
    select exists (
      select 1 from pg_attribute
      where attrelid = target_oid and attname = 'race_formats' and attnum > 0 and not attisdropped
    ) into has_formats;
    if has_formats and not exists (
      select 1 from pg_attribute
      where attrelid = target_oid and attname = 'race_formats' and atttypid = 'jsonb'::regtype
        and attnum > 0 and not attisdropped
    ) then
      raise exception 'Unexpected race_formats type in %', target_name;
    end if;

    if not has_formats then
      select jsonb_agg(jsonb_build_array(attname, atttypid, atttypmod, attnum) order by attnum)
        into before_columns
      from pg_attribute where attrelid = target_oid and attnum > 0 and not attisdropped;
      execute format('select coalesce(jsonb_agg(to_jsonb(v) order by v.edition_id), ''[]''::jsonb) from public.%I v', target_name)
        into before_rows;
      definition := rtrim(pg_get_viewdef(target_oid, true), E';\n\r ');
      -- The primary-key join cannot multiply editions. Reusing the exact
      -- existing projection also preserves its current lifecycle/RLS contract.
      execute format(
        'create or replace view public.%I with (security_invoker = true) as
         select current_projection.*, edition_formats.race_formats
         from (%s) current_projection
         join public.event_editions edition_formats on edition_formats.id = current_projection.edition_id',
        target_name, definition
      );
      execute format('select coalesce(jsonb_agg(to_jsonb(v) - ''race_formats'' order by v.edition_id), ''[]''::jsonb) from public.%I v', target_name)
        into after_rows;
      if before_rows is distinct from after_rows then
        raise exception 'Public format contract changed an existing row or field: %', target_name;
      end if;
      if before_columns is distinct from (
        select jsonb_agg(jsonb_build_array(attname, atttypid, atttypmod, attnum) order by attnum)
        from pg_attribute where attrelid = target_oid and attnum > 0 and not attisdropped and attname <> 'race_formats'
      ) then
        raise exception 'Public format contract changed the existing column layout: %', target_name;
      end if;
    end if;

    -- Also verify an already-upgraded schema; never silently accept a wrong
    -- existing format projection or expand its other public fields.
    execute format(
      'select exists (select 1 from public.%I v
       left join public.event_editions e on e.id = v.edition_id
       where e.id is null or v.race_formats is distinct from e.race_formats)', target_name
    ) into mismatch;
    if mismatch then
      raise exception 'Public competition formats do not match their exact edition: %', target_name;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.oid = target_oid and c.relname = target_name and n.nspname = 'public'
        and c.relowner = before_owner and c.relacl is not distinct from before_acl
        and c.reloptions is not distinct from before_options
    ) then
      raise exception 'Public format contract changed view identity or access controls: %', target_name;
    end if;
  end loop;
end;
$contract$;

notify pgrst, 'reload schema';
commit;
