-- Read-only postflight. Run on an isolated restored database after the migration.
-- Uses the actual anon role without inventing authentication claims.
begin read only;
set local statement_timeout = '60s';
set local role anon;
do $check$
declare
  target_name text;
  mismatch boolean;
begin
  foreach target_name in array array['public_event_discovery', 'public_event_archive'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'public' and c.relname = target_name and c.relkind = 'v'
        and 'security_invoker=true' = any(c.reloptions)
        and a.attname = 'race_formats' and a.atttypid = 'jsonb'::regtype
        and a.attnum > 0 and not a.attisdropped
    ) then
      raise exception 'Missing public format type/security contract: %', target_name;
    end if;
    execute format(
      'select exists (select 1 from public.%I v
       left join public.event_editions e on e.id = v.edition_id
       left join public.events b on b.id = e.event_id
       where e.id is null or b.id is null or e.publication_status <> ''published''
         or b.status <> ''approved'' or b.publication_status <> ''published''
         or v.race_formats is distinct from e.race_formats)', target_name
    ) into mismatch;
    if mismatch then raise exception 'Public formats mismatch or cross visibility boundary: %', target_name; end if;
  end loop;
  if exists (
    select 1 from public.public_event_discovery v join public.event_editions e on e.id = v.edition_id
    where e.discovery_status <> 'active' or e.edition_status in ('cancelled','inactive','completed')
      or coalesce(e.end_date,e.start_date) < current_date
  ) then raise exception 'Discovery lifecycle filter changed'; end if;
end;
$check$;
select 'public race-format contract verified under anon' as result,
  (select count(*) from public.public_event_discovery) as discovery_rows,
  (select count(*) from public.public_event_archive) as archive_rows,
  (select count(*) from public.public_event_discovery where jsonb_array_length(race_formats) > 1) as structured_multi_format_rows;
rollback;
