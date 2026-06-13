-- Phase 7 (part 1): the egg-and-pet system, foundation.
--
-- Each user keeps a small MENAGERIE: up to 3 pets in storage, exactly one of
-- which is "active" (the companion that walks on screen). A pet starts as an
-- egg, hatches into a random species (weighted by rarity), and evolves through
-- three forms as it gains xp. To adopt a new egg at full storage you must first
-- release one. This migration is ADDITIVE — it adds the catalog (species) and
-- the per-user pets, and never touches the old emoji "pet" cosmetics, which
-- keep working until the on-screen pet is rewritten to render these rows.
--
-- Like credits, anything random or valuable is server-authored: clients get
-- read-only RLS plus the ability to release their own pets; stage/species/xp
-- and the single active flag change only inside SECURITY DEFINER RPCs. A client
-- must never be able to pick "mythical" or own more than three.

create type public.pet_rarity as enum
  ('common', 'rare', 'epic', 'legendary', 'mythical');

-- The species catalog. weight drives the hatch drop rate (relative to the sum
-- of all weights); the three sprites are the evolution forms. Seeded by
-- migration only, world-readable.
create table public.species (
  id text primary key,
  name text not null,
  rarity public.pet_rarity not null,
  weight integer not null check (weight > 0),
  form1_sprite text not null,
  form2_sprite text not null,
  form3_sprite text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.species enable row level security;
create policy "species: anyone can read" on public.species
  for select using (true);

-- A user's pets (≤ 3, enforced in adopt_pet). An egg has no species; a hatched
-- pet always has one (the check keeps the two states honest). xp only ever
-- grows (pure feeding); the evolution form is DERIVED from xp in the client, so
-- it can never desync. is_active marks the single on-screen companion. Writes
-- happen through the signup trigger and SECURITY DEFINER RPCs only (no insert
-- or update policy); a user may read and RELEASE (delete) their own pets.
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stage text not null default 'egg' check (stage in ('egg', 'hatched')),
  species_id text references public.species (id),
  xp integer not null default 0 check (xp >= 0),
  is_active boolean not null default false,
  hatched_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pets_stage_species check (
    (stage = 'egg' and species_id is null)
    or (stage = 'hatched' and species_id is not null)
  )
);

create index pets_user_id_idx on public.pets (user_id);
-- At most one active pet per user. A partial unique index enforces the
-- single-companion invariant no matter what the RPCs do.
create unique index pets_one_active_per_user
  on public.pets (user_id) where is_active;

alter table public.pets enable row level security;
create policy "pets: own rows read" on public.pets
  for select using (user_id = (select auth.uid()));
create policy "pets: own rows release" on public.pets
  for delete using (user_id = (select auth.uid()));

-- A lifetime count of pets this user has raised to a hatch (flavour/history).
alter table public.profiles
  add column pets_hatched integer not null default 0 check (pets_hatched >= 0);

-- Give every user a starter egg (active). Replace the signup trigger
-- (fix-forward — the original lives in a merged migration) so new users get a
-- profile and a first egg, then backfill an egg for anyone who has none.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  insert into public.pets (user_id, is_active) values (new.id, true);
  return new;
end;
$$;

insert into public.pets (user_id, is_active)
select u.id, true from auth.users u
where not exists (select 1 from public.pets p where p.user_id = u.id);

-- Adopt a new egg. Refuses past three pets; the first pet of an empty storage
-- becomes active. Locking the caller's profile row serializes a user's own
-- adopts so two concurrent calls can't both slip past the count and reach four.
-- Returns the new pet row.
create function public.adopt_pet()
returns public.pets
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  cnt integer;
  make_active boolean;
  new_pet public.pets;
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  perform 1 from profiles where user_id = caller for update;
  select count(*) into cnt from pets where user_id = caller;
  if cnt >= 3 then
    raise exception 'Your storage is full (3 pets). Release one first.';
  end if;
  select not exists (select 1 from pets where user_id = caller and is_active)
    into make_active;
  insert into pets (user_id, is_active) values (caller, make_active)
  returning * into new_pet;
  return new_pet;
