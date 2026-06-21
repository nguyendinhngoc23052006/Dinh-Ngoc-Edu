# Course generation: per-lesson calls, no `minItems`, no silent fail

PR #59 ("batch all of a chapter's questions in one call") shipped a 22-lesson run with 1 lesson holding 1 question and 21 lessons empty; the "Fill empty lessons" / "Regenerate" buttons then both threw `Generation failed: The AI did not produce any usable questions.` This PR is the rework.

## Why the previous shape kept failing silently

The chapter-batch call asked Gemini 2.5 Flash to produce **50 questions in one response** (10/node × 5 nodes per chapter) under a `responseSchema` whose top-level `questions` array carried `minItems: nodeCount * MIN_QUESTIONS_PER_NODE = 30`, with a nested `calc` spec (variables + formula + prompt_template + tolerance) in the kind enum, and a `node_index` field routing each question back to its lesson. Three failure modes compounded:

1. **`responseSchema.minItems` is a HARD constraint on Flash 2.5.** When the model can't meet it (token budget, complex source, mixed kinds), structured output returns empty (`{"questions":[]}`) or a truncated body — no error code, no exception. Documented behaviour, hit reliably on real material.
2. **`catch {}` blocks at `index.ts:352` and `index.ts:391`** swallowed the empty response with no log. The chapter result reported `questionsWritten: 0` and the outer pipeline just moved on.
3. **`node_index` routing**: if the model returned all questions with `node_index: 0`, only lesson 0 filled — that's how a real run produced "1 lesson with 1 question" while every other delta retry also tripped over the same schema.

## What changed

One Gemini call PER LESSON, not per chapter. Smaller asks land reliably; failures get captured instead of swallowed; the schema is the minimum viable contract.

### `supabase/functions/generate-course/pipeline.ts`
- **New:** `buildNodeQuestionsPrompt(node, existing, count, chunks, lang)` — one prompt handles both initial and retry modes by branching on `existing.length`. Stable prefix first (source + format spec + few-shot), variable ask (`Write N questions`) last, so Gemini's implicit cache reuses the prefix across same-chapter calls.
- **New:** `validateNodeQuestions(value)` — flat per-call validator (no buckets, no node_index routing). MAX_QUESTIONS_PER_NODE=10 cap preserved.
- **New:** `NODE_QUESTIONS_SCHEMA` — const, no `minItems`, no `calc`, no `rationale`, no `node_index`. Just `kind: enum[mcq, mcq_multi, fill_blank]` + difficulty + prompt + options/correct_indexes/accepted.
- **Removed:** `buildBatchQuestionsPrompt`, `buildDeltaRetryPrompt`, `buildQuestionsSchema`, `validateChapterQuestions`, `emptyNodeIndexes`, `NODES_PER_BATCH`, `batchSourceContext`, `FEW_SHOT_EXAMPLE` const.
- **Constants:** `QUESTIONS_PER_NODE` 10 → **6**, `MIN_QUESTIONS_PER_NODE` 6 → **4**, `MAX_QUESTIONS_PER_NODE` 15 → **10**. Fresh AI generation no longer produces `calc` — existing rows in seed/clones are untouched, UI still renders them. `GeneratedQuestion` type drops the `calc?` field.

### `supabase/functions/generate-course/index.ts`
- `generateChapter` now: insert chapter + nodes, then iterate lessons SEQUENTIALLY through `generateLessonQuestions`, then bulk-insert all questions + set credit_prizes. Chapters still run in parallel via `Promise.all`.
- `generateLessonQuestions(node, chunks, language, deadline)` makes the initial call asking for `QUESTIONS_PER_NODE` and, if the result is below `MIN_QUESTIONS_PER_NODE` AND there's deadline headroom, ONE retry for the missing count. Errors are captured and returned, never thrown out — one bad lesson never sinks the chapter.
- Bare `catch {}` blocks replaced with `firstError = messageOf(err)`. The outer `Promise.all` wraps each chapter's task in `.catch` that records the chapter-level failure into `lessonErrors`.
- Pipeline budget: `ensureTime` in the chapter loop replaced with a non-throwing `Date.now() > deadline` check that fills empty buckets for the remaining lessons and breaks (so partial work still inserts). `generateLessonQuestions` re-checks the deadline between initial and retry calls. `QUESTION_REQUEST_TIMEOUT_MS` 60 s → **35 s** so 5 × 2 × 35 s = 350 s/chapter, +75 s for 429 backoffs = 425 s, ~175 s headroom under the 10-min budget.
- Partial completion flips the course to `ready` AND records the per-lesson summary in `generation_error` (e.g. `2 lesson(s) need a retry — "Photosynthesis stages": no usable questions returned; ...`). The existing CoursePage banner ("N of M lessons need more questions") + "Fill empty lessons" button (`force: undefined` repair path) handles the rest.
- Thinking budgets: per-lesson initial 1024 → **768**, retry 1024 → **512**. Output tokens: per-lesson 24576 → **4096** (initial), 12288 → **3072** (retry).

