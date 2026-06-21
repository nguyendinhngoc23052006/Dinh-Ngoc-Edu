# Security review — generation cost/quality fixes

**Verdict: PASS — no findings**

Reviewed: `supabase/functions/generate-course/pipeline.ts`, `index.ts`, `pipeline.test.ts`

- Schema expansion (`required` fields): adds structure to AI output contract; no new trust boundary; `validateQuestion` already length-caps all fields before DB write
- AI output re-used in retry prompts: prompt text length-capped and newline-sanitised before re-injection (existing `validateQuestion` + slice caps unchanged)
- `mapConcurrent`: bounded to 3 concurrent workers; no shared mutable state between workers; errors captured at call site via `.catch`
- Thinking budget reductions: client-side config only; no auth/RLS/secret changes
- `detectFormulas` narrowing: reduces unnecessary API calls; no security surface change
- No new secrets, no new storage access, no new auth paths, no RLS changes
