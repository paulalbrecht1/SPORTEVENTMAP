-- Admin review workflow support for outdated/staged events.
-- Run this in Supabase SQL Editor before using persistent archive/staging review states.

alter table public.events
  add column if not exists review_status text not null default 'pending',
  add column if not exists review_note text,
  add column if not exists review_reason text,
  add column if not exists import_batch text,
  add column if not exists source_type text not null default 'unknown',
  add column if not exists updated_at timestamptz not null default now();

alter table public.events
  drop constraint if exists events_status_check;

alter table public.events
  add constraint events_status_check
  check (
    status in (
      'pending',
      'staging',
      'approved',
      'needs_review',
      'date_expected',
      'archived',
      'rejected',
      'duplicate'
    )
  );

alter table public.events
  drop constraint if exists events_review_status_check;

alter table public.events
  add constraint events_review_status_check
  check (
    review_status in (
      'approved',
      'pending',
      'needs_review',
      'rejected',
      'archived',
      'date_expected',
      'duplicate',
      'confirmed_valid'
    )
  );

alter table public.events
  drop constraint if exists events_source_type_check;

alter table public.events
  add constraint events_source_type_check
  check (
    source_type in (
      'official',
      'unknown'
    )
  );

comment on column public.events.review_status is
  'Internal admin review state for launch data-quality workflow.';

comment on column public.events.review_note is
  'Internal admin note. Never show this publicly on event cards.';

comment on column public.events.review_reason is
  'Internal reason for the latest admin review decision.';

comment on column public.events.import_batch is
  'Batch identifier for staged event imports.';

comment on column public.events.source_type is
  'official when the row was verified on an organizer website, otherwise unknown.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;

create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_updated_at();
