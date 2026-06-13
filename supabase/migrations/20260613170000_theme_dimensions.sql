-- Phase 8: theme "dimensions". A theme already recolors the app; now each one
-- also carries a `dimension` token that re-skins the course map (the node path)
-- into a themed world — the client reads it from the theme's data and sets it on
-- <html data-dimension>, and CSS does the rest. This migration just tags the
-- seeded themes with their dimension; no schema change.
--
-- jsonb `||` merges the key in, so re-running is idempotent (it re-sets the same
-- value). Existing theme colors in `data` are untouched.

update public.cosmetics set data = data || '{"dimension":"meadow"}'::jsonb
  where id = 'theme-classic';
update public.cosmetics set data = data || '{"dimension":"volcano"}'::jsonb
  where id = 'theme-sunset';
update public.cosmetics set data = data || '{"dimension":"tide"}'::jsonb
  where id = 'theme-ocean';
update public.cosmetics set data = data || '{"dimension":"twilight"}'::jsonb
  where id = 'theme-grape';
update public.cosmetics set data = data || '{"dimension":"cosmos"}'::jsonb
  where id = 'theme-midnight';
