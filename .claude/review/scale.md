# Scale Review — Generation Hardening

**Verdict: PASS**

## Findings

### NOTED — CASCADE wipe on regeneration is O(rows-in-course), not O(1)
`startGeneration(force=true)` triggers a DELETE on `chapters` which cascades through `nodes` → `questions` → `progress`. For a large course this is a table scan per table. Acceptable today (courses are bounded by upload size); flag for review if courses grow to thousands of questions.

### NOTED — Third-level per-node retry: bounded by ensureTime + empty-node threshold
The per-node retry loop retries all empty nodes (no artificial per-chapter cap). `ensureTime(deadline)` sits outside each iteration and terminates the pipeline cleanly at 6 minutes if the call count grows large. Pairing this with the >2-empty-node fail threshold means the loop is incentivised to try harder (to stay under the threshold) while time, not an arbitrary slice, is the real budget limit. Degenerate worst case (all nodes empty across a large course) hits the 6-minute deadline and the course fails cleanly.

## Passing checks
- No unbounded queries: PASS — `getCourseContent`, question inserts all scoped by `courseId`; chapter loop bounded by syllabus size.
- N+1 pattern: PASS (existing) — question inserts batch per node inside chapter loop; this PR does not introduce new per-row network calls beyond the retry loop noted above.
- `AbortController` timeout: PASS — 30 s per AI fetch prevents unbounded Deno runtime blocking.
- No new filtered/joined columns without indexes: PASS — no migration.
- Idempotency: PASS — atomic claim UPDATE + `force` guard prevent double-wipe under concurrent calls.
