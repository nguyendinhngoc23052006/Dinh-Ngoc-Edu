# security-reviewer verdict — calc questions in the mock-test runner

**Verdict: PASS.** No security findings.

- **No new table / no RLS gap.** The diff touches only client display code
  (`MockTestRunner.tsx`, `LessonPlayer.tsx`) and a pure service helper
  (`lessonService.ts`) plus its test. No migration, no schema change.
- **No secret in client code.** `gradeCalc` / `computeExpected` from
  `supabase/functions/_shared/calc.ts` are pure arithmetic; no credential is
  referenced. The `supabaseClient` key pattern is untouched.
- **Client grading stays display-only.** Credit grading is re-derived
  server-side in the `complete-lesson` Edge Function from the stored `CalcSpec`;
  the client's grade is never trusted. `correctAnswerText` reads only the rolled
  values already held in the user's own session.
- **No auth/money/PII/upload path added or modified.**
