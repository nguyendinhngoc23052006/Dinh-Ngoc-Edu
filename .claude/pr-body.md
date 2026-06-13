# Pet system — PR 3: on-screen pet, encouragement, retire legacy cosmetics

The pet comes to life. The user's **active** pet (from the `pets` table) now
walks along the bottom of every page, showing its egg or evolved-form sprite,
and a hatched pet occasionally throws out an **encouragement** message. The
legacy "buy a pet emoji" cosmetic is retired — the companion is the living pet
now, not a purchase.

## What's in this PR
- **On-screen pet** — `CosmeticsLayer` renders the active pet (egg → species
  form, derived from xp) instead of the old equipped cosmetic. Refetches when
  the user changes or hatches a pet. Still gated by the `pet_enabled` toggle, and
  the theme-recolor logic is unchanged.
- **Encouragement** — a hatched pet shows a random optimistic line (Vietnamese,
  in `src/lib/petCheers.ts`) every ~25s for a few seconds, on a self-cleaning
  timer. Silenced by a new toggle (or when the pet is off, or while it's an egg).
- **New setting** — `profiles.pet_cheers_enabled` (client-writable like
  `pet_enabled`, via an additive column grant) with a Settings checkbox.
- **Retire legacy pets** — migration clears `equipped_pet` and deletes the
  `kind='pet'` cosmetics (ownership rows cascade away); the Market loses its Pets
  section and now points users to the `/pets` page for pets.
- `getActivePet` (petService) + `setPetCheersEnabled` (profileService) + the
  cheers picker, all unit-tested.

## Migration in plain English
Adds one preference column (whether the pet cheers you on) that the user can flip
themselves, and removes the old buyable pet items — the on-screen pet is now the
living one from the pets table, so the old equipped-pet slot is cleared and those
catalog items (and anyone's ownership of them) are deleted.

## Abuse cases blocked
- The new column grant is column-scoped (`update (pet_cheers_enabled)`), additive
  to the existing `pet_enabled` grant — credits, equipped slots, and pet xp stay
  server-only; a client still can't write them.
- `getActivePet` is RLS-scoped to the caller's own pets.

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
- **Migration** adds no table (just a column) — RLS line N/A; the column is
  covered by the existing profiles RLS, with a column-scoped update grant.
- **Tests**: `petCheers.test.ts`, `petService.test.ts` (getActivePet), and
  `profileService.test.ts` (setPetCheersEnabled + updated literal) green; typecheck,
  lint, and `vite build` all pass; full suite passes except the pre-existing
  `fflate` failure in `extract.test.ts` (also fails on `main`, unrelated).
- **Idempotent**: the retirement migration is safe to re-run (the deletes simply
  match nothing the second time; the equipped_pet clear is conditional).
- **Debt I'm leaving:** the `equipped_pet` column and the `'pet'` branch of
  `equip_cosmetic` are now unused (no pet rows reach them). Left in place because
  dropping them is a behaviour-preserving structural change that should stand
  alone as a small follow-up migration, not ride this feature PR. Flag if you want
  a `tech-debt` issue.
- **Memory**: recorded two code-review lessons (single-use render-helper after a
  section is removed; single-slot timer leak-freedom) in the reviewer sidecar.

## For you
**What changed:** Your active pet now walks on every page (egg or evolved form),
a hatched pet cheers you on, you can silence the cheers in Settings, and the old
buyable pet emojis are gone (replaced by the living pet on the Pets page).

**What you do next:** Review the preview, confirm the migration applies on the
preview DB, then log in: with a hatched active pet you should see it walking and
the occasional message; toggle "Encouragement" and "Study pet" in Settings to
confirm they take effect. No env/secret action needed.

**How to roll it back:** Revert this PR to restore the previous on-screen pet
code and the Market Pets section. Note: the deleted pet cosmetics and the cleared
`equipped_pet` values are data changes — reverting the code won't recreate them;
re-seeding would need a small follow-up migration (fix-forward, as usual).
