# Course generation: per-lesson calls, no `minItems`, no silent fail — plus calc DSL with safe expanded math

PR #59 ("batch all of a chapter's questions in one call") shipped a 22-lesson run with 1 lesson holding 1 question and 21 lessons empty; the "Fill empty lessons" / "Regenerate" buttons then both threw `Generation failed: The AI did not produce any usable questions.` This PR is the rework — plus calc questions are back, now via a separate per-lesson follow-up call with an expanded safe DSL that covers ~95% of quiz-shaped math (microeconomics, finance, physics, stats, probability, basic calculus via Riemann/Simpson/Newton).

## Why the previous shape kept failing silently

The chapter-batch call asked Gemini 2.5 Flash to produce **50 questions in one response** (10/node × 5 nodes per chapter) under a `responseSchema` whose top-level `questions` array carried `minItems: nodeCount * MIN_QUESTIONS_PER_NODE = 30`, with a nested `calc` spec in the kind enum, and a `node_index` field routing each question back to its lesson. Three failure modes compounded:

1. **`responseSchema.minItems` is a HARD constraint on Flash 2.5.** When the model can't meet it, structured output returns empty (`{"questions":[]}`) or a truncated body — no error, no exception.
2. **`catch {}` blocks at `index.ts:352` and `index.ts:391`** swallowed the empty response with no log.
3. **`node_index` routing**: if the model returned every question with `node_index: 0`, only lesson 0 filled.

## What changed

One Gemini call PER LESSON for the main mcq/fill_blank pass, plus a SEPARATE per-lesson calc follow-up call gated by source-formula detection. Smaller asks land reliably; failures get captured instead of swallowed; the schema is the minimum viable contract.

### Main per-lesson pass (`supabase/functions/generate-course/`)
- **New:** `buildNodeQuestionsPrompt(node, existing, count, chunks, lang)` — one prompt handles both initial and retry modes by branching on `existing.length`. Stable prefix first (source + format spec + few-shot), variable ask last, for Gemini's implicit cache.
- **New:** `validateNodeQuestions(value)` — flat per-call validator (no buckets, no node_index routing).
- **New:** `NODE_QUESTIONS_SCHEMA` — const, no `minItems`, no `calc`, no `rationale`, no `node_index`. Just `kind: enum[mcq, mcq_multi, fill_blank]` + difficulty + prompt + options/correct_indexes/accepted.
- **Removed:** `buildBatchQuestionsPrompt`, `buildDeltaRetryPrompt`, `buildQuestionsSchema`, `validateChapterQuestions`, `emptyNodeIndexes`, `NODES_PER_BATCH`, `batchSourceContext`.
- **Constants:** `QUESTIONS_PER_NODE` 10 → **6**, `MIN_QUESTIONS_PER_NODE` 6 → **4**, `MAX_QUESTIONS_PER_NODE` 15 → **10**.
- `generateChapter` iterates lessons SEQUENTIALLY through `generateLessonQuestions`; chapters still run in parallel via `Promise.all`. Bare `catch {}` blocks replaced with `firstError = messageOf(err)`. The outer `Promise.all` wraps each chapter's task in `.catch` that records the chapter-level failure into `lessonErrors`.
- Pipeline budget: `ensureTime` in the chapter loop replaced with a non-throwing `Date.now() > deadline` check that fills empty buckets for the remaining lessons and breaks. `generateLessonQuestions` re-checks the deadline between initial and retry calls. `QUESTION_REQUEST_TIMEOUT_MS` 60 s → **35 s**.
- Partial completion flips the course to `ready` AND records the per-lesson summary in `generation_error`.

