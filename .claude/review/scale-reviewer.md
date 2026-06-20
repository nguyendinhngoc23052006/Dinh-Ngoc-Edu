# Scale Review — 2026-06-20 (generate-course: native Gemini API switch)

## Verdict: PASS

### What was checked

- `supabase/functions/generate-course/index.ts` — all DB queries, retry loops, idempotency guards, per-call token budgets.
- All migration files — confirmed indexes on every filtered/joined column.

### Findings

WARN — `index.ts:333-342` — Per-node `UPDATE nodes SET credit_prize` inside the chapter loop: up to 40 individual PK-update round-trips per pipeline run. Pre-existing, not introduced by this PR.

### What passed cleanly

- **Unbounded queries:** All DB queries are bounded by PK lookups, `.limit()`, or syllabus constants (`MAX_CHAPTERS * MAX_NODES_PER_CHAPTER * MAX_QUESTIONS_PER_NODE = 480`).
- **Missing indexes:** All filtered columns have indexes confirmed in migrations. Atomic claim filter is `AND id = $pk` first, so secondary `OR` columns evaluate on a single row.
- **N+1:** Language re-ask is at most one extra call per node. Retry loop bounded to 2. No new N+1s.
- **Idempotent writes:** `body` object constructed once before retry loop, never mutated inside. Wipe-before-rebuild cascade unchanged.
- **Token budgets:** Syllabus 4096 (down from 16384), questions 8192, retry 4096. All appropriate for their output sizes. `thinkingBudget: 0` with `responseSchema` is valid.
- **Language re-ask:** Reuses same `opts` as primary call (conservative but bounded to one extra call, dwarfed by 4s inter-call delay).
