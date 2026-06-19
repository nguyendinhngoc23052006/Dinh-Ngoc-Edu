# Security Review — 2026-06-19 (branch: claude/compassionate-meitner-chlzve)

## Verdict: PASS

### Findings

SEVERITY warn — `docs/RUNBOOK.md` — `AI_MODEL_LITE` is not listed in the Edge Function secrets table; an operator setting up from the runbook will not know the env var exists. Add a row for `AI_MODEL_LITE | no | Lite model for syllabus generation (default: gemini-2.5-flash-lite)`.

No blockers found.

### What was checked

- `supabase/functions/generate-course/index.ts` — the only changed file; new `model?` parameter on `chatInLanguage()` and `chat()`, the `AI_MODEL_LITE` env-var read at line 187, all call sites.
- `liteModel` sourced exclusively from `Deno.env.get('AI_MODEL_LITE')` with a hardcoded safe default. Never derived from the request body. Feeds only into the `model` field of an upstream JSON API call — not SQL, storage path, or prompt string. No injection surface.
- Grepped `src/` for `AI_MODEL`, `AI_MODEL_LITE`, `AI_API_KEY`, `AI_BASE_URL` — zero matches; no secret or model name leaks to client code.
- All existing security controls unchanged: caller JWT, owner check, `AI_API_KEY` guard, atomic claim, 30 s fetch timeout, output length caps.
- No new table, no migration, no RLS change, no new external call.
