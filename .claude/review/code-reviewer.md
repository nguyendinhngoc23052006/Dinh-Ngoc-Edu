# Code Review — PR #67 generation pipeline rework

## Verdict: PASS

### Findings
1. **`fillMissingQuestions` atomic claim:** Correctly dispatched only after the same atomic claim that guards `generate`. `needsFill=true` cannot be set on a course in `processing` state.

2. **`force=true` path correct:** When `force=true`, the early-return block is skipped entirely, so `needsFill` stays `false` and `generate` (full wipe+rebuild) is dispatched — correct.

3. **`SyllabusNode` synthetic shape:** `generateLessonQuestions` needs `title`, `chunk_index`, and optionally `summary`. The synthetic node sets all three (`summary: ''` for fill path). Type-safe.

4. **Concurrency of per-node updates:** `mapConcurrent(underfilled, CHAPTER_CONCURRENCY, ...)` runs at most 4 parallel deletes+inserts. Each delete is scoped by `node_id` (indexed FK). No contention beyond normal PG row locks.

5. **Thinking budget 1024:** Values 1–1023 are all promoted to 1024 internally by Gemini 2.5 Flash; setting 1024 explicitly is idiomatic and correct.

6. **Test additions:** Two new assertions cover the fill_blank single-blank constraint and the mcq_multi few-shot example. Existing constant assertions still pass (MIN=5 < QUESTIONS=8 > 0).

### Deliberate debt noted (not blockers)
- Per-node `credit_prize` UPDATE in fill path mirrors the existing pattern in `generateChapter`. Batch-upsert refactor deferred as stand-alone cleanup.
