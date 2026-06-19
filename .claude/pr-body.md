# Cap thinking tokens and add structured output to course generation

Replaces the Flash Lite model split (PR #54 v1) with two changes that deliver better cost savings without quality risk: capped thinking budgets and json_schema structured output.

## What changed

**Reverted Flash Lite split (`index.ts`)**
- Removed `AI_MODEL_LITE` env var and `liteModel` variable — all calls use the single `AI_MODEL` again.
- Removed optional `model` parameter from `chat()` and `chatInLanguage()`.

**Thinking budget control (`index.ts`)**
- `chat()` now sends `google.thinking_config.thinking_budget` on every call, capping the invisible thinking tokens that Gemini 2.5 Flash generates by default (billed as output at $2.50/1M, counted against `max_tokens`).
- Syllabus calls: budget 1024 (structuring task). Question generation: budget 2048 (needs reasoning for answer correctness, difficulty, calc formulas). Retries: budget 1024 (simpler prompts).
- This prevents the latent bug where unbounded thinking tokens consume the 16,384 `max_tokens` budget, causing truncated/empty JSON → validation failures → retries → wasted calls.

**json_schema structured output (`index.ts`, `pipeline.ts`)**
- `chat()` accepts an optional `jsonSchema` parameter. When provided, uses `response_format: { type: 'json_schema', json_schema: { name: 'response', schema } }` instead of `json_object`.
- Automatic fallback: if the endpoint returns 400 (doesn't support json_schema), a module-level flag disables it for the rest of the pipeline run and retries with `json_object`.
- Two schemas exported from `pipeline.ts`: `SYLLABUS_SCHEMA` and `QUESTIONS_SCHEMA`, matching the shapes `validateSyllabus` and `validateChapterQuestions` already enforce.
- `parseJsonLoose` + validators still run on every response as defense in depth.

**Why this is better than the Lite split:**
- The Lite split saved ~$0.10-0.40/1M on 2-4 calls out of 13-25 per course, with real quality risk on the pipeline's most structurally important call (syllabus).
- Thinking budget caps cut cost across ALL calls by preventing 5-15k unbounded thinking tokens per call ($0.01-0.04 each × 13-25 calls = $0.13-1.00 saved per course).
- json_schema reduces retries from malformed output, saving entire wasted calls.

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
**What changed:** Course generation now caps AI thinking tokens per-call (preventing truncation and cutting cost) and uses json_schema structured output (reducing parse failures), replacing the Flash Lite model split which had marginal savings with quality risk.
**What you do next:** Review the preview, then merge. No env/secret changes needed — `AI_MODEL_LITE` is no longer used and can be removed from Edge Function secrets if you set it previously.
**How to roll it back:** Revert this PR — the change is two files with no schema or data side-effects. The `google.thinking_config` field is ignored by non-Gemini endpoints; json_schema falls back to json_object automatically.
