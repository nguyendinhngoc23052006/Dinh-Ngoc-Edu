# Scale Review — 2026-06-20 (generate-course: cost + completion + quality overhaul)

## Verdict: PASS

### Findings

**WARN (pre-existing, deferred) — `credit_prize` N+1 in `generateChapter`**

Each chapter task issues one UPDATE per node (up to 5 per chapter × 8 chapters = 40 serial UPDATEs, spread across the 8 parallel chapter tasks ≈ 5 UPDATEs of latency). Pre-existing pattern, not introduced by this PR — the parallel restructure just spread it across tasks. Future cleanup: collect `(id, credit_prize)` pairs and issue one upsert per chapter. Deferred per refactor-standalone rule.

### Wall-clock budget verification

Worst case (8 chapters × 5 nodes = 40 nodes), parallel chapter dispatch:

- Each chapter task: 1 primary AI call + up to 5 sequential delta retries
- Primary call ceiling: `QUESTION_REQUEST_TIMEOUT_MS = 60 s`
- Delta retry ceiling: same 60 s × 5 worst-case = 300 s
- Per-chapter wall-clock worst: 60 + 300 = 360 s
- Pipeline wall-clock worst (parallel): max over chapters ≈ 360 s
- `MAX_PIPELINE_MS = 600 s` → 240 s headroom. Stays well under `STALE_PROCESSING_MS = 15 min` so concurrent re-claim still works.

Realistic primary (~30 s) + 1-2 typical delta retries per chapter ≈ 30-90 s per chapter, ≈ 30-90 s pipeline wall-clock (parallel). 6-10× faster than the previous sequential pipeline.

### Rate-limit math (paid Tier 1 = 150-300 RPM on 2.5 Flash)

- Worst burst: 8 simultaneous primary calls at t=0. 8 ≪ 150 RPM. No 429 cascade.
- Worst burst including retries: 8 primary + up to 40 sequential retries. Each retry is per-chapter-sequential, so the rolling 1-minute window peaks at ~8 primary + 8 first-retry ≈ 16 in the first minute. Still under any tier limit.
- Removed `delay(4000)`: documented justification in the new comment block. Paid tier 1 absorbs the burst; `chat()` retains exponential-backoff retries on 429/5xx as the safety net.

### What passed cleanly

1. **Bounded queries.** `extractMaterialsText` `.limit(100)` unchanged. Ready-course repair check `.limit(500)` unchanged. No new unbounded scans, no new joins on previously unindexed columns.
2. **`ensureTime(deadline)` coverage.** Called before syllabus call, syllabus re-ask, each chapter's primary, and each delta retry. Parallel tasks share `deadline` from the outer scope — no chapter task can silently outlive the budget.
3. **Idempotency.** Atomic-claim guard at `index.ts:154-170` unchanged — exactly one invocation enters `generate()`. Wipe-then-rebuild on `chapters` cascade gives idempotency on the write path; partial completion plus the soft-keep change does NOT change this (the wipe still runs at the top of `generate()`).
4. **No new indexes needed.** No new filtered columns, no new joins, no new GROUP BY.
5. **Token cost trade.** Primary thinking 4096→1024 saves ~3K thinking tokens per call × 1 call/chapter × 8 chapters = ~24K tokens per max-size course at $2.50/M = ~$0.06 saved per max course. Retry thinking 4096→512 saves ~3.5K × up to ~10 retries = ~$0.09 per max course. Syllabus 1024→512 saves ~$0.001. Net thinking saving on worst-case course ~$0.15.
6. **Output token expansion within budget.** Primary: 5 nodes × 10 questions × ~250 tokens (incl. rationale) ≈ 12.5K tokens per chapter call. Well within the 24576 ceiling. Retry: needed × ~250 tokens ≈ up to 5 × 250 = 1.25K, well within 12288.
7. **`Promise.all` does not amplify failure.** A single chapter throw rejects the whole `Promise.all` — the outer `generate()` `try/catch` marks the course `failed`. Other chapter tasks may have committed inserts; this is fine because (a) the next claim wipes them anyway, and (b) the wipe-before-rebuild semantics make the partial-row state self-healing.

### Memory candidates

- Paid Tier 1 Gemini API on 2.5 Flash = 150-300 RPM ([source](https://www.aifreeapi.com/en/posts/gemini-api-rate-limits-per-tier)) easily absorbs ≤8 concurrent calls; the `delay(4000)` inter-call wait that free-tier 15 RPM required is dead weight on paid tier. Drop it on paid-tier deployments and rely on `chat()`'s 429 backoff as the safety net.
- For a parallel `Promise.all` chapter loop, the pipeline wall-clock budget is `max(per-chapter wall-clock)`, not `sum(per-chapter wall-clock)` — the budget verification math changes from "calls × timeout + delays" (sequential) to "max-chapter calls × timeout" (parallel). Different formula; verify both knobs when restructuring serial→parallel.
- "Soft-keep + delta retry" cuts retry-token cost roughly in half vs "discard + full re-ask" because the delta path's output budget is sized to the missing count, not the full per-node target. Worth applying any time an LLM call has a per-element acceptance floor.
