# code-reviewer verdict — pet companion overhaul + mobile header fix

**Verdict: APPROVE.** One WARN was raised and FIXED before commit.

- **WARN (fixed):** the left-facing flip (`transform: scaleX(-1)`) was set on
  `.pet-sprite-frame`, which also runs the infinite `pet-bob`/`pet-step` keyframes —
  a live CSS animation overrides an inline `transform`, so the flip never showed.
  Fixed by moving the flip onto a new `.pet-sprite` wrapper, leaving the animated frame
  to own its transforms (PetSprite.tsx + `.pet-sprite` rule in index.css).
- **Pure-logic extraction is sound:** movement/sprite math lives in src/lib
  (petWander, petSprite) with rng-injected unit tests, matching the existing
  petProgress/petCheers pattern; hooks/components are thin shells. No DOM test dep added.
- **Duplicated `emojiFor`** (CosmeticsLayer + PetsPage) intentionally kept: 7 lines, two
  different layers, no second natural home yet. Move to src/lib/petSprite.ts on a 3rd use.
- Components render UI only (no data access in src/components/pet); PetsPage keeps
  loading/empty/error states; files all well under 200 lines; migration touches only
  name + form*_sprite (present in src/types) and leaves species ids (FKs) intact.
