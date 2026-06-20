# Security Review — 2026-06-20 (generate-course: batched questions, rationale-CoT, timeout bump)

## Verdict: PASS

### What was checked

- `supabase/functions/generate-course/pipeline.ts` — new `buildBatchQuestionsPrompt`, updated `buildNodeRetryPrompt`, new `buildQuestionsSchema(nodeCount, options)` function, constants `MIN_QUESTIONS_PER_NODE` and `NODES_PER_BATCH`.
- `supabase/functions/generate-course/index.ts` — per-batch primary loop replacing per-node, new per-call `timeoutMs` option, `QUESTION_REQUEST_TIMEOUT_MS = 60_000` for question calls.
- `supabase/functions/generate-course/pipeline.test.ts` — added batch prompt, schema, single-node, includeCalc tests.
- Grepped `src/` for `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` — zero matches.
- No new migration in this diff; RLS check not applicable.

### Findings

No security findings.

### Verified as secure

1. **Secret exposure:** `AI_API_KEY` read exclusively via `Deno.env.get` (index.ts:476). Zero matches in `src/`. Nothing hardcoded.
2. **AI-input validation:** All AI output passes through `validateSyllabus` (pipeline.ts) and `validateQuestion`, which cap strings (prompt ≤ 1000, options/accepted ≤ 300, title ≤ 200, summary ≤ 500) and construct new typed objects so unknown fields — including the new `rationale` CoT field — are dropped by field-picking before any DB write.
3. **Prompt-injection sanitisation:** Both new prompt builders sanitise AI-generated node titles with `.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')` (pipeline.ts: `safeTitles` in batch, `safeTitle` in retry). Coverage test in pipeline.test.ts.
4. **Timeout expansion does not enlarge caller-induced work:** `MAX_PIPELINE_MS` (raised to 10 min in this PR) plus `ensureTime(deadline)` before every AI call still hard-bound the per-request work. The atomic-claim guard at index.ts:154-170 prevents concurrent pipelines for the same course.
5. **Caller-trust surface unchanged:** Function still runs with the caller's JWT, no service-role key; RLS owner policies authorize every write.
6. **No new table / RLS:** No migration in this diff.

### Memory candidates

- When raising a per-call timeout on a background job, verify the outer pipeline budget constant (`MAX_PIPELINE_MS`) is at least `max_calls × new_timeout + inter_call_delays` and stays under the staleness window — caught here by the scale-reviewer (360s budget vs 10×60s ceiling).
- Prompt builders that interpolate AI-generated values into quoted string positions must apply the same double-quote/newline sanitisation pattern — verify on any future prompt-builder addition.
