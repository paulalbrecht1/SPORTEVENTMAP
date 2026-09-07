-- Add an evidence-backed completion path for generated freshness reviews.
--
-- A successful crawl only proves technical reachability. This RPC therefore
-- requires an admin to compare all central fields with an official source and
-- submit structured evidence from the last 24 hours. It updates verification
-- metadata on the selected edition only; event and edition facts remain
-- unchanged.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Persist the exact official source used for the last structured verification.
-- Existing rows remain NULL and therefore fail closed until reviewed through
-- the new evidence path.
alter table public.event_editions
  add column if not exists last_verified_source_id uuid
  references public.event_sources(id) on delete set null;

create index if not exists event_editions_last_verified_source_idx
  on public.event_editions(last_verified_source_id)
  where last_verified_source_id is not null;

create index if not exists event_audit_log_freshness_attestation_idx
  on public.event_audit_log(entity_id, created_at desc, id desc)
  where entity_type = 'edition'
    and field_name = '__freshness_verification__';

comment on column public.event_editions.last_verified_source_id is
  'Exact official event source used by the latest structured freshness verification; NULL is not export-fresh.';

-- Review signals arrive through user-facing text identifiers, while the event
-- tables use bigint ids. Parse them once and fail closed for malformed or
-- out-of-range values so every blocker check uses the same identity semantics.
create or replace function private.try_parse_bigint(value text)
returns bigint
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
begin
  if value !~ '^[0-9]+$' then
    return null;
  end if;
  return value::bigint;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end;
$$;

revoke all on function private.try_parse_bigint(text)
  from public, anon, authenticated;
grant execute on function private.try_parse_bigint(text) to authenticated;

-- Audit JSON stores timestamptz values as strings. Compare parsed instants
-- instead of their session-TimeZone-dependent JSON renderings.
create or replace function private.try_parse_timestamptz(value text)
returns timestamptz
language plpgsql
stable
strict
set search_path = pg_catalog
as $$
begin
  return value::timestamptz;
exception
  when invalid_datetime_format or datetime_field_overflow then
    return null;
end;
$$;

revoke all on function private.try_parse_timestamptz(text)
  from public, anon, authenticated;

