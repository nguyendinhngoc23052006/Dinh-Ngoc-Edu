# fix: enforce single blank per fill_blank question

Follow-up to PR #65. Multi-blank fill_blank questions (e.g. "goods ___ and ___") were silently accepted by the validator and stored with only one answer, making them ungradeable and confusing to students.

## Root cause

Three-layer gap:
- **Prompt**: no instruction against multi-blank questions; the few-shot showed single-blank only
- **`validateQuestion`**: never checked that `accepted.length` matched the count of `___` in the prompt — a two-blank question with one answer passed silently
- **Grader**: `accepted: string[]` flat list + single text input — no multi-blank concept, so existing bad questions graded as `incorrect` with no explanation

## What changed

### `supabase/functions/generate-course/pipeline.ts`
- Prompt instruction: added `"use exactly ONE ___ blank per question"` to the fill_blank kind description
- `validateQuestion`: `const blankCount = (prompt.match(/___/g) ?? []).length; if (blankCount !== 1) return null` — rejects before the accepted-array check; the retry loop will get a valid single-blank replacement

### `src/services/lessonService.ts`
- `gradeQuestion` fill_blank branch: defensive guard `if ((question.prompt.match(/___/g) ?? []).length !== 1) return 'incorrect'` — any multi-blank question already in the DB grades explicitly incorrect rather than passing a lucky substring match

### Tests
- `pipeline.test.ts`: added multi-blank question to the malformed-inputs fixture (438 → dropped)
- `lessonService.test.ts`: added `fill_blank: multi-blank question grades incorrect regardless of input`; updated all existing fill_blank gradeQuestion tests to carry an explicit single-blank prompt (the default `'Pick one'` has no `___`, which would now short-circuit the grader)

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration (no schema change)
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 388 tests pass, lint and typecheck clean
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — n/a
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** fill_blank questions now always have exactly one blank. Multi-blank questions are rejected at generation time (the retry will produce two clean single-blank questions instead). Any multi-blank questions already in the DB grade `incorrect` explicitly.

**What you do next:** Regenerate a course that previously produced the "goods ___ and ___" question — the two blanks will now become two separate single-blank questions, each gradeable. No env/secret changes needed.

**How to roll it back:** Revert this PR. Two source files changed (`pipeline.ts`, `lessonService.ts`). No DB schema, no migration, no data side-effects.
