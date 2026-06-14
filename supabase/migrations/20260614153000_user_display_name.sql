-- User display name: a public author label shown on public courses.
--
-- It lives on `profiles` with the rest of the profile, but `profiles` RLS is
-- own-row-only (so credits/preferences stay private). Reading ANOTHER user's
-- name — to label who authored a public course — therefore goes through a view
-- that exposes ONLY user_id + display_name, and only for users who own at least
-- one public course. The view runs with its owner's rights (NOT
-- security_invoker), so it bypasses the base table's RLS — but it can never
-- reveal more than the two projected columns for that limited set of users.

alter table public.profiles
  add column display_name text check (char_length(display_name) <= 50);

-- The column-level grant list is the real write lockdown (RLS still scopes the
-- row to the caller); allow a user to set its own display_name, like the pet
-- preference columns.
grant update (display_name) on public.profiles to authenticated;

create view public.public_profiles as
  select p.user_id, p.display_name
  from public.profiles p
  where p.display_name is not null
    and exists (
      select 1
      from public.courses c
      where c.owner_id = p.user_id and c.visibility = 'public'
    );

grant select on public.public_profiles to anon, authenticated;
