# Code Review — 2026-06-19

## Verdict: CONCERN

### Findings

**WARN — `lessonService.ts` `getCourseContent` changed but no test added (pre-existing gap)**
`getCourseContent` was changed to add `questions(count)` and derive `question_count`, but `lessonService.test.ts` has zero coverage for this function. Pre-existing gap, not introduced by this PR's migration.

**WARN — PR body describes syllabus excerpt as "1800 → 600 chars" but code uses `.slice(0, 1500)` (description inaccuracy)**
The code value (1500) may be correct by design; the PR description should match actual values.

**WARN — `matchesOutputLanguage` `\uXXXX` decode fix has no dedicated test (pre-existing)**
The decode logic is one line but the bug was real; a test with JSON-escaped Vietnamese characters would prevent regression.

### Checks that passed
- No Supabase queries in `src/components/` — confirmed.
- `CoursePage.tsx` renders UI only; all data access goes through services.
- Loading, empty, error, and unauthorized states all present.
- `generationService.ts` `force` parameter is tested.
- Migration SQL is idempotent: REVOKE is no-op when privilege not held; `rls_auto_enable` uses IF EXISTS.
- No duplicated logic. File sizes acceptable for their scope.
