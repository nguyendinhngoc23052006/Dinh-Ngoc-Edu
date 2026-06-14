# Post-MVP Roadmap

The app is well past a typical MVP: courses, AI generation, lessons, mock tests,
pets, cosmetics, themes, a credit economy, and food all exist and are tested at
the service layer. What remains is **defects, trust/account essentials, polish,
and quality coverage**.

Each numbered item is sized to be **one PR into `main`**. Phases are ordered by
priority, but items are largely independent. Phase 0 (defects) and Phase 4
(quality) can interleave with anything.

## Phase 0 — Real defects (ship first; these are bugs, not features)

Avoidable debt under our rules, so they come before any new feature.

1. **Calc questions break in mock tests.** `MockTestRunner` only renders
   `ChoiceQuestion` / `FillBlankQuestion`; a `calc` question silently falls
   through to the wrong UI and grades wrong. Wire `CalcQuestion` into the runner.
2. **Spend RPCs aren't idempotent.** A lost-response retry on `buy_food` /
   `purchase_cosmetic` / `feed_pet` double-charges credits. Add a
   client-supplied idempotency key + unique constraint so a retry is a no-op.

## Phase 1 — Account & trust essentials

3. **Password reset / forgot-password** flow (request email → reset page).
   Today a magic-link would 404.
4. **Account deletion** (delete-my-data path; cascade or soft-delete + storage
   cleanup). *Crosses the "ask first" line — touches multiple tables; scope with
   a question before building.*
5. **User profile** (display name + optional avatar) — needed for a public
   Explore to feel social.

## Phase 2 — Complete the learning loop

6. **Mock test delete & rename** — policies exist, no UI/service. Stale tests
   currently can't be removed.
7. **Material management after creation** — add/remove/replace files post-create
   (today it's upload-once). *Scope with a question before building.*
8. **Explore search / filter / sort** — today it's a plain reverse-chron list.
9. **NewCoursePage error surfacing** — it swallows partial upload/generation
   failures in a `catch {}`; surface them.
10. **Explore "Save" persistence** — check existing saves on load so the button
    reflects prior-session state.

## Phase 3 — Polish & performance

11. **Human-friendly labels** on `CourseCard` (status/visibility/language as
    labels, not raw enum text).
12. **CosmeticsLayer query cost** — it refetches catalog + active pet + all
    species on *every* navigation (3 extra queries/page for logged-in users).
    Cache / lift into context.
13. **Missing UI states** — `SettingsPage` ownership-error handling,
    `FillBlankQuestion` submit-on-Enter, `MockTestRunner` empty context.

## Phase 4 — Quality & confidence (ongoing, can interleave)

14. **Component & hook tests** — currently *zero* React component tests and no
    hook tests. Cover `LessonPlayer`, `MockTestRunner`, `CourseMap`,
    `RequireAuth`, `ProfileProvider`, `usePetWander`.
15. **`authService` validation tests** (untested today).
16. **Optional E2E smoke** (Playwright): signup → create course → complete a
    lesson → earn credit. One happy-path guard.

## Phase 5 — Docs & onboarding

17. **README** — currently one line. Write a real project overview + local-dev
    quickstart.
18. **Deployment runbook** — env var names (the `VITE_` / `NEXT_PUBLIC_`
    contract), Vercel + Supabase setup, secrets.

## Flagged, not scheduled

- **`clone_course()` column-list trap:** every new `questions` column must be
  added to that function by hand or clones silently lose data — already bit us
  twice (difficulty, calc). Worth a guard/test; track as tech-debt.
- **`cosmetics.kind` still allows `'pet'`** even though pet cosmetics were
  retired — harmless, but a latent footgun. Leave or tighten.