end;
$$;

revoke execute on function public.adopt_pet() from public, anon;
grant execute on function public.adopt_pet() to authenticated;

-- Hatch one of the caller's eggs into a random species. The egg must be ready
-- (xp >= EGG_HATCH_XP, kept in lockstep with src/lib/petProgress.ts). The
-- species is chosen by a single weighted draw using the Gumbel/exponential
-- trick: ordering by -ln(random())/weight yields each row with probability
-- proportional to its weight, so rarity weights ARE the drop rates. The whole
-- thing is server-side and row-locked, so the client can neither pick the
-- outcome nor hatch twice (the stage check makes it idempotent). Returns the
-- updated pet row.
create function public.hatch_pet(p_pet_id uuid)
returns public.pets
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  pet public.pets;
  chosen text;
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  select * into pet from pets
   where id = p_pet_id and user_id = caller for update;
  if not found then
    raise exception 'No such pet.';
  end if;
  if pet.stage <> 'egg' then
    raise exception 'Your pet has already hatched.';
  end if;
  if pet.xp < 100 then -- EGG_HATCH_XP in src/lib/petProgress.ts; keep in lockstep
    raise exception 'The egg is not ready to hatch yet.';
  end if;
  select id into chosen from species order by -ln(random()) / weight limit 1;
  if chosen is null then
    raise exception 'No species available.';
  end if;
  update pets
     set stage = 'hatched', species_id = chosen, hatched_at = now()
   where id = p_pet_id
  returning * into pet;
  update profiles set pets_hatched = pets_hatched + 1 where user_id = caller;
  return pet;
end;
$$;

revoke execute on function public.hatch_pet(uuid) from public, anon;
grant execute on function public.hatch_pet(uuid) to authenticated;

-- Make one of the caller's pets the single active companion. Two statements
-- (clear the others, then set this one) keep the partial unique index happy.
create function public.set_active_pet(p_pet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  if not exists (
    select 1 from pets where id = p_pet_id and user_id = caller
  ) then
    raise exception 'No such pet.';
  end if;
  update pets set is_active = false
   where user_id = caller and is_active and id <> p_pet_id;
  update pets set is_active = true where id = p_pet_id;
end;
$$;

revoke execute on function public.set_active_pet(uuid) from public, anon;
grant execute on function public.set_active_pet(uuid) to authenticated;

-- Seed the roster: two species per rarity (one mythical), with weights summing
-- to 100 so they read as headline drop rates — common 60%, rare 24%, epic 10%,
-- legendary 4%, mythical 2%. Sprites are emoji placeholders for now (the
-- on-screen renderer arrives in a later PR) and escalate across the three forms.
insert into public.species (id, name, rarity, weight, form1_sprite, form2_sprite, form3_sprite, sort) values
  ('spc-chick',    'Pip',       'common',    30, '🐣', '🐥', '🐔', 0),
  ('spc-bug',      'Nibbles',   'common',    30, '🐛', '🐝', '🦋', 1),
  ('spc-fox',      'Cinder',    'rare',      12, '🦊', '🐺', '🦁', 2),
  ('spc-otter',    'Ripple',    'rare',      12, '🦦', '🐬', '🐋', 3),
  ('spc-cat',      'Ember',     'epic',       5, '🐈', '🐅', '🦁', 4),
  ('spc-raptor',   'Talon',     'epic',       5, '🦅', '🦖', '🐉', 5),
  ('spc-wyrm',     'Frost',     'legendary',  2, '🐍', '🐲', '🐉', 6),
  ('spc-phoenix',  'Solara',    'legendary',  2, '🐦', '🦅', '🔥', 7),
  ('spc-kirin',    'Astra',     'mythical',   2, '🐎', '🦄', '🌟', 8)
on conflict (id) do nothing;
