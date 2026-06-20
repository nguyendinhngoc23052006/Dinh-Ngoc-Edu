# Code Review — 2026-06-20 (generate-course: cost + completion + quality overhaul)

## Verdict: PASS

### Findings

**Noted but deferred**

- WARN — `pipeline.ts` is now 686 lines, still well past the ~200-line guidance. Three cohesive responsibilities under one roof (prompt builders, validators, schema builder); a split into `pipeline-prompts.ts` + `pipeline-validate.ts` + `pipeline-schema.ts` is the right refactor and was already flagged in the prior review. Deferred per CLAUDE.md "Refactors are behaviour-preserving and stand alone … never inside a feature PR".
- WARN — `credit_prize` N+1 in `generateChapter` (one UPDATE per node × N parallel chapters = up to 40 serial UPDATEs spread across 8 chapter tasks). Pre-existing pattern, the parallel restructure didn't introduce it. Cleanup: collect `(id, credit_prize)` pairs and issue one upsert per chapter. Out of scope here — same standalone-refactor rule.

### What passed cleanly

1. **No orphaned exports.** Old `buildNodeRetryPrompt` fully removed; grep-confirmed (`pipeline.ts:Grep buildNodeRetryPrompt` returns zero). `delay()` helper removed from `index.ts`. Import list pruned in `index.ts` (`emptyNodeIndexes`, `NODES_PER_BATCH`, `buildNodeRetryPrompt` dropped; `SyllabusChapter` added; `buildDeltaRetryPrompt` added).
2. **New exports correctly typed and exercised.** `buildDeltaRetryPrompt(node, existingQuestions, needed, chunks, lang)` and `buildQuestionsSchema(n, { includeCalc?, minItems? })` are imported in `index.ts` and exercised in `pipeline.test.ts` (11 new tests across the two surfaces).
3. **No new Supabase queries in `pipeline.ts`** — all DB writes remain in `index.ts` per the services/components split.
4. **`generateChapter` is the right size for one responsibility.** Insert chapter → insert nodes → primary call → delta retries → bulk question insert → per-node credit_prize update. ~140 lines, every step belongs to "make this chapter ready". No mixed concerns (no auth, no env reads, no client construction inside).
5. **Parallel `Promise.all` chapter loop is correctly isolated.** Each task receives value-typed primitives + the shared `supabase` client; no shared mutable state (no shared `buckets`, no shared counters, no shared `nodeIds`). Aggregation happens after `await Promise.all` via `chapterResults.reduce`. A throw inside one task surfaces through the outer `try/catch` and marks the course `failed` — no partial-state leak.
6. **Soft-keep semantics are correctly mechanical.** `buckets[i] = result[i] ?? []` (no MIN gate in the primary write) + `buckets[i] = buckets[i].concat(result[0])` in the delta path (additive, never wipes existing). Test `buildDeltaRetryPrompt — asks for exactly the requested top-up count, not the full target` covers the delta count being `MIN - have`.
7. **Stable-prefix prompt layout** is asserted by the new `buildBatchQuestionsPrompt structure (stable prefix)` describe — `Source material:` appears before `Write `, separated by `---`. Implicit-cache eligibility documented in the docstring (1024-token min, 75% off, 5-min TTL on the 2.5 series).
8. **`rationale` CoT stripped by field-pick** as before — `validateQuestion` constructs new objects with known keys only, so the new `rationale` field on the delta-retry response is silently dropped before any DB write.
9. **`minItems` schema option correctly defaults to `nodeCount × MIN_QUESTIONS_PER_NODE`** so primary callers don't need to pass it; the delta retry passes `needed` explicitly. Test asserts both branches.
10. **CoursePage banner** is a minimal in-line counter (`reduce` × 2), no new service call, no new state. Existing button + handler reused.
11. **Comments default to WHY** — every new comment block explains a non-obvious invariant (Gemini implicit cache eligibility, soft-keep vs discard, parallel isolation, paid-tier RPM justification for dropping the delay, calc-in-retry rationale).

### Memory candidates

- A `Promise.all` over a per-chapter helper is the safe parallel shape when each task owns its own DB row inserts; no shared mutable state across tasks means a failure in one chapter cannot leak partial rows past another chapter's writes. The outer `try/catch` still catches the throw and marks the whole course `failed` — that's the correct atomicity tier for a wipe-then-rebuild pipeline.
- "Soft-keep + delta retry" is a generally-applicable pattern when an LLM call returns N-of-target items: keep what came back, list it in the retry prompt, ask for exactly `target - N` more (with the schema's `minItems` set to that count too). Cleaner failure mode than "discard and re-ask in full" because a failed retry can't lose existing work.
