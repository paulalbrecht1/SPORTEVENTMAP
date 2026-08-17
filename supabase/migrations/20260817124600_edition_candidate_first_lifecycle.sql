-- Candidate-first successor lifecycle. Detection remains private and never
-- creates or publishes an event edition. Only an explicit admin approval may
-- materialize a validated candidate.

begin;

alter table public.edition_succession_candidates
  add column if not exists validation_status text not null default 'pending',
  add column if not exists validation_reasons text[] not null default '{}'::text[],
  add column if not exists validated_at timestamptz;

alter table public.edition_succession_candidates
  drop constraint if exists edition_succession_validation_status_check;
alter table public.edition_succession_candidates
  add constraint edition_succession_validation_status_check check (
    validation_status in ('pending', 'validated', 'blocked', 'conflict')
  );

create index if not exists edition_succession_validation_review_idx
  on public.edition_succession_candidates(validation_status, candidate_status, last_detected_at)
  where candidate_status in ('detected', 'draft_created', 'conflict');

-- A user-owned Season Planner result must keep its concrete edition reference.
-- Deleting an edition (or its parent event through CASCADE) is therefore
-- rejected while a planner row still references that edition.
alter table public.season_planner_events
  drop constraint if exists season_planner_events_edition_id_fkey;
alter table public.season_planner_events
  add constraint season_planner_events_edition_id_fkey
  foreign key (edition_id) references public.event_editions(id) on delete restrict;

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

  select * into event_row from public.events where id = source_row.event_id;
  if event_row.id is null then
    raise exception 'source event not found' using errcode = 'P0002';
  end if;

  select * into crawl_row
  from public.source_crawl_results
  where id = p_crawl_result_id;
  if crawl_row.id is null
     or crawl_row.source_id <> source_row.id
     or crawl_row.event_id <> source_row.event_id then
    return jsonb_build_object('accepted', false, 'reason', 'crawl_source_event_mismatch');
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

