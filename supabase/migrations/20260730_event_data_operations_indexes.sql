-- Cover operational foreign keys and give the private validation staging table
-- a stable row identity for maintenance and database-advisor compatibility.

alter table private.validation_issue_detections
  add column detection_id bigint generated always as identity primary key;

create index if not exists event_sources_edition_id_idx
  on public.event_sources (edition_id)
  where edition_id is not null;

create index if not exists validation_issues_edition_id_idx
  on public.validation_issues (edition_id)
  where edition_id is not null;

create index if not exists validation_issues_resolved_by_idx
  on public.validation_issues (resolved_by)
  where resolved_by is not null;

create index if not exists event_audit_log_changed_by_idx
  on public.event_audit_log (changed_by)
  where changed_by is not null;
