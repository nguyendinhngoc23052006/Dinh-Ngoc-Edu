# Code Review — 2026-06-20 (generate-course: batched questions, rationale-CoT, timeout bump)

## Verdict: PASS with notes

### Findings

**Addressed in this PR**

- WARN — `pipeline.ts` `emptyNodeIndexes` docstring: stale, referenced the per-node primary pass. **Fixed:** updated to describe the batched-pass + threshold semantics.
- WARN — `index.ts` retry-loop comment: misleading "still-thin lesson" wording masked the fact that the primary acceptance gate (`length >= MIN_QUESTIONS_PER_NODE`) silently leaves sub-threshold buckets empty. **Fixed:** comment now spells the gate out.
- WARN — Schema/prompt mismatch on retry — retry prompt said no calc, but `buildQuestionsSchema(1)` still included calc in the kind enum. **Fixed:** `buildQuestionsSchema` accepts `{ includeCalc?: boolean }`; retry path passes `false` so the constrained-decoding enum and the prompt now agree. New tests cover both branches.
- WARN — Single-node batch edge: `buildBatchQuestionsPrompt([node], …)` was only covered indirectly. **Fixed:** added a dedicated `single-node batch` describe block in pipeline.test.ts.

**Noted but deferred**

- WARN — `pipeline.ts` is 660+ lines, well past the ~200-line guidance. All three responsibilities (prompt builders, validators, schema builder) are cohesive, but a future split into `pipeline-prompts.ts` + `pipeline-validate.ts` would be the right refactor. Out of scope here (refactor must stand alone per CLAUDE.md "Refactors are behaviour-preserving and stand alone … never inside a feature PR").

### What passed cleanly

1. No orphaned exports — old `buildNodeQuestionsPrompt` and static `QUESTIONS_SCHEMA` constant fully removed; grep-confirmed.
2. New exports (`buildBatchQuestionsPrompt`, `buildQuestionsSchema`, `MIN_QUESTIONS_PER_NODE`, `NODES_PER_BATCH`) all imported and exercised by both `index.ts` and `pipeline.test.ts`.
3. No Supabase queries or data access in `pipeline.ts` — all DB writes remain in `index.ts` per the services/components split.
4. `validateChapterQuestions` strips the `rationale` CoT via field-picking — never reaches DB.
5. Batched primary correctly maps `result[i]` back to `buckets[start + i]`, preserving node position across batch boundaries.
6. `batchSourceContext` deduplication is correct and tested (overlapping windows collapse to one chunk emission).
7. `rationale` is the first key in the schema (for Gemini emit-order influence) and correctly excluded from `required`.
8. `QUESTION_REQUEST_TIMEOUT_MS` flows from the call sites through `ChatOptions` into the `AbortController` timer.
9. No premature abstractions — `batchSourceContext` and `nodeSourceContext` represent genuinely different aggregation strategies (union vs single window).
10. Comments default to WHY, not WHAT — every new comment block explains a non-obvious invariant (rationale-CoT auto-strip, schema/prompt agreement on calc, timeout headroom, deadline budget arithmetic).

### Memory candidates

- A prompt that excludes a question kind from its instructions but lets that kind through the schema's enum is a subtle mismatch — the validator is the gate, but the schema signals intent to the model. Always agree the prompt's "use only X/Y" with the schema's enum.
- When a primary pass uses a `count >= THRESHOLD` gate before writing to a bucket and a separate `emptyBuckets` function reads those buckets, the docstring on `emptyBuckets` must say "empty" = "below threshold OR never returned" — both classes appear identical downstream.
- pipeline.ts at 660 lines is a candidate refactor target: split prompt builders from validators from schema builder. Three responsibilities under one roof.
