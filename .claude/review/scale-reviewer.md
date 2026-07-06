# Scale Review — PR #74 (calc one-question-one-answer)

**Date:** 2026-06-27
**Verdict: PASS**

## Diff reviewed
- Removed regex matching from `validateCalcSpec` hot path (lighter, not heavier).
- Added a string literal to the generation prompt (one-time per course generation call).
- No schema or query changes.

## Findings
- Net performance delta is positive: one fewer regex execution per question at validation and re-grade time.
- No new DB queries, no N+1 patterns, no index changes.
- No downstream impact on `generateInstance()` or `gradeCalc()`.
