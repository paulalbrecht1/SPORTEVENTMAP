-- Keep admin batch approvals inside the caller's RLS context.
-- The functions still enforce private.is_admin(), while SECURITY INVOKER also
-- prevents their table access from ever exceeding the authenticated admin's grants.

alter function public.approve_edition_succession_candidates(uuid[], integer)
  security invoker;

alter function public.approve_edition_result_candidates(uuid[], integer)
  security invoker;

-- The existing Source Monitor table was intentionally read-only for admins.
-- Batch lifecycle approval also resolves the corresponding review task, so the
-- caller needs an admin-only UPDATE policy and matching table grant.
create policy source_review_tasks_admin_update
on public.source_review_tasks for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

grant update on public.source_review_tasks to authenticated;
