# Pet system — PR 4: theme "dimensions" (the course map becomes a world)

The final piece of the vision: a theme is no longer just a recolor — each one is
a **dimension** that re-skins the course map (the node path / question trail) into
a themed world. Bought in the Market, switchable in Settings.

## What's in this PR
- **Dimension tokens** — each seeded theme gains a `dimension` in its `data`
  (Classic→Meadow, Sunset→Volcano, Ocean→Tide, Grape→Twilight, Midnight→Cosmos),
  via an idempotent jsonb merge. No schema change.
- **The map re-skin** — `CosmeticsLayer` sets `<html data-dimension="…">` from the
  equipped theme, and scoped CSS (`[data-dimension="…"] .course-map …`) restyles
  the map's background, the path connectors, the node rings, and adds a themed
  scenery strip — so the same lessons read as a meadow, a volcano, a starfield, etc.
  Applies only the theme's `--` CSS vars to `:root` (the new token is routed to the
  attribute, not set as a bogus property).
- **Market** — theme cards now show which map they unlock ("🗺️ Cosmos map") and
  the blurb says themes change the map.
- **Settings** — a "Map dimension" selector to switch among the themes you own
  (plus Default), updating the map instantly.
- `src/lib/dimensions.ts` (token→label) with tests.

## Migration in plain English
Tags each existing theme with the name of the world its map should look like
(meadow, volcano, …). It only edits the themes' stored settings — no tables or
columns change — and re-running it sets the same values, so it's safe to repeat.

## Abuse cases blocked
- The Settings selector only lists owned/free themes for convenience, but
  equipping still goes through the existing `equip_cosmetic` RPC, which checks
  ownership server-side — a crafted call can't equip a theme you don't own.
- The dimension token is server-seeded (catalog data), not user input, and lands
  in a `data-*` attribute (no HTML/script context) — no injection surface.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English

Notes on the boxes:
- **Migration** changes data only (no new table → no RLS line; no `src/types`
  change — `dimension` rides the existing `Cosmetic.data` map). Idempotent.
- **Tests**: `dimensions.test.ts` (label lookup: known / none / unknown) green;
  typecheck, lint, and `vite build` pass; full suite passes except the pre-existing
  `fflate` failure in `extract.test.ts` (also fails on `main`, unrelated). The map
  re-skin is CSS, exercised by the build; no component test harness exists in this
  repo.
- **Memory**: recorded two code-review lessons (a 2nd fetch caller with a different
  filter isn't duplication; verify a token set agrees across migration/lib/CSS/type
  in one pass) in the reviewer sidecar.
- No new dependency; no irreversible action.

## For you
**What changed:** Each theme now transforms your course map into a themed world
(meadow, volcano, tide, twilight, cosmos), not just a recolor. The Market shows
which map each theme unlocks; Settings has a quick "Map dimension" switcher.

**What you do next:** Review the preview, confirm the migration applies on the
preview DB, then open a course map and switch themes in Settings (or buy one in the
Market) to watch the world change. No env/secret action needed.

**How to roll it back:** Revert this PR — the CSS/UI reverts with the code. The
migration only added a `dimension` key to each theme's data; the app ignores
unknown/absent dimensions (falls back to the default map), so a leftover key on the
DB is harmless, and a follow-up migration could strip it if you want it gone.
