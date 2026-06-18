# code-reviewer verdict — remove dead "Regenerate course" button

**Verdict: PASS.**

Checked: src/components/courses/OwnerCourseControls.tsx,
src/pages/CoursePage.tsx, src/components/courses/MaterialsManager.tsx,
src/components/courses/OwnerCourseControls.test.tsx, and grep for residual
regenerate references across src/.

- `onRegenerate` fully removed from the interface, destructuring, and the single
  call site in CoursePage.tsx — zero remaining references in src/.
- `handleStartGeneration` is NOT orphaned: still referenced by its definition,
  the `startButton` const, and the empty-lessons banner `onClick` in CoursePage.
  Its `startGeneration` import stays consumed.
- All props still passed to `<OwnerCourseControls>` match the trimmed interface;
  no prop mismatch. `busy`/`course` still used inside the component.
- The only "Regenerate course" button now lives at CoursePage (behind
  `ready && some node question_count === 0`). LessonPlayer.tsx's user-facing
  "Regenerate option" string still accurately points at that banner — not a dead
  reference.
- New test follows the project convention: `// @vitest-environment happy-dom`
  docblock, shared `supabaseMock`, role/text queries, no jest-dom; covers
  controls-render + no-button for `ready` and `pending`. Component stays purely
  compositional (no data access), one responsibility, well under ~200 lines.

No duplication, no dead code, no mixed responsibility introduced.
