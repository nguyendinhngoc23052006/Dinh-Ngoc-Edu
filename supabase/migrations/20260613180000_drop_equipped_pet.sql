-- Tech-debt cleanup: the on-screen pet now comes from the `pets` table, so the
-- legacy equipped-pet cosmetic slot is fully dead. Drop the column and the
-- 'pet' branch of equip_cosmetic — themes are the only equippable cosmetic now.
-- Behaviour-preserving: nothing reads equipped_pet anymore (PR #29), and no
-- 'pet' cosmetics exist (deleted in 20260613160000). Replace the function before
-- dropping the column so the function body never references a missing column.

create or replace function public.equip_cosmetic(p_kind text, p_cosmetic_id text)
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
  if p_kind <> 'theme' then
    raise exception 'Unknown cosmetic kind.';
  end if;
  if p_cosmetic_id is not null then
    select * into item from cosmetics
    where id = p_cosmetic_id and kind = 'theme';
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
  update profiles set equipped_theme = p_cosmetic_id where user_id = caller;
end;
$$;

alter table public.profiles drop column equipped_pet;
