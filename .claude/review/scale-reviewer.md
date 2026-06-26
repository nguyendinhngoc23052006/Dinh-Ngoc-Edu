# Scale Review — econ-question-answer-key fix

**PR:** Fix UI/Validation mismatch — two-part calc prompt guard
**Date:** 2026-06-26
**Verdict: PASS**

## Findings

- Regex runs once per question during course generation validation and once per re-grade in `complete-lesson`. `prompt_template` is bounded to 500 chars — negligible cost.
- No new DB queries, no N+1 patterns, no index changes needed.
- No new tables or schema changes.
- `generateInstance()` and `gradeCalc()` receive only validated `CalcSpec` objects; no downstream perf impact.
