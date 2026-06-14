# code-reviewer verdict — calc questions in the mock-test runner

**Verdict: PASS.** One WARN raised, consciously declined with rationale below.

- **Duplication removed.** The previously inline correct-answer logic (calc →
  `computeExpected`, else `describeCorrectAnswer`) is now centralized in
  `correctAnswerText(question, response?)` in `lessonService.ts`, called by both
  `LessonPlayer` and `MockTestRunner`. No inline copies remain in `src/components/`.
- **Dispatch orders match.** Both players now dispatch `calc` → `fill_blank` →
  choice in the same order.
- **No components doing data access.** Both runners take questions as props; no
  Supabase calls added.
- **UI states intact.** `MockTestRunner` keeps empty / in-progress / results
  states; loading & error stay at the page level that owns the fetch.
- **Service change has a sibling test change.** `lessonService.test.ts` adds a
  `correctAnswerText` block (calc-with-response, calc-without-response, non-calc
  fallback).

**WARN (declined):** `describeCorrectAnswer` is now only called by
`correctAnswerText` within the same file and by its own tests. Kept exported
because it has dedicated, valuable direct test coverage (testing the inner
function in isolation rather than only through the outer one). Not a dead export.
