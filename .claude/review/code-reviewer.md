# Code Review — fill_blank multi-blank validation

## Verdict: PASS

### Findings
1. **Structural guard placement:** `validateQuestion` (pipeline.ts:252–253) checks blank count **before** the accepted-array filter (line 254+), enforcing the constraint upfront — correct order.

2. **Grader guard logic:** `gradeQuestion` (lessonService.ts:174) returns `'incorrect'` immediately for multi-blank, short-circuiting before near-miss logic that assumes single-blank prompts. Clean, idempotent.

3. **No missed call sites:** `completeLesson` (lessonService.ts:120) delegates to the Edge Function, which calls `gradeQuestion` server-side. The guard fires in both paths (client-side preview, server-side final grade).

4. **Test coverage:** 
   - Pipeline test (pipeline.test.ts:298) rejects multi-blank in malformed-inputs.
   - LessonService test (lessonService.test.ts:108–116) verifies multi-blank grades incorrect regardless of input.
   - All fill_blank tests updated to include explicit single-blank prompts.

5. **No duplication or over-engineering:** Guard is minimal (one match + length check), placed only where needed (generation and grading boundaries).

### Rationale
The changes follow the single-responsibility rule: generation rejects, grading guards, tests confirm. No abstraction layer added for one-off behavior; no helper function for a two-line check.