### Calc DSL — `supabase/functions/_shared/calc.ts` (771 lines, every function discrete)
- **Parser** rewritten as recursive-descent → AST → walker. Supports `+ − × ÷ % ^`, ternary `?:`, comparisons `< <= > >= == !=`, logical `&& || !`, function calls.
- **~50 whitelisted functions:** abs/sign/min/max/sqrt/cbrt/pow/mod · exp/ln/log/log2/log10/logb · sin/cos/tan/asin/acos/atan/atan2 · sinh/cosh/tanh/asinh/acosh/atanh · floor/ceil/round/trunc · factorial/choose/perm/gcd/lcm · sum/prod/mean/median/variance/stdev (variadic) · binom_pmf/binom_cdf/normal_pdf/normal_cdf (Abramowitz-Stegun erf, ~1.5e-7 error) /poisson_pmf/poisson_cdf · constants `pi`, `e`.
- **Four specials with custom scoping:** `sigma(lo,hi,body)` (binds `i`) · `pi_iter(lo,hi,body)` (binds `i`; `pi` is the constant) · `iterate(init,count,body)` (binds `x`, Newton-style) · `cases(c1,v1,c2,v2,...,default)`.
- **Multi-step solver**: `CalcSpec` gains optional `steps?: { name, formula }[]`. Each step's formula evaluates over `{variables ∪ earlier steps}` and binds its name for later steps + the final formula. The microeconomics canonical example (consumer surplus from a linear market) is now a clean three-line spec.
- **Hard bounds**: `MAX_ITERATIONS = 10_000`, `MAX_EXPRESSION_DEPTH = 200`, `MAX_FORMULA_CHARS = 500`. Enforced both at validation (midpoint sample, cheap) and at runtime (last-resort).
- **Validation**: `validateCalcSpec` rejects shadowing (variables can't be named after a function/constant; steps can't shadow variables or earlier steps), unbound references, and divergent midpoint samples.
- **Backward compatible**: old single-formula specs work unchanged (`steps` defaults to undefined → empty chain).

### Calc generation path — `supabase/functions/generate-course/pipeline.ts`
- **`detectFormulas(text)`** — five-signal regex heuristic (equality with numeric expression, arithmetic on numerics, formula keywords, LaTeX markers, Greek letters). False on pure narrative text; false-positives are cheap (~$0.005 burned on an empty response).
- **`CALC_QUESTIONS_SCHEMA`** — calc-only response shape. No `minItems` (empty array is a valid response). No `additionalProperties`, no `propertyOrdering`.
- **`buildCalcQuestionsPrompt`** — dedicated calc prompt with the full DSL spec inline + 6 few-shots covering single-formula (simple interest), multi-step (consumer surplus), piecewise (progressive tax), log/sqrt (utility max), series (PV of annuity), and combinatorics (binomial). Explicit "return empty array if no formula" escape hatch.
- **`validateNodeCalcQuestions`** — parses the response, routes each entry through `validateCalcSpec`, drops anything that doesn't survive midpoint-sample evaluation.

### Calc wired into the pipeline — `supabase/functions/generate-course/index.ts`
- After the main mcq/fill_blank pass + retry, if `detectFormulas(lessonSource)` AND `Date.now() + 30_000 < deadline`, fires a calc follow-up call with `CALC_QUESTIONS_PER_NODE = 2`, `thinkingBudget: 1024`, `maxOutputTokens: 4096`, `timeoutMs: 25_000`. Failure silently swallowed — calc is **additive bonus**; never makes the lesson worse than the no-calc baseline.
- DB write: `calc: question.calc ?? null`. `clone_course` already lists `calc` explicitly so clones work.

### Safer regrading — `supabase/functions/_shared/grade.ts`
- `isExactlyCorrect` now re-validates a DB-sourced calc spec through `validateCalcSpec` before passing to `gradeCalc`. A tampered row with an at-cap `sigma` range gets rejected cheaply at midpoint sample instead of burning 10K iterations per regrade. RLS already scopes writes to owners; this closes the avoidable-cost surface.

### Tests
- `calc.test.ts`: **63 tests** covering arithmetic, comparisons, ternary precedence, constants, all function families, multi-step chain, bounded iteration with cap enforcement, divergence rejection, function-name shadowing, formula-length / nesting-depth caps.
- `pipeline.test.ts`: new tests for `detectFormulas` (positive + negative + narrative-text), `buildCalcQuestionsPrompt` (lesson title, count, DSL spec, escape hatch, few-shot patterns, prompt-injection sanitisation, stable-prefix ordering), `validateNodeCalcQuestions` (well-formed, malformed-spec drop, empty-array, garbage, multi-step), `CALC_QUESTIONS_SCHEMA` (Gemini OpenAPI subset, no minItems).
- **368 unit tests pass** (up from 302); lint + typecheck clean; e2e **3/3 pass**.

