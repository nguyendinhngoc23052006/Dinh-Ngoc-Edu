# code-reviewer verdict — Phase 2 (5 features)

**Verdict: PASS.** Both blockers fixed in-diff.

## Fixed
- **`unsaveCourse` now tested.** Added happy-path (asserts `user_id`+`course_id`
  scoping) and error-surfaces tests in `savedCourseService.test.ts`.
- **Concurrent save double-click guarded.** ExplorePage tracks an `inFlight` Set
  of course ids; `toggleSave` early-returns if already in flight, and the button
  is `disabled={inFlight.has(course.id)}`.

## Warns (accepted)
- `MockTestList` Cancel button isn't disabled during a parent rename/delete —
  cosmetic only (a reload corrects the title); left as-is.
- `CoursePage` is 342 lines after the `OwnerCourseControls` extraction — all
  course status/orchestration, single responsibility; the remaining bulk is
  pre-existing status banners, not this phase's additions.

## Passed
- No Supabase calls in components/pages (all via services).
- Sibling tests for every changed service: `listPublicCourses`
  (filter/search/escape), `renameMockTest`/`deleteMockTest` (incl. 120-char cap),
  `deleteMaterial` (happy + storage-error stops before row delete),
  `listSavedCourseIds`/`unsaveCourse` — happy + unhappy.
- `isSaved` derivation (`localSaves[id] ?? saved.data?.has(id) ?? false`) and the
  applied-vs-typed search split are correct — no stale-state/effect bugs.
- `OwnerCourseControls` / `MaterialsManager` are single-responsibility; no
  duplication.
