-- Align only the missing event-detail foundation on drifted production schemas.
-- Reuses 20260824 fields/constraints and appends public aliases to the current
-- projection: do not replay or mark the historical migration as applied.
-- Existing field order, lifecycle filtering, grants, evidence and facts survive.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;

alter table public.events
  add column if not exists organizer_url text;

alter table public.events
  drop constraint if exists events_organizer_url_check;

alter table public.events
  add constraint events_organizer_url_check
  check (organizer_url is null or organizer_url ~* '^https?://[^[:space:]]+$')
  not valid;

alter table public.events validate constraint events_organizer_url_check;

-- The legacy Event Knowledge tables predate the stable event/edition model.
-- New knowledge records can now declare their scope and link to the canonical
-- parent while existing unlinked records remain readable for a small follow-up
-- content migration.
alter table public.event_details
  add column if not exists event_brand_id bigint references public.events(id) on delete cascade,
  add column if not exists edition_id uuid references public.event_editions(id) on delete cascade,
  add column if not exists knowledge_scope text;

update public.event_details
set knowledge_scope = 'legacy_mixed'
where knowledge_scope is null;

alter table public.event_details
  alter column knowledge_scope set default 'edition',
  alter column knowledge_scope set not null;

alter table public.event_details
  drop constraint if exists event_details_knowledge_scope_check,
  drop constraint if exists event_details_scope_reference_check;

alter table public.event_details
  add constraint event_details_knowledge_scope_check
    check (knowledge_scope in ('brand', 'edition', 'legacy_mixed')),
  add constraint event_details_scope_reference_check
    check (
      (knowledge_scope = 'brand' and edition_id is null)
      or (
        knowledge_scope = 'edition'
        and (
          (event_brand_id is null and edition_id is null)
          or (event_brand_id is not null and edition_id is not null)
        )
      )
      or (
        knowledge_scope = 'legacy_mixed'
        and event_brand_id is null
        and edition_id is null
      )
    );

create index if not exists event_details_brand_scope_idx
  on public.event_details(event_brand_id, knowledge_scope);

create index if not exists event_details_edition_idx
  on public.event_details(edition_id)
  where edition_id is not null;

create or replace function private.enforce_event_detail_scope_parent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.edition_id is not null and not exists (
    select 1
    from public.event_editions edition
    where edition.id = new.edition_id
      and edition.event_id = new.event_brand_id
  ) then
    raise exception 'event detail edition must belong to event brand %', new.event_brand_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_event_detail_scope_parent()
from public, anon, authenticated;

drop trigger if exists event_details_scope_parent_check on public.event_details;
create trigger event_details_scope_parent_check
before insert or update of event_brand_id, edition_id, knowledge_scope
on public.event_details
for each row execute function private.enforce_event_detail_scope_parent();

comment on column public.events.organizer_name is
  'Stable event-brand organizer: the organization officially responsible for staging the event; never a data source or calendar aggregator.';
comment on column public.events.organizer_url is
  'Verified official website of the organizer organization, distinct from the event and registration URLs.';
comment on column public.events.last_verified_at is
  'Time stable event-brand facts were last checked against a real public source; never a build, export or row-update timestamp.';
comment on column public.event_editions.last_verified_at is
  'Time facts for this exact edition were last checked against a real public source; preferred Last checked value on an edition detail page.';
comment on column public.event_sources.last_fetched_at is
  'Technical source-monitor fetch time. It does not mean the event, edition or every displayed field was verified.';
comment on column public.event_details.knowledge_scope is
  'Whether the entire knowledge record describes the reusable event brand or one exact edition. legacy_mixed marks only pre-foundation rows awaiting reviewed separation.';
comment on column public.event_details.event_brand_id is
  'Canonical event-brand parent for new knowledge records. Null is retained only for legacy records awaiting a small reviewed backfill.';
comment on column public.event_details.edition_id is
  'Exact edition parent for edition-scoped knowledge. Brand-scoped knowledge must leave this null.';
comment on column public.event_details.organizer is
  'Legacy organizer copy. Public detail pages use events.organizer_name; retain only until linked legacy knowledge is reviewed.';
comment on column public.event_details.last_checked is
  'Legacy knowledge verification date. It is not a source fetch, build or export timestamp.';


do $detail_contract$
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
  additions text;
  added_names text[];
  expected record;
  mismatched boolean;
