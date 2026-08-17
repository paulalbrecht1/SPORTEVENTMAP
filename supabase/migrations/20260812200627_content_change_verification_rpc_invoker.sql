-- The content verification RPC can respect normal admin RLS because every
-- participating table already has explicit admin policies and grants.

begin;

alter function public.verify_content_change_tasks(uuid[], text)
  security invoker;

comment on function public.verify_content_change_tasks(uuid[], text) is
  'RLS-enforced admin batch confirmation of reviewed official-source changes; event facts are never mutated.';

commit;
