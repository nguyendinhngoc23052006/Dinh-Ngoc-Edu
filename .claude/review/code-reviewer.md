# Code Review — 2026-06-21 (calc DSL + dedicated calc follow-up)

## Verdict: PASS

## Findings

No blockers. Two warn-level observations:

- **File size**: `calc.ts` is 771 lines, `pipeline.ts` is 751 lines. Both flagged by the ~200-line rule, but every function is discrete and short — longest is `validateCalcSpec` (~80 lines) and `evaluateSpecialCall` (~50 lines). Responsibility per file is strictly one (`calc.ts` = sandboxed expression evaluator; `pipeline.ts` = pure pipeline helpers). Splitting would create false boundaries.
- **`pi_iter` naming**: necessary because `pi` is the mathematical constant. Documented in the prompt's DSL spec; no collision risk.

## What passed cleanly

1. **No duplicate validation.** `validateCalcSpec` lives once in `calc.ts`. Both `validateQuestion` (main path) and `validateNodeCalcQuestions` (calc path) call it; neither re-implements it. The two callers diverge only on output shape.
2. **Parser cleanliness.** Recursive-descent + AST end-to-end. Grep for `rpn`/`shunting`/`output_queue` returns zero — no remnants from the old parser.
3. **Comments policy.** New comments explain WHY (Abramowitz-Stegun error bound on `erf`, the bounded-execution rationale, step-shadowing contract, calc-is-additive contract). `// ── Basic ──` style headers in `FUNCTIONS` are navigation labels for a dense data structure, a legitimate WHAT-comment exception.
4. **`detectFormulas`** — five independent regex signals, each self-contained and testable. Correctly false on `H2O` and `$100`. False-positive on units-in-parens (`v = 30 (km/h)`) costs ~$0.005 because the prompt's "return empty array" escape handles it. Acceptable.
5. **Few-shot examples** are valid JSON, midpoint-sampleable, and parse cleanly through `validateCalcSpec` verbatim. Six patterns cover the DSL surface.
6. **DB write path** — `calc: question.calc ?? null` populates the column for calc questions and stays null otherwise. `clone_course` (`20260613050000_calc_questions.sql`) already lists `calc` explicitly.
7. **No mixed responsibility.** DB IO stays in `index.ts`; prompt/schema/validate stay in `pipeline.ts`; the sandboxed evaluator stays in `_shared/calc.ts`.
8. **Tests** — 368 unit (up from 302), all green. 63 calc parser/evaluator tests + new tests for `detectFormulas`, `buildCalcQuestionsPrompt`, `validateNodeCalcQuestions`, and the `CALC_QUESTIONS_SCHEMA` no-minItems invariant.
