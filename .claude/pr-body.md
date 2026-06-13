# Pet system — PR 2: food, feeding, and the Pets page

Builds the feeding loop on top of PR 1's pets. Users buy **food** with credits
into an inventory, then spend it to **feed** pets — raising xp until an egg is
ready to hatch and, later, until a pet evolves. Adds a `/pets` page to manage
the storage of up to three (adopt, feed, hatch, set-active, release) and a Food
section in the Market.

## What's in this PR
- **`food` catalog** (world-readable, 3 tiers: Berry / Hearty Meal / Royal
  Feast) — each tier cheaper per xp than the last.
- **`user_food`** inventory (one row per owned food, qty). Read-only to the
  owner; qty changes only inside the RPCs.
- **RPCs** (all `SECURITY DEFINER`, authenticated, server-validated):
  - `buy_food(food_id, qty)` — re-derives cost, locks the balance, deducts, adds
    to the stockpile. Returns the new balance.
  - `feed_pet(pet_id, food_id, qty)` — checks owned quantity (row-locked, no
    double-spend), adds `xp_value * qty` to an owned pet.
  - `release_pet(pet_id)` — replaces PR 1's client-side delete; deletes an owned
    pet and **auto-promotes** the oldest remaining pet into the active slot so
    you're never left with pets but none on screen. The old `pets` delete policy
    is dropped (release is RPC-only now).
- **`/pets` page** — storage of ≤3 with adopt (disabled at full), per-pet sprite
  (egg or evolved form), rarity badge, an xp progress bar (`petProgress`), a
  Hatch button when ready, feed buttons per owned food, set-active, and release
  (with a confirm). Full loading / empty / error states, including the secondary
  loads' errors.
- **Market Food section** mirroring the existing card pattern; shows owned qty.
- `foodService` + `petService` (feed/release) + a pure `petProgress()` helper,
  all unit-tested.

## Migration in plain English
Adds a `food` price list and a `user_food` "what you own" table. Adds three
server functions: buy food (spend credits, can't overspend or get it free), feed
a pet (spend your food for xp, can't spend food you don't have or feed someone
else's pet), and release a pet (delete one of yours and move another onto the
screen). Removes the old direct-delete permission on pets so releasing always
goes through that function.

## Abuse cases blocked
- Can't get free/cheap food or overspend (server re-derives cost; balance locked).
- Can't feed food you don't own or double-spend it on retry-within-a-tick
  (inventory row locked; quantity checked).
- Can't feed/release another user's pet (ownership checked in every RPC).
- Can't write your own inventory qty or credits (no insert/update RLS policy).

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
- **Tests**: `foodService.test.ts`, updated `petService.test.ts` (feed + release
  RPCs), and `petProgress.test.ts` (`petProgress` bands) — 29 new/changed assertions
  green; full suite passes except the pre-existing `fflate` failure in
  `extract.test.ts` (also fails on `main`, unrelated).
- **Irreversible/idempotent**: release is permanent but owner-scoped and
  auto-promotes; feed/buy are row-locked against concurrent double-spend.
  **Debt I'm leaving:** like the existing `purchase_cosmetic`, `buy_food`/`feed_pet`
  are not idempotent against a *lost-response retry* (an additive upsert re-applies
  the spend). Accepted because it's in-app currency bounded by the user's own
  balance, and matching one RPC but not the others would be inconsistent; the
  fix-when-needed (a client idempotency key + unique ledger row) is recorded in
  `MEMORY.md`. Flagging for a `tech-debt` issue if you want it tracked.
- **Memory**: added the spend-RPC retry-idempotency note to `MEMORY.md`.

## For you
**What changed:** Added a food catalog + inventory, the buy/feed/release server
logic, a `/pets` page to raise your menagerie, and a Food section in the Market.

**What you do next:** Review the preview, confirm the migration applies on the
preview DB, then log in and try the loop: buy food → feed an egg to 100 xp →
hatch → keep feeding to evolve; adopt/release to test the 3-slot cap and the
auto-promote. No env/secret action needed.

**How to roll it back:** Revert this PR. The migration adds two tables and three
functions and drops one policy; reverting restores the prior state (pets still
exist from PR 1, just without food/feeding, and the client delete policy returns).
