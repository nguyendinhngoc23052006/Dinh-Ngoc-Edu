# Pet companion glow-up: animated sprites, roaming movement, in-app delete modal, mobile header

Fixes the reported pet/UX issues in one PR. The migration baseline left a note that
"the on-screen renderer arrives in a later PR" — this is that PR.

## What's in it

1. **Real animated sprites instead of a bare emoji.** Each species now draws a CC0
   spritesheet (Ninja Adventure pack, public domain) from `public/pets/<species_id>.png`,
   resolved by convention from the species id — a 4-frame walk cycle stepped in CSS. A
   missing/broken image falls back to the species emoji, so the companion never vanishes.
2. **It actually roams.** The old footer crawl (a 16s left↔right CSS translate, near-
   invisible on desktop) is replaced by `usePetWander` — the pet wanders to random points
   across the viewport, varies speed, pauses, and **flips to face the way it's walking**.
   It also **grows with each evolution form** (size + a subtle tint), so it's no longer one
   size. Honours `prefers-reduced-motion` (parks still).
3. **In-app delete confirmation.** Releasing a pet (and deleting a course) now opens a
   centered `ConfirmDialog` in the middle of the screen instead of a browser
   `window.confirm` popup. Esc / backdrop cancels; the confirm button is focused.
4. **Mobile header no longer breaks.** The nav was a 6+ item non-wrapping flex row that
   overflowed the header on phones; a `max-width: 640px` breakpoint lets the header stack
   and the nav wrap.

## Notes / assumptions
- **Species were renamed to monster names** (Slimkin, Mossback, Wispet, Capling, Gloomeye,
  Scarabee, Cindrake, Pyracor, Lumora) so the names match the CC0 monster art. The `spc-*`
  **ids are unchanged**, so `pets.species_id` foreign keys and the sprite filenames stay
  valid — only display `name` + emoji fallbacks move (migration `20260614050000`).
- The art was originally going to be AI-generated in-session, but the image-gen account had
  0 credits — CC0 art was used instead (chosen with the user).
- Pure movement/sprite math is extracted to `src/lib` (petWander, petSprite) and unit-tested
  with an injected rng (the project has no DOM test setup, matching the petProgress pattern).
- Pre-existing, unrelated: `npm run format:check` still flags older `supabase/functions/*`
  files (not touched here).

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches  *(one migration, 20260614050000; UPDATE-only on the existing `species` catalog — no new table, so no new RLS; it changes only `name`/`form*_sprite`, which already exist in src/types)*
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised  *(204 tests pass incl. new petWander/petSprite suites covering arrival/pause/facing/shrunken-bounds and the emoji-fallback path; lint + typecheck clean)*
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code  *(no client/env/secret code touched)*
- [x] irreversible actions guarded + idempotent + flagged  *(pet release / course delete now guarded by an in-app confirm; the underlying RPCs are unchanged)*
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English  *(see "Notes" — renames 9 catalog rows, keeps ids)*
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR  *(security APPROVE; scale APPROVE; code APPROVE after fixing one WARN — the facing flip was being overridden by the bob animation, now on a wrapper element)*

## For you
**What changed:**
- The active pet renders an animated CC0 spritesheet (with emoji fallback) and roams the
  screen, facing its direction and growing per evolution form.
- Pet release and course delete now confirm via a centered in-app modal, not a browser popup.
- The top nav wraps instead of overflowing on phone-width screens.
- The nine pet species were renamed to match the new monster art (ids unchanged).

**What you do next:** review the preview — open `/pets`, set a pet active, and watch it
walk around any page; hatch/feed to see it grow; click **Release** and confirm the modal is
centered (and the same for a course's **Delete**). Resize to phone width and check the
header. No env/secret action needed.

**How to roll it back:** revert this PR. The migration only renamed catalog rows, so to undo
the names in an already-migrated DB, ship a follow-up migration restoring the old
names/emoji (fix-forward) — the `spc-*` ids never changed, so no pet data is affected.
