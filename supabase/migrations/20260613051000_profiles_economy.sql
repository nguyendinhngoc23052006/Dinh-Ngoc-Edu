-- Phase 4: credits economy.
--
-- profiles holds each user's credit balance and cosmetic preferences. Credits
-- are earned by finishing a lesson with zero mistakes (once per lesson) and are
-- spent on themes/pets (next phase). Because credits are spendable currency,
-- clients must NEVER write the balance directly: blanket UPDATE is revoked and
-- only the harmless pet preference column is granted back. The balance is moved
-- only by trusted server code — the complete-lesson Edge Function (service role,
-- after re-grading) and the purchase RPCs — which bypass these grants.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 0 check (credits >= 0),
  pet_enabled boolean not null default true,
  equipped_theme text,
  equipped_pet text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: own row read" on public.profiles
  for select using (user_id = (select auth.uid()));
create policy "profiles: own row update" on public.profiles
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Column-level lockdown: a client may toggle only its pet preference. credits
-- and the equipped_* slots are off-limits to direct writes (equip goes through
-- an ownership-checked RPC in the cosmetics migration). RLS scopes the row;
-- these grants scope the columns.
revoke update on public.profiles from anon, authenticated;
grant update (pet_enabled) on public.profiles to authenticated;

-- Every user gets exactly one profile row, created on signup and backfilled for
-- anyone who already exists. SECURITY DEFINER so the insert bypasses RLS.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- A lesson's credit prize, derived at generation time from how hard its
-- questions are (easy=1, medium=2, hard=3, summed). 0 for pre-feature lessons.
alter table public.nodes
  add column credit_prize integer not null default 0 check (credit_prize >= 0);

-- credited flips true the first (and only) time a user finishes this lesson
-- with no mistakes — the idempotency guard that stops a second flawless run
-- from paying out again.
alter table public.node_progress
  add column credited boolean not null default false;

-- Atomic credit award, callable ONLY by service_role (the complete-lesson Edge
-- Function, after it has re-graded the lesson as flawless). The CAS on credited
-- makes it idempotent — a second call pays 0 — and `credits = credits + prize`
-- is a single atomic row update, so two lessons finishing at once can't lose an
-- award to a read-modify-write race. Returns the amount actually awarded.
create function public.award_lesson_credit(p_node_id uuid, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  prize integer;
begin
  update node_progress set credited = true
   where user_id = p_user and node_id = p_node_id and credited = false;
  if not found then
    return 0;
  end if;
  select credit_prize into prize from nodes where id = p_node_id;
  if prize is null or prize <= 0 then
    return 0;
  end if;
  update profiles set credits = credits + prize where user_id = p_user;
  return prize;
end;
$$;

revoke execute on function public.award_lesson_credit(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.award_lesson_credit(uuid, uuid) to service_role;
