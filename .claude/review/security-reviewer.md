# security-reviewer verdict — pet companion overhaul + mobile header fix

**Verdict: APPROVE — no security findings.**

Scope reviewed: src/lib/petSprite.ts, src/lib/petWander.ts, src/hooks/usePetWander.ts,
src/components/pet/PetSprite.tsx, src/components/ui/ConfirmDialog.tsx,
src/components/layout/CosmeticsLayer.tsx, src/pages/PetsPage.tsx,
src/components/courses/CourseSettings.tsx, src/index.css,
supabase/migrations/20260614050000_rename_species_to_monsters.sql, public/pets/*.

- **RLS:** migration is UPDATE-only on `public.species` (read-only catalog that already
  has RLS + public-read from baseline 20260613140000). No new table, no RLS gap.
- **Secrets:** none referenced in any changed file.
- **Unvalidated input:** none. `species_id` interpolated into the sprite URL is
  FK-constrained to the nine seeded catalog ids (not attacker-controlled free text).
- **Abuse case:** ConfirmDialog is presentational and does NOT weaken any check — pet
  release / course delete still go through the existing service RPCs whose ownership
  is enforced server-side.

Note (not a finding): if a future migration ever lets users author species ids, the
`url(${speciesId})` CSS interpolation would need escaping. Safe today.
