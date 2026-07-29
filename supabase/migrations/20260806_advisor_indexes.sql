-- Cover foreign keys used by review and account-maintenance workflows.
-- These indexes are safe to apply repeatedly and do not change application data.

create index if not exists event_change_proposals_edition_id_idx
  on public.event_change_proposals (edition_id);

create index if not exists events_reviewed_by_idx
  on public.events (reviewed_by);

create index if not exists user_feedback_user_id_idx
  on public.user_feedback (user_id);
