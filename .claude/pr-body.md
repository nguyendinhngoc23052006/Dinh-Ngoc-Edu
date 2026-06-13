# Pet system — PR 1: foundation (egg, species, hatch roll)

First slice of the egg→hatch→evolve pet system. **Purely additive and not yet
user-visible**: it adds the data model and the server-side hatch roll, with no
UI wired up. The existing emoji "pet" cosmetics keep working untouched and are
retired in PR 3, when the on-screen pet is rewritten to render `user_pet` — so
there is never a visual gap.

## What's in this PR
- `species` catalog (world-readable): name, rarity, drop `weight`, and three
  evolution sprites. Seeded with 9 creatures across the five rarities, weights
  summing to 100 so they read as drop rates (common 60% / rare 24% / epic 10% /
  legendary 4% / mythical 2%).
- `user_pet`: one row per user. Starts as an `egg`, becomes `hatched` with a
  species. `xp` only grows; the evolution form (1/2/3) is **derived** from xp in
  `src/lib/petProgress.ts`, never stored, so it can't desync.
- `profiles.pets_hatched`: lifetime hatch counter.
- `hatch_pet()` RPC (`SECURITY DEFINER`): a server-side **weighted-random**
  species roll. Row-locked + idempotent (a hatched pet can't re-roll), gated on
  `xp >= 100`. The client can neither pick the outcome nor replay it.
- Signup trigger `handle_new_user` updated (fix-forward) to also create an egg;
  existing users backfilled.
- `src/services/petService.ts` (`getMyPet`, `listSpecies`, `hatchPet`) +
  `src/lib/petProgress.ts` (pure thresholds) + `src/types` updates, all tested.

## Migration in plain English
Adds a `species` lookup table and a per-user `user_pet` table, plus a
`pets_hatched` counter on profiles. Replaces the existing signup trigger so new
accounts get an egg, and backfills an egg for current accounts. Adds one
function, `hatch_pet`, that randomly turns a ready egg into a creature — the
randomness and the "already hatched?" check run on the server so it can't be
gamed.

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
- **Tests**: `petProgress.test.ts` (threshold boundaries) and `petService.test.ts`
  (getMyPet hit/null/error, listSpecies, hatchPet success + RPC args + the
  "not ready" error path) all green; full suite passes except a pre-existing
  `fflate` import failure in `extract.test.ts` that also fails on `main`
  (unrelated to this PR — left untouched).
- **Irreversible/idempotent**: hatching is one-way per egg; `hatch_pet` row-locks
  and checks `stage <> 'egg'`, so a double-submit lands on "already hatched"
  instead of re-rolling or double-counting. Trigger/backfill/seed inserts all use
  `on conflict do nothing`.
- **Memory**: no new lesson — security/scale/code reviewers confirmed this PR
  reuses already-recorded patterns (SECURITY DEFINER child writes, revoke-PUBLIC
  + grant-authenticated, named query caps, atomic in-flight claim).

## For you
**What changed:** Added the pet data model (`species`, `user_pet`,
`profiles.pets_hatched`), a server-side weighted hatch roll, and gave every user
an egg — all backend-only, with read-only services and tests; nothing on screen
changes yet.

**What you do next:** Review the preview, confirm the migration applies cleanly
on the preview DB, then merge. No env/secret action needed. (The egg, feeding,
and on-screen pet UI arrive in PRs 2–4.)

**How to roll it back:** Revert this PR. The migration only adds tables, a
column, and a function and replaces a trigger body; reverting drops them. No
data outside this feature is touched, and the live emoji-pet cosmetics are
untouched by this PR.
