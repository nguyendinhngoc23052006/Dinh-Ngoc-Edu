# Code Review — 2026-06-19 (branch: claude/compassionate-meitner-chlzve)

## Verdict: PASS

### What was checked

- `supabase/functions/generate-course/index.ts` — thinking budget, json_schema fallback mechanism, removal of AI_MODEL_LITE split.
- `supabase/functions/generate-course/pipeline.ts` — new `SYLLABUS_SCHEMA` and `QUESTIONS_SCHEMA` constants; schema shape vs. validator alignment.
- Retry loop logic: `useSchema` re-evaluation, `attempt` counter, infinite-loop guard on 400.
- Concurrency behavior of module-level `jsonSchemaSupported` flag.

### Findings

1. WARN — `index.ts:55` — `jsonSchemaSupported` is module-level mutable, shared across concurrent requests in the same Deno isolate. A 400 on one request permanently disables json_schema for all concurrent requests. In practice Gemini either supports json_schema or it doesn't, making this a correct design choice — but it is a cross-request side-effect worth noting.

2. WARN — `pipeline.ts:452-529` — `SYLLABUS_SCHEMA` and `QUESTIONS_SCHEMA` have no direct test coverage. The schemas are structural constants (not executable logic) and the validators they align with are thoroughly tested. Acceptable for this PR; add coverage if the schemas evolve.

### What passed cleanly

- Retry loop is correct: `useSchema` re-evaluated each iteration; 400-fallback `continue` doesn't increment `attempt`; non-schema 400 falls through to `throw`. No infinite loop possible.
- No duplication introduced; `chat()`/`chatInLanguage()` are the single AI call path.
- Schema field names match what `validateSyllabus`/`validateChapterQuestions` read.
