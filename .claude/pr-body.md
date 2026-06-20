# Batch question generation + rationale-CoT + 60 s timeout

Course generation was producing 1-2 questions per node and leaving some lessons empty. Root causes in the existing pipeline:

1. Per-node primary call accepted `>= 2` questions as success — anything thin slipped through to "ready" without a retry.
2. Retry ran with `thinkingBudget: 0` — same prompt, no extra reasoning, so it almost never recovered a failed node.
3. The `chat()` `AbortController` was hard-coded to 30 s — fine for the old small per-node calls, but would have killed a 4-node batched call mid-stream.
4. The static `QUESTIONS_SCHEMA` had no `minItems`, no `description`, no CoT field — the model could underproduce silently.

This PR rebuilds the question step around batched calls + rationale-CoT + an enforced acceptance floor, plus the smaller fixes the reviewers caught.

## What changed

**`supabase/functions/generate-course/pipeline.ts`**
- New `buildBatchQuestionsPrompt(nodes, chunks, lang)` — one call covers up to `NODES_PER_BATCH = 4` lessons, with a few-shot example, "rationale FIRST" directive, and negative constraints ("no common-sense questions, no concept duplication, distribute coverage evenly"). `batchSourceContext` unions and dedupes each node's ±1 chunk window.
- Removed the per-node `buildNodeQuestionsPrompt` — batching covers it. Updated `buildNodeRetryPrompt` to ask for the full `QUESTIONS_PER_NODE` target (was 3), include rationale-first, exclude calc, and add the same negative constraints.
- New `buildQuestionsSchema(nodeCount, { includeCalc })` function replaces the static `QUESTIONS_SCHEMA` constant: `description` on every property, `minItems: nodeCount * MIN_QUESTIONS_PER_NODE` on the top-level array (so a 4-node batch must return ≥ 16 questions), `minItems: 2` on options, and **`rationale` is the first key in `properties`** so Gemini emits it first (key-definition order is the supported lever — the Gemini extension `propertyOrdering` is not in the OpenAPI subset and 400s, same class of bug as `additionalProperties` from PR #56). The validator field-picks the question shape, so `rationale` never reaches the DB.
- The retry path calls `buildQuestionsSchema(1, { includeCalc: false })` — the constrained-decoding `kind` enum now agrees with the retry prompt's "use only mcq/mcq_multi/fill_blank" line.
- New constants `MIN_QUESTIONS_PER_NODE = 4` (primary acceptance floor — was implicit `>= 2`) and `NODES_PER_BATCH = 4` (chosen so 4 × 6 questions with rationales comfortably fit the 16 384-token output budget).

**`supabase/functions/generate-course/index.ts`**
- Per-node primary loop replaced with a per-batch loop iterating `chapter.nodes.slice(start, start + NODES_PER_BATCH)`. Inter-call 4 s delay preserved across batches (every call after the first of the entire pipeline).
- Primary call budgets: `thinkingBudget: 4096` (was 2048), `maxOutputTokens: 16384` (was 8192). Retry call budgets: `thinkingBudget: 4096` (was 0), `maxOutputTokens: 8192` (was 4096).
- Acceptance gate raised: `result[i]?.length >= MIN_QUESTIONS_PER_NODE` before writing a bucket (was `>= 2`).
- New `ChatOptions.timeoutMs` field. Question calls (both batch and retry) pass `QUESTION_REQUEST_TIMEOUT_MS = 60 000`; everything else defaults to 30 s. `chat()` reads `opts.timeoutMs ?? 30_000` for the `AbortController` timer. The pre-change hard-coded 30 s would have killed every 4-node batched call mid-stream.
- `MAX_PIPELINE_MS` raised from 6 min to **10 min** to fit `10–16 × 60 s` ceiling primary + per-node retries on a max-size 8 × 5-node course (scale-reviewer caught this on first pass). Still well under the 15-min `STALE_PROCESSING_MS` reclaim window.

**`supabase/functions/generate-course/pipeline.test.ts`**
- New `describe('buildBatchQuestionsPrompt')` block: multi-node titles, total-questions count, node-index labelling, prompt-injection sanitisation, dedup of overlapping chunk windows, calc/difficulty/rationale/few-shot/negative-constraints assertions.
- New `describe('buildBatchQuestionsPrompt (single-node batch)')` for the retry-shaped and remainder cases.
- Updated `buildNodeRetryPrompt` tests for the full target, rationale-first, and negative-constraints.
- New `describe('buildQuestionsSchema')` block: dynamic `minItems`, `rationale` as the first key, `rationale` not in `required`, `options.minItems = 2`, node-index range embedded in the description, `includeCalc` flag.
- Updated the Gemini OpenAPI-subset regression test to also reject `propertyOrdering` and to exercise both `n=1` and `n=NODES_PER_BATCH`.

## What this brings (and what it costs)

Quality lift across the wound:

- **Schema floor.** Gemini's constrained decoding now refuses to terminate the array before `nodeCount × 4` questions. Underproduction → schema violation → retry, not silent success.
- **Acceptance floor.** A bucket with < 4 usable questions after primary triggers the per-node retry — no more `>= 2` "good enough" passes.
- **Rationale-first CoT.** Each question is preceded by a brief justification the model emits before committing to the answer. Auto-stripped by the field-picking validator, so zero DB impact.
- **Real retries.** Retry now uses 4096 thinking tokens and the same target as primary — was effectively a same-brain re-ask before.
- **Few-shot + negative constraints.** A concrete example of the question shape + explicit "no common-sense / no duplicates / distribute coverage" lines in both prompts.

Cost: roughly +20–40 %/course tokens (more thinking and rationale offset by halving the call count via batching and ~4 s saved per batch on inter-call delays). Wall-clock is comparable or faster on typical courses (fewer delays beats bigger per-call response time).

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 309 unit tests pass, lint + typecheck clean, e2e 3/3 pass
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — generation is wipe-then-rebuild, atomic status claim unchanged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a, no migration
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** The course-generation step now bundles up to four lessons per Gemini call (instead of one), forces the model to write a brief rationale before each question, requires at least four good questions per lesson before accepting the result, and gives the slow-but-thoughtful 60-second timeout the bigger calls need; the pipeline budget moved from 6 to 10 minutes so a max-size course still fits.
**What you do next:** Review the preview, regenerate a course (the empty-lessons banner is the easiest path to exercise the new batched primary + retry), then merge. No env or secret changes; deploy redeploys the Edge Function automatically.
**How to roll it back:** Revert this PR — three files, no schema or data side-effects. In-flight courses that are mid-generation when the revert lands will fall back to the older per-node pipeline on next claim; nothing in the DB depends on the new structure.
