# Code Review — 2026-06-20 (generate-course: native Gemini API switch)

## Verdict: PASS

### What was checked

- `supabase/functions/generate-course/index.ts` — native API request/response shape, `ChatOptions` interface, thinking budget, `responseSchema`, removed `jsonSchemaSupported` fallback.
- `supabase/functions/generate-course/pipeline.ts` — `SYLLABUS_SCHEMA` and `QUESTIONS_SCHEMA` constants.

### Findings

WARN — `index.ts:201-218` — The `ChatOptions` literal `{ thinkingBudget: 1024, maxOutputTokens: 4096, jsonSchema: SYLLABUS_SCHEMA }` is spelled out identically twice: initial syllabus call and quality re-ask. Future maintenance trap if budgets change. Fix: extract a const.

### What passed cleanly

- No duplicated logic introduced. `chat()`/`chatInLanguage()` remain the single AI call path.
- `ChatOptions` interface is clean. All three fields used in `chat()`, `jsonSchema` is optional.
- Response parsing: `thought` parts correctly filtered. Concatenating non-thought text parts is correct. Empty-string guard catches thinking-only responses.
- `responseMimeType: 'application/json'` coexists with `responseSchema` correctly per Gemini API.
- `thinkingBudget: 0` for retry calls is valid (disables thinking tokens).
- Retry loop bounded: non-retriable errors throw immediately, retriable (429/5xx) back off up to 2 retries.
- Removed `jsonSchemaSupported` flag and fallback retry logic — no surviving dead code.
- File size (520 lines) and mixed responsibility (handler + orchestrator + AI client) are pre-existing.
