-- Minimal successor-publication closure for the production lifecycle schema.
-- No historical migration replay, public view rewrite, draft auto-creation,
-- parent-event fact change, or replacement of the existing freshness verifier.
-- Publication stays private until the unchanged verifier succeeds in this same
-- transaction. Any failed member rolls back the entire batch and its audits.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $schema_guard$
declare column_count integer;
begin
  if to_regprocedure('public.verify_freshness_review_editions(uuid[],text,jsonb)') is null
     or to_regclass('public.event_field_controls') is null
     or to_regclass('public.edition_succession_candidates') is null then
    raise exception 'safe successor publication requires the installed freshness and extraction closure';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.edition_lifecycle_settings'::regclass
      and conname = 'edition_lifecycle_publication_automation_disabled_check'
      and contype = 'c' and convalidated
      and regexp_replace(lower(pg_get_constraintdef(oid)), '[[:space:]()]', '', 'g')
        = 'checkauto_publish_enabledisfalseandauto_result_publish_enabledisfalse'
  ) or exists (
    select 1 from public.edition_lifecycle_settings
    where auto_publish_enabled is distinct from false
       or auto_result_publish_enabled is distinct from false
  ) then
    raise exception 'publication automation must remain disabled by the existing schema guard';
  end if;
  select count(*) into column_count from pg_attribute
  where attrelid = 'public.edition_succession_candidates'::regclass
    and attname in ('validation_status','validation_reasons','validated_at') and not attisdropped;
  if column_count not in (0,3) then
    raise exception 'partial candidate validation schema requires explicit reconciliation';
  end if;
  if column_count = 3 and exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.edition_succession_candidates'::regclass and not a.attisdropped
      and ((a.attname = 'validation_status' and (a.atttypid <> 'text'::regtype or not a.attnotnull))
        or (a.attname = 'validation_reasons' and (a.atttypid <> 'text[]'::regtype or not a.attnotnull))
        or (a.attname = 'validated_at' and a.atttypid <> 'timestamptz'::regtype))
  ) then
    raise exception 'candidate validation columns do not match the supported schema';
  end if;
end;
$schema_guard$;

alter table public.edition_succession_candidates
  add column if not exists validation_status text not null default 'pending',
  add column if not exists validation_reasons text[] not null default '{}'::text[],
  add column if not exists validated_at timestamptz;
-- This additive constraint also guards a pre-existing, weaker historical check.
-- Existing candidate rows retain their status and facts; no blanket revalidation.
alter table public.edition_succession_candidates
  add constraint edition_succession_safe_publication_validation_check
  check (validation_status in ('pending', 'validated', 'blocked', 'conflict'));
create index if not exists edition_succession_validation_review_idx
  on public.edition_succession_candidates(validation_status, candidate_status, last_detected_at)
  where candidate_status in ('detected', 'draft_created', 'conflict');

