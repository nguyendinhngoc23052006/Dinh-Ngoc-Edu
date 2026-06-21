# Scale Review — 2026-06-21 (generate-course: per-lesson pipeline)

## Verdict: PASS

## Findings

All findings from the first pass were addressed in the same branch:

- **BLOCKER (resolved):** the pipeline budget gap is closed. `ensureTime(deadline)` in the chapter loop was replaced with an explicit non-throwing budget check that fills empty buckets for remaining lessons and breaks out (so the chapter still inserts what it has). `generateLessonQuestions` now takes `deadline` and skips its retry call when `Date.now() >= deadline` — a near-deadline lesson keeps whatever the initial returned instead of busting the budget. `QUESTION_REQUEST_TIMEOUT_MS` reduced from 45 s to 35 s to give the worst-case chapter wall-clock (5 × 2 × 35 s = 350 s, +75 s for 429 backoffs = 425 s) ~175 s of headroom under the 10-min budget.

- **WARN (deferred):** per-node `UPDATE credit_prize` inside `generateChapter` is a pre-existing N+1 (up to 5 sequential UPDATEs per chapter, 40 per max-size run). Already flagged in memory; this PR does not introduce it and the fix (batch into a single upsert) belongs in a stand-alone refactor.

- **WARN (fixed):** budget comment now correctly states `5 × (35 s + 35 s) ≈ 6 min per chapter` with headroom for 429 backoffs, matching the new constants.

## What passed cleanly

1. Per-lesson sequential inside a chapter + per-chapter parallel keeps peak Gemini concurrency at ~chapter_count (max 8 vs Tier 1's 150 RPM) — well within budget.
2. Token cost down: 22 lessons × ~1 K out = 22 K total, vs the previous batched 75 K target. Output is the dominant cost so this also lowers spend per course.
3. Implicit cache benefit is opportunistic — `nodeSourceContext` covers chunk±1, so adjacent lessons sharing a chunk_index hit the cache; non-adjacent ones don't. Sequencing maximises hits without depending on them.
4. DB writes unchanged shape — bulk insert questions once per chapter after the lesson loop completes. No new N+1 introduced.
5. Bounded queries: `nodes` select has `.limit(500)`, `course_materials` has `.limit(100)`. No unbounded selects.
6. `lessonErrors` arrays are bounded by `MAX_NODES_PER_CHAPTER × MAX_CHAPTERS = 40` strings, then truncated to 500 chars in `generation_error`.
7. Atomic claim guard unchanged — wipe-then-rebuild remains idempotent under retries.
