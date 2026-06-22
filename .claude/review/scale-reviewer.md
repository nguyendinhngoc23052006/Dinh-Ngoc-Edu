# Scale Review — PR #67 generation pipeline rework

## Verdict: PASS (with debt noted)

### Findings
1. **`questions(count)` in nodes query:** PostgREST aggregate — single SQL query with COUNT subquery, not N+1. Safe.

2. **Node query bounded:** `.limit(500)` on nodes fetch. Indexed by `course_id` FK. No unbounded scan.

3. **Delete by `node_id`:** `questions.delete().eq('node_id', nodeRow.id)` hits the `questions_node_id_idx` FK index. Fast row-level lock, no table scan.

4. **Concurrent deletes/inserts:** `mapConcurrent(CHAPTER_CONCURRENCY=4)` bounds parallel DB operations. No burst risk.

5. **QUESTIONS_PER_NODE 6→8:** Insert batch grows by 33% per lesson (8 rows vs 6). Still O(1) per `supabase.from('questions').insert(questionRows)` call.

### Deliberate debt noted
- **Per-node `credit_prize` UPDATE:** Each fill worker fires one UPDATE per node after inserting questions. Identical to the existing `generateChapter` pattern — already flagged as stand-alone batch-upsert refactor candidate. Not a regression introduced by this PR.

- **Delete-then-insert atomicity gap:** If question insert fails after delete succeeds, the node ends up with 0 questions. Recoverable on next "Fill incomplete lessons" click (threshold `< MIN_QUESTIONS_PER_NODE` picks up 0-question nodes). No permanent data loss; consistent with Supabase Edge Function constraints (no multi-statement transactions across network calls). Noted as tech debt.
