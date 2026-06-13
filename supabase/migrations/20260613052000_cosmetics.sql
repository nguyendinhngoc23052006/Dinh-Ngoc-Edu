-- Phase 5 + 6: cosmetics market. Themes recolor the whole app (homepage and
-- courses) via CSS variables; pets are a companion that walks around while you
-- study. Both are bought with credits, so one catalog table and one ownership
-- table serve both kinds, and credit spending goes through SECURITY DEFINER
-- RPCs (clients can't write credits or the equipped slots directly).

create table public.cosmetics (
  id text primary key,
  kind text not null check (kind in ('theme', 'pet')),
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  -- theme: CSS variable overrides; pet: { "sprite": "🐱" }.
  data jsonb not null default '{}',
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.cosmetics enable row level security;
-- The catalog is world-readable; rows are seeded by migration only.
create policy "cosmetics: anyone can read" on public.cosmetics
  for select using (true);

create table public.user_cosmetics (
  user_id uuid not null references auth.users (id) on delete cascade,
  cosmetic_id text not null references public.cosmetics (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, cosmetic_id)
);

create index user_cosmetics_cosmetic_id_idx
  on public.user_cosmetics (cosmetic_id);

alter table public.user_cosmetics enable row level security;
-- Read your own inventory. Inserts happen only inside purchase_cosmetic (a
-- SECURITY DEFINER function that bypasses RLS), so there is no insert policy.
create policy "user_cosmetics: own rows" on public.user_cosmetics
  for select using (user_id = (select auth.uid()));

-- Buy a cosmetic: atomically check funds, deduct credits, grant ownership.
-- Locks the balance row so concurrent buys can't overspend; refuses a re-buy.
-- Returns the new balance.
create function public.purchase_cosmetic(p_cosmetic_id text)
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
  select * into item from cosmetics where id = p_cosmetic_id;
  if not found then
    raise exception 'No such item.';
  end if;
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

revoke execute on function public.purchase_cosmetic(text) from public, anon;
grant execute on function public.purchase_cosmetic(text) to authenticated;

-- Equip (or clear, with null) a cosmetic into its kind's slot on the profile.
-- Free (price 0) cosmetics need no ownership; paid ones must be owned.
create function public.equip_cosmetic(p_kind text, p_cosmetic_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  item public.cosmetics;
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  if p_kind not in ('theme', 'pet') then
    raise exception 'Unknown cosmetic kind.';
  end if;
  if p_cosmetic_id is not null then
    select * into item from cosmetics
    where id = p_cosmetic_id and kind = p_kind;
    if not found then
      raise exception 'No such item.';
    end if;
    if item.price > 0 and not exists (
      select 1 from user_cosmetics
      where user_id = caller and cosmetic_id = p_cosmetic_id
    ) then
      raise exception 'You do not own this.';
    end if;
  end if;
  if p_kind = 'theme' then
    update profiles set equipped_theme = p_cosmetic_id where user_id = caller;
  else
    update profiles set equipped_pet = p_cosmetic_id where user_id = caller;
  end if;
end;
$$;

revoke execute on function public.equip_cosmetic(text, text) from public, anon;
grant execute on function public.equip_cosmetic(text, text) to authenticated;

-- Seed the catalog: a free default plus paid options for each kind. Themes set
-- CSS variables read by the app; pets carry an emoji sprite.
insert into public.cosmetics (id, kind, name, description, price, data, sort) values
  ('theme-classic', 'theme', 'Classic Green', 'The original look.', 0,
   '{"--green":"#16a34a","--green-dark":"#15803d","--green-soft":"#dcfce7","--bg":"#f6f8fb","--ink":"#1f2937"}', 0),
  ('theme-sunset', 'theme', 'Sunset', 'Warm oranges and pinks.', 50,
   '{"--green":"#f97316","--green-dark":"#c2410c","--green-soft":"#ffedd5","--bg":"#fff7ed","--ink":"#431407"}', 1),
  ('theme-ocean', 'theme', 'Ocean', 'Cool, calm blues.', 50,
   '{"--green":"#0ea5e9","--green-dark":"#0369a1","--green-soft":"#e0f2fe","--bg":"#f0f9ff","--ink":"#0c4a6e"}', 2),
  ('theme-grape', 'theme', 'Grape', 'Rich purples.', 80,
   '{"--green":"#8b5cf6","--green-dark":"#6d28d9","--green-soft":"#ede9fe","--bg":"#faf5ff","--ink":"#3b0764"}', 3),
  ('theme-midnight', 'theme', 'Midnight', 'A dark, focused mode.', 120,
   '{"--green":"#22d3ee","--green-dark":"#0891b2","--green-soft":"#164e63","--bg":"#0f172a","--ink":"#e2e8f0","--muted":"#94a3b8","--line":"#334155"}', 4),
  ('pet-cat', 'pet', 'Study Cat', 'A calm cat that paces with you.', 40, '{"sprite":"🐱"}', 1),
  ('pet-dog', 'pet', 'Study Dog', 'An eager study buddy.', 40, '{"sprite":"🐶"}', 2),
  ('pet-owl', 'pet', 'Night Owl', 'A wise late-night companion.', 60, '{"sprite":"🦉"}', 3),
  ('pet-dragon', 'pet', 'Tiny Dragon', 'A small dragon hoarding knowledge.', 150, '{"sprite":"🐉"}', 4)
on conflict (id) do nothing;
