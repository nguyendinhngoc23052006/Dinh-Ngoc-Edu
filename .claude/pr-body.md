Prevent `calc` questions from silently grading only one of two requested values when the LLM generates a conjunctive "how much … and how much …" prompt template. Defense is two-layer: a generation-time rule in the LLM prompt, and a runtime guard in `validateCalcSpec()` that rejects the spec before it ever reaches the DB.

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
**What changed:** `validateCalcSpec()` now rejects any `prompt_template` that contains more than one `?` or matches the pattern `, and (how much|how many|what)` — either indicates a two-part question whose second answer would be silently dropped. `buildCalcQuestionsPrompt()` adds an explicit rule forbidding two-part templates in the LLM instruction. A regression test covers both rejection patterns and the positive single-value case (390 tests, all green).
**What you do next:** Review the preview, then merge — no env/secret action needed. Any existing two-part questions already in the DB are unaffected (they will continue to grade only one value); regenerating those course nodes will produce correctly split single-value questions.
**How to roll it back:** Revert this PR's merge commit — removes both the runtime guard and the generation rule.
