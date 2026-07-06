# Code Review — PR #74 (calc one-question-one-answer)

**Date:** 2026-06-27
**Verdict: PASS**

## Diff reviewed
- Removed fragile English-only regex guard from `validateCalcSpec`.
- Replaced with a fundamental first-principle rule in `buildCalcQuestionsPrompt`: "One question, one answer … if a topic yields two values, write two separate questions."
- Removed the corresponding regression tests for the deleted guard.

## Findings
- Correct direction: validation layer stays structural (formula evaluates, variables declared); semantic content of the prompt is the generator's responsibility, not the validator's.
- The generation rule is language-agnostic — it applies regardless of `outputLanguage`, which the old regex could not claim.
- No speculative abstraction, no new dependency, no leftover dead code.
- Removal of the two-part tests is correct — they tested a guard that no longer exists.
