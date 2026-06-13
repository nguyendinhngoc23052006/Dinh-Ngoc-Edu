-- Phase 7 (part 1): the egg-and-pet system, foundation.
--
-- The pet is no longer a cosmetic you buy: every user owns ONE living pet that
-- starts as an egg, hatches into a random species (weighted by rarity), and
-- evolves through three forms as it gains xp. This migration is purely
-- ADDITIVE — it adds the catalog (species), the per-user pet row (user_pet),
-- and the server-only hatch roll. The old emoji "pet" cosmetics keep working
-- untouched; they are retired later, when the on-screen pet is rewritten to
-- render user_pet (so there is no visual gap).
--
-- Like credits, anything random or valuable is server-authored: clients get
-- read-only RLS on their pet, and stage/species change only inside the
-- SECURITY DEFINER hatch RPC. A client must never be able to pick "mythical".

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

-- One pet per user. An egg has no species; a hatched pet always has one (the
-- check keeps the two states honest). xp only ever grows (pure feeding); the
-- evolution form is DERIVED from xp in the client, so it can never desync.
-- Writes happen through the signup trigger and SECURITY DEFINER RPCs only, so
-- there is no insert/update/delete policy — read-only to the owner.
create table public.user_pet (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stage text not null default 'egg' check (stage in ('egg', 'hatched')),
  species_id text references public.species (id),
  xp integer not null default 0 check (xp >= 0),
  hatched_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_pet_stage_species check (
    (stage = 'egg' and species_id is null)
    or (stage = 'hatched' and species_id is not null)
  )
);

alter table public.user_pet enable row level security;
create policy "user_pet: own row read" on public.user_pet
  for select using (user_id = (select auth.uid()));

-- A lifetime count of pets this user has raised (flavour/history). Bumped on
-- each hatch; cheap and bounded.
alter table public.profiles
  add column pets_hatched integer not null default 0 check (pets_hatched >= 0);

-- Give every user an egg. Replace the signup trigger (fix-forward — the
-- original lives in a merged migration) so new users get both a profile and an
-- egg, then backfill an egg for everyone who already exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  insert into public.user_pet (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

insert into public.user_pet (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Hatch the caller's egg into a random species. The egg must be ready
-- (xp >= EGG_HATCH_XP, kept in lockstep with src/lib/petProgress.ts). The
-- species is chosen by a single weighted draw using the Gumbel/exponential
-- trick: ordering by -ln(random())/weight yields each row with probability
-- proportional to its weight, so rarity weights ARE the drop rates. The whole
-- thing is server-side and row-locked, so the client can neither pick the
-- outcome nor hatch twice (the stage check makes it idempotent). Returns the
-- updated pet row.
create function public.hatch_pet()
returns public.user_pet
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  pet public.user_pet;
  chosen text;
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  select * into pet from user_pet where user_id = caller for update;
  if not found then
    raise exception 'No pet found.';
  end if;
  if pet.stage <> 'egg' then
    raise exception 'Your pet has already hatched.';
  end if;
  if pet.xp < 100 then
    raise exception 'The egg is not ready to hatch yet.';
  end if;
  select id into chosen from species order by -ln(random()) / weight limit 1;
  if chosen is null then
    raise exception 'No species available.';
  end if;
  update user_pet
     set stage = 'hatched', species_id = chosen, hatched_at = now()
   where user_id = caller
  returning * into pet;
  update profiles set pets_hatched = pets_hatched + 1 where user_id = caller;
  return pet;
end;
$$;

revoke execute on function public.hatch_pet() from public, anon;
grant execute on function public.hatch_pet() to authenticated;

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
