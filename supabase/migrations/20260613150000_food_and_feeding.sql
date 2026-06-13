-- Phase 7 (part 2): food, feeding, and pet storage management.
--
-- Food is bought with credits into a per-user inventory, then spent to feed a
-- pet, raising its xp (which hatches an egg and later evolves it). Buying and
-- feeding are SECURITY DEFINER RPCs for the same reason credits are: a client
-- must not write its own balance, inventory, or pet xp. Releasing a pet also
-- becomes an RPC so it can atomically promote another pet into the now-empty
-- active slot — so the delete policy added in part 1 is dropped here.

-- The food catalog: each tier trades price for xp (bulk is cheaper per xp).
-- Seeded by migration only, world-readable.
create table public.food (
  id text primary key,
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  xp_value integer not null check (xp_value > 0),
  sprite text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.food enable row level security;
create policy "food: anyone can read" on public.food
  for select using (true);

-- A user's food stockpile. qty changes only inside buy_food / feed_pet (no
-- insert/update policy); the owner may read their own rows.
create table public.user_food (
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id text not null references public.food (id) on delete cascade,
  qty integer not null check (qty >= 0),
  primary key (user_id, food_id)
);

alter table public.user_food enable row level security;
create policy "user_food: own rows read" on public.user_food
  for select using (user_id = (select auth.uid()));

-- Release now goes through release_pet (below), which also promotes a
-- replacement — so the direct client delete from part 1 is no longer allowed.
drop policy "pets: own rows release" on public.pets;

-- Buy food: re-derive the cost server-side, lock the balance so concurrent buys
-- can't overspend, deduct, and add to the stockpile. Returns the new balance.
create function public.buy_food(p_food_id text, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  item public.food;
  balance integer;
  cost integer;
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Choose how many to buy.';
  end if;
  select * into item from food where id = p_food_id;
  if not found then
    raise exception 'No such food.';
  end if;
  cost := item.price * p_qty;
  select credits into balance from profiles where user_id = caller for update;
  if balance is null then
    raise exception 'Profile not found.';
  end if;
  if balance < cost then
    raise exception 'Not enough credits.';
  end if;
  update profiles set credits = credits - cost where user_id = caller;
  insert into user_food (user_id, food_id, qty) values (caller, p_food_id, p_qty)
  on conflict (user_id, food_id) do update set qty = user_food.qty + excluded.qty;
  return balance - cost;
end;
$$;

revoke execute on function public.buy_food(text, integer) from public, anon;
grant execute on function public.buy_food(text, integer) to authenticated;

-- Feed a pet: spend owned food to add xp. Locks the inventory row so the same
-- food can't be double-spent, refuses if the caller lacks the quantity or the
-- pet, and adds xp_value * qty. Returns the updated pet row. Hatching/evolving
-- is a separate explicit step (the egg-ready/evolve thresholds live in
-- src/lib/petProgress.ts); this only grows xp.
create function public.feed_pet(p_pet_id uuid, p_food_id text, p_qty integer)
returns public.pets
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  have integer;
  gain integer;
  pet public.pets;
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Choose how much to feed.';
  end if;
  if not exists (
    select 1 from pets where id = p_pet_id and user_id = caller
  ) then
    raise exception 'No such pet.';
  end if;
  select qty into have from user_food
   where user_id = caller and food_id = p_food_id for update;
  if have is null or have < p_qty then
    raise exception 'You do not have that much food.';
  end if;
  select xp_value into gain from food where id = p_food_id;
  update user_food set qty = qty - p_qty
   where user_id = caller and food_id = p_food_id;
  update pets set xp = xp + gain * p_qty
   where id = p_pet_id
  returning * into pet;
  return pet;
end;
$$;

revoke execute on function public.feed_pet(uuid, text, integer) from public, anon;
grant execute on function public.feed_pet(uuid, text, integer) to authenticated;

-- Release (permanently delete) one of the caller's pets to free a storage slot.
-- If it was the active companion, promote the oldest remaining pet into the
-- active slot so the user is never left with pets but none on screen. Row-locked
-- and ownership-checked; the partial unique index still guarantees one active.
create function public.release_pet(p_pet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  pet public.pets;
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  select * into pet from pets
   where id = p_pet_id and user_id = caller for update;
  if not found then
    raise exception 'No such pet.';
  end if;
  delete from pets where id = p_pet_id;
  if pet.is_active then
    update pets set is_active = true
     where id = (
       select id from pets where user_id = caller
       order by created_at asc limit 1
     );
  end if;
end;
$$;

revoke execute on function public.release_pet(uuid) from public, anon;
grant execute on function public.release_pet(uuid) to authenticated;

-- Seed three food tiers: cheap snack → meal → feast, each cheaper per xp than
-- the last to reward saving up.
insert into public.food (id, name, description, price, xp_value, sprite, sort) values
  ('food-berry', 'Berry',       'A quick snack.',            5,  10,  '🫐', 0),
  ('food-meal',  'Hearty Meal', 'A filling plate.',          20, 50,  '🍲', 1),
  ('food-feast', 'Royal Feast', 'A lavish spread.',          60, 200, '🍱', 2)
on conflict (id) do nothing;
