# Scale Review — 2026-06-20 (generate-course: batched questions, rationale-CoT, timeout bump)

## Verdict: PASS (re-run after MAX_PIPELINE_MS fix)

### Initial verdict: FAIL → resolved

**BLOCKER (resolved)** — first-pass review flagged `MAX_PIPELINE_MS = 360s` as unable to contain the new worst-case batch pipeline:

- Worst-case course: 8 chapters × 5 nodes = 40 nodes
- Primary batches: ceil(5/4) per chapter × 8 chapters = 16 batches
- Per-call ceiling (`QUESTION_REQUEST_TIMEOUT_MS`): 60s
- Worst-case primary alone: 16 × 60s + 15 × 4s = 1020s ceiling
- Realistic primary (~30-45s/call): 16 × 45s + 60s = 780s
- Either way, the 360s budget cannot fit, and `ensureTime(deadline)` would abort mid-pipeline on large courses

**Fix applied:** `MAX_PIPELINE_MS` raised to `10 * 60 * 1000` (600s). Stays well under `STALE_PROCESSING_MS = 15 * 60 * 1000` so concurrent re-claim still works.

### Findings

**WARN (pre-existing, deferred) — credit_prize N+1 in chapter loop**

`index.ts` updates `nodes.credit_prize` once per node inside the chapter loop (up to 40 serial UPDATE calls per pipeline run on a max-size course). Pre-existing pattern, not introduced by this PR. Future cleanup: collect `(id, credit_prize)` pairs and issue one upsert per chapter. Out of scope here.

### What passed cleanly

1. **Inter-call delay preserved.** `if (start > 0 || chapterIndex > 0) await delay(4000)` correctly delays every batch call except the very first. Retry pass unconditionally delays before each per-node retry. 4s cadence end-to-end.
2. **timeoutMs propagation.** `QUESTION_REQUEST_TIMEOUT_MS = 60_000` is passed to both the primary batch call and the retry call; `chat()` reads `opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS` and threads it through the `AbortController` timer. The pre-change 30s hard limit that would have killed a 4-node + 4096-thinking batch is resolved.
3. **Rate-limit math (free-tier RPM).** Old shape: ~32-40 primary per-node calls + retries. New shape: ~10-16 batch calls + retries. Halving the primary call count is a net win.
4. **Output token cost.** 4 nodes × 6 questions × ~250 tokens (incl. rationale) ≈ 6000 tokens per batch call. Well within the 16384 ceiling.
5. **Thinking-token cost trade.** 2048 × N → 4096 × (N/4) on primary is roughly cost-neutral; 0 → 4096 on retry is a deliberate cost-up to make retries actually do work. Accepted per PR intent.
6. **Bounded queries / no new N+1.** `extractMaterialsText` `.limit(100)`, ready-course repair check `.limit(500)`, all other reads single-row or bulk inserts with bounded inputs. No new unbounded scans.
7. **No missing indexes** — no new queries on previously unindexed columns.
8. **Idempotency** — atomic-claim guard prevents concurrent pipelines; wipe-before-rebuild (chapters delete cascade) gives idempotency on the write path.

### Memory candidates

- When raising a per-call timeout on a background job, verify the outer pipeline budget constant (`MAX_PIPELINE_MS`) covers `max_calls × new_timeout + inter_call_delays` and stays under the staleness window. Both knobs must move together — the timeout and budget are independently set and easy to mis-pair (caught here: 10×60s = 600s ceiling vs the 360s budget pre-fix).
- A per-node update loop inside a per-chapter outer loop is a latent N+1 (here: `credit_prize`, 40 UPDATEs/run). Collect pairs and upsert in one call per chapter — flag for a stand-alone refactor.