-- Any new blocking signal must invalidate a previously fresh Discovery edition.
-- The row lock also closes the race with the verifier: either the blocker is
-- visible before verification, or this update waits and invalidates immediately
-- after the verification transaction commits.
create or replace function private.invalidate_current_edition_freshness(
  p_event_id bigint,
  p_edition_id uuid,
  p_priority text default 'high'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  target_id uuid;
  previous_change_source text := current_setting('app.change_source', true);
  previous_change_reason text := current_setting('app.change_reason', true);
  effective_priority text := case
    when p_priority in ('low', 'medium', 'high') then p_priority
    when p_priority = 'critical' then 'high'
    else 'high'
  end;
begin
  if p_event_id is null then
    return;
  end if;

  -- Keep the global mutation order source -> event -> edition. Source Monitor
  -- calls this helper from an event_sources trigger while already holding the
  -- source row, and the verifier uses the same order for batch locks.
  perform 1
  from public.events event
  where event.id = p_event_id
  for update of event;

  for target_id in
    select edition.id
    from public.event_editions edition
    where edition.event_id = p_event_id
      and (p_edition_id is null or edition.id = p_edition_id)
      and edition.publication_status = 'published'
      and edition.discovery_status = 'active'
      and edition.edition_status not in ('cancelled', 'inactive', 'completed')
      and (
        coalesce(edition.end_date, edition.start_date) is null
        or coalesce(edition.end_date, edition.start_date) >= current_date
      )
    order by edition.id
    for update
  loop
    perform set_config('app.change_source', 'system', true);
    perform set_config(
      'app.change_reason',
      'A new blocking review signal invalidated edition freshness.',
      true
    );

    update public.event_editions edition
    set verification_status = 'needs_review',
        needs_review = true,
        last_verified_source_id = null,
        review_priority = case
          when edition.review_priority = 'high' or effective_priority = 'high' then 'high'
          when edition.review_priority = 'medium' or effective_priority = 'medium' then 'medium'
          else 'low'
        end,
        next_check_at = least(coalesce(edition.next_check_at, now()), now()),
        updated_at = now()
    where edition.id = target_id
      and (
        edition.verification_status is distinct from 'needs_review'
        or edition.needs_review is distinct from true
        or edition.next_check_at is null
        or edition.next_check_at > now()
        or case edition.review_priority
          when 'high' then 3 when 'medium' then 2 else 1
        end < case effective_priority
          when 'high' then 3 when 'medium' then 2 else 1
        end
      );

    perform set_config('app.change_source', coalesce(previous_change_source, ''), true);
    perform set_config('app.change_reason', coalesce(previous_change_reason, ''), true);
  end loop;
end;
$$;

revoke all on function private.invalidate_current_edition_freshness(
  bigint, uuid, text
) from public, anon, authenticated;

create or replace function private.invalidate_freshness_from_review_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  should_invalidate boolean := false;
  target_event_id bigint;
  target_edition_id uuid;
  target_source_id uuid;
  target_priority text := 'high';
  source_attestation record;
begin
  case tg_table_name
    when 'event_change_proposals' then
      should_invalidate := new.proposal_status = 'pending';
      if tg_op = 'UPDATE' then
        should_invalidate := should_invalidate and (
          old.proposal_status is distinct from 'pending'
          or old.event_id is distinct from new.event_id
          or old.edition_id is distinct from new.edition_id
          or old.source_id is distinct from new.source_id
          or (to_jsonb(old)->>'priority') is distinct from (to_jsonb(new)->>'priority')
        );
      end if;
      target_event_id := new.event_id;
      target_edition_id := new.edition_id;
      target_source_id := new.source_id;
      target_priority := coalesce(to_jsonb(new)->>'priority', 'high');
    when 'source_review_tasks' then
      should_invalidate := new.status = 'open';
      if tg_op = 'UPDATE' then
        should_invalidate := should_invalidate and (
          old.status is distinct from 'open'
          or old.event_id is distinct from new.event_id
          or old.edition_id is distinct from new.edition_id
          or old.source_id is distinct from new.source_id
          or old.priority is distinct from new.priority
        );
      end if;
      target_event_id := new.event_id;
      target_edition_id := new.edition_id;
      target_source_id := new.source_id;
      target_priority := coalesce(new.priority, 'high');
    when 'validation_issues' then
      should_invalidate := new.status = 'open'
        and new.severity in ('error', 'critical');
      if tg_op = 'UPDATE' then
        should_invalidate := should_invalidate and (
          old.status is distinct from 'open'
          or old.severity is distinct from new.severity
          or old.event_id is distinct from new.event_id
          or old.edition_id is distinct from new.edition_id
        );
      end if;
      target_event_id := new.event_id;
      target_edition_id := new.edition_id;
      target_source_id := null;
      target_priority := case when new.severity = 'critical' then 'critical' else 'high' end;
    when 'data_workflow_alerts' then
      should_invalidate := new.alert_status = 'open'
        and new.severity in ('error', 'critical');
      if tg_op = 'UPDATE' then
        should_invalidate := should_invalidate and (
          old.alert_status is distinct from 'open'
          or old.severity is distinct from new.severity
          or old.event_id is distinct from new.event_id
          or old.edition_id is distinct from new.edition_id
          or old.source_id is distinct from new.source_id
        );
      end if;
      target_event_id := new.event_id;
      target_edition_id := new.edition_id;
      target_source_id := new.source_id;
      target_priority := case when new.severity = 'critical' then 'critical' else 'high' end;
    when 'user_feedback' then
      should_invalidate := new.category = 'incorrect_event_data'
        -- Anonymous clients may submit status=new feedback. Only an admin-
        -- moderated signal may invoke this privileged invalidation path.
        and new.status in ('reviewed', 'planned')
        and private.try_parse_bigint(new.event_id) is not null;
      if tg_op = 'UPDATE' then
        should_invalidate := should_invalidate and (
          old.status is distinct from new.status
          or old.category is distinct from new.category
          or old.event_id is distinct from new.event_id
        );
      end if;
      target_event_id := private.try_parse_bigint(new.event_id);
      target_edition_id := null;
      target_source_id := null;
      target_priority := 'high';
    else
      raise exception 'unsupported freshness review signal table: %', tg_table_name;
  end case;

  if should_invalidate then
    perform private.invalidate_current_edition_freshness(
      target_event_id,
      target_edition_id,
      target_priority
    );

    -- A source-scoped blocker also invalidates whichever current edition was
    -- actually attested with that source, even when the signal carries a
    -- historical sibling edition id.
    if target_source_id is not null then
      for source_attestation in
        select edition.event_id, edition.id
        from public.event_editions edition
        where edition.last_verified_source_id = target_source_id
        order by edition.event_id, edition.id
      loop
        perform private.invalidate_current_edition_freshness(
          source_attestation.event_id,
          source_attestation.id,
          target_priority
        );
      end loop;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.invalidate_freshness_from_review_signal()
  from public, anon, authenticated;

drop trigger if exists event_change_proposals_invalidate_freshness
  on public.event_change_proposals;
create trigger event_change_proposals_invalidate_freshness
after insert or update
on public.event_change_proposals
for each row execute function private.invalidate_freshness_from_review_signal();

drop trigger if exists source_review_tasks_invalidate_freshness
  on public.source_review_tasks;
create trigger source_review_tasks_invalidate_freshness
after insert or update of status, event_id, edition_id, source_id, priority
on public.source_review_tasks
for each row execute function private.invalidate_freshness_from_review_signal();

drop trigger if exists validation_issues_invalidate_freshness
  on public.validation_issues;
create trigger validation_issues_invalidate_freshness
after insert or update of status, severity, event_id, edition_id
on public.validation_issues
for each row execute function private.invalidate_freshness_from_review_signal();

drop trigger if exists data_workflow_alerts_invalidate_freshness
  on public.data_workflow_alerts;
create trigger data_workflow_alerts_invalidate_freshness
after insert or update of alert_status, severity, event_id, edition_id, source_id
on public.data_workflow_alerts
for each row execute function private.invalidate_freshness_from_review_signal();

drop trigger if exists user_feedback_invalidate_freshness
  on public.user_feedback;
create trigger user_feedback_invalidate_freshness
after insert or update of status, category, event_id on public.user_feedback
for each row execute function private.invalidate_freshness_from_review_signal();

-- Direct fact edits must invalidate the evidence that was collected for the
-- previous values. Event updates already hold the parent lock, so the helper
-- can continue in the shared event -> edition order.
create or replace function private.invalidate_freshness_from_event_fact_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.event_name is distinct from new.event_name
     or old.canonical_name is distinct from new.canonical_name
     or old.city is distinct from new.city
     or old.country is distinct from new.country
     or old.address is distinct from new.address
     or old.latitude is distinct from new.latitude
     or old.longitude is distinct from new.longitude
     or old.sport is distinct from new.sport
     or old.distance is distinct from new.distance
     or old.description is distinct from new.description
     or old.status is distinct from new.status
     or old.publication_status is distinct from new.publication_status
     or old.event_status is distinct from new.event_status then
    perform private.invalidate_current_edition_freshness(new.id, null, 'high');
  end if;
  return new;
end;
$$;

revoke all on function private.invalidate_freshness_from_event_fact_change()
  from public, anon, authenticated;

drop trigger if exists events_invalidate_freshness_on_fact_change
  on public.events;
create trigger events_invalidate_freshness_on_fact_change
after update of event_name, canonical_name, city, country, address, latitude,
  longitude, sport, distance, description, status, publication_status, event_status
on public.events
for each row execute function private.invalidate_freshness_from_event_fact_change();

-- An edition UPDATE already owns its row before an AFTER trigger could lock the
-- parent event. Mutate only NEW in a BEFORE trigger to avoid reversing the
-- source/event/edition lock order while still making the fact change atomic.
create or replace function private.invalidate_edition_freshness_on_fact_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'INSERT' then
    new.verification_status := 'needs_review';
    new.needs_review := true;
    new.last_verified_source_id := null;
    new.review_priority := 'high';
    new.next_check_at := least(coalesce(new.next_check_at, now()), now());
    return new;
  end if;

  if old.event_id is distinct from new.event_id
     or old.edition_year is distinct from new.edition_year
     or old.start_date is distinct from new.start_date
     or old.end_date is distinct from new.end_date
     or old.race_formats is distinct from new.race_formats
     or old.legacy_distance is distinct from new.legacy_distance
     or old.registration_status is distinct from new.registration_status
     or old.registration_url is distinct from new.registration_url
     or old.source_url is distinct from new.source_url
     or old.edition_status is distinct from new.edition_status
     or old.publication_status is distinct from new.publication_status
     or old.discovery_status is distinct from new.discovery_status
     or (
       old.next_check_at is distinct from new.next_check_at
       and coalesce(current_setting('app.freshness_verification', true), '') <> 'active'
     ) then
    new.verification_status := 'needs_review';
    new.needs_review := true;
    new.last_verified_source_id := null;
    new.review_priority := 'high';
    new.next_check_at := least(coalesce(new.next_check_at, now()), now());
  end if;
  return new;
end;
$$;

revoke all on function private.invalidate_edition_freshness_on_fact_change()
  from public, anon, authenticated;

drop trigger if exists event_editions_initialize_freshness
  on public.event_editions;
create trigger event_editions_initialize_freshness
before insert on public.event_editions
for each row execute function private.invalidate_edition_freshness_on_fact_change();

drop trigger if exists event_editions_invalidate_freshness_on_fact_change
  on public.event_editions;
create trigger event_editions_invalidate_freshness_on_fact_change
before update of event_id, edition_year, start_date, end_date, race_formats,
  legacy_distance, registration_status, registration_url, source_url,
  edition_status, publication_status, discovery_status, next_check_at
on public.event_editions
for each row execute function private.invalidate_edition_freshness_on_fact_change();

create or replace function private.invalidate_freshness_from_source_health()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  old_was_eligible boolean;
  new_is_eligible boolean;
begin
  old_was_eligible := old.is_active is true
    and old.source_type = 'official_event_website'
    and old.source_url ~* '^https://[^[:space:]]+$'
    and coalesce(old.crawl_status, '') in ('success', 'not_modified')
    and old.consecutive_failures = 0
    and old.last_fetched_at is not null
    and coalesce(old.last_change_status, '') in ('unchanged', 'first_seen');

  if tg_op = 'DELETE' then
    if old_was_eligible then
      perform private.invalidate_current_edition_freshness(
        old.event_id,
        old.edition_id,
        'high'
      );
    end if;
    return old;
  end if;

  new_is_eligible := new.is_active is true
    and new.source_type = 'official_event_website'
    and new.source_url ~* '^https://[^[:space:]]+$'
    and coalesce(new.crawl_status, '') in ('success', 'not_modified')
    and new.consecutive_failures = 0
    and new.last_fetched_at is not null
    and coalesce(new.last_change_status, '') in ('unchanged', 'first_seen');

  if old_was_eligible and (
    not new_is_eligible
    or old.event_id is distinct from new.event_id
    or old.edition_id is distinct from new.edition_id
    or old.source_url is distinct from new.source_url
  ) then
    perform private.invalidate_current_edition_freshness(
      old.event_id,
      old.edition_id,
      'high'
    );
  end if;

  if new.source_type = 'official_event_website'
     and coalesce(new.last_change_status, '') in ('changed', 'unreachable', 'content_invalid')
     and old.last_change_status is distinct from new.last_change_status then
    perform private.invalidate_current_edition_freshness(
      new.event_id,
      new.edition_id,
      'high'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.invalidate_freshness_from_source_health()
  from public, anon, authenticated;

drop trigger if exists event_sources_invalidate_freshness
  on public.event_sources;
create trigger event_sources_invalidate_freshness
before delete or update of event_id, edition_id, source_type, source_url, is_active,
  crawl_status, consecutive_failures, last_fetched_at, last_change_status
on public.event_sources
for each row execute function private.invalidate_freshness_from_source_health();

-- The legacy proposal reviewer can mutate an edition before validation creates
-- a blocking issue. Wrap it so every accepted proposal follows the same
-- event -> edition order as freshness verification and invalidation. Keeping
-- the original implementation private avoids duplicating its review policy.
-- Some linked environments intentionally omit the optional proposal-review
-- RPC; only harden it where that exact capability is installed.
do $proposal_lock_hardening$
begin
  if to_regprocedure(
    'public.review_event_change_proposal(uuid,text,text,jsonb,text)'
  ) is null or to_regprocedure(
    'private.review_event_change_proposal_without_parent_lock(uuid,text,text,jsonb,text)'
  ) is not null then
    return;
  end if;

  execute 'alter function public.review_event_change_proposal(uuid, text, text, jsonb, text)
    rename to review_event_change_proposal_without_parent_lock';
  execute 'alter function public.review_event_change_proposal_without_parent_lock(uuid, text, text, jsonb, text)
    set schema private';
  execute 'revoke all on function private.review_event_change_proposal_without_parent_lock(uuid, text, text, jsonb, text)
    from public, anon, authenticated';

  execute $proposal_wrapper_ddl$
    create or replace function public.review_event_change_proposal(
      p_proposal_id uuid,
      p_action text,
      p_review_notes text default null,
      p_edited_value jsonb default null,
      p_rejection_reason text default null
    )
    returns public.event_change_proposals
    language plpgsql
    security definer
    set search_path = pg_catalog, public, private
    set lock_timeout = '5s'
    as $proposal_wrapper_body$
    declare
      target_event_id bigint;
    begin
      if not (select private.is_admin()) then
        raise exception 'admin role required' using errcode = '42501';
      end if;

      select proposal.event_id
        into target_event_id
      from public.event_change_proposals proposal
      where proposal.id = p_proposal_id
        and proposal.proposal_status = 'pending'
      for update of proposal;

      if target_event_id is null then
        raise exception 'pending proposal not found' using errcode = 'P0002';
      end if;

      perform 1
      from public.events event
      where event.id = target_event_id
      for update of event;

      if not found then
        raise exception 'proposal parent event not found' using errcode = 'P0002';
      end if;

      return private.review_event_change_proposal_without_parent_lock(
        p_proposal_id,
        p_action,
        p_review_notes,
        p_edited_value,
        p_rejection_reason
      );
    end;
    $proposal_wrapper_body$;
  $proposal_wrapper_ddl$;

  execute 'revoke all on function public.review_event_change_proposal(uuid, text, text, jsonb, text)
    from public, anon, authenticated';
  execute 'grant execute on function public.review_event_change_proposal(uuid, text, text, jsonb, text)
    to authenticated';

  -- Recreate the convenience wrapper so its dependency points at the hardened
  -- public reviewer instead of the renamed legacy function OID.
  execute $apply_wrapper_ddl$
    create or replace function public.apply_event_change_proposal(
      p_proposal_id uuid,
      p_review_notes text default null
    )
    returns public.event_change_proposals
    language sql
    security invoker
    set search_path = pg_catalog, public, private
    as $apply_wrapper_body$
      select public.review_event_change_proposal(
        p_proposal_id,
        'accepted',
        p_review_notes,
        null,
        null
      );
    $apply_wrapper_body$;
  $apply_wrapper_ddl$;

  execute 'revoke all on function public.apply_event_change_proposal(uuid, text)
    from public, anon, authenticated';
  execute 'grant execute on function public.apply_event_change_proposal(uuid, text)
    to authenticated';
end;
$proposal_lock_hardening$;

create or replace function public.verify_freshness_review_editions(
  p_edition_ids uuid[],
  p_notes text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
set lock_timeout = '5s'
as $$
declare
  requested_count integer := 0;
  locked_source_count integer := 0;
  locked_event_count integer := 0;
  locked_edition_count integer := 0;
  eligible_count integer := 0;
  verified_count integer := 0;
  updated_count integer := 0;
  selected_edition_id uuid;
  selected_source_id uuid;
  source_ids uuid[] := '{}'::uuid[];
  event_ids bigint[] := '{}'::bigint[];
  verified_edition_ids uuid[] := '{}'::uuid[];
  evidence_record jsonb;
  review_record record;
  stored_values jsonb;
  old_verification_state jsonb;
  new_verification_state jsonb;
  observed_values jsonb;
  confirmed_fields text[];
  uncertain_fields text[];
  required_fields constant text[] := array[
    'event_name', 'edition_year', 'date', 'city', 'country', 'address',
    'latitude', 'longitude', 'sport', 'distances', 'description',
    'registration_status', 'official_event_page', 'registration_link'
  ]::text[];
  checked_at timestamptz;
  evidence_confidence numeric;
  next_check_value timestamptz;
  reviewer_id uuid := (select auth.uid());
  effective_review_notes text := nullif(btrim(p_notes), '');
  previous_change_source text := current_setting('app.change_source', true);
  previous_change_reason text := current_setting('app.change_reason', true);
  previous_source_url text := current_setting('app.source_url', true);
  previous_freshness_verification text := current_setting('app.freshness_verification', true);
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  if effective_review_notes is null or length(effective_review_notes) < 12 then
    raise exception 'review notes with at least 12 characters are required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_evidence) is distinct from 'object' then
    raise exception 'structured evidence must be a JSON object keyed by edition id'
      using errcode = '22023';
  end if;

  if array_position(coalesce(p_edition_ids, '{}'::uuid[]), null) is not null then
    raise exception 'edition ids must not contain null values' using errcode = '22023';
  end if;

  select count(*) into requested_count
  from (
    select distinct requested.id
    from unnest(coalesce(p_edition_ids, '{}'::uuid[])) requested(id)
  ) unique_ids;

  if requested_count = 0 then
    raise exception 'at least one edition id is required' using errcode = '22023';
  end if;
  if requested_count > 25 then
    raise exception 'a maximum of 25 freshness reviews can be verified at once'
      using errcode = '22023';
  end if;

  -- Validate the evidence envelope before acquiring row locks. The browser has
  -- already completed the external inspection; no network work happens inside
  -- this transaction.
  for selected_edition_id in
    select distinct requested.id
    from unnest(p_edition_ids) requested(id)
    order by requested.id
  loop
    evidence_record := p_evidence -> (selected_edition_id::text);
    if evidence_record is null
       or jsonb_typeof(evidence_record) is distinct from 'object' then
      raise exception 'structured evidence is missing for edition %', selected_edition_id
        using errcode = '22023';
    end if;

    if coalesce(evidence_record->>'source_id', '') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'a valid official source id is required for edition %', selected_edition_id
        using errcode = '22023';
    end if;
    selected_source_id := (evidence_record->>'source_id')::uuid;
    if not (selected_source_id = any(source_ids)) then
      source_ids := array_append(source_ids, selected_source_id);
    end if;
  end loop;

  -- The Source Monitor finalizes work in source -> event -> edition order. Use
  -- the same order and stable IDs to avoid deadlocks and prevent source drift
  -- between validation and the metadata update.
  perform 1
  from public.event_sources source
  where source.id = any(source_ids)
  order by source.id
  for update of source;
  get diagnostics locked_source_count = row_count;

  if locked_source_count <> cardinality(source_ids) then
    raise exception 'one or more evidence sources no longer exist' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.source_crawl_jobs job
    where job.source_id = any(source_ids)
      and job.status in ('queued', 'processing', 'retry_scheduled')
  ) then
    raise exception 'a selected source has an active crawl job; retry after it completes'
      using errcode = '55000';
  end if;

  select coalesce(array_agg(candidate.event_id order by candidate.event_id), '{}'::bigint[])
    into event_ids
  from (
    select distinct edition.event_id
    from public.event_editions edition
    where edition.id = any(p_edition_ids)
  ) candidate;

  perform 1
  from public.events event
  where event.id = any(event_ids)
  order by event.id
  for update of event;
  get diagnostics locked_event_count = row_count;

  if locked_event_count <> cardinality(event_ids) then
    raise exception 'one or more parent events no longer exist' using errcode = 'P0001';
  end if;

  perform 1
  from public.event_editions edition
  where edition.id = any(p_edition_ids)
  order by edition.event_id, edition.id
  for update of edition;
  get diagnostics locked_edition_count = row_count;

  if locked_edition_count <> requested_count then
    raise exception 'one or more requested editions no longer exist' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.event_editions edition
    where edition.id = any(p_edition_ids)
      and not (edition.event_id = any(event_ids))
  ) then
    raise exception 'an edition parent changed concurrently; retry the review'
      using errcode = '40001';
  end if;

  for review_record in
    select
      event.id as event_id,
      event.status as event_submission_status,
      event.publication_status as event_publication_status,
      event.event_status as event_lifecycle_status,
      event.canonical_name,
      event.event_name,
      event.city,
      event.country,
      event.address,
      event.sport,
      event.description,
      event.latitude,
      event.longitude,
      event.distance,
      edition.id as edition_id,
      edition.edition_year,
      edition.start_date,
      edition.end_date,
      edition.registration_url,
      edition.registration_status,
      edition.source_url as edition_source_url,
      edition.edition_status,
      edition.publication_status as edition_publication_status,
      edition.discovery_status,
      edition.race_formats,
      edition.legacy_distance,
      edition.verification_status,
      edition.data_confidence,
      edition.needs_review,
      edition.review_priority,
      edition.last_verified_at,
      edition.next_check_at,
      edition.last_verified_source_id,
      source.id as source_id,
      source.event_id as source_event_id,
      source.edition_id as source_edition_id,
      source.source_type,
      source.source_url,
      source.is_active as source_is_active,
      source.last_fetched_at as source_last_fetched_at,
      source.crawl_status,
      source.consecutive_failures,
      source.last_change_status
    from public.event_editions edition
    join public.events event on event.id = edition.event_id
    join public.event_sources source
      on source.id = ((p_evidence -> (edition.id::text)) ->> 'source_id')::uuid
    where edition.id = any(p_edition_ids)
    order by event.id, edition.id
  loop
    evidence_record := p_evidence -> (review_record.edition_id::text);

    if review_record.event_submission_status is distinct from 'approved'
       or review_record.event_publication_status is distinct from 'published'
       or review_record.event_lifecycle_status is distinct from 'active'
       or review_record.edition_publication_status is distinct from 'published'
       or review_record.discovery_status is distinct from 'active'
       or review_record.edition_status is null
       or review_record.edition_status in ('cancelled', 'inactive', 'completed')
       or coalesce(review_record.end_date, review_record.start_date) < current_date
       or not exists (
         select 1
         from public.public_event_discovery discovery
         where discovery.edition_id = review_record.edition_id
       ) then
      raise exception 'edition % is not the current published Discovery edition', review_record.edition_id
        using errcode = 'P0001';
    end if;

    if review_record.verification_status = 'verified'
       and review_record.needs_review is false
       and review_record.last_verified_at is not null
       and review_record.next_check_at > now()
       and review_record.last_verified_source_id is not null then
      raise exception 'edition % is already fresh', review_record.edition_id
        using errcode = 'P0001';
    end if;

    if review_record.source_event_id is distinct from review_record.event_id
       or (
         review_record.source_edition_id is not null
         and review_record.source_edition_id <> review_record.edition_id
       )
       or review_record.source_is_active is not true
       or review_record.source_type is distinct from 'official_event_website'
       or review_record.edition_source_url is distinct from review_record.source_url
       or coalesce(review_record.source_url, '') !~* '^https://[^[:space:]]+$'
       or coalesce(review_record.crawl_status, '') not in ('success', 'not_modified')
       or coalesce(review_record.consecutive_failures, -1) <> 0
       or review_record.source_last_fetched_at is null
       or coalesce(review_record.last_change_status, '') not in ('unchanged', 'first_seen') then
      raise exception 'edition % has no stable healthy official source eligible for freshness verification', review_record.edition_id
        using errcode = 'P0001';
    end if;

    if nullif(btrim(coalesce(review_record.canonical_name, review_record.event_name)), '') is null
       or review_record.edition_year is null
       or review_record.start_date is null
       or nullif(btrim(review_record.city), '') is null
       or nullif(btrim(review_record.country), '') is null
       or nullif(btrim(review_record.address), '') is null
       or nullif(btrim(review_record.sport), '') is null
       or length(btrim(coalesce(review_record.description, ''))) < 80
       or private.try_parse_coordinate(review_record.latitude) is null
       or private.try_parse_coordinate(review_record.longitude) is null
       or private.try_parse_coordinate(review_record.latitude) not between -90 and 90
       or private.try_parse_coordinate(review_record.longitude) not between -180 and 180
       or (
         nullif(btrim(coalesce(review_record.legacy_distance, review_record.distance)), '') is null
         and not (
           jsonb_typeof(coalesce(review_record.race_formats, '[]'::jsonb)) = 'array'
           and jsonb_array_length(coalesce(review_record.race_formats, '[]'::jsonb)) > 0
         )
       )
       or nullif(btrim(review_record.registration_url), '') is null then
      raise exception 'edition % has incomplete central fields and must remain in review', review_record.edition_id
        using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.source_review_tasks task
       where task.status = 'open'
         and (
           task.source_id = review_record.source_id
           or task.edition_id = review_record.edition_id
           or (
             task.edition_id is null
             and task.event_id = review_record.event_id
           )
         )
    ) or exists (
      select 1
      from public.event_change_proposals proposal
       where proposal.proposal_status = 'pending'
         and (
           proposal.source_id = review_record.source_id
           or proposal.edition_id = review_record.edition_id
           or (
             proposal.edition_id is null
             and proposal.event_id = review_record.event_id
           )
         )
    ) or exists (
      select 1
      from public.validation_issues issue
      where issue.status = 'open'
         and issue.severity in ('error', 'critical')
         and (
           issue.edition_id = review_record.edition_id
           or (
             issue.edition_id is null
             and issue.event_id = review_record.event_id
           )
         )
    ) or exists (
      select 1
      from public.data_workflow_alerts alert
      where alert.alert_status = 'open'
         and alert.severity in ('error', 'critical')
         and (
           alert.source_id = review_record.source_id
           or alert.edition_id = review_record.edition_id
           or (
             alert.edition_id is null
             and alert.event_id = review_record.event_id
           )
         )
    ) or exists (
      select 1
       from public.user_feedback feedback
       where feedback.category = 'incorrect_event_data'
         and feedback.status in ('reviewed', 'planned')
         and private.try_parse_bigint(feedback.event_id) = review_record.event_id
    ) then
      raise exception 'edition % has an open conflicting review item', review_record.edition_id
        using errcode = 'P0001';
    end if;

    if coalesce(evidence_record->>'source_id', '') <> review_record.source_id::text
       or coalesce(evidence_record->>'source_url', '') <> review_record.source_url then
      raise exception 'evidence source does not match the locked official source for edition %', review_record.edition_id
        using errcode = '22023';
    end if;

    begin
      checked_at := (evidence_record->>'source_checked_at')::timestamptz;
      evidence_confidence := (evidence_record->>'confidence')::numeric;
    exception when others then
      raise exception 'valid source_checked_at and confidence are required for edition %', review_record.edition_id
        using errcode = '22023';
    end;

    if checked_at is null
       or not isfinite(checked_at)
       or checked_at < now() - interval '24 hours'
       or checked_at > now() + interval '5 minutes' then
      raise exception 'source inspection timestamp is outside the accepted 24-hour window for edition %', review_record.edition_id
        using errcode = '22023';
    end if;
    if evidence_confidence is null
       or evidence_confidence < 0.80
       or evidence_confidence > 1 then
      raise exception 'freshness verification confidence must be between 0.80 and 1 for edition %', review_record.edition_id
        using errcode = '22023';
    end if;

    if jsonb_typeof(evidence_record->'confirmed_fields') is distinct from 'array'
       or jsonb_typeof(evidence_record->'uncertain_fields') is distinct from 'array'
       or jsonb_typeof(evidence_record->'observed_values') is distinct from 'object' then
      raise exception 'confirmed_fields, uncertain_fields and observed_values are required for edition %', review_record.edition_id
        using errcode = '22023';
    end if;

    select coalesce(array_agg(value order by value), '{}'::text[])
      into confirmed_fields
    from jsonb_array_elements_text(evidence_record->'confirmed_fields') field(value);

    select coalesce(array_agg(value order by value), '{}'::text[])
      into uncertain_fields
    from jsonb_array_elements_text(evidence_record->'uncertain_fields') field(value);

    if cardinality(uncertain_fields) > 0 then
      raise exception 'uncertain fields require review and cannot be marked verified for edition %', review_record.edition_id
        using errcode = 'P0001';
    end if;
    if cardinality(confirmed_fields) <> cardinality(required_fields)
       or confirmed_fields @> required_fields is not true
       or required_fields @> confirmed_fields is not true then
      raise exception 'all central fields must be explicitly confirmed for edition %', review_record.edition_id
        using errcode = 'P0001';
    end if;

    stored_values := jsonb_build_object(
      'event_name', coalesce(review_record.canonical_name, review_record.event_name),
      'edition_year', review_record.edition_year,
      'date', review_record.start_date,
      'city', review_record.city,
      'country', review_record.country,
      'address', review_record.address,
      'latitude', review_record.latitude,
      'longitude', review_record.longitude,
      'sport', review_record.sport,
      'distances', case
        when jsonb_typeof(coalesce(review_record.race_formats, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(review_record.race_formats, '[]'::jsonb)) > 0
          then review_record.race_formats
        else to_jsonb(coalesce(review_record.legacy_distance, review_record.distance))
      end,
      'description', review_record.description,
      'registration_status', review_record.registration_status,
      'official_event_page', review_record.source_url,
      'registration_link', review_record.registration_url
    );
    observed_values := evidence_record->'observed_values';

    if exists (
      select 1
      from unnest(required_fields) field_name
      where not coalesce(observed_values ? field_name, false)
        or observed_values->field_name is distinct from stored_values->field_name
    ) then
      raise exception 'official source differs from stored event data; keep edition % in field-level review', review_record.edition_id
        using errcode = 'P0001';
    end if;

    eligible_count := eligible_count + 1;
    next_check_value := now() + case
      when review_record.start_date <= current_date + 30 then interval '7 days'
      when review_record.start_date <= current_date + 90 then interval '14 days'
      else interval '30 days'
    end;

    old_verification_state := stored_values || jsonb_build_object(
      'verification_status', review_record.verification_status,
      'data_confidence', review_record.data_confidence,
      'needs_review', review_record.needs_review,
      'review_priority', review_record.review_priority,
      'last_verified_at', review_record.last_verified_at,
      'next_check_at', review_record.next_check_at,
      'last_verified_source_id', review_record.last_verified_source_id
    );
    new_verification_state := evidence_record || jsonb_build_object(
      'edition_id', review_record.edition_id,
      'source_id', review_record.source_id,
      'verification_status', 'verified',
      'data_confidence', greatest(review_record.data_confidence, evidence_confidence),
      'needs_review', false,
      'review_priority', 'low',
      'last_verified_at', checked_at,
      'next_check_at', next_check_value,
      'last_verified_source_id', review_record.source_id,
      'freshness_verified', true,
      'policy_decision', 'unchanged_official_facts_confirmed',
      'automatic_fact_changes', false
    );

    perform set_config('app.change_source', 'manual_admin', true);
    perform set_config('app.change_reason', effective_review_notes, true);
    perform set_config('app.source_url', review_record.source_url, true);
    perform set_config('app.freshness_verification', 'active', true);

    update public.event_editions
    set verification_status = 'verified',
        data_confidence = greatest(data_confidence, evidence_confidence),
        needs_review = false,
        review_priority = 'low',
        last_verified_at = checked_at,
        next_check_at = next_check_value,
        last_verified_source_id = review_record.source_id,
        updated_at = now()
    where id = review_record.edition_id;
    get diagnostics updated_count = row_count;

    if updated_count <> 1 then
      raise exception 'freshness verification update failed for edition %', review_record.edition_id
        using errcode = 'P0001';
    end if;

    insert into public.event_audit_log (
      entity_type,
      entity_id,
      field_name,
      old_value,
      new_value,
      change_source,
      changed_by,
      changed_by_process,
      reason,
      source_url
    ) values (
      'edition',
      review_record.edition_id::text,
      '__freshness_verification__',
      old_verification_state,
      new_verification_state,
      'manual_admin',
      reviewer_id,
      'freshness_review_queue',
      effective_review_notes,
      review_record.source_url
    );

    verified_count := verified_count + 1;
    verified_edition_ids := array_append(verified_edition_ids, review_record.edition_id);
  end loop;

  if eligible_count <> requested_count or verified_count <> requested_count then
    raise exception 'one or more freshness reviews were not verified atomically'
      using errcode = 'P0001';
  end if;

  perform set_config('app.change_source', coalesce(previous_change_source, ''), true);
  perform set_config('app.change_reason', coalesce(previous_change_reason, ''), true);
  perform set_config('app.source_url', coalesce(previous_source_url, ''), true);
  perform set_config('app.freshness_verification', coalesce(previous_freshness_verification, ''), true);

  return jsonb_build_object(
    'requested_count', requested_count,
    'verified_count', verified_count,
    'verified_edition_ids', to_jsonb(verified_edition_ids),
    'freshness_verified', true,
    'automatic_fact_changes', false
  );
end;
$$;

revoke all on function public.verify_freshness_review_editions(uuid[], text, jsonb)
  from public, anon, authenticated;
grant execute on function public.verify_freshness_review_editions(uuid[], text, jsonb)
  to authenticated;

-- The public catalog exporter uses a publishable key and therefore cannot read
-- private review tables directly. Return only an edition -> boolean decision;
-- no source, feedback or workflow details cross the security boundary.
create or replace function public.get_public_event_freshness_guard(
  p_edition_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '30s'
as $$
declare
  requested_count integer := 0;
  guard_result jsonb;
begin
  if array_position(coalesce(p_edition_ids, '{}'::uuid[]), null) is not null then
    raise exception 'edition ids must not contain null values' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_edition_ids, '{}'::uuid[])) > 5000 then
    raise exception 'a maximum of 5000 public freshness decisions can be requested'
      using errcode = '22023';
  end if;

  select count(*) into requested_count
  from (
    select distinct requested.id
    from unnest(coalesce(p_edition_ids, '{}'::uuid[])) requested(id)
  ) unique_ids;

  if requested_count = 0 then
    raise exception 'at least one edition id is required' using errcode = '22023';
  end if;
  if cardinality(p_edition_ids) <> requested_count then
    raise exception 'edition ids must be unique' using errcode = '22023';
  end if;
  select coalesce(
    jsonb_object_agg(decision.edition_id::text, decision.is_fresh order by decision.edition_id),
    '{}'::jsonb
  )
  into guard_result
  from (
    select
      discovery.edition_id,
      coalesce((
        edition.verification_status = 'verified'
        and edition.needs_review is false
        and edition.last_verified_at is not null
        and edition.next_check_at > now()
        and edition.last_verified_source_id is not null
        and source.id is not null
        and source.event_id = discovery.event_id
        and (source.edition_id is null or source.edition_id = discovery.edition_id)
        and source.is_active is true
        and source.source_type = 'official_event_website'
        and edition.source_url = source.source_url
        and source.source_url ~* '^https://[^[:space:]]+$'
        and source.crawl_status in ('success', 'not_modified')
        and source.consecutive_failures = 0
        and source.last_fetched_at is not null
        and source.last_change_status in ('unchanged', 'first_seen')
        and verification.id is not null
        and verification.new_value->>'source_id' = source.id::text
        and verification.new_value->>'source_url' = source.source_url
        and verification.new_value->>'freshness_verified' = 'true'
        and verification.new_value->>'automatic_fact_changes' = 'false'
        and private.try_parse_timestamptz(verification.new_value->>'last_verified_at')
          = edition.last_verified_at
        and private.try_parse_timestamptz(verification.new_value->>'next_check_at')
          = edition.next_check_at
        and jsonb_typeof(verification.new_value->'observed_values') = 'object'
        and not exists (
          select 1
          from unnest(array[
            'event_name', 'edition_year', 'date', 'city', 'country', 'address',
            'latitude', 'longitude', 'sport', 'distances', 'description',
            'registration_status', 'official_event_page', 'registration_link'
          ]::text[]) required(field_name)
          where not coalesce(
            (verification.new_value->'observed_values') ? required.field_name,
            false
          )
          or (verification.new_value->'observed_values')->required.field_name
            is distinct from current_facts.stored_values->required.field_name
        )
        and not exists (
          select 1
          from public.source_crawl_jobs job
          where job.source_id = source.id
            and job.status in ('queued', 'processing', 'retry_scheduled')
        )
        and not exists (
          select 1
          from public.source_review_tasks task
          where task.status = 'open'
            and (
              task.source_id = source.id
              or task.edition_id = discovery.edition_id
              or (task.edition_id is null and task.event_id = discovery.event_id)
            )
        )
        and not exists (
          select 1
          from public.event_change_proposals proposal
          where proposal.proposal_status = 'pending'
            and (
              proposal.source_id = source.id
              or proposal.edition_id = discovery.edition_id
              or (proposal.edition_id is null and proposal.event_id = discovery.event_id)
            )
        )
        and not exists (
          select 1
          from public.validation_issues issue
          where issue.status = 'open'
            and issue.severity in ('error', 'critical')
            and (
              issue.edition_id = discovery.edition_id
              or (issue.edition_id is null and issue.event_id = discovery.event_id)
            )
        )
        and not exists (
          select 1
          from public.data_workflow_alerts alert
          where alert.alert_status = 'open'
            and alert.severity in ('error', 'critical')
            and (
              alert.source_id = source.id
              or alert.edition_id = discovery.edition_id
              or (alert.edition_id is null and alert.event_id = discovery.event_id)
            )
        )
        and not exists (
          select 1
          from public.user_feedback feedback
          where feedback.category = 'incorrect_event_data'
            and feedback.status in ('reviewed', 'planned')
            and private.try_parse_bigint(feedback.event_id) = discovery.event_id
        )
      ), false) as is_fresh
    from (
      select distinct requested.id
      from unnest(p_edition_ids) requested(id)
    ) requested
    join public.public_event_discovery discovery
      on discovery.edition_id = requested.id
    join public.events event on event.id = discovery.event_id
    join public.event_editions edition on edition.id = discovery.edition_id
    left join public.event_sources source
      on source.id = edition.last_verified_source_id
    left join lateral (
      select audit.id, audit.new_value, audit.source_url
      from public.event_audit_log audit
      where audit.entity_type = 'edition'
        and audit.entity_id = edition.id::text
        and audit.field_name = '__freshness_verification__'
      order by audit.created_at desc, audit.id desc
      limit 1
    ) verification on true
    cross join lateral (
      select jsonb_build_object(
        'event_name', coalesce(event.canonical_name, event.event_name),
        'edition_year', edition.edition_year,
        'date', edition.start_date,
        'city', event.city,
        'country', event.country,
        'address', event.address,
        'latitude', event.latitude,
        'longitude', event.longitude,
        'sport', event.sport,
        'distances', case
          when jsonb_typeof(coalesce(edition.race_formats, '[]'::jsonb)) = 'array'
            and jsonb_array_length(coalesce(edition.race_formats, '[]'::jsonb)) > 0
            then edition.race_formats
          else to_jsonb(coalesce(edition.legacy_distance, event.distance))
        end,
        'description', event.description,
        'registration_status', edition.registration_status,
        'official_event_page', source.source_url,
        'registration_link', edition.registration_url
      ) as stored_values
    ) current_facts
  ) decision;

  return jsonb_build_object(
    'schema_version', 1,
    'evaluated_at', statement_timestamp(),
    'requested_count', requested_count,
    'decisions', guard_result
  );
