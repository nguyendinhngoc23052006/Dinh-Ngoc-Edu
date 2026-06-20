# Fix generation + switch to Gemini native API with per-call token budgets

All course generation (first gen, regen with same materials, regen with new materials) was broken by a `400: Unknown name "google"` error — the OpenAI-compat wrapper rejects the `google.thinking_config` extension field. This PR fixes the bug by switching to Gemini's native `generateContent` API, which natively supports thinking budgets, structured output schemas, and per-call output caps.

## What changed

**Switched to Gemini native API (`index.ts`)**
- Endpoint: `/v1beta/models/{model}:generateContent` instead of `/v1beta/openai/chat/completions`.
- Request body: `system_instruction` + `contents` + `generationConfig` (native format) instead of OpenAI `messages` + `response_format`.
- Auth: `x-goog-api-key` header (more secure than URL query param, matches official docs).
- Response parsing: `candidates[0].content.parts` with `thought` part filtering instead of `choices[0].message.content`.

**Per-call thinking budgets (now actually working)**
- Syllabus generation: 1024 tokens (structural task, low reasoning).
- Syllabus quality retry: 1024 tokens.
- Question generation (primary): 2048 tokens (needs reasoning for difficulty tagging, calc formulas).
- Question generation (retry): **0 tokens** (thinking disabled — cheapest rescue attempt).

**Per-call output caps (was 16,384 for everything)**
- Syllabus: 4,096 (8 chapters × 5 nodes fits in ~2K).
- Questions primary: 8,192 (6 questions with calc specs).
- Questions retry: 4,096 (2-3 simpler questions).

**Native `responseSchema` (replaced fallback dance)**
- Uses `generationConfig.responseSchema` directly instead of OpenAI's `response_format.json_schema` with the `jsonSchemaSupported` fallback flag.
- Existing `SYLLABUS_SCHEMA` and `QUESTIONS_SCHEMA` from `pipeline.ts` work as-is.

**Removed dead code**
- `jsonSchemaSupported` module-level flag and schema-fallback retry logic.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 291 tests pass, lint + typecheck clean
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — no new irreversible actions
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a, no migration
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Course generation now uses Gemini's native API instead of the OpenAI-compat wrapper, fixing the "Unknown name google" 400 error that broke all generation/regeneration, and enabling actual per-call thinking + output token budgets.
**What you do next:** Review the preview, then merge. The `AI_API_KEY` secret is the same Gemini key — no secret changes needed. After deploy, test a course generation to confirm. If `AI_BASE_URL` was set to the old `/v1beta/openai` path, remove it (the new default is `/v1beta`).
**How to roll it back:** Revert this PR — one file changed, no schema or data side-effects.
