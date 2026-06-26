# Security Review — econ-question-answer-key fix

**PR:** Fix UI/Validation mismatch — two-part calc prompt guard
**Date:** 2026-06-26
**Verdict: PASS**

## Findings

- Regex patterns are hardcoded; user input is never interpolated into regex construction. No injection risk.
- `/\?/g` is a simple literal scan; `/,?\s+and\s+(how\s+(?:much|many)|what)\b/i` has all `\s+` bounded by surrounding literals with binary non-nested alternation. No ReDoS risk.
- `return null` is the standard rejection path used throughout `validateCalcSpec()` — idempotent and safe.
- LLM prompt rule addition is hardcoded text; no user input interpolated.
- No RLS changes, no secrets in client code, no new data-access paths.
