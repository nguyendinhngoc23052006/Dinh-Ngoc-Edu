# Scale Review — Generation Hardening

**Verdict: FLAG (warns only, no blockers)**

## Findings

### WARN — CASCADE wipe on regeneration is O(rows-in-course), not O(1)
`startGeneration(force=true)` triggers a DELETE on `chapters` which cascades through `nodes` → `questions` → `progress`. For a large course this is a table scan per table. Acceptable today (courses are bounded by upload size); flag for review if courses grow to thousands of questions.

### WARN — Third-level per-node retry adds up to N extra AI calls (N = empty nodes)
The new `for (const nodeIndex of finalMissing)` loop inside each chapter fires one AI call per empty node. Worst case: every node in every chapter is empty → `totalNodes` extra calls. Since nodes per course are bounded by the syllabus (≤ 30 chunks × few nodes each) this is acceptable, but it means a degenerate run can exceed the 6-minute `ensureTime` budget and terminate early. `ensureTime(deadline)` is called outside the try-catch, which is correct — it surfaces to the outer handler and marks the course failed rather than silently timing out.

## Passing checks
- No unbounded queries: PASS — `getCourseContent`, question inserts all scoped by `courseId`; chapter loop bounded by syllabus size.
- N+1 pattern: PASS (existing) — question inserts batch per node inside chapter loop; this PR does not introduce new per-row network calls beyond the retry loop noted above.
- `AbortController` timeout: PASS — 30 s per AI fetch prevents unbounded Deno runtime blocking.
- No new filtered/joined columns without indexes: PASS — no migration.
- Idempotency: PASS — atomic claim UPDATE + `force` guard prevent double-wipe under concurrent calls.
