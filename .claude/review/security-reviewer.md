# Security Review — 2026-06-21 (calc DSL + dedicated calc follow-up)

## Verdict: PASS

## Findings

WARN (resolved in this PR) — `supabase/functions/_shared/grade.ts` previously passed a DB-sourced `question.calc` directly to `gradeCalc`. A tampered row with an at-the-cap `sigma` range would burn ~10K iterations per regrade before the runtime cap fired. Fixed: `isExactlyCorrect` now calls `validateCalcSpec(question.calc)` first and short-circuits to false on null. RLS already scoped writes to owners; this closes the avoidable-cost surface anyway.

## Verified as secure

1. **No `eval`** — `evaluateCall` (`calc.ts:548`) gates every function through `FUNCTIONS[node.name]`. `FUNCTIONS` is a static closed registry. Grep over `calc.ts` for `eval|new Function` returns nothing.
2. **DoS via iteration** — `MAX_ITERATIONS = 10_000` enforced at validation (`validateCalcSpec` midpoint sample) AND runtime (`evaluateSpecialCall` for `sigma`/`pi_iter`/`iterate`). Both paths throw hard.
3. **DoS via nesting** — `MAX_EXPRESSION_DEPTH = 200` via `Parser.enter()`/`leave()` called on every recursive entry. Right-recursive ternary chains bounded too.
4. **DoS via formula length** — `MAX_FORMULA_CHARS = 500` at `tokenize` entry; `validateCalcSpec` also slices to the same length before evaluation.
5. **Function-name shadowing** — `RESERVED_NAMES` = union of `FUNCTIONS` keys + `CONSTANTS` keys. A spec with `variables: [{name: "sin"}]` rejects in `validateCalcSpec`. Step names checked the same way.
6. **Tampered DB calc spec at regrade** — `grade.ts:isExactlyCorrect` now re-validates via `validateCalcSpec` before `gradeCalc`. Pre-existing runtime cap remains the backstop.
7. **Prompt injection** — `buildCalcQuestionsPrompt` sanitises lesson titles (`safeTitle = node.title.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')`); the LLM's output passes through `validateNodeCalcQuestions` → `validateCalcSpec` before any spec reaches the DB.
8. **RLS** — unchanged: caller's JWT, owner-only writes via existing policies. No new code path bypasses.