end;
$$;

revoke all on function public.get_public_event_freshness_guard(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_public_event_freshness_guard(uuid[])
  to anon, authenticated;

comment on function public.get_public_event_freshness_guard(uuid[]) is
  'Fail-closed public export decision for current Discovery editions; returns edition ids and booleans only.';

-- Older structured content verification confirms fewer fields than the new
-- freshness contract. Surface an explicit follow-up even when that older RPC
-- left the edition flags looking fresh but no freshness attestation exists.
create or replace view public.admin_freshness_attestation_inbox
with (security_invoker = true)
as
select
  'freshness_review'::text as item_type,
  edition.id::text as item_id,
  event.id as event_id,
  edition.id as edition_id,
  case
    when edition.start_date <= current_date + 30 then 'critical'
    when lower(coalesce(event.country, '')) in ('de', 'deutschland', 'germany') then 'high'
    else 'medium'
  end as priority,
  'Freshness-Attestierung vervollstaendigen'::text as title,
  'Die Edition besitzt noch keine quellengenaue 14-Feld-Attestierung und bleibt bis zur Nachpruefung nicht export-frisch.'::text as description,
  edition.data_confidence as confidence,
  'open'::text as status,
  coalesce(edition.last_verified_at, edition.next_check_at, now()) as created_at,
  'review'::text as batch_action,
  jsonb_build_object(
    'review_tier', case
      when edition.start_date <= current_date + 30 then 'P0'
      when lower(coalesce(event.country, '')) in ('de', 'deutschland', 'germany') then 'P1'
      else 'P2'
    end,
    'priority_score', case
      when edition.start_date <= current_date + 30 then 499
      when lower(coalesce(event.country, '')) in ('de', 'deutschland', 'germany') then 399
      else 299
    end,
    'priority_reasons', jsonb_build_array('freshness_attestation_missing'),
    'recommended_action', 'Offizielle Quelle oeffnen und alle 14 zentralen Felder einzeln bestaetigen.',
    'source_id', source.id,
    'source_url', source.source_url,
    'source_type', source.source_type,
    'source_checked_at', source.last_fetched_at,
    'source_reachable', coalesce(
      source.is_active
      and source.crawl_status in ('success', 'not_modified')
      and source.consecutive_failures = 0
      and source.last_fetched_at is not null
      and source.last_change_status in ('unchanged', 'first_seen'),
      false
    ),
    'affected_fields', to_jsonb(array_remove(array[
      case when nullif(btrim(coalesce(event.canonical_name, event.event_name)), '') is null then 'event_name' end,
      case when edition.edition_year is null then 'edition_year' end,
      case when edition.start_date is null then 'date' end,
      case when nullif(btrim(event.city), '') is null then 'city' end,
      case when nullif(btrim(event.country), '') is null then 'country' end,
      case when nullif(btrim(event.address), '') is null then 'address' end,
      case when event.latitude is null then 'latitude' end,
      case when event.longitude is null then 'longitude' end,
      case when nullif(btrim(event.sport), '') is null then 'sport' end,
      case when
        nullif(btrim(coalesce(edition.legacy_distance, event.distance)), '') is null
        and not (
          jsonb_typeof(coalesce(edition.race_formats, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(edition.race_formats, '[]'::jsonb)) > 0
        ) then 'distances' end,
      case when length(btrim(coalesce(event.description, ''))) < 80 then 'description' end,
      case when source.id is null then 'official_event_page' end,
      case when nullif(btrim(edition.registration_url), '') is null then 'registration_link' end
    ], null)),
    'stored_values', jsonb_build_object(
      'event_name', coalesce(event.canonical_name, event.event_name),
      'edition_year', edition.edition_year,
      'date', edition.start_date,
      'city', event.city,
      'country', event.country,
      'sport', event.sport,
      'distances', case
        when jsonb_typeof(coalesce(edition.race_formats, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(edition.race_formats, '[]'::jsonb)) > 0
          then edition.race_formats
        else to_jsonb(coalesce(edition.legacy_distance, event.distance))
      end,
      'registration_status', edition.registration_status,
      'official_event_page', source.source_url,
      'registration_link', edition.registration_url
    ),
    'last_verified_at', edition.last_verified_at,
    'next_check_at', edition.next_check_at
  ) as metadata
from public.public_event_discovery discovery
join public.events event on event.id = discovery.event_id
join public.event_editions edition on edition.id = discovery.edition_id
left join lateral (
  select candidate.*
  from public.event_sources candidate
  where candidate.event_id = discovery.event_id
    and (candidate.edition_id is null or candidate.edition_id = discovery.edition_id)
    and candidate.source_type = 'official_event_website'
    and candidate.source_url = edition.source_url
  order by (candidate.edition_id = discovery.edition_id) desc,
    candidate.is_active desc,
    candidate.last_fetched_at desc nulls last,
    candidate.id
  limit 1
) source on true
where edition.verification_status = 'verified'
  and edition.needs_review is false
  and edition.last_verified_source_id is null
  and not exists (
    select 1
    from public.source_review_tasks task
    where task.status = 'open'
      and (
        task.source_id = source.id
        or task.edition_id = edition.id
        or (task.edition_id is null and task.event_id = event.id)
      )
  )
  and not exists (
    select 1
    from public.event_change_proposals proposal
    where proposal.proposal_status = 'pending'
      and (
        proposal.source_id = source.id
        or proposal.edition_id = edition.id
        or (proposal.edition_id is null and proposal.event_id = event.id)
      )
  )
  and not exists (
    select 1
    from public.validation_issues issue
    where issue.status = 'open'
      and issue.severity in ('error', 'critical')
      and (
        issue.edition_id = edition.id
        or (issue.edition_id is null and issue.event_id = event.id)
      )
  )
  and not exists (
    select 1
    from public.data_workflow_alerts alert
    where alert.alert_status = 'open'
      and alert.severity in ('error', 'critical')
      and (
        alert.source_id = source.id
        or alert.edition_id = edition.id
        or (alert.edition_id is null and alert.event_id = event.id)
      )
  )
  and not exists (
    select 1
    from public.user_feedback feedback
    where feedback.category = 'incorrect_event_data'
      and feedback.status in ('reviewed', 'planned')
      and private.try_parse_bigint(feedback.event_id) = event.id
  )
  and (select private.is_admin());

revoke all on public.admin_freshness_attestation_inbox
  from public, anon, authenticated;
grant select on public.admin_freshness_attestation_inbox to authenticated;

comment on view public.admin_freshness_attestation_inbox is
  'Admin-only follow-up queue for current Discovery editions that look fresh under legacy metadata but lack the strict source-bound attestation.';

-- Legacy freshness did not retain exact source provenance. Move every future
-- publishable edition back into review once (including later sibling editions),
-- so a purely time-based Discovery handover cannot bypass the new attestation.
do $$
declare
  candidate record;
begin
  for candidate in
    select edition.event_id, edition.id as edition_id
    from public.event_editions edition
    where edition.verification_status = 'verified'
      and edition.needs_review is false
      and edition.last_verified_source_id is null
      and edition.publication_status = 'published'
      and edition.discovery_status = 'active'
      and edition.edition_status not in ('cancelled', 'inactive', 'completed')
      and (
        coalesce(edition.end_date, edition.start_date) is null
        or coalesce(edition.end_date, edition.start_date) >= current_date
      )
    order by edition.event_id, edition.id
  loop
    perform private.invalidate_current_edition_freshness(
      candidate.event_id,
      candidate.edition_id,
      'high'
    );
  end loop;
end;
$$;

comment on function public.verify_freshness_review_editions(uuid[], text, jsonb) is
  'Admin-only, evidence-backed re-verification of current Discovery editions; factual event and edition fields are immutable.';
comment on function private.invalidate_current_edition_freshness(bigint, uuid, text) is
  'Fail-closed freshness invalidation used by trusted review-signal triggers.';

commit;
