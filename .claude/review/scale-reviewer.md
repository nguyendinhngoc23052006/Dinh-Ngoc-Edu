# Scale Review — 2026-06-19 (branch: claude/compassionate-meitner-chlzve)

## Verdict: PASS

### What was checked

- `supabase/functions/generate-course/index.ts` — all DB queries, retry loops, idempotency guards, and the new `thinking_budget`/`json_schema` paths.
- `supabase/functions/generate-course/pipeline.ts` — the two new schema constants (`SYLLABUS_SCHEMA`, `QUESTIONS_SCHEMA`).
- All migration files — confirmed indexes on every column used in a filter or FK join.

### Findings

No blocker findings.

WARN — `index.ts:330-338` — Per-node `UPDATE nodes SET credit_prize WHERE id = ?` inside the chapter loop: up to 40 individual UPDATE round-trips per pipeline run (pre-existing, not introduced by this PR). Each is a PK lookup, and the pipeline runs in the background with an enforced time budget.

### What passed cleanly

- **json_schema fallback retries:** Not unbounded. On a 400 with `useSchema=true`, sets `jsonSchemaSupported = false` and continues without incrementing `attempt`. Next iteration `useSchema` is false so a 400 no longer triggers the schema branch. Maximum one extra attempt for the fallback.
- **Thinking budget vs. max_tokens:** Values (1024/2048) don't crowd out output — each `chat()` call has an independent 30s timeout, and `ensureTime(deadline)` gates every AI call against the 6-minute pipeline budget.
- **Schema constants memory:** Module-level plain objects, allocated once per worker instance, under 2 KB each.
- **Idempotency:** Atomic claim, wipe-before-rebuild cascade, staleness window all unchanged.
