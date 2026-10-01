-- Isolated, synthetic, rollback-only database regression. Never production.
begin;
set local statement_timeout='120s';
do $$ begin
 if current_setting('sporteventmap.test_own_planner_archive',true) is distinct from 'isolated' then
   raise exception 'Run only in the disposable local maintenance runner'; end if;
end $$;
create temporary table own_archive_checks(label text primary key) on commit drop;
grant select,insert on own_archive_checks to authenticated,anon;
create function pg_temp.oa_assert(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'OWN ARCHIVE REGRESSION: %',label; end if;
 insert into pg_temp.own_archive_checks values(label);
end $$;
create function pg_temp.oa_reject(statement text,label text,expected_state text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute statement;
 exception when others then
   if sqlstate<>expected_state then raise exception 'Unexpected SQLSTATE % for %',sqlstate,label; end if;
   rejected:=true;
 end;
 perform pg_temp.oa_assert(rejected,label);
end $$;

do $tests$
#variable_conflict use_variable
declare
 marker text:='own-planner-archive-'||gen_random_uuid();
 user_one uuid:=gen_random_uuid(); user_two uuid:=gen_random_uuid(); event_id bigint; hidden_event_id bigint;
 own_id uuid; foreign_id uuid; draft_id uuid; never_id uuid; hidden_id uuid; unknown_id uuid:=gen_random_uuid();
 planner_id uuid; rows jsonb; old_planner jsonb; keys text[];
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at)
 values(user_one,'authenticated','authenticated',marker||'-one@example.invalid',now(),now()),
       (user_two,'authenticated','authenticated',marker||'-two@example.invalid',now(),now());
 insert into public.events(event_name,date,city,country,sport,distance,event_url,description,status)
 values(marker,'04.05.2024','Berlin','Deutschland','Running','10 km','https://example.invalid/archived',
   'Public synthetic core facts for a formerly published edition saved in a private season planner.','approved') returning id into event_id;
 select d.id into own_id from public.event_editions d where d.event_id=event_id;
 update public.event_editions d set publication_status='archived',published_at='2024-01-01T00:00:00Z',edition_status='completed' where d.id=own_id;
 insert into public.event_editions(event_id,edition_year,edition_key,edition_slug,legacy_event_key,start_date,end_date,
   publication_status,published_at,edition_status,race_formats,legacy_distance,source_url)
 values(event_id,2023,'main',marker||'-2023',marker||'-2023-key','2023-05-04','2023-05-04','archived','2023-01-01','completed','[{"label":"10 km","distance_km":10}]','10 km','https://example.invalid/foreign') returning id into foreign_id;
 insert into public.event_editions(event_id,edition_year,edition_key,edition_slug,legacy_event_key,publication_status,published_at)
 values(event_id,2027,'main',marker||'-2027',marker||'-2027-key','draft',null) returning id into draft_id;
 insert into public.event_editions(event_id,edition_year,edition_key,edition_slug,legacy_event_key,publication_status,published_at)
 values(event_id,2022,'main',marker||'-2022',marker||'-2022-key','archived',null) returning id into never_id;
 insert into public.events(event_name,date,city,country,sport,distance,event_url,status)
 values(marker||'-hidden','04.05.2021','Berlin','Deutschland','Running','10 km','https://example.invalid/hidden','archived') returning id into hidden_event_id;
 select d.id into hidden_id from public.event_editions d where d.event_id=hidden_event_id;
 update public.event_editions d set publication_status='archived',published_at='2021-01-01' where d.id=hidden_id;
 insert into public.season_planner_events(user_id,event_id,edition_id,priority,planner_details)
 values(user_one,event_id::text,own_id,'A','{"notes":"Private notes never returned"}') returning id into planner_id;
 insert into public.season_planner_events(user_id,event_id,edition_id,priority)
 values(user_two,foreign_id::text,foreign_id,'B'),(user_one,draft_id::text,draft_id,'B'),
   (user_one,never_id::text,never_id,'B'),(user_one,hidden_event_id::text,hidden_id,'B');
 select to_jsonb(p) into old_planner from public.season_planner_events p where p.id=planner_id;

 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_one)::text,true);
 perform set_config('request.jwt.claim.sub',user_one::text,true); execute 'set local role authenticated';
 select coalesce(jsonb_agg(to_jsonb(row)),'[]') into rows from public.get_own_planner_archived_editions(array[own_id,foreign_id,draft_id,never_id,hidden_id,unknown_id,own_id]) row;
 perform pg_temp.oa_assert(jsonb_array_length(rows)=1 and rows->0->>'edition_id'=own_id::text
   and rows->0->>'event_id'=event_id::text and rows->0->>'date'='04.05.2024' and rows->0->>'event_name'=marker,
   'own archived edition resolves concrete saved facts');
 perform pg_temp.oa_assert(rows->0->>'catalog_visibility'='owned_archived' and rows->0->>'publication_status'='archived',
   'archived provenance is explicit without Discovery visibility');
 perform pg_temp.oa_assert(not exists(select 1 from public.event_editions d where d.id=own_id)
   and not exists(select 1 from public.public_event_archive a where a.edition_id=own_id)
   and not exists(select 1 from public.public_event_discovery a where a.edition_id=own_id),
   'table RLS and public catalog remain closed for archived edition');
 perform pg_temp.oa_assert(not exists(select 1 from public.get_own_planner_archived_editions(array[foreign_id])),
   'foreign Planner binding is not authorization');
 perform pg_temp.oa_assert(not exists(select 1 from public.get_own_planner_archived_editions(array[draft_id,never_id])),
   'draft and never-published archive remain hidden');
 perform pg_temp.oa_assert(not exists(select 1 from public.get_own_planner_archived_editions(array[hidden_id])),
   'archived brand remains hidden');
 select array_agg(entry.key) into keys from jsonb_object_keys(rows->0) entry(key);
 perform pg_temp.oa_assert(cardinality(keys)=26 and not keys&&array['user_id','planner_details','notes','sources','review_tasks','crawl_status','audit'],
   'response contains only whitelisted public core facts');
 perform pg_temp.oa_assert((select to_jsonb(p)=old_planner from public.season_planner_events p where p.id=planner_id),
   'lookup preserves personal row and its original edition reference');
 perform pg_temp.oa_assert(not exists(select 1 from public.get_own_planner_archived_editions(null))
   and not exists(select 1 from public.get_own_planner_archived_editions('{}'::uuid[])),
   'null and empty requests cannot enumerate archives');
 perform pg_temp.oa_assert((select count(*)=1 from public.get_own_planner_archived_editions(array_fill(own_id,array[500]))),
   'bound request deduplicates exact editions');
 perform pg_temp.oa_reject(format('select public.get_own_planner_archived_editions(array_fill(%L::uuid,array[501]))',own_id),
   'requests above 500 UUIDs are rejected','22023');
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_two)::text,true);
 perform set_config('request.jwt.claim.sub',user_two::text,true); execute 'set local role authenticated';
 perform pg_temp.oa_assert(not exists(select 1 from public.get_own_planner_archived_editions(array[own_id]))
   and (select count(*)=1 from public.get_own_planner_archived_editions(array[foreign_id])),
   'second user resolves only their own archived binding');
 execute 'reset role';
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true); perform set_config('request.jwt.claim.sub','',true);
 execute 'set local role authenticated';
 perform pg_temp.oa_reject(format('select public.get_own_planner_archived_editions(array[%L::uuid])',own_id),
   'authenticated SQL role without authenticated identity cannot read','42501');
 execute 'reset role';
 perform set_config('request.jwt.claims','{"role":"anon"}',true); execute 'set local role anon';
 perform pg_temp.oa_reject(format('select public.get_own_planner_archived_editions(array[%L::uuid])',own_id),'anon RPC execution is denied','42501');
 execute 'reset role';
end $tests$;
select 'OWN_ARCHIVE_ASSERTIONS='||count(*) from own_archive_checks;
rollback;
