# Pet system — PR 1: foundation (egg, species, storage of 3, hatch roll)

First slice of the egg→hatch→evolve pet system. **Purely additive and not yet
user-visible**: it adds the data model and the server-side hatch roll, with no
UI wired up. The existing emoji "pet" cosmetics keep working untouched and are
retired in a later PR, when the on-screen pet is rewritten to render these rows
— so there is never a visual gap.

## The model
Each user keeps a small **menagerie**: up to **3 pets** in storage, exactly
**one active** (the companion that walks on screen). A pet starts as an egg,
hatches into a random species, and evolves through three forms as it gains xp.
To adopt a new egg at full storage you must first **release** one.

## What's in this PR
- `species` catalog (world-readable): name, rarity, drop `weight`, three
  evolution sprites. Seeded with 9 creatures across the five rarities, weights
  summing to 100 so they read as drop rates (common 60% / rare 24% / epic 10% /
  legendary 4% / mythical 2%).
- `pets`: up to 3 rows per user. `xp` only grows; the evolution form (1/2/3) is
  **derived** from xp in `src/lib/petProgress.ts`, never stored. `is_active`
  marks the single companion, hard-enforced by a partial unique index.
- `profiles.pets_hatched`: lifetime hatch counter.
- RPCs (all `SECURITY DEFINER`, authenticated only):
  - `adopt_pet()` — new egg; refuses past 3; serialized by a `for update` lock on
    the caller's profile row so concurrent adopts can't exceed the cap.
  - `hatch_pet(p_pet_id)` — server-side **weighted-random** species roll on an
    owned, ready (xp ≥ 100) egg; row-locked + idempotent (can't re-roll).
  - `set_active_pet(p_pet_id)` — clear others, set this one active.
- `pets` RLS: read + **release (delete)** your own rows; no insert/update policy,
  so xp/stage/species/active change only through the RPCs above.
- Signup trigger `handle_new_user` updated (fix-forward) to also create a starter
  egg (active); existing users backfilled.
- `src/services/petService.ts` (`listMyPets`, `listSpecies`, `adoptPet`,
  `hatchPet`, `setActivePet`, `releasePet`) + `src/lib/petProgress.ts` (pure
  thresholds) + `src/types` updates, all tested.

## Migration in plain English
Adds a `species` lookup table and a `pets` table (max three per person), plus a
`pets_hatched` counter on profiles. Replaces the signup trigger so new accounts
get a starter egg, and backfills an egg for current accounts. Adds three
functions — adopt (make a new egg, capped at three), hatch (randomly turn a
ready egg into a creature), and set-active (choose which one walks on screen) —
all running on the server so the count, the randomness, and the single-active
rule can't be gamed.

## Abuse cases blocked
- Can't own more than 3 (count + per-user lock in `adopt_pet`).
- Can't pick the rarity / re-roll (server-side weighted draw, idempotent hatch).
- Can't have two on screen (partial unique index on active).
- Can't set xp/stage/active directly (no insert/update RLS policy; RPCs only).
- Can only release / read your **own** pets (RLS scoped to `auth.uid()`).

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
- **Tests**: `petProgress.test.ts` (threshold boundaries) + `petService.test.ts`
  (list/adopt/hatch/set-active/release, each with success, RPC-arg assertions,
  and an error path) all green; full suite passes except a pre-existing `fflate`
  import failure in `extract.test.ts` that also fails on `main` (unrelated, left
  untouched).
- **Irreversible/idempotent**: hatching is one-way per egg (`stage` check + row
  lock); releasing is a permanent but owner-scoped delete of low-stakes data;
  trigger/backfill/seed inserts use `on conflict do nothing` where applicable.
- **Memory**: no new lesson — reviewers confirmed this reuses recorded patterns
  (SECURITY DEFINER child writes, revoke-PUBLIC + grant-authenticated, partial
  unique index for a single-active invariant, lock-to-serialize a per-user cap).

## For you
**What changed:** Added the pet data model (`species`, a `pets` storage of up to
three with one active, `profiles.pets_hatched`), the adopt/hatch/set-active
server logic, and gave every user a starter egg — all backend-only, with
read-only services and tests; nothing on screen changes yet.

**What you do next:** Review the preview, confirm the migration applies cleanly
on the preview DB, then merge. No env/secret action needed. (Feeding, the
storage UI, the on-screen pet, and the map "dimensions" arrive in later PRs.)

**How to roll it back:** Revert this PR. The migration only adds two tables, a
column, three functions, and replaces a trigger body; reverting drops them. No
data outside this feature is touched, and the live emoji-pet cosmetics are
untouched by this PR.
