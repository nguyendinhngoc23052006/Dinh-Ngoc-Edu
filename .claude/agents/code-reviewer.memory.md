# code-reviewer memory

One lesson per line, newest last. Pruned to stay well under 200 lines; revert a lesson
when the change that taught it is reverted. The agent is read-only — the orchestrator
commits entries from the agent's "Memory candidates" report section.

- The ~200-line file limit is a smell threshold, not a hard rule — flag as warn with a suggested split, blocker only when responsibilities are clearly mixed.
- useAsync-style hooks centralize state but not rendering — grep for repeated `state-loading`/`state-error` JSX across pages, not just duplicated fetch logic.
- Async click handlers that `await` a service write without try/catch (sign-out, complete-lesson) are a recurring missing-error-state pattern — check every component-triggered write.
- "No Supabase in components" is verifiable with one grep over src/components + src/pages — cite the empty grep rather than asserting it.
- When two services read the same table, compare their caps — one path capped at 500 while its sibling was unbounded (lessonService vs mockTestService nodes query).
- Grep every newly exported service function for callers before sign-off — PR #12 shipped two dead exports (listMyMockTests, unsaveCourse), one hiding a missing view.
- Multi-step client flows (create row → upload → kick job) need a failure story per step; the tell is an orphaned in-progress row the UI polls forever (PR #12).
- A service accepting a `page` param is not pagination — verify the calling page wires a pager (DashboardPage didn't; ExplorePage did, PR #12).
- A batching refactor (per-node → per-chapter AI call) tends to strand the old validator as a dead export with passing tests — grep the new entry point's imports against every pipeline export.
- Docs naming internal functions drift in the same PR that renames the code path — check identifiers in changed docs against the diff.
- Double-submit in quiz flows is safe when the next question mounts with a disabled submit (empty selection/text) — verify that invariant rather than demanding a busy flag.
