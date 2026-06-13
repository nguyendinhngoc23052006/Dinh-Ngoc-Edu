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
- After deleting a page section, re-check whether a surviving `section(...)`-style render helper still has ≥2 callers; a now-single-use parameterized helper should be inlined (PR #29 inlined Themes after the Pets section was removed).
- For a timer effect that overwrites a single `hideTimer` slot each interval tick, confirm the interval period exceeds the timeout duration — if so it's leak-free (CosmeticsLayer: 25s interval > 6s show).
- A second `useAsync` caller of the same fetch isn't automatic duplication — compare the DERIVED shape: Market (all themes), Settings (owned+free), CosmeticsLayer (equipped only) share two fetch lines but three different filters, so inline is correct (no premature abstraction).
- For a token/enum feature spread across surfaces, verify the token set agrees in one pass across all of them: migration seed data, the src/lib label map, the CSS `[data-attr='…']` selectors, and the TS type — a missing token shows as an unstyled/unlabeled option, NOT a typecheck failure when the column is `Record<string,string>` jsonb.
