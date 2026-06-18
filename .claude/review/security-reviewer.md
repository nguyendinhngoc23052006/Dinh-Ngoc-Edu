# security-reviewer verdict — remove dead "Regenerate course" button

**Verdict: PASS.**

Checked: src/components/courses/OwnerCourseControls.tsx,
src/pages/CoursePage.tsx, src/components/courses/MaterialsManager.tsx,
src/components/courses/OwnerCourseControls.test.tsx.

Removing the UI button does not widen any server-side trust boundary — the
`generate-course` Edge Function guard is unchanged, and the `isOwner` gate at
the OwnerCourseControls call site is untouched. No secrets, real keys, or
hardcoded credentials in the change; the new test mocks `../../lib/supabaseClient`
via the shared `supabaseMock` proxy (synthetic IDs only, no real URL/key). No new
tables, no RLS surface, no unvalidated input, no auth/money/PII/upload path
touched. Removed prop `onRegenerate` leaves no dangling secret or exposed
endpoint.
