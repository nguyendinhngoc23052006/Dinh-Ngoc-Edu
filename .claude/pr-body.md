# Use Flash Lite for syllabus generation to cut costs

Splits the AI model used in course generation into two tiers: syllabus structuring (outlining chapters/nodes from text) now runs on `gemini-2.5-flash-lite` (unlimited free RPD), while question generation stays on `gemini-2.5-flash` where answer correctness matters most.

## What changed

**Model split (`generate-course/index.ts`)**
- Added `AI_MODEL_LITE` env var (defaults to `gemini-2.5-flash-lite`) for the syllabus generation calls.
- `chat()` and `chatInLanguage()` now accept an optional `model` parameter; when omitted they fall back to `AI_MODEL` / `gemini-2.5-flash` (existing behavior).
- The two syllabus calls (initial + quality-gate retry) pass `liteModel`; all question-generation calls omit it, keeping the full model.

**Why this works:**
- Syllabus generation is a structuring task (organize text into chapters/nodes) — less sensitive to reasoning depth, and the existing `validateSyllabus` + `validateSyllabusQuality` validators catch bad outlines and trigger a retry.
- Question generation needs the stronger model for correct answer keys, plausible distractors, `calc` math, and difficulty tagging.
- This cuts ~half the Flash 2.5 calls per course generation (2-4 syllabus calls move to Lite), preserving question quality.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 291 tests pass, lint + typecheck clean
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code — `AI_MODEL_LITE` read from `Deno.env` (server-side only)
- [x] irreversible actions guarded + idempotent + flagged — no new irreversible actions
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a, no migration
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Syllabus generation now uses the cheaper/unlimited Flash Lite model; question generation stays on full Flash for answer correctness.
**What you do next:** Review the preview, then merge. Optionally set `AI_MODEL_LITE` in Supabase dashboard > Edge Functions > Secrets if you want to override the default (`gemini-2.5-flash-lite`). No other env/secret action needed.
**How to roll it back:** Revert this PR — the change is a single file with no schema or data side-effects. Without `AI_MODEL_LITE` set, the code falls back to the lite default; to fully revert to pre-split behavior, set `AI_MODEL_LITE` to the same value as `AI_MODEL`.
