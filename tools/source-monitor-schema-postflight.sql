-- Read-only Source Monitor schema postflight; preserves the existing freshness
-- and candidate/result safety contracts. Run after both reviewed migrations.
begin isolation level repeatable read read only;
set local statement_timeout = '30s';
set local search_path = pg_catalog, public, private;
do $postflight$
declare
  protected jsonb := $protected${"functions":[{"config":["search_path=pg_catalog, public, private","statement_timeout=30s"],"signature":"get_public_event_freshness_guard(uuid[])","definition_md5":"06fd955f92fa68bede209bd29bb034ec","security_definer":true},{"config":["search_path=pg_catalog, public, private"],"signature":"private.invalidate_current_edition_freshness(bigint,uuid,text)","definition_md5":"02d8fc33ff7442b017b050bd1bd8b173","security_definer":true},{"config":["search_path=pg_catalog, public, private"],"signature":"private.invalidate_edition_freshness_on_fact_change()","definition_md5":"6708aec2298ddd907b4381029dc3cadd","security_definer":true},{"config":["search_path=pg_catalog, public, private"],"signature":"private.invalidate_freshness_from_event_fact_change()","definition_md5":"13f7dca0788bf6fea81667d173c13281","security_definer":true},{"config":["search_path=pg_catalog, public, private"],"signature":"private.invalidate_freshness_from_review_signal()","definition_md5":"d1746516ef5aad7e7729360b9db46492","security_definer":true},{"config":["search_path=pg_catalog, public, private"],"signature":"private.invalidate_freshness_from_source_health()","definition_md5":"a0b6b4f7e9a035851420b3a8ae461058","security_definer":true},{"config":["search_path=pg_catalog, public"],"signature":"private.sync_legacy_event_edition()","definition_md5":"b345eb9b9cc2c2bf0f44a639549524a9","security_definer":true},{"config":["search_path=pg_catalog, public, private"],"signature":"register_edition_result_candidate(uuid,bigint,text,text,numeric)","definition_md5":"1ed23887a7f9d4add2b2c74033e2a279","security_definer":true},{"config":["search_path=pg_catalog, public, private"],"signature":"register_edition_successor_candidate(uuid,bigint,jsonb,text)","definition_md5":"db948af965c254b44796d5c0bee436d6","security_definer":true},{"config":["search_path=pg_catalog, public, auth"],"signature":"run_data_freshness_monitor()","definition_md5":"b8b34d13ad454f76c084f08bc1a7944f","security_definer":true},{"config":["search_path=pg_catalog, public, private","lock_timeout=5s"],"signature":"verify_freshness_review_editions(uuid[],text,jsonb)","definition_md5":"c38c3eee6d270aa8ab8a7537d730d31b","security_definer":true}],"triggers":[{"name":"data_workflow_alerts_invalidate_freshness","table":"data_workflow_alerts","definition_md5":"cc8a56c835f86affd459981984d11f0e"},{"name":"event_change_proposals_invalidate_freshness","table":"event_change_proposals","definition_md5":"acbe74b9224860c5c3fcc5584ad96a28"},{"name":"event_editions_initialize_freshness","table":"event_editions","definition_md5":"04bb2df05cb5cee8306e6cc8e73885f2"},{"name":"event_editions_invalidate_freshness_on_fact_change","table":"event_editions","definition_md5":"17ad43052347f2bc9eef757fbb5d9399"},{"name":"event_sources_invalidate_freshness","table":"event_sources","definition_md5":"e8cff987b5f12a88fbd6329e60099a35"},{"name":"events_invalidate_freshness_on_fact_change","table":"events","definition_md5":"61c02091999aaf8bfee5e51a4dbaa76b"},{"name":"events_sync_legacy_edition","table":"events","definition_md5":"70978089387ad00ed0d24bbebba77e65"},{"name":"source_review_tasks_invalidate_freshness","table":"source_review_tasks","definition_md5":"0bedb9466ed0bfe6160f675633fc18a4"},{"name":"user_feedback_invalidate_freshness","table":"user_feedback","definition_md5":"30daaa3431ea373e537f7e939a8b2328"},{"name":"validation_issues_invalidate_freshness","table":"validation_issues","definition_md5":"0f6a778e7511a6ffc5c988c8d00b8249"}]}$protected$::jsonb;
  item jsonb;
  fn oid;
begin
  for item in select value from jsonb_array_elements(protected->'functions') loop
    fn := to_regprocedure(item->>'signature');
    if fn is null or md5(pg_get_functiondef(fn)) is distinct from item->>'definition_md5' then
      raise exception 'Protected freshness/lifecycle function changed: %', item->>'signature';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(protected->'triggers') loop
    if not exists (select 1 from pg_trigger t
      where t.tgrelid=to_regclass(item->>'table') and t.tgname=item->>'name'
        and md5(pg_get_triggerdef(t.oid))=item->>'definition_md5' and t.tgenabled='O') then
      raise exception 'Protected freshness trigger changed: %', item->>'name';
    end if;
  end loop;
  if not coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.event_field_controls')),false)
     or has_table_privilege('anon','public.event_field_controls','SELECT')
     or has_table_privilege('anon','public.event_change_proposals','SELECT') then
    raise exception 'Field controls/proposals are not private with RLS';
  end if;
  for item in select to_jsonb(signature) from unnest(array[
    'public.record_extraction_proposals(uuid,bigint,jsonb,text)',
    'public.get_source_monitor_runtime_capabilities()'
  ]) signatures(signature) loop
    fn := to_regprocedure(item#>>'{}');
    if fn is null or has_function_privilege('anon',fn,'EXECUTE')
       or has_function_privilege('authenticated',fn,'EXECUTE')
       or not has_function_privilege('service_role',fn,'EXECUTE') then
      raise exception 'Service RPC permission boundary mismatch: %', item;
    end if;
  end loop;
  for item in select to_jsonb(signature) from unnest(array[
    'public.review_event_change_proposal(uuid,text,text,jsonb,text)',
    'public.apply_event_change_proposal(uuid,text)',
    'public.set_event_field_control(bigint,uuid,text,jsonb,text,timestamptz,boolean,smallint)'
  ]) signatures(signature) loop
    fn := to_regprocedure(item#>>'{}');
    if fn is null or has_function_privilege('anon',fn,'EXECUTE')
       or not has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'Admin RPC permission boundary mismatch: %',item;
    end if;
  end loop;
  if public.get_source_monitor_runtime_capabilities()->>'extraction_review' is distinct from 'true' then
    raise exception 'Required extraction capability absent';
  end if;
end;
$postflight$;
select jsonb_build_object(
  'capabilities',public.get_source_monitor_runtime_capabilities(),
  'protected_functions',11,'protected_triggers',10,
  'events',(select count(*) from public.events),
  'editions',(select count(*) from public.event_editions),
  'sources',(select count(*) from public.event_sources),
  'legacy_superseded_proposals',(select count(*) from public.event_change_proposals where proposal_status='superseded' and field_name is null),
  'field_controls',(select count(*) from public.event_field_controls)
) as source_monitor_schema_postflight;
rollback;
