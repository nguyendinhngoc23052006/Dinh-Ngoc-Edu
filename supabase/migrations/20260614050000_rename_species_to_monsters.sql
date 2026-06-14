-- Rename the nine seeded species to match the new CC0 monster sprites that the
-- on-screen renderer now draws (public/pets/<species_id>.png). The baseline
-- migration (20260613140000_pet_system_foundation.sql) seeded these rows with
-- placeholder animal names + escalating emoji; that renderer has arrived, so we
-- fix-forward here rather than edit the merged baseline.
--
-- species.id is NOT changed (pets.species_id references it, and the sprite files
-- are keyed by it). Only the display name and the emoji fallbacks move. The PNG
-- art is the real sprite; the three form emoji are now identical per species
-- because evolution is shown by scaling + tinting the SAME sprite, not by a
-- different glyph — so the fallback reads as one consistent creature.

update public.species set name = 'Slimkin',  form1_sprite = '🟢', form2_sprite = '🟢', form3_sprite = '🟢' where id = 'spc-chick';
update public.species set name = 'Mossback', form1_sprite = '🟫', form2_sprite = '🟫', form3_sprite = '🟫' where id = 'spc-bug';
update public.species set name = 'Wispet',   form1_sprite = '👻', form2_sprite = '👻', form3_sprite = '👻' where id = 'spc-fox';
update public.species set name = 'Capling',  form1_sprite = '🍄', form2_sprite = '🍄', form3_sprite = '🍄' where id = 'spc-otter';
update public.species set name = 'Gloomeye', form1_sprite = '👁️', form2_sprite = '👁️', form3_sprite = '👁️' where id = 'spc-cat';
update public.species set name = 'Scarabee', form1_sprite = '🪲', form2_sprite = '🪲', form3_sprite = '🪲' where id = 'spc-raptor';
update public.species set name = 'Cindrake', form1_sprite = '👹', form2_sprite = '👹', form3_sprite = '👹' where id = 'spc-wyrm';
update public.species set name = 'Pyracor',  form1_sprite = '🔥', form2_sprite = '🔥', form3_sprite = '🔥' where id = 'spc-phoenix';
update public.species set name = 'Lumora',   form1_sprite = '✨', form2_sprite = '✨', form3_sprite = '✨' where id = 'spc-kirin';
