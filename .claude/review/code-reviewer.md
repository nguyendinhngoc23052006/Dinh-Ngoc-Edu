# Code Review — econ-question-answer-key fix

**PR:** Fix UI/Validation mismatch — two-part calc prompt guard
**Date:** 2026-06-26
**Verdict: PASS (2 WARNs, both accepted)**

## Findings

**WARN 1 — English-only regex:** The guard `/,?\s+and\s+(how\s+(?:much|many)|what)\b/i` detects English conjunctions only. The system supports `outputLanguage` so a French/Spanish two-part prompt (e.g. "combien … et combien …") bypasses the runtime guard. The LLM prompt rule (generation-time) is the primary defense; the regex is a secondary backstop for English-language slip-through. Accepted as deliberate: adding multilingual patterns now would be speculative (no evidence of non-English two-part slippage), and the generation rule applies in all languages.

**WARN 2 — Test edge cases:** No test for a prompt with "and what" (vs. "and how much/many"). The regex covers `what` as a branch but is not exercised. Minor — the pattern is simple enough that the existing tests give high confidence.

## Positives
- Comment accurately describes the *why* (silent value drop).
- Regression test covers both rejection patterns and the positive single-value case.
- Change is minimal and surgical — no speculative abstraction.
