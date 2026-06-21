# Scale Review — 2026-06-21 (calc DSL + dedicated calc follow-up)

## Verdict: PASS

## Findings

WARN (pre-existing, deferred) — `index.ts` per-node `UPDATE credit_prize` inside `generateChapter` is still N+1 (up to 5 UPDATEs per chapter, 40 per max run). Already in memory; this PR does not worsen it. Fix belongs in a stand-alone refactor.

## What passed cleanly

1. **Pipeline budget math.** Worst-case math chapter: 5 lessons × (35 s main + 35 s retry + 25 s calc) = 475 s, plus 429 backoffs up to ~90 s = ~565 s. Under the 600 s budget with ~35 s headroom. The `CALC_FOLLOWUP_HEADROOM_MS = 30_000` gate skips the calc call when the budget is nearly exhausted, providing the last-resort guard. Across 8 chapters running in parallel, wall-clock is capped at the slowest single chapter, not 8×.
2. **Bounded queries.** `nodes` select `.limit(500)`, `course_materials` `.limit(100)`. No new unbounded selects.
3. **No new N+1.** Calc questions append to the same in-memory bucket and bulk-insert with the rest in one `insert(questionRows)` per chapter.
4. **No new indexes needed.** `calc` is a `jsonb` column on `questions`, never used as a filter or join key.
5. **Display/regrade evaluator cost.** `MAX_ITERATIONS = 10_000` bounds the worst case to ~5-10 ms per question render in browser, ~10 ms per server-side regrade. A 50-question all-`sigma` lesson costs ~500 ms per `complete-lesson` invocation — bounded by the per-lesson question cap and `MAX_ITERATIONS`.
6. **LLM cost.** Math course: +1 calc call per math-detected lesson (~$0.005). 22-lesson all-math course total ≈ $0.165, ~50% over the no-calc baseline. Acceptable per the plan + memory entry.
7. **Atomic claim unchanged.** Wipe-before-rebuild + status CAS still prevent concurrent or doubled pipelines.
8. **Calc validation re-runs at regrade** (added in this PR via `grade.ts`): a tampered DB spec gets rejected by `validateCalcSpec` at midpoint-sample evaluation rather than burning iterations at runtime. Closes the avoidable-cost surface flagged by security.
