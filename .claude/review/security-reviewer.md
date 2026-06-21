# Security review — source quality + coverage fixes

**Verdict: PASS — no findings**

Reviewed: `supabase/functions/generate-course/pipeline.ts`, `index.ts`, `src/components/courses/UploadForm.tsx`, `MaterialsManager.tsx`

- `stripBoilerplate` regexes: all patterns use bounded, non-catastrophic quantifiers anchored to line scope — no ReDoS risk. Per-line application + O(n) frequency map; safe at 200k-char cap.
- Text is capped at `MAX_SOURCE_CHARS = 200_000` before reaching `chunkText`/`stripBoilerplate`. All question/option/summary fields length-capped before DB write (unchanged from prior PR).
- No new secrets: `AI_API_KEY` and Supabase keys still read exclusively from `Deno.env`. UI components show only static informational text.
- AI output re-used in retry prompts: node titles sanitized with `replace(/"/g, "'").replace(/[\r\n]+/g, ' ')` before interpolation (unchanged).
- `CHAPTER_CONCURRENCY` raised 3→4: atomic course-claim via conditional UPDATE prevents double-runs; deadline guards re-checked at each lesson loop; no new abuse surface.
- No new auth paths, RLS changes, storage policies, or external service calls.
