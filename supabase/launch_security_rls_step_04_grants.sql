-- Step 04: Grants
-- RLS policies above still decide which rows are visible or mutable.

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, email, role) on public.profiles to authenticated;
grant update (display_name, preferred_language, updated_at) on public.profiles to authenticated;

revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

revoke all on public.season_planner_events from anon, authenticated;
grant select, insert, update, delete on public.season_planner_events to authenticated;

revoke all on public.user_feedback from anon, authenticated;
grant insert (
  user_id,
  session_id,
  rating,
  category,
  summary,
  message,
  page,
  product_area,
  event_id,
  screenshot_hint
) on public.user_feedback to anon, authenticated;
grant select, update, delete on public.user_feedback to authenticated;

revoke all on public.analytics_events from anon, authenticated;
grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;

grant usage on schema public to anon, authenticated;
grant usage on schema private to anon, authenticated;

select 'step 04 grants done' as result;
