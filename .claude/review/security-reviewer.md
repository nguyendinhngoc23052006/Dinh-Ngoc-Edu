# security-reviewer verdict — Phase 2 (5 features)

**Verdict: PASS.** No blockers; advisories addressed/accepted below.

## Passed
1. **`listPublicCourses` search.** Still scoped to `visibility='public'`; LIKE
   metacharacters (`\ % _`) escaped before the ILIKE pattern so a user can't
   broaden the match; PostgREST parametrizes — no SQL injection.
2. **Mock test rename/delete IDOR.** No code-level owner check by design — the
   existing `mock_tests` owner-only RLS update/delete policies are the trust
   boundary (server-side, authoritative).
3. **`deleteMaterial` is caller-scoped.** A crafted `storage_path` can't touch
   another user's file: the storage delete policy requires the first path
   segment to equal `auth.uid()`, and the row delete is owner-RLS-scoped.
4. **Save/unsave + `listSavedCourseIds`** are own-rows-only, behind RequireAuth;
   `unsaveCourse` also filters `user_id` explicitly. Saving a private course is
   blocked by the `can_view_course` insert check.
5. **Rendered upload error** comes from our own service exceptions, shown as a
   React text child (escaped) — no `dangerouslySetInnerHTML`, same-origin router
   state only.

## Advisories
- **Fixed:** `renameMockTest` now caps the title at 120 chars (matching course
  titles) — was unbounded.
- **Accepted:** `public_profiles` is readable by `anon` (intended — the public
  catalogue is public). Worth revisiting only if a "remove from public listing"
  flow is added.
