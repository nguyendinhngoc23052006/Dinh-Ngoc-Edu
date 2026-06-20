# Strip `additionalProperties` from response schemas (Gemini rejects it)

Follow-up to #55. Course generation still failed with `400: Unknown name "additionalProperties"`. Gemini's `generationConfig.responseSchema` accepts only the **OpenAPI 3.0 subset**, not full JSON Schema — and `additionalProperties` is a full-JSON-Schema-only keyword the API rejects.

## What changed

**`pipeline.ts`**
- Removed all four `additionalProperties: false` entries from `SYLLABUS_SCHEMA` and `QUESTIONS_SCHEMA`. The schemas now use only OpenAPI-subset keywords (`type`, `properties`, `items`, `required`, `enum`).
- Strictness is unaffected: `validateSyllabus` and `validateChapterQuestions` already drop unknown fields after the call, so `additionalProperties: false` was redundant.
- Added a comment above the schemas warning that they feed Gemini's OpenAPI-subset `responseSchema`, not full JSON Schema.

**`pipeline.test.ts`**
- Added a regression test that recursively asserts neither schema contains any full-JSON-Schema-only keyword (`additionalProperties`, `$schema`, `$ref`, `patternProperties`, `definitions`), so this class of bug can't ship again.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 293 tests pass, lint + typecheck clean
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — no new irreversible actions
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a, no migration
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Removed the `additionalProperties` keyword from the AI response schemas because Gemini's `responseSchema` only accepts the OpenAPI subset and 400s on it; added a test so it can't regress.
**What you do next:** Review the preview, then merge. After deploy, regenerate a course to confirm it completes end-to-end (this is the first path that exercises the live Gemini schema). No env/secret changes.
**How to roll it back:** Revert this PR — one schema file + its test, no schema or data side-effects.