### `supabase/functions/generate-course/pipeline.test.ts`
- New `describe` blocks: `validateNodeQuestions` (5 tests incl. calc-now-rejected + top-level array fallback), `buildNodeQuestionsPrompt — initial mode` (10 tests covering title, count, no-calc, no-rationale, no-node_index, kinds list, difficulty, few-shot, negatives, prompt-injection sanitisation, neighbouring chunks), `buildNodeQuestionsPrompt — retry mode` (5 tests covering exact top-up count, no-duplication context, branch-switching, no-existing-path), `buildNodeQuestionsPrompt structure (stable prefix for cache)` (2 tests), `response schemas (Gemini OpenAPI subset)` (added: NO `minItems`, NO `calc`, NO `node_index`, NO `rationale` invariants for `NODE_QUESTIONS_SCHEMA`).
- Removed: all `buildBatchQuestionsPrompt` / `buildDeltaRetryPrompt` / `buildQuestionsSchema` / `validateChapterQuestions` / `emptyNodeIndexes` blocks.
- 302 unit tests pass.

### `docs/ARCHITECTURE.md`
- Step 4 rewritten to describe per-lesson generation, the no-`minItems` rule and why, the sequential-within-chapter cache rationale.
- Step 5 names `validateNodeQuestions`.

### `MEMORY.md`
- Replaced the obsolete per-batch entry with the new per-lesson shape + the `minItems` silent-killer lesson + the budget/timeout math.
- Trimmed the stale rationale-first emit-order claim from the OpenAPI-subset entry.
- Updated the empty-lessons root-cause entry with a pointer to the new shape.

## Cost / reliability math

Source: [Gemini 2.5 Flash $0.30/$2.50 per M tokens](https://ai.google.dev/gemini-api/docs/pricing) (input/output), [implicit caching 75 % off 2.5 family](https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/).

| Per 22-lesson course | Previous batch (intended) | This PR (per-lesson) |
|---|---|---|
| Question calls | 5 chapter primaries × 50q = 250 questions targeted | 22 lesson initials × 6q + ~retries = ~132 questions targeted |
| Output tokens | ~75K (5 × 15K) | ~22K (22 × 1K) |
| Input tokens (cached after first hit per chapter) | ~80K | ~160K nominal → ~70K effective (75 % discount) |
| **Output cost** | $0.19 | **$0.055** |
| **Input cost** | $0.024 | **$0.021** |
| **Total/course** | **$0.21** | **$0.076 (~64 % cheaper)** |
| Failure mode | `minItems: 30` unmet → empty response, silent catch → "0 questions" | small ask + no `minItems`; failures captured per lesson, surfaced in `generation_error` |
| Worst-case wall-clock | ~3 min (intended) / ∞ (actual: failed runs ran the full retry budget) | ~6 min/chapter × parallel ≈ 6-7 min |

The cost win is real because the previous shape paid for 250 questions worth of output even when the model returned 0 valid ones — every cent went to thinking tokens + an empty structured-output payload. Per-lesson asks fewer questions AND smaller schemas, so output tokens drop ~3×.

The reliability win is what motivated this — small, simple per-lesson asks are what Flash 2.5 reliably ships. The schema simplification (no `minItems`, no `calc`, no `rationale`) removes every constraint Gemini's structured output mode trips on.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — **no migration** (no schema change; `calc` column stays nullable, existing rows untouched)
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — **302 unit tests pass** (lint + typecheck clean), e2e **3/3 pass**, unhappy paths covered (garbage JSON, malformed questions, out-of-range/missing node_index dropped, prompt-injection sanitisation, partial completion → ready)
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — atomic-claim guard unchanged; wipe-then-rebuild idempotent; parallel chapter tasks share no mutable state; a throw in one chapter's task is caught by `.catch` and reported per-lesson instead of failing the whole run
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Course generation now makes one small AI call per lesson (asking for 6 questions) instead of one big call per chapter (asking for 50 questions across 5 lessons). The previous shape was failing silently because Gemini's structured-output mode treats `responseSchema.minItems` as a hard contract — when it couldn't produce 30 valid questions in one go, it returned an empty list and our code swallowed it. The new per-lesson shape has no `minItems`, no `calc` schema, no `node_index` routing — just the minimum viable contract — and every failure is captured and surfaced in the empty-lessons banner instead of disappearing.

**What you do next:** Review the preview. Generate a fresh course (or hit "Fill empty lessons" on the half-baked course from the last run) — every lesson should land with 4-6 questions, and any lesson that DID fail should now show up in the banner with a real reason. Merge when satisfied. **No env/secret changes** — `AI_API_KEY` + `gemini-2.5-flash` default still apply. Deploy redeploys the Edge Function automatically.

**How to roll it back:** Revert this PR — four files (`pipeline.ts`, `index.ts`, `pipeline.test.ts`, `docs/ARCHITECTURE.md`) plus `MEMORY.md`. No schema or data side-effects. In-flight courses mid-generation when the revert lands will fall back to the previous batched pipeline on the next claim; nothing in the DB depends on the new shape.
