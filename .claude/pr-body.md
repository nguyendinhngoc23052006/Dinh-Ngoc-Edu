# Pet system — cleanup + infinite-everything demo seed

Two small things, requested together: retire the last dead bit of the old
buy-a-pet cosmetic, and load the demo account so the whole pet/economy system is
testable on a fresh preview.

## What's in this PR
- **Tech-debt cleanup** — the on-screen pet has come from the `pets` table since
  PR #29, so the legacy `equipped_pet` slot is fully dead. This migration:
  - replaces `equip_cosmetic` with a theme-only version (drops the `'pet'`
    branch; still auth-guarded, kind-validated, and ownership-checked for paid
    themes — `create or replace` preserves the existing grants), then
  - drops `profiles.equipped_pet`.
  - Types follow: `Profile.equipped_pet` removed, `CosmeticKind` narrowed to
    `'theme'`; the two tests that referenced the pet slot updated.
- **Infinite-everything demo seed** — extends `supabase/seed.sql` (preview/dev
  only; it never runs in production) to load `demo@example.com / password123`
  with:
  - `credits = 1,000,000,000` (effectively unlimited, within int range),
  - ownership of **every theme** (so all map dimensions are switchable in
    Settings),
  - `1,000,000` of **every food** tier,
  - a curated **menagerie**: a maxed mythical companion (form 3, active → walks +
    cheers), an evolving rare (form 2), and a spare egg — storage full at 3, so
    the adopt-cap and release/auto-promote are exercisable too.

## Migration in plain English
Removes the unused "equipped pet" setting from profiles and the matching dead
branch of the equip function (themes are the only equippable cosmetic now).
Nothing reads that setting anymore, so behaviour is unchanged.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration (drop_equipped_pet), UTC-timestamped latest; no new table; src/types matches (equipped_pet removed, CosmeticKind narrowed)
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English

Notes on the boxes:
- **Migration** drops a column and replaces a function; behaviour-preserving.
  Dropping the column auto-drops its (empty) column-level ACL; the live update
  grants are on `pet_enabled` / `pet_cheers_enabled`, untouched.
- **Tests**: `profileService.test.ts` and `cosmeticsService.test.ts` updated to
  the theme-only shape (still assert the real RPC args / errors, not just made to
  pass); typecheck, lint, and `vite build` pass; full suite passes except the
  pre-existing `fflate` failure in `extract.test.ts` (also fails on `main`).
- **Seed safety**: `seed.sql` runs only on `supabase db reset` and preview
  branches, never production; idempotent (set-not-add quantities, `on conflict`,
  delete+insert for the curated pets) and references only ids seeded by earlier
  migrations.
- **Known harmless leftover**: the `cosmetics.kind` CHECK still lists `'pet'`
  though no code path can insert one. Left as-is — tightening it means guessing an
  auto-generated constraint name (preview-migration risk) for no functional gain;
  a one-line fix-forward can do it later if wanted. Recorded in reviewer memory.
- **Still-accepted debt (unchanged):** the credit-spend retry-idempotency note
  from PR #28 stays as documented in `MEMORY.md` — out of scope here.
- **Memory**: recorded one code-review lesson (a narrowed enum can leave a broader
  column CHECK behind) in the reviewer sidecar.

## For you
**What changed:** Dropped the dead `equipped_pet` cosmetic slot, and loaded the
demo login with unlimited credits, all themes, mountains of food, and a ready
menagerie so you can exercise the whole system on the preview.

**What you do next:** Review the preview, confirm the migration applies on the
preview DB, then log in as **demo@example.com / password123** — you should land
with a maxed mythical pet walking and cheering, a full Pets storage, every map
dimension switchable in Settings, and effectively infinite credits/food. Merge
when happy. No env/secret action needed.

**How to roll it back:** Revert this PR. Re-adding `equipped_pet` (a nullable
text column) and the old equip branch would need a small follow-up migration
(fix-forward); the seed change reverts with the file and only ever affected
preview/dev data.