begin
  foreach target_name in array array['public_event_discovery', 'public_event_archive'] loop
    select c.oid, c.relowner, c.relacl, c.reloptions into target_oid, before_owner, before_acl, before_options
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=target_name and c.relkind='v';
    if target_oid is null or not coalesce('security_invoker=true'=any(before_options),false) then
      raise exception 'Detail contract requires an existing security-invoker view: %', target_name;
    end if;
    if not exists(select 1 from pg_attribute where attrelid=target_oid and attname='event_id' and atttypid='bigint'::regtype and attnum>0 and not attisdropped)
       or not exists(select 1 from pg_attribute where attrelid=target_oid and attname='edition_id' and atttypid='uuid'::regtype and attnum>0 and not attisdropped) then
      raise exception 'Detail contract requires exact event and edition identities: %', target_name;
    end if;
    additions := '';
    added_names := '{}'::text[];
    for expected in select * from (values
      ('organizer_name','text','event.organizer_name'),
      ('organizer_url','text','event.organizer_url'),
      ('official_url','text','event.official_url'),
      ('registration_url','text','edition.registration_url'),
      ('brand_verification_status','text','event.verification_status'),
      ('brand_last_verified_at','timestamp with time zone','event.last_verified_at'),
      ('edition_verification_status','text','edition.verification_status'),
      ('edition_last_verified_at','timestamp with time zone','edition.last_verified_at')
    ) fields(name,type_name,expression) loop
      if exists(select 1 from pg_attribute where attrelid=target_oid and attname=expected.name and attnum>0 and not attisdropped) then
        if not exists(select 1 from pg_attribute where attrelid=target_oid and attname=expected.name
          and atttypid=expected.type_name::regtype and attnum>0 and not attisdropped) then
          raise exception 'Unexpected detail projection type: %.%',target_name,expected.name;
        end if;
      else
        additions := additions || format(', %s as %I',expected.expression,expected.name);
        added_names := array_append(added_names,expected.name);
      end if;
    end loop;
    if additions <> '' then
      select jsonb_agg(jsonb_build_array(attname,atttypid,atttypmod,attnum) order by attnum) into before_columns
        from pg_attribute where attrelid=target_oid and attnum>0 and not attisdropped;
      execute format('select coalesce(jsonb_agg(to_jsonb(v) order by v.edition_id), ''[]''::jsonb) from public.%I v',target_name) into before_rows;
      definition := rtrim(pg_get_viewdef(target_oid,true),E';\n\r ');
      execute format('create or replace view public.%I with (security_invoker=true) as
        select current_projection.* %s from (%s) current_projection
        join public.events event on event.id=current_projection.event_id
        join public.event_editions edition on edition.id=current_projection.edition_id and edition.event_id=event.id',
        target_name,additions,definition);
      execute format('select coalesce(jsonb_agg(to_jsonb(v) - $1 order by v.edition_id), ''[]''::jsonb) from public.%I v',target_name)
        into after_rows using added_names;
      if before_rows is distinct from after_rows then
        raise exception 'Detail contract changed an existing public row or fact: %',target_name;
      end if;
      if before_columns is distinct from (select jsonb_agg(jsonb_build_array(attname,atttypid,atttypmod,attnum) order by attnum)
        from pg_attribute where attrelid=target_oid and attnum>0 and not attisdropped and not attname=any(added_names)) then
        raise exception 'Detail contract changed the existing column layout: %',target_name;
      end if;
    end if;
    if not exists(select 1 from pg_class c where c.oid=target_oid and c.relowner=before_owner
      and c.relacl is not distinct from before_acl and c.reloptions is not distinct from before_options) then
      raise exception 'Detail contract changed view identity or access controls: %',target_name;
    end if;
    -- Also validate an already-aligned projection rather than silently accepting
    -- aliases that point at the wrong brand or edition's verification metadata.
    execute format('select exists(select 1 from public.%I v
      left join public.events event on event.id=v.event_id
      left join public.event_editions edition on edition.id=v.edition_id and edition.event_id=event.id
      where event.id is null or edition.id is null or
        row(v.organizer_name,v.organizer_url,v.official_url,v.registration_url,
          v.brand_verification_status,v.brand_last_verified_at,
          v.edition_verification_status,v.edition_last_verified_at)
        is distinct from row(event.organizer_name,event.organizer_url,event.official_url,
          edition.registration_url,event.verification_status,event.last_verified_at,
          edition.verification_status,edition.last_verified_at))', target_name) into mismatched;
    if mismatched then
      raise exception 'Detail projection aliases must match their exact canonical parent: %',target_name;
    end if;
  end loop;
end;
$detail_contract$;

notify pgrst, 'reload schema';
commit;