create or replace function public.approve_edition_succession_candidates(
  p_candidate_ids uuid[] default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  candidate_row public.edition_succession_candidates;
  source_row public.event_sources;
  crawl_row public.source_crawl_results;
  event_row public.events;
  existing_edition public.event_editions;
  created_edition public.event_editions;
  approved_ids uuid[] := '{}'::uuid[];
  approved_count integer := 0;
  blocked_count integer := 0;
  blocked_reasons text[];
begin
  if not (select private.is_admin()) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if p_candidate_ids is null or cardinality(p_candidate_ids) = 0 then
    raise exception 'explicit candidate ids are required' using errcode = '22023';
  end if;

  for candidate_row in
    select * from public.edition_succession_candidates
    where id = any(p_candidate_ids)
      and candidate_status = 'detected'
      and validation_status = 'validated'
    order by confidence desc, first_detected_at, id
    limit greatest(1, least(coalesce(p_limit, 100), 100))
    for update skip locked
  loop
    blocked_reasons := '{}'::text[];
    select * into source_row from public.event_sources
    where id = candidate_row.source_id for update;
    select * into crawl_row from public.source_crawl_results
    where id = candidate_row.crawl_result_id;
    select * into event_row from public.events
    where id = candidate_row.event_id for update;

    if source_row.id is null or source_row.event_id <> candidate_row.event_id
       or not source_row.is_active or source_row.consecutive_failures <> 0
       or source_row.crawl_status not in ('success', 'not_modified')
       or source_row.source_url !~* '^https://[^[:space:]]+$'
       or not (
         source_row.source_type in ('official_event_website', 'official_registration_platform')
         or (
           source_row.source_type in ('organizer_calendar', 'federation_calendar')
           and source_row.source_priority <= 50
         )
       ) then
      blocked_reasons := array_append(blocked_reasons, 'source_gate_changed');
    end if;
    if crawl_row.id is null or crawl_row.source_id <> candidate_row.source_id
       or crawl_row.event_id <> candidate_row.event_id
       or crawl_row.processing_status <> 'completed'
       or crawl_row.error_type is not null
       or crawl_row.http_status is null
       or crawl_row.http_status not between 200 and 299 then
      blocked_reasons := array_append(blocked_reasons, 'crawl_gate_changed');
    end if;
    if candidate_row.candidate_start_date <= current_date
       or extract(year from candidate_row.candidate_start_date)::smallint <>
          candidate_row.candidate_year then
      blocked_reasons := array_append(blocked_reasons, 'candidate_date_no_longer_valid');
    end if;
    if lower(coalesce(candidate_row.evidence->>'risk_signals', ''))
         ~ '(cancel|abgesagt|postpon|verschob)' then
      blocked_reasons := array_append(blocked_reasons, 'high_risk_evidence_present');
    end if;
    if exists (
      select 1 from public.edition_succession_candidates conflict
      where conflict.event_id = candidate_row.event_id
        and conflict.candidate_year = candidate_row.candidate_year
        and conflict.id <> candidate_row.id
        and conflict.candidate_start_date <> candidate_row.candidate_start_date
        and conflict.candidate_status in ('detected', 'draft_created', 'conflict')
    ) then
      blocked_reasons := array_append(blocked_reasons, 'contradictory_candidate_date');
    end if;
    if exists (
      select 1 from public.event_field_controls control
      where control.event_id = candidate_row.event_id
        and control.edition_id is null
        and control.is_locked
        and (control.lock_expires_at is null or control.lock_expires_at > now())
        and control.field_name in ('new_edition', 'edition_year', 'start_date', 'date')
    ) then
      blocked_reasons := array_append(blocked_reasons, 'manual_lock_active');
    end if;
    if exists (
      select 1 from public.validation_issues issue
      where issue.event_id = candidate_row.event_id
        and issue.status = 'open'
        and issue.severity in ('error', 'critical')
    ) then
      blocked_reasons := array_append(blocked_reasons, 'critical_validation_issue_open');
    end if;

    select * into existing_edition
    from public.event_editions
    where event_id = candidate_row.event_id
      and edition_year = candidate_row.candidate_year
    for update;
    if existing_edition.id is not null then
      blocked_reasons := array_append(blocked_reasons,
        case when existing_edition.start_date is distinct from candidate_row.candidate_start_date
          then 'edition_year_date_conflict'
          else 'edition_already_exists' end
      );
    end if;

    if cardinality(blocked_reasons) > 0 then
      update public.edition_succession_candidates
      set validation_status = case
            when blocked_reasons && array['contradictory_candidate_date', 'edition_year_date_conflict']::text[]
              then 'conflict' else 'blocked' end,
          candidate_status = case
            when blocked_reasons && array['contradictory_candidate_date', 'edition_year_date_conflict']::text[]
              then 'conflict' else candidate_status end,
          validation_reasons = array(
            select distinct reason from unnest(validation_reasons || blocked_reasons) reason order by reason
          ),
          validated_at = now(), updated_at = now()
      where id = candidate_row.id;
      blocked_count := blocked_count + 1;
      continue;
    end if;

    perform set_config('app.change_source', 'admin', true);
    perform set_config('app.change_reason',
      'Explicit approval of a validated next-edition candidate', true);
    perform set_config('app.source_url', source_row.source_url, true);

    insert into public.event_editions (
      event_id, edition_year, edition_slug, legacy_event_key,
      start_date, end_date, registration_url, registration_status,
      edition_status, publication_status, race_formats, legacy_distance,
      source_url, verification_status, data_confidence, needs_review,
      review_priority, next_check_at, discovery_status,
      predecessor_edition_id, generated_from_source_id, generated_from_candidate_id,
      auto_publish_eligible, published_at
    ) values (
      candidate_row.event_id,
      candidate_row.candidate_year,
      event_row.slug || '-' || candidate_row.candidate_year::text,
      lower(btrim(coalesce(event_row.canonical_name, event_row.event_name, '')) || '|' ||
        to_char(candidate_row.candidate_start_date, 'DD.MM.YYYY') || '|' ||
        btrim(coalesce(event_row.city, '')) || '|' || btrim(coalesce(event_row.country, ''))),
      candidate_row.candidate_start_date,
      candidate_row.candidate_end_date,
      candidate_row.registration_url,
      'unknown',
      'scheduled',
      'published',
      '[]'::jsonb,
      null,
      candidate_row.source_url,
      'needs_review',
      candidate_row.confirmed_confidence,
      true,
      'high',
      now() + interval '7 days',
      'active',
      candidate_row.predecessor_edition_id,
      candidate_row.source_id,
      candidate_row.id,
      false,
      now()
    ) returning * into created_edition;

    -- Edition-bound predecessor sources do not satisfy freshness joins for the
    -- new edition. Register the exact evidence source for the new edition and
    -- force a fresh crawl instead of copying its old technical verification.
    if source_row.edition_id is not null then
      insert into public.event_sources (
        event_id, edition_id, source_type, source_url, source_priority,
        parser_type, is_active, next_fetch_at, crawl_status,
        consecutive_failures
      ) values (
        candidate_row.event_id, created_edition.id, source_row.source_type,
        source_row.source_url, source_row.source_priority, source_row.parser_type,
        true, now(), 'pending', 0
      ) on conflict do nothing;
    end if;

    update public.edition_succession_candidates
    set candidate_status = 'approved', draft_edition_id = created_edition.id,
        reviewed_at = now(), reviewed_by = (select auth.uid()),
        review_notes = 'Validated candidate explicitly approved by admin',
        updated_at = now()
    where id = candidate_row.id;
    update public.source_review_tasks
    set status = 'resolved', edition_id = created_edition.id,
        reviewed_at = now(), reviewed_by = (select auth.uid()),
        review_notes = 'Validated successor candidate approved by admin',
        updated_at = now()
    where fingerprint = 'succession:' || candidate_row.id::text and status = 'open';

    approved_ids := array_append(approved_ids, candidate_row.id);
    approved_count := approved_count + 1;
  end loop;

  return jsonb_build_object(
    'approved_count', approved_count,
    'blocked_count', blocked_count,
    'candidate_ids', approved_ids
  );
end;
$$;

revoke all on function public.approve_edition_succession_candidates(uuid[], integer)
  from public, anon;
grant execute on function public.approve_edition_succession_candidates(uuid[], integer)
  to authenticated;

create or replace function private.run_edition_lifecycle(p_reference_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  settings public.edition_lifecycle_settings;
  run_id bigint;
  archived_count integer := 0;
  activated_count integer := 0;
  scheduled_sources integer := 0;
begin
  select * into settings from public.edition_lifecycle_settings where singleton;
  insert into public.data_workflow_runs(job_type, run_status, trigger_source)
  values ('edition_lifecycle', 'running', 'cron') returning id into run_id;
  perform set_config('app.change_source', 'cron', true);
  perform set_config('app.change_reason', 'Automatic edition lifecycle transition', true);

  update public.event_editions edition
  set edition_status = case when edition.edition_status = 'scheduled'
        then 'completed' else edition.edition_status end,
      discovery_status = 'detail_only',
      discovery_archived_at = coalesce(edition.discovery_archived_at, now()),
      archive_reason = coalesce(edition.archive_reason,
        case when edition.edition_status = 'cancelled' then 'event_cancelled'
             else 'event_completed' end),
      results_status = case
        when edition.edition_status = 'scheduled' and edition.results_status = 'not_expected'
          then 'expected'
        else edition.results_status end,
      updated_at = now()
  where edition.publication_status = 'published'
    and edition.edition_status in ('scheduled', 'cancelled')
    and coalesce(edition.end_date, edition.start_date) <
      p_reference_date - settings.completion_grace_days
    and (
      edition.discovery_status <> 'detail_only'
      or edition.edition_status = 'scheduled'
    );
  get diagnostics archived_count = row_count;

  update public.event_editions edition
  set discovery_status = 'active', discovery_archived_at = null,
      archive_reason = null, updated_at = now()
  where edition.publication_status = 'published'
    and edition.edition_status not in ('cancelled', 'inactive', 'completed')
    and (edition.start_date is null or coalesce(edition.end_date, edition.start_date) >= p_reference_date)
    and edition.discovery_status <> 'active';
  get diagnostics activated_count = row_count;

  update public.event_sources source
  set next_fetch_at = least(
        coalesce(source.next_fetch_at, now() + make_interval(days => settings.successor_recheck_days)),
        now() + make_interval(days => settings.successor_recheck_days)
      ),
      updated_at = now()
  where source.is_active
    and exists (
      select 1 from public.event_editions past
      where past.event_id = source.event_id
        and past.discovery_status = 'detail_only'
        and past.edition_status = 'completed'
        and not exists (
          select 1 from public.event_editions future
          where future.event_id = past.event_id
            and future.edition_year > past.edition_year
            and future.publication_status = 'published'
        )
    );
  get diagnostics scheduled_sources = row_count;

  update public.validation_issues
  set status = 'resolved', resolved_at = now(), updated_at = now()
  where status = 'open'
    and rule_code in ('future_date_unverified', 'edition_verification_stale',
      'missing_start_time', 'missing_price');

  update public.data_workflow_runs
  set run_status = 'succeeded', finished_at = now(),
      processed_count = archived_count + activated_count,
      changed_count = archived_count + activated_count,
      metadata = jsonb_build_object(
        'archived_editions', archived_count,
        'activated_editions', activated_count,
        'successor_sources_scheduled', scheduled_sources,
        'reference_date', p_reference_date
      )
  where id = run_id;

  return jsonb_build_object(
    'run_id', run_id,
    'archived_editions', archived_count,
    'activated_editions', activated_count,
    'successor_sources_scheduled', scheduled_sources
  );
exception when others then
  update public.data_workflow_runs
  set run_status = 'failed', finished_at = now(), error_count = 1,
      error_message = left(sqlerrm, 2000)
  where id = run_id;
  raise;
end;
$$;

revoke all on function private.run_edition_lifecycle(date)
  from public, anon, authenticated;
grant execute on function private.run_edition_lifecycle(date) to service_role;

create or replace view public.admin_event_edition_lifecycle_state
with (security_invoker = true)
as
select
  event.id as event_id,
  latest.id as latest_edition_id,
  latest.edition_year as latest_edition_year,
  latest.edition_status as latest_edition_status,
  latest.start_date as latest_edition_start_date,
  upcoming.id as upcoming_edition_id,
  candidate.id as open_candidate_id,
  candidate.validation_status as candidate_validation_status,
  case
    when upcoming.id is not null then 'upcoming'
    when candidate.id is not null then 'candidate_under_review'
    when latest.edition_status = 'completed' then 'next_edition_unknown_watching'
    else 'no_edition'
  end as lifecycle_state,
  source_state.active_source_count,
  source_state.next_source_check_at
from public.events event
left join lateral (
  select edition.id, edition.edition_year, edition.edition_status, edition.start_date
  from public.event_editions edition
  where edition.event_id = event.id and edition.publication_status = 'published'
  order by edition.edition_year desc, edition.start_date desc nulls last, edition.id
  limit 1
) latest on true
left join lateral (
  select edition.id
  from public.event_editions edition
  where edition.event_id = event.id
    and edition.publication_status = 'published'
    and edition.edition_status = 'scheduled'
    and coalesce(edition.end_date, edition.start_date) >= current_date
  order by edition.start_date, edition.edition_year, edition.id
  limit 1
) upcoming on true
left join lateral (
  select succession.id, succession.validation_status
  from public.edition_succession_candidates succession
  where succession.event_id = event.id
    and succession.candidate_status in ('detected', 'draft_created', 'conflict')
  order by case succession.validation_status
      when 'conflict' then 0 when 'blocked' then 1 when 'validated' then 2 else 3 end,
    succession.last_detected_at desc, succession.id
  limit 1
) candidate on true
left join lateral (
  select count(*) filter (where source.is_active)::integer as active_source_count,
    min(source.next_fetch_at) filter (where source.is_active) as next_source_check_at
  from public.event_sources source
  where source.event_id = event.id
) source_state on true
where coalesce((select auth.jwt()->>'role'), '') = 'service_role'
   or (select private.is_admin());

revoke all on public.admin_event_edition_lifecycle_state
  from public, anon, authenticated;
grant select on public.admin_event_edition_lifecycle_state to authenticated;

comment on view public.admin_event_edition_lifecycle_state is
  'Derived event-level state for upcoming editions, candidate review, and next-edition watching.';

-- Keep the existing P0-P3 review model, but expose the already existing admin
-- approval action only for candidates that passed every validation gate.
alter view public.admin_review_inbox rename to admin_review_inbox_candidate_first_base;

create view public.admin_review_inbox
with (security_invoker = true)
as
select
  base.item_type,
  base.item_id,
  base.event_id,
  base.edition_id,
  base.priority,
  base.title,
  base.description,
  base.confidence,
  base.status,
  base.created_at,
  case
    when base.item_type = 'new_edition'
      and candidate.candidate_status = 'detected'
      and candidate.validation_status = 'validated'
      then 'approve_successor'
    else base.batch_action
  end as batch_action,
  coalesce(base.metadata, '{}'::jsonb) || case
    when candidate.id is null then '{}'::jsonb
    else jsonb_build_object(
      'validation_status', candidate.validation_status,
      'validation_reasons', to_jsonb(candidate.validation_reasons),
      'validated_at', candidate.validated_at,
      'candidate_first', true
    )
  end as metadata
from public.admin_review_inbox_candidate_first_base base
left join public.edition_succession_candidates candidate
  on base.item_type = 'new_edition' and base.item_id = candidate.id::text
where (select private.is_admin());

revoke all on public.admin_review_inbox from public, anon, authenticated;
grant select on public.admin_review_inbox to authenticated;

comment on view public.admin_review_inbox is
  'P0-P3 admin queue; only fully validated next-edition candidates expose an explicit approval action.';

comment on function public.register_edition_successor_candidate(uuid, bigint, jsonb, text) is
  'Validates source-bound next-edition evidence and records a private candidate without creating an edition.';
comment on function public.approve_edition_succession_candidates(uuid[], integer) is
  'Materializes explicitly selected validated candidates; never copies edition-specific predecessor facts.';

commit;
