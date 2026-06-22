# feat: generation pipeline rework for higher reliability

Comprehensive overhaul of the Gemini 2.5 Flash pipeline to minimize bad output, fix destructive "fill empty lessons" UX, and eliminate the 30 s timeout error. Trade-off: longer wait times in exchange for near-zero retry failures and fewer token burns.

## Problems fixed

1. **"AI request timed out after 30 s"** — `DEFAULT_REQUEST_TIMEOUT_MS` was 30 s; syllabus calls on large materials hit it on slow days.
2. **"5 of 17 lessons need more questions"** — multi-blank fill_blank questions were rejected by PR #66 validation → retry cascade → empty lessons. Fixed at the source: Gemini is now explicitly forbidden from writing them.
3. **Destructive "Fill empty lessons"** — triggered a full course wipe (all chapters, all questions, all user progress). Replaced with targeted per-lesson regeneration that only touches under-filled lessons.
4. **Low question floor** — `MIN_QUESTIONS_PER_NODE = 4` was too low; `QUESTIONS_PER_NODE = 6` produced weak lessons. Now 8 target / 5 minimum.

## What changed

### `supabase/functions/generate-course/pipeline.ts`
- `QUESTIONS_PER_NODE` 6 → 8; `MIN_QUESTIONS_PER_NODE` 4 → 5.
- `FEW_SHOT_EXAMPLE` gains an `mcq_multi` example (model now sees all three non-calc kinds in the few-shot).
- Constraints block: `"fill_blank questions MUST contain EXACTLY ONE ___ blank"`.
- Variable suffix: `IMPORTANT: fill_blank prompts must contain EXACTLY ONE ___` placed just before the "Write N questions" line (highest attention weight).
- `NODE_QUESTIONS_SCHEMA` `prompt` description: explicitly states single-blank requirement for fill_blank.

### `supabase/functions/generate-course/index.ts`
- **Timeouts:** `DEFAULT_REQUEST_TIMEOUT_MS` 30 → 50 s; `QUESTION_REQUEST_TIMEOUT_MS` 35 → 55 s; `CALC_FOLLOWUP_TIMEOUT_MS` 25 → 40 s; `CALC_FOLLOWUP_HEADROOM_MS` 30 → 50 s.
- **Pipeline budget:** `MAX_PIPELINE_MS` 600 → 720 s.
- **Thinking budgets:** syllabus call 128 → 1024; initial question call 256 → 1024 (values 1–1023 are all promoted to 1024 by Flash 2.5 internally — using 1024 explicitly is idiomatic).
- **Targeted fill:** `hasEmptyLesson` check (threshold `=== 0`) replaced by `hasUnderfilledLesson` (threshold `< MIN_QUESTIONS_PER_NODE`). When true, `needsFill=true` and `fillMissingQuestions` is dispatched instead of `generate`.
- **`fillMissingQuestions`:** New function — fetches all nodes, filters to those below threshold, deletes their existing questions, regenerates only those lessons using `generateLessonQuestions`, inserts new questions and updates `credit_prize`. All other lessons and user progress untouched. On error per-node, the error is recorded and the course lands in `ready` with `generation_error` note so the owner can retry again.

### `src/pages/CoursePage.tsx`
- Banner threshold `=== 0` → `< 5` (surfaces under-filled lessons, not just empty ones).
- Banner text: "only the incomplete lessons are regenerated, your other lessons and progress are preserved."
- Button label: "Fill empty lessons" → "Fill incomplete lessons".

### `supabase/functions/generate-course/pipeline.test.ts`
- Two new tests: fill_blank single-blank enforcement in constraints/reminder; mcq_multi example in few-shot.

## Debt left
- Per-node `credit_prize` UPDATE fires individually in `fillMissingQuestions` (mirroring `generateChapter`). Batch-upsert refactor is a stand-alone cleanup, deliberately excluded from this feature PR.
- Delete-then-insert in `fillMissingQuestions` has no cross-network transaction. If insert fails after delete, the node ends up at 0 questions and is picked up again on the next "Fill incomplete lessons" click (recoverable). Tech debt issue to open.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration (pure logic change)
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 381 tests pass, lint clean; typecheck failure (katex) is pre-existing on main
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — n/a (no payments, no emails)
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — haiku used for all three reviewers

## For you
**What changed:** Gemini is now told (3 ways) to use exactly one blank per fill_blank question; timeouts are 50–55 s instead of 30–35 s; "Fill incomplete lessons" surgically tops up only the under-filled lessons without touching the rest of the course or any user progress; questions-per-lesson floor raised to 5.

**What you do next:** Review the preview, then merge. No new env vars or secrets needed.

**How to roll it back:** Revert this PR. No migration, no schema change, no data side-effects. Courses that were filled with the new targeted path will retain their newly generated questions (the revert does not delete them).
