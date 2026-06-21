# Scale review — source quality + coverage fixes

**Verdict: PASS — one known tradeoff noted; N+1 finding is pre-existing**

Reviewed: `supabase/functions/generate-course/pipeline.ts`, `index.ts`

- Wall-time math verified: `ceil(10/4)×5×35 s + 30 s = 555 s < MAX_PIPELINE_MS (600 s)`. Per-lesson deadline guard still skips retries and calc follow-ups when budget is tight.
- `stripBoilerplate` on 200k chars: ~40k lines max; frequency Map and per-line regex (10 patterns) are both O(n) — comfortable within Deno Edge Function budget.
- **Syllabus prompt token cost increases ~2.2×**: new shape shows 50 chunks × 2000-char excerpts = 100k chars vs old 30×1500 = 45k chars. Deliberate tradeoff for better AI coverage of chunk content during syllabus planning; syllabus is one call per generation.
- **`filter(isEducationalChunk)` before `slice` is intentional**: if every chunk fails the filter, the source is genuinely too thin for course generation. A clear "No readable text" error is preferable to generating questions about metadata.
- No new unbounded queries, N+1 patterns, or missing indexes introduced by this diff.
- Pre-existing debt (not introduced here): `nodes.credit_prize` updated in a loop (N individual UPDATEs) in `generateChapter`. Batch upsert refactor owed as standalone tech-debt.
