Fix stale step reference in README.md: "step 6.7" → "step 8.3" (guide was restructured from 12 to 14 steps in PR #14 of cloud-pipeline-guide; the Supabase→Vercel integration prefix step is now numbered 8.3). No functional change — README only.

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
**What changed:** One word in README.md line 28 — "step 6.7" corrected to "step 8.3" to match the current guide structure.
**What you do next:** Review the preview (Vercel auto-deploy should fire — that's the point of this PR), then merge.
**How to roll it back:** Revert this PR's merge commit — restores "step 6.7" in README.md.
