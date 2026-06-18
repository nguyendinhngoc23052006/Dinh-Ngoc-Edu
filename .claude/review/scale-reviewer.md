# scale-reviewer verdict — remove dead "Regenerate course" button

**Verdict: PASS.**

Checked: src/components/courses/OwnerCourseControls.tsx,
src/pages/CoursePage.tsx, src/components/courses/MaterialsManager.tsx,
src/components/courses/OwnerCourseControls.test.tsx.

Presentational removal only — no query, no N+1, no unbounded fetch, no missing
index, and no write (idempotent or otherwise) is added. CoursePage's existing
query paths (`getCourse`, `getCourseContent`, `listMaterials`,
`getCompletedNodeIds`, `getDisplayNames`) are unchanged. The generating poll
loop (`useEffect`, keyed on `status === 'pending' | 'processing'`) is unaffected
by removing the button — it still exits when status leaves the generating
states, so there is no staleness/escape regression. The new test does no
network round-trips. No new scale pattern; existing memory lessons unchanged.
