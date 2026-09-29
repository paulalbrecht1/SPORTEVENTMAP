-- Keep the established import/validation/legacy paths aligned with the new
-- edition discriminator. Existing years and IDs are unchanged; old imports
-- continue to address edition_key='main'. Fail closed on schema drift.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $migration$
declare
  signature text;
  original text;
  replacement text;
  needle text;
  substitute text;
begin
  for signature, needle, substitute in
    values
      ('private.import_catalog_editions(uuid,jsonb)',
       'on conflict (event_id, edition_year) do update set',
       'on conflict (event_id, edition_year, edition_key) do update set'),
      ('private.finalize_catalog_import(uuid)',
       'group by event_id, edition_year having count(*) > 1',
       'group by event_id, edition_year, edition_key having count(*) > 1'),
      ('public.run_event_validation_rules_v1(bigint,uuid)',
       'group by event_id, edition_year having count(*) > 1',
       'group by event_id, edition_year, edition_key having count(*) > 1'),
      ('private.sync_legacy_event_edition()',
       'where event_id = new.id and edition_year = previous_year for update',
       'where event_id = new.id and edition_year = previous_year and edition_key = ''main'' for update')
  loop
    original := pg_get_functiondef(signature::regprocedure);
    if strpos(original, needle) = 0 then
      raise exception 'Manual maintenance compatibility preflight failed for %; inspect schema drift', signature;
    end if;
    replacement := replace(original, needle, substitute);
    if signature = 'public.run_event_validation_rules_v1(bigint,uuid)' then
      replacement := replace(replacement,
        'Multiple editions exist for the same event and year.',
        'Multiple editions share the same event, year and edition identity.');
    end if;
    execute replacement;
  end loop;
end;
$migration$;

commit;
