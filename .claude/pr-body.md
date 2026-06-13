Phase 2/7: AI-assigned, material-grounded question difficulty.

**Goal (restated):** a question's difficulty should reflect the material it came from — not always easy, not always hard. The AI now tags each question `easy`/`medium`/`hard`, judged from its source chunk, and the lesson UI shows the tag.

**What this does:**
- New `questions.difficulty` column (`text not null default 'medium'`, checked `easy|medium|hard`). Additive with a default, so every existing row stays valid; no RLS change (questions already inherit their course's visibility policies).
- The chapter-questions prompt now asks the model to tag each question's difficulty *from the source* — recall of a stated fact = easy, applying/connecting ideas = medium, multi-step reasoning/synthesis = hard — and explicitly tells it to let the material set the mix rather than forcing a uniform or artificially-spread difficulty.
- The pipeline validates the tag (`toDifficulty`): a missing or garbled value falls back to `medium` so a bad tag never drops an otherwise-good question. Difficulty is persisted on insert.
- The lesson player shows a colored difficulty badge per question.
- `clone_course()` is replaced (fix-forward) to copy the new column — it uses an explicit column list, so without this a cloned course would silently reset every question to `medium`.

**Assumptions:** difficulty is informational for now (it does not change grading or question order); it becomes the input to the Phase 4 credit-prize calculation. `src/types/database.ts` is updated in lockstep (`QuestionDifficulty` + `Question.difficulty`). All question reads use `.select()` (all columns), so the column propagates to the lesson player and mock tests with no query changes.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest (20260613042200); new tables have RLS (no new table; additive column on an RLS-protected table); src/types matches
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (115/115; new tests: valid tag kept, invalid/missing tag → medium, prompt grounds difficulty in material; existing fixtures updated for the new field)
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged (none in this PR)
- [x] no avoidable debt; memory updated and pruned (clone_course explicit-column gotcha recorded in supabase/CLAUDE.md)
- [x] migrations explained in plain English

## For you
**What changed:** each generated question now carries an AI-judged difficulty (easy/medium/hard) based on its source material, shown as a badge in the lesson player; the clone function was updated so copied courses keep their difficulties.
**What you do next:** review the preview, then merge — no env or secret action needed. The migration runs first on the PR's preview DB; to sanity-check, generate a course and confirm questions show a mix of difficulty badges that fits the material. (Old courses generated before this PR show `medium` for every question — expected, since their rows predate the tag.)
**How to roll it back:** revert this PR on GitHub, then add a fix-forward migration dropping the column (`alter table public.questions drop column difficulty;`) and restoring `clone_course`'s prior column list — a merged migration can't be un-run, so the column is removed by a new migration, not by reverting the file.
