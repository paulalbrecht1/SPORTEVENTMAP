-- Additive admin workflow upgrade for existing closed-beta databases.
-- Run after 20260608_closed_beta_security.sql if that migration was already
-- applied before 9 June 2026.

begin;

alter table public.events
  add column if not exists registration_status text not null default 'unclear',
  add column if not exists status_note text,
  add column if not exists last_checked timestamptz,
  add column if not exists review_priority text not null default 'medium',
  add column if not exists needs_review boolean not null default true,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.events
  drop constraint if exists events_registration_status_check;

alter table public.events
  add constraint events_registration_status_check
  check (
    registration_status in (
      'registration_open',
      'registration_not_open',
      'sold_out',
      'cancelled',
      'date_expected',
      'unclear',
      'confirmed'
    )
  );

alter table public.events
  drop constraint if exists events_review_priority_check;

alter table public.events
  add constraint events_review_priority_check
  check (review_priority in ('high', 'medium', 'low'));

create index if not exists events_status_reviewed_at_idx
  on public.events (status, reviewed_at desc);

comment on column public.events.reviewed_at is
  'Timestamp of the most recent admin approval or rejection.';

comment on column public.events.reviewed_by is
  'Auth user UUID of the admin who most recently reviewed the submission.';

comment on column public.events.last_checked is
  'Timestamp of the most recent official-source review.';

comment on column public.events.needs_review is
  'True when the public event still requires a data-quality follow-up.';

commit;
