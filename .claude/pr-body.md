Enforce a fundamental invariant in `calc` question generation: one question, one formula, one answer. The LLM occasionally generated a `prompt_template` asking for two numeric values (e.g. "how much will it produce, and how much profit…") while supplying only one `formula` — the second answer was silently dropped, causing wrong grading. Fix is a first-principle rule in the generation prompt rather than a fragile post-hoc pattern guard.

No new lesson (the MEMORY.md entry for PR #74 was updated to reflect the simplified approach).

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY ?? VITE_SUPABASE_ANON_KEY`; `envPrefix: ['VITE_']`; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** `buildCalcQuestionsPrompt` now carries the rule "One question, one answer — if a topic yields two values write two separate questions each with its own formula"; the structural `validateCalcSpec` is unchanged (it validates formula correctness, not prompt semantics). 389 tests, all green.
**What you do next:** Review the preview, then merge — no env/secret action needed. Existing two-part questions already in the DB are unaffected; regenerating those course nodes produces correctly split single-value questions.
**How to roll it back:** Revert this PR's merge commit — removes the generation rule and restores the old prompt.
