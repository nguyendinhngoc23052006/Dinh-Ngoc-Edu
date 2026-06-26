Sync CLAUDE.md to the guide's current scaffold — three one-line drifts corrected; no behaviour change.

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
**What changed:** Three lines in `CLAUDE.md` corrected to match the guide's current scaffold: `step 6.7` → `step 8.3` (×2, Architecture and Memory sections) and the `Flow: … → … →` arrow chain rewritten as a sentence (arrow-rule fix that landed in the guide Jun 2026 but wasn't backported here).
**What you do next:** Review the preview, then merge — no env/secret action needed.
**How to roll it back:** Revert this PR's merge commit — restores the three old lines in CLAUDE.md.