create or replace function public.register_edition_successor_candidate(
  p_source_id uuid,
  p_crawl_result_id bigint,
  p_candidate jsonb,
  p_worker_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
set lock_timeout = '5s'
as $$
<<register_candidate>>
declare
  source_row public.event_sources;
  crawl_row public.source_crawl_results;
  event_row public.events;
  predecessor public.event_editions;
  existing_edition public.event_editions;
  candidate_row public.edition_succession_candidates;
  candidate_start date;
  candidate_end date;
  candidate_year smallint;
  candidate_confidence numeric(4,3);
  candidate_registration text;
  candidate_fingerprint text;
  candidate_evidence jsonb;
  candidate_evidence_type text;
  candidate_name_slug text;
  event_name_slug text;
  validation_reasons text[] := '{}'::text[];
  validation_status text := 'pending';
  candidate_status text := 'detected';
  has_conflict boolean := false;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into source_row
  from public.event_sources
  where id = p_source_id
  for update;
  if source_row.id is null then
    raise exception 'source not found' using errcode = 'P0002';
  end if;

  select * into event_row from public.events
  where id = source_row.event_id for update;
  if event_row.id is null then
    raise exception 'source event not found' using errcode = 'P0002';
  end if;

  select * into crawl_row
  from public.source_crawl_results
  where id = p_crawl_result_id;
  if crawl_row.id is null
     or crawl_row.source_id <> source_row.id
     or crawl_row.event_id <> source_row.event_id
     or crawl_row.edition_id is distinct from source_row.edition_id then
    return jsonb_build_object('accepted', false, 'reason', 'crawl_source_event_mismatch');
  end if;

  -- Hold every existing child in stable order before touching a candidate.
  -- The event lock serializes concurrent edition/candidate creation.
  perform 1 from public.event_editions edition
  where edition.event_id = source_row.event_id
  order by edition.event_id, edition.id for update;
  perform 1 from public.edition_succession_candidates candidate
  where candidate.event_id = source_row.event_id
  order by candidate.id for update;

  if source_row.edition_id is not null and not exists (
    select 1 from public.event_editions edition
    where edition.id = source_row.edition_id and edition.event_id = source_row.event_id
  ) then
    return jsonb_build_object('accepted', false, 'reason', 'source_edition_event_mismatch');
  end if;

  select * into predecessor
  from public.event_editions
  where event_id = source_row.event_id
    and publication_status = 'published'
  order by edition_year desc, start_date desc nulls last, id
  limit 1;

  begin
    candidate_start := nullif(p_candidate->>'start_date', '')::date;
    candidate_end := nullif(p_candidate->>'end_date', '')::date;
    candidate_year := coalesce(
      nullif(p_candidate->>'year', '')::smallint,
      extract(year from candidate_start)::smallint
    );
    candidate_confidence := least(1.000, greatest(0.000,
      coalesce(nullif(p_candidate->>'confidence', '')::numeric, 0.500)
    ));
  exception when others then
    raise exception 'invalid successor candidate payload' using errcode = '22023';
  end;

  if candidate_start is null or candidate_year is null
     or extract(year from candidate_start)::smallint <> candidate_year then
    raise exception 'candidate year and start date are required and must match'
      using errcode = '22023';
  end if;
  if candidate_end is not null and candidate_end < candidate_start then
    raise exception 'candidate end date must not precede start date'
      using errcode = '22023';
  end if;

  candidate_registration := nullif(btrim(p_candidate->>'registration_url'), '');
  if candidate_registration is not null
     and candidate_registration !~* '^https?://[^[:space:]]+$' then
    candidate_registration := null;
  end if;
  candidate_fingerprint := source_row.event_id::text || ':' ||
    candidate_year::text || ':' || candidate_start::text;
  if jsonb_typeof(p_candidate) is distinct from 'object'
     or (p_candidate ? 'evidence' and jsonb_typeof(p_candidate->'evidence') is distinct from 'object') then
    raise exception 'candidate and evidence must be JSON objects' using errcode = '22023';
  end if;
  candidate_evidence := coalesce(p_candidate->'evidence', '{}'::jsonb)
    || case when p_candidate ? 'evidence_type'
      then jsonb_build_object('evidence_type', p_candidate->>'evidence_type')
      else '{}'::jsonb end
    || jsonb_build_object(
      'worker_version', nullif(btrim(p_worker_version), ''),
      'crawl_result_id', crawl_row.id,
      'fetched_at', crawl_row.fetched_at,
      'http_status', crawl_row.http_status,
      'final_url', crawl_row.final_url,
      'source_type', source_row.source_type
    );
  candidate_evidence_type := lower(coalesce(
    candidate_evidence->>'evidence_type', candidate_evidence->>'type', ''
  ));

  if crawl_row.processing_status <> 'completed'
     or crawl_row.error_type is not null
     or crawl_row.http_status is null
     or crawl_row.http_status not between 200 and 299 then
    validation_reasons := array_append(validation_reasons, 'crawl_not_successful');
  end if;
  if not source_row.is_active then
    validation_reasons := array_append(validation_reasons, 'source_inactive');
  end if;
  if source_row.consecutive_failures <> 0
     or source_row.crawl_status not in ('success', 'not_modified') then
    validation_reasons := array_append(validation_reasons, 'source_not_healthy');
  end if;
  if source_row.source_url !~* '^https://[^[:space:]]+$' then
    validation_reasons := array_append(validation_reasons, 'source_not_https');
  end if;
  if not (
    source_row.source_type in ('official_event_website', 'official_registration_platform')
    or (
      source_row.source_type in ('organizer_calendar', 'federation_calendar')
      and source_row.source_priority <= 50
    )
  ) then
    validation_reasons := array_append(validation_reasons, 'source_not_authoritative');
  end if;
  if candidate_evidence_type in ('', 'unknown') then
    validation_reasons := array_append(validation_reasons, 'structured_evidence_missing');
  end if;
  if candidate_start <= current_date then
    validation_reasons := array_append(validation_reasons, 'candidate_not_future');
  end if;
  if candidate_year > extract(year from current_date)::integer + 5 then
    validation_reasons := array_append(validation_reasons, 'candidate_outside_horizon');
  end if;
  if predecessor.id is null then
    validation_reasons := array_append(validation_reasons, 'predecessor_missing');
  elsif candidate_year <= predecessor.edition_year then
    validation_reasons := array_append(validation_reasons, 'candidate_year_not_newer');
  elsif predecessor.start_date is not null and candidate_start <= predecessor.start_date then
    validation_reasons := array_append(validation_reasons, 'date_not_after_predecessor');
  end if;

  if nullif(btrim(p_candidate->>'name'), '') is not null then
    candidate_name_slug := private.slugify_event(regexp_replace(
      p_candidate->>'name', '\m(19|20)[0-9]{2}\M', '', 'g'
    ));
    event_name_slug := private.slugify_event(regexp_replace(
      coalesce(event_row.canonical_name, event_row.event_name),
      '\m(19|20)[0-9]{2}\M', '', 'g'
    ));
    if length(coalesce(candidate_name_slug, '')) >= 4
       and length(coalesce(event_name_slug, '')) >= 4
       and position(candidate_name_slug in event_name_slug) = 0
       and position(event_name_slug in candidate_name_slug) = 0 then
      validation_reasons := array_append(validation_reasons, 'event_name_mismatch');
    end if;
  end if;

  if lower(coalesce(candidate_evidence->>'risk_signals', ''))
       ~ '(cancel|abgesagt|postpon|verschob)' then
    validation_reasons := array_append(validation_reasons, 'cancellation_or_postponement_signal');
    has_conflict := true;
  end if;
  if exists (
    select 1 from public.event_field_controls control
    where control.event_id = source_row.event_id
      and control.edition_id is null
      and control.is_locked
      and (control.lock_expires_at is null or control.lock_expires_at > now())
      and control.field_name in ('new_edition', 'edition_year', 'start_date', 'date')
  ) then
    validation_reasons := array_append(validation_reasons, 'manual_lock_active');
  end if;
  if exists (
    select 1 from public.validation_issues issue
    where issue.event_id = source_row.event_id
      and issue.status = 'open'
      and issue.severity in ('error', 'critical')
  ) then
    validation_reasons := array_append(validation_reasons, 'critical_validation_issue_open');
  end if;

  select * into existing_edition
  from public.event_editions
  where event_id = source_row.event_id
    and edition_year = register_candidate.candidate_year
  for update;
  if existing_edition.id is not null then
    if existing_edition.start_date is distinct from candidate_start then
      validation_reasons := array_append(validation_reasons, 'edition_year_date_conflict');
      has_conflict := true;
    elsif existing_edition.publication_status = 'published' then
      validation_reasons := array_append(validation_reasons, 'edition_already_exists');
      candidate_status := 'superseded';
    else
      validation_reasons := array_append(validation_reasons, 'existing_draft_requires_manual_reconciliation');
    end if;
  end if;

  if exists (
    select 1 from public.edition_succession_candidates other_candidate
    where other_candidate.event_id = source_row.event_id
      and other_candidate.candidate_year = register_candidate.candidate_year
      and other_candidate.fingerprint <> candidate_fingerprint
      and other_candidate.candidate_start_date <> candidate_start
      and other_candidate.candidate_status in ('detected', 'draft_created', 'conflict')
  ) then
    validation_reasons := array_append(validation_reasons, 'contradictory_candidate_date');
    has_conflict := true;
  end if;

  select coalesce(array_agg(distinct reason order by reason), '{}'::text[])
  into validation_reasons
  from unnest(validation_reasons) reason;

  validation_status := case
    when has_conflict then 'conflict'
    when cardinality(validation_reasons) > 0 then 'blocked'
    else 'validated'
  end;
  if has_conflict then candidate_status := 'conflict'; end if;

  -- A later crawl cannot rewrite an accepted/rejected review or reopen its task.
  select * into candidate_row from public.edition_succession_candidates
  where fingerprint = candidate_fingerprint;
  if candidate_row.id is not null and candidate_row.candidate_status in ('approved', 'rejected', 'superseded') then
    return jsonb_build_object('accepted', false, 'reason', 'candidate_already_reviewed',
      'candidate_id', candidate_row.id, 'status', candidate_row.candidate_status,
      'validation_status', candidate_row.validation_status,
      'draft_edition_id', candidate_row.draft_edition_id);
  end if;

  insert into public.edition_succession_candidates (
    event_id, source_id, crawl_result_id, predecessor_edition_id, draft_edition_id,
    candidate_year, candidate_start_date, candidate_end_date, candidate_name,
    registration_url, source_url, confidence, evidence, fingerprint,
    candidate_status, validation_status, validation_reasons, validated_at
  ) values (
    source_row.event_id, source_row.id, crawl_row.id, predecessor.id,
    case when existing_edition.publication_status = 'draft' then existing_edition.id else null end,
    candidate_year, candidate_start, candidate_end, nullif(btrim(p_candidate->>'name'), ''),
    candidate_registration, source_row.source_url, candidate_confidence,
    candidate_evidence, candidate_fingerprint, candidate_status,
    validation_status, validation_reasons, now()
  )
  on conflict (fingerprint) do update set
    crawl_result_id = excluded.crawl_result_id,
    source_id = excluded.source_id,
    predecessor_edition_id = excluded.predecessor_edition_id,
    draft_edition_id = coalesce(excluded.draft_edition_id, edition_succession_candidates.draft_edition_id),
    candidate_end_date = coalesce(excluded.candidate_end_date, edition_succession_candidates.candidate_end_date),
    candidate_name = coalesce(excluded.candidate_name, edition_succession_candidates.candidate_name),
    registration_url = coalesce(excluded.registration_url, edition_succession_candidates.registration_url),
    confidence = greatest(edition_succession_candidates.confidence, excluded.confidence),
    evidence = edition_succession_candidates.evidence || excluded.evidence,
    candidate_status = case
      when edition_succession_candidates.candidate_status in ('approved', 'rejected', 'superseded')
        then edition_succession_candidates.candidate_status
      else excluded.candidate_status
    end,
    validation_status = case
      when edition_succession_candidates.candidate_status in ('approved', 'rejected', 'superseded')
        then edition_succession_candidates.validation_status
      else excluded.validation_status
    end,
    validation_reasons = case
      when edition_succession_candidates.candidate_status in ('approved', 'rejected', 'superseded')
        then edition_succession_candidates.validation_reasons
      else excluded.validation_reasons
    end,
    validated_at = now(),
    last_detected_at = now(),
    updated_at = now()
  returning * into candidate_row;

  if candidate_row.candidate_status not in ('approved', 'rejected', 'superseded')
     and exists (
       select 1 from public.edition_succession_candidates other_candidate
       where other_candidate.event_id = candidate_row.event_id
         and other_candidate.candidate_year = candidate_row.candidate_year
         and other_candidate.id <> candidate_row.id
         and other_candidate.candidate_start_date <> candidate_row.candidate_start_date
         and other_candidate.candidate_status in ('detected', 'draft_created', 'conflict')
     ) then
    update public.edition_succession_candidates conflicting_candidate
    set candidate_status = 'conflict',
        validation_status = 'conflict',
        validation_reasons = array(
          select distinct reason
          from unnest(conflicting_candidate.validation_reasons ||
            array['contradictory_candidate_date']::text[]) reason
          order by reason
        ),
        validated_at = now(),
        updated_at = now()
    where conflicting_candidate.event_id = candidate_row.event_id
      and conflicting_candidate.candidate_year = candidate_row.candidate_year
      and conflicting_candidate.candidate_status in ('detected', 'draft_created', 'conflict');
    select * into candidate_row
    from public.edition_succession_candidates where id = candidate_row.id;
  end if;

  if candidate_row.candidate_status = 'superseded' then
    update public.source_review_tasks
    set status = 'resolved', reviewed_at = now(), reviewed_by = null,
        review_notes = 'Candidate matches an existing published edition', updated_at = now()
    where fingerprint = 'succession:' || candidate_row.id::text and status = 'open';
  else
    insert into public.source_review_tasks (
      source_id, event_id, edition_id, crawl_result_id, task_type, status,
      priority, title, description, fingerprint
    ) values (
      source_row.id, source_row.event_id, null, crawl_row.id,
      'new_edition_candidate', 'open',
      case when candidate_row.validation_status in ('blocked', 'conflict')
        then 'critical' else 'high' end,
      'Neue Austragung ' || candidate_year::text || ' erkannt',
      case
        when candidate_row.validation_status = 'validated'
          then 'Validierter Candidate wartet auf eine ausdrueckliche Adminfreigabe.'
        when candidate_row.validation_status = 'conflict'
          then 'Widerspruechliche Evidenz blockiert die Erstellung einer Edition.'
        else 'Candidate ist durch Sicherheits-Gates blockiert: ' ||
          array_to_string(candidate_row.validation_reasons, ', ')
      end,
      'succession:' || candidate_row.id::text
    ) on conflict (fingerprint) do update set
      crawl_result_id = excluded.crawl_result_id,
      edition_id = null,
      priority = excluded.priority,
      title = excluded.title,
      description = excluded.description,
      status = 'open', reviewed_at = null, reviewed_by = null, updated_at = now();
  end if;

  return jsonb_build_object(
    'accepted', true,
    'candidate_id', candidate_row.id,
    'status', candidate_row.candidate_status,
    'validation_status', candidate_row.validation_status,
    'validation_reasons', to_jsonb(candidate_row.validation_reasons),
    'draft_edition_id', candidate_row.draft_edition_id,
    'confidence', candidate_row.confidence,
    'confirmation_count', candidate_row.confirmation_count,
    'confirmed_confidence', candidate_row.confirmed_confidence
  );
end;
$$;

revoke all on function public.register_edition_successor_candidate(uuid, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.register_edition_successor_candidate(uuid, bigint, jsonb, text)
  to service_role;

-- Keep the old API identity for old clients, but never let it publish with only
-- a date/URL or silently select an unbounded candidate queue.
create or replace function public.approve_edition_succession_candidates(
  p_candidate_ids uuid[] default null,
  p_limit integer default 100
)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  raise exception 'publication requires explicit candidate ids, review notes and complete 14-field evidence'
    using errcode = '22023';
end;
$$;
revoke all on function public.approve_edition_succession_candidates(uuid[], integer)
  from public, anon, service_role;
grant execute on function public.approve_edition_succession_candidates(uuid[], integer)
  to authenticated;

-- Four required arguments distinguish this overload from the legacy two-arg
-- RPC in PostgREST. It consumes already reviewed PRIVATE draft facts; it never
-- creates a draft, changes facts, or copies a predecessor's program/location.
create or replace function public.approve_edition_succession_candidates(
  p_candidate_ids uuid[],
  p_limit integer,
  p_notes text,
  p_evidence jsonb
)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public, private
set lock_timeout = '5s'
set statement_timeout = '60s'
as $$
declare
  requested_count integer := cardinality(p_candidate_ids);
  affected_count integer;
  source_ids uuid[];
  event_ids bigint[];
  edition_ids uuid[];
  ordered_candidate_ids uuid[];
  initial_identities jsonb;
  source_id_text text;
  selected_source_id uuid;
  candidate_row public.edition_succession_candidates;
  draft_row public.event_editions;
  predecessor_row public.event_editions;
  event_row public.events;
  source_row public.event_sources;
  publication_source public.event_sources;
  crawl_row public.source_crawl_results;
  freshness_result jsonb;
  notes text := nullif(btrim(p_notes), '');
  reviewer_id uuid := (select auth.uid());
  previous_change_source text := current_setting('app.change_source', true);
  previous_change_reason text := current_setting('app.change_reason', true);
  previous_source_url text := current_setting('app.source_url', true);
begin
  if not (select private.is_admin()) or reviewer_id is null then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if requested_count is null or requested_count not between 1 and 25
     or array_ndims(p_candidate_ids) <> 1
     or array_position(p_candidate_ids, null) is not null
     or (select count(distinct id) from unnest(p_candidate_ids) id) <> requested_count
     or p_limit is distinct from requested_count then
    raise exception 'select 1 to 25 unique explicit candidate ids and an exactly matching limit'
      using errcode = '22023';
  end if;
  if notes is null or length(notes) < 12
     or jsonb_typeof(p_evidence) is distinct from 'object' then
    raise exception 'review notes and evidence keyed by concrete draft edition id are required'
      using errcode = '22023';
  end if;

  -- Read identity without taking candidate locks. Recheck the exact mapping
  -- after Source -> Event -> Edition -> Candidate locks are acquired.
  select jsonb_object_agg(c.id::text, jsonb_build_array(
      c.event_id, c.source_id, c.draft_edition_id, c.predecessor_edition_id)),
    array_agg(c.id order by c.id),
    array_agg(c.draft_edition_id order by c.draft_edition_id),
    array_agg(distinct c.event_id order by c.event_id),
    array_agg(distinct c.source_id order by c.source_id)
  into initial_identities, ordered_candidate_ids, edition_ids, event_ids, source_ids
  from public.edition_succession_candidates c where c.id = any(p_candidate_ids);

  if cardinality(ordered_candidate_ids) is distinct from requested_count
     or array_position(edition_ids, null) is not null
     or cardinality(event_ids) is distinct from requested_count
     or (select count(distinct id) from unnest(edition_ids) id) <> requested_count
     or (select count(*) from jsonb_object_keys(p_evidence)) <> requested_count
     or exists (
       select 1 from unnest(edition_ids) id
       where jsonb_typeof(p_evidence -> id::text) is distinct from 'object'
     ) then
    raise exception 'every selected candidate needs one concrete private draft, one event and exact evidence'
      using errcode = '22023';
  end if;

  for source_id_text in
    select value->>'source_id' from jsonb_each(p_evidence)
  loop
    if coalesce(source_id_text, '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'valid publication source ids are required' using errcode = '22023';
    end if;
    selected_source_id := source_id_text::uuid;
    if not (selected_source_id = any(source_ids)) then
      source_ids := array_append(source_ids, selected_source_id);
    end if;
  end loop;

  perform 1 from public.event_sources s where s.id = any(source_ids)
  order by s.id for update;
  get diagnostics affected_count = row_count;
  if affected_count <> cardinality(source_ids) then
    raise exception 'a selected source no longer exists' using errcode = '40001';
  end if;
  if exists (select 1 from public.source_crawl_jobs j
    where j.source_id = any(source_ids)
      and j.status in ('queued', 'processing', 'retry_scheduled')) then
    raise exception 'a selected source has an active crawl job' using errcode = '55000';
  end if;
  perform 1 from public.events e where e.id = any(event_ids)
  order by e.id for update;
  get diagnostics affected_count = row_count;
  if affected_count <> cardinality(event_ids) then
    raise exception 'a selected event no longer exists' using errcode = '40001';
  end if;
  -- Include predecessors and siblings before any candidate lock, so a later
  -- side effect never acquires an older edition after locking a candidate.
  perform 1 from public.event_editions e where e.event_id = any(event_ids)
  order by e.event_id, e.id for update;
  perform 1 from public.edition_succession_candidates c where c.event_id = any(event_ids)
  order by c.id for update;

  if exists (
    select 1 from public.edition_succession_candidates c where c.id = any(p_candidate_ids)
      and jsonb_build_array(c.event_id, c.source_id, c.draft_edition_id, c.predecessor_edition_id)
        is distinct from initial_identities -> c.id::text
  ) or (select count(*) from public.edition_succession_candidates c
        where c.id = any(p_candidate_ids)) <> requested_count then
    raise exception 'candidate identity changed concurrently; reload the complete review'
      using errcode = '40001';
  end if;

  -- Validate every selected member before the first publication write. The
  -- unchanged verifier repeats the full field/evidence/conflict gates below in
  -- the same transaction; it is intentionally not relaxed for private drafts.
  for candidate_row in select * from public.edition_succession_candidates
    where id = any(p_candidate_ids) order by event_id, id
  loop
    select * into draft_row from public.event_editions where id = candidate_row.draft_edition_id;
    select * into predecessor_row from public.event_editions where id = candidate_row.predecessor_edition_id;
    select * into event_row from public.events where id = candidate_row.event_id;
    select * into source_row from public.event_sources where id = candidate_row.source_id;
    select * into crawl_row from public.source_crawl_results where id = candidate_row.crawl_result_id;
    select * into publication_source from public.event_sources
    where id = ((p_evidence -> draft_row.id::text)->>'source_id')::uuid;

    if candidate_row.candidate_status not in ('detected', 'draft_created')
       or candidate_row.validation_status is distinct from 'validated'
       or cardinality(candidate_row.validation_reasons) <> 0
       or candidate_row.validated_at is null
       or candidate_row.confidence < 0.90
       or candidate_row.candidate_start_date <= current_date
       or extract(year from candidate_row.candidate_start_date)::integer <> candidate_row.candidate_year
       or candidate_row.candidate_year > extract(year from current_date)::integer + 5
       or lower(coalesce(candidate_row.evidence->>'risk_signals', '')) ~ '(cancel|abgesagt|postpon|verschob)'
       or lower(coalesce(candidate_row.evidence->>'evidence_type', candidate_row.evidence->>'type', '')) in ('', 'unknown') then
      raise exception 'candidate % is not validated for explicit publication', candidate_row.id
        using errcode = 'P0001';
    end if;
    if event_row.status is distinct from 'approved'
       or event_row.publication_status is distinct from 'published'
       or event_row.event_status is distinct from 'active'
       or draft_row.id is null
       or draft_row.event_id is distinct from candidate_row.event_id
       or draft_row.edition_year is distinct from candidate_row.candidate_year
       or draft_row.start_date is distinct from candidate_row.candidate_start_date
       or draft_row.end_date is distinct from candidate_row.candidate_end_date
       or draft_row.publication_status is distinct from 'draft'
       or draft_row.discovery_status is distinct from 'suppressed'
       or draft_row.edition_status is distinct from 'scheduled'
       or draft_row.generated_from_candidate_id is distinct from candidate_row.id
       or draft_row.generated_from_source_id is distinct from candidate_row.source_id
       or draft_row.predecessor_edition_id is distinct from candidate_row.predecessor_edition_id
       or predecessor_row.id is null
       or predecessor_row.event_id is distinct from candidate_row.event_id
       or predecessor_row.publication_status is distinct from 'published'
       or predecessor_row.edition_year >= candidate_row.candidate_year
       or (predecessor_row.start_date is not null and predecessor_row.start_date >= draft_row.start_date) then
      raise exception 'candidate % does not match a reviewed private successor draft', candidate_row.id
        using errcode = 'P0001';
    end if;
    if source_row.event_id is distinct from candidate_row.event_id
       or source_row.source_url is distinct from candidate_row.source_url
       or source_row.is_active is not true
       or coalesce(source_row.consecutive_failures, -1) <> 0
       or coalesce(source_row.crawl_status, '') not in ('success', 'not_modified')
       or coalesce(source_row.source_url, '') !~* '^https://[^[:space:]]+$'
       or not (source_row.source_type in ('official_event_website', 'official_registration_platform')
         or (source_row.source_type in ('organizer_calendar', 'federation_calendar') and source_row.source_priority <= 50))
       or (source_row.edition_id is not null and not exists (
         select 1 from public.event_editions e where e.id = source_row.edition_id and e.event_id = event_row.id
       ))
       or crawl_row.id is null
       or crawl_row.source_id is distinct from source_row.id
       or crawl_row.event_id is distinct from event_row.id
       or crawl_row.edition_id is distinct from source_row.edition_id
       or crawl_row.processing_status is distinct from 'completed'
       or crawl_row.error_type is not null
       or coalesce(crawl_row.http_status, 0) not between 200 and 299 then
      raise exception 'candidate % has an invalid detection source or crawl', candidate_row.id
        using errcode = 'P0001';
    end if;
    if publication_source.id is null
       or publication_source.event_id is distinct from event_row.id
       or publication_source.edition_id is distinct from draft_row.id
       or publication_source.source_type is distinct from 'official_event_website'
       or publication_source.source_url is distinct from draft_row.source_url
       or publication_source.source_url is distinct from (p_evidence -> draft_row.id::text)->>'source_url'
       or publication_source.is_active is not true
       or coalesce(publication_source.source_url, '') !~* '^https://[^[:space:]]+$'
       or coalesce(publication_source.consecutive_failures, -1) <> 0
       or coalesce(publication_source.crawl_status, '') not in ('success', 'not_modified')
       or publication_source.last_fetched_at is null
       or coalesce(publication_source.last_change_status, '') not in ('unchanged', 'first_seen') then
      raise exception 'candidate % needs its exact healthy official publication source', candidate_row.id
        using errcode = 'P0001';
    end if;
    -- No master-distance fallback may make a new edition appear complete.
    if (jsonb_typeof(draft_row.race_formats) is distinct from 'array'
          or jsonb_array_length(draft_row.race_formats) = 0)
       and nullif(btrim(draft_row.legacy_distance), '') is null then
      raise exception 'candidate % has no reviewed edition distance program', candidate_row.id
        using errcode = 'P0001';
    end if;
    if exists (select 1 from public.edition_succession_candidates c
      where c.event_id = event_row.id and c.candidate_year = candidate_row.candidate_year
        and c.id <> candidate_row.id and c.candidate_status in ('detected', 'draft_created', 'conflict')
        and c.candidate_start_date is distinct from candidate_row.candidate_start_date)
      or exists (select 1 from public.event_editions e
        where e.event_id = event_row.id and e.id <> draft_row.id
          and e.publication_status = 'published' and e.discovery_status = 'active'
          and e.edition_status not in ('cancelled', 'inactive', 'completed')
          and coalesce(e.end_date, e.start_date) >= current_date)
      or exists (select 1 from public.event_field_controls c
        where c.event_id = event_row.id and (c.edition_id is null or c.edition_id = draft_row.id)
          and c.is_locked and (c.lock_expires_at is null or c.lock_expires_at > now())
          and c.field_name in ('new_edition','edition_year','date','start_date','publication_status','discovery_status')) then
      raise exception 'candidate % has a conflicting edition, candidate or publication lock', candidate_row.id
        using errcode = 'P0001';
    end if;
  end loop;

  perform set_config('app.change_source', 'manual_admin', true);
  perform set_config('app.change_reason', notes, true);
  for candidate_row in select * from public.edition_succession_candidates
    where id = any(p_candidate_ids) order by event_id, id
  loop
    perform set_config('app.source_url',
      (p_evidence -> candidate_row.draft_edition_id::text)->>'source_url', true);
    update public.event_editions
    set publication_status = 'published', discovery_status = 'active',
        discovery_archived_at = null, archive_reason = null,
        published_at = now(), updated_at = now()
    where id = candidate_row.draft_edition_id and publication_status = 'draft';
    get diagnostics affected_count = row_count;
    if affected_count <> 1 then
      raise exception 'private draft changed before publication' using errcode = '40001';
    end if;
    update public.edition_succession_candidates
    set candidate_status = 'approved', reviewed_at = now(), reviewed_by = reviewer_id,
        review_notes = notes, updated_at = now()
    where id = candidate_row.id;
    -- Resolve only this candidate's own task. The nested verifier still blocks
    -- every unrelated open review/proposal/alert/feedback item.
    update public.source_review_tasks
    set status = 'resolved', reviewed_at = now(), reviewed_by = reviewer_id,
        review_notes = notes, updated_at = now()
    where fingerprint = 'succession:' || candidate_row.id::text
      and task_type = 'new_edition_candidate' and status = 'open'
      and event_id = candidate_row.event_id and source_id = candidate_row.source_id
      and (edition_id is null or edition_id = candidate_row.draft_edition_id);
  end loop;

  -- Intentionally keep this verifier unchanged. It sees our own uncommitted
  -- publication, performs the complete 14-field review and records real
  -- auth.uid()/source_checked_at. An exception rolls EVERYTHING above back.
  freshness_result := public.verify_freshness_review_editions(edition_ids, notes, p_evidence);
  if freshness_result->>'requested_count' is distinct from requested_count::text
     or freshness_result->>'verified_count' is distinct from requested_count::text
     or freshness_result->'freshness_verified' is distinct from 'true'::jsonb
     or freshness_result->'automatic_fact_changes' is distinct from 'false'::jsonb
     or jsonb_typeof(freshness_result->'verified_edition_ids') is distinct from 'array'
     or (select array_agg(value::uuid order by value::uuid)
       from jsonb_array_elements_text(freshness_result->'verified_edition_ids')) is distinct from edition_ids then
    raise exception 'freshness verification did not confirm the complete publication batch'
      using errcode = 'P0001';
  end if;
  perform set_config('app.change_source', coalesce(previous_change_source, ''), true);
  perform set_config('app.change_reason', coalesce(previous_change_reason, ''), true);
  perform set_config('app.source_url', coalesce(previous_source_url, ''), true);
  return jsonb_build_object('requested_count', requested_count,
    'approved_count', requested_count, 'approved_candidate_ids', to_jsonb(ordered_candidate_ids),
    'published_edition_ids', to_jsonb(edition_ids), 'publication_verified', true,
    'freshness', freshness_result);
end;
$$;
revoke all on function public.approve_edition_succession_candidates(uuid[], integer, text, jsonb)
  from public, anon, service_role;
grant execute on function public.approve_edition_succession_candidates(uuid[], integer, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
commit;

