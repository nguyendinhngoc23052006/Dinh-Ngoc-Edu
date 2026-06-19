# Scale Review — Generation Hardening

**Verdict: PASS**

## Findings

### NOTED — CASCADE wipe on regeneration is O(rows-in-course), not O(1)
`startGeneration(force=true)` triggers a DELETE on `chapters` which cascades through `nodes` → `questions` → `progress`. For a large course this is a table scan per table. Acceptable today (courses are bounded by upload size); flag for review if courses grow to thousands of questions.

### FIXED — Third-level per-node retry was unbounded (N extra AI calls)
The `for (const nodeIndex of finalMissing)` loop fired one AI call per empty node with no cap. Fixed: `.slice(0, 3)` applied to `finalMissing` before the loop — at most 3 single-node retries per chapter. Beyond 3 empty nodes after two full-chapter attempts the source is too sparse to help; capping prevents runaway spend and keeps the call count well inside the 6-minute `ensureTime` budget.

## Passing checks
- No unbounded queries: PASS — `getCourseContent`, question inserts all scoped by `courseId`; chapter loop bounded by syllabus size.
- N+1 pattern: PASS (existing) — question inserts batch per node inside chapter loop; this PR does not introduce new per-row network calls beyond the retry loop noted above.
- `AbortController` timeout: PASS — 30 s per AI fetch prevents unbounded Deno runtime blocking.
- No new filtered/joined columns without indexes: PASS — no migration.
- Idempotency: PASS — atomic claim UPDATE + `force` guard prevent double-wipe under concurrent calls.
