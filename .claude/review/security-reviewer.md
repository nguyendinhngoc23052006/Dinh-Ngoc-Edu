# Security Review — fill_blank multi-blank validation

## Verdict: PASS

### Findings
1. **Regex safety (ReDoS):** The regex `/___/g` is a literal-string search with no quantifiers, character classes, or alternations. Zero ReDoS risk. The fallback `?? []` safely handles falsy matches.

2. **Validation order:** `validateQuestion` checks `blankCount !== 1` **before** processing the accepted array, rejecting malformed questions upfront and preventing downstream mishandling.

3. **Grader guard placement:** `gradeQuestion` applies the multi-blank check before the near-miss logic, preventing edge cases where a corrupted DB row (multi-blank) would silently grade partially correct.

4. **Server-side verification:** `completeLesson` invokes the Edge Function, which calls `gradeQuestion` server-side — the guard runs in both contexts, preventing client-side spoofing.

### Rationale
The changes follow the defense-in-depth pattern: reject at generation (pipeline), guard at grading (lessonService), and verify server-side (Edge Function). No secrets leak into regex, no unvalidated input reaches the regex, and the guard is idempotent.