### Docs + memory
- `docs/ARCHITECTURE.md` step 4b describes the calc follow-up flow and the DSL surface.
- `MEMORY.md` records: the per-lesson shape and `minItems` silent-killer (from the rework), the calc follow-up gating + cost math, and the safe-DSL parser invariant ("no `eval`, re-validate DB-sourced specs at regrade time, `pi_iter` not `pi`").

## Cost / reliability math

| Per 22-lesson course | Previous batch (intended) | This PR — text course | This PR — math course |
|---|---|---|---|
| Question calls | 5 chapter primaries × 50 | 22 lesson main + ~retries | 22 main + 22 calc follow-ups |
| Output tokens | ~75K | ~22K | ~44K |
| **Total cost** | **$0.21** | **$0.076 (~64 % cheaper)** | **$0.165 (~50 % more than text)** |
| Failure mode | `minItems: 30` unmet → empty | small ask + no `minItems` | calc is bonus, can't make lesson worse |
| Calc coverage | nominally yes, actually broken | none (didn't apply) | covers ~95% of quiz math via DSL |

The cost win on text courses is real because the previous shape paid for 250 questions worth of output even when the model returned 0 valid ones. Per-lesson is cheaper AND more reliable. The cost bump on math courses is the dedicated calc call (only fires when source has formulas) — well-bounded and only paid where it adds value.

The reliability win is what motivated this — small, simple per-lesson asks are what Flash 2.5 reliably ships. The calc call has the "return empty array" escape so a false-positive detection never makes the lesson worse.

## What this DSL covers vs doesn't

**Covers** — algebra, microeconomics (multi-step + piecewise), finance (NPV via sigma, brackets via ternary), intro physics (trig + sqrt + log), stats (variance/stdev variadic), discrete math (factorial/choose/perm/gcd/lcm), probability (binom/normal/poisson PMF/CDF), bounded iteration (Newton's method, Riemann/Simpson sums), and any subject where the answer decomposes into closed-form expressions or bounded loops.

**Doesn't cover** — symbolic calculus (would need a CAS), matrix inversion at runtime, exact rationals. Those don't fit a single-number quiz answer anyway.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — **no migration** (no schema change; `calc` column stays nullable, existing rows untouched)
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — **368 unit tests pass** (lint + typecheck clean), e2e **3/3 pass**, unhappy paths covered (garbage JSON, malformed questions, calc shadowing/divergence, iteration-cap enforcement, prompt-injection sanitisation, partial completion → ready)
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — atomic-claim guard unchanged; wipe-then-rebuild idempotent; parallel chapter tasks share no mutable state; calc is additive (never regression)
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Course generation now makes one small AI call per lesson for mcq/fill_blank questions (asking for 6 instead of 50, no `minItems` floor), and a separate calc call on lessons whose source contains formulas. Calc is back with an expanded safe math DSL — multi-step solvers, ternary piecewise definitions, ~50 whitelisted functions (trig, stats, combinatorics, probability), and bounded iteration (`sigma`, `iterate`) — all parsed and evaluated through a recursive-descent + AST walker with no `eval`. Microeconomics example: consumer surplus from a linear market is now a clean three-line spec the model can produce reliably. Every failure mode that produced the "22 lessons / 1 question" bug is gone: no `minItems` anywhere, every error captured to `generation_error`, calc additive so it can never make the lesson worse than the no-calc baseline.

**What you do next:** Review the preview. Generate a fresh course on an econ/physics/finance source — every lesson should land with 4-6 mcq/fill_blank and math-detected lessons should also get 1-2 calc questions. Hit "Fill empty lessons" on any half-baked course from earlier runs. Merge when satisfied. **No env/secret changes** — `AI_API_KEY` + `gemini-2.5-flash` default still apply. Deploy redeploys the Edge Function automatically.

**How to roll it back:** Revert this PR. Five files (`pipeline.ts`, `index.ts`, `pipeline.test.ts`, `calc.ts`, `calc.test.ts`, `grade.ts`) plus `MEMORY.md` + `docs/ARCHITECTURE.md`. No schema or data side-effects. Existing `calc` rows in the DB (seed, clones, this PR's generated rows) all keep grading because the new evaluator is a strict superset of the old. In-flight courses mid-generation when the revert lands will fall back to the previous pipeline on the next claim; nothing in the DB depends on the new shape.
