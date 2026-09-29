begin;

-- Historical observations retain their raw URL. For an explicitly reviewed,
-- identically bound source only, recognise HTTPS upgrade and one leading www.
-- Path, query, fragment, percent encoding and trailing slash remain exact.
create function private.manual_candidate_source_url_matches(p_observed text,p_confirmed text)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog
as $match$
declare observed_parts text[]; confirmed_parts text[];
begin
 if p_observed is null or p_confirmed is null then return false; end if;
 if p_observed=p_confirmed then return true; end if;
 -- Domain names only: no user information, port, IP literal or escaped host.
 observed_parts:=regexp_match(p_observed,'^https?://([a-z0-9]([a-z0-9.-]*[a-z0-9])?)(/[^[:space:]\\]*)?$','i');
 confirmed_parts:=regexp_match(p_confirmed,'^https://([a-z0-9]([a-z0-9.-]*[a-z0-9])?)(/[^[:space:]\\]*)?$','i');
 if observed_parts is null or confirmed_parts is null then return false; end if;
 if observed_parts[1] !~* '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]([a-z0-9-]*[a-z0-9])?$'
   or confirmed_parts[1] !~* '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]([a-z0-9-]*[a-z0-9])?$' then return false; end if;
 return regexp_replace(lower(observed_parts[1]),'^www\.','')=regexp_replace(lower(confirmed_parts[1]),'^www\.','')
   and coalesce(observed_parts[3],'')=coalesce(confirmed_parts[3],'');
end;
$match$;
revoke all on function private.manual_candidate_source_url_matches(text,text) from public,anon,authenticated;

-- Guard every exact patch: schema drift must stop this additive migration.
do $patch$
declare definition text; old_text text; new_text text;
begin
 definition:=replace(pg_get_functiondef('private.manual_candidate_resolution_current(public.edition_succession_candidates)'::regprocedure),E'\r\n',E'\n');
 old_text:=$old$     and observed_source.source_type='official_event_website' and observed_source.source_url=p_candidate.source_url
     and p_candidate.source_url=s.source_url$old$;
 new_text:=$new$     and observed_source.source_type='official_event_website'
     and private.manual_candidate_source_url_matches(p_candidate.source_url,observed_source.source_url)
     and private.manual_candidate_source_url_matches(p_candidate.source_url,s.source_url)
     and (p_candidate.source_url=s.source_url or p_candidate.source_id=s.id)$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
   raise exception 'Candidate resolution source binding changed; inspect before applying URL alias patch'; end if;
 execute replace(definition,old_text,new_text);

 definition:=replace(pg_get_functiondef('private.review_manual_event_maintenance(jsonb)'::regprocedure),E'\r\n',E'\n');
 old_text:=$old$      or source.source_url is distinct from candidate.source_url
      or not exists(select 1 from public.event_sources os where os.id=candidate.source_id and os.event_id=event_id
        and os.is_active and os.source_type='official_event_website' and os.source_url=candidate.source_url)$old$;
 new_text:=$new$      or not private.manual_candidate_source_url_matches(candidate.source_url,source.source_url)
      or (candidate.source_url is distinct from source.source_url and candidate.source_id is distinct from source.id)
      or not exists(select 1 from public.event_sources os where os.id=candidate.source_id and os.event_id=event_id
        and os.is_active and os.source_type='official_event_website'
        and private.manual_candidate_source_url_matches(candidate.source_url,os.source_url))$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
   raise exception 'Manual review source binding changed; inspect before applying URL alias patch'; end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$     'resolved_reason','edition_year_date_conflict','publication_unchanged',true);$old$;
 new_text:=$new$     'resolved_reason','edition_year_date_conflict','publication_unchanged',true,
     'source_url_comparison',jsonb_build_object('observed_url',candidate.source_url,'confirmed_url',source.source_url,
       'same_source_id',candidate.source_id=source.id,
       'policy',case when candidate.source_url=source.source_url then 'exact' else 'https_www_same_source_exact_path_v1' end));$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
   raise exception 'Manual review resolution audit changed; inspect before applying URL alias patch'; end if;
 execute replace(definition,old_text,new_text);
end;
$patch$;

commit;
