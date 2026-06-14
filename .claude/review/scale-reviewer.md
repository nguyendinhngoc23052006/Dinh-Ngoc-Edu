# scale-reviewer verdict — public user display name

**Verdict: PASS.** No scale findings.

- `getDisplayNames` is one `.in('user_id', ids).limit(200)` batch query;
  ExplorePage collects all of a page's owner ids and calls it once; CoursePage
  calls it once. No N+1.
- The `public_profiles` view's `EXISTS` on `courses.owner_id` is covered by the
  existing `courses_owner_id_idx` (migration 20260610213500); the outer filter
  on `profiles.user_id` rides the primary key. No missing index.
- `setDisplayName` is a single bounded UPDATE, RLS-scoped to the caller's row.
  No unbounded write.
