# Security Review — PR #74 (calc one-question-one-answer)

**Date:** 2026-06-27
**Verdict: PASS**

## Diff reviewed
- Removed regex guard from `validateCalcSpec` (eliminates any ReDoS surface that existed there).
- Added a hardcoded string rule to `buildCalcQuestionsPrompt`.
- Removed tests that covered the now-deleted guard.

## Findings
- No user input is interpolated into any regex or string.
- Removing the validation-layer regex makes the surface smaller, not larger.
- The `return null` rejection path in `validateCalcSpec` is unchanged for structural errors.
- No new injection vectors, no secrets touched, no RLS impact.
