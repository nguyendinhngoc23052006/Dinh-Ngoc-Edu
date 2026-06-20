# Security Review — 2026-06-20 (generate-course: remove additionalProperties from Gemini schemas)

## Verdict: PASS

### What was checked

- `supabase/functions/generate-course/pipeline.ts` — full file; `SYLLABUS_SCHEMA`, `QUESTIONS_SCHEMA` constants; `validateSyllabus`, `validateChapterQuestions`, `validateQuestion` enforcement layer; all string length caps.
- `supabase/functions/generate-course/pipeline.test.ts` — new `describe('response schemas')` block; `FORBIDDEN` keyword list; recursive `forbiddenKeysIn` checker.
- `supabase/functions/generate-course/index.ts` — confirmed `AI_API_KEY` read only via `Deno.env.get`; schemas used only as `generationConfig.responseSchema` hints, not as runtime validators.
- Grepped all of `src/` for `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` — zero matches.
- No new migration in this diff; RLS check not applicable.

### Findings

No security findings.

### Verified as secure

1. **Schema hint vs. enforcement boundary:** The two schemas are generation hints sent to Gemini's `generationConfig.responseSchema`. Removing `additionalProperties: false` does not affect the actual enforcement layer. `validateSyllabus` and `validateQuestion` enforce by constructing new typed objects explicitly — unknown fields are dropped by omission, not by schema rejection. All persisted strings are capped (prompt ≤ 1000, options/accepted ≤ 300, title ≤ 200, summary ≤ 500) before any DB write.
2. **Secret exposure:** `AI_API_KEY` read exclusively via `Deno.env.get` in the Edge Function; zero matches in `src/`; never hardcoded.
3. **New table without RLS:** No migrations in this diff.
4. **Missing abuse case:** No new auth, money, PII, or upload surface introduced.
5. **Regression test:** Now enforces that neither schema contains `additionalProperties`, `$schema`, `$ref`, `patternProperties`, or `definitions`, preventing recurrence.
