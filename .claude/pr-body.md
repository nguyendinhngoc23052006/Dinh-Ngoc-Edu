# Remove the dead "Regenerate course" button

The owner-only **"Regenerate course"** button in `OwnerCourseControls` was a
silent no-op for finished courses. It rendered for **every** `ready` course, but
the `generate-course` Edge Function returns `200` and does nothing when a ready
course has no empty lessons (`index.ts` short-circuits after the question-count
check) — so clicking it produced no pipeline run and no feedback. This removes
that dead control.

The **working** regenerate path is untouched: `CoursePage` still shows a
"Regenerate course" button when a ready course has lessons missing questions
(`status === 'ready'` AND some node `question_count === 0`), which is the only
case the Edge Function actually re-runs. `LessonPlayer`'s empty-lesson message
still points the owner there, accurately.

Per the product decision, finished courses are intentionally **not**
re-generatable from the controls block; owners can still manage source materials
at any time (they apply at the next regeneration).

## What's in the diff
- **`src/components/courses/OwnerCourseControls.tsx`** — removed the
  `status === 'ready'` regenerate `<p>`/`<button>` block and the now-unused
  `onRegenerate` prop (interface + destructuring); updated the block comment.
- **`src/pages/CoursePage.tsx`** — dropped `onRegenerate={handleStartGeneration}`
  at the call site. `handleStartGeneration` is still used by the Start/Retry
  button and the empty-lessons banner, so nothing is orphaned.
- **`src/components/courses/MaterialsManager.tsx`** — one comment wording fix
  (the parent no longer "surfaces that button" for finished courses).
- **`src/components/courses/OwnerCourseControls.test.tsx`** — new suite (3 tests):
  controls render; no "Regenerate course" button for a `ready` course; none for
  a `pending` course. Uses the `// @vitest-environment happy-dom` + shared
  `supabaseMock` convention.
- **`MEMORY.md`** — one corollary line so the dead button is never re-added.

## Notes / debt
- No migration, no schema, no `src/types`, no env/client change.
- The Edge Function `200`-on-no-empty-lessons guard is left as-is — it's the
  correct safety net; this PR just stops offering a button that always hit it.
- Out of scope, noted not fixed: Supabase advisors currently flag a
  `SECURITY DEFINER` view `public_profiles` (ERROR) and leaked-password
  protection disabled — unrelated to this change.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration; no schema/types touched (true by absence)
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — `lint` 0, `typecheck` clean, `test` 272 passed, `e2e` 3 passed; test covers the controls-render path and the no-dead-button guard for `ready`/`pending`
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code — no env/client config touched
- [x] irreversible actions guarded + idempotent + flagged — none in this PR
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a, no migration
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited (research on Haiku; the three reviewers on Sonnet, one tier below this Opus session)

## For you
**What changed:** the owner controls no longer show a "Regenerate course" button
that did nothing on finished courses; the real regenerate button (for courses
with empty lessons) stays.

**What you do next:** review the preview, then merge — no env/secret action
needed. To eyeball it: open a finished course you own → the controls block shows
visibility, settings, and source materials but **no** "Regenerate course"
button; a course with lessons missing questions still shows one in its banner.

**How to roll it back:** revert this PR — it only removes a button + a prop and
adds a test; no schema, env, or data implications, so reverting restores the old
(dead) button with zero production impact.
