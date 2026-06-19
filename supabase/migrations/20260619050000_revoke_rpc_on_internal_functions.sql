-- Revoke unnecessary RPC exposure on internal functions.
--
-- The Supabase linter flagged several SECURITY DEFINER functions as callable
-- via PostgREST RPC by roles that should not invoke them directly:
--
-- 1. handle_new_user(): a trigger function that creates a profile + starter
--    egg on signup — calling it as an RPC would insert orphaned rows.
-- 2. clone_course(): CREATE OR REPLACE in later migrations (difficulty, calc)
--    silently re-inherited the default PUBLIC grant, bypassing the original
--    REVOKE; an anon user could deep-copy any public course without auth.
-- 3. owns_course(): RLS helper used only in write policies (insert/update/
--    delete); anon never reaches those paths, so the EXECUTE grant is dead
--    weight and an unnecessary information-exposure surface.
-- 4. rls_auto_enable(): a Supabase utility/event-trigger function that should
--    not be invokable as an RPC.
--
-- Functions intentionally left as-is:
-- - can_view_course(): anon + authenticated need EXECUTE for the SELECT RLS
--   policies on chapters/nodes/questions to serve public course content; the
--   boolean return leaks nothing beyond what the courses table already exposes.
-- - All pet/food/cosmetic RPCs (adopt_pet, buy_food, equip_cosmetic, feed_pet,
--   hatch_pet, purchase_cosmetic, release_pet, set_active_pet): intentionally
--   SECURITY DEFINER, already restricted to authenticated, validated by
--   auth.uid() + row locks.
-- - public_profiles view (SECURITY DEFINER): intentional bypass of profiles'
--   own-row-only RLS; projects only (user_id, display_name) for public-course
--   authors — making it SECURITY INVOKER would break the feature.

-- 1. handle_new_user: trigger-only, never an RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. clone_course: re-apply the auth-only gate.
revoke execute on function public.clone_course(uuid) from public, anon;
grant execute on function public.clone_course(uuid) to authenticated;

-- 3. owns_course: strip the default PUBLIC grant (which covers anon and
--    authenticated alike), then re-grant to authenticated only — they need
--    EXECUTE for the write RLS policies on chapters/nodes/questions.
revoke execute on function public.owns_course(uuid) from public, anon;
grant execute on function public.owns_course(uuid) to authenticated;

-- 4. rls_auto_enable: guard against the function not existing in all environments.
do $$ begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
