# Generation: fix silent question drops, reduce cost, cap concurrency

Two bugs + one cost spike, all in one PR so you can test end-to-end.

## Root causes

**Bug 1 — "1 question per lesson":** `NODE_QUESTIONS_SCHEMA` only had `required: ['kind','difficulty','prompt']`. Gemini was free to omit `options`, `correct_indexes`, and `accepted`. `validateQuestion` silently returns `null` for any question missing those fields. Result: model returns 6 questions, 5 get nulled, 1 survives (the one that matched the only mcq few-shot example). No error recorded.

**Bug 2 — "0 questions for some lessons":** All chapters fired simultaneously via `Promise.all`. For a large course, 8 concurrent chapter bursts → 40 simultaneous Gemini calls → 429 rate limits → the 35 s `AbortController` fires → `AbortError` caught, `firstError` set, retry also times out → 0 questions, lesson skipped.

**Cost spike:** PR #61 added a calc follow-up call per formula-detected lesson. `detectFormulas` fired on the word "calculate", "formula", "equation" in plain text — effectively every academic lesson. Each fired with `thinkingBudget: 1024` (thinking tokens cost $3.50/M, ~12× input), and all main question calls also carried generous thinking budgets that weren't needed for schema-constrained output.

## What changed

### `pipeline.ts`
- `NODE_QUESTIONS_SCHEMA.required`: `['kind','difficulty','prompt']` → `['kind','difficulty','prompt','options','correct_indexes','accepted']`. Gemini now always emits all three fields; `fill_blank` returns `correct_indexes:[]`, `mcq` returns `accepted:[]`. Validator stops silently dropping.
- `options`/`correct_indexes`/`accepted` descriptions updated from "omit for fill_blank" → "empty array [] for fill_blank/mcq".
- `FEW_SHOT_EXAMPLE`: added a `fill_blank` example alongside the existing `mcq`. Both now show all required fields including the empty-array cases.
- `detectFormulas` signal 3: removed broad keywords (`formula`, `equation`, `compute`, `calculate`) as standalone triggers — they fire on plain narrative like "scientists calculate…". Kept only narrow markers: `where X =`, `is given by`, `derivative`, `integral`. Signals 1/2/4/5 (equality with numeric expression, arithmetic on digits, LaTeX, Greek) unchanged.

### `index.ts`
- `CHAPTER_CONCURRENCY = 3`: chapters now run 3-at-a-time via `mapConcurrent` instead of all-at-once. 3 is the minimum that keeps worst-case wall time under MAX_PIPELINE_MS: ceil(8/3)×5×35 s + 30 s ≈ 555 s < 600 s.
- `mapConcurrent<T,U>(items, limit, fn)`: worker-pool helper; preserves result order via pre-captured index (`const i = next++`).
- Thinking budgets cut: syllabus initial 512→128, syllabus re-ask 512→0, per-lesson initial 768→256, per-lesson retry 512→0, calc follow-up 1024→0.
- `chatInLanguage` language re-ask: `opts` → `{ ...opts, thinkingBudget: 0 }`. A "translate this" correction pass doesn't need reasoning tokens.

### `pipeline.test.ts`
- `detectFormulas` test updated: "flags formula keywords" split into "flags narrow markers" (still true) and "does not flag broad keywords in plain narrative" (now correctly false).

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration (no schema change)
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 369 tests pass, lint and typecheck clean
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — n/a (no irreversible actions)
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Gemini now always returns all required question fields (no more silent drops → 5–6 questions per lesson instead of 1). Chapters are rate-limited to 3 concurrent (no more 429 bursts → no more 0-question timeouts). Thinking budgets cut ~75% and calc follow-up fires far less often → ~60–70% cost reduction per generation.

**What you do next:** Generate a fresh course and verify every lesson has 4–6 questions. Merge when satisfied. No env/secret changes needed.

**How to roll it back:** Revert this PR. Three files changed (`pipeline.ts`, `index.ts`, `pipeline.test.ts`). No DB schema, no migration, no data side-effects.
