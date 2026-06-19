# UI overhaul — a playful, immersive, interconnected game world

A full visual overhaul of the front end toward the look the product already
wants to be: a gamified, pet-powered learning world rather than a plain form
app. The change is **presentational only** — no schema, services, routes, env,
or data flow changed, so every existing test, the build, and all client-side
guards keep working untouched.

Four things were asked for and delivered:

- **Playful game world.** A full rewrite of `src/index.css`: richer tokens
  (deeper greens, a gold accent for credits/XP, layered shadows, rounder
  radii), chunky tactile buttons with a press, a persistent dotted-grid + aurora
  backdrop behind every page, glowing "next" course nodes, a frosted HUD-style
  top bar, hover-lift on collectible-style cards, and a loading shimmer.
- **Persistent shell + route transitions.** `AppLayout` gains a brand mark and
  wraps the `<Outlet/>` in a `route-view` div keyed on `location.pathname`, so
  each navigation fades and rises in — the app reads as one continuous space.
  The pet companion and credits HUD stay put across pages.
- **Unified theme system.** The equipped theme now reskins the **whole app**,
  not just the course map: `[data-dimension] .app` paints an immersive backdrop
  per theme (meadow / volcano / tide / twilight / cosmos). Cards are a fixed
  light surface with fixed dark text, so they stay readable over every
  backdrop — which also **fixes a latent contrast bug** where the dark Midnight
  theme's light `--ink` was nearly invisible on white cards.
- **Mobile scroll-hide header.** On small screens (≤ 640 px) the header slides
  up and fades out while the user scrolls down, then reappears on any upward
  movement. A 60 px scroll-start guard and an 8 px jitter threshold prevent
  accidental hides. Desktop sticky behaviour is unchanged.

Every class name the previous stylesheet defined is preserved, along with the
pet-sprite keyframe math, `prefers-reduced-motion` handling, and the course-map
dimension reskins. No new dependency, no new external resource (system fonts,
CSS gradients only).

## Assumptions
- Direction confirmed with the human up front: "playful game world", tied
  together by a "persistent shell" + "unified theme system", **staying in
  vanilla CSS** (no framework — no new dependency).
- The 5 themes' exact palettes were read from the seed migrations
  (`20260613052000_cosmetics.sql` / `20260613170000_theme_dimensions.sql`);
  only Midnight is dark, which drives the fixed-light-card decision above.

## Reviewer note
The code reviewer initially flagged two items; both were investigated:
1. "Six JSX classes dropped" — **false positive**: `.course-card`,
   `.lesson-player`, `.question`, `.prompt`, `.hint`, `.feedback` were never
   defined on `main` (verified by grep); the rewrite dropped nothing and added
   no speculative styles for them.
2. `.ghost`/cancel-button contrast — **fixed**: the `ConfirmDialog` cancel
   (`.ghost`) and destructive confirm (`.danger`) both fell through to the green
   primary style. `.ghost` is now a standalone secondary modifier and
   `button.danger` a destructive red; the more-specific `.market-card` rules
   keep market/pets visuals unchanged.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — **no migration** (presentational only); no new tables; types untouched
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 272 unit + 3 e2e pass, build clean; existing happy/unhappy suites unchanged
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code — no env/client config touched
- [x] irreversible actions guarded + idempotent + flagged — none in this PR
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a, no migration
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited (reviewers dispatched explicitly on the tier below)

## For you
**What changed:**
- Rewrote `src/index.css` into a playful "game world" design (richer tokens,
  tactile buttons, glowing nodes, frosted HUD bar, immersive backdrop).
- `AppLayout` now shows a brand mark and animates each route change, with the
  pet + credits HUD persistent across pages.
- The equipped theme reskins the entire app (per-theme backdrops), and cards
  became fixed light surfaces — fixing the dark-theme card-contrast bug.
- Promoted `.ghost`/`button.danger` to real button modifiers so the confirm
  dialog's cancel/confirm buttons are visually distinct.
- On mobile, the header now hides on scroll-down and reappears on scroll-up
  (smooth 0.28s fade + slide; desktop unchanged).

**What you do next:** review the preview deployment on this PR — click through
Landing, Dashboard, a Course map, the Market, Pets, and Settings; in Settings
equip each theme (especially **Midnight**) and confirm every page reskins and
all text stays readable. On mobile, scroll a long page to confirm the header
hides and reappears correctly. No env/secret action needed. Then merge.

**How to roll it back:** revert this PR — it only touches `src/index.css` and
`src/components/layout/AppLayout.tsx` (plus review verdicts and `MEMORY.md`);
reverting fully restores the previous look with no data or schema implications.
