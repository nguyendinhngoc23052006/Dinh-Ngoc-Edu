# Code Review — 2026-06-21 (generate-course: per-lesson pipeline)

## Verdict: PASS

## Findings

All findings from the first pass were addressed in the same branch:

- Docs at `docs/ARCHITECTURE.md:40-50` rewritten to describe the per-lesson shape and name `validateNodeQuestions` (was: `validateChapterQuestions` + per-chapter batch).
- `pipeline.ts` WHAT-comments trimmed: `chunkText`, `parseJsonLoose`, `validateSyllabus`, `verifyQuestion` headers now state only the non-obvious WHY (or are dropped entirely where the name says it).

## What passed cleanly

1. **No duplicate prompt code between initial and retry.** `buildNodeQuestionsPrompt` handles both modes by branching on `existing.length > 0`. Source material, format spec, and few-shot appear once; only the constraint sentence and the final "Write N" line differ.
2. **No orphaned exports.** `emptyNodeIndexes`, `NODES_PER_BATCH`, `buildBatchQuestionsPrompt`, `buildDeltaRetryPrompt`, `validateChapterQuestions`, `buildQuestionsSchema` are all absent. Grep confirms zero matches.
3. **`generateChapter` responsibility boundary is correct.** DB IO (chapter row, node rows, question insert, credit_prize update) stays in `index.ts`; all prompt-build + validate logic delegates to `pipeline.ts`.
4. **question_count signal preserved.** Per-node question inserts write one row per question with `node_id`, so the existing `nodes.select('id, questions(count)')` aggregate used by the CoursePage banner reads the correct count per lesson.
5. **No function over ~50 lines.** `generateLessonQuestions` is ~55 lines including the budget check; `generateChapter` is ~95 lines but every step is a discrete DB call.
6. **`services/generationService.ts` untouched** — no client-side test change required.
7. **Tests cover every renamed/new export.** Initial mode, retry mode, stable-prefix ordering, schema forbidden-key + no-minItems + no-calc + no-node_index + no-rationale invariants all exercised.
