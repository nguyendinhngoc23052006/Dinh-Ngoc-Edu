-- Make credit spends idempotent.
--
-- buy_food and feed_pet ACCUMULATE (qty += , xp +=), so a call whose response
-- was lost — then retried by the user — charged twice. purchase_cosmetic was
-- already replay-safe via its "you already own this" check, but is brought
-- under the same mechanism for uniformity.
--
-- Each spend now takes a client-generated idempotency key. The first call with
-- a given key records it and charges; a replay with the SAME key returns the
-- state as it stood after the original call WITHOUT charging again. The client
-- holds the key stable across retries of one action and rotates it on success
-- (see src/hooks/useIdempotencyKeys.ts), so a retry-after-lost-response is a
-- no-op while a fresh deliberate action charges normally.

create table public.idempotency_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  key uuid not null,
  operation text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.idempotency_keys enable row level security;

-- All writes happen inside the SECURITY DEFINER spend functions below (which
-- run as the table owner and bypass RLS); the client never inserts directly.
-- A caller may read only their own keys.
create policy "own idempotency keys are readable"
  on public.idempotency_keys for select
  using ((select auth.uid()) = user_id);

-- buy_food: deduct credits and add to the stockpile, once per key. -------------
drop function if exists public.buy_food(text, integer);

create function public.buy_food(
  p_food_id text,
  p_qty integer,
  p_idempotency_key uuid
)
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
  if p_idempotency_key is null then
    raise exception 'Missing request key.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Choose how many to buy.';
  end if;
  select * into item from food where id = p_food_id;
  if not found then
    raise exception 'No such food.';
  end if;

  -- Claim the key. On a replay (conflict, nothing inserted) skip the charge and
  -- return the balance as it stands. A raise later rolls the claim back, so a
  -- genuinely failed call can be retried with the same key.
  insert into idempotency_keys (user_id, key, operation)
  values (caller, p_idempotency_key, 'buy_food')
  on conflict (user_id, key) do nothing;
  if not found then
    select credits into balance from profiles where user_id = caller;
    return balance;
  end if;

  -- Self-prune: a key older than a day can never be replayed (the client rotates
  -- its in-memory key on reload), so drop the caller's stale ones to keep the
  -- ledger bounded.
  delete from idempotency_keys
   where user_id = caller and created_at < now() - interval '1 day';

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

revoke execute on function public.buy_food(text, integer, uuid) from public, anon;
grant execute on function public.buy_food(text, integer, uuid) to authenticated;

-- purchase_cosmetic: deduct credits and grant ownership, once per key. ---------
drop function if exists public.purchase_cosmetic(text);

create function public.purchase_cosmetic(
  p_cosmetic_id text,
  p_idempotency_key uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  item public.cosmetics;
  balance integer;
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  if p_idempotency_key is null then
    raise exception 'Missing request key.';
  end if;
  select * into item from cosmetics where id = p_cosmetic_id;
  if not found then
    raise exception 'No such item.';
  end if;

  insert into idempotency_keys (user_id, key, operation)
  values (caller, p_idempotency_key, 'purchase_cosmetic')
  on conflict (user_id, key) do nothing;
  if not found then
    select credits into balance from profiles where user_id = caller;
    return balance;
  end if;

  -- Self-prune stale keys (see buy_food) to keep the ledger bounded.
  delete from idempotency_keys
   where user_id = caller and created_at < now() - interval '1 day';

  -- Ownership is checked here before the balance lock below; safe because only
  -- the call that won the idempotency claim above reaches this point.
  if exists (
    select 1 from user_cosmetics
    where user_id = caller and cosmetic_id = p_cosmetic_id
  ) then
    raise exception 'You already own this.';
  end if;
  select credits into balance from profiles where user_id = caller for update;
  if balance is null then
    raise exception 'Profile not found.';
  end if;
  if balance < item.price then
    raise exception 'Not enough credits.';
  end if;
  update profiles set credits = credits - item.price where user_id = caller;
  insert into user_cosmetics (user_id, cosmetic_id) values (caller, p_cosmetic_id);
  return balance - item.price;
end;
$$;

revoke execute on function public.purchase_cosmetic(text, uuid) from public, anon;
grant execute on function public.purchase_cosmetic(text, uuid) to authenticated;

-- feed_pet: spend owned food for xp, once per key. -----------------------------
drop function if exists public.feed_pet(uuid, text, integer);

create function public.feed_pet(
  p_pet_id uuid,
  p_food_id text,
  p_qty integer,
  p_idempotency_key uuid
)
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
  if p_idempotency_key is null then
    raise exception 'Missing request key.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Choose how much to feed.';
  end if;
  if not exists (
    select 1 from pets where id = p_pet_id and user_id = caller
  ) then
    raise exception 'No such pet.';
  end if;

  insert into idempotency_keys (user_id, key, operation)
  values (caller, p_idempotency_key, 'feed_pet')
  on conflict (user_id, key) do nothing;
  if not found then
    select * into pet from pets where id = p_pet_id and user_id = caller;
    return pet;
  end if;

  -- Self-prune stale keys (see buy_food) to keep the ledger bounded.
  delete from idempotency_keys
   where user_id = caller and created_at < now() - interval '1 day';

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

revoke execute on function public.feed_pet(uuid, text, integer, uuid) from public, anon;
grant execute on function public.feed_pet(uuid, text, integer, uuid) to authenticated;
