# scale-reviewer verdict — Phase 2 (5 features)

**Verdict: PASS.** One future-work index noted; no blocker at this app's scale.

- **`listPublicCourses` title ILIKE `%term%`** is a sequential scan over the
  public-courses set (no trigram index). Acceptable now: the public catalogue is
  small and the query is always `visibility='public'` + paginated (`.range`,
  PAGE_SIZE 20). Sorting by `title` is likewise unindexed but fine at this size.
  *Future work:* if the public catalogue grows large, add a `pg_trgm` GIN index
  on `courses.title` (and/or a btree for the title sort). Recorded in MEMORY.md.
- **`listSavedCourseIds`** — one `.eq('user_id',…).limit(500)` query, bounded, no
  N+1.
- **ExplorePage** — authors still batch-fetched in one `getDisplayNames`; saved
  ids loaded once (not per card); save/unsave toggle is O(1) optimistic state.
  No per-card query.
- **`deleteMaterial`** — two bounded calls (storage remove + row delete).
  Mock-test rename/delete — single bounded writes.
