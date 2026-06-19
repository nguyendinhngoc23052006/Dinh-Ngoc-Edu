# Security Review — 2026-06-19 (branch: claude/compassionate-meitner-chlzve)

## Verdict: PASS

### What was checked

- `supabase/functions/generate-course/index.ts` — new `thinkingBudget` parameter, module-level `jsonSchemaSupported` flag, `google.thinking_config` field in fetch body, all 4 `chatInLanguage` call sites.
- `supabase/functions/generate-course/pipeline.ts` — new `SYLLABUS_SCHEMA` and `QUESTIONS_SCHEMA` constants.
- `docs/RUNBOOK.md` — Edge Function secrets table after `AI_MODEL_LITE` removal.
- Grepped for `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `thinkingBudget`, `jsonSchemaSupported` — no leaks to client code.
- No new migration, no RLS change.

### Findings

No security findings.

- `thinkingBudget` is always a hardcoded integer (1024/2048) at every call site — never derived from user input. No injection surface.
- `jsonSchemaSupported` module-level flag controls only output-format preference. No cross-user data accessible via this path. Fallback (`json_object`) is the pre-existing safe default.
- `google.thinking_config` in the fetch body: `thinking_budget` is always a number via `JSON.stringify`. No user-controlled string reaches this field.
- All existing security controls unchanged: caller JWT, owner check, `AI_API_KEY` guard, atomic claim, 30s fetch timeout, output length caps.
