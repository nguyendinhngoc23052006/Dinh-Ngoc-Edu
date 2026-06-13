-- Phase 7 (part 3): the on-screen pet now comes from the `pets` table, so the
-- legacy "buy a pet emoji" cosmetic is retired. Also adds a per-user toggle for
-- the pet's encouragement messages.
--
-- The encouragement toggle is client-writable like pet_enabled (a harmless
-- preference), so it gets a column-level update grant; everything else on
-- profiles stays server-controlled.

alter table public.profiles
  add column pet_cheers_enabled boolean not null default true;

-- Grants are additive: this joins the existing update(pet_enabled) grant so a
-- client may flip its own two pet preferences and nothing else.
grant update (pet_cheers_enabled) on public.profiles to authenticated;

-- Retire the legacy pet cosmetics. The companion is now the active row in
-- `pets`, so clear the old equipped slot and remove the seeded pet items.
-- Deleting the catalog rows cascades to user_cosmetics (on delete cascade), so
-- ownership rows go with them. The equipped_pet column and the 'pet' branch of
-- equip_cosmetic are left in place but now unused (a behaviour-preserving
-- structural cleanup can drop them in a standalone follow-up).
update public.profiles set equipped_pet = null where equipped_pet is not null;
delete from public.cosmetics where kind = 'pet';
