# Scale review — generation cost/quality fixes

**Verdict: PASS (CHAPTER_CONCURRENCY corrected from 2 → 3)**

Reviewed: `supabase/functions/generate-course/index.ts`

- Initial draft used `CHAPTER_CONCURRENCY=2`: worst-case wall time = 30 s + ceil(8/2)×5×35 s = 730 s > MAX_PIPELINE_MS (600 s), which would have caused deadline-skipped lessons on max-size courses — the same problem being fixed. Corrected to 3: ceil(8/3)×5×35 s + 30 s = 555 s < 600 s.
- `CHAPTER_CONCURRENCY=3` keeps worst-case within budget; lesson-loop deadline check still guards edge-case overruns.
- Thinking budget reductions: output tokens unchanged (Gemini bills actuals, not maxOutputTokens cap); cost reduction from thinking tokens is real.
- No new unbounded queries, no new N+1, no missing indexes in this diff.
