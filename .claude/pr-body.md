# Fix: calc questions now work in mock tests

A `calc` (calculation) question dropped into a mock test was a real bug. The
mock-test runner only branched on `fill_blank`; everything else fell through to
the multiple-choice component. A calc question therefore rendered with the wrong
UI (no number input, options it doesn't have) and was graded as always wrong —
silently corrupting that test's score. The single-lesson player (`LessonPlayer`)
already handled all three question kinds; only the mock-test runner was missing
the branch.

## What's in the diff
- **`MockTestRunner.tsx`:** added the `calc` dispatch branch, matching
  `LessonPlayer`'s order (`calc` → `fill_blank` → choice), so calc questions
  render `CalcQuestion` and grade correctly.
- **End-of-test review fix:** a calc question's correct answer depends on the
  random values rolled for that take, which the runner previously discarded. It
  now keeps each response (`responseByIndex`) alongside its grade so the mistake
  review can show the real expected value instead of a blank.
- **`lessonService.ts`:** extracted `correctAnswerText(question, response?)` —
  the calc-aware "what was the right answer" logic that `LessonPlayer` had inline
  (now a second caller exists, so the shared helper is justified). `LessonPlayer`
  now uses it too, removing the duplication.
- **`lessonService.test.ts`:** added a `correctAnswerText` block — calc with a
  response (computes from the take's values), calc without a response (blank, no
  take to compute), and the non-calc fallback to the stored answer key.

No migration, no schema, no query, no write — this is a client-side rendering fix
plus a pure tested helper.

Noted, not fixed (out of scope, per surgical rule): `extract.test.ts` fails in a
fresh sandbox until `npm install` pulls the `fflate`/`unpdf` devDependencies —
an environment quirk, not a code issue; CI's `npm ci` has them.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

(Boxes with no surface this PR — migration, RLS, src/types, irreversible
actions, env/secret — are ticked as "nothing to do": no SQL, no schema, no
secrets. The three reviewers ran on Sonnet, one tier below this Opus session.)

## For you
**What changed:** calc questions placed in a mock test now show the proper
number-entry UI and grade correctly (they were rendering as multiple-choice and
always scoring wrong), and the end-of-test mistake review shows a calc question's
real correct answer instead of a blank.

**What you do next:** review the preview and merge — no env/secret/dashboard
action needed. To exercise it: build a course that yields a calc question, create
a mock test that includes that chapter, and confirm the calc question shows a
number box and grades right.

**How to roll it back:** revert this PR's single commit (GitHub → the PR →
**Revert**), or locally `git revert <sha>`. No schema or data to undo.
