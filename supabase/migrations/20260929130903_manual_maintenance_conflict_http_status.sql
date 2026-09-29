-- An optimistic application conflict is final for this request. PostgREST 14
-- automatically retries SQLSTATE 40001, which otherwise loops until HTTP 504.
-- Preserve the same version check, message, locks and idempotency behavior.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
  original text;
  needle text := $find$raise exception 'Die Daten wurden inzwischen geändert. Neu laden und die Änderungen erneut prüfen; Ihre Eingaben bleiben erhalten.' using errcode='40001';$find$;
  replacement text;
begin
  original := replace(pg_get_functiondef('private.save_manual_event_maintenance(jsonb)'::regprocedure), chr(13), '');
  if (length(original) - length(replace(original, needle, ''))) / length(needle) <> 1 then
    raise exception 'Expected exactly one manual-maintenance version conflict; inspect schema drift before applying';
  end if;
  replacement := replace(needle, '''40001''', '''PT409''');
  execute replace(original, needle, replacement);
end;
$migration$;

commit;
