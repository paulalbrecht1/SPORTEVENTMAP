-- Run this only if the Admin Review Workflow migration was executed before
-- import_batch/source_type were added locally.
alter table public.events
  add column if not exists import_batch text,
  add column if not exists source_type text not null default 'unknown';

alter table public.events
  drop constraint if exists events_source_type_check;

alter table public.events
  add constraint events_source_type_check
  check (
    source_type in (
      'official',
      'aggregator',
      'user_submission',
      'batch_import',
      'unknown'
    )
  );

comment on column public.events.import_batch is
  'Optional import batch identifier for controlled admin review workflows.';

comment on column public.events.source_type is
  'Source classification for event quality review: official, aggregator, user_submission, batch_import, or unknown.';
